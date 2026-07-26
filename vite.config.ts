// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, componentTagger (dev-only),
//     VITE_* env injection, @ path alias, React/TanStack dedupe, error logger plugins,
//     and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    server: { entry: "server" },
    // Prerender every route to static HTML at build time, crawling links out from "/".
    prerender: {
      enabled: true,
      crawlLinks: true,
    },
  },
  // nitro: false — nitro is deliberately DISABLED (Jul 2026). The reason is a
  // three-day incident, so it is documented properly:
  //
  // TanStack Start's prerender does NOT crawl nitro's server. It boots Vite's
  // preview server, whose middleware imports the SSR bundle from the server
  // environment's output directory — resolved as `build.outDir ?? "dist"` plus
  // "/server" (@tanstack/start-plugin-core, vite/output-directory.ts). Nothing
  // here overrides that, so the preview server always looked in dist/server.
  //
  // Meanwhile nitro (outside the Lovable sandbox) writes to .output/. The
  // @lovable.dev config only forces nitro's output into dist/ INSIDE their
  // sandbox. So locally, the preview server was importing dist/server/server.js
  // from a stale Jul 23 sandbox build: every prerender ran three-day-old server
  // code and emitted HTML referencing assets the build never produced. The
  // earlier "node-server so prerender has something to crawl" comment was based
  // on a false premise — prerender never touched nitro's output at all.
  //
  // With nitro disabled, the framework's own defaults are internally consistent:
  //   client build → dist/client  (assets + public/ copies: .htaccess, api/, __l5e, …)
  //   server build → dist/server/server.js  (what the preview server imports — fresh)
  //   prerender    → crawls the fresh server, writes index.html into dist/client
  //
  // DEPLOY dist/client to Namecheap (deploy.ps1 points there). dist/server is a
  // build byproduct that never leaves the machine. .output/ is no longer
  // produced; any .output lying around is from the nitro era and can be deleted.
  //
  // If this repo ever goes back into the Lovable sandbox, revisit: the sandbox
  // expects the nitro cloudflare-module build for its previews.
  nitro: false,
});
