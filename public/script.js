// Initialize Socket.IO connection
const socket = io();

// Audio processing class for real-time streaming
class AudioProcessor {
    constructor() {
        this.audioContext = null;
        this.mediaStream = null;
        this.processor = null;
        this.source = null;
        this.analyser = null;
        this.isRecording = false;
        this.visualizer = document.getElementById('visualizer');
        this.levelBar = document.getElementById('level-bar');
    }

    async startRecording() {
        try {
            // Initialize audio context with 16kHz sample rate
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
                sampleRate: 16000
            });

            // Get user media
            this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    channelCount: 1,
                    sampleRate: 16000,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            // Create audio nodes
            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
            this.processor = this.audioContext.createScriptProcessor(2048, 1, 1);
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;

            // Connect nodes
            this.source.connect(this.analyser);
            this.analyser.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            // Process audio
            this.processor.onaudioprocess = (e) => {
                if (!this.isRecording) return;

                const float32Array = e.inputBuffer.getChannelData(0);
                const pcm16 = this.convertFloat32ToInt16(float32Array);
                
                // Send audio data via Socket.IO
                socket.emit('audioData', pcm16);

                // Update visualizer
                this.updateVisualizer();
            };

            this.isRecording = true;
            this.startVisualization();

        } catch (error) {
            console.error('Error starting recording:', error);
            showError('Failed to access microphone: ' + error.message);
            throw error;
        }
    }

    stopRecording() {
        this.isRecording = false;

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.source) {
            this.source.disconnect();
            this.source = null;
        }

        if (this.analyser) {
            this.analyser.disconnect();
            this.analyser = null;
        }

        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        // Clear visualizer
        const ctx = this.visualizer.getContext('2d');
        ctx.clearRect(0, 0, this.visualizer.width, this.visualizer.height);
        this.levelBar.style.width = '0%';
    }

    convertFloat32ToInt16(float32Array) {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const s = Math.max(-1, Math.min(1, float32Array[i]));
            int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return int16Array.buffer;
    }

    updateVisualizer() {
        if (!this.analyser) return;

        const bufferLength = this.analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        this.analyser.getByteFrequencyData(dataArray);

        // Update level meter
        const average = dataArray.reduce((a, b) => a + b) / bufferLength;
        const percentage = (average / 255) * 100;
        this.levelBar.style.width = percentage + '%';
    }

    startVisualization() {
        const ctx = this.visualizer.getContext('2d');
        const width = this.visualizer.width;
        const height = this.visualizer.height;

        const draw = () => {
            if (!this.isRecording || !this.analyser) return;

            requestAnimationFrame(draw);

            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analyser.getByteTimeDomainData(dataArray);

            ctx.fillStyle = 'rgb(240, 240, 240)';
            ctx.fillRect(0, 0, width, height);

            ctx.lineWidth = 2;
            ctx.strokeStyle = 'rgb(50, 150, 250)';
            ctx.beginPath();

            const sliceWidth = width / bufferLength;
            let x = 0;

            for (let i = 0; i < bufferLength; i++) {
                const v = dataArray[i] / 128.0;
                const y = v * height / 2;

                if (i === 0) {
                    ctx.moveTo(x, y);
                } else {
                    ctx.lineTo(x, y);
                }

                x += sliceWidth;
            }

            ctx.lineTo(width, height / 2);
            ctx.stroke();
        };

        draw();
    }
}

// Global variables
let audioProcessor = null;
let currentMode = 'batch';
let selectedFile = null;
let recordedBlob = null;
let mediaRecorder = null;
let recordingStartTime = null;
let recordingTimer = null;

// Transcript state management for real-time mode
const transcriptState = new Map(); // Stores accumulated transcripts per service

// DOM elements
const batchInterface = document.getElementById('batch-interface');
const realtimeInterface = document.getElementById('realtime-interface');
const resultsSection = document.getElementById('results-section');
const uploadArea = document.getElementById('upload-area');
const fileInput = document.getElementById('file-input');
const recordBtn = document.getElementById('record-btn');
const recordTimer = document.getElementById('record-timer');
const processBtn = document.getElementById('process-btn');
const streamBtn = document.getElementById('stream-btn');
const errorDisplay = document.getElementById('error-display');
const errorMessage = document.getElementById('error-message');

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    setupEventListeners();
    setupSocketListeners();
    updateConnectionStatus();
});

