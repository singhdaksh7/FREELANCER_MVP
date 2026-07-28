import React from 'react';
import { useApp } from '../../context/AppContext';
import { Lock, ShieldAlert, ArrowLeft, ExternalLink } from 'lucide-react';

export const ClientReviewLayout = ({ children, workspace }) => {
  const { setCurrentRoute } = useApp();

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0B0F19', color: '#F8FAFC', display: 'flex', flexDirection: 'column' }}>
      {/* Top Client Header */}
      <header
        style={{
          height: '64px',
          backgroundColor: '#111827',
          borderBottom: '1px solid #1F2937',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 100
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={18} color="#FFF" />
          </div>
          <div>
            <div style={{ fontWeight: '700', fontSize: '15px', color: '#FFF' }}>PROJECT VAULT PORTAL</div>
            <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Secure Client Review & Payment-Gated Delivery</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          {workspace && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', backgroundColor: '#1F2937', padding: '6px 12px', borderRadius: 'var(--radius-md)', fontSize: '12px', color: '#D1D5DB' }}>
              <span>Client:</span>
              <strong style={{ color: '#FFF' }}>{workspace.client?.name || 'Rohit Sharma'}</strong>
            </div>
          )}

          <button
            onClick={() => setCurrentRoute('/dashboard')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: '#9CA3AF',
              fontSize: '12px',
              backgroundColor: 'transparent',
              border: '1px solid #374151',
              padding: '6px 12px',
              borderRadius: 'var(--radius-md)'
            }}
          >
            <ArrowLeft size={14} /> Back to Creator View
          </button>
        </div>
      </header>

      {/* Main Body */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative' }}>
        {children}
      </main>

      {/* Security Footer Notice */}
      <footer style={{ backgroundColor: '#111827', borderTop: '1px solid #1F2937', padding: '12px 24px', fontSize: '12px', color: '#9CA3AF', textAlign: 'center', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
        <ShieldAlert size={14} color="var(--color-vault-blue)" />
        <span>Previews are protected by personalised dynamic watermarks. Payment-gated delivery ensures instant original file unlock upon successful payment.</span>
      </footer>
    </div>
  );
};
