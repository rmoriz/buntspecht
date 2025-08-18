#!/bin/bash

# Test all built binaries to ensure they work correctly
# This script verifies that each binary can execute basic commands

set -e

echo "🧪 Testing Buntspecht binaries..."
echo

BINARIES=(
    "dist/buntspecht-linux-x64"
    "dist/buntspecht-linux-arm64" 
    "dist/buntspecht-macos-arm64"
)

for binary in "${BINARIES[@]}"; do
    if [ -f "$binary" ]; then
        echo "🔍 Testing $binary..."
        
        # Test version command
        echo "  ├─ Version: $($binary --version 2>/dev/null || echo 'FAILED')"
        
        # Test help command (just check if it exits cleanly)
        if $binary --help >/dev/null 2>&1; then
            echo "  ├─ Help: ✅ OK"
        else
            echo "  ├─ Help: ❌ FAILED"
        fi
        
        # Test with invalid config (should fail gracefully)
        if $binary --config /nonexistent/config.toml --list-providers 2>/dev/null; then
            echo "  └─ Error handling: ❌ Should have failed"
        else
            echo "  └─ Error handling: ✅ OK"
        fi
        
        echo
    else
        echo "⚠️  Binary not found: $binary"
        echo
    fi
done

echo "✅ Binary testing complete!"