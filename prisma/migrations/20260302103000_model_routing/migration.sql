-- CreateEnum
CREATE TYPE "ModelApiStyle" AS ENUM ('AZURE_CHAT_COMPLETIONS', 'ANTHROPIC_MESSAGES', 'FULL_TARGET_URI');

-- CreateEnum
CREATE TYPE "ModelAuthStyle" AS ENUM ('API_KEY', 'X_API_KEY');

-- AlterTable
ALTER TABLE "ModelConfig" ALTER COLUMN "apiVersion" DROP NOT NULL;

-- AlterTable
ALTER TABLE "ModelConfig"
ADD COLUMN "apiStyle" "ModelApiStyle" NOT NULL DEFAULT 'AZURE_CHAT_COMPLETIONS',
ADD COLUMN "authStyle" "ModelAuthStyle" NOT NULL DEFAULT 'API_KEY',
ADD COLUMN "baseUrl" TEXT,
ADD COLUMN "invokePath" TEXT,
ADD COLUMN "targetUri" TEXT,
ADD COLUMN "extraHeaders" JSONB,
ADD COLUMN "supportedTasks" JSONB;

-- Backfill baseline values for existing model rows.
UPDATE "ModelConfig"
SET
  "baseUrl" = COALESCE(NULLIF("baseUrl", ''), NULLIF("endpoint", '')),
  "invokePath" = COALESCE("invokePath", '/chat/completions'),
  "supportedTasks" = COALESCE(
    "supportedTasks",
    CASE
      WHEN "category" = 'DOCUMENT_PARSER' THEN '["PARSE_PDF"]'::jsonb
      WHEN "category" = 'CHAT_COMPLETION' THEN '["SUMMARIZE"]'::jsonb
      ELSE '[]'::jsonb
    END
  );

-- CreateTable
CREATE TABLE "TaskModelPolicy" (
    "id" TEXT NOT NULL,
    "taskType" "JobType" NOT NULL,
    "defaultModelSlug" TEXT,
    "allowUserOverride" BOOLEAN NOT NULL DEFAULT true,
    "fallbackModelSlugs" JSONB,
    "constraints" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TaskModelPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TaskModelPolicy_taskType_key" ON "TaskModelPolicy"("taskType");

-- AddForeignKey
ALTER TABLE "TaskModelPolicy" ADD CONSTRAINT "TaskModelPolicy_defaultModelSlug_fkey" FOREIGN KEY ("defaultModelSlug") REFERENCES "ModelConfig"("slug") ON DELETE SET NULL ON UPDATE CASCADE;
