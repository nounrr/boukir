import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Provider } from 'react-redux'
import { PersistGate } from 'redux-persist/integration/react'
import { store, persistor } from './store'
import './index.css'
import App from './App.tsx'
import { ToastProvider } from './components/ui/use-toast'

// One-time cleanup: remove any persisted fake data for products/categories
try {
  const cleared = localStorage.getItem('bpukir_fake_cleanup_v1');
  if (!cleared) {
    localStorage.removeItem('bpukir_products');
    localStorage.removeItem('bpukir_categories');
    localStorage.setItem('bpukir_fake_cleanup_v1', 'true');
  }
} catch {}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Provider store={store}>
      <PersistGate loading={null} persistor={persistor}>
        <ToastProvider>
          <App />
        </ToastProvider>
      </PersistGate>
    </Provider>
  </StrictMode>,
)
