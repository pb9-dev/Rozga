import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../database/prisma.service';
import { OpenRouterClient } from '../openrouter.client';
import { readFile } from 'fs/promises';
import { extname, join } from 'path';
import * as pdfParseModule from 'pdf-parse';
import mammoth from 'mammoth';

export type ToolCallTrace = {
  name: string;
  input: Record<string, unknown>;
  output: Record<string, unknown>;
};

export type InterviewContext = {
  candidate: {
    id: string;
    fullName: string;
    email?: string | null;
    phone?: string | null;
    department?: string | null;
    resumeUrl?: string | null;
    resumeHighlights?: string | null;
    normalized?: Record<string, unknown>;
  };
  batch: {
    id: string;
    name: string;
  };
  job: {
    id: string;
    title: string;
    description: string;
    jdUrl?: string | null;
    jdHighlights?: string | null;
  };
  assignment?: {
    id: string;
    mode: string;
    interviewer?: { id: string; email: string };
  };
};

@Injectable()
export class InterviewToolsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: OpenRouterClient,
  ) {}

  private toUploadPathFromUrl(url: string): string | null {
    let pathname = '';
    try {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        pathname = new URL(url).pathname;
      } else {
        pathname = url;
      }
    } catch {
      return null;
    }

    if (!pathname.startsWith('/uploads/')) return null;
    const rel = pathname.replace(/^\/uploads\//, '');
    if (!rel || rel.includes('..') || rel.includes('\\')) return null;
    return join(process.cwd(), 'apps', 'api', 'uploads', rel);
  }

  private async extractTextFromUploadUrl(url: string): Promise<{ extractedText: string; fileType: string } | null> {
    const absPath = this.toUploadPathFromUrl(url);
    if (!absPath) return null;

    const ext = (extname(absPath) || '').toLowerCase();
    const buf = await readFile(absPath);

    if (ext === '.txt') {
      const text = buf.toString('utf8');
      return { extractedText: text, fileType: 'txt' };
    }

    if (ext === '.pdf') {
      const pdfParseAny = (pdfParseModule as any).default ?? (pdfParseModule as any);
      const data = await pdfParseAny(buf);
      return { extractedText: data.text ?? '', fileType: 'pdf' };
    }

    if (ext === '.docx') {
      const data = await mammoth.extractRawText({ buffer: buf });
      return { extractedText: data.value ?? '', fileType: 'docx' };
    }

    // .doc is not supported (would require a native converter).
    return { extractedText: '', fileType: ext.replace('.', '') || 'unknown' };
  }

  private async summarizeResume(params: { roleTitle: string; jobDescription: string; resumeText: string }) {
    const resumeSlice = params.resumeText.replace(/\s+/g, ' ').trim().slice(0, 20_000);
    if (!resumeSlice) return '';

    const out = await this.llm.chat(
      [
        {
          role: 'system',
          content:
            'You help an interviewer. Summarize the resume into interview-relevant highlights. Output plain text, max 8 bullet lines. Avoid hallucinations; only use what is present.',
        },
        {
          role: 'user',
          content:
            `Role: ${params.roleTitle}\n\nJob description (truncated):\n${params.jobDescription.slice(0, 800)}\n\nResume text (truncated):\n${resumeSlice}`,
        },
      ],
      { maxTokens: 300, temperature: 0.2 },
    );

    return out.trim();
  }

  private async summarizeJd(params: { roleTitle: string; jobDescription: string; jdText: string }) {
    const jdSlice = params.jdText.replace(/\s+/g, ' ').trim().slice(0, 20_000);
    if (!jdSlice) return '';

    const out = await this.llm.chat(
      [
        {
          role: 'system',
          content:
            'You help an interviewer. Extract the must-haves and interview focus areas from the JD. Output plain text, max 8 bullet lines. Avoid hallucinations; only use what is present.',
        },
        {
          role: 'user',
          content:
            `Role: ${params.roleTitle}\n\nJob description (truncated):\n${params.jobDescription.slice(0, 800)}\n\nJD text (truncated):\n${jdSlice}`,
        },
      ],
      { maxTokens: 280, temperature: 0.2 },
    );

    return out.trim();
  }

  /**
   * Tool: fetch_candidate_profile
   * Reads from DB only.
   */
  private async fetchCandidateProfile(tenantId: string, candidateId: string) {
    const row = (await this.prisma.candidate.findFirst({
      where: { tenantId, id: candidateId },
      select: {
        id: true,
        fullName: true,
        email: true,
        phone: true,
        department: true,
        resumeUrl: true,
        normalized: true,
        batch: {
          select: {
            id: true,
            name: true,
            job: { select: { id: true, title: true, description: true, ...( { jdUrl: true } as any ) } as any },
          },
        },
      },
    })) as any;

    return row;
  }

  /**
   * Tool: fetch_interview_assignment (optional)
   * Reads from DB only.
   */
  private async fetchInterviewAssignment(tenantId: string, assignmentId: string) {
    const row = await this.prisma.interviewAssignment.findFirst({
      where: { tenantId, id: assignmentId },
      select: {
        id: true,
        mode: true,
        interviewer: { select: { id: true, email: true } },
      },
    });

    return row;
  }

  /**
   * Returns structured interview context + a compact text summary for prompting.
   * This is the "tool using" component: the coordinator calls this before generating questions.
   */
  async getInterviewContext(params: {
    tenantId: string;
    candidateId: string;
    assignmentId?: string;
    roleTitle?: string;
    requireResume?: boolean;
    requireJd?: boolean;
  }): Promise<{ context: InterviewContext; contextText: string; toolCalls: ToolCallTrace[] }> {
    const toolCalls: ToolCallTrace[] = [];

    const candidateRow = (await this.fetchCandidateProfile(params.tenantId, params.candidateId)) as any;
    if (!candidateRow) {
      // Let caller throw a NotFoundException for consistency; this is purely a tool layer.
      throw new Error('Candidate not found');
    }

    toolCalls.push({
      name: 'fetch_candidate_profile',
      input: { tenantId: params.tenantId, candidateId: params.candidateId },
      output: {
        candidate: {
          id: candidateRow.id,
          fullName: candidateRow.fullName,
          email: candidateRow.email,
          department: candidateRow.department,
          resumeUrl: candidateRow.resumeUrl,
        },
        batch: { id: candidateRow.batch.id, name: candidateRow.batch.name },
        job: { id: candidateRow.batch.job.id, title: candidateRow.batch.job.title },
      },
    });

    let assignment: InterviewContext['assignment'] | undefined;
    if (params.assignmentId) {
      const assignmentRow = await this.fetchInterviewAssignment(params.tenantId, params.assignmentId);
      if (assignmentRow) {
        assignment = {
          id: assignmentRow.id,
          mode: String(assignmentRow.mode),
          interviewer: assignmentRow.interviewer ? { id: assignmentRow.interviewer.id, email: assignmentRow.interviewer.email } : undefined,
        };

        toolCalls.push({
          name: 'fetch_interview_assignment',
          input: { tenantId: params.tenantId, assignmentId: params.assignmentId },
          output: {
            assignment: {
              id: assignmentRow.id,
              mode: String(assignmentRow.mode),
              interviewerEmail: assignmentRow.interviewer?.email,
            },
          },
        });
      }
    }

    const context: InterviewContext = {
      candidate: {
        id: candidateRow.id,
        fullName: candidateRow.fullName,
        email: candidateRow.email,
        phone: candidateRow.phone,
        department: candidateRow.department,
        resumeUrl: candidateRow.resumeUrl,
        resumeHighlights: null,
        normalized: (candidateRow.normalized ?? {}) as Record<string, unknown>,
      },
      batch: {
        id: candidateRow.batch.id,
        name: candidateRow.batch.name,
      },
      job: {
        id: candidateRow.batch.job.id,
        title: candidateRow.batch.job.title,
        description: candidateRow.batch.job.description,
        jdUrl: candidateRow.batch.job.jdUrl,
        jdHighlights: null,
      },
      assignment,
    };

    if (params.requireResume && !context.candidate.resumeUrl) {
      throw new Error('Resume is required');
    }

    if (params.requireJd && !context.job.jdUrl) {
      throw new Error('JD is required');
    }

    // Optional enrichment: if resume/JD are local uploads, extract and summarize.
    const roleTitle = params.roleTitle?.trim() || context.job.title || 'Role';

    if (context.candidate.resumeUrl) {
      const extraction = await this.extractTextFromUploadUrl(context.candidate.resumeUrl).catch(() => null);
      if (extraction) {
        toolCalls.push({
          name: 'extract_upload_text',
          input: { kind: 'resume', url: context.candidate.resumeUrl },
          output: { fileType: extraction.fileType, extractedChars: extraction.extractedText.length },
        });

        if (extraction.extractedText.trim()) {
          const highlights = await this.summarizeResume({
            roleTitle,
            jobDescription: context.job.description,
            resumeText: extraction.extractedText,
          });

          context.candidate.resumeHighlights = highlights || null;
          toolCalls.push({
            name: 'summarize_resume',
            input: { roleTitle, resumeChars: extraction.extractedText.length },
            output: { highlightsChars: (highlights || '').length },
          });
        }
      }
    }

    if (context.job.jdUrl) {
      const extraction = await this.extractTextFromUploadUrl(context.job.jdUrl).catch(() => null);
      if (extraction) {
        toolCalls.push({
          name: 'extract_upload_text',
          input: { kind: 'jd', url: context.job.jdUrl },
          output: { fileType: extraction.fileType, extractedChars: extraction.extractedText.length },
        });

        if (extraction.extractedText.trim()) {
          const highlights = await this.summarizeJd({
            roleTitle,
            jobDescription: context.job.description,
            jdText: extraction.extractedText,
          });

          context.job.jdHighlights = highlights || null;
          toolCalls.push({
            name: 'summarize_jd',
            input: { roleTitle, jdChars: extraction.extractedText.length },
            output: { highlightsChars: (highlights || '').length },
          });
        }
      }
    }

    const normalizedKeys = context.candidate.normalized ? Object.keys(context.candidate.normalized).slice(0, 12) : [];

    const contextText =
      `Candidate: ${context.candidate.fullName}` +
      (context.candidate.department ? `\nDepartment: ${context.candidate.department}` : '') +
      (context.candidate.resumeUrl ? `\nResume URL: ${context.candidate.resumeUrl}` : '') +
      (context.candidate.resumeHighlights ? `\nResume highlights:\n${context.candidate.resumeHighlights}` : '') +
      (normalizedKeys.length ? `\nNormalized fields: ${normalizedKeys.join(', ')}` : '') +
      `\nBatch: ${context.batch.name}` +
      `\nJob: ${context.job.title}` +
      (context.job.jdUrl ? `\nJD URL: ${context.job.jdUrl}` : '') +
      (context.job.jdHighlights ? `\nJD highlights:\n${context.job.jdHighlights}` : '') +
      `\nJob description: ${context.job.description.slice(0, 600)}` +
      (context.assignment ? `\nInterview mode: ${context.assignment.mode}` : '');

    return { context, contextText, toolCalls };
  }
}
