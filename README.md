# Buntspecht

*Pronounced: "BOONT-shpekht" (German for "Great Spotted Woodpecker")*

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Deutsch](https://img.shields.io/badge/lang-Deutsch-green.svg)](README.de.md)

<img src="buntspecht-header.jpeg" alt="Buntspecht Header"/>

A TypeScript-based **multi-platform social media bot** for **Mastodon**, **Bluesky**, and other platforms that automatically posts messages on schedule. Supports various message sources like static texts or external commands with cross-platform posting capabilities.

## Features

- 🌐 **Multi-Platform Support**: Post to **Mastodon**, **Bluesky**, and other social media platforms
- 🤖 Automatic scheduled message posting
- 📨 **Multiple message sources**: Static texts, external commands, JSON-based templates, or push notifications
- 🔄 **Multi-provider support**: Multiple providers running in parallel with individual schedules
- 🔔 **Push providers**: Event-driven messaging for webhooks, alerts, and external integrations
- 🔀 **Cross-platform posting**: Single providers can post to both Mastodon and Bluesky accounts simultaneously
- 🌐 **Multi-account support**: Multiple accounts across different platforms with their own authentication
- 📤 **Flexible account assignment**: Each provider can post to one or multiple accounts across platforms
- 👁️ **Visibility control**: Configurable message visibility (public, unlisted, private, direct) per account, provider, or webhook request
- 🗝️ **External Secret Sources**: Support for HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Google Cloud Secret Manager, files, and environment variables
- 🔐 **Automatic Secret Rotation Detection**: Monitor external secret sources and automatically update credentials when secrets change
- 🔗 **Bluesky URL Embedding**: Automatic URL detection with rich metadata embedding (title, description, Open Graph tags)
- 🏷️ **Bluesky Rich Text**: Automatic hashtag and mention detection with proper facet creation
- ⚙️ Flexible configuration via TOML files
- 🔍 Multiple configuration paths with priority order
- 📝 **Enhanced logging**: Comprehensive logging with message character counts
- 🧪 Complete test coverage (400+ tests)
- 🐳 Docker support for CI/CD
- 🛡️ TypeScript for type safety
- 📡 Modern API integration with masto.js (Mastodon) and @atproto/api (Bluesky)
- 🔧 Extensible provider architecture
- 📊 **OpenTelemetry integration**: Monitoring, tracing, and metrics for observability
- ⚡ **Bun runtime**: Faster performance and native TypeScript support
- 📦 **Single binary**: Standalone executables for all platforms without dependencies
- 🔧 **Message Middleware System**: Transform, filter, and enhance messages with powerful middleware
- 📎 **Attachment Management**: Add, remove, validate, and modify file attachments
- 🤖 **AI Message Enhancement**: Integrate with OpenRouter for AI-powered message processing
- 🎯 **Advanced RSS Filtering**: Built-in YouTube Shorts filtering, YouTube Premiere filtering, regex patterns, content-based filtering
- 📺 **YouTube Integration**: Automatic caption extraction, Shorts filtering, and Premiere filtering middleware

## Installation

### Prerequisites

- **Docker**: For the recommended Docker installation
- **Bun**: Version 1.2.18 or higher (for development/source builds)
- **Git**: For cloning the repository

### Installation

#### Option 1: Docker (Recommended)

The easiest and most reliable way to run Buntspecht is using the official Docker image from GitHub Container Registry:

```bash
# Pull the latest image
docker pull ghcr.io/rmoriz/buntspecht:latest

# Run with configuration file
docker run -d \
  --name buntspecht \
  -v /path/to/your/config.toml:/app/config.toml:ro \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/rmoriz/buntspecht:latest

# Run with environment-based configuration
docker run -d \
  --name buntspecht \
  -e BUNTSPECHT_CONFIG=/app/config.toml \
  -v /path/to/your/config.toml:/app/config.toml:ro \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/rmoriz/buntspecht:latest

# Check logs
docker logs -f buntspecht
```

**Docker Compose (Recommended for production):**

```yaml
# docker-compose.yml
version: '3.8'

services:
  buntspecht:
    image: ghcr.io/rmoriz/buntspecht:latest
    container_name: buntspecht
    restart: unless-stopped
    ports:
      - "3000:3000"  # For webhook server (if enabled)
    volumes:
      - ./config.toml:/app/config.toml:ro
      - ./data:/app/data  # For cache files (optional)
    environment:
      - BUNTSPECHT_CONFIG=/app/config.toml
      - TZ=UTC
    # Optional: Resource limits
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

```bash
# Start with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Stop
docker-compose down
```

**Available Docker Tags:**
- `latest`: Latest stable release
- `v0.11.0`: Specific version tags
- `main`: Latest development build (not recommended for production)

**Docker Benefits:**
- ✅ **Full OpenTelemetry support** (unlike single binaries)
- ✅ **Consistent environment** across all platforms
- ✅ **Easy updates** with `docker pull`
- ✅ **Resource management** and monitoring
- ✅ **Production-ready** with proper isolation
- ✅ **No dependency management** required

#### Option 2: Pre-compiled Binaries

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

## Message Middleware System

Buntspecht includes a powerful middleware system that allows you to transform, filter, and validate messages before they are posted. Middleware can be chained together to create complex message processing pipelines.

### Available Middleware Types

#### AttachmentMiddleware
Manage file attachments with comprehensive operations:

```toml
[[bot.providers.middleware]]
name = "attachment-manager"
type = "attachment"
enabled = true

[bot.providers.middleware.config]
action = "add"  # add, remove, validate, modify

# Add attachments
[[bot.providers.middleware.config.attachments]]
data = "base64encodeddata"  # or file path with isFilePath = true
mimeType = "image/jpeg"
filename = "image.jpg"
description = "Sample image"

# Remove attachments by criteria
[bot.providers.middleware.config.removeFilter]
mimeType = "image/*"  # Remove all images
maxSize = 1048576     # Remove files larger than 1MB
indices = [0, 2]      # Remove specific attachments by index

# Validate attachments
[bot.providers.middleware.config.validation]
maxCount = 5
maxSize = 5242880     # 5MB limit
allowedTypes = ["image/jpeg", "image/png", "text/plain"]
```

#### OpenRouterMiddleware
Enhance messages with AI using OpenRouter's API:

```toml
[[bot.providers.middleware]]
name = "ai-enhancer"
type = "openrouter"
enabled = true

[bot.providers.middleware.config]
apiKey = "your-openrouter-api-key"
model = "anthropic/claude-3-sonnet"
prompt = "You are a helpful social media assistant. Enhance this message to be more engaging while keeping it concise."
mode = "replace"  # replace, prepend, append, enhance
maxTokens = 1000
temperature = 0.7

# Context inclusion
includeContext = true
contextTemplate = "Provider: {{providerName}}, Visibility: {{visibility}}"

# Caching for efficiency
enableCaching = true
cacheDuration = 3600000  # 1 hour in milliseconds

# Error handling
fallbackOnError = "continue"  # skip, continue, use_original
skipReason = "AI enhancement failed"
```

#### Other Middleware Types
- **FilterMiddleware**: Filter messages based on content, length, or patterns
- **TemplateMiddleware**: Process template variables in messages
- **TextTransformMiddleware**: Transform text (uppercase, lowercase, trim, etc.)
- **ConditionalMiddleware**: Apply conditions based on context
- **ScheduleMiddleware**: Control timing and scheduling
- **RateLimitMiddleware**: Implement rate limiting
- **CommandMiddleware**: Execute external commands for validation or transformation

For complete middleware documentation, see [docs/MESSAGE_MIDDLEWARE.md](docs/MESSAGE_MIDDLEWARE.md).

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
# Social Media Accounts - Mastodon and Bluesky
[[accounts]]
name = "mastodon-account"
type = "mastodon"  # Account type (default: mastodon)
instance = "https://mastodon.social"
accessToken = "your-mastodon-access-token-here"
language = "de"  # Optional: BCP 47 language tag (e.g. "en", "de", "fr", "zh-CN")
# Specifies the language of posts for this Mastodon account. Only affects Mastodon posts.

[[accounts]]
name = "mastodon-account"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "your-mastodon-access-token"  # Traditional hardcoded token
# language = "en"  # Optional

[[accounts]]
name = "bluesky-account"
type = "bluesky"  # Account type for Bluesky
instance = "https://bsky.social"  # Optional: defaults to https://bsky.social
identifier = "yourhandle.bsky.social"  # Your Bluesky handle or DID
password = "your-app-password"  # Traditional hardcoded app password from Bluesky settings


# Examples with external secret sources (monitored for automatic rotation)
[[accounts]]
name = "secure-mastodon"
type = "mastodon"
instance = "https://mastodon.social"
accessTokenSource = "vault://secret/buntspecht/mastodon-token"  # HashiCorp Vault
# Alternative approaches:
# accessToken = "your-mastodon-access-token"                     # Traditional hardcoded token
# accessTokenSource = "aws://my-secret?key=token&region=us-east-1"  # AWS Secrets Manager
# accessTokenSource = "azure://my-vault/my-secret"                  # Azure Key Vault
# accessTokenSource = "gcp://my-project/my-secret"                 # Google Cloud Secret Manager
# accessTokenSource = "file:///path/to/token.txt"                 # File-based secret
# accessToken = "${MASTODON_TOKEN}"                               # Environment variable

[[accounts]]
name = "secure-bluesky"
type = "bluesky"
instance = "https://bsky.social"
identifier = "yourhandle.bsky.social"
passwordSource = "vault://secret/buntspecht/bluesky-password"    # HashiCorp Vault
# Alternative approaches:
# password = "your-app-password"                                  # Traditional hardcoded password
# passwordSource = "aws://my-secret?key=password&region=us-east-1" # AWS Secrets Manager
# passwordSource = "azure://my-vault/bluesky-secret"              # Azure Key Vault
# passwordSource = "gcp://my-project/bluesky-secret"              # Google Cloud Secret Manager
# passwordSource = "file:///path/to/password.txt"                # File-based secret
# password = "${BLUESKY_PASSWORD}"                                # Environment variable

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
accounts = ["mastodon-account", "bluesky-account"]  # Cross-platform posting!

[bot.providers.config]
message = "🤖 Hourly ping from Buntspecht!"

# Provider 2: Daily system statistics (disabled)
[[bot.providers]]
name = "daily-stats"
type = "command"
cronSchedule = "0 9 * * *"  # Every day at 9:00 AM
enabled = false
accounts = ["mastodon-account"]  # Mastodon only

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
4. Scopes: `write:statuses` for text posts, or `write` for posts with attachments/images
5. Create application and copy access token

## Message Providers

Buntspecht supports various message sources through an extensible provider system. Each provider runs independently with its own schedule and can be individually enabled/disabled.

### Available Provider Types

- **ping**: Simple static message posting
- **command**: Execute shell commands and post output  
- **jsoncommand**: Execute commands that return JSON, with template formatting
- **multijsoncommand**: Process JSON arrays with individual message generation
- **push**: Accept external messages via HTTP API
- **rssfeed** (or **rss**): Fetch and post content from RSS/Atom feeds

### RSS/Atom Feed Provider

Automatically fetches and posts content from RSS and Atom feeds with intelligent deduplication and error handling:

```toml
[[bot.providers]]
name = "tech-news"
type = "rssfeed"  # or "rss" as alias
cronSchedule = "0 */2 * * *"  # Every 2 hours
enabled = true
accounts = ["mastodon-main", "bluesky-main"]

[bot.providers.config]
feedUrl = "https://feeds.feedburner.com/TechCrunch"
template = "📰 {{title}}\n🔗 {{link}}\n📝 {{content|trim:200}}\n#news"  # Optional template
timeout = 30000      # Request timeout (default: 30000ms)
maxItems = 10        # Max items per fetch (default: unlimited)
retries = 3          # Retry attempts (default: 3)
userAgent = "Buntspecht RSS Reader/1.0"  # Custom user agent

# Cache configuration (optional)
[bot.providers.config.cache]
enabled = true       # Enable deduplication (default: true)
autoWarm = true      # Auto-warm cache on first run (default: true)
ttl = 1209600000     # Cache TTL in milliseconds (default: 14 days)
filePath = "./cache/tech-news.json"  # Custom cache file path
```

#### Auto-Warming Feature

When adding a new RSS feed, you typically don't want to post all existing items. The RSS provider automatically "warms" the cache on first run, marking all current items as processed so only new items will be posted going forward.

**How it works:**
- ✅ **First run**: No cache file exists → All current feed items are marked as processed (no posts)
- ✅ **Subsequent runs**: Only new items since the last run are posted
- ✅ **Configurable**: Can be disabled with `cache.autoWarm = false`

**Example logs on first run:**
```
[INFO] No cache file found for RSS provider 'tech-news', auto-warming cache to prevent posting old items...
[INFO] Auto-warm completed for RSS provider 'tech-news'. Future runs will only process new items.
```

This eliminates the need for manual cache warming when adding new RSS feeds to existing bot configurations.

**Key Features:**
- ✅ **RSS 2.0 and Atom support** - Works with both feed formats
- ✅ **Automatic deduplication** - Prevents posting duplicate items
- ✅ **Retry mechanism** - Configurable retry with exponential backoff
- ✅ **Content cleaning** - Removes HTML tags from feed content
- ✅ **Error resilience** - Graceful handling of network failures
- ✅ **Flexible scheduling** - Use any cron expression

**Content Processing:**
Without a template, each feed item is formatted as:
```
{title}
{link}
{content}
```

With a custom template, you have full control over formatting:
```toml
template = "📰 {{title|trim:50}}\n🔗 {{link}}\n📝 {{content|trim:200}}\n👤 {{author}}\n📅 {{pubDate}}\n🏷️ {{categories}}"
```

**Available Template Variables:**
- `{{title}}` - Article title
- `{{link}}` - Article URL
- `{{content}}` - Content (priority: contentSnippet > content > description)
- `{{description}}` - Original description field
- `{{contentSnippet}}` - Clean text snippet
- `{{author}}` - Author name
- `{{pubDate}}` - Publication date (RSS format)
- `{{isoDate}}` - Publication date (ISO format)
- `{{categories}}` - Categories (comma-separated)
- `{{id}}` - Unique item identifier

HTML tags are automatically stripped from content fields, and you can use template functions like `{{content|trim:200}}` for length control.

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

Executes external commands that output JSON or reads JSON from files, then applies templates with variables from the JSON data:

#### Command-based (Traditional)
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
```

#### File-based (New)
```toml
[[bot.providers]]
name = "weather-from-file"
type = "jsoncommand"
cronSchedule = "0 8 * * *"  # Every day at 8:00 AM
enabled = true
accounts = ["main-account"]

[bot.providers.config]
# Read from file instead of command (mutually exclusive with command)
file = "/app/data/weather.json"
template = "🌤️ Weather in {{city}}: {{temperature}}°C, {{description}}"
```

#### File Watching (Automatic Posting)
```toml
[[bot.providers]]
name = "alerts-from-file"
type = "jsoncommand"
# No cronSchedule = file watching enabled for change detection
enabled = true
accounts = ["main-account"]

[bot.providers.config]
file = "/app/data/alerts.json"
template = "🚨 Alert: {{message}} - {{severity}}"
```

**Note**: File watching automatically triggers message generation when files change. No manual intervention required!

**Startup Grace Period**: File changes are ignored for the first 3 seconds after startup to prevent existing files from triggering posts during initialization.

**Configuration Options:**
- **Either** `command` OR `file` (mutually exclusive)
- **File watching**: Automatic posting when no `cronSchedule` is provided
- **Template variables**: Use `{{variable}}` for JSON properties
- **Nested properties**: Support dot notation like `{{user.name}}`
- **Template functions**: `trim:length` and `join:separator,prefix`
- **Attachments**: Full support for images and files

**File vs Command Benefits:**
- **File**: Better performance, real-time updates, simpler configuration
- **Command**: Dynamic data fetching, API calls, data processing

**File Watching Behavior:**
- **Grace Period**: 3-second startup delay prevents initial file triggers
- **Rate Limiting**: 5-second minimum interval between file change triggers
- **Real-time**: Automatic posting when files change (after grace period)

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
- `{{variable|trim:50}}` - Trim variable to 50 characters with "..." suffix
- `{{variable|trim:30,…}}` - Trim variable to 30 characters with custom "…" suffix
- Missing variables are left as `{{variable}}` in the text
- JSON values are automatically converted to strings

#### Template Functions

**Trim Function**: Limit field lengths for social media character restrictions

```toml
# Basic trimming with default "..." suffix
template = "{{title|trim:50}}: {{description|trim:100}}"

# Custom suffix
template = "{{content|trim:280, [more]}}"

# Multiple trim functions
template = "{{title|trim:30}} - {{summary|trim:80}} #news"

# Works with nested properties
template = "{{user.name|trim:20}}: {{user.bio|trim:60}}"
```

**Use Cases:**
- **Twitter/X**: Limit to 280 characters
- **Mastodon**: Respect instance character limits (typically 500)
- **Bluesky**: Stay within 300 character limit
- **Headlines**: Consistent length for news feeds
- **Mobile**: Optimize for small screen readability

### Multi JSON Command Provider

Executes external commands that output JSON arrays or reads JSON arrays from files, then processes each object as a separate message. Perfect for RSS feeds, API endpoints returning multiple items, or any data source with multiple entries. Features intelligent caching to prevent duplicate messages. Each cron execution processes one new item from the array, with timing controlled by the cron schedule.

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

Buntspecht includes a built-in webhook server with **two distinct webhook types** for different use cases:

1. **Provider-specific webhooks** (`/webhook/provider-name`) - For external services like GitHub, GitLab, Twitch
   ```json
   POST /webhook/github
   {"action": "push", "repository": {"name": "my-repo"}}
   ```

2. **Generic webhook** (`/webhook`) - For manual notifications and flexible integrations
   ```json
   POST /webhook
   {"provider": "alerts", "message": "Server is down"}
   ```

This enables real-time notifications from monitoring systems, CI/CD pipelines, GitHub, and other services with enhanced security and flexibility.

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

### Health Check Endpoint

The webhook server includes a built-in health check endpoint for Docker and monitoring systems.

**Endpoint:** `GET /health`

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2025-07-19T12:00:00.000Z",
  "uptime": 3600,
  "service": "buntspecht-webhook-server",
  "version": "0.13.0",
  "webhook_enabled": true,
  "webhook_path": "/webhook",
  "webhook_port": 3000
}
```

**Usage with Docker:**
The health check endpoint is automatically used by the Docker container for health monitoring. You can also manually check the health:

```bash
./buntspecht --check-secret-rotations
```

## Post Purging

Buntspecht includes functionality to automatically purge old posts from Mastodon accounts. This feature helps manage your social media footprint and comply with data retention policies.

### Features

- **Chronological Deletion**: Posts are deleted in chronological order (oldest first) to ensure proper deletion sequence
- **Account-Specific Configuration**: Each Mastodon account can have individual purging settings
- **Preservation Options**: Protect pinned posts, highly-starred posts, or recent content
- **Batch Processing**: Efficient batch collection and deletion with configurable delays
- **Advanced Rate Limiting**: Individual deletion delays plus exponential backoff for rate limit errors
- **Error Resilience**: Automatic retries with exponential backoff for rate-limited requests
- **Comprehensive Logging**: Detailed progress tracking for collection and deletion phases

### Configuration

Add purging configuration to your Mastodon accounts:

```toml
[[accounts]]
name = "my-mastodon-account"
platform = "mastodon"
instanceUrl = "https://mastodon.social"
# ... other account settings

