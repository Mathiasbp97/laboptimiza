var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-s3hUPQ/strip-cf-connecting-ip-header.js
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

// .wrangler/tmp/pages-lOUEp1/functionsWorker-0.325792279012578.mjs
var __defProp2 = Object.defineProperty;
var __name2 = /* @__PURE__ */ __name((target, value) => __defProp2(target, "name", { value, configurable: true }), "__name");
function stripCfConnectingIPHeader2(input, init) {
  const request = new Request(input, init);
  request.headers.delete("CF-Connecting-IP");
  return request;
}
__name(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
__name2(stripCfConnectingIPHeader2, "stripCfConnectingIPHeader");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    return Reflect.apply(target, thisArg, [
      stripCfConnectingIPHeader2.apply(null, argArray)
    ]);
  }
});
var ESTADOS = ["libre", "reservado", "senado", "vendido", "bloqueado"];
var json = /* @__PURE__ */ __name2((d, s = 200) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } }), "json");
var err = /* @__PURE__ */ __name2((m, s = 400) => json({ error: m }, s), "err");
var ahora = /* @__PURE__ */ __name2(() => (/* @__PURE__ */ new Date()).toISOString(), "ahora");
var hex = /* @__PURE__ */ __name2((b) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join(""), "hex");
var rnd = /* @__PURE__ */ __name2((n) => hex(crypto.getRandomValues(new Uint8Array(n))), "rnd");
async function pbkdf2(password, saltHex) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return hex(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 1e5 }, key, 256));
}
__name(pbkdf2, "pbkdf2");
__name2(pbkdf2, "pbkdf2");
function igual(a, b) {
  if (a.length !== b.length)
    return false;
  let r = 0;
  for (let i = 0; i < a.length; i++)
    r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}
