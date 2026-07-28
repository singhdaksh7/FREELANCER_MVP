import React from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/common/UIComponents';
import { Users, Mail, Building, Plus, CreditCard, ExternalLink } from 'lucide-react';

export const ClientsManagement = () => {
  const { clients } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Clients Directory</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Manage client profiles, past project deliverables, and payment histories</p>
        </div>

        <button style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Plus size={16} /> Add New Client
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
        {clients.map(client => (
          <div key={client.id} style={{ backgroundColor: '#FFFFFF', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-main)' }}>{client.name}</h3>
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                  <Building size={14} /> {client.company}
                </div>
              </div>
              <StatusBadge status={client.status} />
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '12px', display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '13px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Email:</span>
                <span style={{ color: 'var(--color-vault-blue)', fontWeight: '500' }}>{client.email}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Active Workspaces:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>{client.activeWorkspaces}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Total Paid to Date:</span>
                <strong style={{ color: 'var(--color-success)' }}>₹{client.totalSpent.toLocaleString()}</strong>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const PaymentsDashboard = () => {
  const { payments } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Payments & Revenue Ledger</h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Track payout transactions, platform fees, and pending file-lock funds</p>
      </div>

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 24px' }}>Transaction ID</th>
                <th style={{ padding: '12px 24px' }}>Workspace</th>
                <th style={{ padding: '12px 24px' }}>Client</th>
                <th style={{ padding: '12px 24px' }}>Gross Amount</th>
                <th style={{ padding: '12px 24px' }}>Net Payout</th>
                <th style={{ padding: '12px 24px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {payments.map(p => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--color-text-muted)' }}>{p.id}</td>
                  <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--color-text-main)' }}>{p.workspaceTitle}</td>
                  <td style={{ padding: '16px 24px' }}>{p.clientName}</td>
                  <td style={{ padding: '16px 24px', fontWeight: '700' }}>₹{p.amount.toLocaleString()}</td>
                  <td style={{ padding: '16px 24px', fontWeight: '700', color: 'var(--color-success)' }}>₹{p.netAmount.toLocaleString()}</td>
                  <td style={{ padding: '16px 24px' }}><StatusBadge status={p.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export const NotificationsPage = () => {
  const { notifications, markNotificationRead } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '720px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Notifications Feed</h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Real-time updates when clients view links, comment, approve, or pay</p>
      </div>

      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        {notifications.map(n => (
          <div
            key={n.id}
            onClick={() => markNotificationRead(n.id)}
            style={{
              padding: '16px 24px',
              borderBottom: '1px solid var(--color-border)',
              backgroundColor: n.read ? '#FFFFFF' : 'var(--color-vault-blue-light)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}
          >
            <div>
              <div style={{ fontWeight: '700', fontSize: '14px', color: 'var(--color-text-main)' }}>{n.title}</div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{n.text}</div>
            </div>
            <span style={{ fontSize: '12px', color: '#94A3B8' }}>{n.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

export const SettingsPage = () => {
  return (
    <div style={{ maxWidth: '640px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Account Settings</h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Manage payout bank account, watermark defaults, and security</p>
      </div>

      <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Payout Bank Account (UPI / Direct Transfer)</h3>
        <div>
          <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>UPI ID for Instant Payouts</label>
          <input type="text" defaultValue="arjunraj@okicici" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }} />
        </div>

        <div>
          <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Default Watermark Text Stamp</label>
          <input type="text" defaultValue="PREVIEW - PROPERTY OF ARJUN RAJ" style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }} />
        </div>

        <button style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 20px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '14px', alignSelf: 'flex-start' }}>
          Save Preferences
        </button>
      </div>
    </div>
  );
};
