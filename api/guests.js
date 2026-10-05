import { send, body, requireAuth, clean, cleanPhone } from "../lib/http.js";
import { writeRecord, readLatest } from "../lib/store.js";

// Гости собираются из заявок по номеру телефона; заметки хранятся отдельно.
export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    if (req.method === "GET") {
      const [requests, notes] = await Promise.all([readLatest("requests"), readLatest("guests")]);
      const byPhone = new Map();
      for (const r of requests) {
        if (!r.phone) continue;
        const g = byPhone.get(r.phone) || { phone: r.phone, name: r.name, total: 0, done: 0, canceled: 0, last: "", types: {}, demo: r.source === "demo" };
        g.total++;
        if (r.status === "done") g.done++;
        if (r.status === "canceled") g.canceled++;
        g.types[r.type] = (g.types[r.type] || 0) + 1;
        if ((r.createdAt || "") > g.last) { g.last = r.createdAt; g.name = r.name; }
        byPhone.set(r.phone, g);
      }
      for (const n of notes) {
        const g = byPhone.get(n.phone);
        if (g) { g.note = n.note; g.tag = n.tag; }
      }
      const guests = [...byPhone.values()].sort((a, b) => b.total - a.total || b.last.localeCompare(a.last));
      return send(res, 200, { guests });
    }
    if (req.method === "PUT") {
      const b = body(req);
      const phone = cleanPhone(b.phone);
      if (!phone) return send(res, 400, { error: "Нет телефона" });
      const tag = ["", "vip", "regular", "problem"].includes(b.tag) ? b.tag : "";
      await writeRecord("guests", phone.replace(/\D/g, ""), { phone, note: clean(b.note, 600), tag });
      return send(res, 200, { ok: true });
    }
    send(res, 405, { error: "Метод не поддерживается" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Ошибка сервера, попробуйте ещё раз" });
  }
}
