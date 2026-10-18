/* =====================================================================
   AVOTEX · Landing pública
   Módulos:
     1. Loader (logo reveal + solo recursos críticos del hero)
     2. Modal de planes (Firebase Auth + Supabase) · sin cambios funcionales
     3. Formulario de contacto (EmailJS)
     4. Navegación, anclas y videos en viewport
     5. Planos secuencia: Acto I (fruto) y Acto II (territorio y satélite)
     6. Secciones editoriales con scroll (producto, demo, comparativa).
        Cultivos, evidencia y aliados usan initReveal(): entrada única, sin scroll-driven
     7. Planes y precios por niveles (Free, Básico, Pro Satelital)
   ===================================================================== */

/* ---------- 1. Loader ---------- */

/* 1a. Logo reveal (pantalla de carga)
   Las letras ancla (V, T, X) crecen desde su base con una máscara; después A, O y E
   salen desde detrás de su vecina derecha y se deslizan a la izquierda hasta su sitio.
   Todo lo ajustable vive en LOGO_REVEAL. Unidades de distancia: px del logo original (1600 de ancho). */
const LOGO_REVEAL = {
    // Qué letra se esconde detrás de cuál, en el orden en que entran.
    pairs: [
        { letter: 'a', behind: 'v' },
        { letter: 'o', behind: 't' },
        { letter: 'e', behind: 'x' }
    ],
    anchors: ['v', 't', 'x'],          // orden de aparición de las anclas

    anchorStart: 0.05,                 // s · cuándo empiezan a crecer las anclas
    anchorDuration: 0.7,
    anchorStagger: 0.09,
    anchorRise: 26,                    // px · cuánto suben las anclas mientras se descubren
    anchorEase: 'power3.out',

    slideStart: 0.5,                   // s · cuándo sale la primera letra escondida
    slideDuration: 1.05,
    slideStagger: 0.14,
    slideEase: 'expo.out',             // aceleración natural, frenado preciso, sin rebote
    hideLine: 0.42,                    // 0–1 · dónde está el borde oculto dentro de la ancla (0 = izq.)
    distance: 1,                       // multiplicador del recorrido calculado (0.6 = más corto)

    settleFrom: 0.985,                 // escala inicial de todo el logo (1 = sin escala)

    // Bucle mientras cargan los recursos: compone → pausa → se deshace en reversa → repite.
    loopHold: 0.7,                     // s · tiempo con el logo completo antes de deshacerlo
    rewindSpeed: 2.2,                  // velocidad de la reversa (2.2 = 2.2× más rápida que la entrada)
    loopGap: 0.2,                      // s · pausa con el logo oculto antes de volver a componerlo

    sheen: true,                       // brillo final (solo en la última vuelta, cuando todo cargó)
    sheenDuration: 0.9,
    holdAfter: 0.2,                    // s · pausa con el logo completo antes de abrir la página
    decodeTimeout: 1500                // ms · si las piezas tardan más, se muestra el logo estático
};

// El loader resuelve esta promesa cuando los recursos de la página están listos.
let markPageReady;
const pageReady = new Promise(resolve => { markPageReady = resolve; });

function playLogoReveal() {
    const html = document.documentElement;
    const root = document.querySelector('[data-logo-reveal]');
    const finish = () => html.classList.remove('avx-reveal', 'avx-reveal-run');
    const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!root || !html.classList.contains('avx-reveal') || reduced || !window.gsap) {
        finish();
        return Promise.resolve();
    }

    const pieces = {};
    root.querySelectorAll('image[data-letter]').forEach(el => {
        pieces[el.dataset.letter] = {
            el,
            clip: document.querySelector(el.parentNode.getAttribute('clip-path').slice(4, -1) + ' rect'),
            x: +el.getAttribute('x'), y: +el.getAttribute('y'),
            w: +el.getAttribute('width'), h: +el.getAttribute('height')
        };
    });

    // Decodificamos las piezas antes de empezar: nunca se anima una letra a medio cargar.
    const decode = Object.values(pieces).map(p => {
        const img = new Image();
        img.src = p.el.getAttribute('href');
        return img.decode ? img.decode().catch(() => {}) : Promise.resolve();
    });
    const timeout = new Promise(r => setTimeout(() => r('timeout'), LOGO_REVEAL.decodeTimeout));

    return Promise.race([Promise.all(decode), timeout]).then(result => {
        if (result === 'timeout' || !html.classList.contains('avx-reveal')) { finish(); return; }

        const C = LOGO_REVEAL;
        const sheen = root.querySelector('.avx-logo-reveal__sheen');
        const tl = gsap.timeline({ defaults: { overwrite: 'auto' } });

        // Estado inicial (se aplica antes de mostrar el SVG: sin parpadeo).
        C.anchors.forEach(k => {
            const p = pieces[k];
            gsap.set(p.clip, { attr: { x: p.x - 20, y: p.y + p.h, width: p.w + 40, height: 0 } });
            gsap.set(p.el, { y: C.anchorRise, opacity: 0 });
        });
        C.pairs.forEach(({ letter, behind }) => {
            const p = pieces[letter], a = pieces[behind];
            const line = a.x + a.w * C.hideLine;           // borde oculto dentro de la ancla
            p.dx = Math.max(0, line - p.x) * C.distance;    // recorrido hasta quedar escondida
            gsap.set(p.clip, { attr: { x: -40, y: -40, width: line + 40, height: 680 } });
            gsap.set(p.el, { x: p.dx, opacity: 0 });
        });
        gsap.set(root, { scale: C.settleFrom });
        html.classList.add('avx-reveal-run');

        // 1–2. Las anclas crecen desde su base.
        C.anchors.forEach((k, i) => {
            const p = pieces[k], at = C.anchorStart + i * C.anchorStagger;
            tl.to(p.clip, { attr: { y: p.y - 20, height: p.h + 40 }, duration: C.anchorDuration, ease: C.anchorEase }, at)
              .to(p.el, { y: 0, duration: C.anchorDuration, ease: C.anchorEase }, at)
              .to(p.el, { opacity: 1, duration: C.anchorDuration * 0.5, ease: 'power1.out' }, at);
        });

        // 3–5. Las letras escondidas salen hacia la izquierda y encajan.
        C.pairs.forEach(({ letter }, i) => {
            const p = pieces[letter], at = C.slideStart + i * C.slideStagger;
            tl.to(p.el, { x: 0, duration: C.slideDuration, ease: C.slideEase }, at)
              .to(p.el, { opacity: 1, duration: C.slideDuration * 0.3, ease: 'power1.out' }, at);
        });

        // Asentamiento muy leve de todo el logo durante la secuencia.
        const settleEnd = C.slideStart + (C.pairs.length - 1) * C.slideStagger + C.slideDuration;
        tl.to(root, { scale: 1, duration: settleEnd, ease: 'power2.out' }, 0);

        return new Promise(resolve => {
            let ready = false, holding = null, closed = false;

            // 6. Cierre (una sola vez): línea de luz sobre el logo completo y paso al <img> original.
            const close = () => {
                if (closed) return;
                closed = true;
                const end = () => {
                    // Estado final = <img> original intacto. Las piezas coinciden píxel a píxel.
                    finish();
                    gsap.set(root, { clearProps: 'transform' });
                    setTimeout(resolve, C.holdAfter * 1000);
                };
                if (!C.sheen || !sheen) return end();
                gsap.timeline({ onComplete: end })
                    .fromTo(sheen, { backgroundPosition: '120% 0' }, { backgroundPosition: '-20% 0', duration: C.sheenDuration, ease: 'power2.inOut' }, 0)
                    .to(sheen, { opacity: 0.85, duration: C.sheenDuration * 0.35, ease: 'power1.out' }, 0)
                    .to(sheen, { opacity: 0, duration: C.sheenDuration * 0.4, ease: 'power1.in' }, C.sheenDuration * 0.6);
            };

            // Logo compuesto: si ya cargó todo, cerramos; si no, esperamos y lo deshacemos en reversa.
            tl.eventCallback('onComplete', () => {
                if (ready) return close();
                holding = gsap.delayedCall(C.loopHold, () => {
                    holding = null;
                    if (ready) close(); else tl.timeScale(C.rewindSpeed).reverse();
                });
            });
            // Logo oculto otra vez: nueva vuelta.
            tl.eventCallback('onReverseComplete', () => {
                gsap.delayedCall(C.loopGap, () => tl.timeScale(1).play());
            });

            pageReady.then(() => {
                ready = true;
                if (holding) { holding.kill(); holding = null; close(); }
                // Si estaba deshaciéndose, invierte el sentido y termina de componerse desde ahí.
                else if (tl.reversed()) tl.timeScale(1).play();
            });
        });
    }).catch(finish);
}

// Arranca en cuanto se ejecuta el script (está al final del <body>), sin esperar a DOMContentLoaded.
const logoRevealDone = playLogoReveal();

/* 1b. Loader */
function startAvotexPageLoader() {
    const loader = document.getElementById('avotexPageLoader');
    if (!loader) return Promise.resolve();
    const status = loader.querySelector('[data-loader-status]');

    // Solo esperamos lo que se ve en el primer cuadro: la tierra de fondo (y su montículo
    // delantero), el aguacate y las tipografías. Todo lo demás carga de forma diferida.
    // Las imágenes lazy quedan fuera: tras el loader la página está oculta y nunca empezarían a cargar.
    const critical = Array.from(document.querySelectorAll('.soil-plate img:not([loading="lazy"]), .fruit-whole img:not([loading="lazy"])'));
    const waitImage = img => new Promise(resolve => {
        if (img.complete && img.naturalWidth) return resolve();
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
    });
    const fonts = document.fonts && document.fonts.ready ? document.fonts.ready.catch(() => {}) : Promise.resolve();
    const ready = Promise.all([...critical.map(waitImage), fonts]);
    const minimum = new Promise(r => setTimeout(r, 500));
    const safety = new Promise(r => setTimeout(r, 6000));

    // Recursos listos (o tope de seguridad) → el logo reveal deja de repetirse, termina
    // de componerse y solo entonces se abre la página.
    return Promise.race([Promise.all([ready, minimum]), safety])
        .then(() => { markPageReady(); return logoRevealDone; })
        .then(() => {
            if (status) status.textContent = 'Listo';
            document.documentElement.classList.remove('avotex-loading');
            document.body.classList.add('avotex-ready');
            loader.classList.add('is-hidden');
            setTimeout(() => loader.remove(), 650);
        });
}

/* ---------- 2. Modal de planes ---------- */
let _currentPlan = { name: '', price: 0, tokens: 0 };
let _lastFocus = null;

function openPlanModal(planName, price, tokens) {
    _currentPlan = { name: planName, price, tokens };
    _lastFocus = document.activeElement;
    document.getElementById('modalPlanName').textContent = planName;
    document.getElementById('modalStep1').style.display = 'block';
    document.getElementById('modalStep2').style.display = 'none';
    document.getElementById('modalStep3').style.display = 'none';
    document.getElementById('step1Error').style.display = 'none';
    document.getElementById('signupForm').reset();
    document.getElementById('planModal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
    setTimeout(() => document.getElementById('modalEmail').focus(), 50);
}

function closePlanModal() {
    const modal = document.getElementById('planModal');
    if (!modal || modal.style.display === 'none') return;
    modal.style.display = 'none';
    document.body.style.overflow = '';
    if (_lastFocus && _lastFocus.focus) _lastFocus.focus();
}

function goToStep2(e) {
    e.preventDefault();
    const password = document.getElementById('modalPassword').value;
    const confirm = document.getElementById('modalPasswordConfirm').value;
    const errorEl = document.getElementById('step1Error');

    if (password.length < 6) {
        errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres.';
        errorEl.style.display = 'block';
        return;
    }
    if (password !== confirm) {
        errorEl.textContent = 'Las contraseñas no coinciden.';
        errorEl.style.display = 'block';
        return;
    }

    errorEl.style.display = 'none';

    document.getElementById('paypalPlanName').textContent = _currentPlan.name;
    document.getElementById('paypalTokens').textContent = _currentPlan.tokens.toLocaleString('es-MX');
    document.getElementById('paypalPrice').textContent = _currentPlan.price === 0
        ? 'Gratis'
        : '$' + _currentPlan.price.toLocaleString('es-MX') + ' MXN/mes';

    document.getElementById('modalStep1').style.display = 'none';
    document.getElementById('modalStep2').style.display = 'block';
    document.getElementById('step2Error').style.display = 'none';
}

function backToStep1() {
    document.getElementById('modalStep2').style.display = 'none';
    document.getElementById('modalStep1').style.display = 'block';
}

async function createAccount() {
    const email = document.getElementById('modalEmail').value.trim();
    const password = document.getElementById('modalPassword').value;
    const errorEl = document.getElementById('step2Error');
    const btn = document.getElementById('createAccountBtn');
    const btnText = document.getElementById('createBtnText');
    const spinner = document.getElementById('createBtnSpinner');

    btnText.style.display = 'none';
    spinner.style.display = 'block';
    btn.disabled = true;
    errorEl.style.display = 'none';

    try {
        const auth = window._avotexAuth;
        const createUser = window._createUserWithEmailAndPassword;

        await createUser(auth, email, password);

        const SUPABASE_URL = window._SUPABASE_URL;
        const SUPABASE_ANON_KEY = window._SUPABASE_ANON_KEY;

        await fetch(`${SUPABASE_URL}/rest/v1/users`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ user_email: email, tokens: _currentPlan.tokens })
        });

        document.getElementById('modalStep2').style.display = 'none';
        document.getElementById('modalStep3').style.display = 'block';

    } catch (err) {
        let msg = 'Ocurrió un error al crear la cuenta.';
        if (err.code === 'auth/email-already-in-use') msg = 'Este correo ya está registrado.';
        else if (err.code === 'auth/invalid-email') msg = 'El correo no es válido.';
        else if (err.code === 'auth/weak-password') msg = 'La contraseña es muy débil.';
        errorEl.textContent = msg;
        errorEl.style.display = 'block';
    } finally {
        btnText.style.display = 'inline';
        spinner.style.display = 'none';
        btn.disabled = false;
    }
}

document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') closePlanModal();
});

/* ---------- 3. Formulario de contacto (EmailJS) ---------- */
function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;
    const statusEl = form.querySelector('[data-form-status]');
    const submitBtn = form.querySelector('.submit-btn');
    const setStatus = (msg, kind) => {
        if (!statusEl) return;
        statusEl.textContent = msg;
        statusEl.className = 'form-status' + (kind ? ' is-' + kind : '');
    };

    if (window.emailjs) window.emailjs.init('BSxLEeaCjlR33sZkl');

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        if (!form.checkValidity()) {
            form.reportValidity();
            return;
        }
        if (!window.emailjs) {
            setStatus('No pudimos cargar el servicio de correo. Escríbenos a vexmxoficial@gmail.com.', 'error');
            return;
        }

        const originalText = submitBtn.textContent;
        submitBtn.textContent = 'Enviando…';
        submitBtn.disabled = true;
        setStatus('', '');

        const templateParams = {
            name: document.getElementById('name').value.trim(),
            email: document.getElementById('email').value.trim(),
            message: document.getElementById('message').value.trim()
        };

        window.emailjs.send('service_92stt0p', 'template_i1dzybe', templateParams)
            .then(function () {
                setStatus('Mensaje enviado correctamente. Te contactaremos pronto.', 'ok');
                form.reset();
            }, function (error) {
                setStatus('Error al enviar el mensaje. Intenta de nuevo o escríbenos por correo.', 'error');
                console.error('EmailJS Error:', error);
            })
            .finally(function () {
                submitBtn.textContent = originalText;
                submitBtn.disabled = false;
            });
    });
}

