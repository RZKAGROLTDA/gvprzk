import { describe, it, expect } from 'vitest';
import { decideAttempt, parseAttempt, AUTO_RETRY_INTERVAL_MS, AUTO_MAX_ATTEMPTS } from './appUpdate';

describe('automatic update retry', () => {
  const now = 10_000_000;
  it('attempts a build never tried before', () => {
    expect(decideAttempt(null, 'b2', now)).toBe('attempt');
    expect(decideAttempt({ hash: 'b1', count: 6, at: now }, 'b2', now)).toBe('attempt');
  });
  it('waits 5 minutes before retrying the same build', () => {
    expect(AUTO_RETRY_INTERVAL_MS).toBe(5 * 60 * 1000);
    expect(decideAttempt({ hash: 'b2', count: 1, at: now - 60_000 }, 'b2', now)).toBe('wait');
    expect(decideAttempt({ hash: 'b2', count: 1, at: now - AUTO_RETRY_INTERVAL_MS }, 'b2', now)).toBe('attempt');
  });
  it('stops automatic retries after 6 attempts, leaving the manual button', () => {
    expect(decideAttempt({ hash: 'b2', count: AUTO_MAX_ATTEMPTS, at: 0 }, 'b2', now)).toBe('exhausted');
  });
  it('old single-hash records no longer block forever', () => {
    const rec = parseAttempt('b2');
    expect(rec).toEqual({ hash: 'b2', count: 1, at: 0 });
    expect(decideAttempt(rec, 'b2', now)).toBe('attempt');
  });
});
