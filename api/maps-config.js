/*
 * Vercel Serverless Function: entrega la configuración pública de Google Maps.
 *
 * La clave de Maps JavaScript API siempre termina visible en el navegador (así funciona
 * Google Maps); su protección real son las restricciones de la clave en Google Cloud:
 *   - Restricción de aplicación: "Sitios web" (HTTP referrers) → https://vex-mx.com/*, https://www.vex-mx.com/*
 *   - Restricción de API: solo "Maps JavaScript API".
 *   - Cuotas diarias de "Dynamic Street View" para limitar el gasto.
 * Esta función solo evita que la clave quede escrita en el repositorio.
 *
 * Variable de entorno requerida en Vercel: GOOGLE_MAPS_API_KEY
 * Opcional: GOOGLE_MAPS_VERSION (por defecto "quarterly").
 */
module.exports = function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');

    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        res.statusCode = 405;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({ error: 'method_not_allowed' }));
        return;
    }

    var key = process.env.GOOGLE_MAPS_API_KEY || '';
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (!key) {
        res.statusCode = 503;
        res.end(JSON.stringify({ error: 'not_configured' }));
        return;
    }
    res.statusCode = 200;
    res.end(JSON.stringify({ apiKey: key, version: process.env.GOOGLE_MAPS_VERSION || 'quarterly' }));
};
