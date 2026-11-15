"use client";

import { handOverRoomStockAndPrint, printCurrentEmployeeCustody } from "@/app/locations/[id]/custody-actions";

type Props = {
  employeeId: string;
  roomId: string;
  heldPieces: number;
  unassignedPieces: number;
  blocked: boolean;
};

export default function RoomCustodyActions({ employeeId, roomId, heldPieces, unassignedPieces, blocked }: Props) {
  return <div className="flex flex-wrap items-center gap-2">
    {unassignedPieces > 0 && <form action={handOverRoomStockAndPrint} onSubmit={(event) => {
      if (!window.confirm(`سيُسجّل البرنامج ${unassignedPieces} قطعة غير معهود بها ضمن عهدة الموظف، ثم يطبع سندًا شاملاً بالمواد القديمة والجديدة. هل توافق على اعتماد التسليم؟`)) {
        event.preventDefault();
      }
    }}>
      <input type="hidden" name="employeeId" value={employeeId}/>
      <input type="hidden" name="roomId" value={roomId}/>
      <button disabled={blocked} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-extrabold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40">
        اعتماد الموجودات الجديدة وطباعة سند شامل
      </button>
    </form>}
    {heldPieces > 0 && <form action={printCurrentEmployeeCustody}>
      <input type="hidden" name="employeeId" value={employeeId}/>
      <input type="hidden" name="roomId" value={roomId}/>
      <button disabled={blocked} className={`rounded-xl px-4 py-3 text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${unassignedPieces ? "border border-emerald-300 bg-white text-emerald-900" : "bg-emerald-700 text-white hover:bg-emerald-800"}`}>
        {unassignedPieces ? "طباعة العهدة السابقة فقط" : "طباعة سند العهدة الشخصية"}
      </button>
    </form>}
    {heldPieces === 0 && unassignedPieces === 0 && <p className="text-xs text-slate-500">لا توجد مواد بعهدة هذا الموظف أو متاحة لتسليمه.</p>}
  </div>;
}
