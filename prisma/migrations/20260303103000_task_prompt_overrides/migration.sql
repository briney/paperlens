ALTER TABLE "TaskModelPolicy"
ADD COLUMN "systemPromptOverride" TEXT,
ADD COLUMN "postOcrNormalizationModelSlug" TEXT;

ALTER TABLE "TaskModelPolicy"
ADD CONSTRAINT "TaskModelPolicy_postOcrNormalizationModelSlug_fkey"
FOREIGN KEY ("postOcrNormalizationModelSlug") REFERENCES "ModelConfig"("slug")
ON DELETE SET NULL ON UPDATE CASCADE;
