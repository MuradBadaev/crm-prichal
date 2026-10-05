const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const TYPE = { booking: "Бронь стола", delivery: "Доставка", event: "Праздник" };
const STATUS = { new: "Новая", confirmed: "Подтверждена", done: "Выполнена", canceled: "Отменена" };
const TAGS = { "": "—", regular: "Постоянный", vip: "VIP", problem: "Внимание" };
const TZ = "Europe/Moscow";

const state = { requests: [], guests: [], menu: null, menuDirty: false, cat: 0, filter: "active", type: "all", q: "", gq: "", editing: null };

/* ——— Утилиты ——— */
async function api(path, opts = {}) {
  const r = await fetch(path, { credentials: "same-origin", headers: { "Content-Type": "application/json" }, ...opts, body: opts.body ? JSON.stringify(opts.body) : undefined });
  let data = {};
  try { data = await r.json(); } catch {}
  if (r.status === 401 && path !== "/api/login") { show("login"); throw new Error(data.error || "Нужно войти"); }
  if (!r.ok) throw new Error(data.error || "Не получилось. Проверьте интернет и попробуйте ещё раз.");
  return data;
}
let toastTimer;
function toast(msg, err = false) {
  const t = $("[data-toast]");
  t.textContent = msg;
  t.classList.toggle("is-err", err);
  t.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("is-on"), 2600);
}
const fmtDT = (iso) => iso ? new Intl.DateTimeFormat("ru-RU", { timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "";
const fmtD = (d) => d ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", weekday: "short", timeZone: "UTC" }).format(new Date(d + "T00:00:00Z")) : "";
const fmtPhone = (p) => { const d = String(p).replace(/\D/g, ""); return d.length === 11 ? `+7 ${d.slice(1, 4)} ${d.slice(4, 7)}-${d.slice(7, 9)}-${d.slice(9)}` : p; };
const dayKey = (iso) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const plural = (n, a, b, c) => { const m = n % 10, h = n % 100; return m === 1 && h !== 11 ? a : m >= 2 && m <= 4 && (h < 10 || h >= 20) ? b : c; };

/* ——— Вход и навигация ——— */
function show(view) {
  $$("[data-view]").forEach((v) => (v.hidden = v.dataset.view !== view));
}
$("[data-login]").addEventListener("submit", async (e) => {
  e.preventDefault();
  const err = $("[data-login-error]");
  const btn = e.target.querySelector("button");
  err.textContent = "";
  btn.disabled = true; btn.textContent = "Входим…";
  try {
    await api("/api/login", { method: "POST", body: { password: e.target.password.value } });
    e.target.reset();
    await start();
  } catch (ex) { err.textContent = ex.message; }
  finally { btn.disabled = false; btn.textContent = "Войти"; }
});
$("[data-logout]").addEventListener("click", async () => {
  await api("/api/login", { method: "DELETE" }).catch(() => {});
  show("login");
});

function route() {
  const page = (location.hash || "#requests").slice(1);
  const valid = ["requests", "menu", "guests", "stats"].includes(page) ? page : "requests";
  $$("[data-page]").forEach((p) => (p.hidden = p.dataset.page !== valid));
  $$("[data-nav]").forEach((a) => a.dataset.nav === valid ? a.setAttribute("aria-current", "page") : a.removeAttribute("aria-current"));
  if (valid === "menu" && !state.menu) loadMenu();
  if (valid === "guests") loadGuests();
  if (valid === "stats") renderStats();
}
addEventListener("hashchange", route);
addEventListener("beforeunload", (e) => { if (state.menuDirty) { e.preventDefault(); e.returnValue = ""; } });

/* ——— Заявки ——— */
async function loadRequests(silent) {
  if (!silent) skeleton($("[data-req-table] tbody"), 6);
  try {
    const { requests } = await api("/api/requests");
    state.requests = requests;
    if (!requests.some((r) => r.source === "demo") && requests.length < 5 && !localStorage.getItem("prichal-crm-seeded")) {
      localStorage.setItem("prichal-crm-seeded", "1");
      await api("/api/demo", { method: "POST", body: { action: "seed" } });
      return loadRequests(silent);
    }
  } catch (e) { if (!silent) toast(e.message, true); }
  renderRequests();
  if (!$("[data-page=stats]").hidden) renderStats();
}

function skeleton(tbody, cols) {
  tbody.innerHTML = Array.from({ length: 5 }, () => `<tr>${"<td><div class='skeleton'></div></td>".repeat(cols)}</tr>`).join("");
}

function renderRequests() {
  const all = state.requests;
  const newCount = all.filter((r) => r.status === "new").length;
  $$("[data-new-count]").forEach((el) => { el.hidden = !newCount; el.textContent = newCount; });
  $("[data-demo-bar]").hidden = !all.some((r) => r.source === "demo");

  const q = state.q.toLowerCase().replace(/[\s()-]/g, "");
  const rows = all.filter((r) =>
    (state.filter === "all" || (state.filter === "active" ? ["new", "confirmed"].includes(r.status) : r.status === state.filter)) &&
    (state.type === "all" || r.type === state.type) &&
    (!q || r.name.toLowerCase().includes(q) || r.phone.includes(q.replace(/\D/g, "") || "~"))
  );
  const tbody = $("[data-req-table] tbody");
  tbody.innerHTML = rows.map((r) => `
    <tr class="row ${r.status === "new" ? "is-new" : ""}" data-id="${esc(r.id)}" tabindex="0">
      <td data-c="created" class="num">${esc(fmtDT(r.createdAt))}</td>
      <td data-c="type"><span class="type" data-t="${esc(r.type)}">${TYPE[r.type] || ""}</span>${r.source === "site" ? '<span class="badge">с сайта</span>' : ""}</td>
      <td data-c="guest" class="guest"><b>${esc(r.name)}${r.source === "demo" ? '<span class="badge">демо</span>' : ""}</b><a href="tel:${esc(r.phone)}" onclick="event.stopPropagation()">${esc(fmtPhone(r.phone))}</a></td>
      <td data-c="when" class="num">${r.date ? esc(fmtD(r.date)) : ""}${r.time ? " · " + esc(r.time) : ""}${r.guests ? ` <span class="muted">· ${r.guests} ${plural(r.guests, "гость", "гостя", "гостей")}</span>` : ""}${!r.date && !r.time && r.type === "delivery" ? '<span class="muted">как можно скорее</span>' : ""}</td>
      <td data-c="details" class="details">${esc(r.details)}${r.note ? `<span class="note">${esc(r.note)}</span>` : ""}</td>
      <td data-c="status"><span class="st" data-s="${esc(r.status)}">${STATUS[r.status]}</span></td>
    </tr>`).join("");
  const empty = $("[data-req-empty]");
  empty.hidden = rows.length > 0;
  empty.innerHTML = all.length
    ? "<b>Ничего не найдено</b>Попробуйте другой фильтр или поиск."
    : "<b>Заявок пока нет</b>Они появятся, когда гости оставят заявку на сайте, или добавьте заявку по звонку.";
  $("[data-req-sub]").textContent = `${all.length} ${plural(all.length, "заявка", "заявки", "заявок")} · новых ${newCount}`;
}

$("[data-filter=status]").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.filter = b.dataset.v;
  $$("[data-filter=status] button").forEach((x) => x.setAttribute("aria-pressed", x === b));
  renderRequests();
});
$("[data-filter-type]").addEventListener("change", (e) => { state.type = e.target.value; renderRequests(); });
$("[data-search]").addEventListener("input", (e) => { state.q = e.target.value; renderRequests(); });
$("[data-req-table] tbody").addEventListener("click", (e) => { const tr = e.target.closest("tr[data-id]"); if (tr) openDrawer(tr.dataset.id); });
$("[data-req-table] tbody").addEventListener("keydown", (e) => { if (e.key === "Enter") { const tr = e.target.closest("tr[data-id]"); if (tr) openDrawer(tr.dataset.id); } });
$("[data-new-request]").addEventListener("click", () => openDrawer(null));
$("[data-demo-clear]").addEventListener("click", async () => {
  if (!confirm("Убрать все демо-заявки? Настоящие заявки с сайта останутся.")) return;
  try { const r = await api("/api/demo", { method: "POST", body: { action: "clear" } }); toast(`Убрано демо-заявок: ${r.removed}`); loadRequests(true); }
  catch (e) { toast(e.message, true); }
});

