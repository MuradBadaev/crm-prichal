import { cors, send, body, requireAuth, isAuthed, clean, cleanPhone } from "../lib/http.js";
import { writeRecord, readLatest, readOne, newId } from "../lib/store.js";

const TYPES = ["booking", "delivery", "event"];
const STATUSES = ["new", "confirmed", "done", "canceled"];

export default async function handler(req, res) {
  if (cors(req, res)) return;

  try {
    if (req.method === "GET") {
      if (!requireAuth(req, res)) return;
      const rows = await readLatest("requests");
      rows.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
      return send(res, 200, { requests: rows });
    }

    if (req.method === "POST") {
      const b = body(req);
      if (b.website) return send(res, 200, { ok: true }); // ловушка для ботов
      const name = clean(b.name, 80);
      const phone = cleanPhone(b.phone);
      const type = TYPES.includes(b.type) ? b.type : "booking";
      if (!name || phone.replace(/\D/g, "").length < 10) {
        return send(res, 400, { error: "Укажите имя и телефон" });
      }
      const manual = isAuthed(req) && b.source === "manual";
      const id = newId();
      const row = {
        type, name, phone,
        date: clean(b.date, 10),
        time: clean(b.time, 5),
        guests: Math.max(0, Math.min(200, parseInt(b.guests, 10) || 0)),
        details: clean(b.details, 600),
        status: "new",
        note: "",
        source: manual ? "manual" : "site",
        createdAt: new Date().toISOString(),
      };
      await writeRecord("requests", id, row);
      return send(res, 201, { ok: true, id });
    }

    if (req.method === "PUT") {
      if (!requireAuth(req, res)) return;
      const b = body(req);
      const cur = await readOne("requests", clean(b.id, 20));
      if (!cur) return send(res, 404, { error: "Заявка не найдена" });
      const next = { ...cur };
      if (STATUSES.includes(b.status)) next.status = b.status;
      if (b.note !== undefined) next.note = clean(b.note, 600);
      for (const k of ["name", "date", "time", "details"]) if (b[k] !== undefined) next[k] = clean(b[k], k === "details" ? 600 : 80);
      if (b.phone !== undefined) next.phone = cleanPhone(b.phone);
      if (b.guests !== undefined) next.guests = Math.max(0, Math.min(200, parseInt(b.guests, 10) || 0));
      if (TYPES.includes(b.type)) next.type = b.type;
      next.updatedAt = new Date().toISOString();
      await writeRecord("requests", cur.id, next);
      return send(res, 200, { ok: true, request: next });
    }

    if (req.method === "DELETE") {
      if (!requireAuth(req, res)) return;
      const id = clean(req.query.id, 20);
      const cur = await readOne("requests", id);
      if (!cur) return send(res, 404, { error: "Заявка не найдена" });
      await writeRecord("requests", id, { ...cur, deleted: true });
      return send(res, 200, { ok: true });
    }

    send(res, 405, { error: "Метод не поддерживается" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Ошибка сервера, попробуйте ещё раз" });
  }
}
