#!/usr/bin/env node

/**
 * Script to check and update the German README from the English version
 * 
 * Usage: node scripts/update-german-readme.js [--auto-translate]
 * 
 * Features:
 * - Checks if German README is outdated
 * - Provides translation suggestions and guidelines
 * - Future: Automatic translation using translation services
 * 
 * This script helps maintain documentation consistency between languages.
 */

const fs = require('fs');
const path = require('path');

const README_EN = path.join(__dirname, '..', 'README.md');
const README_DE = path.join(__dirname, '..', 'README.de.md');

// Parse command line arguments
const args = process.argv.slice(2);
const autoTranslate = args.includes('--auto-translate');
const verbose = args.includes('--verbose') || args.includes('-v');
const help = args.includes('--help') || args.includes('-h');

function showHelp() {
    console.log(`
📖 German README Translation Checker

Usage: node scripts/update-german-readme.js [options]

Options:
  --auto-translate    Enable automatic translation suggestions (future feature)
  --verbose, -v       Show detailed file information
  --help, -h          Show this help message

Examples:
  node scripts/update-german-readme.js                    # Check translation status
  node scripts/update-german-readme.js --verbose          # Detailed output
  node scripts/update-german-readme.js --auto-translate   # Future: auto-translate

This script helps maintain consistency between English and German documentation.
`);
}

function main() {
    if (help) {
        showHelp();
        return;
    }
    console.log('🔄 Checking README files...');
    
    if (!fs.existsSync(README_EN)) {
        console.error('❌ English README not found:', README_EN);
        process.exit(1);
    }
    
    if (!fs.existsSync(README_DE)) {
        console.error('❌ German README not found:', README_DE);
        process.exit(1);
    }
    
    const enStats = fs.statSync(README_EN);
    const deStats = fs.statSync(README_DE);
    
    if (verbose) {
        console.log('📊 File statistics:');
        console.log(`   English README: ${enStats.size} bytes, modified: ${enStats.mtime.toISOString()}`);
        console.log(`   German README:  ${deStats.size} bytes, modified: ${deStats.mtime.toISOString()}`);
    }
    
    const timeDiffMs = enStats.mtime.getTime() - deStats.mtime.getTime();
    const timeDiffHours = Math.round(timeDiffMs / (1000 * 60 * 60) * 10) / 10;
    
    console.log(`⏰ Time difference: ${timeDiffHours} hours (English is ${timeDiffHours > 0 ? 'newer' : 'older'})`);
    
    if (enStats.mtime > deStats.mtime) {
        console.log('⚠️  English README is newer than German README!');
        console.log('📝 Please update the German README to reflect the latest changes.');
        console.log('');
        
        if (autoTranslate) {
            console.log('🤖 Auto-translation mode enabled (placeholder)');
            console.log('');
            console.log('🚧 Future implementation will:');
            console.log('   - Detect changed sections in English README');
            console.log('   - Use translation APIs (DeepL, Google Translate)');
            console.log('   - Preserve code blocks and technical terms');
            console.log('   - Maintain markdown formatting');
            console.log('   - Create translation suggestions');
            console.log('');
        }
        
        console.log('💡 Manual translation guidelines:');
        console.log('   - Use a translation service like DeepL or Google Translate');
        console.log('   - Maintain the same structure and formatting');
        console.log('   - Keep code examples and configuration unchanged');
        console.log('   - Translate comments and documentation text');
        console.log('   - Update version numbers and test counts');
        console.log('');
        console.log('📋 Recent changes to translate:');
        console.log('   - Enhanced logging features with character counts');
        console.log('   - Template trim functions documentation');
        console.log('   - Updated test coverage numbers');
        console.log('');
        console.log('🔧 To check what changed: git log --oneline README.md');
        
        process.exit(1); // Exit with error to indicate action needed
    } else {
        console.log('✅ German README is up to date!');
        if (verbose) {
            console.log(`📏 File sizes: EN=${enStats.size} bytes, DE=${deStats.size} bytes`);
            console.log(`⏱️  Last sync: ${Math.abs(timeDiffHours)} hours ago`);
        }
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };