'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE, login } from '@/app/lib/api';
import { IconCheck, IconShield, IconSparkle } from '@/components/icons';

export default function LoginPage() {
  const showDemo = process.env.NEXT_PUBLIC_SHOW_DEMO_LOGIN === 'true';
  const [email, setEmail] = useState(process.env.NEXT_PUBLIC_DEMO_EMAIL ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await login(email, password);
      try { localStorage.setItem('concord_user', JSON.stringify(r.user)); } catch { /* ignore */ }
      router.push('/');
      router.refresh();
    } catch {
      setErr('We could not sign you in with those credentials.');
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <img className="login-watermark" src="/brand/xcelerate-2026.png" alt="" aria-hidden="true" draggable={false} />

      <section className="login-hero" aria-label="About Concord">
        <img className="login-mark login-mark-wide" src="/brand/lakme-salon.png" alt="Lakmē Salon" draggable={false} />
        <div className="login-eyebrow">Lakmē Lever · Legal operations</div>
        <h1>Contracts, accelerated.<br /><span>Control, insight and execution in one workspace.</span></h1>
        <p>
          Concord brings intake, AI-assisted review, playbook deviations, approvals, signatures,
          obligations and an immutable evidence trail into a single secure legal operating system.
        </p>
        <div className="login-proof-grid">
          <div><IconSparkle /><span><b>Grounded AI</b><small>Answers and reviews trace back to contract content.</small></span></div>
          <div><IconShield /><span><b>Enterprise controls</b><small>RBAC, SSO, audit chaining and protected documents.</small></span></div>
          <div><IconCheck /><span><b>One source of truth</b><small>Every lifecycle state is attached to the contract record.</small></span></div>
        </div>
      </section>

      <section className="login-panel" aria-label="Sign in to Concord">
        <div className="login-card login-card-premium">
          <div className="login-card-head">
            <div className="login-mini-mark">C</div>
            <div>
              <div className="login-title">Welcome to Concord</div>
              <div className="login-sub">Secure legal workspace</div>
            </div>
          </div>

          <div className="login-card-body">
            <a className="sso-button" href={`${API_BASE}/api/auth/sso/login`}>
              <svg viewBox="0 0 23 23" width="18" height="18" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
              </svg>
              Continue with Microsoft
              <span aria-hidden="true">→</span>
            </a>
            <p className="sso-help">Use your Lakmē Lever Microsoft account. Your access level is applied automatically from Entra ID.</p>

            {showDemo && (
              <>
                <div className="login-divider"><span>Development access</span></div>
                <form onSubmit={submit} className="login-form" aria-busy={busy}>
                  <label className="premium-field">
                    <span>Email</span>
                    <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
                  </label>
                  <label className="premium-field">
                    <span>Password</span>
                    <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
                  </label>
                  {err && <div className="form-error" role="alert">{err}</div>}
                  <button className="btn btn-gold login-submit" disabled={busy}>
                    {busy ? 'Signing in…' : 'Sign in to development workspace'}
                  </button>
                </form>
              </>
            )}
          </div>

          <div className="login-trust">
            <span><i />Encrypted session</span>
            <span><i />Role protected</span>
            <span><i />Audited</span>
          </div>
        </div>

        <div className="login-footnote">Concord · Contract Lifecycle Management · Lakmē Lever Private Limited</div>
      </section>
    </main>
  );
}
