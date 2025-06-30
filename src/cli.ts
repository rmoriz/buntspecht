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
    .option('--trigger-push <name>', 'trigger a push provider by name and exit')
    .option('--trigger-push-message <message>', 'custom message for push provider (use with --trigger-push)')
    .option('--verify', 'verify connection to Mastodon and exit')
    .option('--about', 'show information about Buntspecht and its automated release system')
    .parse();

  const options = program.opts();

  return {
    config: options.config,
    testPost: options.testPost,
    testProvider: options.testProvider,
    listProviders: options.listProviders,
    listPushProviders: options.listPushProviders,
    triggerPush: options.triggerPush,
    triggerPushMessage: options.triggerPushMessage,
    verify: options.verify,
    about: options.about,
  } as CliOptions;
}