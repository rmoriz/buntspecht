#!/bin/bash

# Build all binary targets for Buntspecht
# This script builds standalone executables for all supported platforms

set -e

echo "🚀 Building Buntspecht binaries for all platforms..."
echo

# Create dist directory
mkdir -p dist

# Build for each platform
echo "📦 Building Linux x64..."
bun run build:binary:linux-x64

echo "📦 Building Linux ARM64..."
bun run build:binary:linux-arm64

echo "📦 Building Linux ARMv8..."
bun run build:binary:linux-armv8

echo "📦 Building macOS x64..."
bun run build:binary:macos-x64

echo "📦 Building macOS ARM64..."
bun run build:binary:macos-arm64

echo
echo "✅ All binaries built successfully!"
echo
echo "📁 Built binaries:"
ls -lh dist/buntspecht-*

echo
echo "🎯 Binary sizes:"
du -h dist/buntspecht-* | sort -h

echo
echo "🔍 To test a binary:"
echo "  ./dist/buntspecht-linux-x64 --help"
echo "  ./dist/buntspecht-macos-arm64 --version"