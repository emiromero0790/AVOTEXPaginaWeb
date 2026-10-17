# Créditos y licencias de recursos visuales

Todas las fotografías externas se usan como **imágenes ilustrativas** (no son huertas ni instalaciones de Avotex)
y así se indica en la página. Se descargaron, recortaron y optimizaron a WebP; no se enlazan URLs externas.

| Archivo en `assets/scroll-story/` | Uso | Fuente | Licencia |
|---|---|---|---|
| `s1-huerta*.webp` | Hero: huerta de aguacate y ladera | Pexels · Juan Diavanera · https://www.pexels.com/photo/lush-avocado-and-banana-grove-scenic-landscape-34203018/ | Licencia Pexels (uso comercial gratuito, sin atribución obligatoria) |
| `s1-fg-rama*.webp` | Primer plano recortado con alfa (rama y fruto) | Pixabay · https://pixabay.com/photos/avocado-fruit-healthy-tree-4050456/ | Licencia de contenido de Pixabay |
| `s2-rama*.webp` | Rama con aguacates | Pexels · Quang Nguyen Vinh · https://www.pexels.com/photo/green-avocado-fruits-hanging-on-a-tree-14023214/ | Licencia Pexels |
| `s3-fruto*.webp` | Macro del fruto (escena de observación) | Pixabay · https://pixabay.com/photos/avocado-fruit-healthy-tree-organic-1400462/ | Licencia de contenido de Pixabay |
| `s4-hoja.webp` | Macro de hoja con nervaduras | Unsplash · https://unsplash.com/photos/green-leaf-in-close-up-photography-tSiHPckTtMU | Licencia Unsplash |
| `s5-terreno.webp` | Vista aérea de huerta con caminos | Unsplash · https://unsplash.com/photos/an-aerial-view-of-a-dirt-road-surrounded-by-trees-IaotSa_FnEI | Licencia Unsplash |
| `s6-campo*.webp` | Cierre: huerta con luz de tarde (también fondo de Contacto) | Unsplash · https://unsplash.com/photos/golden-sunlight-filters-through-lush-green-trees-nFWSaywVJNU | Licencia Unsplash |

Las imágenes elegidas aparecían como contenido gratuito (no Unsplash+). Conviene que el equipo revise cada
página de origen antes de la etapa nacional, porque las condiciones pueden cambiar.

## Añadidos en la revisión 2 (octubre 2026)

| Archivo | Uso | Fuente | Licencia |
|---|---|---|---|
| `assets/fruto/aguacate-entero.webp` | Aguacate Hass entero (inicio, anatomía, trips) | Unsplash · https://unsplash.com/photos/a-single-avocado-on-a-reflective-black-surface-l__L7I_3P88 (recortado) | Licencia Unsplash |
| `assets/fruto/mitad.webp`, `capa-*.webp` | Corte y capas: cáscara, pulpa, endocarpio, semilla | Unsplash · https://unsplash.com/photos/two-green-round-fruits-on-gray-textile-xEFoRSMT-x4 (recortado y separado en capas) | Licencia Unsplash |
| `assets/fruto/costra-fruto.webp` | Lupa de costra y escena de observación | `images/mediaworks-13.png`, ya incluida en el sitio. **Conviene confirmar su origen y licencia** | Por confirmar |
| `assets/fruto/dano-*.webp` | Antracnosis, trips y daño en semilla | Ilustración propia generada por código, etiquetada en la página como representación explicativa | Propia |
| `assets/satelite/sentinel-*.webp` | Región Pátzcuaro–Zirahuén, 29 nov 2024 (color natural); el NDVI usa también la escena del 14 mar 2025 | Copernicus Sentinel-2 L2A vía Earth Search (Element 84, AWS Open Data) | Uso libre con atribución: «Contiene datos modificados de Copernicus Sentinel (2024–2025)» |
| `assets/satelite/ndvi-*.webp` | NDVI y cambio entre fechas | Calculado con las bandas B04 y B08 de las mismas escenas | Igual que arriba |
| Mapa de México (SVG en línea) | Escena «Tres de cada cuatro» | Natural Earth, admin-1 | Dominio público |
| `assets/app/app-diagnostico-scrub.mp4` / `.webm` | Teléfono de observación e IA | Recortes de `images/video2.mp4` (grabación real), codificados con GOP corto | Propia |
| `images/avotex3.jpeg` | Historial en el teléfono | Captura real de la app, ya existente | Propia |

Fuentes agronómicas citadas en la página: SENASICA, *Manual de identificación de las principales plagas del
aguacate* (2018); Rodríguez-López, González-Prieto y Mayek-Pérez, *Rev. Mex. Fitopatología* 27 (2009).

## Recursos propios de Avotex

- `assets/app/*.webp`: fotogramas extraídos de las grabaciones reales de la app (`images/video1.mp4`,
  `video2.mp4`, `video3.mp4`).
- `assets/app/app-mapeo-scrub.mp4` / `.webm`: tramo de 9.5 s de `images/video1.mp4` (módulo de mapeo),
  codificado con GOP corto para sincronizarlo con el scroll.
- `assets/demo/*.mp4`: las mismas tres grabaciones recomprimidas sin audio (de 48 MB a 2.2 MB en total).
- Logotipos, fotos de cultivos y logos de aliados: carpeta `images/` existente, sin modificar.

## Curvas de nivel

Las curvas de nivel del mapa se generaron a partir de la luminosidad de la fotografía aérea. Son un recurso
gráfico: no son datos topográficos reales, y la página lo indica junto con los marcadores de demostración.

## Librerías

- GSAP 3.13.0 + ScrollTrigger + DrawSVGPlugin, en `assets/vendor/gsap/` (licencia estándar de GSAP, gratuita
  para uso comercial desde la versión 3.13).
