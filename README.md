# Refract

Refract is a browser puzzle about drawing light across a dark optical bench. Connect matching emitters, thread every lens, and spend every crystal charge without crossing or sharing segments. It includes a 24-board Campaign and an endless Cascade mode.

## Run

```bash
npm ci
npm run dev
```

Open the URL Vite prints. Create the static build in `dist/` with `npm run build`.

## Controls

- Mouse, pen, or touch: press a node and drag between neighboring nodes; drag backward to retract.
- Arrow keys or WASD: navigate. Enter or Space: confirm. Escape: back.
- R: clear beams. M: mute. Backquote: diagnostics.

Run `npm run typecheck`, `npm run lint`, `npm run format`, and `npm test` for all checks.
