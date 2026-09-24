import React, { useEffect, useRef, useState } from 'react';
import { KeyRound, Loader2, LockKeyhole } from 'lucide-react';
import { useGetProjetsAccessQuery, useSetupProjetsPasswordMutation, useUnlockProjetsMutation } from '../../store/api/projetsApi';
import { ErrorBanner, Spinner, errorMessage, inputClass, labelClass, primaryButton } from './shared';

const ProjetsLockScreen: React.FC<{ onUnlocked: (token: string) => void; notice?: string }> = ({ onUnlocked, notice }) => {
  const { data, isLoading, isError, error: accessError, refetch } = useGetProjetsAccessQuery(undefined, { refetchOnMountOrArgChange: true });
  const [unlock, { isLoading: unlocking }] = useUnlockProjetsMutation();
  const [setup, { isLoading: settingUp }] = useSetupProjetsPasswordMutation();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const configured = data?.configured;
  const busy = unlocking || settingUp;

  useEffect(() => { inputRef.current?.focus(); }, [configured]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      if (configured) {
        const result = await unlock({ password }).unwrap();
        onUnlocked(result.token);
      } else {
        if (password.length < 6) { setError('Le mot de passe doit contenir au moins 6 caractères.'); return; }
        if (password !== confirm) { setError('Les deux mots de passe ne correspondent pas.'); return; }
        const result = await setup({ password }).unwrap();
        onUnlocked(result.token);
      }
    } catch (err) {
      setError(errorMessage(err));
      setPassword('');
      inputRef.current?.focus();
    }
  };

  if (isLoading) return <Spinner />;
  if (isError) {
    return (
      <div className="mx-auto mt-16 max-w-md space-y-3 text-center">
        <ErrorBanner message={errorMessage(accessError)} />
        <button type="button" className={primaryButton} onClick={() => refetch()}>Réessayer</button>
      </div>
    );
  }

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-5 flex flex-col items-center text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-sky-50 text-sky-800">
            {configured ? <LockKeyhole className="h-6 w-6" /> : <KeyRound className="h-6 w-6" />}
          </span>
          <h1 className="text-lg font-semibold text-slate-900">Espace Projets</h1>
          <p className="mt-1 text-sm text-slate-500">
            {configured
              ? 'Saisissez le mot de passe spécial pour accéder aux projets.'
              : 'Première ouverture : définissez le mot de passe spécial de cet espace.'}
          </p>
        </div>
        <div className="space-y-3">
          {notice && !error && <div className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">{notice}</div>}
          <ErrorBanner message={error} />
          <div>
            <label htmlFor="projets-password" className={labelClass}>{configured ? 'Mot de passe' : 'Nouveau mot de passe'}</label>
            <input ref={inputRef} id="projets-password" type="password" autoComplete={configured ? 'current-password' : 'new-password'} className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} disabled={busy} required />
          </div>
          {!configured && (
            <div>
              <label htmlFor="projets-password-confirm" className={labelClass}>Confirmer</label>
              <input id="projets-password-confirm" type="password" autoComplete="new-password" className={inputClass} value={confirm} onChange={(e) => setConfirm(e.target.value)} disabled={busy} required />
            </div>
          )}
          <button type="submit" className={`${primaryButton} w-full`} disabled={busy || !password}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {configured ? 'Déverrouiller' : 'Définir et ouvrir'}
          </button>
        </div>
      </form>
    </div>
  );
};

export default ProjetsLockScreen;
