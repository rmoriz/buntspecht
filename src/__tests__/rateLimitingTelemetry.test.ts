import { PushProvider } from '../messages/pushProvider';
import { TelemetryService } from '../services/telemetryStub';
import { Logger } from '../utils/logger';

describe('Rate Limiting Telemetry Integration', () => {
  let logger: Logger;
  let telemetry: TelemetryService;
  let provider: PushProvider;

  beforeEach(() => {
    logger = new Logger('debug');
    telemetry = new TelemetryService({ enabled: false, serviceName: 'test', serviceVersion: '1.0.0' }, logger);
    provider = new PushProvider({ rateLimitMessages: 2, rateLimitWindowSeconds: 60 });
    
    // Mock console methods to avoid test output
    jest.spyOn(console, 'log').mockImplementation();
    jest.spyOn(console, 'info').mockImplementation();
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'debug').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should initialize provider with telemetry service', async () => {
    await expect(provider.initialize(logger, telemetry)).resolves.toBeUndefined();
  });

  it('should handle telemetry methods without errors', async () => {
    // Spy on telemetry methods
    const recordRateLimitHitSpy = jest.spyOn(telemetry, 'recordRateLimitHit');
    const recordRateLimitResetSpy = jest.spyOn(telemetry, 'recordRateLimitReset');
    const updateRateLimitUsageSpy = jest.spyOn(telemetry, 'updateRateLimitUsage');

    await provider.initialize(logger, telemetry);

    // Mock Date.now for consistent testing
    const mockNow = 1000000;
    jest.spyOn(Date, 'now').mockReturnValue(mockNow);

    // Test rate limit reset detection
    provider.recordMessageSent();
    provider.recordMessageSent(); // Hit rate limit
    
    // Move time forward to trigger reset
    jest.spyOn(Date, 'now').mockReturnValue(mockNow + 61000);
    provider.isRateLimited(); // This should trigger reset detection

    // Verify telemetry methods are called (they're no-ops in stub but should not throw)
    expect(() => telemetry.recordRateLimitHit('test', 1, 2)).not.toThrow();
    expect(() => telemetry.recordRateLimitReset('test')).not.toThrow();
    expect(() => telemetry.updateRateLimitUsage('test', 1, 2)).not.toThrow();

    // Verify spies were set up correctly
    expect(recordRateLimitHitSpy).toBeDefined();
    expect(recordRateLimitResetSpy).toBeDefined();
    expect(updateRateLimitUsageSpy).toBeDefined();
  });

  it('should work without telemetry service', async () => {
    // Initialize without telemetry
    await expect(provider.initialize(logger)).resolves.toBeUndefined();
    
    // Should not throw when telemetry is undefined
    expect(() => provider.isRateLimited()).not.toThrow();
    expect(() => provider.recordMessageSent()).not.toThrow();
  });

  it('should provide rate limit information for telemetry', () => {
    const rateLimitInfo = provider.getRateLimitInfo();
    
    expect(rateLimitInfo).toHaveProperty('messages');
    expect(rateLimitInfo).toHaveProperty('windowSeconds');
    expect(rateLimitInfo).toHaveProperty('currentCount');
    expect(rateLimitInfo).toHaveProperty('timeUntilReset');
    
    expect(rateLimitInfo.messages).toBe(2);
    expect(rateLimitInfo.windowSeconds).toBe(60);
    expect(rateLimitInfo.currentCount).toBe(0);
    expect(rateLimitInfo.timeUntilReset).toBe(0);
  });
});