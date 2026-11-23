var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// ../.wrangler/tmp/bundle-g0JRyw/strip-cf-connecting-ip-header.js
function stripCfConnectingIPHeader(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader.apply(null, argArray)
    ]);
  }
});

// api/[[path]].js
var ESTADOS = ["libre", "reservado", "senado", "vendido", "bloqueado"];
var EST_CONSULTA = ["nueva", "contactado", "visita", "reserva", "cerrada", "descartada"];
var SCHEMA = `CREATE TABLE IF NOT EXISTS unidades (id TEXT PRIMARY KEY, grupo TEXT, orden INTEGER, tip TEXT, m2 REAL, estado TEXT DEFAULT 'libre', precio_lista INTEGER, mostrar_precio INTEGER DEFAULT 1, updated_at TEXT);
CREATE TABLE IF NOT EXISTS ventas (id INTEGER PRIMARY KEY AUTOINCREMENT, unidad_id TEXT, estado TEXT, cliente TEXT, documento TEXT, telefono TEXT, email TEXT, fecha TEXT, precio_cerrado INTEGER, vendedor TEXT, notas TEXT, activo INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT, creado_por TEXT);
CREATE INDEX IF NOT EXISTS ix_ventas_u ON ventas(unidad_id, activo);
CREATE TABLE IF NOT EXISTS cuotas (id INTEGER PRIMARY KEY AUTOINCREMENT, venta_id INTEGER, n INTEGER, concepto TEXT, fecha TEXT, monto INTEGER, pagado INTEGER DEFAULT 0, fecha_pago TEXT, monto_pagado INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS ix_cuotas_v ON cuotas(venta_id);
CREATE TABLE IF NOT EXISTS consultas (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, nombre TEXT, telefono TEXT, email TEXT, unidad TEXT, intencion TEXT, origen TEXT, estado TEXT DEFAULT 'nueva', notas TEXT, updated_at TEXT);
CREATE INDEX IF NOT EXISTS ix_consultas ON consultas(ts);
CREATE TABLE IF NOT EXISTS inmobiliarias (slug TEXT PRIMARY KEY, nombre TEXT, whatsapp TEXT, activo INTEGER DEFAULT 1, creado TEXT);
CREATE TABLE IF NOT EXISTS usuarios (email TEXT PRIMARY KEY, nombre TEXT, salt TEXT, hash TEXT, creado TEXT);
CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, email TEXT, exp TEXT);
CREATE TABLE IF NOT EXISTS historial (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, email TEXT, accion TEXT, detalle TEXT);
CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, ts TEXT, tipo TEXT, unidad TEXT, origen TEXT);
CREATE INDEX IF NOT EXISTS ix_eventos ON eventos(ts, unidad)`;
var LISTO = false;
var json = /* @__PURE__ */ __name((d, s = 200, extra = {}) => new Response(JSON.stringify(d), { status: s, headers: Object.assign({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }, extra) }), "json");
var err = /* @__PURE__ */ __name((m, s = 400) => json({ error: m }, s), "err");
var ahora = /* @__PURE__ */ __name(() => (/* @__PURE__ */ new Date()).toISOString(), "ahora");
var hex = /* @__PURE__ */ __name((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""), "hex");
var rnd = /* @__PURE__ */ __name((n) => hex(crypto.getRandomValues(new Uint8Array(n))), "rnd");
var txt = /* @__PURE__ */ __name((v, n) => String(v ?? "").trim().slice(0, n), "txt");
var ID = /^[\w.-]{1,16}$/;
var slugify = /* @__PURE__ */ __name((s) => txt(s, 40).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), "slugify");
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1e5 }, key, 256));
}
__name(pbkdf2, "pbkdf2");
function igual(a, b) {
  if (a.length !== b.length)
    return false;
  let r = 0;
  for (let i = 0; i < a.length; i++)
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
__name(igual, "igual");
async function usuarioDe(req, db) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t)
    return null;
  return await db.prepare("SELECT s.email, u.nombre FROM sesiones s JOIN usuarios u ON u.email=s.email WHERE s.token=? AND s.exp>?").bind(t, ahora()).first() || null;
}
__name(usuarioDe, "usuarioDe");
var log = /* @__PURE__ */ __name((db, email, accion, detalle) => db.prepare("INSERT INTO historial (ts,email,accion,detalle) VALUES (?,?,?,?)").bind(ahora(), email, accion, typeof detalle === "string" ? detalle : JSON.stringify(detalle)).run(), "log");
var publico = /* @__PURE__ */ __name((e) => e === "senado" ? "reservado" : e === "bloqueado" ? "vendido" : e, "publico");
async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.DB;
  if (!db)
    return err("Falta la base de datos (binding DB)", 500);
  if (!LISTO) {
    await db.batch(SCHEMA.split(";").map((q) => q.trim()).filter(Boolean).map((q) => db.prepare(q)));
    LISTO = true;
  }
  const ruta = "/" + [].concat(params.path || []).join("/");
  const m = req.method;
  let body = {};
  if (m === "POST" || m === "PUT") {
    try {
      body = await req.json();
    } catch (e) {
      body = {};
    }
  }
  let mm;
  try {
    if (m === "GET" && ruta === "/public") {
      const { results } = await db.prepare("SELECT id,grupo,orden,tip,m2,estado,precio_lista,mostrar_precio,updated_at FROM unidades ORDER BY grupo,orden").all();
      const unidades = results.map((u) => ({ id: u.id, estado: publico(u.estado), precio: u.estado === "libre" && u.mostrar_precio ? u.precio_lista : null, oculto: !u.mostrar_precio }));
      const act = results.reduce((a, u) => u.updated_at > a ? u.updated_at : a, "");
      return json({ unidades, actualizado: act }, 200, { "cache-control": "public, max-age=15" });
    }
    if (m === "POST" && ruta === "/evento") {
      const tipo = body.tipo === "consulta" ? "consulta" : "vista", u = txt(body.unidad, 16);
      if (!ID.test(u))
        return err("unidad inv\xE1lida");
      await db.prepare("INSERT INTO eventos (ts,tipo,unidad,origen) VALUES (?,?,?,?)").bind(ahora(), tipo, u, txt(body.origen, 40)).run();
      return json({ ok: true });
    }
    if (m === "POST" && ruta === "/consulta") {
      const nombre = txt(body.nombre, 80), tel = txt(body.telefono, 30).replace(/[^\d+ ]/g, "");
      if (!nombre || tel.replace(/\D/g, "").length < 6)
        return err("Faltan nombre y tel\xE9fono");
      if (body.web)
        return json({ ok: true });
      const rec = await db.prepare("SELECT COUNT(*) n FROM consultas WHERE telefono=? AND ts > datetime('now','-1 hour')").bind(tel).first();
      if (rec && rec.n >= 5)
        return err("Ya recibimos tus consultas, te contactamos en breve.", 429);
      const u = txt(body.unidad, 16), t = ahora();
      await db.batch([
        db.prepare("INSERT INTO consultas (ts,nombre,telefono,email,unidad,intencion,origen,estado,notas,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(t, nombre, tel, txt(body.email, 80), ID.test(u) ? u : "", txt(body.intencion, 60), txt(body.origen, 40), "nueva", "", t),
        ...ID.test(u) ? [db.prepare("INSERT INTO eventos (ts,tipo,unidad,origen) VALUES (?,?,?,?)").bind(t, "consulta", u, txt(body.origen, 40))] : []
      ]);
      return json({ ok: true });
    }
    if (m === "GET" && (mm = ruta.match(/^\/inmobiliaria\/([a-z0-9-]{1,40})$/))) {
      const b = await db.prepare("SELECT nombre, whatsapp FROM inmobiliarias WHERE slug=? AND activo=1").bind(mm[1]).first();
      return b ? json(b, 200, { "cache-control": "public, max-age=300" }) : err("No encontrada", 404);
    }
    if (m === "GET" && ruta === "/estado") {
      const [n, u] = await db.batch([db.prepare("SELECT COUNT(*) n FROM usuarios"), db.prepare("SELECT COUNT(*) n FROM unidades")]);
      return json({ necesitaSetup: !n.results[0].n, unidades: u.results[0].n });
    }
    if (m === "POST" && ruta === "/setup") {
      const n = await db.prepare("SELECT COUNT(*) n FROM usuarios").first();
      if (n && n.n > 0)
        return err("Ya hay un administrador. Inici\xE1 sesi\xF3n.", 403);
      return await crearUsuario(db, body, "setup");
    }
    if (m === "POST" && ruta === "/login") {
      const email = txt(body.email, 120).toLowerCase();
      const u = await db.prepare("SELECT * FROM usuarios WHERE email=?").bind(email).first();
      if (!u || !igual(await pbkdf2(String(body.password || ""), u.salt), u.hash)) {
        await new Promise((r) => setTimeout(r, 600));
        return err("Email o contrase\xF1a incorrectos", 401);
      }
      const token = rnd(32), exp = new Date(Date.now() + 30 * 864e5).toISOString();
      await db.batch([db.prepare("INSERT INTO sesiones (token,email,exp) VALUES (?,?,?)").bind(token, email, exp), db.prepare("DELETE FROM sesiones WHERE exp<?").bind(ahora())]);
      return json({ token, nombre: u.nombre, email });
    }
    const yo = await usuarioDe(req, db);
    if (ruta === "/logout" && m === "POST") {
      const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
      await db.prepare("DELETE FROM sesiones WHERE token=?").bind(t).run();
      return json({ ok: true });
    }
    if (!ruta.startsWith("/admin/"))
      return err("No encontrado", 404);
    if (!yo)
      return err("Sesi\xF3n vencida. Volv\xE9 a iniciar sesi\xF3n.", 401);
    if (m === "GET" && ruta === "/admin/todo") {
      const [u, v, c, e, d, q, b, h, us] = await db.batch([
        db.prepare("SELECT * FROM unidades ORDER BY grupo,orden"),
        db.prepare("SELECT * FROM ventas WHERE activo=1 ORDER BY unidad_id"),
        db.prepare("SELECT c.* FROM cuotas c JOIN ventas v ON v.id=c.venta_id AND v.activo=1 ORDER BY c.fecha,c.n"),
        db.prepare("SELECT unidad, tipo, COUNT(*) n, MAX(ts) ultimo FROM eventos WHERE ts > datetime('now','-90 days') GROUP BY unidad,tipo"),
        db.prepare("SELECT substr(ts,1,10) dia, tipo, COUNT(*) n FROM eventos WHERE ts > datetime('now','-30 days') GROUP BY dia,tipo"),
        db.prepare("SELECT * FROM consultas ORDER BY id DESC LIMIT 1000"),
        db.prepare("SELECT i.*, (SELECT COUNT(*) FROM eventos e WHERE e.origen=i.slug AND e.tipo='vista') vistas, (SELECT COUNT(*) FROM consultas q WHERE q.origen=i.slug) consultas FROM inmobiliarias i ORDER BY creado"),
        db.prepare("SELECT * FROM historial ORDER BY id DESC LIMIT 300"),
        db.prepare("SELECT email, nombre, creado FROM usuarios ORDER BY creado")
      ]);
      return json({ yo, unidades: u.results, ventas: v.results, cuotas: c.results, eventos: e.results, porDia: d.results, consultas: q.results, inmobiliarias: b.results, historial: h.results, usuarios: us.results });
    }
    if (m === "POST" && ruta === "/admin/importar") {
      const L = Array.isArray(body.unidades) ? body.unidades : [];
      if (!L.length || L.length > 3e3)
        return err("Lista de unidades vac\xEDa o demasiado grande");
      const n = await db.prepare("SELECT COUNT(*) n FROM unidades").first();
      if (n.n && !body.reemplazar)
        return err("Ya hay unidades cargadas. Confirm\xE1 si quer\xE9s reemplazarlas.", 409);
      const t = ahora(), q = [];
      if (body.reemplazar)
        q.push(db.prepare("DELETE FROM unidades"));
      for (const x of L) {
        const id = txt(x.id, 16);
        if (!ID.test(id))
          return err("Unidad con identificador inv\xE1lido: " + id);
        const est = ESTADOS.includes(x.estado) ? x.estado : "libre", pr = x.precio_lista == null || x.precio_lista === "" ? null : Math.round(Number(x.precio_lista));
        q.push(db.prepare("INSERT INTO unidades (id,grupo,orden,tip,m2,estado,precio_lista,mostrar_precio,updated_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(id, txt(x.grupo, 60), Math.round(Number(x.orden) || 0), txt(x.tip, 30), Number(x.m2) || null, est, pr, x.mostrar_precio === 0 ? 0 : 1, t));
      }
      for (let i = 0; i < q.length; i += 90)
        await db.batch(q.slice(i, i + 90));
      await log(db, yo.email, "importar", { unidades: L.length, reemplazo: !!body.reemplazar });
      return json({ ok: true, n: L.length });
    }
    if (m === "POST" && ruta === "/admin/precios") {
      const L = Array.isArray(body.cambios) ? body.cambios : [];
      if (!L.length || L.length > 3e3)
        return err("No hay precios para actualizar");
      const t = ahora(), q = [];
      for (const x of L) {
        const id = txt(x.id, 16), pr = Math.round(Number(x.precio));
        if (!ID.test(id) || !(pr >= 0))
          return err("Precio inv\xE1lido en la unidad " + id);
        q.push(db.prepare("UPDATE unidades SET precio_lista=?, updated_at=? WHERE id=?").bind(pr, t, id));
      }
      for (let i = 0; i < q.length; i += 90)
        await db.batch(q.slice(i, i + 90));
      await log(db, yo.email, "ajuste masivo de precios", { unidades: L.length, detalle: txt(body.detalle, 200) });
      return json({ ok: true, n: L.length });
    }
    if (m === "PUT" && (mm = ruta.match(/^\/admin\/unidad\/([\w.-]{1,16})$/))) {
      const id = mm[1], u = await db.prepare("SELECT * FROM unidades WHERE id=?").bind(id).first();
      if (!u)
        return err("Unidad inexistente", 404);
      const est = body.estado !== void 0 ? String(body.estado) : u.estado;
      if (!ESTADOS.includes(est))
        return err("Estado inv\xE1lido");
      const precio = body.precio_lista !== void 0 ? body.precio_lista === null || body.precio_lista === "" ? null : Math.round(Number(body.precio_lista)) : u.precio_lista;
      if (precio !== null && !(precio >= 0))
        return err("Precio inv\xE1lido");
      const mp = body.mostrar_precio !== void 0 ? body.mostrar_precio ? 1 : 0 : u.mostrar_precio;
      await db.prepare("UPDATE unidades SET estado=?, precio_lista=?, mostrar_precio=?, updated_at=? WHERE id=?").bind(est, precio, mp, ahora(), id).run();
      if (est === "libre" && u.estado !== "libre")
        await db.prepare("UPDATE ventas SET activo=0, updated_at=? WHERE unidad_id=? AND activo=1").bind(ahora(), id).run();
      await log(db, yo.email, "unidad", { id, de: { estado: u.estado, precio: u.precio_lista }, a: { estado: est, precio }, nota: txt(body.nota, 200) });
      return json({ ok: true });
    }
    if (m === "POST" && ruta === "/admin/venta") {
      const id = txt(body.unidad_id, 16), u = await db.prepare("SELECT * FROM unidades WHERE id=?").bind(id).first();
      if (!u)
        return err("Unidad inexistente", 404);
      const est = String(body.estado || "");
      if (!["reservado", "senado", "vendido"].includes(est))
        return err("Estado de venta inv\xE1lido");
      if (!txt(body.cliente, 80))
        return err("Falta el nombre del cliente");
      const precio = Math.round(Number(body.precio_cerrado));
      if (!(precio > 0))
        return err("Falta el precio cerrado");
      const cuotas = Array.isArray(body.cuotas) ? body.cuotas : [];
      const suma = cuotas.reduce((a, c) => a + Math.round(Number(c.monto) || 0), 0);
      if (cuotas.length && Math.abs(suma - precio) > 1)
        return err(`El plan de pago suma ${suma.toLocaleString("es-PY")} y el precio es ${precio.toLocaleString("es-PY")}`);
      const t = ahora();
      await db.prepare("UPDATE ventas SET activo=0, updated_at=? WHERE unidad_id=? AND activo=1").bind(t, id).run();
      const r = await db.prepare("INSERT INTO ventas (unidad_id,estado,cliente,documento,telefono,email,fecha,precio_cerrado,vendedor,notas,activo,created_at,updated_at,creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)").bind(id, est, txt(body.cliente, 80), txt(body.documento, 30), txt(body.telefono, 30), txt(body.email, 80), txt(body.fecha, 10) || t.slice(0, 10), precio, txt(body.vendedor, 60), txt(body.notas, 500), t, t, yo.email).run();
      const vid = r.meta.last_row_id;
      if (cuotas.length)
        await db.batch(cuotas.map((c, i) => db.prepare("INSERT INTO cuotas (venta_id,n,concepto,fecha,monto,pagado,fecha_pago,monto_pagado) VALUES (?,?,?,?,?,?,?,?)").bind(vid, i + 1, txt(c.concepto, 40) || "Cuota", txt(c.fecha, 10), Math.round(Number(c.monto) || 0), c.pagado ? 1 : 0, c.fecha_pago || null, c.pagado ? Math.round(Number(c.monto_pagado ?? c.monto) || 0) : 0)));
      await db.prepare("UPDATE unidades SET estado=?, updated_at=? WHERE id=?").bind(est, t, id).run();
      await log(db, yo.email, "venta", { unidad: id, estado: est, cliente: txt(body.cliente, 80), precio, cuotas: cuotas.length });
      return json({ ok: true, id: vid });
    }
    if (m === "POST" && (mm = ruta.match(/^\/admin\/venta\/(\d+)\/anular$/))) {
      const v = await db.prepare("SELECT * FROM ventas WHERE id=? AND activo=1").bind(mm[1]).first();
      if (!v)
        return err("Venta inexistente", 404);
      await db.batch([db.prepare("UPDATE ventas SET activo=0, updated_at=? WHERE id=?").bind(ahora(), v.id), db.prepare("UPDATE unidades SET estado='libre', updated_at=? WHERE id=?").bind(ahora(), v.unidad_id)]);
      await log(db, yo.email, "anular", { unidad: v.unidad_id, cliente: v.cliente, motivo: txt(body.motivo, 200) });
      return json({ ok: true });
    }
    if (m === "PUT" && (mm = ruta.match(/^\/admin\/cuota\/(\d+)$/))) {
      const c = await db.prepare("SELECT * FROM cuotas WHERE id=?").bind(mm[1]).first();
      if (!c)
        return err("Cuota inexistente", 404);
      const pag = body.pagado ? 1 : 0, mp = pag ? Math.round(Number(body.monto_pagado ?? c.monto) || 0) : 0;
      await db.prepare("UPDATE cuotas SET pagado=?, fecha_pago=?, monto_pagado=? WHERE id=?").bind(pag, pag ? txt(body.fecha_pago, 10) || ahora().slice(0, 10) : null, mp, c.id).run();
      await log(db, yo.email, "cobro", { cuota: c.id, venta: c.venta_id, n: c.n, pagado: pag, monto: mp });
      return json({ ok: true });
    }
    if (m === "PUT" && (mm = ruta.match(/^\/admin\/consulta\/(\d+)$/))) {
      const c = await db.prepare("SELECT * FROM consultas WHERE id=?").bind(mm[1]).first();
      if (!c)
        return err("Consulta inexistente", 404);
      const est = body.estado !== void 0 ? String(body.estado) : c.estado;
      if (!EST_CONSULTA.includes(est))
        return err("Estado inv\xE1lido");
      await db.prepare("UPDATE consultas SET estado=?, notas=?, updated_at=? WHERE id=?").bind(est, body.notas !== void 0 ? txt(body.notas, 1e3) : c.notas, ahora(), c.id).run();
      if (est !== c.estado)
        await log(db, yo.email, "consulta", { id: c.id, nombre: c.nombre, de: c.estado, a: est });
      return json({ ok: true });
    }
    if (m === "POST" && ruta === "/admin/inmobiliaria") {
      const nombre = txt(body.nombre, 60);
      if (!nombre)
        return err("Falta el nombre de la inmobiliaria");
      let slug = slugify(nombre) || "inmo";
      const ex = await db.prepare("SELECT COUNT(*) n FROM inmobiliarias WHERE slug LIKE ?").bind(slug + "%").first();
      if (ex.n)
        slug += "-" + (ex.n + 1);
      await db.prepare("INSERT INTO inmobiliarias (slug,nombre,whatsapp,activo,creado) VALUES (?,?,?,1,?)").bind(slug, nombre, txt(body.whatsapp, 20).replace(/\D/g, ""), ahora()).run();
      await log(db, yo.email, "inmobiliaria", { slug, nombre });
      return json({ ok: true, slug });
    }
    if (m === "PUT" && (mm = ruta.match(/^\/admin\/inmobiliaria\/([a-z0-9-]{1,40})$/))) {
      const b = await db.prepare("SELECT * FROM inmobiliarias WHERE slug=?").bind(mm[1]).first();
      if (!b)
        return err("Inmobiliaria inexistente", 404);
      await db.prepare("UPDATE inmobiliarias SET nombre=?, whatsapp=?, activo=? WHERE slug=?").bind(body.nombre !== void 0 ? txt(body.nombre, 60) : b.nombre, body.whatsapp !== void 0 ? txt(body.whatsapp, 20).replace(/\D/g, "") : b.whatsapp, body.activo !== void 0 ? body.activo ? 1 : 0 : b.activo, b.slug).run();
      await log(db, yo.email, "inmobiliaria", { slug: b.slug, cambio: body });
      return json({ ok: true });
    }
    if (m === "POST" && ruta === "/admin/usuario")
      return await crearUsuario(db, body, yo.email);
    if (m === "PUT" && ruta === "/admin/password") {
      const u = await db.prepare("SELECT * FROM usuarios WHERE email=?").bind(yo.email).first();
      if (!igual(await pbkdf2(String(body.actual || ""), u.salt), u.hash))
        return err("La contrase\xF1a actual no coincide", 401);
      if (String(body.nueva || "").length < 10)
        return err("La nueva contrase\xF1a debe tener al menos 10 caracteres");
      const salt = rnd(16);
      await db.prepare("UPDATE usuarios SET salt=?, hash=? WHERE email=?").bind(salt, await pbkdf2(String(body.nueva), salt), yo.email).run();
      await log(db, yo.email, "password", "cambio de contrase\xF1a");
      return json({ ok: true });
    }
    return err("No encontrado", 404);
  } catch (e) {
    return err("Error del servidor: " + (e && e.message || e), 500);
  }
}
__name(onRequest, "onRequest");
async function crearUsuario(db, body, quien) {
  const email = txt(body.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return err("Email inv\xE1lido");
  if (String(body.password || "").length < 10)
    return err("La contrase\xF1a debe tener al menos 10 caracteres");
  if (await db.prepare("SELECT 1 FROM usuarios WHERE email=?").bind(email).first())
    return err("Ese email ya existe");
  const salt = rnd(16);
  await db.prepare("INSERT INTO usuarios (email,nombre,salt,hash,creado) VALUES (?,?,?,?,?)").bind(email, txt(body.nombre, 60), salt, await pbkdf2(String(body.password), salt), ahora()).run();
  await log(db, quien, "usuario", { email });
  return json({ ok: true });
}
__name(crearUsuario, "crearUsuario");

// ../.wrangler/tmp/pages-TnJu7z/functionsRoutes-0.3530141170026704.mjs
var routes = [
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];

// ../../../../../../tmp/wr/node_modules/path-to-regexp/dist.es2015/index.js
function lexer(str) {
  var tokens = [];
  var i = 0;
  while (i < str.length) {
    var char = str[i];
    if (char === "*" || char === "+" || char === "?") {
      tokens.push({ type: "MODIFIER", index: i, value: str[i++] });
      continue;
    }
    if (char === "\\") {
      tokens.push({ type: "ESCAPED_CHAR", index: i++, value: str[i++] });
      continue;
    }
    if (char === "{") {
      tokens.push({ type: "OPEN", index: i, value: str[i++] });
      continue;
    }
    if (char === "}") {
      tokens.push({ type: "CLOSE", index: i, value: str[i++] });
      continue;
    }
    if (char === ":") {
      var name = "";
      var j = i + 1;
      while (j < str.length) {
        var code = str.charCodeAt(j);
        if (
          // `0-9`
          code >= 48 && code <= 57 || // `A-Z`
          code >= 65 && code <= 90 || // `a-z`
          code >= 97 && code <= 122 || // `_`
          code === 95
        ) {
          name += str[j++];
          continue;
        }
        break;
      }
      if (!name)
        throw new TypeError("Missing parameter name at ".concat(i));
      tokens.push({ type: "NAME", index: i, value: name });
      i = j;
      continue;
    }
    if (char === "(") {
      var count = 1;
      var pattern = "";
      var j = i + 1;
      if (str[j] === "?") {
        throw new TypeError('Pattern cannot start with "?" at '.concat(j));
      }
      while (j < str.length) {
        if (str[j] === "\\") {
          pattern += str[j++] + str[j++];
          continue;
        }
        if (str[j] === ")") {
          count--;
          if (count === 0) {
            j++;
            break;
          }
        } else if (str[j] === "(") {
          count++;
          if (str[j + 1] !== "?") {
            throw new TypeError("Capturing groups are not allowed at ".concat(j));
          }
        }
        pattern += str[j++];
      }
      if (count)
        throw new TypeError("Unbalanced pattern at ".concat(i));
      if (!pattern)
        throw new TypeError("Missing pattern at ".concat(i));
      tokens.push({ type: "PATTERN", index: i, value: pattern });
      i = j;
      continue;
    }
    tokens.push({ type: "CHAR", index: i, value: str[i++] });
  }
  tokens.push({ type: "END", index: i, value: "" });
  return tokens;
}
__name(lexer, "lexer");
function parse(str, options) {
  if (options === void 0) {
    options = {};
  }
  var tokens = lexer(str);
  var _a = options.prefixes, prefixes = _a === void 0 ? "./" : _a, _b = options.delimiter, delimiter = _b === void 0 ? "/#?" : _b;
  var result = [];
  var key = 0;
  var i = 0;
  var path = "";
  var tryConsume = /* @__PURE__ */ __name(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name(function(prefix2) {
    var prev = result[result.length - 1];
    var prevText = prefix2 || (prev && typeof prev === "string" ? prev : "");
    if (prev && !prevText) {
      throw new TypeError('Must have text between two parameters, missing text after "'.concat(prev.name, '"'));
    }
    if (!prevText || isSafe(prevText))
      return "[^".concat(escapeString(delimiter), "]+?");
    return "(?:(?!".concat(escapeString(prevText), ")[^").concat(escapeString(delimiter), "])+?");
  }, "safePattern");
  while (i < tokens.length) {
    var char = tryConsume("CHAR");
    var name = tryConsume("NAME");
    var pattern = tryConsume("PATTERN");
    if (name || pattern) {
      var prefix = char || "";
      if (prefixes.indexOf(prefix) === -1) {
        path += prefix;
        prefix = "";
      }
      if (path) {
        result.push(path);
        path = "";
      }
      result.push({
        name: name || key++,
        prefix,
        suffix: "",
        pattern: pattern || safePattern(prefix),
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    var value = char || tryConsume("ESCAPED_CHAR");
    if (value) {
      path += value;
      continue;
    }
    if (path) {
      result.push(path);
      path = "";
    }
    var open = tryConsume("OPEN");
    if (open) {
      var prefix = consumeText();
      var name_1 = tryConsume("NAME") || "";
      var pattern_1 = tryConsume("PATTERN") || "";
      var suffix = consumeText();
      mustConsume("CLOSE");
      result.push({
        name: name_1 || (pattern_1 ? key++ : ""),
        pattern: name_1 && !pattern_1 ? safePattern(prefix) : pattern_1,
        prefix,
        suffix,
        modifier: tryConsume("MODIFIER") || ""
      });
      continue;
    }
    mustConsume("END");
  }
  return result;
}
__name(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
function regexpToFunction(re, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.decode, decode = _a === void 0 ? function(x) {
    return x;
  } : _a;
  return function(pathname) {
    var m = re.exec(pathname);
    if (!m)
      return false;
    var path = m[0], index = m.index;
    var params = /* @__PURE__ */ Object.create(null);
    var _loop_1 = /* @__PURE__ */ __name(function(i2) {
      if (m[i2] === void 0)
        return "continue";
      var key = keys[i2 - 1];
      if (key.modifier === "*" || key.modifier === "+") {
        params[key.name] = m[i2].split(key.prefix + key.suffix).map(function(value) {
          return decode(value, key);
        });
      } else {
        params[key.name] = decode(m[i2], key);
      }
    }, "_loop_1");
    for (var i = 1; i < m.length; i++) {
      _loop_1(i);
    }
    return { path, index, params };
  };
}
__name(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
function regexpToRegexp(path, keys) {
  if (!keys)
    return path;
  var groupsRegex = /\((?:\?<(.*?)>)?(?!\?)/g;
  var index = 0;
  var execResult = groupsRegex.exec(path.source);
  while (execResult) {
    keys.push({
      // Use parenthesized substring match if available, index otherwise
      name: execResult[1] || index++,
      prefix: "",
      suffix: "",
      modifier: "",
      pattern: ""
    });
    execResult = groupsRegex.exec(path.source);
  }
  return path;
}
__name(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
function tokensToRegexp(tokens, keys, options) {
  if (options === void 0) {
    options = {};
  }
  var _a = options.strict, strict = _a === void 0 ? false : _a, _b = options.start, start = _b === void 0 ? true : _b, _c = options.end, end = _c === void 0 ? true : _c, _d = options.encode, encode = _d === void 0 ? function(x) {
    return x;
  } : _d, _e = options.delimiter, delimiter = _e === void 0 ? "/#?" : _e, _f = options.endsWith, endsWith = _f === void 0 ? "" : _f;
  var endsWithRe = "[".concat(escapeString(endsWith), "]|$");
  var delimiterRe = "[".concat(escapeString(delimiter), "]");
  var route = start ? "^" : "";
  for (var _i = 0, tokens_1 = tokens; _i < tokens_1.length; _i++) {
    var token = tokens_1[_i];
    if (typeof token === "string") {
      route += escapeString(encode(token));
    } else {
      var prefix = escapeString(encode(token.prefix));
      var suffix = escapeString(encode(token.suffix));
      if (token.pattern) {
        if (keys)
          keys.push(token);
        if (prefix || suffix) {
          if (token.modifier === "+" || token.modifier === "*") {
            var mod = token.modifier === "*" ? "?" : "";
            route += "(?:".concat(prefix, "((?:").concat(token.pattern, ")(?:").concat(suffix).concat(prefix, "(?:").concat(token.pattern, "))*)").concat(suffix, ")").concat(mod);
          } else {
            route += "(?:".concat(prefix, "(").concat(token.pattern, ")").concat(suffix, ")").concat(token.modifier);
          }
        } else {
          if (token.modifier === "+" || token.modifier === "*") {
            throw new TypeError('Can not repeat "'.concat(token.name, '" without a prefix and suffix'));
          }
          route += "(".concat(token.pattern, ")").concat(token.modifier);
        }
      } else {
        route += "(?:".concat(prefix).concat(suffix, ")").concat(token.modifier);
      }
    }
  }
  if (end) {
    if (!strict)
      route += "".concat(delimiterRe, "?");
    route += !options.endsWith ? "$" : "(?=".concat(endsWithRe, ")");
  } else {
    var endToken = tokens[tokens.length - 1];
    var isEndDelimited = typeof endToken === "string" ? delimiterRe.indexOf(endToken[endToken.length - 1]) > -1 : endToken === void 0;
    if (!strict) {
      route += "(?:".concat(delimiterRe, "(?=").concat(endsWithRe, "))?");
    }
    if (!isEndDelimited) {
      route += "(?=".concat(delimiterRe, "|").concat(endsWithRe, ")");
    }
  }
  return new RegExp(route, flags(options));
}
__name(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");

// ../../../../../../tmp/wr/node_modules/wrangler/templates/pages-template-worker.ts
var escapeRegex = /[.+?^${}()|[\]\\]/g;
function* executeRequest(request) {
  const requestPath = new URL(request.url).pathname;
  for (const route of [...routes].reverse()) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult) {
      for (const handler of route.middlewares.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: mountMatchResult.path
        };
      }
    }
  }
  for (const route of routes) {
    if (route.method && route.method !== request.method) {
      continue;
    }
    const routeMatcher = match(route.routePath.replace(escapeRegex, "\\$&"), {
      end: true
    });
    const mountMatcher = match(route.mountPath.replace(escapeRegex, "\\$&"), {
      end: false
    });
    const matchResult = routeMatcher(requestPath);
    const mountMatchResult = mountMatcher(requestPath);
    if (matchResult && mountMatchResult && route.modules.length) {
      for (const handler of route.modules.flat()) {
        yield {
          handler,
          params: matchResult.params,
          path: matchResult.path
        };
      }
      break;
    }
  }
}
__name(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name(async (input, init) => {
      if (input !== void 0) {
        let url = input;
        if (typeof input === "string") {
          url = new URL(input, request.url).toString();
        }
        request = new Request(url, init);
      }
      const result = handlerIterator.next();
      if (result.done === false) {
        const { handler, params, path } = result.value;
        const context = {
          request: new Request(request.clone()),
          functionPath: path,
          next,
          params,
          get data() {
            return data;
          },
          set data(value) {
            if (typeof value !== "object" || value === null) {
              throw new Error("context.data must be an object");
            }
            data = value;
          },
          env,
          waitUntil: workerContext.waitUntil.bind(workerContext),
          passThroughOnException: () => {
            isFailOpen = true;
          }
        };
        const response = await handler(context);
        if (!(response instanceof Response)) {
          throw new Error("Your Pages function should return a Response");
        }
        return cloneResponse(response);
      } else if ("ASSETS") {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      } else {
        const response = await fetch(request);
        return cloneResponse(response);
      }
    }, "next");
    try {
      return await next();
    } catch (error) {
      if (isFailOpen) {
        const response = await env["ASSETS"].fetch(request);
        return cloneResponse(response);
      }
      throw error;
    }
  }
};
var cloneResponse = /* @__PURE__ */ __name((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");

// ../../../../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../../../../../../tmp/wr/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// ../.wrangler/tmp/bundle-g0JRyw/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;

// ../../../../../../tmp/wr/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// ../.wrangler/tmp/bundle-g0JRyw/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = (request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    };
    #dispatcher = (type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=functionsWorker-0.027972479445196985.mjs.map
