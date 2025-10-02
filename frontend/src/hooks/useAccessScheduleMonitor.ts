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
  const timeCheckRef = useRef<number | null>(null);
  const warningShownRef = useRef<boolean>(false);
  const userSchedulesRef = useRef<any[]>([]);
  
  const [accessState, setAccessState] = useState<AccessMonitorState>({
    showWarning: false,
    warningMessage: '',
    timeRemaining: 0,
    endTime: null
  });
  
  // Vérifier l'accès très fréquemment pour déconnexion immédiate à l'heure de fin
  const {
    data: accessResult,
    error: accessError,
    refetch: checkAccess
  } = useCheckAccessQuery(undefined, {
    skip: !isAuthenticated || !user,
    pollingInterval: 3000, // 3 secondes pour déconnexion immédiate
  });



  const handleWarningClose = () => {
    setAccessState(prev => ({ ...prev, showWarning: false }));
    dispatch(logout());
  };

  // Fonction pour vérifier si l'utilisateur est dans ses horaires autorisés
  const isWithinAllowedSchedule = () => {
    if (!user || userSchedulesRef.current.length === 0) return true;
    
    const now = new Date();
    const currentDay = now.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
    const dayOfWeek = currentDay === 0 ? 7 : currentDay; // Convertir pour notre système (1-7)
    const currentTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    
    // Vérifier si l'utilisateur a au moins un horaire actif pour aujourd'hui
    const todaySchedules = userSchedulesRef.current.filter(schedule => 
      schedule.is_active && schedule.days_of_week.includes(dayOfWeek)
    );
    
    if (todaySchedules.length === 0) {
      return false; // Aucun horaire pour aujourd'hui
    }
    
    // Vérifier si l'heure actuelle est dans une plage autorisée
    for (const schedule of todaySchedules) {
      if (currentTime >= schedule.start_time && currentTime <= schedule.end_time) {
        return true;
      }
    }
    
    return false; // Heure actuelle en dehors des plages autorisées
  };

  // Fonction pour forcer la déconnexion immédiate si hors horaires
  const checkTimeBasedAccess = () => {
    if (!isAuthenticated || !user) return;
    
    if (!isWithinAllowedSchedule()) {
      console.log('Déconnexion forcée - heure de fin atteinte');
      
      // Déconnexion immédiate sans popup d'avertissement
      setAccessState({
        showWarning: true,
        warningMessage: 'Votre session a expiré. Vous avez été déconnecté automatiquement.',
        timeRemaining: 5, // 5 secondes pour voir le message
        endTime: new Date()
      });
      
      // Déconnexion forcée après 3 secondes
      setTimeout(() => {
        dispatch(logout());
      }, 3000);
    }
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
            
            // Afficher le popup de fermeture avec déconnexion immédiate
            setAccessState({
              showWarning: true,
              warningMessage: `Votre session a expiré: ${errorData.data.reason}. Déconnexion automatique en cours...`,
              timeRemaining: 5, // 5 secondes avant fermeture forcée
              endTime: new Date()
            });
            
            // Déconnexion automatique après 3 secondes
            setTimeout(() => {
              dispatch(logout());
            }, 3000);
          }
        } else {
          // Accès autorisé - Réinitialiser le flag d'avertissement si l'accès est OK
          warningShownRef.current = false;
        }
      } catch (error) {
        console.error('Erreur lors de la vérification d\'accès:', error);
      }
    };

    // Vérifier immédiatement
    verifyAccess();

    // Puis vérifier toutes les 3 secondes pour une déconnexion immédiate
    intervalRef.current = window.setInterval(verifyAccess, 3000);

    // Vérification temps réel toutes les 5 secondes pour déconnexion immédiate si hors horaires
    timeCheckRef.current = window.setInterval(checkTimeBasedAccess, 5000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (timeCheckRef.current) {
        clearInterval(timeCheckRef.current);
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
          warningMessage: `Accès refusé: ${errorData.data.reason}. Déconnexion automatique en cours...`,
          timeRemaining: 5,
          endTime: new Date()
        });
        
        // Déconnexion automatique après 3 secondes
        setTimeout(() => {
          dispatch(logout());
        }, 3000);
      }
    }
  }, [accessError, isAuthenticated]);

  // Fonction pour vérifier manuellement l'accès et afficher le popup si nécessaire
  const manualAccessCheck = async () => {
    if (!isAuthenticated || !user) return;

    try {
      const result = await checkAccess();
      
      if (result.error) {
        const errorData = result.error as any;
        
        // Si l'accès est refusé pour cause d'horaire
        if (errorData?.data?.access_denied && 
            errorData?.data?.error_type === 'ACCESS_SCHEDULE_RESTRICTION') {
          
          console.log('Vérification manuelle - accès refusé:', errorData.data.reason);
          
          // Afficher le popup de vérification manuelle
          setAccessState({
            showWarning: true,
            warningMessage: `Accès vérifié: ${errorData.data.reason}`,
            timeRemaining: 60, // 1 minute pour lire le message
            endTime: new Date(Date.now() + 60000)
          });
        }
      } else {
        // Accès autorisé - afficher popup de confirmation
        setAccessState({
          showWarning: true,
          warningMessage: 'Accès vérifié: Vous êtes autorisé à accéder au système.',
          timeRemaining: 60, // 1 minute pour lire le message
          endTime: new Date(Date.now() + 60000)
        });
      }
    } catch (error) {
      console.error('Erreur lors de la vérification manuelle d\'accès:', error);
    }
  };

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
    },
    // Fonction pour vérification manuelle
    manualAccessCheck
  };
};