// Event listeners
function setupEventListeners() {
    // Mode selection
    document.querySelectorAll('input[name="mode"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            currentMode = e.target.value;
            toggleMode();
        });
    });

    // File upload
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('dragover');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('dragover');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('dragover');
        handleFileSelect(e.dataTransfer.files[0]);
    });
    fileInput.addEventListener('change', (e) => {
        handleFileSelect(e.target.files[0]);
    });

    // Recording
    recordBtn.addEventListener('click', toggleRecording);

    // Process button
    processBtn.addEventListener('click', processBatchAudio);

    // Stream button
    streamBtn.addEventListener('click', toggleStreaming);

    // Export buttons
    document.getElementById('export-json').addEventListener('click', exportJSON);
    document.getElementById('export-csv').addEventListener('click', exportCSV);
}

// Socket.IO event listeners
function setupSocketListeners() {
    socket.on('connect', () => {
        console.log('Connected to server');
        updateConnectionStatus();
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        updateConnectionStatus();
    });

    socket.on('streamReady', (data) => {
        console.log('Stream ready:', data.services);
        data.services.forEach(service => {
            updateServiceStatus(service, 'connected');
        });
    });

    socket.on('transcriptResult', (data) => {
        handleTranscriptResult(data);
    });

    socket.on('streamError', (data) => {
        showError('Stream error: ' + data.error);
        stopStreaming();
    });

    socket.on('serviceError', (data) => {
        showError(`${data.service} error: ${data.error}`);
        updateServiceStatus(data.service, 'error');
    });

    socket.on('serviceInfo', (data) => {
        console.log(`${data.service}: ${data.message}`);
        // Could display this info in the UI if needed
    });

    socket.on('streamEnded', () => {
        console.log('Stream ended');
        resetServiceStatuses();
    });
}

// Mode switching
function toggleMode() {
    if (currentMode === 'batch') {
        batchInterface.style.display = 'block';
        realtimeInterface.style.display = 'none';
    } else {
        batchInterface.style.display = 'none';
        realtimeInterface.style.display = 'block';
    }
}

// File handling
function handleFileSelect(file) {
    if (!file) return;

    const validTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/webm'];
    if (!validTypes.includes(file.type)) {
        showError('Invalid file type. Please select an MP3, WAV, M4A, or WebM file.');
        return;
    }

    if (file.size > 25 * 1024 * 1024) {
        showError('File too large. Maximum size is 25MB.');
        return;
    }

    selectedFile = file;
    recordedBlob = null;
    updateUploadArea(file.name);
    processBtn.disabled = false;
}

function updateUploadArea(filename) {
    const uploadContent = uploadArea.querySelector('.upload-content');
    uploadContent.innerHTML = `
        <span class="upload-icon">📄</span>
        <h3>${filename}</h3>
        <p>Click to select a different file</p>
    `;
}

// Recording functions
async function toggleRecording() {
    if (!mediaRecorder || mediaRecorder.state === 'inactive') {
        startBatchRecording();
    } else {
        stopBatchRecording();
    }
}

async function startBatchRecording() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const chunks = [];

        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = (e) => chunks.push(e.data);
        mediaRecorder.onstop = () => {
            recordedBlob = new Blob(chunks, { type: 'audio/webm' });
            selectedFile = null;
            updateUploadArea('Recorded Audio (WebM)');
            processBtn.disabled = false;
        };

        mediaRecorder.start();
        recordingStartTime = Date.now();
        updateRecordingUI(true);

        // Update timer
        recordingTimer = setInterval(() => {
            const elapsed = Math.floor((Date.now() - recordingStartTime) / 1000);
            const minutes = Math.floor(elapsed / 60).toString().padStart(2, '0');
            const seconds = (elapsed % 60).toString().padStart(2, '0');
            recordTimer.textContent = `${minutes}:${seconds}`;
        }, 100);

    } catch (error) {
        showError('Failed to start recording: ' + error.message);
    }
}

function stopBatchRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
        mediaRecorder.stop();
        mediaRecorder.stream.getTracks().forEach(track => track.stop());
        clearInterval(recordingTimer);
        updateRecordingUI(false);
    }
}

function updateRecordingUI(isRecording) {
    recordBtn.classList.toggle('recording', isRecording);
    recordBtn.innerHTML = isRecording ? 
        '<span class="record-icon">⏹️</span>Stop Recording' : 
        '<span class="record-icon">🎤</span>Start Recording';
    if (!isRecording) {
        recordTimer.textContent = '00:00';
    }
}

// Batch processing
async function processBatchAudio() {
    const selectedServices = getSelectedServices();
    if (selectedServices.length === 0) {
        showError('Please select at least one service.');
        return;
    }

    if (!selectedFile && !recordedBlob) {
        showError('Please select a file or record audio first.');
        return;
    }

    processBtn.disabled = true;
    processBtn.textContent = 'Processing...';

    try {
        const formData = new FormData();
        
        if (selectedFile) {
            formData.append('audio', selectedFile);
        } else if (recordedBlob) {
            formData.append('audio', recordedBlob, 'recording.webm');
        }
        
        formData.append('services', JSON.stringify(selectedServices));

        const response = await fetch('/transcribe-batch', {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error(await response.text());
        }

        const result = await response.json();
        displayBatchResults(result);

    } catch (error) {
        showError('Processing failed: ' + error.message);
    } finally {
        processBtn.disabled = false;
        processBtn.textContent = 'Process Audio';
    }
}

// Real-time streaming
async function toggleStreaming() {
    if (!audioProcessor || !audioProcessor.isRecording) {
        startStreaming();
    } else {
        stopStreaming();
    }
}

async function startStreaming() {
    const selectedServices = getSelectedServices();
    if (selectedServices.length === 0) {
        showError('Please select at least one service.');
        return;
    }

    try {
        // Initialize audio processor
        audioProcessor = new AudioProcessor();
        
        // Update UI
        streamBtn.classList.add('streaming');
        streamBtn.querySelector('.btn-text').textContent = 'Stop Streaming';
        clearRealtimeTranscripts();

        // Show selected service statuses
        selectedServices.forEach(service => {
            document.querySelector(`.${service}-status`).style.display = 'flex';
            updateServiceStatus(service, 'connecting');
        });

        // Start audio recording
        await audioProcessor.startRecording();

        // Initialize streaming session
        socket.emit('startStream', {
            services: selectedServices,
            sampleRate: 16000,
            encoding: 'pcm16',
            channels: 1
        });

    } catch (error) {
        showError('Failed to start streaming: ' + error.message);
        stopStreaming();
    }
}

function stopStreaming() {
    if (audioProcessor) {
        audioProcessor.stopRecording();
        audioProcessor = null;
    }

    socket.emit('endStream');

    // Update UI
    streamBtn.classList.remove('streaming');
    streamBtn.querySelector('.btn-text').textContent = 'Start Streaming';
    resetServiceStatuses();
}

// Transcript handling
function handleTranscriptResult(data) {
    const { service, transcript, isFinal, latency } = data;
    
    if (!transcript) return;

    const transcriptsContainer = document.getElementById('realtime-transcripts');
    
    // Remove placeholder if it exists
    const placeholder = transcriptsContainer.querySelector('.transcript-placeholder');
    if (placeholder) {
        placeholder.remove();
    }

    // Initialize transcript state for service if not exists
    if (!transcriptState.has(service)) {
        transcriptState.set(service, {
            finalText: '',
            interimText: '',
            lastUpdateTime: Date.now()
        });
    }

    // Find or create service container
    let serviceContainer = transcriptsContainer.querySelector(`.transcript-${service}`);
    if (!serviceContainer) {
        serviceContainer = document.createElement('div');
        serviceContainer.className = `transcript-service transcript-${service}`;
        serviceContainer.innerHTML = `
            <div class="transcript-header">
                <h4>${service.charAt(0).toUpperCase() + service.slice(1)}</h4>
                <span class="latency">Latency: ${latency}ms</span>
            </div>
            <div class="transcript-content">
                <div class="final-text"></div>
                <div class="interim-text"></div>
            </div>
        `;
        transcriptsContainer.appendChild(serviceContainer);
    }

    // Get transcript state
    const state = transcriptState.get(service);
    
    // Update transcript content
    const contentDiv = serviceContainer.querySelector('.transcript-content');
    const finalDiv = contentDiv.querySelector('.final-text');
    const interimDiv = contentDiv.querySelector('.interim-text');
    
    if (isFinal) {
        // Append final transcript to accumulated text
        state.finalText += (state.finalText ? ' ' : '') + transcript;
        state.interimText = ''; // Clear interim text when we get final
        
        // Update display
        finalDiv.innerHTML = state.finalText
            .split(' ')
            .map(word => `<span class="transcript-word">${word}</span>`)
            .join(' ');
        interimDiv.textContent = '';
        
        // Auto-scroll to bottom
        contentDiv.scrollTop = contentDiv.scrollHeight;
    } else {
        // Update interim transcript
        state.interimText = transcript;
        interimDiv.innerHTML = `<span class="interim-transcript">${transcript}</span>`;
    }
    
    // Update state
    state.lastUpdateTime = Date.now();
    transcriptState.set(service, state);

    // Update latency
    serviceContainer.querySelector('.latency').textContent = `Latency: ${latency}ms`;
}

function clearRealtimeTranscripts() {
    const transcriptsContainer = document.getElementById('realtime-transcripts');
    transcriptsContainer.innerHTML = '';
    // Clear transcript state
    transcriptState.clear();
}

// Results display
function displayBatchResults(data) {
    resultsSection.style.display = 'block';
    
    const resultsGrid = document.getElementById('results-grid');
    resultsGrid.innerHTML = '';

    const services = Object.keys(data.results);
    services.forEach(service => {
        const result = data.results[service];
        const resultCard = createResultCard(service, result);
        resultsGrid.appendChild(resultCard);
    });

    // Update metrics
    updateMetrics(data);

    // Scroll to results
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function createResultCard(service, result) {
    const card = document.createElement('div');
    card.className = `result-card ${service}`;
    
    if (result.error) {
        card.innerHTML = `
            <h3>${service.charAt(0).toUpperCase() + service.slice(1)}</h3>
            <div class="error-result">
                <span class="error-icon">❌</span>
                <p>Error: ${result.error}</p>
            </div>
        `;
    } else {
        card.innerHTML = `
            <h3>${service.charAt(0).toUpperCase() + service.slice(1)}</h3>
            <div class="transcript-text">
                <p>${result.text || 'No transcript available'}</p>
            </div>
            <div class="result-metrics">
                <div class="metric">
                    <span class="metric-label">Processing Time:</span>
                    <span class="metric-value">${(result.time / 1000).toFixed(2)}s</span>
                </div>
                ${result.confidence !== null ? `
                <div class="metric">
                    <span class="metric-label">Confidence:</span>
                    <span class="metric-value">${(result.confidence * 100).toFixed(1)}%</span>
                </div>
                ` : ''}
                ${result.details ? `
                <div class="metric">
                    <span class="metric-label">Words:</span>
                    <span class="metric-value">${result.details.words_count || 'N/A'}</span>
                </div>
                ` : ''}
            </div>
        `;
    }
    
    return card;
}

function updateMetrics(data) {
    const metricsContent = document.getElementById('metrics-content');
    
    // Calculate aggregate metrics
    const services = Object.keys(data.results);
    const successfulServices = services.filter(s => !data.results[s].error);
    
    let totalWords = 0;
    let avgProcessingTime = 0;
    let avgConfidence = 0;
    let confidenceCount = 0;

    successfulServices.forEach(service => {
        const result = data.results[service];
        avgProcessingTime += result.time || 0;
        
        if (result.details && result.details.words_count) {
            totalWords += result.details.words_count;
        }
        
        if (result.confidence !== null) {
            avgConfidence += result.confidence;
            confidenceCount++;
        }
    });

    if (successfulServices.length > 0) {
        avgProcessingTime /= successfulServices.length;
    }
    
    if (confidenceCount > 0) {
        avgConfidence /= confidenceCount;
    }

    metricsContent.innerHTML = `
        <div class="metric-item">
            <h4>Services Tested</h4>
            <p>${services.length}</p>
        </div>
        <div class="metric-item">
            <h4>Successful</h4>
            <p>${successfulServices.length}</p>
        </div>
        <div class="metric-item">
            <h4>Avg Processing Time</h4>
            <p>${(avgProcessingTime / 1000).toFixed(2)}s</p>
        </div>
        ${confidenceCount > 0 ? `
        <div class="metric-item">
            <h4>Avg Confidence</h4>
            <p>${(avgConfidence * 100).toFixed(1)}%</p>
        </div>
        ` : ''}
        ${data.audioInfo ? `
        <div class="metric-item">
            <h4>File Size</h4>
            <p>${(data.audioInfo.size / 1024 / 1024).toFixed(2)} MB</p>
        </div>
        ` : ''}
    `;
}

// Utility functions
function getSelectedServices() {
    const services = [];
    const selectedService = document.querySelector('input[name="service"]:checked');
    if (selectedService) {
        services.push(selectedService.value);
    }
    return services;
}

function updateConnectionStatus() {
    const socketStatus = document.getElementById('socket-status');
    if (socket.connected) {
        socketStatus.classList.add('connected');
        socketStatus.classList.remove('disconnected');
    } else {
        socketStatus.classList.remove('connected');
        socketStatus.classList.add('disconnected');
    }
}

function updateServiceStatus(service, status) {
    const statusIndicator = document.getElementById(`${service}-status`);
    if (!statusIndicator) return;

    statusIndicator.classList.remove('connected', 'connecting', 'error');
    statusIndicator.classList.add(status);
}

function resetServiceStatuses() {
    ['assemblyai', 'deepgram', 'openai'].forEach(service => {
        document.querySelector(`.${service}-status`).style.display = 'none';
        updateServiceStatus(service, 'disconnected');
    });
}

function showError(message) {
    errorMessage.textContent = message;
    errorDisplay.style.display = 'flex';
    setTimeout(() => {
        errorDisplay.style.display = 'none';
    }, 5000);
}

// Export functions
function exportJSON() {
    // Collect results data
    const results = {};
    document.querySelectorAll('.result-card').forEach(card => {
        const service = card.classList[1];
        const transcript = card.querySelector('.transcript-text p')?.textContent || '';
        const metrics = {};
        card.querySelectorAll('.metric').forEach(metric => {
            const label = metric.querySelector('.metric-label').textContent.replace(':', '');
            const value = metric.querySelector('.metric-value').textContent;
            metrics[label] = value;
        });
        results[service] = { transcript, metrics };
    });

    const data = {
        timestamp: new Date().toISOString(),
        mode: currentMode,
        results
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    downloadFile(blob, `stt-comparison-${Date.now()}.json`);
}

function exportCSV() {
    const rows = [['Service', 'Transcript', 'Processing Time', 'Confidence', 'Words']];
    
    document.querySelectorAll('.result-card').forEach(card => {
        const service = card.classList[1];
        const transcript = card.querySelector('.transcript-text p')?.textContent || 'Error';
        const processingTime = card.querySelector('.metric:nth-child(1) .metric-value')?.textContent || 'N/A';
        const confidence = card.querySelector('.metric:nth-child(2) .metric-value')?.textContent || 'N/A';
        const words = card.querySelector('.metric:nth-child(3) .metric-value')?.textContent || 'N/A';
        
        rows.push([service, transcript, processingTime, confidence, words]);
    });

    const csv = rows.map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    downloadFile(blob, `stt-comparison-${Date.now()}.csv`);
}

function downloadFile(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
}