-- CreateEnum
CREATE TYPE "AiInterviewSessionStatus" AS ENUM ('ACTIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "AiInterviewSpeaker" AS ENUM ('ASSISTANT', 'CANDIDATE', 'SYSTEM');

-- CreateEnum
CREATE TYPE "AiInterviewTurnKind" AS ENUM ('QUESTION', 'FOLLOW_UP', 'ANSWER', 'META');

-- CreateTable
CREATE TABLE "AiInterviewSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "assignmentId" TEXT,
    "startedByUserId" TEXT,
    "roleTitle" TEXT NOT NULL,
    "status" "AiInterviewSessionStatus" NOT NULL DEFAULT 'ACTIVE',
    "maxQuestions" INTEGER NOT NULL,
    "maxFollowUps" INTEGER NOT NULL,
    "maxTotalTurns" INTEGER NOT NULL,
    "state" JSONB NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiInterviewSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewTurn" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "kind" "AiInterviewTurnKind" NOT NULL,
    "speaker" "AiInterviewSpeaker" NOT NULL,
    "content" TEXT NOT NULL,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInterviewTurn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiInterviewEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "technicalDepthScore" INTEGER NOT NULL,
    "problemSolvingScore" INTEGER NOT NULL,
    "communicationScore" INTEGER NOT NULL,
    "strengths" JSONB NOT NULL DEFAULT '[]',
    "weaknesses" JSONB NOT NULL DEFAULT '[]',
    "summary" TEXT NOT NULL,
    "raw" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiInterviewEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AiInterviewSession_tenantId_idx" ON "AiInterviewSession"("tenantId");

-- CreateIndex
CREATE INDEX "AiInterviewSession_candidateId_idx" ON "AiInterviewSession"("candidateId");

-- CreateIndex
CREATE INDEX "AiInterviewSession_assignmentId_idx" ON "AiInterviewSession"("assignmentId");

-- CreateIndex
CREATE INDEX "AiInterviewSession_startedByUserId_idx" ON "AiInterviewSession"("startedByUserId");

-- CreateIndex
CREATE UNIQUE INDEX "AiInterviewTurn_sessionId_index_key" ON "AiInterviewTurn"("sessionId", "index");

-- CreateIndex
CREATE INDEX "AiInterviewTurn_sessionId_idx" ON "AiInterviewTurn"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "AiInterviewEvaluation_sessionId_key" ON "AiInterviewEvaluation"("sessionId");

-- CreateIndex
CREATE INDEX "AiInterviewEvaluation_tenantId_idx" ON "AiInterviewEvaluation"("tenantId");

-- AddForeignKey
ALTER TABLE "AiInterviewSession" ADD CONSTRAINT "AiInterviewSession_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewSession" ADD CONSTRAINT "AiInterviewSession_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewSession" ADD CONSTRAINT "AiInterviewSession_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "InterviewAssignment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewSession" ADD CONSTRAINT "AiInterviewSession_startedByUserId_fkey" FOREIGN KEY ("startedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewTurn" ADD CONSTRAINT "AiInterviewTurn_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiInterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewEvaluation" ADD CONSTRAINT "AiInterviewEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiInterviewEvaluation" ADD CONSTRAINT "AiInterviewEvaluation_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiInterviewSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;
