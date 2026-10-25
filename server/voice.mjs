import Cartesia, { toFile } from '@cartesia/cartesia-js';

// Talking to Lila: Cartesia Ink turns the user's recording into text, and Cartesia Sonic
// speaks Lila's reply. On when CARTESIA_API_KEY is set.
const EXTENSIONS = { 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav' };

export function createVoice({ env = process.env, client } = {}) {
  const cartesia = client || (env.CARTESIA_API_KEY ? new Cartesia({ apiKey: env.CARTESIA_API_KEY }) : null);
  return {
    enabled: Boolean(cartesia),

    async transcribe(audio, mimeType = 'audio/webm') {
      const type = mimeType.split(';')[0].trim();
      const file = await toFile(audio, `speech.${EXTENSIONS[type] || 'webm'}`, { type });
      const result = await cartesia.stt.transcribe({ file, model: env.CARTESIA_STT_MODEL || 'ink-whisper', language: 'en' });
      return (result.text || '').trim();
    },

    // Returns MP3 bytes, which every browser and the Android web view can play.
    async speak(text) {
      const response = await cartesia.tts.generate({
        model_id: env.CARTESIA_TTS_MODEL || 'sonic-3',
        transcript: text,
        voice: env.CARTESIA_VOICE_ID || 'e07c00bc-4134-4eae-9ea4-1a55fb45746b',
        output_format: { container: 'mp3', sample_rate: 44100, bit_rate: 128000 },
        language: 'en',
      });
      return Buffer.from(await response.arrayBuffer());
    },
  };
}
