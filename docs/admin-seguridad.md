# AVOTEX Admin — seguridad y configuración

## Modo seguro (recomendado)
`avotex-admin.html` llama a `/api/admin` (Vercel) con el ID token de Firebase. El servidor:
1. verifica el token con Google (Identity Toolkit `accounts:lookup`);
2. acepta solo cuentas con el claim personalizado `admin: true` **o** cuyo correo esté en `ADMIN_EMAILS`;
3. consulta Supabase con la service role key, que nunca llega al navegador;
4. al crear un reporte valida los valores (`assets/admin/js/report-rules.js`), que el cliente exista y que la huerta exista y sea suya.

Variables de entorno en Vercel (Settings → Environment Variables), y después redeploy:

| Variable | Valor |
| --- | --- |
| `SUPABASE_URL` | `https://rnlnomhgtscmdqqyyyyz.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | service role (Supabase → Settings → API). **Secreta.** |
| `FIREBASE_WEB_API_KEY` | apiKey pública del proyecto Firebase `avotex-7ba66` |
| `ADMIN_EMAILS` | correos administradores separados por coma |

## Modo directo (respaldo)
Si `/api/admin` responde 503 (sin variables) o no existe, el panel funciona como antes: lee y escribe con la clave anon y solo deja entrar a los correos de `legacyAdmins`. Esto **no** es seguridad real: con RLS desactivado, cualquiera con la clave anon puede leer o escribir esas tablas. El panel muestra un aviso mientras esté en este modo.

## Base de datos
Ejecuta `docs/sql/20261112_reportes_integridad.sql`: la base rechaza reportes cuya huerta sea de otro cliente, aunque se inserten directo con la clave anon. No agrega columnas ni cambia filas existentes.

## Pendiente fuera del panel
La app móvil también usa la clave anon. Para cerrar el acceso de verdad hay que configurar Firebase como proveedor de autenticación externo en Supabase y escribir políticas RLS basadas en el JWT (cada usuario ve solo lo suyo). Hasta entonces, las tablas siguen expuestas a quien tenga la clave anon.
