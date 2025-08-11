import { store } from './index';

// Runtime exports to satisfy ES module loader
// Dummy runtime exports to satisfy ESM loader (not used in code)
// Runtime exports to allow type-only imports in TS
export const RootState = undefined as unknown;
export const AppDispatch = undefined as unknown;
// Export des types pour le store
export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
