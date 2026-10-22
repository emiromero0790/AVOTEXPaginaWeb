# AvoTex / VEX — sitio estático

Sitio estático (HTML/CSS/JS, sin build ni backend propio) para VEX y su producto AvoTex
(monitoreo de huertas de aguacate con IA + reportes satelitales EOSDA).

## Cómo correr el proyecto
El workflow "Start application" sirve la carpeta raíz con `http-server` en el puerto 5000:
```
npx --yes http-server@14.1.1 . -p 5000 -a 0.0.0.0 -c-1
```
No requiere instalación de dependencias ni variables de entorno para levantarse.

## Páginas principales
- `index.html` — landing pública de VEX.
- `avotex.html` — landing pública de AvoTex (planes, registro).
- `dashboard.html` — login (pestañas Agricultor / Administrador) usando Firebase Auth.
  El login de Administrador está restringido por email hardcodeado a `vexmxoficial@gmail.com`.
- `admin.html` — panel del **agricultor**: experiencia inmersiva con Street View a pantalla completa,
  selector de modalidad (**Vista normal** o **ScreenX** de tres pantallas) y los módulos Resumen,
  Mi Huerta, Reportes Satelitales y Análisis IA en paneles flotantes. Ver `docs/SCREENX.md`.
- `avotex-admin.html` — panel del **staff AvoTex** (gestión de clientes y generación de reportes).

## Autenticación y datos
- Auth de usuarios: Firebase Auth (no Supabase Auth).
- Datos (tablas `users`, `scans`, `reportes`) se leen vía REST de Supabase usando la
  **anon key** embebida directamente en el HTML de cada página (no hay backend intermedio).

## Feature "Mi Huerta" (polígono de la huerta del agricultor)
En `admin.html`, la sección "Mi Huerta" muestra el contorno de la huerta del agricultor logeado
sobre un mapa satelital (Leaflet + Esri World Imagery), leyendo un shapefile (`.shp`/`.dbf`/`.prj`)
desde Supabase Storage y convirtiéndolo a GeoJSON en el navegador con `shpjs` (CDN, sin backend).

- Bucket de Storage: `Huertas`.
- Estructura esperada: una carpeta por usuario, nombrada exactamente con su email
  (ej. `vexmxoficial@gmail.com/`), conteniendo los archivos del shapefile (`.shp`, `.dbf`,
  `.prj`; `.shx` no se usa).
- Si no existe carpeta para el email logeado (o no tiene `.shp`/`.dbf`), se muestra el mensaje
  "El administrador aún no ha delimitado tu huerta."

**Pendiente de configuración en Supabase (no se puede hacer desde Replit):** el bucket
`Huertas` es privado hoy — la anon key no puede listar ni descargar sus archivos (confirmado:
list y getBucket devuelven vacío/404). Para que el mapa funcione hay que, en el dashboard de
Supabase → Storage → bucket `Huertas`, marcarlo como **público** (o agregar una policy de
Storage que permita `SELECT` al rol `anon` sobre ese bucket). Sin ese cambio, todos los
agricultores verán el mensaje de "huerta no delimitada" aunque su carpeta exista.

## Experiencia inmersiva y ScreenX (`admin.html`)
Street View de Google Maps a pantalla completa y ScreenX (tres ventanas sincronizadas con
BroadcastChannel). Archivos: `avotex-inmersiva.js/.css`, `avotex-streetview.js`,
`avotex-screenx-core.js`, `api/maps-config.js`. La clave de Google Maps viene de la variable
de entorno `GOOGLE_MAPS_API_KEY` en Vercel (o de `avotex-maps.local.js`, ignorado por git, en local).
Las huertas se leen de la tabla `huertas` de Supabase (no del bucket de Storage descrito arriba).
Pruebas: `node --test tests/screenx-core.test.js` y `node --test tests/e2e/screenx.e2e.mjs`.
Documentación completa, costos y limitaciones: `docs/SCREENX.md`.
