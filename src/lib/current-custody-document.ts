import { randomUUID } from "node:crypto";
import { DocumentStatus, DocumentType, PostingMode } from "@prisma/client";
import { prisma } from "./prisma";
import { currentCustodyAtRoom } from "./custody-snapshot";

/** A printable snapshot of a *current* employee balance, not another issue. */
export async function createCurrentCustodyDocument(input: {
  centerId: string;
  employeeId: string;
  roomId: string;
  templateVersionId: string;
}) {
  const now = new Date();

  return prisma.$transaction(async (tx) => {
    const [center, employee, room, assignment, pending] = await Promise.all([
      tx.center.findUnique({ where: { id: input.centerId } }),
      tx.employee.findFirst({
        where: { id: input.employeeId, centerId: input.centerId, active: true },
      }),
      tx.location.findFirst({
        where: { id: input.roomId, centerId: input.centerId, active: true },
      }),
      tx.employeeLocationAssignment.findFirst({
        where: { employeeId: input.employeeId, locationId: input.roomId, isPrimary: true, endsAt: null },
      }),
      tx.inventoryDocument.count({
        where: {
          centerId: input.centerId, status: DocumentStatus.DRAFT,
          documentNo: { startsWith: "JRD-" },
          OR: [{ fromLocationId: input.roomId }, { toLocationId: input.roomId }],
        },
      }),
    ]);
    if (!center || !employee || !room || !assignment || room.code === "UNLOCATED") {
      throw new Error("الموظف ليس مرتبطًا بهذه الغرفة حاليًا");
    }
    if (pending > 0) {
      throw new Error("يوجد جرد لم يُعتمد بعد. اعتمد الجرد أو ألغِ المسودات أولاً");
    }

    const movements = await tx.inventoryMovement.findMany({
      where: { OR: [{ toEmployeeId: input.employeeId }, { fromEmployeeId: input.employeeId }] },
      select: {
        itemId: true,
        quantity: true,
        toEmployeeId: true,
        fromEmployeeId: true,
        toLocationId: true,
        fromLocationId: true,
      },
    });
    const assigned = currentCustodyAtRoom(input.employeeId, input.roomId, movements);
    if (!assigned.size) {
      throw new Error("لا توجد عهدة مسجلة لهذا الموظف في هذه الغرفة. يمكن إنشاء سند تسليم جديد للمواد غير المعهودة");
    }
    const items = await tx.item.findMany({
      where: { id: { in: [...assigned.keys()] } },
      include: { unit: true },
      orderBy: [{ name: "asc" }, { id: "asc" }],
    });
    if (items.length !== assigned.size) throw new Error("إحدى مواد العهدة غير متاحة في دليل المواد");

    return tx.inventoryDocument.create({
      data: {
        centerId: center.id,
        documentNo: `CUST-SNAPSHOT-${randomUUID().slice(0, 8)}`,
        documentType: DocumentType.CUSTODY,
        postingMode: PostingMode.REFERENCE_ONLY,
        status: DocumentStatus.POSTED,
        documentDate: now,
        postedAt: now,
        lockedAt: now,
        employeeId: employee.id,
        fromLocationId: room.id,
        toLocationId: room.id,
        templateVersionId: input.templateVersionId,
        statement: `سند العهدة الشخصية المسجلة للسيد ${employee.fullName} في ${room.name}`,
        notes: "نسخة مطابقة للعهدة المسجلة حاليًا لغرض الجرد والتوقيع. مرجعية فقط، ولا تنشئ صرفًا أو عهدة جديدة.",
        centerNameSnapshot: center.name,
        employeeNameSnapshot: employee.fullName,
        employeeNoSnapshot: employee.employeeNo,
        fromLocationNameSnapshot: room.name,
        toLocationNameSnapshot: room.name,
        lines: {
          create: items.map((item, index) => ({
            lineNo: index + 1,
            itemId: item.id,
            quantity: assigned.get(item.id)!,
            itemCodeSnapshot: item.itemCode,
            itemNameSnapshot: item.name,
            unitNameSnapshot: item.unit?.name ?? null,
            ledgerPageNo: item.legacyLedgerPageNo,
          })),
        },
      },
    });
  });
}
