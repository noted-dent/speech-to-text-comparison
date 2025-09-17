const { createClient } = require('@deepgram/sdk');

/**
 * Create a real-time transcription session with Deepgram
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Session object with WebSocket reference
 */
async function createRealtimeSession(options = {}) {
  const { sampleRate = 16000, encoding = 'pcm16', channels = 1, socket, onTranscript } = options;
  
  return new Promise((resolve, reject) => {
    try {
      // Initialize Deepgram client
      const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

      // Configure live transcription options
      const connection = deepgram.listen.live({
        model: 'nova-3',
        language: 'en',
        smart_format: true,
        punctuate: true,
        interim_results: true,
        utterance_end_ms: 1000,
        vad_events: true,
        encoding: 'linear16',
        sample_rate: sampleRate,
        channels: channels
      });

      const session = {
        connection,
        isConnected: false,
        lastAudioTimestamp: Date.now(),
        
        sendAudio: async function(pcmBuffer) {
          if (this.isConnected) {
            // Deepgram expects raw PCM data
            this.connection.send(pcmBuffer);
          }
        },
        
        close: async function() {
          if (this.isConnected) {
            this.connection.finish();
          }
          this.isConnected = false;
        }
      };

      connection.on('open', () => {
        console.log('Deepgram WebSocket connected');
        session.isConnected = true;
        resolve(session);
      });

      connection.on('transcript', (data) => {
        const transcript = data.channel?.alternatives?.[0];
        if (transcript && onTranscript) {
          // Check if this is a final transcript
          const isFinal = data.is_final || false;
          onTranscript(transcript.transcript, isFinal);
        }
      });

      connection.on('metadata', (data) => {
        console.log('Deepgram metadata:', data);
      });

      connection.on('utteranceEnd', (data) => {
        // Handle utterance end event
        const transcript = data.channel?.alternatives?.[0];
        if (transcript && onTranscript) {
          onTranscript(transcript.transcript, true);
        }
      });

      connection.on('error', (error) => {
        console.error('Deepgram WebSocket error:', error);
        session.isConnected = false;
        if (!session.isConnected) {
          reject(error);
        }
      });

      connection.on('close', () => {
        console.log('Deepgram WebSocket closed');
        session.isConnected = false;
      });

      // Timeout if connection doesn't establish
      setTimeout(() => {
        if (!session.isConnected) {
          connection.finish();
          reject(new Error('Deepgram connection timeout'));
        }
      }, 10000);

    } catch (error) {
      reject(error);
    }
  });
}

module.exports = {
  createRealtimeSession
};