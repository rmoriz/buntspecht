#!/usr/bin/env node

/**
 * Simple webhook client for testing Buntspecht webhook integration
 * 
 * Usage:
 *   node webhook-client.js --provider webhook-alerts --message "Test alert"
 *   node webhook-client.js --provider system-notifications
 *   node webhook-client.js --url http://localhost:3000/webhook --secret your-secret
 */

import { parseArgs } from 'util';

const defaultConfig = {
  url: 'http://localhost:3000/webhook',
  secret: 'your-webhook-secret-here',
  provider: 'webhook-alerts',
  message: null
};

/**
 * Sends a webhook request to Buntspecht
 */
async function sendWebhook(config) {
  const payload = {
    provider: config.provider
  };

  if (config.message) {
    payload.message = config.message;
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  if (config.secret) {
    headers['X-Webhook-Secret'] = config.secret;
  }

  try {
    console.log(`📡 Sending webhook to ${config.url}`);
    console.log(`🔔 Provider: ${config.provider}`);
    if (config.message) {
      console.log(`💬 Message: ${config.message}`);
    }
    console.log('');

    const response = await fetch(config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (response.ok) {
      console.log('✅ Webhook sent successfully!');
      console.log('📄 Response:', JSON.stringify(result, null, 2));
    } else {
      console.log('❌ Webhook failed!');
      console.log('📄 Error:', JSON.stringify(result, null, 2));
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Network error:', error.message);
    process.exit(1);
  }
}

/**
 * Interactive mode for testing multiple webhooks
 */
async function interactiveMode(config) {
  console.log('🔗 Buntspecht Webhook Client - Interactive Mode');
  console.log('==============================================\n');

  const readline = (await import('readline')).createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise(resolve => {
    readline.question(prompt, resolve);
  });

  try {
    while (true) {
      console.log('\n📋 Available commands:');
      console.log('  1. Send webhook');
      console.log('  2. Change provider');
      console.log('  3. Change URL');
      console.log('  4. Change secret');
      console.log('  5. Show current config');
      console.log('  6. Exit');

      const choice = await question('\n🔢 Enter your choice (1-6): ');

      switch (choice.trim()) {
        case '1':
          const message = await question('💬 Enter message (or press Enter for default): ');
          const tempConfig = { ...config };
          if (message.trim()) {
            tempConfig.message = message.trim();
          }
          await sendWebhook(tempConfig);
          break;

        case '2':
          const provider = await question('🔔 Enter provider name: ');
          if (provider.trim()) {
            config.provider = provider.trim();
            console.log(`✅ Provider changed to: ${config.provider}`);
          }
          break;

        case '3':
          const url = await question('🌐 Enter webhook URL: ');
          if (url.trim()) {
            config.url = url.trim();
            console.log(`✅ URL changed to: ${config.url}`);
          }
          break;

        case '4':
          const secret = await question('🔐 Enter webhook secret: ');
          config.secret = secret.trim();
          console.log(`✅ Secret ${secret.trim() ? 'updated' : 'cleared'}`);
          break;

        case '5':
          console.log('\n📋 Current configuration:');
          console.log(`  URL: ${config.url}`);
          console.log(`  Provider: ${config.provider}`);
          console.log(`  Secret: ${config.secret ? '***' : 'none'}`);
          break;

        case '6':
          console.log('👋 Goodbye!');
          readline.close();
          return;

        default:
          console.log('❌ Invalid choice. Please enter 1-6.');
      }
    }
  } catch (error) {
    console.error('❌ Error in interactive mode:', error.message);
    readline.close();
  }
}

/**
 * Predefined webhook examples
 */
const examples = {
  alert: {
    provider: 'webhook-alerts',
    message: '🚨 Test alert from webhook client'
  },
  notification: {
    provider: 'system-notifications', 
    message: '📢 Test notification from webhook client'
  },
  cicd: {
    provider: 'cicd-notifications',
    message: '🚀 Test CI/CD notification - Build #123 completed'
  },
  monitoring: {
    provider: 'monitoring-critical',
    message: '🔴 CRITICAL: Test monitoring alert - CPU usage > 90%'
  }
};

/**
 * Sends all example webhooks
 */
async function sendExamples(config) {
  console.log('📡 Sending example webhooks...\n');

  for (const [name, example] of Object.entries(examples)) {
    console.log(`🔄 Sending ${name} example...`);
    
    const exampleConfig = {
      ...config,
      provider: example.provider,
      message: example.message
    };

    await sendWebhook(exampleConfig);
    console.log('');
    
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('✅ All examples sent!');
}

/**
 * Main function
 */
async function main() {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: {
      url: { type: 'string', short: 'u' },
      secret: { type: 'string', short: 's' },
      provider: { type: 'string', short: 'p' },
      message: { type: 'string', short: 'm' },
      interactive: { type: 'boolean', short: 'i' },
      examples: { type: 'boolean', short: 'e' },
      help: { type: 'boolean', short: 'h' }
    },
    allowPositionals: true
  });

  if (values.help) {
    console.log('🔗 Buntspecht Webhook Client');
    console.log('============================\n');
    console.log('Usage:');
    console.log('  node webhook-client.js [options]\n');
    console.log('Options:');
    console.log('  -u, --url <url>         Webhook URL (default: http://localhost:3000/webhook)');
    console.log('  -s, --secret <secret>   Webhook secret (default: your-webhook-secret-here)');
    console.log('  -p, --provider <name>   Provider name (default: webhook-alerts)');
    console.log('  -m, --message <text>    Custom message');
    console.log('  -i, --interactive       Interactive mode');
    console.log('  -e, --examples          Send all example webhooks');
    console.log('  -h, --help              Show this help\n');
    console.log('Examples:');
    console.log('  node webhook-client.js --provider webhook-alerts --message "Test alert"');
    console.log('  node webhook-client.js --interactive');
    console.log('  node webhook-client.js --examples');
    return;
  }

  const config = {
    url: values.url || defaultConfig.url,
    secret: values.secret || defaultConfig.secret,
    provider: values.provider || defaultConfig.provider,
    message: values.message || defaultConfig.message
  };

  try {
    if (values.interactive) {
      await interactiveMode(config);
    } else if (values.examples) {
      await sendExamples(config);
    } else {
      await sendWebhook(config);
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { sendWebhook, interactiveMode, sendExamples };