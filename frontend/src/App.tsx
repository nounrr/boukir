import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { initializeAuth, logout } from './store/slices/authSlice';
import { setPasswordChangeRequired } from './store/slices/authSlice';
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
// Toutes les pages de route sont chargées à la demande : un import statique ici
// les ferait entrer dans le bundle principal, qui doit être téléchargé et parsé
// avant l'affichage de n'importe quelle page (xlsx/jspdf/recharts inclus).
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const EmployeePage = React.lazy(() => import('./pages/EmployeePage'));
const ClientCollaborationPermissionsPage = React.lazy(() => import('./pages/ClientCollaborationPermissionsPage'));
const EmployeeSelfPage = React.lazy(() => import('./pages/EmployeeSelfPage'));
const EmployeeArchivePage = React.lazy(() => import('./pages/EmployeeArchivePage'));
const EmployeeDocumentsPage = React.lazy(() => import('./pages/EmployeeDocumentsPage'));
const StockDepot2Page = React.lazy(() => import('./pages/StockDepot2Page'));
const ClientsPage = React.lazy(() => import('./pages/ClientsPage'));
const ClientDetailPage = React.lazy(() => import('./pages/ClientsPage').then((m) => ({ default: m.ClientDetailPage })));
const FournisseursPage = React.lazy(() => import('./pages/FournisseursPage'));
const FournisseurDetailPage = React.lazy(() => import('./pages/FournisseursPage').then((m) => ({ default: m.FournisseurDetailPage })));
const ChargesPage = React.lazy(() => import('./pages/ChargesPage'));
const ChargeDetailPage = React.lazy(() => import('./pages/ChargesPage').then((m) => ({ default: m.ChargeDetailPage })));
const GarantiesPage = React.lazy(() => import('./pages/GarantiesPage'));
const ContactArchiverPage = React.lazy(() => import('./pages/ContactArchiverPage'));
const BonCreatePage = React.lazy(() => import('./pages/BonCreatePage'));
const VehiculesPage = React.lazy(() => import('./pages/VehiculesPage'));
const FondCaissePage = React.lazy(() => import('./pages/FondCaissePage'));
const FondCaisseDetailPage = React.lazy(() => import('./pages/FondCaisseDetailPage'));
const CategoriesPage = React.lazy(() => import('./pages/CategoriesPage'));
const CategoryManagementPage = React.lazy(() => import('./pages/CategoryManagementPage'));
const BrandsPage = React.lazy(() => import('./pages/BrandsPage'));
const MaalemCategoriesPage = React.lazy(() => import('./pages/MaalemCategoriesPage'));
const MaalemsPage = React.lazy(() => import('./pages/MaalemsPage'));
const ServicesPage = React.lazy(() => import('./pages/ServicesPage'));
const StatsDetailPage = React.lazy(() => import('./pages/StatsDetailPage'));
const ExcelUploadPage = React.lazy(() => import('./pages/ImportExcelTabs'));
const ExportProducts = React.lazy(() => import('./pages/ExportProducts'));
const ExportContacts = React.lazy(() => import('./pages/ExportContacts'));
const PromoCodesPage = React.lazy(() => import('./pages/PromoCodesPage'));
const HeroSlidesPage = React.lazy(() => import('./pages/HeroSlidesPage'));
const TalonsPage = React.lazy(() => import('./pages/TalonsPage'));
const TalonCaissePage = React.lazy(() => import('./pages/TalonCaissePage'));
const ArchivedProductsPage = React.lazy(() => import('./pages/ArchivedProductsPage'));
const ProfilePage = React.lazy(() => import('./pages/ProfilePage'));
const EmployeeSalariesPage = React.lazy(() => import('./pages/EmployeeSalariesPage'));
const SalairesPage = React.lazy(() => import('./pages/SalairesPage'));
const AuditPage = React.lazy(() => import('./pages/AuditPage'));
const AccessSchedulePage = React.lazy(() => import('./pages/AccessSchedulePage'));
const MultiDayAccessSchedulePage = React.lazy(() => import('./pages/MultiDayAccessSchedulePage'));
const ChiffreAffairesPage = React.lazy(() => import('./pages/ChiffreAffairesPage'));
const ChiffreAffairesDetailPage = React.lazy(() => import('./pages/ChiffreAffairesDetailPage'));
const WhatsAppTestPage = React.lazy(() => import('./pages/WhatsAppTestPage'));
const ChangePasswordPage = React.lazy(() => import('./pages/ChangePasswordPage'));
const ProductNameCorrectionsPage = React.lazy(() => import('./pages/ProductNameCorrectionsPage'));
const UiSettingsPage = React.lazy(() => import('./pages/UiSettingsPage'));
const SolverPrixAchatPage = React.lazy(() => import('./pages/SolverPrixAchatPage'));
const SalePriceCorrectionsPage = React.lazy(() => import('./pages/SalePriceCorrectionsPage'));

// Les pages les plus volumineuses sont chargées uniquement lorsqu'elles sont ouvertes.
const StockPage = React.lazy(() => import('./pages/StockPage'));
const SlowMovingStockPage = React.lazy(() => import('./pages/SlowMovingStockPage'));
const ContactsPage = React.lazy(() => import('./pages/ContactsPage'));
const BonsPage = React.lazy(() => import('./pages/BonsPage'));
const CaissePage = React.lazy(() => import('./pages/CaissePage'));
const ReportsPage = React.lazy(() => import('./pages/ReportsPage'));
const InventoryPage = React.lazy(() => import('./pages/InventoryPage'));
const ProductsTranslatePage = React.lazy(() => import('./pages/ProductsTranslatePage'));
const ProductPhotoStudioPage = React.lazy(() => import('./pages/ProductPhotoStudioPage'));
const PaymentPhoneCapturePage = React.lazy(() => import('./pages/PaymentPhoneCapturePage'));
const RemisesPage = React.lazy(() => import('./pages/RemisesPage'));

