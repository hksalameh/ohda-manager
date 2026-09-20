import {
  DocumentStatus,
  DocumentType,
  MovementType,
  PostingMode,
  Prisma,
} from "@prisma/client";
import { prisma } from "./prisma";

type Tx = Prisma.TransactionClient;

type PlannedMovement = {
  lineId: string;
  itemId: string;
  quantity: number;
  movementType: MovementType;
  fromLocationId: string | null;
  toLocationId: string | null;
  fromEmployeeId: string | null;
  toEmployeeId: string | null;
};

async function locationBalance(tx: Tx, itemId: string, locationId: string) {
  const movements = await tx.inventoryMovement.findMany({
    where: { itemId, OR: [{ fromLocationId: locationId }, { toLocationId: locationId }] },
    select: { quantity: true, fromLocationId: true, toLocationId: true },
  });

  return movements.reduce((balance, movement) => {
    let next = balance;
    if (movement.toLocationId === locationId) next += movement.quantity;
    if (movement.fromLocationId === locationId) next -= movement.quantity;
    return next;
  }, 0);
}

async function employeeBalanceAtLocation(
  tx: Tx,
  employeeId: string,
  itemId: string,
  locationId: string,
) {
  const movements = await tx.inventoryMovement.findMany({
    where: {
      itemId,
      OR: [
        { toEmployeeId: employeeId, toLocationId: locationId },
        { fromEmployeeId: employeeId, fromLocationId: locationId },
      ],
    },
    select: {
      quantity: true,
      fromEmployeeId: true,
      toEmployeeId: true,
      fromLocationId: true,
      toLocationId: true,
    },
  });

  return movements.reduce((balance, movement) => {
    let next = balance;
    if (movement.toEmployeeId === employeeId && movement.toLocationId === locationId) {
      next += movement.quantity;
    }
    if (movement.fromEmployeeId === employeeId && movement.fromLocationId === locationId) {
      next -= movement.quantity;
    }
    return next;
  }, 0);
}

async function totalAssignedAtLocation(tx: Tx, itemId: string, locationId: string) {
  const movements = await tx.inventoryMovement.findMany({
    where: {
      itemId,
      OR: [
        { toEmployeeId: { not: null }, toLocationId: locationId },
        { fromEmployeeId: { not: null }, fromLocationId: locationId },
      ],
    },
    select: {
      quantity: true,
      fromEmployeeId: true,
      toEmployeeId: true,
      fromLocationId: true,
      toLocationId: true,
    },
  });

  return movements.reduce((balance, movement) => {
    let next = balance;
    if (movement.toEmployeeId && movement.toLocationId === locationId) next += movement.quantity;
    if (movement.fromEmployeeId && movement.fromLocationId === locationId) next -= movement.quantity;
    return next;
  }, 0);
}

function planLine(
  document: {
    documentType: DocumentType;
    postingMode: PostingMode;
    fromLocationId: string | null;
    toLocationId: string | null;
    employeeId: string | null;
  },
  line: { id: string; itemId: string; quantity: number },
): PlannedMovement | null {
  if (!Number.isInteger(line.quantity) || line.quantity <= 0) {
    throw new Error("كل كمية في المستند يجب أن تكون عدداً صحيحاً أكبر من صفر");
  }
  if (document.postingMode === PostingMode.REFERENCE_ONLY) return null;

  const base = {
    lineId: line.id,
    itemId: line.itemId,
    quantity: line.quantity,
    fromEmployeeId: null,
    toEmployeeId: null,
  };

  switch (document.documentType) {
    case DocumentType.RECEIPT:
      if (!document.toLocationId) throw new Error("سند الإدخال يحتاج موقع استلام");
      return { ...base, movementType: MovementType.RECEIPT, fromLocationId: null, toLocationId: document.toLocationId };

    case DocumentType.ISSUE:
      if (!document.fromLocationId) throw new Error("سند الإخراج يحتاج موقع إخراج");
      return { ...base, movementType: MovementType.ISSUE, fromLocationId: document.fromLocationId, toLocationId: null };

    case DocumentType.TRANSFER:
      if (!document.fromLocationId || !document.toLocationId) {
        throw new Error("سند النقل يحتاج موقعاً مصدراً وموقعاً مستقبلاً");
      }
      if (document.fromLocationId === document.toLocationId) throw new Error("لا يمكن نقل المادة إلى نفس الموقع");
      return {
        ...base,
        movementType: MovementType.TRANSFER,
        fromLocationId: document.fromLocationId,
        toLocationId: document.toLocationId,
      };

    case DocumentType.CUSTODY: {
      if (!document.employeeId) throw new Error("سند العهدة يحتاج موظفاً مستلماً");
      const locationId = document.toLocationId ?? document.fromLocationId;
      if (!locationId) throw new Error("سند العهدة يحتاج موقع المادة/غرفة الموظف");
      return {
        ...base,
        movementType: MovementType.CUSTODY_ASSIGN,
        fromLocationId: document.fromLocationId ?? locationId,
        toLocationId: locationId,
        toEmployeeId: document.employeeId,
      };
    }

    case DocumentType.RETURN: {
      if (!document.employeeId) throw new Error("سند الإرجاع يحتاج الموظف الذي يعيد العهدة");
      const fromLocationId = document.fromLocationId ?? document.toLocationId;
      if (!fromLocationId) throw new Error("سند الإرجاع يحتاج موقع العهدة الحالي");
      return {
        ...base,
        movementType: MovementType.CUSTODY_RETURN,
        fromLocationId,
        toLocationId: document.toLocationId ?? fromLocationId,
        fromEmployeeId: document.employeeId,
      };
    }

    case DocumentType.ADJUSTMENT:
      if (document.fromLocationId && !document.toLocationId) {
        return { ...base, movementType: MovementType.ADJUST_OUT, fromLocationId: document.fromLocationId, toLocationId: null };
      }
      if (document.toLocationId && !document.fromLocationId) {
        return { ...base, movementType: MovementType.ADJUST_IN, fromLocationId: null, toLocationId: document.toLocationId };
      }
      throw new Error("التسوية تحتاج موقع إدخال فقط أو موقع إخراج فقط");

    case DocumentType.HISTORICAL_RECEIPT:
    case DocumentType.HISTORICAL_ISSUE:
      throw new Error("المستند التاريخي يجب أن يكون REFERENCE_ONLY حتى لا يضاعف الرصيد");

    case DocumentType.OPENING_INVENTORY:
      throw new Error("الجرد الافتتاحي يدار من OpeningSnapshot وليس من مستند مخزون عادي");
  }
}