/* ---------- 4. Navegación, anclas, videos ---------- */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function initNav() {
    const nav = document.querySelector('[data-nav]');
    const toggle = document.querySelector('.menu-toggle');
    const links = document.querySelector('.nav-links');

    const closeMenu = () => {
        if (!toggle) return;
        toggle.classList.remove('active');
        links.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
        toggle.setAttribute('aria-label', 'Abrir menú');
    };

    if (toggle && links) {
        toggle.addEventListener('click', () => {
            const open = !links.classList.contains('active');
            toggle.classList.toggle('active', open);
            links.classList.toggle('active', open);
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
        });
        links.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));
        document.addEventListener('click', e => {
            if (!links.contains(e.target) && !toggle.contains(e.target)) closeMenu();
        });
        document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    }

    // Se oculta al bajar y reaparece al subir. Un solo listener pasivo, trabajo mínimo.
    let last = window.scrollY;
    let ticking = false;
    window.addEventListener('scroll', () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
            const y = window.scrollY;
            const menuOpen = links && links.classList.contains('active');
            if (nav && !menuOpen) nav.classList.toggle('is-hidden', y > last && y > 120);
            last = y;
            ticking = false;
        });
    }, { passive: true });

    // Enlace activo según la sección visible
    const navAnchors = Array.from(document.querySelectorAll('.nav-links a[href^="#"]'));
    const sections = navAnchors.map(a => document.querySelector(a.getAttribute('href'))).filter(Boolean);
    if ('IntersectionObserver' in window && sections.length) {
        const io = new IntersectionObserver(entries => {
            entries.forEach(entry => {
                if (!entry.isIntersecting) return;
                navAnchors.forEach(a => a.classList.toggle('is-current', a.getAttribute('href') === '#' + entry.target.id));
            });
        }, { rootMargin: '-45% 0px -50% 0px' });
        sections.forEach(s => io.observe(s));
    }
}

function scrollToY(y) {
    window.scrollTo({ top: y, behavior: prefersReducedMotion.matches ? 'auto' : 'smooth' });
}

function initAnchors() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            const hash = this.getAttribute('href');
            if (hash.length < 2 || this.hasAttribute('data-story-start')) return;
            const target = document.querySelector(hash);
            if (!target) return;
            e.preventDefault();
            history.pushState(null, '', hash);
            const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 0;
            const top = hash === '#historia' || hash === '#top'
                ? target.getBoundingClientRect().top + window.scrollY
                : target.getBoundingClientRect().top + window.scrollY - navH + 1;
            scrollToY(top);
            if (target.tabIndex < 0 && !/^(A|BUTTON|INPUT)$/.test(target.tagName)) target.setAttribute('tabindex', '-1');
            target.focus({ preventScroll: true });
        });
    });
}

function initViewportVideos() {
    const videos = document.querySelectorAll('video[data-autoplay-on-view]');
    if (!videos.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            const v = entry.target;
            if (entry.isIntersecting && !prefersReducedMotion.matches) {
                v.play().catch(() => { /* el póster queda visible */ });
            } else {
                v.pause();
            }
        });
    }, { threshold: 0.25 });
    videos.forEach(v => io.observe(v));
}

/* ---------- 4b. Cultivos · Resultados · Aliados: entrada discreta ---------- */
/*
   Sin pin ni scrub: cada bloque [data-reveal] aparece una sola vez al entrar en
   pantalla y las cifras de #evidencia cuentan hasta su valor real. Si no hay
   IntersectionObserver o el usuario pide movimiento reducido, no se oculta nada.
*/
function initReveal() {
    const items = Array.from(document.querySelectorAll('[data-reveal]'));
    if (!items.length || !('IntersectionObserver' in window) || prefersReducedMotion.matches) return;
    const root = document.documentElement;
    root.classList.add('reveal-ready');

    // Escalonado breve entre hermanos de un mismo grupo
    const groups = new Map();
    items.forEach(el => {
        const key = el.parentElement;
        const i = groups.get(key) || 0;
        groups.set(key, i + 1);
        el.style.setProperty('--rd', Math.min(i * 0.08, 0.4) + 's');
    });

    const fmt = (v, dec, th) => {
        const n = Number(v).toFixed(dec);
        return th ? Number(n).toLocaleString('en-US') : n;
    };
    const countUp = scope => {
        scope.querySelectorAll('[data-count]').forEach(el => {
            const end = parseFloat(el.dataset.count);
            const dec = parseInt(el.dataset.decimals || '0', 10);
            const th = el.hasAttribute('data-thousands');
            const dur = 1100;
            let t0 = null;
            const tick = t => {
                if (t0 === null) t0 = t;
                const k = Math.min(1, (t - t0) / dur);
                const e = 1 - Math.pow(1 - k, 3);
                el.textContent = fmt(end * e, dec, th);
                if (k < 1) requestAnimationFrame(tick); else el.textContent = fmt(end, dec, th);
            };
            el.textContent = fmt(0, dec, th);
            requestAnimationFrame(tick);
        });
    };

    const io = new IntersectionObserver(entries => {
        entries.forEach(entry => {
            if (!entry.isIntersecting) return;
            const el = entry.target;
            io.unobserve(el);
            el.classList.add('is-in');
            if (el.querySelector('[data-count]') && el.closest('[data-evidence]')) countUp(el);
            const delay = parseFloat(el.style.getPropertyValue('--rd')) || 0;
            setTimeout(() => el.classList.add('is-done'), (delay + 0.8) * 1000);
        });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
    items.forEach(el => io.observe(el));

    // Si el usuario activa movimiento reducido a mitad de visita, todo queda visible
    const showAll = () => {
        if (!prefersReducedMotion.matches) return;
        io.disconnect();
        items.forEach(el => el.classList.add('is-in', 'is-done'));
        root.classList.remove('reveal-ready');
        document.querySelectorAll('[data-evidence] [data-count]').forEach(el => {
            el.textContent = fmt(parseFloat(el.dataset.count), parseInt(el.dataset.decimals || '0', 10), el.hasAttribute('data-thousands'));
        });
    };
    if (prefersReducedMotion.addEventListener) prefersReducedMotion.addEventListener('change', showAll);
}

/* ---------- 5. Planos secuencia (GSAP + ScrollTrigger) ---------- */
/*
   Dos actos fijados, cada uno con su línea de tiempo en unidades propias:
     Acto I  · #historia   (0 a 156): tierra, Michoacán → México → América, regreso al fruto,
                                      anatomía, daños, riesgo, celular enterrado, observación, IA.
     Acto II · #territorio (0 a 100): hoja, mapa, satélite, ecosistema, campo.
     Acto III · #cultivos  (0 a 100): recorrido entre las huertas de limón, mango, berries, café y guayaba.
   El pico de la página sigue siendo hoja → territorio (mayor tramo de scroll del Acto II).
*/
// El recorrido geográfico añade 28 unidades antes del fruto y la emergencia del celular 8 más
// antes de la observación. El ritmo por unidad es el mismo de antes (0.1167 vh en escritorio).
const ACT1 = {
    lengthDesktop: 18.2, lengthMobile: 14.3, total: 156,
    marks: { hero: 0, datos: 20, historia: 53, anatomia: 66, costra: 87.5, obs: 127, ia: 144 },
    rail: [['hero', 0, 8], ['datos', 8, 51], ['anatomia', 51, 78], ['costra', 78, 118], ['obs', 118, 142], ['ia', 142, 157]]
};
const ACT2 = {
    lengthDesktop: 12.5, lengthMobile: 9.5, total: 100,
    marks: { mapa: 0, sat: 31, eco: 80, campo: 93 },
    rail: [['mapa', 0, 29], ['sat', 29, 77], ['eco', 77, 91], ['campo', 91, 101]]
};

const lerp = (a, b, t) => a + (b - a) * t;
const clamp01 = v => Math.max(0, Math.min(1, v));
const fmtNumber = (v, decimals, thousands) => {
    const n = Number(v).toFixed(decimals || 0);
    return thousands ? Number(n).toLocaleString('en-US') : n;
};

function initMotion() {
    if (!window.gsap || !window.ScrollTrigger) return; // modo estático legible
    gsap.registerPlugin(ScrollTrigger);
    const hasDraw = !!window.DrawSVGPlugin;
    if (hasDraw) gsap.registerPlugin(DrawSVGPlugin);

    const mm = gsap.matchMedia();
    mm.add({
        desktop: '(min-width: 761px) and (prefers-reduced-motion: no-preference)',
        mobile: '(max-width: 760px) and (prefers-reduced-motion: no-preference)'
    }, ctx => {
        const isMobile = ctx.conditions.mobile;
        document.documentElement.classList.add('motion-on');
        const apis = [];
        // Cada bloque se construye aislado: si uno falla (p. ej. falta un elemento del HTML),
        // los demás —incluidos los planes— siguen funcionando.
        const safe = (name, fn) => { try { return fn(); } catch (err) { console.error('[Avotex] ' + name + ':', err); return null; } };
        const act1 = document.querySelector('.story--fruto');
        const act2 = document.querySelector('.story--territorio');
        const act3 = document.querySelector('.story--cultivos');
        if (act1) { act1.classList.add('story--motion'); apis.push(safe('Acto I', () => buildAct1({ story: act1, isMobile, hasDraw }))); }
        if (act2) { act2.classList.add('story--motion'); apis.push(safe('Acto II', () => buildAct2({ story: act2, isMobile, hasDraw }))); }
        if (act3) { act3.classList.add('story--motion'); apis.push(safe('Acto III', () => buildAct3({ story: act3, isMobile }))); }
        apis.push(safe('Secciones', () => buildSections({ isMobile })));
        apis.push(safe('Planes', () => buildPlans({ isMobile, hasDraw })));

        const refresh = () => ScrollTrigger.refresh();
        window.addEventListener('load', refresh, { once: true });
        if (document.fonts && document.fonts.ready) document.fonts.ready.then(refresh);
        return () => {
            apis.forEach(a => a && a.destroy && a.destroy());
            window.removeEventListener('load', refresh);
            document.documentElement.classList.remove('motion-on');
            if (act1) act1.classList.remove('story--motion');
            if (act2) act2.classList.remove('story--motion');
            if (act3) act3.classList.remove('story--motion');
        };
    });
}

/* Utilidades compartidas por los actos */
function drawer(hasDraw) {
    return (targets, from, to, extra = {}) => hasDraw
        ? [targets, { drawSVG: from }, { drawSVG: to, ...extra }]
        : [targets, { opacity: from === '0%' ? 0 : 1 }, { opacity: to === '0%' ? 0 : 1, ...extra }];
}

function scrubVideo(video) {
    let requested = false;
    const proxy = { t: 0 };
    let pending = false;
    const request = () => {
        if (requested || !video) return;
        requested = true;
        const mp4 = video.canPlayType('video/mp4; codecs="avc1.42E01E"');
        video.src = (!mp4 && video.dataset.srcWebm) ? video.dataset.srcWebm : video.dataset.src;
        video.preload = 'auto';
        video.load();
    };
    const seek = () => {
        if (!video || pending) return;
        pending = true;
        requestAnimationFrame(() => {
            pending = false;
            if (video.readyState >= 1 && isFinite(video.duration)) {
                const target = proxy.t * Math.max(0, video.duration - 0.05);
                if (Math.abs(video.currentTime - target) > 0.03) video.currentTime = target;
            }
        });
    };
    if (video) video.addEventListener('loadeddata', () => seek());
    return { proxy, request, seek };
}

function pinnedTimeline(stage, length, isMobile, total, onUpdate) {
    return gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: {
            trigger: stage,
            start: 'top top',
            end: () => '+=' + Math.round(length * window.innerHeight),
            pin: true,
            scrub: isMobile ? 0.6 : 0.9,
            anticipatePin: 1,
            invalidateOnRefresh: true
        },
        onUpdate
    });
}

function railController(stage, conf) {
    const buttons = Array.from(stage.querySelectorAll('[data-rail-to]'));
    const update = t => buttons.forEach(btn => {
        const r = conf.rail.find(x => x[0] === btn.dataset.railTo);
        btn.setAttribute('aria-current', String(!!r && t >= r[1] && t < r[2]));
    });
    return { update };
}

function counterTweens(tl, root, at, dur) {
    root.querySelectorAll('[data-count]').forEach(el => {
        const end = parseFloat(el.dataset.count);
        const dec = parseInt(el.dataset.decimals || '0', 10);
        const thousands = el.hasAttribute('data-thousands');
        const p = { v: 0 };
        el.textContent = fmtNumber(0, dec, thousands);
        tl.to(p, { v: end, duration: dur, ease: 'power1.out', onUpdate: () => { el.textContent = fmtNumber(p.v, dec, thousands); } }, at);
    });
}

/* ===================== ACTO I · El fruto ===================== */
/*
   Escenas (unidades de la línea de tiempo):
     0–8      Tierra: el aguacate descansa en la huerta; el título queda detrás del fruto.
     8–19     La tierra se disuelve en la superficie terrestre y la cámara baja hasta Michoacán;
              el aguacate vuela y se posa sobre Uruapan (19.41° N, 102.06° O).
     19–28    Michoacán con su límite (Natural Earth) y los datos de producción.
     28–46    La cámara se aleja: México → América del Norte → Centroamérica → el continente.
     46–48    América completa.
     48–55    Regreso: la cámara vuelve a bajar hacia el fruto y aterriza sobre la tierra.
     53–126   Historia, anatomía, daños y riesgo (las mismas escenas de antes, +28).
     126–135  Tierra de nuevo: el celular enterrado emerge del suelo.
     135–156  Observación e IA (la secuencia original, +36).
*/

/* Superficie terrestre en <canvas>: tres capas raster de la misma proyección ortográfica
   (globo, México, Michoacán) y límites vectoriales reales. Solo redibuja si algo cambió. */
