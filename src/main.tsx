import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getLang, loadCatalog } from "./lib/i18n";
import { startClarity } from "./lib/analytics/clarity";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { reloadOnceForNewDeploy } from "./lib/newDeploy";

// A lazily loaded page whose file a deploy replaced while this tab was open: Vite reports it here.
// Reload once to fetch the new files instead of failing the navigation (2026-10-18).
window.addEventListener("vite:preloadError", (event) => {
  if (reloadOnceForNewDeploy()) event.preventDefault();
});

// A Hindi or Gujarati session loads its catalogue before the first paint, so
// the page never flashes English. Capped, so a failed download can't hold the
// app back: it renders in English and translates if the catalogue arrives.
const catalogReady = Promise.race([loadCatalog(getLang()), new Promise((r) => setTimeout(r, 3000))]);

catalogReady.finally(() => {
  // The outer boundary catches what the in-app one can't (the providers around the router).
  createRoot(document.getElementById("root")!).render(<AppErrorBoundary><App /></AppErrorBoundary>);
});

// Microsoft Clarity: production builds with VITE_CLARITY_PROJECT_ID only, after the load event.
startClarity();
