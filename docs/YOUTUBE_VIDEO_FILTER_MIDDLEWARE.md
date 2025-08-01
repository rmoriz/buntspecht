# YouTube Video Filter Middleware

The YouTube Video Filter Middleware allows you to filter YouTube videos in RSS feeds based on video length and title patterns. This middleware is particularly useful for curating content from YouTube channels by applying sophisticated filtering criteria.

## Features

- **Video Length Filtering**: Filter videos by minimum and maximum duration
- **Title Pattern Filtering**: Include/exclude videos based on title patterns
- **Regex Support**: Use regular expressions for advanced pattern matching
- **Metadata Caching**: Cache video metadata to reduce API calls
- **Multiple URL Formats**: Supports various YouTube URL formats
- **Performance Optimized**: Configurable timeouts, retries, and caching

## Configuration

### Basic Configuration

```toml
[[bot.providers.middleware]]
name = "video-filter"
type = "youtube_video_filter"
enabled = true

[bot.providers.middleware.config]
# Enable video length filtering
enableLengthFilter = true
minLengthSeconds = 60      # 1 minute minimum
maxLengthSeconds = 1800    # 30 minutes maximum

# Title filtering
titleInclude = ["tutorial", "guide", "review"]
titleExclude = ["shorts", "live", "reaction"]

# Logging
logSkipped = true
skipReason = "Video filtered by criteria"
```

### Advanced Configuration

```toml
[bot.providers.middleware.config]
# Length filtering
enableLengthFilter = true
minLengthSeconds = 300     # 5 minutes
maxLengthSeconds = 3600    # 1 hour

# Title filtering with regex
titleInclude = [
    "^Tutorial:",          # Must start with "Tutorial:"
    "\\d{4} Review",       # Year + "Review"
    "\\b(Python|JavaScript)\\b"  # Programming languages
]
titleExclude = [
    "\\[LIVE\\]",          # Live streams
    "shorts?",             # Shorts (with optional 's')
    "\\breaction\\b"       # Reaction videos
]

# Pattern options
caseSensitive = false      # Case-insensitive matching
useRegex = true           # Enable regex patterns

# Performance settings
timeout = 10000           # 10 second timeout
retries = 2               # 2 retry attempts
cacheDuration = 3600000   # 1 hour cache

# Logging
logSkipped = true         # Log filtered videos
logDetails = false        # Detailed debug logging
```

## Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableLengthFilter` | boolean | false | Enable video length filtering |
| `minLengthSeconds` | number | 0 | Minimum video length in seconds |
| `maxLengthSeconds` | number | ∞ | Maximum video length in seconds |
| `titleInclude` | string[] | [] | Title patterns to include (positive filter) |
| `titleExclude` | string[] | [] | Title patterns to exclude (negative filter) |
| `caseSensitive` | boolean | false | Case-sensitive pattern matching |
| `useRegex` | boolean | false | Use regex for pattern matching |
| `skipReason` | string | "Video filtered..." | Custom skip reason |
| `logSkipped` | boolean | true | Log when videos are skipped |
| `logDetails` | boolean | false | Enable detailed logging |
| `timeout` | number | 10000 | API request timeout (ms) |
| `retries` | number | 2 | Number of retry attempts |
| `cacheDuration` | number | 3600000 | Cache duration (ms) |

## Supported YouTube URL Formats

The middleware automatically detects and processes these YouTube URL formats:

- `https://www.youtube.com/watch?v=VIDEO_ID`
- `https://youtu.be/VIDEO_ID`
- `https://www.youtube.com/embed/VIDEO_ID`
- `https://music.youtube.com/watch?v=VIDEO_ID`

## How It Works

1. **URL Detection**: Extracts YouTube video IDs from RSS feed messages
2. **Metadata Fetching**: Retrieves video metadata (title, duration) from YouTube
3. **Length Filtering**: Applies minimum/maximum duration filters if enabled
4. **Title Filtering**: Applies include/exclude pattern filters to video titles
5. **Caching**: Stores metadata in memory cache to reduce API calls
6. **Decision**: Skips message if any video fails the filters

## Filter Logic

### Length Filtering
- Videos shorter than `minLengthSeconds` are skipped
- Videos longer than `maxLengthSeconds` are skipped
- Disabled by default (`enableLengthFilter = false`)

