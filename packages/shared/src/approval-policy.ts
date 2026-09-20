export interface ApprovalConditions {
  risks?: string[];
  agreementTypes?: string[];
  businessUnits?: string[];
  jurisdictions?: string[];
  minimumValue?: number;
  currency?: string;
  personalData?: boolean;
  exclusivity?: boolean;
  indemnity?: boolean;
}
export interface ApprovalPolicy {
  id: string; name: string; enabled: boolean; revision: number;
  conditions: ApprovalConditions; approvers: string[]; updatedAt?: string;
}
export interface ApprovalRequirement {
  policyId: string; revision: number; name: string; approvers: string[]; reason: string;
}
/** Unknown facts conservatively require the approval; they never silently exempt it. */
export function evaluateApprovalPolicies(policies: ApprovalPolicy[], contract: any): ApprovalRequirement[] {
  const terms = contract.intakeRequest?.terms ?? {};
  const normalized = (v: unknown) => String(v ?? '').trim().toLowerCase();
  return policies.filter(p => p.enabled).flatMap(policy => {
    const c = policy.conditions, unknown: string[] = [];
    const matches = (allowed: string[] | undefined, value: unknown, label: string) => {
      if (!allowed?.length) return true;
      if (!normalized(value)) { unknown.push(label); return true; }
      return allowed.some(v => normalized(v) === normalized(value));
    };
    if (!matches(c.risks, contract.risk, 'risk') || !matches(c.agreementTypes, contract.type, 'agreement type') ||
        !matches(c.businessUnits, contract.intakeRequest?.businessUnit, 'business unit') || !matches(c.jurisdictions, terms.governingLaw, 'jurisdiction')) return [];
    if (c.minimumValue !== undefined) {
      const amount = String(terms.amount ?? '').trim();
      // No implicit currency conversion or parsing of abbreviated display values.
      if (!/^\d+(\.\d{1,2})?$/.test(amount) || !terms.currency || normalized(terms.currency) !== normalized(c.currency)) unknown.push('value in policy currency');
      else if (Number(amount) < c.minimumValue) return [];
    }
    if (c.personalData) {
      if (terms.dataInvolved === 'none') return [];
      if (!terms.dataInvolved || terms.dataInvolved === 'unsure') unknown.push('personal data');
    }
    for (const [flag, value] of [[c.exclusivity, terms.exclusivity], [c.indemnity, terms.indemnityConcerns]]) {
      if (!flag) continue;
      if (!normalized(value)) unknown.push('non-standard terms');
      else if (['no', 'none', 'not applicable'].includes(normalized(value))) return [];
    }
    return [{ policyId: policy.id, revision: policy.revision, name: policy.name, approvers: policy.approvers,
      reason: `${policy.name}${unknown.length ? ` — confirm ${[...new Set(unknown)].join(', ')}; approval retained conservatively` : ' — configured approval policy applies'}` }];
  });
}
