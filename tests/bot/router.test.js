// tests/bot/router.test.js
const { detectIntent } = require('../../src/bot/router');

describe('detectIntent', () => {
  test('detects menu number 1 as shelter', () => {
    expect(detectIntent('1')).toEqual({ intent: 'shelter', zone: null });
  });

  test('detects menu number 2 as evacuation', () => {
    expect(detectIntent('2')).toEqual({ intent: 'evacuation', zone: null });
  });

  test('detects menu number 3 as medical', () => {
    expect(detectIntent('3')).toEqual({ intent: 'medical', zone: null });
  });

  test('detects menu number 4 as aid', () => {
    expect(detectIntent('4')).toEqual({ intent: 'aid', zone: null });
  });

  test('detects menu number 5 as registration', () => {
    expect(detectIntent('5')).toEqual({ intent: 'registration', zone: null });
  });

  test('detects shelter keywords in Arabic', () => {
    expect(detectIntent('وين أقرب ملجأ')).toEqual({ intent: 'shelter', zone: null });
    expect(detectIntent('بدي محل نام')).toEqual({ intent: 'shelter', zone: null });
  });

  test('detects evacuation keywords', () => {
    expect(detectIntent('في إخلاء بالحمرا')).toEqual({ intent: 'evacuation', zone: 'hamra' });
  });

  test('detects medical keywords', () => {
    expect(detectIntent('وين أقرب مستشفى')).toEqual({ intent: 'medical', zone: null });
    expect(detectIntent('محتاج طبيب')).toEqual({ intent: 'medical', zone: null });
  });

  test('detects aid keywords', () => {
    expect(detectIntent('محتاج أكل')).toEqual({ intent: 'aid', zone: null });
  });

  test('detects registration keywords', () => {
    expect(detectIntent('بدي اتسجل كنازح')).toEqual({ intent: 'registration', zone: null });
  });

  test('detects zone name in text', () => {
    expect(detectIntent('ملاجئ صيدا')).toEqual({ intent: 'shelter', zone: 'saida' });
  });

  test('returns menu for unrecognized input', () => {
    expect(detectIntent('مرحبا')).toEqual({ intent: 'menu', zone: null });
  });

  test('returns menu for رجّعني', () => {
    expect(detectIntent('رجعني')).toEqual({ intent: 'menu', zone: null });
  });
});
