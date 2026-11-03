# AGENTS.md

## UI

The project is built entirely for personal use. So most secondary labels and descriptions will be redundant since builder and user are the same person. Let the layout do most of the explaining and only add descriptive text where necessary.

## Verifying a change

End every PR description with a "Verify locally" block: the commands a person runs after
`npm install`, in order, then what to click and what to expect. No prose around them.

- Web workspace: `npm run dev:demo`, then open http://127.0.0.1:4318
- Electron shell, for anything touching the desktop app, the collectors or the sidecar:
  `npm run dev:desktop` (it builds first; allow a minute)
- Tests: `npm test`