[accounts.purging]
enabled = true                    # Enable purging for this account
olderThanDays = 30               # Delete posts older than 30 days
preserveStarredPosts = true      # Preserve posts with many stars (default: true)
minStarsToPreserve = 5           # Minimum stars to preserve a post (default: 5)
preservePinnedPosts = true       # Preserve pinned posts (default: true)
batchSize = 20                   # Posts to process per batch (default: 20)
delayBetweenBatches = 1000       # Delay between batches in ms (default: 1000)
delayBetweenDeletions = 200      # Delay between individual deletions in ms (default: 200)
maxRetries = 3                   # Maximum retries for rate limit errors (default: 3)
retryDelayBase = 1000            # Base delay for exponential backoff in ms (default: 1000)
```

### Usage

Purging runs as a separate operation and exits when complete:

```bash
# Purge all accounts with purging enabled (oldest posts first)
bun start --purge-old-posts

# Purge specific account (oldest posts first)
bun start --purge-account my-mastodon-account

# Docker usage
docker exec buntspecht bun start --purge-old-posts
docker exec buntspecht bun start --purge-account my-mastodon-account
```

### How It Works

1. **Collection Phase**: Gathers all posts that match purging criteria (respects preservation rules)
2. **Sorting Phase**: Sorts collected posts chronologically (oldest first)
3. **Deletion Phase**: Deletes posts in batches with configurable delays
4. **Progress Tracking**: Logs detailed progress for both collection and deletion

### Preservation Rules

Posts are preserved if they meet any of these criteria:

- **Recent Posts**: Newer than the `olderThanDays` threshold
- **Pinned Posts**: If `preservePinnedPosts` is enabled
- **Popular Posts**: Have `minStarsToPreserve` or more favorites (if `preserveStarredPosts` is enabled)

### Safety Features

- **Minimal Initialization**: Runs independently without starting the full bot
- **Error Resilience**: Continues purging even if individual post deletions fail
- **Advanced Rate Limiting**: Multiple layers of rate limiting protection
- **Detailed Logging**: Comprehensive logging for audit and troubleshooting

### Rate Limiting Configuration

To avoid hitting Mastodon API rate limits, configure appropriate delays:

```toml
[accounts.purging]
# For conservative rate limiting (recommended for large instances)
delayBetweenDeletions = 500      # 500ms between each deletion
delayBetweenBatches = 2000       # 2 seconds between batches
maxRetries = 5                   # More retries for busy instances

