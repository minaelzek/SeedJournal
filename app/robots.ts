import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/welcome", "/privacy", "/terms"],
      disallow: ["/", "/journal", "/api/", "/settings", "/img2threejs", "/living-sakura"],
    },
  };
}
