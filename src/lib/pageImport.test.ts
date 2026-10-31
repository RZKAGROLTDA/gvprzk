import { describe, it, expect, vi, afterEach } from 'vitest';
import { retryPageImport, isModuleLoadError } from './appUpdate';

afterEach(() => vi.useRealTimers());

describe('page transport recovery', () => {
  it('retries a transient module failure and returns the loaded page', async () => {
    vi.useFakeTimers();
    const load = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch dynamically imported module: /src/components/SalesFunnel.tsx')).mockResolvedValue({ default: 'page' });
    const result = retryPageImport(load);
    await vi.runAllTimersAsync();
    expect(await result).toEqual({ default: 'page' });
    expect(load).toHaveBeenCalledTimes(2);
  });
  it('caps persistent failures at three attempts', async () => {
    vi.useFakeTimers();
    const error = new TypeError('Failed to fetch dynamically imported module: /page.js');
    const load = vi.fn().mockRejectedValue(error);
    const assertion = expect(retryPageImport(load)).rejects.toBe(error);
    await vi.runAllTimersAsync();
    await assertion;
    expect(load).toHaveBeenCalledTimes(3);
  });
  it('does not retry application exceptions', async () => {
    const load = vi.fn().mockRejectedValue(new Error('Invalid report data'));
    await expect(retryPageImport(load)).rejects.toThrow('Invalid report data');
    expect(load).toHaveBeenCalledTimes(1);
    expect(isModuleLoadError(new Error('Invalid report data'))).toBe(false);
  });
});