# For faster purging (smaller instances or fewer posts)
delayBetweenDeletions = 100      # 100ms between each deletion  
delayBetweenBatches = 500        # 500ms between batches
maxRetries = 3                   # Standard retry count

# Exponential backoff timing
retryDelayBase = 1000            # 1s, 2s, 4s, 8s... retry delays
```

**Rate Limit Handling**:
- Detects HTTP 429 (rate limit) errors automatically
- Uses exponential backoff: 1s → 2s → 4s → 8s retry delays
- Continues with remaining posts after max retries exceeded
- Logs rate limiting events for monitoring

## Bluesky Enhanced Features

### Automatic URL Embedding

Buntspecht automatically detects URLs in Bluesky posts and creates rich embeds with metadata:

- **Automatic Detection**: Finds URLs in post text using robust regex patterns
- **Metadata Fetching**: Retrieves title, description, and Open Graph tags
- **Rich Embeds**: Creates `app.bsky.embed.external` format embeds
- **Graceful Fallback**: Handles metadata fetch failures gracefully
- **URL Removal**: Removes embedded URLs from post text to avoid duplication

### Automatic Hashtag and Mention Detection

Bluesky posts automatically get enhanced with proper facets:

- **Hashtag Detection**: Automatically detects `#hashtag` patterns
- **Mention Detection**: Automatically detects `@handle.domain` patterns  
- **Facet Creation**: Creates proper `app.bsky.richtext.facet` structures
- **UTF-8 Support**: Handles proper byte positioning for international characters
- **Combined Posts**: Supports posts with URLs, hashtags, and mentions together

