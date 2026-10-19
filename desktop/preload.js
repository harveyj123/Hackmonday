const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("nomi", {
  openDaily: () => ipcRenderer.send("pet:open-daily"),
});
