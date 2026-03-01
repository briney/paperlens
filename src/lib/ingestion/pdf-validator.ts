const PDF_MAGIC_BYTES = Buffer.from("%PDF-");
const MAX_UPLOAD_SIZE_MB = parseInt(process.env.MAX_UPLOAD_SIZE_MB ?? "50", 10);

export function validatePdfBytes(buffer: Buffer): { valid: boolean; error?: string } {
  if (buffer.length < 5) {
    return { valid: false, error: "File is too small to be a valid PDF" };
  }

  if (!buffer.subarray(0, 5).equals(PDF_MAGIC_BYTES)) {
    return { valid: false, error: "File does not appear to be a valid PDF" };
  }

  const maxBytes = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (buffer.length > maxBytes) {
    return { valid: false, error: `File exceeds the ${MAX_UPLOAD_SIZE_MB}MB size limit` };
  }

  return { valid: true };
}

export function getMaxUploadSizeMB(): number {
  return MAX_UPLOAD_SIZE_MB;
}

export function getMaxUploadSizeBytes(): number {
  return MAX_UPLOAD_SIZE_MB * 1024 * 1024;
}
