import { Command } from 'commander';
import { CliOptions } from './types/config';

export function parseCliArguments(): CliOptions {
  const program = new Command();

  program
    .name('buntspecht')
    .description('Buntspecht - Ein Fediverse/Mastodon-Bot der PING-Nachrichten nach Zeitplan postet')
    .version('1.0.0')
    .option('-c, --config <path>', 'path to configuration file')
    .option('--test-post', 'post a test message immediately and exit')
    .option('--verify', 'verify connection to Mastodon and exit')
    .parse();

  const options = program.opts();

  return {
    config: options.config,
    testPost: options.testPost,
    verify: options.verify,
  } as CliOptions & { testPost?: boolean; verify?: boolean };
}