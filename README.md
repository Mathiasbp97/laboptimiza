# Lab Optimiza

Un repositorio para todos los productos. Cada carpeta de `sitios/` es un proyecto de Cloudflare Pages
conectado a este repo (Root directory = esa carpeta). Al hacer push a `main`, Cloudflare publica solo.

| Carpeta | Proyecto Cloudflare | URL |
|---|---|---|
| sitios/finanzas | laboptimiza | https://laboptimiza.pages.dev |
| sitios/turnos | (próximo) | |
| sitios/showroom | (próximo, marca aparte) | |

- `sitios/<app>/clientes/<slug>.json`: una licencia por cliente (link `?c=slug`).
- `media/`: imágenes y videos para Instagram (se publican por API desde las URLs raw de GitHub).
- `contenido/calendario.json`: calendario de publicaciones.
