import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Load env from backend/.env explicitly to avoid cwd issues
dotenv.config({ path: path.join(__dirname, '..', '.env') });
import { sendWhatsAppMessage, isTwilioConfigured } from '../utils/twilioWhatsApp.js';

async function main() {
  if (!isTwilioConfigured()) {
    console.error('Twilio WhatsApp configuration is incomplete. Please check your .env file.');
    process.exit(1);
  }

  // Replace with your WhatsApp number (must be joined to Twilio sandbox if using sandbox)
  const to = 'whatsapp:+212659595284'; // <-- change to your number
  const body = 'Test WhatsApp message from Boukir backend!';

  try {
    const result = await sendWhatsAppMessage({ to, body });
    console.log('Message sent! SID:', result.sid);
    console.log('Status:', result.status);
    console.log('To:', result.to);
    console.log('Date Created:', result.dateCreated);
  } catch (err) {
    console.error('Error sending WhatsApp message:', err.message);
    process.exit(1);
  }
}

main();
