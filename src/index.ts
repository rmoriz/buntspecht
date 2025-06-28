#!/usr/bin/env node

import { parseCliArguments } from './cli';
import { MastodonPingBot } from './bot';
import { ConfigLoader } from './config/configLoader';

async function main(): Promise<void> {
  try {
    const cliOptions = parseCliArguments();
    
    // Ensure config directory exists
    ConfigLoader.ensureConfigDirectory();

    const bot = new MastodonPingBot(cliOptions);
    await bot.initialize();

    // Handle special CLI commands
    if (cliOptions.verify) {
      await bot.verify();
      return;
    }

    if (cliOptions.listProviders) {
      const providerInfo = bot.getProviderInfo();
      if (providerInfo) {
        console.log('\nConfigured Providers:');
        console.log('====================');
        providerInfo.forEach(provider => {
          const status = provider.enabled ? 'Enabled' : 'Disabled';
          console.log(`${provider.name}: ${provider.type} (${provider.schedule}) - ${status}`);
        });
        console.log(`\nTotal: ${providerInfo.length} provider(s)`);
      } else {
        console.log('Using legacy single-provider configuration');
      }
      return;
    }

    if (cliOptions.testPost) {
      await bot.testPost();
      return;
    }

    if (cliOptions.testProvider) {
      if (!bot.isMultiProviderMode()) {
        throw new Error('--test-provider option requires multi-provider configuration');
      }
      await bot.testPostFromProvider(cliOptions.testProvider);
      return;
    }

    // Setup graceful shutdown
    bot.setupGracefulShutdown();

    // Start the bot
    await bot.start();

    // Keep the process running
    bot.getLogger().info('Bot is running. Press Ctrl+C to stop.');
    
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Only run if this file is executed directly
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main };