export async function sendWhatsApp(to: string, body: string, mediaUrls?: string[], token?: string) {
  const res = await fetch('/api/notifications/whatsapp/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ to, body, mediaUrls }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to send WhatsApp');
  }
  return res.json();
}

// Envoyer WhatsApp avec template approuvé Twilio
export async function sendWhatsAppTemplate(
  to: string, 
  templateParams: Record<string, string>, 
  token?: string
) {
  const res = await fetch('/api/notifications/whatsapp/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ 
      to, 
      templateSid: 'TWILIO_TEMPLATE_SID_BON', // Le backend va utiliser process.env.TWILIO_TEMPLATE_SID_BON
      templateParams 
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || 'Failed to send WhatsApp template');
  }
  return res.json();
}

import Swal from 'sweetalert2';

// Configuration par défaut pour les toasts (petites notifications)
const toastConfig = {
  showConfirmButton: false,
  timer: 3000,
  timerProgressBar: true,
  toast: true,
  position: 'top-end' as const,
};

// Configuration pour les modales (notifications plus visibles)
const modalConfig = {
  showConfirmButton: true,
  confirmButtonText: 'OK',
  timer: 0, // Pas de timer automatique
  toast: false,
  position: 'center' as const,
};

// Notification d'erreur - utilise modal pour être plus visible
export const showError = (message: string, title: string = 'Erreur') => {
  return Swal.fire({
    ...modalConfig,
    icon: 'error',
    title,
    text: message,
    confirmButtonColor: '#dc3545',
  });
};

// Notification de succès - utilise toast discret
export const showSuccess = (message: string, title: string = 'Succès') => {
  console.log(`✅ ${title}: ${message}`);
  return Swal.fire({
    ...toastConfig,
    icon: 'success',
    title: message,
    timer: 2000,
  });
};

// Notification d'information - utilise toast
export const showInfo = (message: string, title: string = 'Information') => {
  console.log(`ℹ️ ${title}: ${message}`);
  return Swal.fire({
    ...toastConfig,
    icon: 'info',
    title: message,
    timer: 3000,
  });
};

// Notification d'avertissement - utilise modal pour être plus visible
export const showWarning = (message: string, title: string = 'Attention') => {
  return Swal.fire({
    ...modalConfig,
    icon: 'warning',
    title,
    text: message,
    confirmButtonColor: '#ffc107',
  });
};

// Confirmation avec SweetAlert2 - retourne une promesse
export const showConfirmation = (
  message: string,
  title: string = 'Confirmation',
  confirmButtonText: string = 'Oui',
  cancelButtonText: string = 'Annuler'
) => {
  return Swal.fire({
    ...modalConfig,
    title,
    text: message,
    icon: 'question',
    showCancelButton: true,
    confirmButtonText,
    cancelButtonText,
    reverseButtons: true,
    buttonsStyling: false,
    customClass: {
      confirmButton: 'px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-md',
      cancelButton: 'px-4 py-2 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-md'
    }
  });
};

// Export par défaut avec toutes les fonctions
export default {
  error: showError,
  success: showSuccess,
  info: showInfo,
  warning: showWarning,
  confirm: showConfirmation,
};
