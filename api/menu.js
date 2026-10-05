import { cors, send, body, requireAuth, clean } from "../lib/http.js";
import { writeRecord, readOne, compact } from "../lib/store.js";
import DEFAULT_MENU from "../lib/defaultMenu.js";

const TAGS = ["Дагестан", "Кухня", "Бар"];

function sanitize(categories) {
  if (!Array.isArray(categories)) return null;
  return categories.slice(0, 40).map((c, i) => ({
    id: clean(c.id, 30).replace(/[^\w-]/g, "") || `cat${i}`,
    title: clean(c.title, 60) || "Без названия",
    tag: TAGS.includes(c.tag) ? c.tag : "Кухня",
    items: (Array.isArray(c.items) ? c.items : []).slice(0, 80).map((it) => ({
      name: clean(it.name, 90),
      desc: clean(it.desc, 200),
      vol: clean(it.vol, 30),
      price: Math.max(0, Math.min(100000, Math.round(Number(it.price) || 0))),
      hidden: Boolean(it.hidden),
    })).filter((it) => it.name),
  }));
}

export default async function handler(req, res) {
  if (cors(req, res)) return;
  try {
    if (req.method === "GET") {
      const saved = await readOne("menu", "current");
      if (saved) return send(res, 200, { source: "crm", updatedAt: saved.savedAt, categories: saved.categories });
      return send(res, 200, { source: "default", categories: DEFAULT_MENU });
    }
    if (req.method === "PUT") {
      if (!requireAuth(req, res)) return;
      const categories = sanitize(body(req).categories);
      if (!categories) return send(res, 400, { error: "Неверный формат меню" });
      await writeRecord("menu", "current", { categories });
      await compact("menu");
      return send(res, 200, { ok: true });
    }
    send(res, 405, { error: "Метод не поддерживается" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Ошибка сервера, попробуйте ещё раз" });
  }
}
