import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// Next.js's bundler specially aliases "server-only" to a no-op inside
// Server Component code and only makes it throw if it ends up in a
// client bundle. Plain Node (which is what Vitest runs under) has no
// such interception — the real package unconditionally throws on any
// import — so every src/data-access/* module (and src/lib/prisma.ts,
// password.ts) would crash on import in tests without this. This mock
// is the standard workaround for unit testing "server-only" code.
vi.mock("server-only", () => ({}));
