# RSS Feed Filtering

Der RSS Feed Provider wurde um umfassende Filteroptionen erweitert, um bereits beim Abrufen der Feed-Items unerwünschte Inhalte herauszufiltern. Dies ist effizienter als nachgelagerte Middleware-Filterung.

## Funktionsweise

Die Filterung erfolgt **vor** der Verarbeitung und dem Caching, wodurch:
- ✅ Unerwünschte Items gar nicht erst verarbeitet werden
- ✅ Bessere Performance durch weniger Middleware-Aufrufe
- ✅ Saubere Cache-Daten ohne gefilterte Items
- ✅ Reduzierte API-Aufrufe an Social Media Plattformen

## Filter-Kategorien

### 1. Predefined Presets
Vorgefertigte Filter für häufige Anwendungsfälle:

```toml
[providers.config.filters.presets]
excludeYouTubeShorts = true      # YouTube Shorts herausfiltern
excludeYouTubeLive = true        # Live-Streams ausschließen
includeOnlyYouTubeVideos = true  # Nur reguläre YouTube-Videos
```

### 2. Title-Based Filtering
Filterung basierend auf dem Titel:

```toml
[providers.config.filters]
titleInclude = ["Tutorial", "Guide", "How-to"]  # Nur diese Begriffe
titleExclude = ["LIVE", "Shorts", "🔴"]        # Diese Begriffe ausschließen
```

### 3. Link-Based Filtering
Filterung basierend auf URLs:

```toml
[providers.config.filters]
linkInclude = ["youtube.com/watch"]     # Nur bestimmte URL-Patterns
linkExclude = ["/shorts/", "live_stream"] # URL-Patterns ausschließen
```

### 4. Content-Based Filtering
Filterung basierend auf Beschreibung/Inhalt:

```toml
[providers.config.filters]
contentInclude = ["programming", "tutorial"]
contentExclude = ["sponsored", "advertisement"]
```

## Konfigurationsoptionen

### Basis-Konfiguration

```toml
[[providers]]
name = "youtube-channel"
type = "rssfeed"
[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=YOUR_ID"

[providers.config.filters]
# Predefined presets
[providers.config.filters.presets]
excludeYouTubeShorts = true

# Custom filters
titleExclude = ["LIVE", "🔴"]
linkExclude = ["/shorts/"]
```

### Erweiterte Optionen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `caseSensitive` | boolean | `false` | Groß-/Kleinschreibung beachten |
| `useRegex` | boolean | `false` | Regex-Patterns verwenden |
| `titleInclude` | string[] | - | Titel-Einschluss-Patterns |
| `titleExclude` | string[] | - | Titel-Ausschluss-Patterns |
| `linkInclude` | string[] | - | Link-Einschluss-Patterns |
| `linkExclude` | string[] | - | Link-Ausschluss-Patterns |
| `contentInclude` | string[] | - | Inhalt-Einschluss-Patterns |
| `contentExclude` | string[] | - | Inhalt-Ausschluss-Patterns |

## Anwendungsbeispiele

### 1. YouTube Shorts komplett ausschließen

```toml
[providers.config.filters]
[providers.config.filters.presets]
excludeYouTubeShorts = true

# Zusätzliche manuelle Filterung
titleExclude = ["Shorts", "#Shorts"]
linkExclude = ["/shorts/"]
```

### 2. Nur Tutorial-Content

```toml
[providers.config.filters]
titleInclude = [
  "Tutorial", 
  "How to", 
  "Guide", 
  "Anleitung",
  "Erklärt"
]

contentInclude = [
  "lernen",
  "tutorial", 
  "step by step",
  "beginner"
]
```

### 3. Tech-News mit Regex-Filterung

```toml
[providers.config.filters]
useRegex = true
caseSensitive = false

# Nur AI/ML/Blockchain Artikel
titleInclude = [
  "\\b(AI|Machine Learning|Artificial Intelligence)\\b",
  "\\b(Blockchain|Cryptocurrency)\\b",
  "\\b(Cloud|AWS|Azure|GCP)\\b"
]

# Meinungsartikel ausschließen
titleExclude = [
  "^Opinion:",
  "^Editorial:",
  "\\[Meinung\\]"
]
```

### 4. Qualitäts-Filter

```toml
[providers.config.filters]
# Clickbait ausschließen
titleExclude = [
  "SHOCKING",
  "You Won't Believe",
  "URGENT",
  "BREAKING"
]

# Nur hochwertige Inhalte
contentInclude = [
  "analysis",
  "deep dive", 
  "comprehensive",
  "detailed",
  "research"
]

contentExclude = [
  "click here",
  "limited time",
  "act now"
]
```

### 5. Mehrsprachige Filterung

```toml
[providers.config.filters]
caseSensitive = true  # Wichtig für Sprachunterscheidung

# Deutsche Inhalte
titleInclude = [
  "Technologie",
  "Entwicklung", 
  "Software",
  "Programmierung"
]

# Englische Begriffe ausschließen
titleExclude = [
  "Technology",
  "Development",
  "Programming"
]
```

## Predefined Presets im Detail

### excludeYouTubeShorts
Erkennt und filtert YouTube Shorts anhand von:
- URL-Patterns: `/shorts/`, `m.youtube.com/shorts/`
- Titel-Keywords: "shorts", "short" (als ganze Wörter)

### excludeYouTubeLive
Filtert Live-Streams anhand von:
- Titel-Keywords: "live", "livestream"
- URL-Patterns: "live_stream"

