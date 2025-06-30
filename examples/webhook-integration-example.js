#!/usr/bin/env node

/**
 * Webhook Integration Example for Buntspecht
 * 
 * This example demonstrates various webhook integration patterns:
 * - GitHub webhook integration
 * - Monitoring system alerts
 * - CI/CD pipeline notifications
 * - Custom webhook handlers
 */

import { MastodonPingBot } from '../src/bot.js';

// Example webhook payloads for testing
const examplePayloads = {
  github: {
    provider: "cicd-notifications",
    message: "🚀 New release v1.2.3 published",
    metadata: {
      repository: "user/repo",
      tag: "v1.2.3",
      author: "developer"
    }
  },
  
  monitoring: {
    provider: "monitoring-critical", 
    message: "🔴 CRITICAL: High CPU usage detected on server-01 (95%)",
    metadata: {
      server: "server-01",
      metric: "cpu_usage",
      value: 95,
      threshold: 80
    }
  },
  
  deployment: {
    provider: "system-notifications",
    message: "✅ Deployment to production completed successfully",
    metadata: {
      environment: "production",
      version: "1.2.3",
      duration: "2m 30s"
    }
  },
  
  alert: {
    provider: "webhook-alerts",
    message: "⚠️ Database connection pool exhausted",
    metadata: {
      service: "api-server",
      pool_size: 100,
      active_connections: 100
    }
  }
};

/**
 * Simulates webhook calls to test the integration
 */
async function testWebhookIntegration() {
  console.log('🔗 Testing Webhook Integration');
  console.log('==============================\n');

  const webhookUrl = 'http://localhost:3000/webhook';
  const secret = 'your-webhook-secret-here';

  for (const [type, payload] of Object.entries(examplePayloads)) {
    console.log(`📡 Testing ${type} webhook...`);
    
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Secret': secret
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      
      if (response.ok) {
        console.log(`✅ ${type} webhook successful:`, result.message);
      } else {
        console.log(`❌ ${type} webhook failed:`, result.error);
      }
    } catch (error) {
      console.log(`❌ ${type} webhook error:`, error.message);
    }
    
    console.log(''); // Empty line for readability
    
    // Wait between requests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

/**
 * GitHub webhook handler example
 */
function createGitHubWebhookHandler(bot) {
  return async (req, res) => {
    try {
      const event = req.headers['x-github-event'];
      const payload = req.body;

      let message = '';
      let provider = 'cicd-notifications';

      switch (event) {
        case 'push':
          const commits = payload.commits?.length || 0;
          const branch = payload.ref?.replace('refs/heads/', '') || 'unknown';
          message = `📝 ${commits} commit(s) pushed to ${branch} by ${payload.pusher?.name}`;
          break;

        case 'pull_request':
          const action = payload.action;
          const prNumber = payload.number;
          const title = payload.pull_request?.title;
          message = `🔀 Pull request #${prNumber} ${action}: ${title}`;
          break;

        case 'release':
          const tagName = payload.release?.tag_name;
          const releaseName = payload.release?.name;
          message = `🚀 Release ${tagName} published: ${releaseName}`;
          break;

        case 'issues':
          const issueAction = payload.action;
          const issueNumber = payload.issue?.number;
          const issueTitle = payload.issue?.title;
          message = `🐛 Issue #${issueNumber} ${issueAction}: ${issueTitle}`;
          provider = 'system-notifications';
          break;

        default:
          message = `📢 GitHub ${event} event received`;
      }

      await bot.triggerPushProvider(provider, message);
      
      res.json({ 
        success: true, 
        message: 'GitHub webhook processed successfully',
        event,
        provider
      });

    } catch (error) {
      console.error('GitHub webhook error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process GitHub webhook' 
      });
    }
  };
}

/**
 * Monitoring system webhook handler example
 */
function createMonitoringWebhookHandler(bot) {
  return async (req, res) => {
    try {
      const { alert, severity, message, metric, value, threshold } = req.body;

      // Choose provider based on severity
      let provider = 'system-notifications';
      let emoji = '📊';

      switch (severity?.toLowerCase()) {
        case 'critical':
          provider = 'monitoring-critical';
          emoji = '🔴';
          break;
        case 'warning':
          provider = 'webhook-alerts';
          emoji = '⚠️';
          break;
        case 'info':
          provider = 'system-notifications';
          emoji = 'ℹ️';
          break;
      }

      const alertMessage = message || 
        `${emoji} ${severity?.toUpperCase()}: ${alert} - ${metric}: ${value} (threshold: ${threshold})`;

      await bot.triggerPushProvider(provider, alertMessage);
      
      res.json({ 
        success: true, 
        message: 'Monitoring alert processed successfully',
        severity,
        provider
      });

    } catch (error) {
      console.error('Monitoring webhook error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process monitoring webhook' 
      });
    }
  };
}

