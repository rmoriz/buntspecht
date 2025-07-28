# Message Middleware System

Buntspecht includes a powerful middleware system that allows you to transform, filter, and validate messages before they are posted to social media platforms. Middleware can be chained together to create complex message processing pipelines.

## Overview

The middleware system processes messages in a chain, where each middleware can:
- Transform the message content
- Filter messages (skip posting based on conditions)
- Validate messages using external commands
- Add metadata or context to messages

## Configuration

Middleware is configured per provider in the TOML configuration file. Each provider can have its own independent middleware chain that doesn't interfere with other providers:

```toml
[[bot.providers]]
name = "my-provider"
type = "command"
# ... other provider config ...

# Middleware chain for this provider
[[bot.providers.middleware]]
name = "filter-errors"
type = "filter"
enabled = true

[bot.providers.middleware.config]
type = "contains"
text = "error"
action = "skip"
skipReason = "Message contains error keyword"

[[bot.providers.middleware]]
name = "add-hashtags"
type = "text_transform"
enabled = true

[bot.providers.middleware.config]
transform = "append"
suffix = " #bot #automated"
```

## Built-in Middleware Types

Buntspecht includes 9 built-in middleware types that cover most common message processing needs:

### 1. Text Transform Middleware (`text_transform`)

Transforms message text using various operations.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-transform"
type = "text_transform"
enabled = true

[bot.providers.middleware.config]
transform = "uppercase"  # or "lowercase", "capitalize", "trim", "replace", "prepend", "append"
# For replace:
search = "old text"
replacement = "new text"
useRegex = false
regexFlags = "g"
# For prepend:
prefix = "📢 "
# For append:
suffix = " #hashtag"
```

**Transform Types:**
- `uppercase`: Convert to uppercase
- `lowercase`: Convert to lowercase
- `capitalize`: Capitalize first letter
- `trim`: Remove leading/trailing whitespace
- `replace`: Replace text (supports regex)
- `prepend`: Add text at the beginning
- `append`: Add text at the end

### 2. Filter Middleware (`filter`)

Filters messages based on content or properties.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-filter"
type = "filter"
enabled = true

[bot.providers.middleware.config]
type = "contains"  # or "not_contains", "starts_with", "ends_with", "regex", "length", "empty"
text = "spam"
caseSensitive = false
action = "skip"  # or "continue"
skipReason = "Message contains spam"
# For regex:
pattern = "\\b(spam|advertisement)\\b"
flags = "i"
# For length:
minLength = 10
maxLength = 500
```

**Filter Types:**
- `contains`: Message contains specific text
- `not_contains`: Message does not contain specific text
- `starts_with`: Message starts with specific text
- `ends_with`: Message ends with specific text
- `regex`: Message matches regex pattern
- `length`: Message length is within/outside bounds
- `empty`: Message is empty or whitespace only

**Actions:**
- `skip`: Skip posting the message (default)
- `continue`: Continue processing (useful for logging matches)

### 3. Command Middleware (`command`)

Executes external commands to transform or validate messages.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-command"
type = "command"
enabled = true

[bot.providers.middleware.config]
command = "python3 /path/to/script.py"
mode = "replace"  # or "prepend", "append", "validate"
timeout = 10000
useStdin = true
useEnvVar = false
skipOnFailure = true
skipReason = "Command validation failed"
```

**Modes:**
- `replace`: Replace message with command output
- `prepend`: Prepend command output to message
- `append`: Append command output to message
- `validate`: Use command success/failure to validate message

**Options:**
- `useStdin`: Pass message as stdin to command
- `useEnvVar`: Pass message as `MESSAGE_TEXT` environment variable
- `skipOnFailure`: Skip message if command fails (for validate mode)

### 4. Template Middleware (`template`)

Processes message templates with dynamic data injection.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-template"
type = "template"
enabled = true

[bot.providers.middleware.config]
template = "Hello {{name}}! Today is {{date}}"
data = { name = "World", date = "2024-01-01" }
# Or use external data source:
dataSource = "file:///path/to/data.json"
# dataSource = "command://python3 /path/to/get-data.py"
```

**Features:**
- Mustache-style template syntax (`{{variable}}`)
- Static data injection from config
- Dynamic data from files or commands
- Nested object support (`{{user.name}}`)

### 5. Conditional Middleware (`conditional`)

Applies different middleware based on conditions.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-conditional"
type = "conditional"
enabled = true

[bot.providers.middleware.config]
condition = "contains"  # or "not_contains", "starts_with", "ends_with", "regex", "length"
text = "urgent"
caseSensitive = false
# For regex:
pattern = "\\b(urgent|breaking)\\b"
flags = "i"
# For length:
minLength = 100
maxLength = 500

