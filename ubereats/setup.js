/**
 * Run this once to log in to UberEats and save your auth state.
 * Usage: node setup.js
 *
 * A browser window will open — log in manually, then press Enter in the terminal.
 * Your session will be saved to auth-state.json (gitignored).
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const readline = require('readline');

const AUTH_FILE = path.join(__dirname, 'auth-state.json');

async function setup() {
  console.log('Launching browser for UberEats login...');
  console.log('Log in to your account, then come back here and press Enter.\n');

  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto('https://www.ubereats.com/');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  await new Promise((resolve) => {
    rl.question('Press Enter once you are logged in to UberEats...', () => {
      rl.close();
      resolve();
    });
  });

  await context.storageState({ path: AUTH_FILE });
  console.log(`\nAuth state saved to ${AUTH_FILE}`);
  console.log('You can now run: node order.js "item name"');

  await browser.close();
}

setup().catch((err) => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
