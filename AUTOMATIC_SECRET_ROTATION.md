# Automatic Secret Rotation Detection

## Overview

Buntspecht now includes **automatic secret rotation detection** that monitors external secret sources and automatically updates account credentials when secrets are rotated. This ensures the bot continues working seamlessly when secrets change in external systems like HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Google Cloud Secret Manager, or environment variables.

## Features

### 🔄 Automatic Detection
- **Periodic Monitoring**: Checks external secret sources every 15 minutes (configurable)
- **Multiple Sources**: Supports all external secret providers (Vault, AWS, Azure, GCP, files, env vars)
- **Real-time Updates**: Automatically updates account configurations when secrets change
- **Connection Testing**: Verifies new credentials work after rotation

### 📊 Monitoring & Observability
- **Status Tracking**: Monitor rotation detector status and statistics
- **Telemetry Integration**: OpenTelemetry metrics for rotation events
- **Detailed Logging**: Comprehensive logs for rotation events and errors
- **CLI Commands**: Check status and trigger manual rotations

### 🛡️ Reliability
- **Error Handling**: Graceful handling of secret resolution failures
- **Retry Logic**: Configurable retry attempts for failed operations
- **Account Isolation**: Failed rotations don't affect other accounts
- **Fallback Support**: Continues with existing credentials if rotation fails

## Configuration

Add the `[secretRotation]` section to your configuration:

```toml
[secretRotation]
enabled = true                          # Enable automatic secret rotation detection
checkInterval = "0 */15 * * * *"        # Check every 15 minutes (cron expression)
retryOnFailure = true                   # Retry failed secret checks
retryDelay = 60                         # Wait 60 seconds before retrying
maxRetries = 3                          # Maximum number of retries
notifyOnRotation = true                 # Log notifications when secrets are rotated
testConnectionOnRotation = true         # Test account connections after secret rotation
```

### Configuration Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `true` | Enable/disable secret rotation detection |
| `checkInterval` | `"0 */15 * * * *"` | Cron expression for check frequency |
| `retryOnFailure` | `true` | Retry failed secret resolution attempts |
| `retryDelay` | `60` | Seconds to wait before retrying |
| `maxRetries` | `3` | Maximum retry attempts |
| `notifyOnRotation` | `true` | Log rotation events |
| `testConnectionOnRotation` | `true` | Verify credentials after rotation |

## Supported Secret Sources

The rotation detector monitors these external secret sources:

### Environment Variables
```toml
accessToken = "${MASTODON_ACCESS_TOKEN}"
```

### File-based Secrets
```toml
accessTokenSource = "file:///path/to/secret"
```

### HashiCorp Vault
```toml
accessTokenSource = "vault://secret/mastodon-token"
passwordSource = "vault://secret/credentials?key=password"
```

### AWS Secrets Manager
```toml
accessTokenSource = "aws://buntspecht/mastodon-token"
passwordSource = "aws://buntspecht/credentials?key=password&region=us-east-1"
```

### Azure Key Vault
```toml
accessTokenSource = "azure://my-keyvault/mastodon-token"
passwordSource = "azure://my-keyvault/credentials?version=latest"
```

### Google Cloud Secret Manager
```toml
accessTokenSource = "gcp://my-project/mastodon-token"
passwordSource = "gcp://my-project/credentials?version=5"
```

## CLI Commands

### Check Status
```bash
buntspecht --secret-rotation-status
```

Shows the current status of the secret rotation detector including:
- Enabled/disabled state
- Running status
- Number of monitored secrets
- Check interval
- Last check time
- Total rotations detected

### List Monitored Secrets
```bash
buntspecht --list-monitored-secrets
```

Displays all external secrets being monitored:
- Account and field names
- Secret source URLs
- Check statistics
- Last rotation timestamps

### Manual Rotation Check
```bash
buntspecht --check-secret-rotations
```

Manually triggers a check for secret rotations and reports results.

## How It Works

### 1. Initialization
- Scans all account configurations for external secret sources
- Resolves initial secret values and stores them
- Creates monitoring metadata for each external secret

### 2. Periodic Monitoring
- Runs on configurable cron schedule (default: every 15 minutes)
- Resolves current values from external sources
- Compares with stored values to detect changes

### 3. Rotation Handling
When a secret rotation is detected:
1. **Update Configuration**: Updates account config with new secret value
2. **Reinitialize Client**: Creates new social media client with updated credentials
3. **Test Connection**: Verifies the new credentials work
4. **Log Event**: Records the rotation with timestamp
5. **Update Telemetry**: Increments rotation counters

### 4. Error Handling
- Failed secret resolutions are logged but don't stop other checks
- Account reinitialization failures are retried based on configuration
- Connection test failures are logged but don't revert the rotation

## Telemetry Metrics

The rotation detector provides these OpenTelemetry metrics:

- `secret_rotation_detector_started`: Detector startup events
- `secret_rotation_detector_stopped`: Detector shutdown events
- `secret_rotation_check_duration`: Time taken for rotation checks
- `secret_rotation_handled`: Successfully handled rotations
- `secret_rotation_handle_error`: Failed rotation handling attempts
- `secret_rotation_check_error`: Failed secret resolution attempts

## Example Configuration

See `config.secret-rotation.example.toml` for a complete example configuration with:
- Multiple accounts using different secret sources
- Full secret rotation configuration
- OpenTelemetry setup for monitoring

## Security Considerations

- **Secret Values**: Never logged or exposed in status outputs
- **Source URLs**: Only source URLs are shown in monitoring outputs
- **Access Control**: Inherits access controls from underlying secret systems
- **Audit Trail**: All rotation events are logged with timestamps

## Troubleshooting

### No Secrets Monitored
If `--secret-rotation-status` shows 0 monitored secrets:
- Check that accounts use external secret sources (not direct values)
- Verify secret sources use supported URL schemes
- Check logs for secret resolution errors during initialization

### Rotation Not Detected
If rotations aren't being detected:
- Verify the secret value actually changed in the external system
- Check the rotation detector is running (`--secret-rotation-status`)
- Review logs for secret resolution errors
- Try manual check with `--check-secret-rotations`

### Connection Failures After Rotation
If connections fail after rotation:
- Verify the new secret value is correct in the external system
- Check account configuration (instance URLs, etc.)
- Review social media platform API status
- Check network connectivity to social media platforms

## Implementation Details

The secret rotation detection is implemented in:
- `src/services/secretRotationDetector.ts` - Main rotation detector service
- `src/services/socialMediaClient.ts` - Account reinitialization methods
- `src/services/mastodonClient.ts` - Mastodon account reinitialization
- `src/services/blueskyClient.ts` - Bluesky account reinitialization
- `src/bot.ts` - Integration with main bot lifecycle
- `src/cli.ts` - CLI command definitions
- `src/index.ts` - CLI command handlers

The implementation uses:
- **node-cron** for scheduling periodic checks
- **Existing SecretResolver** for secret resolution
- **OpenTelemetry** for metrics and observability
- **Comprehensive error handling** for reliability