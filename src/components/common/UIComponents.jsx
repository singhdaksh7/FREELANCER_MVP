import React from 'react';

export const StatusBadge = ({ status }) => {
  let bg = 'var(--color-bg-main)';
  let color = 'var(--color-text-muted)';

  switch (status) {
    case 'Draft':
      bg = '#F1F5F9';
      color = '#475569';
      break;
    case 'Preview Processing':
      bg = '#FEF3C7';
      color = '#D97706';
      break;
    case 'In Review':
      bg = '#DBEAFE';
      color = '#2563EB';
      break;
    case 'Changes Requested':
      bg = '#FEE2E2';
      color = '#DC2626';
      break;
    case 'Approved':
      bg = '#E0E7FF';
      color = '#4F46E5';
      break;
    case 'Payment Pending':
      bg = '#FEF3C7';
      color = '#B45309';
      break;
    case 'Paid':
    case 'Files Unlocked':
    case 'Delivered':
    case 'Completed':
    case 'Active':
      bg = '#D1FAE5';
      color = '#059669';
      break;
    default:
      break;
  }

  return (
    <span
      style={{
        backgroundColor: bg,
        color: color,
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        fontSize: '12px',
        fontWeight: '600',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        whiteSpace: 'nowrap'
      }}
    >
      <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: color }} />
      {status}
    </span>
  );
};

export const Toast = ({ toast }) => {
  if (!toast) return null;
  const isSuccess = toast.type === 'success';
  const isWarn = toast.type === 'warning';

  return (
    <div
      className="animate-fade-in"
      style={{
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        zIndex: 9999,
        backgroundColor: isSuccess ? '#065F46' : isWarn ? '#92400E' : 'var(--color-vault-navy)',
        color: '#FFFFFF',
        padding: '14px 20px',
        borderRadius: 'var(--radius-md)',
        boxShadow: 'var(--shadow-lg)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        fontSize: '14px',
        fontWeight: '500',
        maxWidth: '380px'
      }}
    >
      <span>{isSuccess ? '✓' : isWarn ? '⚠️' : 'ℹ️'}</span>
      <div>{toast.message}</div>
    </div>
  );
};
