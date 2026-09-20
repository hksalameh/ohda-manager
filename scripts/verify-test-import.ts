import {
  ImportStatus,
  MovementType,
  PrismaClient,
  SnapshotStatus,
} from "@prisma/client";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  const center = await prisma.center.findUnique({
    where: { code: "RAMTHA" },
    include: { locations: true },
  });
  assert(center, "لم يتم إنشاء مركز الرمثا");
  assert(center.locations.length === 24, `عدد المواقع المتوقع 24 ووجد ${center.locations.length}`);

  const snapshot = await prisma.openingSnapshot.findFirst({
    where: { centerId: center.id },
    orderBy: { createdAt: "desc" },
    include: { lines: true },
  });
  assert(snapshot, "لم يتم إنشاء الجرد الافتتاحي");
  assert(snapshot.status === SnapshotStatus.POSTED, "الجرد الافتتاحي لم يتم ترحيله");
  assert(
    snapshot.snapshotDate.toISOString().slice(0, 10) === "2025-12-31",
    `تاريخ الجرد غير صحيح: ${snapshot.snapshotDate.toISOString()}`,
  );
  assert(snapshot.lines.length === 3, `عدد مواد الاختبار المتوقع 3 ووجد ${snapshot.lines.length}`);

  const physicalTotal = snapshot.lines.reduce((sum, line) => sum + line.physicalQuantity, 0);
  const bookTotal = snapshot.lines.reduce((sum, line) => sum + line.bookBalance, 0);
  assert(physicalTotal === 13, `إجمالي الموجود المتوقع 13 ووجد ${physicalTotal}`);
  assert(bookTotal === 16, `إجمالي الرصيد الدفتري المتوقع 16 ووجد ${bookTotal}`);

  const openingMovements = await prisma.inventoryMovement.findMany({
    where: { movementType: MovementType.OPENING },
  });
  const movementTotal = openingMovements.reduce((sum, movement) => sum + movement.quantity, 0);
  assert(movementTotal === physicalTotal, `حركات الافتتاح ${movementTotal} لا تساوي الموجود ${physicalTotal}`);

  const batch = await prisma.importBatch.findFirst({
    where: { centerId: center.id },
    orderBy: { importedAt: "desc" },
  });
  assert(batch, "لم يتم إنشاء سجل الاستيراد");
  assert(batch.status === ImportStatus.COMPLETED_WITH_WARNINGS, `حالة الاستيراد غير متوقعة: ${batch.status}`);
  assert(batch.totalRows === 3, `عدد الصفوف المتوقع 3 ووجد ${batch.totalRows}`);
  assert(batch.importedRows === 3, `عدد الصفوف المستوردة المتوقع 3 ووجد ${batch.importedRows}`);
  assert(batch.warningRows === 2, `عدد التحذيرات المتوقع 2 ووجد ${batch.warningRows}`);
  assert(batch.failedRows === 0, `يجب ألا توجد صفوف فاشلة ووجد ${batch.failedRows}`);

  const missingCodeItem = await prisma.item.findFirst({
    where: { itemCode: null, name: "مادة اختبار بلا رقم" },
  });
  assert(missingCodeItem, "المادة بلا رقم لم تُحفظ");

  console.log("نجح اختبار قاعدة البيانات والاستيراد بالكامل.");
  console.table({
    locations: center.locations.length,
    items: snapshot.lines.length,
    bookTotal,
    physicalTotal,
    movementTotal,
    warnings: batch.warningRows,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
