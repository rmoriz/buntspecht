# YouTube Premiere Filter Middleware

This middleware allows you to automatically filter YouTube Premiere announcements from RSS feeds by detecting the `<media:statistics views="0"/>` pattern that indicates a premiere.

## How it Works

YouTube Premieres appear in RSS feeds with a view count of 0, as they haven't been released yet. This middleware detects that pattern and can filter out these premieres to prevent them from being posted to your social media accounts.

## Configuration

Add the following to your provider's middleware configuration:

```toml
[[bot.providers.middleware]]
name = "premiere-filter"
type = "youtube_premiere_filter"
enabled = true

[bot.providers.middleware.config]
# Whether to skip YouTube Premieres (default: true)
skipPremieres = true

# Custom skip reason when premieres are found (optional)
skipReason = "YouTube Premiere wird übersprungen"

# Whether to log when premieres are skipped (default: true)
logSkipped = true
```

## Example Use Cases

1. **Filter out premieres**: Skip YouTube premiere announcements to only post actual published videos
2. **Custom premiere announcements**: Use with conditional middleware to format premiere announcements differently
3. **Selective premiere filtering**: Allow premieres from certain channels while filtering them from others

## Complete Example

See the [configuration example](../examples/configuration/config.youtube-premiere-filter.example.toml) for a full implementation.