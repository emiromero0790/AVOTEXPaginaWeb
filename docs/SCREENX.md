# AVOTEX — Experiencia inmersiva del agricultor (Vista normal y ScreenX)

El panel del agricultor (`admin.html`) ahora muestra la huerta con **Google Street View a pantalla completa**.
Los módulos de siempre (Resumen, Mi Huerta, Reportes Satelitales y Análisis IA) aparecen en **paneles flotantes** encima del paisaje.

Al entrar, después del login normal, el agricultor elige entre:

- **Vista normal**: una sola pantalla.
- **ScreenX**: tres ventanas del navegador, una por monitor, que forman una panorámica.

## Archivos

| Archivo | Qué hace |
|---|---|
| `admin.html` | Panel del agricultor. El menú lateral se cambió por la interfaz flotante. Los 4 módulos conservan sus IDs y su código. |
| `avotex-inmersiva.js` | Selector de modalidad, asistente de ScreenX, paneles, selector de huertas y sincronización entre ventanas. |
| `avotex-inmersiva.css` | Estilos de la experiencia (paneles con transparencia, HUD, selector blanco, asistente, celular). |
| `avotex-streetview.js` | Carga de Google Maps, búsqueda de cobertura y la única instancia de Street View por ventana. |
| `avotex-screenx-core.js` | Lógica sin DOM: protocolo entre ventanas, estado versionado, roles y matemática de cámara. |
| `api/maps-config.js` | Función de Vercel que entrega la clave de Google Maps desde una variable de entorno. |
| `tests/screenx-core.test.js` | Pruebas unitarias (Node). |
| `tests/e2e/screenx.e2e.mjs` | Pruebas de navegador (Playwright) con Firebase, Supabase y Google Maps simulados. |

## Configuración necesaria

### 1. Clave de Google Maps (sin subirla al repositorio)

- **Producción (Vercel):** agregar la variable de entorno `GOOGLE_MAPS_API_KEY` en *Project → Settings → Environment Variables*. Opcional: `GOOGLE_MAPS_VERSION` (por defecto `quarterly`).
- **Desarrollo local:** crear `avotex-maps.local.js` en la raíz. git lo ignora.
  ```js
  window.AVOTEX_MAPS_CONFIG = { apiKey: 'TU_CLAVE', version: 'quarterly' };
  ```
- Replit (sitio estático) no ejecuta la función `/api`. Ahí Street View muestra "no está configurado" y los módulos siguen funcionando.

La clave de Maps JavaScript siempre termina visible en el navegador, porque así funciona Google Maps. Lo que la protege son sus restricciones en Google Cloud Console (*APIs y servicios → Credenciales*):

1. **Restricción de aplicación → Sitios web:** `https://vex-mx.com/*`, `https://www.vex-mx.com/*`. Para desarrollo, `http://localhost:5000/*`.
2. **Restricción de API:** solo **Maps JavaScript API**.
3. **Cuotas:** en *Google Maps Platform → Cuotas*, poner un límite diario a "Dynamic Street View". **Una alerta de presupuesto avisa, pero no detiene el gasto.**
4. La clave que se compartió por chat durante el desarrollo conviene **rotarla** (crear una nueva y borrar la anterior).

### 2. Nada más

No hay tablas, servicios ni dependencias npm nuevas. Se usan las tablas que ya existían: `huertas`, `scans` y `reportes`.

## APIs de Google y costos

| Uso | SKU de Google | ¿Cuándo cobra? |
|---|---|---|
| `StreetViewPanorama` | Dynamic Street View | Cada vez que se **crea** un panorama. Precio de lista: 5,000 gratis al mes y luego unos USD 14 por cada 1,000. |
| `StreetViewService.getPanorama` (buscar cobertura) | — | Según la documentación de Google, **no se cobra**. |
| Carga del script de Maps JS | Dynamic Maps | Solo si se crea un mapa de Google. Aquí no se crea ninguno. |

Cómo se mantiene bajo el costo:

- **Una sola instancia de Street View por ventana.** Cambiar de huerta, de modalidad o mover la cámara usa `setPano` y `setPov` sobre la misma instancia.
- La cobertura de cada huerta se busca **una vez** y se guarda en memoria.
- Si no hay cobertura, **no se crea** el panorama: se muestra la vista satelital (Esri, como en "Mi Huerta").
- No hay reintentos automáticos. Los errores se muestran y el usuario decide si reintenta.

