import { Logger } from '../utils/logger';
import { SecretManager } from '../secrets/SecretManager';
import { SecretCache } from '../secrets/SecretCache';
import { RotationDetector } from '../secrets/RotationDetector';
import { FileSecretProvider } from '../secrets/providers/FileSecretProvider';
import { VaultSecretProvider } from '../secrets/providers/VaultSecretProvider';
import { AwsSecretProvider } from '../secrets/providers/AwsSecretProvider';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

// Mock logger
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

// Mock telemetry
const mockTelemetry = {
  startSpan: jest.fn().mockReturnValue({
    setAttributes: jest.fn(),
    setStatus: jest.fn(),
    recordException: jest.fn(),
    end: jest.fn(),
  }),
  initialize: jest.fn(),
  shutdown: jest.fn(),
  isEnabled: jest.fn().mockReturnValue(true),
  endSpan: jest.fn(),
  recordError: jest.fn(),
  incrementCounter: jest.fn(),
  recordHistogram: jest.fn(),
  setGauge: jest.fn(),
  forceFlush: jest.fn(),
} as any;

describe('Secret Management System', () => {
  let tempDir: string;

  beforeEach(() => {
    jest.clearAllMocks();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buntspecht-secrets-test-'));
  });

  afterEach(() => {
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('SecretManager', () => {
    let secretManager: SecretManager;

    beforeEach(() => {
      secretManager = new SecretManager(
        {
          cache: { enabled: true, ttl: 1000, maxSize: 10 },
          rotation: { enabled: false, checkInterval: '*/5 * * * *', retryOnFailure: false, retryDelay: 30, maxRetries: 3, notifyOnRotation: false, testConnectionOnRotation: false },
          defaultTimeout: 5000,
        },
        mockLogger,
        mockTelemetry
      );
    });

    describe('initialization', () => {
      it('should initialize with default configuration', async () => {
        const manager = new SecretManager(
          {
            rotation: { enabled: false, checkInterval: '*/5 * * * *', retryOnFailure: false, retryDelay: 30, maxRetries: 3, notifyOnRotation: false, testConnectionOnRotation: false }
          },
          mockLogger,
          mockTelemetry
        );
        await manager.initialize();
        
        expect(manager.getProviders()).toContain('file');
        expect(manager.getProviders()).toContain('aws');
        // Vault provider requires node-vault, so it won't register
        // expect(manager.getProviders()).toContain('vault');
      });

      it('should initialize successfully with custom configuration', async () => {
        await secretManager.initialize();
        // Expect 2 providers (file and aws) since vault requires dependencies
        expect(secretManager.getProviders().length).toBeGreaterThanOrEqual(2);
      });

      it('should throw error when resolving without initialization', async () => {
        await expect(secretManager.resolve('file://test.txt')).rejects.toThrow('SecretManager is not initialized');
      });

      it('should not initialize twice', async () => {
        await secretManager.initialize();
        await secretManager.initialize(); // Should not throw
        
        expect(mockLogger.warn).toHaveBeenCalledWith('SecretManager is already initialized');
      });
    });

    describe('provider management', () => {
      beforeEach(async () => {
        await secretManager.initialize();
      });

      it('should register custom providers', async () => {
        const customProvider = {
          name: 'custom',
          initialize: jest.fn().mockResolvedValue(undefined),
          canHandle: jest.fn().mockReturnValue(true),
          resolve: jest.fn().mockResolvedValue('test-secret'),
          testConnection: jest.fn().mockResolvedValue(true),
          cleanup: jest.fn().mockResolvedValue(undefined),
        };

        await secretManager.registerProvider(customProvider);
        expect(secretManager.getProviders()).toContain('custom');
      });

      it('should not register duplicate providers', async () => {
        const customProvider = {
          name: 'file',
          initialize: jest.fn().mockResolvedValue(undefined),
          canHandle: jest.fn().mockReturnValue(true),
          resolve: jest.fn().mockResolvedValue('test-secret'),
          testConnection: jest.fn().mockResolvedValue(true),
          cleanup: jest.fn().mockResolvedValue(undefined),
        };

        await expect(secretManager.registerProvider(customProvider)).rejects.toThrow("Provider with name 'file' is already registered");
      });

      it('should unregister providers', async () => {
        const result = await secretManager.unregisterProvider('file');
        expect(result).toBe(true);
        expect(secretManager.getProviders()).not.toContain('file');
      });

      it('should return false when unregistering non-existent provider', async () => {
        const result = await secretManager.unregisterProvider('nonexistent');
        expect(result).toBe(false);
      });
    });

    describe('secret resolution', () => {
      let secretFile: string;

      beforeEach(async () => {
        await secretManager.initialize();
        secretFile = path.join(tempDir, 'test-secret.txt');
        fs.writeFileSync(secretFile, 'my-secret-value');
      });

      it('should resolve secrets from file provider', async () => {
        const result = await secretManager.resolve(`file://${secretFile}`);
        
        expect(result.value).toBe('my-secret-value');
        expect(result.metadata.provider).toBe('file');
        expect(result.metadata.source).toBe(`file://${secretFile}`);
        expect(result.cached).toBe(false);
      });

      it('should cache resolved secrets', async () => {
        const source = `file://${secretFile}`;
        
        // First call - should not be cached
        const result1 = await secretManager.resolve(source);
        expect(result1.cached).toBe(false);
        
        // Second call - should be cached
        const result2 = await secretManager.resolve(source);
        expect(result2.cached).toBe(true);
        expect(result2.value).toBe('my-secret-value');
      });

      it('should throw error for unsupported source format', async () => {
        await expect(secretManager.resolve('unsupported://test')).rejects.toThrow('No provider found for secret source');
      });

      it('should throw error for non-existent file', async () => {
        await expect(secretManager.resolve('file:///nonexistent/file.txt')).rejects.toThrow();
      });
    });

    describe('cache management', () => {
      let secretFile: string;

      beforeEach(async () => {
        await secretManager.initialize();
        secretFile = path.join(tempDir, 'test-secret.txt');
        fs.writeFileSync(secretFile, 'my-secret-value');
      });

      it('should clear cache for specific source', async () => {
        const source = `file://${secretFile}`;
        
        await secretManager.resolve(source);
        secretManager.clearCache(source);
        
        // Should not be cached after clearing
        const result = await secretManager.resolve(source);
        expect(result.cached).toBe(false);
      });

      it('should clear all cache', async () => {
        const source = `file://${secretFile}`;
        
        await secretManager.resolve(source);
        secretManager.clearCache();
        
        // Should not be cached after clearing
        const result = await secretManager.resolve(source);
        expect(result.cached).toBe(false);
      });

      it('should provide cache statistics', async () => {
        const source = `file://${secretFile}`;
        await secretManager.resolve(source);
        
        const stats = secretManager.getCacheStats();
        expect(stats.size).toBe(1);
        expect(stats.maxSize).toBe(10);
        expect(stats.enabled).toBe(true);
      });
    });

    describe('connection testing', () => {
      beforeEach(async () => {
        await secretManager.initialize();
      });

      it('should test all provider connections', async () => {
        const results = await secretManager.testConnections();
        
        expect(results.has('file')).toBe(true);
        expect(results.has('aws')).toBe(true);
        // Vault provider requires dependencies, might not be available
        expect(typeof results.get('file')).toBe('boolean');
      });
    });

    describe('configuration management', () => {
      beforeEach(async () => {
        await secretManager.initialize();
      });

      it('should return configuration', () => {
        const config = secretManager.getConfig();
        expect(config.cache?.enabled).toBe(true);
        expect(config.cache?.ttl).toBe(1000);
        expect(config.cache?.maxSize).toBe(10);
      });

      it('should update cache configuration', () => {
        secretManager.updateCacheConfig({ ttl: 2000, maxSize: 20 });
        
        const config = secretManager.getConfig();
        expect(config.cache?.ttl).toBe(2000);
        expect(config.cache?.maxSize).toBe(20);
      });
    });

    describe('start and stop', () => {
      beforeEach(async () => {
        await secretManager.initialize();
      });

      it('should start without rotation detector', async () => {
        await secretManager.start();
        expect(mockLogger.info).toHaveBeenCalledWith('SecretManager started');
      });

      it('should stop gracefully', async () => {
        await secretManager.start();
        await secretManager.stop();
        expect(mockLogger.info).toHaveBeenCalledWith('SecretManager stopped');
      });
    });
  });

  describe('SecretCache', () => {
    let cache: SecretCache;

    beforeEach(() => {
      cache = new SecretCache(
        { enabled: true, ttl: 1000, maxSize: 3 },
        mockLogger
      );
    });

    it('should store and retrieve secrets', () => {
      const result = {
        value: 'test-secret',
        metadata: {
          source: 'file://test.txt',
          provider: 'file',
          lastAccessed: new Date(),
          accessCount: 1,
        },
        cached: false,
      };

      cache.set('test-source', result);
      const retrieved = cache.get('test-source');
      
      expect(retrieved?.value).toBe('test-secret');
      expect(retrieved?.cached).toBe(true);
    });

    it('should expire secrets based on TTL', async () => {
      const result = {
        value: 'test-secret',
        metadata: {
          source: 'file://test.txt',
          provider: 'file',
          lastAccessed: new Date(),
          accessCount: 1,
        },
        cached: false,
      };

      cache.set('test-source', result);
      
      // Should be available immediately
      expect(cache.get('test-source')).toBeTruthy();
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      // Should be expired
      expect(cache.get('test-source')).toBeNull();
    });

    it('should respect max size limit', () => {
      const results = [];
      for (let i = 0; i < 5; i++) {
        results.push({
          value: `secret-${i}`,
          metadata: {
            source: `file://test-${i}.txt`,
            provider: 'file',
            lastAccessed: new Date(),
            accessCount: 1,
          },
          cached: false,
        });
      }

      // Add more items than max size
      for (let i = 0; i < 5; i++) {
        cache.set(`source-${i}`, results[i]);
      }

      const stats = cache.getStats();
      expect(stats.size).toBeLessThanOrEqual(3); // maxSize
    });

    it('should provide accurate statistics', () => {
      const result = {
        value: 'test-secret',
        metadata: {
          source: 'file://test.txt',
          provider: 'file',
          lastAccessed: new Date(),
          accessCount: 1,
        },
        cached: false,
      };

      cache.set('test-source', result);
      cache.get('test-source'); // Increment access count
      
      const stats = cache.getStats();
      expect(stats.size).toBe(1);
      expect(stats.maxSize).toBe(3);
      expect(stats.enabled).toBe(true);
      expect(stats.totalAccessCount).toBeGreaterThan(0);
    });

    it('should disable cache when configured', () => {
      const disabledCache = new SecretCache(
        { enabled: false, ttl: 1000, maxSize: 3 },
        mockLogger
      );

      const result = {
        value: 'test-secret',
        metadata: {
          source: 'file://test.txt',
          provider: 'file',
          lastAccessed: new Date(),
          accessCount: 1,
        },
        cached: false,
      };

      disabledCache.set('test-source', result);
      expect(disabledCache.get('test-source')).toBeNull();
    });

    it('should delete specific entries', () => {
      const result = {
        value: 'test-secret',
        metadata: {
          source: 'file://test.txt',
          provider: 'file',
          lastAccessed: new Date(),
          accessCount: 1,
        },
        cached: false,
      };

      cache.set('test-source', result);
      expect(cache.delete('test-source')).toBe(true);
      expect(cache.get('test-source')).toBeNull();
    });

    it('should clear all entries', () => {
      const result = {
        value: 'test-secret',
        metadata: {
          source: 'file://test.txt',
          provider: 'file',
          lastAccessed: new Date(),
          accessCount: 1,
        },
        cached: false,
      };

      cache.set('test-source-1', result);
      cache.set('test-source-2', result);
      
      cache.clear();
      
      expect(cache.get('test-source-1')).toBeNull();
      expect(cache.get('test-source-2')).toBeNull();
    });
  });

  describe('RotationDetector', () => {
    let secretManager: SecretManager;
    let rotationDetector: RotationDetector;

    beforeEach(async () => {
      secretManager = new SecretManager(
        {
          cache: { enabled: true, ttl: 1000, maxSize: 10 },
          rotation: { 
            enabled: true, 
            checkInterval: '*/1 * * * *', // Every minute
            retryOnFailure: false,
            retryDelay: 1,
            maxRetries: 1,
            notifyOnRotation: true,
            testConnectionOnRotation: false
          },
          defaultTimeout: 5000,
        },
        mockLogger,
        mockTelemetry
      );
      
      await secretManager.initialize();
      rotationDetector = new RotationDetector(
        {
          enabled: true,
          checkInterval: '*/1 * * * *',
          retryOnFailure: false,
          retryDelay: 1,
          maxRetries: 1,
          notifyOnRotation: true,
          testConnectionOnRotation: false
        },
        secretManager,
        mockLogger,
        mockTelemetry
      );
    });

    it('should track secrets for rotation detection', () => {
      rotationDetector.trackSecret('file://test.txt', 'test-account', 'password');
      
      const tracked = rotationDetector.getTrackedSecrets();
      expect(tracked).toHaveLength(1);
    });

    it('should provide rotation statistics', () => {
      rotationDetector.trackSecret('file://test.txt');
      
      const stats = rotationDetector.getStats();
      expect(stats.trackedSecrets).toBe(1);
      expect(stats.isRunning).toBe(false);
      expect(stats.totalRotations).toBe(0);
    });

    it('should untrack secrets', () => {
      rotationDetector.trackSecret('file://test.txt');
      const removed = rotationDetector.untrackSecret('file://test.txt');
      
      expect(removed).toBe(true);
      expect(rotationDetector.getTrackedSecrets()).toEqual([]);
    });

    it('should handle rotation checks with no secrets', async () => {
      await rotationDetector.checkRotations();
      expect(mockLogger.debug).toHaveBeenCalledWith('No secrets to check for rotation');
    });
  });
});