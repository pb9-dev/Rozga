-- CreateTable
CREATE TABLE "CollegeDirectoryEntry" (
    "id" TEXT NOT NULL,
    "universityId" TEXT,
    "universityName" TEXT NOT NULL,
    "collegeId" TEXT,
    "collegeName" TEXT NOT NULL,
    "collegeType" TEXT,
    "stateName" TEXT,
    "districtName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CollegeDirectoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CollegeDirectoryEntry_collegeName_idx" ON "CollegeDirectoryEntry"("collegeName");

-- CreateIndex
CREATE INDEX "CollegeDirectoryEntry_universityName_idx" ON "CollegeDirectoryEntry"("universityName");

-- CreateIndex
CREATE INDEX "CollegeDirectoryEntry_stateName_idx" ON "CollegeDirectoryEntry"("stateName");

-- CreateIndex
CREATE INDEX "CollegeDirectoryEntry_districtName_idx" ON "CollegeDirectoryEntry"("districtName");
