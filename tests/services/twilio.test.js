// tests/services/twilio.test.js
const { sendMessage, validateRequest, parseTwilioBody } = require('../../src/services/twilio');

jest.mock('twilio', () => {
  const mockCreate = jest.fn().mockResolvedValue({ sid: 'SM123' });
  const mockValidate = jest.fn();
  const client = jest.fn().mockReturnValue({
    messages: { create: mockCreate },
  });
  client.validateRequest = mockValidate;
  client.__mockCreate = mockCreate;
  client.__mockValidate = mockValidate;
  return client;
});

const twilio = require('twilio');

describe('sendMessage', () => {
  beforeAll(() => {
    process.env.TWILIO_ACCOUNT_SID = 'AC_test';
    process.env.TWILIO_AUTH_TOKEN = 'test_token';
    process.env.TWILIO_PHONE_NUMBER = 'whatsapp:+14155238886';
  });

  test('sends WhatsApp message via Twilio', async () => {
    const result = await sendMessage('whatsapp:+961711234', 'hello');
    expect(twilio.__mockCreate).toHaveBeenCalledWith({
      from: 'whatsapp:+14155238886',
      to: 'whatsapp:+961711234',
      body: 'hello',
    });
    expect(result.sid).toBe('SM123');
  });
});

describe('parseTwilioBody', () => {
  test('extracts Body, From, NumMedia, Latitude, Longitude', () => {
    const body = {
      Body: 'hello',
      From: 'whatsapp:+961711234',
      NumMedia: '0',
      Latitude: '33.89',
      Longitude: '35.50',
    };
    const result = parseTwilioBody(body);
    expect(result.text).toBe('hello');
    expect(result.from).toBe('whatsapp:+961711234');
    expect(result.hasMedia).toBe(false);
    expect(result.location).toEqual({ lat: 33.89, lng: 35.50 });
  });

  test('detects media (voice note)', () => {
    const body = {
      Body: '',
      From: 'whatsapp:+961711234',
      NumMedia: '1',
      MediaContentType0: 'audio/ogg',
      MediaUrl0: 'https://api.twilio.com/audio.ogg',
    };
    const result = parseTwilioBody(body);
    expect(result.hasMedia).toBe(true);
    expect(result.mediaType).toBe('audio/ogg');
    expect(result.mediaUrl).toBe('https://api.twilio.com/audio.ogg');
  });
});
