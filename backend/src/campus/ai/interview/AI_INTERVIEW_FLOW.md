# AI Interview Flow (End-to-End)

This document explains the full “AI Interview” workflow in this repo: how the Web UI calls the API, how the `CoordinatorAgent` orchestrates sub-agents, and how state/transcripts/evaluations are persisted.

> Goal of the design: **make the interview deterministic + debuggable**, while using LLMs only at controlled decision points.

---

## Quick map (files to open)

**Web (Next.js)**
- UI page: `frontend/app/(app)/campus/ai/page.tsx`
- UI client component: `frontend/app/(app)/campus/ai/_live-interview.tsx`
- Next.js API proxy routes:
   - Start: `frontend/app/api/campus/ai-interview/sessions/route.ts`
   - Answer: `frontend/app/api/campus/ai-interview/sessions/[sessionId]/answer/route.ts`
   - End: `frontend/app/api/campus/ai-interview/sessions/[sessionId]/end/route.ts`
   - Get session: `frontend/app/api/campus/ai-interview/sessions/[sessionId]/route.ts`

**API (NestJS)**
- Controller: `backend/src/campus/ai/interview/ai-interview.controller.ts`
- Module wiring: `backend/src/campus/ai/interview/ai-interview.module.ts`

**Orchestrator + agents**
- Orchestrator: `backend/src/campus/ai/interview/agents/coordinator.agent.ts`
- Question generator: `backend/src/campus/ai/interview/agents/interviewer.agent.ts`
- Depth probe (follow-ups): `backend/src/campus/ai/interview/agents/depth-probe.agent.ts`
- Classifier (intent/quality/cheating signals): `backend/src/campus/ai/interview/agents/classifier.agent.ts`
- Evaluator (final report): `backend/src/campus/ai/interview/agents/evaluator.agent.ts`

**LLM + utilities**
- LLM client wrapper: `backend/src/campus/ai/interview/openrouter.client.ts`
- JSON extraction helper: `backend/src/campus/ai/interview/llm-json.ts`

**“Tools” / context enrichment**
- Context builder (DB + resume/JD summarization): `backend/src/campus/ai/interview/tools/interview-tools.service.ts`

**Persistence**
- Prisma models: `backend/prisma/schema.prisma` (`AiInterviewSession`, `AiInterviewTurn`, `AiInterviewEvaluation`)

---

## Mental model: deterministic state machine + append-only transcript

There are two important data stores:

1) **Session JSON state** (`AiInterviewSession.state`)
- Small, structured “working memory” used to drive decisions.
- Stores counters (questionCount, followUps, nonAnswerCount, difficulty), current question, scoring history, and optional context text.

2) **Append-only transcript** (`AiInterviewTurn[]`)
- Every assistant question/follow-up and every candidate answer is persisted as a row with a monotonically increasing `index`.
- Each turn can carry `meta` JSON (agent name, depth score, classifier output, decision info).

Important nuance (current code):
- The `GET /sessions/:id` API returns transcript turns including `meta`, which contains DepthProbe/Classifier traces and decision details.

This makes the system:
- Easy to debug (you can replay decisions)
- Resumable (load state + transcript)
- Auditable (what did the model do, and why?)

---

## Sequence: UI → API → Coordinator

### Start session

1. UI calls Next proxy: `POST /api/campus/ai-interview/sessions`
2. Proxy forwards to Nest: `POST /api/v1/campus/ai/interview/sessions`
3. `AiInterviewController.start()` → `CoordinatorAgent.startSession()`

Outputs:
- `sessionId`
- `status: ACTIVE`
- first prompt (`nextPrompt`) already stored in transcript as a `QUESTION` turn.

### Submit answer

1. UI calls Next proxy: `POST /api/campus/ai-interview/sessions/:id/answer`
2. Proxy forwards to Nest: `POST /api/v1/campus/ai/interview/sessions/:id/answer`
3. `AiInterviewController.submitAnswer()` → `CoordinatorAgent.submitAnswer()`

Outputs:
- `status: ACTIVE` + a new `nextPrompt` (question or follow-up), OR
- `status: ENDED` + evaluation (if limits hit or session ended)

### End session

1. UI calls Next proxy: `POST /api/campus/ai-interview/sessions/:id/end`
2. Proxy forwards to Nest: `POST /api/v1/campus/ai/interview/sessions/:id/end`
3. `AiInterviewController.end()` → `CoordinatorAgent.endSession()`

