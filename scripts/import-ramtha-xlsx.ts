import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import ExcelJS from "exceljs";
import {
  ImportRowStatus,
  ImportStatus,
  LocationType,
  MovementType,
  PrismaClient,
  SnapshotStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

type Args = {
  filePath: string;
  snapshotDate: Date;
};

function parseArgs(): Args {
  const raw = process.argv.slice(2);
  const filePath = raw.find((arg) => !arg.startsWith("--"));
  const dateArg = raw.find((arg) => arg.startsWith("--date="))?.split("=")[1];

  if (!filePath || !dateArg) {
    throw new Error(
      'الاستخدام: npm run import:ramtha -- "private-data/عهدة الرمثا 2025.xlsx" --date=YYYY-MM-DD',
    );
  }

  const snapshotDate = new Date(`${dateArg}T00:00:00`);
  if (Number.isNaN(snapshotDate.getTime())) {
    throw new Error("تاريخ الجرد غير صالح. استخدم الصيغة YYYY-MM-DD");
  }

  return { filePath, snapshotDate };
}

function plainCellValue(cell: ExcelJS.Cell): string | number | null {
  const value = cell.value;
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if ("result" in value && (typeof value.result === "string" || typeof value.result === "number")) {
      return value.result;
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("");
    }
    if ("text" in value && typeof value.text === "string") {
      return value.text;
    }
  }
  return String(value);
}

function asText(cell: ExcelJS.Cell): string | null {
  const value = plainCellValue(cell);
  if (value === null) return null;
  const text = String(value).trim();
  return text.length ? text : null;
}

function asInt(cell: ExcelJS.Cell): number {
  const value = plainCellValue(cell);
  if (value === null || value === "") return 0;
  const number = typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  if (!Number.isFinite(number)) return 0;
  return Math.trunc(number);
}

function normalizeLocationName(value: string | number | null): string | null {
  if (value === null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) return `غرفة ${text}`;
  return text;
}

function inferLocationType(name: string): LocationType {
  if (name.includes("المستودع")) return LocationType.STORE;
  if (name.includes("القاعة") || name.includes("الصالة")) return LocationType.HALL;
  if (name.startsWith("غرفة ") || name.includes("غرفة الحاسوب")) return LocationType.ROOM;
  if (["امين الصندوق", "أمين الصندوق", "المدير", "الباحث", "العلاقات", "السائق"].includes(name)) {
    return LocationType.OFFICE;
  }
  if (name.includes("إدارة")) return LocationType.DEPARTMENT;
  return LocationType.OTHER;
}

