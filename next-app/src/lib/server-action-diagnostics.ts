/**
 * Temporary correlation logging for PHASE 7 (server-action/route-handler
 * client-update reliability investigation). Off by default — set
 * SERVER_ACTION_DIAGNOSTICS=true to enable. Never logs auth cookies,
 * tokens, signed URLs, or payment data; only a short random correlation id
 * and a named lifecycle event.
 */
const ENABLED = process.env.SERVER_ACTION_DIAGNOSTICS === "true";

export function newCorrelationId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function logDiagnostic(correlationId: string, event: string, detail?: Record<string, unknown>): void {
  if (!ENABLED) return;
  console.log(`[server-action:${correlationId}] ${event}`, detail ?? "");
}
