// tests/services/whisper.test.js
const { transcribeAudio } = require('../../src/services/whisper');

jest.mock('openai', () => {
  return jest.fn().mockImplementation(() => ({
    audio: {
      transcriptions: {
        create: jest.fn().mockResolvedValue({ text: 'وين أقرب ملجأ' }),
      },
    },
  }));
});

// Mock node fetch for downloading audio
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
});

describe('transcribeAudio', () => {
  beforeAll(() => { process.env.OPENAI_API_KEY = 'test-key'; });

  test('downloads audio and returns transcribed text', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(100)),
    });
    const result = await transcribeAudio('https://api.twilio.com/audio.ogg');
    expect(result).toBe('وين أقرب ملجأ');
  });

  test('returns null on transcription failure', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network'));
    const result = await transcribeAudio('https://bad-url');
    expect(result).toBeNull();
  });
});
