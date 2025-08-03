/**
 * Cross-runtime compatibility test
 * This test demonstrates how to write tests that work in both Jest and Bun
 */

import { CrossRuntimeTestHelpers } from './utils/crossRuntimeHelpers';
import { createMockFunction, isJest, isBun } from './utils/testRuntime';

describe('Cross-Runtime Compatibility', () => {
  let mockLogger: any;
  let mockTelemetry: any;

  beforeEach(() => {
    mockLogger = CrossRuntimeTestHelpers.createTestLogger();
    mockTelemetry = CrossRuntimeTestHelpers.createMockTelemetry();
  });

  afterEach(() => {
    CrossRuntimeTestHelpers.cleanup();
  });

  describe('Runtime Detection', () => {
    it('should detect the correct runtime', () => {
      // In Jest environment
      if (typeof jest !== 'undefined' && typeof (globalThis as any).Bun === 'undefined') {
        expect(isJest).toBe(true);
        expect(isBun).toBe(false);
      } 
      // In Bun environment
      else if (typeof (globalThis as any).Bun !== 'undefined') {
        expect(isJest).toBe(false);
        expect(isBun).toBe(true);
      }
      // In any case, at least one should be true
      expect(isJest || isBun).toBe(true);
    });

    it('should create compatible mock functions', () => {
      const mockFn = createMockFunction((x: number) => x * 2);
      
      // Test basic functionality
      const result = mockFn(5);
      expect(result).toBe(10);
      
      // Test mock methods
      mockFn.mockReturnValue?.(42);
      expect(mockFn(1)).toBe(42);
      
      // Test call tracking
      if (isJest) {
        expect((mockFn as any).mock.calls.length).toBeGreaterThan(0);
      } else {
        expect(mockFn.calls?.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Logger Compatibility', () => {
    it('should create a working logger in both runtimes', () => {
      expect(mockLogger).toBeDefined();
      expect(typeof mockLogger.info).toBe('function');
      expect(typeof mockLogger.error).toBe('function');
      expect(typeof mockLogger.debug).toBe('function');
      expect(typeof mockLogger.warn).toBe('function');
    });

    it('should suppress console output during tests', () => {
      // This should not produce output in either runtime
      mockLogger.info('This should be suppressed');
      mockLogger.error('This should also be suppressed');
    });
  });

  describe('Telemetry Compatibility', () => {
    it('should create a working mock telemetry service', () => {
      expect(mockTelemetry).toBeDefined();
      expect(typeof mockTelemetry.startSpan).toBe('function');
      expect(typeof mockTelemetry.recordPost).toBe('function');
      expect(typeof mockTelemetry.recordError).toBe('function');
    });

    it('should handle telemetry method calls', () => {
      const span = mockTelemetry.startSpan('test-span');
      expect(span).toBeDefined();
      
      span.setStatus?.({ code: 1 });
      span.end?.();
      
      mockTelemetry.recordPost?.('test', 'success');
      mockTelemetry.recordError?.('test-error');
    });
  });

  describe('Async Operations', () => {
    it('should handle promises correctly', async () => {
      const asyncMock = createMockFunction(async (value: string) => `processed: ${value}`);
      
      const result = await asyncMock('test');
      expect(result).toBe('processed: test');
    });

    it('should handle promise rejections', async () => {
      const rejectingMock = createMockFunction();
      rejectingMock.mockRejectedValue?.(new Error('Test error'));
      
      try {
        await rejectingMock();
        throw new Error('Should have thrown');
      } catch (error: any) {
        expect(error.message).toBe('Test error');
      }
    });

    it('should work with setTimeout', async () => {
      let resolved = false;
      
      setTimeout(() => {
        resolved = true;
      }, 10);
      
      // Wait for timeout
      await CrossRuntimeTestHelpers.delay(20);
      expect(resolved).toBe(true);
    });
  });

  describe('Error Handling', () => {
    it('should handle thrown errors consistently', () => {
      const throwingFn = () => {
        throw new Error('Test error');
      };
      
      expect(throwingFn).toThrow('Test error');
    });

    it('should handle async errors', async () => {
      const asyncThrowingFn = async () => {
        throw new Error('Async error');
      };
      
      await expect(asyncThrowingFn()).rejects.toThrow('Async error');
    });
  });

  describe('Mock Context', () => {
    it('should create a valid mock context', () => {
      const context = CrossRuntimeTestHelpers.createMockContext();
      
      expect(context.message).toBeDefined();
      expect(context.providerName).toBe('test-provider');
      expect(context.accountNames).toEqual(['test-account']);
      expect(context.visibility).toBe('public');
      expect(context.data).toEqual({});
      expect(context.skip).toBe(false);
    });
  });

  describe('Fetch Mocking', () => {
    it('should allow fetch mocking in both runtimes', async () => {
      // Mock global fetch
      const originalFetch = global.fetch;
      const mockFetch = createMockFunction();
      mockFetch.mockResolvedValue?.(Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ test: 'data' }),
        text: () => Promise.resolve('test response')
      } as Response));
      
      global.fetch = mockFetch as any;
      
      try {
        const response = await fetch('https://example.com');
        const data = await response.json() as { test: string };
        expect(data.test).toBe('data');
      } finally {
        // Restore original fetch
        global.fetch = originalFetch;
      }
    });
  });
});