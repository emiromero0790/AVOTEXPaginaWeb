# Rediseño de index.html · it'sVEX

## Cómo instalar
Copia en la raíz del proyecto (reemplazando index.html):
- index.html
- vex.css (nuevo)
- vex.js (nuevo)
- assets/vex/ (nuevo: 6 imágenes .webp optimizadas)

style.css y script.js NO se tocaron: la portada ya no los carga, pero otras páginas (avisos de privacidad, login) pueden seguir usándolos.

## Librerías
Ninguna nueva. Usa GSAP + ScrollTrigger que ya están en assets/vendor/gsap (los carga avotex.html).

## Assets nuevos (assets/vex/)
Copias en WebP de imágenes que ya existían, para que la página pese menos (de ~4.8 MB a ~300 KB):
- ffd-dashboard.webp, ffd-pos.webp, ffd-erp.webp, ffd-pagar.webp  (de images/Dashboard.png, POS.png, ERP.png, Pagar.png)
- bu-paciente.webp, bu-sesion.webp  (de assets/z6e7fs5trhrmt0d0yewbqetez0.png y z8k7xpxd7xrmy0d0yev8mvwpy0.png)

## Narrativa de scroll (escritorio)
1. Hero: it'sVEX está cortado en 5 tiras; al bajar, cada tira se desplaza en sentido contrario, crecen franjas blancas entre ellas y la franja que asoma abajo sube hasta volver blanca la pantalla.
2. Método (fondo blanco): 4 capas reales (dashboard web, app, cobro POS, diagnóstico IA). Una franja negra barre el marco y revela la siguiente. Sale con un bloque negro que sube.
3. Intertítulo "Proyectos": la palabra viaja impresa sobre una franja blanca.
4. Frutas Finas Durán (negro): la cámara se asienta sobre el dashboard; POS, ERP y cobro entran a distinta velocidad. Salen surcos blancos desde abajo.
5. AVOTEX (pico): la pantalla blanca se abre por surcos y aparece la huerta aérea; la franja con el texto entra por la izquierda, la app (grabación real) sube al frente y llega el NDVI. Sale con una franja blanca de izquierda a derecha.
6. Between Us: la "u" y la "s" de su logo se acercan hasta casi tocarse. Sale con una franja negra desde la derecha.
7. Servicios: una franja blanca cruza cada fila y la invierte (al final la lista queda blanca).
8. Proceso: una franja negra avanza por las 4 etapas.
9. Cierre: dos franjas llegan desde los extremos y giran hasta formar la X de VEX detrás de "¿Qué podemos construir contigo?".

En móvil no hay pines salvo el hero (más corto): las escenas usan revelados simples ligados al scroll. Con "reducir movimiento" la página es estática y completa. Sin JavaScript todo el contenido se ve.

## Se conservó
Logo VEX, navegación (ahora un folio fijo con capítulo actual + índice accesible con Esc y foco atrapado), enlaces a avotex.html, betweenus.html y avisosprivacidad.html, widget de ElevenLabs con el mismo agent-id, correo dev@vex-mx.com (CTA con mailto).

## Se quitó (por no estar respaldado o ser marcador de posición)
- Cifras: "50+ proyectos entregados", "-70% errores manuales", "100% control operativo", "90% reducción en pérdidas". Valídalas si quieres reponer alguna.
- Testimonio "Cesar D. · Director, Empresa" (cargo genérico, sin forma de verificar).
- Redes Facebook / LinkedIn / Twitter que apuntaban a las páginas genéricas, y el Instagram @avotex.mx como red de VEX (es de AVOTEX).
- Newsletter que mostraba "¡Gracias por suscribirte!" sin integración.
- Enlace "www.vex-mx.com" que en realidad apuntaba a vexmx.shop.
- All In Your Mind Yucatán: no aparece en ninguna parte del nuevo index.html.

## Verificado
Capturas en Chromium headless: escritorio 1440x900, móvil 390x844 y movimiento reducido; sin errores de JS; sin scroll horizontal; menú abre, cierra con Esc y navega.

## Revisar a mano
- Las fuentes (Space Grotesk + Manrope de Google Fonts) no cargaron en mi entorno; verifiqué con fuente de respaldo. El ancho de it'sVEX se ajusta solo con JS, pero conviene mirarlo con las fuentes reales.
- iPhone/Android reales (autoplay del video de AVOTEX, scroll táctil).
- No había un video blanco y negro para el hero; el hero se resolvió con planos tipográficos y franjas. Si tienes uno, se puede añadir como capa trasera.

---

# Ronda 2 (19 oct 2026)

