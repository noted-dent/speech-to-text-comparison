const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Create a pseudo real-time transcription session with OpenAI Whisper
 * Note: This is not true real-time as Whisper doesn't support streaming
 * We'll buffer audio chunks and process them in segments
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Session object
 */
async function createRealtimeSession(options = {}) {
  const { sampleRate = 16000, encoding = 'pcm16', socket, onTranscript } = options;
  
  const session = {
    isActive: true,
    audioBuffer: [],
    processingInterval: null,
    lastProcessedText: '',
    lastAudioTimestamp: Date.now(),
    chunkDuration: 1000, // Process every 1 second of audio
    
    sendAudio: async function(pcmBuffer) {
      if (!this.isActive) return;
      
      // Add audio to buffer
      this.audioBuffer.push(Buffer.from(pcmBuffer));
      
      // Start processing interval if not already running
      if (!this.processingInterval) {
        this.startProcessing();
      }
    },
    
    startProcessing: function() {
      this.processingInterval = setInterval(async () => {
        if (this.audioBuffer.length === 0) return;
        
        // Calculate if we have enough audio (1 second worth)
        const bytesPerSecond = sampleRate * 2; // 16-bit = 2 bytes per sample
        const currentBufferSize = this.audioBuffer.reduce((sum, buf) => sum + buf.length, 0);
        
        if (currentBufferSize >= bytesPerSecond) {
          // Combine audio buffers
          const combinedBuffer = Buffer.concat(this.audioBuffer);
          this.audioBuffer = [];
          
          // If we have more than needed, keep the remainder
          if (combinedBuffer.length > bytesPerSecond) {
            const audioToProcess = combinedBuffer.slice(0, bytesPerSecond);
            const remainder = combinedBuffer.slice(bytesPerSecond);
            this.audioBuffer.push(remainder);
            await this.processAudioChunk(audioToProcess);
          } else {
            await this.processAudioChunk(combinedBuffer);
          }
        }
      }, 250); // Check every 250ms
    },
    
    processAudioChunk: async function(pcmBuffer) {
      try {
        // Convert PCM to WAV format
        const wavBuffer = this.pcmToWav(pcmBuffer, sampleRate);
        
        // Create temporary file
        const tempFilename = `whisper_temp_${crypto.randomBytes(8).toString('hex')}.wav`;
        const tempPath = path.join(__dirname, '..', 'uploads', tempFilename);
        
        // Ensure uploads directory exists
        await fs.promises.mkdir(path.join(__dirname, '..', 'uploads'), { recursive: true });
        
        // Write WAV file
        await fs.promises.writeFile(tempPath, wavBuffer);
        
        // Create stream and transcribe
        const audioStream = fs.createReadStream(tempPath);
        const transcription = await openai.audio.transcriptions.create({
          file: audioStream,
          model: 'whisper-1',
          response_format: 'text',
          prompt: this.lastProcessedText // Use previous text as context
        });
        
        // Clean up
        await fs.promises.unlink(tempPath);
        
        // Update last processed text for context
        this.lastProcessedText = transcription;
        
        // Send transcription result
        if (onTranscript) {
          onTranscript(transcription, true); // Always final since we process in chunks
        }
        
      } catch (error) {
        console.error('OpenAI chunk processing error:', error);
      }
    },
    
    pcmToWav: function(pcmBuffer, sampleRate) {
      // Create WAV header
      const wavHeader = Buffer.alloc(44);
      
      // RIFF chunk descriptor
      wavHeader.write('RIFF', 0);
      wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
      wavHeader.write('WAVE', 8);
      
      // fmt sub-chunk
      wavHeader.write('fmt ', 12);
      wavHeader.writeUInt32LE(16, 16); // Subchunk1Size
      wavHeader.writeUInt16LE(1, 20); // AudioFormat (PCM)
      wavHeader.writeUInt16LE(1, 22); // NumChannels (mono)
      wavHeader.writeUInt32LE(sampleRate, 24); // SampleRate
      wavHeader.writeUInt32LE(sampleRate * 2, 28); // ByteRate
      wavHeader.writeUInt16LE(2, 32); // BlockAlign
      wavHeader.writeUInt16LE(16, 34); // BitsPerSample
      
      // data sub-chunk
      wavHeader.write('data', 36);
      wavHeader.writeUInt32LE(pcmBuffer.length, 40);
      
      return Buffer.concat([wavHeader, pcmBuffer]);
    },
    
    close: async function() {
      this.isActive = false;
      
      if (this.processingInterval) {
        clearInterval(this.processingInterval);
        this.processingInterval = null;
      }
      
      // Process any remaining audio
      if (this.audioBuffer.length > 0) {
        const remainingBuffer = Buffer.concat(this.audioBuffer);
        if (remainingBuffer.length > 0) {
          await this.processAudioChunk(remainingBuffer);
        }
      }
      
      this.audioBuffer = [];
    }
  };
  
  // Notify that this is pseudo real-time
  if (socket) {
    socket.emit('serviceInfo', {
      service: 'openai',
      message: 'Note: OpenAI Whisper processes audio in 1-second chunks (not true real-time streaming)'
    });
  }
  
  return Promise.resolve(session);
}

module.exports = {
  createRealtimeSession
};