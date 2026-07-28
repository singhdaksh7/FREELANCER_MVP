import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { ClientReviewLayout } from '../components/layouts/ClientReviewLayout';
import { 
  Lock, 
  Unlock, 
  MessageSquare, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  ShieldCheck, 
  ChevronRight, 
  X, 
  FileText, 
  CreditCard,
  Layers,
  Send
} from 'lucide-react';

export const ClientPortalPortal = ({ token }) => {
  const { workspaces, addComment, requestChanges, approveWorkspace, simulatePaymentSuccess, setCurrentRoute, showToast } = useApp();
  const [selectedFileIndex, setSelectedFileIndex] = useState(0);
  const [activeTab, setActiveTab] = useState('preview'); // preview | comments | request_changes | checkout | success
  const [commentInput, setCommentInput] = useState('');
  const [requestChangesText, setRequestChangesText] = useState('');

  // Find target workspace
  const ws = workspaces.find(w => w.secureToken === token) || workspaces[0];
  const activeFile = ws.files[selectedFileIndex] || ws.files[0];

  const handlePostComment = (e) => {
    e.preventDefault();
    if (!commentInput.trim()) return;
    addComment(ws.id, commentInput, activeFile.id, ws.currentVersion);
    setCommentInput('');
  };

  const handleSendRequestChanges = (e) => {
    e.preventDefault();
    if (!requestChangesText.trim()) return;
    requestChanges(ws.id, requestChangesText);
    setRequestChangesText('');
    setActiveTab('preview');
  };

  const handleApproveAndPay = () => {
    approveWorkspace(ws.id);
    setActiveTab('checkout');
  };

  const handleSimulatePayment = () => {
    simulatePaymentSuccess(ws.id);
    setActiveTab('success');
  };

  return (
    <ClientReviewLayout workspace={ws}>
      {/* Top Banner Status Bar */}
      <div style={{ backgroundColor: '#1E293B', borderBottom: '1px solid #334155', padding: '12px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '13px', color: '#94A3B8' }}>Project:</span>
          <strong style={{ color: '#F8FAFC', fontSize: '15px' }}>{ws.title}</strong>
          <span style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', fontSize: '11px', fontWeight: '700', padding: '2px 8px', borderRadius: '4px' }}>
            {ws.currentVersion.toUpperCase()}
          </span>
        </div>

        {/* Lock Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {ws.status === 'Paid' ? (
            <div style={{ backgroundColor: '#065F46', color: '#34D399', padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Unlock size={14} /> Payment Received • Files Unlocked
            </div>
          ) : (
            <div style={{ backgroundColor: '#78350F', color: '#FBBF24', padding: '6px 14px', borderRadius: 'var(--radius-full)', fontSize: '13px', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Lock size={14} /> Gated Delivery Lock (₹{ws.amount.toLocaleString()})
            </div>
          )}
        </div>
      </div>

      {/* Main Review Portal Workspace Grid */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'row', minHeight: 'calc(100vh - 128px)' }} className="portal-grid">
        {/* Left Side: Watermarked Interactive Canvas Viewer */}
        <div style={{ flex: 1, backgroundColor: '#030712', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          {/* File Switcher Header Bar */}
          <div style={{ backgroundColor: '#111827', borderBottom: '1px solid #1F2937', padding: '8px 16px', display: 'flex', gap: '8px', overflowX: 'auto' }}>
            {ws.files.map((file, idx) => (
              <button
                key={file.id}
                onClick={() => setSelectedFileIndex(idx)}
                style={{
                  backgroundColor: selectedFileIndex === idx ? 'var(--color-vault-blue)' : '#1F2937',
                  color: '#FFFFFF',
                  padding: '6px 12px',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '12px',
                  fontWeight: selectedFileIndex === idx ? '700' : '500',
                  whiteSpace: 'nowrap'
                }}
              >
                📄 {file.name}
              </button>
            ))}
          </div>

          {/* Canvas Display with Dynamic Watermark Overlay */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', position: 'relative', overflow: 'hidden' }}>
            <div style={{ position: 'relative', maxWidth: '850px', width: '100%', borderRadius: 'var(--radius-md)', overflow: 'hidden', boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.5)' }}>
              <img
                src={activeFile.previewUrl}
                alt={activeFile.name}
                style={{ width: '100%', display: 'block', maxHeight: '550px', objectFit: 'contain', backgroundColor: '#111827' }}
              />

              {/* Personalised Dynamic Watermark Overlay (Only active when locked) */}
              {ws.status !== 'Paid' && (
                <div
                  className="watermark-overlay"
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-around',
                    alignItems: 'center',
                    pointerEvents: 'none'
                  }}
                >
                  {[1, 2, 3, 4].map(i => (
                    <div key={i} style={{ color: 'rgba(255, 255, 255, 0.35)', fontSize: '22px', fontWeight: '800', textTransform: 'uppercase', letterSpacing: '0.1em', transform: 'rotate(-25deg)', userSelect: 'none' }}>
                      {ws.watermarkText} • PREVIEW ONLY
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Side: Interactive Client Actions Panel */}
        <div style={{ width: '380px', backgroundColor: '#111827', borderLeft: '1px solid #1F2937', display: 'flex', flexDirection: 'column' }} className="portal-sidebar">
          {/* Action Tabs Header */}
          <div style={{ display: 'flex', borderBottom: '1px solid #1F2937', backgroundColor: '#1F2937' }}>
            <button
              onClick={() => setActiveTab('preview')}
              style={{ flex: 1, padding: '12px', color: activeTab === 'preview' ? '#FFF' : '#9CA3AF', fontWeight: '600', fontSize: '13px', borderBottom: activeTab === 'preview' ? '2px solid var(--color-vault-blue)' : 'none' }}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              style={{ flex: 1, padding: '12px', color: activeTab === 'comments' ? '#FFF' : '#9CA3AF', fontWeight: '600', fontSize: '13px', borderBottom: activeTab === 'comments' ? '2px solid var(--color-vault-blue)' : 'none' }}
            >
              Comments ({ws.comments.length})
            </button>
          </div>

          {/* Overview / Actions Panel */}
          {activeTab === 'preview' && (
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#FFF' }}>Client Action Center</h3>
                <p style={{ fontSize: '13px', color: '#9CA3AF' }}>
                  Review the deliverables above. You can add pinned comments, request revisions, or approve work to unlock clean original files.
                </p>

                <div style={{ backgroundColor: '#1F2937', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid #374151' }}>
                  <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Payment Required to Unlock:</div>
                  <div style={{ fontSize: '28px', fontWeight: '800', color: 'var(--color-vault-blue)', marginTop: '2px' }}>₹{ws.amount.toLocaleString()}</div>
                  <div style={{ fontSize: '11px', color: '#9CA3AF', marginTop: '4px' }}>🔒 Clean original zip/vector files release automatically upon payment</div>
                </div>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ws.status === 'Paid' ? (
                  <button
                    onClick={() => setActiveTab('success')}
                    style={{ width: '100%', backgroundColor: '#059669', color: '#FFF', padding: '14px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                  >
                    <Download size={18} /> Download Original Files
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleApproveAndPay}
                      style={{ width: '100%', backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '14px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                    >
                      <CheckCircle2 size={18} /> Approve Work & Proceed to Pay ₹{ws.amount.toLocaleString()}
                    </button>

                    <button
                      onClick={() => setActiveTab('request_changes')}
                      style={{ width: '100%', backgroundColor: 'transparent', color: '#F59E0B', border: '1px solid #78350F', padding: '12px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '13px' }}
                    >
                      Request Changes / Revision
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Pinned Comments Panel */}
          {activeTab === 'comments' && (
            <div style={{ flex: 1, padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div style={{ overflowY: 'auto', maxHeight: '420px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {ws.comments.map(c => (
                  <div key={c.id} style={{ backgroundColor: '#1F2937', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid #374151' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9CA3AF' }}>
                      <strong style={{ color: '#FFF' }}>{c.author}</strong>
                      <span>{c.timestamp}</span>
                    </div>
                    <p style={{ fontSize: '13px', color: '#D1D5DB', marginTop: '6px' }}>{c.text}</p>
                  </div>
                ))}
              </div>

              {/* Post Comment Input */}
              <form onSubmit={handlePostComment} style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <input
                  type="text"
                  placeholder="Type feedback comment..."
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', backgroundColor: '#1F2937', border: '1px solid #374151', color: '#FFF', fontSize: '13px', outline: 'none' }}
                />
                <button type="submit" style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 14px', borderRadius: 'var(--radius-md)' }}>
                  <Send size={16} />
                </button>
              </form>
            </div>
          )}

          {/* Request Changes Form Panel */}
          {activeTab === 'request_changes' && (
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#FFF' }}>Request Revisions</h3>
              <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Specify requested modifications for Arjun Raj. Creator will re-upload V2.</p>
              <textarea
                rows={5}
                placeholder="List required changes..."
                value={requestChangesText}
                onChange={(e) => setRequestChangesText(e.target.value)}
                style={{ width: '100%', padding: '12px', borderRadius: 'var(--radius-md)', backgroundColor: '#1F2937', border: '1px solid #374151', color: '#FFF', fontSize: '13px', outline: 'none' }}
              />
              <div style={{ display: 'flex', gap: '10px' }}>
                <button onClick={() => setActiveTab('preview')} style={{ flex: 1, padding: '10px', borderRadius: 'var(--radius-md)', border: '1px solid #374151', color: '#9CA3AF' }}>Cancel</button>
                <button onClick={handleSendRequestChanges} style={{ flex: 1, backgroundColor: '#F59E0B', color: '#000', padding: '10px', borderRadius: 'var(--radius-md)', fontWeight: '700' }}>Submit Changes</button>
              </div>
            </div>
          )}

          {/* Checkout & Payment Gateway Panel */}
          {activeTab === 'checkout' && (
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h3 style={{ fontSize: '18px', fontWeight: '700', color: '#FFF' }}>Checkout & Unlock Original Files</h3>

              <div style={{ backgroundColor: '#1F2937', padding: '16px', borderRadius: 'var(--radius-md)' }}>
                <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Order Total</div>
                <div style={{ fontSize: '24px', fontWeight: '800', color: '#FFF' }}>₹{ws.amount.toLocaleString()}</div>
                <div style={{ fontSize: '12px', color: '#34D399', marginTop: '4px' }}>✓ Payment-gated instant file release</div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#9CA3AF' }}>Select Payment Method (Simulated)</label>
                <div style={{ padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-vault-blue)', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: '#FFF', fontSize: '13px', fontWeight: '600' }}>
                  💳 Razorpay UPI / Credit Card / NetBanking
                </div>
              </div>

              <button
                onClick={handleSimulatePayment}
                style={{ width: '100%', backgroundColor: '#10B981', color: '#FFF', padding: '14px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '15px' }}
              >
                Pay ₹{ws.amount.toLocaleString()} & Release Original Files
              </button>
            </div>
          )}

          {/* Unlocked Downloads Success Panel */}
          {activeTab === 'success' && (
            <div style={{ flex: 1, padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ backgroundColor: '#065F46', padding: '16px', borderRadius: 'var(--radius-md)', color: '#FFF' }}>
                <h3 style={{ fontSize: '18px', fontWeight: '700' }}>🎉 Payment Successful!</h3>
                <p style={{ fontSize: '13px', color: '#A7F3D0', marginTop: '4px' }}>Original high-res assets are now permanently unlocked.</p>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: '#9CA3AF' }}>Unlocked Deliverables:</label>
                {ws.files.map(file => (
                  <a
                    key={file.id}
                    href={file.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ backgroundColor: '#1F2937', padding: '12px', borderRadius: 'var(--radius-md)', border: '1px solid #374151', color: '#FFF', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '13px', textDecoration: 'none' }}
                  >
                    <span>📄 {file.name}</span>
                    <Download size={16} color="var(--color-vault-blue)" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </ClientReviewLayout>
  );
};
