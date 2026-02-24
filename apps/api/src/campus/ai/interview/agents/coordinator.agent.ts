import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../database/prisma.service';
import { DepthProbeAgent } from './depth-probe.agent';
import type { Difficulty, NextQuestion, QuestionFocus } from './interviewer.agent';
import { InterviewerAgent } from './interviewer.agent';
import { EvaluatorAgent } from './evaluator.agent';
import { ClassifierAgent } from './classifier.agent';
import { InterviewToolsService } from '../tools/interview-tools.service';

type PrismaWithAiInterview = PrismaService & {
  aiInterviewSession: any;
  aiInterviewTurn: any;
  aiInterviewEvaluation: any;
};

type SessionState = {
  questionCount: number;
  followUpsForCurrentQuestion: number;
  difficulty: Difficulty;
  currentQuestion?: NextQuestion;
  askedQuestions?: string[];
  nonAnswerCount?: number;
  cheatingSuspectCount?: number;
  priorQAPairs: Array<{ question: string; answer: string; depthScore?: number }>;
  scoring?: {
    total: number;
    byDifficulty: Record<Difficulty, number>;
    history: Array<{
      questionIndex: number;
      difficulty: Difficulty;
      points: number;
      depthScore: number;
      intent: string;
      quality: string;
      cheatingSuspected?: boolean;
      confidence?: number;
    }>;
  };
  context?: {
    contextText: string;
    context: Record<string, unknown>;
  };
  lastDecision?: {
    action: string;
    reason: string;
    at: string;
    data?: Record<string, unknown>;
  };
  policy?: {
    resumeFirstMainQuestions?: number;
  };
};

const DEFAULTS = {
  maxQuestions: 5,
  maxFollowUps: 2,
  maxTotalTurns: 30,
} as const;
const EARLY_EXIT_NONANSWER_ENV = 'AI_INTERVIEW_EARLY_EXIT_NONANSWER_THRESHOLD';

function toIntEnv(name: string, fallback: number) {
  const raw = (process.env[name] ?? '').trim();
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function normalizeQuestionKey(q: string) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 400);
}

function isNonAnswer(text: string) {
  const t = text.trim().toLowerCase();
  if (!t) return true;
  // Common "I don't know" variants
  if (
    t === 'idk' ||
    t === "i don't know" ||
    t === 'dont know' ||
    t === 'i dont know' ||
    t === 'not sure' ||
    t === 'no idea' ||
    t === "i'm not sure" ||
    t === 'na' ||
    t === 'n/a'
  ) {
    return true;
  }
  if (/(^|\b)(i\s*(do\s*)?n't\s*know|idk|no\s*idea|not\s*sure|can't\s*remember|cannot\s*remember)(\b|$)/i.test(text)) {
    return true;
  }
  return false;
}