### Title Filtering
- **Exclude patterns**: If any exclude pattern matches, video is skipped
- **Include patterns**: If specified, at least one must match (or video is skipped)
- **Pattern matching**: Supports both simple string contains and regex

### Filter Precedence
1. Exclude patterns are checked first
2. Include patterns are checked second
3. Length filters are applied last

## Common Use Cases

### Educational Content Curation
```toml
[bot.providers.middleware.config]
enableLengthFilter = true
minLengthSeconds = 600     # 10+ minute videos only
titleInclude = ["tutorial", "lecture", "course", "explained"]
titleExclude = ["shorts", "quick", "summary"]
```

### Tech News Filtering
```toml
[bot.providers.middleware.config]
enableLengthFilter = true
minLengthSeconds = 120
maxLengthSeconds = 900
useRegex = true
titleInclude = ["^Tech News:", "\\d{4} Review", "\\b(iPhone|Android)\\b"]
titleExclude = ["\\[LIVE\\]", "shorts?", "\\bunboxing\\b"]
```

### Gaming Content
```toml
[bot.providers.middleware.config]
titleInclude = ["gameplay", "walkthrough", "review", "guide"]
titleExclude = ["shorts", "stream", "live", "rage", "fail"]
```

## Regex Pattern Examples

### Common Patterns
```toml
# Time-based
titleInclude = [
    "\\d{4}",                    # Year (2024)
    "\\b(January|February)\\b",  # Month names
    "\\d{1,2}:\\d{2}"           # Time format (12:34)
]

# Content type
titleInclude = [
    "^Tutorial:",               # Must start with "Tutorial:"
    "\\[.*\\]",                 # Text in brackets
    "\\b(Part|Episode)\\s+\\d+" # Part/Episode numbers
]

# Technology
titleInclude = [
    "\\b(JavaScript|Python|React)\\b",     # Programming languages
    "\\b(iPhone|Android|iOS)\\b",          # Mobile platforms
    "\\b(AI|ML|Machine Learning)\\b"       # AI/ML content
]

# Exclusions
titleExclude = [
    "\\b(shorts?|live)\\b",     # Shorts or live
    "\\[LIVE\\]",               # Live indicator
    "\\breaction\\b"            # Reaction videos
]
```

## Performance Considerations

### Caching
- Video metadata is cached to reduce API calls
- Default cache duration: 1 hour
- Cache is cleaned up automatically
- Adjust `cacheDuration` based on your needs

### API Limits
- Uses YouTube oEmbed API (no API key required)
- Falls back to page scraping for duration
- Configurable timeout and retry settings
- Consider rate limiting for high-volume channels

### Optimization Tips
```toml
# For high-volume channels
[bot.providers.middleware.config]
timeout = 5000         # Shorter timeout
retries = 1            # Fewer retries
cacheDuration = 7200000 # Longer cache (2 hours)
logSkipped = false     # Disable logging
useRegex = false       # Simple string matching
```

## Troubleshooting

### Enable Debug Logging
```toml
[bot.providers.middleware.config]
logDetails = true
logSkipped = true
```

### Test Regex Patterns
- Use online tools like regex101.com
- Remember to escape backslashes in TOML strings
- Test with actual video titles from your feeds

### Common Issues
1. **No videos detected**: Check URL formats in RSS feed
2. **All videos skipped**: Review filter criteria, start permissive
3. **Slow performance**: Reduce timeout, increase cache duration
4. **Regex errors**: Validate patterns, check escaping

## Integration with Other Middleware

The YouTube Video Filter Middleware works well with other middleware:

```toml
# Chain multiple filters
[[bot.providers.middleware]]
name = "no-shorts"
type = "youtube_shorts_filter"

[[bot.providers.middleware]]
name = "video-filter"
type = "youtube_video_filter"

[[bot.providers.middleware]]
name = "add-captions"
type = "youtube_caption"
```

## Examples

See `examples/configuration/config.youtube-video-filter.example.toml` for comprehensive configuration examples including:

- Educational content curation
- Tech news filtering
- Gaming content filtering
- Multi-filter chains
- Performance optimization
- Regex pattern examples

## API Reference

The middleware implements the `MessageMiddleware` interface and provides:

- Automatic YouTube URL detection
- Video metadata fetching and caching
- Configurable filtering logic
- Comprehensive logging and telemetry
- Graceful error handling

For implementation details, see `src/services/middleware/builtin/YouTubeVideoFilterMiddleware.ts`.