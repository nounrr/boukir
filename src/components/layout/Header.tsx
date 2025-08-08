import React from 'react';
import { useAppDispatch, useAuth } from '../../hooks/redux';
import { logout } from '../../store/slices/authSlice';
import { 
  LogOut, 
  User, 
  Crown,
  Menu,
  X,
} from 'lucide-react';
import { showConfirmation, showSuccess } from '../../utils/notifications';

interface HeaderProps {
  onToggleSidebar: () => void;
  sidebarOpen: boolean;
}

const Header: React.FC<HeaderProps> = ({ onToggleSidebar, sidebarOpen }) => {
  const dispatch = useAppDispatch();
  const { user } = useAuth();

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
    <header className="navbar px-4 py-3">
      <div className="flex items-center justify-between w-full">
        {/* Bouton toggle sidebar + titre */}
        <div className="flex items-center space-x-4">
          <button
            onClick={onToggleSidebar}
            className="p-2 rounded-md text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
          >
            {sidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <h1 className="text-xl font-semibold text-gray-900">
            Gestion Commerciale
          </h1>
        </div>

        {/* Informations utilisateur */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-1">
              {user?.role === 'PDG' ? (
                <Crown className="w-4 h-4 text-yellow-600" />
              ) : (
                <User className="w-4 h-4 text-gray-600" />
              )}
              <span className="text-sm font-medium text-gray-700">
                {user?.nom_complet}
              </span>
            </div>
            <span className="text-xs px-2 py-1 bg-primary-100 text-primary-800 rounded-full">
              {user?.role}
            </span>
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
    </header>
  );
};

export default Header;
