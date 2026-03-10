-- CreateTable
CREATE TABLE "InterviewRoom" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "candidateTokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterviewRoom_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterviewRoom_assignmentId_key" ON "InterviewRoom"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "InterviewRoom_candidateTokenHash_key" ON "InterviewRoom"("candidateTokenHash");

-- CreateIndex
CREATE INDEX "InterviewRoom_tenantId_idx" ON "InterviewRoom"("tenantId");

-- CreateIndex
CREATE INDEX "InterviewRoom_assignmentId_idx" ON "InterviewRoom"("assignmentId");

-- AddForeignKey
ALTER TABLE "InterviewRoom" ADD CONSTRAINT "InterviewRoom_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterviewRoom" ADD CONSTRAINT "InterviewRoom_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "InterviewAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