/* ——— Панель заявки ——— */
const drawer = $("[data-drawer]");
const form = $("[data-drawer-form]");
let lastFocus;
function openDrawer(id) {
  lastFocus = document.activeElement;
  const r = id ? state.requests.find((x) => x.id === id) : { type: "booking", status: "new", name: "", phone: "", date: "", time: "", guests: 2, details: "", note: "" };
  if (!r) return;
  state.editing = id ? { ...r } : { ...r, isNew: true };
  $("[data-drawer-title]").textContent = id ? `${TYPE[r.type]} · ${r.name}` : "Новая заявка по звонку";
  for (const k of ["type", "name", "date", "time", "guests", "details", "note"]) form.elements[k].value = r[k] ?? "";
  form.elements.phone.value = r.phone ? fmtPhone(r.phone) : "";
  $("[data-status-row]").innerHTML = id ? Object.entries(STATUS).map(([k, v]) => `<button type="button" data-s="${k}" aria-pressed="${r.status === k}">${v}</button>`).join("") : "";
  $("[data-drawer-meta]").textContent = id ? `Создана ${fmtDT(r.createdAt)} · ${r.source === "site" ? "с сайта" : r.source === "demo" ? "демо-данные" : "добавлена вручную"}${r.updatedAt ? ` · изменена ${fmtDT(r.updatedAt)}` : ""}` : "";
  $("[data-drawer-delete]").hidden = !id;
  const call = $("[data-drawer-call]");
  call.hidden = !id; call.href = `tel:${r.phone}`;
  $("[data-drawer-error]").textContent = "";
  drawer.hidden = false;
  document.body.style.overflow = "hidden";
  setTimeout(() => (id ? $("[data-status-row] button[aria-pressed=true]") : form.elements.name)?.focus(), 50);
}
function closeDrawer() {
  drawer.hidden = true;
  document.body.style.overflow = "";
  state.editing = null;
  lastFocus?.focus?.();
}
$$("[data-drawer-close]").forEach((b) => b.addEventListener("click", closeDrawer));
addEventListener("keydown", (e) => { if (e.key === "Escape" && !drawer.hidden) closeDrawer(); });
$("[data-status-row]").addEventListener("click", (e) => {
  const b = e.target.closest("button"); if (!b) return;
  state.editing.status = b.dataset.s;
  $$("[data-status-row] button").forEach((x) => x.setAttribute("aria-pressed", x === b));
});
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const ed = state.editing;
  const payload = Object.fromEntries(["type", "name", "phone", "date", "time", "guests", "details", "note"].map((k) => [k, form.elements[k].value]));
  const btn = form.querySelector("button[type=submit]");
  btn.disabled = true;
  try {
    if (ed.isNew) {
      const { id } = await api("/api/requests", { method: "POST", body: { ...payload, source: "manual" } });
      if (payload.note) await api("/api/requests", { method: "PUT", body: { id, note: payload.note } });
      toast("Заявка добавлена");
    } else {
      await api("/api/requests", { method: "PUT", body: { id: ed.id, status: ed.status, ...payload } });
      toast("Сохранено");
    }
    closeDrawer();
    loadRequests(true);
  } catch (ex) { $("[data-drawer-error]").textContent = ex.message; }
  finally { btn.disabled = false; }
});
$("[data-drawer-delete]").addEventListener("click", async () => {
  const ed = state.editing;
  if (!confirm(`Удалить заявку «${ed.name}»?`)) return;
  try { await api(`/api/requests?id=${encodeURIComponent(ed.id)}`, { method: "DELETE" }); toast("Заявка удалена"); closeDrawer(); loadRequests(true); }
  catch (e) { $("[data-drawer-error]").textContent = e.message; }
});

