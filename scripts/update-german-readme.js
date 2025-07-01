#!/usr/bin/env node

/**
 * Script to update the German README from the English version
 * This is a placeholder for automatic translation functionality
 * 
 * Usage: node scripts/update-german-readme.js
 * 
 * TODO: Implement automatic translation using a translation service
 * For now, this script serves as a reminder that the German README
 * should be updated when the English README changes.
 */

const fs = require('fs');
const path = require('path');

const README_EN = path.join(__dirname, '..', 'README.md');
const README_DE = path.join(__dirname, '..', 'README.de.md');

function main() {
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
    
    console.log('📊 File statistics:');
    console.log(`   English README: ${enStats.size} bytes, modified: ${enStats.mtime.toISOString()} (${enStats.mtime})`);
    console.log(`   German README:  ${deStats.size} bytes, modified: ${deStats.mtime.toISOString()} (${deStats.mtime})`);
    
    const timeDiffMs = enStats.mtime.getTime() - deStats.mtime.getTime();
    const timeDiffHours = Math.round(timeDiffMs / (1000 * 60 * 60) * 10) / 10;
    
    console.log(`⏰ Time difference: ${timeDiffHours} hours (English is ${timeDiffHours > 0 ? 'newer' : 'older'})`);
    
    if (enStats.mtime > deStats.mtime) {
        console.log('⚠️  English README is newer than German README!');
        console.log('📝 Please update the German README to reflect the latest changes.');
        console.log('');
        console.log('💡 Translation suggestions:');
        console.log('   - Use a translation service like DeepL or Google Translate');
        console.log('   - Maintain the same structure and formatting');
        console.log('   - Keep code examples and configuration unchanged');
        console.log('   - Translate comments and documentation text');
        console.log('');
        console.log('🔧 Future enhancement: This script could be extended to:');
        console.log('   - Automatically translate using a translation API');
        console.log('   - Preserve code blocks and technical terms');
        console.log('   - Maintain markdown formatting');
        
        process.exit(1); // Exit with error to indicate action needed
    } else {
        console.log('✅ German README is up to date!');
    }
}

if (require.main === module) {
    main();
}

module.exports = { main };