import React from 'react';
import { useApp } from '../context/AppContext';
import { Lock, ArrowRight, ShieldCheck, Zap, Download, FileText, CheckCircle2 } from 'lucide-react';

export const LandingPage = () => {
  const { setCurrentRoute } = useApp();

  return (
    <div style={{ backgroundColor: 'var(--color-vault-navy)', minHeight: '100vh', color: '#FFFFFF' }}>
      {/* Navbar */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '24px 48px', maxWidth: '1280px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lock size={20} color="#FFF" />
          </div>
          <span style={{ fontSize: '20px', fontWeight: '800', letterSpacing: '-0.02em' }}>PROJECT VAULT</span>
        </div>

        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <button onClick={() => setCurrentRoute('/login')} style={{ color: '#94A3B8', fontWeight: '600', fontSize: '14px' }}>Sign In</button>
          <button onClick={() => setCurrentRoute('/register')} style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '10px 20px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '14px' }}>
            Get Started Free
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section style={{ textAlign: 'center', padding: '80px 24px 60px 24px', maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', backgroundColor: 'var(--color-vault-navy-light)', padding: '6px 16px', borderRadius: 'var(--radius-full)', color: 'var(--color-vault-blue)', fontSize: '13px', fontWeight: '600', marginBottom: '24px' }}>
          <ShieldCheck size={16} /> Payment-Gated Delivery Platform for Creators
        </div>
        <h1 style={{ fontSize: '56px', fontWeight: '800', lineHeight: 1.1, marginBottom: '24px', letterSpacing: '-0.03em' }}>
          Never Get Ghosted Before Getting Paid Again
        </h1>
        <p style={{ fontSize: '18px', color: '#94A3B8', marginBottom: '36px', lineHeight: 1.6 }}>
          Share watermarked work previews securely with clients. Automatically lock original download files until full payment is completed through simulated payment-gated delivery.
        </p>

        <div style={{ display: 'flex', justifyContent: 'center', gap: '16px' }}>
          <button onClick={() => setCurrentRoute('/dashboard')} style={{ backgroundColor: 'var(--color-vault-blue)', color: '#FFF', padding: '16px 32px', borderRadius: 'var(--radius-md)', fontWeight: '700', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
            Explore Creator Dashboard Prototype <ArrowRight size={18} />
          </button>
          <button onClick={() => setCurrentRoute('/review/sec_tok_brand_identity_99')} style={{ backgroundColor: 'var(--color-vault-navy-light)', color: '#FFF', padding: '16px 28px', borderRadius: 'var(--radius-md)', fontWeight: '600', fontSize: '16px', border: '1px solid rgba(255,255,255,0.1)' }}>
            Try Live Client Review Demo
          </button>
        </div>
      </section>

      {/* Features Grid */}
      <section style={{ maxWidth: '1100px', margin: '60px auto', padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
        <div style={{ backgroundColor: 'var(--color-vault-navy-light)', padding: '32px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <Lock size={24} color="var(--color-vault-blue)" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>Dynamic Watermarking</h3>
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Personalised overlay watermarks stamped across high-res client previews to prevent unreleased usage.</p>
        </div>

        <div style={{ backgroundColor: 'var(--color-vault-navy-light)', padding: '32px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <Zap size={24} color="var(--color-vault-blue)" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>Automated File Unlock</h3>
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Clients pay ₹25,000 via UPI/Card and immediately unlock original clean vector, zip, and raw assets.</p>
        </div>

        <div style={{ backgroundColor: 'var(--color-vault-navy-light)', padding: '32px', borderRadius: 'var(--radius-lg)', border: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', backgroundColor: 'rgba(37, 99, 235, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '20px' }}>
            <FileText size={24} color="var(--color-vault-blue)" />
          </div>
          <h3 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '12px' }}>Version Control & Feedback</h3>
          <p style={{ color: '#94A3B8', fontSize: '14px' }}>Pin comments directly onto files, request version revisions, and keep proof of approval log.</p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: '1px solid var(--color-vault-navy-light)', padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '13px' }}>
        © 2026 Project Vault UI V1.0. All Rights Reserved. Clean frontend prototype.
      </footer>
    </div>
  );
};
