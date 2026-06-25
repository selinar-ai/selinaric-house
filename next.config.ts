import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The Courtyard image routes read these PNGs from gaming-assets/ at runtime via
  // a dynamic readFile(join(process.cwd(), ...)). Next.js output-file-tracing does
  // not detect dynamically-built paths, so without this the files are not bundled
  // into the Vercel serverless functions and the routes 404 in production. List
  // ONLY the exact committed runtime assets each route needs.
  outputFileTracingIncludes: {
    '/api/courtyard/scene-image/**': [
      './gaming-assets/docs/courtyard-visual-references/courtyard-reference-01.png',
    ],
    '/api/courtyard/token-image/**': [
      './gaming-assets/docs/courtyard-2d-tokenssource-images/Ari-2d-source-run1-01.png',
      './gaming-assets/docs/courtyard-2d-tokenssource-images/eli-2d-source-run1-01.png',
      './gaming-assets/docs/courtyard-2d-tokenssource-images/tara-2d-source-run1-01.png',
    ],
  },
};

export default withSentryConfig(nextConfig, {
  // For all available options, see:
  // https://www.npmjs.com/package/@sentry/webpack-plugin#options

  org: "alori",

  project: "javascript-nextjs",

  // Only print logs for uploading source maps in CI
  silent: !process.env.CI,

  // For all available options, see:
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

  // Upload a larger set of source maps for prettier stack traces (increases build time)
  widenClientFileUpload: true,

  // Uncomment to route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
  // This can increase your server load as well as your hosting bill.
  // Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
  // side errors will fail.
  // tunnelRoute: "/monitoring",

  webpack: {
    // Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
    // See the following for more information:
    // https://docs.sentry.io/product/crons/
    // https://vercel.com/docs/cron-jobs
    automaticVercelMonitors: false,

    // Tree-shaking options for reducing bundle size
    treeshake: {
      // Automatically tree-shake Sentry logger statements to reduce bundle size
      removeDebugLogging: true,
    },
  }
});
