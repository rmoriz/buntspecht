# Webhook Usage Examples - Refactored System

## 🎯 Two Webhook Types

### 1. Provider-Specific Webhooks
- **Fixed provider** determined by URL path
- **Entire JSON payload** used as template data
- **Templates from config** applied automatically
- **External services** send directly to provider URLs

### 2. Generic Webhook
- **Free provider choice** specified in JSON
- **JSON or simple messages** supported
- **Template override** possible in request
- **Manual/flexible** usage

---

## 🔧 Provider-Specific Webhook Examples

### GitHub Webhook (Provider-Specific)
```bash
# GitHub sends to: POST /webhook/github
# Provider is automatically "github-events" (cannot be overridden)

curl -X POST http://localhost:8080/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=calculated_signature" \
  -d '{
    "action": "opened",
    "repository": {"name": "buntspecht"},
    "pull_request": {
      "title": "Fix critical bug",
      "user": {"login": "developer"}
    }
  }'

# Result: Uses "pull_request" template from config
# "🔧 PR opened: "Fix critical bug" by @developer"
```

### Twitch Webhook (Provider-Specific)
```bash
# Twitch service sends to: POST /webhook/twitch
# Provider is automatically "twitch-notifications"

curl -X POST http://localhost:8080/webhook/twitch \
  -H "Content-Type: application/json" \
  -H "X-Twitch-Signature: sha256=calculated_signature" \
  -d '[{
    "payload": {
      "streamer_name": "isolani44",
      "url": "https://twitch.tv/Isolani44",
      "followers_count": 1895
    }
  }]'

# Result: Uses default template from config
# "🎮 isolani44 ist live auf https://twitch.tv/Isolani44 (1895 Follower)"
```

### GitLab Webhook (Provider-Specific)
```bash
# GitLab sends to: POST /webhook/gitlab
# Provider is automatically "gitlab-ci"

curl -X POST http://localhost:8080/webhook/gitlab \
  -H "Content-Type: application/json" \
  -H "X-Gitlab-Token: gitlab-webhook-secret" \
  -d '{
    "object_kind": "pipeline",
    "project": {"name": "my-project"},
    "pipeline": {
      "status": "success",
      "duration": 120
    }
  }'

# Result: Uses "Pipeline Hook" template
# "✅ Pipeline success (120s)"
```

---

## 🌐 Generic Webhook Examples

### Manual Notification (Generic Webhook)
```bash
# Generic webhook with provider choice
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: manual-secret" \
  -d '{
    "provider": "manual-notifications",
    "json": {"message": "Server maintenance completed"},
    "accounts": ["mastodon-main"]
  }'

# Result: Uses template from config
# "📢 Server maintenance completed"
```

### Alert System (Generic Webhook)
```bash
# Generic webhook with JSON data
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -H "X-Alert-Signature: sha512=calculated_signature" \
  -d '{
    "provider": "alert-system",
    "json": {
      "severity": "critical",
      "message": "Database connection lost"
    },
    "visibility": "private"
  }'

# Result: Uses template from config
# "🚨 critical: Database connection lost"
```

### Flexible Notifier with Template Override
```bash
# Generic webhook with custom template
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: flexible-secret" \
  -d '{
    "provider": "flexible-notifier",
    "template": "🎉 {{event}}: {{description}}",
    "json": {
      "event": "Deployment",
      "description": "Version 2.1.0 deployed successfully"
    }
  }'

# Result: Uses custom template from request
# "🎉 Deployment: Version 2.1.0 deployed successfully"
```

### Simple Message (Generic Webhook)
```bash
# Generic webhook with simple message (no JSON)
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: flexible-secret" \
  -d '{
    "provider": "flexible-notifier",
    "message": "Quick status update: All systems operational"
  }'

# Result: Direct message posting
# "Quick status update: All systems operational"
```

---

## ❌ Invalid Usage Examples

### Provider Override Attempt (Will be Ignored)
```bash
# This will IGNORE the provider field in JSON
curl -X POST http://localhost:8080/webhook/github \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "different-provider",  # IGNORED!
    "action": "push",
    "repository": {"name": "test"}
  }'

# Warning logged: "Provider field 'different-provider' in JSON ignored"
# Uses "github-events" provider (from URL path)
```

### Missing Template in Provider Config (Error)
```bash
# This will FAIL - provider-specific webhooks need template in config
curl -X POST http://localhost:8080/webhook/twitch \
  -H "Content-Type: application/json" \
  -d '{
    "streamer_name": "TestStreamer",
    "url": "https://twitch.tv/teststreamer"
  }'

# Error: "Template is required for JSON workflow"
# Fix: Add template to provider config: [bot.providers.config] template = "..."
```

### Missing Provider in Generic Webhook (Error)
```bash
# This will FAIL - generic webhook requires provider
curl -X POST http://localhost:8080/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Message without provider"
  }'

# Error: "Provider name is required when using the generic webhook path"
```

---

## 🔒 Authentication Differences

### Provider-Specific Webhooks
- Use **provider-specific HMAC secrets** from config
- **External services** authenticate with their own secrets
- **No cross-provider access** possible

### Generic Webhook
- Can use **any provider's authentication**
- Supports **global fallback secrets**
- **Flexible authentication** based on chosen provider

---

## 🎯 Best Practices

### Use Provider-Specific Webhooks For:
- **External services** (GitHub, GitLab, Twitch, etc.)
- **Fixed integrations** with known data formats
- **High-security scenarios** with dedicated secrets
- **Template-driven** content generation

### Use Generic Webhook For:
- **Manual notifications** and alerts
- **Flexible integrations** with varying providers
- **Simple message posting** without templates
- **Development and testing** scenarios
- **Custom applications** that need provider choice