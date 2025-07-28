# Real-World Middleware Integration Examples

This document provides practical examples of how to use Buntspecht's middleware system in real-world scenarios.

## Example 1: Multi-Team Development Environment

A software company wants to post different types of updates to different social media accounts with appropriate formatting and filtering.

### Scenario Setup
- **Main Account**: Public updates for customers
- **Dev Account**: Internal development updates
- **Support Account**: Customer support notifications

### Configuration

```toml
# Social Media Accounts
[[accounts]]
name = "company-main"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "main-account-token"

[[accounts]]
name = "company-dev"
type = "mastodon"
instance = "https://fosstodon.org"
accessToken = "dev-account-token"

[[accounts]]
name = "company-support"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "support-account-token"

# Provider 1: Release Announcements (Public)
[[bot.providers]]
name = "release-announcements"
type = "jsoncommand"
cronSchedule = "0 9 * * *"  # Daily at 9 AM
enabled = true
accounts = ["company-main"]
visibility = "public"

[bot.providers.config]
command = "curl -s https://api.github.com/repos/company/product/releases/latest"
template = "🚀 New Release: {{name}}\n\n{{body}}\n\nDownload: {{html_url}}"

# Middleware for release announcements
[[bot.providers.middleware]]
name = "release-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "contains"
text = "prerelease"
action = "skip"
skipReason = "Skip prerelease announcements"

[[bot.providers.middleware]]
name = "release-formatter"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "replace"
search = "\\n\\n+"
replacement = "\n\n"
useRegex = true

[[bot.providers.middleware]]
name = "marketing-hashtags"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n#release #software #update"

# Provider 2: Development Updates (Internal)
[[bot.providers]]
name = "dev-commits"
type = "jsoncommand"
cronSchedule = "0 */2 * * 1-5"  # Every 2 hours on weekdays
enabled = true
accounts = ["company-dev"]
visibility = "unlisted"

[bot.providers.config]
command = "curl -s https://api.github.com/repos/company/product/commits?since=$(date -d '2 hours ago' --iso-8601)"
template = "{{#each this}}📝 {{commit.message}} by {{commit.author.name}}\n{{/each}}"

# Middleware for dev updates
[[bot.providers.middleware]]
name = "commit-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "regex"
pattern = "^(fix|feat|docs|style|refactor|test|chore):"
action = "continue"

[[bot.providers.middleware]]
name = "dev-prefix"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "prepend"
prefix = "🔧 DEV UPDATE:\n\n"

[[bot.providers.middleware]]
name = "dev-hashtags"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n#development #commits #internal"

# Provider 3: Support Tickets (Customer Service)
[[bot.providers]]
name = "support-alerts"
type = "push"
enabled = true
accounts = ["company-support"]
visibility = "direct"
webhookPath = "/webhook/support"

[bot.providers.config]
rateLimit = 5
rateLimitWindow = 3600

# Middleware for support alerts
[[bot.providers.middleware]]
name = "priority-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "contains"
text = "priority:high"
action = "continue"

[[bot.providers.middleware]]
name = "support-formatter"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "prepend"
prefix = "🎫 SUPPORT ALERT: "

[[bot.providers.middleware]]
name = "ticket-sanitizer"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/sanitize-ticket.py"
mode = "replace"
useStdin = true
timeout = 5000
```

### Supporting Scripts

**`/scripts/sanitize-ticket.py`**
```python
#!/usr/bin/env python3
import sys
import re
import json

def sanitize_ticket(content):
    try:
        data = json.loads(content)
        
        # Remove sensitive information
        sanitized = {
            'ticket_id': data.get('id', 'Unknown'),
            'priority': data.get('priority', 'normal'),
            'subject': data.get('subject', 'No subject'),
            'status': data.get('status', 'open')
        }
        
        # Format for social media
        message = f"Ticket #{sanitized['ticket_id']}: {sanitized['subject']}\n"
        message += f"Priority: {sanitized['priority'].upper()}\n"
        message += f"Status: {sanitized['status']}"
        
        return message
        
    except Exception as e:
        return f"Error processing ticket: {str(e)}"

if __name__ == "__main__":
    content = sys.stdin.read()
    print(sanitize_ticket(content))
```

## Example 2: News Aggregation with Content Moderation

A news organization wants to automatically post curated content with strict content moderation.

### Configuration

