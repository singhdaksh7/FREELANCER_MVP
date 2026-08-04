import { describe, expect, it, vi } from "vitest";
import { buildSharedE2EEnv, logSelectedDatabase, resolveE2EDatabaseUrl } from "./e2e-database-env";

const E2E_URL = "postgresql://project_vault:pw@localhost:5433/project_vault_e2e?schema=public";
const NORMAL_URL = "postgresql://project_vault:pw@localhost:5432/project_vault?schema=public";
const TEST_URL = "postgresql://project_vault:pw@localhost:5433/project_vault_test?schema=public";

describe("resolveE2EDatabaseUrl", () => {
  it("prefers E2E_DATABASE_URL over DATABASE_URL when both are set", () => {
    const resolved = resolveE2EDatabaseUrl({ E2E_DATABASE_URL: E2E_URL, DATABASE_URL: NORMAL_URL });
    expect(resolved.url).toBe(E2E_URL);
    expect(resolved.databaseName).toBe("project_vault_e2e");
  });

  it("falls back to DATABASE_URL when E2E_DATABASE_URL is unset", () => {
    const resolved = resolveE2EDatabaseUrl({ DATABASE_URL: E2E_URL });
    expect(resolved.url).toBe(E2E_URL);
    expect(resolved.databaseName).toBe("project_vault_e2e");
  });

  it("fails fast when neither variable is set", () => {
    expect(() => resolveE2EDatabaseUrl({})).toThrow(/E2E_DATABASE_URL nor DATABASE_URL is set/i);
  });

  it("rejects the normal project_vault database", () => {
    expect(() => resolveE2EDatabaseUrl({ DATABASE_URL: NORMAL_URL })).toThrow(/does not look isolated/i);
  });

  it("accepts a database name ending in _e2e", () => {
    expect(() => resolveE2EDatabaseUrl({ DATABASE_URL: E2E_URL })).not.toThrow();
  });

  it("accepts a database name ending in _test", () => {
    const resolved = resolveE2EDatabaseUrl({ DATABASE_URL: TEST_URL });
    expect(resolved.databaseName).toBe("project_vault_test");
  });

  it("fails fast on an unparseable URL without ever surfacing it", () => {
    let caught: unknown;
    try {
      resolveE2EDatabaseUrl({ DATABASE_URL: "not a url at all" });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).not.toContain("not a url at all");
  });

  it("never includes credentials in a thrown error message", () => {
    let caught: unknown;
    try {
      resolveE2EDatabaseUrl({ DATABASE_URL: NORMAL_URL });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).message).not.toContain("pw");
    expect((caught as Error).message).not.toContain(NORMAL_URL);
  });
});

describe("buildSharedE2EEnv", () => {
  it("produces only a DATABASE_URL override, nothing else from process.env", () => {
    expect(buildSharedE2EEnv(E2E_URL)).toEqual({ DATABASE_URL: E2E_URL });
    expect(Object.keys(buildSharedE2EEnv(E2E_URL))).toEqual(["DATABASE_URL"]);
  });

  it("is safe to spread into every webServer entry's env and always agrees on the same URL", () => {
    const shared = buildSharedE2EEnv(E2E_URL);
    const webServerEnv = { ...shared, UPLOAD_MAX_FILE_SIZE_BYTES: "2097152", E2E_LOCAL_BUILD: "true" };
    const filesWorkerEnv = shared;
    const deliveriesWorkerEnv = shared;

    expect(webServerEnv.DATABASE_URL).toBe(E2E_URL);
    expect(filesWorkerEnv.DATABASE_URL).toBe(E2E_URL);
    expect(deliveriesWorkerEnv.DATABASE_URL).toBe(E2E_URL);
  });
});

describe("logSelectedDatabase", () => {
  it("prints only the database name, never a username, password, host, or query string", () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    logSelectedDatabase("project_vault_e2e");

    expect(logSpy).toHaveBeenCalledTimes(1);
    const [line] = logSpy.mock.calls[0] as [string];
    expect(line).toContain("project_vault_e2e");
    expect(line).not.toMatch(/postgres(ql)?:\/\//);
    expect(line).not.toContain("@");
    expect(line).not.toContain("pw");
    expect(line).not.toContain("5433");
    expect(line).not.toContain("schema=public");

    logSpy.mockRestore();
  });
});
