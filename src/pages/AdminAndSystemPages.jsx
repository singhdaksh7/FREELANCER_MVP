import React from 'react';
import { useApp } from '../context/AppContext';
import { ShieldCheck, Users, FolderKanban, CreditCard, Activity, AlertOctagon, HelpCircle, HardDrive } from 'lucide-react';

export const AdminUsersPage = () => {
  const { setCurrentRoute } = useApp();

  const users = [
    { id: 'usr_1', name: 'Arjun Raj', email: 'arjun@example.com', role: 'Creator (Freelancer)', workspaces: 3, earnings: '₹1,85,000', status: 'Active' },
    { id: 'usr_2', name: 'Rohit Sharma', email: 'rohit@designtech.io', role: 'Client', workspaces: 2, earnings: '₹75,000 Paid', status: 'Active' },
    { id: 'usr_3', name: 'Priya Verma', email: 'priya@fashioncraft.com', role: 'Client', workspaces: 1, earnings: '₹45,000 Paid', status: 'Active' }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Admin User Management</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>System administrative oversight for Creators, Clients, and permissions</p>
        </div>

        {/* Sub-nav tabs for Admin */}
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setCurrentRoute('/admin/users')} style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-navy)', color: '#FFF', fontSize: '13px', fontWeight: '600' }}>Users</button>
          <button onClick={() => setCurrentRoute('/admin/workspaces')} style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', backgroundColor: '#E2E8F0', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Workspaces</button>
          <button onClick={() => setCurrentRoute('/admin/storage')} style={{ padding: '8px 14px', borderRadius: 'var(--radius-md)', backgroundColor: '#E2E8F0', color: '#475569', fontSize: '13px', fontWeight: '600' }}>Storage</button>
        </div>
      </div>

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
          <thead>
            <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 24px' }}>User</th>
              <th style={{ padding: '12px 24px' }}>Role</th>
              <th style={{ padding: '12px 24px' }}>Workspaces</th>
              <th style={{ padding: '12px 24px' }}>Volume</th>
              <th style={{ padding: '12px 24px' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={{ padding: '16px 24px' }}>
                  <div style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>{u.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{u.email}</div>
                </td>
                <td style={{ padding: '16px 24px', fontWeight: '500' }}>{u.role}</td>
                <td style={{ padding: '16px 24px', fontWeight: '700' }}>{u.workspaces}</td>
                <td style={{ padding: '16px 24px', fontWeight: '600' }}>{u.earnings}</td>
                <td style={{ padding: '16px 24px' }}>
                  <span style={{ backgroundColor: '#D1FAE5', color: '#059669', padding: '4px 8px', borderRadius: '10px', fontSize: '12px', fontWeight: '700' }}>{u.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const SystemStatePage = ({ title, message, code = '404', icon = AlertOctagon }) => {
  const { setCurrentRoute } = useApp();
  const IconComponent = icon;

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-vault-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', color: '#FFF' }}>
      <div style={{ textAlign: 'center', maxWidth: '480px', backgroundColor: 'var(--color-vault-navy-light)', padding: '40px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ width: '56px', height: '56px', borderRadius: '50%', backgroundColor: 'rgba(239, 68, 68, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px auto' }}>
          <IconComponent size={28} color="#EF4444" />
        </div>
        <div style={{ fontSize: '14px', fontWeight: '800', color: 'var(--color-vault-blue)', textTransform: 'uppercase', tracking: '0.1em' }}>System State [{code}]</div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', marginTop: '8px' }}>{title}</h1>
        <p style={{ fontSize: '14px', color: '#94A3B8', marginTop: '12px', lineHeight: 1.5 }}>{message}</p>

        <div style={{ marginTop: '28px', display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <button onClick={() => setCurrentRoute('/dashboard')} style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 20px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '14px' }}>
            Return to Creator Dashboard
          </button>
          <button onClick={() => setCurrentRoute('/')} style={{ backgroundColor: 'transparent', color: '#94A3B8', border: '1px solid rgba(255,255,255,0.2)', padding: '10px 16px', borderRadius: 'var(--radius-md)', fontSize: '14px' }}>
            Home Landing
          </button>
        </div>
      </div>
    </div>
  );
};
