import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCircle2, Clipboard, Clock3, Loader2, Phone, QrCode, RefreshCcw, TriangleAlert, X } from 'lucide-react';
import QRCode from 'qrcode';
import {
  useCancelPaymentPhoneCaptureMutation,
  useCreatePaymentPhoneCaptureMutation,
  useLazyGetPaymentPhoneCaptureQuery,
} from '../store/api/paymentPhoneCaptureApi';

type Props = {
  open: boolean;
  onClose: () => void;
  onReceived: (imageUrl: string) => string | void | Promise<string | void>;
};

type DialogState = 'creating' | 'waiting' | 'received' | 'expired' | 'failed';
type Session = { id: number; token: string; expiresAt: string };

const focusableSelector = [
  'button:not([disabled])',
  'a[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

export default function PaymentPhoneCaptureDialog({ open, onClose, onReceived }: Props) {
  const [createSession] = useCreatePaymentPhoneCaptureMutation();
  const [getStatus] = useLazyGetPaymentPhoneCaptureQuery();
  const [cancelSession] = useCancelPaymentPhoneCaptureMutation();
  const [session, setSession] = useState<Session | null>(null);
  const [dialogState, setDialogState] = useState<DialogState>('creating');
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [error, setError] = useState('');
  const [receivedPreview, setReceivedPreview] = useState('');
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const stateHeadingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const receivedRef = useRef(false);
  const attemptRef = useRef(0);

  const phoneUrl = useMemo(
    () => session ? `${window.location.origin}/payment-phone-capture/${session.token}` : '',
    [session]
  );
  const isLocalhost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(window.location.hostname);

  const cancelPending = useCallback(() => {
    const current = sessionRef.current;
    if (current && !receivedRef.current) void cancelSession(current.id);
  }, [cancelSession]);

  const startSession = useCallback(async () => {
    const attempt = ++attemptRef.current;
    const previous = sessionRef.current;
    if (previous && !receivedRef.current) void cancelSession(previous.id);

    sessionRef.current = null;
    receivedRef.current = false;
    setSession(null);
    setDialogState('creating');
    setQrDataUrl('');
    setError('');
    setReceivedPreview('');
    setRemainingSeconds(0);
    setCopied(false);

    try {
      const data = await createSession().unwrap();
      if (attempt !== attemptRef.current) {
        void cancelSession(data.id);
        return;
      }
      const nextSession = { id: data.id, token: data.token, expiresAt: data.expires_at };
      sessionRef.current = nextSession;
      setSession(nextSession);
      setDialogState('waiting');
    } catch {
      if (attempt !== attemptRef.current) return;
      setError('Impossible de créer le lien sécurisé. Vérifiez la connexion puis réessayez.');
      setDialogState('failed');
    }
  }, [cancelSession, createSession]);

  const close = useCallback(() => {
    attemptRef.current += 1;
    cancelPending();
    onClose();
  }, [cancelPending, onClose]);

  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    void startSession();
    window.requestAnimationFrame(() => titleRef.current?.focus());

    return () => {
      attemptRef.current += 1;
      window.requestAnimationFrame(() => returnFocusRef.current?.focus());
    };
  }, [open, startSession]);

  useEffect(() => () => cancelPending(), [cancelPending]);

  useEffect(() => {
    if (!open) cancelPending();
  }, [cancelPending, open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(focusableSelector))
        .filter((element) => !element.hidden && element.getAttribute('aria-hidden') !== 'true');
      if (focusable.length === 0) {
        event.preventDefault();
        titleRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const activeIndex = focusable.indexOf(document.activeElement as HTMLElement);
      if (event.shiftKey && activeIndex <= 0) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (activeIndex === -1 || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [close, open]);

  useEffect(() => {
    if (!phoneUrl || dialogState !== 'waiting') return;
    let active = true;
    QRCode.toDataURL(phoneUrl, {
      width: 320,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#0f172a', light: '#ffffff' },
    })
      .then((dataUrl) => { if (active) setQrDataUrl(dataUrl); })
      .catch(() => {
        if (!active) return;
        setError('Impossible de générer le QR code. Créez un nouveau lien.');
        setDialogState('failed');
      });
    return () => { active = false; };
  }, [dialogState, phoneUrl]);

  useEffect(() => {
    if (!open || !session || dialogState !== 'waiting') return;
    const tick = () => {
      const next = Math.max(0, Math.ceil((new Date(session.expiresAt).getTime() - Date.now()) / 1000));
      setRemainingSeconds(next);
      if (next === 0) {
        setError('Le lien a expiré. Créez un nouveau lien pour continuer.');
        setDialogState('expired');
      }
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [dialogState, open, session]);

  useEffect(() => {
    if (!open || !session || dialogState !== 'waiting' || remainingSeconds <= 0) return;
    let active = true;
    let polling = false;
    const poll = async () => {
      if (polling) return;
      polling = true;
      try {
        const status = await getStatus(session.id, false).unwrap();
        if (!active) return;
        if (status.status === 'uploaded' && status.image_url) {
          receivedRef.current = true;
          const preview = await onReceived(status.image_url);
          if (!active) return;
          setReceivedPreview(preview || status.image_url);
          setError('');
          setDialogState('received');
        } else if (status.status === 'expired') {
          setError('Le lien a expiré. Créez un nouveau lien pour continuer.');
          setDialogState('expired');
        } else if (status.status === 'cancelled') {
          setError('Cette demande n’est plus active. Créez un nouveau lien pour continuer.');
          setDialogState('failed');
        }
      } catch {
        if (!active) return;
        setError('La connexion a été interrompue. Réessayez pour créer un nouveau lien.');
        setDialogState('failed');
      } finally {
        polling = false;
      }
    };
    void poll();
    const timer = window.setInterval(poll, 2000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [dialogState, getStatus, onReceived, open, remainingSeconds, session]);

  useEffect(() => {
    if (!open || (dialogState !== 'received' && dialogState !== 'expired' && dialogState !== 'failed')) return;
    window.requestAnimationFrame(() => stateHeadingRef.current?.focus());
  }, [dialogState, open]);

  if (!open) return null;
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = String(remainingSeconds % 60).padStart(2, '0');
  const isTerminal = dialogState === 'expired' || dialogState === 'failed';

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/70 p-3" role="presentation">
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="phone-capture-title"
        aria-describedby="phone-capture-status"
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-2xl"
      >
        <header className="flex shrink-0 items-start justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <p className="mb-1 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700"><QrCode size={16} /> Capture mobile</p>
            <h2 ref={titleRef} tabIndex={-1} id="phone-capture-title" className="text-lg font-bold text-slate-900 outline-none">Prendre la photo avec le téléphone</h2>
          </div>
          <button type="button" onClick={close} aria-label="Fermer" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"><X size={20} /></button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-5 text-center">
          {dialogState === 'creating' && (
            <div id="phone-capture-status" role="status" aria-live="polite" className="flex min-h-56 flex-col items-center justify-center gap-3 text-slate-600">
              <Loader2 className="animate-spin text-blue-600" size={34} /><p>Création du lien sécurisé…</p>
            </div>
          )}

          {dialogState === 'waiting' && session && (
            <div className="space-y-4">
              <div className="mx-auto aspect-square w-full max-w-[min(17.5rem,36dvh)] rounded-xl border-2 border-slate-200 bg-white p-3 shadow-sm">
                {qrDataUrl ? <img src={qrDataUrl} alt="QR code à scanner avec le téléphone" className="h-full w-full" /> : <div className="flex h-full items-center justify-center"><Loader2 className="animate-spin text-blue-600" size={32} /></div>}
              </div>
              <div id="phone-capture-status" role="status" aria-live="polite" aria-atomic="true" className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-left">
                <p className="flex items-center gap-2 font-semibold text-blue-900"><Phone size={18} /> En attente du téléphone…</p>
                <p className="mt-1 text-sm text-blue-800">Scannez le QR code, prenez la photo puis appuyez sur Envoyer.</p>
              </div>
              <p className="flex items-center justify-center gap-2 text-sm font-medium text-slate-600"><Clock3 size={17} /> Expire dans {minutes}:{seconds}</p>
              <div className="flex gap-2">
                <input readOnly value={phoneUrl} aria-label="Lien de capture mobile" className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-700" />
                <button type="button" onClick={async () => { await navigator.clipboard.writeText(phoneUrl); setCopied(true); }} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-blue-500"><Clipboard size={17} /> {copied ? 'Copié' : 'Copier'}</button>
              </div>
              {isLocalhost && <p className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs font-medium text-amber-900"><TriangleAlert className="mt-0.5 flex-none" size={17} />Ce lien utilise localhost. Ouvrez l’application avec l’adresse réseau du PC pour que le téléphone puisse y accéder.</p>}
            </div>
          )}

          {dialogState === 'received' && (
            <div id="phone-capture-status" role="status" aria-live="polite" aria-atomic="true" className="space-y-4">
              <div className="relative overflow-hidden rounded-xl border-2 border-emerald-200 bg-slate-100">
                <img src={receivedPreview} alt="Justificatif reçu du téléphone" className="max-h-[42dvh] min-h-48 w-full object-contain" />
                <span className="absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-2.5 py-1.5 text-xs font-bold text-white shadow"><CheckCircle2 size={15} /> Reçue</span>
              </div>
              <div className="rounded-xl bg-emerald-50 p-4 text-emerald-900">
                <h3 ref={stateHeadingRef} tabIndex={-1} className="text-xl font-bold outline-none">Photo reçue</h3>
                <p className="mt-1 text-sm">Le justificatif affiché ci-dessus est déjà ajouté au paiement.</p>
              </div>
            </div>
          )}

          {isTerminal && (
            <div id="phone-capture-status" role="alert" aria-live="assertive" aria-atomic="true" className="flex min-h-56 flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-6 text-red-900">
              <TriangleAlert size={48} className="mb-3 text-red-600" />
              <h3 ref={stateHeadingRef} tabIndex={-1} className="text-xl font-bold outline-none">{dialogState === 'expired' ? 'Lien expiré' : 'Capture interrompue'}</h3>
              <p className="mt-2 text-sm leading-6">{error}</p>
              <button type="button" onClick={() => void startSession()} className="mt-5 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 font-bold text-white hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:ring-offset-2">
                <RefreshCcw size={18} /> {dialogState === 'expired' ? 'Créer un nouveau lien' : 'Réessayer'}
              </button>
            </div>
          )}
        </div>

        <footer className="shrink-0 border-t border-slate-200 bg-slate-50 px-5 py-4">
          <button type="button" onClick={close} className="min-h-11 w-full rounded-lg bg-slate-900 px-4 font-semibold text-white hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2">{dialogState === 'received' ? 'Retour au paiement' : 'Annuler'}</button>
        </footer>
      </section>
    </div>
  );
}
