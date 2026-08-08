/** Sanitized, correlation-only production timing log. Never add names, keys, URLs, or request bodies here. */
export function logUploadTiming(input: {
  correlationId: string;
  stage: string;
  fileId?: string;
  sessionId?: string;
  uploadKind?: "new-file" | "replacement-version";
}): void {
  console.log("[upload-timing]", JSON.stringify({
    correlationId: input.correlationId,
    stage: input.stage,
    timestamp: new Date().toISOString(),
    ...(input.fileId ? { fileIdShort: input.fileId.slice(0, 8) } : {}),
    ...(input.sessionId ? { sessionIdShort: input.sessionId.slice(0, 8) } : {}),
    ...(input.uploadKind ? { uploadKind: input.uploadKind } : {}),
  }));
}
