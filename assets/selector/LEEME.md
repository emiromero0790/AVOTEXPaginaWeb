# Fondo animado del selector «¿Cómo quieres explorar tu huerta?»

Coloca aquí el clip definitivo de la huerta con estos nombres exactos:

- `huerta-loop.webm` (VP9 o AV1) y/o `huerta-loop.mp4` (H.264)

Recomendaciones: 8–15 s en bucle sin corte visible, cámara fija, movimiento lento (ramas con viento,
cambios suaves de luz), sin audio, 1920×1080, menos de 4 MB. El velo oscuro se
aplica encima, así que no hace falta oscurecer el video.

Cómo funciona (`syncSelectorBackground` en `avotex-inmersiva.js`):

- Sin archivo aquí, el fondo es la foto `assets/acceso/huerta-surcos.webp` (en tres paneles) con capas de
  profundidad: luz, neblina y follaje de primer plano (`assets/scroll-story/s1-fg-rama-m.webp`,
  `assets/cultivos/viaje/f5-near-m.webp`) que siguen al puntero (`avotex-huerta.js`).
- El video se pinta sobre los tres paneles: mientras se reproduce, el efecto de «una pantalla / tres pantallas»
  al señalar una tarjeta no se ve. Si se quiere conservar ese efecto, es mejor no poner video.
- Con archivo, el video se reproduce silenciado en bucle sobre la foto en cuanto puede reproducirse.
  Si falla la carga o la reproducción, se queda la foto.
- Con «reducir movimiento» activado en el sistema, no se reproduce el video y las capas quedan quietas.
- La foto siempre se carga primero como respaldo estático.

Para usar otra foto base, cambia `src`/`srcset` de las tres `.sel-bg-photo` en `admin.html` y la URL de
`.pv-screen` (previsualizaciones) en `avotex-huerta.css`.
