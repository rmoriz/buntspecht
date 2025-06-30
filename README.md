# Buntspecht

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Deutsch](https://img.shields.io/badge/lang-Deutsch-green.svg)](README.de.md)

<img src="buntspecht-header.jpeg" alt="Buntspecht Header"/>

A TypeScript-based Mastodon/Fediverse bot that automatically posts messages on schedule. Supports various message sources like static texts or external commands.

## Features

- 🤖 Automatic scheduled message posting
- 📨 **Multiple message sources**: Static texts, external commands, or JSON-based templates
- 🔄 **Multi-provider support**: Multiple providers running in parallel with individual schedules
- 🌐 **Multi-account support**: Multiple Fediverse/Mastodon accounts with their own access tokens
- 📤 **Flexible account assignment**: Each provider can post to one or multiple accounts
- ⚙️ Flexible configuration via TOML files
- 🔍 Multiple configuration paths with priority order
- 📝 Comprehensive logging
- 🧪 Complete test coverage (108+ tests)
- 🐳 Docker support for CI/CD
- 🛡️ TypeScript for type safety
- 📡 Modern Mastodon API integration with masto.js
- 🔧 Extensible provider architecture
- 📊 **OpenTelemetry integration**: Monitoring, tracing, and metrics for observability
- ⚡ **Bun runtime**: Faster performance and native TypeScript support
- 📦 **Single binary**: Standalone executables for all platforms without dependencies

## Installation

### Prerequisites

- **Bun**: Version 1.2.17 or higher
- **Git**: For cloning the repository

```bash
# Check Bun version
bun --version
# Should show 1.2.17 or higher
```

### Installation

#### Option 1: Pre-compiled Binaries (Recommended)

Download the appropriate binary for your system from [GitHub Releases](../../releases):

- **Linux x64**: `buntspecht-linux-x64`
- **Linux ARM64**: `buntspecht-linux-arm64`
- **Linux ARMv8**: `buntspecht-linux-armv8`
- **macOS Intel**: `buntspecht-macos-x64`
- **macOS Apple Silicon**: `buntspecht-macos-arm64`

> **⚠️ Note**: Single binaries have OpenTelemetry dependencies excluded for technical compatibility reasons. For telemetry support, use Docker or run with `bun run`.

```bash
# Example for Linux x64
wget https://github.com/rmoriz/buntspecht/releases/latest/download/buntspecht-linux-x64
chmod +x buntspecht-linux-x64
./buntspecht-linux-x64 --help
```

#### Option 2: Compile from Source

```bash
# Clone repository
git clone <repository-url>
cd buntspecht

# Install dependencies
bun install

# Compile TypeScript
bun run build

# Optional: Create your own binary
bun run build:binary
```

## Configuration

The bot searches for configuration files in the following priority order:

1. **CLI Parameter**: `--config /path/to/config.toml`
2. **Environment Variable**: `BUNTSPECHT_CONFIG=/path/to/config.toml`
3. **Current Directory**: `./config.toml`
4. **Home Directory**: `~/.config/buntspecht/config.toml`

### Create Configuration File

```bash
# Copy example configuration
cp config.example.toml config.toml

# Edit configuration
nano config.toml
```

### Configuration Format

```toml
# Fediverse/Mastodon Accounts
[[accounts]]
name = "main-account"
instance = "https://mastodon.social"
accessToken = "your-access-token-here"

[bot]
# Multi-Provider Configuration
# Each provider can have its own schedule and configuration
# Each provider can post to one or multiple accounts

# Provider 1: Hourly ping messages
[[bot.providers]]
name = "hourly-ping"
type = "ping"
cronSchedule = "0 * * * *"  # Every hour
enabled = true
accounts = ["main-account"]  # Which accounts to post to

[bot.providers.config]
message = "🤖 Hourly ping from Buntspecht!"

# Provider 2: Daily system statistics (disabled)
[[bot.providers]]
name = "daily-stats"
type = "command"
cronSchedule = "0 9 * * *"  # Every day at 9:00 AM
enabled = false
accounts = ["main-account"]  # Which accounts to post to

[bot.providers.config]
command = "uptime"
timeout = 10000

[logging]
# Log level: debug, info, warn, error
level = "info"
```

### Get Access Token

1. Go to your Mastodon instance
2. Settings → Development → New Application
3. Name: "Buntspecht Bot" (or any name)
4. Scopes: `write:statuses`
5. Create application and copy access token

## Message Providers

Buntspecht supports various message sources through an extensible provider system. Each provider runs independently with its own schedule and can be individually enabled/disabled.

### Ping Provider

Posts static messages:

```toml
[[bot.providers]]
name = "ping-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true

[bot.providers.config]
message = "PING"
```

### Command Provider

Executes external commands and posts their output:

```toml
[[bot.providers]]
name = "command-provider"
type = "command"
cronSchedule = "0 * * * *"
enabled = true

[bot.providers.config]
# The command to execute (required)
command = "date '+Today is %A, %B %d, %Y at %H:%M UTC'"

# Optional: Timeout in milliseconds (default: 30000)
timeout = 10000

# Optional: Working directory for the command
# cwd = "/path/to/working/directory"

# Optional: Maximum buffer size for stdout/stderr (default: 1MB)
# maxBuffer = 1048576

# Optional: Environment variables
# [bot.providers.config.env]
# MY_VAR = "a value"
# OTHER_VAR = "another value"
```

#### Command Provider Examples

```toml
# Current date and time
command = "date '+Today is %A, %B %d, %Y at %H:%M UTC'"

# System status
command = "uptime"

# Weather (with curl and API)
command = "curl -s 'https://wttr.in/Berlin?format=3'"

# Random quote
command = "fortune"

# Git status
command = "git log --oneline -1"
```

### JSON Command Provider

Executes external commands that output JSON and applies templates with variables from the JSON data:

```toml
[[bot.providers]]
name = "json-provider"
type = "jsoncommand"
cronSchedule = "0 */6 * * *"  # Every 6 hours
enabled = true

[bot.providers.config]
# The command to execute (required) - must output JSON
command = "curl -s 'https://api.github.com/repos/octocat/Hello-World' | jq '{name: .name, stars: .stargazers_count, language: .language}'"

# Template for the message (required)
# Use {{variable}} for JSON properties
# Supports nested properties with dot notation: {{user.name}}
template = "📊 Repository {{name}} has {{stars}} stars! Programming language: {{language}}"

# Optional: Timeout in milliseconds (default: 30000)
timeout = 10000

# Optional: Working directory for the command
# cwd = "/path/to/working/directory"

# Optional: Maximum buffer size for stdout/stderr (default: 1MB)
# maxBuffer = 1048576

# Optional: Environment variables
# [bot.providers.config.env]
# API_KEY = "your-api-key"
```

#### JSON Command Provider Examples

```toml
# GitHub repository statistics
command = "curl -s 'https://api.github.com/repos/octocat/Hello-World' | jq '{name: .name, stars: .stargazers_count, forks: .forks_count}'"
template = "📊 {{name}}: {{stars}} ⭐ and {{forks}} 🍴"

# Weather API with JSON
command = "curl -s 'https://api.openweathermap.org/data/2.5/weather?q=Berlin&appid=YOUR_API_KEY&units=metric' | jq '{temp: .main.temp, desc: .weather[0].description, city: .name}'"
template = "🌤️ Weather in {{city}}: {{temp}}°C, {{desc}}"

# System information as JSON
command = "echo '{\"hostname\": \"'$(hostname)'\", \"uptime\": \"'$(uptime -p)'\", \"load\": \"'$(uptime | awk -F\"load average:\" \"{print $2}\" | xargs)'\"}''"
template = "🖥️ Server {{hostname}} running since {{uptime}}. Load: {{load}}"

# Nested JSON properties
command = "curl -s 'https://api.example.com/user/123' | jq '{user: {name: .name, email: .email}, stats: {posts: .post_count}}'"
template = "👤 User {{user.name}} ({{user.email}}) has {{stats.posts}} posts"
```

#### Template Syntax

- `{{variable}}` - Simple variable from JSON
- `{{nested.property}}` - Nested property with dot notation
- `{{ variable }}` - Whitespace around variable names is ignored
- Missing variables are left as `{{variable}}` in the text
- JSON values are automatically converted to strings

## Multi-Account and Multi-Provider Configuration

Buntspecht supports multiple Fediverse/Mastodon accounts with their own access tokens as well as simultaneous execution of multiple providers with individual schedules. This allows posting different types of messages at different times to different accounts.

### Multi-Account Configuration

First, configure multiple accounts:

```toml
# Multiple Fediverse/Mastodon accounts
[[accounts]]
name = "main-account"
instance = "https://mastodon.social"
accessToken = "your-main-account-token-here"

[[accounts]]
name = "backup-account"
instance = "https://fosstodon.org"
accessToken = "your-backup-account-token-here"

[[accounts]]
name = "work-account"
instance = "https://your-company-instance.com"
accessToken = "your-work-token-here"
```

### Multi-Provider Configuration with Account Assignment

Then configure providers and assign them to accounts:

```toml
[bot]
# Multi-Provider Configuration
# Each provider can have its own schedule and configuration
# Each provider can post to one or multiple accounts

# Provider 1: Hourly ping messages (to all accounts)
[[bot.providers]]
name = "hourly-ping"
type = "ping"
cronSchedule = "0 * * * *"  # Every hour
enabled = true
accounts = ["main-account", "backup-account", "work-account"]  # To all accounts

[bot.providers.config]
message = "🤖 Hourly ping from Buntspecht!"

# Provider 2: Daily system statistics (only to main account)
[[bot.providers]]
name = "daily-stats"
type = "command"
cronSchedule = "0 9 * * *"  # Every day at 9:00 AM
enabled = true
accounts = ["main-account"]  # Only to main account

[bot.providers.config]
command = "uptime"
timeout = 10000

# Provider 3: GitHub repository updates (to main and backup account)
[[bot.providers]]
name = "github-stats"
type = "jsoncommand"
cronSchedule = "0 */6 * * *"  # Every 6 hours
enabled = true
accounts = ["main-account", "backup-account"]  # To two accounts

[bot.providers.config]
command = "curl -s 'https://api.github.com/repos/octocat/Hello-World' | jq '{name: .name, stars: .stargazers_count}'"
template = "📊 Repository {{name}} has {{stars}} stars!"

# Provider 4: Work updates (only to work account)
[[bot.providers]]
name = "work-updates"
type = "ping"
cronSchedule = "0 10 * * 1"  # Every Monday at 10:00 AM
enabled = true
accounts = ["work-account"]  # Only to work account

[bot.providers.config]
message = "📅 New work week begins!"
```

### Advantages of Multi-Account and Multi-Provider Configuration

- **Flexible account assignment**: Each provider can post to any accounts
- **Robust error handling**: If posting to one account fails, others are still attempted
- **Independent schedules**: Each provider can run at different times
- **Individual activation**: Providers can be individually enabled/disabled
- **Different message types**: Mix static messages, commands, and JSON templates
- **Error tolerance**: Errors in one provider don't affect other providers
- **Flexible configuration**: Each provider can have its own environment variables and settings
- **Account separation**: Different content can be sent to different audiences

### Cron Schedule Examples

```
"0 * * * *"       = every hour
"*/30 * * * *"    = every 30 minutes  
"0 9 * * *"       = every day at 9:00 AM
"0 9 * * 1"       = every Monday at 9:00 AM
"0 */6 * * *"     = every 6 hours
"0 9,17 * * 1-5"  = Mon-Fri at 9:00 AM and 5:00 PM
"*/15 9-17 * * 1-5" = every 15 min between 9-17, Mon-Fri
```

## Usage

### Start Bot

```bash
# With default configuration
bun start

# With specific configuration file
bun start --config /path/to/config.toml

# Development mode (direct TypeScript execution)
bun run dev
```

### CLI Options

```bash
# Show help
bun start --help

# Test connection
bun start --verify

# Post a test message immediately (all providers)
bun start --test-post

# Post test message from specific provider
bun start --test-provider provider-name

# List all configured providers
bun start --list-providers

# Use specific configuration file
bun start --config /path/to/config.toml
```

## Telemetry and Monitoring

Buntspecht supports OpenTelemetry for comprehensive monitoring, tracing, and metrics. This allows monitoring and analyzing the performance and behavior of the bot.

> **⚠️ Important Note for Single Binary Builds**: OpenTelemetry dependencies are excluded when creating single binaries with `bun build --compile` (`--external @opentelemetry/*`) as they are not available at runtime. Telemetry only works when running with `bun run` or `npm start`, not with pre-compiled binaries. For production environments with telemetry, use Docker or run the bot directly with Bun/Node.js.

### Telemetry Configuration

```toml
[telemetry]
# Enable/disable OpenTelemetry
enabled = true
serviceName = "buntspecht"
serviceVersion = "0.4.0"

[telemetry.jaeger]
# Jaeger for Distributed Tracing
enabled = true
endpoint = "http://localhost:14268/api/traces"

[telemetry.prometheus]
# Prometheus for metrics
enabled = true
port = 9090
endpoint = "/metrics"

[telemetry.tracing]
# Enable tracing
enabled = true

[telemetry.metrics]
# Enable metrics
enabled = true
```

### Available Metrics

- **`buntspecht_posts_total`**: Number of successfully sent posts (with labels: account, provider)
- **`buntspecht_errors_total`**: Number of errors (with labels: error_type, provider, account)
- **`buntspecht_provider_execution_duration_seconds`**: Provider execution time (with label: provider)
- **`buntspecht_active_connections`**: Number of active Mastodon connections

### Available Traces

- **`mastodon.post_status`**: Mastodon post operations with attributes like:
  - `mastodon.accounts_count`: Number of target accounts
  - `mastodon.provider`: Provider name
  - `mastodon.message_length`: Message length

- **`provider.execute_task`**: Provider executions with attributes like:
  - `provider.name`: Provider name
  - `provider.type`: Provider type
  - `provider.accounts`: List of target accounts

### Monitoring Setup

#### Jaeger (Distributed Tracing)

```bash
# Start Jaeger with Docker
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest

# Open Jaeger UI
open http://localhost:16686
```

#### Prometheus (Metrics)

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'buntspecht'
    static_configs:
      - targets: ['localhost:9090']
```

```bash
# Start Prometheus with Docker
docker run -d --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Fetch metrics directly
curl http://localhost:9090/metrics
```

#### Grafana Dashboard

Example queries for Grafana:

```promql
# Posts per minute
rate(buntspecht_posts_total[1m])

# Error rate
rate(buntspecht_errors_total[5m])

# 95th percentile of provider execution time
histogram_quantile(0.95, buntspecht_provider_execution_duration_seconds)

# Active connections
buntspecht_active_connections
```

### Telemetry Example Configuration

For a complete telemetry configuration see `config.telemetry.example.toml`.

### Cron Schedule Examples

```toml
# Every hour
cronSchedule = "0 * * * *"

# Every 30 minutes
cronSchedule = "*/30 * * * *"

# Daily at 9:00 AM
cronSchedule = "0 9 * * *"

# Every Monday at 9:00 AM
cronSchedule = "0 9 * * 1"

# Every 15 minutes between 9-17, Mon-Fri
cronSchedule = "*/15 9-17 * * 1-5"
```

## Technologies

### Core Dependencies

- **[masto.js](https://github.com/neet/masto.js)** (v6.8.0): Modern TypeScript library for Mastodon API
- **[node-cron](https://github.com/node-cron/node-cron)** (v3.0.3): Cron job scheduling
- **[toml](https://github.com/BinaryMuse/toml-node)** (v3.0.0): TOML configuration files
- **[commander](https://github.com/tj/commander.js)** (v11.1.0): CLI argument parsing

### Telemetry & Monitoring

- **[@opentelemetry/sdk-node](https://github.com/open-telemetry/opentelemetry-js)** (v0.202.0): OpenTelemetry Node.js SDK
- **[@opentelemetry/auto-instrumentations-node](https://github.com/open-telemetry/opentelemetry-js-contrib)** (v0.60.1): Automatic instrumentation
- **[@opentelemetry/exporter-jaeger](https://github.com/open-telemetry/opentelemetry-js)** (v2.0.1): Jaeger exporter for tracing
- **[@opentelemetry/exporter-prometheus](https://github.com/open-telemetry/opentelemetry-js)** (v0.202.0): Prometheus exporter for metrics

### Development Tools

- **TypeScript** (v5.3.2): Static typing
- **Jest** (v29.7.0): Test framework with 77+ tests
- **ESLint** (v8.54.0): Code quality and linting
- **Docker**: Containerization and CI/CD

### Migration History

**2025-06**: Migration from Node.js to Bun
- **Runtime**: Switch from Node.js to Bun v1.2+ for better performance
- **Build System**: TypeScript compilation with Bun support
- **Docker**: Optimized containers with oven/bun:1.2-alpine base image
- **Tools**: Additional container tools (curl, ping, uptime, jq)
- **Compatibility**: Full backward compatibility of all features

**2025-06**: Migration from `mastodon-api` to `masto.js`
- **Reason**: Better TypeScript support and active development
- **Benefits**: Native types, structured v1/v2 API, modern architecture
- **Compatibility**: All tests and functionality fully maintained
- **Breaking Changes**: None for end users - only internal API changes

## Development

### Run Tests

```bash
# All tests (with Jest for compatibility)
bun run test

# Tests with watch mode
bun run test:watch

# Test coverage
bun run test:coverage

# Alternative: Native Bun tests (experimental)
bun run test:bun
```

### Code Quality

```bash
# Linting
bun run lint

# Linting with auto-fix
bun run lint:fix
```

### Binary Builds

```bash
# Create local binary
bun run build:binary

# All platforms (cross-compilation)
bun run build:binaries

# Specific platform
bun run build:binary:linux-x64
bun run build:binary:linux-arm64
bun run build:binary:macos-x64
bun run build:binary:macos-arm64
```

**Note**: Binary builds contain no OpenTelemetry support due to compatibility issues. Telemetry is automatically disabled.

#### Build Scripts

```bash
# Create all binaries with one command
./scripts/build-all-binaries.sh

# Test all binaries
./scripts/test-binaries.sh
```

### Release Management

```bash
# Local build and test (no release)
bun run release:local

# Create releases
bun run release:patch    # Bug fixes (1.0.0 → 1.0.1)
bun run release:minor    # New features (1.0.0 → 1.1.0)
bun run release:major    # Breaking changes (1.0.0 → 2.0.0)

# Manual release script with options
./scripts/release.sh --type patch --prerelease
./scripts/release.sh --type minor --draft
```

**Tag-based Releases**: Releases are triggered by pushing version tags (e.g., `v1.0.0`)

See [RELEASE_PROCESS.md](RELEASE_PROCESS.md) for detailed release documentation.

### Project Structure

```
src/
├── __tests__/          # Test files (77+ tests)
├── config/             # Configuration
│   └── configLoader.ts
├── messages/           # Message Provider System
│   ├── messageProvider.ts
│   ├── messageProviderFactory.ts
│   ├── pingProvider.ts
│   ├── commandProvider.ts
│   └── index.ts
├── services/           # Main services
│   ├── mastodonClient.ts
│   └── botScheduler.ts
├── types/              # TypeScript types
│   └── config.ts
├── utils/              # Utility functions
│   └── logger.ts
├── bot.ts              # Main bot class
├── cli.ts              # CLI argument parser
└── index.ts            # Entry point
```

## Docker

### Build Image

```bash
docker build -t buntspecht .
```

### Run Container

```bash
# With volume for configuration
docker run -d \
  --name ping-bot \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  buntspecht

# With environment variable
docker run -d \
  --name ping-bot \
  -e BUNTSPECHT_CONFIG=/app/config.toml \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  buntspecht
```

### Docker Compose

```yaml
services:
  buntspecht:
    build: .
    container_name: ping-bot
    volumes:
      - ./config.toml:/app/config.toml:ro
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

## CI/CD

The Dockerfile is optimized for CI/CD pipelines:

- Multi-stage build for smaller images
- Non-root user for security
- Health checks
- Proper layer caching

### GitHub Actions Example

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: "1.2"
      - run: bun install --frozen-lockfile
      - run: bun run test
      - run: bun run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t buntspecht .
```

## Troubleshooting

### Common Problems

1. **"No configuration file found"**

   - Make sure a `config.toml` exists
   - Check the paths in the priority order

2. **"Failed to connect to Mastodon"**

   - Check the `instance` URL
   - Validate the `accessToken`
   - Test with `--verify`

3. **"Invalid cron schedule"**
   - Use the standard format: "Minute Hour Day Month Weekday"
   - Test your cron expression online

### Debugging

```bash
# Enable debug logs
# In config.toml:
[logging]
level = "debug"

# Or via environment:
DEBUG=* bun start
```

## License

MIT License - see LICENSE file for details.

## Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push branch (`git push origin feature/amazing-feature`)
5. Create pull request

## Support

For problems or questions:

1. Check the [Issues](../../issues)
2. Create a new issue with detailed description
3. Add logs and configuration (without secrets!)

## AI-Assisted Development

This project was developed entirely with the assistance of **Claude 3.5 Sonnet (Anthropic)**. The AI solution supported:

### 🤖 **AI Technologies Used:**

- **Claude 3.5 Sonnet**: Main development, code generation, and architecture
- **Rovo Dev Agent**: Interactive development environment with tool integration

### 🛠️ **AI-Assisted Development Areas:**

- **Code Architecture**: Complete TypeScript project structure with provider system
- **Test Development**: 77+ comprehensive unit tests with Jest
- **Provider System**: Extensible message provider architecture
- **Command Integration**: External command execution with error handling
- **Docker Configuration**: Multi-stage builds and CI/CD pipeline
- **Documentation**: German localization and technical documentation
- **Best Practices**: ESLint rules, Git workflows, and project organization
- **Library Migration**: Complete migration from mastodon-api to masto.js
- **API Modernization**: Adaptation to modern TypeScript standards

### 💡 **Development Approach:**

Development was carried out through natural language requirements that were transformed by the AI into functional, production-ready code. Modern development standards and best practices were automatically considered throughout the process.

---

**Buntspecht** - A reliable Fediverse bot for automated messages with flexible sources 🐦
