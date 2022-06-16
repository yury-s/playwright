const {chromium, expect} = require('./packages/playwright-test');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext({har: {path: 'redirect.har'}, serviceWorkers: 'block'});
//   const context = await browser.newContext({har: {path: 'theverge.har'}, serviceWorkers: 'block'});
  const page = await context.newPage();

  // Go to https://www.theverge.com/
//   await page.goto('https://www.theverge.com/');
  await page.goto('https://theverge.com/');

  // Click header[role="banner"] >> text=Tech >> svg[role="img"]
  await page.locator('header[role="banner"] >> text=Tech >> svg[role="img"]').hover();
  await page.locator('header[role="banner"] >> text=Tech >> svg[role="img"]').click();

  // Click section >> text=Microsoft
  await page.locator('section >> text=Microsoft').click();
  await expect(page).toHaveURL('https://www.theverge.com/microsoft');

  // Click text=Internet Explorer, star of Windows, dies at 26
  await page.locator('text=Internet Explorer, star of Windows, dies at 26').click();
  await expect(page).toHaveURL('https://www.theverge.com/2022/6/15/23167121/microsoft-internet-explorer-end-of-support-retirement');



//   // Go to https://playwright.dev/
//   await page.goto('https://playwright.dev/');

//   // Click a:has-text("Docs")
//   await page.locator('a:has-text("Docs")').click();
//   await expect(page).toHaveURL('https://playwright.dev/docs/intro');

//   // Click text=API testing
//   await page.locator('text=API testing').click();
//   await expect(page).toHaveURL('https://playwright.dev/docs/test-api-testing');

//   // Click text=APIRequestContext can send all kinds of HTTP(S) requests over network. >> a
//   await page.locator('text=APIRequestContext can send all kinds of HTTP(S) requests over network. >> a').click();
//   await expect(page).toHaveURL('https://playwright.dev/docs/api/class-apirequestcontext');


//   await context.close();
//   await browser.close();
})();
