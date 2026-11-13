// حماية الدخول للنظام عند فتحه على الشبكة المحلية.
// يعتمد على Web Crypto فقط حتى يعمل داخل proxy وداخل Server Actions.

export const AUTH_COOKIE_NAME = "ohda_auth";
export const DESKTOP_COOKIE_NAME = "ohda_desktop";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

type CookieReader = { get(name: string): { value: string } | undefined };

function configuredPassword() {
  return process.env.OHDA_PASSWORD?.trim() ?? "";
}

export function authEnabled() {
  return configuredPassword().length > 0;
}

const encoder = new TextEncoder();

function toBase64Url(bytes: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function constantTimeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

async function sha256(value: string) {
  return toBase64Url(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}

// مفتاح التوقيع مشتق من كلمة المرور؛ تغيير كلمة المرور يُبطل كل الجلسات القديمة.
async function sign(message: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`ohda-session-v1:${configuredPassword()}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toBase64Url(await crypto.subtle.sign("HMAC", key, encoder.encode(message)));
}

export async function checkPassword(input: string) {
  const password = configuredPassword();
  if (!password) return false;
  return constantTimeEqual(await sha256(input.trim()), await sha256(password));
}

export async function createSessionToken() {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${await sign(String(expiresAt))}`;
}

async function verifySessionToken(token: string | undefined) {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || !/^\d+$/.test(expiresAt)) return false;
  if (Number(expiresAt) < Date.now()) return false;
  return constantTimeEqual(signature, await sign(expiresAt));
}

// برنامج ويندوز (Electron) يضع رمزاً عشوائياً لكل تشغيل، فلا يُطلب من مستخدم الكمبيوتر تسجيل الدخول.
export function isDesktopSession(cookies: CookieReader) {
  const expected = process.env.OHDA_DESKTOP_TOKEN?.trim();
  const provided = cookies.get(DESKTOP_COOKIE_NAME)?.value;
  return Boolean(expected && provided && constantTimeEqual(provided, expected));
}

export async function isAuthenticated(cookies: CookieReader) {
  if (!authEnabled()) return true;
  if (isDesktopSession(cookies)) return true;
  return verifySessionToken(cookies.get(AUTH_COOKIE_NAME)?.value);
}

export function safeNextPath(value: string | null | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/login")) return "/";
  return value;
}
