# Imágenes de escaneo (gesto de pulgar arriba)

Con el gesto de **pulgar arriba** 👍, o con la tecla **E**, las imágenes de esta carpeta tapan la huerta.
El mismo gesto las quita y la huerta vuelve en vista triple, tal como estaba.

| Pantalla | Archivo por defecto |
|---|---|
| Izquierda | `izquierda.jpg` |
| Central | `central.jpg` |
| Derecha | `derecha.jpg` |

En **Vista normal**, las tres imágenes se ven juntas en la misma pantalla.

## Cambiar las imágenes

1. Copia tus imágenes en esta carpeta (`assets/escaneos/`). Formatos: JPG, PNG, WebP, AVIF o GIF.
2. Usa los nombres de la tabla, o pon los nombres de tus archivos en `escaneos.json`:

   ```json
   {
     "izquierda": { "imagen": "aguacate-hoja.png", "titulo": "Hoja con antracnosis" },
     "central":   { "imagen": "aguacate-fruto.jpg", "titulo": "" },
     "derecha":   { "imagen": "aguacate-corte.webp", "titulo": "Corte del fruto" }
   }
   ```

   `titulo` es opcional: si no está vacío, aparece en una etiqueta sobre la imagen.
3. Recarga las tres ventanas.

Recomendaciones:

- Un tamaño parecido al de los monitores (por ejemplo 1920×1080, horizontal) y menos de 1 MB por imagen.
- La imagen ocupa **toda la pantalla**. Si su proporción no es igual a la del monitor, se recortan un poco
  los bordes (arriba y abajo, o a los lados). Deja lo importante del escaneo cerca del centro.
- Al aparecer, la imagen se abre desde el centro con un barrido de luz; empieza en la pantalla izquierda y
  sigue en la central y la derecha.
- Si falta un archivo, esa pantalla lo dice («Falta la imagen…») y las demás siguen funcionando.
