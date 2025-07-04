#!/bin/bash

# Release script for Buntspecht
# This script helps create releases manually or can be used for local testing
# Note: Version bumping must be done manually before running this script

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
    echo "  -v, --version TAG   Release tag (e.g., v1.2.3)"
    echo "  -p, --prerelease    Create as prerelease"
    echo "  -d, --draft         Create as draft"
    echo "  -l, --local         Build locally without creating GitHub release"
    echo "  -h, --help          Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 --version v1.2.3                # Create release v1.2.3"
    echo "  $0 --version v1.3.0 --prerelease   # Create prerelease v1.3.0"
    echo "  $0 --version v2.0.0 --draft         # Create draft release v2.0.0"
    echo "  $0 --local                          # Build locally only"
    echo ""
    echo "Note: Make sure to update package.json version manually before running this script"
}

# Default values
TAG_NAME=""
PRERELEASE="false"
DRAFT="false"
LOCAL_ONLY="false"

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            TAG_NAME="$2"
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

# Check if we're in a git repository
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    print_error "Not in a git repository"
    exit 1
fi

# Check if working directory is clean
if [[ "$LOCAL_ONLY" == "false" ]] && ! git diff-index --quiet HEAD --; then
    print_error "Working directory is not clean. Please commit or stash changes."
    exit 1
fi

# Validate tag name if provided
if [[ -n "$TAG_NAME" ]]; then
    # Validate tag format
    if [[ ! "$TAG_NAME" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        print_error "Invalid tag format: $TAG_NAME. Expected format: v1.2.3"
        exit 1
    fi
    
    # Extract version from tag
    VERSION=${TAG_NAME#v}
    
    # Check if tag already exists
    if git rev-parse "$TAG_NAME" >/dev/null 2>&1; then
        print_error "Tag $TAG_NAME already exists"
        exit 1
    fi
    
    # Verify version consistency with package.json
    PACKAGE_VERSION=$(node -e "console.log(require('./package.json').version)")
    
    if [ "$PACKAGE_VERSION" != "$VERSION" ]; then
        print_error "Version mismatch between package.json ($PACKAGE_VERSION) and requested tag ($VERSION)"
        print_error "Please update package.json version to $VERSION before creating the release"
        exit 1
    fi
    
    print_success "Version validation passed"
elif [[ "$LOCAL_ONLY" == "false" ]]; then
    print_error "Tag name is required for GitHub releases. Use --version or --local"
    show_usage
    exit 1
fi

print_status "Starting release process..."
if [[ -n "$TAG_NAME" ]]; then
    print_status "Tag: $TAG_NAME"
    print_status "Version: $VERSION"
fi
print_status "Prerelease: $PRERELEASE"
print_status "Draft: $DRAFT"
print_status "Local only: $LOCAL_ONLY"

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

# Check if Bun is available
if ! command -v bun &> /dev/null; then
    print_error "Bun is not installed or not in PATH"
    exit 1
fi

# Install dependencies
print_status "Installing dependencies..."
if ! bun install --frozen-lockfile; then
    print_error "Failed to install dependencies"
    exit 1
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

# Create and push tag
print_status "Creating and pushing tag..."
git tag -a "$TAG_NAME" -m "Release $TAG_NAME"
git push origin "$TAG_NAME"

print_success "Release process completed!"
print_status "Tag $TAG_NAME has been pushed to GitHub"
print_status "GitHub Actions will now build and create the release"
print_status "Monitor the progress at: https://github.com/$(git config --get remote.origin.url | sed 's/.*github.com[:/]\([^.]*\).*/\1/')/actions"