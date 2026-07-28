import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export interface AuthenticatedCreator {
  id: string;
  name: string;
  email: string;
  role: string;
  image: string | null;
}

/**
 * Resolves the current session and re-reads the user from the database
 * (never trusting JWT claims alone for anything beyond the user id/role
 * used to look the row up). Returns `null` when there is no session.
 * `cache()`-wrapped so multiple calls within one render pass share a
 * single DB round trip.
 */
export const getAuthenticatedCreator = cache(
  async (): Promise<AuthenticatedCreator | null> => {
    const session = await auth();
    if (!session?.user?.id) return null;

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { id: true, name: true, email: true, role: true, image: true },
    });

    return user;
  },
);

/** Redirects to /login if there is no session. Use in every protected Server Component/data-access call. */
export async function requireAuthenticatedUser(): Promise<AuthenticatedCreator> {
  const user = await getAuthenticatedCreator();
  if (!user) {
    redirect("/login");
  }
  return user;
}

/** Same as requireAuthenticatedUser(), plus a role check for CREATOR-only data. */
export async function requireCreatorRole(): Promise<AuthenticatedCreator> {
  const user = await requireAuthenticatedUser();
  if (user.role !== "CREATOR") {
    redirect("/permission-denied");
  }
  return user;
}
