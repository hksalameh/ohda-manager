const { app, BrowserWindow, dialog, shell } = require("electron");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const appDataRoot = app.getPath("appData");
app.setPath("userData", path.join(appDataRoot, "OhdaManager"));

let mainWindow = null;
let serverProcess = null;
let quitting = false;

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

function normalizeSqlitePath(filePath) {
  return filePath.replace(/\\/g, "/");
}

function getPrivateIpv4() {
  if (process.platform === "win32") {
    const script = [
      "$route = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue",
      "  | Where-Object { $_.NextHop -and $_.NextHop -ne '0.0.0.0' }",
      "  | Sort-Object RouteMetric, InterfaceMetric",
      "  | Select-Object -First 1;",
      "if ($route) {",
      "  Get-NetIPAddress -InterfaceIndex $route.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue",
      "    | Where-Object { $_.IPAddress -notlike '169.254.*' }",
      "    | Select-Object -First 1 -ExpandProperty IPAddress",
      "}",
    ].join(" ");
    const result = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      { windowsHide: true, encoding: "utf8", timeout: 5000 },
    );
    const routedIp = (result.stdout || "").trim().split(/\r?\n/)[0]?.trim();
    if (routedIp) return routedIp;
  }

  const candidates = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    const looksVirtual = /virtual|vmware|vbox|virtualbox|hyper-v|vethernet|tailscale|zerotier|wireguard|wsl|tap/i.test(name);
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      const ip = entry.address;
      const isPrivate =
        ip.startsWith("10.") ||
        ip.startsWith("192.168.") ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
      candidates.push({ ip, private: isPrivate, looksVirtual });
    }
  }

  return (
    candidates.find((entry) => entry.private && !entry.looksVirtual)?.ip ??
    candidates.find((entry) => entry.private)?.ip ??
    candidates[0]?.ip ??
    null
  );
}

function canUsePort(port) {
  return new Promise((resolve) => {
    const tester = net.createServer();
    tester.once("error", () => resolve(false));
    tester.once("listening", () => tester.close(() => resolve(true)));
    tester.listen(port, "0.0.0.0");
  });
}

async function findPort() {
  for (let port = 3000; port <= 3010; port += 1) {
    if (await canUsePort(port)) return port;
  }
  throw new Error("تعذر العثور على منفذ متاح لتشغيل البرنامج.");
}

function waitForServer(port, timeoutMs = 30000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const req = http.get(
        {
          hostname: "127.0.0.1",
          port,
          path: "/",
          timeout: 1500,
        },
        (res) => {
          res.resume();
          resolve();
        },
      );
      req.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) {
          reject(new Error("لم يتمكن برنامج العهد من تشغيل قاعدة الخدمة المحلية."));
          return;
        }
        setTimeout(check, 350);
      });
      req.on("timeout", () => req.destroy());
    };
    check();
  });
}

function ensureDatabase() {
  const dataDir = path.join(app.getPath("userData"), "data");
  const databasePath = path.join(dataDir, "ohda.db");
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(databasePath)) {
    const legacyDatabasePath = path.join(appDataRoot, "ohda-manager", "data", "ohda.db");
    const templatePath = path.join(__dirname, "runtime", "ohda-template.db");

    if (fs.existsSync(legacyDatabasePath)) {
      fs.copyFileSync(legacyDatabasePath, databasePath);
    } else if (!fs.existsSync(templatePath)) {
      throw new Error("ملف قاعدة البيانات الابتدائية غير موجود.");
    } else {
      fs.copyFileSync(templatePath, databasePath);
    }
  }

  return databasePath;
}

function openServerProcess(port, databasePath, lanUrl) {
  const serverPath = app.isPackaged
    ? path.join(process.resourcesPath, "server", "server.js")
    : path.join(path.resolve(__dirname, ".."), ".next", "standalone", "server.js");
  const serverRoot = path.dirname(serverPath);
  const serverModules = app.isPackaged
    ? path.join(serverRoot, "server_modules")
    : path.join(serverRoot, "node_modules");
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const logPath = path.join(logDir, "server.log");
  const logStream = fs.createWriteStream(logPath, { flags: "a" });

  serverProcess = spawn(process.execPath, [serverPath], {
    cwd: serverRoot,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1",
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "0.0.0.0",
      DATABASE_URL: `file:${normalizeSqlitePath(databasePath)}`,
      DEFAULT_CENTER_CODE: process.env.DEFAULT_CENTER_CODE || "RAMTHA",
      OHDA_DESKTOP: "1",
      OHDA_LAN_URL: lanUrl || "",
      NODE_PATH: [serverModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter),
    },
  });

  serverProcess.stdout?.pipe(logStream);
  serverProcess.stderr?.pipe(logStream);
  serverProcess.once("exit", (code) => {
    serverProcess = null;
    logStream.end();
    if (!quitting && code !== 0) {
      dialog.showErrorBox(
        "توقف برنامج العهد",
        `توقفت الخدمة الداخلية بشكل غير متوقع. رمز الخطأ: ${code ?? "غير معروف"}\nيمكن مراجعة السجل في:\n${logPath}`,
      );
      app.quit();
    }
  });
}

function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 900,
    minWidth: 980,
    minHeight: 680,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#f1f5f9",
    icon: path.join(__dirname, "icon.png"),
    title: "نظام إدارة العهد واللوازم",
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://127.0.0.1:${port}`) && !url.startsWith(`http://localhost:${port}`)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "allow" };
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  mainWindow.loadURL(`http://127.0.0.1:${port}`);
}

async function startApplication() {
  try {
    const databasePath = ensureDatabase();
    const port = await findPort();
    const ip = getPrivateIpv4();
    const lanUrl = ip ? `http://${ip}:${port}` : "";

    openServerProcess(port, databasePath, lanUrl);
    await waitForServer(port);
    createWindow(port);
  } catch (error) {
    dialog.showErrorBox(
      "تعذر تشغيل برنامج العهد",
      error instanceof Error ? error.message : String(error),
    );
    app.quit();
  }
}

app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

app.on("before-quit", () => {
  quitting = true;
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill();
    serverProcess = null;
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.whenReady().then(startApplication);

