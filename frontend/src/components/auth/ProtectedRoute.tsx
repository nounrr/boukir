import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/redux';

type Role = 'PDG' | 'Employé' | 'Manager';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
  requiredRoles?: Role[];
  forbiddenRoles?: Role[];
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ 
  children, 
  requiredRole,
  requiredRoles,
  forbiddenRoles
}) => {
  const { isAuthenticated, user } = useAuth();
  const location = useLocation();

  // Si l'utilisateur n'est pas authentifié, rediriger vers la page de login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si le rôle de l'utilisateur est dans les rôles interdits
  if (forbiddenRoles && user?.role && forbiddenRoles.includes(user.role as any)) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="card text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              Accès refusé
            </h2>
            <p className="text-gray-600">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Cette page est interdite pour votre rôle.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Calcul des rôles autorisés (support backward compatibility)
  let allowedRoles: Role[] | null = null;
  if (requiredRoles && requiredRoles.length > 0) {
    allowedRoles = requiredRoles;
  } else if (requiredRole) {
    allowedRoles = [requiredRole];
  }

  // Si des rôles sont requis et que l'utilisateur ne les a pas
  if (allowedRoles && (!user?.role || !allowedRoles.includes(user.role as any))) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
        <div className="sm:mx-auto sm:w-full sm:max-w-md">
          <div className="card text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">
              Accès refusé
            </h2>
            <p className="text-gray-600">
              Vous n'avez pas les permissions nécessaires pour accéder à cette page.
            </p>
            <p className="text-sm text-gray-500 mt-2">
              Rôles requis : {allowedRoles.join(', ')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default ProtectedRoute;
