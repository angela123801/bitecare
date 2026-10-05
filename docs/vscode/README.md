# VS Code Configuration (Backup Copies)

These are backup copies of the project's `.vscode` folder, which holds the debugger
config, run tasks and editor settings for BiteCare.

They live here because the `.vscode` folder has on occasion been removed by the
environment. If it goes missing, restore it by copying these four files back:

```bash
mkdir -p .vscode
cp docs/vscode/launch.json     .vscode/launch.json
cp docs/vscode/tasks.json      .vscode/tasks.json
cp docs/vscode/settings.json   .vscode/settings.json
cp docs/vscode/extensions.json .vscode/extensions.json
```

On Windows (PowerShell):

```powershell
New-Item -ItemType Directory -Force .vscode
Copy-Item docs\vscode\* .vscode\
```

## What each file does

| File | Purpose |
|------|---------|
| `launch.json` | “Run and Debug” entries that launch BiteCare in Chrome or Edge against http://localhost:5173, starting the dev server first. Breakpoints in `src/` bind. |
| `tasks.json` | One-click tasks: `dev`, `build`, `typecheck`, `lint`, and the Supabase local-database commands. `Ctrl+Shift+B` runs the default (`dev`). |
| `settings.json` | TypeScript, ESLint and Tailwind settings, plus `liveServer.settings.root` so the Go Live button can serve the built app. |
| `extensions.json` | Recommended extensions, offered when the folder is first opened. |

## Note on the Go Live button

The reliable way is to right-click the **`dist` folder** and choose “Open with Live
Server”, so the built app is served as the site root. Run `npm run build` first, and
rebuild after every change.

`liveServer.settings.root` is also set to `/dist` in `settings.json` as a fallback, but
right-clicking the folder works regardless. If you open the project **root** with Go Live
you will get a blank white page, because the root `index.html` loads unbuilt TypeScript.

Live Server also has no single-page-app fallback, so refreshing on a deep link such as
`/admin/users` returns “not found”. Use `npm run dev` or `npm run preview` if that
matters.

If a white page persists, clear the service worker (F12 → Console):

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
```

then hard-reload with Ctrl+Shift+R.
