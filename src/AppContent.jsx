import React from 'react';
import { useApp } from './context/AppContext';
import { Toast } from './components/common/UIComponents';
import { CreatorLayout } from './components/layouts/CreatorLayout';
import { LandingPage } from './pages/LandingPage';
import { AuthScreens } from './pages/AuthScreens';
import { CreatorDashboard } from './pages/CreatorDashboard';
import { WorkspacesList, NewWorkspaceWizard } from './pages/WorkspacesList';
import { WorkspaceDetails } from './pages/WorkspaceDetails';
import { ClientsManagement, PaymentsDashboard, NotificationsPage, SettingsPage } from './pages/CreatorPages';
import { ClientPortalPortal } from './pages/ClientPortalPortal';
import { AdminUsersPage, SystemStatePage } from './pages/AdminAndSystemPages';
import { AlertOctagon, Lock, ShieldAlert, WifiOff } from 'lucide-react';

export function AppContent() {
  const { currentRoute, toastMessage } = useApp();

  // Public Marketing & Auth Routes
  if (currentRoute === '/') return <LandingPage />;
  if (currentRoute === '/login') return <AuthScreens mode="login" />;
  if (currentRoute === '/register') return <AuthScreens mode="register" />;
  if (currentRoute === '/forgot-password') return <AuthScreens mode="forgot" />;

  // Secure Client Portal Routes
  if (currentRoute.startsWith('/review/')) {
    const token = currentRoute.replace('/review/', '');
    return <ClientPortalPortal token={token} />;
  }

  // System State / Error Pages
  if (currentRoute === '/link-expired') {
    return <SystemStatePage code="EXPIRED" title="Secure Link Expired" message="This payment-gated review link has reached its 30-day expiration limit. Please ask the creator to re-issue." icon={AlertOctagon} />;
  }
  if (currentRoute === '/link-revoked') {
    return <SystemStatePage code="REVOKED" title="Link Revoked by Creator" message="This workspace link has been archived or disabled by Arjun Raj." icon={Lock} />;
  }
  if (currentRoute === '/permission-denied') {
    return <SystemStatePage code="403" title="Permission Denied" message="You do not have access rights to view this private workspace token." icon={ShieldAlert} />;
  }
  if (currentRoute === '/server-error') {
    return <SystemStatePage code="500" title="Server Error" message="An unexpected error occurred. Please try refreshing or returning later." icon={WifiOff} />;
  }

  // Creator App Layout Wrap for Creator & Admin Pages
  let pageComponent = <CreatorDashboard />;
  let activeTab = 'dashboard';

  if (currentRoute === '/dashboard') {
    pageComponent = <CreatorDashboard />;
    activeTab = 'dashboard';
  } else if (currentRoute === '/workspaces') {
    pageComponent = <WorkspacesList />;
    activeTab = 'workspaces';
  } else if (currentRoute === '/workspaces/new') {
    pageComponent = <NewWorkspaceWizard />;
    activeTab = 'workspaces';
  } else if (currentRoute.startsWith('/workspaces/')) {
    const wsId = currentRoute.replace('/workspaces/', '');
    pageComponent = <WorkspaceDetails workspaceId={wsId} />;
    activeTab = 'workspaces';
  } else if (currentRoute === '/clients') {
    pageComponent = <ClientsManagement />;
    activeTab = 'clients';
  } else if (currentRoute === '/payments') {
    pageComponent = <PaymentsDashboard />;
    activeTab = 'payments';
  } else if (currentRoute === '/notifications') {
    pageComponent = <NotificationsPage />;
    activeTab = 'notifications';
  } else if (currentRoute === '/settings') {
    pageComponent = <SettingsPage />;
    activeTab = 'settings';
  } else if (currentRoute.startsWith('/admin')) {
    pageComponent = <AdminUsersPage />;
    activeTab = 'admin';
  }

  return (
    <CreatorLayout activeTab={activeTab}>
      {pageComponent}
      <Toast toast={toastMessage} />
    </CreatorLayout>
  );
}
