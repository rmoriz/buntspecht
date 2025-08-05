#!/usr/bin/env bun

import { MastodonPingBot } from './bot';
import { parseCliArguments } from './cli';

export async function main(): Promise<void> {
  const cliOptions = parseCliArguments();

  // Handle simple CLI commands that don't need bot initialization
  if (cliOptions.about) {
    console.log('Buntspecht - A reliable Fediverse bot for automated messages with flexible sources');
    console.log(`Version: ${require('../package.json').version}`);
    return;
  }

  if (cliOptions.verifySecrets) {
    console.log('Secret verification not yet implemented');
    return;
  }

  // Handle purge commands with minimal initialization (only social media client)
  if (cliOptions.purgeOldPosts || cliOptions.purgeAccount) {
    const bot = new MastodonPingBot(cliOptions);
    
    try {
      // Only initialize configuration and social media client, skip providers/webhook/scheduler
      await bot.initializeForPurging();
      
      if (cliOptions.purgeOldPosts) {
        await bot.purgeOldPosts();
        await bot.stop();
        return;
      }

      if (cliOptions.purgeAccount) {
        await bot.purgeOldPosts([cliOptions.purgeAccount]);
        await bot.stop();
        return;
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  }

  // Handle commands that only need configuration loading (no full bot initialization)
  if (cliOptions.listProviders || cliOptions.listPushProviders || cliOptions.pushProviderStatus || 
      cliOptions.webhookStatus || cliOptions.secretRotationStatus) {
    const bot = new MastodonPingBot(cliOptions);
    
    try {
      await bot.initialize();
      
      if (cliOptions.listProviders) {
        const providers = bot.getProviderInfo();
        console.log('Configured providers:');
        providers.forEach(p => console.log(`- ${p.name} (${p.type}) - ${p.enabled ? 'enabled' : 'disabled'}`));
        await bot.stop();
        return;
      }

      if (cliOptions.listPushProviders) {
        const pushProviders = bot.getPushProviders();
        console.log('Configured push providers:');
        pushProviders.forEach(p => console.log(`- ${p.name}`));
        await bot.stop();
        return;
      }

      if (cliOptions.pushProviderStatus) {
        const provider = bot.getPushProvider(cliOptions.pushProviderStatus);
        if (provider) {
          console.log(`Push provider ${cliOptions.pushProviderStatus} status: configured`);
        } else {
          console.log(`Push provider ${cliOptions.pushProviderStatus} not found`);
        }
        await bot.stop();
        return;
      }

      if (cliOptions.webhookStatus) {
        const webhookInfo = bot.getWebhookInfo();
        console.log(`Webhook status: ${webhookInfo.enabled ? 'enabled' : 'disabled'}, running: ${webhookInfo.running}`);
        await bot.stop();
        return;
      }

      if (cliOptions.secretRotationStatus) {
        const enabled = bot.isSecretRotationEnabled();
        console.log(`Secret rotation detection: ${enabled ? 'enabled' : 'disabled'}`);
        await bot.stop();
        return;
      }
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  }

  // Initialize bot for commands that need full functionality
  const bot = new MastodonPingBot(cliOptions);

  try {
    await bot.initialize();

    if (cliOptions.verify) {
      await bot.verify();
      await bot.stop();
      return;
    }

    if (cliOptions.testPost) {
      await bot.testPost();
      await bot.stop();
      return;
    }

    if (cliOptions.testProvider) {
      await bot.testPostFromProvider(cliOptions.testProvider);
      await bot.stop();
      return;
    }

    if (cliOptions.triggerProvider) {
      await bot.testPostFromProvider(cliOptions.triggerProvider);
      await bot.stop();
      return;
    }


    if (cliOptions.triggerPush) {
      await bot.triggerPushProvider(cliOptions.triggerPush, cliOptions.triggerPushMessage);
      await bot.stop();
      return;
    }


    if (cliOptions.checkSecretRotations) {
      await bot.checkSecretRotations();
      await bot.stop();
      return;
    }

    if (cliOptions.listMonitoredSecrets) {
      const secrets = await bot.getMonitoredSecrets();
      console.log('Monitored secrets:');
      secrets.forEach(s => console.log(`- ${s.accountName}.${s.fieldName}: last checked ${s.lastChecked}`));
      await bot.stop();
      return;
    }

    if (cliOptions.warmCache) {
      await bot.warmCache();
      // Properly shutdown services to allow process to exit
      await bot.stop();
      return;
    }

    // Start the bot normally
    await bot.start();

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\nReceived SIGINT, shutting down gracefully...');
      await bot.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\nReceived SIGTERM, shutting down gracefully...');
      await bot.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Only run main if this file is executed directly (not imported)
if (require.main === module) {
  main().catch((error) => {
    console.error('Unhandled error:', error);
    process.exit(1);
  });
}