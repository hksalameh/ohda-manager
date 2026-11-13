// رابط ثابت مجاني لنظام العهد على workers.dev.
// كمبيوتر العهدة يفتح نفقاً مؤقتاً (trycloudflare.com) ويرسل رابطه الجديد إلى هذا الـ Worker،
// والـ Worker يحوّل أي زائر إلى الرابط الحالي. لا يمر عبره أي محتوى من النظام نفسه.
//
// المتطلبات في لوحة Cloudflare:
//   - KV namespace مربوط باسم OHDA
//   - Secret باسم UPDATE_SECRET (نص عشوائي طويل، نفسه في ملف إعداد كمبيوتر العهدة)

const TARGET_PATTERN = /^https:\/\/[a-z0-9-]+\.trycloudflare\.com$/;

function page(title, body, status = 200) {
  return new Response(
    `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>` +
      `<style>body{font-family:system-ui,Tahoma,sans-serif;background:#f1f5f9;margin:0;display:grid;place-items:center;min-height:100vh}main{background:#fff;border-radius:16px;padding:28px;max-width:420px;margin:16px;box-shadow:0 2px 12px #0001;text-align:center;line-height:1.9}h1{font-size:22px;margin:0 0 8px}</style>` +
      `</head><body><main><h1>${title}</h1><p>${body}</p></main></body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
  );
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let index = 0; index < a.length; index += 1) diff |= a.charCodeAt(index) ^ b.charCodeAt(index);
  return diff === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/__set") {
      if (request.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
      const secret = env.UPDATE_SECRET || "";
      const auth = request.headers.get("authorization") || "";
      if (!secret || !constantTimeEqual(auth, `Bearer ${secret}`)) return new Response("Forbidden", { status: 403 });
      let target = "";
      try {
        target = String((await request.json()).target || "").trim();
      } catch {
        return new Response("Bad JSON", { status: 400 });
      }
      if (!TARGET_PATTERN.test(target)) return new Response("Bad target", { status: 400 });
      await env.OHDA.put("target", target);
      await env.OHDA.put("updatedAt", new Date().toISOString());
      return new Response("ok", { headers: { "cache-control": "no-store" } });
    }

    const target = await env.OHDA.get("target");
    if (!target) {
      return page("نظام العهد غير متصل", "شغّل البرنامج على كمبيوتر العهدة ثم شغّل cloudflare-ohda.cmd، وأعد فتح هذا الرابط.", 503);
    }

    return new Response(null, {
      status: 302,
      headers: { location: `${target}${url.pathname}${url.search}`, "cache-control": "no-store" },
    });
  },
};
