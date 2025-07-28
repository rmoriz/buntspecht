# RSS/Atom Feed Provider

The RSS Feed Provider allows Buntspecht to fetch and post content from RSS and Atom feeds. It supports various feed formats and includes robust error handling, caching, and customization options.

## Features

- ✅ **RSS 2.0 and Atom feed support** - Works with both RSS and Atom feed formats
- ✅ **Automatic deduplication** - Prevents posting duplicate items using intelligent caching
- ✅ **Retry mechanism** - Configurable retry attempts with exponential backoff
- ✅ **Content cleaning** - Automatically removes HTML tags from feed content
- ✅ **Flexible scheduling** - Use cron expressions for custom posting schedules
- ✅ **Error resilience** - Graceful handling of network failures and malformed feeds
- ✅ **Customizable limits** - Control how many items to process per fetch

## Basic Configuration

```toml
[[providers]]
name = "tech-news"
type = "rssfeed"  # or "rss" as alias
feedUrl = "https://feeds.feedburner.com/TechCrunch"
schedule = "0 */2 * * *"  # Every 2 hours
```

## Configuration Options

### Required Settings

| Option | Type | Description |
|--------|------|-------------|
| `feedUrl` | string | The URL of the RSS/Atom feed (must be HTTP/HTTPS) |

### Optional Settings

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `timeout` | number | 30000 | Request timeout in milliseconds |
| `userAgent` | string | "Buntspecht RSS Reader/1.0" | Custom User-Agent header |
| `maxItems` | number | 10 | Maximum number of items to process per fetch |
| `retries` | number | 3 | Number of retry attempts on network failure |

### Cache Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `cache.enabled` | boolean | true | Enable/disable item deduplication |
| `cache.ttl` | number | 3600 | Cache TTL in seconds |
| `cache.maxSize` | number | 1000 | Maximum cache entries |
| `cache.filePath` | string | "./cache/rssfeed-cache.json" | Cache file location |

## Examples

### Basic RSS Feed

```toml
[[providers]]
name = "bbc-news"
type = "rssfeed"
feedUrl = "https://feeds.bbci.co.uk/news/rss.xml"
schedule = "0 */1 * * *"  # Every hour
```

### Custom Configuration

```toml
[[providers]]
name = "hacker-news"
type = "rss"
feedUrl = "https://hnrss.org/frontpage"
schedule = "0 */30 * * *"  # Every 30 minutes
timeout = 15000           # 15 second timeout
maxItems = 5              # Process max 5 items
retries = 2               # Retry twice on failure
userAgent = "MyBot/1.0"   # Custom user agent

[providers.cache]
enabled = true
ttl = 7200                # 2 hour cache TTL
filePath = "./cache/hn-rss.json"
```

### Disabled Caching

```toml
[[providers]]
name = "reddit-programming"
type = "rssfeed"
feedUrl = "https://www.reddit.com/r/programming/.rss"
schedule = "0 */15 * * *"

[providers.cache]
enabled = false  # Disable deduplication
```

### Multiple Feeds

```toml
# Development blogs
[[providers]]
name = "dev-blogs"
type = "rssfeed"
feedUrl = "https://dev.to/feed"
schedule = "0 8,12,18 * * *"  # 3 times a day

# GitHub releases
[[providers]]
name = "github-releases"
type = "rssfeed"
feedUrl = "https://github.com/microsoft/vscode/releases.atom"
schedule = "0 */6 * * *"  # Every 6 hours
maxItems = 3              # Only latest 3 releases
```

## Feed Format Support

The RSS provider automatically detects and handles:

- **RSS 2.0** feeds with `pubDate` timestamps
- **Atom** feeds with `isoDate` timestamps  
- **Custom feeds** with `id` fields for deduplication
- **Mixed content** formats (description, content, contentSnippet)

## Content Processing

### Item Formatting

Each feed item is formatted as:
```
{title}
{link}
{content}
```

Where `{content}` is automatically selected from:
1. `contentSnippet` (preferred for clean text)
2. `content` (full content)
3. `description` (fallback)

### HTML Cleaning

HTML tags are automatically stripped from content:
```html
<!-- Input -->
<p>This is <strong>bold</strong> text with <a href="#">links</a></p>

<!-- Output -->
This is bold text with links
```

## Error Handling

### Network Failures
- Automatic retry with exponential backoff (1s, 2s, 4s)
- Configurable retry attempts
- Detailed error logging

### Malformed Feeds
- Graceful handling of missing or null items
- Validation of feed structure
- Fallback to empty content for missing fields

### Invalid URLs
- URL validation at startup
- Support for HTTP and HTTPS only
- Clear error messages for invalid formats

## Caching and Deduplication

### How It Works
1. Each feed item gets a unique key from `pubDate`, `isoDate`, or `id`
2. Processed items are stored in a local cache file
3. Only new items (not in cache) are posted
4. Cache persists between restarts

### Cache Management
- Automatic cache file creation
- Configurable cache location
- TTL-based cache expiration
- Size limits to prevent unbounded growth

## Troubleshooting

### Common Issues

**Feed not updating:**
- Check if feed URL is accessible
- Verify feed contains new items
- Check cache settings (may need to clear cache)

**Network timeouts:**
- Increase `timeout` value
- Check network connectivity
- Verify feed server is responsive

**Too many/few items:**
- Adjust `maxItems` setting
- Check feed's item count
- Review caching configuration

### Debug Logging

Enable debug logging to see detailed feed processing:
```toml
[logging]
level = "debug"
```

This will show:
- Feed fetch attempts and retries
- Number of items processed
- Cache operations
- Error details

## Best Practices

1. **Set appropriate schedules** - Don't fetch feeds too frequently
2. **Use caching** - Prevents duplicate posts and reduces server load
3. **Configure timeouts** - Set reasonable timeouts for feed servers
4. **Monitor logs** - Watch for network issues or feed changes
5. **Test feeds** - Verify feed URLs work before deployment

## Integration with Social Media

RSS feeds work with all supported social media platforms:

```toml
# RSS provider
[[providers]]
name = "tech-news"
type = "rssfeed"
feedUrl = "https://example.com/feed.xml"

# Social media accounts
[[accounts]]
name = "mastodon-main"
type = "mastodon"
instanceUrl = "https://mastodon.social"
accessToken = "your-token"

[[accounts]]
name = "bluesky-main"
type = "bluesky"
handle = "your-handle.bsky.social"
password = "your-app-password"

# Post to both platforms
[[schedules]]
provider = "tech-news"
accounts = ["mastodon-main", "bluesky-main"]
```