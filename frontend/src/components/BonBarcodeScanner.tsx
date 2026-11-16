import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CheckCircle2, Keyboard, Loader2, ScanBarcode, X, XCircle } from 'lucide-react';
import { useAuth } from '../hooks/redux';
import { useLazyGetBonForEditingQuery } from '../store/api/bonsApi';
import { canModifyBons } from '../utils/permissions';
import { parseBonBarcode, SCAN_EDITABLE_TYPES } from '../utils/bonBarcode';
import { showSuccess } from '../utils/notifications';

const BonFormModal = lazy(() => import('./BonFormModal'));
const ChargeEditFormModal = lazy(() => import('./ChargeEditFormModal'));

type Status = 'starting' | 'scanning' | 'loading' | 'editing' | 'error';
type Scan = { code: string; ok: boolean; message: string; at: number };
type Controls = { stop: () => void };

const DEVICE_KEY = 'bonScanner.deviceId';
const SAME_CODE_COOLDOWN_MS = 3500;

function beep(ok: boolean) {
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1320 : 260;
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.onended = () => void ctx.close();
  } catch { /* son indisponible */ }
}

function cameraErrorText(error: any): string {
  const name = error?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Accès à la caméra refusé. Autorisez la caméra pour ce site dans le navigateur, puis réessayez.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Aucune webcam détectée. Branchez une caméra ou utilisez la saisie / la douchette ci-dessous.';
  if (name === 'NotReadableError') return 'La webcam est déjà utilisée par une autre application.';
  if (!window.isSecureContext) return 'La caméra exige une connexion sécurisée (https).';
  return 'Impossible de démarrer la caméra.';
}

/**
 * Scanner de bons : la webcam lit le code-barres du ticket thermique et ouvre directement
 * la modification du bon. Après enregistrement ou fermeture, on revient au scanner,
 * caméra toujours ouverte, prêt pour le code suivant. Une douchette USB (qui tape le code
 * puis Entrée) ou une saisie manuelle fonctionnent aussi.
 */