function geoStage(root, isMobile) {
    const G = window.AVOTEX_GEO;
    const canvas = root.querySelector('[data-f="geo-canvas"]');
    const plane = root.querySelector('[data-f="geo-plane"]');
    const anchor = root.querySelector('[data-f="geo-anchor"]');
    const ctx = canvas.getContext('2d');
    const st = { x: 1200, y: 1000, s: 1, tilt: 0, states: 0, mexico: 0, borders: 0, mich: 0, michFill: 0, focus: 0 };
    const empty = { st, load() {}, resize() {}, render() {}, pin: () => ({ x: 0, y: 0 }), proj: () => [0, 0], ready: false };
    if (!G || !ctx) return empty;

    const sfx = isMobile ? '-m' : '';
    const layers = ['L0', 'L1', 'L2'].map((k, i) => Object.assign({ key: k, img: null, ok: false, src: `assets/geo/geo-l${i}${sfx}.webp` }, G.layers[k]));
    const P = { states: new Path2D(G.states), mexico: new Path2D(G.mexico), mich: new Path2D(G.mich), borders: new Path2D(G.borders) };
    // Longitud del contorno de Michoacán (px del lienzo L0) para el trazo progresivo
    const michLen = (() => {
        let len = 0;
        G.mich.split(/[MZ]/).forEach(seg => {
            const n = seg.trim().split(/\s+/).map(Number);
            for (let i = 2; i + 1 < n.length; i += 2) len += Math.hypot(n[i] - n[i - 2], n[i + 1] - n[i - 1]);
        });
        return len || 1;
    })();

    let W = 1, H = 1, dpr = 1, cw = 1, ch = 1, ox = 0, oy = 0, dirty = true, raf = 0, loading = false;
    const R = G.proj.R, C = G.proj.C;
    const ph0 = G.proj.lat0 * Math.PI / 180, la0 = G.proj.lon0 * Math.PI / 180;

    // lon/lat → px del lienzo L0 (misma fórmula que el generador)
    const proj = (lon, lat) => {
        const la = lon * Math.PI / 180, ph = lat * Math.PI / 180;
        return [C + R * Math.cos(ph) * Math.sin(la - la0), C - R * (Math.cos(ph0) * Math.sin(ph) - Math.sin(ph0) * Math.cos(ph) * Math.cos(la - la0))];
    };

    const load = () => {
        if (loading) return; loading = true;
        layers.forEach(L => {
            const im = new Image();
            im.decoding = 'async';
            im.onload = () => { L.ok = true; dirty = true; schedule(); };
            im.src = L.src; L.img = im;
        });
    };
    const resize = () => {
        W = root.clientWidth || window.innerWidth; H = root.clientHeight || window.innerHeight;
        cw = W * 1.5; ch = H * 1.4;               // .geo__plane: 150 % × 140 %, desde -25 % / -40 %
        ox = W * 0.25 + W / 2; oy = H * 0.40 + H / 2;
        dpr = Math.min(window.devicePixelRatio || 1, isMobile ? 2 : 1.25);
        canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
        dirty = true;
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

    function draw() {
        if (!dirty) return;
        dirty = false;
        const s = st.s;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, cw, ch);
        ctx.save();
        ctx.translate(ox, oy); ctx.scale(s, s); ctx.translate(-st.x, -st.y);
        const vx0 = st.x - ox / s, vy0 = st.y - oy / s, vx1 = vx0 + cw / s, vy1 = vy0 + ch / s;

        // Atmósfera: solo visible cuando el borde del globo entra en cuadro
        if (R * s < 5000) {
            const g = ctx.createRadialGradient(C, C, R * 0.985, C, C, R * 1.1);
            g.addColorStop(0, 'rgba(160, 214, 186, 0.32)');
            g.addColorStop(0.3, 'rgba(96, 160, 128, 0.12)');
            g.addColorStop(1, 'rgba(40, 90, 70, 0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(C, C, R * 1.1, 0, Math.PI * 2); ctx.fill();
            if (!layers[0].ok) { ctx.fillStyle = '#0d2a26'; ctx.beginPath(); ctx.arc(C, C, R, 0, Math.PI * 2); ctx.fill(); }
        }
        ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
        layers.forEach((L, i) => {
            if (!L.ok) return;
            const k = L.img.naturalWidth / L.w;                 // px de imagen por px del lienzo
            if (i > 0 && s * dpr < k * 0.2) return;              // detalle innecesario a esta escala
            const x0 = Math.max(L.x, vx0), y0 = Math.max(L.y, vy0), x1 = Math.min(L.x + L.w, vx1), y1 = Math.min(L.y + L.h, vy1);
            if (x1 <= x0 || y1 <= y0) return;
            ctx.drawImage(L.img, (x0 - L.x) * k, (y0 - L.y) * k, (x1 - x0) * k, (y1 - y0) * k, x0, y0, x1 - x0, y1 - y0);
        });

        const px = 1 / s;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round';
        if (st.focus > 0.002) {
            const p = new Path2D(); p.rect(vx0, vy0, vx1 - vx0, vy1 - vy0); p.addPath(P.mich);
            ctx.fillStyle = `rgba(3, 9, 6, ${0.42 * st.focus})`; ctx.fill(p, 'evenodd');
        }
        if (st.borders > 0.002) { ctx.strokeStyle = `rgba(244, 243, 233, ${0.4 * st.borders})`; ctx.lineWidth = 0.9 * px; ctx.stroke(P.borders); }
        if (st.mexico > 0.002) { ctx.strokeStyle = `rgba(244, 243, 233, ${0.62 * st.mexico})`; ctx.lineWidth = 1.2 * px; ctx.stroke(P.mexico); }
        if (st.states > 0.002) { ctx.strokeStyle = `rgba(244, 243, 233, ${0.5 * st.states})`; ctx.lineWidth = 0.85 * px; ctx.stroke(P.states); }
        if (st.michFill > 0.002) { ctx.fillStyle = `rgba(217, 238, 100, ${0.2 * st.michFill})`; ctx.fill(P.mich); }
        if (st.mich > 0.002) {
            ctx.setLineDash([michLen * st.mich, michLen]);
            ctx.strokeStyle = 'rgba(4, 10, 6, 0.45)'; ctx.lineWidth = 4 * px; ctx.stroke(P.mich);
            ctx.strokeStyle = '#d9ee64'; ctx.lineWidth = 2 * px; ctx.stroke(P.mich);
            ctx.setLineDash([]);
        }
        ctx.restore();
    }

    const u = G.pts.uruapan;
    const render = () => {
        plane.style.transform = `rotateX(${st.tilt.toFixed(3)}deg)`;
        anchor.style.transform = `translate(${(ox + (u[0] - st.x) * st.s).toFixed(2)}px, ${(oy + (u[1] - st.y) * st.s).toFixed(2)}px)`;
        dirty = true; draw();
    };
    // Posición en pantalla de Uruapan (ya con la inclinación 3D del plano)
    const pin = () => {
        const r = anchor.getBoundingClientRect(), b = root.getBoundingClientRect();
        return { x: r.left + r.width / 2 - b.left, y: r.top + r.height / 2 - b.top };
    };
    resize();
    return { st, load, resize, render, pin, proj, ready: true, size: () => ({ W, H }) };
}

/* Cámara del recorrido: fotogramas clave en (centro, log escala, inclinación) e interpolación
   Catmull-Rom, para que el alejamiento sea continuo y sin paradas rígidas. */
function geoCamera(geo, isMobile) {
    const G = window.AVOTEX_GEO;
    let keys = [];
    const box = pts => {
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        return { x0: Math.min(...xs), y0: Math.min(...ys), x1: Math.max(...xs), y1: Math.max(...ys) };
    };
    const outline = (lon0, lon1, lat0, lat1) => {
        const p = [];
        for (let i = 0; i <= 12; i++) for (let j = 0; j <= 12; j++) p.push(geo.proj(lon0 + (lon1 - lon0) * i / 12, lat0 + (lat1 - lat0) * j / 12));
        return box(p);
    };
    // escala para que la caja ocupe fw del ancho o fh del alto, y centro para que su centro caiga en (sx, sy)
    const frame = (b, fw, fh, sx, sy, tilt) => {
        const { W, H } = geo.size();
        const s = Math.min(fw * W / (b.x1 - b.x0), fh * H / (b.y1 - b.y0));
        const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
        return { x: cx - (sx - 0.5) * W / s, y: cy - (sy - 0.5) * H / s, l: Math.log(s), t: tilt };
    };
    const build = () => {
        if (!G) return;
        const mich = box(G.pts.michBox), mex = box(G.pts.mexBox);
        const na = outline(-128, -64, 16, 58), ca = outline(-106, -72, 4, 30);
        // América: de Alaska/Canadá a Tierra del Fuego, siguiendo el contorno real del continente
        const am = box([[-165, 64], [-140, 60], [-95, 64], [-64, 58], [-52, 47], [-35, -7], [-68, -55], [-75, -50], [-81, -5], [-92, 15], [-125, 40]].map(p => geo.proj(p[0], p[1])));
        const k = isMobile ? {
            k0: frame(mex, 1.45, 1.1, 0.5, 0.36, 30), k1: frame(mich, 0.86, 0.5, 0.5, 0.34, 26), k3: frame(mex, 0.98, 0.6, 0.5, 0.34, 10),
            k4: frame(na, 1.0, 0.6, 0.5, 0.36, 3), k5: frame(ca, 1.0, 0.62, 0.5, 0.38, 0), k6: frame(am, 0.96, 0.64, 0.5, 0.4, 0)
        } : {
            k0: frame(mex, 1.5, 1.6, 0.6, 0.5, 32), k1: frame(mich, 0.42, 0.62, 0.66, 0.52, 26), k3: frame(mex, 0.68, 0.8, 0.56, 0.5, 10),
            k4: frame(na, 0.78, 0.86, 0.55, 0.5, 3), k5: frame(ca, 0.8, 0.86, 0.55, 0.52, 0), k6: frame(am, 0.86, 0.94, 0.55, 0.5, 0)
        };
        const k2 = Object.assign({}, k.k1, { l: k.k1.l + 0.1, t: k.k1.t - 2 });
        keys = [[0, k.k0], [0.18, k.k1], [0.32, k2], [0.45, k.k3], [0.62, k.k4], [0.78, k.k5], [1, k.k6]];
    };
    const cr = (p0, p1, p2, p3, t) => 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);
    const at = u => {
        if (!keys.length) build();
        u = clamp01(u);
        let i = 0;
        while (i < keys.length - 2 && u > keys[i + 1][0]) i++;
        const [u1, a] = keys[i], [u2, b] = keys[i + 1];
        const pa = keys[Math.max(0, i - 1)][1], pb = keys[Math.min(keys.length - 1, i + 2)][1];
        const t = (u - u1) / (u2 - u1 || 1);
        const e = t * t * (3 - 2 * t) * 0.35 + t * 0.65;       // casi lineal: velocidad continua entre tramos
        return { x: cr(pa.x, a.x, b.x, pb.x, e), y: cr(pa.y, a.y, b.y, pb.y, e), s: Math.exp(cr(pa.l, a.l, b.l, pb.l, e)), t: cr(pa.t, a.t, b.t, pb.t, e) };
    };
    const michScale = () => { if (!keys.length) build(); return Math.exp(keys[1][1].l); };
    return { build, at, michScale };
}

