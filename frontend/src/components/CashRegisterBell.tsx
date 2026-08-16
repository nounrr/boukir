import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BadgeDollarSign,
  ExternalLink,
  Play,
  RefreshCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from '../hooks/redux';
import { subscribeCashRegisterChanges } from '../store/api/socketService';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const CASH_SOUND_STORAGE_KEY = 'cash_register_notification_sound_enabled';

type CashAction = {
  id: string;
  date: string;
  type: string;
  direction: 'ENTREE' | 'SORTIE';
  amount: number;
  cumulative: number;
  reference: string;
  actor: string;
  description: string;
  affectsCaisse?: boolean;
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatAmount = (value: unknown) => `${numberValue(value).toFixed(2)} DH`;

const localIsoDate = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--:--';
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
};

const CashRegisterBell = () => {
  const navigate = useNavigate();
  const { user, token } = useAppSelector((state) => state.auth);
  const [showDropdown, setShowDropdown] = useState(false);
  const [actions, setActions] = useState<CashAction[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(
    () => localStorage.getItem(CASH_SOUND_STORAGE_KEY) !== 'false'
  );
  const actionsRef = useRef<CashAction[]>([]);
  const initializedRef = useRef(false);
  const realtimeRefreshTimerRef = useRef<number | null>(null);
  const loadInProgressRef = useRef(false);
  const notificationAudioRef = useRef<HTMLAudioElement | null>(null);

  const playCashSound = useCallback(() => {
    if (!notificationAudioRef.current) {
      notificationAudioRef.current = new Audio('/notification01.mp3');
      notificationAudioRef.current.preload = 'auto';
    }
    const audio = notificationAudioRef.current;
    audio.pause();
    audio.currentTime = 0;
    audio.volume = 1;
    audio.play().catch((playError) => {
      console.warn('[CashRegisterBell] lecture audio bloquée:', playError);
    });
  }, []);

  useEffect(() => {
    if (!notificationAudioRef.current) {
      notificationAudioRef.current = new Audio('/notification01.mp3');
      notificationAudioRef.current.preload = 'auto';
      notificationAudioRef.current.load();
    }
  }, []);

  const loadToday = useCallback(async (notifyAboutNewRows = false, silent = false) => {
    if (!token || !user) return;
    if (loadInProgressRef.current) return;

    loadInProgressRef.current = true;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    try {
      const response = await fetch(
        `${API_BASE_URL}/api/fond-caisse/days/${encodeURIComponent(localIsoDate())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(payload?.message || `HTTP ${response.status}`);
      }

      const nextActions = (Array.isArray(payload?.data) ? payload.data : [])
        .filter((action: CashAction) => action.affectsCaisse !== false)
        .sort((left: CashAction, right: CashAction) => {
          const byDate = new Date(right.date).getTime() - new Date(left.date).getTime();
          return byDate || String(right.id).localeCompare(String(left.id));
        });

      if (notifyAboutNewRows && initializedRef.current) {
        const knownIds = new Set(actionsRef.current.map((action) => action.id));
        // Every newly included caisse movement (entry or exit) creates a badge.
        const addedCount = nextActions.filter(
          (action: CashAction) => !knownIds.has(action.id)
        ).length;
        if (addedCount > 0) {
          setUnreadCount((count) => count + addedCount);
          if (soundEnabled) {
            playCashSound();
          }
        }
      }

      actionsRef.current = nextActions;
      setActions(nextActions);
      initializedRef.current = true;
    } catch (loadError: any) {
      console.error('[CashRegisterBell] load error', loadError);
      if (!silent) setError(loadError?.message || 'Impossible de charger la caisse.');
    } finally {
      loadInProgressRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [playCashSound, soundEnabled, token, user]);

  useEffect(() => {
    if (!token || !user) return;
    loadToday(false);
    const unsubscribe = subscribeCashRegisterChanges(() => {
      if (realtimeRefreshTimerRef.current != null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
      }
      // Several database writes can belong to one business operation. Group
      // their signals so each newly visible caisse row is counted only once.
      realtimeRefreshTimerRef.current = window.setTimeout(() => {
        realtimeRefreshTimerRef.current = null;
        loadToday(true);
      }, 150);
    });

    // Safety net for another browser/device or a temporarily disconnected
    // socket. It stays silent and only notifies when a genuinely new cash
    // entry appears in the canonical fond-caisse result.
    const fallbackPollId = window.setInterval(() => {
      loadToday(true, true);
    }, 3000);

    return () => {
      unsubscribe();
      window.clearInterval(fallbackPollId);
      if (realtimeRefreshTimerRef.current != null) {
        window.clearTimeout(realtimeRefreshTimerRef.current);
        realtimeRefreshTimerRef.current = null;
      }
    };
  }, [loadToday, token, user]);

  useEffect(() => {
    if (!showDropdown) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowDropdown(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [showDropdown]);

  if (!user) return null;

  const currentTotal = actions.length ? actions[0].cumulative : 0;

  const toggleDropdown = () => {
    const willOpen = !showDropdown;
    setShowDropdown(willOpen);
    if (willOpen) {
      setUnreadCount(0);
      loadToday(false);
    }
  };

  const openDayDetail = () => {
    setShowDropdown(false);
    navigate(`/fond-caisse/${localIsoDate()}`);
  };

  const toggleSound = () => {
    setSoundEnabled((enabled) => {
      const nextValue = !enabled;
      localStorage.setItem(CASH_SOUND_STORAGE_KEY, String(nextValue));
      if (nextValue) {
        playCashSound();
      }
      return nextValue;
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={toggleDropdown}
        className="relative rounded-full p-2 text-gray-600 transition-colors hover:bg-emerald-50 hover:text-emerald-700"
        title="Mouvements de caisse aujourd'hui"
        aria-label="Mouvements de caisse aujourd'hui"
        aria-expanded={showDropdown}
      >
        <BadgeDollarSign className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute right-0 top-0 inline-flex min-w-[18px] translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-emerald-600 px-1.5 py-0.5 text-xs font-bold leading-none text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {showDropdown && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setShowDropdown(false)} />
          <section className="fixed left-2 right-2 top-16 z-20 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl sm:absolute sm:left-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[min(92vw,48rem)]">
            <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-emerald-50 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900">Caisse — aujourd'hui</h3>
                <p className="mt-0.5 text-xs text-gray-600">
                  {actions.length} mouvement{actions.length === 1 ? '' : 's'} · Total {formatAmount(currentTotal)}
                </p>
              </div>
              <div className="flex items-center gap-1">
                {soundEnabled && (
                  <button
                    type="button"
                    onClick={playCashSound}
                    className="rounded-lg p-2 text-emerald-700 transition-colors hover:bg-emerald-100"
                    title="Tester le son de caisse"
                    aria-label="Tester le son de caisse"
                  >
                    <Play className="h-4 w-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={toggleSound}
                  className={`rounded-lg p-2 transition-colors ${
                    soundEnabled
                      ? 'text-emerald-700 hover:bg-emerald-100'
                      : 'text-gray-500 hover:bg-gray-200'
                  }`}
                  title={soundEnabled ? 'Désactiver le son de caisse' : 'Activer le son de caisse'}
                  aria-label={soundEnabled ? 'Désactiver le son de caisse' : 'Activer le son de caisse'}
                  aria-pressed={soundEnabled}
                >
                  {soundEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => loadToday(false)}
                  disabled={loading}
                  className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  title="Actualiser"
                  aria-label="Actualiser les mouvements de caisse"
                >
                  <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </header>

            {error ? (
              <div className="px-4 py-8 text-center text-sm text-red-600">{error}</div>
            ) : loading && !actions.length ? (
              <div className="px-4 py-8 text-center text-sm text-emerald-700">Chargement...</div>
            ) : !actions.length ? (
              <div className="px-4 py-10 text-center">
                <BadgeDollarSign className="mx-auto mb-2 h-10 w-10 text-gray-300" />
                <p className="text-sm text-gray-500">Aucun mouvement de caisse aujourd'hui.</p>
              </div>
            ) : (
              <div className="max-h-[65vh] overflow-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="sticky top-0 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="px-3 py-2 text-left font-semibold">Heure</th>
                      <th className="px-3 py-2 text-left font-semibold">Action</th>
                      <th className="px-3 py-2 text-right font-semibold">Montant</th>
                      <th className="px-3 py-2 text-right font-semibold">Total cumulé</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {actions.map((action) => {
                      const isEntry = action.direction === 'ENTREE';
                      return (
                        <tr key={action.id} className="hover:bg-gray-50">
                          <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">
                            {formatTime(action.date)}
                          </td>
                          <td className="min-w-[15rem] px-3 py-3">
                            <div className="flex items-start gap-2">
                              {isEntry ? (
                                <ArrowUpCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                              ) : (
                                <ArrowDownCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />
                              )}
                              <div>
                                <p className="font-semibold text-gray-900">{action.type}</p>
                                <p className="text-xs text-gray-500">
                                  {[action.reference, action.actor].filter(Boolean).join(' · ') || action.description}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className={`whitespace-nowrap px-3 py-3 text-right font-bold ${isEntry ? 'text-emerald-700' : 'text-red-700'}`}>
                            {isEntry ? '+' : '-'}{formatAmount(action.amount)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-3 text-right font-bold text-gray-900">
                            {formatAmount(action.cumulative)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {user.role === 'PDG' && (
            <footer className="border-t border-gray-200 bg-gray-50 px-4 py-3 text-right">
              <button
                type="button"
                onClick={openDayDetail}
                className="inline-flex items-center gap-1.5 text-sm font-semibold text-emerald-700 hover:text-emerald-800"
              >
                Voir le détail du fond de caisse
                <ExternalLink className="h-4 w-4" />
              </button>
            </footer>
            )}
          </section>
        </>
      )}
    </div>
  );
};

export default CashRegisterBell;
