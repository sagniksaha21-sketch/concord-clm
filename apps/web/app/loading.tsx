import { LoadingState } from '@/components/WorkspaceUI';

export default function Loading() {
  return <section className="card"><LoadingState label="Opening your workspace" /></section>;
}
