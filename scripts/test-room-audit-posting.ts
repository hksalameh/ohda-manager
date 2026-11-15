/** Runs against a caller-provided ISOLATED SQLite database only. */
import assert from "node:assert/strict";
import { DocumentType, MovementType, PrismaClient } from "@prisma/client";
import { postRoomAuditBatch, getLocationItemBalance, getEmployeeItemBalanceAtLocation } from "../src/lib/inventory-posting";

if (!process.env.DATABASE_URL?.includes("audit-validation.db")) {
  throw new Error("Test requires the isolated audit-validation.db database");
}
const prisma = new PrismaClient();

async function main() {
  const center = await prisma.center.create({ data: { name: "مركز اختبار مستقل", code: `ROOM-AUDIT-${Date.now()}` } });
  const source = await prisma.location.create({ data: { centerId: center.id, name: "غرفة المصدر" } });
  const dest = await prisma.location.create({ data: { centerId: center.id, name: "غرفة العلاقات" } });
  const employee = await prisma.employee.create({ data: { centerId: center.id, fullName: "موظف الغرفة القديمة" } });
  const item = await prisma.item.create({ data: { name: "آلة تصوير اختبار", itemCode: `AUDIT-${Date.now()}` } });
  await prisma.inventoryMovement.create({ data: {
    itemId: item.id, movementType: MovementType.OPENING,
    movementDate: new Date(), quantity: 1, toLocationId: source.id,
  } });
  await prisma.inventoryMovement.create({ data: {
    itemId: item.id, movementType: MovementType.CUSTODY_ASSIGN,
    movementDate: new Date(), quantity: 1, fromLocationId: source.id, toLocationId: source.id,
    toEmployeeId: employee.id,
  } });
  const createAuditDocs = async (ref: string, qty: number) => {
    const ret = await prisma.inventoryDocument.create({ data: {
      centerId: center.id, documentNo: `${ref}-1`, documentDate: new Date(),
      documentType: DocumentType.RETURN,
      fromLocationId: source.id, toLocationId: source.id, employeeId: employee.id,
      lines: { create: { itemId: item.id, quantity: 1, lineNo: 1, itemNameSnapshot: item.name } },
    } });
    const transfer = await prisma.inventoryDocument.create({ data: {
      centerId: center.id, documentNo: `${ref}-2`, documentDate: new Date(),
      documentType: DocumentType.TRANSFER,
      fromLocationId: source.id, toLocationId: dest.id,
      lines: { create: { itemId: item.id, quantity: qty, lineNo: 1, itemNameSnapshot: item.name } },
    } });
    return [transfer.id, ret.id]; // deliberately reversed: batch must post RETURN first
  };

  const bad = await createAuditDocs("JRD-20261115-abcde123", 2);
  await assert.rejects(postRoomAuditBatch(bad, center.id, source.id), /الكمية غير كافية/);
  assert.equal(await getLocationItemBalance(item.id, source.id), 1, "Failed audit must not alter source");
  assert.equal(await getEmployeeItemBalanceAtLocation(employee.id, item.id, source.id), 1, "Failed audit must not clear custody");
  assert.equal(await prisma.inventoryDocument.count({ where: { id: { in: bad }, status: "POSTED" } }), 0);
  await prisma.inventoryDocument.updateMany({ where: { id: { in: bad } }, data: { status: "CANCELLED" } });

  const good = await createAuditDocs("JRD-20261115-abcde124", 1);
  const posted = await postRoomAuditBatch(good, center.id, source.id);
  assert.equal(posted.length, 2);
  assert.equal(await getLocationItemBalance(item.id, source.id), 0);
  assert.equal(await getLocationItemBalance(item.id, dest.id), 1);
  assert.equal(await getEmployeeItemBalanceAtLocation(employee.id, item.id, source.id), 0);
  assert.equal(await prisma.inventoryDocument.count({ where: { id: { in: good }, status: "POSTED" } }), 2);
  await assert.rejects(postRoomAuditBatch(good, center.id, source.id), /مستندات الجرد غير مكتملة/);
  console.log("PASS: employee custody auto-return + one-step physical transfer; failed batch rolls back completely; cannot double-post.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
