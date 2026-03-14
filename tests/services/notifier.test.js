// tests/services/notifier.test.js
const { notifyVolunteers } = require('../../src/services/notifier');

jest.mock('../../src/services/sheets');
jest.mock('../../src/services/twilio');

const sheets = require('../../src/services/sheets');
const twilio = require('../../src/services/twilio');

const mockVolunteers = [
  { phone: 'whatsapp:+96171111111', on_duty: 'true', language: 'ar' },
  { phone: 'whatsapp:+96171222222', on_duty: 'false', language: 'fr' },
  { phone: 'whatsapp:+96171333333', on_duty: 'true', language: 'ar' },
];

describe('notifyVolunteers', () => {
  beforeEach(() => jest.clearAllMocks());

  test('sends notification to on_duty volunteers only', async () => {
    sheets.fetchSheet.mockResolvedValue(mockVolunteers);
    twilio.sendMessage.mockResolvedValue({ sid: 'SM123' });

    await notifyVolunteers({ ticket: 'AID-123', name: 'Ahmad', zone: 'Hamra', need: 'أكل' });

    expect(twilio.sendMessage).toHaveBeenCalledTimes(2);
    expect(twilio.sendMessage).toHaveBeenCalledWith('whatsapp:+96171111111', expect.stringContaining('AID-123'));
    expect(twilio.sendMessage).not.toHaveBeenCalledWith('whatsapp:+96171222222', expect.anything());
  });

  test('does not throw if sheets fails', async () => {
    sheets.fetchSheet.mockRejectedValue(new Error('down'));
    await expect(notifyVolunteers({ ticket: 'AID-123', name: 'Ahmad', zone: 'Hamra', need: 'دوا' })).resolves.not.toThrow();
  });

  test('does not throw if no volunteers on duty', async () => {
    sheets.fetchSheet.mockResolvedValue([{ phone: 'whatsapp:+96171111111', on_duty: 'false', language: 'ar' }]);
    await expect(notifyVolunteers({ ticket: 'AID-123', name: 'Ahmad', zone: 'Hamra', need: 'دوا' })).resolves.not.toThrow();
    expect(twilio.sendMessage).not.toHaveBeenCalled();
  });
});
