/** A safe, short deployment identifier for health checks and mutation responses. */
export function getDeploymentRevision(): string {
  return (process.env.RENDER_GIT_COMMIT ?? process.env.GIT_COMMIT ?? "unknown").slice(0, 8);
}
