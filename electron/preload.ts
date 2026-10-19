import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";

function on<T>(channel: string, fn: (arg: T) => void) {
  const listener = (_e: IpcRendererEvent, arg: T) => fn(arg);
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

contextBridge.exposeInMainWorld("nomi", {
  movePet: (dx: number, dy: number) => ipcRenderer.send("pet:move", dx, dy),
  setPetView: (view: string) => ipcRenderer.send("pet:view", view),
  openBots: (item?: unknown) => ipcRenderer.send("nomi:open-bots", item ?? null),
  onPetCommand: (fn: (cmd: string) => void) => on("nomi:pet", fn),
  onHandoff: (fn: (item: unknown) => void) => on("nomi:handoff", fn),
});