### includeOnlyYouTubeVideos
Lässt nur reguläre YouTube-Videos durch:
- `youtube.com/watch?v=VIDEO_ID`
- `youtu.be/VIDEO_ID`

## Filter-Reihenfolge

1. **Presets** werden zuerst angewendet
2. **Exclude-Filter** werden vor Include-Filtern geprüft
3. **Include-Filter** müssen mindestens einen Treffer haben (wenn definiert)

```toml
# Beispiel der Verarbeitungsreihenfolge:
[providers.config.filters]
[providers.config.filters.presets]
excludeYouTubeShorts = true    # 1. Shorts entfernen

titleExclude = ["LIVE"]        # 2. Live-Videos entfernen
titleInclude = ["Tutorial"]    # 3. Nur Tutorials behalten
```

## Regex-Patterns

### Aktivierung
```toml
[providers.config.filters]
useRegex = true
```

### Beispiel-Patterns

```toml
# Semantic Versioning
titleInclude = ["v\\d+\\.\\d+\\.\\d+"]

# Wortgrenzen
titleInclude = ["\\bJavaScript\\b"]  # Nur "JavaScript", nicht "JavaScriptFramework"

# Zeilenanfang/Ende
titleExclude = ["^BREAKING:"]        # Titel die mit "BREAKING:" beginnen
titleInclude = ["Tutorial$"]         # Titel die mit "Tutorial" enden

# Optionale Gruppen
titleInclude = ["(React|Vue|Angular) Tutorial"]
```

### Regex-Fehlerbehandlung
- Ungültige Regex-Patterns werden geloggt
- Fallback auf einfache String-Suche
- Verarbeitung wird nicht unterbrochen

## Performance-Optimierung

### 1. Filter-Effizienz
```toml
# Gut: Einfache String-Suche
titleExclude = ["Shorts", "Live"]

# Weniger effizient: Regex
useRegex = true
titleExclude = ["\\b(Shorts|Live)\\b"]
```

### 2. Preset-Nutzung
```toml
# Gut: Optimierte Presets verwenden
[providers.config.filters.presets]
excludeYouTubeShorts = true

# Weniger effizient: Manuelle Patterns
linkExclude = ["/shorts/"]
titleExclude = ["Shorts"]
```

### 3. Filter-Reihenfolge
- Häufigste Ausschlüsse zuerst
- Spezifische vor allgemeinen Patterns
- Presets vor Custom-Filtern

## Logging und Debugging

### Debug-Informationen aktivieren
```toml
[logging]
level = "debug"
```

### Log-Ausgaben
```
[DEBUG] Applying filters to 25 RSS items
[DEBUG] Excluded YouTube Shorts: "Quick Tip" - https://youtube.com/shorts/abc123
[DEBUG] Item filtered out by title filter: "LIVE: Coding Session"
[INFO] RSS filters removed 8 items, 17 items remaining
```

### Monitoring
- Anzahl gefilterter Items wird geloggt
- Spezifische Ausschluss-Gründe im Debug-Modus
- Regex-Fehler werden als Warnings geloggt

## Kombination mit Middleware

RSS-Filterung und Middleware ergänzen sich:

```toml
# 1. RSS-Filter: Grobe Filterung
[providers.config.filters]
[providers.config.filters.presets]
excludeYouTubeShorts = true

# 2. Middleware: Feinabstimmung
[[providers.middleware]]
name = "additional-filter"
type = "youtube_shorts_filter"
enabled = true

[[providers.middleware]]
name = "add-captions"
type = "youtube_caption"
enabled = true
```

## Best Practices

### 1. Filterung so früh wie möglich
```toml
# Gut: Im RSS Provider filtern
[providers.config.filters]
titleExclude = ["Shorts"]

# Weniger effizient: Nur in Middleware
[[providers.middleware]]
name = "filter"
type = "filter"
```

### 2. Klare Filter-Logik
```toml
# Gut: Eindeutige Patterns
titleExclude = ["YouTube Shorts", "#Shorts"]

# Problematisch: Mehrdeutige Patterns  
titleExclude = ["Short"]  # Könnte auch "Shortcut" treffen
```

### 3. Testing und Validation
```toml
# Test-Konfiguration
[providers.config.filters]
# Temporär alle Filter deaktivieren für Tests
# titleExclude = []
```

### 4. Dokumentation
```toml
[providers.config.filters]
# Grund für Filter dokumentieren
titleExclude = [
  "LIVE",     # Live-Streams ausschließen
  "🔴",      # Live-Indikator Emoji
  "Shorts"   # YouTube Shorts
]
```

## Troubleshooting

### Problem: Filter funktionieren nicht
1. Debug-Logging aktivieren
2. Patterns auf Tippfehler prüfen
3. Case-Sensitivity überprüfen
4. Regex-Syntax validieren

### Problem: Zu viele Items gefiltert
1. Include-Patterns zu restriktiv
2. Exclude-Patterns zu breit
3. Case-Sensitivity falsch konfiguriert

### Problem: Performance-Probleme
1. Regex-Patterns optimieren
2. Presets statt Custom-Patterns verwenden
3. Filter-Reihenfolge optimieren

### Problem: Regex-Fehler
```
[WARN] Invalid regex pattern in exclude filter: [invalid
```
- Regex-Syntax prüfen
- Escape-Zeichen korrekt verwenden
- Fallback auf String-Matching nutzen