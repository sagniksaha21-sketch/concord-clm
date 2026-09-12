// Fonts are self-hosted rather than pulled from a third-party CDN. This keeps
// enterprise deployments deterministic and avoids a per-page external request.
import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/hanken-grotesk';
import '@fontsource-variable/jetbrains-mono';
import './globals.css';
import './requests/requests.css';
import './premium-glass-2026.css';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import AppShell from '@/components/AppShell';

export const metadata: Metadata = {
  title: 'Concord — Contract Lifecycle Management',
  description:
    'Contract lifecycle management for the Lakmē Lever legal function — intake, AI review, '
    + 'approval, e-signature and obligations, with an immutable audit trail.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  const nonce = headers().get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply a remembered theme before first paint without weakening CSP. */}
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html:
              "try{var t=localStorage.getItem('concord_theme');"
              + "if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);}" 
              + 'catch(e){}',
          }}
        />
      </head>
      <body>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
