import React from 'react';
import { useAppDispatch, useAuth } from '../../hooks/redux';
import { logout } from '../../store/slices/authSlice';
import { 
  LogOut, 
  User, 
  Crown,
  Menu,
  X,
  Shield,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showConfirmation, showSuccess } from '../../utils/notifications';
import NotificationBell from '../NotificationBell';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
  manualAccessCheck?: () => void; // Fonction optionnelle pour vérification manuelle d'accès
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, sidebarOpen, manualAccessCheck }) => {
  const dispatch = useAppDispatch();
  const { user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    const result = await showConfirmation(
      'Vous devrez vous reconnecter pour accéder à l\'application.',
      'Êtes-vous sûr de vouloir vous déconnecter ?',
      'Oui, se déconnecter',
      'Annuler'
    );
    
    if (result.isConfirmed) {
      dispatch(logout());
      showSuccess('Déconnexion réussie');
    }
  };

  return (
    <header className="navbar px-3 md:px-4 py-3 bg-white shadow-sm border-b">
      <div className="flex items-center justify-between w-full">
        {/* Bouton toggle sidebar + titre */}
        <div className="flex items-center space-x-2 md:space-x-4">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          {/* Titre adaptatif selon la taille d'écran */}
          <h1 className="text-lg md:text-xl font-semibold text-gray-900">
            <span className="hidden sm:inline">Gestion Commerciale</span>
            <span className="sm:hidden">Boukir</span>
          </h1>
        </div>

        {/* Informations utilisateur - Version mobile optimisée */}
        <div className="flex items-center space-x-2 md:space-x-4">
          {/* Version mobile compacte */}
          <div className="sm:hidden flex items-center space-x-1">
            <button
              type="button"
              onClick={() => navigate('/profile')}
              className="flex items-center space-x-1 p-2 rounded-md hover:bg-gray-100 transition-colors"
            >
              {user?.role === 'PDG' ? (
                <Crown className="w-4 h-4 text-yellow-600" />
              ) : user?.role === 'ManagerPlus' ? (
                <Crown className="w-4 h-4 text-blue-600" />
              ) : (
                <User className="w-4 h-4 text-gray-600" />
              )}
              <div className="text-left">
                <div className="text-xs font-medium text-gray-900 truncate max-w-[80px]">
                  {user?.nom_complet?.split(' ')[0]}
                </div>
                <div className="text-xs text-primary-600">
                  {user?.role}
                </div>
              </div>
            </button>
            <button
              onClick={handleLogout}
              className="p-2 text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-md transition-colors"
              title="Déconnexion"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          {/* Version desktop complète */}
          <div className="hidden sm:flex items-center space-x-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => navigate('/profile')}
                  className="flex items-center space-x-1 group"
                >
                  {user?.role === 'PDG' ? (
                    <Crown className="w-4 h-4 text-yellow-600" />
                  ) : user?.role === 'ManagerPlus' ? (
                    <Crown className="w-4 h-4 text-blue-600" />
                  ) : (
                    <User className="w-4 h-4 text-gray-600 group-hover:text-primary-600" />
                  )}
                  <span className="text-sm font-medium text-gray-700 group-hover:text-primary-600">
                    {user?.nom_complet}
                  </span>
                </button>
                <span className="text-xs px-2 py-1 bg-primary-100 text-primary-800 rounded-full">
                  {user?.role}
                </span>
              </div>

              {/* Notification Bell */}
              <NotificationBell />

              {/* Bouton de vérification d'accès manuelle */}
              {manualAccessCheck && (
                <button
                  onClick={manualAccessCheck}
                  className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                  title="Vérifier l'accès horaire"
                >
                  <Shield className="w-4 h-4" />
                </button>
              )}
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-1 px-3 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-gray-100 rounded-md transition-colors"
            >
              <LogOut className="w-4 h-4" />
              <span>Déconnexion</span>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
