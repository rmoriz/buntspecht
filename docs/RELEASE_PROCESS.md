# Release Process

This document describes the automated release process for Buntspecht, including manual and automated workflows.

## Overview

Buntspecht uses a comprehensive CI/CD pipeline with multiple release strategies:

1. **Tag-based Releases** - Triggered by pushing version tags (primary method)
2. **Manual Releases** - Triggered via GitHub Actions workflow dispatch
3. **Local Development** - Build and test releases locally

## Release Workflows

### 1. Tag-based Release (Recommended)

Create releases by pushing version tags:

1. **Update version** in `package.json` and commit changes
2. **Create and push a version tag**:
   ```bash
   git tag v1.0.0
   git push --tags
   ```

The workflow will automatically:
- Run tests and linting
- Verify version consistency between tag and package.json
- Build all platform binaries
- Test the binaries
- Generate release notes from commits
- Create a GitHub release with assets

### 2. Manual Release

Use the GitHub Actions workflow dispatch to create releases manually:

1. Go to **Actions** → **Manual Release** in your GitHub repository
2. Click **Run workflow**
3. Select:
   - **Version bump type**: `patch`, `minor`, or `major`
   - **Prerelease**: Check if this is a prerelease
   - **Draft**: Check if you want to create a draft first
4. Click **Run workflow**

The workflow will:
- Run tests and linting
- Calculate the new version number
- Update `package.json`
- Create and push a git tag
- Build all platform binaries
- Test the binaries
- Generate checksums
- Create a GitHub release with assets

### 3. Local Release Script

For local development and testing:

```bash
# Build locally without creating a release
./scripts/release.sh --local

# Create a patch release
./scripts/release.sh --type patch

# Create a minor prerelease
./scripts/release.sh --type minor --prerelease

# Create a major draft release
./scripts/release.sh --type major --draft
```

## Versioning Strategy

Buntspecht follows [Semantic Versioning (SemVer)](https://semver.org/):

- **MAJOR** version: Incompatible API changes or breaking changes
- **MINOR** version: New functionality in a backwards compatible manner
- **PATCH** version: Backwards compatible bug fixes

### Version Bump Guidelines

| Change Type | Version Bump | Examples |
|-------------|--------------|----------|
| Breaking changes | Major | API changes, configuration format changes |
| New features | Minor | New message providers, new CLI options |
| Bug fixes | Patch | Memory leaks, incorrect behavior fixes |
| Performance improvements | Patch | Optimization without API changes |
| Documentation | None | README updates, code comments |
| Refactoring | None | Code cleanup without behavior changes |

## Release Assets

Each release includes:

### Binaries
- `buntspecht-linux-x64` - Linux x86_64
- `buntspecht-linux-arm64` - Linux ARM64
- `buntspecht-macos-arm64` - macOS Apple Silicon

### Additional Files
- `checksums.txt` - SHA256 checksums for all binaries

### Docker Images
Docker images are automatically built and published to GitHub Container Registry:
- `ghcr.io/[owner]/buntspecht:latest` - Latest stable release
- `ghcr.io/[owner]/buntspecht:v1.2.3` - Specific version
- `ghcr.io/[owner]/buntspecht:1.2` - Major.minor version
- `ghcr.io/[owner]/buntspecht:1` - Major version

## Quality Assurance

All releases go through automated quality checks:

1. **Unit Tests** - Full test suite with coverage reporting
2. **Linting** - ESLint with TypeScript rules
3. **Binary Testing** - Automated testing of built binaries
4. **Security Scanning** - Dependency vulnerability checks
5. **German README Check** - Ensures documentation consistency

## Release Notes

Release notes are automatically generated and include:

- **What's Changed** - List of commits since last release
- **Installation Instructions** - Download and setup guide
- **Quick Start Guide** - Basic usage instructions
- **Verification Instructions** - How to verify download integrity
- **OpenTelemetry Notice** - Information about observability features
- **Bun Binary Notice** - Information about single binary compilation

## Troubleshooting

### Common Issues

**Release workflow fails with permission errors:**
- Ensure the repository has `contents: write` permissions
- Check that `GITHUB_TOKEN` has sufficient permissions

**Binary build fails:**
- Verify Bun version compatibility (requires >= 1.2.17)
- Check for external dependency issues
- Review OpenTelemetry external exclusions

**Version bump conflicts:**
- Ensure working directory is clean before release
- Check for merge conflicts in `package.json`
- Verify you're on the correct branch

**Docker build fails:**
- Check Dockerfile syntax
- Verify multi-platform build support
- Review GitHub Container Registry permissions

### Manual Recovery

If a release fails partway through:

1. **Delete the created tag** (if created):
   ```bash
   git tag -d v1.2.3
   git push origin :refs/tags/v1.2.3
   ```

2. **Reset version in package.json** (if updated):
   ```bash
   git checkout HEAD~1 -- package.json
   git commit -m "revert: reset version after failed release"
   ```

3. **Clean up draft releases** in GitHub UI if created

4. **Re-run the release process** after fixing issues

## Best Practices

1. **Test thoroughly** before releasing
2. **Update version numbers** consistently across files
3. **Create prereleases** for major changes
4. **Review release notes** before publishing
5. **Monitor release workflows** for failures
6. **Keep dependencies updated** for security
7. **Document breaking changes** clearly
8. **Test binaries** on target platforms when possible

## Security Considerations

- All releases are signed with GitHub's attestations
- Checksums are provided for integrity verification
- Dependencies are scanned for vulnerabilities
- Binary builds exclude external OpenTelemetry dependencies for security
- Docker images use minimal base images

---

**Note about OpenTelemetry**: All releases include OpenTelemetry instrumentation for observability. The binary releases are built with Bun's single binary compilation for optimal performance and easy deployment.