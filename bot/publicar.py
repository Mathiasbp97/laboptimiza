"""Robot publicador: corre en GitHub Actions cada 15 min y publica en Instagram lo que toca según los calendarios.
Usa solo la librería estándar. El token viene del secreto META_TOKEN (nunca se imprime ni se guarda en el repo)."""
import json, os, sys, time, urllib.request, urllib.parse, datetime as dt

G = 'https://graph.facebook.com/v24.0/'
TOK = os.environ.get('META_TOKEN', '').strip()
TZ = dt.timezone(dt.timedelta(hours=-3))          # America/Asuncion
VENTANA_H = 12                                     # no publica cosas atrasadas más de 12 h
EST = 'bot/estado.json'

def api(path, data=None):
    q = dict(data or {}); q['access_token'] = TOK
    if data is None:
        url = G + path + ('&' if '?' in path else '?') + urllib.parse.urlencode({'access_token': TOK}); body = None
    else:
        url = G + path; body = urllib.parse.urlencode(q).encode()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=60) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        return {'error': json.loads(e.read() or b'{}').get('error', {'message': str(e)})}

def esperar(cid, max_s=420):
    t0 = time.time()
    while time.time() - t0 < max_s:
        st = api(f'{cid}?fields=status_code').get('status_code')
        if st in ('FINISHED', 'ERROR', 'EXPIRED'): return st
        time.sleep(8)
    return 'TIMEOUT'

def publicar(ig, cid):
    r = api(f'{ig}/media_publish', {'creation_id': cid})
    if 'id' not in r: return None, r
    return api(f"{r['id']}?fields=permalink").get('permalink', r['id']), None

def ya_publicado(ig, texto):
    pre = (texto or '')[:40]
    for m in api(f'{ig}/media?fields=caption&limit=15').get('data', []):
        if (m.get('caption') or '').startswith(pre): return True
    return False

def post(ig, base, p):
    if ya_publicado(ig, p['texto']): return 'ya estaba publicado'
    if p['tipo'] == 'REELS':
        c = api(f'{ig}/media', {'media_type': 'REELS', 'video_url': base + p['archivo'], 'caption': p['texto'],
                                'thumb_offset': str(p.get('thumb_offset', 1000)), 'share_to_feed': 'true'})
        if 'id' not in c: return f"error al crear: {c.get('error')}"
        st = esperar(c['id'])
        if st != 'FINISHED': return f'error de procesamiento: {st}'
    elif p['tipo'] == 'CAROUSEL':
        urls = [base + a for a in p['archivos']] if 'archivos' in p else [f"{base}{p['carpeta']}/{i:02d}.jpg" for i in range(1, p['imagenes'] + 1)]
        hijos = []
        for u in urls:
            h = api(f'{ig}/media', {'image_url': u, 'is_carousel_item': 'true'})
            if 'id' not in h: return f"error en imagen {u}: {h.get('error')}"
            hijos.append(h['id'])
        for h in hijos: esperar(h, 120)
        c = api(f'{ig}/media', {'media_type': 'CAROUSEL', 'children': ','.join(hijos), 'caption': p['texto']})
        if 'id' not in c: return f"error al crear carrusel: {c.get('error')}"
        esperar(c['id'], 180)
    else:
        return f"tipo desconocido {p['tipo']}"
    link, err = publicar(ig, c['id'])
    return link if link else f'error al publicar: {err}'

def historia_hoy(ig, hoy):
    for s in api(f'{ig}/stories?fields=timestamp').get('data', []):
        t = dt.datetime.strptime(s['timestamp'], '%Y-%m-%dT%H:%M:%S%z').astimezone(TZ)
        if t.date() == hoy and t.hour >= 6: return True
    return False

def main():
    if not TOK: print('Falta el secreto META_TOKEN: no se publica nada.'); return
    est = json.load(open(EST)) if os.path.exists(EST) else {'hecho': {}}
    ahora = dt.datetime.now(TZ); hechos = est['hecho']; cambios = False
    for f in ['contenido/calendario.json', 'contenido/calendario-domvra.json']:
        cal = json.load(open(f)); ig = cal['ig_user_id']; base = cal['media_base']
        for p in cal['publicaciones']:
            k = f"{ig}:{p['id']}"
            if k in hechos: continue
            cuando = dt.datetime.fromisoformat(p['cuando'])
            if cuando > ahora or ahora - cuando > dt.timedelta(hours=VENTANA_H): continue
            res = post(ig, base, p); print(p['id'], '->', res)
            if not res.startswith('error'): hechos[k] = {'cuando': ahora.isoformat(timespec='minutes'), 'res': res}; cambios = True
    # historias diarias (desde las 10:15)
    h = json.load(open('contenido/historias.json')); hoy = ahora.date()
    if ahora.time() >= dt.time(10, 15):
        cuentas = {'d': h['cuentas']['domvra'], 'l': h['cuentas']['laboptimiza']}
        lista = h['dias'].get(hoy.isoformat(), [])
        for n, sid in enumerate(lista):
            ig = cuentas[sid[0]]; k = f'hist:{hoy}:{sid}'
            if k in hechos: continue
            previas = [x for x in lista[:n] if x[0] == sid[0]]   # varias historias de la misma cuenta el mismo día: solo la primera mira si ya había una
            if not previas and historia_hoy(ig, hoy): hechos[k] = {'res': 'ya había historia hoy'}; cambios = True; continue
            if previas and any(f'hist:{hoy}:{x}' not in hechos for x in previas): continue
            c = api(f'{ig}/media', {'media_type': 'STORIES', 'image_url': h['base'] + sid + '.jpg'})
            if 'id' not in c: print(sid, 'error', c.get('error')); continue
            esperar(c['id'], 120); link, err = publicar(ig, c['id']); print('historia', sid, '->', link or err)
            if link: hechos[k] = {'res': link}; cambios = True
    if cambios: json.dump(est, open(EST, 'w'), ensure_ascii=False, indent=1)

if __name__ == '__main__':
    main()
