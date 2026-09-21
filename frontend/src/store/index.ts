import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import { api } from './api/apiSlice';
import authReducer, { loginSuccess, logout } from './slices/authSlice';
import { persistStore, persistReducer } from 'redux-persist';
import storage from 'redux-persist/lib/storage'; // localStorage
import { combineReducers } from 'redux';

// Import des APIs pour les endpoints
import './api/authApi';
import './api/employeesApi.server';
import './api/employeeArchiveApi';
import './api/productsApi';
import './api/categoriesApi';
import './api/maalemCategoriesApi';
import './api/servicesApi';
import './api/contactsApi';
import './api/contactGroupsApi';
import './api/bonsApi';
import './api/paymentsApi';
import './api/talonsApi';
import './api/accessSchedulesApi';
import './api/absencesApi';
import './api/uiSettingsApi';
import './api/pricePurchaseSolverApi';

import productsReducer from './slices/productsSlice';
import categoriesReducer from './slices/categoriesSlice';
import contactsReducer from './slices/contactsSlice';
import bonsReducer from './slices/bonsSlice';
import paymentsReducer from './slices/paymentsSlice';
import notificationsReducer from './slices/notificationsSlice';

const persistConfig = {
  key: 'root',
  storage,
  whitelist: ['auth', 'products', 'categories', 'contacts', 'bons', 'payments'], // On persiste l'auth et nos données
};

const combinedReducer = combineReducers({
  api: api.reducer,
  auth: authReducer,
  products: productsReducer,
  categories: categoriesReducer,
  contacts: contactsReducer,
  bons: bonsReducer,
  payments: paymentsReducer,
  notifications: notificationsReducer,
});

// RTK Query keys /auth/me without the token. Never reuse a previous session's
// cached password policy (or other user-specific data) after logout/login.
const rootReducer: typeof combinedReducer = (state, action) => {
  if (logout.match(action) || loginSuccess.match(action)) {
    return combinedReducer(state ? { ...state, api: undefined } : state, action);
  }
  return combinedReducer(state, action);
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [
          'persist/PERSIST',
          'persist/REHYDRATE',
          'persist/PURGE',
        ],
      },
    }).concat(api.middleware),
});

export const persistor = persistStore(store);

// Configuration des listeners pour RTK Query
setupListeners(store.dispatch);
// Export des types pour le store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