```toml
# Provider: RSS News Feed
[[bot.providers]]
name = "news-feed"
type = "rssfeed"
cronSchedule = "0 */30 * * *"  # Every 30 minutes
enabled = true
accounts = ["news-main"]
visibility = "public"

[bot.providers.config]
url = "https://feeds.example-news.com/latest.xml"
template = "📰 {{title}}\n\n{{description}}\n\n🔗 {{link}}"

# Comprehensive middleware chain for news
[[bot.providers.middleware]]
name = "content-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "regex"
pattern = "\\b(breaking|urgent|alert)\\b"
flags = "i"
action = "continue"

[[bot.providers.middleware]]
name = "profanity-check"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "/usr/local/bin/profanity-filter --strict"
mode = "validate"
useStdin = true
skipOnFailure = true
skipReason = "Content failed profanity check"

[[bot.providers.middleware]]
name = "fact-check"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/fact-check.py"
mode = "validate"
useStdin = true
skipOnFailure = true
skipReason = "Content failed fact-checking"
timeout = 10000

[[bot.providers.middleware]]
name = "length-optimizer"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/optimize-length.py --max-length=400"
mode = "replace"
useStdin = true

[[bot.providers.middleware]]
name = "news-hashtags"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n#news #breaking #journalism"
```

### Supporting Scripts

**`/scripts/fact-check.py`**
```python
#!/usr/bin/env python3
import sys
import requests
import json
import re

def fact_check(content):
    # Extract claims from content
    claims = extract_claims(content)
    
    for claim in claims:
        if not verify_claim(claim):
            return False
    
    return True

def extract_claims(content):
    # Simple claim extraction (in reality, this would be more sophisticated)
    claim_patterns = [
        r'(\d+)% of',
        r'according to (.+?),',
        r'studies show',
        r'research indicates'
    ]
    
    claims = []
    for pattern in claim_patterns:
        matches = re.findall(pattern, content, re.IGNORECASE)
        claims.extend(matches)
    
    return claims

def verify_claim(claim):
    # Mock fact-checking API call
    try:
        response = requests.get(
            'https://api.factcheck.example.com/verify',
            params={'claim': claim},
            timeout=5
        )
        return response.json().get('verified', False)
    except:
        # If fact-checking fails, err on the side of caution
        return False

if __name__ == "__main__":
    content = sys.stdin.read()
    if fact_check(content):
        sys.exit(0)  # Success
    else:
        sys.exit(1)  # Failure
```

**`/scripts/optimize-length.py`**
```python
#!/usr/bin/env python3
import sys
import argparse
import textwrap

def optimize_length(content, max_length):
    if len(content) <= max_length:
        return content
    
    # Try to truncate at sentence boundaries
    sentences = content.split('. ')
    optimized = ""
    
    for sentence in sentences:
        if len(optimized + sentence + '. ') <= max_length - 3:  # Leave room for "..."
            optimized += sentence + '. '
        else:
            break
    
    if optimized:
        return optimized.rstrip() + "..."
    else:
        # If even the first sentence is too long, truncate it
        return content[:max_length-3] + "..."

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument('--max-length', type=int, default=400)
    args = parser.parse_args()
    
    content = sys.stdin.read().strip()
    print(optimize_length(content, args.max_length))
```

## Example 3: E-commerce Product Updates

An e-commerce company wants to post product updates with different formatting for different platforms.

### Configuration

```toml
# Provider: New Product Announcements
[[bot.providers]]
name = "new-products"
type = "jsoncommand"
cronSchedule = "0 10 * * *"  # Daily at 10 AM
enabled = true
accounts = ["ecommerce-main"]
visibility = "public"

[bot.providers.config]
command = "curl -s https://api.shop.example.com/products/new?since=24h"
template = "{{#each products}}🛍️ NEW: {{name}}\n💰 ${{price}}\n{{description}}\n🛒 {{url}}\n\n{{/each}}"

# Middleware for product announcements
[[bot.providers.middleware]]
name = "price-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "regex"
pattern = "\\$([0-9]+)"
action = "continue"

[[bot.providers.middleware]]
name = "inventory-check"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/check-inventory.py"
mode = "validate"
useStdin = true
skipOnFailure = true
skipReason = "Product out of stock"

[[bot.providers.middleware]]
name = "product-formatter"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/format-product.py --platform=mastodon"
mode = "replace"
useStdin = true

[[bot.providers.middleware]]
name = "shopping-hashtags"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n#shopping #newproducts #deals"

# Provider: Sale Alerts
[[bot.providers]]
name = "sale-alerts"
type = "push"
enabled = true
accounts = ["ecommerce-main"]
visibility = "public"
webhookPath = "/webhook/sales"

[bot.providers.config]
rateLimit = 3
rateLimitWindow = 3600

# Middleware for sale alerts
[[bot.providers.middleware]]
name = "discount-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "regex"
pattern = "([0-9]+)% off"
action = "continue"

[[bot.providers.middleware]]
name = "sale-formatter"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "prepend"
prefix = "🔥 FLASH SALE: "

[[bot.providers.middleware]]
name = "urgency-adder"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n⏰ Limited time only!"
```

## Example 4: DevOps Monitoring and Alerts

A DevOps team wants to post system alerts and monitoring updates with different severity levels.

### Configuration

