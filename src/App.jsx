import { useState, useEffect } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import Sidebar from './components/Sidebar'
import ImpersonationBanner from './components/ImpersonationBanner'
import Dashboard from './pages/Dashboard'
import Devices from './pages/Devices'
import Broadcast from './pages/Broadcast'
import AutoReply from './pages/AutoReply'
import Webhook from './pages/Webhook'
import Contacts from './pages/Contacts'
import MessageLogs from './pages/MessageLogs'
import Settings from './pages/Settings'
import ApiDocs from './pages/ApiDocs'
// N8nTutorial - DELETED
import Login from './pages/Login'
import Register from './pages/Register'
import SmmPanels from './pages/SmmPanels'
import PanelConnections from './pages/PanelConnections'
import Orders from './pages/Orders'
import ProviderGroups from './pages/ProviderGroups'
import Wallet from './pages/Wallet'
import Invoices from './pages/Invoices'
import Reports from './pages/Reports'
import TelegramBots from './pages/TelegramBots'
import CommandTemplates from './pages/CommandTemplates'
import BotSettings from './pages/BotSettings'
import KeywordResponses from './pages/KeywordResponses'
import UserMappings from './pages/UserMappings'
import Subscriptions from './pages/Subscriptions'
import Tickets from './pages/Tickets'
import LandingPage from './pages/LandingPage'
import ResponseTemplates from './pages/ResponseTemplates'
import ProviderForwarding from './pages/ProviderForwarding'
import SystemBots from './pages/SystemBots'
import MyStaff from './pages/MyStaff'
import ActivityLogs from './pages/ActivityLogs'
import Watermarks from './pages/Watermarks'
import MarketingIntervals from './pages/MarketingIntervals'
import SupportGroups from './pages/SupportGroups'
import ProviderAliases from './pages/ProviderAliases'
import './styles/landing.css'
// Admin Pages
import UserManagement from './pages/admin/UserManagement'
import StaffManagement from './pages/admin/StaffManagement'
import SystemSettings from './pages/admin/SystemSettings'
import PaymentManagement from './pages/admin/PaymentManagement'
import PaymentSettings from './pages/admin/PaymentSettings'
import VoucherManagement from './pages/admin/VoucherManagement'
import CreditPackages from './pages/admin/CreditPackages'
import ContactBackups from './pages/admin/ContactBackups'
import SystemBotManagement from './pages/admin/SystemBotManagement'
import AdminDashboard from './pages/admin/AdminDashboard'
import EmailSettings from './pages/admin/EmailSettings'
import FonepayManagement from './pages/admin/FonepayManagement'
import DefaultCharges from './pages/admin/DefaultCharges'
import './index.css'


// Protected Route Component
const ProtectedRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
};

