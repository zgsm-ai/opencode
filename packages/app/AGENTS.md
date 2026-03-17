## Debugging

- NEVER try to restart the app, or the server process, EVER.

## Local Dev

- `bun run dev web` now starts the local backend and the local `packages/app` Vite server together in a local checkout.
- Packaged `costrict-cli web` will also start the local app automatically when run inside this repo. Outside the repo, set `COSTRICT_APP_DEV_PATH` to the repo root or `packages/app` directory.
- If you need to debug them separately, run:
- Backend (from `packages/opencode`): `bun run --conditions=browser ./src/index.ts serve --port 4096`
- App (from `packages/app`): `bun dev -- --port 4444`
- Open `http://localhost:4444` to verify UI changes against `http://localhost:4096`.

## SolidJS

- Always prefer `createStore` over multiple `createSignal` calls

## Tool Calling

- ALWAYS USE PARALLEL TOOLS WHEN APPLICABLE.

## Browser Automation

Use `agent-browser` for web automation. Run `agent-browser --help` for all commands.

Core workflow:

1. `agent-browser open <url>` - Navigate to page
2. `agent-browser snapshot -i` - Get interactive elements with refs (@e1, @e2)
3. `agent-browser click @e1` / `fill @e2 "text"` - Interact using refs
4. Re-snapshot after page changes
