#!/usr/bin/env node
// Deploys the Apps Script API:
// 1. Runs the tests, so a broken API never ships.
// 2. Pushes the code (clasp push).
// 3. Updates the existing web app deployment to a new version, so the URL stays the same.
// 4. Writes that URL to web/config.js for the frontend.
//
// The deployment id is read from .clasp.json, the single source of truth for
// which deployment the frontend talks to.

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const claspJson = new URL('../.clasp.json', import.meta.url);
const configJs = new URL('../web/config.js', import.meta.url);

function run(command) {
  console.log(`\n▶ ${command}`);
  execSync(command, { cwd: root, stdio: 'inherit' });
}

const { deploymentId } = JSON.parse(readFileSync(claspJson, 'utf8'));
if (!deploymentId) {
  console.error('\n❌ No deploymentId in .clasp.json.');
  console.error('   Run "npx clasp list-deployments" to find the web app deployment (not @HEAD),');
  console.error('   then add it as "deploymentId": "<id>" in .clasp.json.');
  process.exit(1);
}

run('npm test');
// --force: without it clasp silently skips the push when the manifest changed.
run('npx clasp push --force');
run(`npx clasp deploy --deploymentId ${deploymentId} --description "auto deploy"`);

const apiUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
writeFileSync(configJs, `// Written by scripts/deploy.mjs.\nexport const API_URL = '${apiUrl}';\n`);

console.log('\n✅ Deploy complete');
console.log(`   Web app URL: ${apiUrl}`);
console.log('   Written to:  web/config.js');
