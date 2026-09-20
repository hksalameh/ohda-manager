import { mkdir } from "node:fs/promises";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function timestamp() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Amman",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}${value.month}${value.day}-${value.hour}${value.minute}${value.second}`;
}

async function main() {
  const requestedDir = process.argv[2] || "private-data/backups";
  const backupDir = path.resolve(requestedDir);
  await mkdir(backupDir, { recursive: true });

  const backupFile = path.join(backupDir, `ohda-${timestamp()}.db`);
  const escaped = backupFile.replace(/'/g, "''");

  // SQLite VACUUM INTO creates a transactionally consistent copy of the live database.
  await prisma.$executeRawUnsafe(`VACUUM INTO '${escaped}'`);
  console.log(`تم إنشاء نسخة احتياطية آمنة: ${backupFile}`);
}

main()
  .catch((error) => {
    console.error("فشل إنشاء النسخة الاحتياطية:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
