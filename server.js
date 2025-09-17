require('dotenv').config();
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Service imports
const assemblyAIBatch = require('./services/assemblyai-batch');
const assemblyAIRealtime = require('./services/assemblyai-realtime');
const deepgramBatch = require('./services/deepgram-batch');
const deepgramRealtime = require('./services/deepgram-realtime');
const openAIBatch = require('./services/openai-batch');
const openAIRealtime = require('./services/openai-realtime');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/wav', 'audio/x-m4a', 'audio/webm', 'audio/mp3'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only mp3, wav, m4a, and webm are allowed.'));
    }
  }
});

// Health check endpoint
app.get('/health', async (req, res) => {
  const serviceStatus = {
    assemblyai: false,
    deepgram: false,
    openai: false
  };

  // Check if API keys are configured
  if (process.env.ASSEMBLYAI_API_KEY) serviceStatus.assemblyai = true;
  if (process.env.DEEPGRAM_API_KEY) serviceStatus.deepgram = true;
  if (process.env.OPENAI_API_KEY) serviceStatus.openai = true;

  res.json({
    status: 'healthy',
    services: serviceStatus,
    timestamp: new Date().toISOString()
  });
});

// Metrics endpoint
app.get('/metrics', (req, res) => {
  const metrics = {
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    connections: io.engine.clientsCount,
    timestamp: new Date().toISOString()
  };
  res.json(metrics);
});

// Batch transcription endpoint
app.post('/transcribe-batch', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No audio file provided' });
    }

    const services = JSON.parse(req.body.services || '[]');
    if (services.length === 0) {
      return res.status(400).json({ error: 'No services selected' });
    }

    // Read the uploaded file
    const audioBuffer = await fs.readFile(req.file.path);
    const audioInfo = {
      duration: null, // Will be calculated by services
      size: req.file.size,
      type: req.file.mimetype
    };

    // Process with selected services
    const results = {};
    const promises = [];

    if (services.includes('assemblyai') && process.env.ASSEMBLYAI_API_KEY) {
      promises.push(
        assemblyAIBatch.transcribeBatch(audioBuffer, { 
          filename: req.file.originalname,
          mimetype: req.file.mimetype 
        })
          .then(result => { results.assemblyai = result; })
          .catch(error => { 
            results.assemblyai = { 
              text: null, 
              time: null, 
              confidence: null, 
              error: error.message 
            }; 
          })
      );
    }

    if (services.includes('deepgram') && process.env.DEEPGRAM_API_KEY) {
      promises.push(
        deepgramBatch.transcribeBatch(audioBuffer, { 
          mimetype: req.file.mimetype 
        })
          .then(result => { results.deepgram = result; })
          .catch(error => { 
            results.deepgram = { 
              text: null, 
              time: null, 
              confidence: null, 
              error: error.message 
            }; 
          })
      );
    }

    if (services.includes('openai') && process.env.OPENAI_API_KEY) {
      promises.push(
        openAIBatch.transcribeBatch(audioBuffer, { 
          filename: req.file.originalname,
          mimetype: req.file.mimetype 
        })
          .then(result => { results.openai = result; })
          .catch(error => { 
            results.openai = { 
              text: null, 
              time: null, 
              confidence: null, 
              error: error.message 
            }; 
          })
      );
    }

    await Promise.all(promises);

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      mode: 'batch',
      results,
      audioInfo
    });

  } catch (error) {
    console.error('Batch transcription error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Track active service sessions for this socket
  const serviceSessions = new Map();

  // Handle real-time streaming start
  socket.on('startStream', async (config) => {
    console.log('Starting stream with config:', config);

    try {
      const { services = [], sampleRate = 16000, encoding = 'pcm16', channels = 1 } = config;

      // Initialize selected services
      if (services.includes('assemblyai') && process.env.ASSEMBLYAI_API_KEY) {
        const session = await assemblyAIRealtime.createRealtimeSession({
          sampleRate,
          encoding,
          socket,
          onTranscript: (transcript, isFinal) => {
            socket.emit('transcriptResult', {
              service: 'assemblyai',
              transcript,
              isFinal,
              latency: Date.now() - session.lastAudioTimestamp
            });
          }
        });
        serviceSessions.set('assemblyai', session);
      }

      if (services.includes('deepgram') && process.env.DEEPGRAM_API_KEY) {
        const session = await deepgramRealtime.createRealtimeSession({
          sampleRate,
          encoding,
          channels,
          socket,
          onTranscript: (transcript, isFinal) => {
            socket.emit('transcriptResult', {
              service: 'deepgram',
              transcript,
              isFinal,
              latency: Date.now() - session.lastAudioTimestamp
            });
          }
        });
        serviceSessions.set('deepgram', session);
      }

      if (services.includes('openai') && process.env.OPENAI_API_KEY) {
        const session = await openAIRealtime.createRealtimeSession({
          sampleRate,
          encoding,
          socket,
          onTranscript: (transcript, isFinal) => {
            socket.emit('transcriptResult', {
              service: 'openai',
              transcript,
              isFinal,
              latency: Date.now() - session.lastAudioTimestamp
            });
          }
        });
        serviceSessions.set('openai', session);
      }

      socket.emit('streamReady', { services: Array.from(serviceSessions.keys()) });

    } catch (error) {
      console.error('Error starting stream:', error);
      socket.emit('streamError', { error: error.message });
    }
  });

  // Handle audio data
  socket.on('audioData', async (pcmBuffer) => {
    // Forward audio to all active service sessions
    for (const [serviceName, session] of serviceSessions) {
      try {
        await session.sendAudio(pcmBuffer);
        session.lastAudioTimestamp = Date.now();
      } catch (error) {
        console.error(`Error sending audio to ${serviceName}:`, error);
        socket.emit('serviceError', { 
          service: serviceName, 
          error: error.message 
        });
      }
    }
  });

  // Handle stream end
  socket.on('endStream', async () => {
    console.log('Ending stream for socket:', socket.id);

    // Close all service sessions
    for (const [serviceName, session] of serviceSessions) {
      try {
        await session.close();
      } catch (error) {
        console.error(`Error closing ${serviceName} session:`, error);
      }
    }

    serviceSessions.clear();
    socket.emit('streamEnded');
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log('Client disconnected:', socket.id);

    // Clean up any remaining sessions
    for (const [serviceName, session] of serviceSessions) {
      try {
        await session.close();
      } catch (error) {
        console.error(`Error closing ${serviceName} session on disconnect:`, error);
      }
    }

    serviceSessions.clear();
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File size too large. Maximum size is 25MB.' });
    }
  }
  console.error('Server error:', error);
  res.status(500).json({ error: error.message });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received. Shutting down gracefully...');
  
  // Close all socket connections
  io.close(() => {
    console.log('All socket connections closed');
  });

  // Close HTTP server
  server.close(() => {
    console.log('HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Health check available at http://localhost:${PORT}/health`);
});