import { AuthUser, DraftSection, compareSections } from '@concord/shared';
/** Caller must hold the contract row lock. A version always refers to saved bytes. */
export async function recordVersion(tx: any, input: { documentId: string; contract: any; actor?: AuthUser; guest?: { id: string; name: string; organisation: string }; sections?: DraftSection[]; source: string; reason: string; round?: number }) {
  const previous = await tx.agreementVersion.findFirst({ where: { contractId: input.contract.id }, orderBy: { number: 'desc' } });
  const historical = Number(/^v(\d+)$/.exec(input.contract.version)?.[1] ?? 0);
  const number = previous ? Math.max(previous.number, historical) + 1 : Math.max(1, historical);
  const version = await tx.agreementVersion.create({ data: {
    documentId: input.documentId, contractId: input.contract.id, number, label: `v${number}`,
    authorName: input.actor?.name ?? input.guest?.name ?? 'System', authorUserId: input.actor?.id,
    authorGuestId: input.guest?.id, organisation: input.guest?.organisation ?? 'Lakmē Legal',
    source: input.source, reason: input.reason, stage: input.contract.stage, round: input.round ?? 0,
    ...(input.sections ? { sections: input.sections, changeSummary: compareSections(previous?.sections ?? [], input.sections) } : {}),
  } });
  await tx.contract.update({ where: { id: input.contract.id }, data: { version: version.label, needsNewVersion: false } });
  return version;
}
