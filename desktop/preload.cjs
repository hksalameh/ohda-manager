const { contextBridge, ipcRenderer } = require("electron");

// Expose only the native close operation, never Node.js or arbitrary IPC.
contextBridge.exposeInMainWorld("ohdaDesktop", Object.freeze({
  closeApp: () => ipcRenderer.send("ohda:close-app"),
}));
