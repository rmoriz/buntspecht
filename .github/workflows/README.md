# GitHub Actions Workflows

This directory contains the CI/CD workflows for Buntspecht.

## Release Workflows

### 🏷️ Tag Release (Primary) - `tag-release.yml`

**Trigger**: When a version tag is pushed (e.g., `v0.4.0`)

**What it does**:
- Automatically builds all platform binaries
- Runs tests and linting
- Creates a GitHub release with binaries attached
- Generates release notes from commits

**Usage**:
```bash
# 1. Update version in package.json and other files
# 2. Commit changes
git add -A
git commit -m "Bump version to 0.5.0"

# 3. Create and push tag
git tag v0.5.0
git push && git push --tags

# 4. Release is created automatically! 🎉
```

### 🔧 Manual Release - `release.yml`

**Trigger**: Manual workflow dispatch via GitHub Actions UI

**What it does**:
- Allows manual control over version bumping
- Builds binaries and creates releases
- Useful for hotfixes or when you need manual control

**Usage**:
1. Go to GitHub Actions → Manual Release
2. Click "Run workflow"
3. Select version bump type and options


## Other Workflows

### 🧪 CI - `ci.yml`

**Trigger**: Pull requests and pushes to main

**What it does**:
- Runs tests on multiple platforms
- Performs linting and code quality checks
- Builds and tests binaries

## Recommended Release Process

For the most reliable releases, use the **Tag Release** workflow:

1. **Prepare Release**:
   - Update version in `package.json`
   - Update version in `src/cli.ts`
   - Update version in configuration examples
   - Update version in tests
   - Commit changes

2. **Create Release**:
   ```bash
   git tag v0.x.y
   git push --tags
   ```

3. **Automatic Process**:
   - GitHub Actions builds all binaries
   - Tests are run automatically
   - Release is created with binaries attached
   - Release notes are generated

This approach is:
- ✅ Predictable and reliable
- ✅ Version-controlled (tags are immutable)
- ✅ Easy to understand and use
- ✅ Standard practice in the industry