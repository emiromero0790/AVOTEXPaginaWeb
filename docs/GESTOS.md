# AVOTEX — Control por gestos en «Administra tu huerta»

Modo opcional para mover Street View con la mano frente a una webcam USB. Pensado para el stand de
Innovatec: TV central + dos monitores laterales (ScreenX) y la webcam conectada a la laptop que corre la
ventana **central**.

```
Webcam USB → <video> local → MediaPipe Hand Landmarker (en la laptop) → gesto confirmado
  → look() / navigateStage() de la panorámica central → pov_changed / pano_changed
  → sendCamera() de ScreenX (BroadcastChannel, sin cambios) → pantallas laterales
```

- Solo aparece en **Vista normal** y en la **pantalla central** de ScreenX. Las laterales no muestran el
  botón, no piden la cámara y no descargan MediaPipe: siguen a la central con la sincronización de siempre.
- La cámara se pide al pulsar **Activar gestos**, con `audio: false`. El video no se graba, no se guarda y
  no sale del navegador. Entre ventanas solo viaja la cámara de Street View (rumbo, inclinación, zoom, panorama).
- MediaPipe se descarga la primera vez que se activa. Quien usa mouse o teclado no descarga nada de esto.
- Los gestos llaman a las mismas acciones que el arrastre y la botonera: un solo camino de sincronización.

## Gestos

| Gesto | Qué hace |
|---|---|
| Pinza (pulgar + índice) | Toma el control y fija el punto neutro. Quieta en ese punto = la vista no se mueve. |
| Pinza + mano a tu derecha / izquierda | Gira a la derecha / izquierda. Velocidad proporcional a cuánto te alejas del punto neutro, con máximo. |
| Pinza + mano arriba / abajo | Mira arriba / abajo, con menos sensibilidad y limitada a ±30°. |
| Soltar la pinza o sacar la mano | Alto inmediato; se borra el punto neutro. La siguiente pinza fija uno nuevo (sin saltos). |
| Índice y medio en V, sostenida ~0.45 s, sin pinza | Avanza **un** punto hacia el panorama enlazado más alineado con la vista (±67.5°). Hay que bajar la V para avanzar otra vez. |

Paran el giro y exigen una pinza nueva: usar el mouse, la rueda, el teclado o la botonera sobre la vista;
que la ventana pierda el foco o deje de verse; cambiar de huerta o de modalidad; perder la mano; cambiar
de mano; o un corte de fotogramas.

Estados que se muestran junto al botón: *Buscando mano*, *Mano detectada*, *Mano detectada · pinza*,
*Girando*, *Avanzando*, *Sin camino hacia adelante*, *Cargando caminos…*, *Suelta la pinza para retomar*,
y los errores (*Permiso de cámara denegado*, *No se encontró una webcam*, *La webcam está ocupada…*,
*La webcam se desconectó*, *No se pudo cargar el modelo de gestos*, *Los gestos necesitan HTTPS o localhost*).

## Archivos

| Archivo | Qué hace |
|---|---|
| `avotex-gestos-core.js` | Reglas de los gestos, sin DOM. **Aquí están todos los parámetros ajustables (`DEFAULTS`).** |
| `avotex-gestos.js` | Cámara, carga diferida de MediaPipe, bucle, aplicación del giro, estados y vista previa. |
| `avotex-gestos.css` | Botón, estado y vista previa. |
| `avotex-streetview.js` | Nuevo `look()` (mismo `setPov()` que el arrastre) y `msSincePano()`. |
| `avotex-inmersiva.js` | `navigateStage()` compartido por la botonera y la V; permiso de gestos por modo y rol; interrupciones. |
| `assets/vendor/mediapipe/tasks-vision-1.2.3/vision_bundle.js` | `@mediapipe/tasks-vision` **1.2.3** (bundle IIFE, global `Vision`). |
| `assets/vendor/mediapipe/tasks-vision-1.2.3/wasm/` | `vision_wasm_internal.js` y `.wasm` de la misma versión. |
| `assets/vendor/mediapipe/models/hand_landmarker-float16-v1.task` | Modelo Hand Landmarker (float16, versión 1) de Google. |
| `vercel.json` | Caché inmutable para `assets/vendor/mediapipe/` y `Content-Type` del `.task`. |
| `tests/gestos-core.test.mjs`, `tests/e2e/screenx.e2e.mjs` | Pruebas. |

