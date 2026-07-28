import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import { Lock, Mail, Key, ArrowRight, CheckCircle, Shield } from 'lucide-react';

export const AuthScreens = ({ mode = 'login' }) => {
  const { setCurrentRoute, showToast } = useApp();
  const [email, setEmail] = useState(mode === 'login' ? 'arjun@example.com' : '');
  const [password, setPassword] = useState('••••••••');
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (mode === 'login') {
      showToast('Logged in as Arjun Raj (Creator)', 'success');
      setCurrentRoute('/dashboard');
    } else if (mode === 'register') {
      showToast('Account created successfully!', 'success');
      setCurrentRoute('/dashboard');
    } else {
      showToast('Password reset link sent to your email!', 'info');
      setCurrentRoute('/login');
    }
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--color-vault-navy)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: 'var(--radius-lg)', width: '100%', maxWidth: '440px', padding: '40px', boxShadow: 'var(--shadow-lg)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--color-vault-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto' }}>
            <Lock size={24} color="#FFF" />
          </div>
          <h2 style={{ fontSize: '24px', fontWeight: '800', color: 'var(--color-text-main)' }}>
            {mode === 'login' && 'Sign in to Project Vault'}
            {mode === 'register' && 'Create Freelancer Account'}
            {mode === 'forgot' && 'Reset Password'}
          </h2>
          <p style={{ fontSize: '14px', color: 'var(--color-text-muted)', marginTop: '6px' }}>
            {mode === 'login' && 'Enter your credentials to access your workspaces'}
            {mode === 'register' && 'Start delivering payment-gated work to clients'}
            {mode === 'forgot' && 'We will send a recovery link to your inbox'}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {mode === 'register' && (
            <div>
              <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-main)', display: 'block', marginBottom: '6px' }}>Full Name</label>
              <input
                type="text"
                placeholder="Arjun Raj"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={{ width: '100%', padding: '10px 14px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              />
            </div>
          )}

          <div>
            <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-main)', display: 'block', marginBottom: '6px' }}>Email Address</label>
            <div style={{ position: 'relative' }}>
              <Mail size={18} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="arjun@example.com"
                style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
              />
            </div>
          </div>

          {mode !== 'forgot' && (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <label style={{ fontSize: '13px', fontWeight: '600', color: 'var(--color-text-main)' }}>Password</label>
                {mode === 'login' && (
                  <button type="button" onClick={() => setCurrentRoute('/forgot-password')} style={{ fontSize: '12px', color: 'var(--color-vault-blue)', fontWeight: '500' }}>
                    Forgot?
                  </button>
                )}
              </div>
              <div style={{ position: 'relative' }}>
                <Key size={18} color="#94A3B8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  style={{ width: '100%', padding: '10px 14px 10px 40px', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)', fontSize: '14px', outline: 'none' }}
                />
              </div>
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              backgroundColor: 'var(--color-vault-blue)',
              color: '#FFF',
              padding: '12px',
              borderRadius: 'var(--radius-md)',
              fontWeight: '600',
              fontSize: '15px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginTop: '10px'
            }}
          >
            {mode === 'login' && 'Sign In'}
            {mode === 'register' && 'Create Account'}
            {mode === 'forgot' && 'Send Reset Link'}
            <ArrowRight size={18} />
          </button>
        </form>

        <div style={{ marginTop: '24px', textAlign: 'center', fontSize: '13px', color: 'var(--color-text-muted)' }}>
          {mode === 'login' ? (
            <span>Don't have an account? <button onClick={() => setCurrentRoute('/register')} style={{ color: 'var(--color-vault-blue)', fontWeight: '600' }}>Sign Up</button></span>
          ) : (
            <span>Already have an account? <button onClick={() => setCurrentRoute('/login')} style={{ color: 'var(--color-vault-blue)', fontWeight: '600' }}>Sign In</button></span>
          )}
        </div>
      </div>
    </div>
  );
};
