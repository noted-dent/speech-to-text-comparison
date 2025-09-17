const OpenAI = require('openai');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

/**
 * Transcribe audio using OpenAI's Whisper API
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {Object} options - Additional options (filename, mimetype)
 * @returns {Promise<Object>} Transcription result with text, time, and confidence
 */
async function transcribeBatch(audioBuffer, options = {}) {
  const startTime = Date.now();
  
  try {
    // Create a temporary file for the upload
    const tempFilename = `temp_${crypto.randomBytes(16).toString('hex')}.${options.mimetype?.split('/')[1] || 'mp3'}`;
    const tempPath = path.join(__dirname, '..', 'uploads', tempFilename);
    
    // Ensure uploads directory exists
    await fs.promises.mkdir(path.join(__dirname, '..', 'uploads'), { recursive: true });
    
    // Write buffer to temporary file
    await fs.promises.writeFile(tempPath, audioBuffer);

    // Create a readable stream from the file
    const audioStream = fs.createReadStream(tempPath);

    // Perform transcription with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: audioStream,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['word', 'segment']
    });

    // Clean up temporary file
    await fs.promises.unlink(tempPath);

    const processingTime = Date.now() - startTime;

    // Note: OpenAI Whisper doesn't provide confidence scores in the standard API
    // We'll use null for consistency
    const confidence = null;

    return {
      text: transcription.text,
      time: processingTime,
      confidence: confidence,
      error: null,
      details: {
        model: 'whisper-1',
        language: transcription.language,
        duration: transcription.duration,
        words_count: transcription.words?.length || 0,
        segments_count: transcription.segments?.length || 0
      }
    };

  } catch (error) {
    console.error('OpenAI batch transcription error:', error);
    
    // Clean up temp file if it exists
    try {
      const tempFilename = `temp_${crypto.randomBytes(16).toString('hex')}.${options.mimetype?.split('/')[1] || 'mp3'}`;
      const tempPath = path.join(__dirname, '..', 'uploads', tempFilename);
      await fs.promises.unlink(tempPath).catch(() => {});
    } catch (e) {
      // Ignore cleanup errors
    }

    return {
      text: null,
      time: Date.now() - startTime,
      confidence: null,
      error: error.message,
      details: null
    };
  }
}

module.exports = {
  transcribeBatch
};