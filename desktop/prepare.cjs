const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const standalone = path.join(root, ".next", "standalone");
const staticDir = path.join(root, ".next", "static");
const publicDir = path.join(root, "public");
const runtimeDir = path.join(__dirname, "runtime");
const templateDb = path.join(runtimeDir, "ohda-template.db");
const appDir = path.join(__dirname, "app");
const serverDir = path.join(__dirname, "server");

function copyDir(source, target) {
  if (!fs.existsSync(source)) return;
  fs.mkdirSync(target, { recursive: true });
  fs.cpSync(source, target, { recursive: true, force: true, dereference: true });
}

if (!fs.existsSync(path.join(standalone, "server.js"))) {
  throw new Error("Standalone Next.js build is missing. Run npm run build first.");
}

copyDir(publicDir, path.join(standalone, "public"));
copyDir(staticDir, path.join(standalone, ".next", "static"));

fs.mkdirSync(runtimeDir, { recursive: true });
if (fs.existsSync(templateDb)) fs.rmSync(templateDb, { force: true });

const sqliteUrl = `file:${templateDb.replace(/\\/g, "/")}`;
const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");

const result = spawnSync(
  process.execPath,
  [prismaCli, "db", "push", "--schema", path.join(root, "prisma", "schema.prisma"), "--skip-generate"],
  {
    cwd: root,
    env: { ...process.env, DATABASE_URL: sqliteUrl },
    encoding: "utf8",
  },
);

if (result.status !== 0) {
  if (result.error) process.stderr.write(String(result.error) + "\n");
  process.stderr.write(result.stdout || "");
  process.stderr.write(result.stderr || "");
  throw new Error("Failed to create the desktop database template.");
}

async function seedTemplateDatabase() {
  process.env.DATABASE_URL = sqliteUrl;
  const { PrismaClient } = require("@prisma/client");
  const prisma = new PrismaClient();
  try {
    await prisma.center.upsert({
      where: { code: "RAMTHA" },
      update: { name: "مركز الرمثا", active: true },
      create: { code: "RAMTHA", name: "مركز الرمثا", active: true },
    });
  } finally {
    await prisma.$disconnect();
  }
}

function stageDesktopApplication() {
  const rootPackage = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  fs.rmSync(appDir, { recursive: true, force: true });
  fs.rmSync(serverDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });
  fs.mkdirSync(serverDir, { recursive: true });

  fs.copyFileSync(path.join(__dirname, "main.cjs"), path.join(appDir, "main.cjs"));
  fs.copyFileSync(path.join(__dirname, "icon.png"), path.join(appDir, "icon.png"));
  copyDir(standalone, serverDir);
  const stagedNodeModules = path.join(serverDir, "node_modules");
  const stagedServerModules = path.join(serverDir, "server_modules");
  if (fs.existsSync(stagedServerModules)) {
    fs.rmSync(stagedServerModules, { recursive: true, force: true });
  }
  if (fs.existsSync(stagedNodeModules)) {
    fs.renameSync(stagedNodeModules, stagedServerModules);
  }

  fs.mkdirSync(path.join(appDir, "runtime"), { recursive: true });
  fs.copyFileSync(templateDb, path.join(appDir, "runtime", "ohda-template.db"));

  const desktopPackage = {
    name: "ohda-manager-desktop",
    version: rootPackage.version,
    productName: "نظام إدارة العهد واللوازم",
    description: rootPackage.description,
    author: rootPackage.author,
    main: "main.cjs",
    private: true,
  };
  fs.writeFileSync(
    path.join(appDir, "package.json"),
    JSON.stringify(desktopPackage, null, 2) + "\n",
    "utf8",
  );
}

seedTemplateDatabase()
  .then(() => {
    stageDesktopApplication();
    console.log("Desktop runtime prepared.");
    console.log(`Template database: ${templateDb}`);
    console.log(`Staged desktop app: ${appDir}`);
    console.log(`Staged standalone server: ${serverDir}`);
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });

