/*
 * AVOTEX — Modo presentación de la landing (avotex.html?presentacion=1).
 *
 * Se abre desde el botón «Modo presentación» de Street View (admin.html), junto a «Activar gestos».
 * Sin ?presentacion=1 este archivo no hace NADA.
 *
 * Recorrido completo en menos de 1 minuto (TIMING; peor caso ~57 s con la carga incluida):
 *   1. Desplazamiento automático desde arriba por toda la página hasta «Planes y precios» (escena Básico),
 *      con las animaciones de scroll de siempre.
 *   2. Simulación de registro: abre el modal del plan, escribe un correo y contraseña de ejemplo, avanza
 *      a la confirmación y muestra el éxito. NO llama a Firebase ni a Supabase (createAccount() queda
 *      anulada mientras dura la presentación): no se crea ninguna cuenta ni dato.
 *   3. Regreso directo a Street View (admin.html), sin login: la sesión de Firebase nunca se cierra.
 *      En ScreenX (?sx=center) avisa a las pantallas laterales para que también regresen.
 *
 * Esc o el botón «Salir» terminan la presentación y regresan de inmediato.
 */
(function (root, doc) {
    'use strict';
    var params = new URLSearchParams(root.location.search || '');
    if (params.get('presentacion') !== '1') return;

    var SX_ROLE = /^(left|center|right)$/.test(params.get('sx') || '') ? params.get('sx') : null;
    var TIMING = {
        maxWaitReady: 4000,  // espera máxima a que termine la pantalla de carga
        scrollMs: 38000,     // desplazamiento de arriba a «Planes y precios»
        holdPlanMs: 1600,    // pausa en la escena del plan antes de elegirlo
        typeCharMs: 45,      // velocidad de escritura de la simulación
        stepPauseMs: 900,    // pausa entre pasos del formulario
        processingMs: 1800,  // «creando cuenta…» (simulado)
        successMs: 2600      // éxito visible antes de regresar
    };
    var DEMO = { plan: ['Plan Básico', 1190, 45000], email: 'demo.agricultor@avotex.mx', password: 'Avotex2026' };
    var PLAN_MARK = 0.48;    // punto del tramo fijado de planes donde se ve la escena Básico (0–1)

    var stopped = false;
    var hud = null;

    // ───────── seguridad: nada real durante la presentación ─────────
    // createAccount() (registro real en Firebase + Supabase) se anula: la simulación nunca la llama, y
    // así tampoco un clic accidental en «Crear cuenta» puede crear una cuenta o cambiar la sesión.
    root.createAccount = function () { return Promise.resolve(); };

    // ───────── utilidades ─────────
    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function guard() { if (stopped) throw new Error('presentacion-detenida'); }
    // Velocidad constante con arranque y frenado suaves (8 % del tiempo en cada extremo): la página se lee
    // pareja de principio a fin, sin tramos que pasen demasiado rápido.
    function ease(t) {
        var a = 0.08, v = 1 / (1 - a);
        if (t < a) return 0.5 * v * t * t / a;
        if (t > 1 - a) return 1 - 0.5 * v * (1 - t) * (1 - t) / a;
        return v * (t - a / 2);
    }

    function waitReady() {
        if (doc.body.classList.contains('avotex-ready') || !doc.getElementById('avotexPageLoader')) return wait(300);
        return new Promise(function (resolve) {
            var t0 = Date.now();
            (function check() {
                if (doc.body.classList.contains('avotex-ready') || Date.now() - t0 > TIMING.maxWaitReady) return resolve();
                setTimeout(check, 120);
            })();
        });
    }

    // Destino: la escena Básico dentro del tramo fijado de planes (o el inicio de #pricing sin animaciones).
    function planTarget() {
        var stage = doc.querySelector('[data-plans-stage]');
        var ST = root.ScrollTrigger;
        if (stage && ST && ST.getAll) {
            var st = ST.getAll().filter(function (t) { return t.trigger === stage; })[0];
            if (st) return st.start + PLAN_MARK * (st.end - st.start);
        }
        var sec = doc.getElementById('pricing');
        return sec ? sec.getBoundingClientRect().top + root.scrollY : doc.documentElement.scrollHeight;
    }

    function scrollTour(ms) {
        return new Promise(function (resolve) {
            var t0 = performance.now();
            (function frame(now) {
                if (stopped) return resolve();
                var p = Math.min(1, (now - t0) / ms);
                // El destino se recalcula en cada cuadro: las imágenes diferidas pueden cambiar la altura.
                root.scrollTo(0, Math.round(planTarget() * ease(p)));
                setProgress(p * 0.7);
                if (p < 1) requestAnimationFrame(frame); else resolve();
            })(t0);
        });
    }

    async function typeInto(el, text) {
        el.focus();
        el.value = '';
        for (var i = 0; i < text.length; i++) {
            guard();
            el.value += text[i];
            el.dispatchEvent(new Event('input', { bubbles: true }));
            await wait(TIMING.typeCharMs);
        }
    }

    async function simulateSignup() {
        guard();
        if (typeof root.openPlanModal !== 'function') return;
        setHud('Simulación de registro (no se crea ninguna cuenta)');
        root.openPlanModal(DEMO.plan[0], DEMO.plan[1], DEMO.plan[2]);
        await wait(TIMING.stepPauseMs);
        await typeInto(doc.getElementById('modalEmail'), DEMO.email);
        await typeInto(doc.getElementById('modalPassword'), DEMO.password);
        await typeInto(doc.getElementById('modalPasswordConfirm'), DEMO.password);
        await wait(TIMING.stepPauseMs); guard();
        setProgress(0.82);
        // Paso 2 (resumen del plan): goToStep2 solo valida en el navegador; no envía nada.
        if (typeof root.goToStep2 === 'function') root.goToStep2({ preventDefault: function () {} });
        await wait(TIMING.stepPauseMs + 600); guard();
        // «Crear cuenta» simulado: solo el indicador de carga, sin createAccount().
        var btnText = doc.getElementById('createBtnText'), spin = doc.getElementById('createBtnSpinner');
        var btn = doc.getElementById('createAccountBtn');
        if (btn) btn.style.transform = 'scale(.97)';
        if (btnText) btnText.style.display = 'none';
        if (spin) spin.style.display = 'block';
        await wait(TIMING.processingMs); guard();
        if (btn) btn.style.transform = '';
        if (btnText) btnText.style.display = 'inline';
        if (spin) spin.style.display = 'none';
        doc.getElementById('modalStep2').style.display = 'none';
        doc.getElementById('modalStep3').style.display = 'block';
        setProgress(0.94);
        setHud('Cuenta de ejemplo lista · regresando a la huerta');
        await wait(TIMING.successMs);
    }

    // ───────── regreso a Street View (sin login) ─────────
    var leaving = false;
    function goBack() {
        if (leaving) return; leaving = true;
        stopped = true;
        setProgress(1);
        // ScreenX: las laterales siguen en el Panel Administrador; se les pide volver también.
        if (SX_ROLE && typeof root.BroadcastChannel === 'function') {
            try {
                var email = localStorage.getItem('avotex_email') || '';
                var ch = new root.BroadcastChannel('avotex-admin-sx:' + email);
                ch.postMessage({ t: 'back' });
                ch.close();
            } catch (e) { /* nada */ }
        }
        var fx = doc.createElement('div');
        fx.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:grid;place-items:center;opacity:0;transition:opacity .4s ease-out;' +
            'background:radial-gradient(circle at 50% 50%, rgba(185,246,47,.3), rgba(5,16,10,.97) 60%);color:#eafff0;' +
            'font:700 18px/1.3 Inter,system-ui,sans-serif;letter-spacing:.3px';
        fx.textContent = 'Volviendo a la huerta…';
        doc.body.appendChild(fx);
        requestAnimationFrame(function () { fx.style.opacity = '1'; });
        setTimeout(function () { root.location.href = 'admin.html'; }, 520);
    }

    // ───────── indicador discreto ─────────
    function mountHud() {
        hud = doc.createElement('div');
        hud.id = 'presentacionHud';
        hud.setAttribute('role', 'status');
        hud.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483500;display:flex;align-items:center;gap:12px;' +
            'padding:8px 10px 8px 16px;border-radius:999px;background:rgba(7,20,13,.86);color:#eafff0;border:1px solid rgba(185,246,47,.4);' +
            'box-shadow:0 10px 28px rgba(0,0,0,.35);font:600 13px/1.2 Inter,system-ui,sans-serif;backdrop-filter:blur(8px)';
        hud.innerHTML = '<span data-t>Modo presentación</span>' +
            '<span style="width:90px;height:4px;border-radius:2px;background:rgba(255,255,255,.18);overflow:hidden">' +
            '<i data-p style="display:block;height:100%;width:0;background:#b9f62f"></i></span>' +
            '<button type="button" data-x style="all:unset;cursor:pointer;padding:6px 12px;border-radius:999px;background:rgba(255,255,255,.12);font-weight:700">Salir</button>';
        hud.querySelector('[data-x]').addEventListener('click', goBack);
        doc.body.appendChild(hud);
    }
    function setHud(t) { if (hud) hud.querySelector('[data-t]').textContent = t; }
    function setProgress(p) { if (hud) hud.querySelector('[data-p]').style.width = Math.round(p * 100) + '%'; }

    doc.addEventListener('keydown', function (e) { if (e.key === 'Escape') goBack(); });

    async function run() {
        try { history.scrollRestoration = 'manual'; } catch (e) { /* nada */ }
        root.scrollTo(0, 0);
        mountHud();
        await waitReady();
        guard();
        setHud('Modo presentación · recorriendo AVOTEX');
        await scrollTour(TIMING.scrollMs);
        guard();
        setHud('Planes y precios');
        await wait(TIMING.holdPlanMs);
        await simulateSignup();
    }

    function boot() {
        run().catch(function () { /* detenida con Esc/Salir */ }).then(goBack);
    }
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(window, document);
