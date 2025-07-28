# Buntspecht

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Deutsch](https://img.shields.io/badge/lang-Deutsch-green.svg)](README.de.md)

<img src="buntspecht-header.jpeg" alt="Buntspecht Header"/>

Ein TypeScript-basierter **Multi-Plattform Social Media Bot** für **Mastodon**, **Bluesky** und andere Plattformen, der automatisch Nachrichten nach Zeitplan postet. Unterstützt verschiedene Nachrichtenquellen wie statische Texte oder externe Kommandos mit plattformübergreifenden Posting-Funktionen.

## Features

- 🌐 **Multi-Plattform-Unterstützung**: Posten auf **Mastodon**, **Bluesky** und andere Social Media Plattformen
- 🤖 Automatisches Posten von Nachrichten nach Zeitplan
- 📨 **Mehrere Nachrichtenquellen**: Statische Texte, externe Kommandos, JSON-basierte Templates oder Push-Benachrichtigungen
- 🔄 **Multi-Provider-Unterstützung**: Mehrere Provider parallel mit individuellen Zeitplänen
- 🔔 **Push-Provider**: Event-gesteuerte Nachrichten für Webhooks, Alerts und externe Integrationen
- 🔀 **Plattformübergreifendes Posten**: Einzelne Provider können gleichzeitig an Mastodon- und Bluesky-Accounts posten
- 🌐 **Multi-Account-Unterstützung**: Mehrere Accounts über verschiedene Plattformen mit eigener Authentifizierung
- 📤 **Flexible Account-Zuordnung**: Jeder Provider kann an einen oder mehrere Accounts über Plattformen hinweg posten
- 👁️ **Sichtbarkeits-Kontrolle**: Konfigurierbare Nachrichtensichtbarkeit (öffentlich, ungelistet, privat, direkt) pro Account, Provider oder Webhook-Anfrage
- 🗝️ **Externe Secret-Quellen**: Unterstützung für HashiCorp Vault, AWS Secrets Manager, Azure Key Vault, Google Cloud Secret Manager, Dateien und Umgebungsvariablen
- 🔐 **Automatische Secret-Rotation-Erkennung**: Überwacht externe Secret-Quellen und aktualisiert automatisch Zugangsdaten bei Änderungen
- 🔗 **Bluesky URL-Einbettung**: Automatische URL-Erkennung mit Rich-Metadata-Einbettung (Titel, Beschreibung, Open Graph Tags)
- 🏷️ **Bluesky Rich Text**: Automatische Hashtag- und Mention-Erkennung mit korrekter Facet-Erstellung
- ⚙️ Flexible Konfiguration über TOML-Dateien
- 🔍 Mehrere Konfigurationspfade mit Prioritätsreihenfolge
- 📝 **Erweiterte Logging-Funktionen**: Umfassendes Logging mit Zeichenanzahl-Anzeige
- 🧪 Vollständige Testabdeckung (300+ Tests)
- 🐳 Docker-Support für CI/CD
- 🛡️ TypeScript für Typsicherheit
- 📡 Moderne API-Integration mit masto.js (Mastodon) und @atproto/api (Bluesky)
- 🔧 Erweiterbare Provider-Architektur
- 📊 **OpenTelemetry-Integration**: Monitoring, Tracing und Metriken für Observability
- ⚡ **Bun-Runtime**: Schnellere Performance und native TypeScript-Unterstützung
- 📦 **Single Binary**: Standalone-Executables für alle Plattformen ohne Dependencies

## Installation

### Voraussetzungen

- **Docker**: Für die empfohlene Docker-Installation
- **Bun**: Version 1.2.18 oder höher (für Entwicklung/Source-Builds)
- **Git**: Für das Klonen des Repositories

### Installation

#### Option 1: Docker (Empfohlen)

Der einfachste und zuverlässigste Weg, Buntspecht zu betreiben, ist die Verwendung des offiziellen Docker-Images aus der GitHub Container Registry:

```bash
# Neuestes Image herunterladen
docker pull ghcr.io/rmoriz/buntspecht:latest

# Mit Konfigurationsdatei ausführen
docker run -d \
  --name buntspecht \
  -v /pfad/zu/ihrer/config.toml:/app/config.toml:ro \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/rmoriz/buntspecht:latest

# Mit umgebungsbasierter Konfiguration ausführen
docker run -d \
  --name buntspecht \
  -e BUNTSPECHT_CONFIG=/app/config.toml \
  -v /pfad/zu/ihrer/config.toml:/app/config.toml:ro \
  -p 3000:3000 \
  --restart unless-stopped \
  ghcr.io/rmoriz/buntspecht:latest

# Logs überprüfen
docker logs -f buntspecht
```

**Docker Compose (Empfohlen für Produktion):**

```yaml
# docker-compose.yml
version: '3.8'

services:
  buntspecht:
    image: ghcr.io/rmoriz/buntspecht:latest
    container_name: buntspecht
    restart: unless-stopped
    ports:
      - "3000:3000"  # Für Webhook-Server (falls aktiviert)
    volumes:
      - ./config.toml:/app/config.toml:ro
      - ./data:/app/data  # Für Cache-Dateien (optional)
    environment:
      - BUNTSPECHT_CONFIG=/app/config.toml
      - TZ=UTC
    # Optional: Ressourcenlimits
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
```

```bash
# Mit Docker Compose starten
docker-compose up -d

# Logs anzeigen
docker-compose logs -f

# Stoppen
docker-compose down
```

**Verfügbare Docker-Tags:**
- `latest`: Neueste stabile Version
- `v0.9.0`: Spezifische Versions-Tags
- `main`: Neuester Entwicklungs-Build (nicht für Produktion empfohlen)

**Docker-Vorteile:**
- ✅ **Vollständige OpenTelemetry-Unterstützung** (im Gegensatz zu Single Binaries)
- ✅ **Konsistente Umgebung** auf allen Plattformen
- ✅ **Einfache Updates** mit `docker pull`
- ✅ **Ressourcenverwaltung** und Monitoring
- ✅ **Produktionsbereit** mit ordnungsgemäßer Isolation
- ✅ **Keine Dependency-Verwaltung** erforderlich

#### Option 2: Vorkompilierte Binaries

Laden Sie die passende Binary für Ihr System von den [GitHub Releases](../../releases) herunter:

- **Linux x64**: `buntspecht-linux-x64`
- **Linux ARM64**: `buntspecht-linux-arm64`
- **Linux ARMv8**: `buntspecht-linux-armv8`
- **macOS Intel**: `buntspecht-macos-x64`
- **macOS Apple Silicon**: `buntspecht-macos-arm64`

> **⚠️ Hinweis**: Single Binaries haben OpenTelemetry-Dependencies aus technischen Kompatibilitätsgründen ausgeschlossen. Für Telemetrie-Unterstützung verwenden Sie Docker oder führen Sie mit `bun run` aus.

```bash
# Beispiel für Linux x64
wget https://github.com/rmoriz/buntspecht/releases/latest/download/buntspecht-linux-x64
chmod +x buntspecht-linux-x64
./buntspecht-linux-x64 --help
```

#### Option 2: Aus Quellcode kompilieren

```bash
# Repository klonen
git clone https://github.com/rmoriz/buntspecht
cd buntspecht

# Dependencies installieren
bun install

# TypeScript kompilieren
bun run build

# Optional: Eigene Binary erstellen
bun run build:binary
```

## Konfiguration

Der Bot sucht nach Konfigurationsdateien in folgender Prioritätsreihenfolge:

1. **CLI Parameter**: `--config /pfad/zur/config.toml`
2. **Environment Variable**: `BUNTSPECHT_CONFIG=/pfad/zur/config.toml`
3. **Aktuelles Verzeichnis**: `./config.toml`
4. **Home Directory**: `~/.config/buntspecht/config.toml`

### Konfigurationsdatei erstellen

```bash
# Beispielkonfiguration kopieren
cp examples/configuration/config.example.toml config.toml

# Konfiguration bearbeiten
nano config.toml
```

### Konfigurationsformat

```toml
# Social Media Accounts - Mastodon und Bluesky
[[accounts]]
name = "mastodon-account"
type = "mastodon"  # Account-Typ (Standard: mastodon)
instance = "https://mastodon.social"
accessToken = "dein-mastodon-access-token-hier"

[[accounts]]
name = "mastodon-account"
type = "mastodon"
instance = "https://mastodon.social"
accessToken = "dein-mastodon-access-token"  # Traditioneller hardcodierter Token

[[accounts]]
name = "bluesky-account"
type = "bluesky"  # Account-Typ für Bluesky
instance = "https://bsky.social"  # Optional: Standard ist https://bsky.social
identifier = "deinhandle.bsky.social"  # Dein Bluesky-Handle oder DID
password = "dein-app-passwort"  # Traditionelles hardcodiertes App-Passwort aus den Bluesky-Einstellungen

# Beispiele mit externen Secret-Quellen (überwacht für automatische Rotation)
[[accounts]]
name = "secure-mastodon"
type = "mastodon"
instance = "https://mastodon.social"
accessTokenSource = "vault://secret/buntspecht/mastodon-token"  # HashiCorp Vault
# Alternative Ansätze:
# accessToken = "dein-mastodon-access-token"                     # Traditioneller hardcodierter Token
# accessTokenSource = "aws://my-secret?key=token&region=us-east-1"  # AWS Secrets Manager
# accessTokenSource = "azure://my-vault/my-secret"                  # Azure Key Vault
# accessTokenSource = "gcp://my-project/my-secret"                 # Google Cloud Secret Manager
# accessTokenSource = "file:///path/to/token.txt"                 # Datei-basiertes Secret
# accessToken = "${MASTODON_TOKEN}"                               # Umgebungsvariable

[[accounts]]
name = "secure-bluesky"
type = "bluesky"
instance = "https://bsky.social"
identifier = "deinhandle.bsky.social"
passwordSource = "vault://secret/buntspecht/bluesky-password"    # HashiCorp Vault
# Alternative Ansätze:
# password = "dein-app-passwort"                                  # Traditionelles hardcodiertes Passwort
# passwordSource = "aws://my-secret?key=password&region=us-east-1" # AWS Secrets Manager
# passwordSource = "azure://my-vault/bluesky-secret"              # Azure Key Vault
# passwordSource = "gcp://my-project/bluesky-secret"              # Google Cloud Secret Manager
# passwordSource = "file:///path/to/password.txt"                # Datei-basiertes Secret
# password = "${BLUESKY_PASSWORD}"                                # Umgebungsvariable

[bot]
# Multi-Provider Konfiguration
# Jeder Provider kann einen eigenen Zeitplan und eigene Konfiguration haben
# Jeder Provider kann an einen oder mehrere Accounts posten

# Provider 1: Stündliche Ping-Nachrichten
[[bot.providers]]
name = "hourly-ping"
type = "ping"
cronSchedule = "0 * * * *"  # Jede Stunde
enabled = true
accounts = ["main-account"]  # An welche Accounts posten

[bot.providers.config]
message = "🤖 Stündlicher Ping von Buntspecht!"

# Provider 2: Tägliche Systemstatistiken (deaktiviert)
[[bot.providers]]
name = "daily-stats"
type = "command"
cronSchedule = "0 9 * * *"  # Jeden Tag um 9:00 Uhr
enabled = false
accounts = ["main-account"]  # An welche Accounts posten

[bot.providers.config]
command = "uptime"
timeout = 10000

[logging]
# Log-Level: debug, info, warn, error
level = "info"
```

### Access Token erhalten

1. Gehen Sie zu Ihrer Mastodon-Instanz
2. Einstellungen → Entwicklung → Neue Anwendung
3. Name: "Buntspecht Bot" (oder beliebig)
4. Bereiche: `write:statuses` für Text-Posts oder `write` für Posts mit Anhängen/Bildern
5. Anwendung erstellen und Access Token kopieren

## Message Provider

Buntspecht unterstützt verschiedene Nachrichtenquellen über ein erweiterbares Provider-System. Jeder Provider läuft unabhängig mit seinem eigenen Zeitplan und kann individuell aktiviert/deaktiviert werden.

### Verfügbare Provider-Typen

- **ping**: Einfache statische Nachrichten
- **command**: Shell-Befehle ausführen und Ausgabe posten
- **jsoncommand**: Befehle ausführen, die JSON zurückgeben, mit Template-Formatierung
- **multijsoncommand**: JSON-Arrays verarbeiten mit individueller Nachrichtenerstellung
- **push**: Externe Nachrichten über HTTP-API empfangen
- **rssfeed** (oder **rss**): Inhalte aus RSS/Atom-Feeds abrufen und posten

### RSS/Atom Feed Provider

Ruft automatisch Inhalte aus RSS- und Atom-Feeds ab und postet sie mit intelligenter Duplikatserkennung und Fehlerbehandlung:

```toml
[[bot.providers]]
name = "tech-news"
type = "rssfeed"  # oder "rss" als Alias
cronSchedule = "0 */2 * * *"  # Alle 2 Stunden
enabled = true
accounts = ["mastodon-main", "bluesky-main"]

[bot.providers.config]
feedUrl = "https://feeds.feedburner.com/TechCrunch"
timeout = 30000      # Request-Timeout (Standard: 30000ms)
maxItems = 10        # Max. Elemente pro Abruf (Standard: 10)
retries = 3          # Wiederholungsversuche (Standard: 3)
userAgent = "Buntspecht RSS Reader/1.0"  # Benutzerdefinierter User-Agent

# Cache-Konfiguration (optional)
[bot.providers.config.cache]
enabled = true       # Duplikatserkennung aktivieren (Standard: true)
ttl = 7200          # Cache-TTL in Sekunden (Standard: 3600)
filePath = "./cache/tech-news-rss.json"
```

**Hauptfunktionen:**
- ✅ **RSS 2.0 und Atom-Unterstützung** - Funktioniert mit beiden Feed-Formaten
- ✅ **Automatische Duplikatserkennung** - Verhindert doppelte Posts
- ✅ **Wiederholungsmechanismus** - Konfigurierbare Wiederholung mit exponentiellem Backoff
- ✅ **Inhaltsbereinigung** - Entfernt HTML-Tags aus Feed-Inhalten
- ✅ **Fehlerresilienz** - Elegante Behandlung von Netzwerkfehlern
- ✅ **Flexible Zeitplanung** - Beliebige Cron-Ausdrücke verwenden

**Inhaltsverarbeitung:**
Ohne Template wird jedes Feed-Element formatiert als:
```
{titel}
{link}
{inhalt}
```

Mit einem benutzerdefinierten Template haben Sie volle Kontrolle über die Formatierung:
```toml
template = "📰 {{title|trim:50}}\n🔗 {{link}}\n📝 {{content|trim:200}}\n👤 {{author}}\n📅 {{pubDate}}\n🏷️ {{categories}}"
```

**Verfügbare Template-Variablen:**
- `{{title}}` - Artikel-Titel
- `{{link}}` - Artikel-URL
- `{{content}}` - Inhalt (Priorität: contentSnippet > content > description)
- `{{description}}` - Ursprüngliches Beschreibungsfeld
- `{{contentSnippet}}` - Sauberer Text-Ausschnitt
- `{{author}}` - Autorenname
- `{{pubDate}}` - Veröffentlichungsdatum (RSS-Format)
- `{{isoDate}}` - Veröffentlichungsdatum (ISO-Format)
- `{{categories}}` - Kategorien (kommagetrennt)
- `{{id}}` - Eindeutige Element-ID

HTML-Tags werden automatisch aus Inhaltsfeldern entfernt, und Sie können Template-Funktionen wie `{{content|trim:200}}` für Längenkontrolle verwenden.

### Ping Provider

Postet statische Nachrichten:

```toml
[[bot.providers]]
name = "ping-provider"
type = "ping"
cronSchedule = "0 * * * *"
enabled = true

[bot.providers.config]
message = "PING"
```

### Command Provider

Führt externe Kommandos aus und postet deren Ausgabe:

```toml
[[bot.providers]]
name = "command-provider"
type = "command"
cronSchedule = "0 * * * *"
enabled = true

[bot.providers.config]
# Das auszuführende Kommando (erforderlich)
command = "date '+Heute ist %A, der %d. %B %Y um %H:%M Uhr UTC'"

# Optional: Timeout in Millisekunden (Standard: 30000)
timeout = 10000

# Optional: Arbeitsverzeichnis für das Kommando
# cwd = "/pfad/zum/arbeitsverzeichnis"

# Optional: Maximale Puffergröße für stdout/stderr (Standard: 1MB)
# maxBuffer = 1048576

# Optional: Umgebungsvariablen
# [bot.providers.config.env]
# MEINE_VAR = "ein wert"
# ANDERE_VAR = "anderer wert"
```

#### Command Provider Beispiele

```toml
# Aktuelles Datum und Uhrzeit
command = "date '+Heute ist %A, der %d. %B %Y um %H:%M Uhr UTC'"

# Systemstatus
command = "uptime"

# Wetter (mit curl und API)
command = "curl -s 'https://wttr.in/Berlin?format=3'"

# Zufälliger Spruch
command = "fortune"

# Git-Status
command = "git log --oneline -1"
```

### JSON Command Provider

Führt externe Kommandos aus, die JSON ausgeben, oder liest JSON aus Dateien und wendet Templates mit Variablen aus den JSON-Daten an:

#### Kommando-basiert (Traditionell)
```toml
[[bot.providers]]
name = "json-provider"
type = "jsoncommand"
cronSchedule = "0 */6 * * *"  # Alle 6 Stunden
enabled = true

[bot.providers.config]
# Das auszuführende Kommando (erforderlich) - muss JSON ausgeben
command = "curl -s 'https://api.github.com/repos/octocat/Hello-World' | jq '{name: .name, stars: .stargazers_count, language: .language}'"

# Template für die Nachricht (erforderlich)
# Verwende {{variable}} für JSON-Eigenschaften
# Unterstützt verschachtelte Eigenschaften mit Punkt-Notation: {{user.name}}
template = "📊 Repository {{name}} hat {{stars}} Sterne! Programmiersprache: {{language}}"

# Optional: Timeout in Millisekunden (Standard: 30000)
timeout = 10000
```

#### Datei-basiert (Neu)
```toml
[[bot.providers]]
name = "wetter-aus-datei"
type = "jsoncommand"
cronSchedule = "0 8 * * *"  # Jeden Tag um 8:00 Uhr
enabled = true
accounts = ["main-account"]

[bot.providers.config]
# Aus Datei lesen statt Kommando (gegenseitig ausschließend mit command)
file = "/app/data/wetter.json"
template = "🌤️ Wetter in {{stadt}}: {{temperatur}}°C, {{beschreibung}}"
```

#### Datei-Überwachung (Automatisches Posting)
```toml
[[bot.providers]]
name = "alerts-aus-datei"
type = "jsoncommand"
# Kein cronSchedule = Datei-Überwachung für Änderungs-Erkennung aktiviert
enabled = true
accounts = ["main-account"]

[bot.providers.config]
file = "/app/data/alerts.json"
template = "🚨 Alert: {{nachricht}} - {{schweregrad}}"
```

**Hinweis**: Die Datei-Überwachung löst automatisch die Nachrichten-Generierung aus, wenn sich Dateien ändern. Keine manuelle Intervention erforderlich!

**Startup-Schonfrist**: Dateiänderungen werden in den ersten 3 Sekunden nach dem Start ignoriert, um zu verhindern, dass bestehende Dateien während der Initialisierung Posts auslösen.

**Konfigurationsoptionen:**
- **Entweder** `command` ODER `file` (gegenseitig ausschließend)
- **Datei-Überwachung**: Automatisches Posting wenn kein `cronSchedule` angegeben
- **Template-Variablen**: Verwende `{{variable}}` für JSON-Eigenschaften
- **Verschachtelte Eigenschaften**: Unterstützung für Punkt-Notation wie `{{user.name}}`
- **Template-Funktionen**: `trim:length` und `join:separator,prefix`
- **Anhänge**: Vollständige Unterstützung für Bilder und Dateien

**Datei vs. Kommando Vorteile:**
- **Datei**: Bessere Performance, Echtzeit-Updates, einfachere Konfiguration
- **Kommando**: Dynamisches Datenabrufen, API-Aufrufe, Datenverarbeitung

**Datei-Überwachungs-Verhalten:**
- **Schonfrist**: 3-Sekunden Startup-Verzögerung verhindert initiale Datei-Trigger
- **Rate Limiting**: 5-Sekunden Mindestabstand zwischen Dateiänderungs-Triggern
- **Echtzeit**: Automatisches Posting bei Dateiänderungen (nach Schonfrist)

#### JSON Command Provider Beispiele

```toml
# GitHub Repository-Statistiken
command = "curl -s 'https://api.github.com/repos/octocat/Hello-World' | jq '{name: .name, stars: .stargazers_count, forks: .forks_count}'"
template = "📊 {{name}}: {{stars}} ⭐ und {{forks}} 🍴"

# Wetter-API mit JSON
command = "curl -s 'https://api.openweathermap.org/data/2.5/weather?q=Berlin&appid=DEIN_API_SCHLUESSEL&units=metric' | jq '{temp: .main.temp, desc: .weather[0].description, city: .name}'"
template = "🌤️ Wetter in {{city}}: {{temp}}°C, {{desc}}"

# System-Informationen als JSON
command = "echo '{\"hostname\": \"'$(hostname)'\", \"uptime\": \"'$(uptime -p)'\", \"load\": \"'$(uptime | awk -F\"load average:\" \"{print $2}\" | xargs)'\"}''"
template = "🖥️ Server {{hostname}} läuft seit {{uptime}}. Load: {{load}}"

# Verschachtelte JSON-Eigenschaften
command = "curl -s 'https://api.example.com/user/123' | jq '{user: {name: .name, email: .email}, stats: {posts: .post_count}}'"
template = "👤 Benutzer {{user.name}} ({{user.email}}) hat {{stats.posts}} Posts"
```

#### Template-Syntax

- `{{variable}}` - Einfache Variable aus JSON
- `{{nested.property}}` - Verschachtelte Eigenschaft mit Punkt-Notation
- `{{ variable }}` - Leerzeichen um Variablennamen werden ignoriert
- `{{variable|trim:50}}` - Variable auf 50 Zeichen kürzen mit "..."-Suffix
- `{{variable|trim:30,…}}` - Variable auf 30 Zeichen kürzen mit benutzerdefiniertem "…"-Suffix
- Fehlende Variablen werden als `{{variable}}` im Text belassen
- JSON-Werte werden automatisch zu Strings konvertiert

#### Template-Funktionen

**Trim-Funktion**: Feldlängen für Social Media Zeichenbeschränkungen begrenzen

```toml
# Grundlegendes Kürzen mit Standard-"..."-Suffix
template = "{{title|trim:50}}: {{description|trim:100}}"

# Benutzerdefiniertes Suffix
template = "{{content|trim:280, [mehr]}}"

# Mehrere Trim-Funktionen
template = "{{title|trim:30}} - {{summary|trim:80}} #news"

# Funktioniert mit verschachtelten Eigenschaften
template = "{{user.name|trim:20}}: {{user.bio|trim:60}}"
```

**Anwendungsfälle:**
- **Twitter/X**: Auf 280 Zeichen begrenzen
- **Mastodon**: Instanz-Zeichenlimits respektieren (typisch 500)
- **Bluesky**: Innerhalb des 300-Zeichen-Limits bleiben
- **Schlagzeilen**: Konsistente Länge für News-Feeds
- **Mobile**: Für kleine Bildschirme optimieren

### Multi JSON Command Provider

Führt externe Kommandos aus, die JSON-Arrays ausgeben, oder liest JSON-Arrays aus Dateien und verarbeitet jedes Objekt als separate Nachricht. Perfekt für RSS-Feeds, API-Endpunkte mit mehreren Einträgen oder jede Datenquelle mit mehreren Elementen. Bietet intelligentes Caching zur Vermeidung doppelter Nachrichten. Jede Cron-Ausführung verarbeitet ein neues Element aus dem Array, wobei das Timing durch den Cron-Schedule kontrolliert wird.

```toml
[[bot.providers]]
name = "rss-feed"
type = "multijsoncommand"
cronSchedule = "*/15 * * * *"  # Alle 15 Minuten
enabled = true
accounts = ["main-account"]

[bot.providers.config]
# Kommando, das JSON-Array ausgibt (erforderlich)
command = "curl -s 'https://feeds.example.com/news.json' | jq '[.items[] | {id: .id, title: .title, url: .url, published: .published}]'"

# Template für jede Nachricht (erforderlich)
template = "📰 {{title}}\n🔗 {{url}}\n📅 {{published}}"

# Eindeutiges Identifikationsfeld (Standard: "id")
uniqueKey = "id"

# DEPRECATED: throttleDelay wird nicht mehr verwendet - verwenden Sie stattdessen cronSchedule für das Timing
# Der obige Cron-Schedule kontrolliert, wann neue Nachrichten gepostet werden
# throttleDelay = 2000

# Cache-Konfiguration (optional)
[bot.providers.config.cache]
enabled = true                              # Caching aktivieren (Standard: true)
ttl = 1209600000                            # 14 Tage in Millisekunden (Standard)
maxSize = 10000                             # Maximale Cache-Einträge (Standard)
filePath = "./cache/rss-feed-cache.json"    # Cache-Dateipfad (Standard: ./cache/multijson-cache.json)
```

#### Funktionsweise

Der MultiJSONCommand Provider verarbeitet ein Element pro Ausführung:

1. **Erste Ausführung**: Verarbeitet das erste unverarbeitete Element aus dem JSON-Array
2. **Folgende Ausführungen**: Verarbeitet das nächste unverarbeitete Element (vorherige Elemente sind gecacht)
3. **Wenn alle Elemente verarbeitet sind**: Gibt leer zurück (keine Nachricht gepostet) bis neue Elemente erscheinen
4. **Timing**: Kontrolliert durch den `cronSchedule` - jede Cron-Ausführung verarbeitet ein Element

#### Hauptfunktionen

- **🔄 Array-Verarbeitung**: Verarbeitet JSON-Arrays mit mehreren Objekten
- **🚫 Duplikat-Vermeidung**: Intelligentes Caching verhindert erneutes Posten desselben Inhalts
- **⏱️ Timing-Kontrolle**: Timing wird durch Cron-Schedule kontrolliert, nicht durch interne Verzögerungen
- **💾 Persistenter Cache**: 14-Tage-Cache übersteht Anwendungsneustarts
- **🔑 Account-bewusst**: Cache-Schlüssel enthalten Provider-Namen für Multi-Account-Unterstützung
- **⚙️ Flexible Konfiguration**: Anpassbare eindeutige Schlüssel, TTL und Cache-Pfade

#### Multi JSON Command Beispiele

```toml
# RSS/News-Feed-Verarbeitung
command = "curl -s 'https://api.example.com/news' | jq '[.articles[] | {id: .id, title: .title, summary: .summary, url: .link}]'"
template = "📰 {{title}}\n\n{{summary}}\n\n🔗 Weiterlesen: {{url}}"
uniqueKey = "id"
# DEPRECATED: Verwenden Sie cronSchedule für das Timing
# throttleDelay = 3000

# GitHub Releases Monitor
command = "curl -s 'https://api.github.com/repos/owner/repo/releases' | jq '[.[] | {id: .id, name: .name, tag: .tag_name, url: .html_url}] | .[0:3]'"
template = "🚀 Neues Release: {{name}} ({{tag}})\n🔗 {{url}}"
uniqueKey = "id"

# Social Media Monitoring
command = "python3 fetch_mentions.py --format=json"  # Benutzerdefiniertes Skript, das JSON-Array zurückgibt
template = "💬 Neue Erwähnung: {{text}}\n👤 Von: {{author}}\n🔗 {{url}}"
uniqueKey = "mention_id"

# System-Alerts (Mehrere Services)
command = "curl -s 'http://monitoring.local/api/alerts' | jq '[.alerts[] | select(.status == \"firing\") | {id: .id, service: .labels.service, message: .annotations.summary}]'"
template = "🚨 Alert: {{service}}\n{{message}}"
uniqueKey = "id"
# DEPRECATED: Verwenden Sie cronSchedule für das Timing
# throttleDelay = 5000

# E-Commerce Produkt-Updates
command = "curl -s 'https://api.shop.com/products/new' | jq '[.products[] | {sku: .sku, name: .name, price: .price, category: .category}]'"
template = "🛍️ Neues Produkt: {{name}}\n💰 Preis: {{price}}€\n📂 Kategorie: {{category}}"
uniqueKey = "sku"
```

#### Cache-Konfiguration

Das Cache-System verhindert doppelte Nachrichten und bleibt über Anwendungsneustarts bestehen:

```toml
[bot.providers.config.cache]
# Caching aktivieren/deaktivieren
enabled = true

# Time-to-live in Millisekunden (Standard: 14 Tage)
ttl = 1209600000

# Maximale Anzahl gecachter Einträge
maxSize = 10000

# Benutzerdefinierter Cache-Dateipfad
filePath = "./cache/my-provider-cache.json"
```

**Cache-Schlüssel-Format**: `{providerName}:{uniqueKeyValue}`

Dies stellt sicher, dass:
- Derselbe Inhalt an verschiedene Accounts gepostet werden kann ohne Konflikte
- Jeder Provider seinen eigenen Cache-Namespace hat
- Cache-Einträge ordnungsgemäß zwischen Providern isoliert sind

#### Fehlerbehandlung

- **Ungültiges JSON**: Protokolliert Fehler und überspringt Verarbeitung
- **Fehlender eindeutiger Schlüssel**: Validiert, dass alle Objekte das erforderliche eindeutige Feld haben
- **Doppelte Schlüssel**: Erkennt und meldet doppelte eindeutige Schlüssel im selben Array
- **Kommando-Fehler**: Elegante Fehlerbehandlung mit detailliertem Logging
- **Cache-Fehler**: Cache-Fehler unterbrechen die Nachrichtenverarbeitung nicht

### Push Provider

Reagiert auf externe Events anstatt auf Cron-Zeitpläne. Push-Provider werden programmatisch ausgelöst und können benutzerdefinierte Nachrichten akzeptieren:

```toml
[[bot.providers]]
name = "alert-system"
type = "push"
# Kein cronSchedule für Push-Provider erforderlich
enabled = true
accounts = ["main-account"]

[bot.providers.config]
# Standard-Nachricht, wenn keine benutzerdefinierte Nachricht bereitgestellt wird
defaultMessage = "Alert vom Monitoring-System"

# Ob benutzerdefinierte Nachrichten erlaubt sind (Standard: true)
allowExternalMessages = true

# Maximale Nachrichtenlänge (Standard: 500)
maxMessageLength = 280
```

#### Push Provider Konfigurationsoptionen

- `defaultMessage` - Nachricht, die verwendet wird, wenn keine benutzerdefinierte Nachricht bereitgestellt wird
- `allowExternalMessages` - Ob benutzerdefinierte Nachrichten akzeptiert werden (Standard: true)
- `maxMessageLength` - Maximale Länge für Nachrichten (Standard: 500)

#### Push Provider auslösen

Push-Provider können über CLI oder programmatisch ausgelöst werden:

```bash
# Alle Push-Provider auflisten
bun start --list-push-providers

# Mit Standard-Nachricht auslösen
bun start --trigger-push alert-system

# Mit benutzerdefinierter Nachricht auslösen
bun start --trigger-push alert-system --trigger-push-message "Kritischer Alert: Server ausgefallen!"
```

#### Anwendungsfälle für Push Provider

- **Webhook-Benachrichtigungen**: Auf externe Webhook-Aufrufe reagieren
- **Alert-Systeme**: Alerts basierend auf Monitoring-Bedingungen auslösen
- **Manuelle Ankündigungen**: Ad-hoc-Nachrichten bei Bedarf senden
- **Event-gesteuerte Benachrichtigungen**: Auf externe Events reagieren
- **Integration mit externen Systemen**: Verbindung mit Monitoring, CI/CD, etc.

#### Beispiel-Integration

```javascript
// Beispiel Webhook-Handler
async function handleWebhook(req, res) {
  const { message, severity } = req.body;
  
  // Provider basierend auf Schweregrad auswählen
  const providerName = severity === 'critical' ? 'alert-system' : 'announcements';
  
  await bot.triggerPushProvider(providerName, message);
  res.json({ success: true });
}
```

## Webhook-Integration

Buntspecht enthält einen integrierten Webhook-Server mit **zwei verschiedenen Webhook-Typen** für unterschiedliche Anwendungsfälle:

1. **Provider-spezifische Webhooks** (`/webhook/provider-name`) - Für externe Services wie GitHub, GitLab, Twitch
   ```json
   POST /webhook/github
   {"action": "push", "repository": {"name": "mein-repo"}}
   ```

2. **Generischer Webhook** (`/webhook`) - Für manuelle Benachrichtigungen und flexible Integrationen
   ```json
   POST /webhook
   {"provider": "alerts", "message": "Server ist offline"}
   ```

Dies ermöglicht Echtzeit-Benachrichtigungen von Monitoring-Systemen, CI/CD-Pipelines, GitHub und anderen Services mit verbesserter Sicherheit und Flexibilität.

### Webhook-Konfiguration

#### Zwei Webhook-Typen

**1. Provider-spezifische Webhooks** - Für externe Services:

```toml
# GitHub-Integration mit provider-spezifischem Webhook
[[bot.providers]]
name = "github-events"
type = "push"
accounts = ["mastodon-main"]
# Custom Webhook-Pfad - GitHub sendet direkt hierhin
webhookPath = "/webhook/github"
# Template wird automatisch auf eingehende JSON-Daten angewendet
template = "🔔 GitHub {{action}} in {{repository.name}}"

# Named Templates für spezifische GitHub Event-Typen
[bot.providers.templates]
"push" = "🚀 {{head_commit.author.name}} pushed: {{head_commit.message}}"
"pull_request.opened" = "🔧 Neue PR: \"{{pull_request.title}}\" von @{{pull_request.user.login}}"
"issues.opened" = "🐛 Neues Issue: \"{{issue.title}}\" {{issue.html_url}}"
"release.published" = "🎉 Release {{release.tag_name}}: {{release.name}}"

[bot.providers.config]
# HMAC-Authentifizierung (empfohlen für externe Services)
hmacSecret = "github-webhook-secret"
hmacAlgorithm = "sha256"  # sha1, sha256, sha512
hmacHeader = "X-Hub-Signature-256"  # Custom Header-Name
# Alternative: Einfache Secret-Authentifizierung
# webhookSecret = "einfaches-secret"
```

**2. Generischer Webhook** - Für flexible Nutzung:

```toml
# Manuelle Benachrichtigungen über generischen Webhook
[[bot.providers]]
name = "monitoring-alerts"
type = "push"
accounts = ["alerts-account"]
# Kein webhookPath - nur über generischen Webhook erreichbar
template = "🚨 {{severity}}: {{message}}"

[bot.providers.config]
# Einfaches Secret oder HMAC-Authentifizierung
webhookSecret = "monitoring-specific-secret-123"
# Oder HMAC für erhöhte Sicherheit:
# hmacSecret = "monitoring-hmac-secret"
# hmacAlgorithm = "sha512"
# hmacHeader = "X-Monitor-Signature"
```

#### Globale Webhook-Konfiguration

```toml
[webhook]
# Webhook-Server aktivieren
enabled = true
port = 3000
host = "0.0.0.0"  # Auf allen Interfaces lauschen
path = "/webhook"  # Generischer Webhook-Endpunkt-Pfad

# Sicherheitseinstellungen
allowedIPs = [  # Optional: IP-Whitelist
  "127.0.0.1",
  "192.168.1.0/24",
  "10.0.0.0/8"
]

# Performance-Einstellungen
maxPayloadSize = 1048576  # 1MB max Payload-Größe
timeout = 30000  # 30 Sekunden Timeout
```

### Webhook-API

**Endpunkt:** `POST /webhook`

**Header:**
- `Content-Type: application/json`
- `X-Webhook-Secret: ihr-secret` (wenn Secret konfiguriert ist)

**Request Body:**
```json
{
  "provider": "push-provider-name",
  "message": "Benutzerdefinierte Nachricht zum Posten",
  "metadata": {
    "key": "value"
  }
}
```

**Response:**
```json
{
  "success": true,
  "message": "Push-Provider \"provider-name\" erfolgreich ausgelöst",
  "timestamp": "2024-01-01T12:00:00.000Z",
  "provider": "provider-name"
}
```

### Webhook-Beispiele

#### Einfacher Webhook-Aufruf
```bash
# Generischer Webhook - Provider im JSON angeben
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: ihr-webhook-secret-hier" \
  -d '{"provider": "webhook-alerts", "message": "Test Alert-Nachricht"}'

# Provider-spezifischer Webhook - Provider durch URL-Pfad bestimmt
curl -X POST http://localhost:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-Hub-Signature-256: sha256=berechnete_signatur" \
  -d '{"action": "opened", "repository": {"name": "mein-repo"}}'
```

#### GitHub Webhook-Integration
GitHub Webhook-URL konfigurieren: `http://ihr-server:3000/webhook`

```json
{
  "provider": "cicd-notifications",
  "message": "🚀 Neues Release v1.2.3 veröffentlicht",
  "metadata": {
    "repository": "user/repo",
    "tag": "v1.2.3"
  }
}
```

#### Monitoring-System-Integration
```bash
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: ihr-secret" \
  -d '{
    "provider": "monitoring-critical",
    "message": "🔴 KRITISCH: CPU-Auslastung > 90% auf server-01"
  }'
```

#### CI/CD-Pipeline-Integration
```json
{
  "provider": "cicd-notifications", 
  "message": "✅ Deployment in Produktion erfolgreich abgeschlossen",
  "metadata": {
    "environment": "production",
    "version": "1.2.3",
    "duration": "2m 30s"
  }
}
```

### Webhook-Sicherheit

- **Authentifizierung**: Verwenden Sie Webhook-Secrets für Request-Validierung
- **IP-Whitelisting**: Beschränken Sie den Zugriff auf vertrauenswürdige IP-Bereiche
- **HTTPS**: Verwenden Sie immer HTTPS in Produktionsumgebungen
- **Rate Limiting**: Erwägen Sie Rate Limiting auf Reverse-Proxy-Ebene
- **Payload-Validierung**: Alle Requests werden auf korrektes JSON-Format und erforderliche Felder validiert

### Integrations-Beispiele

Das `examples/`-Verzeichnis enthält umfassende Webhook-Integrations-Beispiele:

- `webhook-integration-example.js` - Vollständige Integrationsmuster
- `webhook-client.js` - Test-Client für Webhook-Endpunkte
- `examples/configuration/config.webhook.example.toml` - Vollständiges Webhook-Konfigurationsbeispiel

## Sichtbarkeits-Konfiguration

Buntspecht bietet eine detaillierte Kontrolle über die Nachrichtensichtbarkeit mit Unterstützung für alle Mastodon-Sichtbarkeitsstufen:

- **`public`**: Für alle sichtbar, erscheint in öffentlichen Timelines
- **`unlisted`**: Für alle sichtbar, aber erscheint nicht in öffentlichen Timelines (Standard)
- **`private`**: Nur für Follower sichtbar (nur Follower)
- **`direct`**: Nur für erwähnte Benutzer sichtbar (Direktnachricht)

### Sichtbarkeits-Priorität

Die Sichtbarkeit wird durch die folgende Prioritätsreihenfolge bestimmt (höchste zu niedrigste):

1. **Webhook-Anfrage `visibility` Parameter** (für Push-Provider)
2. **Push-Provider-Konfiguration `defaultVisibility`**
3. **Provider `visibility` Einstellung**
4. **Account `defaultVisibility`**
5. **Globaler Standard** (`unlisted`)

### Konfigurationsbeispiele

```toml
# Account-Ebene Standard-Sichtbarkeit
[[accounts]]
name = "main-account"
instance = "https://mastodon.social"
accessToken = "your-token"
defaultVisibility = "unlisted"  # Standard für diesen Account

# Provider-Ebene Sichtbarkeit
[[bot.providers]]
name = "public-announcements"
type = "ping"
visibility = "public"  # Überschreibt Account-Standard
accounts = ["main-account"]

# Push-Provider mit Sichtbarkeitsoptionen
[[bot.providers]]
name = "alerts"
type = "push"
visibility = "unlisted"  # Provider-Standard
accounts = ["main-account"]

[bot.providers.config]
defaultVisibility = "private"  # Provider-spezifischer Standard
```

### Webhook-Sichtbarkeitskontrolle

Push-Provider können Sichtbarkeitseinstellungen über Webhook-Anfragen erhalten:

```bash
# Webhook mit benutzerdefinierter Sichtbarkeit
curl -X POST http://localhost:3000/webhook \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: your-secret" \
  -d '{
    "provider": "alerts",
    "message": "Private Wartungsbenachrichtigung",
    "visibility": "private"
  }'
```

## Multi-Account und Multi-Provider-Konfiguration

Buntspecht unterstützt mehrere Fediverse/Mastodon-Accounts mit eigenen Access-Tokens sowie die gleichzeitige Ausführung mehrerer Provider mit individuellen Zeitplänen. Dies ermöglicht es, verschiedene Arten von Nachrichten zu unterschiedlichen Zeiten an verschiedene Accounts zu posten.

### Multi-Account-Konfiguration

Zuerst konfigurieren Sie mehrere Accounts:

```toml
# Mehrere Fediverse/Mastodon-Accounts
[[accounts]]
name = "main-account"
instance = "https://mastodon.social"
accessToken = "dein-hauptaccount-token-hier"

[[accounts]]
name = "backup-account"
instance = "https://fosstodon.org"
accessToken = "dein-backup-account-token-hier"

[[accounts]]
name = "work-account"
instance = "https://deine-firmen-instanz.com"
accessToken = "dein-arbeits-token-hier"
```

### Multi-Provider-Konfiguration mit Account-Zuordnung

Dann konfigurieren Sie Provider und ordnen sie Accounts zu:

```toml
[bot]
# Multi-Provider Konfiguration
# Jeder Provider kann einen eigenen Zeitplan und eigene Konfiguration haben
# Jeder Provider kann an einen oder mehrere Accounts posten

# Provider 1: Stündliche Ping-Nachrichten (an alle Accounts)
[[bot.providers]]
name = "hourly-ping"
type = "ping"
cronSchedule = "0 * * * *"  # Jede Stunde
enabled = true
accounts = ["main-account", "backup-account", "work-account"]  # An alle Accounts

[bot.providers.config]
message = "🤖 Stündlicher Ping von Buntspecht!"

# Provider 2: Tägliche Systemstatistiken (nur an Hauptaccount)
[[bot.providers]]
name = "daily-stats"
type = "command"
cronSchedule = "0 9 * * *"  # Jeden Tag um 9:00 Uhr
enabled = true
accounts = ["main-account"]  # Nur an Hauptaccount

[bot.providers.config]
command = "uptime"
timeout = 10000

# Provider 3: GitHub Repository-Updates (an Haupt- und Backup-Account)
[[bot.providers]]
name = "github-stats"
type = "jsoncommand"
cronSchedule = "0 */6 * * *"  # Alle 6 Stunden
enabled = true
accounts = ["main-account", "backup-account"]  # An zwei Accounts

[bot.providers.config]
command = "curl -s 'https://api.github.com/repos/octocat/Hello-World' | jq '{name: .name, stars: .stargazers_count}'"
template = "📊 Repository {{name}} hat {{stars}} Sterne!"

# Provider 4: Arbeits-Updates (nur an Arbeitsaccount)
[[bot.providers]]
name = "work-updates"
type = "ping"
cronSchedule = "0 10 * * 1"  # Jeden Montag um 10:00 Uhr
enabled = true
accounts = ["work-account"]  # Nur an Arbeitsaccount

[bot.providers.config]
message = "📅 Neue Arbeitswoche beginnt!"
```

### Vorteile der Multi-Account und Multi-Provider-Konfiguration

- **Flexible Account-Zuordnung**: Jeder Provider kann an beliebige Accounts posten
- **Robuste Fehlerbehandlung**: Wenn das Posten an einen Account fehlschlägt, werden die anderen trotzdem versucht
- **Unabhängige Zeitpläne**: Jeder Provider kann zu unterschiedlichen Zeiten ausgeführt werden
- **Individuelle Aktivierung**: Provider können einzeln aktiviert/deaktiviert werden
- **Verschiedene Nachrichtentypen**: Mischen Sie statische Nachrichten, Kommandos und JSON-Templates
- **Fehlertoleranz**: Fehler in einem Provider beeinträchtigen andere Provider nicht
- **Flexible Konfiguration**: Jeder Provider kann eigene Umgebungsvariablen und Einstellungen haben
- **Account-Trennung**: Verschiedene Inhalte können an verschiedene Zielgruppen gesendet werden

### Cron-Schedule Beispiele

```
"0 * * * *"       = jede Stunde
"*/30 * * * *"    = alle 30 Minuten  
"0 9 * * *"       = jeden Tag um 9:00 Uhr
"0 9 * * 1"       = jeden Montag um 9:00 Uhr
"0 */6 * * *"     = alle 6 Stunden
"0 9,17 * * 1-5"  = Mo-Fr um 9:00 und 17:00 Uhr
"*/15 9-17 * * 1-5" = alle 15 Min zwischen 9-17 Uhr, Mo-Fr
```

## Logging und Monitoring

### Erweiterte Logging-Funktionen

Buntspecht bietet umfassendes Logging mit detaillierten Informationen über das Posten von Nachrichten:

```
[2025-07-06T12:48:21.509Z] INFO  Posting status to Bluesky test-account (https://bsky.social) (280 chars): "Ihr Nachrichteninhalt hier..."
[2025-07-06T12:48:21.511Z] INFO  Status posted successfully to Bluesky test-account. URI: at://did:plc:test/app.bsky.feed.post/test123
```

**Zeichenanzahl-Monitoring:**
- Zeigt exakte Zeichenanzahl für jede gepostete Nachricht
- Hilft bei der Überprüfung der Einhaltung von Plattform-Limits:
  - **Twitter/X**: 280 Zeichen
  - **Mastodon**: 500 Zeichen (Standard, variiert je Instanz)
  - **Bluesky**: 300 Zeichen
- Nützlich für das Debugging der Trim-Funktions-Effektivität
- Ermöglicht Analysen von Nachrichtenlängen-Mustern

**Log-Level:**
- `DEBUG`: Detaillierte Ausführungsinformationen
- `INFO`: Normale Operationen und Status-Updates
- `WARN`: Nicht-kritische Probleme und Warnungen
- `ERROR`: Kritische Fehler und Ausfälle

## Verwendung

### Bot starten

```bash
# Mit Standard-Konfiguration
bun start

# Mit spezifischer Konfigurationsdatei
bun start --config /pfad/zur/config.toml

# Development-Modus (direkte TypeScript-Ausführung)
bun run dev
```

### CLI-Optionen

```bash
# Hilfe anzeigen
bun start --help

# Verbindung testen
bun start --verify

# Docker-Verwendung (Empfohlen)
# Grundlegende Ausführung (Daemon-Modus)
docker run -d \
  --name buntspecht \
  -v /pfad/zu/config.toml:/app/config.toml:ro \
  ghcr.io/rmoriz/buntspecht:latest

# Mit Docker Compose ausführen
docker-compose up -d

# Sofort eine Test-Nachricht posten (alle Provider)
docker exec buntspecht bun start --test-post

# Test-Nachricht von spezifischem Provider posten
docker exec buntspecht bun start --test-provider provider-name

# Alle konfigurierten Provider auflisten
docker exec buntspecht bun start --list-providers

# Alle Push-Provider auflisten
docker exec buntspecht bun start --list-push-providers

# Webhook-Server-Status und -Konfiguration anzeigen
docker exec buntspecht bun start --webhook-status

# Push-Provider mit Standard-Nachricht auslösen
docker exec buntspecht bun start --trigger-push provider-name

# Push-Provider mit benutzerdefinierter Nachricht auslösen
docker exec buntspecht bun start --trigger-push provider-name --trigger-push-message "Benutzerdefinierte Nachricht"

# Logs anzeigen
docker logs -f buntspecht

# Container stoppen
docker stop buntspecht

# Auf neueste Version aktualisieren
docker pull ghcr.io/rmoriz/buntspecht:latest
docker stop buntspecht
docker rm buntspecht
# Dann erneut mit denselben Parametern ausführen

# Binary/Source-Verwendung
# Sofort eine Test-Nachricht posten (alle Provider)
bun start --test-post

# Test-Nachricht von spezifischem Provider posten
bun start --test-provider provider-name

# Alle konfigurierten Provider auflisten
bun start --list-providers

# Alle Push-Provider auflisten
bun start --list-push-providers

# Webhook-Server-Status und -Konfiguration anzeigen
bun start --webhook-status

# Push-Provider mit Standard-Nachricht auslösen
bun start --trigger-push provider-name

# Push-Provider mit benutzerdefinierter Nachricht auslösen
bun start --trigger-push provider-name --trigger-push-message "Benutzerdefinierte Nachricht"

# Spezifische Konfigurationsdatei verwenden
bun start --config /pfad/zur/config.toml
```


## Media-Anhänge und Bilder

Buntspecht unterstützt das Posten von Media-Anhängen (Bilder, Dokumente, etc.) zusammen mit Textnachrichten. Diese Funktion arbeitet mit **JSON Command** und **Multi-JSON Command** Providern und ermöglicht es, base64-kodierte Dateien in automatisierte Posts einzubinden.

### Unterstützte Plattformen

- **Mastodon**: Unterstützt mehrere Anhänge verschiedener Dateitypen (Bilder, Videos, Audio, Dokumente)
- **Bluesky**: Unterstützt nur bis zu 4 Bilder (JPEG, PNG, GIF, WebP)

### Grundlegende Anhang-Konfiguration

Um Anhänge zu aktivieren, konfigurieren Sie den `attachmentsKey` in Ihrer Provider-Konfiguration:

```toml
[[bot.providers]]
name = "wetter-mit-diagrammen"
type = "jsoncommand"
cronSchedule = "0 8 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = "curl -s 'https://api.weather.example.com/current' | jq '{...}'"
template = "🌤️ Wetter: {{temperature}}°C - {{condition}}"
attachmentsKey = "attachments"  # JSON-Schlüssel für das Anhänge-Array
```

### Anhang-Datenformat

Die JSON-Ausgabe Ihres Kommandos muss ein Array von Anhang-Objekten enthalten:

```json
{
  "temperature": "22",
  "condition": "Sonnig",
  "attachments": [
    {
      "data": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "mimeType": "image/png",
      "filename": "wetter_diagramm.png",
      "description": "24-Stunden Temperaturdiagramm"
    }
  ]
}
```

### Erforderliche Felder

Jedes Anhang-Objekt muss enthalten:

- **`data`**: Base64-kodierter Dateiinhalt (erforderlich)
- **`mimeType`**: MIME-Typ wie `image/jpeg`, `image/png`, `application/pdf` (erforderlich)
- **`filename`**: Optionaler Dateiname für den Anhang
- **`description`**: Optionale Beschreibung/Alt-Text für Barrierefreiheit

### Erweiterte Konfigurationsoptionen

#### Benutzerdefinierte Feldnamen

Sie können die Feldnamen innerhalb jedes Anhang-Objekts anpassen, um sie an das Antwortformat Ihrer API anzupassen:

```toml
[bot.providers.config]
attachmentsKey = "files"                    # Benutzerdefinierter Schlüssel für Anhänge-Array
attachmentDataKey = "content"               # Benutzerdefinierter Schlüssel für base64-Daten (Standard: "data")
attachmentMimeTypeKey = "format"            # Benutzerdefinierter Schlüssel für MIME-Typ (Standard: "mimeType")
attachmentFilenameKey = "title"             # Benutzerdefinierter Schlüssel für Dateiname (Standard: "filename")
attachmentDescriptionKey = "caption"        # Benutzerdefinierter Schlüssel für Beschreibung (Standard: "description")
```

**Beispiel mit benutzerdefinierten Feldnamen:**

Ihre API gibt diese JSON-Struktur zurück:
```json
{
  "message": "Wetter-Update",
  "files": [
    {
      "content": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      "format": "image/png",
      "title": "wetter_diagramm.png",
      "caption": "Heutiges Temperaturdiagramm"
    }
  ]
}
```

Konfigurieren Sie Ihren Provider, um diese benutzerdefinierten Felder zu mappen:
```toml
[[bot.providers]]
name = "custom-api-wetter"
type = "jsoncommand"
cronSchedule = "0 8 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = "curl -s 'https://api.custom-weather.com/report'"
template = "📊 {{message}}"
attachmentsKey = "files"                    # Zeigt auf das "files" Array
attachmentDataKey = "content"               # Mappt auf "content" Feld für base64-Daten
attachmentMimeTypeKey = "format"            # Mappt auf "format" Feld für MIME-Typ
attachmentFilenameKey = "title"             # Mappt auf "title" Feld für Dateiname
attachmentDescriptionKey = "caption"        # Mappt auf "caption" Feld für Beschreibung
```

#### Automatische Feld-Fallbacks

Das System versucht automatisch Fallback-Feldnamen, wenn die konfigurierten nicht gefunden werden:

- **MIME-Typ**: `mimeType` → `type`
- **Dateiname**: `filename` → `name`
- **Beschreibung**: `description` → `alt`

**Beispiel mit gemischten Feldnamen (automatische Fallbacks):**

Ihre API gibt inkonsistente Feldnamen zurück:
```json
{
  "title": "Gemischte API-Antwort",
  "attachments": [
    {
      "data": "base64-bild-daten-hier",
      "mimeType": "image/jpeg",
      "filename": "foto1.jpg",
      "description": "Erstes Foto"
    },
    {
      "data": "base64-bild-daten-hier",
      "type": "image/png",           // Anderer Feldname für MIME-Typ
      "name": "diagramm.png",        // Anderer Feldname für Dateiname
      "alt": "Leistungsdiagramm"     // Anderer Feldname für Beschreibung
    }
  ]
}
```

Mit Standard-Konfiguration funktionieren beide Anhänge automatisch:
```toml
[bot.providers.config]
attachmentsKey = "attachments"
# Verwendung der Standards mit automatischen Fallbacks:
# - attachmentDataKey = "data" (Standard)
# - attachmentMimeTypeKey = "mimeType" (Standard, mit Fallback auf "type")
# - attachmentFilenameKey = "filename" (Standard, mit Fallback auf "name")
# - attachmentDescriptionKey = "description" (Standard, mit Fallback auf "alt")
```

#### Verschachtelte JSON-Schlüssel

Verwenden Sie Punkt-Notation für verschachtelte Anhang-Daten:

```toml
attachmentsKey = "data.files"  # Greift auf data.files Array zu
```

**Beispiel mit verschachtelter Struktur:**

Ihre API gibt tief verschachtelte Anhang-Daten zurück:
```json
{
  "response": {
    "status": "success",
    "data": {
      "report": {
        "title": "Verkaufsbericht",
        "media": [
          {
            "fileData": "base64-pdf-inhalt-hier",
            "contentType": "application/pdf",
            "displayName": "Q4-verkauf.pdf",
            "altText": "Q4 Verkaufsleistungsbericht"
          }
        ]
      }
    }
  }
}
```

Konfiguration mit verschachtelten Schlüsseln und benutzerdefiniertem Feld-Mapping:
```toml
[bot.providers.config]
template = "📈 {{response.data.report.title}}"
attachmentsKey = "response.data.report.media"    # Verschachtelter Pfad zu Anhängen
attachmentDataKey = "fileData"                   # Benutzerdefiniertes Datenfeld
attachmentMimeTypeKey = "contentType"            # Benutzerdefiniertes MIME-Typ-Feld
attachmentFilenameKey = "displayName"            # Benutzerdefiniertes Dateiname-Feld
attachmentDescriptionKey = "altText"             # Benutzerdefiniertes Beschreibungsfeld
```

### Praxisnahe API-Integrations-Beispiele

#### Beispiel 1: GitHub API mit Release Assets

```toml
[[bot.providers]]
name = "github-releases"
type = "jsoncommand"
cronSchedule = "0 9 * * *"
accounts = ["mastodon-account"]

[bot.providers.config]
command = """
curl -s 'https://api.github.com/repos/owner/repo/releases/latest' | jq '{
  name: .name,
  body: .body,
  attachments: [.assets[] | {
    data: (.browser_download_url | @base64),  # Sie müssten dies herunterladen und kodieren
    mimeType: .content_type,
    filename: .name,
    description: ("Release Asset: " + .name)
  }]
}'
"""
template = "🚀 Neues Release: {{name}}"
attachmentsKey = "attachments"
# Verwendung der Standard-Feldnamen, da unsere jq-Transformation diese verwendet
```

#### Beispiel 2: WordPress API mit Featured Images

```toml
[[bot.providers]]
name = "wordpress-posts"
type = "multijsoncommand"
cronSchedule = "0 12 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = """
curl -s 'https://blog.example.com/wp-json/wp/v2/posts?_embed' | jq '[
  .[] | {
    id: .id,
    title: .title.rendered,
    excerpt: .excerpt.rendered,
    media: [._embedded."wp:featuredmedia"[]? | {
      imageData: .source_url,  # Sie würden dies herunterladen und base64-kodieren
      mediaType: .mime_type,
      fileName: .slug,
      altDescription: .alt_text
    }]
  }
]'
"""
template = "📝 {{title}}"
attachmentsKey = "media"
attachmentDataKey = "imageData"
attachmentMimeTypeKey = "mediaType"
attachmentFilenameKey = "fileName"
attachmentDescriptionKey = "altDescription"
uniqueKey = "id"
```

#### Beispiel 3: Slack API mit Datei-Anhängen

```toml
[[bot.providers]]
name = "slack-files"
type = "jsoncommand"
cronSchedule = "0 14 * * *"
accounts = ["mastodon-account"]

[bot.providers.config]
command = """
curl -s -H "Authorization: Bearer $SLACK_TOKEN" \
'https://slack.com/api/files.list?channel=C1234567890' | jq '{
  message: "Aktuelle Dateien aus Slack",
  files: [.files[] | {
    content: .url_private,  # Sie würden dies herunterladen und base64-kodieren
    type: .mimetype,
    name: .name,
    alt: .title
  }]
}'
"""
template = "📎 {{message}}"
attachmentsKey = "files"
attachmentDataKey = "content"
attachmentMimeTypeKey = "type"
attachmentFilenameKey = "name"
attachmentDescriptionKey = "alt"
```

### Plattformspezifisches Verhalten

#### Mastodon
- Unterstützt mehrere Anhänge (typischerweise bis zu 4)
- Unterstützt verschiedene Dateitypen: Bilder, Videos, Audio, Dokumente
- Behält ursprüngliche Dateinamen und Beschreibungen bei
- Zeigt Beschreibungen als Alt-Text für Barrierefreiheit

#### Bluesky
- **Nur Bilder**: Unterstützt JPEG, PNG, GIF, WebP Formate
- **Maximal 4 Bilder** pro Post
- **URL-Embed-Priorität**: Wenn sowohl URL-Embeds als auch Anhänge vorhanden sind, haben URL-Embeds Priorität
- Beschreibungen werden zu Alt-Text für Barrierefreiheit
- Nicht-Bild-Anhänge werden automatisch übersprungen

### Beispiel-Konfigurationen

#### Wetterberichte mit Diagrammen

```toml
[[bot.providers]]
name = "wetterberichte"
type = "jsoncommand"
cronSchedule = "0 8 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = """
curl -s 'https://api.weather.example.com/current' | jq '{
  location: .location.name,
  temperature: .current.temp_c,
  condition: .current.condition.text,
  attachments: [
    {
      data: .charts.temperature_chart_base64,
      mimeType: "image/png",
      filename: "temperatur_diagramm.png",
      description: "24-Stunden Temperaturdiagramm"
    }
  ]
}'
"""
template = "🌤️ {{location}}: {{temperature}}°C - {{condition}}"
attachmentsKey = "attachments"
```

#### Multi-JSON mit Foto-Posts

```toml
[[bot.providers]]
name = "foto-posts"
type = "multijsoncommand"
cronSchedule = "0 12 * * *"
accounts = ["mastodon-account", "bluesky-account"]

[bot.providers.config]
command = """
curl -s 'https://api.photos.example.com/daily' | jq '[
  .photos[] | {
    id: .id,
    caption: .caption,
    attachments: [
      {
        data: .image_base64,
        mimeType: "image/jpeg",
        filename: (.id + ".jpg"),
        description: .alt_text
      }
    ]
  }
]'
"""
template = "📸 {{caption}}"
attachmentsKey = "attachments"
uniqueKey = "id"
```

#### Gemischte Dateitypen (Nur Mastodon)

```toml
[[bot.providers]]
name = "wochenberichte"
type = "jsoncommand"
cronSchedule = "0 9 * * 1"
accounts = ["mastodon-account"]  # Nur Mastodon für PDF-Unterstützung

[bot.providers.config]
command = """
./scripts/generate-report.sh | jq '{
  title: .report.title,
  summary: .report.summary,
  attachments: [
    {
      data: .report.pdf_base64,
      mimeType: "application/pdf",
      filename: "wochenbericht.pdf",
      description: "Wöchentlicher Leistungsbericht"
    },
    {
      data: .report.chart_base64,
      mimeType: "image/png",
      filename: "leistungs-diagramm.png",
      description: "Leistungsmetriken-Visualisierung"
    }
  ]
}'
"""
template = "📊 {{title}}: {{summary}}"
attachmentsKey = "attachments"
```

### Fehlerbehandlung und Validierung

#### Automatische Validierung
- **Base64-Validierung**: Ungültige base64-Daten werden automatisch übersprungen
- **Erforderliche Felder**: Anhänge ohne `data` oder `mimeType` werden übersprungen
- **Plattform-Filterung**: Nicht-Bild-Anhänge werden für Bluesky herausgefiltert
- **Größenlimits**: Plattformspezifische Limits werden respektiert

#### Logging
- Detaillierte Logs für Anhang-Verarbeitung
- Warnungen für übersprungene Anhänge mit Begründungen
- Erfolgsbestätigungen mit Anhang-Anzahl

#### Graceful Degradation
- Einzelne Anhang-Fehler stoppen den Post nicht
- Posts werden auch fortgesetzt, wenn alle Anhänge fehlschlagen
- Klare Fehlermeldungen für Troubleshooting

### Performance-Überlegungen

#### Dateigröße und Verarbeitung
- **Base64-Overhead**: Base64-Kodierung erhöht Dateigröße um ~33%
- **Speicherverbrauch**: Große Anhänge verbrauchen mehr Speicher während der Verarbeitung
- **Upload-Zeit**: Mehrere/große Anhänge erhöhen die Posting-Zeit

#### Optimierungstipps
- Verwenden Sie angemessene Bildkompression vor base64-Kodierung
- Berücksichtigen Sie Timeout-Einstellungen für Kommandos, die Anhänge generieren
- Überwachen Sie Speicherverbrauch bei großen Anhang-Workflows
- Verwenden Sie Caching für Multi-JSON Provider, um Neuverarbeitung zu vermeiden

### Troubleshooting

#### Häufige Probleme

1. **"Anhang übersprungen - ungültiges base64"**
   - Überprüfen Sie, dass Ihre base64-Kodierung korrekt ist
   - Stellen Sie sicher, dass keine Zeilenumbrüche oder zusätzliche Zeichen in base64-Daten vorhanden sind

2. **"Anhang fehlendes erforderliches Feld"**
   - Prüfen Sie, dass `data` und `mimeType` Felder vorhanden sind
   - Überprüfen Sie, dass Feldnamen mit Ihrer Konfiguration übereinstimmen

3. **"Bluesky: Nicht-Bild-Anhang übersprungen"**
   - Bluesky unterstützt nur Bilder (JPEG, PNG, GIF, WebP)
   - Verwenden Sie Nur-Mastodon-Accounts für andere Dateitypen

4. **"Upload für Anhang fehlgeschlagen"**
   - Prüfen Sie Netzwerkverbindung
   - Überprüfen Sie Dateigrößenlimits
   - Stellen Sie sicher, dass MIME-Typ von der Plattform unterstützt wird

#### Debug-Konfiguration

```toml
[logging]
level = "debug"  # Aktiviert detaillierte Anhang-Verarbeitungs-Logs
```

### Sicherheitsüberlegungen

- **Base64-Validierung**: Alle base64-Daten werden vor der Verarbeitung validiert
- **MIME-Typ-Überprüfung**: MIME-Typen werden gegen Plattformanforderungen geprüft
- **Dateigrößenlimits**: Plattformlimits werden durchgesetzt, um Missbrauch zu verhindern
- **Fehler-Isolation**: Anhang-Fehler geben keine sensible Kommando-Ausgabe preis

## Bluesky-Integration

Buntspecht unterstützt jetzt **Bluesky** neben Mastodon und ermöglicht plattformübergreifende Social Media Automatisierung.

### Bluesky-Account-Einrichtung

1. **Erstellen Sie ein App-Passwort** in Ihren Bluesky-Einstellungen (nicht Ihr Hauptpasswort!)
2. **Konfigurieren Sie Ihren Account** in der TOML-Datei:

```toml
[[accounts]]
name = "mein-bluesky"
type = "bluesky"
instance = "https://bsky.social"  # Optional: Standard ist https://bsky.social
identifier = "deinhandle.bsky.social"  # Ihr Bluesky-Handle oder DID
password = "ihr-app-passwort"  # App-Passwort aus den Bluesky-Einstellungen
```

### Plattformübergreifendes Posten

Posten Sie gleichzeitig auf Mastodon und Bluesky:

```toml
[[bot.providers]]
name = "plattformuebergreifende-ankuendigungen"
type = "ping"
cronSchedule = "0 12 * * *"  # Täglich um 12:00 Uhr
enabled = true
accounts = ["mastodon-haupt", "bluesky-haupt"]  # Postet auf beide Plattformen!

[bot.providers.config]
message = "🤖 Tägliches Update von unserem Bot! #automation #crossplatform"
```

### Plattform-spezifische Features

- **Mastodon**: Vollständige Sichtbarkeitskontrolle (öffentlich, ungelistet, privat, direkt)
- **Bluesky**: Alle Posts sind öffentlich (Sichtbarkeitseinstellungen werden ignoriert)
- **Zeichenlimits**: Mastodon (500), Bluesky (300) - halten Sie Nachrichten unter 280 für Kompatibilität
- **Authentifizierung**: Mastodon verwendet Access-Tokens, Bluesky verwendet App-Passwörter

### Bluesky-Konfigurationsbeispiele

Siehe `examples/configuration/config.bluesky.example.toml` für umfassende plattformübergreifende Konfigurationsbeispiele.

## Telemetrie und Monitoring

Buntspecht unterstützt OpenTelemetry für umfassendes Monitoring, Tracing und Metriken. Dies ermöglicht es, die Performance und das Verhalten des Bots zu überwachen und zu analysieren.

> **⚠️ Wichtiger Hinweis für Single Binary Builds**: OpenTelemetry-Dependencies werden bei der Erstellung von Single Binaries mit `bun build --compile` ausgeschlossen (`--external @opentelemetry/*`), da sie zur Laufzeit nicht verfügbar sind. Telemetrie funktioniert nur bei der Ausführung mit `bun run` oder `npm start`, nicht mit den vorkompilierten Binaries. Für Produktionsumgebungen mit Telemetrie verwenden Sie Docker oder führen Sie den Bot direkt mit Bun/Node.js aus.

### Telemetrie-Konfiguration

```toml
[telemetry]
# OpenTelemetry aktivieren/deaktivieren
enabled = true
serviceName = "buntspecht"
serviceVersion = "0.8.0"

[telemetry.jaeger]
# Jaeger für Distributed Tracing
enabled = true
endpoint = "http://localhost:14268/api/traces"

[telemetry.prometheus]
# Prometheus für Metriken
enabled = true
port = 9090
endpoint = "/metrics"

[telemetry.tracing]
# Tracing aktivieren
enabled = true

[telemetry.metrics]
# Metriken aktivieren
enabled = true
```

### Verfügbare Metriken

- **`buntspecht_posts_total`**: Anzahl der erfolgreich gesendeten Posts (mit Labels: account, provider)
- **`buntspecht_errors_total`**: Anzahl der Fehler (mit Labels: error_type, provider, account)
- **`buntspecht_provider_execution_duration_seconds`**: Ausführungszeit der Provider (mit Label: provider)
- **`buntspecht_active_connections`**: Anzahl aktiver Social Media Verbindungen (Mastodon + Bluesky)
- **`buntspecht_rate_limit_hits_total`**: Anzahl der Rate-Limit-Treffer (mit Labels: provider, current_count, limit)
- **`buntspecht_rate_limit_resets_total`**: Anzahl der Rate-Limit-Resets (mit Label: provider)
- **`buntspecht_rate_limit_current_count`**: Aktuelle Rate-Limit-Nutzung (mit Labels: provider, limit, usage_percentage)

### Verfügbare Traces

- **`mastodon.post_status`**: Mastodon-Post-Operationen mit Attributen wie:
  - `mastodon.accounts_count`: Anzahl der Ziel-Accounts
- **`bluesky.post_status`**: Bluesky-Post-Operationen mit Attributen wie:
  - `bluesky.accounts_count`: Anzahl der Ziel-Accounts
- **`social_media.post_status`**: Plattformübergreifende Post-Operationen mit Attributen wie:
  - `social_media.accounts_count`: Gesamtanzahl der Ziel-Accounts
  - `mastodon.provider`: Name des Providers
  - `mastodon.message_length`: Länge der Nachricht

- **`provider.execute_task`**: Provider-Ausführungen mit Attributen wie:
  - `provider.name`: Name des Providers
  - `provider.type`: Typ des Providers
  - `provider.accounts`: Liste der Ziel-Accounts

### Monitoring-Setup

#### Jaeger (Distributed Tracing)

```bash
# Jaeger mit Docker starten
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest

# Jaeger UI öffnen
open http://localhost:16686
```

#### Prometheus (Metriken)

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'buntspecht'
    static_configs:
      - targets: ['localhost:9090']
```

```bash
# Prometheus mit Docker starten
docker run -d --name prometheus \
  -p 9090:9090 \
  -v $(pwd)/prometheus.yml:/etc/prometheus/prometheus.yml \
  prom/prometheus

# Metriken direkt abrufen
curl http://localhost:9090/metrics
```

#### Grafana Dashboard

Beispiel-Queries für Grafana:

```promql
# Posts pro Minute
rate(buntspecht_posts_total[1m])

# Fehlerrate
rate(buntspecht_errors_total[5m])

# Provider-Ausführungszeit
buntspecht_provider_execution_duration_seconds

# Aktive Verbindungen
buntspecht_active_connections

# Rate-Limit-Nutzung in Prozent
buntspecht_rate_limit_current_count
```

## Technologien

### Core Dependencies

- **[masto.js](https://github.com/neet/masto.js)** (v6.8.0): Moderne TypeScript-Bibliothek für Mastodon-API
- **[@atproto/api](https://github.com/bluesky-social/atproto)** (v0.15.23): Offizielle Bluesky/AT Protocol API-Client
- **[node-cron](https://github.com/node-cron/node-cron)** (v3.0.3): Cron-Job-Scheduling
- **[toml](https://github.com/BinaryMuse/toml-node)** (v3.0.0): TOML-Konfigurationsdateien
- **[commander](https://github.com/tj/commander.js)** (v11.1.0): CLI-Argument-Parsing

### Telemetry & Monitoring

- **[@opentelemetry/sdk-node](https://github.com/open-telemetry/opentelemetry-js)** (v0.202.0): OpenTelemetry Node.js SDK
- **[@opentelemetry/auto-instrumentations-node](https://github.com/open-telemetry/opentelemetry-js-contrib)** (v0.60.1): Automatische Instrumentierung
- **[@opentelemetry/exporter-jaeger](https://github.com/open-telemetry/opentelemetry-js)** (v2.0.1): Jaeger-Exporter für Tracing
- **[@opentelemetry/exporter-prometheus](https://github.com/open-telemetry/opentelemetry-js)** (v0.202.0): Prometheus-Exporter für Metriken

### Development Tools

- **TypeScript** (v5.3.2): Statische Typisierung
- **Jest** (v29.7.0): Test-Framework mit 161+ Tests
- **ESLint** (v8.54.0): Code-Qualität und Linting
- **Docker**: Containerisierung und CI/CD

### Migration History

**2025-06**: Migration von Node.js zu Bun
- **Runtime**: Wechsel von Node.js zu Bun v1.2+ für bessere Performance
- **Build-System**: TypeScript-Kompilierung mit Bun-Unterstützung
- **Docker**: Optimierte Container mit oven/bun:1.2-alpine Base-Image
- **Tools**: Zusätzliche Container-Tools (curl, ping, uptime, jq)
- **Kompatibilität**: Vollständige Rückwärtskompatibilität aller Features

**2025-06**: Migration von `mastodon-api` zu `masto.js`
- **Grund**: Bessere TypeScript-Unterstützung und aktive Entwicklung
- **Vorteile**: Native Typen, strukturierte v1/v2 API, moderne Architektur
- **Kompatibilität**: Alle Tests und Funktionalitäten vollständig beibehalten
- **Breaking Changes**: Keine für Endnutzer - nur interne API-Änderungen

## Development

### Tests ausführen

```bash
# Alle Tests (mit Jest für Kompatibilität)
bun run test

# Tests mit Watch-Modus
bun run test:watch

# Test-Coverage
bun run test:coverage

# Alternative: Native Bun-Tests (experimentell)
bun run test:bun
```

### Code-Qualität

```bash
# Linting
bun run lint

# Linting mit Auto-Fix
bun run lint:fix
```

### Binary-Builds

```bash
# Lokale Binary erstellen
bun run build:binary

# Alle Plattformen (Cross-Compilation)
bun run build:binaries

# Spezifische Plattform
bun run build:binary:linux-x64
bun run build:binary:linux-arm64
bun run build:binary:macos-x64
bun run build:binary:macos-arm64
```

**Hinweis**: Binary-Builds enthalten keine OpenTelemetry-Unterstützung aufgrund von Kompatibilitätsproblemen. Telemetrie ist automatisch deaktiviert.

#### Build-Scripts

```bash
# Alle Binaries mit einem Befehl erstellen
./scripts/build-all-binaries.sh

# Alle Binaries testen
./scripts/test-binaries.sh
```

### Projektstruktur

```
src/
├── __tests__/          # Test-Dateien (161+ Tests)
├── config/             # Konfiguration
│   └── configLoader.ts
├── messages/           # Message Provider System
│   ├── messageProvider.ts
│   ├── messageProviderFactory.ts
│   ├── pingProvider.ts
│   ├── commandProvider.ts
│   └── index.ts
├── services/           # Hauptservices
│   ├── mastodonClient.ts
│   └── botScheduler.ts
├── types/              # TypeScript-Typen
│   └── config.ts
├── utils/              # Hilfsfunktionen
│   └── logger.ts
├── bot.ts              # Haupt-Bot-Klasse
├── cli.ts              # CLI-Argument-Parser
└── index.ts            # Entry Point
```

## Docker

### Image bauen

```bash
docker build -t buntspecht .
```

### Container ausführen

```bash
# Mit Volume für Konfiguration
docker run -d \
  --name ping-bot \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  buntspecht

# Mit Environment-Variable
docker run -d \
  --name ping-bot \
  -e BUNTSPECHT_CONFIG=/app/config.toml \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  buntspecht
```

### Docker Compose

```yaml
services:
  buntspecht:
    build: .
    container_name: ping-bot
    volumes:
      - ./config.toml:/app/config.toml:ro
    restart: unless-stopped
    environment:
      - NODE_ENV=production
```

## CI/CD

Das Dockerfile ist optimiert für CI/CD-Pipelines:

- Multi-stage Build für kleinere Images
- Non-root User für Sicherheit
- Health Checks
- Proper Layer Caching

### GitHub Actions Beispiel

```yaml
name: Build and Deploy

on:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: oven-sh/setup-bun@v1
        with:
          bun-version: "1.2"
      - run: bun install --frozen-lockfile
      - run: bun run test
      - run: bun run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t buntspecht .
```

## Troubleshooting

### Häufige Probleme

1. **"No configuration file found"**

   - Stellen Sie sicher, dass eine `config.toml` existiert
   - Prüfen Sie die Pfade in der Prioritätsreihenfolge

2. **"Failed to connect to Mastodon"**

   - Überprüfen Sie die `instance` URL
   - Validieren Sie den `accessToken`
   - Testen Sie mit `--verify`

3. **"Invalid cron schedule"**
   - Verwenden Sie das Standard-Format: "Minute Stunde Tag Monat Wochentag"
   - Testen Sie Ihre Cron-Expression online

### Debugging

```bash
# Debug-Logs aktivieren
# In config.toml:
[logging]
level = "debug"

# Oder via Environment:
DEBUG=* bun start
```

## Lizenz

MIT License - siehe LICENSE Datei für Details.

## Beitragen

1. Fork des Repositories
2. Feature Branch erstellen (`git checkout -b feature/amazing-feature`)
3. Änderungen committen (`git commit -m 'Add amazing feature'`)
4. Branch pushen (`git push origin feature/amazing-feature`)
5. Pull Request erstellen

## Support

Bei Problemen oder Fragen:

1. Prüfen Sie die [Issues](../../issues)
2. Erstellen Sie ein neues Issue mit detaillierter Beschreibung
3. Fügen Sie Logs und Konfiguration hinzu (ohne Secrets!)

## KI-gestützte Entwicklung

Dieses Projekt wurde vollständig mit Hilfe von **Claude 3.5 Sonnet (Anthropic)** entwickelt. Die KI-Lösung unterstützte bei:

### 🤖 **Verwendete AI-Technologien:**

- **Claude 3.5 Sonnet**: Hauptentwicklung, Code-Generierung und Architektur
- **Rovo Dev Agent**: Interaktive Entwicklungsumgebung mit Tool-Integration

### 🛠️ **AI-unterstützte Entwicklungsbereiche:**

- **Code-Architektur**: Vollständige TypeScript-Projektstruktur mit Provider-System
- **Test-Entwicklung**: 161+ umfassende Unit-Tests mit Jest
- **Provider-System**: Erweiterbare Message-Provider-Architektur
- **Command-Integration**: Externe Kommando-Ausführung mit Fehlerbehandlung
- **Docker-Konfiguration**: Multi-stage Builds und CI/CD-Pipeline
- **Dokumentation**: Deutsche Lokalisierung und technische Dokumentation
- **Best Practices**: ESLint-Regeln, Git-Workflows und Projektorganisation
- **Library-Migration**: Vollständige Migration von mastodon-api zu masto.js
- **API-Modernisierung**: Anpassung an moderne TypeScript-Standards

### 💡 **Entwicklungsansatz:**

Die Entwicklung erfolgte durch natürlichsprachliche Anforderungen, die von der KI in funktionsfähigen, produktionsreifen Code umgesetzt wurden. Dabei wurden moderne Entwicklungsstandards und bewährte Praktiken automatisch berücksichtigt.

---

**Buntspecht** - Ein zuverlässiger Fediverse-Bot für automatisierte Nachrichten mit flexiblen Quellen 🐦
