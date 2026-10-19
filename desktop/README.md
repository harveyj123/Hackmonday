# Nomi desktop (Electron)

```bash
npm install
npm run desktop
```

- Opens Nomi in a desktop window. If `npm run dev` is already running on port 3000 it reuses it, otherwise it starts Next for you.
- Sprout sits in the bottom-right corner of your screen, always on top. Click Sprout to open the Daily check-in. Hover to see the bubble; drag the bubble to move Sprout.
- Closing the main window hides it; Sprout and the 🌱 tray/menu bar icon stay. Quit from the tray menu.
- `NOMI_PORT=3001 npm run desktop` uses another port. `NOMI_URL=https://… npm run desktop` points the shell at a deployed app.
- `npm run desktop:prod` builds Next first and runs `next start` instead of dev.

Everything desktop-only lives in `desktop/`, so it doesn't touch `features/`.
