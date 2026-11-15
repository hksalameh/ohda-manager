import assert from "node:assert/strict";
import { NEW_STOCK, UNLOCATED, planRoomAudit, type AuditKnown } from "../src/lib/room-audit-plan.ts";
import { planAuditCustodyReturns } from "../src/lib/room-audit-custody.ts";
import { currentCustodyAtRoom } from "../src/lib/custody-snapshot.ts";
import { CUSTODY_ROWS_PER_PAGE, paginateCustodyRows } from "../src/lib/custody-print-pagination.ts";

const A = "ROOM_A";
const B = "ROOM_B";
const base: AuditKnown = {
  itemId: "CHAIR",
  systemQuantity: 5,
  assignedQuantity: 1,
  actualQuantity: 3,
  destinationId: UNLOCATED,
  surplusSourceId: "",
};
const transfers = planRoomAudit(A, [base], []);
assert.deepEqual(transfers, [{ itemId: "CHAIR", quantity: 2, from: A, to: UNLOCATED, kind: "TRANSFER" }]);
assert.equal(transfers.reduce((n, x) => n + (x.kind === "INCREASE" ? x.quantity : 0), 0), 0, "Moving a missing asset must not change total stock");
const toRoom = planRoomAudit(A, [{ ...base, actualQuantity: 0, assignedQuantity: 0, destinationId: B }], []);
assert.deepEqual(toRoom[0], { itemId: "CHAIR", quantity: 5, from: A, to: B, kind: "TRANSFER" });
assert.equal(planRoomAudit(A, [{ ...base, actualQuantity: 5 }], []).length, 0);
assert.deepEqual(planRoomAudit(A, [], [{ itemId: "TABLE", quantity: 2, sourceId: B }]), [
  { itemId: "TABLE", quantity: 2, from: B, to: A, kind: "TRANSFER" },
]);
assert.deepEqual(planRoomAudit(A, [], [{ itemId: "NEW_ITEM", quantity: 2, sourceId: NEW_STOCK }]), [
  { itemId: "NEW_ITEM", quantity: 2, from: null, to: A, kind: "INCREASE" },
]);
const entrustedMove = planRoomAudit(A, [{ ...base, actualQuantity: 0, destinationId: B }], []);
assert.deepEqual(entrustedMove, [{ itemId: "CHAIR", quantity: 5, from: A, to: B, kind: "TRANSFER" }]);
assert.deepEqual(planAuditCustodyReturns(entrustedMove, [{ itemId: "CHAIR", locationId: A, physical: 5, holders: [{ employeeId: "EMP", quantity: 1 }] }]), [
  { itemId: "CHAIR", locationId: A, employeeId: "EMP", quantity: 1 },
], "a moved entrusted item must create an automatic custody correction");
assert.deepEqual(planAuditCustodyReturns(transfers, [{ itemId: "CHAIR", locationId: A, physical: 5, holders: [{ employeeId: "EMP", quantity: 1 }] }]), [], "unassigned stock transfers without changing employee custody");
assert.deepEqual(planAuditCustodyReturns([{ ...entrustedMove[0], quantity: 4 }], [{ itemId: "CHAIR", locationId: A, physical: 5, holders: [{ employeeId: "EMP2", quantity: 2 }, { employeeId: "EMP1", quantity: 1 }] }]), [
  { itemId: "CHAIR", locationId: A, employeeId: "EMP1", quantity: 1 },
  { itemId: "CHAIR", locationId: A, employeeId: "EMP2", quantity: 1 },
], "return only the required entrusted portion, in stable employee order");
assert.throws(() => planAuditCustodyReturns(entrustedMove, [{ itemId: "CHAIR", locationId: A, physical: 4, holders: [] }]), /المتاحة/);
assert.throws(() => planAuditCustodyReturns(entrustedMove, [{ itemId: "CHAIR", locationId: A, physical: 5, holders: [{ employeeId: "EMP", quantity: 6 }] }]), /تطابق/);
assert.throws(() => planRoomAudit(A, [{ ...base, destinationId: "" }], []), /حدد مكان/);
assert.throws(() => planRoomAudit(A, [{ ...base, destinationId: A }], []), /حدد مكان/);
assert.throws(() => planRoomAudit(A, [{ ...base, actualQuantity: 7, surplusSourceId: "" }], []), /مصدر/);
assert.throws(() => planRoomAudit(A, [base, base], []), /مكررة/);
assert.throws(() => planRoomAudit(A, [base], [{ itemId: "CHAIR", quantity: 2, sourceId: B }]), /تكرار/);
assert.throws(() => planRoomAudit(A, [], [{ itemId: "X", quantity: -1, sourceId: B }]), /الكمية/);
const personal = currentCustodyAtRoom("EMP", "ROOM", [
  { itemId: "PROJECTOR", quantity: 2, fromEmployeeId: null, toEmployeeId: "EMP", fromLocationId: "ROOM", toLocationId: "ROOM" },
  { itemId: "PROJECTOR", quantity: 1, fromEmployeeId: "EMP", toEmployeeId: null, fromLocationId: "ROOM", toLocationId: "STORAGE" },
  { itemId: "MONITOR", quantity: 1, fromEmployeeId: null, toEmployeeId: "OTHER", fromLocationId: "ROOM", toLocationId: "ROOM" },
]);
assert.equal(personal.get("PROJECTOR"), 1, "السند الحالي يحتسب عهدة الموظف فقط بعد الإرجاع");
assert.equal(personal.has("MONITOR"), false, "لا تضاف عهدة موظف آخر");
assert.equal(currentCustodyAtRoom("EMP", "STORAGE", []).size, 0);
assert.throws(() => currentCustodyAtRoom("EMP", "ROOM", [
  { itemId: "PROJECTOR", quantity: 2, fromEmployeeId: "EMP", toEmployeeId: null, fromLocationId: "ROOM", toLocationId: "STORAGE" },
]), /إرجاع عهدة أكبر/);
assert.equal(CUSTODY_ROWS_PER_PAGE, 24, "تطابق عدد الصفوف مع جدول الطباعة الرسمي");
assert.equal(paginateCustodyRows(Array.from({ length: 24 }, (_, i) => i)).length, 1, "24 مادة يجب أن تُطبع على صفحة واحدة");
assert.deepEqual(paginateCustodyRows(Array.from({ length: 25 }, (_, i) => i)).map((page) => page.length), [24, 1]);
console.log("PASS: inventory reconciliation, employee custody, official 24-row A4 print pagination.");
