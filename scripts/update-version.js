#!/usr/bin/env node

/**
 * Update version numbers across all files from single source of truth
 * Usage: node scripts/update-version.js
 */

const fs = require('fs');
const path = require('path');

// Read the version from our single source of truth
const versionPath = path.join(__dirname, '..', 'src', 'version.ts');
const versionContent = fs.readFileSync(versionPath, 'utf8');

// Extract version using regex
const versionMatch = versionContent.match(/major:\s*(\d+).*minor:\s*(\d+).*patch:\s*(\d+)/s);
if (!versionMatch) {
  console.error('❌ Could not parse version from version.ts');
  process.exit(1);
}

const [_, major, minor, patch] = versionMatch;
const version = `${major}.${minor}.${patch}`;

console.log(`📦 Updating version to ${version}...`);

// Update package.json
const packageJsonPath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
packageJson.version = version;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✅ Updated package.json');

// Update Dockerfile
const dockerfilePath = path.join(__dirname, '..', 'Dockerfile');
let dockerfile = fs.readFileSync(dockerfilePath, 'utf8');
dockerfile = dockerfile.replace(/LABEL version="[^"]*"/, `LABEL version="${version}"`);
fs.writeFileSync(dockerfilePath, dockerfile);
console.log('✅ Updated Dockerfile');

console.log(`🎉 Version updated to ${version} in all files!`);