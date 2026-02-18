import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initNKZRuntime } from '../nkzRuntime';

vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

describe('nkzRuntime', () => {
  beforeEach(() => {
    delete (window as { __NKZ__?: unknown }).__NKZ__;
  });

  it('initializes and exposes version', () => {
    const runtime = initNKZRuntime();
    expect(runtime.version).toBe('1.0.0');
    expect(window.__NKZ__).toBe(runtime);
  });

  it('registers a module and returns it via getRegistered', () => {
    const runtime = initNKZRuntime();
    runtime.register({
      id: 'test-module',
      viewerSlots: { 'map-layer': [] },
    });
    expect(runtime.getRegistered('test-module')).toBeDefined();
    expect(runtime.getRegistered('test-module')?.id).toBe('test-module');
    expect(runtime.getRegisteredIds()).toContain('test-module');
  });

  it('notifies onRegister when a module is registered', () => {
    const runtime = initNKZRuntime();
    const callback = vi.fn();
    runtime.onRegister(callback);
    runtime.register({ id: 'catastro-spain', viewerSlots: {} });
    expect(callback).toHaveBeenCalledWith('catastro-spain', expect.any(Object));
  });

  it('is idempotent: second init returns same instance', () => {
    const first = initNKZRuntime();
    const second = initNKZRuntime();
    expect(first).toBe(second);
  });
});
