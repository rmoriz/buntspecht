#!/bin/bash

# Release script for Buntspecht
# This script helps create releases manually or can be used for local testing

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -t, --type TYPE     Version bump type (patch, minor, major)"
    echo "  -p, --prerelease    Create as prerelease"
    echo "  -d, --draft         Create as draft"
    echo "  -l, --local         Build locally without creating GitHub release"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --type patch                    # Create patch release"
    echo "  $0 --type minor --prerelease       # Create minor prerelease"
    echo "  $0 --type major --draft             # Create major draft release"
    echo "  $0 --local                         # Build locally only"
}

# Default values
VERSION_TYPE="patch"
PRERELEASE="false"
DRAFT="false"
LOCAL_ONLY="false"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -t|--type)
            VERSION_TYPE="$2"
            shift 2
            ;;
        -p|--prerelease)
            PRERELEASE="true"
            shift
            ;;
        -d|--draft)
            DRAFT="true"
            shift
            ;;
        -l|--local)
            LOCAL_ONLY="true"
            shift
            ;;
        -h|--help)
            show_usage
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate version type
if [[ ! "$VERSION_TYPE" =~ ^(patch|minor|major)$ ]]; then
    print_error "Invalid version type: $VERSION_TYPE. Must be patch, minor, or major."
    exit 1
fi

print_status "Starting release process..."
print_status "Version type: $VERSION_TYPE"
print_status "Prerelease: $PRERELEASE"
print_status "Draft: $DRAFT"
print_status "Local only: $LOCAL_ONLY"

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if working directory is clean
if ! git diff-index --quiet HEAD --; then
    print_error "Working directory is not clean. Please commit or stash your changes."
    exit 1
fi

# Check if we're on main branch (unless local only)
if [[ "$LOCAL_ONLY" == "false" ]]; then
    CURRENT_BRANCH=$(git branch --show-current)
    if [[ "$CURRENT_BRANCH" != "main" ]]; then
        print_warning "You're not on the main branch (current: $CURRENT_BRANCH)"
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            print_status "Aborted by user"
            exit 0
        fi
    fi
fi

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
print_status "Current version: $CURRENT_VERSION"

# Calculate new version
IFS='.' read -ra VERSION_PARTS <<< "$CURRENT_VERSION"
MAJOR=${VERSION_PARTS[0]}
MINOR=${VERSION_PARTS[1]}
PATCH=${VERSION_PARTS[2]}

case $VERSION_TYPE in
    "major")
        MAJOR=$((MAJOR + 1))
        MINOR=0
        PATCH=0
        ;;
    "minor")
        MINOR=$((MINOR + 1))
        PATCH=0
        ;;
    "patch")
        PATCH=$((PATCH + 1))
        ;;
esac

NEW_VERSION="$MAJOR.$MINOR.$PATCH"
TAG_NAME="v$NEW_VERSION"

print_status "New version: $NEW_VERSION"
print_status "Tag name: $TAG_NAME"

# Confirm with user
if [[ "$LOCAL_ONLY" == "false" ]]; then
    echo
    print_warning "This will create a new release and push to GitHub!"
    read -p "Continue? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_status "Aborted by user"
        exit 0
    fi
fi

# Run tests
print_status "Running tests..."
if ! bun run test; then
    print_error "Tests failed"
    exit 1
fi
print_success "Tests passed"

# Run linter
print_status "Running linter..."
if ! bun run lint; then
    print_error "Linting failed"
    exit 1
fi
print_success "Linting passed"

# Build binaries
print_status "Building binaries..."
if ! bash scripts/build-all-binaries.sh; then
    print_error "Binary build failed"
    exit 1
fi
print_success "Binaries built successfully"

# Test binaries
print_status "Testing binaries..."
if ! bash scripts/test-binaries.sh; then
    print_error "Binary tests failed"
    exit 1
fi
print_success "Binary tests passed"

if [[ "$LOCAL_ONLY" == "true" ]]; then
    print_success "Local build completed successfully!"
    print_status "Built binaries are available in the dist/ directory"
    exit 0
fi

# Update package.json version
print_status "Updating package.json version..."
node -e "
    const fs = require('fs');
    const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
    pkg.version = '$NEW_VERSION';
    fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');
"

# Commit version bump
print_status "Committing version bump..."
git add package.json
git commit -m "chore: bump version to $NEW_VERSION

Automated version bump using release script and Bun tooling.
Release type: $VERSION_TYPE"

# Create and push tag
print_status "Creating and pushing tag..."
git tag -a "$TAG_NAME" -m "Release $TAG_NAME"
git push origin HEAD
git push origin "$TAG_NAME"

print_success "Release process completed!"
print_status "Tag $TAG_NAME has been pushed to GitHub"
print_status "GitHub Actions will now build and create the release"
print_status "Monitor the progress at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"