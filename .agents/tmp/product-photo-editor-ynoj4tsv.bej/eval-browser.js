const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:5173/product-photos';
const OUTPUT_DIR = 'C:/Users/med/Desktop/burequ (3)/boukitComplet/bpukir/.agents/tmp/product-photo-editor-ynoj4tsv.bej';

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 50 });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => {
    localStorage.setItem('token', 'evaluation-token');
    localStorage.setItem('user', JSON.stringify({ id: 1, cin: 'EVAL', nom_complet: 'Évaluation UI', role: 'PDG' }));
    localStorage.setItem('password_change_required', 'false');
  });
  const page = await context.newPage();
  const now = new Date().toISOString();
  const original = { id: 11, shoot_id: 1, kind: 'original', source_image_id: null, image_url: '/src/components/boukir_cachet.webp', position: 0, ai_provider: null, ai_model: null, ai_quality: null, ai_size: null, ai_input_tokens: null, ai_input_text_tokens: null, ai_input_image_tokens: null, ai_output_tokens: null, ai_cost_usd: null, ai_pricing_version: null, created_at: now };
  const processed = { ...original, id: 12, kind: 'processed', source_image_id: 11, position: 1, ai_provider: 'openai', ai_model: 'gpt-image-2', ai_quality: 'medium', image_url: '/src/components/boukir_cachet.webp' };
  const shoot = { id: 1, product_id: 7842, variant_id: null, status: 'attached', error_message: null, created_by: 1, created_at: now, updated_at: now, ai_processed_at: now, product_designation: 'Carrelage marbré Atlas — 60 × 120 cm', product_image_url: '/logo.png', variant_name: 'Blanc veiné', variant_reference: 'ATL-60120-BL', originals: [original], processed: [processed] };
  await page.route('**/api/auth/me', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 1, cin: 'EVAL', nom_complet: 'Évaluation UI', role: 'PDG', password_change_required: false }) }));
  await page.route('**/api/auth/check-access', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ hasAccess: true, reason: '' }) }));
  await page.route('**/api/product-photos/shoots**', route => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([shoot]) }));
  const errors = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));

  try {
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 20000 });
    if (!page.url().includes('/product-photos')) {
      await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 20000 });
    }
    console.log('URL:', page.url());
    console.log('TITLE:', await page.title());
    console.log('BODY:', (await page.locator('body').innerText()).slice(0, 4000));
    await page.screenshot({ path: `${OUTPUT_DIR}/desktop-shell.png`, fullPage: true });

    const attached = page.getByRole('button', { name: /^Attach/i }).first();
    if (await attached.count()) {
      await attached.click();
      await page.waitForTimeout(1000);
      console.log('ATTACHED_BODY:', (await page.locator('body').innerText()).slice(0, 6000));
      await page.screenshot({ path: `${OUTPUT_DIR}/desktop-attached.png`, fullPage: true });

      const editorHint = page.locator('button[aria-label*="Ouvrir et modifier"]');
      console.log('EDITOR_CANDIDATES:', await editorHint.count());
      if (await editorHint.count()) {
        await editorHint.first().click();
        await page.waitForTimeout(1000);
        console.log('EDITOR_BODY:', (await page.locator('body').innerText()).slice(-8000));
        await page.screenshot({ path: `${OUTPUT_DIR}/desktop-editor.png`, fullPage: true });
        for (const toolName of ['Rotation', 'Retourner', 'Agrandir', 'Perspective', 'Recadrer']) {
          const tool = page.getByRole('button', { name: toolName, exact: true });
          if (await tool.count()) {
            await tool.click();
            console.log(`TOOL_${toolName}:`, (await page.locator('[aria-label="Réglages de l’outil"]').innerText()).slice(0, 1000));
          }
        }
      }
    }

    await page.setViewportSize({ width: 768, height: 1024 });
    await page.screenshot({ path: `${OUTPUT_DIR}/tablet-current.png`, fullPage: true });
    await page.setViewportSize({ width: 375, height: 812 });
    await page.screenshot({ path: `${OUTPUT_DIR}/mobile-current.png`, fullPage: true });
    console.log('ERRORS:', JSON.stringify(errors));
  } catch (error) {
    console.error('TEST_ERROR:', error.stack || error.message);
  } finally {
    await browser.close();
  }
})();
