# YouTube Shorts Filter Middleware

Die YouTube Shorts Filter Middleware erkennt YouTube Shorts URLs und kann diese automatisch herausfiltern, um nur reguläre YouTube-Videos zu posten.

## Funktionsweise

1. **URL-Erkennung**: Erkennt verschiedene YouTube Shorts URL-Formate
2. **Kontext-Analyse**: Sucht nach "shorts" Schlüsselwörtern in der Nähe von YouTube-URLs
3. **Filterung**: Überspringt Nachrichten mit Shorts basierend auf der Konfiguration
4. **Metadaten**: Speichert Erkennungsinformationen für weitere Verarbeitung

## Erkannte URL-Formate

### Direkte Shorts URLs
- `https://www.youtube.com/shorts/VIDEO_ID`
- `https://m.youtube.com/shorts/VIDEO_ID`
- `https://www.youtube.com/shorts/VIDEO_ID?parameter=value`

### Kontext-basierte Erkennung
- YouTube-URLs mit "shorts" oder "short" im umgebenden Text (±50 Zeichen)
- Beispiel: "Neues YouTube Shorts Video: https://www.youtube.com/watch?v=VIDEO_ID"

## Konfiguration

### Basis-Konfiguration

```toml
[[providers.middleware]]
name = "shorts-filter"
type = "youtube_shorts_filter"
enabled = true

[providers.middleware.config]
skipShorts = true
```

### Konfigurationsoptionen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `skipShorts` | boolean | `true` | Ob YouTube Shorts übersprungen werden sollen |
| `skipReason` | string | `"YouTube Shorts werden übersprungen"` | Grund für das Überspringen |
| `logSkipped` | boolean | `true` | Ob das Überspringen geloggt werden soll |

## Anwendungsfälle

### 1. Nur reguläre Videos posten

```toml
[[providers]]
name = "youtube-channel"
type = "rssfeed"
schedule = "*/5 * * * *"

[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_CHANNEL_ID"

[[providers.middleware]]
name = "no-shorts"
type = "youtube_shorts_filter"
enabled = true

[providers.middleware.config]
skipShorts = true
skipReason = "Nur ausführliche Videos werden geteilt"
logSkipped = true
```

### 2. Shorts erkennen aber nicht filtern

```toml
[[providers.middleware]]
name = "shorts-tracker"
type = "youtube_shorts_filter"
enabled = true

[providers.middleware.config]
skipShorts = false  # Shorts werden nicht übersprungen
logSkipped = true   # Aber Erkennung wird geloggt
```

### 3. Stille Filterung

```toml
[[providers.middleware]]
name = "silent-filter"
type = "youtube_shorts_filter"
enabled = true

[providers.middleware.config]
skipShorts = true
logSkipped = false  # Keine Log-Ausgaben
skipReason = "Shorts automatisch gefiltert"
```

## Kombination mit anderen Middleware

### Shorts filtern + Untertitel hinzufügen

```toml
# Erst Shorts herausfiltern
[[providers.middleware]]
name = "filter-shorts"
type = "youtube_shorts_filter"
enabled = true

[providers.middleware.config]
skipShorts = true

# Dann Untertitel zu verbleibenden Videos hinzufügen
[[providers.middleware]]
name = "add-captions"
type = "youtube_caption"
enabled = true

[providers.middleware.config]
mode = "append"
separator = "\n\n📝 Transkript:\n"
```

### Verschiedene Kanäle, verschiedene Regeln

```toml
# Hauptkanal: Keine Shorts
[[providers]]
name = "main-channel"
type = "rssfeed"
[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=MAIN_CHANNEL"

[[providers.middleware]]
name = "main-no-shorts"
type = "youtube_shorts_filter"
[providers.middleware.config]
skipShorts = true
skipReason = "Hauptkanal: Nur reguläre Videos"

# Shorts-Kanal: Alles erlauben
[[providers]]
name = "shorts-channel"
type = "rssfeed"
[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=SHORTS_CHANNEL"

[[providers.middleware]]
name = "shorts-allow"
type = "youtube_shorts_filter"
[providers.middleware.config]
skipShorts = false  # Shorts erlauben
```

## Erkennungslogik

