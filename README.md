# Cosora

B2B fashion marketplace connecting manufacturers with buyers. Live at [cosora.in](https://www.cosora.in).

## Tech stack

- Vite, React 18 and TypeScript
- shadcn-ui and Tailwind CSS
- Supabase (Postgres, Auth, Storage, Edge Functions)
- Hosted on Vercel

## Local development

Requires Node.js and npm.

```sh
npm install
npm run dev        # dev server on http://localhost:8080
```

Other scripts:

```sh
npm run build      # production build into dist/
npm run lint
npm run typecheck
npm run test:e2e   # Playwright end-to-end tests
```

## Deployment

Pushing to `main` deploys to production on Vercel; other branches get preview deploys.

Project documentation lives in [`documentation/`](documentation/).
