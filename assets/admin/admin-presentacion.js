/*
 * AVOTEX — botón «Modo presentación» del Panel Administrador (avotex-admin.html).
 *
 * Abajo al centro, junto al estado de los gestos. Solo en la pantalla CENTRAL de ScreenX (?sx=center) o en
 * Vista normal (sin ?sx). Abre la landing
 * (avotex.html?presentacion=1) en esta ventana: un recorrido automático de toda la página hasta
 * «Planes y precios», una simulación de registro que NO crea nada y, al final, el regreso directo a
 * Street View (admin.html) sin pasar por el login (la sesión de Firebase nunca se cierra).
 * El recorrido vive en avotex-presentacion.js. Para quitar el botón: borra este archivo y su <script>.
 */
(function (root, doc) {
    'use strict';
    var m = /[?&]sx=(left|center|right)/.exec(root.location.search || '');
    var role = m ? m[1] : null;
    if (role && role !== 'center') return; // las laterales no muestran el botón

    function start() {
        if (root.AvotexAdminGestos && root.AvotexAdminGestos.disarm) root.AvotexAdminGestos.disarm();
        var fx = doc.getElementById('toPresentFx');
        if (!fx) {
            fx = doc.createElement('div');
            fx.id = 'toPresentFx';
            fx.setAttribute('aria-hidden', 'true');
            fx.style.cssText = 'position:fixed;inset:0;z-index:2147483600;pointer-events:none;opacity:0;' +
                'background:radial-gradient(circle at 50% 50%, rgba(185,246,47,.35), rgba(5,16,10,.96) 62%);' +
                'transition:opacity .45s ease-out';
            doc.body.appendChild(fx);
        }
        var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
        requestAnimationFrame(function () { fx.style.opacity = '1'; });
        var url = 'avotex.html?presentacion=1' + (role ? '&sx=' + role : '');
        setTimeout(function () { root.location.href = url; }, reduce ? 0 : 460);
    }

    function mount() {
        if (doc.getElementById('btnPresentacion')) return;
        var b = doc.createElement('button');
        b.type = 'button';
        b.id = 'btnPresentacion';
        b.setAttribute('aria-label', 'Modo presentación: recorrido por la página de AVOTEX');
        b.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" ' +
            'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2.5" y="4" width="19" height="13" rx="2"/>' +
            '<path d="M10 8.5v5l4.2-2.5z" fill="currentColor"/><path d="M8 21h8M12 17v4"/></svg><span>Modo presentación</span>';
        b.style.cssText = 'order:1;pointer-events:auto;flex:0 0 auto;display:flex;align-items:center;gap:9px;' +
            'padding:10px 16px;border-radius:999px;cursor:pointer;font:700 14px/1 Inter,system-ui,sans-serif;letter-spacing:.2px;' +
            'color:#06200f;background:linear-gradient(135deg,#d8ff79,#9fdc1f);border:1px solid rgba(255,255,255,.55);' +
            'box-shadow:0 10px 28px rgba(0,0,0,.45),0 0 0 4px rgba(185,246,47,.16);transition:transform .12s ease-out,box-shadow .18s ease-out';
        b.addEventListener('pointerdown', function () { b.style.transform = 'scale(.96)'; });
        b.addEventListener('pointerup', function () { b.style.transform = ''; });
        b.addEventListener('pointerleave', function () { b.style.transform = ''; });
        b.addEventListener('click', start);
        bar().appendChild(b);
    }

    // Va en la barra inferior centrada, a un lado del estado de los gestos (la crea admin-gestos.js).
    function bar() {
        if (root.AvotexAdminBarra) return root.AvotexAdminBarra();
        var el = doc.getElementById('adminBarraInferior');
        if (!el) {
            el = doc.createElement('div');
            el.id = 'adminBarraInferior';
            el.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:2147483000;' +
                'display:flex;align-items:center;justify-content:center;gap:10px;pointer-events:none;';
            doc.body.appendChild(el);
        }
        return el;
    }

    root.AvotexAdminPresentacion = { start: start };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', mount); else mount();
})(window, document);