Example post: `"Check out https://example.com #awesome @friend.bsky.social"` becomes:
- URL embedded as rich card
- `#awesome` tagged as hashtag facet
- `@friend.bsky.social` tagged as mention facet

## Cache Management

### Cache Warming

Buntspecht includes a cache warming feature that allows you to pre-populate caches for JSON-based providers without actually posting messages. This is particularly useful for:

- **Initial setup**: Populate caches when first deploying the bot
- **Maintenance**: Refresh caches after configuration changes
- **Testing**: Verify data sources work without posting to social media
- **Concurrent operation**: Safe to run while the bot is already running

#### How Cache Warming Works

When you run `--warm-cache`, Buntspecht:

1. **Processes all JSON providers**: Executes commands for JsonCommand and MultiJsonCommand providers
2. **Extracts and caches items**: Identifies unique items and adds them to the cache
3. **Skips posting**: No messages are sent to social media platforms
4. **Exits cleanly**: Completes the warming process and exits
5. **Account-aware**: Warms caches per account for providers that support multiple accounts

#### Usage Examples

```bash
# Warm caches (Docker)
docker exec buntspecht bun start --warm-cache

# Warm caches (Binary/Source)
bun start --warm-cache

# Example output:
# [INFO] Warming cache for all applicable providers...
# [INFO] Warming cache for provider: news-feed
# [INFO] Cache warming complete for provider: news-feed, account: mastodon-main. Added 15 new items to the cache.
# [INFO] Provider "ping-provider" does not support cache warming.
# [INFO] Cache warming process completed for all applicable providers.
```