Consumo esperado: Vista normal = 1 carga por visita. ScreenX = 3 cargas (una por ventana). Cada recarga de una ventana cuenta como una carga más.

El consumo se revisa en Google Cloud Console → *Google Maps Platform → Métricas* (filtrar por "Dynamic Street View") y en *Facturación → Informes*.

Precios verificados en la documentación de Google en octubre de 2026. Revisa la página de precios vigente antes de presupuestar.

## Cómo funciona ScreenX

### Ventanas y roles

- Son tres ventanas del **mismo navegador** con `admin.html`. El usuario coloca cada una en su monitor y le asigna su rol: Izquierda, Central o Derecha.
- La asignación es **manual**, porque el navegador no puede saber qué monitor está a la izquierda o a la derecha.
  - El botón "Consultar pantallas" usa la Window Management API cuando existe (Chrome y Edge). Solo informa cuántas pantallas ve el navegador.
- El botón "Abrir otra ventana" abre `admin.html#screenx` solo con un clic del usuario.
- Comunicación: `BroadcastChannel` con un canal por usuario (`avotex-screenx:<uid>`). Está limitado al mismo origen y al mismo perfil del navegador. No es almacenamiento y no requiere servidor.

Mensajes del protocolo:

| Mensaje | Para qué |
|---|---|
| `presence` | Latido cada 1.5 s. Una ventana sin latido por 5 s se considera desconectada. |
| `bye` | La ventana se cierra o cambia de modalidad. |
| `state` / `state-request` | Estado compartido (huerta activa, calibración) con **versión**. |
| `camera` | Orientación de la cámara central. |
| `start` | Entrar a ScreenX desde el asistente. |
| `open-module` | La central abre un módulo en otra pantalla. |
| `nav-request` | Una lateral pide a la central girar, hacer zoom o avanzar a otro panorama. |
| `logout` | Se cerró la sesión. |

Protecciones:

- Una ventana nueva o recargada empieza en versión 0 y **no puede pisar** el estado de las demás.
- Dos cambios simultáneos se resuelven igual en todas las ventanas (gana el identificador de ventana mayor).
- Solo se acepta la cámara de la **única** ventana con rol central y de la misma huerta. Si hay dos centrales, nadie mueve a las laterales hasta corregirlo.
- Las laterales **nunca** emiten cámara: cuando alguien las mueve, mandan una *petición* (`nav-request`) y la central la aplica y la retransmite.
- Una lateral solo manda peticiones por cambios hechos **por una persona** en esa ventana (arrastrar, rueda, teclado, tocar, flechas o botonera). Los cambios que llegan por sincronización nunca se reenvían.
- La central ignora una petición que no cambia nada, así que el eco no provoca ciclos.
- Una pestaña duplicada (que copia `sessionStorage`) se detecta y se le pide un rol propio.

### Panorámica: qué es real y qué no

Las tres ventanas muestran **el mismo panorama** (mismo `pano`) con el **mismo zoom**.

- Google documenta que el zoom define el **campo de visión horizontal**: zoom 0 = 180°, 1 = 90°, 2 = 45°…
- La pantalla derecha mira `heading + campo de visión` y la izquierda `heading − campo de visión`. Así el borde derecho de la central coincide con el borde izquierdo de la derecha.
- Se comprobó con imágenes reales de la huerta "Tec" y de "Huerta 1": las líneas, los muros y el camino continúan entre ventanas.
- No se recortan, unen ni capturan imágenes de Google: cada ventana muestra Street View con la API oficial, con su logotipo y atribución.

Se sincroniza:

- Panorama (incluso cuando el usuario avanza por la calle en la central).
- Orientación (heading).
- Inclinación (pitch).
- Zoom (y con él, el desplazamiento angular).
- Huerta activa.

Limitaciones:

