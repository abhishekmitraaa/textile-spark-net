import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

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
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    // keep default build options for now; manual chunking caused runtime issues
  };
});
