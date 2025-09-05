#!/usr/bin/env node

/**
 * Script to increment the version in package.json
 * Usage: node scripts/increment-version.js [major|minor|patch]
 */

const fs = require('fs');
const path = require('path');

const packagePath = path.join(__dirname, '..', 'package.json');
const versionType = process.argv[2] || 'patch';

// Read package.json
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = packageJson.version;

// Parse current version
const [major, minor, patch] = currentVersion.split('.').map(Number);

// Increment version based on type
let newVersion;
switch (versionType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
  default:
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

// Update package.json
packageJson.version = newVersion;

// Write back to file
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');

console.log(`Version updated from ${currentVersion} to ${newVersion}`);
console.log(`Run 'npm run build' to create a build with the new version.`);