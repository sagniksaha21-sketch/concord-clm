import { Injectable, NotFoundException } from '@nestjs/common';
import {
  CLAUSES,
  Clause,
  DraftResult,
  DraftSection,
  TEMPLATES,
  Template,
} from '@concord/shared';
import { GenerateDraftDto } from './generate-draft.dto';
import { TemplateDto } from './template.dto';
import { PrismaService } from '../persistence/prisma.service';
import { fetchWithTimeout } from '../common/http';

/**
 * Authoring: template + clause storage (Postgres when enabled, else in-memory)
 * and AI draft generation. Drafts are assembled from playbook-standard clauses
 * and, when Azure OpenAI is configured, expanded into fuller contract language.
 */
@Injectable()
export class AuthoringService {
  private templates: Template[] = TEMPLATES.map((t) => ({ ...t }));
  private clauses: Clause[] = CLAUSES.map((c) => ({ ...c }));

  constructor(private readonly prisma: PrismaService) {}

  async listTemplates(): Promise<Template[]> {
    if (this.prisma.enabled) return this.prisma.client.template.findMany({ orderBy: { id: 'asc' } });
    return this.templates;
  }

  async listClauses(): Promise<Clause[]> {
    if (this.prisma.enabled) return this.prisma.client.clause.findMany({ orderBy: { id: 'asc' } });
    return this.clauses;
  }

  async getTemplate(id: string): Promise<Template> {
    const t = this.prisma.enabled
      ? await this.prisma.client.template.findUnique({ where: { id } })
      : this.templates.find((x) => x.id === id);
    if (!t) throw new NotFoundException(`Template ${id} not found`);
    return t;
  }

  async createTemplate(dto: TemplateDto): Promise<Template> {
    const template: Template = {
      id: dto.id ?? `TPL-${Date.now().toString(36).toUpperCase()}`,
      name: dto.name,
      contractType: dto.contractType,
      description: dto.description ?? '',
      clauseIds: dto.clauseIds ?? [],
    };
    if (this.prisma.enabled) return this.prisma.client.template.create({ data: template });
    this.templates = [template, ...this.templates];
    return template;
  }

  async updateTemplate(id: string, dto: TemplateDto): Promise<Template> {
    if (this.prisma.enabled) {
      return this.prisma.client.template.update({
        where: { id },
        data: { name: dto.name, contractType: dto.contractType, description: dto.description, clauseIds: dto.clauseIds },
      });
    }
    const idx = this.templates.findIndex((x) => x.id === id);
    if (idx < 0) throw new NotFoundException(`Template ${id} not found`);
    this.templates[idx] = {
      ...this.templates[idx],
      name: dto.name,
      contractType: dto.contractType,
      description: dto.description ?? this.templates[idx].description,
      clauseIds: dto.clauseIds ?? this.templates[idx].clauseIds,
    };
    return this.templates[idx];
  }

  async deleteTemplate(id: string): Promise<{ ok: true }> {
    if (this.prisma.enabled) {
      await this.prisma.client.template.delete({ where: { id } });
      return { ok: true };
    }
    this.templates = this.templates.filter((x) => x.id !== id);
    return { ok: true };
  }

  private get openAiConfigured(): boolean {
    return Boolean(process.env.AZURE_OPENAI_ENDPOINT && process.env.AZURE_OPENAI_API_KEY);
  }

  async generateDraft(dto: GenerateDraftDto): Promise<DraftResult> {
    const template = await this.getTemplate(dto.templateId);
    const clauses = await this.listClauses();
    const title = dto.title ?? `${template.name} — ${dto.counterparty}`;

    const base: DraftSection[] = [
      {
        heading: 'Parties',
        body: `This ${template.name} is entered into between Lakmē Lever Private Limited ("LLPL") and ${dto.counterparty} ("Counterparty").`,
      },
      ...template.clauseIds.map((cid, i) => {
        const c = clauses.find((x) => x.id === cid);
        return { heading: `${i + 1}. ${c ? c.title : cid}`, body: c ? c.text : '(clause not found)' };
      }),
    ];

    if (this.openAiConfigured) {
      try {
        const sections = await this.enrichWithAzure(template, dto.counterparty, base);
        return { templateId: template.id, templateName: template.name, title, counterparty: dto.counterparty, sections, usedClauses: template.clauseIds, model: process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o' };
      } catch {
        /* fall back to assembly */
      }
    }
    return { templateId: template.id, templateName: template.name, title, counterparty: dto.counterparty, sections: base, usedClauses: template.clauseIds, model: 'template-assembly' };
  }

  /** Azure OpenAI: expands skeletal clauses into fuller drafting, same headings. */
  private async enrichWithAzure(
    template: Template,
    counterparty: string,
    sections: DraftSection[],
  ): Promise<DraftSection[]> {
    const endpoint = process.env.AZURE_OPENAI_ENDPOINT!.replace(/\/$/, '');
    const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? 'gpt-4o';
    const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? '2024-08-01-preview';
    const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    const system =
      'You are a legal drafting assistant for Lakmē Lever (India). Expand each ' +
      'skeletal section into clear, enforceable contract language under Indian law, ' +
      'keeping the given headings exactly. Return STRICT JSON ' +
      '{"sections":[{"heading":"...","body":"..."}]}. Do not add or remove headings.';
    const user = `Template: ${template.name} (${template.contractType}). Counterparty: ${counterparty}.\nSections:\n${JSON.stringify(sections)}`;

    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'api-key': process.env.AZURE_OPENAI_API_KEY! },
      body: JSON.stringify({
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Azure OpenAI ${res.status}`);
    const data: any = await res.json();
    const parsed = JSON.parse(data.choices[0].message.content);
    return Array.isArray(parsed.sections) && parsed.sections.length ? parsed.sections : sections;
  }
}
