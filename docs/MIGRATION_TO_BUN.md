# Migration von Node.js zu Bun

## Übersicht

Dieses Dokument beschreibt die Migration des Buntspecht-Projekts von Node.js zu Bun.

## Durchgeführte Änderungen

### 1. Dockerfile
- **Base Image**: Gewechselt von `node:20-alpine` zu `oven/bun:1.2-alpine`
- **Zusätzliche Tools**: Hinzugefügt:
  - `curl` - für HTTP-Anfragen
  - `iputils` - enthält `ping` Kommando
  - `procps` - enthält `uptime` Kommando  
  - `jq` - für JSON-Verarbeitung
- **Lockfile**: Aktualisiert von `package-lock.json` zu `bun.lock`
- **Build-Befehle**: Ersetzt `npm` Befehle durch `bun` Befehle
- **Health Check**: Aktualisiert von `node` zu `bun`

### 2. Package.json
- **Scripts**: 
  - `build`: Nutzt TypeScript-Compiler für beste Kompatibilität
  - `build:bun`: Alternative mit `bun build` für experimentelle Features
  - `start`: Nutzt `bun run` statt `node`
  - `dev`: Nutzt `bun run` für direkte TypeScript-Ausführung
  - `test`: Behält Jest für Kompatibilität bei
- **Engines**: Geändert von `node: >=20.10.0` zu `bun: >=1.2.17`

### 3. CI/CD Pipeline (.github/workflows/ci.yml)
- **Setup**: Ersetzt `actions/setup-node` durch `oven-sh/setup-bun`
- **Dependencies**: Nutzt `bun install --frozen-lockfile`
- **Build & Test**: Alle Befehle nutzen jetzt `bun run`
- **Security Audit**: Nutzt `bun audit` statt `npm audit`

### 4. Docker Compose
- **Environment**: Hinzugefügt `BUN_ENV=production`
- **Health Check**: Aktualisiert für Bun-Kompatibilität

## Kompatibilität

### Beibehaltene Features
- **TypeScript**: Vollständig kompatibel
- **Jest Tests**: Alle bestehenden Tests funktionieren weiterhin
- **Dependencies**: Alle npm-Pakete sind kompatibel
- **Konfiguration**: Keine Änderungen an der Anwendungslogik

### Neue Möglichkeiten
- **Schnellere Builds**: Bun's nativer TypeScript-Support
- **Bessere Performance**: Schnellere Startup-Zeiten
- **Integrierte Tools**: Weniger externe Dependencies nötig

## Systemanforderungen

- **Bun**: Version 1.2.17 oder höher
- **Docker**: Für Container-Builds (optional)
- **Git**: Für Versionskontrolle

### Bun-Version prüfen
```bash
bun --version
# Sollte 1.2.17 oder höher anzeigen
```

## Verwendung

### Entwicklung
```bash
# Dependencies installieren
bun install

# Entwicklungsserver starten
bun run dev

# Tests ausführen
bun run test

# Build erstellen
bun run build
```

### Docker
```bash
# Image bauen
docker build -t buntspecht .

# Container starten
docker-compose up
```

## Verfügbare Tools im Container

Das Docker-Image enthält jetzt folgende zusätzliche Tools:
- `curl` - HTTP-Client
- `ping` - Netzwerk-Diagnose
- `uptime` - System-Uptime anzeigen
- `jq` - JSON-Prozessor

## Rückwärtskompatibilität

Falls ein Rollback zu Node.js nötig ist:
1. Checkout des `main` Branches
2. Verwendung der ursprünglichen `package-lock.json`
3. Docker-Build mit dem ursprünglichen Dockerfile

## Nächste Schritte

1. Testen der neuen Bun-basierten Pipeline
2. Performance-Vergleich mit der Node.js-Version
3. Eventuelle Optimierungen der Bun-spezifischen Features