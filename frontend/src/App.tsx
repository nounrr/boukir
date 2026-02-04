import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Provider } from 'react-redux';
import { store } from './store';
import { initializeAuth, logout } from './store/slices/authSlice';
import { useAppDispatch, useAuth } from './hooks/redux';
import { useValidateTokenQuery } from './store/api/authApi';
import { useAccessScheduleMonitor } from './hooks/useAccessScheduleMonitor';
import { useSocketConnection } from './hooks/useSocketConnection';

// Composants
import LoginPage from './components/auth/LoginPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import Layout from './components/layout/Layout';
import { AccessWarningPopup } from './components/AccessWarningPopup';

// Pages
import DashboardPage from './pages/DashboardPage';
import EmployeePage from './pages/EmployeePage';
import EmployeeSelfPage from './pages/EmployeeSelfPage';
import EmployeeArchivePage from './pages/EmployeeArchivePage';
import EmployeeDocumentsPage from './pages/EmployeeDocumentsPage';
import StockPage from './pages/StockPage';
import ContactsPage from './pages/ContactsPage';
import ContactArchiverPage from './pages/ContactArchiverPage';
import BonsPage from './pages/BonsPage';
import VehiculesPage from './pages/VehiculesPage';
import CaissePage from './pages/CaissePage';
import ReportsPage from './pages/ReportsPage';
import CategoriesPage from './pages/CategoriesPage';
import CategoryManagementPage from './pages/CategoryManagementPage';
import BrandsPage from './pages/BrandsPage';
import StatsDetailPage from './pages/StatsDetailPage';
import ExcelUploadPage from './pages/ImportExcelTabs';
import ExportProducts from './pages/ExportProducts';
import ExportContacts from './pages/ExportContacts';
import RemisesPage from './pages/RemisesPage';
import PromoCodesPage from './pages/PromoCodesPage';
import HeroSlidesPage from './pages/HeroSlidesPage';
import TalonsPage from './pages/TalonsPage';
import TalonCaissePage from './pages/TalonCaissePage';
import ArchivedProductsPage from './pages/ArchivedProductsPage';
import ProfilePage from './pages/ProfilePage';
import EmployeeSalariesPage from './pages/EmployeeSalariesPage';
import AuditPage from './pages/AuditPage';
import AccessSchedulePage from './pages/AccessSchedulePage';
import MultiDayAccessSchedulePage from './pages/MultiDayAccessSchedulePage';
import ChiffreAffairesPage from './pages/ChiffreAffairesPage';
import ChiffreAffairesDetailPage from './pages/ChiffreAffairesDetailPage';
import WhatsAppTestPage from './pages/WhatsAppTestPage';
import InventoryPage from './pages/InventoryPage';

// Composant Layout avec accès aux fonctions de monitoring
const LayoutWithAccessCheck: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { manualAccessCheck } = useAccessScheduleMonitor();
  return <Layout manualAccessCheck={manualAccessCheck}>{children}</Layout>;
};

// Composant pour initialiser l'app
const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAuth();

  // Initialize Socket.IO connection for PDG users
  useSocketConnection();

  // Monitoring des horaires d'accès avec popup d'avertissement
  const { 
    showWarning, 
    timeRemaining,
    warningMessage,
    onWarningClose, 
    onWarningConfirm
  } = useAccessScheduleMonitor();

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
    <>
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
              <LayoutWithAccessCheck>
                <DashboardPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees"
          element={
            <ProtectedRoute requiredRoles={['PDG', 'ManagerPlus']}>
              <LayoutWithAccessCheck>
                <EmployeePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employee/self"
          element={
            <ProtectedRoute requiredRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <EmployeeSelfPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees/archive"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <EmployeeArchivePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees/:id/documents"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <EmployeeDocumentsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/employees/:id/salaries"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <EmployeeSalariesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/access-schedules"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <AccessSchedulePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/access-schedules-multi"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <MultiDayAccessSchedulePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/stock"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <StockPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts"
          element={
            <ProtectedRoute forbiddenRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <ContactsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/contacts-archiver"
          element={
            <ProtectedRoute forbiddenRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <ContactArchiverPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bons"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <BonsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/categories"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <CategoriesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/category-management"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <CategoryManagementPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/brands"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <BrandsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/vehicules"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager','ManagerPlus']}>
              <LayoutWithAccessCheck>
                <VehiculesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/talons"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager','ManagerPlus']}>
              <LayoutWithAccessCheck>
                <TalonsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/talon-caisse"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager','ManagerPlus']}>
              <LayoutWithAccessCheck>
                <TalonCaissePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/caisse"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <CaissePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute forbiddenRoles={['ManagerPlus']}>
              <LayoutWithAccessCheck>
                <ReportsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/chiffre-affaires"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ChiffreAffairesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/chiffre-affaires/detail/:date"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ChiffreAffairesDetailPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/inventaire"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <InventoryPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/whatsapp-test"
          element={
            <ProtectedRoute requiredRoles={['PDG']}> {/* restreint si besoin */}
              <LayoutWithAccessCheck>
                <WhatsAppTestPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

          <Route
            path="/promo-codes"
            element={
              <ProtectedRoute requiredRoles={["PDG", "Manager", "ManagerPlus"]}>
                <LayoutWithAccessCheck>
                  <PromoCodesPage />
                </LayoutWithAccessCheck>
              </ProtectedRoute>
            }
          />

          {/* Backward-compatible alias */}
          <Route
            path="/coupons"
            element={<Navigate to="/promo-codes" replace />}
          />

          <Route
            path="/hero-slides"
            element={
              <ProtectedRoute requiredRoles={["PDG", "Manager", "ManagerPlus"]}>
                <LayoutWithAccessCheck>
                  <HeroSlidesPage />
                </LayoutWithAccessCheck>
              </ProtectedRoute>
            }
          />

        <Route
          path="/remises"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <RemisesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports/details"
          element={
            <ProtectedRoute forbiddenRoles={['ManagerPlus']}>
              <LayoutWithAccessCheck>
                <StatsDetailPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/import"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ExcelUploadPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/export/products"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ExportProducts />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/export/contacts"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ExportContacts />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/products/archived"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ArchivedProductsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/audit"
          element={
            <ProtectedRoute requiredRole="PDG">
              <LayoutWithAccessCheck>
                <AuditPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/profile"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ProfilePage />
              </LayoutWithAccessCheck>
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
    
    {/* Popup d'avertissement d'expiration d'accès */}
    {showWarning && (
      <AccessWarningPopup
        isOpen={showWarning}
        message={warningMessage || "Votre session va expirer à cause des horaires d'accès configurés."}
        timeRemaining={timeRemaining}
        onConfirm={onWarningConfirm}
        onExtend={onWarningClose}
      />
    )}
  </>
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