// Admin Route Component (requires ADMIN or MASTER_ADMIN role)
const AdminRoute = ({ children }) => {
  const token = localStorage.getItem('token');
  const userStr = localStorage.getItem('user');
  const location = useLocation();

  if (!token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  let user = null;
  try {
    user = userStr ? JSON.parse(userStr) : null;
  } catch (e) {
    localStorage.removeItem('user');
  }
  if (!user || !['ADMIN', 'MASTER_ADMIN'].includes(user.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function AppContent() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const location = useLocation();
  const token = localStorage.getItem('token');

  // Hide sidebar on login, register, and landing pages
  const isAuthPage = ['/login', '/register', '/'].includes(location.pathname);
  const isLandingPage = location.pathname === '/';
  const showSidebar = token && !isAuthPage;

  const toggleSidebar = () => {
    setSidebarCollapsed(!sidebarCollapsed)
  }

  return (
    <div className="app-layout">
      <ImpersonationBanner />
      {showSidebar && <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />}
      <main className={`main-content ${sidebarCollapsed ? 'collapsed' : ''} ${!showSidebar ? 'full-width' : ''}`}>
        <Routes>
          {/* Public Routes */}
          <Route path="/" element={token ? <Navigate to="/dashboard" replace /> : <LandingPage />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected Routes */}
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/devices" element={<ProtectedRoute><Devices /></ProtectedRoute>} />
          <Route path="/telegram" element={<ProtectedRoute><TelegramBots /></ProtectedRoute>} />
          <Route path="/smm-panels" element={<ProtectedRoute><SmmPanels /></ProtectedRoute>} />
          <Route path="/panel-connections" element={<ProtectedRoute><PanelConnections /></ProtectedRoute>} />
          <Route path="/orders" element={<ProtectedRoute><Orders /></ProtectedRoute>} />
          <Route path="/provider-groups" element={<ProtectedRoute><ProviderGroups /></ProtectedRoute>} />
          <Route path="/command-templates" element={<ProtectedRoute><CommandTemplates /></ProtectedRoute>} />
          <Route path="/wallet" element={<ProtectedRoute><Wallet /></ProtectedRoute>} />
          <Route path="/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
          <Route path="/reports" element={<ProtectedRoute><Reports /></ProtectedRoute>} />
          <Route path="/broadcast" element={<ProtectedRoute><Broadcast /></ProtectedRoute>} />
          <Route path="/auto-reply" element={<ProtectedRoute><AutoReply /></ProtectedRoute>} />
          <Route path="/webhook" element={<ProtectedRoute><Webhook /></ProtectedRoute>} />
          <Route path="/contacts" element={<ProtectedRoute><Contacts /></ProtectedRoute>} />
          <Route path="/logs" element={<ProtectedRoute><MessageLogs /></ProtectedRoute>} />
          <Route path="/api-docs" element={<ProtectedRoute><ApiDocs /></ProtectedRoute>} />
          {/* n8n-tutorial route - DELETED */}
          <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />
          <Route path="/bot-settings" element={<ProtectedRoute><BotSettings /></ProtectedRoute>} />
          <Route path="/keyword-responses" element={<ProtectedRoute><KeywordResponses /></ProtectedRoute>} />
          <Route path="/user-mappings" element={<ProtectedRoute><UserMappings /></ProtectedRoute>} />
          <Route path="/subscriptions" element={<ProtectedRoute><Subscriptions /></ProtectedRoute>} />
          <Route path="/tickets" element={<ProtectedRoute><Tickets /></ProtectedRoute>} />
          <Route path="/response-templates" element={<ProtectedRoute><ResponseTemplates /></ProtectedRoute>} />
          <Route path="/provider-forwarding" element={<ProtectedRoute><ProviderForwarding /></ProtectedRoute>} />
          <Route path="/system-bots" element={<ProtectedRoute><SystemBots /></ProtectedRoute>} />
          <Route path="/my-staff" element={<ProtectedRoute><MyStaff /></ProtectedRoute>} />
          <Route path="/activity-logs" element={<ProtectedRoute><ActivityLogs /></ProtectedRoute>} />
          <Route path="/watermarks" element={<ProtectedRoute><Watermarks /></ProtectedRoute>} />
          <Route path="/marketing-intervals" element={<ProtectedRoute><MarketingIntervals /></ProtectedRoute>} />
          <Route path="/support-groups" element={<ProtectedRoute><SupportGroups /></ProtectedRoute>} />
          <Route path="/provider-aliases" element={<ProtectedRoute><ProviderAliases /></ProtectedRoute>} />

          {/* Admin Routes */}
          <Route path="/admin/dashboard" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
          <Route path="/admin/users" element={<AdminRoute><UserManagement /></AdminRoute>} />
          <Route path="/admin/staff" element={<AdminRoute><StaffManagement /></AdminRoute>} />
          <Route path="/admin/settings" element={<AdminRoute><SystemSettings /></AdminRoute>} />
          <Route path="/admin/payments" element={<AdminRoute><PaymentManagement /></AdminRoute>} />
          <Route path="/admin/payment-settings" element={<AdminRoute><PaymentSettings /></AdminRoute>} />
          <Route path="/admin/vouchers" element={<AdminRoute><VoucherManagement /></AdminRoute>} />
          <Route path="/admin/credit-packages" element={<AdminRoute><CreditPackages /></AdminRoute>} />
          <Route path="/admin/contact-backups" element={<AdminRoute><ContactBackups /></AdminRoute>} />
          <Route path="/admin/system-bots" element={<AdminRoute><SystemBotManagement /></AdminRoute>} />
          <Route path="/admin/email-settings" element={<AdminRoute><EmailSettings /></AdminRoute>} />
          <Route path="/admin/fonepay" element={<AdminRoute><FonepayManagement /></AdminRoute>} />
          <Route path="/admin/charges" element={<AdminRoute><DefaultCharges /></AdminRoute>} />

          {/* Catch all */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <Router>
        <AppContent />
      </Router>
    </ThemeProvider>
  )
}

export default App

