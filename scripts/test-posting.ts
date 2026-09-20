import {
  DocumentStatus,
  DocumentType,
  LocationType,
  MovementType,
  PostingMode,
  PrismaClient,
} from "@prisma/client";
import {
  getEmployeeItemBalanceAtLocation,
  getLocationItemBalance,
  postInventoryDocument,
} from "../src/lib/inventory-posting";

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function createDocument(input: {
  centerId: string;
  type: DocumentType;
  fromLocationId?: string;
  toLocationId?: string;
  employeeId?: string;
  postingMode?: PostingMode;
  itemId: string;
  quantity: number;
  no: string;
}) {
  return prisma.inventoryDocument.create({
    data: {
      centerId: input.centerId,
      documentType: input.type,
      documentNo: input.no,
      documentDate: new Date("2026-01-01T00:00:00.000Z"),
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      employeeId: input.employeeId,
      postingMode: input.postingMode ?? PostingMode.POST_TO_STOCK,
      lines: {
        create: {
          lineNo: 1,
          itemId: input.itemId,
          quantity: input.quantity,
          itemNameSnapshot: "مادة اختبار حركة",
        },
      },
    },
  });
}

async function main() {
  const center = await prisma.center.create({
    data: { code: "POSTING_TEST", name: "مركز اختبار الحركات" },
  });
  const store = await prisma.location.create({
    data: { centerId: center.id, name: "مستودع اختبار", type: LocationType.STORE },
  });
  const room = await prisma.location.create({
    data: { centerId: center.id, name: "غرفة اختبار", type: LocationType.ROOM },
  });
  const employee = await prisma.employee.create({
    data: { centerId: center.id, employeeNo: "T-1", fullName: "موظف اختبار" },
  });
  const item = await prisma.item.create({
    data: { itemCode: `POST-${Date.now()}`, name: "مادة اختبار حركة" },
  });

  await prisma.inventoryMovement.create({
    data: {
      itemId: item.id,
      movementType: MovementType.OPENING,
      quantity: 10,
      movementDate: new Date("2025-12-31T00:00:00.000Z"),
      toLocationId: store.id,
      notes: "رصيد اختبار",
    },
  });

  const transfer = await createDocument({
    centerId: center.id,
    type: DocumentType.TRANSFER,
    fromLocationId: store.id,
    toLocationId: room.id,
    itemId: item.id,
    quantity: 3,
    no: "TR-1",
  });
  await postInventoryDocument(transfer.id);

  assert((await getLocationItemBalance(item.id, store.id)) === 7, "رصيد المستودع بعد النقل يجب أن يكون 7");
  assert((await getLocationItemBalance(item.id, room.id)) === 3, "رصيد الغرفة بعد النقل يجب أن يكون 3");

  const custody = await createDocument({
    centerId: center.id,
    type: DocumentType.CUSTODY,
    fromLocationId: room.id,
    toLocationId: room.id,
    employeeId: employee.id,
    itemId: item.id,
    quantity: 2,
    no: "CU-1",
  });
  await postInventoryDocument(custody.id);

  assert((await getLocationItemBalance(item.id, room.id)) === 3, "العهدة داخل نفس الغرفة يجب ألا تغير رصيد الغرفة");
  assert(
    (await getEmployeeItemBalanceAtLocation(employee.id, item.id, room.id)) === 2,
    "عهدة الموظف يجب أن تصبح 2",
  );

  const issue = await createDocument({
    centerId: center.id,
    type: DocumentType.ISSUE,
    fromLocationId: store.id,
    itemId: item.id,
    quantity: 4,
    no: "IS-1",
  });
  await postInventoryDocument(issue.id);
  assert((await getLocationItemBalance(item.id, store.id)) === 3, "رصيد المستودع بعد الإخراج يجب أن يكون 3");

  const tooMuchCustody = await createDocument({
    centerId: center.id,
    type: DocumentType.CUSTODY,
    fromLocationId: room.id,
    toLocationId: room.id,
    employeeId: employee.id,
    itemId: item.id,
    quantity: 2,
    no: "CU-OVER",
  });
  let custodyRejected = false;
  try {
    await postInventoryDocument(tooMuchCustody.id);
  } catch {
    custodyRejected = true;
  }
  assert(custodyRejected, "يجب رفض عهدة أكبر من الكمية غير المعهود بها في الغرفة");

  const returnDoc = await createDocument({
    centerId: center.id,
    type: DocumentType.RETURN,
    fromLocationId: room.id,
    toLocationId: store.id,
    employeeId: employee.id,
    itemId: item.id,
    quantity: 1,
    no: "RT-1",
  });
  await postInventoryDocument(returnDoc.id);
  assert((await getLocationItemBalance(item.id, room.id)) === 2, "رصيد الغرفة بعد الإرجاع للمستودع يجب أن يكون 2");
  assert((await getLocationItemBalance(item.id, store.id)) === 4, "رصيد المستودع بعد الإرجاع يجب أن يكون 4");
  assert(
    (await getEmployeeItemBalanceAtLocation(employee.id, item.id, room.id)) === 1,
    "عهدة الموظف بعد الإرجاع يجب أن تصبح 1",
  );

  const historical = await createDocument({
    centerId: center.id,
    type: DocumentType.HISTORICAL_RECEIPT,
    postingMode: PostingMode.REFERENCE_ONLY,
    toLocationId: store.id,
    itemId: item.id,
    quantity: 100,
    no: "OLD-100",
  });
  const historicalPosted = await postInventoryDocument(historical.id);
  assert(historicalPosted.status === DocumentStatus.POSTED, "يجب ترحيل المستند التاريخي كمرجع");
  assert((await getLocationItemBalance(item.id, store.id)) === 4, "المستند التاريخي المرجعي يجب ألا يغير الرصيد");

  const overIssue = await createDocument({
    centerId: center.id,
    type: DocumentType.ISSUE,
    fromLocationId: store.id,
    itemId: item.id,
    quantity: 10,
    no: "IS-OVER",
  });
  let issueRejected = false;
  try {
    await postInventoryDocument(overIssue.id);
  } catch {
    issueRejected = true;
  }
  assert(issueRejected, "يجب رفض إخراج كمية أكبر من الرصيد");

  console.log("نجحت اختبارات ترحيل حركات المخزون والعهدة.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
