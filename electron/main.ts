// Nomi desktop: an Electron main process that serves the React renderer on app://nomi, answers the
// renderer's /api/* calls itself (LLM, Parallel, calendar), and keeps Sprout on the desktop.
import { app, BrowserWindow, ipcMain, Menu, nativeImage, net, protocol, screen, shell, Tray } from "electron";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { handleApi } from "./api/router";

const ROOT = app.getAppPath();
const DIST = path.join(ROOT, "dist");
const ORIGIN = "app://nomi";

// Same files Next.js used to read. Real environment variables win.
for (const file of [".env.local", ".env"]) {
  try {
    process.loadEnvFile(path.join(ROOT, file));
  } catch {}
}

protocol.registerSchemesAsPrivileged([
  { scheme: "app", privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true } },
]);

let mainWindow: BrowserWindow | null = null;
let petWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let quitting = false;

async function serve(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  if (pathname.startsWith("/api/")) return handleApi(req);
  const file = path.join(DIST, path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, ""));
  const target = file.startsWith(DIST) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(DIST, "index.html");
  return net.fetch(pathToFileURL(target).toString());
}

// Calendar holds: write the .ics to a temp file and let the OS open it in Apple Calendar.
async function openIcs(url: string) {
  const res = await handleApi(new Request(url));
  if (!res.ok) return;
  const file = path.join(os.tmpdir(), `nomi-${Date.now()}.ics`);
  fs.writeFileSync(file, await res.text());
  await shell.openPath(file);
}

function routeLinks(win: BrowserWindow) {
  const handle = (url: string) => {
    if (url.startsWith(`${ORIGIN}/api/ics`)) openIcs(url);
    else if (/^https?:/.test(url)) shell.openExternal(url);
  };
  win.webContents.setWindowOpenHandler(({ url }) => {
    handle(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (e, url) => {
    if (url.startsWith(`${ORIGIN}/index.html`) || url === `${ORIGIN}/`) return;
    e.preventDefault();
    handle(url);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 720,
    minHeight: 560,
    title: "Nomi",
    show: false,
    backgroundColor: "#faf8f5",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  routeLinks(mainWindow);
  mainWindow.loadURL(`${ORIGIN}/index.html`);
  mainWindow.once("ready-to-show", () => mainWindow?.show());
  // Closing the main window just hides it; Sprout keeps living on the desktop.
  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });
}

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const size = { width: 220, height: 220 };
  petWindow = new BrowserWindow({
    ...size,
    x: workArea.x + workArea.width - size.width - 16,
    y: workArea.y + workArea.height - size.height - 16,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadURL(`${ORIGIN}/index.html#pet`);
}

// Show the existing window and switch to Daily in-app, so an unsaved check-in survives.
function openDaily() {
  if (!mainWindow) createMainWindow();
  mainWindow!.show();
  mainWindow!.focus();
  mainWindow!.webContents.send("nomi:show-daily");
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("🌱");
  tray.setToolTip("Nomi");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Daily check-in", click: openDaily },
      { label: "Show / hide Sprout", click: () => (petWindow?.isVisible() ? petWindow.hide() : petWindow?.show()) },
      { type: "separator" },
      { label: "Quit Nomi", click: () => app.quit() },
    ]),
  );
}

ipcMain.on("pet:open-daily", openDaily);
ipcMain.on("pet:move", (_e, dx: number, dy: number) => {
  if (!petWindow) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(Math.round(x + dx), Math.round(y + dy));
});

app.whenReady().then(() => {
  protocol.handle("app", serve);
  createMainWindow();
  createPetWindow();
  createTray();
  app.on("activate", openDaily);
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
