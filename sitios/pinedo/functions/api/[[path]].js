import INICIALES from '../_datos/iniciales.js';   // unidades iniciales del panel (no públicas)
// ============================================================================
// KTA · API del panel del showroom · Cloudflare Pages Functions + D1 (binding: DB)
// Una base de datos por proyecto: cada desarrolladora ve solo lo suyo.
// Basado en el panel de Vidalta, generalizado (edificios y barrios) + consultas e inmobiliarias.
//
// Público
//   GET  /api/public                   unidades (sin datos de clientes)
//   POST /api/evento                   {tipo:'vista'|'consulta', unidad, origen}
//   POST /api/consulta                 {nombre, telefono, email?, unidad?, intencion?, origen?}
//   GET  /api/inmobiliaria/:slug       {nombre, whatsapp}  (links propios de cada inmobiliaria)
// Acceso
//   GET  /api/estado                   {necesitaSetup, unidades}
//   POST /api/setup                    {email,nombre,password}  (solo si no hay usuarios)
//   POST /api/login | /api/logout
// Admin (Bearer token)
//   GET  /api/admin/todo
//   POST /api/admin/importar           {unidades:[{id,grupo,orden,tip,m2,estado,precio_lista}], reemplazar?}
//   POST /api/admin/precios            {cambios:[{id,precio}], detalle}  ajuste masivo
//   PUT  /api/admin/unidad/:id         {estado?, precio_lista?, precio_contado?, mostrar_precio?, nota?}
//   POST /api/admin/venta              {unidad_id, estado, cliente, precio_cerrado, cuotas:[...]}
//   POST /api/admin/venta/:id/anular
//   PUT  /api/admin/cuota/:id          {pagado, fecha_pago, monto_pagado}
//   PUT  /api/admin/consulta/:id       {estado?, notas?}
//   POST /api/admin/inmobiliaria       {nombre, whatsapp}
//   PUT  /api/admin/inmobiliaria/:slug {activo?, nombre?, whatsapp?}
//   POST /api/admin/usuario            {email,nombre,password}
//   PUT  /api/admin/password           {actual, nueva}
// ============================================================================