- **Uniones con quiebre de ángulo.** Cada ventana usa su propia proyección plana. Las líneas rectas que cruzan una unión cambian de dirección. Con monitores planos en fila se nota más que con las laterales giradas hacia la persona.
- **Inclinación distinta de 0.** Con pitch distinto de 0 las uniones encajan peor, porque las laterales giran alrededor del eje vertical.
- **Mismo tamaño de monitor.** Los tres monitores deben tener la misma resolución y proporción, porque el campo de visión es horizontal.
- **Calibración.** Los marcos de los monitores se compensan en *Calibrar* (solo en la central). Hay "compensación de marcos" y "ajuste fino", y los valores se guardan en ese navegador.
- **Zoom 1 = 270° en total.** Con zoom 1, las tres pantallas cubren 270°. Para una vista más natural en monitores planos, conviene acercar un poco el zoom en la central (las laterales lo siguen).
- **Navegar desde una lateral necesita la central.** Si la central no está conectada (modo parcial), el cambio se queda solo en esa pantalla.
- **Pequeño retraso al mover una lateral.** Mientras alguien arrastra una lateral, esa pantalla se mueve al instante y las otras dos siguen a la central con un retraso pequeño. Durante 0.45 s esa lateral ignora el eco de la central para que la vista no "salte".
- **Paneles en los bordes exteriores.** En ScreenX los paneles se abren en el borde exterior de las laterales para no tapar las uniones.

### Controles de Street View y navegación

Controles nativos de Google, configurados en `avotex-streetview.js` con `StreetViewPanorama`:

| Control | Vista normal y central | Laterales |
|---|---|---|
| Flechas sobre el camino (`linksControl`) | Sí | Sí |
| Clic para avanzar (`clickToGo`) | Sí | Sí |
| Brújula / orientación (`panControl`) | Sí | Sí |
| Zoom (`zoomControl`) | Sí | Sí |
| Dirección (`addressControl`, arriba al centro) | Sí (se oculta en pantallas de menos de 760 px) | No, para no repetirla en tres monitores |
| Fecha de la imagen (`imageDateControl`) | Sí, la que da Google; si no hay, no se muestra | No |
| Pantalla completa de Google | No: se usa F11, así no compite entre ventanas | No |

En todas las ventanas se conservan el logotipo, la atribución y los enlaces de Google.

**Botonera de AVOTEX** (abajo al centro, junto al menú de módulos): girar a la izquierda, retroceder, avanzar y girar a la derecha.

- **Avanzar y retroceder** usan solo los enlaces reales del panorama (`getLinks()`): el enlace más alineado con hacia dónde mira **esa** pantalla, dentro de ±67.5° (como las flechas de Google). Luego se llama a `setPano()` con el id de ese enlace y se conserva la orientación.
  - Si no hay enlace en esa dirección, el botón se deshabilita y dice "No hay camino hacia adelante".
  - Las fotos 360° de usuarios (como "Tec") no tienen enlaces.
- **Girar** mueve la vista 45° con una animación corta (`setPov()`). Cualquier gesto sobre el panorama la detiene.
- La botonera se atenúa tras unos segundos sin uso y vuelve al mover el cursor, tocar o usar el teclado. En celular se oculta mientras hay un panel abierto.
- En ScreenX la botonera funciona en las tres pantallas. Avanzar desde la derecha, por ejemplo, lleva a las tres al nuevo panorama y cada una conserva su desplazamiento.

### Distribución de módulos en ScreenX

| Pantalla | Por defecto | Además |
|---|---|---|
| Izquierda | Mi Huerta | Reportes Satelitales |
| Central | Paisaje despejado, selector de huertas, calibración, estado de ScreenX | El menú abre cada módulo en su pantalla, o aquí si esa pantalla no está conectada ("Abrir aquí") |
| Derecha | Resumen | Análisis IA |

Todos los módulos se pueden abrir en cualquier pantalla.

## Sesión y seguridad

- **Sesión.** Es la misma de siempre, la de **Firebase Auth**. Su persistencia local se comparte entre ventanas del mismo navegador.
  - Las ventanas de ScreenX no piden login otra vez, pero **cada una verifica su propia sesión**.
  - Sin sesión, una ventana regresa a `dashboard.html`.
  - No hay tokens en URLs (solo `#screenx`) ni secretos en `localStorage`.
