# MediaPipe Tasks Vision (control por gestos)

Se sirven desde el propio sitio para que funcionen igual en local, Vercel Preview y producción,
sin depender de una CDN durante la demo.

| Archivo | Origen | Licencia |
|---|---|---|
| `tasks-vision-1.2.3/vision_bundle.js` | npm `@mediapipe/tasks-vision@1.2.3`, `vision_bundle.js` (IIFE, global `Vision`) | Apache-2.0 |
| `tasks-vision-1.2.3/wasm/vision_wasm_internal.js` y `.wasm` | mismo paquete, carpeta `wasm/` | Apache-2.0 |
| `models/hand_landmarker-float16-v1.task` | https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task | Apache-2.0 (modelo de Google MediaPipe) |

Se quitó solo el comentario `//# sourceMappingURL` de los dos `.js` (los mapas no se publican).

SHA-256:
- `hand_landmarker-float16-v1.task`: `fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1`
- `vision_wasm_internal.wasm`: `225bc06c0f51a9cf31fea0e9e0b0243e9e01fb5ef332cc1a7fa6656dbdfdaabf`

Aviso de privacidad de MediaPipe: https://goo.gle/mediapipe-privacy. En AVOTEX el procesamiento ocurre
en el navegador; el video de la webcam no se graba ni se envía.

Para actualizar: copia la versión nueva en `tasks-vision-<versión>/` (bundle y `wasm` del mismo paquete)
y cambia `MP_VERSION` en `avotex-gestos.js`. Ver `docs/GESTOS.md`.