Para actualizar MediaPipe: copia el paquete nuevo en `assets/vendor/mediapipe/tasks-vision-<versión>/`
(bundle `vision_bundle.js` y la carpeta `wasm` del **mismo** paquete) y cambia `MP_VERSION` en
`avotex-gestos.js`. Como la ruta incluye la versión, la caché inmutable no sirve archivos viejos.
Si cambias el modelo, usa otro nombre de archivo por la misma razón.

## Ajustes (archivo: `avotex-gestos-core.js`, objeto `DEFAULTS`)

| Si… | Toca |
|---|---|
| el giro se siente **lento** | sube `maxYawSpeed` (60 °/s) o baja `fullSpeedAt` (0.20) |
| se siente **brusco** al arrancar | sube `fullSpeedAt` o baja `speedEase` (0.18) |
| se mueve con temblores / es **demasiado sensible** | sube `deadZoneX` (0.045) y `deadZoneY` (0.06) |
| mirar arriba/abajo es demasiado rápido | baja `maxPitchSpeed` (22 °/s); el rango está en `pitchMin`/`pitchMax` (±30°) |
| la pinza **parpadea** (toma y suelta) | separa `pinchClose` (0.34) y `pinchOpen` (0.50) o sube `pinchConfirmFrames` (3) |
| cuesta cerrar la pinza | sube `pinchClose` (p. ej. 0.40; debe seguir por debajo de `pinchOpen`) |
| la V avanza sin querer / tarda | sube / baja `vHoldMs` (450 ms); `vCooldownMs` separa dos avances |
| izquierda/derecha al revés | casilla «Invertir izquierda / derecha» en la vista previa (se recuerda en ese navegador) o `invertX` |
| la página se traba | baja `inferenceFps` (20) primero; luego `maxBusyShare` (0.4) o `captureWidth`/`captureHeight` |
| la laptop tiene buena GPU | prueba `delegate: 'GPU'` y compara los ms por inferencia en la vista previa |

Para probar un valor sin editar archivos, en la consola de la ventana central y **antes** de activar:
`window.AVOTEX_GESTOS_CONFIG = { maxYawSpeed: 80, deadZoneX: 0.06 }`. Los valores definitivos van en `DEFAULTS`.

Las distancias de la pinza son relativas al tamaño de la mano (muñeca → nudillo del dedo medio), así que no
cambian si te acercas o te alejas. Los desplazamientos son fracciones del ancho y alto del encuadre.

## Rendimiento medido (en el contenedor de desarrollo, sin GPU)

ScreenX con tres ventanas de 1600×900, Street View simulado y la capa three.js activa, en Chromium sin
aceleración gráfica (todo por software, peor que cualquier laptop real):

- Delegado `GPU` sobre WebGL por software: 370–570 ms por inferencia, bloqueaba la página. Por eso el
  predeterminado es `CPU`.
- Delegado `CPU`: ~40 ms por inferencia; la ventana central mantuvo su ritmo (~16 cuadros/s, igual que sin
  gestos) y las laterales no cambiaron. El limitador (`maxBusyShare`) bajó solo la detección a 3–7
  inferencias/s en este equipo lento; en una laptop normal debería llegar a las 20/s configuradas.
- No hizo falta un Web Worker. Si en la laptop del stand la vista previa muestra más de ~30 ms por
  inferencia y se nota trabado, primero baja `inferenceFps`; si no basta, el siguiente paso sería mover
  la inferencia a un Worker con `createImageBitmap` del video.

