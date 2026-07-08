/**
 * Place a grocery order on UberEats.
 * Usage: node order.js "pickles" [--qty 2] [--dry-run]
 *
 * --qty N    how many to add to cart (default: 1)
 * --dry-run  shows what would be ordered without actually placing it
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const AUTH_FILE = path.join(__dirname, 'auth-state.json');

const args = process.argv.slice(2);
const item = args.find((a) => !a.startsWith('--'));
const dryRun = args.includes('--dry-run');
const qtyIndex = args.indexOf('--qty');
const qty = qtyIndex !== -1 ? parseInt(args[qtyIndex + 1], 10) : 1;

if (!item) {
  console.error('Usage: node order.js "item name" [--qty 2] [--dry-run]');
  process.exit(1);
}

if (!fs.existsSync(AUTH_FILE)) {
  console.error('No auth state found. Run setup first: node setup.js');
  process.exit(1);
}

async function findFirstResult(page) {
  // Wait for search results to load
  await page.waitForSelector('[data-testid="store-card"], [data-testid="rich-text"]', { timeout: 10000 }).catch(() => {});

  // Try to find a store card
  const storeCard = page.locator('[data-testid="store-card"]').first();
  if (await storeCard.isVisible({ timeout: 3000 }).catch(() => false)) {
    return storeCard;
  }
  return null;
}

async function addItemToCart(page, itemName, quantity = 1) {
  // Search for the item on the store page
  const searchInput = page.locator('input[placeholder*="Search"], input[aria-label*="Search"]').first();
  if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
    await searchInput.fill(itemName);
    await page.keyboard.press('Enter');
    await page.waitForTimeout(2000);
  }

  // Find the item in the product listing
  const itemLocator = page.locator(`[data-testid*="item"], [data-testid*="product"]`).filter({ hasText: itemName }).first();

  if (!(await itemLocator.isVisible({ timeout: 5000 }).catch(() => false))) {
    // Fallback: look for any element containing the item text
    const fallback = page.getByText(new RegExp(itemName, 'i')).first();
    if (!(await fallback.isVisible({ timeout: 3000 }).catch(() => false))) {
      throw new Error(`Could not find "${itemName}" on the store page.`);
    }
    await fallback.click();
  } else {
    await itemLocator.click();
  }

  await page.waitForTimeout(1500);

  // Increase quantity if more than 1
  if (quantity > 1) {
    const increaseBtn = page.locator('button[aria-label*="increase"], button[aria-label*="Increase"], button').filter({ hasText: '+' }).first();
    for (let i = 1; i < quantity; i++) {
      if (await increaseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (!dryRun) await increaseBtn.click();
        else console.log(`[dry-run] Would click "+" to set quantity to ${i + 1}`);
        await page.waitForTimeout(300);
      }
    }
  }

  // Add to cart
  const addBtn = page.locator('button').filter({ hasText: /add to (cart|order)/i }).first();
  if (await addBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    if (!dryRun) await addBtn.click();
    else console.log(`[dry-run] Would click "Add to cart" (qty: ${quantity})`);
  }
}

async function placeOrder(page) {
  // Go to checkout
  const viewCartBtn = page.locator('button, a').filter({ hasText: /view cart|go to checkout|checkout/i }).first();
  if (await viewCartBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    if (!dryRun) await viewCartBtn.click();
    else console.log('[dry-run] Would click "View cart / Checkout"');
  }

  await page.waitForTimeout(2000);

  // Confirm the order
  const placeOrderBtn = page.locator('button').filter({ hasText: /place order|confirm order/i }).first();
  if (await placeOrderBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    const label = await placeOrderBtn.textContent();
    if (!dryRun) {
      console.log(`Clicking "${label.trim()}"...`);
      await placeOrderBtn.click();
      console.log('Order placed!');
    } else {
      console.log(`[dry-run] Would click "${label.trim()}" to place order.`);
    }
  } else {
    console.warn('Could not find the "Place Order" button — please review the browser.');
  }
}

async function run() {
  console.log(`Ordering: ${qty}x "${item}"${dryRun ? ' (dry run)' : ''}`);

  const browser = await chromium.launch({ headless: false, slowMo: 80 });
  const context = await browser.newContext({ storageState: AUTH_FILE });
  const page = await context.newPage();

  // Start at UberEats grocery search
  const searchUrl = `https://www.ubereats.com/search?q=${encodeURIComponent(item)}&pl=&sc=BROWSE_FEED`;
  await page.goto(searchUrl);
  await page.waitForLoadState('networkidle');

  // Find a grocery store
  const storeCard = await findFirstResult(page);
  if (storeCard) {
    console.log('Found a store, opening...');
    await storeCard.click();
    await page.waitForLoadState('networkidle');
  } else {
    console.warn('Could not auto-select a store. Navigate to the grocery section manually if needed.');
  }

  // Add item to cart
  try {
    await addItemToCart(page, item, qty);
    console.log(`Added ${qty}x "${item}" to cart.`);
  } catch (err) {
    console.error(`Could not add item: ${err.message}`);
    console.log('Browser is still open — you can complete the order manually.');
    await new Promise(() => {}); // keep browser open
    return;
  }

  // Place the order
  await placeOrder(page);

  if (dryRun) {
    console.log('\nDry run complete. Closing browser in 5s...');
    await page.waitForTimeout(5000);
  } else {
    console.log('\nDone! Closing browser in 10s...');
    await page.waitForTimeout(10000);
  }

  await browser.close();
}

run().catch((err) => {
  console.error('Order failed:', err.message);
  process.exit(1);
});
