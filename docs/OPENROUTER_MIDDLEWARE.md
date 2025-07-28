# OpenRouter AI Middleware

The OpenRouter middleware integrates AI-powered message processing into Buntspecht's middleware chain, enabling intelligent content transformation, enhancement, and generation using various AI models through the OpenRouter API.

## Overview

OpenRouter provides access to multiple AI models from different providers (OpenAI, Anthropic, Google, etc.) through a unified API. The OpenRouter middleware allows you to:

- **Transform messages** using AI for better engagement
- **Enhance content** with AI-generated improvements
- **Generate responses** based on context and prompts
- **Translate content** into multiple languages
- **Moderate content** using AI analysis
- **Personalize messages** based on context

## Configuration

### Basic Setup

```toml
[[bot.providers.middleware]]
name = "ai-enhancer"
type = "openrouter"
enabled = true

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "anthropic/claude-3-sonnet"
prompt = "Enhance this message for social media engagement"
mode = "replace"
```

### Required Configuration

| Parameter | Type | Description |
|-----------|------|-------------|
| `apiKey` | string | OpenRouter API key (use environment variables) |
| `model` | string | AI model to use (e.g., "anthropic/claude-3-sonnet") |
| `prompt` | string | System prompt defining AI behavior |
| `mode` | string | How to apply AI response: "replace", "prepend", "append", "enhance" |

### Optional Configuration

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `maxTokens` | number | 1000 | Maximum tokens for AI response |
| `temperature` | number | 0.7 | Creativity level (0.0-1.0) |
| `timeout` | number | 30000 | Request timeout in milliseconds |
| `includeContext` | boolean | true | Include context info in prompt |
| `contextTemplate` | string | auto | Custom context template |
| `fallbackOnError` | string | "continue" | Error handling: "skip", "continue", "use_original" |
| `skipReason` | string | auto | Custom skip reason for errors |
| `enableCaching` | boolean | true | Cache responses to avoid duplicate calls |
| `cacheDuration` | number | 3600000 | Cache duration in milliseconds |

## Available Models

OpenRouter provides access to many AI models. Popular options include:

### Anthropic Models
- `anthropic/claude-3-opus` - Most capable, highest cost
- `anthropic/claude-3-sonnet` - Balanced performance and cost
- `anthropic/claude-3-haiku` - Fast and cost-effective

### OpenAI Models
- `openai/gpt-4-turbo` - Latest GPT-4 with improved performance
- `openai/gpt-4` - Standard GPT-4
- `openai/gpt-3.5-turbo` - Fast and cost-effective

### Google Models
- `google/gemini-pro` - Google's flagship model
- `google/gemini-pro-vision` - Supports image inputs

### Other Models
- `meta-llama/llama-2-70b-chat` - Open source alternative
- `mistralai/mixtral-8x7b-instruct` - High-performance open model

## Processing Modes

### Replace Mode
AI response completely replaces the original message:

```toml
[bot.providers.middleware.config]
mode = "replace"
prompt = "Rewrite this message to be more engaging for social media"
```

### Prepend Mode
AI response is added before the original message:

```toml
[bot.providers.middleware.config]
mode = "prepend"
prompt = "Create an attention-grabbing introduction for this content"
```

### Append Mode
AI response is added after the original message:

```toml
[bot.providers.middleware.config]
mode = "append"
prompt = "Add a call-to-action and relevant hashtags"
```

### Enhance Mode
AI response is treated as an enhanced version of the original:

```toml
[bot.providers.middleware.config]
mode = "enhance"
prompt = "Improve this message while keeping the core meaning intact"
```

## Context Integration

The middleware can include context information in the AI prompt:

### Default Context Template
```
Context:
- Provider: {{providerName}}
- Target accounts: {{accountNames}}
- Visibility: {{visibility}}
- Timestamp: {{timestamp}}
- Message length: {{messageLength}} characters
```

### Custom Context Template
```toml
[bot.providers.middleware.config]
includeContext = true
contextTemplate = """Posting context:
- Platform: Mastodon ({{visibility}} visibility)
- Accounts: {{accountNames}}
- Time: {{timestamp}}
- Source: {{providerName}}

Please tailor the response appropriately."""
```

## Use Cases and Examples

### 1. Content Enhancement

Transform basic content into engaging social media posts:

```toml
[[bot.providers.middleware]]
name = "engagement-enhancer"
type = "openrouter"

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "anthropic/claude-3-sonnet"
mode = "replace"
prompt = """Transform this content into an engaging social media post that:
- Uses compelling language and appropriate emojis
- Includes relevant hashtags
- Encourages interaction and engagement
- Maintains the original information
- Fits social media best practices"""
```

### 2. Language Translation

Create multilingual content:

```toml
[[bot.providers.middleware]]
name = "translator"
type = "openrouter"

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "openai/gpt-4"
mode = "replace"
prompt = """Translate this content into multiple languages:
- English (original, improved if needed)
- Spanish
- French
- German

Format with language flags and keep each translation natural and culturally appropriate."""
```

### 3. Technical Content Simplification

Make complex content accessible:

```toml
[[bot.providers.middleware]]
name = "simplifier"
type = "openrouter"

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "openai/gpt-3.5-turbo"
mode = "replace"
prompt = """Simplify this technical content for a general audience:
- Remove jargon and technical terms
- Explain benefits in plain language
- Focus on what users care about
- Keep it engaging and accessible"""
```

### 4. Sentiment-Aware Responses

Generate appropriate responses based on sentiment:

