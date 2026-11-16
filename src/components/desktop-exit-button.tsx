"use client";

export default function DesktopExitButton() {
  function closeWindow() {
    const bridge = window as Window & { ohdaDesktop?: { closeApp: () => void } };
    if (bridge.ohdaDesktop?.closeApp) bridge.ohdaDesktop.closeApp();
    else window.alert("هذه الوظيفة متاحة داخل برنامج ويندوز فقط.");
  }

  return (
    <button
      type="button"
      onClick={closeWindow}
      className="mt-5 w-full rounded-lg border border-white/10 px-4 py-3 text-sm font-extrabold text-white hover:bg-red-900/40"
    >
      إغلاق البرنامج
    </button>
  );
}
