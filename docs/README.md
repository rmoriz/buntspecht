# Buntspecht Documentation

Welcome to the Buntspecht documentation directory! This directory contains detailed documentation about various aspects of the project.

## 📚 Documentation Overview

### Core Features
- **[Automatic Secret Rotation](AUTOMATIC_SECRET_ROTATION.md)** - Comprehensive guide to automatic secret rotation detection and management
- **[Webhook Usage Examples](webhook-usage-examples.md)** - Comprehensive examples and patterns for webhook integration

### Development & Architecture
- **[Implementation Summary](IMPLEMENTATION_SUMMARY.md)** - Complete implementation details for automatic secret rotation detection
- **[Test Status Summary](TEST_STATUS_SUMMARY.md)** - Current test status and quality assurance information
- **[Migration to Bun](MIGRATION_TO_BUN.md)** - Documentation about the migration from Node.js to Bun runtime

### Project Management
- **[Release Process](RELEASE_PROCESS.md)** - Detailed guide for creating and managing releases
- **[Release Notes](RELEASE_NOTES.md)** - Latest release information and changelog
- **[Language Policy](LANGUAGE_POLICY.md)** - Guidelines for English-first development with German translation support

## 🚀 Quick Navigation

### For Users
- **Getting Started**: See the main [README.md](../README.md) in the project root
- **Configuration**: Check the [configuration examples](../examples/configuration/) directory
- **Webhooks**: Review [Webhook Usage Examples](webhook-usage-examples.md)
- **Secret Management**: Read [Automatic Secret Rotation](AUTOMATIC_SECRET_ROTATION.md)

### For Developers
- **Contributing**: Start with the [Language Policy](LANGUAGE_POLICY.md)
- **Testing**: Review [Test Status Summary](TEST_STATUS_SUMMARY.md)
- **Architecture**: Check [Implementation Summary](IMPLEMENTATION_SUMMARY.md)
- **Releases**: Follow the [Release Process](RELEASE_PROCESS.md)

### For System Administrators
- **Deployment**: See [Migration to Bun](MIGRATION_TO_BUN.md) for runtime information
- **Monitoring**: Review [Automatic Secret Rotation](AUTOMATIC_SECRET_ROTATION.md) for observability features

## 📖 Documentation Categories

### 🔐 Security & Secrets
- [Automatic Secret Rotation](AUTOMATIC_SECRET_ROTATION.md) - Zero-downtime credential management
- Configuration examples with external secret sources

### 🏗️ Architecture & Implementation
- [Implementation Summary](IMPLEMENTATION_SUMMARY.md) - Technical implementation details
- [Migration to Bun](MIGRATION_TO_BUN.md) - Runtime migration details

### 🧪 Quality Assurance
- [Test Status Summary](TEST_STATUS_SUMMARY.md) - Test coverage and quality metrics
- [Language Policy](LANGUAGE_POLICY.md) - Documentation standards and translation

### 🚀 Release Management
- [Release Process](RELEASE_PROCESS.md) - Automated and manual release workflows
- [Release Notes](RELEASE_NOTES.md) - Latest changes and improvements

## 🔗 Related Resources

### Main Documentation
- **[README.md](../README.md)** - Main project documentation (English)
- **[README.de.md](../README.de.md)** - German translation of main documentation

### Configuration Examples
Located in [examples/configuration/](../examples/configuration/):
- `config.example.toml` - Basic configuration
- `config.secret-rotation.example.toml` - Secret rotation configuration
- `config.multijson.example.toml` - Multi-JSON provider configuration
- `config.webhook.example.toml` - Webhook server configuration
- And more...

### Source Code
- **[src/](../src/)** - Main application source code
- **[examples/](../examples/)** - Usage examples and integrations
- **[scripts/](../scripts/)** - Build and maintenance scripts

## 🆘 Getting Help

1. **Check the documentation** - Most questions are answered in these docs
2. **Review configuration examples** - See the `config.*.example.toml` files
3. **Check test files** - Look at `src/__tests__/` for usage examples
4. **Open an issue** - Create a GitHub issue for bugs or feature requests

## 📝 Contributing to Documentation

When updating documentation:

1. **Follow the Language Policy** - English-first with German translation
2. **Update related docs** - Keep cross-references current
3. **Test examples** - Ensure all code examples work
4. **Update this index** - Add new documentation to this README

---

**Note**: This documentation covers Buntspecht's advanced features including OpenTelemetry observability and Bun's single binary compilation for optimal performance and deployment.