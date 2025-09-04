import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import { initializeAuth, logout } from './store/slices/authSlice';
import { useAppDispatch, useAuth } from './hooks/redux';
import { useValidateTokenQuery } from './store/api/authApi';

// Composants
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';

// Pages
import DashboardPage from './pages/DashboardPage';
import EmployeePage from './pages/EmployeePage';
import EmployeeDocumentsPage from './pages/EmployeeDocumentsPage';
import StockPage from './pages/StockPage';
import ContactsPage from './pages/ContactsPage';
import BonsPage from './pages/BonsPage';
import VehiculesPage from './pages/VehiculesPage';
import CaissePage from './pages/CaissePage';
import ReportsPage from './pages/ReportsPage';
import CategoriesPage from './pages/CategoriesPage';
import StatsDetailPage from './pages/StatsDetailPage';
import ExcelUploadPage from './pages/ImportExcelTabs';
import ExportProducts from './pages/ExportProducts';
import ExportContacts from './pages/ExportContacts';
import RemisesPage from './pages/RemisesPage';
import TalonsPage from './pages/TalonsPage';
import TalonCaissePage from './pages/TalonCaissePage';
import ArchivedProductsPage from './pages/ArchivedProductsPage';
import ProfilePage from './pages/ProfilePage';
import EmployeeSalariesPage from './pages/EmployeeSalariesPage';
import AuditPage from './pages/AuditPage';
import ChiffreAffairesPage from './pages/ChiffreAffairesPage';

// Composant pour initialiser l'app
const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAuth();

  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  // Validate token with backend when authenticated; if invalid, logout
  const { isError: tokenInvalid } = useValidateTokenQuery(undefined, { skip: !isAuthenticated });
  useEffect(() => {
    if (tokenInvalid) {
      dispatch(logout());
    }
  }, [tokenInvalid, dispatch]);

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
          path="/employees/:id/documents"
          element={
            <ProtectedRoute>
              <Layout>
                <EmployeeDocumentsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees/:id/salaries"
          element={
            <ProtectedRoute>
              <Layout>
                <EmployeeSalariesPage />
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
          path="/talons"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager']}>
              <Layout>
                <TalonsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/talon-caisse"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager']}>
              <Layout>
                <TalonCaissePage />
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
          path="/chiffre-affaires"
          element={
            <ProtectedRoute>
              <Layout>
                <ChiffreAffairesPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/remises"
          element={
            <ProtectedRoute>
              <Layout>
                <RemisesPage />
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

        <Route
          path="/export/products"
          element={
            <ProtectedRoute>
              <Layout>
                <ExportProducts />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/export/contacts"
          element={
            <ProtectedRoute>
              <Layout>
                <ExportContacts />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/products/archived"
          element={
            <ProtectedRoute>
              <Layout>
                <ArchivedProductsPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/audit"
          element={
            <ProtectedRoute requiredRole="PDG">
              <Layout>
                <AuditPage />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <Layout>
                <ProfilePage />
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
