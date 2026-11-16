/** Tests run ONLY on the dedicated employee-room-validation.db fixture. */
import assert from "node:assert/strict";
import { PrismaClient, MovementType } from "@prisma/client";
import { saveEmployeeRoomsInTransaction, setPrimaryEmployeeRoomInTransaction } from "../src/lib/employee-room-assignments";
import { createCurrentCustodyDocument } from "../src/lib/current-custody-document";
import { ensureCustodyTemplate } from "../src/lib/print-templates";

if (!process.env.DATABASE_URL?.endsWith("employee-room-validation.db"))
  throw new Error("Must use separate employee-room-validation.db test database");

const prisma = new PrismaClient();
async function main() {
  const center = await prisma.center.create({ data: { name: "اختبار تعدد غرف الموظف" } });
  const otherCenter = await prisma.center.create({ data: { name: "مركز آخر للتأكد من العزل" } });
  const [room1, room2, room3, outsider] = await Promise.all([
    prisma.location.create({ data: { centerId: center.id, name: "الأولى" } }),
    prisma.location.create({ data: { centerId: center.id, name: "الثانية" } }),
    prisma.location.create({ data: { centerId: center.id, name: "الثالثة" } }),
    prisma.location.create({ data: { centerId: otherCenter.id, name: "غرفة خارج المركز" } }),
  ]);
  const employee = await prisma.employee.create({ data: { centerId: center.id, fullName: "موظف متعدد الغرف" } });
  const edit = async (locationIds: string[], primaryLocationId?: string) => prisma.$transaction((tx) =>
    saveEmployeeRoomsInTransaction(tx, { centerId: center.id, employeeId: employee.id, locationIds, primaryLocationId }));
  const current = async () => prisma.employeeLocationAssignment.findMany({
    where: { employeeId: employee.id, endsAt: null }, orderBy: { locationId: "asc" },
  });

  await edit([room1.id, room2.id], room1.id);
  assert.equal((await current()).length, 2);
  assert.equal((await current()).filter((a) => a.isPrimary).length, 1);
  await edit([room1.id, room2.id], room1.id);
  assert.equal((await current()).length, 2, "Repeating save must not duplicate room links");

  await prisma.$transaction((tx) => setPrimaryEmployeeRoomInTransaction(tx, {
    centerId: center.id, employeeId: employee.id, locationId: room3.id,
  }));
  assert.equal((await current()).length, 3, "Changing primary must retain existing linked rooms");
  assert.equal((await current()).find((a) => a.isPrimary)?.locationId, room3.id);

  await assert.rejects(edit([outsider.id], outsider.id), /غير صالح/);
  assert.equal((await current()).length, 3, "Invalid room must not partly alter links");
  await assert.rejects(edit([room1.id, room2.id], room3.id), /الرئيسية/);

  const item = await prisma.item.create({ data: { name: "قطعة اختبار" } });
  await prisma.inventoryMovement.createMany({ data: [
    { itemId: item.id, movementType: MovementType.OPENING, quantity: 1, movementDate: new Date(), toLocationId: room2.id },
    { itemId: item.id, movementType: MovementType.CUSTODY_ASSIGN, quantity: 1, movementDate: new Date(),
      fromLocationId: room2.id, toLocationId: room2.id, toEmployeeId: employee.id },
  ] });
  await assert.rejects(edit([room1.id, room3.id], room1.id), /ما زالت فيها عهدة/);
  assert.equal((await current()).length, 3, "Custody must prevent accidentally losing room assignment");

  const template = await ensureCustodyTemplate();
  const before = await prisma.inventoryMovement.count();
  const receipt = await createCurrentCustodyDocument({
    centerId: center.id, employeeId: employee.id, roomId: room2.id, templateVersionId: template.id,
  });
  assert.equal(receipt.status, "POSTED");
  assert.equal(receipt.postingMode, "REFERENCE_ONLY");
  assert.equal(await prisma.inventoryMovement.count(), before, "Printing custody from secondary room must not create movements");

  await prisma.inventoryMovement.create({ data: { itemId: item.id, movementType: MovementType.CUSTODY_RETURN,
    quantity: 1, movementDate: new Date(), fromLocationId: room2.id, toLocationId: room2.id, fromEmployeeId: employee.id } });
  await edit([room1.id, room3.id], room1.id);
  assert.equal((await current()).length, 2);
  assert.equal((await prisma.employeeLocationAssignment.count({ where: { employeeId: employee.id, locationId: room2.id, endsAt: { not: null } } })), 1);

  const originalId = room1.id;
  await prisma.location.update({ where: { id: originalId }, data: { name: "المكتب بعد التسمية" } });
  assert.equal((await prisma.location.findUnique({ where: { id: originalId } }))?.name, "المكتب بعد التسمية");
  assert.equal((await current()).some((assignment) => assignment.locationId === originalId), true, "Room rename must retain the assignment ID");
  console.log("PASS: multi-room employee links, primary switching, custody protection, secondary-room printing, rename ID stability.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
