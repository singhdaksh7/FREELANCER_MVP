import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getStorageConfig } from "@/storage/storage-config";

/**
 * Render's health check target (see render.yaml). Reports only coarse
 * status flags — never a connection string, bucket name, endpoint,
 * credential, or raw Prisma/AWS error message. Every check swallows its
 * real error and logs it server-side only, so a misconfigured deployment
 * never leaks its configuration through the health check response.
 */
export async function GET() {
  let databaseReachable = true;
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (error) {
    console.error("[health] Database check failed:", error);
    databaseReachable = false;
  }

  let storageConfigured = true;
  try {
    getStorageConfig();
  } catch (error) {
    console.error("[health] Storage config check failed:", error);
    storageConfigured = false;
  }

  const combinedWorkersConfigured =
    process.env.APP_ENV === "demo" && process.env.DEMO_COMBINED_PROCESS === "true";

  const healthy = databaseReachable && storageConfigured;

  return NextResponse.json(
    {
      status: healthy ? "ok" : "degraded",
      application: "available",
      database: databaseReachable ? "reachable" : "unreachable",
      storage: storageConfigured ? "configured" : "misconfigured",
      demoWorkers: combinedWorkersConfigured ? "configured" : "not_configured",
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
