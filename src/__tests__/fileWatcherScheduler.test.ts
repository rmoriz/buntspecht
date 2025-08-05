import { FileWatcherScheduler } from '../services/fileWatcherScheduler';
import { Logger } from '../utils/logger';
import { SocialMediaClient } from '../services/socialMediaClient';
import { JsonCommandProvider } from '../messages/jsonCommandProvider';
import { ProviderConfig } from '../types/config';

describe('FileWatcherScheduler', () => {
  let mockLogger: jest.Mocked<Logger>;
  let mockSocialMediaClient: jest.Mocked<SocialMediaClient>;
  let scheduler: FileWatcherScheduler;

  beforeEach(() => {
    jest.useFakeTimers();
    
    mockLogger = {
      setLevel: jest.fn(),
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      isDebugEnabled: jest.fn().mockReturnValue(true),
      isInfoEnabled: jest.fn().mockReturnValue(true),
    } as unknown as jest.Mocked<Logger>;

    mockSocialMediaClient = {
      postMessage: jest.fn().mockResolvedValue(undefined),
    } as unknown as jest.Mocked<SocialMediaClient>;

    scheduler = new FileWatcherScheduler(mockLogger, mockSocialMediaClient);
  });

  afterEach(() => {
    scheduler.cleanup();
    jest.useRealTimers();
    jest.clearAllTimers();
  });

  it('should create scheduler and start task processor', () => {
    expect(mockLogger.info).toHaveBeenCalledWith('File watcher task processor started');
  });

  it('should register provider with file change callback', () => {
    const mockProvider = {
      setFileChangeCallback: jest.fn(),
      generateMessageWithAttachments: jest.fn().mockResolvedValue({
        text: 'Test message',
        attachments: undefined
      })
    } as unknown as JsonCommandProvider;

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      type: 'jsoncommand',
      enabled: true,
      accounts: ['test-account'], config: {}
    };

    scheduler.registerProvider('test-provider', mockProvider, providerConfig, ['test-account']);

    expect(mockLogger.info).toHaveBeenCalledWith('Registering file watcher for provider: test-provider');
    expect(mockProvider.setFileChangeCallback).toHaveBeenCalled();
  });

  it('should handle provider without file change callback', () => {
    const mockProvider = {
      generateMessage: jest.fn().mockResolvedValue('Test message')
    } as unknown as JsonCommandProvider;

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      type: 'jsoncommand',
      enabled: true,
      accounts: ['test-account'], config: {}
    };

    scheduler.registerProvider('test-provider', mockProvider, providerConfig, ['test-account']);

    expect(mockLogger.warn).toHaveBeenCalledWith('Provider test-provider does not support file change callbacks');
  });

  it('should process file change events with rate limiting', async () => {
    const mockProvider = {
      setFileChangeCallback: jest.fn(),
      generateMessageWithAttachments: jest.fn().mockResolvedValue({
        text: 'Test message',
        attachments: undefined
      })
    } as unknown as JsonCommandProvider;

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      type: 'jsoncommand',
      enabled: true,
      accounts: ['test-account'], config: {}
    };

    scheduler.registerProvider('test-provider', mockProvider, providerConfig, ['test-account']);

    // Get the callback that was registered
    const callback = (mockProvider.setFileChangeCallback as jest.Mock).mock.calls[0][0];

    // Wait for grace period to pass (4 seconds to be safe)
    jest.advanceTimersByTime(4000);

    // Trigger file change
    callback();

    // Check that task was queued
    const status = scheduler.getQueueStatus();
    expect(status.queueSize).toBe(1);
    expect(mockLogger.info).toHaveBeenCalledWith(expect.stringContaining('task queued'));

    // Trigger again immediately (should be rate limited)
    callback();
    
    // Should still be only 1 task due to rate limiting
    const statusAfter = scheduler.getQueueStatus();
    expect(statusAfter.queueSize).toBe(1);
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Rate limiting'));
  });

  it('should return correct queue status', () => {
    const status = scheduler.getQueueStatus();
    
    expect(status).toEqual({
      queueSize: 0,
      isProcessing: false,
      registeredProviders: 0
    });
  });

  it('should ignore file changes during startup grace period', () => {
    const mockProvider = {
      setFileChangeCallback: jest.fn(),
      generateMessageWithAttachments: jest.fn().mockResolvedValue({
        text: 'Test message',
        attachments: undefined
      })
    } as unknown as JsonCommandProvider;

    const providerConfig: ProviderConfig = {
      name: 'test-provider',
      type: 'jsoncommand',
      enabled: true,
      accounts: ['test-account'], config: {}
    };

    scheduler.registerProvider('test-provider', mockProvider, providerConfig, ['test-account']);

    // Get the callback that was registered
    const callback = (mockProvider.setFileChangeCallback as jest.Mock).mock.calls[0][0];

    // Trigger file change during grace period (should be ignored)
    callback();

    // Check that no task was queued
    const status = scheduler.getQueueStatus();
    expect(status.queueSize).toBe(0);
    expect(mockLogger.debug).toHaveBeenCalledWith(expect.stringContaining('Ignoring file change during startup grace period'));
  });

  it('should cleanup resources', () => {
    scheduler.cleanup();
    
    expect(mockLogger.info).toHaveBeenCalledWith('File watcher scheduler cleaned up');
    
    const status = scheduler.getQueueStatus();
    expect(status.queueSize).toBe(0);
    expect(status.registeredProviders).toBe(0);
  });
});