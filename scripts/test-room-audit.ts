import assert from "node:assert/strict";
import { NEW_STOCK, UNLOCATED, planRoomAudit, type AuditKnown } from "../src/lib/room-audit-plan.ts";

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
assert.throws(() => planRoomAudit(A, [{ ...base, actualQuantity: 0, assignedQuantity: 1 }], []), /عهدة موظف/);
assert.throws(() => planRoomAudit(A, [{ ...base, destinationId: "" }], []), /حدد مكان/);
assert.throws(() => planRoomAudit(A, [{ ...base, destinationId: A }], []), /حدد مكان/);
assert.throws(() => planRoomAudit(A, [{ ...base, actualQuantity: 7, surplusSourceId: "" }], []), /مصدر/);
assert.throws(() => planRoomAudit(A, [base, base], []), /مكررة/);
assert.throws(() => planRoomAudit(A, [base], [{ itemId: "CHAIR", quantity: 2, sourceId: B }]), /تكرار/);
assert.throws(() => planRoomAudit(A, [], [{ itemId: "X", quantity: -1, sourceId: B }]), /الكمية/);
console.log("PASS: reconciliation keeps missing assets in stock, handles source/destination, and protects employee custody.");