#### Supported Providers

- ✅ **MultiJsonCommand providers**: Fully supported with account-aware caching
- ✅ **JsonCommand providers**: Supported (logs that warming is not applicable)
- ❌ **Push providers**: Not applicable (event-driven, no cache)
- ❌ **Ping providers**: Not applicable (static messages)

#### Safe Concurrent Operation

Cache warming is designed to be safe to run while Buntspecht is already running:

- **No interference**: Doesn't affect running scheduled tasks
- **No posting**: Never sends messages to social media
- **Independent process**: Runs as a separate operation and exits
- **Shared cache files**: Safely updates the same cache files used by the running bot

This makes it perfect for maintenance scripts, deployment processes, or manual cache refresh operations.

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

# Docker Usage (Recommended)
# Basic run (daemon mode)
docker run -d \
  --name buntspecht \
  -v /path/to/config.toml:/app/config.toml:ro \
  ghcr.io/rmoriz/buntspecht:latest

# Run with Docker Compose
docker-compose up -d

# Post a test message immediately (all providers)
docker exec buntspecht bun start --test-post

# Post test message from specific provider
docker exec buntspecht bun start --test-provider provider-name

# List all configured providers
docker exec buntspecht bun start --list-providers

# List all push providers
docker exec buntspecht bun start --list-push-providers

# Show rate limit status for a specific push provider
docker exec buntspecht bun start --push-provider-status provider-name

# Show webhook server status and configuration
docker exec buntspecht bun start --webhook-status

# Warm caches for all providers (safe to run while bot is running)
docker exec buntspecht bun start --warm-cache

# Trigger a push provider with default message
docker exec buntspecht bun start --trigger-push provider-name

# Trigger a push provider with custom message
docker exec buntspecht bun start --trigger-push provider-name --trigger-push-message "Custom message"

# Purge old posts from all Mastodon accounts with purging enabled (oldest posts first)
docker exec buntspecht bun start --purge-old-posts

# Purge old posts from a specific Mastodon account (oldest posts first)
docker exec buntspecht bun start --purge-account account-name

# View logs
docker logs -f buntspecht

# Stop container
docker stop buntspecht

# Update to latest version
docker pull ghcr.io/rmoriz/buntspecht:latest
docker stop buntspecht
docker rm buntspecht
# Then run again with same parameters

# Binary/Source Usage
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

# Warm caches for all providers (safe to run while bot is running)
bun start --warm-cache

# Trigger a push provider with default message
bun start --trigger-push provider-name

# Trigger a push provider with custom message
bun start --trigger-push provider-name --trigger-push-message "Custom message"

# Purge old posts from all Mastodon accounts with purging enabled (oldest posts first)
bun start --purge-old-posts

# Purge old posts from a specific Mastodon account (oldest posts first)
bun start --purge-account account-name