/* ——— Меню ——— */
async function loadMenu() {
  $("[data-cat-panel]").innerHTML = "<div style='padding:16px'><div class='skeleton'></div></div>";
  try {
    const m = await api("/api/menu");
    state.menu = m.categories;
    $("[data-menu-sub]").textContent = m.source === "crm"
      ? `Последнее сохранение ${fmtDT(m.updatedAt)}. Изменения появятся на сайте сразу после сохранения.`
      : "Сейчас на сайте исходное меню. Изменения появятся на сайте сразу после сохранения.";
    renderMenu();
  } catch (e) { toast(e.message, true); }
}
function setDirty(v) {
  state.menuDirty = v;
  $("[data-menu-save]").disabled = !v;
  $("[data-menu-state]").textContent = v ? "Есть несохранённые изменения" : "";
}
function renderMenu() {
  const cats = state.menu;
  $("[data-cats]").innerHTML = cats.map((c, i) => `<button type="button" data-i="${i}" aria-current="${i === state.cat}">${esc(c.title)}<span>${c.items.length}</span></button>`).join("");
  const c = cats[state.cat];
  $("[data-cat-panel]").innerHTML = `
    <div class="cat-panel__head">
      <label class="field"><span>Название раздела</span><input data-cat-title value="${esc(c.title)}" maxlength="60"></label>
      <label class="field"><span>Метка</span><select data-cat-tag>${["Дагестан", "Кухня", "Бар"].map((t) => `<option ${t === c.tag ? "selected" : ""}>${t}</option>`).join("")}</select></label>
    </div>
    <div class="items__head"><span>Блюдо</span><span>Состав / описание</span><span>Объём</span><span style="text-align:right">Цена, ₽</span><span></span></div>
    <ul class="items">${c.items.map((it, j) => `
      <li class="item ${it.hidden ? "is-hidden" : ""}" data-j="${j}">
        <input class="name" data-k="name" value="${esc(it.name)}" aria-label="Название" maxlength="90">
        <input class="desc" data-k="desc" value="${esc(it.desc)}" placeholder="Описание" aria-label="Описание" maxlength="200">
        <input class="vol" data-k="vol" value="${esc(it.vol)}" placeholder="300 мл" aria-label="Объём" maxlength="30">
        <input class="price" data-k="price" value="${esc(it.price)}" inputmode="numeric" aria-label="Цена">
        <div class="item__act">
          <button type="button" class="icon-btn" data-act="hide" aria-label="${it.hidden ? "Показать на сайте" : "Скрыть с сайта"}" title="${it.hidden ? "Скрыто — показать на сайте" : "Скрыть с сайта (нет в наличии)"}"><svg><use href="#i-${it.hidden ? "eye-off" : "eye"}"/></svg></button>
          <button type="button" class="icon-btn" data-act="del" aria-label="Удалить блюдо" title="Удалить"><svg><use href="#i-trash"/></svg></button>
        </div>
      </li>`).join("")}
    </ul>
    <button type="button" class="btn btn--ghost add-item" data-add-item><svg><use href="#i-plus"/></svg>Добавить блюдо</button>`;
}
$("[data-cats]").addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; state.cat = +b.dataset.i; renderMenu(); });
$("[data-cat-panel]").addEventListener("input", (e) => {
  const c = state.menu[state.cat];
  if (e.target.matches("[data-cat-title]")) { c.title = e.target.value; $(`[data-cats] button[data-i="${state.cat}"]`).firstChild.textContent = e.target.value; }
  else if (e.target.matches("[data-k]")) {
    const it = c.items[+e.target.closest("[data-j]").dataset.j];
    const k = e.target.dataset.k;
    it[k] = k === "price" ? Number(e.target.value.replace(/\D/g, "")) || 0 : e.target.value;
  }
  setDirty(true);
});
$("[data-cat-panel]").addEventListener("change", (e) => { if (e.target.matches("[data-cat-tag]")) { state.menu[state.cat].tag = e.target.value; setDirty(true); } });
$("[data-cat-panel]").addEventListener("click", (e) => {
  const c = state.menu[state.cat];
  if (e.target.closest("[data-add-item]")) {
    c.items.push({ name: "", desc: "", vol: "", price: 0, hidden: false });
    setDirty(true); renderMenu();
    $$(".item .name").at(-1).focus();
    return;
  }
  const act = e.target.closest("[data-act]"); if (!act) return;
  const j = +act.closest("[data-j]").dataset.j;
  if (act.dataset.act === "hide") c.items[j].hidden = !c.items[j].hidden;
  if (act.dataset.act === "del") { if (!confirm(`Удалить «${c.items[j].name || "блюдо"}»?`)) return; c.items.splice(j, 1); }
  setDirty(true); renderMenu();
});
$("[data-menu-save]").addEventListener("click", async () => {
  const btn = $("[data-menu-save]");
  btn.disabled = true; $("[data-menu-state]").textContent = "Сохраняем…";
  try {
    await api("/api/menu", { method: "PUT", body: { categories: state.menu } });
    setDirty(false);
    toast("Меню сохранено и уже на сайте");
    $("[data-menu-sub]").textContent = `Последнее сохранение ${fmtDT(new Date().toISOString())}. Изменения появятся на сайте сразу после сохранения.`;
  } catch (e) { toast(e.message, true); setDirty(true); }
});