__name(igual, "igual");
__name2(igual, "igual");
async function usuarioDe(req, db) {
  const t = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!t)
    return null;
  const s = await db.prepare("SELECT s.email, u.nombre FROM sesiones s JOIN usuarios u ON u.email=s.email WHERE s.token=? AND s.exp>?").bind(t, ahora()).first();
  return s || null;
}
__name(usuarioDe, "usuarioDe");
__name2(usuarioDe, "usuarioDe");
async function log(db, email, accion, detalle) {
  await db.prepare("INSERT INTO historial (ts,email,accion,detalle) VALUES (?,?,?,?)").bind(ahora(), email, accion, typeof detalle === "string" ? detalle : JSON.stringify(detalle)).run();
}
__name(log, "log");
__name2(log, "log");
var publico = /* @__PURE__ */ __name2((e) => e === "senado" ? "reservado" : e, "publico");
async function onRequest(ctx) {
  const { request: req, env, params } = ctx;
  const db = env.DB;
  if (!db)
    return err("Falta la base de datos (binding DB)", 500);
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
  try {
    if (m === "GET" && ruta === "/public") {
      const { results } = await db.prepare("SELECT id,piso,pos,tip,m2,estado,precio_lista,mostrar_precio,updated_at FROM unidades ORDER BY piso,pos").all();
      const unidades = results.map((u) => ({
        id: u.id,
        piso: u.piso,
        pos: u.pos,
        tip: u.tip,
        m2: u.m2,
        estado: publico(u.estado),
        precio: u.estado === "libre" && u.mostrar_precio ? u.precio_lista : null
      }));
      const act = results.reduce((a, u) => u.updated_at > a ? u.updated_at : a, "");
      return new Response(JSON.stringify({ unidades, actualizado: act }), { headers: { "content-type": "application/json; charset=utf-8", "cache-control": "public, max-age=20" } });
    }
    if (m === "POST" && ruta === "/evento") {
      const tipo = body.tipo === "consulta" ? "consulta" : "vista";
      const u = String(body.unidad || "").slice(0, 8);
      if (!/^\d{3}$/.test(u))
        return err("unidad inv\xE1lida");
      await db.prepare("INSERT INTO eventos (ts,tipo,unidad,origen) VALUES (?,?,?,?)").bind(ahora(), tipo, u, String(body.origen || "").slice(0, 40)).run();
      return json({ ok: true });
    }
    if (m === "GET" && ruta === "/estado") {
      const n = await db.prepare("SELECT COUNT(*) n FROM usuarios").first();
      return json({ necesitaSetup: !n || n.n === 0 });
    }
    if (m === "POST" && ruta === "/setup") {
      const n = await db.prepare("SELECT COUNT(*) n FROM usuarios").first();
      if (n && n.n > 0)
        return err("Ya hay un administrador. Inici\xE1 sesi\xF3n.", 403);
      return await crearUsuario(db, body, "setup");
    }
    if (m === "POST" && ruta === "/login") {
      const email = String(body.email || "").trim().toLowerCase();
      const u = await db.prepare("SELECT * FROM usuarios WHERE email=?").bind(email).first();
      if (!u || !igual(await pbkdf2(String(body.password || ""), u.salt), u.hash)) {
        await new Promise((r) => setTimeout(r, 600));
        return err("Email o contrase\xF1a incorrectos", 401);
      }
      const token = rnd(32), exp = new Date(Date.now() + 30 * 864e5).toISOString();
      await db.prepare("INSERT INTO sesiones (token,email,exp) VALUES (?,?,?)").bind(token, email, exp).run();
      await db.prepare("DELETE FROM sesiones WHERE exp<?").bind(ahora()).run();
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
      const [u, v, c, e, h] = await db.batch([
        db.prepare("SELECT * FROM unidades ORDER BY piso,pos"),
        db.prepare("SELECT * FROM ventas WHERE activo=1 ORDER BY unidad_id"),
        db.prepare("SELECT c.* FROM cuotas c JOIN ventas v ON v.id=c.venta_id AND v.activo=1 ORDER BY c.fecha,c.n"),
        db.prepare("SELECT unidad, tipo, COUNT(*) n, MAX(ts) ultimo FROM eventos WHERE ts > datetime('now','-90 days') GROUP BY unidad,tipo"),
        db.prepare("SELECT * FROM historial ORDER BY id DESC LIMIT 300")
      ]);
      return json({ yo, unidades: u.results, ventas: v.results, cuotas: c.results, eventos: e.results, historial: h.results });
    }
    let mm;
    if (m === "PUT" && (mm = ruta.match(/^\/admin\/unidad\/(\d{3})$/))) {
      const id = mm[1];
      const u = await db.prepare("SELECT * FROM unidades WHERE id=?").bind(id).first();
      if (!u)
        return err("Unidad inexistente", 404);
      const est = body.estado !== void 0 ? String(body.estado) : u.estado;
      if (!ESTADOS.includes(est))
        return err("Estado inv\xE1lido");
      const precio = body.precio_lista !== void 0 ? Math.round(Number(body.precio_lista)) : u.precio_lista;
      if (!(precio >= 0))
        return err("Precio inv\xE1lido");
      const mp = body.mostrar_precio !== void 0 ? body.mostrar_precio ? 1 : 0 : u.mostrar_precio;
      await db.prepare("UPDATE unidades SET estado=?, precio_lista=?, mostrar_precio=?, updated_at=? WHERE id=?").bind(est, precio, mp, ahora(), id).run();
      if (est === "libre" && u.estado !== "libre")
        await db.prepare("UPDATE ventas SET activo=0, updated_at=? WHERE unidad_id=? AND activo=1").bind(ahora(), id).run();
      await log(db, yo.email, "unidad", { id, de: { estado: u.estado, precio: u.precio_lista }, a: { estado: est, precio }, nota: body.nota || "" });
      return json({ ok: true });
    }
    if (m === "POST" && ruta === "/admin/venta") {
      const id = String(body.unidad_id || "");
      const u = await db.prepare("SELECT * FROM unidades WHERE id=?").bind(id).first();
      if (!u)
        return err("Unidad inexistente", 404);
      const est = String(body.estado || "");
      if (!["reservado", "senado", "vendido"].includes(est))
        return err("Estado de venta inv\xE1lido");
      if (!String(body.cliente || "").trim())
        return err("Falta el nombre del cliente");
      const precio = Math.round(Number(body.precio_cerrado));
      if (!(precio > 0))
        return err("Falta el precio cerrado");
      const cuotas = Array.isArray(body.cuotas) ? body.cuotas : [];
      const suma = cuotas.reduce((a, c) => a + Math.round(Number(c.monto) || 0), 0);
      const total = precio + Math.round(Number(body.cochera_usd) || 0);
      if (cuotas.length && Math.abs(suma - total) > 1)
        return err(`El plan de pago suma USD ${suma.toLocaleString("es-PY")} y el total es USD ${total.toLocaleString("es-PY")}`);
      const t = ahora();
      await db.prepare("UPDATE ventas SET activo=0, updated_at=? WHERE unidad_id=? AND activo=1").bind(t, id).run();
      const r = await db.prepare(`INSERT INTO ventas (unidad_id,estado,cliente,documento,telefono,email,fecha,precio_cerrado,cochera,cochera_usd,vendedor,notas,activo,created_at,updated_at,creado_por)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`).bind(
        id,
        est,
        String(body.cliente).trim(),
        body.documento || "",
        body.telefono || "",
        body.email || "",
        body.fecha || t.slice(0, 10),
        precio,
        body.cochera || "",
        Math.round(Number(body.cochera_usd) || 0),
        body.vendedor || "",
        body.notas || "",
        t,
        t,
        yo.email
      ).run();
      const vid = r.meta.last_row_id;
      if (cuotas.length)
        await db.batch(cuotas.map((c, i) => db.prepare("INSERT INTO cuotas (venta_id,n,concepto,fecha,monto,pagado,fecha_pago,monto_pagado) VALUES (?,?,?,?,?,?,?,?)").bind(vid, i + 1, String(c.concepto || "Cuota").slice(0, 40), String(c.fecha || "").slice(0, 10), Math.round(Number(c.monto) || 0), c.pagado ? 1 : 0, c.fecha_pago || null, c.pagado ? Math.round(Number(c.monto_pagado ?? c.monto) || 0) : 0)));
      await db.prepare("UPDATE unidades SET estado=?, updated_at=? WHERE id=?").bind(est, t, id).run();
      await log(db, yo.email, "venta", { unidad: id, estado: est, cliente: String(body.cliente).trim(), precio, cuotas: cuotas.length });
      return json({ ok: true, id: vid });
    }
    if (m === "POST" && (mm = ruta.match(/^\/admin\/venta\/(\d+)\/anular$/))) {
      const v = await db.prepare("SELECT * FROM ventas WHERE id=? AND activo=1").bind(mm[1]).first();
      if (!v)
        return err("Venta inexistente", 404);
      await db.batch([
        db.prepare("UPDATE ventas SET activo=0, updated_at=? WHERE id=?").bind(ahora(), v.id),
        db.prepare("UPDATE unidades SET estado='libre', updated_at=? WHERE id=?").bind(ahora(), v.unidad_id)
      ]);
      await log(db, yo.email, "anular", { unidad: v.unidad_id, cliente: v.cliente, motivo: body.motivo || "" });
      return json({ ok: true });
    }
    if (m === "PUT" && (mm = ruta.match(/^\/admin\/cuota\/(\d+)$/))) {
      const c = await db.prepare("SELECT * FROM cuotas WHERE id=?").bind(mm[1]).first();
      if (!c)
        return err("Cuota inexistente", 404);
      const pag = body.pagado ? 1 : 0;
      const mp = pag ? Math.round(Number(body.monto_pagado ?? c.monto) || 0) : 0;
      await db.prepare("UPDATE cuotas SET pagado=?, fecha_pago=?, monto_pagado=? WHERE id=?").bind(pag, pag ? body.fecha_pago || ahora().slice(0, 10) : null, mp, c.id).run();
      await log(db, yo.email, "cobro", { cuota: c.id, venta: c.venta_id, n: c.n, pagado: pag, monto: mp });
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
__name2(onRequest, "onRequest");
async function crearUsuario(db, body, quien) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return err("Email inv\xE1lido");
  if (String(body.password || "").length < 10)
    return err("La contrase\xF1a debe tener al menos 10 caracteres");
  const ex = await db.prepare("SELECT 1 FROM usuarios WHERE email=?").bind(email).first();
  if (ex)
    return err("Ese email ya existe");
  const salt = rnd(16);
  await db.prepare("INSERT INTO usuarios (email,nombre,salt,hash,creado) VALUES (?,?,?,?,?)").bind(email, String(body.nombre || "").slice(0, 60), salt, await pbkdf2(String(body.password), salt), ahora()).run();
  await log(db, quien, "usuario", { email });
  return json({ ok: true });
}
__name(crearUsuario, "crearUsuario");
__name2(crearUsuario, "crearUsuario");
var routes = [
  {
    routePath: "/api/:path*",
    mountPath: "/api",
    method: "",
    middlewares: [],
    modules: [onRequest]
  }
];
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
__name2(lexer, "lexer");
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
  var tryConsume = /* @__PURE__ */ __name2(function(type) {
    if (i < tokens.length && tokens[i].type === type)
      return tokens[i++].value;
  }, "tryConsume");
  var mustConsume = /* @__PURE__ */ __name2(function(type) {
    var value2 = tryConsume(type);
    if (value2 !== void 0)
      return value2;
    var _a2 = tokens[i], nextType = _a2.type, index = _a2.index;
    throw new TypeError("Unexpected ".concat(nextType, " at ").concat(index, ", expected ").concat(type));
  }, "mustConsume");
  var consumeText = /* @__PURE__ */ __name2(function() {
    var result2 = "";
    var value2;
    while (value2 = tryConsume("CHAR") || tryConsume("ESCAPED_CHAR")) {
      result2 += value2;
    }
    return result2;
  }, "consumeText");
  var isSafe = /* @__PURE__ */ __name2(function(value2) {
    for (var _i = 0, delimiter_1 = delimiter; _i < delimiter_1.length; _i++) {
      var char2 = delimiter_1[_i];
      if (value2.indexOf(char2) > -1)
        return true;
    }
    return false;
  }, "isSafe");
  var safePattern = /* @__PURE__ */ __name2(function(prefix2) {
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
__name2(parse, "parse");
function match(str, options) {
  var keys = [];
  var re = pathToRegexp(str, keys, options);
  return regexpToFunction(re, keys, options);
}
__name(match, "match");
__name2(match, "match");
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
    var _loop_1 = /* @__PURE__ */ __name2(function(i2) {
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
__name2(regexpToFunction, "regexpToFunction");
function escapeString(str) {
  return str.replace(/([.+*?=^!:${}()[\]|/\\])/g, "\\$1");
}
__name(escapeString, "escapeString");
__name2(escapeString, "escapeString");
function flags(options) {
  return options && options.sensitive ? "" : "i";
}
__name(flags, "flags");
__name2(flags, "flags");
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
__name2(regexpToRegexp, "regexpToRegexp");
function arrayToRegexp(paths, keys, options) {
  var parts = paths.map(function(path) {
    return pathToRegexp(path, keys, options).source;
  });
  return new RegExp("(?:".concat(parts.join("|"), ")"), flags(options));
}
__name(arrayToRegexp, "arrayToRegexp");
__name2(arrayToRegexp, "arrayToRegexp");
function stringToRegexp(path, keys, options) {
  return tokensToRegexp(parse(path, options), keys, options);
}
__name(stringToRegexp, "stringToRegexp");
__name2(stringToRegexp, "stringToRegexp");
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
__name2(tokensToRegexp, "tokensToRegexp");
function pathToRegexp(path, keys, options) {
  if (path instanceof RegExp)
    return regexpToRegexp(path, keys);
  if (Array.isArray(path))
    return arrayToRegexp(path, keys, options);
  return stringToRegexp(path, keys, options);
}
__name(pathToRegexp, "pathToRegexp");
__name2(pathToRegexp, "pathToRegexp");
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
__name2(executeRequest, "executeRequest");
var pages_template_worker_default = {
  async fetch(originalRequest, env, workerContext) {
    let request = originalRequest;
    const handlerIterator = executeRequest(request);
    let data = {};
    let isFailOpen = false;
    const next = /* @__PURE__ */ __name2(async (input, init) => {
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
var cloneResponse = /* @__PURE__ */ __name2((response) => (
  // https://fetch.spec.whatwg.org/#null-body-status
  new Response(
    [101, 204, 205, 304].includes(response.status) ? null : response.body,
    response
  )
), "cloneResponse");
var drainBody = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
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
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
__name2(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name2(async (request, env, _ctx, middlewareCtx) => {
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
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = pages_template_worker_default;
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
__name2(__facade_register__, "__facade_register__");
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
__name2(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");
__name2(__facade_invoke__, "__facade_invoke__");
var __Facade_ScheduledController__ = /* @__PURE__ */ __name(class {
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
}, "__Facade_ScheduledController__");
__name2(__Facade_ScheduledController__, "__Facade_ScheduledController__");
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name2(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name2(function(type, init) {
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
__name2(wrapExportedHandler, "wrapExportedHandler");
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
__name2(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;

// ../../../vidalta/tools/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
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
var middleware_ensure_req_body_drained_default2 = drainBody2;

// ../../../vidalta/tools/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError2(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError2(e.cause)
  };
}
__name(reduceError2, "reduceError");
var jsonError2 = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError2(e);
    return Response.json(error, {
      status: 500,
      headers: { "MF-Experimental-Error-Stack": "true" }
    });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default2 = jsonError2;

// .wrangler/tmp/bundle-s3hUPQ/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__2 = [
  middleware_ensure_req_body_drained_default2,
  middleware_miniflare3_json_error_default2
];
var middleware_insertion_facade_default2 = middleware_loader_entry_default;

// ../../../vidalta/tools/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__2 = [];
function __facade_register__2(...args) {
  __facade_middleware__2.push(...args.flat());
}
__name(__facade_register__2, "__facade_register__");
function __facade_invokeChain__2(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__2(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__2, "__facade_invokeChain__");
function __facade_invoke__2(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__2(request, env, ctx, dispatch, [
    ...__facade_middleware__2,
    finalMiddleware
  ]);
}
__name(__facade_invoke__2, "__facade_invoke__");

// .wrangler/tmp/bundle-s3hUPQ/middleware-loader.entry.ts
var __Facade_ScheduledController__2 = class {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof __Facade_ScheduledController__2)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
__name(__Facade_ScheduledController__2, "__Facade_ScheduledController__");
function wrapExportedHandler2(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
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
          const controller = new __Facade_ScheduledController__2(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__2(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler2, "wrapExportedHandler");
function wrapWorkerEntrypoint2(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__2 === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__2.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__2) {
    __facade_register__2(middleware);
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
        const controller = new __Facade_ScheduledController__2(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    };
    fetch(request) {
      return __facade_invoke__2(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint2, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY2;
if (typeof middleware_insertion_facade_default2 === "object") {
  WRAPPED_ENTRY2 = wrapExportedHandler2(middleware_insertion_facade_default2);
} else if (typeof middleware_insertion_facade_default2 === "function") {
  WRAPPED_ENTRY2 = wrapWorkerEntrypoint2(middleware_insertion_facade_default2);
}
var middleware_loader_entry_default2 = WRAPPED_ENTRY2;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__2 as __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default2 as default
};
//# sourceMappingURL=functionsWorker-0.325792279012578.js.map