## Qué cambió
- **Navbar:** ahora incluye AVOTEX y Between Us (enlazan a avotex.html y betweenus.html). Entre 1100 y 1280 px se ocultan "Proyectos" y "Servicios" para que quepa; abajo de 1100 px todo queda en el Índice.
- **Títulos que se aclaran:** los títulos marcados con `data-fill` empiezan oscuros (o claros en fondo blanco) y se iluminan palabra por palabra, de izquierda a derecha, conforme bajas. Se usa en el nuevo manifiesto, el índice de proyectos, los títulos de cada escena de proyecto, "Lo que construimos" y las cuatro palabras del proceso.
- **Manifiesto nuevo** tras el hero: un párrafo fijo que se ilumina mientras haces scroll.
- **Índice de proyectos** (como tu referencia 1): número grande, miniatura compuesta (pantalla + móvil/modal/Phil) y una etiqueta "Ver caso" que sigue al cursor.
- **Frutas Finas Durán, 3 escenas:**
  1. Mapa del sistema: los módulos (punto de venta, ERP, ventas, inventario, compras y proveedores, clientes y crédito, gastos y cuentas, reportes) se encienden fila por fila y las conexiones se dibujan (como tu referencia 2).
  2. Recorrido de cámara por el dashboard real: se detiene en módulos, indicadores, análisis, alertas y movimientos, con el texto de cada parada.
  3. Dos accesos, un sistema: el POS y el ERP entran desde lados opuestos y el cobro sube entre ellos.
- **AVOTEX, 4 escenas (sigue siendo el pico):**
  1. La huerta aérea se abre por surcos.
  2. Diagnóstico: el scroll avanza la grabación real de la app (captura, análisis, resultado) y el paso activo se ilumina.
  3. Mapeo: el scroll avanza la grabación del mapeo mientras el NDVI barre la imagen Sentinel-2.
  4. Seis cultivos en recorrido lateral.
- **Between Us, 2 escenas:** las letras "us" se cierran; luego un recorrido lateral por los tres pasos (invitar, contar, llegar con contexto) mientras Phil, el ave de la app, gira.
- **Proceso** (como tus referencias 3 y 4): Entender, Diseñar, Desarrollar y Evolucionar en grande, cada una se ilumina al pasar y a la izquierda un dibujo de líneas crece con cada etapa.
- La franja del hero ya no tacha "y marketing digital".
- **Largo:** ~42 pantallas en escritorio (antes ~22), ~35 en móvil. Con movimiento reducido ~20 y todo legible.

## Assets nuevos
- `assets/vex/phil-giro.webp`: las 6 vistas de `assets/phil.png` con fondo transparente, en tira, para que Phil gire con el scroll (23 KB).
- Se usan assets que ya estaban en el repo: `assets/app/app-diagnostico-scrub.{webm,mp4}`, `assets/app/app-mapeo-scrub.{webm,mp4}`, `assets/fruto/costra-fruto.webp`, `assets/cultivos/viaje/*.webp`, `assets/scroll-story/s3-fruto.webp`, `assets/satelite/*`.

## Importante para el servidor
Los videos que avanzan con el scroll necesitan que el hosting responda a peticiones de rango (`Range`, código 206). Vercel, Netlify, Nginx, Apache y casi cualquier hosting lo hacen; el servidor simple de Python (`python -m http.server`) no, y ahí los videos se quedan en el primer cuadro.

---

# Ronda 3 (19 oct 2026): capturas reales de Between Us y marco de iPhone

- **Marco SVG de iPhone** (`assets/vex/iphone.svg`): proporciones de un iPhone actual (cuerpo de titanio, bisel negro, isla dinámica, botón de acción, volumen y encendido). La pantalla queda transparente y la captura o el video van debajo (`.device` en vex.css). Se usa en Between Us y también en los teléfonos de AVOTEX (diagnóstico, mapeo e índice de proyectos), para que todo el sitio use el mismo teléfono.
- **Between Us con capturas reales:**
  - Escena "us": el teléfono del paciente (inicio con Phil) y el del terapeuta (invitar paciente) se acercan junto con las letras.
  - Recorrido lateral con 4 pantallas: bienvenida ("¿Quién eres?"), invitar paciente, "¿Cómo te sientes hoy?" + "¿Qué pasó?", y "Tu consultorio". Phil sigue girando a la izquierda.
  - La miniatura del índice usa la portada de la app y la pantalla de inicio.
- Las fotos de stock de Between Us ya no se usan en la portada (`bu-paciente.webp` y `bu-sesion.webp` puedes borrarlas si quieres).

Assets nuevos en `assets/vex/`: `iphone.svg` y `bu-app-portada`, `bu-app-bienvenida`, `bu-app-inicio`, `bu-app-invitar`, `bu-app-checkin`, `bu-app-que-paso`, `bu-app-registros`, `bu-app-consultorio` (.webp, 720 px de ancho, ~25 a 36 KB cada una).

**Revisar:** la captura "Tu consultorio" muestra el nombre "Emiliano" en actividad reciente. Si no es un usuario de prueba, conviene reemplazar esa captura por una con datos de demostración.
