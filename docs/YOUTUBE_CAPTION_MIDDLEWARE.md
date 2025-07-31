# YouTube Caption Middleware

Die YouTube Caption Middleware extrahiert automatisch generierte Untertitel von YouTube-Videos und verarbeitet diese für die Verwendung in Social Media Posts.

## Funktionsweise

1. **Video-ID Extraktion**: Erkennt YouTube-Video-IDs aus verschiedenen URL-Formaten
2. **Caption-Abruf**: Verwendet `youtube-caption-extractor` zum Abrufen der automatisch generierten Untertitel
3. **Text-Verarbeitung**: 
   - Entfernt alle Timestamps
   - Entfernt alle Newlines
   - Fügt Newlines vor jedem ">> " ein
4. **Integration**: Fügt die verarbeiteten Untertitel zum ursprünglichen Text hinzu

## Konfiguration

### Basis-Konfiguration

```toml
[[providers.middleware]]
name = "youtube-captions"
type = "youtube_caption"
enabled = true

[providers.middleware.config]
mode = "append"
separator = "\n\n📝 Untertitel:\n"
```

### Konfigurationsoptionen

| Option | Typ | Standard | Beschreibung |
|--------|-----|----------|--------------|
| `mode` | string | `"append"` | Wie die Untertitel behandelt werden: `"append"`, `"prepend"`, `"replace"` |
| `separator` | string | `"\n\n---\n\n"` | Trennzeichen zwischen ursprünglichem Text und Untertiteln |
| `language` | string | `"auto"` | Sprachcode für Untertitel (ISO 639-1, z.B. "de", "en") |
| `maxLength` | number | unbegrenzt | Maximale Länge der Untertitel |
| `skipOnNoCaptions` | boolean | `false` | Nachricht überspringen wenn keine Untertitel gefunden |
| `skipReason` | string | auto | Grund für das Überspringen (nur wenn `skipOnNoCaptions = true`) |

### Modi

#### Append (Standard)
Fügt Untertitel nach dem ursprünglichen Text hinzu:
```
Ursprünglicher Text
---
Verarbeitete Untertitel
```

#### Prepend
Fügt Untertitel vor dem ursprünglichen Text hinzu:
```
Verarbeitete Untertitel
---
Ursprünglicher Text
```

#### Replace
Ersetzt den gesamten Text durch die Untertitel:
```
Verarbeitete Untertitel
```

## Unterstützte YouTube-URL-Formate

Die Middleware erkennt YouTube-Video-IDs aus folgenden URL-Formaten:

- Standard: `https://www.youtube.com/watch?v=VIDEO_ID`
- Kurz: `https://youtu.be/VIDEO_ID`
- Eingebettet: `https://www.youtube.com/embed/VIDEO_ID`
- Shorts: `https://www.youtube.com/shorts/VIDEO_ID`
- Mobil: `https://m.youtube.com/watch?v=VIDEO_ID`
- RSS-Feed-URLs mit Video-Parameter

## Text-Verarbeitung

Die Middleware verarbeitet die rohen Untertitel wie folgt:

### Eingabe (Beispiel)
```
[00:00:01] Hallo und willkommen
zu diesem Video.
(00:00:05) >> Heute sprechen wir über
00:10 Technologie >> Das ist interessant
```

### Ausgabe
```
Hallo und willkommen zu diesem Video.
>> Heute sprechen wir über Technologie
>> Das ist interessant
```

### Verarbeitungsschritte
1. **Timestamp-Entfernung**: Alle Zeitstempel in verschiedenen Formaten werden entfernt
2. **Newline-Entfernung**: Alle Zeilenumbrüche werden durch Leerzeichen ersetzt
3. **Normalisierung**: Mehrfache Leerzeichen werden zu einem zusammengefasst
4. **Marker-Formatierung**: Vor jedem ">> " wird eine neue Zeile eingefügt

## Beispiel-Konfigurationen

### RSS-Feed mit YouTube-Untertiteln

```toml
[[providers]]
name = "tech-youtube"
type = "rssfeed"
enabled = true
schedule = "*/10 * * * *"

[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=UC_CHANNEL_ID"
template = "🎥 {{title}}\n{{link}}"

[[providers.middleware]]
name = "youtube-captions"
type = "youtube_caption"
enabled = true

[providers.middleware.config]
mode = "append"
separator = "\n\n📝 Transkript:\n"
language = "de"
maxLength = 2000
```

### Nur Untertitel posten

```toml
[[providers.middleware]]
name = "captions-only"
type = "youtube_caption"
enabled = true

[providers.middleware.config]
mode = "replace"
language = "en"
maxLength = 500
skipOnNoCaptions = true
skipReason = "Keine Untertitel verfügbar"
```

### Mehrsprachige Konfiguration

```toml
# Deutsche Videos
[[providers]]
name = "german-tech"
type = "rssfeed"
[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=DE_CHANNEL"

[[providers.middleware]]
name = "german-captions"
type = "youtube_caption"
[providers.middleware.config]
language = "de"
separator = "\n\n🇩🇪 Deutsche Untertitel:\n"

# Englische Videos
[[providers]]
name = "english-tech"
type = "rssfeed"
[providers.config]
feedUrl = "https://www.youtube.com/feeds/videos.xml?channel_id=EN_CHANNEL"

[[providers.middleware]]
name = "english-captions"
type = "youtube_caption"
[providers.middleware.config]
language = "en"
separator = "\n\n🇺🇸 English Captions:\n"
```

## Fehlerbehandlung

### Keine Untertitel verfügbar
- **Standard**: Middleware wird übersprungen, ursprünglicher Text bleibt erhalten
- **Mit `skipOnNoCaptions = true`**: Gesamte Nachricht wird übersprungen

### Netzwerkfehler
- Middleware wird übersprungen, ursprünglicher Text bleibt erhalten
- Fehler wird geloggt

### Ungültige Video-ID
- Middleware wird übersprungen, ursprünglicher Text bleibt erhalten

## Metadaten

Die Middleware speichert folgende Metadaten im Context:

- `{name}_video_id`: Extrahierte YouTube-Video-ID
- `{name}_captions_length`: Länge der verarbeiteten Untertitel
- `{name}_original_text`: Ursprünglicher Text vor der Verarbeitung

## Performance-Hinweise

- **Caching**: Die Middleware cached keine Untertitel - jeder Abruf erfolgt live
- **Rate Limiting**: YouTube kann API-Aufrufe begrenzen
- **Timeout**: Standard-Timeout von 30 Sekunden für Caption-Abrufe

## Abhängigkeiten

- `youtube-caption-extractor`: NPM-Paket für den Abruf von YouTube-Untertiteln

## Logging

Die Middleware loggt folgende Ereignisse:

- **Debug**: Video-ID-Extraktion, Caption-Abruf, Text-Verarbeitung
- **Info**: Übersprungene Nachrichten
- **Warn**: Fehlgeschlagene Caption-Abrufe
- **Error**: Schwerwiegende Fehler

## Kompatibilität

- **Provider**: Funktioniert mit allen Message-Providern, besonders nützlich mit RSS-Feed-Providern
- **Plattformen**: Kompatibel mit Mastodon, Bluesky und anderen unterstützten Plattformen
- **Middleware-Kette**: Kann mit anderen Middleware-Komponenten kombiniert werden