### Direkte URL-Erkennung
Die Middleware verwendet Regex-Patterns zur Erkennung von Shorts-URLs:

```javascript
// Beispiel-Patterns
/youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/i
/m\.youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}/i
```

### Kontext-Analyse
Zusätzlich wird der Text um YouTube-URLs (±50 Zeichen) nach "shorts" oder "short" durchsucht:

```
"Neues YouTube Shorts Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                    ^^^^^^ erkannt
```

### Falsch-Positive vermeiden
Die Middleware ist intelligent genug, um unrelated "shorts" Erwähnungen zu ignorieren:

```
"Ich habe neue Shorts gekauft. Video: https://www.youtube.com/watch?v=dQw4w9WgXcQ"
                                                                    ^^^^^^^^^^^^^ nicht als Shorts erkannt
```

## Metadaten

Die Middleware speichert folgende Metadaten im Context:

- `{name}_shorts_detected`: Boolean - Ob Shorts erkannt wurden
- `{name}_original_text`: String - Ursprünglicher Text (nur bei übersprungenen Nachrichten)

## Logging

### Debug-Level
- URL-Pattern-Matches
- Kontext-Analyse-Ergebnisse
- Konfigurationsinformationen

### Info-Level
- Übersprungene Nachrichten (wenn `logSkipped = true`)

### Error-Level
- Middleware-Fehler (Verarbeitung wird fortgesetzt)

## Beispiel-Logs

```
[DEBUG] YouTubeShortsFilterMiddleware shorts-filter: Detected YouTube Shorts URL with pattern: youtube\.com\/shorts\/[a-zA-Z0-9_-]{11}
[INFO] YouTubeShortsFilterMiddleware shorts-filter: Skipped message containing YouTube Shorts
```

## Performance

- **Regex-Performance**: Optimierte Patterns für schnelle Erkennung
- **Kontext-Suche**: Begrenzt auf ±50 Zeichen um URLs
- **Memory**: Minimaler Speicherverbrauch
- **CPU**: Sehr geringe CPU-Last

## Fehlerbehandlung

- **Graceful Degradation**: Bei Fehlern wird die Middleware übersprungen
- **Fortsetzung**: Fehler stoppen nicht die gesamte Middleware-Kette
- **Logging**: Alle Fehler werden geloggt

## Kompatibilität

- **Provider**: Funktioniert mit allen Message-Providern
- **Plattformen**: Kompatibel mit allen unterstützten Social Media Plattformen
- **Middleware-Kette**: Kann an jeder Position in der Middleware-Kette stehen

## Best Practices

### 1. Frühe Filterung
Platzieren Sie die Shorts-Filter-Middleware früh in der Kette, um unnötige Verarbeitung zu vermeiden:

```toml
# Gut: Shorts zuerst filtern
[[providers.middleware]]
name = "filter-shorts"
type = "youtube_shorts_filter"

[[providers.middleware]]
name = "expensive-processing"
type = "youtube_caption"
```

### 2. Klare Skip-Reasons
Verwenden Sie aussagekräftige Skip-Reasons für besseres Debugging:

```toml
[providers.middleware.config]
skipReason = "Kanal-Policy: Nur Videos >60 Sekunden"
```

### 3. Logging-Strategie
- Development: `logSkipped = true`
- Production: `logSkipped = false` (um Log-Spam zu vermeiden)

### 4. Testing
Testen Sie mit verschiedenen URL-Formaten:

```toml
# Test-Konfiguration
[providers.middleware.config]
skipShorts = false  # Alles durchlassen für Tests
logSkipped = true   # Aber Erkennung loggen
```

## Troubleshooting

### Shorts werden nicht erkannt
1. Prüfen Sie die URL-Formate in den Logs
2. Aktivieren Sie Debug-Logging
3. Überprüfen Sie die Kontext-Analyse

### Falsch-Positive
1. Überprüfen Sie den umgebenden Text
2. Passen Sie die Kontext-Analyse an (falls nötig)
3. Verwenden Sie spezifischere Patterns

### Performance-Probleme
1. Begrenzen Sie die Anzahl der URLs pro Nachricht
2. Optimieren Sie Regex-Patterns
3. Überwachen Sie die Verarbeitungszeit