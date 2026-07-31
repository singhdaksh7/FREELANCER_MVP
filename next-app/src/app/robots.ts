import type { MetadataRoute } from "next";

/**
 * The client review portal (`/review/[token]`) is additionally excluded
 * per-page via `generateMetadata`'s `robots: { index: false, follow: false }`
 * (belt-and-suspenders — a crawler that ignores robots.txt would still see
 * the page-level noindex directive). See CLIENT_REVIEW_ARCHITECTURE.md
 * "Review access and privacy."
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/review/", "/download/", "/dashboard", "/workspaces", "/payments", "/notifications"],
    },
  };
}