/* ——— Гости ——— */
async function loadGuests() {
  skeleton($("[data-guest-table] tbody"), 6);
  try { state.guests = (await api("/api/guests")).guests; } catch (e) { toast(e.message, true); }
  renderGuests();
}
function renderGuests() {
  const q = state.gq.toLowerCase();
  const rows = state.guests.filter((g) => !q || g.name.toLowerCase().includes(q) || g.phone.includes(q.replace(/\D/g, "") || "~"));
  $("[data-guest-table] tbody").innerHTML = rows.map((g) => `
    <tr data-phone="${esc(g.phone)}">
      <td data-c="guest" class="guest"><b>${esc(g.name)}${g.demo ? '<span class="badge">демо</span>' : ""}</b><a href="tel:${esc(g.phone)}">${esc(fmtPhone(g.phone))}</a></td>
      <td class="num" data-label="Заявок">${g.total}</td>
      <td class="num" data-label="Пришли">${g.done}${g.canceled ? ` <span class="muted">· отмен ${g.canceled}</span>` : ""}</td>
      <td class="num" data-label="Последняя">${esc(fmtDT(g.last))}</td>
      <td><select class="tag-select" data-tag aria-label="Метка гостя">${Object.entries(TAGS).map(([k, v]) => `<option value="${k}" ${k === (g.tag || "") ? "selected" : ""}>${v}</option>`).join("")}</select></td>
      <td data-c="note"><input class="note-input" data-note value="${esc(g.note || "")}" placeholder="Например: любит столик у моря" aria-label="Заметка о госте" maxlength="600"></td>
    </tr>`).join("");
  const empty = $("[data-guest-empty]");
  empty.hidden = rows.length > 0;
  empty.innerHTML = state.guests.length ? "<b>Никого не нашли</b>Проверьте имя или номер." : "<b>Гостей пока нет</b>Они появятся вместе с первыми заявками.";
}
$("[data-guest-search]").addEventListener("input", (e) => { state.gq = e.target.value; renderGuests(); });
async function saveGuest(tr) {
  const g = state.guests.find((x) => x.phone === tr.dataset.phone);
  g.note = $("[data-note]", tr).value; g.tag = $("[data-tag]", tr).value;
  try { await api("/api/guests", { method: "PUT", body: { phone: g.phone, note: g.note, tag: g.tag } }); toast("Сохранено"); }
  catch (e) { toast(e.message, true); }
}
$("[data-guest-table] tbody").addEventListener("change", (e) => { const tr = e.target.closest("tr"); if (tr && e.target.matches("[data-tag],[data-note]")) saveGuest(tr); });

