import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/common/UIComponents';
import { 
  ExternalLink, 
  Copy, 
  Upload, 
  MessageSquare, 
  CreditCard, 
  History, 
  FileText, 
  Lock, 
  CheckCircle, 
  AlertCircle,
  Download,
  Eye,
  Check
} from 'lucide-react';

export const WorkspaceDetails = ({ workspaceId }) => {
  const { workspaces, uploadNewVersion, resolveComment, setCurrentRoute, showToast } = useApp();
  const [activeTab, setActiveTab] = useState('files'); // files | comments | payment | activity
  const [copiedLink, setCopiedLink] = useState(false);

  // Find workspace or fallback to default
  const ws = workspaces.find(w => w.id === workspaceId) || workspaces[0];

  const handleCopyLink = () => {
    setCopiedLink(true);
    showToast('Secure Client Link copied to clipboard!', 'info');
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSimulateV2Upload = () => {
    uploadNewVersion(ws.id, { name: 'Brand_Guidelines_V2.pdf' });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Workspace Header */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
              <StatusBadge status={ws.status} />
              <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-vault-blue)', backgroundColor: 'var(--color-vault-blue-light)', padding: '2px 8px', borderRadius: '4px' }}>
                Active Version: {ws.currentVersion.toUpperCase()}
              </span>
            </div>
            <h1 style={{ fontSize: '26px', fontWeight: '800', color: 'var(--color-text-main)' }}>{ws.title}</h1>
            <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Client: <strong>{ws.client.name}</strong> ({ws.client.company}) • Created: {ws.createdAt}</p>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={handleCopyLink}
              style={{ backgroundColor: '#F1F5F9', color: 'var(--color-text-main)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px', border: '1px solid var(--color-border)' }}
            >
              {copiedLink ? <Check size={16} color="#10B981" /> : <Copy size={16} />} Copy Client Link
            </button>

            <button
              onClick={() => setCurrentRoute(`/review/${ws.secureToken}`)}
              style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 16px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              Open Live Client Portal <ExternalLink size={14} />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '24px', borderBottom: '1px solid var(--color-border)', marginTop: '24px', paddingTop: '8px' }}>
          {[
            { id: 'files', label: 'Deliverable Files', icon: FileText, count: ws.files.length },
            { id: 'comments', label: 'Comments & Revisions', icon: MessageSquare, count: ws.comments.length },
            { id: 'payment', label: 'Payment Gate Status', icon: CreditCard },
            { id: 'activity', label: 'Audit Activity Log', icon: History }
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '12px 0',
                  borderBottom: isActive ? '3px solid var(--color-vault-blue)' : '3px solid transparent',
                  color: isActive ? 'var(--color-vault-blue)' : 'var(--color-text-muted)',
                  fontWeight: isActive ? '700' : '500',
                  fontSize: '14px'
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span style={{ backgroundColor: '#E2E8F0', padding: '2px 6px', borderRadius: '10px', fontSize: '11px', fontWeight: '700', color: '#475569' }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'files' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ backgroundColor: '#FFFFFF', padding: '20px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h3 style={{ fontSize: '16px', fontWeight: '700' }}>Version Management ({ws.versions.join(', ').toUpperCase()})</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Upload new revisions to update the watermarked client link automatically.</p>
            </div>

            <button
              onClick={handleSimulateV2Upload}
              style={{ backgroundColor: 'var(--color-vault-navy)', color: '#FFF', padding: '8px 16px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Upload size={14} /> Simulate Upload V2 Revision
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {ws.files.map(file => (
              <div key={file.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', overflow: 'hidden' }}>
                <div style={{ height: '160px', backgroundColor: '#000', position: 'relative', overflow: 'hidden' }}>
                  <img src={file.previewUrl} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover', opacity: 0.8 }} />
                  <div className="watermark-overlay" style={{ position: 'absolute', inset: 0 }} />
                  <div style={{ position: 'absolute', top: '10px', right: '10px', backgroundColor: 'rgba(0,0,0,0.7)', color: '#FFF', padding: '4px 8px', borderRadius: '4px', fontSize: '11px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Lock size={12} color="#F59E0B" /> {file.isLocked ? 'Watermarked Preview' : 'Unlocked Original'}
                  </div>
                </div>

                <div style={{ padding: '16px' }}>
                  <div style={{ fontWeight: '600', fontSize: '14px', color: 'var(--color-text-main)' }}>{file.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '2px' }}>{file.size} • {file.type}</div>

                  <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Status:</span>
                    <span style={{ fontSize: '12px', fontWeight: '700', color: file.isLocked ? '#D97706' : '#10B981' }}>
                      {file.isLocked ? '🔒 Payment Required' : '🔓 Original Unlocked'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'comments' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Client Feedback & Pin Comments</h3>
          {ws.comments.length === 0 ? (
            <p style={{ color: 'var(--color-text-muted)', fontSize: '14px' }}>No comments posted by client yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {ws.comments.map(c => (
                <div key={c.id} style={{ padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', backgroundColor: '#F8FAFC' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <img src={c.avatar} alt={c.author} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                      <span style={{ fontWeight: '700', fontSize: '14px' }}>{c.author}</span>
                      <span style={{ fontSize: '11px', backgroundColor: 'var(--color-vault-blue-light)', color: 'var(--color-vault-blue)', padding: '2px 6px', borderRadius: '4px', fontWeight: '600' }}>
                        Version {c.version.toUpperCase()}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{c.timestamp}</span>
                      {c.status === 'Open' ? (
                        <button onClick={() => resolveComment(ws.id, c.id)} style={{ fontSize: '12px', color: '#10B981', fontWeight: '600', backgroundColor: '#ECFDF5', padding: '4px 8px', borderRadius: '4px' }}>
                          Mark Resolved ✓
                        </button>
                      ) : (
                        <span style={{ fontSize: '12px', color: '#64748B', fontWeight: '600' }}>Resolved ✓</span>
                      )}
                    </div>
                  </div>

                  <p style={{ fontSize: '14px', color: 'var(--color-text-main)', marginTop: '4px' }}>{c.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'payment' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '12px' }}>Payment Gate Configuration</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Lock Amount</div>
              <div style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-vault-blue)', marginTop: '4px' }}>₹{ws.amount.toLocaleString()}</div>
            </div>

            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Delivery Protection Mode</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-main)', marginTop: '4px' }}>Payment-Gated Auto-Unlock</div>
            </div>

            <div style={{ padding: '16px', borderRadius: 'var(--radius-md)', backgroundColor: '#F8FAFC', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>Payment Gateway</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: 'var(--color-text-main)', marginTop: '4px' }}>UPI, Cards, NetBanking (Razorpay)</div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div style={{ backgroundColor: '#FFFFFF', padding: '24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
          <h3 style={{ fontSize: '18px', fontWeight: '700', marginBottom: '16px' }}>Audit Log & Client Events</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {ws.activityLog.map(act => (
              <div key={act.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--color-border)', fontSize: '13px' }}>
                <div>
                  <strong style={{ color: 'var(--color-text-main)' }}>{act.action}</strong>
                  <span style={{ color: 'var(--color-text-muted)', marginLeft: '8px' }}>by {act.user}</span>
                </div>
                <span style={{ color: '#94A3B8', fontSize: '12px' }}>{act.timestamp}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