function buildAct1({ story, isMobile, hasDraw }) {
    const stage = story.querySelector('.story__stage');
    const $ = s => stage.querySelector(s);
    const $$ = s => Array.from(stage.querySelectorAll(s));
    const f = n => $(`[data-f="${n}"]`);
    const copy = n => $(`[data-copy="${n}"]`);
    const scrim = n => $(`[data-scrim="${n}"]`);
    const draw = drawer(hasDraw);

    const rig = f('rig'), travel = f('travel'), orbit = f('orbit'), whole = f('whole'), stack = f('stack');
    const L = n => $(`[data-layer3d="${n}"]`);
    const phone = f('phone');
    const video = scrubVideo(f('diag-video'));
    const tags = $$('[data-tag]');
    const lines = $$('[data-line]');
    const pipeline = $$('[data-f="pipeline"] li');
    const tissueParts = {
        skin: $('.tissue__skin'), flesh: $('.tissue__flesh'), endo: $('.tissue__endo'), seed: $('.tissue__seed')
    };
    const lateCopies = ['datos', 'historia', 'anatomia', 'superficie', 'costra', 'antracnosis', 'trips', 'barrenador', 'riesgo', 'obs', 'ia'].map(copy);
    const soil = f('soil'), front = f('soil-front'), plates = [soil, front];
    const geoEl = f('geo'), geoLabel = f('geo-label'), geoPulse = f('geo-pulse');
    const clods = $$('[data-f="clod"]');
    const geo = geoStage(geoEl, isMobile);
    const cam = geoCamera(geo, isMobile);
    const camP = { u: 0, back: 0 };                   // u: recorrido de ida · back: regreso al fruto

    /* --- Encuadres de la placa de tierra ---
       (fx, fy) es un punto de la fotografía (0–1); se coloca en (sx, sy) de la pantalla con escala s.
       Se limita para que la placa siempre cubra el escenario. */
    const MOUND = [0.62, 0.493];                       // cima del montículo delantero en la fotografía
    const frameFor = (fx, fy, sx, sy, s) => {
        const W = stage.clientWidth, H = stage.clientHeight;
        const pw = soil.offsetWidth * s, ph = soil.offsetHeight * s;
        let x = sx * W - W / 2 - (fx - 0.5) * pw, y = sy * H - H / 2 - (fy - 0.5) * ph;
        const mx = Math.max(0, (pw - W) / 2), my = Math.max(0, (ph - H) / 2);
        return { x: Math.max(-mx, Math.min(mx, x)), y: Math.max(-my, Math.min(my, y)), scale: s };
    };
    // Dónde queda en pantalla un punto de la fotografía con el encuadre actual
    const platePoint = (fx, fy) => {
        const r = soil.getBoundingClientRect(), s = stage.getBoundingClientRect();
        return { x: r.left - s.left + fx * r.width, y: r.top - s.top + fy * r.height };
    };
    const rigCenter = () => {
        const r = rig.getBoundingClientRect(), s = stage.getBoundingClientRect();
        return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 };
    };
    const rigLayout = () => {   // centro del rig sin sus transformaciones (posición CSS)
        const c = rigCenter();
        return { x: c.x - gsap.getProperty(rig, 'x'), y: c.y - gsap.getProperty(rig, 'y') };
    };

    // Encuadres por escena
    const frames = {
        hero: () => frameFor(MOUND[0], MOUND[1], heroAt.sx, heroAt.sy, isMobile ? 1.3 : 1.26),
        heroPush: () => { const fr = frames.hero(); return Object.assign(fr, { scale: fr.scale * 1.05 }); },
        dive: () => { const fr = frames.hero(); return { x: fr.x * 1.6, y: fr.y * 1.6 + stage.clientHeight * 0.12, scale: fr.scale * 1.6 }; },
        hist: () => { const c = pose.centerAbs(); return frameFor(MOUND[0], MOUND[1], c.x / stage.clientWidth, (c.y + histDrop()) / stage.clientHeight, isMobile ? 1.25 : 1.2); },
        histIn: () => { const fr = frames.hist(); return { x: fr.x * 1.5, y: fr.y * 1.5, scale: fr.scale * 1.5 }; },
        obs1: () => obsFrame(0.78, isMobile ? 1.45 : 1.5),
        obs2: () => obsFrame(0.95, isMobile ? 1.55 : 1.62)
    };
    // El fruto de pie: su tercio inferior queda detrás del montículo
    const histDrop = () => whole.offsetWidth * 0.5 * 0.32;
    const phoneFrac = isMobile ? 0.5 : 0.66;
    const phoneX = frac => () => stage.clientWidth * frac;
    const buriedY = () => phone.offsetHeight * 0.42;
    const obsFrame = (groundAt, s) => frameFor(MOUND[0], MOUND[1], phoneFrac, (phone.offsetTop + phone.offsetHeight * groundAt) / stage.clientHeight, s);

    // Posiciones del aguacate (desplazamientos x/y del rig desde su lugar en CSS)
    const ptFor = (fr, fx, fy) => ({
        x: stage.clientWidth / 2 + fr.x + (fx - 0.5) * soil.offsetWidth * fr.scale,
        y: stage.clientHeight / 2 + fr.y + (fy - 0.5) * soil.offsetHeight * fr.scale
    });
    const pose = {
        hero: () => {
            if (!isMobile) calibrateHero();
            const fr = frames.hero();
            gsap.set(plates, fr);
            const lay = rigLayout(), m = ptFor(fr, MOUND[0] + 0.012, MOUND[1]);
            const h = whole.offsetHeight * (isMobile ? 1.0 : 0.96);
            return { x: m.x - lay.x, y: m.y - lay.y - h * 0.14 };
        },
        center: () => ({ x: isMobile ? 0 : -stage.clientWidth * 0.02, y: 0 }),
        centerAbs: () => { const lay = rigLayout(), c = pose.center(); return { x: lay.x + c.x, y: lay.y + c.y }; }
    };
    const heroScale = isMobile ? 0.95 : 0.92;

    /* Título detrás del fruto (como en la referencia): en escritorio se busca el encuadre de la
       tierra para que la punta del aguacate cubra apenas el final de la línea más ancha del título. */
    const heroAt = { sx: isMobile ? 0.52 : 0.53, sy: isMobile ? 0.34 : 0.52 };
    const heroTitle = copy('hero') && copy('hero').querySelector('h1');
    const titleLine = () => {
        if (!heroTitle) return null;
        const range = document.createRange(); range.selectNodeContents(heroTitle);
        const st = stage.getBoundingClientRect(), lines = {};
        Array.from(range.getClientRects()).forEach(r => {
            if (r.width < 2) return;
            const k = Math.round((r.top + r.bottom) / 2 / 12);
            const L = lines[k] || (lines[k] = { l: Infinity, r: -Infinity, y: (r.top + r.bottom) / 2 - st.top });
            L.l = Math.min(L.l, r.left - st.left); L.r = Math.max(L.r, r.right - st.left);
        });
        return Object.values(lines).sort((a, b) => (b.r - b.l) - (a.r - a.l))[0] || null;
    };
    const calibrateHero = () => {
        const line = titleLine();
        if (!line) return;
        const W = stage.clientWidth, H = stage.clientHeight;
        const fw = whole.offsetWidth * heroScale, fh = whole.offsetHeight * heroScale;
        for (let i = 0; i < 3; i++) {
            const fr = frames.hero(), lay = rigLayout(), m = ptFor(fr, MOUND[0] + 0.012, MOUND[1]);
            const cx = m.x, cy = m.y - whole.offsetHeight * 0.96 * 0.14;
            const fruitLeft = cx - fw * 0.44;
            heroAt.sx = Math.max(0.42, Math.min(0.66, heroAt.sx + ((line.r - fw * 0.07) - fruitLeft) / W));
            heroAt.sy = Math.max(0.4, Math.min(0.66, heroAt.sy + ((line.y + fh * 0.12) - cy) / H));
        }
    };

    // Estado inicial
    gsap.set(lateCopies, { autoAlpha: 0, y: 24 });
    gsap.set(scrim('obs'), { autoAlpha: 0 });
    gsap.set(plates, { xPercent: -50, yPercent: -50 });
    gsap.set(geoEl, { autoAlpha: 0 });
    gsap.set([geoLabel, geoPulse], { autoAlpha: 0 });
    gsap.set(whole, { xPercent: -50, yPercent: -50, rotation: isMobile ? -6 : -8, scale: heroScale });
    gsap.set(rig, { xPercent: 0, yPercent: 0 });
    const heroPose = pose.hero();
    gsap.set(rig, heroPose);
    gsap.set(f('contact'), { autoAlpha: 1, y: 0, scaleX: 1 });
    gsap.set(stack, { autoAlpha: 0 });
    gsap.set([L('skin'), L('flesh'), L('endo'), L('seed')], { z: 0, x: 0 });
    gsap.set(f('lens'), { autoAlpha: 0, scale: 0.6 });
    gsap.set(f('lens-costra'), { opacity: 0 });
    gsap.set(f('tissue'), { autoAlpha: 0, y: 12 });
    gsap.set([f('trips'), f('antra'), f('borer'), f('borer-seed')], { autoAlpha: 0 });
    gsap.set(f('trips'), { clipPath: 'circle(0% at 24% 47%)' });
    gsap.set(f('antra'), { clipPath: 'circle(0% at 90% 58%)' });
    gsap.set(f('larva'), { autoAlpha: 0 });
    if (hasDraw) gsap.set(f('borer-tunnel'), { drawSVG: '0%' });
    gsap.set(tags, { autoAlpha: 0, x: -8 });
    gsap.set(f('anat-lines'), { autoAlpha: 0 });
    gsap.set(f('risk-ring'), { autoAlpha: 0, scale: 0.9 });
    gsap.set(f('obs-photo'), { autoAlpha: 0, scale: 1.04 });
    gsap.set(f('obs-shade'), { autoAlpha: 0 });
    gsap.set(phone, { autoAlpha: 0, xPercent: -50, yPercent: 0, y: buriedY, rotation: isMobile ? -4 : -7 });
    gsap.set(f('phone-dirt'), { opacity: 0.9 });
    gsap.set(clods, { autoAlpha: 0, x: 0, y: 0, rotation: 0 });
    gsap.set(f('result-zoom'), { autoAlpha: 0, xPercent: -50, yPercent: -50, scale: 0.6 });
    gsap.set(f('history'), { opacity: 0 });
    gsap.set(f('flash'), { opacity: 0 });
    gsap.set(f('handoff'), { autoAlpha: 0 });
    gsap.set(f('studio'), { opacity: 0 });

    const rail = railController(stage, ACT1);
    const tissueAt = t => {
        let hit = [];
        if (t >= 86 && t < 94) hit = ['skin'];
        else if (t >= 94 && t < 102) hit = ['skin', 'flesh'];
        else if (t >= 102 && t < 110) hit = ['skin'];
        else if (t >= 110 && t < 118) hit = ['skin', 'flesh', 'seed'];
        Object.entries(tissueParts).forEach(([k, el]) => el && el.classList.toggle('is-hit', hit.includes(k)));
        const cap = f('tissue-cap');
        if (cap) cap.textContent = hit.length ? 'Tejido afectado' : '';
    };
    const pipeMarks = [142, 145, 149, 151.5];

    const placeLabels = () => {
        if (isMobile) return;
        const s = stage.getBoundingClientRect();
        const rr = rig.getBoundingClientRect();
        const labelX = Math.min(rr.right + 70, s.width - 190);
        const svg = f('anat-lines');
        svg.setAttribute('viewBox', `0 0 ${s.width} ${s.height}`);
        const order = ['endo', 'seed', 'skin', 'flesh'];
        const ys = {};
        order.forEach(k => {
            const a = $(`[data-anchor="${k}"]`).getBoundingClientRect();
            ys[k] = { x: a.left - s.left, y: a.top - s.top };
        });
        // separa verticalmente las etiquetas para que no se encimen
        const sorted = order.slice().sort((a, b) => ys[a].y - ys[b].y);
        let lastY = -Infinity;
        sorted.forEach(k => {
            let y = Math.max(ys[k].y, lastY + 54);
            ys[k].ly = y; lastY = y;
        });
        order.forEach(k => {
            const tag = $(`[data-tag="${k}"]`);
            const line = $(`[data-line="${k}"]`);
            tag.style.transform = `translate(${labelX}px, ${ys[k].ly - 12}px)`;
            line.setAttribute('d', `M${ys[k].x.toFixed(1)} ${ys[k].y.toFixed(1)} L${(labelX - 40).toFixed(1)} ${ys[k].ly.toFixed(1)} H${(labelX - 10).toFixed(1)}`);
        });
    };

    /* --- El aguacate como hilo conductor del recorrido geográfico ---
       El rig conserva sus tweens de siempre; .fruit-travel (su hijo) recibe aquí el desvío
       necesario para que el fruto siga a Michoacán mientras la cámara se mueve. */
    const easeIO = gsap.parseEase('power2.inOut');
    const travelState = { on: false };
    const fruitWidth = () => whole.offsetWidth * gsap.getProperty(whole, 'scale');
    const pinWidth = s => {
        const land = isMobile ? 54 : 76;                                 // px sobre Michoacán
        return Math.max(isMobile ? 20 : 24, land * Math.pow(s / cam.michScale(), 0.55));
    };
    const updateGeo = t => {
        const geoOn = t > 6.5 && t < 56;
        if (!geoOn) {
            if (travelState.on) { gsap.set(travel, { x: 0, y: 0, scale: 1 }); travelState.on = false; }
            return;
        }
        geo.load();
        // cámara: ida (u) y regreso (back) hacia Uruapan
        const c = cam.at(camP.u);
        if (camP.back > 0) {
            const b = camP.back, uru = window.AVOTEX_GEO.pts.uruapan, { W, H } = geo.size();
            const sEnd = cam.michScale() * (isMobile ? 9 : 7);
            const ls = lerp(Math.log(c.s), Math.log(sEnd), b);
            const s = Math.exp(ls);
            const kc = 1 - Math.pow(1 - b, 2.2);
            c.x = lerp(c.x, uru[0], kc); c.y = lerp(c.y, uru[1] - (isMobile ? 0.04 : 0.02) * H / s, kc);
            c.s = s; c.t = lerp(c.t, 30, b);
        }
        Object.assign(geo.st, { x: c.x, y: c.y, s: c.s, tilt: c.t });
        geo.render();

        // el fruto
        const p = geo.pin();
        const base = rigCenter();
        let dx = 0, dy = 0, q = 1;
        const bw = fruitWidth() || 1;
        if (t <= 8) { travelState.on = false; }
        else if (t < 19) {
            const k = easeIO((t - 8) / 11);
            const w = lerp(bw, pinWidth(c.s), k);
            dx = (p.x - base.x) * k; dy = (p.y - pinWidth(c.s) * 0.12 - base.y) * k; q = w / bw;
        } else if (t <= 48) {
            dx = p.x - base.x; dy = p.y - pinWidth(c.s) * 0.12 - base.y; q = pinWidth(c.s) / bw;
        } else {
            const k = easeIO(clamp01((t - 48.5) / 6));
            const w0 = pinWidth(c.s);
            dx = (p.x - base.x) * (1 - k); dy = (p.y - w0 * 0.12 - base.y) * (1 - k);
            q = lerp(w0 / bw, 1, k);
        }
        gsap.set(travel, { x: dx, y: dy, scale: q });
        travelState.on = true;

        // etiqueta y pulso sobre Uruapan
        const w = bw * q;
        gsap.set(geoPulse, { x: p.x, y: p.y });
        gsap.set(geoLabel, { x: p.x + (isMobile ? -60 : w * 0.5 + 18), y: p.y + (isMobile ? w * 0.5 + 14 : -14) });
    };

    const updateChrome = () => {
        const t = tl.time();
        if (t > 120) video.request();
        rail.update(t);
        tissueAt(t);
        updateGeo(t);
        pipeline.forEach((li, i) => li.classList.toggle('is-on', t >= pipeMarks[i]));
        if (t > 66 && t < 79) placeLabels();
        lines.forEach((ln, i) => { ln.style.opacity = gsap.getProperty(tags[i], 'opacity'); });
    };

    const tl = pinnedTimeline(stage, isMobile ? ACT1.lengthMobile : ACT1.lengthDesktop, isMobile, ACT1.total, () => updateChrome());
    const geoS = geo.st;

    /* Tierra (0 a 8): el aguacate descansa en la huerta; la cámara se acerca apenas */
    tl.to(whole, { rotation: isMobile ? -2 : -3, y: -6, duration: 8 }, 0)
      .fromTo(plates, { x: () => frames.hero().x, y: () => frames.hero().y, scale: () => frames.hero().scale },
                      { x: () => frames.heroPush().x, y: () => frames.heroPush().y, scale: () => frames.heroPush().scale, duration: 8, immediateRender: false }, 0)
      .to(copy('hero').children, { autoAlpha: 0, y: -28, duration: 4, ease: 'power1.in', stagger: 0.15 }, 4)
      .to(scrim('hero'), { autoAlpha: 0, duration: 4 }, 5);

    /* De la tierra a la superficie terrestre (8 a 19): la cámara atraviesa el suelo y baja a Michoacán */
    tl.to(plates, { x: () => frames.dive().x, y: () => frames.dive().y, scale: () => frames.dive().scale, duration: 4, ease: 'power2.in' }, 8)
      .fromTo(soil, { autoAlpha: 1 }, { autoAlpha: 0, duration: 3, ease: 'power1.in' }, 8.6)
      .fromTo(front, { autoAlpha: 1 }, { autoAlpha: 0, duration: 1.6 }, 7.6)
      .fromTo(f('contact'), { autoAlpha: 1 }, { autoAlpha: 0, duration: 1.2 }, 8)
      .fromTo(geoEl, { autoAlpha: 0 }, { autoAlpha: 1, duration: 3, ease: 'power1.out' }, 7.5)
      .fromTo(camP, { u: 0 }, { u: 0.18, duration: 10.5, ease: 'power1.inOut' }, 8.5)
      .to(whole, { rotation: 0, y: 0, duration: 9 }, 8.5)
      .to(geoS, { mexico: 1, duration: 3 }, 9.5)
      .to(geoS, { states: 1, duration: 3.5 }, 10.5)
      .to(geoS, { mich: 1, duration: 4, ease: 'power1.inOut' }, 14)
      .to(geoS, { michFill: 1, duration: 2 }, 17)
      .to(geoS, { focus: 1, duration: 3 }, 16)
      .to(geoPulse, { autoAlpha: 1, duration: 1 }, 18.5)
      .to(geoLabel, { autoAlpha: 1, duration: 1 }, 19);

    /* Michoacán (19 a 28): datos de producción */
    tl.to(copy('datos'), { autoAlpha: 1, y: 0, duration: 2 }, 18.5)
      .to(camP, { u: 0.32, duration: 9 }, 19)
      .to(copy('datos'), { autoAlpha: 0, y: -16, duration: 1.6 }, 27.2);
    counterTweens(tl, copy('datos'), 19.5, 3.5);

    /* México completo y alejamiento hacia América (28 a 48) */
    tl.to(camP, { u: 0.45, duration: 6, ease: 'none' }, 28)
      .to(geoS, { focus: 0, duration: 3 }, 27.5)
      .to(geoS, { michFill: 0.75, duration: 3 }, 28)
      .to(camP, { u: 1, duration: 12, ease: 'power1.out' }, 34)
      .to(geoS, { borders: 1, duration: 4 }, 34)
      .to(geoS, { states: 0.45, duration: 6 }, 38)
      .to(geoLabel, { autoAlpha: 0, duration: 1.5 }, 33.5);

    // Por debajo, el rig vuelve a su pose central (el desvío de .fruit-travel lo compensa)
    tl.to(rig, { x: () => pose.center().x, y: () => pose.center().y, duration: 6 }, 32)
      .to(whole, { scale: 1, duration: 6 }, 32);

    /* Regreso al fruto (48 a 55): la cámara baja de nuevo y aterriza en la tierra */
    tl.to(camP, { back: 1, duration: 6.5, ease: 'power1.inOut' }, 48)
      .to(geoPulse, { autoAlpha: 0, duration: 1 }, 48)
      .to(geoS, { borders: 0, states: 0, mexico: 0, duration: 3 }, 49)
      .to(geoEl, { autoAlpha: 0, duration: 2.4, ease: 'power1.in' }, 52.4)
      .fromTo(plates, { x: () => frames.histIn().x, y: () => frames.histIn().y, scale: () => frames.histIn().scale },
                      { x: () => frames.hist().x, y: () => frames.hist().y, scale: () => frames.hist().scale, duration: 3.6, ease: 'power3.out', immediateRender: false }, 51.8)
      .fromTo(soil, { autoAlpha: 0 }, { autoAlpha: 1, duration: 2.4, immediateRender: false }, 51.8)
      .fromTo(front, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1.8, immediateRender: false }, 52.8)
      .to(whole, { rotation: 84, duration: 5.5, ease: 'power2.inOut' }, 48.5)
      .fromTo(f('contact'), { autoAlpha: 0, y: () => whole.offsetWidth * 0.36, scaleX: 0.62 }, { autoAlpha: 1, y: () => whole.offsetWidth * 0.36, scaleX: 0.62, duration: 1.6, immediateRender: false }, 53);

    /* Cada fruto cuenta una historia (53 a 60): el fruto de pie sobre la tierra */
    tl.to(orbit, { rotationY: -10, duration: 4 }, 52)
      .to(orbit, { rotationY: 8, duration: 6 }, 56)
      .to(copy('historia'), { autoAlpha: 1, y: 0, duration: 2 }, 53)
      .to(copy('historia'), { autoAlpha: 0, y: -16, duration: 1.6 }, 58.6);

    /* Del exterior al corte (60 a 64): la tierra queda como entorno, atenuada */
    tl.fromTo(whole, { autoAlpha: 1 }, { autoAlpha: 0, scale: 1.18, duration: 1.8, ease: 'power1.in', immediateRender: false }, 60)
      .to(stack, { autoAlpha: 1, duration: 1.8 }, 60.3)
      .to(orbit, { rotationY: 0, duration: 3 }, 61)
      .to([front, f('contact')], { autoAlpha: 0, duration: 1.6 }, 59.8)
      .to(f('studio'), { opacity: 1, duration: 3 }, 59.8)
      .to(plates, { scale: () => frames.hist().scale * 1.08, y: () => frames.hist().y - stage.clientHeight * 0.06, duration: 6 }, 60);

    /* Anatomía (64 a 78): las capas se separan en profundidad */
    tl.to(orbit, { rotationY: isMobile ? -30 : -40, rotationX: isMobile ? 8 : 12, duration: 6, ease: 'power2.inOut' }, 64)
      .to(L('skin'), { z: isMobile ? -90 : -150, x: isMobile ? -10 : -24, duration: 6, ease: 'power2.inOut' }, 65)
      .to(L('endo'), { z: isMobile ? 60 : 95, duration: 6, ease: 'power2.inOut' }, 65)
      .to(L('seed'), { z: isMobile ? 120 : 200, x: isMobile ? 10 : 30, duration: 6, ease: 'power2.inOut' }, 65)
      .to(orbit, { rotationY: isMobile ? -22 : -30, duration: 6 }, 70.5)
      .to(copy('anatomia'), { autoAlpha: 1, y: 0, duration: 2 }, 65.5)
      .to(f('anat-lines'), { autoAlpha: 1, duration: 0.5 }, 69)
      .to(tags[2], { autoAlpha: 1, x: 0, duration: 1 }, 69)
      .to(tags[3], { autoAlpha: 1, x: 0, duration: 1 }, 70.3)
      .to(tags[1], { autoAlpha: 1, x: 0, duration: 1 }, 71.6)
      .to(tags[0], { autoAlpha: 1, x: 0, duration: 1 }, 72.9)
      .to(tags, { autoAlpha: 0, duration: 1 }, 76.4)
      .to(copy('anatomia'), { autoAlpha: 0, y: -16, duration: 1.6 }, 76.4);

    /* Superficie (78 a 86): se recompone y la cámara entra a la cáscara */
    tl.to([L('skin'), L('endo'), L('seed')], { z: 0, x: 0, duration: 3, ease: 'power2.inOut' }, 77.5)
      .to(orbit, { rotationY: 0, rotationX: 0, duration: 3, ease: 'power2.inOut' }, 77.5)
      .to(stack, { autoAlpha: 0, duration: 1.6 }, 80)
      .to(whole, { autoAlpha: 1, scale: 1, duration: 1.6 }, 80)
      .fromTo(rig, { scale: 1, autoAlpha: 1 }, { scale: 1.5, autoAlpha: 0.22, duration: 4, ease: 'power2.in', immediateRender: false }, 81.5)
      .to(f('lens'), { autoAlpha: 1, scale: 1, duration: 3, ease: 'power2.out' }, 82.5)
      .to(copy('superficie'), { autoAlpha: 1, y: 0, duration: 2 }, 81.5)
      .to(copy('superficie'), { autoAlpha: 0, y: -16, duration: 1.4 }, 85.6);

    /* Costra (86 a 94): fotografía real en la lupa */
    tl.to(f('lens-costra'), { opacity: 1, duration: 1.8 }, 86)
      .fromTo(f('lens-costra'), { backgroundSize: '420% auto' }, { backgroundSize: '300% auto', duration: 7 }, 86)
      .to(f('tissue'), { autoAlpha: 1, y: 0, duration: 1.4 }, 86.4)
      .to(copy('costra'), { autoAlpha: 1, y: 0, duration: 2 }, 86.6)
      .to(copy('costra'), { autoAlpha: 0, y: -16, duration: 1.4 }, 92.6)
      .to(f('lens'), { autoAlpha: 0, scale: 0.85, duration: 1.6 }, 93);

    /* Antracnosis (94 a 102): del exterior hacia la pulpa, sobre el corte */
    tl.set(whole, { autoAlpha: 0 }, 94)
      .set(stack, { autoAlpha: 1 }, 94)
      .to(rig, { scale: 1.05, autoAlpha: 1, duration: 2 }, 94)
      .to(orbit, { rotationY: -14, duration: 8 }, 94)
      .to(f('antra'), { autoAlpha: 1, duration: 0.6 }, 95)
      .to(f('antra'), { clipPath: 'circle(62% at 90% 58%)', duration: 5.5, ease: 'power1.inOut' }, 95.2)
      .to(copy('antracnosis'), { autoAlpha: 1, y: 0, duration: 2 }, 95)
      .to(copy('antracnosis'), { autoAlpha: 0, y: -16, duration: 1.4 }, 100.6)
      .to(f('antra'), { autoAlpha: 0, duration: 1.2 }, 101.4);

    /* Trips (102 a 110): cicatrices en la superficie */
    tl.to(stack, { autoAlpha: 0, duration: 1.4 }, 102)
      .to(whole, { autoAlpha: 1, duration: 1.4 }, 102)
      .to(orbit, { rotationY: 6, duration: 8 }, 102)
      .to(f('trips'), { autoAlpha: 1, duration: 0.6 }, 103)
      .to(f('trips'), { clipPath: 'circle(48% at 24% 47%)', duration: 4.5, ease: 'power1.out' }, 103.4)
      .to(copy('trips'), { autoAlpha: 1, y: 0, duration: 2 }, 103)
      .to(copy('trips'), { autoAlpha: 0, y: -16, duration: 1.4 }, 108.6)
      .to(f('trips'), { autoAlpha: 0, duration: 1.2 }, 109.4);

    /* Barrenador del hueso (110 a 118): túnel hasta la semilla */
    tl.to(whole, { autoAlpha: 0, duration: 1.4 }, 110)
      .to(stack, { autoAlpha: 1, duration: 1.4 }, 110)
      .to(orbit, { rotationY: -10, duration: 8 }, 110)
      .to(f('borer'), { autoAlpha: 1, duration: 0.6 }, 111.4)
      .fromTo(...draw(f('borer-tunnel'), '0%', '100%', { duration: 4, ease: 'power1.inOut' }), 112)
      .to([f('borer-seed'), f('larva')], { autoAlpha: 1, duration: 1 }, 115.6)
      .to(copy('barrenador'), { autoAlpha: 1, y: 0, duration: 2 }, 111)
      .to(copy('barrenador'), { autoAlpha: 0, y: -16, duration: 1.4 }, 116.6)
      .to(f('tissue'), { autoAlpha: 0, duration: 1 }, 117);

    /* Riesgo (118 a 126): hasta un 30 % del rendimiento */
    tl.to([f('borer'), f('borer-seed'), f('larva')], { autoAlpha: 0, duration: 1.2 }, 118)
      .to(orbit, { rotationY: 0, duration: 2 }, 118)
      .to(rig, { scale: isMobile ? 0.86 : 0.8, duration: 2.5, ease: 'power2.inOut' }, 118)
      .to(f('risk-ring'), { autoAlpha: 1, scale: 1, duration: 2 }, 118.4)
      .fromTo(f('risk-arc'), { strokeDasharray: '0 100' }, { strokeDasharray: '30 100', duration: 3, ease: 'power1.inOut' }, 120)
      .to(copy('riesgo'), { autoAlpha: 1, y: 0, duration: 2 }, 119)
      .to(copy('riesgo'), { autoAlpha: 0, y: -16, duration: 1.4 }, 124.8);
    counterTweens(tl, copy('riesgo'), 120, 3);

    /* El celular enterrado (126 a 135): la cámara se acerca y el teléfono emerge del suelo */
    tl.to([rig, f('risk-ring')], { autoAlpha: 0, duration: 1.6 }, 126)
      .to(f('studio'), { opacity: 0, duration: 2.6 }, 126)
      .to(plates, { x: () => frames.obs1().x, y: () => frames.obs1().y, scale: () => frames.obs1().scale, duration: 3.2, ease: 'power2.inOut' }, 126)
      .to(front, { autoAlpha: 1, duration: 1.4 }, 126.4)
      .set(phone, { x: phoneX(phoneFrac) }, 126)
      .to(phone, { autoAlpha: 1, duration: 1.2 }, 126.8)
      .to(clods, { autoAlpha: 1, duration: 0.8 }, 127)
      .to(scrim('obs'), { autoAlpha: 1, duration: 2 }, 128.5)
      // emergencia: el teléfono sube, la cámara lo acompaña y la tierra cede alrededor
      .to(phone, { y: 0, rotation: 0, duration: 5.6, ease: 'power2.out' }, 129.4)
      .to(soil, { x: () => frames.obs2().x, y: () => frames.obs2().y, scale: () => frames.obs2().scale, duration: 5.6, ease: 'power2.out' }, 129.4)
      .to(front, { x: () => frames.obs2().x, y: () => frames.obs2().y + 5, scale: () => frames.obs2().scale, duration: 5.6, ease: 'power2.out' }, 129.4)
      .to(f('phone-dirt'), { opacity: 0, duration: 4.4, ease: 'power1.in' }, 130.4)
      .to(clods[0], { x: -34, y: () => buriedY() + 26, rotation: -50, duration: 4.2, ease: 'power1.in' }, 129.8)
      .to(clods[1], { x: 38, y: () => buriedY() + 30, rotation: 40, duration: 4.6, ease: 'power1.in' }, 129.5)
      .to(clods[2], { x: 10, y: () => buriedY() + 18, rotation: 25, duration: 3.8, ease: 'power1.in' }, 130.2)
      .to(clods, { autoAlpha: 0, duration: 1.2, stagger: 0.25 }, 132.8)
      .to(copy('obs'), { autoAlpha: 1, y: 0, duration: 2.2 }, 129.8);

    /* Observación (135 a 142): la secuencia original, con el teléfono ya en posición */
    tl.fromTo(video.proxy, { t: 0 }, { t: 0.41, duration: 4.6, onUpdate: video.seek }, 137)
      .to(f('flash'), { opacity: 0.85, duration: 0.25 }, 141.4)
      .to(f('flash'), { opacity: 0, duration: 0.6 }, 141.65)
      .to(copy('obs'), { autoAlpha: 0, y: -16, duration: 1.4 }, 141.4);

    /* IA (142 a 154): análisis, resultado real, historial */
    tl.to(f('obs-photo'), { autoAlpha: 1, duration: 2 }, 142)
      .to(front, { autoAlpha: 0, duration: 1.4 }, 142)
      .to(f('obs-photo'), { scale: 1.12, duration: 12 }, 142)
      .to(f('obs-shade'), { autoAlpha: 1, duration: 2 }, 142)
      .to(scrim('obs'), { autoAlpha: 0, duration: 2 }, 142)
      .to(phone, { x: phoneX(isMobile ? 0.5 : 0.3), duration: 3, ease: 'power2.inOut' }, 142)
      .fromTo(video.proxy, { t: 0.41 }, { t: 1, duration: 5.5, immediateRender: false, onUpdate: video.seek }, 143.5)
      .to(copy('ia'), { autoAlpha: 1, y: 0, duration: 2 }, 143)
      .set(f('result-zoom'), { x: phoneX(isMobile ? 0.5 : 0.3), y: () => stage.clientHeight * (isMobile ? 0.03 : 0.04) }, 142)
      .to(f('result-zoom'), { autoAlpha: 1, scale: isMobile ? 1 : 1.12, duration: 2.2, ease: 'power3.out' }, 149.2)
      .to(f('result-zoom'), { autoAlpha: 0, duration: 1.2 }, 151.6)
      .to(f('history'), { opacity: 1, duration: 1.4 }, 151.6)
      .to(f('handoff'), { autoAlpha: 1, duration: 2.4 }, 153.6);

    // Fija el estado visible del fruto al inicio: los valores de partida no dependen de cuándo
    // se registran (durante el loader la página está oculta y autoAlpha leería 0).
    tl.fromTo(rig, { autoAlpha: 1 }, { autoAlpha: 1, duration: 0.01, immediateRender: true }, 0);

    // Al cambiar el tamaño: se recalculan encuadres y la pose inicial del fruto
    const onRefresh = () => {
        geo.resize(); cam.build();
        if (tl.time() < 0.01) { gsap.set(rig, pose.hero()); }
        updateChrome();
    };
    ScrollTrigger.addEventListener('refresh', onRefresh);

    // El rail también sirve para saltar
    const st = tl.scrollTrigger;
    const startBtn = document.querySelector('[data-story-start]');
    const onStart = e => { e.preventDefault(); scrollToY(st.start + (ACT1.marks.historia / tl.duration()) * (st.end - st.start) + 2); };
    if (startBtn) startBtn.addEventListener('click', onStart);
    const railBtns = $$('[data-rail-to]');
    const onRail = e => scrollToY(st.start + ((ACT1.marks[e.currentTarget.dataset.railTo] || 0) / tl.duration()) * (st.end - st.start) + 2);
    railBtns.forEach(b => b.addEventListener('click', onRail));
    // Las capas del mapa empiezan a cargar en cuanto la página está lista (no bloquean el primer cuadro)
    pageReady.then(() => setTimeout(() => geo.load(), 300));
    updateChrome();

    return {
        destroy() {
            ScrollTrigger.removeEventListener('refresh', onRefresh);
            if (startBtn) startBtn.removeEventListener('click', onStart);
            railBtns.forEach(b => b.removeEventListener('click', onRail));
            const v = f('diag-video'); if (v) v.pause();
            gsap.set([travel, plates, geoEl, geoLabel, geoPulse, f('contact'), phone, clods, f('phone-dirt')], { clearProps: 'all' });
        }
    };
}

