const WebSocket = require('ws');

/**
 * Create a real-time transcription session with AssemblyAI
 * @param {Object} options - Configuration options
 * @returns {Promise<Object>} Session object with WebSocket reference
 */
async function createRealtimeSession(options = {}) {
  const { sampleRate = 16000, encoding = 'pcm16', socket, onTranscript } = options;
  
  return new Promise((resolve, reject) => {
    try {
      // AssemblyAI WebSocket URL with authentication - using v3 endpoint
      // Enable format_turns for better formatting and set verbatim behavior
      const url = `wss://streaming.assemblyai.com/v3/ws?sample_rate=${sampleRate}&format_turns=true&disfluencies=true&format_text=false&filter_profanity=false&speaker_labels=true`;
      
      const ws = new WebSocket(url, {
        headers: {
          'Authorization': process.env.ASSEMBLYAI_API_KEY
        }
      });

      const session = {
        ws,
        isConnected: false,
        lastAudioTimestamp: Date.now(),
        
        sendAudio: async function(pcmBuffer) {
          if (this.isConnected && ws.readyState === WebSocket.OPEN) {
            // v3 API expects raw binary audio data, not base64
            ws.send(pcmBuffer);
          }
        },
        
        close: async function() {
          if (ws.readyState === WebSocket.OPEN) {
            // Send termination message for v3 API
            ws.send(JSON.stringify({ type: 'SessionTermination', reason: 'User requested close' }));
            ws.close();
          }
          this.isConnected = false;
        }
      };

      ws.on('open', () => {
        console.log('AssemblyAI WebSocket connected');
        session.isConnected = true;
        resolve(session);
      });

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          
          if (message.error) {
            console.error('AssemblyAI error:', message.error);
            session.close();
            return;
          }
          
          // Handle v3 API message types
          if (message.type === 'Begin') {
            console.log('AssemblyAI session started:', message.id);
          } else if (message.type === 'Turn') {
            // Handle turn-based transcription result
            if (onTranscript && message.transcript) {
              // Check if this is a final transcript
              const isFinal = message.speech_final || false;
              onTranscript(message.transcript, isFinal);
            }
          } else if (message.type === 'Termination') {
            console.log('AssemblyAI session terminated:', message.reason);
            session.close();
          }
        } catch (error) {
          console.error('AssemblyAI message parse error:', error);
        }
      });

      ws.on('error', (error) => {
        console.error('AssemblyAI WebSocket error:', error);
        session.isConnected = false;
        reject(error);
      });

      ws.on('close', (code, reason) => {
        console.log('AssemblyAI WebSocket closed:', code, reason.toString());
        session.isConnected = false;
      });

      // Timeout if connection doesn't establish
      setTimeout(() => {
        if (!session.isConnected) {
          ws.close();
          reject(new Error('AssemblyAI connection timeout'));
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