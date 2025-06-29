# Buntspecht

[![English](https://img.shields.io/badge/lang-English-blue.svg)](README.md)
[![Deutsch](https://img.shields.io/badge/lang-Deutsch-green.svg)](README.de.md)

<img src="buntspecht-logo.jpeg" alt="Buntspecht Logo" width="150"/>

Ein TypeScript-basierter Mastodon/Fediverse-Bot, der automatisch Nachrichten nach Zeitplan postet. Unterstützt verschiedene Nachrichtenquellen wie statische Texte oder externe Kommandos.

## Features

- 🤖 Automatisches Posten von Nachrichten nach Zeitplan
- 📨 **Mehrere Nachrichtenquellen**: Statische Texte, externe Kommandos oder JSON-basierte Templates
- 🔄 **Multi-Provider-Unterstützung**: Mehrere Provider parallel mit individuellen Zeitplänen
- 🌐 **Multi-Account-Unterstützung**: Mehrere Fediverse/Mastodon-Accounts mit eigenen Access-Tokens
- 📤 **Flexible Account-Zuordnung**: Jeder Provider kann an einen oder mehrere Accounts posten
- ⚙️ Flexible Konfiguration über TOML-Dateien
- 🔍 Mehrere Konfigurationspfade mit Prioritätsreihenfolge
- 📝 Umfassendes Logging
- 🧪 Vollständige Testabdeckung (108+ Tests)
- 🐳 Docker-Support für CI/CD
- 🛡️ TypeScript für Typsicherheit
- 📡 Moderne Mastodon-API-Integration mit masto.js
- 🔧 Erweiterbare Provider-Architektur
- 📊 **OpenTelemetry-Integration**: Monitoring, Tracing und Metriken für Observability
- ⚡ **Bun-Runtime**: Schnellere Performance und native TypeScript-Unterstützung
- 📦 **Single Binary**: Standalone-Executables für alle Plattformen ohne Dependencies

## Installation

### Voraussetzungen

- **Bun**: Version 1.2.0 oder höher
- **Git**: Für das Klonen des Repositories

```bash
# Bun-Version prüfen
bun --version
# Sollte 1.2.0 oder höher anzeigen
```

### Installation

#### Option 1: Vorkompilierte Binaries (Empfohlen)

Laden Sie die passende Binary für Ihr System von den [GitHub Releases](../../releases) herunter:

- **Linux x64**: `buntspecht-linux-x64`
- **Linux ARM64**: `buntspecht-linux-arm64`
- **Linux ARMv8**: `buntspecht-linux-armv8`
- **macOS Intel**: `buntspecht-macos-x64`
- **macOS Apple Silicon**: `buntspecht-macos-arm64`

```bash
# Beispiel für Linux x64
wget https://github.com/rmoriz/buntspecht/releases/latest/download/buntspecht-linux-x64
chmod +x buntspecht-linux-x64
./buntspecht-linux-x64 --help
```

#### Option 2: Aus Quellcode kompilieren

```bash
# Repository klonen
git clone <repository-url>
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
cp config.example.toml config.toml

# Konfiguration bearbeiten
nano config.toml
```

### Konfigurationsformat

```toml
# Fediverse/Mastodon Accounts
[[accounts]]
name = "main-account"
instance = "https://mastodon.social"
accessToken = "dein-access-token-hier"

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
4. Bereiche: `write:statuses`
5. Anwendung erstellen und Access Token kopieren

## Message Provider

Buntspecht unterstützt verschiedene Nachrichtenquellen über ein erweiterbares Provider-System. Jeder Provider läuft unabhängig mit seinem eigenen Zeitplan und kann individuell aktiviert/deaktiviert werden.

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

Führt externe Kommandos aus, die JSON ausgeben, und wendet Templates mit Variablen aus den JSON-Daten an:

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

# Optional: Arbeitsverzeichnis für das Kommando
# cwd = "/pfad/zum/arbeitsverzeichnis"

# Optional: Maximale Puffergröße für stdout/stderr (Standard: 1MB)
# maxBuffer = 1048576

# Optional: Umgebungsvariablen
# [bot.providers.config.env]
# API_KEY = "dein-api-schluessel"
```

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
- Fehlende Variablen werden als `{{variable}}` im Text belassen
- JSON-Werte werden automatisch zu Strings konvertiert

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

# Sofort eine Test-Nachricht posten (alle Provider)
bun start --test-post

# Test-Nachricht von spezifischem Provider posten
bun start --test-provider provider-name

# Alle konfigurierten Provider auflisten
bun start --list-providers

# Spezifische Konfigurationsdatei verwenden
bun start --config /pfad/zur/config.toml
```

## Telemetrie und Monitoring

Buntspecht unterstützt OpenTelemetry für umfassendes Monitoring, Tracing und Metriken. Dies ermöglicht es, die Performance und das Verhalten des Bots zu überwachen und zu analysieren.

> **⚠️ Wichtiger Hinweis für Single Binary Builds**: OpenTelemetry-Dependencies werden bei der Erstellung von Single Binaries mit `bun build --compile` ausgeschlossen (`--external @opentelemetry/*`), da sie zur Laufzeit nicht verfügbar sind. Telemetrie funktioniert nur bei der Ausführung mit `bun run` oder `npm start`, nicht mit den vorkompilierten Binaries. Für Produktionsumgebungen mit Telemetrie verwenden Sie Docker oder führen Sie den Bot direkt mit Bun/Node.js aus.

### Telemetrie-Konfiguration

```toml
[telemetry]
# OpenTelemetry aktivieren/deaktivieren
enabled = true
serviceName = "buntspecht"
serviceVersion = "0.2.0"

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
- **`buntspecht_active_connections`**: Anzahl aktiver Mastodon-Verbindungen

### Verfügbare Traces

- **`mastodon.post_status`**: Mastodon-Post-Operationen mit Attributen wie:
  - `mastodon.accounts_count`: Anzahl der Ziel-Accounts
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

# 95. Perzentil der Provider-Ausführungszeit
histogram_quantile(0.95, buntspecht_provider_execution_duration_seconds)

# Aktive Verbindungen
buntspecht_active_connections
```

### Telemetrie-Beispielkonfiguration

Für eine vollständige Telemetrie-Konfiguration siehe `config.telemetry.example.toml`.

### Cron-Schedule Beispiele

```toml
# Jede Stunde
cronSchedule = "0 * * * *"

# Alle 30 Minuten
cronSchedule = "*/30 * * * *"

# Täglich um 9:00 Uhr
cronSchedule = "0 9 * * *"

# Jeden Montag um 9:00 Uhr
cronSchedule = "0 9 * * 1"

# Alle 15 Minuten zwischen 9-17 Uhr, Mo-Fr
cronSchedule = "*/15 9-17 * * 1-5"
```

## Technologien

### Core Dependencies

- **[masto.js](https://github.com/neet/masto.js)** (v6.8.0): Moderne TypeScript-Bibliothek für Mastodon-API
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
- **Jest** (v29.7.0): Test-Framework mit 77+ Tests
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
├── __tests__/          # Test-Dateien (77+ Tests)
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
version: "3.8"
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
- **Test-Entwicklung**: 77+ umfassende Unit-Tests mit Jest
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
