import { send, body, checkPassword, makeToken, isAuthed } from "../lib/http.js";

const cookie = (v, maxAge) =>
  `crm=${encodeURIComponent(v)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

export default async function handler(req, res) {
  if (req.method === "GET") return send(res, 200, { authed: isAuthed(req) });

  if (req.method === "POST") {
    // небольшая пауза против перебора пароля
    await new Promise((r) => setTimeout(r, 400));
    if (!checkPassword(body(req).password)) return send(res, 401, { error: "Неверный пароль" });
    res.setHeader("Set-Cookie", cookie(makeToken(), 60 * 60 * 24 * 14));
    return send(res, 200, { ok: true });
  }

  if (req.method === "DELETE") {
    res.setHeader("Set-Cookie", cookie("", 0));
    return send(res, 200, { ok: true });
  }

  send(res, 405, { error: "Метод не поддерживается" });
}
