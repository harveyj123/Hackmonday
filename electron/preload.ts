import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("nomi", {
  openDaily: () => ipcRenderer.send("pet:open-daily"),
  movePet: (dx: number, dy: number) => ipcRenderer.send("pet:move", dx, dy),
  onShowDaily: (fn: () => void) => {
    const listener = () => fn();
    ipcRenderer.on("nomi:show-daily", listener);
    return () => ipcRenderer.removeListener("nomi:show-daily", listener);
  },
});
