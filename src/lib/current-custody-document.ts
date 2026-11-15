import { randomUUID } from "node:crypto";
import { DocumentStatus, DocumentType, MovementType, PostingMode } from "@prisma/client";
import { prisma } from "./prisma";
import { currentCustodyAtRoom } from "./custody-snapshot";

/** A printable snapshot of a *current* employee balance, not another issue. */
export async function createCurrentCustodyDocument(input: {
  centerId: string;
  employeeId: string;
  roomId: string;
  templateVersionId: string;
  /** Explicitly assign remaining unassigned stock in the room, then print a full handover. */
  assignRoomStock?: boolean;
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

    if (input.assignRoomStock) {
      const roomMovements = await tx.inventoryMovement.findMany({
        where: { OR: [{ toLocationId: room.id }, { fromLocationId: room.id }] },
        select: {
          itemId: true, quantity: true, fromLocationId: true, toLocationId: true,
          fromEmployeeId: true, toEmployeeId: true,
        },
      });
      const physical = new Map<string, number>();
      const assignedToAll = new Map<string, number>();
      for (const movement of roomMovements) {
        const oldPhysical = physical.get(movement.itemId) ?? 0;
        const oldAssigned = assignedToAll.get(movement.itemId) ?? 0;
        physical.set(movement.itemId, oldPhysical
          + (movement.toLocationId === room.id ? movement.quantity : 0)
          - (movement.fromLocationId === room.id ? movement.quantity : 0));
        assignedToAll.set(movement.itemId, oldAssigned
          + (movement.toLocationId === room.id && movement.toEmployeeId ? movement.quantity : 0)
          - (movement.fromLocationId === room.id && movement.fromEmployeeId ? movement.quantity : 0));
      }

      const newlyHandedOver = new Map<string, number>();
      for (const [itemId, stock] of physical) {
        const held = assignedToAll.get(itemId) ?? 0;
        if (stock < 0 || held < 0 || held > stock) {
          throw new Error("توجد فروقات غير صحيحة بين رصيد الغرفة والعهد الشخصية. يجب مراجعتها قبل التسليم");
        }
        if (stock > held) newlyHandedOver.set(itemId, stock - held);
      }
      if (newlyHandedOver.size) {
        const freshItems = await tx.item.findMany({
          where: { id: { in: [...newlyHandedOver.keys()] } },
          include: { unit: true },
          orderBy: [{ name: "asc" }, { id: "asc" }],
        });
        if (freshItems.length !== newlyHandedOver.size) {
          throw new Error("إحدى المواد الجديدة غير موجودة في دليل العهدة");
        }
        // One official posting records every NEW assignment. Existing custody
        // remains unchanged and is included only once in the final snapshot.
        const handover = await tx.inventoryDocument.create({
          data: {
            centerId: center.id,
            documentNo: `CUST-ROOM-${randomUUID().slice(0, 8)}`,
            documentType: DocumentType.CUSTODY,
            postingMode: PostingMode.POST_TO_STOCK,
            status: DocumentStatus.POSTED,
            documentDate: now,
            postedAt: now,
            lockedAt: now,
            employeeId: employee.id,
            fromLocationId: room.id,
            toLocationId: room.id,
            templateVersionId: input.templateVersionId,
            statement: `تسليم الموجودات الجديدة للموظف ${employee.fullName} من ${room.name} بعد الجرد`,
            centerNameSnapshot: center.name,
            employeeNameSnapshot: employee.fullName,
            employeeNoSnapshot: employee.employeeNo,
            fromLocationNameSnapshot: room.name,
            toLocationNameSnapshot: room.name,
            lines: { create: freshItems.map((item, index) => ({
              lineNo: index + 1,
              itemId: item.id,
              quantity: newlyHandedOver.get(item.id)!,
              itemCodeSnapshot: item.itemCode,
              itemNameSnapshot: item.name,
              unitNameSnapshot: item.unit?.name ?? null,
              ledgerPageNo: item.legacyLedgerPageNo,
            })) },
          },
          include: { lines: true },
        });
        for (const line of handover.lines) {
          await tx.inventoryMovement.create({
            data: {
              itemId: line.itemId,
              quantity: line.quantity,
              movementType: MovementType.CUSTODY_ASSIGN,
              movementDate: now,
              fromLocationId: room.id,
              toLocationId: room.id,
              toEmployeeId: employee.id,
              documentId: handover.id,
              documentLineId: line.id,
            },
          });
          assigned.set(line.itemId, (assigned.get(line.itemId) ?? 0) + line.quantity);
        }
      }
    }

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