/* ——— Статистика ——— */
function renderStats() {
  const now = Date.now();
  const days = Array.from({ length: 14 }, (_, i) => dayKey(new Date(now - (13 - i) * 86400000).toISOString()));
  const recent = state.requests.filter((r) => r.createdAt && days.includes(dayKey(r.createdAt)));
  const prev = state.requests.filter((r) => r.createdAt && now - new Date(r.createdAt) >= 14 * 86400000 && now - new Date(r.createdAt) < 28 * 86400000);
  const by = (arr, k) => arr.reduce((m, r) => ((m[r[k]] = (m[r[k]] || 0) + 1), m), {});
  const st = by(recent, "status"), tp = by(recent, "type");
  const closed = (st.done || 0) + (st.canceled || 0);
  const conv = closed ? Math.round(((st.done || 0) / closed) * 100) : 0;
  const today = dayKey(new Date().toISOString());
  const upcoming = state.requests.filter((r) => r.date && r.date >= today && ["new", "confirmed"].includes(r.status));
  const guestsSum = upcoming.reduce((s, r) => s + (r.guests || 0), 0);
  const perDay = days.map((d) => ({ d, rows: recent.filter((r) => dayKey(r.createdAt) === d) }));
  const max = Math.max(1, ...perDay.map((x) => x.rows.length));
  const COL = { booking: "var(--sea-600)", delivery: "var(--wood)", event: "#7A5AA6" };
  const diff = prev.length ? Math.round(((recent.length - prev.length) / prev.length) * 100) : null;
  const total = Math.max(1, recent.length);

  $("[data-stats]").innerHTML = `
    <div class="card kpi"><h3>Заявок</h3><b>${recent.length}</b><span>${diff === null ? "за 14 дней" : `${diff >= 0 ? "+" : ""}${diff}% к прошлым 14 дням`}</span></div>
    <div class="card kpi"><h3>Ждут ответа</h3><b>${st.new || 0}</b><span>новые, без звонка</span></div>
    <div class="card kpi"><h3>Пришли</h3><b>${conv}%</b><span>из закрытых заявок</span></div>
    <div class="card kpi"><h3>Гостей ожидается</h3><b>${guestsSum}</b><span>${upcoming.length} ${plural(upcoming.length, "бронь", "брони", "броней")} на сегодня и дальше</span></div>
    <div class="card card--wide"><h3>Заявки по дням</h3>
      <div class="bars" role="img" aria-label="Заявки по дням за 14 дней">${perDay.map(({ d, rows }) => {
        const h = (rows.length / max) * 100;
        const parts = ["booking", "delivery", "event"].map((t) => { const n = rows.filter((r) => r.type === t).length; return n ? `<i style="height:${(n / Math.max(1, rows.length)) * 100}%;background:${COL[t]}"></i>` : ""; }).join("");
        return `<div class="bar" title="${rows.length} ${plural(rows.length, "заявка", "заявки", "заявок")}"><div class="bar__col" style="height:${h}%">${parts}</div><div><div class="bar__val">${rows.length || ""}</div><div class="bar__lbl">${+d.slice(8)}</div></div></div>`;
      }).join("")}</div>
      <div class="legend">${Object.entries(TYPE).map(([k, v]) => `<span class="type" data-t="${k}">${v}</span>`).join("")}</div>
    </div>
    <div class="card card--half"><h3>По типам</h3><div class="hbars">${Object.entries(TYPE).map(([k, v]) => `<div class="hbar"><span>${v}</span><div class="hbar__track"><i style="width:${((tp[k] || 0) / total) * 100}%;background:${COL[k]}"></i></div><b>${tp[k] || 0}</b></div>`).join("")}</div></div>
    <div class="card card--half"><h3>По статусам</h3><div class="hbars">${Object.entries(STATUS).map(([k, v]) => `<div class="hbar"><span>${v}</span><div class="hbar__track"><i style="width:${((st[k] || 0) / total) * 100}%;background:var(--sea-700)"></i></div><b>${st[k] || 0}</b></div>`).join("")}</div></div>`;
}

/* ——— Старт ——— */
async function start() {
  show("app");
  route();
  await loadRequests();
  clearInterval(start.timer);
  start.timer = setInterval(() => { if (!document.hidden && drawer.hidden) loadRequests(true); }, 30000);
}
(async () => {
  try {
    const { authed } = await api("/api/login");
    authed ? start() : show("login");
  } catch { show("login"); }
})();
