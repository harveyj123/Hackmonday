// Nomi desktop: an Electron main process that serves the React renderer on app://nomi, answers the
// renderer's /api/* calls itself (LLM, Parallel, calendar), and keeps Sprout on the desktop.
// Sprout's window is Nomi Daily; the main window is Nomi Bots.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, shell, Tray } from "electron";
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
    title: "Nomi Bots",
    show: false,
    backgroundColor: "#faf8f5",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });
  routeLinks(mainWindow);
  // Sprout is the way in, so the Bots window stays hidden until something opens it.
  mainWindow.loadURL(`${ORIGIN}/index.html`);
  // Closing the main window just hides it; Sprout keeps living on the desktop.
  mainWindow.on("close", (e) => {
    if (quitting) return;
    e.preventDefault();
    mainWindow?.hide();
  });
}

// Sprout's window grows for the Daily panel and the plan nudge, keeping the pet's corner where it is.
const PET_SIZES = { pet: { width: 220, height: 220 }, panel: { width: 560, height: 740 }, nudge: { width: 500, height: 380 }, suggest: { width: 500, height: 420 } };
type PetView = keyof typeof PET_SIZES;
const CLICK_THROUGH = process.platform !== "linux";

function createPetWindow() {
  const { workArea } = screen.getPrimaryDisplay();
  const size = PET_SIZES.pet;
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
  // Empty, transparent parts of the window let clicks through to the desktop; the renderer turns
  // clicks back on while the cursor is over Sprout, the panel or a nudge (see "pet:hit"). Linux can't
  // forward mouse moves to an ignoring window, so there the whole window keeps taking clicks.
  if (CLICK_THROUGH) petWindow.setIgnoreMouseEvents(true, { forward: true });
  petWindow.setAlwaysOnTop(true, "floating");
  petWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  petWindow.loadURL(`${ORIGIN}/index.html#pet`);
}

function setPetView(view: PetView) {
  if (!petWindow) return;
  const b = petWindow.getBounds();
  const { workArea } = screen.getDisplayMatching(b);
  const width = Math.min(PET_SIZES[view].width, workArea.width);
  const height = Math.min(PET_SIZES[view].height, workArea.height);
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));
  const x = clamp(b.x + b.width - width, workArea.x, workArea.x + workArea.width - width);
  const y = clamp(b.y + b.height - height, workArea.y, workArea.y + workArea.height - height);
  petWindow.setResizable(true);
  petWindow.setBounds({ x, y, width, height });
  petWindow.setResizable(false);
  if (view === "pet") return;
  petWindow.show();
  // The panel takes typing, so it needs focus; a nudge just appears.
  if (view === "panel") petWindow.focus();
}

// Daily lives in Sprout: open its panel.
function openDaily() {
  petWindow?.show();
  petWindow?.webContents.send("nomi:pet", "open-daily");
}

// Bots is the main window. A storyboard hand-off opens its bot directly.
function openBots(item?: unknown) {
  if (!mainWindow) createMainWindow();
  mainWindow!.show();
  mainWindow!.focus();
  if (item) mainWindow!.webContents.send("nomi:handoff", item);
}

// Demo: have the bots scout something now and let Sprout pop it.
function demoSuggest() {
  petWindow?.show();
  petWindow?.webContents.send("nomi:pet", "demo-suggest");
}

// Demo: jump to the next plan's day so Sprout's nudge fires on cue.
function demoNudge() {
  petWindow?.show();
  petWindow?.webContents.send("nomi:pet", "demo-nudge");
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty());
  tray.setTitle("🌱");
  tray.setToolTip("Nomi");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open Nomi Daily", click: openDaily },
      { label: "Open Nomi Bots", click: () => openBots() },
      { label: "Demo: nudge the next plan (⌘⌥⇧N)", click: demoNudge },
      { label: "Demo: a bot suggestion (⌘⌥⇧B)", click: demoSuggest },
      { label: "Show / hide Sprout", click: () => (petWindow?.isVisible() ? petWindow.hide() : petWindow?.show()) },
      { type: "separator" },
      { label: "Quit Nomi", click: () => app.quit() },
    ]),
  );
}

ipcMain.on("pet:view", (_e, view: PetView) => PET_SIZES[view] && setPetView(view));
ipcMain.on("pet:hit", (_e, hit: boolean) => CLICK_THROUGH && petWindow?.setIgnoreMouseEvents(!hit, { forward: true }));
ipcMain.on("nomi:open-daily", openDaily);
ipcMain.on("nomi:open-bots", (_e, item: unknown) => openBots(item ?? undefined));
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
  // Global so it works on stage with any app in front; Option keeps it off common app shortcuts like ⌘⇧N.
  globalShortcut.register("CommandOrControl+Alt+Shift+N", demoNudge);
  globalShortcut.register("CommandOrControl+Alt+Shift+B", demoSuggest);
  app.on("activate", () => openBots());
});

app.on("before-quit", () => {
  quitting = true;
});
app.on("will-quit", () => globalShortcut.unregisterAll());
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
