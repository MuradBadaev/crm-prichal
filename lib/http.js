import { createHmac, timingSafeEqual } from "node:crypto";

const SITE_ORIGINS = (process.env.SITE_ORIGINS || "https://prichal-chi.vercel.app,http://localhost:5180")
  .split(",").map((s) => s.trim());

export function cors(req, res) {
  const origin = req.headers.origin;
  if (origin && SITE_ORIGINS.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  }
  if (req.method === "OPTIONS") { res.status(204).end(); return true; }
  return false;
}

export const send = (res, code, data) => {
  res.setHeader("Cache-Control", "no-store");
  res.status(code).json(data);
};

const secret = () => `${process.env.CRM_PASSWORD || ""}::prichal-crm`;
const sign = (v) => createHmac("sha256", secret()).update(v).digest("hex");

export function makeToken() {
  const exp = String(Date.now() + 1000 * 60 * 60 * 24 * 14); // 14 дней
  return `${exp}.${sign(exp)}`;
}

export function checkPassword(given) {
  const real = process.env.CRM_PASSWORD || "";
  const a = Buffer.from(String(given || ""));
  const b = Buffer.from(real);
  return real.length > 0 && a.length === b.length && timingSafeEqual(a, b);
}

export function isAuthed(req) {
  const m = /(?:^|;\s*)crm=([^;]+)/.exec(req.headers.cookie || "");
  if (!m) return false;
  const [exp, sig] = decodeURIComponent(m[1]).split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  const good = sign(exp);
  return good.length === sig.length && timingSafeEqual(Buffer.from(good), Buffer.from(sig));
}

export function requireAuth(req, res) {
  if (isAuthed(req)) return true;
  send(res, 401, { error: "Нужно войти" });
  return false;
}

export function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  try { return JSON.parse(req.body || "{}"); } catch { return {}; }
}

export const clean = (v, max = 200) => String(v ?? "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max);
export const cleanPhone = (v) => String(v ?? "").replace(/[^\d+]/g, "").slice(0, 16);
