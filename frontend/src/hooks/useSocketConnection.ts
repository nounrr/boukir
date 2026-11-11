import { useEffect, useRef } from 'react';
import { useAppSelector, useAppDispatch } from './redux';
import { initializeSocket, disconnectSocket, refreshNotifications } from '../store/api/socketService';

/**
 * Hook to manage Socket.IO connection lifecycle
 * Automatically connects when user is authenticated and disconnects on logout
 */
export function useSocketConnection() {
  const dispatch = useAppDispatch();
  const { token, user, isAuthenticated, passwordChangeRequired } = useAppSelector((state) => state.auth);
  const userRole = user?.role;
  const socketInitialized = useRef(false);

  useEffect(() => {
    // Initialize Socket.IO for every authenticated employee role.
    if (isAuthenticated && !passwordChangeRequired && token && userRole && !socketInitialized.current) {
      console.log('🔌 Initializing socket for PDG user...');
      initializeSocket(token, dispatch, userRole);
      socketInitialized.current = true;
    }

    // Cleanup on logout or unmount
    return () => {
      if (socketInitialized.current) {
        console.log('🔌 Cleaning up socket connection...');
        disconnectSocket();
        socketInitialized.current = false;
      }
    };
  }, [isAuthenticated, passwordChangeRequired, token, userRole, dispatch]);

  // Provide manual refresh function
  const refresh = () => {
    if (token) {
      refreshNotifications(token, dispatch);
    }
  };

  return { refresh };
}