# Use specific configuration file
bun start --config /path/to/config.toml
```

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

## Media Attachments and Images

Buntspecht supports posting media attachments (images, documents, etc.) alongside text messages. This feature works with both **JSON Command** and **Multi-JSON Command** providers, allowing you to include base64-encoded files in your automated posts.

### Supported Platforms

- **Mastodon**: Supports multiple attachments of various file types (images, videos, audio, documents)
- **Bluesky**: Supports up to 4 images only (JPEG, PNG, GIF, WebP)

### Basic Attachment Configuration

To enable attachments, configure the `attachmentsKey` in your provider configuration:

```toml
[[bot.providers]]
name = "weather-with-charts"
type = "jsoncommand"
cronSchedule = "0 8 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = "curl -s 'https://api.weather.example.com/current' | jq '{...}'"
template = "🌤️ Weather: {{temperature}}°C - {{condition}}"
attachmentsKey = "attachments"  # JSON key containing the attachments array
```

### Attachment Data Format

Your command's JSON output must include an array of attachment objects:

```json
{
  "temperature": "22",
  "condition": "Sunny",
  "attachments": [
    {
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "mimeType": "image/png",
      "filename": "weather_chart.png",
      "description": "24-hour temperature chart"
    }
  ]
}
```

### Required Fields

Each attachment object must contain:

- **`data`**: Base64-encoded file content (required)
- **`mimeType`**: MIME type like `image/jpeg`, `image/png`, `application/pdf` (required)
- **`filename`**: Optional filename for the attachment
- **`description`**: Optional description/alt text for accessibility

### Advanced Configuration Options

#### Custom Field Names

You can customize the field names used within each attachment object to match your API's response format:

```toml
[bot.providers.config]
attachmentsKey = "files"                    # Custom key for attachments array
attachmentDataKey = "content"               # Custom key for base64 data (default: "data")
attachmentMimeTypeKey = "format"            # Custom key for MIME type (default: "mimeType")
attachmentFilenameKey = "title"             # Custom key for filename (default: "filename")
attachmentDescriptionKey = "caption"        # Custom key for description (default: "description")
```

**Example with custom field names:**

Your API returns this JSON structure:
```json
{
  "message": "Weather update",
  "files": [
    {
      "content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "format": "image/png",
      "title": "weather_chart.png",
      "caption": "Today's temperature chart"
    }
  ]
}
```

Configure your provider to map these custom fields:
```toml
[[bot.providers]]
name = "custom-api-weather"
type = "jsoncommand"
cronSchedule = "0 8 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = "curl -s 'https://api.custom-weather.com/report'"
template = "📊 {{message}}"
attachmentsKey = "files"                    # Points to the "files" array
attachmentDataKey = "content"               # Maps to "content" field for base64 data
attachmentMimeTypeKey = "format"            # Maps to "format" field for MIME type
attachmentFilenameKey = "title"             # Maps to "title" field for filename
attachmentDescriptionKey = "caption"        # Maps to "caption" field for description
```

#### Automatic Field Fallbacks

The system automatically tries fallback field names if the configured ones aren't found:

- **MIME type**: `mimeType` → `type`
- **Filename**: `filename` → `name`
- **Description**: `description` → `alt`

**Example with mixed field names (automatic fallbacks):**

Your API returns inconsistent field names:
```json
{
  "title": "Mixed API Response",
  "attachments": [
    {
      "data": "base64-image-data-here",
      "mimeType": "image/jpeg",
      "filename": "photo1.jpg",
      "description": "First photo"
    },
    {
      "data": "base64-image-data-here",
      "type": "image/png",           // Different field name for MIME type
      "name": "chart.png",           // Different field name for filename
      "alt": "Performance chart"     // Different field name for description
    }
  ]
}
```

With default configuration, both attachments work automatically:
```toml
[bot.providers.config]
attachmentsKey = "attachments"
# Using defaults with automatic fallbacks:
# - attachmentDataKey = "data" (default)
# - attachmentMimeTypeKey = "mimeType" (default, with fallback to "type")
# - attachmentFilenameKey = "filename" (default, with fallback to "name")
# - attachmentDescriptionKey = "description" (default, with fallback to "alt")
```

#### Nested JSON Keys

Use dot notation for nested attachment data:

```toml
attachmentsKey = "data.files"  # Accesses data.files array
```

**Example with nested structure:**

Your API returns deeply nested attachment data:
```json
{
  "response": {
    "status": "success",
    "data": {
      "report": {
        "title": "Sales Report",
        "media": [
          {
            "fileData": "base64-pdf-content-here",
            "contentType": "application/pdf",
            "displayName": "Q4-sales.pdf",
            "altText": "Q4 sales performance report"
          }
        ]
      }
    }
  }
}
```

Configure with nested keys and custom field mapping:
```toml
[bot.providers.config]
template = "📈 {{response.data.report.title}}"
attachmentsKey = "response.data.report.media"    # Nested path to attachments
attachmentDataKey = "fileData"                   # Custom data field
attachmentMimeTypeKey = "contentType"            # Custom MIME type field
attachmentFilenameKey = "displayName"            # Custom filename field
attachmentDescriptionKey = "altText"             # Custom description field
```

### Real-World API Integration Examples

#### Example 1: GitHub API with Release Assets

```toml
[[bot.providers]]
name = "github-releases"
type = "jsoncommand"
cronSchedule = "0 9 * * *"
accounts = ["mastodon-account"]