async function main() {
  const { filePath, snapshotDate } = parseArgs();
  const absolutePath = path.resolve(filePath);
  const fileBuffer = await readFile(absolutePath);
  const sourceHash = createHash("sha256").update(fileBuffer).digest("hex");

  const alreadyImported = await prisma.importBatch.findUnique({ where: { sourceHash } });
  if (alreadyImported) {
    throw new Error(`تم استيراد هذا الملف سابقاً بتاريخ ${alreadyImported.importedAt.toISOString()}`);
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(fileBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) throw new Error("ملف Excel لا يحتوي على ورقة عمل");

  const headerRow = sheet.getRow(1);
  const expected = ["رقم المادة", "المادة", "الرصيد", "رقم الصفحة", "الموجود"];
  for (let index = 0; index < expected.length; index += 1) {
    const actual = asText(headerRow.getCell(index + 1));
    if (actual !== expected[index]) {
      throw new Error(`تنسيق الملف غير متوقع في العمود ${index + 1}: متوقع "${expected[index]}" ووجد "${actual ?? "فارغ"}"`);
    }
  }

  const locationColumns: Array<{ column: number; name: string }> = [];
  for (let column = 6; column <= sheet.columnCount; column += 1) {
    const rawHeader = plainCellValue(headerRow.getCell(column));
    const name = normalizeLocationName(rawHeader);
    if (name) locationColumns.push({ column, name });
  }

  const result = await prisma.$transaction(async (tx) => {
    const center = await tx.center.upsert({
      where: { code: "RAMTHA" },
      update: { name: "الرمثا", active: true },
      create: { code: "RAMTHA", name: "الرمثا" },
    });

    const defaultUnit = await tx.unit.upsert({
      where: { name: "قطعة" },
      update: { active: true },
      create: { name: "قطعة", code: "PCS" },
    });

    const locations = new Map<string, string>();
    for (const entry of locationColumns) {
      const location = await tx.location.upsert({
        where: { centerId_name: { centerId: center.id, name: entry.name } },
        update: { active: true, type: inferLocationType(entry.name) },
        create: {
          centerId: center.id,
          name: entry.name,
          type: inferLocationType(entry.name),
        },
      });
      locations.set(entry.name, location.id);
    }

    const snapshot = await tx.openingSnapshot.create({
      data: {
        centerId: center.id,
        snapshotDate,
        status: SnapshotStatus.DRAFT,
        name: "جرد افتتاحي - مركز الرمثا",
        sourceFileName: path.basename(absolutePath),
        notes: "تم إنشاؤه آلياً من ملف عهدة الرمثا. الرصيد الدفتري والموجود الفعلي محفوظان كلٌ على حدة.",
      },
    });

    const batch = await tx.importBatch.create({
      data: {
        centerId: center.id,
        snapshotId: snapshot.id,
        fileName: path.basename(absolutePath),
        sourceHash,
        status: ImportStatus.PROCESSING,
      },
    });

    let totalRows = 0;
    let importedRows = 0;
    let warningRows = 0;
    let failedRows = 0;

    for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const itemName = asText(row.getCell(2));
      const itemCode = asText(row.getCell(1));

      if (!itemName && !itemCode) continue;
      totalRows += 1;

      try {
        if (!itemName) throw new Error("اسم المادة فارغ");

        const bookBalance = asInt(row.getCell(3));
        const ledgerPageNo = asText(row.getCell(4));
        const physicalQuantity = asInt(row.getCell(5));

        const distribution: Record<string, number> = {};
        let distributedTotal = 0;
        for (const entry of locationColumns) {
          const quantity = asInt(row.getCell(entry.column));
          if (quantity > 0) {
            distribution[entry.name] = quantity;
            distributedTotal += quantity;
          }
        }

        const warnings: string[] = [];
        if (!itemCode) warnings.push("رقم المادة غير موجود في ملف Excel");
        if (distributedTotal !== physicalQuantity) {
          warnings.push(`مجموع توزيع الغرف (${distributedTotal}) لا يساوي الموجود (${physicalQuantity})`);
        }
        if (bookBalance !== physicalQuantity) {
          warnings.push(`الرصيد الدفتري (${bookBalance}) يختلف عن الموجود الفعلي (${physicalQuantity})`);
        }

        let item = itemCode
          ? await tx.item.findUnique({ where: { itemCode } })
          : await tx.item.findFirst({ where: { itemCode: null, name: itemName } });

        if (item) {
          item = await tx.item.update({
            where: { id: item.id },
            data: {
              name: itemName,
              unitId: item.unitId ?? defaultUnit.id,
              legacyLedgerPageNo: ledgerPageNo ?? item.legacyLedgerPageNo,
              active: true,
            },
          });
        } else {
          item = await tx.item.create({
            data: {
              itemCode,
              name: itemName,
              unitId: defaultUnit.id,
              legacyLedgerPageNo: ledgerPageNo,
            },
          });
        }

        const openingLine = await tx.openingSnapshotLine.create({
          data: {
            snapshotId: snapshot.id,
            itemId: item.id,
            bookBalance,
            physicalQuantity,
            ledgerPageNo,
          },
        });

        for (const [locationName, quantity] of Object.entries(distribution)) {
          const locationId = locations.get(locationName);
          if (!locationId) throw new Error(`لم يتم العثور على الموقع: ${locationName}`);

          const allocation = await tx.openingLocationAllocation.create({
            data: {
              openingLineId: openingLine.id,
              locationId,
              quantity,
            },
          });

          await tx.inventoryMovement.create({
            data: {
              itemId: item.id,
              movementType: MovementType.OPENING,
              quantity,
              movementDate: snapshotDate,
              openingAllocationId: allocation.id,
              toLocationId: locationId,
              notes: "رصيد افتتاحي مستورد من ملف عهدة الرمثا",
            },
          });
        }

        const status = warnings.length ? ImportRowStatus.WARNING : ImportRowStatus.IMPORTED;
        await tx.importRow.create({
          data: {
            batchId: batch.id,
            rowNumber,
            itemId: item.id,
            itemCode,
            itemName,
            bookBalance,
            physicalQuantity,
            ledgerPageNo,
            locationDataJsonText: JSON.stringify(distribution),
            rawDataJsonText: JSON.stringify({
              itemCode,
              itemName,
              bookBalance,
              ledgerPageNo,
              physicalQuantity,
              distribution,
            }),
            status,
            warningMessage: warnings.length ? warnings.join(" | ") : null,
          },
        });

        importedRows += 1;
        if (warnings.length) warningRows += 1;
      } catch (error) {
        failedRows += 1;
        const message = error instanceof Error ? error.message : String(error);
        await tx.importRow.create({
          data: {
            batchId: batch.id,
            rowNumber,
            itemCode,
            itemName,
            rawDataJsonText: JSON.stringify({ itemCode, itemName }),
            status: ImportRowStatus.FAILED,
            warningMessage: message,
          },
        });
      }
    }

    const finalStatus = failedRows
      ? ImportStatus.FAILED
      : warningRows
        ? ImportStatus.COMPLETED_WITH_WARNINGS
        : ImportStatus.COMPLETED;

    await tx.importBatch.update({
      where: { id: batch.id },
      data: {
        status: finalStatus,
        totalRows,
        importedRows,
        warningRows,
        failedRows,
      },
    });

    await tx.openingSnapshot.update({
      where: { id: snapshot.id },
      data: {
        status: failedRows ? SnapshotStatus.DRAFT : SnapshotStatus.POSTED,
        postedAt: failedRows ? null : new Date(),
      },
    });

    return {
      centerId: center.id,
      snapshotId: snapshot.id,
      batchId: batch.id,
      totalRows,
      importedRows,
      warningRows,
      failedRows,
      locationCount: locations.size,
    };
  });

  console.log("تم استيراد ملف عهدة الرمثا بنجاح:");
  console.table(result);
  if (result.warningRows > 0) {
    console.log("توجد صفوف تحذير محفوظة للمراجعة، ولم يتم إسقاطها من الاستيراد.");
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
