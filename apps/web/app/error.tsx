'use client';

import { ErrorState } from '@/components/WorkspaceUI';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <section className="card"><ErrorState title="This workspace could not be opened"
    action={<button className="btn" onClick={reset}>Try again</button>}>
    Please try again. If the problem continues, return to the Command Center.
  </ErrorState></section>;
}
