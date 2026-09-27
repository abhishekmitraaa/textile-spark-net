import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { getLang, loadCatalog } from "./lib/i18n";

// A Hindi or Gujarati session loads its catalogue before the first paint, so
// the page never flashes English. Capped, so a failed download can't hold the
// app back: it renders in English and translates if the catalogue arrives.
const catalogReady = Promise.race([loadCatalog(getLang()), new Promise((r) => setTimeout(r, 3000))]);

catalogReady.finally(() => {
  createRoot(document.getElementById("root")!).render(<App />);
});
