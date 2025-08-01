# RSS Feed Encoding Support

Buntspecht's RSS Feed Provider now includes comprehensive encoding detection and conversion support to ensure proper handling of RSS feeds with various character encodings.

## Overview

Many RSS feeds are published with different character encodings such as ISO-8859-1, Windows-1252, or various UTF encodings. Without proper encoding handling, special characters like accented letters, smart quotes, or non-Latin scripts may appear as garbled text or cause parsing errors.

The RSS Feed Provider now automatically:
- Detects the correct encoding from multiple sources
- Converts content to UTF-8 for consistent processing
- Handles encoding errors gracefully
- Supports a wide range of character encodings

## Supported Encodings

The provider supports all encodings available in the `iconv-lite` library, including:

### Common Encodings
- **UTF-8** - Unicode (most modern feeds)
- **UTF-16** (BE/LE) - Unicode with byte order marks
- **ISO-8859-1** (Latin-1) - Western European languages
- **ISO-8859-2** (Latin-2) - Central/Eastern European languages
- **ISO-8859-15** (Latin-9) - Western European with Euro symbol
- **Windows-1252** (CP1252) - Western European (Microsoft)
- **Windows-1251** (CP1251) - Cyrillic (Microsoft)
- **ASCII** - Basic ASCII characters

### Additional Encodings
- Various ISO-8859-* variants
- Windows code pages (CP*)
- And many more via iconv-lite

## Encoding Detection Process

The provider uses a multi-step detection process with the following priority:

### 1. HTTP Content-Type Header (Highest Priority)
```
Content-Type: application/rss+xml; charset=UTF-8
Content-Type: text/xml; charset=ISO-8859-1
```

### 2. XML Declaration
```xml
<?xml version="1.0" encoding="UTF-8"?>
<?xml version="1.0" encoding="ISO-8859-1"?>
```

### 3. Byte Order Mark (BOM) Detection
- UTF-8 BOM: `EF BB BF`
- UTF-16 BE BOM: `FE FF`
- UTF-16 LE BOM: `FF FE`

### 4. Automatic Detection (jschardet)
Uses statistical analysis to detect encoding with confidence scoring.

### 5. UTF-8 Fallback
If no encoding is detected, defaults to UTF-8 with error tolerance.

## Configuration

No additional configuration is required. Encoding detection and conversion happen automatically for all RSS feeds.

### Optional Settings
```toml
[[bot.providers]]
name = "international-feed"
type = "rssfeed"
enabled = true
schedule = "*/30 * * * *"

[bot.providers.config]
feedUrl = "https://example.com/feed.xml"
# Standard RSS provider settings work with any encoding
timeout = 30000
retries = 3
userAgent = "Buntspecht RSS Reader/1.0"
```

## Examples

### German Feed with Umlauts (ISO-8859-1)
```xml
<?xml version="1.0" encoding="ISO-8859-1"?>
<rss version="2.0">
  <channel>
    <title>Nachrichten</title>
    <item>
      <title>Müller über Fußball</title>
      <description>Ein Artikel über Fußball...</description>
    </item>
  </channel>
</rss>
```
**Result**: Properly converted to UTF-8, umlauts display correctly.

### French Feed with Accents (Windows-1252)
```xml
<?xml version="1.0"?>
<rss version="2.0">
  <channel>
    <title>Actualités</title>
    <item>
      <title>Café et résumé</title>
      <description>Un article sur le café...</description>
    </item>
  </channel>
</rss>
```
**Result**: Accented characters properly converted and displayed.

### Russian Feed (Windows-1251)
```xml
<?xml version="1.0" encoding="windows-1251"?>
<rss version="2.0">
  <channel>
    <title>Новости</title>
    <item>
      <title>Статья на русском</title>
      <description>Содержание статьи...</description>
    </item>
  </channel>
</rss>
```
**Result**: Cyrillic characters properly converted to UTF-8.

## Logging

The provider logs encoding detection information at debug level:

