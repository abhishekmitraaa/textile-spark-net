import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

// The packages in the vendor-core chunk (speed plan 1.7). Each one imports only packages in this list (checked
// 2026-11-27: supabase-js 2.110 also pulls tslib and base64-arraybuffer). Rollup keeps app code out of it.
const VENDOR_CORE =
  /\/node_modules\/(react|react-dom|scheduler|react-router|react-router-dom|@remix-run\/router|@supabase\/[^/]+|iceberg-js|@tanstack\/[^/]+|tslib|base64-arraybuffer)\//;

// Start the Supabase connection while the first script downloads (speed plan 1.3). Added by the build, and only when
// VITE_SUPABASE_URL is set: a `%VITE_SUPABASE_URL%` placeholder in index.html stays literal without it and fails the
// build ("URI malformed"), which is what CI's e2e build hit on 2026-11-27.
function supabasePreconnect(url: string | undefined): Plugin {
  return {
    name: "cosora-supabase-preconnect",
    transformIndexHtml() {
      if (!url || !/^https?:\/\/[^\s"'<>]+$/.test(url)) return [];
      const href = url.replace(/\/+$/, "");
      return [
        { tag: "link", attrs: { rel: "preconnect", href, crossorigin: true }, injectTo: "head-prepend" },
        { tag: "link", attrs: { rel: "dns-prefetch", href }, injectTo: "head-prepend" },
      ];
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Passwords for the dev account switcher (AuthContext's DEMO_ACCOUNTS). They
  // are read from the gitignored .env without the VITE_ prefix, so Vite never
  // exposes them by itself, and defined only for the dev server: every build,
  // including `build:dev`, gets null, so no password can reach dist/.
  // Master Prompt 8, Phase 1.
  const env = loadEnv(mode, process.cwd(), "DEMO_");
  const demoPasswords =
    command === "serve" && env.DEMO_BUYER_PASSWORD && env.DEMO_VENDOR_PASSWORD && env.DEMO_ADMIN_PASSWORD
      ? { buyer: env.DEMO_BUYER_PASSWORD, vendor: env.DEMO_VENDOR_PASSWORD, admin: env.DEMO_ADMIN_PASSWORD }
      : null;

  return {
    server: {
      host: "::",
      port: 8080,
    },
    define: {
      __DEMO_PASSWORDS__: JSON.stringify(demoPasswords),
    },
    plugins: [react(), supabasePreconnect(loadEnv(mode, process.cwd(), "VITE_").VITE_SUPABASE_URL)],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // keep default build options for now; manual chunking caused runtime issues
    build: {
      // The interest picker's photos are served as files: the app is one main
      // bundle, so Vite's default (inline anything under 4 KB) put eight of
      // them into every page as base64 (Interest Preference v2, 2026-10-11).
      // Everything else keeps the default.
      assetsInlineLimit: (filePath: string) =>
        filePath.replace(/\\/g, "/").includes("/src/assets/interests/") ? false : undefined,
      rollupOptions: {
        output: {
          // One stable file for the libraries that never import app code (speed plan 1.7, 2026-11-27): React, the
          // router, Supabase and React Query, ~140 KB gzip. A deploy that changes only app code leaves its name, and
          // so the visitor's cached copy, unchanged. Everything else stays where Rollup puts it: the 2026-05 attempt
          // at manual chunks split more than this and broke at runtime. Only add a package here if it, and all it
          // imports, is in this list.
          manualChunks(id: string) {
            const p = id.replace(/\\/g, "/");
            if (VENDOR_CORE.test(p)) return "vendor-core";
            return undefined;
          },
        },
      },
    },
  };
});
