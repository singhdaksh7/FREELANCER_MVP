import { describe, expect, it, vi } from "vitest";
import { logUploadTiming } from "./upload-timing";

describe("logUploadTiming", () => {
  it("writes one searchable, sanitized structured line", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    try {
      logUploadTiming({
        correlationId: "correlation-id",
        stage: "session_created",
        sessionId: "cmsession012345",
        uploadKind: "new-file",
      });

      expect(spy).toHaveBeenCalledTimes(1);
      const [prefix, payload] = spy.mock.calls[0];
      expect(prefix).toBe("[upload-timing]");
      expect(JSON.parse(payload as string)).toMatchObject({
        correlationId: "correlation-id",
        stage: "session_created",
        sessionIdShort: "cmsessio",
        uploadKind: "new-file",
      });
      expect(payload).not.toContain("storageKey");
      expect(payload).not.toContain("filename");
      expect(payload).not.toContain("token");
    } finally {
      spy.mockRestore();
    }
  });
});
