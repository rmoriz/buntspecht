/**
 * Cross-runtime test utilities for Jest and Bun compatibility
 */

// Detect runtime environment
export const isJest = typeof jest !== 'undefined';
export const isBun = typeof (globalThis as any).Bun !== 'undefined';

// Mock function type that works with both Jest and Bun
export type MockFunction<T extends (...args: any[]) => any = (...args: any[]) => any> = T & {
  mockReturnValue?: (value: ReturnType<T>) => MockFunction<T>;
  mockResolvedValue?: (value: Promise<ReturnType<T>>) => MockFunction<T>;
  mockRejectedValue?: (value: any) => MockFunction<T>;
  mockImplementation?: (fn: T) => MockFunction<T>;
  mockClear?: () => void;
  mockReset?: () => void;
  mockRestore?: () => void;
  calls?: Parameters<T>[];
  results?: { type: 'return' | 'throw'; value: any }[];
};

/**
 * Create a mock function that works in both Jest and Bun
 */
export function createMockFunction<T extends (...args: any[]) => any>(
  implementation?: T
): MockFunction<T> {
  if (isJest) {
    return jest.fn(implementation) as any;
  }
  
  // Bun-compatible mock implementation
  const calls: Parameters<T>[] = [];
  const results: { type: 'return' | 'throw'; value: any }[] = [];
  let mockImpl = implementation;
  let returnValue: any;
  let resolvedValue: any;
  let rejectedValue: any;
  
  const mockFn = ((...args: Parameters<T>) => {
    calls.push(args);
    
    try {
      let result: any;
      
      if (rejectedValue !== undefined) {
        throw rejectedValue;
      }
      
      if (resolvedValue !== undefined) {
        result = Promise.resolve(resolvedValue);
      } else if (returnValue !== undefined) {
        result = returnValue;
      } else if (mockImpl) {
        result = mockImpl(...args);
      } else {
        result = undefined;
      }
      
      results.push({ type: 'return', value: result });
      return result;
    } catch (error) {
      results.push({ type: 'throw', value: error });
      throw error;
    }
  }) as MockFunction<T>;
  
  // Add mock methods
  mockFn.mockReturnValue = (value: ReturnType<T>) => {
    returnValue = value;
    resolvedValue = undefined;
    rejectedValue = undefined;
    return mockFn;
  };
  
  mockFn.mockResolvedValue = (value: any) => {
    resolvedValue = value;
    returnValue = undefined;
    rejectedValue = undefined;
    return mockFn;
  };
  
  mockFn.mockRejectedValue = (value: any) => {
    rejectedValue = value;
    returnValue = undefined;
    resolvedValue = undefined;
    return mockFn;
  };
  
  mockFn.mockImplementation = (fn: T) => {
    mockImpl = fn;
    returnValue = undefined;
    resolvedValue = undefined;
    rejectedValue = undefined;
    return mockFn;
  };
  
  mockFn.mockClear = () => {
    calls.length = 0;
    results.length = 0;
  };
  
  mockFn.mockReset = () => {
    calls.length = 0;
    results.length = 0;
    mockImpl = implementation;
    returnValue = undefined;
    resolvedValue = undefined;
    rejectedValue = undefined;
  };
  
  mockFn.mockRestore = () => {
    // For Bun, this is the same as reset
    mockFn.mockReset?.();
  };
  
  // Expose call tracking
  Object.defineProperty(mockFn, 'calls', {
    get: () => calls
  });
  
  Object.defineProperty(mockFn, 'results', {
    get: () => results
  });
  
  return mockFn;
}

/**
 * Spy on object methods in a cross-runtime way
 */
export function spyOn<T extends object, K extends keyof T>(
  object: T,
  method: K
): MockFunction<T[K] extends (...args: any[]) => any ? T[K] : never> {
  if (isJest) {
    return jest.spyOn(object, method as any) as any;
  }
  
  // Bun-compatible spy implementation
  const original = object[method];
  const spy = createMockFunction(original as any);
  
  // Replace the method
  (object as any)[method] = spy;
  
  // Add restore functionality
  spy.mockRestore = () => {
    (object as any)[method] = original;
  };
  
  return spy as any;
}

/**
 * Clear all mocks in a cross-runtime way
 */
export function clearAllMocks(): void {
  if (isJest) {
    jest.clearAllMocks();
  }
  // For Bun, we'd need to track mocks manually or use a different approach
  // This is a limitation of the current implementation
}

/**
 * Restore all mocks in a cross-runtime way
 */
export function restoreAllMocks(): void {
  if (isJest) {
    jest.restoreAllMocks();
  }
  // For Bun, we'd need to track mocks manually
}

/**
 * Mock a module in a cross-runtime way
 */
export function mockModule(moduleName: string, factory?: () => any): void {
  if (isJest) {
    if (factory) {
      jest.doMock(moduleName, factory);
    } else {
      jest.mock(moduleName);
    }
  }
  // Bun doesn't have built-in module mocking, so this is a no-op
  // Users would need to use dependency injection or other patterns
}

/**
 * Create expect-like assertions that work in both runtimes
 */
export function createExpect() {
  if (isJest) {
    return expect;
  }
  
  // Basic Bun-compatible expect implementation
  return (actual: any) => ({
    toBe: (expected: any) => {
      if (actual !== expected) {
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toEqual: (expected: any) => {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(actual)} to equal ${JSON.stringify(expected)}`);
      }
    },
    toContain: (expected: any) => {
      if (!actual.includes(expected)) {
        throw new Error(`Expected ${actual} to contain ${expected}`);
      }
    },
    toHaveBeenCalled: () => {
      if (!actual.calls || actual.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
    },
    toHaveBeenCalledWith: (...args: any[]) => {
      if (!actual.calls || !actual.calls.some((call: any[]) => 
        JSON.stringify(call) === JSON.stringify(args)
      )) {
        throw new Error(`Expected function to have been called with ${JSON.stringify(args)}`);
      }
    },
    toThrow: (expectedError?: string | RegExp) => {
      try {
        actual();
        throw new Error('Expected function to throw');
      } catch (error: any) {
        if (expectedError) {
          if (typeof expectedError === 'string' && !error.message.includes(expectedError)) {
            throw new Error(`Expected error message to contain "${expectedError}", got "${error.message}"`);
          }
          if (expectedError instanceof RegExp && !expectedError.test(error.message)) {
            throw new Error(`Expected error message to match ${expectedError}, got "${error.message}"`);
          }
        }
      }
    }
  });
}

// Export the appropriate expect function
export const expectCompat = createExpect();