/* ===================== ACTO II · El territorio ===================== */
function buildAct2({ story, isMobile, hasDraw }) {
    const stage = story.querySelector('.story__stage');
    const $ = s => stage.querySelector(s);
    const $$ = s => Array.from(stage.querySelectorAll(s));
    const scene = n => $(`[data-scene="${n}"]`);
    const layer = n => $(`[data-layer="${n}"]`);
    const copy = n => $(`[data-copy="${n}"]`);
    const scrim = n => $(`[data-scrim="${n}"]`);
    const screen = n => $(`[data-screen="${n}"]`);
    const sat = n => $(`[data-sat="${n}"]`);
    const draw = drawer(hasDraw);

    const phone = $('[data-phone]');
    const plane = $('[data-plane]');
    const pillars = $$('[data-pillars] li');
    const mapVideo = scrubVideo(screen('mapa'));
    const cam = $('[data-sat-cam]');
    const view = $('[data-sat-view]');
    const range = $('[data-sat-range]');
    const dateLabel = $('[data-sat-date]');

    gsap.set(['sat', 'eco', 'campo'].map(scene), { autoAlpha: 0 });
    gsap.set(['hoja', 'mapa', 'eco', 'campo', 'sat-intro', 'sat-limites', 'sat-capas', 'sat-cambio', 'sat-decision'].map(copy), { autoAlpha: 0, y: 24 });
    gsap.set(['hoja', 'mapa', 'eco', 'sat'].map(scrim), { autoAlpha: 0 });
    gsap.set(phone, { autoAlpha: 0, y: 0 });
    gsap.set('[data-map-hud]', { autoAlpha: 0 });
    gsap.set($$('[data-markers] circle'), { scale: 0, transformOrigin: '50% 50%' });
    gsap.set($('[data-lote]'), { fillOpacity: 0 });
    const drawTargets = $$('.vein, [data-roads] path, [data-contours] path, [data-lote], [data-sat="parcel"], [data-sat="sectors"] path');
    if (hasDraw) gsap.set(drawTargets, { drawSVG: '0%' }); else gsap.set(drawTargets, { opacity: 0 });
    $$('.story-phone__screen > *').forEach((el, i) => gsap.set(el, { opacity: i === 0 ? 1 : 0 }));
    gsap.set(['[data-sat-hud]', '[data-sat-legend]', '[data-sat-readout]', sat('parcel-fill'), sat('tags'), sat('flag'), sat('area')], { autoAlpha: 0 });
    gsap.set('[data-sat-compare]', { autoAlpha: 0 });
    gsap.set(sat('mid'), { opacity: 0 });
    gsap.set(view, { clipPath: 'inset(0px 0px 0px 0px round 0px)' });

    /* Cámara satelital: el recuadro de Zirahuén mide Lw × Lh en coordenadas locales. */
    const MID = { w: 1470, h: 1050 };
    const WIDE = { w: 2000, h: 1533, x0: 600, y0: 600, x1: 1067, y1: 933 };
    const PARCEL = { x: 182.5, y: 303.8, w: 101.3, h: 98.7 };
    let Lw = 0, Lh = 0;
    const layoutCam = () => {
        const W = stage.clientWidth, H = stage.clientHeight;
        Lw = Math.max(W, H * MID.w / MID.h); Lh = Lw * MID.h / MID.w;
        gsap.set(cam, { width: Lw, height: Lh });
        const kx = Lw / (WIDE.x1 - WIDE.x0), ky = Lh / (WIDE.y1 - WIDE.y0);
        gsap.set(sat('wide'), { left: -WIDE.x0 * kx, top: -WIDE.y0 * ky, width: WIDE.w * kx, height: WIDE.h * ky });
    };
    layoutCam();
    const toLocal = (px, py) => ({ x: px / MID.w * Lw, y: py / MID.h * Lh });
    const frame = (r, T, mode = 'cover', pad = 1) => {
        const s = (mode === 'cover' ? Math.max(T.w / r.w, T.h / r.h) : Math.min(T.w / r.w, T.h / r.h)) * pad;
        return { scale: s, x: T.x + T.w / 2 - (r.x + r.w / 2) * s, y: T.y + T.h / 2 - (r.y + r.h / 2) * s };
    };
    const full = () => ({ x: 0, y: 0, w: stage.clientWidth, h: stage.clientHeight });
    const wideRect = () => {
        const kx = Lw / (WIDE.x1 - WIDE.x0), ky = Lh / (WIDE.y1 - WIDE.y0);
        return { x: -WIDE.x0 * kx, y: -WIDE.y0 * ky, w: WIDE.w * kx, h: WIDE.h * ky };
    };
    const midRect = () => ({ x: 0, y: 0, w: Lw, h: Lh });
    const parcelRect = () => { const a = toLocal(PARCEL.x, PARCEL.y), b = toLocal(PARCEL.x + PARCEL.w, PARCEL.y + PARCEL.h); return { x: a.x, y: a.y, w: b.x - a.x, h: b.y - a.y }; };
    const parcelTarget = () => {
        const W = stage.clientWidth, H = stage.clientHeight;
        const nav = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--nav-h')) || 72;
        return isMobile ? { x: W * 0.06, y: nav + 70, w: W * 0.88, h: H * 0.34 } : { x: W * 0.43, y: nav + 40, w: W * 0.4, h: H - nav - 170 };
    };
    const camPose = name => () => {
        if (name === 'wideIn') { const p = frame(wideRect(), full(), 'cover', 1.22); return p; }
        if (name === 'wide') return frame(wideRect(), full(), 'cover');
        if (name === 'mid') return frame(midRect(), full(), 'cover');
        if (name === 'parcel') return frame(parcelRect(), parcelTarget(), 'contain', 0.82);
        return frame(midRect(), full(), 'cover');
    };
    const camTo = (name, at, dur, ease = 'power2.inOut') => tl.to(cam, {
        x: () => camPose(name)().x, y: () => camPose(name)().y, scale: () => camPose(name)().scale, duration: dur, ease
    }, at);

    // Teléfono: medidas sin transformar para que el satélite "aterrice" en su pantalla.
    const phoneScreen = () => {
        const sw = stage.clientWidth, sh = stage.clientHeight;
        const left = phone.offsetLeft + phone.offsetWidth * 0.032, top = phone.offsetTop + phone.offsetWidth * 0.032;
        const w = phone.offsetWidth * (1 - 0.064), h = phone.offsetHeight - phone.offsetWidth * 0.064;
        return { sw, sh, left, top, w, h, right: sw - left - w, bottom: sh - top - h };
    };
    const phoneClip = () => { const r = phoneScreen(); return `inset(${r.top}px ${r.right}px ${r.bottom}px ${r.left}px round ${Math.round(r.w * 0.12)}px)`; };
    const phonePose = () => { const r = phoneScreen(); return frame(midRect(), { x: r.left, y: r.top, w: r.w, h: r.h }, 'cover'); };

    // Comparación de fechas: el scroll mueve el divisor; el usuario también puede arrastrarlo.
    const wipe = { v: 0 }, sweep = { v: 0 };
    let userWipe = null;
    const visibleLocal = () => {
        const s = gsap.getProperty(cam, 'scale') || 1, cx = gsap.getProperty(cam, 'x'), cy = gsap.getProperty(cam, 'y');
        return { x0: (0 - cx) / s, x1: (stage.clientWidth - cx) / s, y0: (0 - cy) / s, y1: (stage.clientHeight - cy) / s };
    };
    const applyWipe = () => {
        const v = userWipe !== null ? userWipe : wipe.v;
        const vis = visibleLocal();
        const lx = lerp(vis.x1, vis.x0, v);
        const pct = clamp01(lx / Lw) * 100;
        sat('ndvi-mar').style.clipPath = `inset(0 0 0 ${pct.toFixed(3)}%)`;
        const d = sat('divider');
        const sx = lx / Lw * MID.w;
        d.setAttribute('x1', sx); d.setAttribute('x2', sx);
        d.setAttribute('y1', vis.y0 / Lh * MID.h); d.setAttribute('y2', vis.y1 / Lh * MID.h);
        if (userWipe === null && range) range.value = Math.round(v * 100);
        d.style.visibility = (v > 0.015 && v < 0.985) ? 'visible' : 'hidden';
    };
    const applySweep = () => {
        const vis = visibleLocal();
        const lx = lerp(vis.x0, vis.x1, sweep.v);
        const pct = 100 - clamp01(lx / Lw) * 100;
        sat('change').style.clipPath = `inset(0 ${pct.toFixed(3)}% 0 0)`;
        const ln = sat('sweep');
        const sx = lx / Lw * MID.w;
        ln.setAttribute('x1', sx); ln.setAttribute('x2', sx);
        ln.setAttribute('y1', vis.y0 / Lh * MID.h); ln.setAttribute('y2', vis.y1 / Lh * MID.h);
    };
    const onRange = () => { userWipe = range.value / 100; applyWipe(); };
    if (range) range.addEventListener('input', onRange);

    const updateChrome = () => {
        const t = tl.time();
        if (t > 72) mapVideo.request();
        rail.update(t);
        const marks = [84, 86, 88, 90];
        pillars.forEach((li, i) => li.classList.toggle('is-on', t >= marks[i] && t < 96));
        if (t < 55 || t > 66) userWipe = null;
        if (t > 52 && t < 72) { applyWipe(); applySweep(); }
        if (dateLabel) {
            const v = userWipe !== null ? userWipe : wipe.v;
            const mar = t > 57 && t < 71 && v > 0.5;
            dateLabel.textContent = mar ? 'Copernicus Sentinel-2 · 14 mar 2025' : 'Copernicus Sentinel-2 · 29 nov 2024';
        }
    };

    const rail = railController(stage, ACT2);
    const tl = pinnedTimeline(stage, isMobile ? ACT2.lengthMobile : ACT2.lengthDesktop, isMobile, ACT2.total, () => updateChrome());

    /* Hoja → territorio (0 a 29): la transición insignia */
    tl.to('[data-plane-tint]', { opacity: 0.5, duration: 2.5 }, 0)
      .fromTo(...draw($$('.vein'), '0%', '100%', { duration: 5, stagger: 0.4, ease: 'power1.inOut' }), 0.5)
      .to([copy('hoja'), scrim('hoja')], { autoAlpha: 1, y: 0, duration: 2 }, 0.8)
      .to([copy('hoja'), scrim('hoja')], { autoAlpha: 0, y: -16, duration: 2 }, 8)
      .to(plane, { rotationX: isMobile ? 48 : 56, scale: isMobile ? 0.98 : 0.9, yPercent: 7, duration: 10, ease: 'power2.inOut' }, 8)
      .to('[data-plane-tint]', { opacity: 0.55, duration: 2 }, 8)
      .to(layer('hoja'), { opacity: 0, duration: 5 }, 10)
      .to('[data-plane-tint]', { opacity: 0.22, duration: 4 }, 13)
      .to('[data-veins]', { opacity: 0, duration: 4 }, 12)
      .fromTo(...draw($$('[data-roads] path'), '0%', '100%', { duration: 6, stagger: 0.3, ease: 'power1.inOut' }), 10)
      .fromTo(...draw($$('[data-contours] path'), '0%', '100%', { duration: 7, stagger: 0.04 }), 12)
      .fromTo(...draw($('[data-lote]'), '0%', '100%', { duration: 3 }), 16)
      .to($('[data-lote]'), { fillOpacity: 1, duration: 2 }, 18)
      .to($$('[data-markers] circle'), { scale: 1, duration: 1.2, stagger: 0.35, ease: 'back.out(2)' }, 18)
      .to('[data-map-hud]', { autoAlpha: 1, duration: 2 }, 12)
      .to([copy('mapa'), scrim('mapa')], { autoAlpha: 1, y: 0, duration: 2 }, 13.5)
      .to([copy('mapa'), scrim('mapa')], { autoAlpha: 0, y: -16, duration: 2 }, 26.5);

    /* Satélite (29 a 77) */
    tl.to('[data-map-hud]', { autoAlpha: 0, duration: 1.5 }, 28.5)
      .to(plane, { scale: 0.6, autoAlpha: 0, duration: 2.6, ease: 'power2.in' }, 28.6)
      .to(scene('sat'), { autoAlpha: 1, duration: 3 }, 29.5)
      .set(scene('mapa'), { autoAlpha: 0 }, 33.5)
      .fromTo(cam, { x: () => camPose('wideIn')().x, y: () => camPose('wideIn')().y, scale: () => camPose('wideIn')().scale },
          { x: () => camPose('wide')().x, y: () => camPose('wide')().y, scale: () => camPose('wide')().scale, duration: 5, ease: 'power2.out' }, 29.5)
      .to('[data-sat-hud]', { autoAlpha: 1, duration: 1.5 }, 31)
      .to([copy('sat-intro'), scrim('sat')], { autoAlpha: 1, y: 0, duration: 2 }, 32)
      .to(copy('sat-intro'), { autoAlpha: 0, y: -16, duration: 1.5 }, 37.5)
      .to(sat('area'), { autoAlpha: 1, duration: 1 }, 39.5)
      .to(sat('mid'), { opacity: 1, duration: 2 }, 41.4)
      .to(sat('area'), { autoAlpha: 0, duration: 1 }, 45.5);
    camTo('mid', 36, 7);
    camTo('parcel', 43, 5.5);
    tl.fromTo(...draw(sat('parcel'), '0%', '100%', { duration: 3, ease: 'power1.inOut' }), 47)
      .to(sat('parcel-fill'), { autoAlpha: 1, duration: 1.2 }, 49.4)
      .fromTo(...draw($$('[data-sat="sectors"] path'), '0%', '100%', { duration: 1.8, stagger: 0.4 }), 49.6)
      .to(sat('tags'), { autoAlpha: 1, duration: 1 }, 51)
      .to(copy('sat-limites'), { autoAlpha: 1, y: 0, duration: 2 }, 46.5)
      .to(copy('sat-limites'), { autoAlpha: 0, y: -16, duration: 1.5 }, 53.2)
      // NDVI y comparación de fechas
      .to(sat('parcel-fill'), { autoAlpha: 0, duration: 1 }, 54)
      .to(sat('ndvi-nov'), { opacity: 0.92, duration: 2 }, 54)
      .set(sat('ndvi-mar'), { opacity: 0.92 }, 54)
      .to('[data-sat-legend]', { autoAlpha: 1, duration: 1.2 }, 54.6)
      .to(copy('sat-capas'), { autoAlpha: 1, y: 0, duration: 2 }, 55)
      .to('[data-sat-compare]', { autoAlpha: 1, duration: 1 }, 56.4)
      .to(sat('divider'), { opacity: 1, duration: 0.6 }, 57.2)
      .to('[data-sat-readout]', { autoAlpha: 1, duration: 1.2 }, 57.4)
      .fromTo(wipe, { v: 0 }, { v: 1, duration: 5, ease: 'power1.inOut' }, 57.6)
      .to('[data-sat-compare]', { autoAlpha: 0, duration: 1 }, 63)
      .to(sat('divider'), { opacity: 0, duration: 0.6 }, 63)
      .to(copy('sat-capas'), { autoAlpha: 0, y: -16, duration: 1.5 }, 62.6)
      // Barrido de análisis: cambio entre fechas
      .set(sat('change'), { opacity: 1 }, 64)
      .to(sat('sweep'), { opacity: 1, duration: 0.4 }, 64)
      .fromTo(sweep, { v: 0 }, { v: 1, duration: 3.6, ease: 'sine.inOut' }, 64.2)
      .to(sat('sweep'), { opacity: 0, duration: 0.6 }, 67.8)
      .to(sat('flag'), { autoAlpha: 1, duration: 1 }, 67.2)
      .to(copy('sat-cambio'), { autoAlpha: 1, y: 0, duration: 2 }, 64.6)
      .to(copy('sat-cambio'), { autoAlpha: 0, y: -16, duration: 1.5 }, 70.4)
      // Cierre: las capas se retiran y vuelve la huerta limpia
      .to([sat('change'), sat('ndvi-nov'), sat('ndvi-mar'), sat('flag'), sat('tags'), '[data-sat-legend]', '[data-sat-readout]'], { autoAlpha: 0, duration: 2 }, 70.8)
      .to($$('[data-sat="sectors"] path'), { opacity: 0, duration: 1.5 }, 71)
      .to(copy('sat-decision'), { autoAlpha: 1, y: 0, duration: 2 }, 72)
      .to(copy('sat-decision'), { autoAlpha: 0, y: -16, duration: 1.4 }, 76.6);
    camTo('mid', 71, 5);

    /* Ecosistema (77 a 91): el satélite aterriza en el teléfono */
    tl.to('[data-sat-hud]', { autoAlpha: 0, duration: 1.2 }, 77)
      .to(scrim('sat'), { autoAlpha: 0, duration: 1.2 }, 77)
      .to(sat('parcel'), { opacity: 0, duration: 1.5 }, 77.5)
      .to(cam, { x: () => phonePose().x, y: () => phonePose().y, scale: () => phonePose().scale, duration: 5, ease: 'power2.inOut' }, 77)
      .to(view, { clipPath: () => phoneClip(), duration: 5, ease: 'power2.inOut' }, 77)
      .to(scene('eco'), { autoAlpha: 1, duration: 1 }, 79)
      .to(phone, { autoAlpha: 1, duration: 1.6 }, 81.4)
      .to(scene('sat'), { autoAlpha: 0, duration: 1.4 }, 82.6)
      .to([copy('eco'), scrim('eco')], { autoAlpha: 1, y: 0, duration: 2 }, 81.4)
      .to([screen('mapa-poster'), screen('mapa')], { opacity: 1, duration: 1 }, 85)
      .fromTo(mapVideo.proxy, { t: 0 }, { t: 1, duration: 6, onUpdate: mapVideo.seek }, 85.6);

    /* Volver al campo (91 a 100) */
    tl.to(scene('campo'), { autoAlpha: 1, duration: 4 }, 91)
      .fromTo(layer('campo'), { scale: 1.3 }, { scale: 1, duration: 8, ease: 'power2.out' }, 91)
      .to(phone, { autoAlpha: 0, y: -40, duration: 3 }, 91)
      .to([copy('eco'), scrim('eco')], { autoAlpha: 0, duration: 2 }, 91)
      .set(scene('eco'), { autoAlpha: 0 }, 95)
      .to(copy('campo'), { autoAlpha: 1, y: 0, duration: 2.5 }, 94)
      .to({}, { duration: 2.5 }, 97.5);

    const st = tl.scrollTrigger;
    const railBtns = $$('[data-rail-to]');
    const onRail = e => scrollToY(st.start + ((ACT2.marks[e.currentTarget.dataset.railTo] || 0) / tl.duration()) * (st.end - st.start) + 2);
    railBtns.forEach(b => b.addEventListener('click', onRail));
    const onRefresh = () => layoutCam();
    ScrollTrigger.addEventListener('refreshInit', onRefresh);
    updateChrome();

    return {
        destroy() {
            railBtns.forEach(b => b.removeEventListener('click', onRail));
            if (range) range.removeEventListener('input', onRange);
            ScrollTrigger.removeEventListener('refreshInit', onRefresh);
            const v = screen('mapa'); if (v) v.pause();
        }
    };
}

