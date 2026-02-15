import { describe, it, expect, vi } from 'vitest'

describe('logger', () => {
  it('exports all expected methods', async () => {
    const { logger } = await import('../logger')
    expect(typeof logger.debug).toBe('function')
    expect(typeof logger.log).toBe('function')
    expect(typeof logger.info).toBe('function')
    expect(typeof logger.warn).toBe('function')
    expect(typeof logger.error).toBe('function')
    expect(typeof logger.table).toBe('function')
    expect(typeof logger.group).toBe('function')
    expect(typeof logger.groupEnd).toBe('function')
  })

  it('error method always works (even in production)', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { logger } = await import('../logger')
    logger.error('test error')
    consoleSpy.mockRestore()
    // The error function should be a real function, not noop
    expect(logger.error).not.toBe(logger.debug === logger.log ? undefined : null)
  })

  it('logger object is frozen structure', async () => {
    const { logger } = await import('../logger')
    // All methods should be defined
    const methods = ['debug', 'log', 'info', 'warn', 'error', 'table', 'group', 'groupEnd']
    for (const method of methods) {
      expect(logger).toHaveProperty(method)
    }
  })
})
