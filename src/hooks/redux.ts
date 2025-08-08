import { useDispatch, useSelector } from 'react-redux';
import type { TypedUseSelectorHook } from 'react-redux';
import type { RootState, AppDispatch } from '../store';

// Hooks typés pour une utilisation dans toute l'application
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;

// Hook pour récupérer l'utilisateur connecté avec typage sûr
export const useAuth = () => {
  const auth = useAppSelector((state) => state.auth);
  return auth;
};
