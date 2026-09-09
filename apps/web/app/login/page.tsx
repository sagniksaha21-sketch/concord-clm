'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { API_BASE, login } from '@/app/lib/api';

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
    <main className="login-shell login-original">
      <img className="login-watermark" src="/brand/xcelerate-2026.png" alt="" aria-hidden="true" draggable={false} />
      <section className="login-original-content" aria-label="Sign in to Concord">
        <header className="login-brand-lockup">
          <img className="login-mark login-mark-wide" src="/brand/lakme-salon.png" alt="Lakmē Salon" draggable={false} />
          <div className="login-product-line">Concord · Contract Lifecycle Management</div>
          <div className="login-owner-line"><img className="login-lever-logo" src="/brand/lakme-lever-logo.png" alt="Lakmē Lever" draggable={false} /><span>LAKMĒ LEVER · LEGAL</span></div>
        </header>

        <div className="login-card login-card-original">
          <h1 className="sr-only">Sign in to Concord</h1>
          <div className="login-card-body">
            {showDemo && <form onSubmit={submit} className="login-form" aria-busy={busy}>
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
                <span>{busy ? 'Signing in…' : 'Sign in'}</span><span aria-hidden="true">→</span>
              </button>
            </form>}

            {showDemo && <div className="login-divider"><span>or</span></div>}
            <a className="sso-button" href={`${API_BASE}/api/auth/sso/login`}>
              <svg viewBox="0 0 23 23" width="18" height="18" aria-hidden="true">
                <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
              </svg>
              <span>Sign in with Microsoft</span>
              <span aria-hidden="true">→</span>
            </a>
            <p className="sso-help">Production uses Microsoft Entra ID SSO.</p>
          </div>

          <div className="login-trust">
            <span><i />Encrypted session</span>
            <span><i />Role protected</span>
            <span><i />Audited</span>
          </div>
        </div>

        <footer className="login-build-line">Built by Lakmē Legal for Lakmē Lever.</footer>
      </section>
    </main>
  );
}
