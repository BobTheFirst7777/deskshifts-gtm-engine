import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Every page reads live data, so pages render per request.
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
