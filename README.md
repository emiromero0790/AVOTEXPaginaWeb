# Doblaje Masters (dubbing-audio)

Aplicación local para doblar videos del español al inglés. Toma un video (de esta PC o de Zoho WorkDrive), extrae el audio, separa la voz del fondo, transcribe con WhisperX, revisa términos con Claude, traduce con DeepL, genera la voz en inglés con ElevenLabs, sincroniza todo y arma el video doblado. Opcionalmente lo publica en Vimeo.

Al entrar a la biblioteca se elige qué se va a doblar:

| Modo | Para qué | Qué entrega |
|------|----------|-------------|
| **Masters** | Clases y videos largos. Es el pipeline de siempre. | Un video (el original) con subtítulos en español e inglés y la pista de audio en inglés para Vimeo. |
| **Promos** | Videos promocionales. Mismo pipeline, con **lip sync**: los labios de quien habla se ajustan a la voz en inglés. | Dos videos separados, uno en español y otro en inglés, que se suben a WorkDrive (a Vimeo no). |

Los detalles de Promos están en la [sección 7](#7-promos-doblaje-con-lip-sync).

La aplicación es de uso interno, pero **cada persona entra con su usuario**: lo que hace con el pipeline y lo que cuesta cada proceso queda registrado a su nombre. Cómo crear usuarios, cómo entrar y dónde se guarda el registro está en la [sección 8](#8-usuarios-inicio-de-sesión-y-registro-de-actividad).

El proyecto tiene dos partes:

| Carpeta     | Qué es                                   | Tecnología                                   |
|-------------|------------------------------------------|----------------------------------------------|
| `backend/`  | API local y pipeline de doblaje          | Python, FastAPI, WhisperX, audio-separator, FFmpeg |
| `frontend/` | Interfaz web                             | Vue 3, Vite, TypeScript, pnpm                |

```
dubbing-audio/
├── backend/
│   ├── app.py                  ← API local (puerto 8765)
│   ├── main.py                 ← orquestador del pipeline de Masters (pasos 1 a 7)
│   ├── main_promos.py          ← pipeline de Promos: usa main.py y agrega el lip sync (paso 8)
│   ├── lipsync.py              ← lip sync con sync.so (o LatentSync local)
│   ├── vimeo_origen.py         ← Vimeo como origen: listar y descargar videos de la cuenta
│   ├── lotes.py                ← varios videos en cola (Masters): planificador con la GPU de a uno
│   ├── costos.py               ← modelos de Claude, precios en línea, costo estimado y real
│   ├── usuarios.py             ← usuarios, contraseñas y sesiones (SQLite) + consola para administrarlos
│   ├── actividad.py            ← registro de quién hizo qué y cuánto costó cada proceso
│   ├── acceso.py               ← inicio de sesión y protección de todas las rutas de la API
│   ├── datos/doblaje.db        ← base SQLite con usuarios y registro (se crea sola, NO se sube a git)
│   ├── 1-extraerAudio.py … 7-sincronizar_dobla.py
│   ├── requirements.txt
│   ├── voces.json              ← voces fijas de ElevenLabs
│   ├── voces_guardadas.py      ← "Voces de oradores": personas con su voz (archivos, sin base de datos)
│   ├── voces_guardadas/        ← una carpeta por persona: voz.json + foto.jpg (SÍ se sube a git)
│   ├── .env                    ← credenciales (NO se sube a git, lo creas tú)
│   ├── herramientas_ffmpeg/    ← se crea sola
│   ├── modelos_separacion/     ← se crea sola (modelo de separación de voz)
│   ├── cache_voces/            ← se crea sola
│   └── trabajo/                ← se crea sola (un subfolder por video procesado)
├── frontend/
│   ├── src/                    ← código de la interfaz (.vue y .ts)
│   ├── index.html
│   ├── package.json
│   ├── tsconfig.json
│   └── vite.config.ts
├── dev.py / dev.bat            ← desarrollo: levanta backend y frontend juntos
├── iniciar.bat                 ← abre la aplicación (uso normal)
└── README.md
```

---

## 1. Requisitos previos

Instala todo esto **antes** de empezar. Los comandos de esta guía son para **Windows** con **PowerShell** (la terminal por defecto de VS Code).

| Programa | Versión | Para qué | Descarga |
|----------|---------|----------|----------|
| Git | cualquiera reciente | Clonar el repositorio | https://git-scm.com/download/win |
| Python | **3.11 o 3.12 (64 bits)** | Backend | https://www.python.org/downloads/windows/ |
| Node.js | **22 LTS** (mínimo 20) | Frontend | https://nodejs.org/ |
| Driver de NVIDIA | reciente (570 o superior) | Usar la GPU | https://www.nvidia.com/Download/index.aspx |
| Visual C++ Redistributable (x64) | última | Lo necesita PyTorch en Windows | https://aka.ms/vs/17/release/vc_redist.x64.exe |

Notas importantes:

- **Python:** en el instalador marca la casilla **"Add python.exe to PATH"**. No uses Python 3.13 o superior: algunas librerías de audio todavía no son compatibles.
- **GPU:** el proyecto funciona sin tarjeta NVIDIA, pero la transcripción y la separación de voz son **muchísimo** más lentas en CPU. No hace falta instalar el "CUDA Toolkit": las librerías de CUDA se instalan con `pip`.
- **Espacio en disco:** reserva al menos **15 GB** (PyTorch, modelos de Whisper, modelo de separación y los videos de trabajo).

Verifica que todo quedó instalado abriendo una terminal nueva:

```powershell
git --version
python --version      # debe decir 3.11.x o 3.12.x
node -v               # debe decir v20 o superior
nvidia-smi            # solo si tienes GPU NVIDIA: muestra tu tarjeta
```

---

## 2. Clonar el proyecto

```powershell
git clone <URL-DEL-REPOSITORIO> dubbing-audio
cd dubbing-audio
```

---

## 3. Backend (Python)

Todos los comandos de esta sección se ejecutan **dentro de `backend/`**.

### 3.1 Crear y activar el entorno virtual

```powershell
cd backend
python -m venv entorno
.\entorno\Scripts\Activate.ps1
```

Cuando está activo, la terminal muestra `(entorno)` al inicio de la línea. **Cada vez** que abras una terminal nueva para el backend tienes que volver a activarlo con `.\entorno\Scripts\Activate.ps1`.

> Si PowerShell responde *"la ejecución de scripts está deshabilitada en este sistema"*, ejecuta esto una sola vez y vuelve a intentar:
> ```powershell
> Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
> ```

### 3.2 Instalar las dependencias

```powershell
python -m pip install --upgrade pip
pip install -r requirements.txt
```

Esto tarda bastante (PyTorch con CUDA pesa varios GB). Instala, entre otras cosas:

- **FastAPI + Uvicorn:** la API local.
- **Usuarios y registro de actividad:** no agregan ninguna librería. Usan `sqlite3` y `hashlib`, que vienen con Python.
- **PyTorch (CUDA 12.8), WhisperX y faster-whisper:** transcripción e identificación de oradores.
- **audio-separator[gpu]:** separación de la voz y el fondo.
- **imageio-ffmpeg:** trae su propio FFmpeg (ver 3.3).
- **anthropic, deepl, elevenlabs, requests:** servicios externos.

El lip sync de Promos no agrega ninguna librería: habla con sync.so usando `requests`, que ya está en la lista.

Comprueba que PyTorch ve la GPU:

```powershell
python -c "import torch; print('GPU disponible:', torch.cuda.is_available())"
```

Debe decir `GPU disponible: True`. Si dice `False` y sí tienes tarjeta NVIDIA, actualiza el driver (sección 1) y vuelve a probar.

### 3.3 FFmpeg (no hay que instalar nada a mano)

El proyecto usa el FFmpeg que viene dentro del paquete `imageio-ffmpeg` (instalado en el paso anterior). La primera vez que se corre el paso de separación de voz, el backend deja una copia llamada `ffmpeg.exe` en `backend/herramientas_ffmpeg/`, porque `audio-separator` lo busca con ese nombre.

Si ya tienes FFmpeg instalado en el sistema (en el PATH), el backend usa ese y no crea la carpeta. Cualquiera de las dos opciones funciona.

### 3.4 Modelo de separación de voz (se descarga solo)

El paso **1b** (separar la voz del audio de fondo) usa el modelo **BS-RoFormer** (`model_bs_roformer_ep_317_sdr_12.9755.ckpt`). **La primera vez** que se ejecuta, se descarga solo a `backend/modelos_separacion/` (varios cientos de MB), así que ese primer video tarda más.

Si alguien del equipo ya lo tiene, puedes copiar su carpeta `backend/modelos_separacion/` completa a tu proyecto y te ahorras la descarga.

Los modelos de **Whisper** y de **pyannote** (oradores) también se descargan solos la primera vez que se transcribe.

### 3.5 Crear el archivo `.env`

Las credenciales van en `backend/.env`. Este archivo **no se sube a git**, así que tienes que crearlo. Crea `backend/.env` con este contenido y completa los valores:

```env
# --- IA y voz ---
ANTHROPIC_API_KEY=
DEEPL_API_KEY=
ELEVENLABS_API_KEY=
HF_TOKEN=

# --- Zoho WorkDrive ---
ZOHO_CLIENT_ID=
ZOHO_CLIENT_SECRET=
ZOHO_REFRESH_TOKEN=
ZOHO_DC=com
WORKDRIVE_FOLDER_ID=
# Opcional: carpeta donde se suben los resultados
WORKDRIVE_RESULTADOS_FOLDER_ID=

# --- Vimeo ---
VIMEO_ACCESS_TOKEN=
# Opcional: ID del dueño de la cuenta de equipo (el número de vimeo.com/user/<ID>/...)
VIMEO_USUARIO=
# Opcional: nombre, ID o link de la carpeta de destino
VIMEO_FOLDER=
# Opcional: carpeta donde están los videos a doblar (pestaña "Vimeo" de la
# biblioteca). ID, link o nombre. Vacío = la raíz de la cuenta.
VIMEO_CARPETA_VIDEOS=

# --- Promos: lip sync (solo hace falta si vas a usar el modo Promos) ---
SYNC_API_KEY=
# Opcionales (se muestran los valores por defecto)
SYNC_MODEL=sync-3
SYNC_AUTO_ORADOR=0
# Motor: sync (de pago), kaggle (gratis, sección 7.3) o latentsync (local, sección 7.4)
LIPSYNC_MOTOR=sync
# Solo para LIPSYNC_MOTOR=kaggle (token nuevo, empieza con KGAT_)
KAGGLE_USERNAME=
KAGGLE_API_TOKEN=
```

De dónde sale cada valor:

| Variable | Dónde se obtiene |
|----------|------------------|
| `ANTHROPIC_API_KEY` | https://console.anthropic.com → API Keys. Se usa en la revisión de términos (paso 3) y en el ajuste de frases (paso 6). |
| `DEEPL_API_KEY` | https://www.deepl.com/your-account/keys. Traducción (paso 5). |
| `ELEVENLABS_API_KEY` | https://elevenlabs.io → Profile → API Keys. Generación de voz (paso 6). |
| `HF_TOKEN` | https://huggingface.co/settings/tokens → crear un token de tipo **Read**. Además, con esa misma cuenta, entra a https://huggingface.co/pyannote/speaker-diarization-community-1 y **acepta los términos de uso**. Sin esto, se transcribe igual pero sin separar oradores. |
| `ZOHO_*` | Ver "Credenciales de Zoho WorkDrive" abajo. |
| `VIMEO_ACCESS_TOKEN` | https://developer.vimeo.com/apps → tu app → *Generate an access token* → *Authenticated (you)*, con los permisos: `public`, `private`, `create`, `edit`, `upload`, `interact`, `delete` y, para poder **tomar videos desde Vimeo** (pestaña "Vimeo" de la biblioteca), también `video_files`. |
| `SYNC_API_KEY` | https://sync.so/settings/api-keys. Solo para Promos (paso 8, lip sync). Ver la sección 7 para el plan que hace falta. |

**Credenciales de Zoho WorkDrive** (una sola vez):

1. Entra a https://api-console.zoho.com (usa la consola del datacenter de tu cuenta: `.com`, `.eu`, `.in`…). Elige **Add Client → Self Client** y copia el **Client ID** y el **Client Secret** al `.env`.
2. En la pestaña **Generate Code** del Self Client, pon estos scopes, duración de 10 minutos, y copia el código que genera:
   ```
   WorkDrive.files.READ,ZohoFiles.files.READ,WorkDrive.files.CREATE,ZohoFiles.files.CREATE,WorkDrive.team.READ,WorkDrive.teamfolders.READ
   ```
3. Antes de que pasen los 10 minutos, con el entorno activado y dentro de `backend/`:
   ```powershell
   python workdrive.py --canjear 1000.xxxxxxxx.xxxxxxxx
   ```
   Copia el `ZOHO_REFRESH_TOKEN` que imprime al `.env`. Ese token no vence.
4. `WORKDRIVE_FOLDER_ID`: abre en el navegador la carpeta de WorkDrive donde están los videos; el ID es el último tramo de la URL (`.../folders/<ESTE_ID>`).
5. `ZOHO_DC` es el dominio de tu cuenta sin punto: `com`, `eu`, `in`, `com.au`, `jp` o `com.cn`.

Para probar las credenciales sin correr el pipeline:

```powershell
python workdrive.py            # navega tu carpeta de WorkDrive
python vimeo_subida.py --cuenta  # muestra tu usuario y espacio en Vimeo
python lipsync.py --probar     # verifica la API key de sync.so (Promos)
```

### 3.6 Probar que el backend arranca

Con el entorno activado y dentro de `backend/`:

```powershell
python app.py
```

Debe abrir el navegador en http://127.0.0.1:8765. Mientras no hayas compilado el frontend (sección 5), esa página te avisa que falta la interfaz; eso es normal. La documentación de la API está en http://127.0.0.1:8765/api/docs (pide haber iniciado sesión, como el resto de la API).

Para detenerlo, presiona `Ctrl + C` o cierra la ventana.

### 3.7 Crear el primer usuario

Sin usuarios no se puede entrar. Con el entorno activado y dentro de `backend/`, crea el tuyo como administrador:

```powershell
python usuarios.py crear TU_USUARIO --nombre "Tu Nombre" --rol admin
```

Pide la contraseña por teclado (no se ve al escribirla; mínimo 8 caracteres). Con ese usuario ya puedes entrar y crear a los demás desde la interfaz. Todo lo demás está en la [sección 8](#8-usuarios-inicio-de-sesión-y-registro-de-actividad).

---

## 4. Frontend (Vue + TypeScript)

Abre **otra** terminal y entra a `frontend/`.

### 4.1 Instalar pnpm (una sola vez por computadora)

```powershell
npm install -g pnpm
pnpm -v
```

### 4.2 Instalar las dependencias

```powershell
cd frontend
pnpm install
```

Si al terminar aparece el error `ERR_PNPM_IGNORED_BUILDS` mencionando a `esbuild`, autorízalo (Vite lo necesita):

```powershell
pnpm approve-builds
```

Marca `esbuild` con la **barra espaciadora**, presiona **Enter**, confirma con **y**, y luego vuelve a ejecutar `pnpm install`.

> **No uses `npm install`** en este proyecto: el proyecto usa pnpm y su archivo de bloqueo es `pnpm-lock.yaml`.

### 4.3 (Opcional) TypeScript para el editor

El código del frontend está en TypeScript (`.ts`). Vite lo compila solo, así que **no hace falta nada más para ejecutarlo**. Si quieres que VS Code use la misma versión de TypeScript que el proyecto:

```powershell
pnpm add -D typescript
```

---

## 5. Ejecutar la aplicación

Hay dos formas. Elige según lo que vayas a hacer.

### Opción A: modo desarrollo (para modificar la interfaz)

**Con un solo comando** (recomendado). Desde la raíz del proyecto:

```powershell
python dev.py
```

(o `.\dev.bat`, o doble clic en `dev.bat`). Esto:

- Levanta el **backend** (`python app.py`) usando el Python de `backend/entorno`, así que **no hace falta activar el entorno virtual**.
- Espera a que la API responda y levanta el **frontend** (`pnpm dev`).
- Abre **http://localhost:5173** en el navegador (con `python dev.py --sin-navegador` no lo abre).
- Muestra la salida de los dos en la misma consola, con el prefijo `[back]` o `[front]`.
- **`Ctrl + C`** (o cerrar la ventana) detiene los dos. Si uno se cae, se detiene el otro.

Requiere haber hecho antes la instalación de las secciones 3 y 4 (entorno virtual con dependencias y `pnpm install`). Si el puerto 8765 ya está en uso, avisa y no arranca: cierra la otra ventana de la aplicación.

**A mano, con dos terminales** (equivalente a lo anterior):

**Terminal 1 — backend:**
```powershell
cd backend
.\entorno\Scripts\Activate.ps1
python app.py
```

**Terminal 2 — frontend:**
```powershell
cd frontend
pnpm dev
```

Abre **http://localhost:5173**. Los cambios en el código de la interfaz se ven al instante. Vite reenvía las llamadas a `/api` al backend (puerto 8765), por eso el backend tiene que estar corriendo.

### Opción B: uso normal (una sola ventana)

1. Compila la interfaz (solo la primera vez y cada vez que cambie el código del frontend):
   ```powershell
   cd frontend
   pnpm build
   ```
   Esto crea `frontend/dist/`.

2. Abre la aplicación. Desde una terminal en la raíz del proyecto, **con el entorno virtual activado**:
   ```powershell
   .\backend\entorno\Scripts\Activate.ps1
   .\iniciar.bat
   ```
   Se abre http://127.0.0.1:8765 con la interfaz completa. Cerrar la ventana detiene la aplicación.

> `iniciar.bat` ejecuta `python app.py`, así que necesita que el `python` disponible tenga las dependencias instaladas. Por eso hay que activar el entorno antes. Si le das doble clic sin activarlo, usará el Python del sistema y fallará con "Faltan librerías".

---

## 6. Primer uso

0. Al abrir la aplicación aparece, a la izquierda, el panel de **inicio de sesión** y, a la derecha, una vista previa reducida de los recuadros **Masters** y **Promos**. Entra con tu usuario (sección 3.7 para crear el primero): el panel se convierte en la barra lateral del pipeline y la vista previa crece hasta ocupar su lugar. Elige uno de los dos recuadros; lo que sigue describe Masters (Promos está en la sección 7). El modo elegido se ve junto al título de la biblioteca, con un enlace **Cambiar** para volver a esa pantalla.
1. En **Biblioteca de videos**, elige un video de la pestaña **Vimeo** o **WorkDrive**, o súbelo arrastrándolo a la pestaña **En esta PC**.
2. En el panel derecho elige qué quieres hacer (doblar, solo video, solo transcribir, transcribir y traducir).
3. En **Parte del video** elige el video completo, "desde el inicio hasta un minuto" o "un tramo". Debajo se muestra la duración del video y, si el minuto o el tramo no entran en el video, un aviso en rojo; el botón **Iniciar** queda deshabilitado hasta que lo corrijas. Si el video es de WorkDrive y todavía no está descargado, se usa la duración que informa WorkDrive, así que el minuto o tramo se valida sin descargar nada. Solo si WorkDrive no informa la duración de ese video se valida al terminar la descarga: si no entra, el procesamiento no empieza hasta que lo corrijas y vuelvas a tocar **Iniciar**. (Para ver qué informa WorkDrive de un video: `python workdrive.py --atributos ID`; si la duración viene en un atributo que no se detecta solo, indica su nombre en `WORKDRIVE_CAMPO_DURACION` del `.env`.)
4. Al tocar **Iniciar** con un video de WorkDrive, la pantalla sube sola hasta la barra de progreso de la descarga. Cuando termina, el procesamiento empieza solo.
5. El pipeline siempre se detiene en **Revisión con IA** para que confirmes los términos detectados.

### De dónde se toman los videos: Vimeo, WorkDrive o esta PC

Arriba de la lista hay tres pestañas grandes; la elegida queda unida a la lista.

| Pestaña | Qué muestra | Al terminar el doblaje |
|---------|-------------|------------------------|
| **Vimeo** | Los videos de la cuenta de Vimeo (carpetas navegables). Arranca en `VIMEO_CARPETA_VIDEOS` o, si está vacía, en la raíz. | Los subtítulos en español e inglés se agregan **a ese mismo video** (conserva su ID y su link; no se sube uno nuevo). |
| **WorkDrive** | La carpeta `WORKDRIVE_FOLDER_ID`. | Como siempre: se publica desde "Publicación en Vimeo". |
| **En esta PC** | Videos subidos, descargados o recortados. | Igual que WorkDrive (o que Vimeo, si el video se había descargado de Vimeo). |

Sobre la pestaña Vimeo:

- **Hace falta un plan de pago de Vimeo (Standard o superior).** Con una cuenta Free, Vimeo lista los videos pero no entrega el archivo para descargarlo, aunque el token tenga `video_files`.
- El token necesita el permiso `video_files`: sin él tampoco se entrega el archivo. Para probar un video: `python vimeo_origen.py --info ID`.
- En la raíz de la cuenta solo se revisan los 300 videos más recientes para encontrar los que no están en ninguna carpeta. Si falta alguno, entra a su carpeta o define `VIMEO_CARPETA_VIDEOS`.
- Los subtítulos se envían solos al terminar la sincronización (paso 7; en Promos, el paso 8). Si falla, se reintenta desde **Publicación en Vimeo** ("Enviar subtítulos al video").
- Con un **recorte** no se envían subtítulos a Vimeo: sus tiempos no coinciden con el video completo.
- Si el video ya tenía una pista de subtítulos del mismo idioma que no puso esta aplicación, no se borra: se avisa en el registro para revisarla a mano.

### Varios videos a la vez: lotes (solo Masters)

En modo Masters, la primera columna de la lista tiene una casilla por video. Con **dos o más marcados** aparece abajo una **barra flotante** (queda a la vista aunque se baje por la lista) con **Procesar en lote**, que abre una ventana donde se decide todo de entrada:

- **Revisión con IA:** "Dejar todo como lo marcó la IA" (se aplican sus sugerencias sin detenerse; las palabras sin sugerencia quedan como están) o "Revisar a mano" (cada video se detiene y avisa).
- **Voces:** siempre se eligen a mano, video por video.
- **Vimeo:** qué videos se suben al terminar y a qué carpeta. No se vuelve a preguntar al final.

Al confirmar se abre la **pantalla de pistas**: arriba, en columnas, las etapas del pipeline; debajo, una pista por video, con un recuadro que se va moviendo a medida que avanza. No hay que apretar "continuar" en cada etapa: el planificador (`backend/lotes.py`) lanza solo lo que sigue.

- **La GPU trabaja de a un video** (columnas marcadas "GPU": extracción, transcripción y sincronización). Cuando un video la suelta, pasa al siguiente; lo que no usa la GPU (descarga, revisión con Claude, traducción, voz, subida a WorkDrive y a Vimeo) corre en paralelo: las subidas son procesos aparte, así la GPU pasa al siguiente video apenas termina de armarse el anterior. Por eso un recuadro puede quedar "Esperando la GPU".
- Cuando un video necesita a una persona (revisar términos o elegir voces) aparece un **aviso encima de su recuadro**. El botón **Maximizar** de la pista abre ese video en las pantallas de siempre; se vuelve a las pistas con la **pestaña flotante "Lote"** (abajo a la derecha) o con "Lote de videos" de la barra lateral.
- Si no se puede subir a WorkDrive, el video no se frena (lo generado está en esta PC): queda avisado en su pista, con un botón para reintentar la subida.
- La pantalla de pistas usa **toda la ventana**, sobre negro: la barra lateral y la barra superior se guardan y vuelven al maximizar un video. En el **Resumen final** de un video del lote hay una tarjeta por cada video, para pasar de un resumen a otro.
- Si un video falla, los demás siguen; el que falló se puede **reintentar** desde su pista. También se puede detener un video suelto.
- Hay un solo lote a la vez y, mientras esté abierto, no se inicia otro proceso desde la biblioteca. **Cerrar lote** detiene lo que esté corriendo; lo ya generado no se borra.
- El lote se guarda en `backend/datos/lote.json`: si se cierra la aplicación, al abrirla retoma donde quedó.
- Promos no tiene lotes. Un lote siempre dobla el video completo (sin recortes) hasta el paso 7.

### Subtítulos en inglés: a la par del español

En Masters, los subtítulos en inglés se sincronizan con **la persona que habla** en el video (igual que los subtítulos en español), no con la voz doblada. Antes seguían a la voz en inglés y, cuando esa voz dura menos que la frase original (alguien que habla despacio y con pausas), el subtítulo en inglés terminaba varios segundos antes que el español.

- Se cambia en `SUBTITULOS_EN_SEGUN` de `backend/main.py`: `"original"` (por defecto) o `"doblaje"` (como era antes: conviene si el video se mira sobre todo con la pista de audio en inglés). Promos sigue usando la voz doblada.
- Para rehacer solo los subtítulos de un video ya doblado, sin volver a armar el video: `python main.py "<ruta del video>" --solo-subtitulos` (regenera los VTT y reemplaza las pistas en Vimeo).

### Vista previa en el resumen final

El **Resumen final** tiene un reproductor con el video terminado: se elige la pista de audio (español original o inglés doblado) y los subtítulos (ninguno, español o inglés), para revisar el resultado antes de darlo por bueno. En Masters el audio en inglés es el mismo MP3 que se carga en Vimeo, sonando sobre el video original.

### Corregir frases sin volver a doblar todo

Si una frase quedó mal (Whisper entendió otra palabra, la revisión con IA no la arregló o la traducción no es la correcta), se corrige solo esa frase. No se vuelve a traducir, ni a generar la voz, ni a pasar por Claude el resto del video. La lógica está en `backend/correcciones.py` y las rutas en `/api/correcciones/...`.

1. **Anotar la corrección** de una o varias frases. Se puede cambiar:
   - el **español**: al aplicar se traduce solo esa frase con DeepL, con las frases vecinas como contexto (o se pide antes con `/api/correcciones/traducir` para ver la traducción y retocarla);
   - el **inglés**: se usa tal cual;
   - **otra toma**: el mismo texto con una voz nueva, cuando lo único que falla es la entonación.
2. **Escuchar antes de aplicar** (opcional): `/api/correcciones/toma` genera la voz de esa frase con ElevenLabs. Al aplicar se usa esa misma toma, sin pagarla dos veces.
3. **Aplicar**: un proceso en segundo plano genera la voz de las frases corregidas, rearma el video **una sola vez** (paso 7, o 7b si el video se armó así), rehace los subtítulos en español si cambió alguno y vuelve a subir los resultados a WorkDrive (y los subtítulos a Vimeo si el video vino de ahí).

Antes de generar la voz, la interfaz recibe una estimación de si el texto nuevo entra en su tiempo: si entra, si se va a acelerar o si no entra ni acelerado al máximo y conviene acortarlo.

Cada clip reemplazado queda como versión anterior y se puede volver a él (`/api/correcciones/restaurar`). Todo queda en `trabajo/<video>/correcciones_doblaje/`: las correcciones pendientes, el historial (quién y cuándo, antes y después), las tomas y las versiones.

Desde consola: `python main.py "<ruta del video>" --aplicar-correcciones`.

- **Promos:** se rearma el video en inglés sin lip sync. El lip sync se cobra, así que no se rehace solo: hay que pedirlo desde la pantalla **Lip sync**.
- **Video ya publicado en Vimeo** (subido desde WorkDrive o desde esta PC): lo publicado sigue con el doblaje anterior y el proceso lo avisa. Hay que volver a cargar el MP3 o publicar de nuevo.
- Si se rehace la **Generación de voz** completa, las correcciones pendientes de antes quedan obsoletas y no se aplican.
- Cada frase tiene un `id` fijo, asignado por el paso 4. El paso 6 anota en `_frases.json` para qué frase se generó cada clip. Si se rehace el paso 4 o el 5 y una frase cambia, ese clip se descarta en vez de quedar puesto en otra frase.

### Qué se guarda en WorkDrive

En Masters, a la carpeta **`<nombre> - doblaje`** de WorkDrive se suben únicamente tres archivos, pensados para quien no es técnico:

- `<nombre>_revisado.vtt`: subtítulos en español revisados.
- `<nombre>_en.vtt`: subtítulos en inglés.
- `<nombre>_audio_en_vimeo.mp3`: audio doblado, sincronizado con el video.

**Todo lo demás** (JSON, audios intermedios, registros, video doblado) sigue quedando en `backend/trabajo/<video>/`. La lista se cambia en `ARCHIVOS_PARA_WORKDRIVE` de `backend/main.py`. Los archivos que ya se habían subido antes a WorkDrive no se borran. Promos no cambia: sube sus dos videos finales.

### Modelos de Claude y costo

Claude se usa en dos pasos: la **revisión con IA** (paso 3) y el **ajuste de las frases en inglés** que no encajan en su tiempo (paso 6).

- **Elegir el modelo.** En el panel derecho de la biblioteca, en **Claude: modelos y costo**, se elige el modelo de cada paso: el Opus, el Sonnet y el Haiku más nuevos que ve tu API key, más los predeterminados (`MODELO_LLM` y `MODELO_REESCRITURA` de `main.py`: Opus 5 con esfuerzo medio para la revisión y Sonnet 5 para el ajuste). También se puede cambiar después en las pantallas **Revisión con IA** y **Generación de voz**. Lo elegido queda guardado en el video.
- **Costo estimado.** Antes de descargar o procesar el video, debajo de los selectores se ve cuánto va a costar Claude según la duración (o el tramo elegido) y los modelos. Los precios **se consultan en línea** cada vez (documentación oficial de Anthropic; si no responde, la tabla pública de LiteLLM). Solo si no hay conexión se usa el último precio bajado, y la interfaz lo avisa.
- **Estimado contra real.** Cada llamada a la API anota sus tokens en `costo_claude.json`, dentro de la carpeta de trabajo del video. El **Resumen final** muestra, por paso y en total, lo estimado, lo que costó y la diferencia.
- **Se afina sola.** La primera estimación parte de supuestos (ritmo del habla, cuántas frases hay que ajustar, cuánto razona el modelo). A partir del primer video procesado con un modelo, se usa su consumo real por minuto.
- **Ahorro.** Las instrucciones fijas de cada paso se envían con *prompt caching*: se cobran completas una vez por video y después a una fracción del precio de entrada.

Para probar sin la interfaz, dentro de `backend/`:

```powershell
python costos.py precios          # precios en línea y de qué fuente salieron
python costos.py modelos          # modelos que se ofrecen en la interfaz
python costos.py estimar 45       # costo estimado de un video de 45 minutos
```

La primera ejecución es la más lenta porque descarga los modelos (Whisper, pyannote y BS-RoFormer).

---

## 7. Promos: doblaje con lip sync

Promos usa el mismo pipeline que Masters hasta la generación de voz y agrega un paso final que **regenera la boca de quien habla** para que coincida con la voz en inglés. El resultado son dos videos:

- `<nombre>_ES.mp4`: el video en español. Es el original (o el recorte), sin tocar la imagen ni el audio.
- `<nombre>_EN.mp4`: el video en inglés, con la voz doblada, el fondo original y los labios sincronizados.

Los dos se suben a WorkDrive, a la carpeta **`<nombre> - promo`** (en la misma carpeta de donde salió el video, o en `WORKDRIVE_RESULTADOS_FOLDER_ID` si está definida). **Promos no se publica en Vimeo.**

El backend de Masters no cambió: `main.py` y los scripts de los pasos 1 a 7 son los mismos. Promos vive en dos archivos nuevos (`main_promos.py` y `lipsync.py`); la aplicación lanza uno u otro según el modo del video.

### 7.1 Pasos de Promos

| Paso | Qué hace | Diferencia con Masters |
|------|----------|------------------------|
| 1, 1b, 2 | Extraer audio, separar voz y fondo, transcribir | Ninguna |
| 3 | Revisión de términos con Claude (se detiene para que confirmes) | Ninguna |
| 3b | Subtítulos en español para Vimeo | **No se corre** (no hay Vimeo) |
| 4, 5 | Agrupar en frases y traducir con DeepL | Ninguna |
| 6 | Generar la voz con ElevenLabs, con el ajuste de frases de Claude (Sonnet) | Ninguna |
| 7 | Colocar cada frase en su momento y armar el video en inglés | Ninguna (el video queda como intermedio, no se muestra) |
| 8 | **Lip sync** y videos finales (español e inglés) | Nuevo |

**Por qué se mantiene el ajuste con Sonnet.** El lip sync corrige la boca, pero no los gestos ni la duración. Si el inglés termina uno o dos segundos antes que la frase original, la persona sigue gesticulando en silencio y se nota que "sigue hablando sin sonido". Para evitarlo, el inglés tiene que durar lo mismo que el original: el paso 6 acorta con Claude las frases que se pasan y alarga las que quedan cortas, y el paso 7 estira la voz y reparte pausas donde la persona pausa. Es lo mismo que hace Masters.

La única diferencia con Masters está en las pausas del paso 7. En Masters solo se agrega una pausa donde la persona también pausa (si no, la boca se mueve y no suena nada). Con lip sync la boca sigue a la voz, así que en Promos las pausas pueden ir donde respira la voz en inglés (comas, cambios de idea) aunque el original lo diga de corrido, y la voz puede ralentizarse un poco más (hasta x0,82 en vez de x0,85). Sirve para rellenar las frases que quedan cortas y que Claude no pudo alargar sin inventar contenido. Los valores están en `AJUSTES_PASO_7_IGUALAR`, en `backend/main_promos.py`.

(La primera versión de Promos quitaba ese ajuste. Si quieres volver a eso, con la voz a velocidad natural, la traducción de DeepL tal cual y sin el costo de Claude en el paso 6, pon `IGUALAR_DURACION = False` en `backend/main_promos.py`.)

### 7.2 Motor de lip sync

Por defecto se usa **sync.so** con el modelo **`sync-3`**. Se eligió porque procesa el plano completo en vez de trozos de 2 segundos y, según su documentación, maneja primeros planos, perfiles y manos o micrófonos delante de la boca, que es lo habitual en una promo. No usa la GPU de esta PC.

| Variable | Valores | Para qué |
|----------|---------|----------|
| `SYNC_API_KEY` | tu API key | Obligatoria para el motor `sync`. |
| `SYNC_MODEL` | `sync-3` (por defecto), `lipsync-2-pro`, `lipsync-2` | Calidad contra costo. |
| `SYNC_AUTO_ORADOR` | `0` (por defecto) o `1` | Con varias personas en cuadro, que sync.so detecte sola a la que habla. Requiere plan Creator o superior. |
| `LIPSYNC_MOTOR` | `sync` (por defecto), `kaggle` o `latentsync` | Ver las secciones 7.3 (Kaggle, gratis) y 7.4 (local). |
| `LIPSYNC_ESPERA_MAX_MIN` | minutos (por defecto 90) | Cuánto se espera el resultado antes de cortar. |

**Costo y plan de sync.so** (valores publicados por sync.so al escribir esta guía; conviene confirmarlos en https://sync.so/pricing):

| Modelo | USD por segundo de video (tarifa base, a 25 fps) | 1 minuto |
|--------|--------------------------------------------------|----------|
| `sync-3` | 0,133 | ≈ 8,00 |
| `lipsync-2-pro` | 0,083 | ≈ 5,00 |
| `lipsync-2` | 0,05 | ≈ 3,00 |

- Hace falta un plan pago además del uso. Para que el video salga **sin marca de agua**, el plan **Creator** (US$ 19 al mes) o superior.
- Cada plan tiene un máximo de duración por video: 1 minuto en Hobbyist, 5 en Creator, 10 en Growth y 30 en Scale. Un video más largo que el máximo del plan es rechazado.
- La cuenta gratuita permite probar con clips de hasta 15 o 20 segundos, con marca de agua.

La aplicación muestra el costo estimado del lip sync en la biblioteca (antes de iniciar) y en la pantalla **Lip sync** (antes de ejecutarlo). Lo consulta a sync.so, que aplica el descuento de tu plan; si no puede, usa la tarifa base de la tabla.

**No se cobra dos veces por un corte.** Lo que se subió y el pedido en curso quedan anotados en `trabajo/<video>/promo/lipsync_estado.json`. Si la aplicación se cierra o se pierde la conexión mientras sync.so trabaja, al volver a ejecutar la etapa se retoma el mismo pedido. **"Rehacer" sí pide un lip sync nuevo** (y se cobra): la interfaz lo avisa antes.

**Privacidad.** Con el motor `sync`, el video y la voz en inglés se suben a los servidores de sync.so (y con `kaggle`, a tu cuenta de Kaggle, en privado). Si eso no es aceptable para algún material, usa la alternativa local.

Para probar sin la interfaz, dentro de `backend/`:

```powershell
python lipsync.py --probar                       # verifica la API key
python lipsync.py --costo 45                     # costo de un video de 45 segundos
python lipsync.py video.mp4 voz.wav salida.mp4   # lip sync de un video con un audio
```

### 7.3 Opción gratuita: LatentSync en Kaggle

Para cuando la tarjeta de esta PC no alcanza para LatentSync (pide 8 GB o más) y no se quiere pagar sync.so. `LIPSYNC_MOTOR=kaggle` hace el lip sync con **LatentSync 1.5** en las GPU gratuitas de [Kaggle](https://www.kaggle.com). No usa la GPU local.

**Qué hace en cada lip sync:**

1. Sube el video y la voz a un dataset **privado** de tu cuenta (`doblaje-lipsync-entrada`; se reemplaza en cada corrida).
2. Publica y ejecuta un script **privado** (`doblaje-lipsync`) con GPU e internet: clona LatentSync, arma su entorno, baja el modelo y procesa el video.
3. Consulta el estado cada 30 segundos y, al terminar, descarga el resultado.

**Configuración (una sola vez):**

1. Crea una cuenta en kaggle.com y **verifica el teléfono** (*Settings → Phone verification*). Sin eso Kaggle no da GPU ni internet a los scripts.
2. En https://www.kaggle.com/settings/api pulsa **Generate New Token** y copia el token (empieza con `KGAT_`). **No sirve la clave vieja** de `kaggle.json` ("Legacy API Credentials"): con ella se puede consultar la cuenta, pero Kaggle rechaza las subidas con un error 401.
3. Instala la herramienta de Kaggle, **versión 1.8 o superior** (es la que entiende el token nuevo). Esa versión solo existe para **Python 3.11 o más nuevo**:
   - Si la aplicación corre con Python 3.11 o 3.12: `python -m pip install -U kaggle` y listo.
   - Si corre con Python 3.10 (pip se queda en la 1.7 y dice "Requirement already satisfied"): instálala en otro Python y dile a la aplicación dónde está. Con Miniconda:
     ```powershell
     conda create -y -n kagglecli python=3.12
     conda activate kagglecli
     pip install kaggle
     ```
     y agrega al `.env` la ruta de su ejecutable: `KAGGLE_CLI=C:\Users\TU_USUARIO\miniconda3\envs\kagglecli\Scripts\kaggle.exe`
4. En `backend/.env`:
   ```env
   LIPSYNC_MOTOR=kaggle
   KAGGLE_USERNAME=tu_usuario
   KAGGLE_API_TOKEN=KGAT_xxxxxxxx
   ```
5. Reinicia la aplicación y verifica con `python lipsync.py --probar`.

**Qué esperar:**

- **Tiempo:** cada corrida espera su turno, instala LatentSync desde cero (unos 3 minutos) y después procesa. Kaggle suele asignar dos GPU: el video se parte en dos mitades que se procesan a la vez y se unen al final (si eso falla, se hace todo en una sola GPU, como antes). Una promo de 40 segundos tardó 35 minutos en una sola GPU con 20 pasos.
- **Para probar más rápido:** `LATENTSYNC_PASOS=12` en el `.env` (por defecto 20) reduce el tiempo de generación con algo menos de detalle en la boca; para la versión final conviene volver a 20. Y antes de mandar nada a Kaggle, usa la **vista previa sin lip sync** de la pantalla Lip sync: se arma en segundos y muestra los tiempos de la voz (silencios, frases apuradas), que el lip sync no cambia.
- **Cupo:** Kaggle da un cupo semanal de horas de GPU por cuenta (unas 30 al escribir esta guía). Si se agota, el paso falla con "Kaggle no asignó una GPU" hasta que se renueve.
- **Calidad:** LatentSync 1.5 trabaja la cara a 256 píxeles. Es menor que `sync-3`: en primeros planos la boca se ve algo más suave. Entrega el video a 25 fps.
- **Tramos sin cara:** LatentSync, tal como viene, aborta todo el video si en un solo fotograma no detecta una cara (planos de producto, placas con texto, fundidos). La aplicación le aplica un parche dentro de Kaggle para que no aborte y anote qué fotogramas son; al descargar el resultado, esos tramos se reemplazan en esta PC por los del video original, así quedan exactamente como estaban. El registro indica en qué segundos pasó.
- **Varias personas:** si en un plano aparece alguien que no es quien habla, LatentSync puede ajustarle los labios igual. No distingue al orador.
- **Si se corta la aplicación:** al volver a ejecutar la etapa se retoma la corrida que ya estaba en Kaggle.
- El registro de cada corrida se puede ver en `kaggle.com/code/<tu_usuario>/doblaje-lipsync`.

Esta integración se probó contra un Kaggle simulado, no contra el servicio real: la primera corrida conviene hacerla con un video corto y revisar ese registro si algo falla.

### 7.4 Alternativa local: LatentSync (opcional)

Si prefieres no pagar por video ni subir el material, `LIPSYNC_MOTOR=latentsync` usa [LatentSync 1.6](https://github.com/bytedance/LatentSync) (ByteDance), el mejor de los modelos de código abierto. A cambio:

- Necesita una GPU con **unos 18 GB de VRAM** (la versión 1.5 funciona con 8 GB, a menor resolución).
- La calidad es menor que la de `sync-3` en planos difíciles (perfiles, objetos delante de la boca) y entrega el video a 25 fps.
- **Se instala aparte**, en su propia carpeta y con su propio entorno virtual: sus dependencias (versiones fijas de PyTorch y diffusers) chocan con las de este proyecto. Sigue las instrucciones de su repositorio y descarga sus modelos.

Después, en `backend/.env`:

```env
LIPSYNC_MOTOR=latentsync
LATENTSYNC_DIR=C:\ruta\a\LatentSync
LATENTSYNC_PYTHON=C:\ruta\a\LatentSync\entorno\Scripts\python.exe
# Opcionales
LATENTSYNC_CONFIG=configs/unet/stage2_512.yaml
LATENTSYNC_CKPT=checkpoints/latentsync_unet.pt
```

La aplicación lo ejecuta como un proceso aparte (`python -m scripts.inference ...`) dentro de esa carpeta.

### 7.5 Uso desde la interfaz

1. En la pantalla inicial elige **Promos**.
2. Elige el video. El panel de la derecha ya no pregunta qué hacer (hay un solo objetivo); muestra el costo estimado de Claude (revisión y ajuste de frases) y el del lip sync.
3. **Iniciar.** Como en Masters, el proceso se detiene en **Revisión con IA**.
4. Sigue las pantallas: Traducción, Generación de voz y **Lip sync**. Esa última etapa coloca la voz sobre el video (paso 7) y ajusta los labios (paso 8) de una sola vez; el video intermedio del paso 7 no se muestra.
5. Al terminar el lip sync se ven los dos videos, se pueden descargar y se suben solos a WorkDrive. Si la subida falla, el botón **Subir a WorkDrive** la reintenta sin rehacer el lip sync.

Un video que ya se procesó como Masters se puede iniciar como Promo: se aprovecha lo ya hecho (transcripción, traducción y voz) y solo se corren los pasos 7 y 8.

### 7.6 Uso desde consola

```powershell
python main_promos.py video.mp4                    # pipeline completo
python main_promos.py video.mp4 --hasta 3          # hasta la revisión
python main_promos.py video.mp4 --desde 7          # retoma desde la sincronización
python main_promos.py video.mp4 --paso 8 --forzar  # rehace solo el lip sync (se cobra)
python main_promos.py video.mp4 --solo-subir       # solo sube los dos videos a WorkDrive
```

Acepta las mismas opciones que `main.py` (`--recorte`, `--idioma`, `--no-subir`...), salvo las de Vimeo. Si un paso falla, el mensaje "Para retomar: python main.py ..." lo escribe `main.py`: en Promos el comando equivalente es con `main_promos.py`.

Todo lo propio de Promos queda en `trabajo/<video>/promo/`.

---

## 8. Usuarios, inicio de sesión y registro de actividad

### 8.1 Cómo funciona

- **Todas** las rutas de la API (`/api/...`, incluida `/api/docs`) exigen una sesión iniciada. Sin sesión responden `401`. Las únicas excepciones son entrar, salir y consultar si hay sesión. Esto lo hace un filtro previo a las rutas (`backend/acceso.py`), así que una ruta nueva en `app.py` queda protegida sin hacer nada.
- La sesión viaja en una cookie `HttpOnly` y `SameSite=Strict`. Vence tras **12 horas sin uso** (se cambia con `DOBLAJE_SESION_HORAS` en el `.env`) y al cerrar el navegador.
- Las contraseñas se guardan con hash (scrypt) y una sal por usuario. Nunca en texto plano.
- Tras 5 intentos fallidos seguidos con un mismo usuario, ese usuario no puede intentar de nuevo durante 10 minutos. Los intentos fallidos quedan en el registro.
- La aplicación sigue escuchando solo en `127.0.0.1`: se usa desde la misma PC donde corre.
- Si no se puede iniciar sesión, el error completo queda en dos lugares. En la **consola del navegador** (F12 → Consola): mensaje, código HTTP, pedido, respuesta completa del backend y traza. En la **ventana del backend**: usuario, motivo exacto (no existe, contraseña incorrecta, desactivado o bloqueado), IP, navegador y, si fue un error interno, la traza. La contraseña no se imprime nunca, y a la página se le responde siempre "usuario o contraseña incorrectos" para no revelar qué usuarios existen.

Hay dos roles:

| Rol | Puede |
|-----|-------|
| **Operador** | Usar todo el pipeline, ver su propia actividad y cambiar su contraseña. |
| **Administrador** | Lo mismo, y además: ver la actividad y el costo de todos, crear usuarios, cambiarles el rol, desactivarlos y restablecerles la contraseña. |

### 8.2 Crear y administrar usuarios

**Desde la interfaz** (solo administradores): barra lateral → **Usuarios y actividad** → al final de la tarjeta **Usuarios**, el formulario **Nuevo usuario**. En la misma tabla se cambia el rol, se desactiva o reactiva a alguien y se le pone una contraseña nueva.

**Desde la consola** (sirve siempre, y es la única forma de crear el primero). Con el entorno activado, dentro de `backend/`:

```powershell
python usuarios.py crear ana --nombre "Ana Pérez"           # operador
python usuarios.py crear luis --nombre "Luis Soto" --rol admin
python usuarios.py listar
python usuarios.py clave ana          # le pone una contraseña nueva (cierra sus sesiones)
python usuarios.py desactivar ana     # ya no puede entrar; su historial queda
python usuarios.py activar ana
python usuarios.py rol ana admin
```

Un usuario **no se borra**: se desactiva, para que su historial siga completo. Siempre tiene que quedar al menos un administrador activo. Si alguien olvida su contraseña, un administrador se la cambia (interfaz o `python usuarios.py clave USUARIO`). Si se pierde la del único administrador, se recupera igual por consola.

Cada persona cambia su propia contraseña en **Usuarios y actividad** (o **Mi actividad**) → **Mi contraseña**. Para salir, el botón junto a su nombre, al pie de la barra lateral.

### 8.3 Qué se registra y dónde

Todo queda en **un archivo SQLite**: `backend/datos/doblaje.db`. Se crea solo la primera vez y **no se sube a git**. No hay que instalar ni levantar ningún servidor de base de datos.

| Tabla | Qué guarda |
|-------|------------|
| `usuarios` | Usuario, nombre, rol, si está activo, cuándo se creó y quién lo creó, último acceso. |
| `sesiones` | Sesiones abiertas (el hash del token, no el token). |
| `actividad` | Una fila por acción: entrar, salir, intento fallido, lanzar o cancelar un proceso, aplicar la revisión, descargar de WorkDrive, publicar en Vimeo, subir un video, descargar un archivo, agregar una voz, crear o modificar usuarios. Con fecha, usuario, video y detalle. |
| `ejecuciones` | Una fila por proceso del pipeline (un paso o un tramo, una descarga, una publicación): quién lo lanzó, sobre qué video, con qué opciones, cuándo empezó y terminó, cómo terminó y **cuánto costó**. |

**Costo de cada proceso (USD):**

- **Claude:** el costo **real**, según los tokens que cobró la API durante ese proceso (pasos 3 y 6).
- **Lip sync:** el costo **estimado** de sync.so si el lip sync se hizo en ese proceso (Promos, paso 8). Con Kaggle o LatentSync es 0.
- **ElevenLabs y DeepL no están incluidos:** el proyecto todavía no mide su consumo. Ese gasto se ve en el panel de cada servicio.

Si la aplicación se cierra con un proceso corriendo, al volver a abrirla ese proceso queda como *interrumpido* con lo que llegó a gastar. El historial de cada video (`trabajo/<video>/estado_pipeline.json`) también dice quién lanzó cada ejecución.

**Cómo consultarlo:**

- **En la interfaz:** *Usuarios y actividad*. Arriba, el total por usuario (procesos, errores, cancelados, videos, tiempo de proceso y costo); debajo, cada proceso con su costo y cada acción. Se filtra por usuario y por período. Un operador ve solo lo suyo.
- **Por consola:**
  ```powershell
  python usuarios.py costos --desde 2026-10-01              # total por usuario
  python usuarios.py costos --csv procesos.csv              # cada proceso con su costo, para Excel
  python usuarios.py actividad --usuario ana --desde 2026-10-01
  python usuarios.py actividad --csv actividad.csv
  ```
- **Directo:** el archivo se abre con cualquier visor de SQLite (por ejemplo, DB Browser for SQLite).

**Límites que conviene conocer:**

- Desde la aplicación el registro solo se agrega: no hay ninguna pantalla ni ruta que lo edite o lo borre. Pero es un archivo en esa PC: quien tenga acceso a la carpeta del proyecto en Windows puede modificarlo o borrarlo. Si eso importa, limita los permisos de la carpeta `backend/datos/` y haz copias.
- **Copia de seguridad:** con la aplicación cerrada, copia `backend/datos/doblaje.db`. Con la aplicación abierta copia también `doblaje.db-wal` y `doblaje.db-shm`, si existen.
- **Varias PC:** cada instalación tiene su propia base. Los usuarios y el registro de una PC no se ven en otra.
- Lo que se ejecute por consola (`python main.py ...`) no pasa por el inicio de sesión y no queda en este registro.

---

## 9. Problemas frecuentes

| Síntoma | Solución |
|---------|----------|
| Instalación nueva y nadie puede entrar | Todavía no hay usuarios (la pantalla de inicio de sesión no lo dice, a propósito). Crea el primero por consola: sección 3.7. |
| "Usuario o contraseña incorrectos" y no recuerdas la contraseña | Un administrador la cambia en *Usuarios y actividad*, o por consola: `python usuarios.py clave USUARIO`. |
| "Demasiados intentos fallidos con ese usuario" | Espera 10 minutos. Cambiarle la contraseña no quita la espera. |
| Te devuelve al inicio de sesión mientras trabajas | La sesión venció (12 h sin uso), cambiaron tu contraseña o un administrador desactivó tu usuario. Lo que estaba procesando sigue corriendo. |
| `/api/docs` responde "Inicia sesión para continuar" | Entra primero a la aplicación en el mismo navegador y vuelve a abrir la documentación. |
| `python` no se reconoce como comando | Reinstala Python marcando **"Add python.exe to PATH"** y abre una terminal nueva. |
| `pnpm` no se reconoce como comando | Ejecuta `npm install -g pnpm` y abre una terminal nueva. |
| PowerShell no deja activar el entorno | `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned` |
| "Faltan librerías de la aplicación" al abrir | No activaste el entorno virtual. Actívalo y vuelve a ejecutar. |
| La interfaz dice "No hay conexión con la aplicación" | El backend no está corriendo. Ábrelo (`python app.py` o `iniciar.bat`). |
| `cublas64_12.dll is not found` | Reinstala las dependencias con el entorno activado: `pip install -r requirements.txt`. |
| `torch.cuda.is_available()` devuelve `False` | Actualiza el driver de NVIDIA y verifica con `nvidia-smi`. |
| La transcripción sale sin oradores | Falta `HF_TOKEN` o no aceptaste los términos de `pyannote/speaker-diarization-community-1`. |
| Error 401 al descargar o subir a WorkDrive | El refresh token se generó sin todos los scopes. Repite los pasos de Zoho de la sección 3.5. |
| El puerto 8765 está ocupado | Ya hay otra copia de la aplicación abierta. Ciérrala. |
| `ERR_PNPM_IGNORED_BUILDS` | `pnpm approve-builds` y aprueba `esbuild`. |
| El costo estimado dice "sin conexión" | No se pudo abrir la página de precios de Anthropic ni la de LiteLLM. Se usa el último precio bajado; verificá la conexión con `python costos.py precios`. |
| El paso 3 o el 6 falla con "rechazó la consulta con el modelo…" | El modelo elegido no está disponible para tu API key. Elegí otro en el selector de esa pantalla. |
| Lip sync: "Falta la API key de sync.so" | Agrega `SYNC_API_KEY` a `backend/.env` y reinicia la aplicación. Verifícala con `python lipsync.py --probar`. |
| Lip sync: "sync.so no aceptó el video o el audio" | Casi siempre el video dura más que el máximo de tu plan de sync.so (sección 7.2). Recorta el video o sube de plan. |
| El video en inglés sale con marca de agua | Tu plan de sync.so es Free o Hobbyist. Se quita desde el plan Creator. |
| Lip sync: "sigue trabajando después de 90 minutos" | El pedido no se pierde: vuelve a ejecutar la etapa y se retoma sin cobrar de nuevo. Para esperar más, sube `LIPSYNC_ESPERA_MAX_MIN`. |
| Se ajustan los labios de la persona equivocada | Hay varias personas en cuadro: pon `SYNC_AUTO_ORADOR=1` en el `.env` y usa **Rehacer** en Lip sync. |
| Lip sync: "Kaggle no asignó una GPU" | Se agotó el cupo semanal de GPU de la cuenta o falta verificar el teléfono en kaggle.com → Settings. |
| Lip sync en Kaggle: error 401 en `/blobs/upload` | Estás usando la clave vieja (`KAGGLE_KEY`). Genera un token nuevo (`KGAT_...`) en kaggle.com/settings/api, ponlo como `KAGGLE_API_TOKEN` y ejecuta `pip install -U kaggle`. |
| Lip sync: "Falta la herramienta de Kaggle" | Con el entorno del backend activado: `pip install kaggle`. |
| Lip sync en Kaggle: "LatentSync terminó con un error" | La aplicación muestra las últimas líneas del registro de Kaggle y lo guarda completo en `trabajo/<video>/promo/kaggle_registro.txt`. |
| Los videos de Promos no se subieron a WorkDrive | En la pantalla **Lip sync**, botón **Subir a WorkDrive**; o `python main_promos.py <video> --solo-subir`. |