- **Datos.** Cada ventana carga sus propios datos con su propia sesión. Un mensaje de otra ventana solo dice *qué huerta mostrar*, y la ventana solo la acepta si está en su propia lista.
- **Sesión que vence o se cierra.** Se ocultan los datos y aparece "Tu sesión terminó". Cerrar sesión en una ventana cierra todas.
- **Supabase devuelve 401/403.** Se muestra "Acceso no autorizado" en cada módulo.
- **Limitación de antes, sin cambios.** El portal consulta Supabase con la clave `anon` y filtra por `user_email` **en el navegador**. La tabla `huertas` no tiene RLS, como explica su propia migración en la app. Esta fase no cambió ese modelo. Para que la base de datos impida ver huertas ajenas:
  1. Configurar **Firebase como proveedor de autenticación de terceros en Supabase**.
  2. Enviar el ID token de Firebase en lugar de la clave `anon`.
  3. Activar RLS con políticas del tipo `user_email = auth.jwt() ->> 'email'`.

## Estados y errores que se muestran

- Inicializando y verificando la sesión.
- Cargando huertas y cargando Street View.
- Huerta sin ubicación válida.
- Sin cobertura a menos de 1 km (con vista satelital de respaldo).
- Imagen antigua (más de 4 años) y foto 360° de un usuario.
- Clave no configurada, clave rechazada por Google, Google Maps tarda demasiado, búsqueda fallida.
- Ventana sin rol, rol duplicado, configuración parcial.
- Ventana desconectada, central desconectada, sincronizando.
- Navegador sin `BroadcastChannel`.
- Sesión terminada, acceso no autorizado.

## Pruebas

```bash
# Unitarias (Node 18+)
node --test tests/screenx-core.test.js

# Navegador (requiere Playwright + Chromium)
node --test tests/e2e/screenx.e2e.mjs
```

Las pruebas de navegador simulan Firebase, Supabase y Google Maps, así que no consumen cuota. Cubren:

- Login y selector de modalidad.
- Vista normal: paneles, huertas reales del usuario, cambio de huerta, sin cobertura, sin ubicación, una sola instancia de Street View.
- ScreenX con 1, 2 y 3 ventanas: roles duplicados, entrar en grupo, cámara y desplazamientos, calibración, zoom, huerta, avance por la calle, módulos en otra pantalla, recarga, cierre, ventana que deja de responder.
- Controles nativos activos en cada pantalla, y botonera que avanza y retrocede solo por enlaces reales, gira y se deshabilita sin camino.
- Navegación desde una lateral que mueve a las tres sin ciclos.
- Cierre de sesión en varias ventanas y sesión que vence.
- Supabase 401, clave no configurada, clave rechazada.

## Probar a mano

### Vista normal

1. Entrar a `dashboard.html` → pestaña Agricultor → iniciar sesión.
2. Elegir **Vista normal → Entrar a mi huerta**.
3. Cambiar de huerta en el selector de arriba a la izquierda y abrir y cerrar los módulos desde el menú inferior.

### ScreenX con tres monitores (Windows)

1. Windows + P → **Extender**. Los tres monitores deben tener la misma resolución.
2. Iniciar sesión y elegir **Configurar ScreenX**.
3. En el paso 1 pulsar **Abrir otra ventana** dos veces (o abrir dos ventanas del mismo navegador en `…/admin.html`).
4. Arrastrar cada ventana a su monitor y pulsar F11 en cada una.
5. En cada ventana elegir su rol: Izquierda, Central o Derecha.
6. En la central, paso 3 → **Entrar a ScreenX**. Las otras entran solas.
7. Mover la cámara en la central y usar **Calibrar** hasta que un camino o una hilera de árboles cruce bien entre monitores.

## Segunda fase (recomendado)

1. RLS con Firebase como proveedor de Supabase (ver "Sesión y seguridad").
2. Ligar `scans` y `reportes` a `huerta_id`, para que los módulos filtren por huerta (hoy son datos de la cuenta y los paneles lo indican).
3. Un control de zoom inicial de ScreenX y una prueba física con los monitores reales para ajustar los valores por defecto de calibración.
4. Marcadores sobre Street View con los hallazgos del modo recorrido de la app, cuando exista.
5. Opcional: una aplicación de escritorio para colocar las ventanas automáticamente en cada monitor (fuera del alcance de esta fase).
