import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppSelector } from './redux';

interface SecurityCheckOptions {
  requiredRoles?: string[];
  redirectTo?: string;
}

/**
 * Hook pour vérifier les permissions de sécurité de l'utilisateur
 * Redirige automatiquement si l'utilisateur n'a pas les permissions requises
 */
export function useSecurityCheck(options: SecurityCheckOptions = {}) {
  const { requiredRoles = [], redirectTo = '/' } = options;
  const navigate = useNavigate();
  const currentUser = useAppSelector((state) => state.auth.user);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  useEffect(() => {
    // Si pas authentifié, rediriger vers la page de connexion
    if (!isAuthenticated) {
      navigate('/login');
      return;
    }

    // Si des rôles sont requis, vérifier que l'utilisateur en possède un
    if (requiredRoles.length > 0 && currentUser) {
      const hasRequiredRole = requiredRoles.includes(currentUser.role);
      if (!hasRequiredRole) {
        navigate(redirectTo);
      }
    }
  }, [isAuthenticated, currentUser, requiredRoles, redirectTo, navigate]);

  return {
    currentUser,
    isAuthenticated,
    hasRole: (role: string) => currentUser?.role === role,
    hasAnyRole: (roles: string[]) => roles.includes(currentUser?.role || ''),
  };
}
