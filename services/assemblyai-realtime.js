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
      // AssemblyAI WebSocket URL with authentication
      const url = `wss://api.assemblyai.com/v2/realtime/ws?sample_rate=${sampleRate}`;
      
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
            // AssemblyAI expects base64 encoded audio
            const base64Audio = Buffer.from(pcmBuffer).toString('base64');
            ws.send(JSON.stringify({ audio_data: base64Audio }));
          }
        },
        
        close: async function() {
          if (ws.readyState === WebSocket.OPEN) {
            // Send terminate message
            ws.send(JSON.stringify({ terminate_session: true }));
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
          
          if (message.message_type === 'SessionBegins') {
            console.log('AssemblyAI session started:', message.session_id);
          } else if (message.message_type === 'PartialTranscript') {
            // Interim result
            if (onTranscript) {
              onTranscript(message.text, false);
            }
          } else if (message.message_type === 'FinalTranscript') {
            // Final result
            if (onTranscript) {
              onTranscript(message.text, true);
            }
          } else if (message.message_type === 'SessionTerminated') {
            console.log('AssemblyAI session terminated');
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