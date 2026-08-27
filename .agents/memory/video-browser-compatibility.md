---
name: Compatibilidad de videos web
description: Regla para videos embebidos que deben funcionar tanto en Chromium como en Safari.
---

Ofrecer WebM/VP9 como primera fuente y MP4/H.264 como respaldo en los videos de reproducción automática.

**Why:** El navegador Chromium del entorno reconoció la URL MP4 pero reportó que no había una fuente reproducible. El mismo clip en WebM/VP9 cargó y avanzó correctamente; MP4 sigue siendo necesario para Safari y dispositivos Apple.

**How to apply:** Al agregar o reemplazar videos decorativos o demostrativos, generar ambos formatos, ordenar WebM antes de MP4 y validar que `currentTime` avance en el navegador.