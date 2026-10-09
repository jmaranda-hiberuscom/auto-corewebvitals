import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { chromium } from 'playwright';

const statePath = resolve(process.env.GSC_STORAGE_STATE_PATH || '.auth/gsc-storage-state.json');
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();

try {
  await page.goto('https://search.google.com/search-console/', { waitUntil: 'domcontentloaded' });
  const prompt = createInterface({ input: stdin, output: stdout });
  await prompt.question('Inicia sesión en Google, confirma acceso a Search Console y pulsa Enter aquí. ');
  prompt.close();

  if (new URL(page.url()).hostname === 'accounts.google.com') {
    throw new Error('La página sigue en el inicio de sesión de Google.');
  }

  await mkdir(dirname(statePath), { recursive: true });
  await writeFile(statePath, JSON.stringify(await context.storageState(), null, 2), { mode: 0o600 });
  console.log(`Estado de sesión guardado en ${statePath}. No lo compartas ni lo subas al repositorio.`);
} finally {
  await browser.close();
}