import 'dotenv/config';
import { sendWhatsAppMessage } from '../utils/twilioWhatsApp.js';

const testTemplateMessage = async () => {
  try {
    console.log('🧪 Testing WhatsApp template message...');
    console.log('Template SID:', process.env.TWILIO_TEMPLATE_SID_BON);
    
    const templateParams = {
      "1": "Client Test",           // Nom du client
      "2": "BON77",                  // Numéro du bon
      "3": "1500.00 MAD",           // Montant total
      "4": "sortie/bon77"           // Chemin PDF (sera: boukirdiamond.com/uploads/bons_pdf/sortie/bon77.pdf)
    };
    
    console.log('Template parameters:', templateParams);
    console.log('Sending to: +212659595284');
    console.log('Media URL will be: https://boukirdiamond.com/uploads/bons_pdf/sortie/bon77.pdf');
    
    const result = await sendWhatsAppMessage({
      to: '+212659595284',
      templateSid: process.env.TWILIO_TEMPLATE_SID_BON,
      templateParams: templateParams
    });
    
    console.log('✅ Message sent successfully!');
    console.log('Result:', JSON.stringify(result, null, 2));
    console.log('\nMessage SID:', result.sid);
    console.log('Status:', result.status);
    
  } catch (error) {
    console.error('❌ Error sending message:', error.message);
    console.error('Full error:', error);
  }
};

testTemplateMessage();
