import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { StatusBadge } from '../components/common/UIComponents';
import { Plus, Search, Filter, ExternalLink, ArrowRight, CheckCircle2, Upload, Lock, ShieldCheck, ChevronRight } from 'lucide-react';

export const WorkspacesList = () => {
  const { workspaces, setCurrentRoute } = useApp();
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');

  const filtered = workspaces.filter(ws => {
    const matchesSearch = ws.title.toLowerCase().includes(search.toLowerCase()) || ws.client.name.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filterStatus === 'All' || ws.status === filterStatus;
    return matchesSearch && matchesFilter;
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Workspaces Directory</h1>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Manage all client project links, file security, and payment gates</p>
        </div>

        <button
          onClick={() => setCurrentRoute('/workspaces/new')}
          style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 18px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} /> New Workspace
        </button>
      </div>

      {/* Filters & Search bar */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '16px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '240px' }}>
          <Search size={16} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by project title or client name..."
            style={{ width: '100%', padding: '8px 12px 8px 36px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none' }}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Filter size={16} color="#64748B" />
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px', outline: 'none', backgroundColor: '#FFF' }}
          >
            <option value="All">All Statuses</option>
            <option value="In Review">In Review</option>
            <option value="Changes Requested">Changes Requested</option>
            <option value="Approved">Approved</option>
            <option value="Paid">Paid</option>
          </select>
        </div>
      </div>

      {/* Workspaces List Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {filtered.map(ws => (
          <div key={ws.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', padding: '20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: '16px' }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <StatusBadge status={ws.status} />
                <span style={{ fontSize: '12px', fontWeight: '700', color: 'var(--color-vault-blue)', backgroundColor: 'var(--color-vault-blue-light)', padding: '2px 8px', borderRadius: '4px' }}>
                  {ws.currentVersion.toUpperCase()}
                </span>
              </div>

              <h3 style={{ fontSize: '18px', fontWeight: '700', color: 'var(--color-text-main)', marginTop: '6px' }}>{ws.title}</h3>
              <p style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '4px', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {ws.description}
              </p>
            </div>

            <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Client:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>{ws.client.name}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px' }}>
                <span style={{ color: 'var(--color-text-muted)' }}>Payment Gate:</span>
                <strong style={{ color: 'var(--color-text-main)' }}>₹{ws.amount.toLocaleString()}</strong>
              </div>

              <div style={{ display: 'flex', gap: '8px', marginTop: '6px' }}>
                <button
                  onClick={() => setCurrentRoute(`/workspaces/${ws.id}`)}
                  style={{ flex: 1, padding: '8px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '13px', fontWeight: '600', textAlign: 'center' }}
                >
                  Manage Details
                </button>
                <button
                  onClick={() => setCurrentRoute(`/review/${ws.secureToken}`)}
                  style={{ padding: '8px 12px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-navy)', color: '#FFF', fontSize: '13px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  Client Portal <ExternalLink size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export const NewWorkspaceWizard = () => {
  const { clients, addWorkspace, setCurrentRoute } = useApp();
  const [step, setStep] = useState(1);
  const [selectedClient, setSelectedClient] = useState(clients[0]);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Branding & Graphics');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('25000');
  const [watermarkText, setWatermarkText] = useState('PREVIEW - PROPERTY OF ARJUN RAJ');
  const [uploadedFileName, setUploadedFileName] = useState('Brand_Assets_Package_v1.zip');

  const steps = [
    { num: 1, title: 'Select Client' },
    { num: 2, title: 'Project Details' },
    { num: 3, title: 'Upload Files' },
    { num: 4, title: 'Protection & Watermark' },
    { num: 5, title: 'Set Payment Gate' }
  ];

  const handleFinish = () => {
    const newWs = {
      id: `ws_${Date.now()}`,
      title: title || 'New Branding Project',
      secureToken: `sec_tok_${Date.now()}`,
      client: selectedClient,
      category,
      description: description || 'High-res creative deliverables ready for client preview.',
      amount: parseInt(amount, 10) || 25000,
      status: 'In Review',
      createdAt: new Date().toISOString().split('T')[0],
      updatedAt: new Date().toISOString().split('T')[0],
      watermarkText,
      currentVersion: 'v1',
      versions: ['v1'],
      files: [
        {
          id: `file_${Date.now()}`,
          name: uploadedFileName,
          size: '24.5 MB',
          type: 'application/zip',
          previewUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=1000',
          originalUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
          isLocked: true,
          watermarked: true
        }
      ],
      comments: [],
      activityLog: [
        { id: `act_${Date.now()}`, action: 'Workspace Created', user: 'Arjun Raj', timestamp: 'Just now' }
      ]
    };

    addWorkspace(newWs);
    setCurrentRoute(`/workspaces/${newWs.id}`);
  };

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <div>
        <h1 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>Create New Payment-Gated Workspace</h1>
        <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '2px' }}>Follow the 5-step wizard to publish a secure review link for your client</p>
      </div>

      {/* Steps Indicator Bar */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '16px 24px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {steps.map((s) => (
          <div key={s.num} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                backgroundColor: step === s.num ? 'var(--color-vault-blue)' : step > s.num ? '#10B981' : '#E2E8F0',
                color: step >= s.num ? '#FFFFFF' : '#64748B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '12px'
              }}
            >
              {step > s.num ? '✓' : s.num}
            </div>
            <span style={{ fontSize: '13px', fontWeight: step === s.num ? '700' : '500', color: step === s.num ? 'var(--color-text-main)' : 'var(--color-text-muted)' }} className="hide-mobile">
              {s.title}
            </span>
          </div>
        ))}
      </div>

      {/* Wizard Form Card */}
      <div style={{ backgroundColor: '#FFFFFF', padding: '32px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
        {step === 1 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Step 1: Select Client</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
              {clients.map((cli) => (
                <div
                  key={cli.id}
                  onClick={() => setSelectedClient(cli)}
                  style={{
                    padding: '16px',
                    borderRadius: 'var(--radius-md)',
                    border: selectedClient?.id === cli.id ? '2px solid var(--color-vault-blue)' : '1px solid var(--color-border)',
                    backgroundColor: selectedClient?.id === cli.id ? 'var(--color-vault-blue-light)' : '#FFF',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ fontWeight: '700', color: 'var(--color-text-main)' }}>{cli.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-text-muted)' }}>{cli.company}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-vault-blue)', marginTop: '8px' }}>{cli.email}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Step 2: Enter Project Details</h3>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Workspace / Project Title</label>
              <input
                type="text"
                placeholder="e.g. Brand Identity Design V2"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              >
                <option value="Branding & Graphics">Branding & Graphics</option>
                <option value="Web Design">Web Design</option>
                <option value="Packaging">Packaging</option>
                <option value="Video & Motion">Video & Motion</option>
              </select>
            </div>

            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Deliverable Scope / Notes for Client</label>
              <textarea
                rows={3}
                placeholder="Describe deliverables..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Step 3: Upload Deliverable Files</h3>
            <div
              style={{
                border: '2px dashed var(--color-vault-blue)',
                backgroundColor: 'var(--color-vault-blue-light)',
                borderRadius: 'var(--radius-lg)',
                padding: '40px',
                textAlign: 'center',
                cursor: 'pointer'
              }}
            >
              <Upload size={36} color="var(--color-vault-blue)" style={{ margin: '0 auto 12px auto' }} />
              <div style={{ fontWeight: '700', fontSize: '16px', color: 'var(--color-text-main)' }}>Drag & drop original files here</div>
              <div style={{ fontSize: '12px', color: 'var(--color-text-muted)', marginTop: '4px' }}>Supports ZIP, PDF, FIGMA, AI, PSD, PNG up to 2GB</div>
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '12px 16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '13px', fontWeight: '600' }}>{uploadedFileName} (Simulated Upload)</span>
              <span style={{ fontSize: '12px', color: '#10B981', fontWeight: '700' }}>✓ Ready for Watermarking</span>
            </div>
          </div>
        )}

        {step === 4 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Step 4: Configure Protection & Watermark</h3>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Personalised Watermark Text</label>
              <input
                type="text"
                value={watermarkText}
                onChange={(e) => setWatermarkText(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              />
            </div>

            <div style={{ backgroundColor: '#FEF3C7', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid #F59E0B', fontSize: '13px', color: '#92400E', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <ShieldCheck size={24} />
              <div>
                <strong>Original File Protection:</strong> Previews will be rendered with watermarks. Download buttons will be completely disabled until payment.
              </div>
            </div>
          </div>
        )}

        {step === 5 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '700' }}>Step 5: Set Payment Gate Amount</h3>
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>Required Amount to Unlock Files (₹ INR)</label>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '18px', fontWeight: '700', outline: 'none' }}
              />
            </div>

            <div style={{ backgroundColor: '#F8FAFC', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>Payment Gate Summary:</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-text-main)', marginTop: '4px' }}>Client: {selectedClient.name} ({selectedClient.company})</div>
              <div style={{ fontSize: '14px', fontWeight: '700', color: 'var(--color-vault-blue)' }}>Unlock Gate: ₹{parseInt(amount || 0, 10).toLocaleString()}</div>
            </div>
          </div>
        )}

        {/* Wizard Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '32px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
          {step > 1 ? (
            <button onClick={() => setStep(s => s - 1)} style={{ padding: '10px 20px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontWeight: '600' }}>
              Back
            </button>
          ) : <div />}

          {step < 5 ? (
            <button onClick={() => setStep(s => s + 1)} style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 24px', borderRadius: 'var(--radius-md)', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Next Step <ChevronRight size={16} />
            </button>
          ) : (
            <button onClick={handleFinish} style={{ backgroundColor: 'var(--color-success)', color: '#FFF', padding: '10px 24px', borderRadius: 'var(--radius-md)', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '6px' }}>
              Generate Secure Link ✓
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
