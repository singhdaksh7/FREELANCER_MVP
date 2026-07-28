import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { 
  LayoutDashboard, 
  FolderKanban, 
  Users, 
  CreditCard, 
  Bell, 
  Settings, 
  ShieldCheck, 
  Plus, 
  LogOut, 
  Search, 
  ExternalLink,
  Lock,
  Menu,
  X
} from 'lucide-react';

export const CreatorLayout = ({ children, activeTab = 'dashboard' }) => {
  const { currentUser, currentRoute, setCurrentRoute, notifications } = useApp();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const unreadCount = notifications.filter(n => !n.read).length;

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', route: '/dashboard', icon: LayoutDashboard },
    { id: 'workspaces', label: 'Workspaces', route: '/workspaces', icon: FolderKanban },
    { id: 'clients', label: 'Clients', route: '/clients', icon: Users },
    { id: 'payments', label: 'Payments', route: '/payments', icon: CreditCard },
    { id: 'notifications', label: 'Notifications', route: '/notifications', icon: Bell, badge: unreadCount },
    { id: 'settings', label: 'Settings', route: '/settings', icon: Settings },
  ];

  const adminItems = [
    { id: 'admin-users', label: 'Admin Console', route: '/admin/users', icon: ShieldCheck },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--color-bg-main)' }}>
      {/* Creator Desktop Sidebar (240px) */}
      <aside
        style={{
          width: 'var(--sidebar-width)',
          backgroundColor: 'var(--color-vault-navy)',
          color: '#FFFFFF',
          display: 'flex',
          flexDirection: 'column',
          position: 'fixed',
          top: 0,
          bottom: 0,
          left: 0,
          zIndex: 100,
          borderRight: '1px solid var(--color-vault-navy-light)'
        }}
        className="desktop-sidebar"
      >
        {/* Brand Header */}
        <div style={{ padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '10px', borderBottom: '1px solid var(--color-vault-navy-light)' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={18} color="#FFF" />
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '16px', letterSpacing: '-0.02em', color: '#FFF' }}>PROJECT VAULT</div>
            <div style={{ fontSize: '10px', color: '#94A3B8', textTransform: 'uppercase', tracking: '0.05em' }}>Payment-Gated Delivery</div>
          </div>
        </div>

        {/* Action Button */}
        <div style={{ padding: '16px 20px' }}>
          <button
            onClick={() => setCurrentRoute('/workspaces/new')}
            style={{
              width: '100%',
              backgroundColor: 'var(--color-vault-blue)',
              color: '#FFF',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              fontSize: '14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              transition: 'background 0.2s'
            }}
          >
            <Plus size={16} /> New Workspace
          </button>
        </div>

        {/* Nav Links */}
        <nav style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600', padding: '8px 12px', textTransform: 'uppercase' }}>Main Menu</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentRoute === item.route;
            return (
              <button
                key={item.id}
                onClick={() => setCurrentRoute(item.route)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  backgroundColor: isActive ? 'var(--color-vault-navy-light)' : 'transparent',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '14px',
                  textAlign: 'left'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} color={isActive ? 'var(--color-vault-blue)' : '#94A3B8'} />
                  <span>{item.label}</span>
                </div>
                {item.badge > 0 && (
                  <span style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', fontSize: '11px', borderRadius: '10px', padding: '2px 6px', fontWeight: '700' }}>
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          <div style={{ fontSize: '11px', color: '#64748B', fontWeight: '600', padding: '16px 12px 8px 12px', textTransform: 'uppercase' }}>System Admin</div>
          {adminItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentRoute.startsWith('/admin');
            return (
              <button
                key={item.id}
                onClick={() => setCurrentRoute(item.route)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: 'var(--radius-md)',
                  color: isActive ? '#FFFFFF' : '#94A3B8',
                  backgroundColor: isActive ? 'var(--color-vault-navy-light)' : 'transparent',
                  fontWeight: isActive ? '600' : '500',
                  fontSize: '14px'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Icon size={18} color={isActive ? 'var(--color-vault-blue)' : '#94A3B8'} />
                  <span>{item.label}</span>
                </div>
              </button>
            );
          })}
        </nav>

        {/* User Profile Footer */}
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--color-vault-navy-light)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img src={currentUser.avatar} alt={currentUser.name} style={{ width: '36px', height: '36px', borderRadius: '50%', objectFit: 'cover' }} />
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: '#FFF', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{currentUser.name}</div>
            <div style={{ fontSize: '12px', color: '#94A3B8' }}>{currentUser.role}</div>
          </div>
          <button onClick={() => setCurrentRoute('/')} title="Logout" style={{ color: '#94A3B8' }}>
            <LogOut size={16} />
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div style={{ flex: 1, marginLeft: 'var(--sidebar-width)', minWidth: 0, display: 'flex', flexDirection: 'column' }} className="main-content-wrapper">
        {/* Sticky Creator Header */}
        <header
          style={{
            position: 'sticky',
            top: 0,
            zIndex: 90,
            backgroundColor: '#FFFFFF',
            borderBottom: '1px solid var(--color-border)',
            padding: '12px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            height: '64px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ position: 'relative', width: '280px' }}>
              <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="text"
                placeholder="Search workspaces, clients, files..."
                style={{
                  width: '100%',
                  padding: '8px 12px 8px 36px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--color-border)',
                  fontSize: '13px',
                  outline: 'none',
                  backgroundColor: '#F8FAFC'
                }}
              />
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {/* Quick Link to Client Portal Simulation */}
            <button
              onClick={() => setCurrentRoute('/review/sec_tok_brand_identity_99')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--color-vault-blue)',
                color: 'var(--color-vault-blue)',
                fontSize: '12px',
                fontWeight: '600'
              }}
            >
              <ExternalLink size={14} /> Open Client Portal View
            </button>

            <button onClick={() => setCurrentRoute('/notifications')} style={{ position: 'relative', color: '#64748B', padding: '6px' }}>
              <Bell size={20} />
              {unreadCount > 0 && (
                <span style={{ position: 'absolute', top: '4px', right: '4px', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--color-vault-blue)' }} />
              )}
            </button>
          </div>
        </header>

        {/* Page Content Body */}
        <main style={{ flex: 1, padding: '24px' }}>
          {children}
        </main>
      </div>

      {/* Creator Mobile Bottom Navigation (Visible on small screens) */}
      <style>{`
        @media (max-width: 768px) {
          .desktop-sidebar { display: none !important; }
          .main-content-wrapper { margin-left: 0 !important; margin-bottom: 64px !important; }
          .mobile-bottom-nav { display: flex !important; }
        }
        @media (min-width: 769px) {
          .mobile-bottom-nav { display: none !important; }
        }
      `}</style>
      <div
        className="mobile-bottom-nav"
        style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          backgroundColor: 'var(--color-vault-navy)',
          zIndex: 200,
          borderTop: '1px solid var(--color-vault-navy-light)',
          justifyContent: 'space-around',
          alignItems: 'center'
        }}
      >
        {navItems.slice(0, 5).map(item => {
          const Icon = item.icon;
          const isActive = currentRoute === item.route;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentRoute(item.route)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '2px',
                color: isActive ? 'var(--color-vault-blue)' : '#94A3B8',
                fontSize: '11px',
                fontWeight: isActive ? '600' : '400'
              }}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
