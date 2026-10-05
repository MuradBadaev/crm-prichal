// Локальный запуск CRM: node dev-server.js → http://localhost:5190
// Данные пишутся в папку .local-store, пароль берётся из CRM_PASSWORD.
import http from "node:http";
import { readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = import.meta.dirname;
process.env.LOCAL_STORE ||= join(ROOT, ".local-store");
process.env.CRM_PASSWORD ||= "local-dev";
const PORT = 5190;
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".jpg": "image/jpeg", ".json": "application/json" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.status = (c) => ((res.statusCode = c), res);
  res.json = (d) => { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(d)); };
  try {
    if (url.pathname.startsWith("/api/")) {
      let raw = "";
      for await (const ch of req) raw += ch;
      req.body = raw ? JSON.parse(raw) : {};
      req.query = Object.fromEntries(url.searchParams);
      const mod = await import(pathToFileURL(join(ROOT, "api", url.pathname.slice(5) + ".js")).href);
      return await mod.default(req, res);
    }
    const file = url.pathname.startsWith("/_store/")
      ? join(process.env.LOCAL_STORE, decodeURIComponent(url.pathname.slice(8)))
      : join(ROOT, "public", url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
    const data = await readFile(file);
    res.writeHead(200, { "Content-Type": TYPES[extname(file)] || "application/octet-stream" });
    res.end(data);
  } catch (e) {
    if (e.code !== "ENOENT") console.error(e);
    res.writeHead(e.code === "ENOENT" ? 404 : 500); res.end(e.code === "ENOENT" ? "404" : "500");
  }
}).listen(PORT, () => console.log(`CRM: http://localhost:${PORT}`));