La vista previa muestra MediaPipe, delegado, resolución, ms por inferencia e inferencias reales por segundo.

---

# Guía de pruebas

## A. Prueba local en Vista normal

**Requisitos:** Node 18+ y Chrome o Edge. No hay dependencias que instalar: el sitio es estático.

1. **Arrancar**, desde la raíz del repositorio:
   ```bash
   npx --yes http-server@14.1.1 . -p 5000 -c-1
   ```
   Abre **http://localhost:5000/dashboard.html** (usa `localhost`, no la IP de la red: la cámara solo se
   permite en HTTPS o en `localhost`).
   - Street View en local: `http-server` no ejecuta `/api/maps-config`. Crea `avotex-maps.local.js` en la raíz
     (git lo ignora) con `window.AVOTEX_MAPS_CONFIG = { apiKey: 'TU_CLAVE', version: 'quarterly' };`, usando
     una clave cuya restricción de sitios web incluya `http://localhost:5000/*`. Sin clave verás «Street View no
     está configurado» y los gestos no tendrán panorama que mover.
   - Alternativa con la función de Vercel: `npx vercel link`, `npx vercel env pull` y `npx vercel dev`
     (sirve en http://localhost:3000; agrega `http://localhost:3000/*` a la clave si la usas así).
2. **Entrar:** pestaña *Agricultor* → inicia sesión → **Vista normal → Entrar a mi huerta**. Abajo al centro,
   junto a las flechas, pulsa **Activar gestos** y permite la cámara. Deberías ver *Preparando gestos…* y luego
   *Buscando mano*. Pulsa el ícono de cámara para abrir la **vista previa**.
   - Si dice *No se pudo cargar el modelo*: en DevTools → Red, filtra `mediapipe`; los tres archivos deben dar 200
     (ver C.2).
3. **Direcciones** (mirando la pantalla, con la mano a ~50–80 cm de la webcam):
   - Pinza en el centro del encuadre → *Mano detectada · pinza*; la huerta **no** se mueve.
   - Sin soltar, mueve la mano a **tu derecha** → *Girando*, la flecha de la vista previa dice «→ derecha» y la
     huerta gira a la derecha. A tu izquierda → gira a la izquierda. Si es al revés, marca «Invertir izquierda /
     derecha».
   - Arriba / abajo → mira arriba / abajo, más despacio, y se detiene en ±30°.
   - Regresa al punto inicial → se detiene. Suelta la pinza a medio giro → se detiene de inmediato.
   - Saca la mano del encuadre a medio giro → se detiene y vuelve *Buscando mano*. Al volver, una pinza nueva
     arranca quieta (sin salto).
   - Con la pinza girando, arrastra con el mouse o pulsa una flecha → el giro se detiene y aparece *Suelta la
     pinza para retomar*.
   - En la vista previa, comprueba que la mano cabe en todo el movimiento y que el recuadro punteado (zona muerta)
     sigue a la pinza. Cierra la vista previa para la demo.
4. **Avance con la V:** elige una huerta con flechas de Google sobre el camino (en Street View de calle se ven
   flechas blancas). Gira hasta mirar hacia una flecha, suelta la pinza y levanta índice y medio en V ~medio
   segundo → *Avanzando* y la vista pasa **un** punto. Mantener la V no avanza más; bájala y vuelve a hacerla para
   otro punto. Mirando hacia donde no hay flecha (o en una foto 360° de usuario, que no tiene enlaces) →
   *Sin camino hacia adelante* y la vista no cambia. Justo después de avanzar puede aparecer *Cargando caminos…*.
5. **Fallos sin perder la navegación:**
   - Bloquea la cámara (ícono del candado → Cámara → Bloquear) y pulsa **Activar gestos** → *Permiso de cámara
     denegado*. Arrastra, usa la rueda, las flechas del teclado y la botonera: todo funciona.
   - Con gestos activos, desconecta la webcam USB → *La webcam se desconectó*; el botón vuelve a *Activar gestos*.
   - **Desactivar gestos** → el indicador de cámara del navegador se apaga.
   - Vuelve a permitir la cámara en el candado antes de seguir.

## B. ScreenX (local o Preview)

1. **Asignar pantallas** con el configurador actual (Windows + P → *Extender*; los tres monitores con la misma
   resolución):
   - En la TV: inicia sesión → **Configurar ScreenX** → *Continuar* → **Central**.
   - **Abrir otra ventana** dos veces, arrastra cada una a su monitor, F11, y asigna **Izquierda** y **Derecha**.
   - En la central: *Continuar* → **Entrar a ScreenX**.
   - Sin monitores: haz lo mismo con tres ventanas del mismo navegador, una junto a otra en la misma pantalla.
2. **Solo la central usa la cámara:** el botón **Activar gestos** aparece solo en la central. Actívalo allí. En
   las laterales, DevTools → Red filtrado por `mediapipe` debe quedar vacío y el navegador no debe mostrar el
   indicador de cámara en esas ventanas.
3. **Continuidad:** elige un árbol, poste o curva cerca del borde derecho de la central. Haz la pinza y gira a la
   izquierda despacio: el objeto debe pasar de la central a la lateral derecha y seguir su recorrido. Suelta la
   pinza: **las tres** se detienen. Si el objeto «salta» entre monitores, ajusta con **Calibrar** (es la
   calibración existente, no los gestos).
4. **Un solo avance:** mira hacia una flecha del camino y haz la V → la central avanza un punto y, en menos de
   un segundo, las laterales quedan en el mismo punto con sus ángulos (izquierda = rumbo − 90°, derecha = rumbo
   + 90° con zoom 1). Sostén la V tres segundos: no hay un segundo avance.
5. **Rendimiento y ambiente del stand:**
   - Con la vista previa abierta, revisa la última línea: ms por inferencia e inferencias reales por segundo.
     Bien: < 30 ms y ≥ 12/s. Si el giro se ve a saltos o la página se traba, baja `inferenceFps` a 12–15; luego
     `captureWidth/Height` a 480×270.
   - DevTools → *Rendimiento*: graba 10 s girando; las tareas largas (rojas) deben ser cortas y aisladas.
   - Pide a alguien que pase detrás de ti: el modelo sigue **una** mano. Si la otra persona levanta la mano y
     toma el control, el cambio de mano reinicia el control (alto y pinza nueva). Párate más cerca de la webcam
     que el público y oriéntala para que el fondo sea pared o lona.
   - Prueba con la luz del stand: evita la luz fuerte detrás de ti (contraluz). Si *Buscando mano* parpadea con
     la mano a la vista, mejora la luz frontal o acércate.

## C. Vercel Preview y producción

El repositorio usa la integración Git de Vercel: cada push a una rama genera un **Preview** y el merge a
`main` (por pull request) publica **producción**.

1. **Preview:**
   ```bash
   git push origin <tu-rama>
   ```
   En GitHub, el pull request muestra el enlace de Vercel (o Vercel → proyecto → *Deployments* → el de tu rama
   → *Visit*). La URL es HTTPS (`https://<proyecto>-git-<rama>-<equipo>.vercel.app`).
   - **Google Maps:** la clave de producción está restringida a `https://vex-mx.com/*` y
     `https://www.vex-mx.com/*`, así que en Preview verás «Google rechazó la clave». Opciones: (a) en Google Cloud,
     agrega temporalmente la URL exacta del Preview (`https://<proyecto>-git-<rama>-<equipo>.vercel.app/*`) a la
     clave y quítala después; o (b) crea una segunda clave restringida a esa URL y ponla en Vercel → *Settings →
     Environment Variables* → `GOOGLE_MAPS_API_KEY` solo para **Preview**, y vuelve a desplegar. No abras la
     clave de producción a `*.vercel.app`.
   - Abre `/dashboard.html` en el Chrome o Edge de la laptop del stand, entra y repite A.2–A.4 rápido. La
     cámara se autoriza **por dominio**: el Preview pedirá permiso aunque ya lo hayas dado en localhost.
2. **Si algo falla, DevTools:**
   - **Consola** — `AVOTEX gestos: NotAllowedError` (permiso bloqueado: candado → Cámara → Permitir);
     `NotReadableError` (otra app usa la webcam: cierra Teams, Zoom, OBS); `RefererNotAllowedMapError` o
     *Google rechazó la clave* (falta la URL en la clave de Maps); errores de `WebAssembly` (el `.wasm` no llegó
     o llegó como HTML).
   - **Red**, filtro `mediapipe`: deben aparecer `vision_bundle.js` (200, `application/javascript`),
     `vision_wasm_internal.js` (200), `vision_wasm_internal.wasm` (200, `application/wasm`, ~14.7 MB) y
     `hand_landmarker-float16-v1.task` (200, ~7.8 MB). Un 404 indica que el archivo no se publicó (revisa que
     esté en git); `text/html` indicaría una reescritura, y este proyecto no tiene ninguna.
   - **Sincronización**: si la central gira y las laterales no, revisa el chip *ScreenX · 3 de 3 pantallas*; las
     tres ventanas deben ser del **mismo navegador y perfil** y del **mismo dominio** (no mezclar Preview con
     producción ni con localhost).
3. **Producción:** haz merge del pull request a `main` en GitHub; Vercel publica solo. Luego, en
   `https://vex-mx.com/dashboard.html` (o tu dominio final): autoriza la cámara para ese dominio, repite A.2–A.4,
   cambia de huerta con gestos activos (el giro se detiene y hay que volver a hacer la pinza), vuelve a **Vista
   normal** (la cámara de ScreenX se apaga) y confirma que mouse, rueda, teclado y botonera funcionan con los
   gestos activos y desactivados.
4. **Ensayo completo en el stand** (TV, dos monitores y webcam USB reales):
   1. Laptop conectada a la corriente, plan de energía en alto rendimiento, sin otras apps usando la cámara.
   2. Abre las tres ventanas en Chrome, asigna roles, F11 en cada una, **Entrar a ScreenX**.
   3. En la TV: **Activar gestos**, abre la vista previa, elige la webcam USB en «Webcam» (no la integrada),
      verifica dirección y encuadre, cierra la vista previa.
   4. Recorre: pide «a la izquierda», «a la derecha», «arriba», «abajo» y «avanza»; suelta la pinza entre
      instrucciones y comprueba que las tres pantallas se detienen.
   5. Cambia de huerta con el selector, repite un giro y un avance.
   6. **Desactivar gestos** al terminar. Duración sugerida del ensayo: 10 minutos seguidos, para ver calor y caídas
      de rendimiento.

## Pruebas automáticas

```bash
node --test tests/gestos-core.test.mjs
AVOTEX_CDN_MIRROR=/ruta/node_modules node --test tests/e2e/screenx.e2e.mjs
```

- `tests/gestos-core.test.mjs`: pinza invariable a la distancia, histéresis, confirmación, zona muerta,
  direcciones, inclinación menos sensible y limitada, alto al soltar, pérdida de mano, corte de fotogramas, cambio
  de mano, V única, cancelación manual, inversión y equipos lentos.
- E2E (Chromium): MediaPipe **real** (bundle, WASM y modelo locales, cámara falsa de Chromium) con carga
  diferida y apagado completo; ScreenX con tres ventanas y una mano guionizada (solo la central usa la cámara,
  giro a ambos lados, laterales con sus ángulos, alto al soltar, cancelación con el mouse, una sola V = un solo
  `setPano`, «Sin camino hacia adelante», pérdida de la mano, salida a Vista normal); permiso denegado y sin webcam.
