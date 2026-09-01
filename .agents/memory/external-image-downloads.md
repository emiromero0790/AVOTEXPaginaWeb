---
name: Imágenes externas durables
description: Criterio para incorporar imágenes encontradas en la web sin depender de hotlinks frágiles.
---

Guardar en el proyecto cualquier imagen externa usada por la interfaz y verificar que el archivo descargado sea una imagen válida antes de referenciarlo.

**Why:** Algunos CDN de resultados de búsqueda bloquean descargas directas con 403, aunque la miniatura sea visible en el buscador. Hotlinkearlos dejaría recursos rotos en la página.

**How to apply:** Al agregar fotografías web, probar la descarga con un cliente de navegador, conservar solo fuentes que permitan obtener el archivo y confirmar tipo y respuesta HTTP desde el servidor local.