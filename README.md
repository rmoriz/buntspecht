# Buntspecht

*Pronounced: "BOONT-shpekht" (German for "Great Spotted Woodpecker")*

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Deutsch](https://img.shields.io/badge/lang-Deutsch-green.svg)](README.de.md)

<img src="buntspecht-header.jpeg" alt="Buntspecht Header"/>

A TypeScript-based Mastodon/Fediverse bot that automatically posts messages on schedule. Supports various message sources like static texts or external commands.

## Features

- 🤖 Automatic scheduled message posting
- 📨 **Multiple message sources**: Static texts, external commands, JSON-based templates, or push notifications
- 🔄 **Multi-provider support**: Multiple providers running in parallel with individual schedules
- 🔔 **Push providers**: Event-driven messaging for webhooks, alerts, and external integrations
- 🌐 **Multi-account support**: Multiple Fediverse/Mastodon accounts with their own access tokens
- 📤 **Flexible account assignment**: Each provider can post to one or multiple accounts
- 👁️ **Visibility control**: Configurable message visibility (public, unlisted, private, direct) per account, provider, or webhook request
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
git clone https://github.com/rmoriz/buntspecht
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

### Multi JSON Command Provider

Executes external commands that output JSON arrays and processes each object as a separate message. Perfect for RSS feeds, API endpoints returning multiple items, or any data source with multiple entries. Features intelligent caching to prevent duplicate messages. Each cron execution processes one new item from the array, with timing controlled by the cron schedule.

```toml
[[bot.providers]]
name = "rss-feed"
type = "multijsoncommand"
cronSchedule = "*/15 * * * *"  # Every 15 minutes
enabled = true
accounts = ["main-account"]

[bot.providers.config]
# Command that outputs JSON array (required)
command = "curl -s 'https://feeds.example.com/news.json' | jq '[.items[] | {id: .id, title: .title, url: .url, published: .published}]'"

# Template for each message (required)
template = "📰 {{title}}\n🔗 {{url}}\n📅 {{published}}"

# Unique identifier field (default: "id")
uniqueKey = "id"

# DEPRECATED: throttleDelay is no longer used - use cronSchedule instead for timing
# The cron schedule above controls when new messages are posted
# throttleDelay = 2000

# Cache configuration (optional)
[bot.providers.config.cache]
enabled = true                              # Enable caching (default: true)
ttl = 1209600000                            # 14 days in milliseconds (default)
maxSize = 10000                             # Maximum cache entries (default)
filePath = "./cache/rss-feed-cache.json"    # Cache file path (default: ./cache/multijson-cache.json)
```

#### Key Features

- **🔄 Array Processing**: Handles JSON arrays with multiple objects
- **🚫 Duplicate Prevention**: Intelligent caching prevents reposting the same content
- **⏱️ Throttling**: Configurable delays between messages to avoid flooding
- **💾 Persistent Cache**: 14-day cache survives application restarts
- **🔑 Account-Aware**: Cache keys include provider name for multi-account support
- **⚙️ Flexible Configuration**: Customizable unique keys, TTL, and cache paths

#### Multi JSON Command Examples

```toml
# RSS/News Feed Processing
command = "curl -s 'https://api.example.com/news' | jq '[.articles[] | {id: .id, title: .title, summary: .summary, url: .link}]'"
template = "📰 {{title}}\n\n{{summary}}\n\n🔗 Read more: {{url}}"
uniqueKey = "id"
# DEPRECATED: Use cronSchedule for timing instead
# throttleDelay = 3000

# GitHub Releases Monitor
command = "curl -s 'https://api.github.com/repos/owner/repo/releases' | jq '[.[] | {id: .id, name: .name, tag: .tag_name, url: .html_url}] | .[0:3]'"
template = "🚀 New release: {{name}} ({{tag}})\n🔗 {{url}}"
uniqueKey = "id"

# Social Media Monitoring
command = "python3 fetch_mentions.py --format=json"  # Custom script returning JSON array
template = "💬 New mention: {{text}}\n👤 By: {{author}}\n🔗 {{url}}"
uniqueKey = "mention_id"

# System Alerts (Multiple Services)
command = "curl -s 'http://monitoring.local/api/alerts' | jq '[.alerts[] | select(.status == \"firing\") | {id: .id, service: .labels.service, message: .annotations.summary}]'"
template = "🚨 Alert: {{service}}\n{{message}}"
uniqueKey = "id"
# DEPRECATED: Use cronSchedule for timing instead  
# throttleDelay = 5000

# E-commerce Product Updates
command = "curl -s 'https://api.shop.com/products/new' | jq '[.products[] | {sku: .sku, name: .name, price: .price, category: .category}]'"
template = "🛍️ New Product: {{name}}\n💰 Price: ${{price}}\n📂 Category: {{category}}"
uniqueKey = "sku"
```

#### How It Works

The MultiJSONCommand provider processes one item per execution:

1. **First execution**: Processes the first unprocessed item from the JSON array
2. **Subsequent executions**: Processes the next unprocessed item (previous items are cached)
3. **When all items are processed**: Returns empty (no message posted) until new items appear
4. **Timing**: Controlled by the `cronSchedule` - each cron execution processes one item

#### Cache Configuration

The cache system prevents duplicate messages and persists across application restarts:

```toml
[bot.providers.config.cache]
# Enable/disable caching
enabled = true

# Time-to-live in milliseconds (default: 14 days)
ttl = 1209600000

# Maximum number of cached entries
maxSize = 10000

# Custom cache file path
filePath = "./cache/my-provider-cache.json"
```

**Cache Key Format**: `{providerName}:{uniqueKeyValue}`

This ensures that:
- Same content can be posted to different accounts without conflicts
- Each provider maintains its own cache namespace
- Cache entries are properly isolated between providers

#### Error Handling

- **Invalid JSON**: Logs error and skips processing
- **Missing Unique Key**: Validates all objects have the required unique field
- **Duplicate Keys**: Detects and reports duplicate unique keys in the same array
- **Command Failures**: Graceful error handling with detailed logging
- **Cache Errors**: Cache failures don't interrupt message processing

### Push Provider

Reacts to external events instead of cron schedules. Push providers are triggered programmatically and can accept custom messages:

```toml
[[bot.providers]]
name = "alert-system"
type = "push"
# No cronSchedule needed for push providers
enabled = true
accounts = ["main-account"]

[bot.providers.config]
# Default message when no custom message is provided
defaultMessage = "Alert from monitoring system"

# Whether to allow custom messages (default: true)
allowExternalMessages = true

# Maximum message length (default: 500)
maxMessageLength = 280

# Rate limiting (default: 1 message per 60 seconds)
rateLimitMessages = 3  # Allow 3 messages per time window
rateLimitWindowSeconds = 300  # 5-minute time window
```

#### Push Provider Configuration Options

- `defaultMessage` - Message to use when no custom message is provided
- `allowExternalMessages` - Whether to accept custom messages (default: true)
- `maxMessageLength` - Maximum length for messages (default: 500)
- `webhookSecret` - Optional provider-specific webhook secret (overrides global webhook secret)
- `rateLimitMessages` - Number of messages allowed per time window (default: 1)
- `rateLimitWindowSeconds` - Time window for rate limiting in seconds (default: 60)

#### Triggering Push Providers

Push providers can be triggered via CLI or programmatically:

```bash
# List all push providers
bun start --list-push-providers

# Trigger with default message
bun start --trigger-push alert-system

# Trigger with custom message
bun start --trigger-push alert-system --trigger-push-message "Critical alert: Server down!"
```

#### Rate Limiting

Push providers include built-in rate limiting to prevent spam and abuse:

- **Default Limit**: 1 message per 60 seconds
- **Configurable**: Customize both message count and time window per provider
- **Automatic Enforcement**: Rate limits are checked before sending messages
- **Graceful Handling**: Rate-limited requests return HTTP 429 with retry information

**Rate Limiting Examples:**
```toml
# Conservative: 1 message per 5 minutes
rateLimitMessages = 1
rateLimitWindowSeconds = 300

# Moderate: 5 messages per hour
rateLimitMessages = 5
rateLimitWindowSeconds = 3600

# Permissive: 10 messages per 10 minutes
rateLimitMessages = 10
rateLimitWindowSeconds = 600
```

**CLI Rate Limit Monitoring:**
```bash
# Check rate limit status for a provider
bun start --push-provider-status alert-system

# Output shows current usage and time until reset
# Rate Limit: 3 message(s) per 300 seconds
# Current Usage: 1/3 messages
# Status: Available (2 message(s) remaining)
```

#### Use Cases for Push Providers

- **Webhook notifications**: Respond to external webhook calls
- **Alert systems**: Trigger alerts based on monitoring conditions
- **Manual announcements**: Send ad-hoc messages when needed
- **Event-driven notifications**: React to external events
- **Integration with external systems**: Connect with monitoring, CI/CD, etc.

#### Example Integration

```javascript
// Example webhook handler
async function handleWebhook(req, res) {
  const { message, severity } = req.body;
  
  // Choose provider based on severity
  const providerName = severity === 'critical' ? 'alert-system' : 'announcements';
  
  await bot.triggerPushProvider(providerName, message);
  res.json({ success: true });
}
```

## Webhook Integration

Buntspecht includes a built-in webhook server that allows external systems to trigger push providers via HTTP requests. This enables real-time notifications from monitoring systems, CI/CD pipelines, GitHub, and other services.

### Webhook Configuration

```toml
[webhook]
# Enable webhook server
enabled = true
port = 3000
host = "0.0.0.0"  # Listen on all interfaces
path = "/webhook"  # Webhook endpoint path

# Security settings
secret = "your-webhook-secret-here"  # Required: Global webhook secret for authentication
allowedIPs = [  # Optional: IP whitelist
  "127.0.0.1",
  "192.168.1.0/24",
  "10.0.0.0/8"
]

# Performance settings
maxPayloadSize = 1048576  # 1MB max payload size
timeout = 30000  # 30 seconds timeout
```

### Webhook API

**Endpoint:** `POST /webhook`

**Headers:**
- `Content-Type: application/json`
- `X-Webhook-Secret: your-secret` (if secret is configured)

**Request Body:**
```json
{
  "provider": "push-provider-name",
  "message": "Custom message to post",
  "metadata": {
    "key": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Successfully triggered push provider \"provider-name\"",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "provider": "provider-name"
}
```

### Webhook Examples

#### Basic Webhook Call
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-webhook-secret-here" \
  -d '{"provider": "webhook-alerts", "message": "Test alert message"}'
```

#### GitHub Webhook Integration
Configure GitHub webhook URL: `http://your-server:3000/webhook`

```json
{
  "provider": "cicd-notifications",
  "message": "🚀 New release v1.2.3 published",
  "metadata": {
    "repository": "user/repo",
    "tag": "v1.2.3"
  }
}
```

#### Monitoring System Integration
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret" \
  -d '{
    "provider": "monitoring-critical",
    "message": "🔴 CRITICAL: CPU usage > 90% on server-01"
  }'
