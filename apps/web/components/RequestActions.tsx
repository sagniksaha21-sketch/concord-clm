'use client';
import { useEffect, useState } from 'react';
import type { ClientRequest, LegalTeamMember } from '@concord/shared';
import { actOnRequest, getRequestOptions } from '@/app/lib/api';
import { errorMessage, RequestError } from './RequestUI';
export default function RequestActions({ item, onChange }: { item: ClientRequest; onChange: (item: ClientRequest) => void }) {
  const [team,setTeam] = useState<LegalTeamMember[]>([]); const [assignee,setAssignee] = useState(item.assignedLegal.id); const [note,setNote] = useState(''); const [busy,setBusy] = useState(false); const [error,setError] = useState('');
  useEffect(() => { getRequestOptions().then(r => setTeam(r.legalTeam)).catch(() => undefined); }, []);
  async function act(action: 'accept' | 'reassign' | 'close') { if (busy) return; if (action === 'close' && !note.trim()) { setError('Explain why this request is being closed.'); return; } setBusy(true); setError(''); try { onChange(await actOnRequest(item.id, { action, version: item.version, note: note.trim() || undefined, assignedLegalUserId: assignee })); } catch(e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  if (!item.canManage || item.status === 'closed') return null;
  return <div className="request-actions">{item.contractStage === 'intake' && <button className="btn btn-gold" disabled={busy} onClick={() => void act('accept')}>{busy ? 'Saving…' : 'Accept request & start drafting'}</button>}<details className="workflow-disclosure"><summary>Assignment &amp; request options</summary><div className="req-fields"><label className="req-field wide">Legal owner<select disabled={busy} value={assignee} onChange={e => setAssignee(e.target.value)}>{team.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="btn" disabled={busy || assignee === item.assignedLegal.id} onClick={() => void act('reassign')}>Reassign</button>{item.contractStage === 'intake' && <><label className="req-field wide">Reason for closing<textarea maxLength={2000} value={note} onChange={e => setNote(e.target.value)} /></label><button className="btn" disabled={busy || !note.trim()} onClick={() => void act('close')}>Reject / close request</button></>}</div></details>{error && <RequestError message={error} />}</div>;
}