/* ===================== ACTO III · Recorrido entre huertas ===================== */
/*
   Una cámara virtual avanza en Z. El progreso del scroll (0 a 100) se convierte en la posición de la cámara C(p):
   lenta mientras se observa cada huerta y mucho más rápida al cruzar el follaje entre una y otra.
   Capas, de atrás hacia adelante:
     1. Fotografía de la huerta (dolly lento) y su versión desenfocada (se funden cuando la cámara acelera).
     2. Recortes reales de follaje proyectados en perspectiva (escala = K / distancia): pasan junto a la cámara.
     3. "Masa" de follaje que crece hasta cubrir la pantalla; detrás de ella se cambia de huerta.
     4. "Portal": follaje con un claro irregular que se abre al emerger en la siguiente huerta.
   Todo se anima con transform y opacity; nada depende del tiempo, solo del scroll (funciona en ambos sentidos).
*/
const ACT3 = {
    lengthDesktop: 11, lengthMobile: 8.5, total: 100,
    crops: ['limon', 'mango', 'berries', 'cafe', 'guayaba'],
    holds: [[0, 20], [29, 40], [49, 60], [69, 80], [89, 100]],
    trans: [[20, 29], [40, 49], [60, 69], [80, 89]],
    marks: { limon: 11, mango: 31.5, berries: 51.5, cafe: 71.5, guayaba: 92 },
    /* Punto de fuga de cada huerta: zona de follaje denso hacia donde empuja la cámara (en % del encuadre). */
    focus: {
        desktop: { limon: [70, 22], mango: [50, 16], berries: [74, 18], cafe: [78, 22], guayaba: [62, 30] },
        mobile:  { limon: [70, 22], mango: [50, 14], berries: [70, 18], cafe: [72, 20], guayaba: [60, 26] }
    }
};

