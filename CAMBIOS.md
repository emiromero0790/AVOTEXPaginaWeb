# Rediseño cinematográfico de la landing Avotex · notas de entrega

## Qué contiene el zip

| Ruta | Estado |
|---|---|
| `avotex.html` | Reescrito |
| `avotex.css` | Reescrito (solo estilos de la landing) |
| `avotex.js` | Reescrito |
| `assets/scroll-story/` | Nuevo: fotografías del plano secuencia (WebP, escritorio y móvil) |
| `assets/app/` | Nuevo: fotogramas reales de la app y el clip de mapeo para el scroll |
| `assets/demo/` | Nuevo: las tres grabaciones de la app recomprimidas (2.2 MB en total) |
| `assets/vendor/gsap/` | Nuevo: GSAP 3.13.0, ScrollTrigger y DrawSVG servidos localmente |
| `BRIEF.md`, `CREDITS.md`, `CAMBIOS.md` | Documentación |

Copia todo en la raíz del sitio, junto a `images/` y `attached_assets/`. No se modificó ningún archivo de `images/`.

## Inventario de funcionalidades y cómo se conservaron

| Funcionalidad | Estado |
|---|---|
| Navegación: Características/Producto, Demo, Planes, Avisos de Privacidad, VEX, «Administra tu huerta» (`dashboard.html`) | Se conservan los enlaces y los IDs `navFeaturesLink`, `navDemoLink`, `navPlansLink`. Se añadieron Historia, Cultivos y Contacto. Menú móvil con `aria-expanded` y cierre con Escape |
| Anclas `#features`, `#demo`, `#pricing`, `#contact`, `#alliances` | Siguen existiendo |
| Modal de planes: crear cuenta en Firebase Auth y registrar tokens en Supabase | Mismo código, mismas credenciales y mismas funciones globales (`openPlanModal`, `goToStep2`, `createAccount`…). Se añadió foco al abrir y devolución del foco al cerrar |
| Paso de PayPal | Se mantiene como estaba: es una **simulación** existente y sigue rotulada así |
| Formulario de contacto con EmailJS | Mismo servicio, plantilla y llave pública. El aviso con `alert()` se cambió por un mensaje dentro del formulario. El SDK se actualizó a `@emailjs/browser@4.4.1` (el anterior mostraba una advertencia de versión insegura); la API `init` / `send` es compatible |
| Agente de voz ElevenLabs | Se conserva |
| Loader con frutas | Se conserva el diseño, ahora sobre fondo bosque. Antes esperaba **todas** las imágenes y videos de la página; ahora solo espera el hero y las tipografías (máximo 4 s, respaldo de 8 s) |
| Instagram, correo, copyright | En contacto y pie de página |

**Eliminado a propósito:**
- El segundo manejador del formulario que había en `avotex.js`: simulaba un envío exitoso con `setTimeout` y se ejecutaba junto con el envío real de EmailJS.
- Las cifras sin respaldo documental: «95 % de precisión», «+1000 huertas protegidas», «24 enfermedades detectadas», y en el carrusel «Confianza 100 %» y «0.8 s».

## Ajustes de contenido para credibilidad (por favor confirmen)

1. **Precisión del modelo.** La tarjeta del Plan Básico decía «85–90 % de precisión»; la bitácora del proyecto dice «entre 85 y 95 %». La sección Evidencia usa 85–95 % y la tarjeta ahora dice «Análisis con IA basado en CNN» para no mostrar dos cifras distintas. Confirmen cuál es la oficial.
2. **Infraestructura.** La tarjeta decía «React Native / Supabase / Firebase». La documentación indica GCP como única infraestructura, así que quedó «Acceso a la app móvil». El código del modal sigue usando Firebase y Supabase porque así funciona hoy.
3. **Aliados.** Antes se presentaban como «convenios». Ahora: Disfruta Mich, convenio firmado; FIRA, reuniones de validación institucional; EOSDA, proveedor satelital del plan Pro.
4. **Cultivos.** Solo el aguacate aparece como modelo operativo (TRL 7). Limón, mango, café, guayaba y berries aparecen «en desarrollo, TRL 4 a 5».
5. **Diagnóstico.** La app escanea frutos («Escanear fruto»). El escaneo del recorrido ocurre sobre un fruto; la hoja solo se usa para la transformación visual a mapa.
6. **Reconocimientos.** «Ganador de las etapas local y regional de InnovaTecNM 2026» y «Marca Avotex en trámite ante el IMPI».
7. **Sistema web.** No había capturas auténticas de «Administra tu huerta», así que no se muestra una computadora con un dashboard. Si comparten capturas reales, se pueden añadir a la escena del ecosistema.

