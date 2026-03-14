// src/services/whisper.js
const OpenAI = require('openai');

let openaiClient = null;

function getClient() {
  if (openaiClient) return openaiClient;
  openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return openaiClient;
}

async function transcribeAudio(mediaUrl) {
  try {
    // Download audio from Twilio
    const response = await fetch(mediaUrl, {
      headers: {
        Authorization: 'Basic ' + Buffer.from(
          `${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`
        ).toString('base64'),
      },
    });
    if (!response.ok) return null;

    const buffer = Buffer.from(await response.arrayBuffer());

    // Create a File-like object for the API
    const file = new File([buffer], 'audio.ogg', { type: 'audio/ogg' });

    const transcription = await getClient().audio.transcriptions.create({
      model: 'whisper-1',
      file,
      language: 'ar',
      prompt: 'هيدا بوت للمساعدة. ملجأ إخلاء مستشفى مساعدة تسجيل نازح',
    });

    return transcription.text || null;
  } catch {
    return null;
  }
}

module.exports = { transcribeAudio };