const ESTADOS = ['libre', 'reservado', 'senado', 'vendido', 'bloqueado'];
const EST_CONSULTA = ['nueva', 'contactado', 'visita', 'reserva', 'cerrada', 'descartada'];
const SCHEMA = `CREATE TABLE IF NOT EXISTS unidades (id TEXT PRIMARY KEY, grupo TEXT, orden INTEGER, tip TEXT, m2 REAL, estado TEXT DEFAULT 'libre', precio_lista INTEGER, mostrar_precio INTEGER DEFAULT 1, updated_at TEXT);
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
let LISTO = false;   // el esquema se crea solo la primera vez (no hace falta consola)

const json = (d, s = 200, extra = {}) => new Response(JSON.stringify(d), { status: s, headers: Object.assign({ 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, extra) });
const err = (m, s = 400) => json({ error: m }, s);
const ahora = () => new Date().toISOString();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const rnd = n => hex(crypto.getRandomValues(new Uint8Array(n)));
const txt = (v, n) => String(v ?? '').trim().slice(0, n);
const ID = /^[\w.-]{1,16}$/;
const slugify = s => txt(s, 40).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map(h => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}
function igual(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
async function usuarioDe(req, db) {
  const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!t) return null;
  return await db.prepare('SELECT s.email, u.nombre FROM sesiones s JOIN usuarios u ON u.email=s.email WHERE s.token=? AND s.exp>?').bind(t, ahora()).first() || null;
}
const log = (db, email, accion, detalle) => db.prepare('INSERT INTO historial (ts,email,accion,detalle) VALUES (?,?,?,?)').bind(ahora(), email, accion, typeof detalle === 'string' ? detalle : JSON.stringify(detalle)).run();
// Torres que todavía no muestran precios ni disponibilidad en el sitio (el panel las maneja igual). Para habilitarlas, sacarlas de acá.
const PROXIMAS = /^[TC][2-6]-/;
const publico = e => (e === 'senado' ? 'reservado' : e === 'bloqueado' ? 'vendido' : e);

export async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.DB;
  if (!db) return err('Falta la base de datos (binding DB)', 500);
  if (!LISTO) { await db.batch(SCHEMA.split(';').map(q => q.trim()).filter(Boolean).map(q => db.prepare(q)));
    try { await db.prepare('ALTER TABLE unidades ADD COLUMN precio_contado INTEGER').run(); } catch (e) { /* ya existe */ }
    LISTO = true; }
  const ruta = '/' + [].concat(params.path || []).join('/');
  const m = req.method;
  let body = {};
  if (m === 'POST' || m === 'PUT') { try { body = await req.json(); } catch (e) { body = {}; } }
  let mm;

  try {
    // ---------- PÚBLICO ----------
    if (m === 'GET' && ruta === '/public') {
      const { results } = await db.prepare('SELECT id,grupo,orden,tip,m2,estado,precio_lista,precio_contado,mostrar_precio,updated_at FROM unidades ORDER BY grupo,orden').all();
      const unidades = results.filter(u => !PROXIMAS.test(u.id)).map(u => { const ver = u.estado === 'libre' && u.mostrar_precio; return { id: u.id, tip: u.tip, m2: u.m2, estado: publico(u.estado), precio: ver ? u.precio_lista : null, contado: ver ? u.precio_contado ?? null : null, oculto: !u.mostrar_precio }; });
      const act = results.reduce((a, u) => (u.updated_at > a ? u.updated_at : a), '');
      return json({ unidades, actualizado: act }, 200, { 'cache-control': 'public, max-age=15' });
    }
    if (m === 'POST' && ruta === '/evento') {
      const tipo = body.tipo === 'consulta' ? 'consulta' : 'vista', u = txt(body.unidad, 16);
      if (!ID.test(u)) return err('unidad inválida');
      await db.prepare('INSERT INTO eventos (ts,tipo,unidad,origen) VALUES (?,?,?,?)').bind(ahora(), tipo, u, txt(body.origen, 40)).run();
      return json({ ok: true });
    }
    if (m === 'POST' && ruta === '/consulta') {
      const nombre = txt(body.nombre, 80), tel = txt(body.telefono, 30).replace(/[^\d+ ]/g, '');
      if (!nombre || tel.replace(/\D/g, '').length < 6) return err('Faltan nombre y teléfono');
      if (body.web) return json({ ok: true });                                  // campo trampa anti-bots
      const rec = await db.prepare("SELECT COUNT(*) n FROM consultas WHERE telefono=? AND ts > datetime('now','-1 hour')").bind(tel).first();
      if (rec && rec.n >= 5) return err('Ya recibimos tus consultas, te contactamos en breve.', 429);
      const u = txt(body.unidad, 16), t = ahora();
      await db.batch([
        db.prepare('INSERT INTO consultas (ts,nombre,telefono,email,unidad,intencion,origen,estado,notas,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(t, nombre, tel, txt(body.email, 80), ID.test(u) ? u : '', txt(body.intencion, 60), txt(body.origen, 40), 'nueva', '', t),
        ...(ID.test(u) ? [db.prepare('INSERT INTO eventos (ts,tipo,unidad,origen) VALUES (?,?,?,?)').bind(t, 'consulta', u, txt(body.origen, 40))] : [])]);
      return json({ ok: true });
    }
    if (m === 'GET' && (mm = ruta.match(/^\/inmobiliaria\/([a-z0-9-]{1,40})$/))) {
      const b = await db.prepare('SELECT nombre, whatsapp FROM inmobiliarias WHERE slug=? AND activo=1').bind(mm[1]).first();
      return b ? json(b, 200, { 'cache-control': 'public, max-age=300' }) : err('No encontrada', 404);
    }

    // ---------- ACCESO ----------
    if (m === 'GET' && ruta === '/estado') {
      const [n, u] = await db.batch([db.prepare('SELECT COUNT(*) n FROM usuarios'), db.prepare('SELECT COUNT(*) n FROM unidades')]);
      return json({ necesitaSetup: !n.results[0].n, unidades: u.results[0].n });
    }
    if (m === 'POST' && ruta === '/setup') {
      const n = await db.prepare('SELECT COUNT(*) n FROM usuarios').first();
      if (n && n.n > 0) return err('Ya hay un administrador. Iniciá sesión.', 403);
      return await crearUsuario(db, body, 'setup');
    }
    if (m === 'POST' && ruta === '/login') {
      const email = txt(body.email, 120).toLowerCase();
      const u = await db.prepare('SELECT * FROM usuarios WHERE email=?').bind(email).first();
      if (!u || !igual(await pbkdf2(String(body.password || ''), u.salt), u.hash)) { await new Promise(r => setTimeout(r, 600)); return err('Email o contraseña incorrectos', 401); }
      const token = rnd(32), exp = new Date(Date.now() + 30 * 864e5).toISOString();
      await db.batch([db.prepare('INSERT INTO sesiones (token,email,exp) VALUES (?,?,?)').bind(token, email, exp), db.prepare('DELETE FROM sesiones WHERE exp<?').bind(ahora())]);
      return json({ token, nombre: u.nombre, email });
    }

    // ---------- ADMIN ----------
    const yo = await usuarioDe(req, db);
    if (ruta === '/logout' && m === 'POST') { const t = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); await db.prepare('DELETE FROM sesiones WHERE token=?').bind(t).run(); return json({ ok: true }); }
    if (!ruta.startsWith('/admin/')) return err('No encontrado', 404);
    if (!yo) return err('Sesión vencida. Volvé a iniciar sesión.', 401);

    if (m === 'GET' && ruta === '/admin/todo') {
      const [u, v, c, e, d, q, b, h, us] = await db.batch([
        db.prepare('SELECT * FROM unidades ORDER BY grupo,orden'),
        db.prepare('SELECT * FROM ventas WHERE activo=1 ORDER BY unidad_id'),
        db.prepare('SELECT c.* FROM cuotas c JOIN ventas v ON v.id=c.venta_id AND v.activo=1 ORDER BY c.fecha,c.n'),
        db.prepare("SELECT unidad, tipo, COUNT(*) n, MAX(ts) ultimo FROM eventos WHERE ts > datetime('now','-90 days') GROUP BY unidad,tipo"),
        db.prepare("SELECT substr(ts,1,10) dia, tipo, COUNT(*) n FROM eventos WHERE ts > datetime('now','-30 days') GROUP BY dia,tipo"),
        db.prepare('SELECT * FROM consultas ORDER BY id DESC LIMIT 1000'),
        db.prepare("SELECT i.*, (SELECT COUNT(*) FROM eventos e WHERE e.origen=i.slug AND e.tipo='vista') vistas, (SELECT COUNT(*) FROM consultas q WHERE q.origen=i.slug) consultas FROM inmobiliarias i ORDER BY creado"),
        db.prepare('SELECT * FROM historial ORDER BY id DESC LIMIT 300'),
        db.prepare('SELECT email, nombre, creado FROM usuarios ORDER BY creado')]);
      return json({ yo, unidades: u.results, ventas: v.results, cuotas: c.results, eventos: e.results, porDia: d.results, consultas: q.results, inmobiliarias: b.results, historial: h.results, usuarios: us.results });
    }

    if (m === 'GET' && ruta === '/admin/iniciales') return json(INICIALES);
    if (m === 'POST' && ruta === '/admin/importar') {
      const L = Array.isArray(body.unidades) ? body.unidades : [];
      if (!L.length || L.length > 3000) return err('Lista de unidades vacía o demasiado grande');
      const n = await db.prepare('SELECT COUNT(*) n FROM unidades').first();
      if (n.n && !body.reemplazar && !body.actualizar) return err('Ya hay unidades cargadas. Confirmá si querés reemplazarlas.', 409);
      const t = ahora(), q = [];
      if (body.reemplazar) q.push(db.prepare('DELETE FROM unidades'));
      for (const x of L) {
        const id = txt(x.id, 16); if (!ID.test(id)) return err('Unidad con identificador inválido: ' + id);
        const est = ESTADOS.includes(x.estado) ? x.estado : 'libre', pr = x.precio_lista == null || x.precio_lista === '' ? null : Math.round(Number(x.precio_lista));
        const pc = x.precio_contado == null || x.precio_contado === '' ? null : Math.round(Number(x.precio_contado));
        q.push(db.prepare('INSERT INTO unidades (id,grupo,orden,tip,m2,estado,precio_lista,precio_contado,mostrar_precio,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)' + (body.actualizar ? ' ON CONFLICT(id) DO UPDATE SET grupo=excluded.grupo, orden=excluded.orden, tip=excluded.tip, m2=excluded.m2, estado=excluded.estado, precio_lista=excluded.precio_lista, precio_contado=excluded.precio_contado, updated_at=excluded.updated_at' : ''))
          .bind(id, txt(x.grupo, 60), Math.round(Number(x.orden) || 0), txt(x.tip, 30), Number(x.m2) || null, est, pr, pc, x.mostrar_precio === 0 ? 0 : 1, t));
      }
      for (let i = 0; i < q.length; i += 90) await db.batch(q.slice(i, i + 90));
      await log(db, yo.email, body.actualizar ? 'lista de precios' : 'importar', { unidades: L.length, reemplazo: !!body.reemplazar });
      return json({ ok: true, n: L.length });
    }

    if (m === 'POST' && ruta === '/admin/precios') {
      const L = Array.isArray(body.cambios) ? body.cambios : [];
      if (!L.length || L.length > 3000) return err('No hay precios para actualizar');
      const t = ahora(), q = [];
      for (const x of L) {
        const id = txt(x.id, 16), pr = Math.round(Number(x.precio));
        if (!ID.test(id) || !(pr >= 0)) return err('Precio inválido en la unidad ' + id);
        q.push(db.prepare('UPDATE unidades SET precio_lista=?, updated_at=? WHERE id=?').bind(pr, t, id));
      }
      for (let i = 0; i < q.length; i += 90) await db.batch(q.slice(i, i + 90));
      await log(db, yo.email, 'ajuste masivo de precios', { unidades: L.length, detalle: txt(body.detalle, 200) });
      return json({ ok: true, n: L.length });
    }

    if (m === 'PUT' && (mm = ruta.match(/^\/admin\/unidad\/([\w.-]{1,16})$/))) {
      const id = mm[1], u = await db.prepare('SELECT * FROM unidades WHERE id=?').bind(id).first();
      if (!u) return err('Unidad inexistente', 404);
      const est = body.estado !== undefined ? String(body.estado) : u.estado;
      if (!ESTADOS.includes(est)) return err('Estado inválido');
      const precio = body.precio_lista !== undefined ? (body.precio_lista === null || body.precio_lista === '' ? null : Math.round(Number(body.precio_lista))) : u.precio_lista;
      if (precio !== null && !(precio >= 0)) return err('Precio inválido');
      const mp = body.mostrar_precio !== undefined ? (body.mostrar_precio ? 1 : 0) : u.mostrar_precio;
      const pc = body.precio_contado !== undefined ? (body.precio_contado === null || body.precio_contado === '' ? null : Math.round(Number(body.precio_contado))) : u.precio_contado ?? null;
      if (pc !== null && !(pc >= 0)) return err('Precio contado inválido');
      await db.prepare('UPDATE unidades SET estado=?, precio_lista=?, precio_contado=?, mostrar_precio=?, updated_at=? WHERE id=?').bind(est, precio, pc, mp, ahora(), id).run();
      if (est === 'libre' && u.estado !== 'libre') await db.prepare('UPDATE ventas SET activo=0, updated_at=? WHERE unidad_id=? AND activo=1').bind(ahora(), id).run();
      await log(db, yo.email, 'unidad', { id, de: { estado: u.estado, precio: u.precio_lista }, a: { estado: est, precio }, nota: txt(body.nota, 200) });
      return json({ ok: true });
    }

    if (m === 'POST' && ruta === '/admin/venta') {
      const id = txt(body.unidad_id, 16), u = await db.prepare('SELECT * FROM unidades WHERE id=?').bind(id).first();
      if (!u) return err('Unidad inexistente', 404);
      const est = String(body.estado || '');
      if (!['reservado', 'senado', 'vendido'].includes(est)) return err('Estado de venta inválido');
      if (!txt(body.cliente, 80)) return err('Falta el nombre del cliente');
      const precio = Math.round(Number(body.precio_cerrado));
      if (!(precio > 0)) return err('Falta el precio cerrado');
      const cuotas = Array.isArray(body.cuotas) ? body.cuotas : [];
      const suma = cuotas.reduce((a, c) => a + Math.round(Number(c.monto) || 0), 0);
      if (cuotas.length && Math.abs(suma - precio) > 1) return err(`El plan de pago suma ${suma.toLocaleString('es-PY')} y el precio es ${precio.toLocaleString('es-PY')}`);
      const t = ahora();
      await db.prepare('UPDATE ventas SET activo=0, updated_at=? WHERE unidad_id=? AND activo=1').bind(t, id).run();
      const r = await db.prepare('INSERT INTO ventas (unidad_id,estado,cliente,documento,telefono,email,fecha,precio_cerrado,vendedor,notas,activo,created_at,updated_at,creado_por) VALUES (?,?,?,?,?,?,?,?,?,?,1,?,?,?)')
        .bind(id, est, txt(body.cliente, 80), txt(body.documento, 30), txt(body.telefono, 30), txt(body.email, 80), txt(body.fecha, 10) || t.slice(0, 10), precio, txt(body.vendedor, 60), txt(body.notas, 500), t, t, yo.email).run();
      const vid = r.meta.last_row_id;
      if (cuotas.length) await db.batch(cuotas.map((c, i) => db.prepare('INSERT INTO cuotas (venta_id,n,concepto,fecha,monto,pagado,fecha_pago,monto_pagado) VALUES (?,?,?,?,?,?,?,?)')
        .bind(vid, i + 1, txt(c.concepto, 40) || 'Cuota', txt(c.fecha, 10), Math.round(Number(c.monto) || 0), c.pagado ? 1 : 0, c.fecha_pago || null, c.pagado ? Math.round(Number(c.monto_pagado ?? c.monto) || 0) : 0)));
      await db.prepare('UPDATE unidades SET estado=?, updated_at=? WHERE id=?').bind(est, t, id).run();
      await log(db, yo.email, 'venta', { unidad: id, estado: est, cliente: txt(body.cliente, 80), precio, cuotas: cuotas.length });
      return json({ ok: true, id: vid });
    }
    if (m === 'POST' && (mm = ruta.match(/^\/admin\/venta\/(\d+)\/anular$/))) {
      const v = await db.prepare('SELECT * FROM ventas WHERE id=? AND activo=1').bind(mm[1]).first();
      if (!v) return err('Venta inexistente', 404);
      await db.batch([db.prepare('UPDATE ventas SET activo=0, updated_at=? WHERE id=?').bind(ahora(), v.id), db.prepare("UPDATE unidades SET estado='libre', updated_at=? WHERE id=?").bind(ahora(), v.unidad_id)]);
      await log(db, yo.email, 'anular', { unidad: v.unidad_id, cliente: v.cliente, motivo: txt(body.motivo, 200) });
      return json({ ok: true });
    }
    if (m === 'PUT' && (mm = ruta.match(/^\/admin\/cuota\/(\d+)$/))) {
      const c = await db.prepare('SELECT * FROM cuotas WHERE id=?').bind(mm[1]).first();
      if (!c) return err('Cuota inexistente', 404);
      const pag = body.pagado ? 1 : 0, mp = pag ? Math.round(Number(body.monto_pagado ?? c.monto) || 0) : 0;
      await db.prepare('UPDATE cuotas SET pagado=?, fecha_pago=?, monto_pagado=? WHERE id=?').bind(pag, pag ? (txt(body.fecha_pago, 10) || ahora().slice(0, 10)) : null, mp, c.id).run();
      await log(db, yo.email, 'cobro', { cuota: c.id, venta: c.venta_id, n: c.n, pagado: pag, monto: mp });
      return json({ ok: true });
    }

    if (m === 'PUT' && (mm = ruta.match(/^\/admin\/consulta\/(\d+)$/))) {
      const c = await db.prepare('SELECT * FROM consultas WHERE id=?').bind(mm[1]).first();
      if (!c) return err('Consulta inexistente', 404);
      const est = body.estado !== undefined ? String(body.estado) : c.estado;
      if (!EST_CONSULTA.includes(est)) return err('Estado inválido');
      await db.prepare('UPDATE consultas SET estado=?, notas=?, updated_at=? WHERE id=?').bind(est, body.notas !== undefined ? txt(body.notas, 1000) : c.notas, ahora(), c.id).run();
      if (est !== c.estado) await log(db, yo.email, 'consulta', { id: c.id, nombre: c.nombre, de: c.estado, a: est });
      return json({ ok: true });
    }

    if (m === 'POST' && ruta === '/admin/inmobiliaria') {
      const nombre = txt(body.nombre, 60); if (!nombre) return err('Falta el nombre de la inmobiliaria');
      let slug = slugify(nombre) || 'inmo'; const ex = await db.prepare('SELECT COUNT(*) n FROM inmobiliarias WHERE slug LIKE ?').bind(slug + '%').first();
      if (ex.n) slug += '-' + (ex.n + 1);
      await db.prepare('INSERT INTO inmobiliarias (slug,nombre,whatsapp,activo,creado) VALUES (?,?,?,1,?)').bind(slug, nombre, txt(body.whatsapp, 20).replace(/\D/g, ''), ahora()).run();
      await log(db, yo.email, 'inmobiliaria', { slug, nombre });
      return json({ ok: true, slug });
    }
    if (m === 'PUT' && (mm = ruta.match(/^\/admin\/inmobiliaria\/([a-z0-9-]{1,40})$/))) {
      const b = await db.prepare('SELECT * FROM inmobiliarias WHERE slug=?').bind(mm[1]).first();
      if (!b) return err('Inmobiliaria inexistente', 404);
      await db.prepare('UPDATE inmobiliarias SET nombre=?, whatsapp=?, activo=? WHERE slug=?').bind(body.nombre !== undefined ? txt(body.nombre, 60) : b.nombre, body.whatsapp !== undefined ? txt(body.whatsapp, 20).replace(/\D/g, '') : b.whatsapp, body.activo !== undefined ? (body.activo ? 1 : 0) : b.activo, b.slug).run();
      await log(db, yo.email, 'inmobiliaria', { slug: b.slug, cambio: body });
      return json({ ok: true });
    }

    if (m === 'POST' && ruta === '/admin/usuario') return await crearUsuario(db, body, yo.email);
    if (m === 'PUT' && ruta === '/admin/password') {
      const u = await db.prepare('SELECT * FROM usuarios WHERE email=?').bind(yo.email).first();
      if (!igual(await pbkdf2(String(body.actual || ''), u.salt), u.hash)) return err('La contraseña actual no coincide', 401);
      if (String(body.nueva || '').length < 10) return err('La nueva contraseña debe tener al menos 10 caracteres');
      const salt = rnd(16);
      await db.prepare('UPDATE usuarios SET salt=?, hash=? WHERE email=?').bind(salt, await pbkdf2(String(body.nueva), salt), yo.email).run();
      await log(db, yo.email, 'password', 'cambio de contraseña');
      return json({ ok: true });
    }
    return err('No encontrado', 404);
  } catch (e) {
    return err('Error del servidor: ' + (e && e.message || e), 500);
  }
}

async function crearUsuario(db, body, quien) {
  const email = txt(body.email, 120).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return err('Email inválido');
  if (String(body.password || '').length < 10) return err('La contraseña debe tener al menos 10 caracteres');
  if (await db.prepare('SELECT 1 FROM usuarios WHERE email=?').bind(email).first()) return err('Ese email ya existe');
  const salt = rnd(16);
  await db.prepare('INSERT INTO usuarios (email,nombre,salt,hash,creado) VALUES (?,?,?,?,?)').bind(email, txt(body.nombre, 60), salt, await pbkdf2(String(body.password), salt), ahora()).run();
  await log(db, quien, 'usuario', { email });
  return json({ ok: true });
}
