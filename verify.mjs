import { chromium } from '@playwright/test';

const browser = await chromium.launch();
const page = await browser.newPage();

page.on('console', (msg) => console.log('CONSOLE:', msg.type(), msg.text()));
page.on('pageerror', (err) => console.log('PAGE ERROR:', err.message));

await page.goto('http://localhost:5000/');
await page.waitForTimeout(3000);
const html = await page.content();
console.log('--- page content ---');
console.log(html);
await browser.close();
