import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { sendWhatsAppMessage } from '../utils/twilioWhatsApp.js';

// Load backend .env
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

async function main() {
  // Latest payload provided by user, with new devtunnels media link
  const to = '+212659595284';
  const body = 'Bonjour WADI3 MOJAHIDIN\nType: Sortie\nNuméro: SOR2963\nMontant: 27375.00 DH\nDate: 29-10-2025 18:30\nArticles:\n  - SHIJING 1.2m مكينة منشار ممتازة x3 @ 9125 DH\nMerci.';
  const mediaUrls = [
    'https://3bh8jqmw-3001.uks1.devtunnels.ms/uploads/bons_pdf/sortie/SOR2963-sortie-2963-1761830727602.pdf',
  ];

  console.log('[Test] Using PUBLIC_BASE_URL =', process.env.PUBLIC_BASE_URL);
  console.log('[Test] Sending to:', to);
  console.log('[Test] Media URL(s):', mediaUrls);

  try {
    const result = await sendWhatsAppMessage({ to, body, mediaUrls });
    console.log('[Test] WhatsApp sent OK:', result);
  } catch (err) {
    console.error('[Test] Failed to send WhatsApp:', err?.message || err);
    process.exitCode = 1;
  }
}

main();
