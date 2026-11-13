"use client";

import jsQR from "jsqr";
import { useCallback, useEffect, useRef, useState } from "react";

// ماسح QR يعمل على الهاتف:
// - كاميرا مباشرة عندما يكون الاتصال آمناً (HTTPS أو localhost).
// - على عنوان الشبكة المحلية http://192.168.x.x يمنع المتصفح الكاميرا المباشرة،
//   فنستخدم التقاط صورة بكاميرا الهاتف ثم نقرأ الرمز منها. يعمل على كل الهواتف.

type Props = {
  label: string;
  onResult: (value: string) => void;
  continuous?: boolean;
  className?: string;
};

const MAX_IMAGE_SIDE = 1280;

function decodeFromCanvas(canvas: HTMLCanvasElement, source: CanvasImageSource, width: number, height: number) {
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(width, height));
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const image = context.getImageData(0, 0, canvas.width, canvas.height);
  return jsQR(image.data, image.width, image.height, { inversionAttempts: "attemptBoth" })?.data ?? null;
}

export function QrScanner({ label, onResult, continuous = false, className }: Props) {
  const [open, setOpen] = useState(false);
  const [liveSupported, setLiveSupported] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastRef = useRef<{ value: string; at: number }>({ value: "", at: 0 });
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  useEffect(() => {
    setLiveSupported(Boolean(window.isSecureContext && navigator.mediaDevices?.getUserMedia));
  }, []);

  const emit = useCallback((value: string) => {
    const now = Date.now();
    // منع قراءة نفس الملصق عدة مرات خلال ثانية ونصف أثناء بقائه أمام الكاميرا.
    if (lastRef.current.value === value && now - lastRef.current.at < 1500) return false;
    lastRef.current = { value, at: now };
    navigator.vibrate?.(60);
    onResultRef.current(value);
    return true;
  }, []);

  useEffect(() => {
    if (!open || !liveSupported) return;
    let stream: MediaStream | null = null;
    let frame = 0;
    let lastScan = 0;
    let stopped = false;
    const canvas = canvasRef.current ?? document.createElement("canvas");
    canvasRef.current = canvas;

    const tick = (time: number) => {
      if (stopped) return;
      const video = videoRef.current;
      if (video && video.readyState >= 2 && time - lastScan > 180) {
        lastScan = time;
        const value = decodeFromCanvas(canvas, video, video.videoWidth, video.videoHeight);
        if (value && emit(value) && !continuous) {
          setOpen(false);
          return;
        }
      }
      frame = requestAnimationFrame(tick);
    };

    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false })
      .then((media) => {
        if (stopped) {
          media.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = media;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = media;
        video.play().catch(() => undefined);
        frame = requestAnimationFrame(tick);
      })
      .catch(() => {
        setMessage("تعذر فتح الكاميرا. اسمح للمتصفح باستخدامها أو استخدم «التقاط صورة».");
      });

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [open, liveSupported, continuous, emit]);

  async function handlePhoto(file: File | undefined) {
    if (!file) return;
    setMessage("جاري قراءة الصورة…");
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = canvasRef.current ?? document.createElement("canvas");
      canvasRef.current = canvas;
      const value = decodeFromCanvas(canvas, bitmap, bitmap.width, bitmap.height);
      bitmap.close();
      if (!value) {
        setMessage("لم يُعثر على رمز QR في الصورة. قرّب الهاتف من الملصق وحاول مجدداً.");
        return;
      }
      lastRef.current = { value: "", at: 0 };
      emit(value);
      setMessage(null);
      if (!continuous) setOpen(false);
    } catch {
      setMessage("تعذرت قراءة الصورة.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMessage(null);
          setOpen(true);
        }}
        className={className ?? "rounded-xl bg-blue-700 px-4 py-3 text-sm font-bold text-white hover:bg-blue-800"}
      >
        📷 {label}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/70 p-3 sm:items-center" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-extrabold text-slate-900">{label}</h3>
              <button type="button" onClick={() => setOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold">إغلاق</button>
            </div>

            {liveSupported ? (
              <div className="relative mt-3 overflow-hidden rounded-xl bg-black">
                <video ref={videoRef} playsInline muted className="aspect-square w-full object-cover" />
                <div className="pointer-events-none absolute inset-[18%] rounded-xl border-4 border-white/80" />
              </div>
            ) : (
              <p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm leading-7 text-slate-700">
                صوّر ملصق QR بكاميرا الهاتف وسيقرأه النظام مباشرة.
              </p>
            )}

            {continuous && liveSupported ? (
              <p className="mt-2 text-xs leading-6 text-slate-500">المسح مستمر: وجّه الكاميرا إلى الملصق التالي، وكل قراءة تضيف قطعة واحدة.</p>
            ) : null}

            {message ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-900">{message}</p> : null}

            <label className="mt-3 block cursor-pointer rounded-xl border border-blue-300 bg-blue-50 px-4 py-3 text-center text-sm font-bold text-blue-800">
              التقاط صورة للملصق
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => handlePhoto(event.target.files?.[0])}
              />
            </label>
          </div>
        </div>
      ) : null}
    </>
  );
}
