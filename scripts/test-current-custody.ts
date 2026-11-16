import assert from "node:assert/strict";
import {
  DocumentStatus,
  DocumentType,
  LocationType,
  MovementType,
  PostingMode,
  PrismaClient,
} from "@prisma/client";
import { currentCustodyAtRoom } from "../src/lib/custody-snapshot";
import { createCurrentCustodyDocument } from "../src/lib/current-custody-document";
import { ensureCustodyTemplate } from "../src/lib/print-templates";

const prisma = new PrismaClient();

async function main() {
  const center = await prisma.center.create({
    data: { code: `CUSTODY_PRINT_TEST_${Date.now()}`, name: "مركز اختبار السند" },
  });
  const room = await prisma.location.create({
    data: { centerId: center.id, name: "غرفة اختبار العهدة", type: LocationType.ROOM },
  });
  const otherRoom = await prisma.location.create({
    data: { centerId: center.id, name: "غرفة أخرى", type: LocationType.ROOM },
  });
  const employee = await prisma.employee.create({
    data: { centerId: center.id, fullName: "موظف اختبار الطباعة", employeeNo: "PRINT-1" },
  });
  await prisma.employeeLocationAssignment.create({
    data: { employeeId: employee.id, locationId: room.id, startsAt: new Date(), isPrimary: true },
  });
  const item = await prisma.item.create({
    data: { itemCode: `CPR-${Date.now()}`, name: "جهاز حاسوب في عهدة الموظف" },
  });
  await prisma.inventoryMovement.create({
    data: {
      itemId: item.id, quantity: 3, movementType: MovementType.OPENING,
      movementDate: new Date(), toLocationId: room.id,
    },
  });
  await prisma.inventoryMovement.create({
    data: {
      itemId: item.id, quantity: 2, movementType: MovementType.CUSTODY_ASSIGN,
      movementDate: new Date(), fromLocationId: room.id, toLocationId: room.id,
      toEmployeeId: employee.id,
    },
  });

  const template = await ensureCustodyTemplate();
  const before = await prisma.inventoryMovement.count();
  const document = await createCurrentCustodyDocument({
    centerId: center.id, employeeId: employee.id, roomId: room.id, templateVersionId: template.id,
  });
  assert.equal(document.status, DocumentStatus.POSTED, "الطباعة يجب أن تكون ممكنة فورًا");
  assert.equal(document.documentType, DocumentType.CUSTODY);
  assert.equal(document.postingMode, PostingMode.REFERENCE_ONLY, "النسخة المطبوعة مرجعية فقط");
  const lines = await prisma.inventoryDocumentLine.findMany({ where: { documentId: document.id } });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].quantity, 2, "السند يطبع العهدة المسجلة وليس عدد القطع الموجودة كلها");
  assert.equal(lines[0].itemCodeSnapshot, item.itemCode);
  assert.equal(await prisma.inventoryMovement.count(), before, "الطباعة يجب ألا تضيف أي حركة مخزون");
  const moves = await prisma.inventoryMovement.findMany({
    where: { itemId: item.id },
    select: {
      itemId: true, quantity: true, toEmployeeId: true, fromEmployeeId: true,
      toLocationId: true, fromLocationId: true,
    },
  });
  assert.equal(currentCustodyAtRoom(employee.id, room.id, moves).get(item.id), 2);
  assert.equal(currentCustodyAtRoom(employee.id, otherRoom.id, moves).size, 0);

  const again = await createCurrentCustodyDocument({
    centerId: center.id, employeeId: employee.id, roomId: room.id, templateVersionId: template.id,
  });
  assert.equal((await prisma.inventoryDocumentLine.findFirst({ where: { documentId: again.id } }))?.quantity, 2);
  assert.equal(await prisma.inventoryMovement.count(), before, "تكرار الطباعة لا يكرر العهدة");

  // Explicitly approve the additional one piece found in the room and
  // print one combined handover, without reassigning the previous two.
  const combined = await createCurrentCustodyDocument({
    centerId: center.id, employeeId: employee.id, roomId: room.id,
    templateVersionId: template.id, assignRoomStock: true,
  });
  const combinedLines = await prisma.inventoryDocumentLine.findMany({ where: { documentId: combined.id } });
  assert.equal(combinedLines.length, 1);
  assert.equal(combinedLines[0].quantity, 3, "السند الجديد يجب أن يشمل القديم والموجودات الجديدة");
  assert.equal(await prisma.inventoryMovement.count(), before + 1, "يجب إضافة حركة تسليم للقطعة الجديدة فقط");
  const handover = await prisma.inventoryDocument.findFirst({
    where: { centerId: center.id, documentNo: { startsWith: "CUST-ROOM-" } },
  });
  assert.equal(handover?.postingMode, PostingMode.POST_TO_STOCK, "المواد الجديدة يجب أن تُسلّم بسند حركة حقيقي");
  const repeatCombined = await createCurrentCustodyDocument({
    centerId: center.id, employeeId: employee.id, roomId: room.id,
    templateVersionId: template.id, assignRoomStock: true,
  });
  assert.equal((await prisma.inventoryDocumentLine.findFirst({ where: { documentId: repeatCombined.id } }))?.quantity, 3);
  assert.equal(await prisma.inventoryMovement.count(), before + 1, "تكرار سند شامل لا يكرر التسليم");
  const physical = await prisma.inventoryMovement.findMany({
    where: { itemId: item.id },
    select: { quantity: true, fromLocationId: true, toLocationId: true },
  });
  assert.equal(physical.reduce((stock, m) =>
    stock + (m.toLocationId === room.id ? m.quantity : 0) - (m.fromLocationId === room.id ? m.quantity : 0), 0),
    3, "اعتماد عهدة الموظف لا يغير عدد القطع الموجودة في الغرفة");

  const pending = await prisma.inventoryDocument.create({
    data: {
      centerId: center.id, documentNo: "JRD-20261115-12345678-1",
      documentType: DocumentType.TRANSFER,
      documentDate: new Date(),
      fromLocationId: room.id, toLocationId: otherRoom.id,
    },
  });
  await assert.rejects(
    createCurrentCustodyDocument({
      centerId: center.id, employeeId: employee.id, roomId: room.id, templateVersionId: template.id,
    }),
    /جرد لم يُعتمد/,
    "يجب منع طباعة عهدة غرفة بها جرد معلق",
  );
  await prisma.inventoryDocument.delete({ where: { id: pending.id } });

  await assert.rejects(
    createCurrentCustodyDocument({
      centerId: center.id, employeeId: employee.id, roomId: otherRoom.id, templateVersionId: template.id,
    }),
    /الموظف ليس مرتبطًا/,
    "يجب منع إنشاء سند لموظف في غرفة أخرى",
  );
  assert.equal(await prisma.inventoryMovement.count(), before + 1);
  console.log("PASS: existing custody print, one-step full room handover, no duplicate assignments, pending-audit protection.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
