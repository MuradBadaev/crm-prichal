// Хранилище на Vercel Blob. Каждая запись — новый файл (журнал версий),
// поэтому чтение никогда не попадает на устаревший кэш CDN.
import { put, list, del } from "./blob.js";
import { randomUUID } from "node:crypto";

export const newId = () => randomUUID().slice(0, 8);

export async function writeRecord(kind, id, data) {
  const body = JSON.stringify({ ...data, id, savedAt: new Date().toISOString() });
  await put(`${kind}/${id}/${Date.now()}.json`, body, {
    access: "public",
    addRandomSuffix: true,
    contentType: "application/json",
  });
}

async function listAll(prefix) {
  const out = [];
  let cursor;
  do {
    const page = await list({ prefix, cursor, limit: 1000 });
    out.push(...page.blobs);
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);
  return out;
}

const stamp = (pathname) => Number(pathname.split("/").pop().split("-")[0].replace(".json", "")) || 0;

// Последняя версия каждой записи вида kind/<id>/<время>.json
export async function readLatest(kind) {
  const blobs = await listAll(`${kind}/`);
  const latest = new Map();
  for (const b of blobs) {
    const id = b.pathname.split("/")[1];
    const cur = latest.get(id);
    if (!cur || stamp(b.pathname) > stamp(cur.pathname)) latest.set(id, b);
  }
  const rows = await Promise.all(
    [...latest.values()].map(async (b) => {
      const r = await fetch(b.url, { cache: "no-store" });
      return r.ok ? r.json() : null;
    })
  );
  return rows.filter((r) => r && !r.deleted);
}

export async function readOne(kind, id) {
  const blobs = await listAll(`${kind}/${id}/`);
  if (!blobs.length) return null;
  blobs.sort((a, b) => stamp(b.pathname) - stamp(a.pathname));
  const r = await fetch(blobs[0].url, { cache: "no-store" });
  const row = r.ok ? await r.json() : null;
  return row && !row.deleted ? row : null;
}

// Удалить старые версии, оставив последнюю (чтобы хранилище не росло)
export async function compact(kind) {
  const blobs = await listAll(`${kind}/`);
  const byId = new Map();
  for (const b of blobs) {
    const id = b.pathname.split("/")[1];
    (byId.get(id) || byId.set(id, []).get(id)).push(b);
  }
  const old = [];
  for (const arr of byId.values()) {
    arr.sort((a, b) => stamp(b.pathname) - stamp(a.pathname));
    old.push(...arr.slice(1).map((b) => b.url));
  }
  if (old.length) await del(old);
  return old.length;
}

export async function removeKind(kind, filter) {
  const rows = await readLatest(kind);
  const ids = rows.filter(filter).map((r) => r.id);
  const blobs = await listAll(`${kind}/`);
  const urls = blobs.filter((b) => ids.includes(b.pathname.split("/")[1])).map((b) => b.url);
  if (urls.length) await del(urls);
  return ids.length;
}
