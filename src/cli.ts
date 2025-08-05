import { Command } from 'commander';
import { CliOptions } from './types/config';
import * as packageJson from '../package.json';

export function parseCliArguments(): CliOptions {
  const program = new Command();

  program
    .name('buntspecht')
    .description('Buntspecht - A reliable Fediverse bot for automated messages with flexible sources')
    .version(packageJson.version)
    .option('-c, --config <path>', 'path to configuration file')
    .option('--test-post', 'post a test message immediately and exit')
    .option('--test-provider <name>', 'post a test message from specific provider and exit')
    .option('--list-providers', 'list all configured providers and exit')
    .option('--list-push-providers', 'list all configured push providers and exit')
    .option('--push-provider-status <name>', 'show rate limit status for a specific push provider')
    .option('--trigger-push <name>', 'trigger a push provider by name and exit')
    .option('--trigger-push-message <message>', 'custom message for push provider (use with --trigger-push)')
    .option('--webhook-status', 'show webhook server status and configuration')
    .option('--secret-rotation-status', 'show secret rotation detector status and configuration')
    .option('--check-secret-rotations', 'manually trigger a check for secret rotations and exit')
    .option('--list-monitored-secrets', 'list all monitored external secrets and their status')
    .option('--verify', 'verify connection to Mastodon and exit')
    .option('--verify-secrets', 'verify secret resolution without connecting to social media and exit')
    .option('--about', 'show information about Buntspecht and its automated release system')
    .option('--warm-cache', 'process all items from JSON providers and populate the cache without posting')
    .option('--trigger-provider <n>', 'immediately execute a specific provider (ignores cron schedule) and exit')
    .option('--purge-old-posts', 'purge old posts from all Mastodon accounts with purging enabled and exit')
    .option('--purge-account <name>', 'purge old posts from a specific Mastodon account and exit')
    .parse();

  const options = program.opts();

  return {
    config: options.config,
    testPost: options.testPost,
    testProvider: options.testProvider,
    triggerProvider: options.triggerProvider,
    listProviders: options.listProviders,
    listPushProviders: options.listPushProviders,
    pushProviderStatus: options.pushProviderStatus,
    triggerPush: options.triggerPush,
    triggerPushMessage: options.triggerPushMessage,
    webhookStatus: options.webhookStatus,
    secretRotationStatus: options.secretRotationStatus,
    checkSecretRotations: options.checkSecretRotations,
    listMonitoredSecrets: options.listMonitoredSecrets,
    verify: options.verify,
    verifySecrets: options.verifySecrets,
    about: options.about,
    warmCache: options.warmCache,
    purgeOldPosts: options.purgeOldPosts,
    purgeAccount: options.purgeAccount,
  } as CliOptions;
}