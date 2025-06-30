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
      console.log('\nConfigured Providers:');
      console.log('====================');
      providerInfo.forEach(provider => {
        const status = provider.enabled ? 'Enabled' : 'Disabled';
        console.log(`${provider.name}: ${provider.type} (${provider.schedule}) - ${status}`);
      });
      console.log(`\nTotal: ${providerInfo.length} provider(s)`);
      return;
    }

    if (cliOptions.listPushProviders) {
      const pushProviders = bot.getPushProviders();
      console.log('\nConfigured Push Providers:');
      console.log('==========================');
      if (pushProviders.length === 0) {
        console.log('No push providers configured.');
      } else {
        pushProviders.forEach(provider => {
          console.log(`${provider.name}: ${JSON.stringify(provider.config, null, 2)}`);
        });
      }
      console.log(`\nTotal: ${pushProviders.length} push provider(s)`);
      return;
    }

    if (cliOptions.testPost) {
      await bot.testPost();
      return;
    }

    if (cliOptions.testProvider) {
      await bot.testPostFromProvider(cliOptions.testProvider);
      return;
    }

    if (cliOptions.triggerPush) {
      const providerName = cliOptions.triggerPush;
      const customMessage = cliOptions.triggerPushMessage;
      
      if (!bot.isPushProvider(providerName)) {
        console.error(`Error: "${providerName}" is not a push provider or does not exist.`);
        console.log('\nAvailable push providers:');
        const pushProviders = bot.getPushProviders();
        if (pushProviders.length === 0) {
          console.log('  No push providers configured.');
        } else {
          pushProviders.forEach(provider => {
            console.log(`  - ${provider.name}`);
          });
        }
        process.exit(1);
      }

      console.log(`Triggering push provider "${providerName}"${customMessage ? ' with custom message' : ''}...`);
      await bot.triggerPushProvider(providerName, customMessage);
      console.log('Push provider triggered successfully!');
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