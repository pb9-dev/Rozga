-- CreateEnum
CREATE TYPE "Role" AS ENUM ('Admin', 'HR', 'Interviewer', 'Employee', 'Candidate');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('ONLINE', 'OFFLINE');

-- CreateEnum
CREATE TYPE "InterviewRecommendation" AS ENUM ('STRONG_YES', 'YES', 'MAYBE', 'NO', 'STRONG_NO');

-- CreateEnum
CREATE TYPE "CampusStageKind" AS ENUM ('GD_OFFLINE', 'AI_INTERVIEW', 'TECH_TEST', 'TECH_ROUND_ONLINE', 'TECH_ROUND_OFFLINE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "roles" "Role"[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "College" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "College_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobRequisition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobRequisition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusHiringFlow" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "batchSize" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampusHiringFlow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusFlowStage" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "CampusStageKind" NOT NULL,
    "order" INTEGER NOT NULL,
    "config" JSONB NOT NULL,

    CONSTRAINT "CampusFlowStage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusFlowTransition" (
    "id" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "fromStageKey" TEXT NOT NULL,
    "toStageKey" TEXT NOT NULL,
    "condition" JSONB NOT NULL,

    CONSTRAINT "CampusFlowTransition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampusBatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "collegeId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "flowId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampusBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Candidate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "fullName" TEXT NOT NULL,
    "rollNumber" TEXT,
    "department" TEXT,
    "resumeUrl" TEXT,
    "normalized" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Candidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CandidateStageState" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "stageKey" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CandidateStageState_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GDGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDGroupCandidate" (
    "id" TEXT NOT NULL,
    "gdGroupId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,

    CONSTRAINT "GDGroupCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDGroupInterviewer" (
    "id" TEXT NOT NULL,
    "gdGroupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "GDGroupInterviewer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GDEvaluation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "gdGroupId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "evaluatorId" TEXT NOT NULL,
    "shortlisted" BOOLEAN NOT NULL,
    "metrics" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GDEvaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "interviewerId" TEXT NOT NULL,
    "mode" "InterviewMode" NOT NULL,
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterviewFeedback" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "recommendation" "InterviewRecommendation" NOT NULL,
    "scores" JSONB NOT NULL DEFAULT '{}',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterviewFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIGeneratedArtifact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "output" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIGeneratedArtifact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_slug_key" ON "Tenant"("slug");

-- CreateIndex
CREATE INDEX "User_tenantId_idx" ON "User"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "User_tenantId_email_key" ON "User"("tenantId", "email");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "College_tenantId_idx" ON "College"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "College_tenantId_code_key" ON "College"("tenantId", "code");

-- CreateIndex
CREATE INDEX "JobRequisition_tenantId_idx" ON "JobRequisition"("tenantId");

-- CreateIndex
CREATE INDEX "CampusHiringFlow_tenantId_idx" ON "CampusHiringFlow"("tenantId");

-- CreateIndex
CREATE INDEX "CampusHiringFlow_collegeId_idx" ON "CampusHiringFlow"("collegeId");

-- CreateIndex
CREATE INDEX "CampusFlowStage_flowId_idx" ON "CampusFlowStage"("flowId");

-- CreateIndex
CREATE UNIQUE INDEX "CampusFlowStage_flowId_key_key" ON "CampusFlowStage"("flowId", "key");

-- CreateIndex
CREATE INDEX "CampusFlowTransition_flowId_idx" ON "CampusFlowTransition"("flowId");

-- CreateIndex
CREATE INDEX "CampusBatch_tenantId_idx" ON "CampusBatch"("tenantId");

-- CreateIndex
CREATE INDEX "CampusBatch_collegeId_idx" ON "CampusBatch"("collegeId");

-- CreateIndex
CREATE INDEX "CampusBatch_jobId_idx" ON "CampusBatch"("jobId");

-- CreateIndex
CREATE INDEX "Candidate_tenantId_idx" ON "Candidate"("tenantId");

-- CreateIndex
CREATE INDEX "Candidate_batchId_idx" ON "Candidate"("batchId");

-- CreateIndex
CREATE INDEX "CandidateStageState_candidateId_idx" ON "CandidateStageState"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "CandidateStageState_candidateId_stageKey_key" ON "CandidateStageState"("candidateId", "stageKey");

-- CreateIndex
CREATE INDEX "GDGroup_tenantId_idx" ON "GDGroup"("tenantId");

-- CreateIndex
CREATE INDEX "GDGroup_batchId_idx" ON "GDGroup"("batchId");

-- CreateIndex
CREATE INDEX "GDGroupCandidate_candidateId_idx" ON "GDGroupCandidate"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "GDGroupCandidate_gdGroupId_candidateId_key" ON "GDGroupCandidate"("gdGroupId", "candidateId");

-- CreateIndex
CREATE INDEX "GDGroupInterviewer_userId_idx" ON "GDGroupInterviewer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "GDGroupInterviewer_gdGroupId_userId_key" ON "GDGroupInterviewer"("gdGroupId", "userId");

-- CreateIndex
CREATE INDEX "GDEvaluation_tenantId_idx" ON "GDEvaluation"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "GDEvaluation_gdGroupId_candidateId_evaluatorId_key" ON "GDEvaluation"("gdGroupId", "candidateId", "evaluatorId");

-- CreateIndex
CREATE INDEX "InterviewAssignment_tenantId_idx" ON "InterviewAssignment"("tenantId");

-- CreateIndex
CREATE INDEX "InterviewAssignment_interviewerId_idx" ON "InterviewAssignment"("interviewerId");

-- CreateIndex
CREATE INDEX "InterviewAssignment_candidateId_idx" ON "InterviewAssignment"("candidateId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewFeedback_assignmentId_key" ON "InterviewFeedback"("assignmentId");

-- CreateIndex
CREATE INDEX "AIGeneratedArtifact_tenantId_idx" ON "AIGeneratedArtifact"("tenantId");

-- CreateIndex
CREATE INDEX "AIGeneratedArtifact_candidateId_idx" ON "AIGeneratedArtifact"("candidateId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_idx" ON "AuditLog"("tenantId");

-- CreateIndex
CREATE INDEX "AuditLog_actorUserId_idx" ON "AuditLog"("actorUserId");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "College" ADD CONSTRAINT "College_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobRequisition" ADD CONSTRAINT "JobRequisition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusHiringFlow" ADD CONSTRAINT "CampusHiringFlow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusHiringFlow" ADD CONSTRAINT "CampusHiringFlow_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusFlowStage" ADD CONSTRAINT "CampusFlowStage_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "CampusHiringFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusFlowTransition" ADD CONSTRAINT "CampusFlowTransition_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "CampusHiringFlow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusBatch" ADD CONSTRAINT "CampusBatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusBatch" ADD CONSTRAINT "CampusBatch_collegeId_fkey" FOREIGN KEY ("collegeId") REFERENCES "College"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusBatch" ADD CONSTRAINT "CampusBatch_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "JobRequisition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampusBatch" ADD CONSTRAINT "CampusBatch_flowId_fkey" FOREIGN KEY ("flowId") REFERENCES "CampusHiringFlow"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Candidate" ADD CONSTRAINT "Candidate_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CampusBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CandidateStageState" ADD CONSTRAINT "CandidateStageState_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDGroup" ADD CONSTRAINT "GDGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDGroup" ADD CONSTRAINT "GDGroup_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CampusBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDGroupCandidate" ADD CONSTRAINT "GDGroupCandidate_gdGroupId_fkey" FOREIGN KEY ("gdGroupId") REFERENCES "GDGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDGroupCandidate" ADD CONSTRAINT "GDGroupCandidate_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDGroupInterviewer" ADD CONSTRAINT "GDGroupInterviewer_gdGroupId_fkey" FOREIGN KEY ("gdGroupId") REFERENCES "GDGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDGroupInterviewer" ADD CONSTRAINT "GDGroupInterviewer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDEvaluation" ADD CONSTRAINT "GDEvaluation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDEvaluation" ADD CONSTRAINT "GDEvaluation_gdGroupId_fkey" FOREIGN KEY ("gdGroupId") REFERENCES "GDGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDEvaluation" ADD CONSTRAINT "GDEvaluation_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GDEvaluation" ADD CONSTRAINT "GDEvaluation_evaluatorId_fkey" FOREIGN KEY ("evaluatorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAssignment" ADD CONSTRAINT "InterviewAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAssignment" ADD CONSTRAINT "InterviewAssignment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CampusBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAssignment" ADD CONSTRAINT "InterviewAssignment_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewAssignment" ADD CONSTRAINT "InterviewAssignment_interviewerId_fkey" FOREIGN KEY ("interviewerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewFeedback" ADD CONSTRAINT "InterviewFeedback_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "InterviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedArtifact" ADD CONSTRAINT "AIGeneratedArtifact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIGeneratedArtifact" ADD CONSTRAINT "AIGeneratedArtifact_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "Candidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
