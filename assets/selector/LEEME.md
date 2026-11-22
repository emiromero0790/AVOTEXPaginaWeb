# Fondo animado del selector «¿Cómo quieres explorar tu huerta?»

Coloca aquí el clip definitivo de la huerta con estos nombres exactos:

- `huerta-loop.webm` (VP9 o AV1) y/o `huerta-loop.mp4` (H.264)

Recomendaciones: 8–15 s en bucle sin corte visible, cámara fija, movimiento lento (ramas con viento,
cambios suaves de luz), sin audio, 1920×1080, menos de 4 MB. El velo verde y la red luminosa se
aplican encima, así que no hace falta oscurecer el video.

Cómo funciona (`syncSelectorBackground` en `avotex-inmersiva.js`):

- Sin archivo aquí, el fondo es la foto `assets/acceso/huerta-hileras.webp` con capas animadas por CSS
  (deriva lenta, luz que cambia y follaje de primer plano `assets/scroll-story/s1-fg-rama-m.webp`).
- Con archivo, el video se reproduce silenciado en bucle sobre la foto en cuanto puede reproducirse.
  Si falla la carga o la reproducción, se queda la foto.
- Con «reducir movimiento» activado en el sistema, no se reproduce el video y las capas quedan quietas.
- La foto siempre se carga primero como respaldo estático.

Para usar otra foto base, cambia `src`/`srcset` de `.sel-bg-photo` en `admin.html` y la URL de
`.pv-screen` (previsualizaciones) en `avotex-recorrido.css`.
