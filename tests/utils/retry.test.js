const { withRetry } = require('../../src/utils/retry');

describe('withRetry', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('returns value on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn);
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on transient error and eventually succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('transient'))
      .mockResolvedValue('ok');
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 100 });
    jest.runAllTimersAsync();
    const result = await promise;
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  test('throws after maxAttempts exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));
    const promise = withRetry(fn, { maxAttempts: 3, baseDelayMs: 10 });
    jest.runAllTimersAsync();
    await expect(promise).rejects.toThrow('always fails');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('does not retry on non-retryable error', async () => {
    const err = new Error('auth error');
    err.code = 401;
    const fn = jest.fn().mockRejectedValue(err);
    await expect(withRetry(fn, { maxAttempts: 3, baseDelayMs: 10,
      isRetryable: (e) => e.code !== 401
    })).rejects.toThrow('auth error');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
