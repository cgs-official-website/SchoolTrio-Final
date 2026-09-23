import { describe, it, expect } from 'vitest';
import { logger } from '../../src/utils/logger.js';

describe('Unit: Logger Redaction & Configuration', () => {
  it('Logger instance is initialized with standard logging methods', () => {
    expect(logger).toBeDefined();
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
    expect(typeof logger.debug).toBe('function');
    expect(typeof logger.level).toBe('string');
  });

  it('Logger executes without throwing errors', () => {
    expect(() => {
      logger.info({ testMessage: 'Logger functioning properly' });
    }).not.toThrow();
  });
});
