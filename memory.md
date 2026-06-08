-project name is cosora. Cosora is a B2B fashion and textile sourcing marketplace built as a PaaS web platform. It connects three sides of the fashion supply chain: Vendors (manufacturers, mills, suppliers), Buyers (brands, retailers, designers, sourcing managers), and an Admin panel (Cosora's internal ops team). The goal is to digitise India's fragmented fashion supply chain.

- Current workspace: `textile-spark-net/` is the app root under `c:\Users\Abhishek Mitra\OneDrive\Desktop\cosora lovable`.
- Treat `textile-spark-net/memory.md` and `textile-spark-net/changelog.md` as the first and only initialization context for future sessions; read them before planning or executing any request.
- Do not depend on full chat history for setup or context recovery; keep all durable project state in memory.md and changelog.md.
- The app is a Vite + React + TypeScript + shadcn-ui + Tailwind project.
- `npm run dev` starts the Vite dev server, `npm run build` is the main production check, and `npm run test:e2e` runs Playwright tests.
- The current `src/App.tsx` routes a buyer/vendor marketplace flow with many pages already wired, including buyer home, products, requirements, vendors, chats, analytics, blogs, onboarding, and auth screens.
