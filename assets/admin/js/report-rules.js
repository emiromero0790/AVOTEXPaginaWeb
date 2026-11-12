/**
 * Reglas del formulario «Generar reporte» — las MISMAS en el navegador (aviso inmediato) y en el servidor
 * (api/admin.js, que es la validación que manda). Script clásico/CommonJS a propósito, para usarse en ambos.
 *
 * Rangos (definiciones de los índices):
 *   NDVI, NDRE, NDMI, MSAVI: diferencias normalizadas → [-1, 1].
 *   RECI = NIR / RedEdge − 1 → normalmente 0 a ~10; se acepta [-1, 20] para no rechazar valores reales extremos.
 * Clima (unidades tal como se guardan en public.reportes; la app y el panel antiguo usan estas):
 *   precipitacion mm ≥ 0 · humedad % entero 0–100 · cobertura_nubes % entero 0–100
 *   viento km/h ≥ 0 (el formulario anterior ya capturaba km/h; NO se convierte al guardar)
 *   temp_max / temp_min °C entre -60 y 60, con temp_min ≤ temp_max.
 * Un campo vacío se guarda como NULL (no medido); 0 es un valor medido. Se exige al menos un índice.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AvxReportRules = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const FIELDS = [
    { key: 'ndvi', label: 'NDVI', group: 'veg', min: -1, max: 1, int: false },
    { key: 'ndre', label: 'NDRE', group: 'veg', min: -1, max: 1, int: false },
    { key: 'msavi', label: 'MSAVI', group: 'veg', min: -1, max: 1, int: false },
    { key: 'reci', label: 'RECI', group: 'veg', min: -1, max: 20, int: false },
    { key: 'ndmi', label: 'NDMI', group: 'veg', min: -1, max: 1, int: false },
    { key: 'precipitacion', label: 'Precipitación', unit: 'mm', group: 'clima', min: 0, max: 2000, int: false },
    { key: 'humedad', label: 'Humedad relativa', unit: '%', group: 'clima', min: 0, max: 100, int: true },
    { key: 'cobertura_nubes', label: 'Cobertura de nubes', unit: '%', group: 'clima', min: 0, max: 100, int: true },
    { key: 'viento', label: 'Viento', unit: 'km/h', group: 'clima', min: 0, max: 300, int: false },
    { key: 'temp_max', label: 'Temperatura máxima', unit: '°C', group: 'clima', min: -60, max: 60, int: false },
    { key: 'temp_min', label: 'Temperatura mínima', unit: '°C', group: 'clima', min: -60, max: 60, int: false },
  ];

  /** Convierte la entrada cruda (texto o número) a número o null (vacío). NaN si no es número. */
  function parse(raw) {
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'number') return Number.isFinite(raw) ? raw : NaN;
    const s = String(raw).trim().replace(',', '.');
    if (s === '') return null;
    const n = Number(s);
    return Number.isFinite(n) ? n : NaN;
  }

  /**
   * Valida y normaliza. input: { user_email, huerta_id, ndvi, ... } (valores crudos).
   * Devuelve { ok, errors: {campo: mensaje}, row } — row solo contiene columnas reales de public.reportes.
   */
  function validate(input) {
    const errors = {};
    const row = {};
    const email = String(input && input.user_email || '').trim();
    if (!email) errors.user_email = 'Selecciona un cliente.';
    row.user_email = email;
    const huerta = String(input && input.huerta_id || '').trim();
    if (!huerta) errors.huerta_id = 'Selecciona una huerta del cliente.';
    else if (!/^[0-9a-f-]{36}$/i.test(huerta)) errors.huerta_id = 'Huerta inválida.';
    row.huerta_id = huerta || null;
    let anyVeg = false;
    for (const f of FIELDS) {
      const v = parse(input ? input[f.key] : null);
      if (v === null) { row[f.key] = null; continue; }
      if (Number.isNaN(v)) { errors[f.key] = 'Escribe un número.'; continue; }
      if (f.int && !Number.isInteger(v)) { errors[f.key] = 'Debe ser un número entero.'; continue; }
      if (v < f.min || v > f.max) { errors[f.key] = `Fuera de rango (${f.min} a ${f.max}${f.unit ? ' ' + f.unit : ''}).`; continue; }
      row[f.key] = v;
      if (f.group === 'veg') anyVeg = true;
    }
    if (!anyVeg && !Object.keys(errors).some(k => FIELDS.find(f => f.key === k && f.group === 'veg'))) errors.veg = 'Captura al menos un índice de vegetación.';
    if (row.temp_min !== null && row.temp_max !== null && row.temp_min !== undefined && row.temp_max !== undefined && row.temp_min > row.temp_max) {
      errors.temp_min = 'La mínima no puede ser mayor que la máxima.';
    }
    return { ok: Object.keys(errors).length === 0, errors, row };
  }

  return { FIELDS, parse, validate };
});
