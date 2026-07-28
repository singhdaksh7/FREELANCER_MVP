import React from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/common/UIComponents';
import { FolderKanban, IndianRupee, Clock, ArrowUpRight, Plus, ExternalLink, ShieldAlert } from 'lucide-react';

export const CreatorDashboard = () => {
  const { currentUser, workspaces, setCurrentRoute } = useApp();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome Banner */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Welcome back, {currentUser.name} 👋</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            You have {workspaces.filter(w => w.status !== 'Paid').length} active workspaces gated for client review & payment.
          </p>
        </div>
        <button
          onClick={() => setCurrentRoute('/workspaces/new')}
          style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} /> New Workspace Flow
        </button>
      </div>

      {/* Overview Metric Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
        <div style={{ backgroundColor: '#FFFFFF', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: '500' }}>
            <span>Total Earnings</span>
            <IndianRupee size={18} color="var(--color-success)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-text-main)', marginTop: '8px' }}>
            ₹{currentUser.totalEarnings.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-success)', marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ArrowUpRight size={14} /> +18% this month
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: '500' }}>
            <span>Pending Payment Locks</span>
            <Clock size={18} color="var(--color-warning)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-text-main)', marginTop: '8px' }}>
            ₹{currentUser.pendingEarnings.toLocaleString()}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Gated in 2 active client links
          </div>
        </div>

        <div style={{ backgroundColor: '#FFFFFF', padding: '20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: 'var(--color-text-muted)', fontSize: '13px', fontWeight: '500' }}>
            <span>Active Workspaces</span>
            <FolderKanban size={18} color="var(--color-vault-blue)" />
          </div>
          <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-text-main)', marginTop: '8px' }}>
            {workspaces.length}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            4 clients onboarded
          </div>
        </div>
      </div>

      {/* Active Workspaces Table */}
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
        <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-main)' }}>Active Workspaces & Link Portals</h2>
          <button onClick={() => setCurrentRoute('/workspaces')} style={{ color: 'var(--color-vault-blue)', fontSize: '13px', fontWeight: '600' }}>
            View All Workspaces →
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ backgroundColor: '#F8FAFC', borderBottom: '1px solid var(--color-border)', color: 'var(--color-text-muted)', fontSize: '12px', textTransform: 'uppercase' }}>
                <th style={{ padding: '12px 24px' }}>Workspace Project</th>
                <th style={{ padding: '12px 24px' }}>Client</th>
                <th style={{ padding: '12px 24px' }}>Amount Lock</th>
                <th style={{ padding: '12px 24px' }}>Status</th>
                <th style={{ padding: '12px 24px' }}>Version</th>
                <th style={{ padding: '12px 24px', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {workspaces.map((ws) => (
                <tr key={ws.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ fontWeight: '600', color: 'var(--color-text-main)' }}>{ws.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{ws.category}</div>
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <div style={{ fontWeight: '500' }}>{ws.client?.name}</div>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{ws.client?.company}</div>
                  </td>
                  <td style={{ padding: '16px 24px', fontWeight: '700', color: 'var(--color-text-main)' }}>
                    ₹{ws.amount.toLocaleString()}
                  </td>
                  <td style={{ padding: '16px 24px' }}>
                    <StatusBadge status={ws.status} />
                  </td>
                  <td style={{ padding: '16px 24px', fontWeight: '600', color: 'var(--color-vault-blue)' }}>
                    {ws.currentVersion.toUpperCase()}
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                      <button
                        onClick={() => setCurrentRoute(`/workspaces/${ws.id}`)}
                        style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '12px', fontWeight: '600' }}
                      >
                        Manage
                      </button>
                      <button
                        onClick={() => setCurrentRoute(`/review/${ws.secureToken}`)}
                        style={{ padding: '6px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-blue-light)', color: 'var(--color-vault-blue)', fontSize: '12px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                      >
                        Portal <ExternalLink size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