[bot.providers.config]
command = """
curl -s 'https://api.github.com/repos/owner/repo/releases/latest' | jq '{
  name: .name,
  body: .body,
  attachments: [.assets[] | {
    data: (.browser_download_url | @base64),  # You would need to fetch and encode
    mimeType: .content_type,
    filename: .name,
    description: ("Release asset: " + .name)
  }]
}'
"""
template = "🚀 New release: {{name}}"
attachmentsKey = "attachments"
# Using default field names since our jq transforms match them
```

#### Example 2: WordPress API with Featured Images

```toml
[[bot.providers]]
name = "wordpress-posts"
type = "multijsoncommand"
cronSchedule = "0 12 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = """
curl -s 'https://blog.example.com/wp-json/wp/v2/posts?_embed' | jq '[
  .[] | {
    id: .id,
    title: .title.rendered,
    excerpt: .excerpt.rendered,
    media: [._embedded."wp:featuredmedia"[]? | {
      imageData: .source_url,  # You would fetch and base64 encode this
      mediaType: .mime_type,
      fileName: .slug,
      altDescription: .alt_text
    }]
  }
]'
"""
template = "📝 {{title}}"
attachmentsKey = "media"
attachmentDataKey = "imageData"
attachmentMimeTypeKey = "mediaType"
attachmentFilenameKey = "fileName"
attachmentDescriptionKey = "altDescription"
uniqueKey = "id"
```

#### Example 3: Slack API with File Attachments

```toml
[[bot.providers]]
name = "slack-files"
type = "jsoncommand"
cronSchedule = "0 14 * * *"
accounts = ["mastodon-account"]

[bot.providers.config]
command = """
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
'https://slack.com/api/files.list?channel=C1234567890' | jq '{
  message: "Recent files from Slack",
  files: [.files[] | {
    content: .url_private,  # You would download and base64 encode
    type: .mimetype,
    name: .name,
    alt: .title
  }]
}'
"""
template = "📎 {{message}}"
attachmentsKey = "files"
attachmentDataKey = "content"
attachmentMimeTypeKey = "type"
attachmentFilenameKey = "name"
attachmentDescriptionKey = "alt"
```

### Platform-Specific Behavior

#### Mastodon
- Supports multiple attachments (typically up to 4)
- Supports various file types: images, videos, audio, documents
- Preserves original filenames and descriptions
- Shows descriptions as alt text for accessibility

#### Bluesky
- **Images only**: Supports JPEG, PNG, GIF, WebP formats
- **Maximum 4 images** per post
- **URL embed priority**: If both URL embeds and attachments are present, URL embeds take priority
- Descriptions become alt text for accessibility
- Non-image attachments are automatically skipped

### Example Configurations

#### Weather Reports with Charts

```toml
[[bot.providers]]
name = "weather-reports"
type = "jsoncommand"
cronSchedule = "0 8 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = """
curl -s 'https://api.weather.example.com/current' | jq '{
  location: .location.name,
  temperature: .current.temp_c,
  condition: .current.condition.text,
  attachments: [
    {
      data: .charts.temperature_chart_base64,
      mimeType: "image/png",
      filename: "temperature_chart.png",
      description: "24-hour temperature chart"
    }
  ]
}'
"""
template = "🌤️ {{location}}: {{temperature}}°C - {{condition}}"
attachmentsKey = "attachments"
```

#### Multi-JSON with Photo Posts

```toml
[[bot.providers]]
name = "photo-posts"
type = "multijsoncommand"
cronSchedule = "0 12 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = """
curl -s 'https://api.photos.example.com/daily' | jq '[
  .photos[] | {
    id: .id,
    caption: .caption,
    attachments: [
      {
        data: .image_base64,
        mimeType: "image/jpeg",
        filename: (.id + ".jpg"),
        description: .alt_text
      }
    ]
  }
]'
"""
template = "📸 {{caption}}"
attachmentsKey = "attachments"
uniqueKey = "id"
```

#### Mixed File Types (Mastodon Only)

```toml
[[bot.providers]]
name = "weekly-reports"
type = "jsoncommand"
cronSchedule = "0 9 * * 1"
accounts = ["mastodon-account"]  # Mastodon only for PDF support

[bot.providers.config]
command = """
./scripts/generate-report.sh | jq '{
  title: .report.title,
  summary: .report.summary,
  attachments: [
    {
      data: .report.pdf_base64,
      mimeType: "application/pdf",
      filename: "weekly-report.pdf",
      description: "Weekly performance report"
    },
    {
      data: .report.chart_base64,
      mimeType: "image/png",
      filename: "performance-chart.png",
      description: "Performance metrics visualization"
    }
  ]
}'
"""
template = "📊 {{title}}: {{summary}}"
attachmentsKey = "attachments"
```

### Error Handling and Validation

#### Automatic Validation
- **Base64 validation**: Invalid base64 data is automatically skipped
- **Required fields**: Attachments missing `data` or `mimeType` are skipped
- **Platform filtering**: Non-image attachments are filtered out for Bluesky
- **Size limits**: Platform-specific limits are respected

#### Logging
- Detailed logs for attachment processing
- Warnings for skipped attachments with reasons
- Success confirmations with attachment counts

#### Graceful Degradation
- Individual attachment failures don't stop the post
- Posts continue even if all attachments fail
- Clear error messages for troubleshooting

### Performance Considerations

#### File Size and Processing
- **Base64 overhead**: Base64 encoding increases file size by ~33%
- **Memory usage**: Large attachments consume more memory during processing
- **Upload time**: Multiple/large attachments increase posting time

#### Optimization Tips
- Use appropriate image compression before base64 encoding
- Consider timeout settings for commands generating attachments
- Monitor memory usage with large attachment workflows
- Use caching for Multi-JSON providers to avoid reprocessing

### Troubleshooting

#### Common Issues

1. **"Attachment skipped - invalid base64"**
   - Verify your base64 encoding is correct
   - Ensure no line breaks or extra characters in base64 data

2. **"Attachment missing required field"**
   - Check that `data` and `mimeType` fields are present
   - Verify field names match your configuration

3. **"Bluesky: Non-image attachment skipped"**
   - Bluesky only supports images (JPEG, PNG, GIF, WebP)
   - Use Mastodon-only accounts for other file types

4. **"Upload failed for attachment"**
   - Check network connectivity
   - Verify file size limits
   - Ensure MIME type is supported by the platform

#### Debug Configuration

```toml
[logging]
level = "debug"  # Enable detailed attachment processing logs
```

### Security Considerations

- **Base64 validation**: All base64 data is validated before processing
- **MIME type verification**: MIME types are checked against platform requirements
- **File size limits**: Platform limits are enforced to prevent abuse
- **Error isolation**: Attachment failures don't expose sensitive command output

## Bluesky Integration

Buntspecht now supports **Bluesky** alongside Mastodon, enabling cross-platform social media automation.

### Bluesky Account Setup

1. **Create an App Password** in your Bluesky settings (not your main password!)
2. **Configure your account** in the TOML file:

```toml
[[accounts]]
name = "my-bluesky"
type = "bluesky"
instance = "https://bsky.social"  # Optional: defaults to https://bsky.social
identifier = "yourhandle.bsky.social"  # Your Bluesky handle or DID
password = "your-app-password"  # App password from Bluesky settings
```

### Cross-Platform Posting

Post to both Mastodon and Bluesky simultaneously:

```toml
[[bot.providers]]
name = "cross-platform-announcements"
type = "ping"
cronSchedule = "0 12 * * *"  # Daily at noon
enabled = true
accounts = ["mastodon-main", "bluesky-main"]  # Posts to both platforms!

[bot.providers.config]
message = "🤖 Daily update from our bot! #automation #crossplatform"
```

### Platform-Specific Features

- **Mastodon**: Full visibility control (public, unlisted, private, direct)
- **Bluesky**: All posts are public (visibility settings ignored)
- **Character Limits**: Mastodon (500), Bluesky (300) - keep messages under 280 for compatibility
- **Authentication**: Mastodon uses access tokens, Bluesky uses app passwords

### Bluesky Configuration Examples

See `config.bluesky.example.toml` for comprehensive cross-platform configuration examples.

## Telemetry and Monitoring

Buntspecht supports OpenTelemetry for comprehensive monitoring, tracing, and metrics. This allows monitoring and analyzing the performance and behavior of the bot.

> **⚠️ Important Note for Single Binary Builds**: OpenTelemetry dependencies are excluded when creating single binaries with `bun build --compile` (`--external @opentelemetry/*`) as they are not available at runtime. Telemetry only works when running with `bun run` or `npm start`, not with pre-compiled binaries. For production environments with telemetry, use Docker or run the bot directly with Bun/Node.js.

### Telemetry Configuration

```toml
[telemetry]
# Enable/disable OpenTelemetry
enabled = true
serviceName = "buntspecht"
serviceVersion = "0.13.0"

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
- **`buntspecht_active_connections`**: Number of active social media connections (Mastodon + Bluesky)
- **`buntspecht_rate_limit_hits_total`**: Number of rate limit hits (with labels: provider, current_count, limit)
- **`buntspecht_rate_limit_resets_total`**: Number of rate limit resets (with label: provider)
- **`buntspecht_rate_limit_current_count`**: Current rate limit usage count (with labels: provider, limit, usage_percentage)

### Available Traces

- **`mastodon.post_status`**: Mastodon post operations with attributes like:
  - `mastodon.accounts_count`: Number of target accounts
- **`bluesky.post_status`**: Bluesky post operations with attributes like:
  - `bluesky.accounts_count`: Number of target accounts
- **`social_media.post_status`**: Cross-platform post operations with attributes like:
  - `social_media.accounts_count`: Total number of target accounts
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

# Provider execution time
buntspecht_provider_execution_duration_seconds

# Active connections
buntspecht_active_connections

# Rate limit usage percentage
buntspecht_rate_limit_current_count
```

## Technologies

### Core Dependencies

- **[masto.js](https://github.com/neet/masto.js)** (v6.8.0): Modern TypeScript library for Mastodon API
- **[@atproto/api](https://github.com/bluesky-social/atproto)** (v0.15.23): Official Bluesky/AT Protocol API client
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

See [RELEASE_PROCESS.md](docs/RELEASE_PROCESS.md) for detailed release documentation.

## 📚 Additional Documentation

### New Features ✨
- [RSS Feed Filtering](docs/RSS_FEED_FILTERING.md) - Advanced filtering for RSS feeds with YouTube Shorts filtering, regex patterns, and content-based filtering
- [YouTube Caption Middleware](docs/YOUTUBE_CAPTION_MIDDLEWARE.md) - Extract and add YouTube video captions automatically
- [YouTube Shorts Filter Middleware](docs/YOUTUBE_SHORTS_FILTER_MIDDLEWARE.md) - Filter out YouTube Shorts content
- [YouTube Premiere Filter Middleware](docs/YOUTUBE_PREMIERE_FILTER_MIDDLEWARE.md) - Filter out YouTube Premieres from RSS feeds
- [YouTube Video Filter Middleware](docs/YOUTUBE_VIDEO_FILTER_MIDDLEWARE.md) - Filter YouTube videos based on advanced criteria
- [YouTube Premiere Filter Middleware](docs/YOUTUBE_PREMIERE_FILTER_MIDDLEWARE.md) - Filter out YouTube Premieres from RSS feeds

### Core Documentation

- [Cache Migration System](docs/CACHE_MIGRATION_SYSTEM.md) - Preventing duplicate messages during upgrades
- [Automatic Secret Rotation](docs/AUTOMATIC_SECRET_ROTATION.md) - Automatic credential updates
- [Implementation Summary](docs/IMPLEMENTATION_SUMMARY.md) - Technical implementation details

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
