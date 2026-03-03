-- CreateEnum
CREATE TYPE "UserApprovalStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "approvalStatus" "UserApprovalStatus" NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "approvedAt" TIMESTAMP(3),
  ADD COLUMN "approvedById" TEXT,
  ADD COLUMN "deletedAt" TIMESTAMP(3),
  ADD COLUMN "deletedById" TEXT;

-- Backfill: existing users start approved
UPDATE "User"
SET "approvalStatus" = 'APPROVED',
    "approvedAt" = COALESCE("approvedAt", "createdAt")
WHERE "approvalStatus" = 'PENDING';

-- AlterTable
ALTER TABLE "Job"
  ADD COLUMN "isArchivedByAdmin" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "archivedAt" TIMESTAMP(3),
  ADD COLUMN "archivedById" TEXT;

-- CreateTable
CREATE TABLE "UserModelAllowlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "modelSlug" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT,

    CONSTRAINT "UserModelAllowlist_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "User_approvalStatus_deletedAt_idx" ON "User"("approvalStatus", "deletedAt");

-- CreateIndex
CREATE INDEX "User_deletedAt_idx" ON "User"("deletedAt");

-- CreateIndex
CREATE INDEX "Job_userId_isArchivedByAdmin_createdAt_idx" ON "Job"("userId", "isArchivedByAdmin", "createdAt");

-- CreateIndex
CREATE INDEX "Job_paperId_isArchivedByAdmin_createdAt_idx" ON "Job"("paperId", "isArchivedByAdmin", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserModelAllowlist_userId_modelSlug_key" ON "UserModelAllowlist"("userId", "modelSlug");

-- CreateIndex
CREATE INDEX "UserModelAllowlist_modelSlug_idx" ON "UserModelAllowlist"("modelSlug");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_archivedById_fkey" FOREIGN KEY ("archivedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModelAllowlist" ADD CONSTRAINT "UserModelAllowlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModelAllowlist" ADD CONSTRAINT "UserModelAllowlist_modelSlug_fkey" FOREIGN KEY ("modelSlug") REFERENCES "ModelConfig"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserModelAllowlist" ADD CONSTRAINT "UserModelAllowlist_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
