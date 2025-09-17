const { createClient } = require('@deepgram/sdk');

// Initialize Deepgram client
const deepgram = createClient(process.env.DEEPGRAM_API_KEY);

/**
 * Transcribe audio using Deepgram's pre-recorded API
 * @param {Buffer} audioBuffer - The audio file buffer
 * @param {Object} options - Additional options (mimetype)
 * @returns {Promise<Object>} Transcription result with text, time, and confidence
 */
async function transcribeBatch(audioBuffer, options = {}) {
  const startTime = Date.now();
  
  try {
    // Configure Deepgram options
    const deepgramOptions = {
      model: 'nova-3',
      language: 'en',
      smart_format: true,
      punctuate: true,
      paragraphs: true,
      utterances: true,
      diarize: true,
      measurements: true,
      detect_language: true
    };

    // Perform transcription
    const { result } = await deepgram.listen.prerecorded.transcribeFile(
      audioBuffer,
      deepgramOptions
    );

    const processingTime = Date.now() - startTime;

    // Extract transcription details
    const channel = result.results.channels[0];
    const alternative = channel.alternatives[0];

    // Calculate average confidence
    let averageConfidence = alternative.confidence;
    
    // If word-level confidence is available, calculate from that
    if (alternative.words && alternative.words.length > 0) {
      const totalConfidence = alternative.words.reduce((sum, word) => sum + word.confidence, 0);
      averageConfidence = totalConfidence / alternative.words.length;
    }

    return {
      text: alternative.transcript,
      time: processingTime,
      confidence: averageConfidence,
      error: null,
      details: {
        model: result.model_info?.name || 'nova-3',
        language: result.results.channels[0].detected_language || 'en',
        audio_duration: result.metadata?.duration || null,
        words_count: alternative.words?.length || 0,
        utterances: channel.alternatives[0].paragraphs?.utterances?.length || 0,
        processing_time_deepgram: result.metadata?.request_duration || null
      }
    };

  } catch (error) {
    console.error('Deepgram batch transcription error:', error);
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