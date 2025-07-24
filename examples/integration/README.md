# Integration Examples

This directory contains examples for integrating Buntspecht with external systems and services.

## Files

### `push-provider-example.js`
Example demonstrating how to use Buntspecht's push providers for event-driven messaging.

**Features:**
- Push provider configuration
- Event-driven message posting
- Error handling
- Rate limiting

**Usage:**
```bash
node push-provider-example.js
```

### `webhook-client.js`
Client example showing how to send webhooks to a Buntspecht instance.

**Features:**
- HTTP webhook requests
- JSON payload formatting
- Authentication handling
- Response processing

**Usage:**
```bash
node webhook-client.js
```

### `webhook-integration-example.js`
Complete webhook integration example with various use cases.

**Features:**
- Multiple webhook endpoints
- Template processing
- Attachment handling
- Provider-specific webhooks

**Usage:**
```bash
node webhook-integration-example.js
```

## Configuration

Before running these examples:

1. **Update endpoints**: Change URLs to match your Buntspecht instance
2. **Set credentials**: Add your API keys and tokens
3. **Configure providers**: Ensure your Buntspecht instance has the required providers
4. **Test connectivity**: Verify network access to your Buntspecht instance

## Common Issues

- **Connection refused**: Check if Buntspecht webhook server is running
- **Authentication errors**: Verify webhook secrets and API keys
- **Template errors**: Ensure JSON structure matches your templates
- **Rate limiting**: Respect rate limits configured in your providers

## Related Documentation

- [Webhook Server Documentation](../../README.md#webhook-server)
- [Push Providers](../../README.md#push-providers)
- [Configuration Examples](../../config.*.example.toml)