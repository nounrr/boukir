import React, { useEffect, useState } from 'react';

// Page simplifiee : un seul bouton qui envoie un PDF de test
const WhatsAppTestPage: React.FC = () => {
  const [status, setStatus] = useState<any>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState<boolean>(false);
  const [sending, setSending] = useState<boolean>(false);
  const baseUrl = (import.meta.env.VITE_WHTSP_BASE || 'http://148.230.125.221:3600').replace(/\/$/, '');

  async function fetchStatus() {
    setLoadingStatus(true);
    try {
      const r = await fetch(baseUrl + '/status');
      const j = await r.json();
      setStatus(j);
      if (j.hasQr) {
        const qrResp = await fetch(baseUrl + '/qr');
        if (qrResp.ok) {
          const qrJson = await qrResp.json();
          setQr(qrJson.qr);
        }
      } else {
        setQr(null);
      }
    } catch (e: any) {
      setStatus({ error: e?.message || 'status_error' });
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    fetchStatus();
    const int = setInterval(fetchStatus, 10000);
    return () => clearInterval(int);
  }, []);

  async function sendBonPdf() {
    setSending(true);
    try {
      // Route de test sans token; utiliser /whatsapp/bon si un JWT est fourni
      const resp = await fetch('/api/notifications/whatsapp/bon-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: '0659595284',
          pdfUrl: 'https://boukirdiamond.com/uploads/bons_pdf/sortie/SOR3930-sortie-3930-1763588266466.pdf',
          numero: 'SOR3930',
          total: 0,
          devise: 'DH'
        })
      });
      const data = await resp.json();
      if (!resp.ok || !data.ok) {
        alert('Erreur envoi: ' + (data.message || JSON.stringify(data)));
      } else {
        alert('Bon envoye sur WhatsApp');
      }
    } catch (e: any) {
      alert('Erreur reseau: ' + e.message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-bold mb-4">Envoi Bon WhatsApp (Test simplifie)</h1>
      <div className="space-y-4 bg-white shadow rounded p-4">
        <div className="text-sm text-gray-700">
          <strong>Statut:</strong> {loadingStatus && 'Chargement...'} {status && JSON.stringify(status)}
        </div>
        {qr && (
          <div>
            <p className="text-sm text-gray-600 mb-2">Scanner le QR dans WhatsApp (Appareils lies)</p>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qr)}`}
              alt="QR Code"
              className="border p-2 bg-white"
            />
          </div>
        )}
        <div className="flex gap-2">
          <button onClick={fetchStatus} disabled={loadingStatus} className="bg-gray-600 text-white px-3 py-2 rounded hover:bg-gray-700 disabled:opacity-50">Rafraichir statut</button>
          <button onClick={sendBonPdf} disabled={sending} className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50">
            {sending ? 'Envoi...' : 'Envoyer Bon PDF'}
          </button>
        </div>
        <p className="text-xs text-gray-500">Ce test utilise des valeurs fixes (numero, PDF). Adapter dans le code si necessaire.</p>
      </div>
    </div>
  );
};

export default WhatsAppTestPage;
