// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    plugins: [
      mcpPlugin(),
      // Offline app shell for workshop tablets. Registration is guarded in
      // src/lib/register-sw.ts so previews never install a worker.
      VitePWA({
        registerType: "autoUpdate",
        injectRegister: null,
        devOptions: { enabled: false },
        filename: "sw.js",
        manifest: {
          name: "ROX Diagnostics",
          short_name: "ROX Diag",
          description: "Dealer diagnostics and ECU programming for the ROX 01.",
          start_url: "/",
          display: "standalone",
          background_color: "#0B0B0F",
          theme_color: "#0B0B0F",
          icons: [{ src: "/favicon.ico", sizes: "48x48", type: "image/x-icon" }],
        },
        workbox: {
          globPatterns: ["**/*.{js,css,html,woff2,json}"],
          navigateFallbackDenylist: [/^\/~oauth/, /^\/api\//, /^\/mcp/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: { cacheName: "rox-shell", networkTimeoutSeconds: 3 },
            },
            {
              urlPattern: ({ url, sameOrigin }) =>
                sameOrigin && /\/(assets|_build)\/|r11-oversea-data\.json$/.test(url.pathname),
              handler: "CacheFirst",
              options: {
                cacheName: "rox-assets",
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              },
            },
          ],
        },
      }),
    ],
  },
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
});
