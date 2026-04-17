# Repository Guidelines

## Project Structure & Module Organization
This repository is a Vite + React 19 + TypeScript frontend. Application code lives in `src/`.

- `src/main.tsx` bootstraps the app.
- `src/App.tsx` contains the main UI flow.
- `src/services/api.ts` holds HTTP calls.
- `src/constants/birds.ts` stores static bird data.
- `src/types.ts` defines shared TypeScript types.
- `src/index.css` contains global styles.

Project metadata and tooling live at the root: `package.json`, `tsconfig.json`, `vite.config.ts`, `metadata.json`, and `.env.example`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server on port `3000`.
- `npm run build`: create a production build in `dist/`.
- `npm run preview`: serve the built app locally for verification.
- `npm run lint`: run TypeScript type-checking with `tsc --noEmit`.

Use `npm run lint && npm run build` before opening a PR.

## Coding Style & Naming Conventions
Follow the existing TypeScript and React patterns in `src/`.

- Use 2-space indentation and semicolons.
- Use `PascalCase` for React components and exported types.
- Use `camelCase` for functions, variables, and hooks.
- Keep small constants in `src/constants/` and API helpers in `src/services/`.
- Prefer explicit relative imports such as `./services/api`.

There is no dedicated formatter config checked in, so match surrounding style closely.

## Testing Guidelines
There is no automated test suite yet. Until one is added:

- Treat `npm run lint` as the required baseline check.
- Run `npm run build` to catch bundling or type regressions.
- Manually verify recording, playback, geolocation, and API submission flows in `npm run dev`.

When tests are introduced, place them beside the source file or under a `src/__tests__/` directory with names like `App.test.tsx`.

## Commit & Pull Request Guidelines
The repository currently has no commit history, so there is no established message convention to mirror. Use short, imperative commit subjects, preferably Conventional Commit style, for example: `feat: add recording error state`.

PRs should include:

- a brief summary of user-visible changes,
- any environment or API changes,
- screenshots or short recordings for UI updates,
- confirmation that `npm run lint` and `npm run build` passed.

## Security & Configuration Tips
Do not commit secrets. Copy `.env.example` to a local env file and set `GEMINI_API_KEY` there. Review API endpoints in `src/services/api.ts` before changing environments.