export async function postInventoryDocument(documentId: string) {
  return prisma.$transaction(async (tx) => {
    const document = await tx.inventoryDocument.findUnique({
      where: { id: documentId },
      include: {
        center: true,
        employee: true,
        fromLocation: true,
        toLocation: true,
        counterparty: true,
        lines: { orderBy: { lineNo: "asc" } },
      },
    });

    if (!document) throw new Error("المستند غير موجود");
    if (document.status !== DocumentStatus.DRAFT) throw new Error("لا يمكن ترحيل مستند غير موجود في حالة مسودة");
    if (document.lines.length === 0) throw new Error("لا يمكن ترحيل مستند بلا مواد");

    const isHistorical =
      document.documentType === DocumentType.HISTORICAL_RECEIPT ||
      document.documentType === DocumentType.HISTORICAL_ISSUE;
    if (isHistorical && document.postingMode !== PostingMode.REFERENCE_ONLY) {
      throw new Error("المستند التاريخي يجب أن يكون مرجعياً ولا يؤثر في الرصيد الحالي");
    }

    const planned = document.lines
      .map((line) => planLine(document, line))
      .filter((movement): movement is PlannedMovement => movement !== null);

    const outboundNeeds = new Map<string, { itemId: string; locationId: string; quantity: number }>();
    for (const movement of planned) {
      if (!movement.fromLocationId) continue;
      const key = `${movement.itemId}:${movement.fromLocationId}`;
      const current = outboundNeeds.get(key);
      outboundNeeds.set(key, {
        itemId: movement.itemId,
        locationId: movement.fromLocationId,
        quantity: (current?.quantity ?? 0) + movement.quantity,
      });
    }

    for (const need of outboundNeeds.values()) {
      const available = await locationBalance(tx, need.itemId, need.locationId);
      if (available < need.quantity) {
        throw new Error(`الكمية غير كافية في الموقع. المتوفر ${available} والمطلوب ${need.quantity}`);
      }
    }

    for (const movement of planned) {
      if (
        movement.movementType === MovementType.CUSTODY_ASSIGN &&
        movement.fromLocationId === movement.toLocationId &&
        movement.toLocationId
      ) {
        const physical = await locationBalance(tx, movement.itemId, movement.toLocationId);
        const assigned = await totalAssignedAtLocation(tx, movement.itemId, movement.toLocationId);
        const unassigned = physical - assigned;
        if (unassigned < movement.quantity) {
          throw new Error(`لا توجد كمية غير معهود بها كافية. المتاح ${unassigned} والمطلوب ${movement.quantity}`);
        }
      }

      if (movement.movementType === MovementType.CUSTODY_RETURN && movement.fromEmployeeId && movement.fromLocationId) {
        const employeeBalance = await employeeBalanceAtLocation(
          tx,
          movement.fromEmployeeId,
          movement.itemId,
          movement.fromLocationId,
        );
        if (employeeBalance < movement.quantity) {
          throw new Error(`الموظف لا يملك هذه الكمية في عهدته. العهدة الحالية ${employeeBalance}`);
        }
      }
    }

    if (document.postingMode === PostingMode.POST_TO_STOCK) {
      for (const movement of planned) {
        await tx.inventoryMovement.create({
          data: {
            itemId: movement.itemId,
            movementType: movement.movementType,
            quantity: movement.quantity,
            movementDate: document.documentDate,
            documentId: document.id,
            documentLineId: movement.lineId,
            fromLocationId: movement.fromLocationId,
            toLocationId: movement.toLocationId,
            fromEmployeeId: movement.fromEmployeeId,
            toEmployeeId: movement.toEmployeeId,
          },
        });
      }
    }

    const now = new Date();
    return tx.inventoryDocument.update({
      where: { id: document.id },
      data: {
        status: DocumentStatus.POSTED,
        postedAt: now,
        lockedAt: now,
        centerNameSnapshot: document.center.name,
        employeeNameSnapshot: document.employee?.fullName ?? null,
        employeeNoSnapshot: document.employee?.employeeNo ?? null,
        fromLocationNameSnapshot: document.fromLocation?.name ?? null,
        toLocationNameSnapshot: document.toLocation?.name ?? null,
        counterpartyNameSnapshot: document.counterparty?.name ?? null,
      },
    });
  });
}

export async function getLocationItemBalance(itemId: string, locationId: string) {
  return prisma.$transaction((tx) => locationBalance(tx, itemId, locationId));
}

export async function getEmployeeItemBalanceAtLocation(employeeId: string, itemId: string, locationId: string) {
  return prisma.$transaction((tx) => employeeBalanceAtLocation(tx, employeeId, itemId, locationId));
}
