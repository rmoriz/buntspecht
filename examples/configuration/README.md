# Configuration Examples

This directory contains various configuration examples for Buntspecht, demonstrating different use cases and features.

## Basic Configuration

### `config.example.toml`
Basic configuration template with essential settings for getting started.

**Features:**
- Basic account setup (Mastodon/Bluesky)
- Simple message providers
- Logging configuration

### `config.multiprovider.example.toml`
Example showing multiple providers running simultaneously.

**Features:**
- Multiple message providers
- Different schedules
- Cross-platform posting

## Provider-Specific Examples

### `config.push.example.toml`
Push provider configuration for event-driven messaging.

**Features:**
- Push provider setup
- Webhook integration
- Rate limiting

### `config.multijson.example.toml`
Multi-JSON command provider for processing arrays of data.

**Features:**
- JSON array processing
- Deduplication
- Cache configuration

### `config.attachments.example.toml`
Configuration for posting with media attachments.

**Features:**
- Image/file attachments
- Base64 encoding
- Multi-platform media support

## Webhook Examples

### `config.webhook.example.toml`
Basic webhook server configuration.

**Features:**
- Webhook server setup
- Generic webhook endpoints
- Security configuration

### `config.webhook-provider-paths.example.toml`
Provider-specific webhook paths.

**Features:**
- Custom webhook paths per provider
- Provider routing
- Path-based authentication

### `config.webhook-templates.example.toml`
Template-based webhook processing.

**Features:**
- Dynamic templates
- Variable substitution
- Template inheritance

### `config.webhook-provider-secrets.example.toml`
Webhook security with provider-specific secrets.

**Features:**
- HMAC authentication
- Provider-specific secrets
- Security headers

### `config.webhook-refactored.example.toml`
Modern webhook configuration patterns.

**Features:**
- Clean configuration structure
- Best practices
- Scalable patterns

### `config.webhook-debug.example.toml`
Webhook debugging and development configuration.

**Features:**
- Debug logging
- Development helpers
- Testing utilities

## Security Examples

### `config.secrets.example.toml`
External secret management configuration.

**Features:**
- HashiCorp Vault integration
- AWS Secrets Manager
- Azure Key Vault
- Google Cloud Secret Manager

### `config.secret-rotation.example.toml`
Automatic secret rotation configuration.

**Features:**
- Secret rotation detection
- Automatic credential updates
- Rotation monitoring

## Platform-Specific Examples

### `config.bluesky.example.toml`
Bluesky-specific configuration and features.

**Features:**
- Bluesky account setup
- Rich text features
- URL embedding

## Monitoring Examples

### `config.telemetry.example.toml`
OpenTelemetry monitoring and observability.

**Features:**
- Metrics collection
- Distributed tracing
- Performance monitoring

## Real-World Examples

### `config.munich-bike-reports.toml`
Real-world example: Munich bike report monitoring.

**Features:**
- Multi-JSON processing
- Attachment handling
- Real data source integration

## Usage Instructions

1. **Choose a template**: Select the configuration that matches your use case
2. **Copy and rename**: `cp config.example.toml config.toml`
3. **Update credentials**: Add your API keys and tokens
4. **Customize settings**: Adjust schedules, templates, and providers
5. **Test configuration**: Run with `--dry-run` to validate

## Configuration Tips

### Account Setup
- Always use secure token storage
- Test connectivity before production
- Use different accounts for testing

### Provider Configuration
- Start with simple providers
- Add complexity gradually
- Monitor performance and logs

### Security
- Use external secret management
- Enable HMAC authentication for webhooks
- Rotate credentials regularly

### Performance
- Adjust cron schedules for your needs
- Use appropriate cache settings
- Monitor resource usage

## Related Documentation

- [Main Configuration Guide](../../README.md#configuration)
- [Provider Documentation](../../README.md#message-providers)
- [Security Best Practices](../../docs/)
- [Webhook Documentation](../../webhook-usage-examples.md)