```

#### CI/CD Pipeline Integration
```json
{
  "provider": "cicd-notifications", 
  "message": "✅ Deployment to production completed successfully",
  "metadata": {
    "environment": "production",
    "version": "1.2.3",
    "duration": "2m 30s"
  }
}
```

### Webhook Security

- **Authentication**: Webhook secrets are required for security
  - **Global Secret**: A global webhook secret in `[webhook]` section is mandatory when webhooks are enabled
  - **Provider-Specific Secrets**: Each push provider can have its own `webhookSecret` that overrides the global secret
  - **Secret Priority**: Provider-specific secret > Global secret (no fallback to unauthenticated requests)
- **IP Whitelisting**: Restrict access to trusted IP ranges
- **HTTPS**: Always use HTTPS in production environments
- **Rate Limiting**: Consider implementing rate limiting at the reverse proxy level
- **Payload Validation**: All requests are validated for proper JSON format and required fields

#### Provider-Specific Webhook Secrets

Each push provider can have its own webhook secret for enhanced security isolation:

```toml
# Provider with specific webhook secret
[[bot.providers]]
name = "monitoring-alerts"
type = "push"
enabled = true
accounts = ["alerts-account"]

[bot.providers.config]
defaultMessage = "Monitoring alert"
allowExternalMessages = true
maxMessageLength = 500
webhookSecret = "monitoring-specific-secret-123"  # Provider-specific secret
```

**Benefits of Provider-Specific Secrets:**
- **Security Isolation**: Different external systems can use different secrets
- **Granular Access Control**: Compromised secret only affects one provider
- **Easier Secret Rotation**: Rotate secrets for specific integrations without affecting others
- **Better Audit Trail**: Track webhook sources more precisely

### Integration Examples

The `examples/` directory contains comprehensive webhook integration examples:

- `webhook-integration-example.js` - Complete integration patterns
- `webhook-client.js` - Testing client for webhook endpoints
- `config.webhook.example.toml` - Full webhook configuration example

## Visibility Configuration

Buntspecht provides fine-grained control over message visibility with support for all Mastodon visibility levels:

- **`public`**: Visible to everyone, appears in public timelines
- **`unlisted`**: Visible to everyone but doesn't appear in public timelines (default)
- **`private`**: Only visible to followers (followers-only)
- **`direct`**: Only visible to mentioned users (direct message)

### Visibility Priority

Visibility is determined by the following priority order (highest to lowest):

1. **Webhook request `visibility` parameter** (for push providers)
2. **Push provider config `defaultVisibility`**
3. **Provider `visibility` setting**
4. **Account `defaultVisibility`**
5. **Global default** (`unlisted`)

### Configuration Examples

```toml
# Account-level default visibility
[[accounts]]
name = "main-account"
instance = "https://mastodon.social"
accessToken = "your-token"
defaultVisibility = "unlisted"  # Default for this account

