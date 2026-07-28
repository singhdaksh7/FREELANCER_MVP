import { config } from "dotenv";
import { vi } from "vitest";

// Point the app's DATABASE_URL at the dedicated test database (.env.test)
// for the duration of the integration suite, before anything imports
// src/lib/prisma.ts (which reads process.env.DATABASE_URL at module
// load time).
config({ path: ".env.test" });
if (!process.env.TEST_DATABASE_URL) {
  throw new Error(
    "TEST_DATABASE_URL is not set. Copy .env.test.example to .env.test before running integration tests.",
  );
}
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;

// See vitest.setup.ts for why this is necessary.
vi.mock("server-only", () => ({}));
