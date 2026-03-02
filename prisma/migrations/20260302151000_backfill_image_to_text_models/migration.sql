UPDATE "ModelConfig"
SET "apiStyle" = 'AZURE_IMAGE_TO_TEXT'
WHERE "category" = 'DOCUMENT_PARSER'
  AND "apiStyle" = 'AZURE_CHAT_COMPLETIONS'
  AND "invokePath" IS NOT NULL
  AND LOWER("invokePath") LIKE '%ocr%';

UPDATE "ModelConfig"
SET "invokePath" = '/v1/ocr'
WHERE "apiStyle" = 'AZURE_IMAGE_TO_TEXT'
  AND ("invokePath" IS NULL OR BTRIM("invokePath") = '');