# Actions when condition is met
[[bot.providers.middleware.config.onTrue]]
type = "text_transform"
config = { transform = "prepend", prefix = "🚨 URGENT: " }

[[bot.providers.middleware.config.onTrue]]
type = "filter"
config = { type = "length", maxLength = 280, action = "skip" }

# Actions when condition is not met
[[bot.providers.middleware.config.onFalse]]
type = "text_transform"
config = { transform = "prepend", prefix = "ℹ️ " }
```

### 6. Schedule Middleware (`schedule`)

Controls when messages can be posted based on time and frequency rules.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-schedule"
type = "schedule"
enabled = true

[bot.providers.middleware.config]
# Time-based rules
allowedHours = [9, 10, 11, 12, 13, 14, 15, 16, 17]  # Business hours
allowedDays = [1, 2, 3, 4, 5]  # Monday to Friday (1=Monday, 7=Sunday)
quietHours = { start = "22:00", end = "06:00" }
skipDates = ["2024-12-25", "2024-01-01"]  # Skip holidays
skipDateRanges = [
  { start = "2024-12-24", end = "2024-12-26" }
]

# Frequency limits
minInterval = 3600000  # Minimum 1 hour between messages (in ms)
maxPerHour = 5
maxPerDay = 20

# Delay options
delay = 5000  # Delay message by 5 seconds
randomDelay = { min = 1000, max = 10000 }  # Random delay between 1-10 seconds
```

### 7. Rate Limit Middleware (`rate_limit`)

Advanced rate limiting with multiple strategies and time windows.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-rate-limit"
type = "rate_limit"
enabled = true

[bot.providers.middleware.config]
strategy = "sliding_window"  # or "fixed_window", "token_bucket"
maxRequests = 10
windowSize = 3600000  # 1 hour in milliseconds

# For token_bucket strategy:
bucketSize = 10
refillRate = 1  # tokens per second
refillInterval = 1000  # milliseconds

# Behavior when rate limit exceeded
onExceeded = "skip"  # or "delay", "queue"
skipReason = "Rate limit exceeded"
maxDelay = 300000  # Maximum delay in ms (5 minutes)
```

**Strategies:**
- `sliding_window`: Tracks requests in a sliding time window
- `fixed_window`: Resets counter at fixed intervals
- `token_bucket`: Token bucket algorithm with refill rate

### 8. Attachment Middleware (`attachment`)

Processes and validates message attachments.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-attachment"
type = "attachment"
enabled = true

[bot.providers.middleware.config]
# Validation rules
maxFileSize = 10485760  # 10MB in bytes
allowedTypes = ["image/jpeg", "image/png", "image/gif"]
allowedExtensions = [".jpg", ".jpeg", ".png", ".gif"]
maxAttachments = 4

# Processing options
resizeImages = true
maxWidth = 1920
maxHeight = 1080
quality = 85  # JPEG quality (1-100)

# Alt text generation
generateAltText = true
altTextCommand = "python3 /path/to/alt-text-generator.py"
altTextTimeout = 10000

# Behavior on validation failure
onValidationFailure = "skip"  # or "remove_invalid", "continue"
skipReason = "Invalid attachment detected"
```

### 9. OpenRouter Middleware (`openrouter`)

AI-powered message enhancement using OpenRouter API.

**Configuration:**
```toml
[[bot.providers.middleware]]
name = "my-openrouter"
type = "openrouter"
enabled = true

[bot.providers.middleware.config]
apiKey = "your-openrouter-api-key"
# Or use secret source:
apiKeySource = "vault://secret/openrouter/api-key"

model = "anthropic/claude-3-sonnet"
prompt = "Improve this social media post for better engagement: {{message}}"
maxTokens = 150
temperature = 0.7
timeout = 30000

# Caching
enableCache = true
cacheTimeout = 3600000  # 1 hour

# Error handling
onError = "continue"  # or "skip", "retry"
maxRetries = 3
retryDelay = 1000
skipReason = "AI processing failed"
```

**Supported Models:**
- `anthropic/claude-3-sonnet`
- `anthropic/claude-3-haiku`
- `openai/gpt-4`
- `openai/gpt-3.5-turbo`
- And many more via OpenRouter

## Provider-Specific Middleware Isolation

Each provider has its own independent middleware chain. This means:

- **Isolation**: Middleware configured for one provider doesn't affect other providers
- **Reusability**: The same middleware configuration can be used across multiple providers
- **Independence**: Each provider's middleware chain executes separately
- **Performance**: Only relevant middleware runs for each provider

### Example: Different Middleware for Different Providers

