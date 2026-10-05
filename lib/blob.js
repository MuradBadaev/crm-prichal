// Обёртка над Vercel Blob. При LOCAL_STORE=папка данные пишутся на диск —
// так CRM можно запустить и проверить локально без облака.
import * as vercelBlob from "@vercel/blob";
import { mkdir, writeFile, readdir, rm, stat } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import { randomUUID } from "node:crypto";

const DIR = process.env.LOCAL_STORE;
const BASE = process.env.LOCAL_STORE_URL || "http://localhost:5190/_store";

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const local = {
  async put(pathname, body, opts = {}) {
    const name = opts.addRandomSuffix ? pathname.replace(/\.json$/, `-${randomUUID().slice(0, 8)}.json`) : pathname;
    const file = join(DIR, name);
    await mkdir(join(file, ".."), { recursive: true });
    await writeFile(file, body);
    return { pathname: name, url: `${BASE}/${name}` };
  },
  async list({ prefix = "" } = {}) {
    const files = await walk(DIR);
    const blobs = [];
    for (const f of files) {
      const pathname = relative(DIR, f).split(sep).join("/");
      if (pathname.startsWith(prefix)) blobs.push({ pathname, url: `${BASE}/${pathname}`, uploadedAt: (await stat(f)).mtime });
    }
    return { blobs, hasMore: false };
  },
  async del(urls) {
    for (const u of [].concat(urls)) await rm(join(DIR, u.replace(`${BASE}/`, "")), { force: true });
  },
};

export const put = DIR ? local.put : vercelBlob.put;
export const list = DIR ? local.list : vercelBlob.list;
export const del = DIR ? local.del : vercelBlob.del;
