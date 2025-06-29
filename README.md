# Buntspecht

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Deutsch](https://img.shields.io/badge/lang-Deutsch-green.svg)](README.de.md)

<img src="buntspecht-logo.jpeg" alt="Buntspecht Logo" width="150"/>

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

- **Bun**: Version 1.2.0 or higher
- **Git**: For cloning the repository

```bash
# Check Bun version
bun --version
# Should show 1.2.0 or higher
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

### Configuration File Locations

Buntspecht searches for configuration files in the following order (first found wins):

1. `./config.toml` (current directory)
2. `~/.config/buntspecht/config.toml` (user config directory)
3. `/etc/buntspecht/config.toml` (system config directory)
4. Path specified via `BUNTSPECHT_CONFIG` environment variable

### Basic Configuration

Create a `config.toml` file based on the provided examples:

```bash
# Copy example configuration
cp config.example.toml config.toml
```

### Mastodon Access Token

To use Buntspecht, you need an access token for your Mastodon account:

1. Go to your Mastodon instance
2. Navigate to Settings → Development → New Application
3. Create a new application with the following permissions:
   - `write:statuses` (to post messages)
4. Copy the generated access token

### Configuration Examples

#### Simple Configuration (Single Account, Single Provider)

```toml
# Basic bot configuration
[bot]
name = "MyBot"
dry_run = false

# Mastodon account configuration
[[accounts]]
name = "main"
server = "https://mastodon.social"
access_token = "your-access-token-here"

# Message provider configuration
[[providers]]
name = "daily_messages"
type = "command"
command = "echo 'Hello World! Today is $(date)'"
schedule = "0 9 * * *"  # Daily at 9:00 AM
accounts = ["main"]
```

#### Advanced Configuration (Multiple Accounts, Multiple Providers)

```toml
# Advanced bot configuration
[bot]
name = "AdvancedBot"
dry_run = false

# Multiple Mastodon accounts
[[accounts]]
name = "main"
server = "https://mastodon.social"
access_token = "your-main-access-token"

[[accounts]]
name = "backup"
server = "https://fosstodon.org"
access_token = "your-backup-access-token"

# Static message provider
[[providers]]
name = "morning_greeting"
type = "static"
message = "Good morning! ☀️ Have a great day!"
schedule = "0 8 * * *"  # Daily at 8:00 AM
accounts = ["main"]

# Command-based provider
[[providers]]
name = "system_status"
type = "command"
command = "/usr/local/bin/get-system-status.sh"
schedule = "0 */6 * * *"  # Every 6 hours
accounts = ["main", "backup"]

# JSON template provider
[[providers]]
name = "weather_update"
type = "json"
command = "curl -s 'https://api.weather.com/current'"
template = "Current weather: {{weather.description}}, {{weather.temperature}}°C"
schedule = "0 12,18 * * *"  # Daily at 12:00 and 18:00
accounts = ["main"]
```

### Provider Types

#### 1. Static Provider

Posts predefined static messages.

```toml
[[providers]]
name = "static_example"
type = "static"
message = "This is a static message"
schedule = "0 9 * * *"
accounts = ["main"]
```

#### 2. Command Provider

Executes a command and posts its output.

```toml
[[providers]]
name = "command_example"
type = "command"
command = "fortune"
schedule = "0 12 * * *"
accounts = ["main"]
```

#### 3. JSON Provider

Executes a command that returns JSON and uses templates for formatting.

```toml
[[providers]]
name = "json_example"
type = "json"
command = "curl -s 'https://api.example.com/data'"
template = "Status: {{status}}, Value: {{data.value}}"
schedule = "0 */2 * * *"
accounts = ["main"]
```

**Template Variables:**
- `{{variable}}` - Simple variable from JSON
- `{{object.property}}` - Nested object property
- `{{array.0}}` - Array element access

#### 4. Ping Provider

Simple health check provider that posts a ping message.

```toml
[[providers]]
name = "ping_example"
type = "ping"
schedule = "0 0 * * *"  # Daily at midnight
accounts = ["main"]
```

### Schedule Format

Buntspecht uses cron syntax for scheduling:

```
┌───────────── minute (0 - 59)
│ ┌───────────── hour (0 - 23)
│ │ ┌───────────── day of month (1 - 31)
│ │ │ ┌───────────── month (1 - 12)
│ │ │ │ ┌───────────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

**Examples:**
- `0 9 * * *` - Daily at 9:00 AM
- `0 */6 * * *` - Every 6 hours
- `0 12 * * 1-5` - Weekdays at 12:00 PM
- `30 8 1 * *` - First day of month at 8:30 AM

## Usage

### Starting the Bot

#### Using Pre-compiled Binary

```bash
# Start with default config
./buntspecht-linux-x64

# Start with specific config file
BUNTSPECHT_CONFIG=/path/to/config.toml ./buntspecht-linux-x64

# Dry run mode (no actual posting)
./buntspecht-linux-x64 --dry-run
```

#### Using Bun

```bash
# Start with default config
bun run start

# Start with specific config file
BUNTSPECHT_CONFIG=/path/to/config.toml bun run start

# Development mode with auto-reload
bun run dev
```

### Command Line Options

```bash
# Show help
./buntspecht --help

# Show version
./buntspecht --version

# Dry run mode (test without posting)
./buntspecht --dry-run

# Verbose logging
./buntspecht --verbose

# Specify config file
./buntspecht --config /path/to/config.toml
```

### Docker Usage

#### Using Docker Compose (Recommended)

```bash
# Copy and edit configuration
cp config.example.toml config.toml
# Edit config.toml with your settings

# Start the bot
docker-compose up -d

# View logs
docker-compose logs -f

# Stop the bot
docker-compose down
```

#### Using Docker directly

```bash
# Build image
docker build -t buntspecht .

# Run container
docker run -d \
  --name buntspecht \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  buntspecht
```

## OpenTelemetry Integration

Buntspecht includes comprehensive OpenTelemetry support for monitoring and observability.

> **⚠️ Important Note for Single Binary Builds**: OpenTelemetry dependencies are excluded when creating single binaries with `bun build --compile` (`--external @opentelemetry/*`) as they are not available at runtime. Telemetry only works when running with `bun run` or `npm start`, NOT with pre-compiled binaries. For production environments with telemetry, use Docker or run the bot directly with Bun/Node.js.

### Configuration

Add telemetry configuration to your `config.toml`:

```toml
[telemetry]
enabled = true
service_name = "buntspecht"
service_version = "1.0.0"

# OTLP Exporter (e.g., for Jaeger, Grafana)
[telemetry.otlp]
endpoint = "http://localhost:4318"
headers = { "api-key" = "your-api-key" }

# Console Exporter (for development)
[telemetry.console]
enabled = true

# Prometheus Metrics
[telemetry.prometheus]
enabled = true
port = 9090
endpoint = "/metrics"
```

### Metrics

Buntspecht exports the following metrics:

- `buntspecht_messages_sent_total` - Total messages sent
- `buntspecht_messages_failed_total` - Total failed messages
- `buntspecht_provider_executions_total` - Provider execution count
- `buntspecht_provider_execution_duration` - Provider execution time

### Traces

Automatic tracing for:
- Provider executions
- Message posting
- Configuration loading
- Error handling

## Development

### Setup

```bash
# Clone repository
git clone <repository-url>
cd buntspecht

# Install dependencies
bun install

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Type checking
bun run type-check

# Linting
bun run lint

# Build
bun run build
```

### Testing

```bash
# Run all tests
bun test

# Run specific test file
bun test src/__tests__/bot.test.ts

# Run tests in watch mode
bun test --watch

# Generate coverage report
bun test --coverage
```

### Building Binaries

```bash
# Build for current platform
bun run build:binary

# Build for all platforms
bun run build:all-binaries

# Test all binaries
bun run test:binaries
```

> **⚠️ Note**: Binary builds exclude OpenTelemetry dependencies (`--external @opentelemetry/*`) for compatibility. Telemetry is automatically disabled in single binaries.

### Project Structure

```
src/
├── bot.ts                 # Main bot logic
├── cli.ts                 # Command line interface
├── index.ts               # Entry point
├── config/
│   └── configLoader.ts    # Configuration loading
├── messages/
│   ├── commandProvider.ts # Command message provider
│   ├── jsonCommandProvider.ts # JSON template provider
│   ├── messageProvider.ts # Base provider interface
│   ├── messageProviderFactory.ts # Provider factory
│   └── pingProvider.ts    # Ping provider
├── services/
│   ├── mastodonClient.ts  # Mastodon API client
│   ├── multiProviderScheduler.ts # Multi-provider scheduler
│   └── telemetry.ts       # OpenTelemetry setup
├── types/
│   └── config.ts          # TypeScript type definitions
└── utils/
    └── logger.ts          # Logging utilities
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Use TypeScript for all new code
- Follow ESLint configuration
- Write tests for new features
- Update documentation as needed

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

- 🐛 **Issues**: [GitHub Issues](../../issues)
- 💬 **Discussions**: [GitHub Discussions](../../discussions)
- 📧 **Email**: [your-email@example.com](mailto:your-email@example.com)

## AI-Assisted Development

This project was developed entirely with the assistance of **Claude 3.5 Sonnet (Anthropic)**. The AI solution supported:

### 🤖 **AI Technologies Used:**

- **Claude 3.5 Sonnet**: Main development, code generation, and architecture
- **Rovo Dev Agent**: Interactive development environment with tool integration

### 🛠️ **AI-Assisted Development Areas:**

- **Code Architecture**: Complete TypeScript project structure with provider system
- **Test Development**: 108+ comprehensive unit tests with Jest
- **Provider System**: Extensible message provider architecture
- **Command Integration**: External command execution with error handling
- **Docker Configuration**: Multi-stage builds and CI/CD pipeline
- **Documentation**: German localization and technical documentation
- **Best Practices**: ESLint rules, Git workflows, and project organization
- **Library Migration**: Complete migration from mastodon-api to masto.js
- **API Modernization**: Adaptation to modern TypeScript standards

### 💡 **Development Approach:**

Development was carried out through natural language requirements that were transformed by AI into functional, production-ready code. Modern development standards and best practices were automatically considered throughout the process.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for a list of changes and version history.