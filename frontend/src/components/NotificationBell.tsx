import React, { useState, useCallback } from 'react';
import { Bell } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '../hooks/redux';
import { setRequests, setLoading, removeRequest } from '../store/slices/notificationsSlice';
import axios from 'axios';
import ConfirmModal from './ConfirmModal';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface ArtisanRequest {
  id: number;
  nom_complet: string;
  prenom: string;
  nom: string;
  email: string;
  telephone?: string;
  avatar_url?: string;
  created_at: string;
}

const NotificationBell: React.FC = () => {
  const dispatch = useAppDispatch();
  const { count, requests, loading } = useAppSelector(state => state.notifications);
  const { user, token } = useAppSelector(state => state.auth);
  const [showDropdown, setShowDropdown] = useState(false);
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    type: 'approve' | 'reject';
    requestId: number;
    userName: string;
  }>({
    isOpen: false,
    type: 'approve',
    requestId: 0,
    userName: '',
  });

  // Only show notifications for PDG role
  const isPDG = user?.role === 'PDG';

  // Fetch requests when dropdown is opened
  const fetchRequests = useCallback(async () => {
    if (!isPDG || !token) return;

    dispatch(setLoading(true));
    try {
      const response = await axios.get(`${API_BASE_URL}/api/notifications/artisan-requests?limit=5`, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      dispatch(setRequests(response.data));
    } catch (error) {
      console.error('Error fetching artisan requests:', error);
    } finally {
      dispatch(setLoading(false));
    }
  }, [isPDG, token, dispatch]);

  const handleBellClick = () => {
    if (!showDropdown) {
      fetchRequests();
    }
    setShowDropdown(!showDropdown);
  };

  const handleApprove = (id: number, userName: string) => {
    setConfirmModal({
      isOpen: true,
      type: 'approve',
      requestId: id,
      userName,
    });
  };

  const handleReject = (id: number, userName: string) => {
    setConfirmModal({
      isOpen: true,
      type: 'reject',
      requestId: id,
      userName,
    });
  };

  const handleConfirm = async (note?: string) => {
    const { type, requestId, userName } = confirmModal;

    try {
      if (type === 'approve') {
        await axios.post(
          `${API_BASE_URL}/api/notifications/artisan-requests/${requestId}/approve`,
          { note: 'Approuvé par PDG' },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        dispatch(removeRequest(requestId));
        setConfirmModal({ isOpen: false, type: 'approve', requestId: 0, userName: '' });
        
        // Show success message
        setTimeout(() => {
          alert(`✓ ${userName} a été approuvé comme Artisan/Promoteur!\n\nL'utilisateur peut maintenant profiter de tous les avantages artisans.`);
        }, 100);
      } else {
        await axios.post(
          `${API_BASE_URL}/api/notifications/artisan-requests/${requestId}/reject`,
          { note: note || 'Demande rejetée par le PDG' },
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          }
        );
        
        dispatch(removeRequest(requestId));
        setConfirmModal({ isOpen: false, type: 'reject', requestId: 0, userName: '' });
        
        // Show success message
        setTimeout(() => {
          alert(`✓ Demande de ${userName} rejetée\n\nL'utilisateur restera avec un compte Client standard.`);
        }, 100);
      }
    } catch (error) {
      console.error('Error processing request:', error);
      setConfirmModal({ isOpen: false, type: 'approve', requestId: 0, userName: '' });
      alert('Une erreur est survenue');
    }
  };

  const handleCloseModal = () => {
    setConfirmModal({ isOpen: false, type: 'approve', requestId: 0, userName: '' });
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'À l\'instant';
    if (diffMins < 60) return `Il y a ${diffMins} min`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `Il y a ${diffHours}h`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `Il y a ${diffDays}j`;
  };

  // Don't render if not PDG
  if (!isPDG) return null;

  return (
    <>
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={handleCloseModal}
        onConfirm={handleConfirm}
        title={confirmModal.type === 'approve' ? 'Approuver la demande Artisan' : 'Rejeter la demande Artisan'}
        message={
          confirmModal.type === 'approve'
            ? `Voulez-vous approuver ${confirmModal.userName} comme Artisan/Promoteur?`
            : `Êtes-vous sûr de vouloir rejeter la demande de ${confirmModal.userName}?`
        }
        confirmText={confirmModal.type === 'approve' ? 'Approuver' : 'Rejeter'}
        cancelText="Annuler"
        type={confirmModal.type}
        userName={confirmModal.userName}
        showNoteInput={confirmModal.type === 'reject'}
      />

      <div className="relative">
        {/* Bell Icon with Badge */}
        <button
          onClick={handleBellClick}
          className="relative p-2 text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {count > 0 && (
            <span className="absolute top-0 right-0 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white transform translate-x-1/2 -translate-y-1/2 bg-red-600 rounded-full min-w-[18px]">
              {count > 99 ? '99+' : count}
            </span>
          )}
        </button>

        {/* Dropdown */}
        {showDropdown && (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 z-10"
              onClick={() => setShowDropdown(false)}
            />
            
            {/* Notification Panel */}
            <div className="absolute right-0 z-20 mt-2 w-96 bg-white rounded-lg shadow-lg border border-gray-200 overflow-hidden">
              {/* Header */}
              <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
                <h3 className="text-sm font-semibold text-gray-900">
                  Demandes Artisan/Promoteur
                </h3>
                {count > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {count} {count === 1 ? 'demande en attente' : 'demandes en attente'}
                  </p>
                )}
              </div>

              {/* Content */}
              <div className="max-h-96 overflow-y-auto">
                {loading ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
                    <p className="mt-2 text-sm">Chargement...</p>
                  </div>
                ) : requests.length === 0 ? (
                  <div className="px-4 py-8 text-center text-gray-500">
                    <Bell className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Aucune demande en attente</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {requests.map((request) => (
                      <div
                        key={request.id}
                        className="px-4 py-3 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-start gap-3 mb-3">
                          {/* Avatar */}
                          <div className="flex-shrink-0">
                            {request.avatar_url ? (
                              <img
                                src={request.avatar_url}
                                alt={request.nom_complet}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                                <span className="text-blue-600 font-semibold text-sm">
                                  {request.prenom?.[0]}{request.nom?.[0]}
                                </span>
                              </div>
                            )}
                          </div>

                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {request.nom_complet || `${request.prenom} ${request.nom}`}
                            </p>
                            <p className="text-xs text-gray-500 truncate">
                              {request.email}
                            </p>
                            {request.telephone && (
                              <p className="text-xs text-gray-500">
                                {request.telephone}
                              </p>
                            )}
                            <p className="text-xs text-gray-400 mt-1">
                              {formatTimeAgo(request.created_at)}
                            </p>
                          </div>

                          {/* Badge */}
                          <div className="flex-shrink-0">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                              En attente
                            </span>
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2 ml-13">
                          <button
                            onClick={() => handleApprove(request.id, request.nom_complet || `${request.prenom} ${request.nom}`)}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-green-600 hover:bg-green-700 rounded transition-colors"
                          >
                            Approuver
                          </button>
                          <button
                            onClick={() => handleReject(request.id, request.nom_complet || `${request.prenom} ${request.nom}`)}
                            className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                          >
                            Rejeter
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default NotificationBell;