# Provider-level visibility
[[bot.providers]]
name = "public-announcements"
type = "ping"
visibility = "public"  # Override account default
accounts = ["main-account"]

# Push provider with visibility options
[[bot.providers]]
name = "alerts"
type = "push"
visibility = "unlisted"  # Provider default
accounts = ["main-account"]

[bot.providers.config]
defaultVisibility = "private"  # Provider-specific default
```

### Webhook Visibility Control

Push providers can receive visibility settings via webhook requests:

```bash
# Webhook with custom visibility
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret" \
  -d '{
    "provider": "alerts",
    "message": "Private maintenance notification",
    "visibility": "private"
  }'
```

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

# List all push providers
bun start --list-push-providers

# Show rate limit status for a specific push provider
bun start --push-provider-status provider-name

# Show webhook server status and configuration
bun start --webhook-status

# Trigger a push provider with default message
bun start --trigger-push provider-name

# Trigger a push provider with custom message
bun start --trigger-push provider-name --trigger-push-message "Custom message"

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
serviceVersion = "0.5.1"

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
- **`buntspecht_rate_limit_hits_total`**: Number of rate limit hits (with labels: provider, current_count, limit)
- **`buntspecht_rate_limit_resets_total`**: Number of rate limit resets (with label: provider)
- **`buntspecht_rate_limit_current_count`**: Current rate limit usage count (with labels: provider, limit, usage_percentage)

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

# Rate limit hits per minute
rate(buntspecht_rate_limit_hits_total[1m])

# Rate limit usage percentage by provider
buntspecht_rate_limit_current_count{usage_percentage}

# Rate limit resets per hour
rate(buntspecht_rate_limit_resets_total[1h])
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
