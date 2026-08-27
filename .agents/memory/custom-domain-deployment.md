---
name: Dominio y publicación
description: Cómo distinguir una publicación de Vercel del deployment de Replit cuando el dominio personalizado muestra otra versión.
---

Un dominio personalizado puede seguir sirviendo una publicación de Vercel aunque el proyecto importado en Replit no tenga un deployment activo. Las cabeceras del dominio y el estado oficial de publicación son la fuente más fiable para separar un problema de hosting/caché de un problema del código.

**Why:** La preview local y el dominio pueden tener los mismos archivos, pero no compartir proveedor, caché ni momento de publicación; depurar solo la preview puede llevar a conclusiones equivocadas.

**How to apply:** Ante una diferencia entre preview y dominio, comparar primero las respuestas de los recursos críticos y confirmar qué plataforma atiende el dominio antes de cambiar rutas o reestructurar el sitio.