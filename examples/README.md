# Buntspecht Examples

This directory contains various examples and integrations for Buntspecht.

## Directory Structure

### `configuration/`
Contains TOML configuration examples for various use cases:

- **Basic configurations** - Getting started templates
- **Provider-specific examples** - Push, MultiJSON, attachments
- **Webhook configurations** - Various webhook setups and security
- **Security examples** - Secret management and rotation
- **Platform-specific** - Bluesky, Mastodon optimizations
- **Real-world examples** - Production-ready configurations

### `integration/`
Contains examples for integrating Buntspecht with external systems:

- **`push-provider-example.js`** - Example of using push providers for event-driven messaging
- **`webhook-client.js`** - Client example for sending webhooks to Buntspecht
- **`webhook-integration-example.js`** - Complete webhook integration example

## Usage

Each example includes detailed comments and usage instructions. Make sure to:

1. Install dependencies if required
2. Configure your Buntspecht instance
3. Update API endpoints and credentials
4. Test with your specific setup

## Contributing

When adding new examples:

1. Place them in the appropriate subdirectory
2. Include comprehensive comments
3. Add usage instructions
4. Update this README

## Support

For questions about these examples, please:

- Check the main [README](../README.md)
- Review the [documentation](../docs/)
- Open an issue on GitHub