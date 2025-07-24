#!/usr/bin/env node

/**
 * Example script demonstrating how to use the Push Provider
 * This shows how to trigger push providers programmatically
 */

import { MastodonPingBot } from '../src/bot.js';

async function main() {
  try {
    // Initialize the bot with configuration
    const bot = new MastodonPingBot({
      config: 'config.push.example.toml' // Use the push provider example config
    });

    await bot.initialize();
    
    console.log('Bot initialized successfully!');
    console.log('Available providers:', bot.getProviderInfo());
    
    // Get all push providers
    const pushProviders = bot.getPushProviders();
    console.log('Push providers:', pushProviders);

    if (pushProviders.length === 0) {
      console.log('No push providers configured. Please check your configuration.');
      return;
    }

    // Example 1: Trigger a push provider with default message
    const firstPushProvider = pushProviders[0].name;
    console.log(`\nTriggering push provider "${firstPushProvider}" with default message...`);
    await bot.triggerPushProvider(firstPushProvider);
    
    // Wait a bit
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Example 2: Trigger a push provider with custom message
    console.log(`\nTriggering push provider "${firstPushProvider}" with custom message...`);
    await bot.triggerPushProvider(firstPushProvider, 'This is a custom alert message triggered programmatically!');

    // Example 3: Trigger multiple push providers
    if (pushProviders.length > 1) {
      console.log('\nTriggering all push providers...');
      for (const provider of pushProviders) {
        await bot.triggerPushProvider(provider.name, `Alert for ${provider.name}: System status update`);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Small delay between posts
      }
    }

    console.log('\nPush provider examples completed successfully!');
    
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

// Example of how this could be used in different scenarios:

/**
 * Webhook handler example
 */
function webhookHandler(req, res) {
  const { message, providerName } = req.body;
  
  // Trigger push provider with webhook data
  bot.triggerPushProvider(providerName || 'alert-notifications', message)
    .then(() => {
      res.json({ success: true, message: 'Alert sent' });
    })
    .catch(error => {
      res.status(500).json({ error: error.message });
    });
}

/**
 * Monitoring system integration example
 */
function monitoringAlert(severity, message) {
  const alertMessage = `[${severity.toUpperCase()}] ${message}`;
  
  // Choose provider based on severity
  const providerName = severity === 'critical' ? 'alert-notifications' : 'announcements';
  
  return bot.triggerPushProvider(providerName, alertMessage);
}

/**
 * Scheduled task that checks external conditions
 */
async function conditionalAlert() {
  // Check some external condition
  const shouldAlert = await checkExternalCondition();
  
  if (shouldAlert) {
    await bot.triggerPushProvider('system-status', 'Condition met - triggering alert');
  }
}

async function checkExternalCondition() {
  // Placeholder for actual condition checking
  return Math.random() > 0.7; // 30% chance
}

// Run the main example
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { webhookHandler, monitoringAlert, conditionalAlert };