Outputs:
- `status: ENDED` + evaluation

### Get session (resume / refresh)

1. UI calls Next proxy: `GET /api/campus/ai-interview/sessions/:id`
2. Proxy forwards to Nest: `GET /api/v1/campus/ai/interview/sessions/:id`
3. `AiInterviewController.get()` → `CoordinatorAgent.getSession()`

Outputs:
- transcript turns (canonical)
- evaluation if present

---

## CoordinatorAgent: the orchestration loop

### Start: `startSession(...)`
High level steps:

1) Validate candidate (and optional assignment)
2) Initialize `SessionState` defaults (difficulty EASY, counters 0, scoring bucket)
3) Best-effort context fetch via `InterviewToolsService.getInterviewContext(...)`
   - reads DB
   - optionally extracts resume/JD text from local uploads
   - optionally summarizes using LLM
   - produces `contextText` used to ground questions
4) Create `AiInterviewSession` with limits + initial state
5) Generate first question via `InterviewerAgent.generateNextQuestion(...)`
6) Persist `currentQuestion` + `askedQuestions` (normalized) into state
7) Append first assistant `QUESTION` turn (includes `meta.agent="InterviewerAgent"` and the generated question JSON)

### Answer: `submitAnswer(...)`
Key properties:

- Uses a transaction advisory lock (`pg_advisory_xact_lock(hashtext(sessionId))`) to prevent:
  - concurrent answer submits creating duplicate `index`
  - race between `submitAnswer()` and `endSession()`

High level steps:

1) Load session + transcript
2) If `turns.length >= maxTotalTurns`, end immediately (no new answer is appended)
3) Append candidate `ANSWER` turn first (so user input is usually not lost)
3) Determine “non-answer” using a fast rule-based check
4) Choose the probe target prompt:
   - Uses the **last assistant** `QUESTION`/`FOLLOW_UP` turn content (so follow-up answers are probed against the follow-up)
   - `expectedTopics` are passed only when the last prompt was the main `QUESTION` (follow-ups use `[]`)
5) Compute depth probe:
   - if non-answer: rule-based probe result
   - else: call `DepthProbeAgent.analyzeAnswer(...)`
6) Compute classification:
   - if non-answer: rule-based classification
   - else: call `ClassifierAgent.classifyAnswer(...)`
7) Store probe + classification into the answer turn’s `meta` (best-effort update; failures do not break the interview)
7) If early-exit threshold for repeated non-answers is hit, end session politely
8) If follow-up needed and follow-up budget remains (and the message was not a non-answer):
   - append assistant `FOLLOW_UP` turn
   - update state + return follow-up prompt
9) Otherwise close current question:
   - increment `questionCount`, reset follow-up counter
   - add to `priorQAPairs`
   - compute points + update scoring history
   - adapt difficulty (combine depth shift + classifier shift)
10) If question limit hit → end
11) Else generate next question via `InterviewerAgent` and append assistant `QUESTION`

### End: `endSession(...)`
High level steps:

1) Load session + transcript
2) Compact transcript into Q/A pairs (with follow-ups grouped)
3) Call `EvaluatorAgent.evaluate(...)`
4) Persist `AiInterviewEvaluation`
5) Mark session `ENDED`

Important nuance (current code):
- If a session is already `ENDED`, `endSession(...)` returns the existing evaluation (does not re-run the evaluator).

---

## What each agent is responsible for (and why)

### InterviewerAgent
File: `agents/interviewer.agent.ts`

Purpose:
- Produce the next *main* interview question.

Inputs:
- `roleTitle`, optional `seniority`
- target `difficulty`
- recent `priorQAPairs`
- `askedQuestions` (anti-repetition)
- optional `contextText` (resume/JD highlights)

Output (STRICT JSON validated via Zod):
- `{ question, difficulty, questionType?, expectedTopics, answerConstraints }`

Why it’s separate:
- Keeps the coordinator logic simple.
- Makes “question generation quality” easy to improve without changing orchestration.

### DepthProbeAgent
File: `agents/depth-probe.agent.ts`

Purpose:
- Judge depth (1–5) and decide whether to ask *one* follow-up.

Output:
- `{ answerDepthScore, needsFollowUp, followUpQuestion?, keyGaps[] }`

