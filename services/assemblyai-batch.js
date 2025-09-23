const { AssemblyAI } = require('assemblyai');
const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

// Initialize AssemblyAI client
const client = new AssemblyAI({
  apiKey: process.env.ASSEMBLYAI_API_KEY
});

// Verbatim prompt for dental appointment transcriptions
const DENTAL_VERBATIM_PROMPT = 'Transcribe the audio verbatim for a dental appointment. Capture every word exactly as spoken, including fillers (um, uh), false starts, repetitions, stutters, and partial words. Mark non-speech events in brackets like (laughter), (sigh), (cough). Do not paraphrase or summarize. Preserve dental and medical terminology exactly. Do not record numbers spoken as numerals, record them as words.';

/**
 * Transcribe audio using AssemblyAI's batch API
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {Object} options - Additional options (filename, mimetype)
 * @returns {Promise<Object>} Transcription result with text, time, and confidence
 */
async function transcribeBatch(audioBuffer, options = {}) {
  const startTime = Date.now();
  
  try {
    // Create temporary file to upload
    const tempFilename = `temp_${crypto.randomBytes(16).toString('hex')}.${options.mimetype?.split('/')[1] || 'mp3'}`;
    const tempPath = path.join(__dirname, '..', 'uploads', tempFilename);
    
    // Ensure uploads directory exists
    await fs.mkdir(path.join(__dirname, '..', 'uploads'), { recursive: true });
    
    // Write buffer to temporary file
    await fs.writeFile(tempPath, audioBuffer);

    // Upload file to AssemblyAI
    const uploadUrl = await client.files.upload(tempPath);

    // Create transcription job
    const transcript = await client.transcripts.create({
      audio_url: uploadUrl,
      // Verbatim configuration
      disfluencies: true,
      format_text: false, // Keep spoken numerals as words and avoid formatting
      filter_profanity: false,
      prompt: DENTAL_VERBATIM_PROMPT,
      // Existing options
      language_detection: true,
      speaker_labels: true,
      auto_highlights: true,
      sentiment_analysis: true
    });

    // Wait for transcription to complete
    const completedTranscript = await client.transcripts.waitForCompletion(transcript.id);

    // Clean up temporary file
    await fs.unlink(tempPath);

    const processingTime = Date.now() - startTime;

    // Calculate average confidence if available
    let averageConfidence = null;
    if (completedTranscript.words && completedTranscript.words.length > 0) {
      const totalConfidence = completedTranscript.words.reduce((sum, word) => sum + (word.confidence || 0), 0);
      averageConfidence = totalConfidence / completedTranscript.words.length;
    }

    return {
      text: completedTranscript.text,
      time: processingTime,
      confidence: averageConfidence,
      error: null,
      details: {
        id: completedTranscript.id,
        status: completedTranscript.status,
        language_code: completedTranscript.language_code,
        audio_duration: completedTranscript.audio_duration,
        words_count: completedTranscript.words?.length || 0,
        speakers: completedTranscript.utterances?.length || 0
      }
    };

  } catch (error) {
    console.error('AssemblyAI batch transcription error:', error);
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