```
[DEBUG] RSS feed encoding detected: ISO-8859-1 for https://example.com/feed.xml
[DEBUG] Encoding from HTTP header: UTF-8
[DEBUG] Converted RSS feed from ISO-8859-1 to UTF-8
[DEBUG] UTF-8 BOM detected
```

To see encoding information, set logging level to debug:
```toml
[logging]
level = "debug"
```

## Error Handling

### Graceful Fallbacks
- **Unknown encoding**: Falls back to UTF-8 with error tolerance
- **Conversion errors**: Attempts UTF-8 decode with replacement characters
- **Network errors**: Standard retry logic applies
- **Malformed content**: Parser handles as best as possible

### Warning Messages
```
[WARN] Unknown encoding CUSTOM-ENCODING, falling back to UTF-8 decode
[WARN] Encoding conversion failed, using UTF-8 fallback
```

## Performance Considerations

### Minimal Overhead
- Encoding detection adds minimal processing time
- Content is fetched once and processed efficiently
- Caching works normally with converted content

### Memory Usage
- Raw content is processed in memory
- Conversion happens before RSS parsing
- No significant memory overhead

### Network Efficiency
- Same number of HTTP requests
- Standard timeout and retry logic
- No additional network calls for encoding detection

## Troubleshooting

### Common Issues

#### Garbled Characters
**Symptoms**: Special characters appear as `?` or strange symbols
**Solution**: Enable debug logging to see detected encoding
```toml
[logging]
level = "debug"
```

#### Parsing Errors
**Symptoms**: RSS parsing fails with encoding-related errors
**Solution**: Check if the feed has malformed encoding declarations

#### Performance Issues
**Symptoms**: Slow RSS processing
**Solution**: Verify network connectivity and feed response times

### Debug Information

Enable detailed logging to troubleshoot encoding issues:
```toml
[logging]
level = "debug"
```

Look for these log messages:
- `RSS feed encoding detected: [encoding]`
- `Encoding from HTTP header: [encoding]`
- `Encoding from XML declaration: [encoding]`
- `Converted RSS feed from [source] to UTF-8`

### Manual Testing

Test encoding detection with curl:
```bash
# Check HTTP headers
curl -I https://example.com/feed.xml

# Check XML declaration
curl -s https://example.com/feed.xml | head -n 5

# Check for BOM
curl -s https://example.com/feed.xml | hexdump -C | head -n 3
```

## Migration Notes

### Existing Configurations
- No changes required to existing RSS provider configurations
- Encoding detection is automatic and backward compatible
- Previously working feeds continue to work

### New Dependencies
The encoding support adds two new dependencies:
- `iconv-lite`: Character encoding conversion
- `jschardet`: Automatic encoding detection

These are automatically installed with Buntspecht.

## Technical Details

### Implementation
- Uses `fetch()` with `arrayBuffer()` to get raw bytes
- Analyzes HTTP headers and content for encoding hints
- Converts to UTF-8 using `iconv-lite` when needed
- Passes converted content to RSS parser

### Encoding Priority
1. HTTP `Content-Type` charset parameter
2. XML declaration encoding attribute
3. Byte Order Mark (BOM) detection
4. Statistical analysis (jschardet)
5. UTF-8 fallback

### Error Recovery
- Invalid encoding names fall back to UTF-8
- Conversion errors use replacement characters
- Network errors follow standard retry logic
- Malformed content is handled gracefully

## Best Practices

### For Feed Publishers
- Always specify encoding in HTTP headers
- Include encoding in XML declaration
- Use UTF-8 when possible for maximum compatibility
- Test feeds with international characters

### For Buntspecht Users
- Enable debug logging when troubleshooting
- Monitor logs for encoding warnings
- Report feeds that don't work correctly
- Use appropriate templates for international content

## Related Documentation

- [RSS Feed Provider](RSS_FEED_PROVIDER.md)
- [RSS Feed Filtering](RSS_FEED_FILTERING.md)
- [Message Middleware](MESSAGE_MIDDLEWARE.md)
- [Configuration Guide](../examples/configuration/README.md)