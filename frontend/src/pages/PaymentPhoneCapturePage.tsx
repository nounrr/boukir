import { useEffect, useMemo, useState } from 'react';
import { Camera, CheckCircle2, Loader2, RefreshCcw, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useParams } from 'react-router-dom';
import boukirLogo from '../components/logo.png';

type CaptureState = 'loading' | 'ready' | 'uploading' | 'success' | 'expired' | 'used' | 'cancelled' | 'error';

export default function PaymentPhoneCapturePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [state, setState] = useState<CaptureState>('loading');
  const [file, setFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [checkAttempt, setCheckAttempt] = useState(0);
  const previewUrl = useMemo(() => file ? URL.createObjectURL(file) : '', [file]);

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  useEffect(() => {
    let active = true;
    fetch(`/api/payment-phone-captures/public/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw { status: response.status, body };
        if (active) setState('ready');
      })
      .catch((error) => {
        if (!active) return;
        const reason = error?.body?.state;
        setState(reason === 'expired' ? 'expired' : reason === 'used' ? 'used' : reason === 'cancelled' ? 'cancelled' : 'error');
        setMessage('Impossible de vérifier ce lien pour le moment. Vérifiez la connexion puis réessayez.');
      });
    return () => { active = false; };
  }, [checkAttempt, token]);

  const selectFile = (nextFile?: File) => {
    if (!nextFile) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(nextFile.type)) {
      setMessage('Utilisez une photo JPEG, PNG ou WebP.');
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setMessage('La photo dépasse la taille maximale de 10 Mo.');
      return;
    }
    setMessage('');
    setFile(nextFile);
  };

  const upload = async () => {
    if (!file) return;
    setState('uploading');
    const form = new FormData();
    form.append('image', file);
    try {
      const response = await fetch(`/api/payment-phone-captures/public/${encodeURIComponent(token)}/image`, { method: 'POST', body: form });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw { status: response.status, body };
      setState('success');
    } catch (error: any) {
      const reason = error?.body?.state;
      setState(reason === 'expired' ? 'expired' : reason === 'used' ? 'used' : reason === 'cancelled' ? 'cancelled' : 'ready');
      setMessage(
        reason === 'expired' || reason === 'used' || reason === 'cancelled'
          ? ''
          : error?.status === 413
            ? 'La photo dépasse la taille maximale de 10 Mo.'
            : error?.status === 400
              ? 'La photo n’est pas valide. Reprenez-la au format JPEG, PNG ou WebP.'
              : 'Envoi impossible. Vérifiez la connexion puis réessayez.'
      );
    }
  };

  const terminalCopy = state === 'expired'
    ? ['Lien expiré', 'Demandez un nouveau QR code sur le poste caisse.']
    : state === 'used'
      ? ['Photo déjà envoyée', 'Ce lien à usage unique a déjà servi.']
      : state === 'cancelled'
        ? ['Capture annulée', 'La caisse a fermé cette demande.']
        : ['Lien indisponible', message || 'Vérifiez le QR code et réessayez.'];

  return (
    <main className="min-h-[100dvh] bg-slate-950 px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))] text-slate-900">
      <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-md items-center">
        <section className="w-full overflow-hidden rounded-2xl bg-white shadow-2xl shadow-black/40">
          <header className="border-b border-slate-200 px-6 py-5">
            <img src={boukirLogo} alt="Boukir" className="mb-4 h-10 w-auto object-contain" />
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-blue-700"><ShieldCheck size={16} /> Capture sécurisée</p>
            <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-slate-950">Photo du justificatif</h1>
            <p className="mt-1 text-sm leading-6 text-slate-600">Cadrez le chèque ou la traite bien à plat, avec tous les bords visibles.</p>
          </header>

          <div className="p-5 sm:p-6">
            {state === 'loading' && <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-slate-600"><Loader2 size={40} className="animate-spin text-blue-600" /><p>Vérification du lien…</p></div>}

            {(state === 'expired' || state === 'used' || state === 'cancelled' || state === 'error') && (
              <div className="flex min-h-64 flex-col items-center justify-center text-center">
                <TriangleAlert size={50} className="mb-4 text-red-500" />
                <h2 className="text-xl font-bold text-slate-950">{terminalCopy[0]}</h2>
                <p className="mt-2 max-w-xs text-sm leading-6 text-slate-600">{terminalCopy[1]}</p>
                {state === 'error' && (
                  <button
                    type="button"
                    onClick={() => {
                      setMessage('');
                      setState('loading');
                      setCheckAttempt((attempt) => attempt + 1);
                    }}
                    className="mt-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2"
                  >
                    <RefreshCcw size={18} /> Réessayer
                  </button>
                )}
              </div>
            )}

            {state === 'success' && (
              <div className="flex min-h-72 flex-col items-center justify-center rounded-xl bg-emerald-50 p-6 text-center">
                <CheckCircle2 size={58} className="mb-4 text-emerald-600" />
                <h2 className="text-2xl font-extrabold text-emerald-950">Photo envoyée</h2>
                <p className="mt-2 text-sm leading-6 text-emerald-800">Elle est apparue sur le poste caisse. Vous pouvez fermer cette page.</p>
              </div>
            )}

            {(state === 'ready' || state === 'uploading') && (
              <div className="space-y-4">
                {previewUrl ? (
                  <div className="overflow-hidden rounded-xl border-2 border-slate-200 bg-slate-100"><img src={previewUrl} alt="Aperçu de la photo" className="max-h-[48vh] w-full object-contain" /></div>
                ) : (
                  <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-blue-300 bg-blue-50 p-6 text-center transition hover:bg-blue-100 focus-within:ring-2 focus-within:ring-blue-600 focus-within:ring-offset-2">
                    <Camera size={54} className="mb-4 text-blue-700" />
                    <span className="text-lg font-bold text-blue-950">Ouvrir l’appareil photo</span>
                    <span className="mt-2 text-sm text-blue-800">JPEG, PNG ou WebP · 10 Mo maximum</span>
                    <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} className="sr-only" aria-label="Prendre une photo du justificatif" />
                  </label>
                )}

                {message && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-800">{message}</p>}

                {file && (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 font-semibold text-slate-800 hover:bg-slate-50 focus-within:ring-2 focus-within:ring-blue-600">
                      <RefreshCcw size={18} /> Reprendre
                      <input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => selectFile(event.target.files?.[0])} className="sr-only" aria-label="Reprendre la photo" disabled={state === 'uploading'} />
                    </label>
                    <button type="button" onClick={upload} disabled={state === 'uploading'} className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 font-bold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2 disabled:cursor-wait disabled:opacity-70">
                      {state === 'uploading' ? <Loader2 size={19} className="animate-spin" /> : <Send size={19} />}{state === 'uploading' ? 'Envoi…' : 'Envoyer'}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
