# Middleware Integration Scripts

This directory contains example scripts that demonstrate how to integrate external tools and services with Buntspecht's middleware system.

## Script Categories

### Content Processing Scripts
- `sanitize-ticket.py` - Sanitizes support ticket data for social media
- `fact-check.py` - Performs fact-checking on news content
- `optimize-length.py` - Optimizes content length for social media platforms
- `enhance-content.py` - Adds emojis and optimizes hashtags
- `format-product.py` - Formats product information for different platforms

### Validation Scripts
- `check-inventory.py` - Validates product availability
- `deduplicate-alerts.py` - Prevents duplicate alert notifications
- `validate-commit.py` - Validates git commit messages
- `profanity-filter.sh` - Content moderation script

### Enrichment Scripts
- `enrich-alert.py` - Adds context to monitoring alerts
- `tag-environment.py` - Adds environment tags to deployment notifications
- `notify-oncall.py` - Notifies on-call personnel
- `format-video-post.py` - Formats YouTube video announcements

## Usage Patterns

### 1. Validation Scripts (mode: "validate")
Scripts that return exit code 0 for success, 1 for failure:

```python
#!/usr/bin/env python3
import sys

def validate_content(content):
    # Your validation logic
    return is_valid

if __name__ == "__main__":
    content = sys.stdin.read()
    if validate_content(content):
        sys.exit(0)  # Success - continue processing
    else:
        sys.exit(1)  # Failure - skip message
```

### 2. Transformation Scripts (mode: "replace", "prepend", "append")
Scripts that output transformed content:

```python
#!/usr/bin/env python3
import sys

def transform_content(content):
    # Your transformation logic
    return transformed_content

if __name__ == "__main__":
    content = sys.stdin.read()
    result = transform_content(content)
    print(result)
```

### 3. Environment Variables
Access message content and metadata:

```python
import os

# Message content (when useEnvVar: true)
message_text = os.environ.get('MESSAGE_TEXT', '')

# Custom environment variables from middleware config
api_key = os.environ.get('API_KEY', '')
webhook_secret = os.environ.get('WEBHOOK_SECRET', '')
```

### 4. Error Handling
Always implement proper error handling:

```python
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    # Your processing logic
    result = process_content()
    print(result)
except Exception as e:
    logger.error(f"Script failed: {e}")
    sys.exit(1)
```

## Configuration Examples

### Basic Command Middleware
```toml
[[bot.providers.middleware]]
name = "my-processor"
type = "command"
[bot.providers.middleware.config]
command = "python3 /scripts/my-processor.py"
mode = "replace"
useStdin = true
timeout = 5000
```

### Command with Environment Variables
```toml
[[bot.providers.middleware]]
name = "api-enricher"
type = "command"
[bot.providers.middleware.config]
command = "python3 /scripts/api-enricher.py"
mode = "append"
useEnvVar = true
env = { API_KEY = "your-api-key", TIMEOUT = "10" }
```

### Validation with Skip on Failure
```toml
[[bot.providers.middleware]]
name = "content-validator"
type = "command"
[bot.providers.middleware.config]
command = "/scripts/validate.sh"
mode = "validate"
useStdin = true
skipOnFailure = true
skipReason = "Content validation failed"
```

## Testing Scripts

Test your scripts independently before using them in middleware:

```bash
# Test with sample input
echo "Sample message content" | python3 /scripts/my-processor.py

# Test with environment variables
MESSAGE_TEXT="Test content" python3 /scripts/my-processor.py

# Test validation scripts
echo "Test content" | python3 /scripts/validator.py
echo $?  # Should be 0 for success, 1 for failure
```

## Performance Considerations

1. **Timeouts**: Set appropriate timeouts for external API calls
2. **Caching**: Implement caching for expensive operations
3. **Error Recovery**: Handle network failures gracefully
4. **Resource Limits**: Be mindful of memory and CPU usage
5. **Logging**: Use structured logging for debugging

## Security Best Practices

1. **Input Validation**: Always validate input data
2. **Secret Management**: Use environment variables for secrets
3. **Sandboxing**: Run scripts with minimal privileges
4. **Output Sanitization**: Sanitize output to prevent injection
5. **Dependency Management**: Keep dependencies updated

## Debugging

Enable debug logging in Buntspecht to see middleware execution:

```toml
[logging]
level = "debug"
```

This will show:
- Script execution times
- Input/output data
- Error messages
- Exit codes