const ManualAccessCheckContext = React.createContext<(() => void) | undefined>(undefined);

// Composant Layout avec accès aux fonctions de monitoring
const LayoutWithAccessCheck: React.FC<{ children: React.ReactNode; tabletCompact?: boolean }> = ({ children, tabletCompact }) => {
  const manualAccessCheck = React.useContext(ManualAccessCheckContext);
  return <Layout manualAccessCheck={manualAccessCheck} tabletCompact={tabletCompact}>{children}</Layout>;
};

// Composant pour initialiser l'app
const AppContent: React.FC = () => {
  const dispatch = useAppDispatch();
  const { isAuthenticated, user } = useAuth();

  // Initialize Socket.IO connection for PDG users
  useSocketConnection();

  // Monitoring des horaires d'accès avec popup d'avertissement
  const { 
    showWarning, 
    timeRemaining,
    warningMessage,
    onWarningClose, 
    onWarningConfirm,
    manualAccessCheck
  } = useAccessScheduleMonitor();

  useEffect(() => {
    dispatch(initializeAuth());
  }, [dispatch]);

  // Validate token with backend when authenticated; if invalid, logout
  const { data: meData, isError: tokenInvalid } = useValidateTokenQuery(undefined, { skip: !isAuthenticated });
  useEffect(() => {
    if (tokenInvalid) {
      dispatch(logout());
    }
  }, [tokenInvalid, dispatch]);

  // Sync weekly password policy from backend
  useEffect(() => {
    if (!isAuthenticated) return;
    if (meData && typeof (meData as any).password_change_required !== 'undefined') {
      dispatch(setPasswordChangeRequired(Boolean((meData as any).password_change_required)));
    }
  }, [isAuthenticated, meData, dispatch]);

  return (
    <ManualAccessCheckContext.Provider value={manualAccessCheck}>
      <Router>
        <React.Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-600">Chargement…</div>}>
          <Routes>
          <Route path="/payment-phone-capture/:token" element={<PaymentPhoneCapturePage />} />
          {/* Route de login */}
          <Route 
            path="/login" 
            element={
              isAuthenticated ? <Navigate to={user?.role === 'ChefChauffeur' ? '/bons' : '/dashboard'} replace /> : <LoginPage />
            } 
          />

          <Route
            path="/change-password"
            element={
              <ProtectedRoute>
                <ChangePasswordPage />
              </ProtectedRoute>
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
            <ProtectedRoute requiredRoles={['PDG', 'Employé']}>
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
          path="/salaires"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <SalairesPage />
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
          path="/employees/client-collaboration-permissions"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <ClientCollaborationPermissionsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/slow-moving-stock"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck tabletCompact>
                <SlowMovingStockPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/stock-faible-rotation"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <Navigate to="/slow-moving-stock" replace />
            </ProtectedRoute>
          }
        />

        <Route
          path="/stock-depot-2"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <StockDepot2Page />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/products/translate"
          element={
            <ProtectedRoute requiredRoles={['PDG', 'Manager', 'ManagerPlus']}>
              <LayoutWithAccessCheck>
                <ProductsTranslatePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/product-photos"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ProductPhotoStudioPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/products/name-corrections"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <ProductNameCorrectionsPage />
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
          path="/clients"
          element={
            <ProtectedRoute forbiddenRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <ClientsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/clients/:id"
          element={
            <ProtectedRoute forbiddenRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <ClientDetailPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/fournisseurs"
          element={
            <ProtectedRoute forbiddenRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <FournisseursPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/charges"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <ChargesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/garanties"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <GarantiesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/charges/:id"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <ChargeDetailPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/fournisseurs/:id"
          element={
            <ProtectedRoute forbiddenRoles={['Employé']}>
              <LayoutWithAccessCheck>
                <FournisseurDetailPage />
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

        {/* Page dédiée à la création d'un bon/avoir (sortie du modal pour éviter le lag) */}
        <Route
          path="/bons/create/:type"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <BonCreatePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/bons/edit/:type/:id"
          element={
            <ProtectedRoute>
              <LayoutWithAccessCheck>
                <BonCreatePage />
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
          path="/maalems"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <MaalemsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/maalem-categories"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <MaalemCategoriesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/services"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <ServicesPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/vehicules"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager','ManagerPlus','ChefChauffeur']}>
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
          path="/settings/ui"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <UiSettingsPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/fond-caisse"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <FondCaissePage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/fond-caisse/:date"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <FondCaisseDetailPage />
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
            <ProtectedRoute requiredRoles={['PDG', 'Manager', 'ManagerPlus']}>
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
          path="/solver-prix-achat"
          element={
            <ProtectedRoute requiredRoles={['PDG','Manager','ManagerPlus','ChefChauffeur','Employé']}>
              <LayoutWithAccessCheck>
                <SolverPrixAchatPage />
              </LayoutWithAccessCheck>
            </ProtectedRoute>
          }
        />

        <Route
          path="/products/sale-price-corrections"
          element={
            <ProtectedRoute requiredRoles={['PDG']}>
              <LayoutWithAccessCheck>
                <SalePriceCorrectionsPage />
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
        </React.Suspense>
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
    </ManualAccessCheckContext.Provider>
  );
};

function App() {
  return <AppContent />;
}

export default App;
