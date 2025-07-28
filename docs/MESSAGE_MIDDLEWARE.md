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