```toml
# Provider: System Monitoring
[[bot.providers]]
name = "system-monitoring"
type = "jsoncommand"
cronSchedule = "*/5 * * * *"  # Every 5 minutes
enabled = true
accounts = ["devops-alerts"]
visibility = "direct"

[bot.providers.config]
command = "curl -s http://monitoring.internal/api/alerts"
template = "{{#each alerts}}🚨 {{severity}}: {{message}}\nService: {{service}}\nTime: {{timestamp}}\n\n{{/each}}"

# Middleware for monitoring alerts
[[bot.providers.middleware]]
name = "severity-filter"
type = "filter"
enabled = true
[bot.providers.middleware.config]
type = "regex"
pattern = "(CRITICAL|HIGH)"
action = "continue"

[[bot.providers.middleware]]
name = "alert-deduplicator"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/deduplicate-alerts.py"
mode = "validate"
useStdin = true
skipOnFailure = true
skipReason = "Duplicate alert suppressed"

[[bot.providers.middleware]]
name = "alert-enricher"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/enrich-alert.py"
mode = "replace"
useStdin = true

[[bot.providers.middleware]]
name = "oncall-notifier"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/notify-oncall.py"
mode = "append"
useStdin = true

# Provider: Deployment Notifications
[[bot.providers]]
name = "deployments"
type = "push"
enabled = true
accounts = ["devops-updates"]
visibility = "unlisted"
webhookPath = "/webhook/deployments"

# Middleware for deployments
[[bot.providers.middleware]]
name = "deployment-formatter"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "prepend"
prefix = "🚀 DEPLOYMENT: "

[[bot.providers.middleware]]
name = "environment-tagger"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/tag-environment.py"
mode = "append"
useStdin = true
```

## Example 5: Content Creator Workflow

A content creator wants to automatically post across multiple platforms with platform-specific formatting.

### Configuration

```toml
# Provider: Blog Posts
[[bot.providers]]
name = "blog-posts"
type = "rssfeed"
cronSchedule = "0 */2 * * *"  # Every 2 hours
enabled = true
accounts = ["creator-main"]
visibility = "public"

[bot.providers.config]
url = "https://blog.creator.com/feed.xml"
template = "📝 New Blog Post: {{title}}\n\n{{description}}\n\n🔗 {{link}}"

# Middleware for blog posts
[[bot.providers.middleware]]
name = "content-enhancer"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/enhance-content.py --add-emojis --optimize-hashtags"
mode = "replace"
useStdin = true

[[bot.providers.middleware]]
name = "engagement-optimizer"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n💬 What do you think? Let me know in the comments!"

[[bot.providers.middleware]]
name = "creator-hashtags"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n#blog #content #creator #writing"

# Provider: YouTube Videos
[[bot.providers]]
name = "youtube-videos"
type = "jsoncommand"
cronSchedule = "0 12,18 * * *"  # Twice daily
enabled = true
accounts = ["creator-main"]
visibility = "public"

[bot.providers.config]
command = "python3 /scripts/get-youtube-videos.py --channel-id=UC123456"
template = "🎥 New Video: {{title}}\n\n{{description}}\n\n▶️ {{url}}"

# Middleware for YouTube videos
[[bot.providers.middleware]]
name = "video-formatter"
type = "command"
enabled = true
[bot.providers.middleware.config]
command = "python3 /scripts/format-video-post.py"
mode = "replace"
useStdin = true

[[bot.providers.middleware]]
name = "video-hashtags"
type = "text_transform"
enabled = true
[bot.providers.middleware.config]
transform = "append"
suffix = "\n\n#youtube #video #tutorial #howto"
```

## Integration Best Practices

### 1. Error Handling
Always implement proper error handling in external scripts:

```python
#!/usr/bin/env python3
import sys
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

try:
    # Your processing logic here
    content = sys.stdin.read()
    result = process_content(content)
    print(result)
    sys.exit(0)
except Exception as e:
    logger.error(f"Processing failed: {e}")
    sys.exit(1)
```

### 2. Configuration Management
Use environment variables for sensitive configuration:

```bash
# In your scripts
API_KEY=${CONTENT_API_KEY:-"default-key"}
WEBHOOK_SECRET=${WEBHOOK_SECRET:-"default-secret"}
```

### 3. Monitoring and Logging
Enable debug logging to monitor middleware execution:

```toml
[logging]
level = "debug"
```

### 4. Testing
Test your middleware chains with the CLI:

```bash
# Test a specific provider
buntspecht --test-provider news-feed

# Test all providers
buntspecht --test-post
```

### 5. Performance Optimization
- Use appropriate timeouts for external commands
- Implement caching in scripts when possible
- Monitor middleware execution times in logs
- Use filters early in the chain to skip unnecessary processing

These examples demonstrate how Buntspecht's middleware system can be used to create sophisticated, real-world content processing pipelines that are both powerful and maintainable.