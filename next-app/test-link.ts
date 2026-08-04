import { prisma } from "./src/lib/prisma";
import { createReviewLink } from "./src/data-access/review-links";

async function run() {
  const ws = await prisma.workspace.findFirst({
    where: { status: "DRAFT" }
  });
  if (!ws) {
    console.log("No draft workspace found.");
    return;
  }
  console.log("Testing on workspace:", ws.id);
  const result = await createReviewLink(ws.id);
  console.log("Result:", result);
}

run().catch(console.error).finally(() => prisma.$disconnect());
