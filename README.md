# Speech-to-Text Service Comparison Tool

A comprehensive web application to compare speech-to-text services from AssemblyAI, Deepgram, and OpenAI Whisper. The tool supports both batch processing and real-time streaming modes, providing side-by-side comparisons of transcription quality, latency, and performance metrics.

## Features

### 🎯 Multi-Service Support
- **AssemblyAI**: Advanced speech recognition with speaker diarization and sentiment analysis
- **Deepgram**: Fast and accurate transcription with the Nova-2 model
- **OpenAI Whisper**: State-of-the-art transcription using the Whisper model

### 🔄 Dual Mode Operation

#### Batch Mode
- Upload audio files (MP3, WAV, M4A, WebM up to 25MB)
- Record audio directly in the browser
- Process multiple services simultaneously
- Compare transcription quality and processing times

#### Real-time Mode
- Stream audio from your microphone
- WebSocket-based real-time transcription
- View interim and final results as you speak
- Monitor latency and connection status for each service

### 📊 Comprehensive Metrics
- Processing time comparison
- Confidence scores (where available)
- Word count analysis
- Latency monitoring for real-time mode
- Audio file information

### 🛠️ Technical Features
- Web Audio API for high-quality audio capture
- 16-bit PCM audio processing at 16kHz
- Socket.IO for bidirectional real-time communication
- Responsive design for desktop and mobile
- Export results as JSON or CSV

## Prerequisites

- Node.js 16.0.0 or higher
- API keys for the services you want to test:
  - AssemblyAI API key
  - Deepgram API key
  - OpenAI API key

## Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/your-username/speech-to-text-comparison.git
   cd speech-to-text-comparison
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Create a `.env` file from the example:
   ```bash
   cp .env.example .env
   ```

4. Add your API keys to the `.env` file:
   ```env
   PORT=3000
   ASSEMBLYAI_API_KEY=your_assemblyai_api_key
   DEEPGRAM_API_KEY=your_deepgram_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   ```
   
   For development with auto-reload:
   ```bash
   npm run dev
   ```

2. Open your browser and navigate to:
   ```
   http://localhost:3000
   ```

3. Select the services you want to compare

4. Choose your mode:
   - **Batch Mode**: Upload or record audio for processing
   - **Real-time Mode**: Stream audio from your microphone

5. View the results side-by-side with detailed metrics

## API Endpoints

### REST Endpoints

- `GET /` - Serve the web application
- `GET /health` - Health check endpoint
- `GET /metrics` - Application metrics
- `POST /transcribe-batch` - Process audio file with selected services

### Socket.IO Events

#### Client → Server
- `startStream` - Initialize real-time transcription session
- `audioData` - Send PCM audio chunks
- `endStream` - Close transcription session

#### Server → Client
- `streamReady` - Confirmation that services are ready
- `transcriptResult` - Transcription results from services
- `streamError` - Stream initialization errors
- `serviceError` - Service-specific errors

## Architecture

### Audio Processing Pipeline
1. **Audio Capture**: Browser captures audio via `getUserMedia`
2. **Processing**: AudioContext processes at 16kHz sample rate
3. **Conversion**: Float32Array converted to 16-bit PCM (Int16Array)
4. **Streaming**: PCM chunks sent via Socket.IO every 100ms
5. **Service Forwarding**: Server forwards audio to service WebSocket APIs
6. **Results**: Transcription results emitted back to client

### Service Integration

Each service has two modules:
- **Batch Module** (`services/[service]-batch.js`): Handles file uploads
- **Real-time Module** (`services/[service]-realtime.js`): Manages WebSocket connections

### Real-time Streaming Details

- **AssemblyAI**: True WebSocket streaming with interim results
- **Deepgram**: Live WebSocket API with utterance detection
- **OpenAI**: Pseudo real-time (1-second chunks) as Whisper doesn't support streaming

## Deployment

### Docker Deployment

1. Build the Docker image:
   ```bash
   docker build -t stt-comparison .
   ```

2. Run the container:
   ```bash
   docker run -p 3000:3000 \
     -e ASSEMBLYAI_API_KEY=your_key \
     -e DEEPGRAM_API_KEY=your_key \
     -e OPENAI_API_KEY=your_key \
     stt-comparison
   ```

### DigitalOcean App Platform

1. Fork this repository to your GitHub account

2. Update `app.yaml` with your repository information

3. Create a new app on DigitalOcean App Platform

4. Connect your GitHub repository

5. Add environment variables in the DigitalOcean dashboard

6. Deploy the application

## Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3000) | No |
| `ASSEMBLYAI_API_KEY` | AssemblyAI API key | Yes* |
| `DEEPGRAM_API_KEY` | Deepgram API key | Yes* |
| `OPENAI_API_KEY` | OpenAI API key | Yes* |

*At least one API key is required

### Audio Settings

The application uses the following audio configuration:
- Sample Rate: 16,000 Hz
- Bit Depth: 16-bit
- Encoding: PCM (Linear16)
- Channels: Mono

## Limitations

1. **File Size**: Maximum upload size is 25MB
2. **OpenAI Real-time**: Whisper doesn't support true streaming, so audio is processed in 1-second chunks
3. **Browser Support**: Requires modern browsers with Web Audio API support
4. **HTTPS**: Microphone access requires HTTPS in production

## Cost Considerations

Each service has different pricing models:
- **AssemblyAI**: Pay per minute of audio
- **Deepgram**: Pay per minute with different tiers
- **OpenAI**: Pay per minute with Whisper API

Monitor your usage to avoid unexpected charges.

## Troubleshooting

### Common Issues

1. **Microphone Access Denied**
   - Ensure your browser has microphone permissions
   - Check that you're using HTTPS in production

2. **Service Connection Failed**
   - Verify your API keys are correct
   - Check service status pages for outages
   - Review browser console for specific errors

3. **Poor Transcription Quality**
   - Ensure good audio quality (quiet environment)
   - Check microphone settings and levels
   - Verify audio is captured at correct sample rate

### Debug Mode

To enable detailed logging, set the `DEBUG` environment variable:
```bash
DEBUG=* npm start
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## Security Notes

- Never commit API keys to version control
- Use environment variables for all sensitive data
- Implement rate limiting in production
- Consider adding authentication for public deployments
- Regularly update dependencies for security patches

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- AssemblyAI for their comprehensive speech recognition API
- Deepgram for their fast and accurate transcription service
- OpenAI for the Whisper model
- Socket.IO for real-time bidirectional communication

## Support

For issues and feature requests, please use the GitHub issue tracker.