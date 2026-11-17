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
  if (name === 'NotReadableError' || name === 'TrackStartError') return 'La webcam ne démarre pas : elle est peut-être utilisée par une autre application (Teams, Zoom, Logi Tune, un autre onglet). Fermez-la puis réessayez, ou choisissez une autre caméra.';
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
  const [mirror, setMirror] = useState(false);
  const [hint, setHint] = useState(false);

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
    let stream: MediaStream | null = null;
    let timer = 0;
    let hintTimer = 0;

    const listCameras = () =>
      navigator.mediaDevices?.enumerateDevices?.()
        .then((all) => { if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput')); })
        .catch(() => {});

    /** Ouvre la caméra ; si la haute résolution est refusée (fréquent avec les webcams USB sous Windows), réessaie sans. */
    const openCamera = async () => {
      const quality = { width: { ideal: 1920 }, height: { ideal: 1080 }, advanced: [{ focusMode: 'continuous' } as any] };
      const target: MediaTrackConstraints = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: 'environment' };
      try {
        return await navigator.mediaDevices.getUserMedia({ video: { ...target, ...quality }, audio: false });
      } catch (error: any) {
        if (!['NotReadableError', 'AbortError', 'OverconstrainedError', 'TrackStartError'].includes(error?.name)) throw error;
        try {
          return await navigator.mediaDevices.getUserMedia({ video: { ...target, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
        } catch {
          return await navigator.mediaDevices.getUserMedia({ video: deviceId ? { deviceId: { exact: deviceId } } : true, audio: false });
        }
      }
    };

    const start = async () => {
      setStatus((s) => (s === 'editing' ? s : 'starting'));
      setCameraError(null);
      setHint(false);
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error('no media'), { name: window.isSecureContext ? 'NotFoundError' : 'SecurityError' });
        const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
          import('@zxing/browser'),
          import('@zxing/library'),
        ]);
        if (cancelled || !videoRef.current) return;
        stream = await openCamera();
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        const video = videoRef.current;
        video.srcObject = stream;
        // Sans attendre : la boucle de lecture attend elle-même les premières images.
        void video.play().catch(() => {});

        // Webcam tournée vers l'utilisateur : image en miroir pour viser naturellement (la lecture n'est pas affectée).
        const settings = stream.getVideoTracks()[0]?.getSettings?.() ?? {};
        const touch = window.matchMedia?.('(pointer: coarse)').matches;
        setMirror(settings.facingMode === 'user' || (!settings.facingMode && !touch));

        // Lecteur natif du navigateur s'il existe (Android, macOS), sinon zxing.
        const Native = (window as any).BarcodeDetector;
        let native: any = null;
        if (Native) {
          try {
            const supported: string[] = await Native.getSupportedFormats();
            const formats = ['qr_code', 'code_128'].filter((f) => supported.includes(f));
            if (formats.length) native = new Native({ formats });
          } catch { native = null; }
        }
        const hints = new Map();
        // QR code (le plus fiable à la webcam) et code-barres Code 128 du ticket.
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.QR_CODE, BarcodeFormat.CODE_128]);
        hints.set(DecodeHintType.TRY_HARDER, true);
        const reader = new BrowserMultiFormatReader(hints);
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });

        const opened = stream;
        controlsRef.current = {
          stop: () => {
            window.clearTimeout(timer);
            opened.getTracks().forEach((t) => t.stop());
            if (video.srcObject === opened) video.srcObject = null;
          },
        };
        setStatus((s) => (s === 'editing' || s === 'loading' ? s : 'scanning'));
        // Les noms des caméras ne sont lisibles qu'après autorisation.
        void listCameras();

        // Rien de lu au bout de 10 s : on affiche des conseils.
        const armHint = () => {
          window.clearTimeout(hintTimer);
          hintTimer = window.setTimeout(() => { if (!cancelled) setHint(true); }, 10000);
        };
        armHint();

        let pass = 0;
        const tick = async () => {
          if (cancelled) return;
          const vw = video.videoWidth;
          const vh = video.videoHeight;
          if (ctx && vw && vh && video.readyState >= 2 && !busyRef.current) {
            // On alterne : centre serré, centre large (le cadre de visée), image entière. Toujours en
            // pleine définition : réduire l'image fait perdre les petits codes vus par une webcam.
            // Les recadrages se lisent en quelques ms, donc beaucoup plus d'images sont essayées par seconde.
            let sx = 0, sy = 0, sw = vw, sh = vh;
            const step = pass % 3;
            if (step < 2) {
              const side = Math.round(Math.min(vw, vh) * (step === 0 ? 0.5 : 0.75));
              sx = Math.round((vw - side) / 2);
              sy = Math.round((vh - side) / 2);
              sw = side;
              sh = side;
            }
            const scale = Math.min(1, 1920 / Math.max(sw, sh));
            canvas.width = Math.round(sw * scale);
            canvas.height = Math.round(sh * scale);
            ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
            let text: string | null = null;
            try {
              if (native) text = (await native.detect(canvas))?.[0]?.rawValue ?? null;
              else text = reader.decodeFromCanvas(canvas).getText();
            } catch { /* aucun code dans cette image */ }
            if (cancelled) return;
            if (text) {
              setHint(false);
              armHint();
              void handleCodeRef.current(text);
            }
            pass += 1;
          }
          timer = window.setTimeout(tick, 40);
        };
        void tick();
      } catch (error) {
        if (cancelled) return;
        stream?.getTracks().forEach((t) => t.stop());
        if (deviceId && ['OverconstrainedError', 'NotFoundError'].includes((error as any)?.name)) {
          // Caméra mémorisée débranchée : on repart sur la caméra par défaut.
          try { localStorage.removeItem(DEVICE_KEY); } catch { /* */ }
          setDeviceId('');
          return;
        }
        setCameraError(cameraErrorText(error));
        setStatus('error');
        // Même en erreur, on propose les autres caméras (ex. la webcam USB au lieu de la caméra intégrée).
        void listCameras();
      }
    };
    void start();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.clearTimeout(hintTimer);
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
    scanning: { text: 'Prêt · présentez le QR code du ticket', cls: 'bg-emerald-400/20 text-emerald-200' },
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
            <p className="text-xs text-white/60">Présentez le QR code du ticket à la caméra. Le bon s'ouvre en modification ; après enregistrement, le scanner reste ouvert pour le suivant.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-full bg-white/10 p-2 text-white/80 transition hover:bg-white/20 hover:text-white" aria-label="Fermer le scanner">
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-0 md:grid-cols-[1fr_260px]">
          <div className="relative aspect-video bg-black">
            <video ref={videoRef} className={`h-full w-full object-cover ${mirror ? '-scale-x-100' : ''}`} muted playsInline autoPlay />
            {/* Cadre de visée */}
            {status !== 'error' && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative aspect-square h-[62%] rounded-2xl shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] ring-2 ring-white/80">
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
            {hint && status === 'scanning' && (
              <div className="absolute inset-x-3 bottom-3 rounded-2xl bg-black/70 px-3 py-2 text-xs leading-relaxed text-white/90 backdrop-blur">
                Rien n'est lu ? Tenez le ticket à <b>20–30 cm</b> de la webcam, bien à plat et éclairé, le QR code dans le cadre.
                Les webcams sans mise au point automatique (ex. Logitech C270) sont floues de près : éloignez le ticket plutôt que de l'approcher.
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
