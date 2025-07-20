# v0.12.0 Release Notes

## 🎯 Release Date
July 19, 2025

## 🔥 What's New

### Health Check Endpoint
- **New `/health` endpoint** for Docker and monitoring systems
- Returns HTTP 200 with JSON response containing service status
- Includes uptime, version, webhook configuration info
- Supports both GET and HEAD methods

### Docker Health Check Fixes
- **Fixed 405 errors** from Docker health checks
- Updated Dockerfile to use proper HTTP health checks
- Changed from process-based to HTTP-based health monitoring

### Manual Docker Tagging Workflow
- **New GitHub Actions workflow** for manual Docker image tagging
- Tag any existing image as "stable"
- Support for both GitHub Container Registry (ghcr.io) and Docker Hub
- Includes dry-run mode for safety

## 🛠️ Technical Improvements

### Webhook Server Enhancements
- Added path conflict detection (prevents `/health` webhook path)
- Updated CORS headers to allow GET method for health checks
- Enhanced error messages for configuration conflicts

### Build & Release
- Updated version to 0.12.0 across all files
- All tests passing (348 tests)
- Clean linting results

## 📖 Usage

### Health Check
```bash
curl http://localhost:3000/health
```

### Manual Tagging (via GitHub CLI)
```bash
# Tag latest as stable
gh workflow run tag-stable.yml -f source_tag=latest

# Tag specific version as stable
gh workflow run tag-stable.yml -f source_tag=v0.12.0
```

## 🚨 Migration Notes
- No breaking changes
- Existing configurations remain compatible
- Health check endpoint is automatically enabled when webhook server is enabled

---

**Full Changelog**: [v0.11.0...v0.12.0](https://github.com/rmoriz/buntspecht/compare/v0.11.0...v0.12.0)