```toml
[[bot.providers.middleware]]
name = "sentiment-responder"
type = "openrouter"

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "anthropic/claude-3-sonnet"
mode = "replace"
prompt = """Analyze the sentiment of this message and respond appropriately:
- Match the tone and urgency
- Show empathy when needed
- Provide helpful information
- Use appropriate emojis
- Be professional but friendly"""
```

### 5. Content Moderation

Filter and improve content quality:

```toml
[[bot.providers.middleware]]
name = "content-moderator"
type = "openrouter"

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "anthropic/claude-3-sonnet"
mode = "enhance"
fallbackOnError = "skip"
prompt = """Review this content for appropriateness:
- If inappropriate: return "CONTENT_REJECTED: [reason]"
- If appropriate: enhance it slightly for better engagement
- Be conservative with moderation decisions"""
```

### 6. Time-Contextual Content

Generate time-appropriate content:

```toml
[[bot.providers.middleware]]
name = "contextual-generator"
type = "openrouter"

[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"
model = "anthropic/claude-3-haiku"
mode = "replace"
includeContext = true
prompt = """Create time-appropriate content based on the current context:
- Morning: motivational content
- Afternoon: check-ins and updates
- Evening: reflections and community
- Weekend: casual and fun content
- Weekday: professional and informative"""
```

## Error Handling

The middleware provides several error handling strategies:

### Skip on Error
```toml
[bot.providers.middleware.config]
fallbackOnError = "skip"
skipReason = "AI processing failed"
```

### Continue with Original
```toml
[bot.providers.middleware.config]
fallbackOnError = "continue"  # Use original message
```

### Use Original Message
```toml
[bot.providers.middleware.config]
fallbackOnError = "use_original"  # Same as continue
```

## Performance Optimization

### Caching
Enable caching to avoid duplicate API calls:

```toml
[bot.providers.middleware.config]
enableCaching = true
cacheDuration = 3600000  # 1 hour
```

### Model Selection
Choose appropriate models for your use case:

- **High quality**: `anthropic/claude-3-opus`, `openai/gpt-4-turbo`
- **Balanced**: `anthropic/claude-3-sonnet`, `openai/gpt-4`
- **Fast/cheap**: `anthropic/claude-3-haiku`, `openai/gpt-3.5-turbo`

### Token Management
Optimize token usage:

```toml
[bot.providers.middleware.config]
maxTokens = 300        # Limit response length
temperature = 0.3      # Lower for more focused responses
```

## Security Best Practices

### API Key Management
Always use environment variables for API keys:

```bash
export OPENROUTER_API_KEY="your-api-key-here"
```

```toml
[bot.providers.middleware.config]
apiKey = "${OPENROUTER_API_KEY}"  # Never hardcode keys
```

### Content Validation
Validate AI responses before posting:

```toml
# Add validation middleware after AI processing
[[bot.providers.middleware]]
name = "ai-validator"
type = "filter"

[bot.providers.middleware.config]
type = "contains"
text = "CONTENT_REJECTED"
action = "skip"
skipReason = "AI rejected content"
```

## Monitoring and Debugging

### Enable Debug Logging
```toml
[logging]
level = "debug"
```

### Monitor Token Usage
Check logs for token consumption:
```
OpenRouterMiddleware ai-enhancer: Used 245 tokens (180 prompt + 65 completion)
```

### Cache Statistics
Monitor cache performance in debug logs:
```
OpenRouterMiddleware ai-enhancer: Using cached response
OpenRouterMiddleware ai-enhancer cleaned up 5 expired cache entries
```

## Cost Management

### Estimate Costs
- Monitor token usage in logs
- Use cheaper models for simple tasks
- Enable caching for repeated content
- Set appropriate `maxTokens` limits

### Model Cost Comparison (approximate)
- GPT-4: Higher cost, best quality
- Claude-3-Sonnet: Medium cost, good quality
- GPT-3.5-Turbo: Lower cost, good for simple tasks
- Claude-3-Haiku: Lowest cost, fast responses

## Troubleshooting

### Common Issues

1. **API Key Invalid**
   - Check environment variable is set
   - Verify key is correct in OpenRouter dashboard

2. **Model Not Found**
   - Check model name spelling
   - Verify model is available on OpenRouter

3. **Timeout Errors**
   - Increase timeout value
   - Use faster models for time-sensitive content

4. **Rate Limiting**
   - Add delays between requests
   - Use caching to reduce API calls
   - Consider upgrading OpenRouter plan

5. **Content Rejected**
   - Review and adjust prompts
   - Check for content policy violations
   - Use fallback error handling

### Debug Steps

1. **Enable debug logging** to see API requests/responses
2. **Test prompts** manually in OpenRouter playground
3. **Check token usage** to optimize costs
4. **Monitor cache hit rates** for performance
5. **Validate error handling** with intentional failures

## Integration Examples

### Chained AI Processing
```toml
# Step 1: AI enhancement
[[bot.providers.middleware]]
name = "ai-enhance"
type = "openrouter"
[bot.providers.middleware.config]
model = "anthropic/claude-3-sonnet"
prompt = "Enhance this content for engagement"

# Step 2: AI translation
[[bot.providers.middleware]]
name = "ai-translate"
type = "openrouter"
[bot.providers.middleware.config]
model = "openai/gpt-4"
prompt = "Translate to Spanish and French"

# Step 3: Final validation
[[bot.providers.middleware]]
name = "final-check"
type = "filter"
[bot.providers.middleware.config]
type = "length"
maxLength = 500
```

The OpenRouter middleware opens up powerful possibilities for AI-enhanced social media automation, enabling sophisticated content processing that adapts to context, audience, and platform requirements.