@Injectable()
export class CoordinatorAgent {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly interviewer: InterviewerAgent,
    private readonly depthProbe: DepthProbeAgent,
    private readonly evaluator: EvaluatorAgent,
    private readonly classifier: ClassifierAgent,
    private readonly tools: InterviewToolsService,
  ) {}

  private get aiPrisma(): PrismaWithAiInterview {
    return this.prisma as PrismaWithAiInterview;
  }

  private async withSessionLock<T>(sessionId: string, fn: (tx: any) => Promise<T>): Promise<T> {
    // Advisory lock prevents concurrent submitAnswer/endSession races (duplicate indices, double-evaluation, etc).
    // Uses a transaction-scoped lock.
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${sessionId}))`);
        return fn(tx);
      },
      {
        timeout: 20000,
      },
    );
  }

  async startSession(params: {
    tenantId: string;
    actorUserId?: string;
    dto: {
      candidateId: string;
      assignmentId?: string;
      roleTitle: string;
      seniority?: 'intern' | 'junior' | 'mid' | 'senior';
      maxQuestions?: number;
      maxFollowUps?: number;
      maxTotalTurns?: number;
    };
    questionPolicy?: {
      resumeFirstMainQuestions?: number;
    };
    contextRequirements?: {
      requireResume?: boolean;
      requireJd?: boolean;
    };
  }) {
    const { tenantId, actorUserId, dto } = params;

    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, tenantId },
      select: { id: true },
    });
    if (!candidate) throw new NotFoundException('Candidate not found');

    let assignmentId: string | undefined;
    if (dto.assignmentId) {
      const assignment = await this.prisma.interviewAssignment.findFirst({
        where: { id: dto.assignmentId, tenantId, candidateId: dto.candidateId },
        select: { id: true },
      });
      if (!assignment) throw new NotFoundException('Interview assignment not found');
      assignmentId = assignment.id;
    }

    const maxQuestions = dto.maxQuestions ?? DEFAULTS.maxQuestions;
    const maxFollowUps = dto.maxFollowUps ?? DEFAULTS.maxFollowUps;
    const maxTotalTurns = dto.maxTotalTurns ?? DEFAULTS.maxTotalTurns;

    const initialState: SessionState = {
      questionCount: 0,
      followUpsForCurrentQuestion: 0,
      difficulty: 'EASY',
      priorQAPairs: [],
      askedQuestions: [],
      nonAnswerCount: 0,
      cheatingSuspectCount: 0,
      policy: {
        resumeFirstMainQuestions: params.questionPolicy?.resumeFirstMainQuestions ?? 0,
      },
      scoring: {
        total: 0,
        byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 },
        history: [],
      },
    };

    // Tool use: fetch candidate/job context from DB.
    let contextText = '';
    let contextJson: Record<string, unknown> = {};
    try {
      const ctx = await this.tools.getInterviewContext({
        tenantId,
        candidateId: dto.candidateId,
        assignmentId,
        roleTitle: dto.roleTitle,
        requireResume: params.contextRequirements?.requireResume,
        requireJd: params.contextRequirements?.requireJd,
      });
      contextText = ctx.contextText;
      contextJson = ctx.context as unknown as Record<string, unknown>;
      initialState.context = { contextText, context: contextJson };
    } catch (e) {
      if (params.contextRequirements?.requireResume || params.contextRequirements?.requireJd) {
        throw new BadRequestException(e instanceof Error ? e.message : 'Required interview context missing');
      }
      // Best-effort; interview can still proceed without tool context.
    }

    const created = await this.aiPrisma.aiInterviewSession.create({
      data: {
        tenantId,
        candidateId: dto.candidateId,
        assignmentId,
        startedByUserId: actorUserId,
        roleTitle: dto.roleTitle,
        maxQuestions,
        maxFollowUps,
        maxTotalTurns,
        state: initialState as unknown as Prisma.InputJsonValue,
      },
      select: { id: true, roleTitle: true, maxQuestions: true, maxFollowUps: true, maxTotalTurns: true },
    });

    const focus: QuestionFocus =
      (initialState.policy?.resumeFirstMainQuestions ?? 0) > 0 && initialState.questionCount < (initialState.policy?.resumeFirstMainQuestions ?? 0)
        ? 'RESUME'
        : 'JD';

    const next = await this.interviewer.generateNextQuestion({
      roleTitle: dto.roleTitle,
      seniority: dto.seniority,
      difficulty: initialState.difficulty,
      priorQAPairs: initialState.priorQAPairs,
      askedQuestions: initialState.askedQuestions,
      contextText,
      focus,
    });

    const state: SessionState = {
      ...initialState,
      currentQuestion: next,
      askedQuestions: [normalizeQuestionKey(next.question)],
    };

    await this.appendTurn(created.id, {
      kind: 'QUESTION',
      speaker: 'ASSISTANT',
      content: this.formatQuestion(next),
      meta: { agent: 'InterviewerAgent', question: next, questionIndex: 1 },
    });

    await this.aiPrisma.aiInterviewSession.update({
      where: { id: created.id },
      data: { state: state as unknown as Prisma.InputJsonValue },
    });

    return {
      sessionId: created.id,
      status: 'ACTIVE',
      limits: { maxQuestions: created.maxQuestions, maxFollowUps: created.maxFollowUps, maxTotalTurns: created.maxTotalTurns },
      nextPrompt: this.formatQuestion(next),
    };
  }

  async submitAnswer(params: { tenantId: string; actorUserId: string; sessionId: string; answer: string }) {
    const { tenantId, sessionId, answer } = params;
    const earlyExitNonAnswerThreshold = toIntEnv(EARLY_EXIT_NONANSWER_ENV, 3);

    return this.withSessionLock(sessionId, async (tx) => {
      const session = await tx.aiInterviewSession.findFirst({
        where: { id: sessionId, tenantId },
        select: {
          id: true,
          tenantId: true,
          roleTitle: true,
          status: true,
          maxQuestions: true,
          maxFollowUps: true,
          maxTotalTurns: true,
          state: true,
          turns: { orderBy: { index: 'asc' }, select: { index: true, kind: true, speaker: true, content: true, meta: true } },
        },
      });
      if (!session) throw new NotFoundException('Session not found');
      if (session.status !== 'ACTIVE') throw new BadRequestException('Session is not active');

      const state = (session.state ?? {}) as SessionState;
      if (!state.currentQuestion) throw new BadRequestException('Session has no active question');

      if (session.turns.length >= session.maxTotalTurns) {
        return this.endSessionInternal({ tx, tenantId, actorUserId: params.actorUserId, sessionId, reason: 'maxTotalTurns' });
      }

      const trimmedAnswer = answer.trim();
      const nonAnswer = isNonAnswer(trimmedAnswer);
      state.nonAnswerCount = (state.nonAnswerCount ?? 0) + (nonAnswer ? 1 : 0);

      const answerRow = await this.appendTurnWith(tx, sessionId, {
        kind: 'ANSWER',
        speaker: 'CANDIDATE',
        content: trimmedAnswer,
        meta: {
          agent: 'Candidate',
          questionIndex: state.questionCount + 1,
          followUpIndex: state.followUpsForCurrentQuestion,
          nonAnswer,
        },
      });

      // Probe against the actual last assistant prompt (QUESTION vs FOLLOW_UP).
      const lastPrompt = [...session.turns]
        .reverse()
        .find((t) => t.speaker === 'ASSISTANT' && (t.kind === 'QUESTION' || t.kind === 'FOLLOW_UP'));

      const probeQuestion = lastPrompt?.content || state.currentQuestion.question;
      const probeExpectedTopics = lastPrompt?.kind === 'QUESTION' ? state.currentQuestion.expectedTopics : [];

      const probe = nonAnswer
        ? {
            answerDepthScore: 1,
            needsFollowUp: false,
            keyGaps: ['Candidate did not attempt / did not know'],
          }
        : await this.depthProbe.analyzeAnswer({
            roleTitle: session.roleTitle,
            question: probeQuestion,
            expectedTopics: probeExpectedTopics,
            answer: trimmedAnswer,
          });

      // Classify the message for scoring/difficulty routing. Rule-based non-answer stays rule-based.
      const classification = nonAnswer
        ? {
            intent: 'NON_ANSWER',
            quality: 'POOR',
            recommendedDifficultyShift: 'DOWN',
            cheatingSuspected: false,
            cheatingSignals: [],
            confidence: 0.99,
            notes: 'rule:isNonAnswer',
          }
        : await this.classifier.classifyAnswer({
            roleTitle: session.roleTitle,
            difficulty: state.currentQuestion.difficulty,
            question: probeQuestion,
            expectedTopics: probeExpectedTopics,
            answer: trimmedAnswer,
          });

      // Attach depth-probe analysis to the answer turn for demo traceability.
      try {
        const existingMeta = (answerRow as any)?.meta && typeof (answerRow as any).meta === 'object' ? ((answerRow as any).meta as Record<string, unknown>) : {};
        await tx.aiInterviewTurn.update({
          where: { id: (answerRow as any).id as string },
          data: {
            meta: {
              ...existingMeta,
              analyzedBy: 'DepthProbeAgent',
              depthProbe: {
                answerDepthScore: probe.answerDepthScore,
                needsFollowUp: probe.needsFollowUp,
                keyGaps: probe.keyGaps,
                followUpQuestion: probe.needsFollowUp ? probe.followUpQuestion : undefined,
              },
              classifier: {
                intent: classification.intent,
                quality: classification.quality,
                recommendedDifficultyShift: (classification as any).recommendedDifficultyShift,
                cheatingSuspected: classification.cheatingSuspected,
                cheatingSignals: (classification as any).cheatingSignals ?? [],
                confidence: classification.confidence,
                notes: (classification as any).notes,
              },
            } as unknown as Prisma.InputJsonValue,
          },
        });
      } catch {
        // Best-effort only; never break the interview flow for trace metadata.
      }

      // Track cheating suspicion count (do not hard-block the interview based on text-only heuristics).
      if (classification.cheatingSuspected && classification.confidence >= 0.75) {
        state.cheatingSuspectCount = (state.cheatingSuspectCount ?? 0) + 1;
      }

      // Optional early exit: if candidate repeatedly cannot answer, end professionally.
      if ((state.nonAnswerCount ?? 0) >= earlyExitNonAnswerThreshold && state.questionCount >= 1) {
        await tx.aiInterviewSession.update({
          where: { id: sessionId },
          data: { state: state as unknown as Prisma.InputJsonValue },
        });
        return this.endSessionInternal({ tx, tenantId, actorUserId: params.actorUserId, sessionId, reason: 'earlyExitNonAnswer' });
      }

      // If we can still ask follow-ups for the current question, do it.
      if (!nonAnswer && probe.needsFollowUp && state.followUpsForCurrentQuestion < session.maxFollowUps) {
        state.followUpsForCurrentQuestion += 1;

        const followUp = probe.followUpQuestion!;

        await this.appendTurnWith(tx, sessionId, {
          kind: 'FOLLOW_UP',
          speaker: 'ASSISTANT',
          content: followUp,
          meta: {
            agent: 'DepthProbeAgent',
            questionIndex: state.questionCount + 1,
            followUpIndex: state.followUpsForCurrentQuestion,
            keyGaps: probe.keyGaps,
            depthScore: probe.answerDepthScore,
          },
        });

        state.lastDecision = {
          action: 'ASK_FOLLOW_UP',
          reason: 'DepthProbe needsFollowUp and budget remains',
          at: new Date().toISOString(),
          data: { followUpIndex: state.followUpsForCurrentQuestion, maxFollowUps: session.maxFollowUps },
        };

        await tx.aiInterviewSession.update({
          where: { id: sessionId },
          data: { state: state as unknown as Prisma.InputJsonValue },
        });

        return {
          sessionId,
          status: 'ACTIVE',
          nextPrompt: followUp,
        };
      }

      // Close out this question and move on.
      state.questionCount += 1;
      state.followUpsForCurrentQuestion = 0;

      // Track prior QA for adaptive questioning.
      state.priorQAPairs = [...(state.priorQAPairs ?? []), { question: state.currentQuestion.question, answer: trimmedAnswer, depthScore: probe.answerDepthScore }].slice(-6);

      // Award points for the question (stored separately per difficulty).
      const currentDifficulty = state.currentQuestion.difficulty;
      const base = currentDifficulty === 'HARD' ? 3 : currentDifficulty === 'MEDIUM' ? 2 : 1;
      const qualityMultiplier =
        classification.quality === 'EXCELLENT' ? 1.25 : classification.quality === 'GOOD' ? 1 : classification.quality === 'FAIR' ? 0.5 : 0;
      const depthBonus = probe.answerDepthScore >= 4 ? 0.25 : probe.answerDepthScore <= 2 ? -0.1 : 0;

      let pointsAwarded = Math.max(0, base * qualityMultiplier + depthBonus);
      if (classification.cheatingSuspected && classification.confidence >= 0.75) {
        pointsAwarded *= 0.5;
      }
      pointsAwarded = Math.round(pointsAwarded * 100) / 100;

      if (!state.scoring) {
        state.scoring = { total: 0, byDifficulty: { EASY: 0, MEDIUM: 0, HARD: 0 }, history: [] };
      }
      state.scoring.total = Math.round((state.scoring.total + pointsAwarded) * 100) / 100;
      state.scoring.byDifficulty[currentDifficulty] =
        Math.round((state.scoring.byDifficulty[currentDifficulty] + pointsAwarded) * 100) / 100;
      state.scoring.history = [
        ...(state.scoring.history ?? []),
        {
          questionIndex: state.questionCount,
          difficulty: currentDifficulty,
          points: pointsAwarded,
          depthScore: probe.answerDepthScore,
          intent: classification.intent,
          quality: classification.quality,
          cheatingSuspected: classification.cheatingSuspected,
          confidence: classification.confidence,
        },
      ].slice(-40);

      // Difficulty adaptation: combine depth probe + classifier recommendation.
      const depthShift = probe.answerDepthScore >= 4 ? 'UP' : probe.answerDepthScore <= 2 ? 'DOWN' : 'SAME';
      const clsShift = (classification as any).recommendedDifficultyShift as 'UP' | 'SAME' | 'DOWN';

      const combinedShift = clsShift === 'DOWN' || depthShift === 'DOWN' ? 'DOWN' : clsShift === 'UP' || depthShift === 'UP' ? 'UP' : 'SAME';

      state.difficulty = this.applyDifficultyShift(state.difficulty, combinedShift);

      if (state.questionCount >= session.maxQuestions) {
        await tx.aiInterviewSession.update({
          where: { id: sessionId },
          data: { state: state as unknown as Prisma.InputJsonValue },
        });
        return this.endSessionInternal({ tx, tenantId, actorUserId: params.actorUserId, sessionId, reason: 'maxQuestions' });
      }

      const next = await this.interviewer.generateNextQuestion({
        roleTitle: session.roleTitle,
        difficulty: state.difficulty,
        priorQAPairs: state.priorQAPairs,
        askedQuestions: state.askedQuestions,
        contextText: state.context?.contextText,
        focus:
          (state.policy?.resumeFirstMainQuestions ?? 0) > 0 && state.questionCount < (state.policy?.resumeFirstMainQuestions ?? 0)
            ? 'RESUME'
            : 'JD',
      });
      state.currentQuestion = next;

      state.askedQuestions = [...(state.askedQuestions ?? []), normalizeQuestionKey(next.question)].slice(-12);
      state.lastDecision = {
        action: 'ASK_NEXT_QUESTION',
        reason: 'Continue with adapted difficulty',
        at: new Date().toISOString(),
        data: { difficulty: state.difficulty, lastDepthScore: probe.answerDepthScore },
      };

      const prompt = this.formatQuestion(next);
      await this.appendTurnWith(tx, sessionId, {
        kind: 'QUESTION',
        speaker: 'ASSISTANT',
        content: prompt,
        meta: {
          agent: 'InterviewerAgent',
          question: next,
          questionIndex: state.questionCount + 1,
          decision: { difficulty: state.difficulty, lastDepthScore: probe.answerDepthScore },
        },
      });

      await tx.aiInterviewSession.update({
        where: { id: sessionId },
        data: { state: state as unknown as Prisma.InputJsonValue },
      });

      return { sessionId, status: 'ACTIVE', nextPrompt: prompt };
    });
  }

  async endSession(params: { tenantId: string; actorUserId: string; sessionId: string }) {
    const { tenantId, sessionId } = params;
    return this.withSessionLock(sessionId, async (tx) => {
      return this.endSessionInternal({ tx, tenantId, actorUserId: params.actorUserId, sessionId });
    });
  }

  private async endSessionInternal(params: {
    tx: any;
    tenantId: string;
    actorUserId: string;
    sessionId: string;
    reason?: string;
  }) {
    const { tenantId, sessionId } = params;

    const session = await params.tx.aiInterviewSession.findFirst({
      where: { id: sessionId, tenantId },
      select: {
        id: true,
        tenantId: true,
        roleTitle: true,
        status: true,
        turns: { orderBy: { index: 'asc' }, select: { kind: true, speaker: true, content: true } },
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    if (session.status === 'ENDED') {
      const evalRow = await params.tx.aiInterviewEvaluation.findFirst({
        where: { sessionId: session.id, tenantId },
        select: { technicalDepthScore: true, problemSolvingScore: true, communicationScore: true, strengths: true, weaknesses: true, summary: true },
      });
      return { sessionId, status: 'ENDED', evaluation: evalRow };
    }

    const qa = this.compactTranscript(session.turns);
    const evaluation = await this.evaluator.evaluate({ roleTitle: session.roleTitle, qa });

    const createdEval = await params.tx.aiInterviewEvaluation.create({
      data: {
        tenantId,
        sessionId: session.id,
        model: process.env.OPENROUTER_DEFAULT_MODEL ?? 'qwen:free',
        technicalDepthScore: evaluation.technicalDepthScore,
        problemSolvingScore: evaluation.problemSolvingScore,
        communicationScore: evaluation.communicationScore,
        strengths: evaluation.strengths as unknown as Prisma.InputJsonValue,
        weaknesses: evaluation.weaknesses as unknown as Prisma.InputJsonValue,
        summary: evaluation.summary,
        raw: evaluation as unknown as Prisma.InputJsonValue,
      },
      select: {
        technicalDepthScore: true,
        problemSolvingScore: true,
        communicationScore: true,
        strengths: true,
        weaknesses: true,
        summary: true,
      },
    });

    await params.tx.aiInterviewSession.update({
      where: { id: session.id },
      data: { status: 'ENDED', endedAt: new Date() },
    });

    return { sessionId, status: 'ENDED', evaluation: createdEval };
  }

  async getSession(params: { tenantId: string; actorUserId: string; sessionId: string }) {
    const { tenantId, sessionId } = params;

    const session = await this.aiPrisma.aiInterviewSession.findFirst({
      where: { id: sessionId, tenantId },
      include: {
        turns: { orderBy: { index: 'asc' } },
        evaluation: true,
      },
    });
    if (!session) throw new NotFoundException('Session not found');

    return {
      id: session.id,
      status: session.status,
      roleTitle: session.roleTitle,
      limits: { maxQuestions: session.maxQuestions, maxFollowUps: session.maxFollowUps, maxTotalTurns: session.maxTotalTurns },
      startedAt: session.startedAt,
      endedAt: session.endedAt,
      transcript: session.turns.map((t: (typeof session.turns)[number]) => ({
        index: t.index,
        kind: t.kind,
        speaker: t.speaker,
        content: t.content,
        meta: t.meta,
      })),
      evaluation: session.evaluation
        ? {
            technicalDepthScore: session.evaluation.technicalDepthScore,
            problemSolvingScore: session.evaluation.problemSolvingScore,
            communicationScore: session.evaluation.communicationScore,
            strengths: session.evaluation.strengths,
            weaknesses: session.evaluation.weaknesses,
            summary: session.evaluation.summary,
          }
        : null,
    };
  }

  private adjustDifficulty(current: Difficulty, depthScore: number): Difficulty {
    if (depthScore >= 4) return current === 'HARD' ? 'HARD' : current === 'MEDIUM' ? 'HARD' : 'MEDIUM';
    if (depthScore <= 2) return current === 'EASY' ? 'EASY' : current === 'MEDIUM' ? 'EASY' : 'MEDIUM';
    return current;
  }

  private applyDifficultyShift(current: Difficulty, shift: 'DOWN' | 'SAME' | 'UP'): Difficulty {
    if (shift === 'SAME') return current;
    if (shift === 'UP') return current === 'HARD' ? 'HARD' : current === 'MEDIUM' ? 'HARD' : 'MEDIUM';
    return current === 'EASY' ? 'EASY' : current === 'MEDIUM' ? 'EASY' : 'MEDIUM';
  }

  private formatQuestion(q: NextQuestion): string {
    const constraints: string[] = [];
    if (q.answerConstraints.maxSentences) constraints.push(`<= ${q.answerConstraints.maxSentences} sentences`);
    if (q.answerConstraints.maxWords) constraints.push(`<= ${q.answerConstraints.maxWords} words`);

    const c = constraints.length ? ` (Answer constraints: ${constraints.join(', ')})` : '';
    return `${q.question}${c}`;
  }

  private compactTranscript(turns: Array<{ kind: string; speaker: string; content: string }>) {
    const qa: Array<{ question: string; answer: string; followUps: Array<{ question: string; answer: string }> }> = [];

    let current: { question: string; answer: string; followUps: Array<{ question: string; answer: string }> } | null = null;
    let pendingFollowUp: string | null = null;

    for (const t of turns) {
      if (t.kind === 'QUESTION' && t.speaker === 'ASSISTANT') {
        if (current) qa.push(current);
        current = { question: t.content, answer: '', followUps: [] };
        pendingFollowUp = null;
      } else if (t.kind === 'FOLLOW_UP' && t.speaker === 'ASSISTANT') {
        pendingFollowUp = t.content;
      } else if (t.kind === 'ANSWER' && t.speaker === 'CANDIDATE') {
        if (!current) continue;
        if (pendingFollowUp) {
          current.followUps.push({ question: pendingFollowUp, answer: t.content });
          pendingFollowUp = null;
        } else if (!current.answer) {
          current.answer = t.content;
        } else {
          // Extra answers without a matching follow-up; store as an additional follow-up bucket.
          current.followUps.push({ question: 'Additional details', answer: t.content });
        }
      }
    }

    if (current) qa.push(current);
    return qa.filter((x) => x.question && x.answer).slice(0, 8);
  }

  private async appendTurn(
    sessionId: string,
    turn: {
      kind: 'QUESTION' | 'FOLLOW_UP' | 'ANSWER' | 'META';
      speaker: 'ASSISTANT' | 'CANDIDATE' | 'SYSTEM';
      content: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const last = await this.aiPrisma.aiInterviewTurn.findFirst({
      where: { sessionId },
      orderBy: { index: 'desc' },
      select: { index: true },
    });

    const nextIndex = (last?.index ?? -1) + 1;

    return this.aiPrisma.aiInterviewTurn.create({
      data: {
        sessionId,
        index: nextIndex,
        kind: turn.kind,
        speaker: turn.speaker,
        content: turn.content,
        meta: (turn.meta ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }

  private async appendTurnWith(
    tx: any,
    sessionId: string,
    turn: {
      kind: 'QUESTION' | 'FOLLOW_UP' | 'ANSWER' | 'META';
      speaker: 'ASSISTANT' | 'CANDIDATE' | 'SYSTEM';
      content: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const last = await tx.aiInterviewTurn.findFirst({
      where: { sessionId },
      orderBy: { index: 'desc' },
      select: { index: true },
    });
    const nextIndex = (last?.index ?? -1) + 1;

    return tx.aiInterviewTurn.create({
      data: {
        sessionId,
        index: nextIndex,
        kind: turn.kind,
        speaker: turn.speaker,
        content: turn.content,
        meta: (turn.meta ?? {}) as unknown as Prisma.InputJsonValue,
      },
    });
  }
}
