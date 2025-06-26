# Mastodon Ping Bot

Ein TypeScript-basierter Mastodon/Fediverse-Bot, der stündlich "PING" Nachrichten postet.

## Features

- 🤖 Automatisches Posten von Nachrichten nach Zeitplan
- ⚙️ Flexible Konfiguration über TOML-Dateien
- 🔍 Mehrere Konfigurationspfade mit Prioritätsreihenfolge
- 📝 Umfassendes Logging
- 🧪 Vollständige Testabdeckung
- 🐳 Docker-Support für CI/CD
- 🛡️ TypeScript für Typsicherheit

## Installation

```bash
# Repository klonen
git clone <repository-url>
cd mastodon-ping-bot

# Dependencies installieren
npm install

# TypeScript kompilieren
npm run build
```

## Konfiguration

Der Bot sucht nach Konfigurationsdateien in folgender Prioritätsreihenfolge:

1. **CLI Parameter**: `--config /pfad/zur/config.toml`
2. **Environment Variable**: `BOT_CONFIG=/pfad/zur/config.toml`
3. **Aktuelles Verzeichnis**: `./config.toml`
4. **Home Directory**: `~/.config/bot/config.toml`

### Konfigurationsdatei erstellen

```bash
# Beispielkonfiguration kopieren
cp config.example.toml config.toml

# Konfiguration bearbeiten
nano config.toml
```

### Konfigurationsformat

```toml
[mastodon]
# Ihre Mastodon-Instanz URL
instance = "https://mastodon.social"

# Ihr Access Token (aus den Mastodon-Einstellungen)
accessToken = "your-access-token-here"

[bot]
# Nachricht die gepostet werden soll
message = "PING"

# Cron-Schedule (Standard: jede Stunde)
cronSchedule = "0 * * * *"

[logging]
# Log-Level: debug, info, warn, error
level = "info"
```

### Access Token erhalten

1. Gehen Sie zu Ihrer Mastodon-Instanz
2. Einstellungen → Entwicklung → Neue Anwendung
3. Name: "Ping Bot" (oder beliebig)
4. Bereiche: `write:statuses`
5. Anwendung erstellen und Access Token kopieren

## Verwendung

### Bot starten

```bash
# Mit Standard-Konfiguration
npm start

# Mit spezifischer Konfigurationsdatei
npm start -- --config /pfad/zur/config.toml

# Development-Modus
npm run dev
```

### CLI-Optionen

```bash
# Hilfe anzeigen
npm start -- --help

# Verbindung testen
npm start -- --verify

# Sofort eine Test-Nachricht posten
npm start -- --test-post

# Spezifische Konfigurationsdatei verwenden
npm start -- --config /pfad/zur/config.toml
```

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

## Development

### Tests ausführen

```bash
# Alle Tests
npm test

# Tests mit Watch-Modus
npm run test:watch

# Test-Coverage
npm run test:coverage
```

### Code-Qualität

```bash
# Linting
npm run lint

# Linting mit Auto-Fix
npm run lint:fix
```

### Projektstruktur

```
src/
├── __tests__/          # Test-Dateien
├── config/             # Konfiguration
│   └── configLoader.ts
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
docker build -t mastodon-ping-bot .
```

### Container ausführen

```bash
# Mit Volume für Konfiguration
docker run -d \
  --name ping-bot \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  mastodon-ping-bot

# Mit Environment-Variable
docker run -d \
  --name ping-bot \
  -e BOT_CONFIG=/app/config.toml \
  -v $(pwd)/config.toml:/app/config.toml:ro \
  mastodon-ping-bot
```

### Docker Compose

```yaml
version: '3.8'
services:
  mastodon-ping-bot:
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
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - run: npm run lint

  build:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Build Docker image
        run: docker build -t mastodon-ping-bot .
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
DEBUG=* npm start
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