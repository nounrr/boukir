import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import { initializeAuth } from './store/slices/authSlice';
import { useAppDispatch, useAuth } from './hooks/redux';

// Composants
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';

// Pages
import DashboardPage from './pages/DashboardPage';
import EmployeePage from './pages/EmployeePage';
import StockPage from './pages/StockPage';
import ContactsPage from './pages/ContactsPage';
import BonsPage from './pages/BonsPage';
import VehiculesPage from './pages/VehiculesPage';
import CaissePage from './pages/CaissePage';
import ReportsPage from './pages/ReportsPage';
import CategoriesPage from './pages/CategoriesPage';
import StatsDetailPage from './pages/StatsDetailPage';
import ExcelUploadPage from './pages/ExcelUploadPage';

// Composant pour initialiser l'app
const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  return (
    <Router>
      <Routes>
        {/* Route de login */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />
          } 
        />
        
        {/* Routes protégées */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <DashboardPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees"
          element={
            <ProtectedRoute>
              <Layout>
                <EmployeePage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <Layout>
                <StockPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts"
          element={
            <ProtectedRoute>
              <Layout>
                <ContactsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bons"
          element={
            <ProtectedRoute>
              <Layout>
                <BonsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/categories"
          element={
            <ProtectedRoute>
              <Layout>
                <CategoriesPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/vehicules"
          element={
            <ProtectedRoute>
              <Layout>
                <VehiculesPage />
              </Layout>
            </ProtectedRoute>
          }
        />


        <Route
          path="/caisse"
          element={
            <ProtectedRoute>
              <Layout>
                <CaissePage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <Layout>
                <ReportsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports/details"
          element={
            <ProtectedRoute>
              <Layout>
                <StatsDetailPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/import"
          element={
            <ProtectedRoute>
              <Layout>
                <ExcelUploadPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* Route par défaut */}
        <Route
          path="/"
          element={<Navigate to="/dashboard" replace />}
        />

        {/* Route 404 */}
        <Route
          path="*"
          element={
            <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
              <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white rounded-lg shadow p-6 text-center">
                  <h2 className="text-2xl font-bold text-gray-900 mb-4">
                    Page non trouvée
                  </h2>
                  <p className="text-gray-600">
                    La page que vous cherchez n'existe pas.
                  </p>
                </div>
              </div>
            </div>
          }
        />
      </Routes>
    </Router>
  );
};

function App() {
  return (
    <Provider store={store}>
      <AppContent />
    </Provider>
  );
}

export default App;