## Arquitectura técnica

- Se mantiene HTML, CSS y JavaScript tradicional, sin framework ni build.
- El plano secuencia es una sola escena fijada (`ScrollTrigger` con `pin` y `scrub`) y una sola línea de tiempo de GSAP en unidades 0 a 100. Los puntos de transición se ajustan en `STORY` y en los comentarios de cada escena de `avotex.js`.
- `gsap.matchMedia` reconstruye la línea de tiempo al cambiar entre escritorio y móvil, y la desmonta con movimiento reducido.
- **Sin JavaScript, si GSAP no carga, o con `prefers-reduced-motion`:** las seis escenas se apilan como secciones normales con su texto, sus capturas y el mapa ya dibujado. No hay scroll fijado ni contenido oculto.
- Solo se animan `transform` y `opacity`, además de un `clip-path` en un momento: cuando el mapa entra en la pantalla del teléfono.
- La grabación real del mapeo se descarga al acercarse a su escena y su `currentTime` sigue al scroll (MP4 H.264, con WebM VP9 como alternativa).

## Qué se verificó (Chromium sin interfaz, 1440×900 y 390×844)

- Capturas a lo largo de todo el recorrido en escritorio y móvil, bajando y subiendo: las escenas y el riel de capítulos responden igual en ambas direcciones.
- Movimiento reducido: escenas apiladas y legibles.
- Botones del riel y «Descubre cómo funciona»: saltan al punto correcto de la historia.
- Enlace «Planes»: llega a la sección sin quedar tapado por la barra.
- Modal: abre con el plan correcto, valida la contraseña, muestra el paso 2 con precio y tokens, y cierra con Escape. Firebase y EmailJS cargan.
- Menú móvil, sin desbordamiento horizontal, y sin errores de JavaScript en consola.

## Qué no se pudo verificar

- El alta real en Firebase/Supabase y el envío real de EmailJS: no se crearon cuentas ni se enviaron correos de prueba.
- `attached_assets/` no venía en el zip. La captura de App Store se carga desde ahí y, si falta, se oculta sola.
- Un teléfono físico (iOS Safari, modo de bajo consumo, scroll táctil real). Recomendado antes del evento.
- El widget de ElevenLabs ocupa la esquina inferior derecha; en móvil, el texto del recorrido se subió para dejarle espacio.

## Ronda 2 (9 de octubre de 2026)

- **Tipografía:** los titulares pasan de Instrument Serif (serif condensada) a **Geist** 600, una sans moderna con tracking cerrado. El texto corrido sigue en Montserrat. Los énfasis ya no van en cursiva: se marcan con color.
- **Datos en las primeras escenas de aguacate:**
  - Sobre la huerta: «Tres de cada cuatro aguacates mexicanos crecen aquí». México produjo 2.9 M de toneladas en 2023 y Michoacán aporta el 75 % (SADER, 2024).
  - Sobre la rama: «Lo que no se detecta a tiempo se pierde en la cosecha». Hasta 30 % de pérdida de rendimiento por diagnóstico tardío (SENASICA, 2022); 77.8 % de los productores con menos de 5 ha y 98 % dependiente de asistencia técnica externa e intermitente (Sangerman-Jarquín et al., 2014).
  - Todas las cifras vienen de la Memoria Técnica y de la Descripción de la problemática del proyecto, y cada bloque muestra su fuente.
- **Escáner más visible:**
  - Velo oscuro fuera del encuadre y esquinas más gruesas que se dibujan con un ligero zoom de entrada.
  - Marco punteado, marcas de centro y retícula dentro del encuadre.
  - Barrido luminoso que baja y vuelve a subir con el scroll.
  - Región de interés con cruz y puntos, etiqueta «Región de interés» e indicador «Analizando superficie» con pulso.
  - Sigue rotulado como representación ilustrativa.
