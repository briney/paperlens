const PDF_DATA_URL_PATTERN = /data:application\/pdf;base64,[A-Za-z0-9+/=]+/g;

const DEFAULT_MAX_ERROR_LENGTH = 4000;

export function sanitizeProviderErrorText(
  input: string,
  maxLength = DEFAULT_MAX_ERROR_LENGTH
): string {
  const redacted = input.replace(
    PDF_DATA_URL_PATTERN,
    "data:application/pdf;base64,[REDACTED]"
  );

  if (redacted.length <= maxLength) {
    return redacted;
  }

  const truncatedBy = redacted.length - maxLength;
  return `${redacted.slice(0, maxLength)}...[truncated ${truncatedBy} chars]`;
}
