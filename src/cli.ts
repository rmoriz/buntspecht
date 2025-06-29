import { Command } from 'commander';
import { CliOptions } from './types/config';

export function parseCliArguments(): CliOptions {
  const program = new Command();

  program
    .name('buntspecht')
    .description('Buntspecht - A reliable Fediverse bot for automated messages with flexible sources')
    .version('0.2.0')
    .option('-c, --config <path>', 'path to configuration file')
    .option('--test-post', 'post a test message immediately and exit')
    .option('--test-provider <name>', 'post a test message from specific provider and exit')
    .option('--list-providers', 'list all configured providers and exit')
    .option('--verify', 'verify connection to Mastodon and exit')
    .parse();

  const options = program.opts();

  return {
    config: options.config,
    testPost: options.testPost,
    testProvider: options.testProvider,
    listProviders: options.listProviders,
    verify: options.verify,
  } as CliOptions;
}