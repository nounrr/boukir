import { useState, type ComponentType } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Wallet } from 'lucide-react';

import { useAuth } from '../../hooks/redux';

const STORAGE_PREFIX = 'page-password-gate:';

/** Lit le déverrouillage mémorisé pour l'onglet courant (sessionStorage). */
export const isPageUnlocked = (gateKey: string): boolean => {
  try {
    return sessionStorage.getItem(STORAGE_PREFIX + gateKey) === '1';
  } catch {
    return false;
  }
};

const rememberUnlock = (gateKey: string) => {
  try {
    sessionStorage.setItem(STORAGE_PREFIX + gateKey, '1');
  } catch {
    /* stockage indisponible : on reste déverrouillé pour ce rendu seulement */
  }
};

type Props = {
  /** Clé de mémorisation (même clé = un seul mot de passe pour plusieurs pages). */
  gateKey: string;
  title: string;
  description?: string;
  icon?: ComponentType<{ size?: number; className?: string }>;
  backTo?: string;
  onUnlock: () => void;
};

/**
 * Popup de re-saisie du mot de passe avant d'entrer sur une page sensible
 * (même mécanisme que la page Employés : vérification via /api/auth/login
 * avec le CIN de l'utilisateur connecté).
 */
const PagePasswordGate = ({
  gateKey,
  title,
  description = 'Veuillez entrer votre mot de passe pour accéder à cette page',
  icon: Icon = Wallet,
  backTo = '/',
  onUnlock,
}: Props) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [passwordInput, setPasswordInput] = useState('');
  const [showError, setShowError] = useState(false);
  const [isChecking, setIsChecking] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!passwordInput || isChecking) return;
    setIsChecking(true);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cin: user?.cin, password: passwordInput }),
      });
      if (response.ok) {
        rememberUnlock(gateKey);
        setPasswordInput('');
        setShowError(false);
        onUnlock();
      } else {
        setShowError(true);
      }
    } catch (error) {
      console.error('Erreur de vérification:', error);
      setShowError(true);
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-center">
          <Icon size={48} className="text-blue-600" />
        </div>
        <h2 className="mb-2 text-center text-2xl font-bold">{title}</h2>
        <p className="mb-6 text-center text-gray-600">{description}</p>
        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label htmlFor="page-password-verify" className="mb-2 block text-sm font-medium text-gray-700">
              Mot de passe
            </label>
            <input
              type="password"
              id="page-password-verify"
              value={passwordInput}
              onChange={(e) => {
                setPasswordInput(e.target.value);
                setShowError(false);
              }}
              className={`w-full rounded-md border px-4 py-2 focus:border-blue-500 focus:ring-2 focus:ring-blue-500 ${
                showError ? 'border-red-500' : 'border-gray-300'
              }`}
              placeholder="Entrez le mot de passe"
              autoComplete="current-password"
              autoFocus
            />
            {showError && (
              <p className="mt-2 text-sm text-red-600">Mot de passe incorrect. Veuillez réessayer.</p>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => navigate(backTo)}
              className="flex flex-1 items-center justify-center gap-2 rounded-md bg-gray-100 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-200"
            >
              <ArrowLeft size={18} />
              Retour
            </button>
            <button
              type="submit"
              disabled={isChecking}
              className="flex-1 rounded-md bg-blue-600 px-4 py-2 font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-60"
            >
              {isChecking ? 'Vérification…' : 'Accéder'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default PagePasswordGate;