/**
 * CI/CD pipeline webhook handler example
 */
function createCICDWebhookHandler(bot) {
  return async (req, res) => {
    try {
      const { pipeline, stage, status, environment, version, duration } = req.body;

      let emoji = '🔧';
      let provider = 'cicd-notifications';

      switch (status?.toLowerCase()) {
        case 'success':
        case 'passed':
          emoji = '✅';
          break;
        case 'failed':
        case 'error':
          emoji = '❌';
          provider = 'webhook-alerts';
          break;
        case 'running':
        case 'pending':
          emoji = '🔄';
          break;
        case 'cancelled':
          emoji = '⏹️';
          break;
      }

      const pipelineMessage = `${emoji} ${pipeline} ${stage} ${status}` +
        (environment ? ` (${environment})` : '') +
        (version ? ` - v${version}` : '') +
        (duration ? ` - ${duration}` : '');

      await bot.triggerPushProvider(provider, pipelineMessage);
      
      res.json({ 
        success: true, 
        message: 'CI/CD webhook processed successfully',
        pipeline,
        status,
        provider
      });

    } catch (error) {
      console.error('CI/CD webhook error:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to process CI/CD webhook' 
      });
    }
  };
}

/**
 * Express.js server example for custom webhook handling
 */
async function createCustomWebhookServer(bot) {
  // Note: This requires express to be installed
  // npm install express
  
  try {
    const express = (await import('express')).default;
    const app = express();
    
    app.use(express.json());
    
    // GitHub webhooks
    app.post('/github', createGitHubWebhookHandler(bot));
    
    // Monitoring webhooks
    app.post('/monitoring', createMonitoringWebhookHandler(bot));
    
    // CI/CD webhooks
    app.post('/cicd', createCICDWebhookHandler(bot));
    
    // Generic webhook endpoint
    app.post('/generic', async (req, res) => {
      try {
        const { provider, message } = req.body;
        
        if (!provider) {
          return res.status(400).json({ error: 'Provider is required' });
        }
        
        await bot.triggerPushProvider(provider, message);
        
        res.json({ 
          success: true, 
          message: 'Generic webhook processed successfully',
          provider
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    const port = 3001; // Different port from built-in webhook server
    app.listen(port, () => {
      console.log(`🌐 Custom webhook server running on port ${port}`);
      console.log(`Available endpoints:`);
      console.log(`  - POST http://localhost:${port}/github`);
      console.log(`  - POST http://localhost:${port}/monitoring`);
      console.log(`  - POST http://localhost:${port}/cicd`);
      console.log(`  - POST http://localhost:${port}/generic`);
    });
    
    return app;
  } catch (error) {
    console.log('Express.js not available. Install with: npm install express');
    return null;
  }
}

/**
 * Main function to demonstrate webhook integration
 */
async function main() {
  console.log('🔗 Buntspecht Webhook Integration Example');
  console.log('=========================================\n');

  try {
    // Initialize bot with webhook configuration
    const bot = new MastodonPingBot({
      config: 'config.webhook.example.toml'
    });

    await bot.initialize();
    
    console.log('✅ Bot initialized successfully!');
    
    // Check webhook configuration
    const webhookInfo = bot.getWebhookInfo();
    console.log('📡 Webhook configuration:', webhookInfo);
    
    // List push providers
    const pushProviders = bot.getPushProviders();
    console.log('🔔 Available push providers:', pushProviders.map(p => p.name));
    
    console.log('\n🚀 Starting bot with webhook server...');
    await bot.start();
    
    // Create custom webhook server for advanced integrations
    await createCustomWebhookServer(bot);
    
    console.log('\n📋 Testing webhook integration...');
    
    // Wait for servers to start
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test the webhook integration
    await testWebhookIntegration();
    
    console.log('✅ Webhook integration test completed!');
    console.log('\n🔧 Integration is ready. You can now:');
    console.log('   1. Configure external services to send webhooks to http://localhost:3000/webhook');
    console.log('   2. Use the custom endpoints on port 3001 for specialized integrations');
    console.log('   3. Monitor the logs to see webhook processing in action');
    console.log('\n⏹️  Press Ctrl+C to stop the servers');
    
    // Keep running
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down...');
      await bot.stop();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

// Export functions for use in other modules
export {
  createGitHubWebhookHandler,
  createMonitoringWebhookHandler,
  createCICDWebhookHandler,
  createCustomWebhookServer,
  testWebhookIntegration
};

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}