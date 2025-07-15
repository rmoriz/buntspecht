import { MastodonPingBot } from '../bot';
import { CliOptions } from '../types/config';
import { MultiProviderScheduler } from '../services/multiProviderScheduler';
import { Logger } from '../utils/logger';

// Mock the MultiProviderScheduler
jest.mock('../services/multiProviderScheduler', () => {
  return {
    MultiProviderScheduler: jest.fn().mockImplementation(() => {
      return {
        initialize: jest.fn().mockResolvedValue(undefined),
        warmCache: jest.fn().mockResolvedValue(undefined),
      };
    }),
  };
});

// Mock the Logger
jest.mock('../utils/logger');

describe('Warm Cache Feature', () => {
  let bot: MastodonPingBot;
  let scheduler: jest.Mocked<MultiProviderScheduler>;
  let logger: jest.Mocked<Logger>;

  beforeEach(() => {
    const cliOptions: CliOptions = {
      warmCache: true,
    };
    bot = new MastodonPingBot(cliOptions);
    
    // We need to manually create an instance of the mocked scheduler
    scheduler = new (MultiProviderScheduler as any)();
    logger = new (Logger as any)();
    
    // Mock the bot's internal scheduler and logger instances
    (bot as any).scheduler = scheduler;
    (bot as any).logger = logger;
  });

  it('should call warmCache on the scheduler when --warm-cache is used', async () => {
    await bot.warmCache();
    expect(scheduler.warmCache).toHaveBeenCalled();
    expect(logger.info).toHaveBeenCalledWith('Warming cache...');
  });
});
