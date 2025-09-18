import { useEffect, useRef, useState } from 'react';
import { useAppDispatch, useAuth } from './redux';
import { logout } from '../store/slices/authSlice';
import { useCheckAccessQuery } from '../store/api/authApi';

interface AccessMonitorState {
  showWarning: boolean;
  warningMessage: string;
  timeRemaining: number;
  endTime: Date | null;
}

/**
 * Hook pour vérifier périodiquement l'accès de l'utilisateur
 * et le déconnecter automatiquement si son horaire d'accès expire
 */
export const useAccessScheduleMonitor = () => {
  const dispatch = useAppDispatch();
  const { user, isAuthenticated } = useAuth();
  const intervalRef = useRef<number | null>(null);
  const warningShownRef = useRef<boolean>(false);
  
  const [accessState, setAccessState] = useState<AccessMonitorState>({
    showWarning: false,
    warningMessage: '',
    timeRemaining: 0,
    endTime: null
  });
  
  // Vérifier l'accès toutes les 30 secondes
  const {
    data: accessResult,
    error: accessError,
    refetch: checkAccess
  } = useCheckAccessQuery(undefined, {
    skip: !isAuthenticated || !user,
    pollingInterval: 30000, // 30 secondes
  });

  // Calculer le temps restant jusqu'à la fin d'accès
  const calculateTimeRemaining = () => {
    const now = new Date();
    const currentTime = now.toTimeString().slice(0, 5); // HH:MM
    const currentDay = now.getDay() === 0 ? 7 : now.getDay(); // Convertir dimanche de 0 à 7
    
    // Récupérer les horaires de l'utilisateur depuis l'API
    // (Cette logique pourrait être améliorée avec une API dédiée)
    
    // Pour l'instant, utilisons une heure de fin par défaut (à améliorer)
    const endTime = "19:00"; // À remplacer par la vraie heure de fin de l'utilisateur
    const [endHour, endMinute] = endTime.split(':').map(Number);
    
    const endDate = new Date();
    endDate.setHours(endHour, endMinute, 0, 0);
    
    const timeRemaining = endDate.getTime() - now.getTime();
    return Math.max(0, Math.floor(timeRemaining / 1000)); // en secondes
  };

  const handleWarningClose = () => {
    setAccessState(prev => ({ ...prev, showWarning: false }));
    dispatch(logout());
  };

  useEffect(() => {
    if (!isAuthenticated || !user) {
      return;
    }

    // Fonction pour vérifier l'accès
    const verifyAccess = async () => {
      try {
        const result = await checkAccess();
        
        if (result.error) {
          const errorData = result.error as any;
          
          // Si l'accès est refusé pour cause d'horaire
          if (errorData?.data?.access_denied && 
              errorData?.data?.error_type === 'ACCESS_SCHEDULE_RESTRICTION') {
            
            console.log('Accès expiré - déconnexion automatique:', errorData.data.reason);
            
            // Afficher le popup de fermeture
            setAccessState({
              showWarning: true,
              warningMessage: `Votre accès a expiré: ${errorData.data.reason}`,
              timeRemaining: 10, // 10 secondes avant fermeture forcée
              endTime: new Date()
            });
          }
        } else {
          // Accès autorisé - vérifier s'il faut afficher l'avertissement
          const timeRemaining = calculateTimeRemaining();
          const warningThreshold = 5 * 60; // 5 minutes en secondes
          
          if (timeRemaining <= warningThreshold && timeRemaining > 0 && !warningShownRef.current) {
            warningShownRef.current = true;
            setAccessState({
              showWarning: true,
              warningMessage: `Votre session va se terminer dans ${Math.ceil(timeRemaining / 60)} minutes selon votre horaire d'accès.`,
              timeRemaining,
              endTime: new Date(Date.now() + timeRemaining * 1000)
            });
          }
        }
      } catch (error) {
        console.error('Erreur lors de la vérification d\'accès:', error);
      }
    };

    // Vérifier immédiatement
    verifyAccess();

    // Puis vérifier toutes les 30 secondes
    intervalRef.current = window.setInterval(verifyAccess, 30000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isAuthenticated, user, checkAccess, dispatch]);

  // Gérer les erreurs d'accès en temps réel
  useEffect(() => {
    if (accessError && isAuthenticated) {
      const errorData = accessError as any;
      
      if (errorData?.data?.access_denied && 
          errorData?.data?.error_type === 'ACCESS_SCHEDULE_RESTRICTION') {
        
        console.log('Accès refusé détecté - déconnexion:', errorData.data.reason);
        
        setAccessState({
          showWarning: true,
          warningMessage: `Accès refusé: ${errorData.data.reason}`,
          timeRemaining: 10,
          endTime: new Date()
        });
      }
    }
  }, [accessError, isAuthenticated]);

  return {
    accessResult,
    accessError,
    isMonitoring: isAuthenticated && !!user,
    // Nouveaux états pour le popup
    showWarning: accessState.showWarning,
    warningMessage: accessState.warningMessage,
    timeRemaining: accessState.timeRemaining,
    onWarningClose: handleWarningClose,
    onWarningConfirm: () => {
      setAccessState(prev => ({ ...prev, showWarning: false }));
      dispatch(logout());
    }
  };
};