function buildAct3({ story, isMobile }) {
    const stage = story.querySelector('.story__stage');
    const $ = s => stage.querySelector(s);
    const $$ = s => Array.from(stage.querySelectorAll(s));
    const smooth = (a, b, v) => { const t = clamp01((v - a) / (b - a)); return t * t * (3 - 2 * t); };
    const easeIn = t => t * t * t;

    const crops = ACT3.crops.map(name => {
        const el = $(`[data-cv-crop="${name}"]`);
        const media = el.querySelector('[data-cv-media]');
        return {
            name, el, media,
            pic: media.querySelector('picture'),
            blur: media.querySelector('.cv-crop__blur'),
            copy: el.querySelector('[data-cv-copy]'),
            word: el.querySelector('.cv-crop__name span'),
            side: el.classList.contains('cv-crop--trail') ? 'trail' : 'lead'
        };
    });
    const intro = $('[data-cv-intro]');
    const clump = $('[data-cv-clump]');
    const portal = $('[data-cv-portal]');
    const shade = $('[data-cv-shade]');
    const scrims = { lead: $('[data-cv-scrim="lead"]'), trail: $('[data-cv-scrim="trail"]') };
    const credits = $('[data-cv-credits]');
    const fol = $('[data-cv-fol]');
    const railBtns = $$('[data-cv-to]');

    if (isMobile) [clump, portal].forEach(img => { if (img.dataset.srcM) img.src = img.dataset.srcM; });
    const focus = isMobile ? ACT3.focus.mobile : ACT3.focus.desktop;
    crops.forEach(c => {
        const f = focus[c.name];
        c.media.style.setProperty('--fx', f[0] + '%');
        c.media.style.setProperty('--fy', f[1] + '%');
    });

    /* --- Cámara: velocidad 1 al observar, hasta 10 al cruzar el follaje --- */
    const STEP = 0.05, N = Math.round(ACT3.total / STEP);
    const camTable = new Float32Array(N + 1);
    const speed = p => {
        for (const [a, b] of ACT3.trans) if (p > a && p < b) { const s = Math.sin(Math.PI * (p - a) / (b - a)); return 1 + 9 * s * s; }
        return 1;
    };
    for (let i = 1; i <= N; i++) camTable[i] = camTable[i - 1] + speed((i - 0.5) * STEP) * STEP;
    const cam = p => {
        if (p <= 0) return p;
        if (p >= ACT3.total) return camTable[N] + (p - ACT3.total);
        const f = p / STEP, i = Math.floor(f);
        return camTable[i] + (camTable[Math.min(N, i + 1)] - camTable[i]) * (f - i);
    };

    /* --- Recortes de follaje: aparecen en p0 con escala s0 y pasan junto a la cámara en p1 --- */
    const sprites = [];
    const sizes = { f1: [550, 240], f2: [400, 230], f3: [330, 320], f4: [440, 190], f5: [390, 190], f6: [310, 170] };
    const addSprite = (name, near, p0, p1, s0, fx, fy, w, flip) => {
        const img = document.createElement('img');
        img.className = 'cv-sp';
        img.alt = '';
        img.decoding = 'async';
        img.loading = 'lazy';
        img.src = `assets/cultivos/viaje/${name}${near ? '-near' : ''}${isMobile ? '-m' : ''}.webp`;
        fol.appendChild(img);
        const ratio = sizes[name][1] / sizes[name][0];
        const z = cam(p1) + 0.8;
        sprites.push({ img, p0, p1, s0, fx, fy, w, h: w * ratio, flip: flip ? -1 : 1, z, k: s0 * (z - cam(p0)), on: false });
    };
    /* Marco de follaje durante cada huerta (plano medio, nítido) */
    const holdSet = [
        ['f1', -0.62, -0.78, 56, false], ['f4', 0.64, 0.8, 54, true],
        ['f6', 0.68, -0.8, 48, false], ['f3', -0.7, 0.74, 44, false]
    ];
    ACT3.holds.forEach(([a, b], i) => {
        const next = ACT3.trans[i];
        const count = isMobile ? 1 : 2;
        for (let j = 0; j < count; j++) {
            const [n, fx, fy, w, flip] = holdSet[(i + j * 2) % holdSet.length];
            addSprite(n, true, a - 1, next ? next[0] + (next[1] - next[0]) * 0.5 + j * 0.4 : 160, 0.5, fx, fy, w, flip);
        }
    });
    /* Follaje cercano (desenfocado) que roza la cámara al entrar al túnel y al salir de él */
    const tunnelSet = [
        ['f2', -0.55, -0.9, 70, false], ['f5', 0.5, 0.95, 72, true], ['f1', 0.85, -0.6, 64, true],
        ['f3', -0.9, 0.55, 60, false], ['f4', -0.2, 1.0, 66, false], ['f6', 0.2, -1.0, 58, true]
    ];
    ACT3.trans.forEach(([a, b], i) => {
        const d = b - a;
        const inCount = isMobile ? 3 : 5;
        for (let j = 0; j < inCount; j++) {
            const [n, fx, fy, w, flip] = tunnelSet[(i + j) % tunnelSet.length];
            addSprite(n, true, a - 1.5 + j * 0.35, a + d * (0.24 + j * 0.05), 0.6, fx * 0.8, fy * 0.8, w, flip);
        }
        const outCount = isMobile ? 1 : 3;
        for (let j = 0; j < outCount; j++) {
            const [n, fx, fy, w, flip] = tunnelSet[(i + j + 3) % tunnelSet.length];
            addSprite(n, true, a + d * 0.55, a + d * (0.86 + j * 0.06), 0.5, fx * 0.7, fy * 0.7, w, !flip);
        }
    });

    /* --- Medidas del encuadre --- */
    let vw = 0, vh = 0, vm = 0, hw = 0, hh = 0;
    const measure = () => {
        vw = stage.clientWidth || window.innerWidth;
        vh = stage.clientHeight || window.innerHeight;
        vm = Math.max(vw, vh) / 100;
        hw = vw / 2 / vm; hh = vh / 2 / vm;
        sprites.forEach(s => { s.img.style.width = (s.w * vm).toFixed(1) + 'px'; s.img.style.height = (s.h * vm).toFixed(1) + 'px'; });
    };

    const show = (el, on) => { el.style.visibility = on ? 'visible' : 'hidden'; };

    /* --- Render: todo el estado es función de p --- */
    let lastP = -1;
    const render = p => {
        if (Math.abs(p - lastP) < 0.002) return;
        lastP = p;
        const C = cam(p);

        /* Fotografías de cada huerta */
        crops.forEach((c, i) => {
            const [a, b] = ACT3.holds[i];
            const tin = ACT3.trans[i - 1];   // transición de entrada
            const tout = ACT3.trans[i];      // transición de salida
            let visible = p >= (tin ? tin[0] + (tin[1] - tin[0]) * 0.44 : -1e9) && p <= (tout ? tout[0] + (tout[1] - tout[0]) * 0.56 : 1e9);
            let scale = 1, blurO = 0, tx = 0;
            if (tin && p < a) {
                const v = clamp01((p - tin[0]) / (tin[1] - tin[0]));
                const e = clamp01((v - 0.44) / 0.56);
                scale = 1 + 0.06 * e;
                blurO = 1 - smooth(0.15, 0.85, e);
            } else if (p <= b || !tout) {
                const u = clamp01((p - a) / (b - a));
                scale = 1.06 + 0.1 * u;
                tx = (i % 2 ? -1 : 1) * 1.2 * u;
            } else {
                const t = clamp01((p - tout[0]) / (tout[1] - tout[0]));
                const q = clamp01(t / 0.56);
                scale = 1.16 * (1 + 2.4 * easeIn(q));
                tx = (i % 2 ? -1 : 1) * 1.2;
                blurO = smooth(0.2, 0.7, q);
            }
            show(c.media, visible);
            if (visible) {
                const tf = `translate3d(${tx.toFixed(3)}%,0,0) scale(${scale.toFixed(4)})`;
                c.pic.style.transform = tf;
                c.blur.style.transform = tf;
                c.pic.style.opacity = (1 - blurO * 0.85).toFixed(3);
                c.blur.style.opacity = blurO.toFixed(3);
            }

            /* Texto del cultivo: entra después de emerger, sale antes de cruzar el follaje */
            const cin = i === 0 ? 9 : a + 0.5;
            const cout = tout ? b - 0.5 : 1e9;
            const vIn = smooth(cin, cin + 3.5, p);
            const vOut = tout ? 1 - smooth(cout - 3, cout + 0.5, p) : 1;
            const o = Math.min(vIn, vOut);
            show(c.copy, o > 0.01);
            if (o > 0.01) {
                c.copy.style.opacity = o.toFixed(3);
                const dy = (1 - vIn) * 26 - (1 - vOut) * 18;
                c.copy.style.transform = `translate3d(0,${dy.toFixed(2)}px,0)`;
                c.word.style.transform = `translate3d(0,${((1 - vIn) * 70).toFixed(2)}%,0)`;
            }
            c.copyO = o;
        });

        /* Introducción del acto (sobre la huerta de limón) */
        const io = 1 - smooth(6, 9.5, p);
        show(intro, io > 0.01);
        intro.style.opacity = io.toFixed(3);
        intro.style.transform = `translate3d(0,${((1 - io) * -22).toFixed(2)}px,0)`;

        /* Scrims solo donde vive el texto */
        let lead = io, trail = 0;
        crops.forEach(c => { if (c.side === 'trail' && !isMobile) trail = Math.max(trail, c.copyO); else lead = Math.max(lead, c.copyO); });
        scrims.lead.style.opacity = lead.toFixed(3);
        scrims.trail.style.opacity = trail.toFixed(3);
        if (credits) credits.style.opacity = (smooth(94, 98, p) * 0.9).toFixed(3);

        /* Túnel: masa de follaje, oscuridad y portal */
        let clumpS = 0, clumpO = 0, portS = 0, portO = 0, shadeO = 0;
        ACT3.trans.forEach(([a, b]) => {
            if (p < a - 0.5 || p > b + 0.5) return;
            const t = (p - a) / (b - a);
            if (t > 0.14 && t < 0.66) {
                const q = clamp01((t - 0.14) / 0.36);
                clumpS = 0.6 * Math.pow(1.75 / 0.6, q);
                if (t > 0.5) clumpS = 1.75 * Math.pow(3.2, (t - 0.5) / 0.16);
                clumpO = Math.min(smooth(0.14, 0.42, t), 1 - smooth(0.54, 0.66, t));
            }
            if (t > 0.44 && t < 1) {
                const q = clamp01((t - 0.44) / 0.56);
                portS = 0.55 * Math.pow(6.5 / 0.55, q);
                portO = 1 - smooth(0.82, 1, t);
            }
            shadeO = Math.max(shadeO, 0.22 * Math.sin(Math.PI * clamp01((t - 0.1) / 0.8)));
        });
        show(clump, clumpO > 0.01);
        if (clumpO > 0.01) { clump.style.opacity = clumpO.toFixed(3); clump.style.transform = `scale(${clumpS.toFixed(4)})`; }
        show(portal, portO > 0.01);
        if (portO > 0.01) { portal.style.opacity = portO.toFixed(3); portal.style.transform = `scale(${portS.toFixed(4)}) rotate(${(portS * 6).toFixed(2)}deg)`; }
        shade.style.opacity = shadeO.toFixed(3);

        /* Follaje proyectado */
        const cx = vw / 2, cy = vh / 2;
        for (const s of sprites) {
            const d = s.z - C;
            let on = p > s.p0 - 0.5 && d > 0.25;
            let s1 = 0, o = 0;
            if (on) {
                s1 = s.k / d;
                o = smooth(s.p0 - 0.5, s.p0 + 1.2, p) * (1 - smooth(5, 9, s1));
                on = o > 0.01 && s1 < 9;
            }
            if (on !== s.on) { s.img.style.visibility = on ? 'visible' : 'hidden'; s.on = on; }
            if (!on) continue;
            const ax = s.fx * hw / s.s0, ay = s.fy * hh / s.s0;
            const X = cx + (ax - s.w / 2 * s.flip) * s1 * vm;
            const Y = cy + (ay - s.h / 2) * s1 * vm;
            s.img.style.transform = `translate3d(${X.toFixed(1)}px,${Y.toFixed(1)}px,0) scale(${(s1 * s.flip).toFixed(4)},${s1.toFixed(4)})`;
            s.img.style.opacity = o.toFixed(3);
        }

        /* Riel */
        railBtns.forEach((btn, i) => {
            const a = i === 0 ? -1 : ACT3.trans[i - 1][0] + (ACT3.trans[i - 1][1] - ACT3.trans[i - 1][0]) * 0.5;
            const b = i === railBtns.length - 1 ? 101 : ACT3.trans[i][0] + (ACT3.trans[i][1] - ACT3.trans[i][0]) * 0.5;
            btn.setAttribute('aria-current', String(p >= a && p < b));
        });
    };

    measure();
    const proxy = { p: 0 };
    const tl = pinnedTimeline(stage, isMobile ? ACT3.lengthMobile : ACT3.lengthDesktop, isMobile, ACT3.total, () => render(proxy.p));
    tl.to(proxy, { p: ACT3.total, duration: ACT3.total, ease: 'none' }, 0);
    render(0);

    /* Precarga: las cinco huertas se piden cuando el acto se acerca, no al abrir la página */
    const eager = () => stage.querySelectorAll('img[loading="lazy"]').forEach(img => { img.loading = 'eager'; });
    const pre = ScrollTrigger.create({ trigger: story, start: 'top bottom+=150%', once: true, onEnter: eager });

    const onResize = () => { measure(); lastP = -1; render(proxy.p); };
    ScrollTrigger.addEventListener('refresh', onResize);

    const st = tl.scrollTrigger;
    const onRail = e => scrollToY(st.start + (ACT3.marks[e.currentTarget.dataset.cvTo] / tl.duration()) * (st.end - st.start) + 2);
    railBtns.forEach(b => b.addEventListener('click', onRail));

    return {
        destroy() {
            railBtns.forEach(b => b.removeEventListener('click', onRail));
            ScrollTrigger.removeEventListener('refresh', onResize);
            pre.kill();
            sprites.forEach(s => s.img.remove());
            [intro, clump, portal, shade, scrims.lead, scrims.trail, credits].forEach(el => el && el.removeAttribute('style'));
            crops.forEach(c => {
                [c.media, c.pic, c.blur, c.copy, c.word].forEach(el => el.removeAttribute('style'));
            });
        }
    };
}

