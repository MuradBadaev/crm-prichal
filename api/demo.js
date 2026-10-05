import { send, body, requireAuth } from "../lib/http.js";
import { writeRecord, removeKind, newId } from "../lib/store.js";

// Демо-данные для показа: вымышленные гости, помечены source: "demo".
const NAMES = ["Амина", "Руслан", "Патимат", "Магомед", "Елена", "Тимур", "Зарема", "Ольга", "Ислам", "Мадина", "Сергей", "Хадижат", "Арсен", "Наталья"];
const DETAILS = {
  booking: ["Столик у моря", "На веранде, с детским стульчиком", "Вечером, ближе к гирляндам", "День рождения мамы, нужен торт со свечой", ""],
  delivery: ["Хинкал аварский с говядиной ×2, чуду с сыром ×3", "Пицца 4 сыра, лимонад Голубая лагуна 1 л", "Чуду с зеленью ×4, курзе с мясом", "Чечевичный суп ×2, хачапури по-аджарски"],
  event: ["Выпускной, 25 человек, нужна музыка", "Юбилей 50 лет, банкет на веранде", "Детский праздник, 12 детей + родители", "Корпоратив, 18 человек"],
};

const pick = (a, i) => a[i % a.length];

function demoRows() {
  const rows = [];
  const now = Date.now();
  for (let i = 0; i < 30; i++) {
    const dayAgo = Math.floor((i * 13) % 14);
    const created = new Date(now - dayAgo * 86400000 - ((i * 37) % 600) * 60000);
    const type = i % 7 === 0 ? "event" : i % 3 === 0 ? "delivery" : "booking";
    const guestIdx = i % 11 < 4 ? i % 4 : i; // несколько постоянных гостей
    const visit = new Date(created.getTime() + ((i % 4) + 1) * 86400000);
    const age = (now - created.getTime()) / 86400000;
    const status = age > 3 ? pick(["done", "done", "done", "canceled"], i) : age > 1 ? pick(["confirmed", "done", "confirmed"], i) : "new";
    rows.push({
      type,
      name: pick(NAMES, guestIdx),
      phone: `+79990001${String(10 + (guestIdx % 90)).padStart(2, "0")}`,
      date: type === "delivery" ? "" : visit.toISOString().slice(0, 10),
      time: type === "delivery" ? "" : pick(["13:00", "18:30", "19:00", "20:00", "21:30"], i),
      guests: type === "event" ? 12 + (i % 15) : type === "booking" ? 2 + (i % 5) : 0,
      details: pick(DETAILS[type], i),
      status,
      note: i % 5 === 0 ? "Перезвонить за час" : "",
      source: "demo",
      createdAt: created.toISOString(),
    });
  }
  return rows;
}

export default async function handler(req, res) {
  if (!requireAuth(req, res)) return;
  try {
    const action = body(req).action;
    if (req.method === "POST" && action === "seed") {
      await removeKind("requests", (r) => r.source === "demo");
      const rows = demoRows();
      for (let i = 0; i < rows.length; i += 8) {
        await Promise.all(rows.slice(i, i + 8).map((r) => writeRecord("requests", newId(), r)));
      }
      return send(res, 200, { ok: true, added: rows.length });
    }
    if (req.method === "POST" && action === "clear") {
      const removed = await removeKind("requests", (r) => r.source === "demo");
      return send(res, 200, { ok: true, removed });
    }
    send(res, 400, { error: "Неизвестное действие" });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: "Ошибка сервера, попробуйте ещё раз" });
  }
}
