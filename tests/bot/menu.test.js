// tests/bot/menu.test.js
const { handleMenu } = require('../../src/bot/menu');
const responses = require('../../src/bot/responses');

describe('handleMenu', () => {
  test('returns MENU string', () => {
    const result = handleMenu();
    expect(result).toBe(responses.MENU);
  });
});