```toml
# News provider with content filtering
[[bot.providers]]
name = "news-feed"
type = "jsoncommand"
accounts = ["main-account"]

[[bot.providers.middleware]]
name = "news-filter"
type = "filter"
[bot.providers.middleware.config]
type = "contains"
text = "breaking"
action = "continue"

# Dev updates with different middleware
[[bot.providers]]
name = "dev-updates"
type = "command"
accounts = ["dev-account"]

[[bot.providers.middleware]]
name = "dev-prefix"
type = "text_transform"
[bot.providers.middleware.config]
transform = "prepend"
prefix = "🔧 DEV: "
```

In this example:
- The `news-feed` provider only runs the `news-filter` middleware
- The `dev-updates` provider only runs the `dev-prefix` middleware
- Neither provider is affected by the other's middleware

## Middleware Chain Execution

Middleware is executed in the order defined in the configuration for each provider. Each middleware can:

1. **Transform the message**: Modify the text content
2. **Skip the message**: Stop processing and don't post
3. **Continue processing**: Pass to the next middleware

If any middleware fails (throws an error), the entire chain stops and the message is not posted.

## Examples

### Example 1: Content Filtering and Formatting

```toml
# Filter out error messages and add formatting
[[bot.providers.middleware]]
name = "error-filter"
type = "filter"
[bot.providers.middleware.config]
type = "contains"
text = "error"
action = "skip"

[[bot.providers.middleware]]
name = "add-emoji"
type = "text_transform"
[bot.providers.middleware.config]
transform = "prepend"
prefix = "🤖 "

[[bot.providers.middleware]]
name = "add-hashtag"
type = "text_transform"
[bot.providers.middleware.config]
transform = "append"
suffix = " #automation"
```

### Example 2: External Validation and Transformation

```toml
# Validate message with external script and format
[[bot.providers.middleware]]
name = "content-validator"
type = "command"
[bot.providers.middleware.config]
command = "/usr/local/bin/validate-content.sh"
mode = "validate"
useStdin = true
skipOnFailure = true
skipReason = "Content validation failed"

[[bot.providers.middleware]]
name = "format-message"
type = "command"
[bot.providers.middleware.config]
command = "python3 /opt/formatters/social-media-formatter.py"
mode = "replace"
useStdin = true
timeout = 5000
```

### Example 3: Length Control and Cleanup

```toml
# Clean up text and ensure proper length
[[bot.providers.middleware]]
name = "cleanup"
type = "text_transform"
[bot.providers.middleware.config]
transform = "trim"

[[bot.providers.middleware]]
name = "length-check"
type = "filter"
[bot.providers.middleware.config]
type = "length"
maxLength = 500
action = "skip"
skipReason = "Message too long for social media"

[[bot.providers.middleware]]
name = "normalize-whitespace"
type = "text_transform"
[bot.providers.middleware.config]
transform = "replace"
search = "\\s+"
replacement = " "
useRegex = true
```

## Creating Custom Middleware

You can extend the middleware system by implementing the `MessageMiddleware` interface:

```typescript
import { MessageMiddleware, MessageMiddlewareContext } from '../types';

export class CustomMiddleware implements MessageMiddleware {
  public readonly name: string;
  public readonly enabled: boolean;

  constructor(name: string, config: any, enabled: boolean = true) {
    this.name = name;
    this.enabled = enabled;
    // Initialize with config
  }

  public async execute(context: MessageMiddlewareContext, next: () => Promise<void>): Promise<void> {
    // Transform the message
    context.message.text = this.transformMessage(context.message.text);
    
    // Or skip the message
    if (this.shouldSkip(context.message.text)) {
      context.skip = true;
      context.skipReason = "Custom validation failed";
      return; // Don't call next()
    }
    
    // Continue to next middleware
    await next();
  }

  private transformMessage(text: string): string {
    // Your transformation logic
    return text;
  }

  private shouldSkip(text: string): boolean {
    // Your validation logic
    return false;
  }
}
```

## Debugging Middleware

Enable debug logging to see middleware execution:

```toml
[logging]
level = "debug"
```

This will show:
- Middleware registration
- Execution order
- Transformation results
- Skip decisions
- Execution times

## Best Practices

1. **Order matters**: Place filters early to avoid unnecessary processing
2. **Use timeouts**: Set reasonable timeouts for command middleware
3. **Handle errors**: Command middleware should handle failures gracefully
4. **Test thoroughly**: Test middleware chains with various message types
5. **Monitor performance**: Use debug logging to monitor execution times
6. **Keep it simple**: Avoid overly complex middleware chains

## Performance Considerations

- Middleware adds processing time to each message
- Command middleware can be slow due to external process execution
- Filter middleware early in the chain to skip unnecessary processing
- Use appropriate timeouts for external commands
- Monitor middleware execution times in debug logs