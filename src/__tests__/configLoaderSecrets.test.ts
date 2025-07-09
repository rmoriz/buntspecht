import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ConfigLoader } from '../config/configLoader';
import { CliOptions } from '../types/config';

describe('ConfigLoader with Secrets', () => {
  let tempDir: string;
  let configPath: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buntspecht-config-test-'));
    configPath = path.join(tempDir, 'config.toml');
  });

  afterEach(() => {
    // Clean up temp directory and environment variables
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    delete process.env.TEST_MASTODON_TOKEN;
    delete process.env.TEST_BLUESKY_PASSWORD;
  });

  describe('validateCredentialField', () => {
    it('should validate Mastodon account with direct credentials', () => {
      const config = `
[[accounts]]
name = "mastodon-direct"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "direct-token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["mastodon-direct"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      expect(() => ConfigLoader.loadConfig(cliOptions)).not.toThrow();
    });

    it('should validate Mastodon account with source credentials', () => {
      const config = `
[[accounts]]
name = "mastodon-source"
type = "mastodon"
instance = "https://mastodon.social"
accessTokenSource = "file:///etc/secrets/token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["mastodon-source"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      expect(() => ConfigLoader.loadConfig(cliOptions)).not.toThrow();
    });

    it('should validate Bluesky account with mixed credentials', () => {
      const config = `
[[accounts]]
name = "bluesky-mixed"
type = "bluesky"
identifier = "test.bsky.social"
passwordSource = "vault://secret/bluesky/password"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["bluesky-mixed"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      expect(() => ConfigLoader.loadConfig(cliOptions)).not.toThrow();
    });

    it('should reject account with both direct and source credentials', () => {
      const config = `
[[accounts]]
name = "invalid-account"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "direct-token"
accessTokenSource = "file:///etc/secrets/token"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["invalid-account"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Account "invalid-account": Cannot specify both accessToken and accessTokenSource'
      );
    });

    it('should reject account with neither direct nor source credentials', () => {
      const config = `
[[accounts]]
name = "incomplete-account"
type = "mastodon"
instance = "https://mastodon.social"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["incomplete-account"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Account "incomplete-account": Must specify either accessToken or accessTokenSource'
      );
    });

    it('should reject invalid source field types', () => {
      const config = `
[[accounts]]
name = "invalid-source-type"
type = "mastodon"
instance = "https://mastodon.social"
accessTokenSource = 123

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["invalid-source-type"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      expect(() => ConfigLoader.loadConfig(cliOptions)).toThrow(
        'Account "invalid-source-type": Invalid accessTokenSource (must be a string)'
      );
    });
  });

  describe('loadConfigWithSecrets', () => {
    it('should resolve environment variables in direct fields', async () => {
      process.env.TEST_MASTODON_TOKEN = 'env-token-value';
      
      const config = `
[[accounts]]
name = "mastodon-env"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "\${TEST_MASTODON_TOKEN}"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["mastodon-env"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      const resolvedConfig = await ConfigLoader.loadConfigWithSecrets(cliOptions);
      
      expect(resolvedConfig.accounts[0].accessToken).toBe('env-token-value');
    });

    it('should resolve file-based secrets from source fields', async () => {
      const secretFile = path.join(tempDir, 'secret-token.txt');
      fs.writeFileSync(secretFile, 'file-token-value\n');
      
      const config = `
[[accounts]]
name = "mastodon-file"
type = "mastodon"
instance = "https://mastodon.social"
accessTokenSource = "file://${secretFile}"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["mastodon-file"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      const resolvedConfig = await ConfigLoader.loadConfigWithSecrets(cliOptions);
      
      expect(resolvedConfig.accounts[0].accessToken).toBe('file-token-value');
      expect(resolvedConfig.accounts[0].accessTokenSource).toBeUndefined(); // Should be removed after resolution
    });

    it('should resolve multiple credential fields for Bluesky', async () => {
      process.env.TEST_BLUESKY_PASSWORD = 'env-password-value';
      const identifierFile = path.join(tempDir, 'bluesky-identifier.txt');
      fs.writeFileSync(identifierFile, 'file-identifier.bsky.social');
      
      const config = `
[[accounts]]
name = "bluesky-multi"
type = "bluesky"
identifierSource = "file://${identifierFile}"
password = "\${TEST_BLUESKY_PASSWORD}"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["bluesky-multi"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      const resolvedConfig = await ConfigLoader.loadConfigWithSecrets(cliOptions);
      
      expect(resolvedConfig.accounts[0].identifier).toBe('file-identifier.bsky.social');
      expect(resolvedConfig.accounts[0].password).toBe('env-password-value');
      expect(resolvedConfig.accounts[0].identifierSource).toBeUndefined(); // Should be removed
    });

    it('should preserve direct values that are not environment variables', async () => {
      const config = `
[[accounts]]
name = "mastodon-direct"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "vault://this-is-actually-my-token-not-a-reference"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["mastodon-direct"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      const resolvedConfig = await ConfigLoader.loadConfigWithSecrets(cliOptions);
      
      expect(resolvedConfig.accounts[0].accessToken).toBe('vault://this-is-actually-my-token-not-a-reference');
    });

    it('should throw error when secret resolution fails', async () => {
      const config = `
[[accounts]]
name = "mastodon-fail"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "\${UNDEFINED_ENV_VAR}"

[bot]
[[bot.providers]]
name = "test-provider"
type = "ping"
accounts = ["mastodon-fail"]
[bot.providers.config]
message = "test"

[logging]
level = "info"
`;
      fs.writeFileSync(configPath, config);
      
      const cliOptions: CliOptions = { config: configPath };
      
      await expect(ConfigLoader.loadConfigWithSecrets(cliOptions)).rejects.toThrow(
        'Failed to resolve secrets for account "mastodon-fail": Environment variable UNDEFINED_ENV_VAR is not set'
      );
    });
  });
});