/* ---------- 6. Secciones editoriales con scroll ---------- */
function buildSections({ isMobile }) {
    const triggers = [];
    const cleanups = [];
    const add = st => { triggers.push(st); return st; };

    /* Producto: teléfonos en profundidad y pasos que se encienden */
    const product = document.querySelector('[data-product]');
    if (product) {
        const tl = gsap.timeline({ scrollTrigger: { trigger: product, start: 'top bottom', end: 'bottom top', scrub: 0.8 } });
        product.querySelectorAll('[data-depth]').forEach(el => {
            const d = parseFloat(el.dataset.depth);
            tl.fromTo(el, { y: d * -90 }, { y: d * 90, ease: 'none' }, 0);
        });
        const front = product.querySelector('.device--front');
        if (front) tl.fromTo(front, { rotationY: -18, rotationX: 6 }, { rotationY: 6, rotationX: -2, ease: 'none' }, 0);
        add(tl.scrollTrigger);
        const steps = Array.from(product.querySelectorAll('[data-flow] li'));
        add(ScrollTrigger.create({
            trigger: product, start: 'top 65%', end: 'bottom 45%',
            onUpdate: self => steps.forEach((li, i) => li.classList.toggle('is-on', self.progress >= i / steps.length * 0.85)),
            onLeaveBack: () => steps.forEach(li => li.classList.remove('is-on'))
        }));
        const title = product.querySelector('[data-split]');
        if (title) add(gsap.fromTo(title, { y: 40, autoAlpha: 0.2 }, { y: 0, autoAlpha: 1, ease: 'none', scrollTrigger: { trigger: product, start: 'top 85%', end: 'top 35%', scrub: 0.6 } }).scrollTrigger);
    }

    /* Capacidades: teléfono fijo, el texto activo cambia la grabación */
    const caps = document.querySelector('[data-caps]');
    if (caps) {
        caps.classList.add('caps-motion');
        const videos = Array.from(caps.querySelectorAll('[data-cap-video]'));
        const dots = Array.from(caps.querySelectorAll('.caps__dots li'));
        const items = Array.from(caps.querySelectorAll('[data-cap]'));
        let active = -1;
        const setActive = i => {
            if (i === active) return;
            active = i;
            items.forEach((el, k) => el.classList.toggle('is-on', k === i));
            dots.forEach((el, k) => el.classList.toggle('is-on', k === i));
            videos.forEach((v, k) => {
                v.classList.toggle('is-on', k === i);
                if (k === i) { v.preload = 'auto'; v.play().catch(() => {}); } else v.pause();
            });
        };
        items.forEach((el, i) => add(ScrollTrigger.create({
            trigger: el, start: 'top 60%', end: 'bottom 60%',
            onToggle: self => { if (self.isActive) setActive(i); }
        })));
        add(ScrollTrigger.create({ trigger: caps, start: 'top bottom', end: 'bottom top', onLeave: () => videos.forEach(v => v.pause()), onLeaveBack: () => videos.forEach(v => v.pause()), onEnter: () => { if (active < 0) setActive(0); else videos[active].play().catch(() => {}); }, onEnterBack: () => { if (active >= 0) videos[active].play().catch(() => {}); } }));
        setActive(0);
        cleanups.push(() => { caps.classList.remove('caps-motion'); videos.forEach(v => v.pause()); });
    }

    /* Cultivos, Resultados y Aliados ya no dependen del scroll: ver initReveal(). */

    /* Comparativa: las tarjetas suben a su lugar */
    const cmp = document.querySelector('[data-compare]');
    if (cmp) add(gsap.fromTo(cmp.querySelectorAll('.pricing-card'), { y: 70, autoAlpha: 0.25 }, { y: 0, autoAlpha: 1, stagger: 0.12, ease: 'power1.out', scrollTrigger: { trigger: cmp, start: 'top 85%', end: 'top 35%', scrub: 0.6 } }).scrollTrigger);

    return {
        destroy() {
            triggers.forEach(t => t && t.kill());
            cleanups.forEach(fn => fn());
        }
    };
}

/* ---------- 7. Planes: tres niveles de inteligencia ---------- */
function buildPlans({ isMobile, hasDraw }) {
    const plans = document.querySelector('[data-plans]');
    if (!plans) return null;
    plans.classList.add('plans-motion');
    const stage = plans.querySelector('[data-plans-stage]');
    const $ = s => stage.querySelector(s);
    const $$ = s => Array.from(stage.querySelectorAll(s));
    const bg = n => $(`[data-pbg="${n}"]`);
    const sc = n => $(`[data-plan-scene="${n}"]`);
    const ind = n => $(`[data-pind="${n}"]`);
    const draw = drawer(hasDraw);
    const cam = $('[data-pro-cam]');
    const steps = $$('[data-plan-to]');
    const MARKS = { free: 4, basico: 40, pro: 74 };

    const layout = () => {
        const W = stage.clientWidth, H = stage.clientHeight;
        const Lw = Math.max(W, H * 1.4), Lh = Lw / 1.4;
        gsap.set(cam, { width: Lw, height: Lh });
        return { W, H, Lw, Lh };
    };
    layout();
    const proPose = zoom => () => {
        const { W, H, Lw, Lh } = layout();
        // centra la huerta de demostración (238, 355 en píxeles de la imagen)
        const px = 238 / 1470 * Lw, py = 355 / 1050 * Lh;
        const s = zoom;
        const fx = isMobile ? 0.5 : 0.36, fy = isMobile ? 0.36 : 0.5;
        return { scale: s, x: W * fx - px * s, y: H * fy - py * s };
    };

    gsap.set([sc('basico'), sc('pro')], { autoAlpha: 0, y: 40 });
    gsap.set(sc('free'), { autoAlpha: 0, y: 40 });
    gsap.set([bg('basico'), bg('pro')], { autoAlpha: 0 });
    gsap.set([ind('free'), ind('basico'), ind('pro')], { autoAlpha: 0 });
    gsap.set($$('.pind li'), { autoAlpha: 0, y: 12 });
    if (hasDraw) gsap.set([$('[data-pro-parcel]'), $('.pind__frame path')], { drawSVG: '0%' });

    const update = () => {
        const t = tl.time();
        steps.forEach(b => {
            const k = b.dataset.planTo;
            const on = (k === 'free' && t < 33) || (k === 'basico' && t >= 33 && t < 66) || (k === 'pro' && t >= 66);
            b.setAttribute('aria-current', String(on));
        });
    };

    const tl = gsap.timeline({
        defaults: { ease: 'none' },
        scrollTrigger: { trigger: stage, start: 'top top', end: () => '+=' + Math.round((isMobile ? 3.6 : 4.2) * window.innerHeight), pin: true, scrub: 0.8, anticipatePin: 1, invalidateOnRefresh: true },
        onUpdate: update
    });

    /* Free: la cámara desciende entre los árboles */
    tl.fromTo(bg('free'), { scale: 1.28, yPercent: -6 }, { scale: 1.04, yPercent: 0, duration: 32, ease: 'power1.out' }, 0)
      .to(sc('free'), { autoAlpha: 1, y: 0, duration: 4 }, 1)
      .to(ind('free'), { autoAlpha: 1, duration: 2 }, 4)
      .to($$('[data-pind="free"] li'), { autoAlpha: 1, y: 0, stagger: 2, duration: 2.5 }, 5)
      .to([sc('free'), ind('free')], { autoAlpha: 0, y: -20, duration: 3 }, 29);

    /* Básico: acercamiento a un árbol, análisis con IA */
    tl.to(bg('basico'), { autoAlpha: 1, duration: 4 }, 30)
      .fromTo(bg('basico'), { scale: 1 }, { scale: 1.32, duration: 36 }, 30)
      .to(sc('basico'), { autoAlpha: 1, y: 0, duration: 4 }, 35)
      .to(ind('basico'), { autoAlpha: 1, duration: 1.5 }, 37)
      .fromTo(...draw($('.pind__frame path'), '0%', '100%', { duration: 4 }), 37.5)
      .to($$('[data-pind="basico"] li'), { autoAlpha: 1, y: 0, stagger: 2, duration: 2.5 }, 41)
      .to([sc('basico'), ind('basico')], { autoAlpha: 0, y: -20, duration: 3 }, 62);

    /* Pro: la cámara asciende hasta la vista satelital */
    tl.to(bg('pro'), { autoAlpha: 1, duration: 4 }, 63)
      .fromTo(cam, { x: () => proPose(6)().x, y: () => proPose(6)().y, scale: () => proPose(6)().scale },
          { x: () => proPose(3.2)().x, y: () => proPose(3.2)().y, scale: () => proPose(3.2)().scale, duration: 22, ease: 'power2.out' }, 63)
      .fromTo(...draw($('[data-pro-parcel]'), '0%', '100%', { duration: 5 }), 71)
      .to($('[data-pro-ndvi]'), { opacity: 0.85, duration: 6 }, 77)
      .to(sc('pro'), { autoAlpha: 1, y: 0, duration: 4 }, 68)
      .to(ind('pro'), { autoAlpha: 1, duration: 2 }, 72)
      .to($$('[data-pind="pro"] li'), { autoAlpha: 1, y: 0, stagger: 2, duration: 2.5 }, 73)
      .to({}, { duration: 8 }, 92);

    const st = tl.scrollTrigger;
    const go = e => scrollToY(st.start + (MARKS[e.currentTarget.dataset.planTo] / tl.duration()) * (st.end - st.start) + 2);
    steps.forEach(b => b.addEventListener('click', go));
    // Los enlaces a #plan-pro llevan a la escena Pro dentro del tramo fijado.
    const proLinks = Array.from(document.querySelectorAll('a[href="#plan-pro"]'));
    const goPro = e => { e.preventDefault(); scrollToY(st.start + (MARKS.pro / tl.duration()) * (st.end - st.start) + 2); };
    proLinks.forEach(a => a.addEventListener('click', goPro));
    // Los botones de cada escena siguen funcionando aunque su escena esté oculta por el scroll.
    update();

    return {
        destroy() {
            steps.forEach(b => b.removeEventListener('click', go));
            proLinks.forEach(a => a.removeEventListener('click', goPro));
            plans.classList.remove('plans-motion');
        }
    };
}

/* ---------- Producto: el teléfono de App Store alterna sus dos capturas con un gesto de deslizar ---------- */
function initPhoneStory() {
    const story = document.querySelector('[data-phone-story]');
    if (!story) return;
    const frames = Array.from(story.querySelectorAll('[data-phone-frame]'));
    if (frames.length < 2) return;
    let index = 0, timer = null, visible = false;
    const reduced = () => prefersReducedMotion.matches;
    const show = next => {
        frames.forEach((f, i) => {
            f.classList.toggle('is-active', i === next);
            f.classList.toggle('is-before', i === index && i !== next);
        });
        index = next;
        if (!reduced()) {
            story.classList.remove('is-swiping');
            void story.offsetWidth;
            story.classList.add('is-swiping');
        }
        window.setTimeout(() => frames.forEach((f, i) => { if (i !== index) f.classList.remove('is-before'); }), 800);
    };
    const tick = () => show((index + 1) % frames.length);
    const start = () => { if (!timer && visible && !reduced()) timer = window.setInterval(tick, 3600); };
    const stop = () => { window.clearInterval(timer); timer = null; };
    story.addEventListener('animationend', () => story.classList.remove('is-swiping'));
    if ('IntersectionObserver' in window) {
        new IntersectionObserver(entries => {
            visible = entries[0].isIntersecting;
            if (visible) start(); else stop();
        }, { threshold: 0.35 }).observe(story);
    } else { visible = true; start(); }
    document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); else start(); });
    if (prefersReducedMotion.addEventListener) prefersReducedMotion.addEventListener('change', () => { stop(); start(); });
}

/* ---------- Arranque ---------- */
document.addEventListener('DOMContentLoaded', function () {
    const overlay = document.getElementById('planModal');
    if (overlay) {
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closePlanModal();
        });
    }

    initNav();
    initAnchors();
    initContactForm();
    initViewportVideos();
    initReveal();
    initPhoneStory();
    initMotion();
    startAvotexPageLoader().then(() => {
        if (window.ScrollTrigger) ScrollTrigger.refresh();
    });
});