Why it’s separate:
- Follow-ups are a different skill than question generation.
- Keeps follow-up logic consistent and budgeted.

### ClassifierAgent
File: `agents/classifier.agent.ts`

Purpose:
- Provide routing/scoring signals:
  - intent: ANSWER/NON_ANSWER/OFF_TOPIC/CLARIFICATION/HINT_REQUEST
  - quality: POOR/FAIR/GOOD/EXCELLENT
  - recommended difficulty shift: DOWN/SAME/UP
  - conservative cheating suspicion signals

Why it’s separate:
- Lets you tune scoring/difficulty policy independent from question content.

### EvaluatorAgent
File: `agents/evaluator.agent.ts`

Purpose:
- Summarize the whole interview into recruiter-friendly scores and text.

Output:
- `{ technicalDepthScore, problemSolvingScore, communicationScore, strengths[], weaknesses[], summary }`

---

## LLM wrapper and JSON safety

### OpenRouterClient
File: `openrouter.client.ts`

Key ideas:
- Centralizes API key/model selection and error handling.
- Retries once (with a short wait on 429 before retry).
- Converts 429 into a helpful HTTP response.

### JSON parsing strategy
File: `llm-json.ts`

Approach:
- Agents instruct the model: “Return STRICT JSON only.”
- `extractFirstJsonObject()` takes the first `{ ... }` block and `JSON.parse()`s it.
- Zod schemas validate shape and constraints.

Practical benefit:
- Most model “format weirdness” does not crash the interview.
- Agents include safe fallbacks (e.g., `InterviewerAgent` returns a default question if parsing fails twice).

---

## Scoring + difficulty adaptation (current policy)

All logic is in `CoordinatorAgent.submitAnswer()`.

- Base points by difficulty: EASY=1, MEDIUM=2, HARD=3
- Quality multiplier:
  - EXCELLENT: 1.25
  - GOOD: 1
  - FAIR: 0.5
  - POOR: 0
- Depth bonus:
  - depth >= 4: +0.25
  - depth <= 2: -0.1
- Cheating suspicion (confidence >= 0.75): points × 0.5

Notes (current code):
- Points are clamped to `>= 0` and rounded to 2 decimals.
- `priorQAPairs` keeps only the last ~6 items; `askedQuestions` keeps only the last ~12 normalized question strings.

Difficulty shift:
- `DepthProbeAgent` implies shift via depth score (UP/DOWN/SAME)
- `ClassifierAgent` provides its own recommendation
- Coordinator combines them conservatively:
  - if either says DOWN → DOWN
  - else if either says UP → UP
  - else SAME

---

## Limits + “professional stop” behavior

- `maxTotalTurns` caps total transcript length.
- `maxQuestions` caps the number of main questions.
- `maxFollowUps` caps follow-ups per main question.

Optional early exit:
- `AI_INTERVIEW_EARLY_EXIT_NONANSWER_THRESHOLD` environment variable (default 3)
- If candidate repeatedly doesn’t answer after at least 1 question, system ends gracefully.

---

## How to extend safely (recommended pattern)

1) Add a new agent if you’re adding a *new capability* (not just tuning a prompt).
   - Example: “RedFlagsAgent” that looks for critical security issues in answers.

2) Keep coordinator deterministic:
   - Make the decision rules explicit.
   - Store decisions in `state.lastDecision` and/or turn `meta`.

3) Enforce strict outputs:
   - Every agent output should have a Zod schema.
   - Add retries + safe fallbacks.

4) Persist for traceability:
   - If an agent makes a judgment, store it in turn `meta` or session state.

---

## How to debug the flow while developing

- Start the API + Web dev servers.
- Use the AI Interviews page and click “Start demo interview”.
- Toggle “debug” in the UI (the transcript is authoritative because it’s fetched from server).

When debugging behavior:
- Inspect `AiInterviewTurn.meta` for the `DepthProbeAgent` and `ClassifierAgent` outputs.
- Compare `state` in `AiInterviewSession` to see why the coordinator chose next actions.

Tip: the UI can render per-turn `meta` when “debug” is enabled.

---

## Environment configuration (AI)

The interview relies on:
- `OPENROUTER_API_KEY`
- `OPENROUTER_BASE_URL`
- `OPENROUTER_DEFAULT_MODEL`

Optional:
- `AI_INTERVIEW_EARLY_EXIT_NONANSWER_THRESHOLD`

