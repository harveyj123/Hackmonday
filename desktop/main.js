// Nomi desktop shell: wraps the Next.js app in a main window and adds a small
// always-on-top Sprout pet window in the corner of the screen.
const { app, BrowserWindow, ipcMain, screen, Tray, Menu, nativeImage } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");

const PORT = Number(process.env.NOMI_PORT || 3000);
const APP_URL = process.env.NOMI_URL || `http://localhost:${PORT}`;
const ROOT = path.join(__dirname, "..");

let mainWindow = null;
let petWindow = null;
let nextServer = null;

function ping(url) {
  return new Promise((resolve) => {
    http.get(url, (res) => { res.resume(); resolve(true); }).on("error", () => resolve(false));
  });
}

// Reuse a running `npm run dev` if there is one, otherwise start Next ourselves.
async function ensureServer() {
  if (await ping(APP_URL)) return;
  const mode = process.env.NOMI_PROD ? "start" : "dev";
  nextServer = spawn(process.platform === "win32" ? "npx.cmd" : "npx", ["next", mode, "-p", String(PORT)], {
    cwd: ROOT,
    stdio: "inherit",
    env: process.env,
  });
  for (let i = 0; i < 120; i++) {
    if (await ping(APP_URL)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Next.js did not come up at ${APP_URL}`);
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: "Nomi",
    show: false,
    backgroundColor: "#faf7f2",
    webPreferences: { contextIsolation: true },
  });
  mainWindow.loadURL(APP_URL);
  mainWindow.once("ready-to-show", () => mainWindow.show());
  // Closing the main window just hides it; Sprout keeps living on the desktop.
  mainWindow.on("close", (e) => {
    if (!app.isQuitting) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
}

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const size = { width: 160, height: 190 };
  petWindow = new BrowserWindow({
    ...size,
    x: workArea.x + workArea.width - size.width - 24,
    y: workArea.y + workArea.height - size.height - 24,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
    },
  });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadFile(path.join(__dirname, "pet.html"));
}

function openDaily() {
  if (!mainWindow) createMainWindow();
  // "/" opens on the Daily check-in by default.
  mainWindow.loadURL(APP_URL);
  mainWindow.show();
  mainWindow.focus();
}

function createTray() {
  const tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("🌱");
  tray.setToolTip("Nomi");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Daily check-in", click: openDaily },
      { label: "Show / hide Sprout", click: () => (petWindow.isVisible() ? petWindow.hide() : petWindow.show()) },
      { type: "separator" },
      { label: "Quit Nomi", click: () => { app.isQuitting = true; app.quit(); } },
    ]),
  );
  return tray;
}

ipcMain.on("pet:open-daily", openDaily);

let tray = null;
app.whenReady().then(async () => {
  createPetWindow();
  await ensureServer();
  createMainWindow();
  tray = createTray();
  app.on("activate", openDaily);
});

app.on("before-quit", () => {
  app.isQuitting = true;
  if (nextServer) nextServer.kill();
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
