import webpush from "web-push";

const json = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
});
const cors = { "access-control-allow-origin": "*", "access-control-allow-methods": "GET,POST,PUT,DELETE,OPTIONS", "access-control-allow-headers": "content-type,authorization" };

function authorized(request, env) {
  const value = request.headers.get("authorization") || "";
  return Boolean(env.APP_TOKEN && value === `Bearer ${env.APP_TOKEN}`);
}
function localClock(timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timeZone || "Europe/Istanbul", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  const get = t => parts.find(p => p.type === t)?.value || "00";
  return `${get("hour")}:${get("minute")}`;
}
function localDate(timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timeZone || "Europe/Istanbul", year:"numeric", month:"2-digit", day:"2-digit" }).format(new Date());
}
async function sendPush(env, subscription, payload) {
  webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  return webpush.sendNotification(JSON.parse(subscription), JSON.stringify(payload), { TTL: 120 });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    if (url.pathname === "/api/config" && request.method === "GET") {
      return json({ vapidPublicKey: env.VAPID_PUBLIC_KEY || null });
    }
    if (!url.pathname.startsWith("/api/")) {
      return env.ASSETS.fetch(request);
    }
    if (!authorized(request, env)) return json({ error: "Yetkisiz. APP_TOKEN değerini kontrol edin." }, 401);

    try {
      if (url.pathname === "/api/subscribe" && request.method === "POST") {
        const sub = await request.json();
        if (!sub.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) return json({error:"Geçersiz push aboneliği"},400);
        await env.DB.prepare("INSERT INTO subscriptions (endpoint, subscription_json, created_at) VALUES (?, ?, ?) ON CONFLICT(endpoint) DO UPDATE SET subscription_json=excluded.subscription_json")
          .bind(sub.endpoint, JSON.stringify(sub), new Date().toISOString()).run();
        return json({ok:true});
      }
      if (url.pathname === "/api/medicines" && request.method === "GET") {
        const { results } = await env.DB.prepare("SELECT id,name,time,repeat_minutes,timezone FROM medicines ORDER BY time").all();
        return json({medicines:results});
      }
      if (url.pathname === "/api/medicines" && request.method === "POST") {
        const m = await request.json();
        if (!m.id || !m.name || !/^\d{2}:\d{2}$/.test(m.time || "")) return json({error:"İlaç bilgileri eksik"},400);
        await env.DB.prepare(`INSERT INTO medicines (id,name,time,repeat_minutes,timezone,created_at)
          VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,time=excluded.time,repeat_minutes=excluded.repeat_minutes,timezone=excluded.timezone`)
          .bind(String(m.id),String(m.name).slice(0,60),m.time,Math.max(0,Math.min(720,Number(m.repeat_minutes)||0)),m.timezone||"Europe/Istanbul",new Date().toISOString()).run();
        return json({ok:true});
      }
      const medMatch = url.pathname.match(/^\/api\/medicines\/([^/]+)$/);
      if (medMatch && request.method === "DELETE") {
        const id = decodeURIComponent(medMatch[1]);
        await env.DB.batch([
          env.DB.prepare("DELETE FROM medicines WHERE id=?").bind(id),
          env.DB.prepare("DELETE FROM delivery_state WHERE medicine_id=?").bind(id),
          env.DB.prepare("DELETE FROM taken_logs WHERE medicine_id=?").bind(id)
        ]);
        return json({ok:true});
      }
      const takenMatch = url.pathname.match(/^\/api\/medicines\/([^/]+)\/taken$/);
      if (takenMatch && request.method === "POST") {
        const id=decodeURIComponent(takenMatch[1]), body=await request.json(), date=body.date||localDate("Europe/Istanbul");
        if(body.taken) await env.DB.prepare("INSERT INTO taken_logs (medicine_id,local_date,taken_at) VALUES (?,?,?) ON CONFLICT(medicine_id,local_date) DO UPDATE SET taken_at=excluded.taken_at").bind(id,date,new Date().toISOString()).run();
        else await env.DB.prepare("DELETE FROM taken_logs WHERE medicine_id=? AND local_date=?").bind(id,date).run();
        return json({ok:true});
      }
      return json({error:"API endpoint bulunamadı"},404);
    } catch (e) {
      console.error(e);
      return json({error:"Sunucu hatası: "+(e?.message||"unknown")},500);
    }
  },

  async scheduled(controller, env, ctx) {
    const { results: medicines } = await env.DB.prepare("SELECT id,name,time,repeat_minutes,timezone FROM medicines").all();
    const { results: subscriptions } = await env.DB.prepare("SELECT endpoint,subscription_json FROM subscriptions").all();
    if (!subscriptions.length || !medicines.length) return;
    for (const med of medicines) {
      const date = localDate(med.timezone);
      const now = localClock(med.timezone);
      if (now < med.time) continue;
      const taken = await env.DB.prepare("SELECT 1 FROM taken_logs WHERE medicine_id=? AND local_date=?").bind(med.id,date).first();
      if (taken) continue;
      const state = await env.DB.prepare("SELECT attempts,last_sent_at FROM delivery_state WHERE medicine_id=? AND local_date=?").bind(med.id,date).first();
      const attempts = Number(state?.attempts || 0);
      const maxAttempts = med.repeat_minutes > 0 ? 4 : 1;
      if (attempts >= maxAttempts) continue;
      if (state?.last_sent_at) {
        const elapsed = Date.now() - new Date(state.last_sent_at).getTime();
        if (elapsed < Number(med.repeat_minutes || 30) * 60000) continue;
      }
      const payload = { title: `${med.name} zamanı`, body: attempts ? `Hatırlatma ${attempts+1}: İlaç saatini kontrol etmeyi unutma.` : "İlaç saatini kontrol etmeyi unutma.", tag:`med-${med.id}-${date}`, data:{medicineId:med.id} };
      for (const sub of subscriptions) {
        try { await sendPush(env, sub.subscription_json, payload); }
        catch (e) {
          const status = e?.statusCode;
          if (status === 404 || status === 410) await env.DB.prepare("DELETE FROM subscriptions WHERE endpoint=?").bind(sub.endpoint).run();
          else console.error("Push gönderilemedi", status, e?.message);
        }
      }
      await env.DB.prepare(`INSERT INTO delivery_state (medicine_id,local_date,attempts,last_sent_at) VALUES (?,?,?,?)
        ON CONFLICT(medicine_id,local_date) DO UPDATE SET attempts=excluded.attempts,last_sent_at=excluded.last_sent_at`)
        .bind(med.id,date,attempts+1,new Date().toISOString()).run();
    }
  }
};
