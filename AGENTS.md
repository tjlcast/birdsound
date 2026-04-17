# Repository Guidelines

## Project Structure & Module Organization
This repository is a Vite + React 19 + TypeScript app focused on bird sound analysis. The current codebase is frontend-first, with app logic living in `src/`.

- `src/main.tsx` bootstraps the React app.
- `src/App.tsx` contains the primary UI flow, including recording, upload, analysis, results, and history views.
- `src/services/api.ts` handles HTTP requests for server health checks and bird sound analysis.
- `src/services/history.ts` manages local history persistence in `localStorage`.
- `src/constants/birds.ts` stores fallback and reference bird metadata.
- `src/types.ts` defines shared TypeScript types used across the app.
- `src/index.css` contains global styles.

Project metadata and tooling live at the root: `package.json`, `package-lock.json`, `tsconfig.json`, `vite.config.ts`, `metadata.json`, `.env.example`, and `README.md`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server on port `3000` and bind to `0.0.0.0`.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: preview the built app locally.
- `npm run lint`: run TypeScript type-checking with `tsc --noEmit`.

Use `npm run lint` and `npm run build` before opening a PR.

## Current App Behavior
The app currently supports:

- microphone recording for bird sound capture,
- audio file upload for analysis,
- geolocation-aware analysis requests,
- backend health polling,
- result display with bird metadata and confidence,
- local history storage and review.

The frontend calls a backend at `http://127.0.0.1:8000` from `src/services/api.ts`. Review that file before changing environments or endpoints.

## Coding Style & Naming Conventions
Follow the existing TypeScript and React patterns in `src/`.

- Use 2-space indentation and semicolons.
- Use `PascalCase` for React components and exported types.
- Use `camelCase` for functions, variables, and hooks.
- Keep static data in `src/constants/` and service helpers in `src/services/`.
- Prefer explicit relative imports such as `./services/api`.
- Match the surrounding style closely; there is no dedicated formatter config checked in.

## Testing Guidelines
There is no automated test suite yet. Until one is added:

- treat `npm run lint` as the required baseline check,
- run `npm run build` to catch bundling and type regressions,
- manually verify recording, upload, geolocation, history, and API submission flows in `npm run dev`.

When tests are introduced, place them beside the source file or under `src/__tests__/` with names like `App.test.tsx`.

## Commit & Pull Request Guidelines
The repository already has commit history and currently uses short Conventional Commit style messages such as `feat: add compact mode to result list`. Continue using short, imperative subjects in that style when possible.

PRs should include:

- a brief summary of user-visible changes,
- any environment or API changes,
- screenshots or short recordings for UI updates,
- confirmation that `npm run lint` and `npm run build` passed.

## Security & Configuration Tips
Do not commit secrets. Use a local env file for private values and keep `.env.example` as the public reference. The current Vite config reads `GEMINI_API_KEY` via `loadEnv`, so keep environment variable names aligned with `vite.config.ts`.

This repository also includes some dependencies associated with AI Studio and server-side tooling. Before removing or repurposing them, confirm whether they are still needed for local workflows or deployment.