export default function BonBarcodeScanner({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const { user } = useAuth();
  const [loadBon] = useLazyGetBonForEditingQuery();
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const controlsRef = useRef<Controls | null>(null);
  const busyRef = useRef(false);
  const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });

  const [status, setStatus] = useState<Status>('starting');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [deviceId, setDeviceId] = useState<string>(() => {
    try { return localStorage.getItem(DEVICE_KEY) || ''; } catch { return ''; }
  });
  const [manual, setManual] = useState('');
  const [scans, setScans] = useState<Scan[]>([]);
  const [editing, setEditing] = useState<any>(null);
  const [retry, setRetry] = useState(0);

  const pushScan = (scan: Omit<Scan, 'at'>) => {
    setScans((prev) => [{ ...scan, at: Date.now() }, ...prev].slice(0, 6));
    beep(scan.ok);
  };

  const handleCode = useCallback(async (raw: string) => {
    if (busyRef.current) return;
    const text = raw.trim();
    if (!text) return;
    const now = Date.now();
    // Le ticket reste souvent devant la caméra : on ignore la relecture immédiate du même code.
    if (lastRef.current.code === text && now - lastRef.current.at < SAME_CODE_COOLDOWN_MS) return;
    lastRef.current = { code: text, at: now };

    const parsed = parseBonBarcode(text);
    if (!parsed) {
      pushScan({ code: text, ok: false, message: 'Code non reconnu' });
      return;
    }
    if (!SCAN_EDITABLE_TYPES.has(parsed.type)) {
      pushScan({ code: parsed.code, ok: false, message: `${parsed.type} : modification non disponible par scan` });
      return;
    }
    if (!canModifyBons(user)) {
      pushScan({ code: parsed.code, ok: false, message: 'Vous n’avez pas le droit de modifier les bons' });
      return;
    }

    busyRef.current = true;
    setStatus('loading');
    try {
      // Toujours recharger : un autre employé a pu modifier ou valider le bon.
      const loaded = await loadBon({ id: parsed.id, type: parsed.type }, false).unwrap();
      if (loaded?.statut === 'Validé' || loaded?.statut === 'Annulé') {
        pushScan({ code: parsed.code, ok: false, message: `Bon ${String(loaded.statut).toLowerCase()} : modification impossible` });
        busyRef.current = false;
        setStatus('scanning');
        return;
      }
      pushScan({ code: parsed.code, ok: true, message: 'Ouvert en modification' });
      setEditing({ ...loaded, type: parsed.type });
      setStatus('editing');
    } catch (error: any) {
      const notFound = error?.status === 404;
      pushScan({ code: parsed.code, ok: false, message: notFound ? 'Bon introuvable' : 'Impossible de charger le bon' });
      busyRef.current = false;
      setStatus('scanning');
    }
  }, [loadBon, user]);

  // Toujours la dernière version dans le rappel de la caméra.
  const handleCodeRef = useRef(handleCode);
  useEffect(() => { handleCodeRef.current = handleCode; }, [handleCode]);

  // --- Caméra
  useEffect(() => {
    let cancelled = false;
    const start = async () => {
      setStatus((s) => (s === 'editing' ? s : 'starting'));
      setCameraError(null);
      try {
        const [{ BrowserMultiFormatReader, BrowserCodeReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled || !videoRef.current) return;
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: 120 });
        const constraints: MediaStreamConstraints = {
          video: deviceId
            ? { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        };
        const controls = await reader.decodeFromConstraints(constraints, videoRef.current, (result) => {
          if (result) void handleCodeRef.current(result.getText());
        });
        if (cancelled) { controls.stop(); return; }
        controlsRef.current = controls;
        setStatus((s) => (s === 'editing' || s === 'loading' ? s : 'scanning'));
        // Les noms des caméras ne sont lisibles qu'après autorisation.
        BrowserCodeReader.listVideoInputDevices().then((list) => { if (!cancelled) setDevices(list); }).catch(() => {});
      } catch (error) {
        if (cancelled) return;
        if (deviceId && (error as any)?.name === 'OverconstrainedError') {
          // Caméra mémorisée débranchée : on repart sur la caméra par défaut.
          try { localStorage.removeItem(DEVICE_KEY); } catch { /* */ }
          setDeviceId('');
          return;
        }
        setCameraError(cameraErrorText(error));
        setStatus('error');
      }
    };
    void start();
    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
    };
  }, [deviceId, retry]);

  // Échap ferme le scanner (sauf pendant la modification, gérée par le formulaire).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busyRef.current) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resume = () => {
    setEditing(null);
    busyRef.current = false;
    lastRef.current = { code: lastRef.current.code, at: Date.now() };
    setStatus(controlsRef.current ? 'scanning' : cameraError ? 'error' : 'starting');
    setTimeout(() => inputRef.current?.focus(), 50);
  };
  const saved = () => {
    showSuccess('Bon mis à jour. Scannez le bon suivant.');
    onSaved?.();
    resume();
  };

  const statusChip = {
    starting: { text: 'Démarrage de la caméra…', cls: 'bg-white/15 text-white' },
    scanning: { text: 'Prêt · présentez le code-barres du ticket', cls: 'bg-emerald-400/20 text-emerald-200' },
    loading: { text: 'Chargement du bon…', cls: 'bg-sky-400/20 text-sky-100' },
    editing: { text: 'Modification en cours…', cls: 'bg-amber-400/20 text-amber-100' },
    error: { text: 'Caméra indisponible', cls: 'bg-rose-500/25 text-rose-100' },
  }[status];

  return createPortal(
    <div className="fixed inset-0 z-[45] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Scanner un bon">
      <div className="w-full max-w-3xl overflow-hidden rounded-3xl bg-[#1c1c1e] text-white shadow-2xl ring-1 ring-white/10">
        <div className="flex items-center gap-3 border-b border-white/10 px-5 py-4">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-sky-400 to-indigo-600 shadow-lg">
            <ScanBarcode size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold tracking-tight">Scanner un bon</h2>
            <p className="text-xs text-white/60">Le bon s'ouvre en modification. Après enregistrement, le scanner reste ouvert pour le suivant.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white" aria-label="Fermer le scanner">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[1fr_260px]">
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" muted playsInline autoPlay />
            {/* Cadre de visée */}
            {status !== 'error' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-[38%] w-[72%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] ring-2 ring-white/80">
                  <div className="absolute inset-x-3 top-1/2 h-0.5 -translate-y-1/2 animate-pulse rounded bg-rose-500 shadow-[0_0_12px_2px_rgba(244,63,94,0.8)]" />
                </div>
              </div>
            )}
            {status === 'error' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
                <Camera size={36} className="text-white/50" />
                <p className="max-w-sm text-sm text-white/80">{cameraError}</p>
                <button type="button" onClick={() => setRetry((n) => n + 1)} className="rounded-full bg-white/15 px-4 py-1.5 text-xs font-semibold hover:bg-white/25">
                  Réessayer
                </button>
              </div>
            )}
            <div className={`absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold backdrop-blur ${statusChip.cls}`}>
              {(status === 'starting' || status === 'loading') && <Loader2 size={12} className="animate-spin" />}
              {statusChip.text}
            </div>
          </div>

          <div className="flex flex-col gap-4 border-t border-white/10 p-4 md:border-l md:border-t-0">
            {devices.length > 1 && (
              <label className="text-xs text-white/60">
                Caméra
                <select
                  value={deviceId}
                  onChange={(e) => {
                    setDeviceId(e.target.value);
                    try { localStorage.setItem(DEVICE_KEY, e.target.value); } catch { /* */ }
                  }}
                  className="mt-1 w-full rounded-xl border-0 bg-white/10 px-3 py-2 text-sm text-white focus:ring-2 focus:ring-sky-400"
                >
                  <option value="" className="text-black">Par défaut</option>
                  {devices.map((d, i) => (
                    <option key={d.deviceId || i} value={d.deviceId} className="text-black">{d.label || `Caméra ${i + 1}`}</option>
                  ))}
                </select>
              </label>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                lastRef.current = { code: '', at: 0 }; // une saisie volontaire n'est jamais ignorée
                void handleCode(manual);
                setManual('');
              }}
            >
              <label className="flex items-center gap-1.5 text-xs text-white/60" htmlFor="bon-scan-input">
                <Keyboard size={13} /> Douchette ou saisie (ex. SOR-1042)
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="bon-scan-input"
                  ref={inputRef}
                  autoFocus
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  disabled={status === 'editing' || status === 'loading'}
                  placeholder="Code du bon"
                  autoComplete="off"
                  className="min-w-0 flex-1 rounded-xl border-0 bg-white/10 px-3 py-2 font-mono text-sm uppercase text-white placeholder:normal-case placeholder:text-white/35 focus:ring-2 focus:ring-sky-400"
                />
                <button type="submit" disabled={!manual.trim() || status === 'editing' || status === 'loading'} className="rounded-xl bg-sky-500 px-3 text-sm font-semibold text-white transition hover:bg-sky-400 disabled:opacity-40">
                  Ouvrir
                </button>
              </div>
            </form>

            <div className="min-h-0 flex-1">
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-white/40">Derniers scans</p>
              {scans.length === 0 ? (
                <p className="text-xs text-white/40">Aucun scan pour l'instant.</p>
              ) : (
                <ul className="space-y-1.5" aria-live="polite">
                  {scans.map((s) => (
                    <li key={s.at} className={`flex items-start gap-2 rounded-xl px-2.5 py-2 text-xs ${s.ok ? 'bg-emerald-400/10' : 'bg-rose-500/10'}`}>
                      {s.ok ? <CheckCircle2 size={14} className="mt-0.5 flex-none text-emerald-300" /> : <XCircle size={14} className="mt-0.5 flex-none text-rose-300" />}
                      <span className="min-w-0">
                        <span className="block font-mono font-semibold">{s.code}</span>
                        <span className="block text-white/60">{s.message}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      </div>

      {editing && (
        <Suspense fallback={<div role="status" className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 text-white">Chargement du formulaire…</div>}>
          {editing.type === 'Charge'
            ? <ChargeEditFormModal isOpen onClose={resume} initialValues={editing} onBonAdded={saved} />
            : <BonFormModal
                isOpen
                onClose={resume}
                currentTab={editing.type}
                initialValues={editing}
                onBonAdded={saved}
                comptantPartialPaymentMode={editing.type === 'Comptant' && editing.non_paye ? 'required' : 'hidden'}
                defaultVendreAuFournisseur={Number(editing.vendre_au_fournisseur) === 1}
              />}
        </Suspense>
      )}
    </div>,
    document.body,
  );
}
