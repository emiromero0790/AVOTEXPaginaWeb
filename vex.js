/* =========================================================
   it'sVEX · landing (index.html)
   1. Índice (menú) accesible
   2. Folio: nombre del capítulo actual
   3. Video de la app AVOTEX (carga diferida)
   4. Coreografía de scroll con GSAP + ScrollTrigger
      (ya incluidos en assets/vendor/gsap, los usa avotex.html)

   El HTML y el CSS describen la composición final. Aquí solo
   se parte de un desplazamiento y se llega a ella, de modo que
   sin JS o con movimiento reducido la página queda completa.
   ========================================================= */
(function () {
    'use strict';

    var root = document.documentElement;
    var q = function (sel, ctx) { return (ctx || document).querySelector(sel); };
    var qa = function (sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); };
    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    /* ---------- 1. Índice ---------- */
    function initIndex() {
        var panel = q('[data-index]');
        var openBtn = q('[data-index-open]');
        var closeBtn = q('[data-index-close]');
        if (!panel || !openBtn) return;
        var lastFocus = null;

        function open() {
            lastFocus = document.activeElement;
            panel.hidden = false;
            openBtn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden';
            var first = q('a', panel);
            if (first) first.focus();
        }
        function close(restore) {
            if (panel.hidden) return;
            panel.hidden = true;
            openBtn.setAttribute('aria-expanded', 'false');
            document.body.style.overflow = '';
            if (restore !== false && lastFocus) lastFocus.focus();
        }

        openBtn.addEventListener('click', open);
        closeBtn.addEventListener('click', function () { close(); });
        qa('a', panel).forEach(function (a) {
            a.addEventListener('click', function () { close(false); });
        });
        document.addEventListener('keydown', function (e) {
            if (panel.hidden) return;
            if (e.key === 'Escape') { close(); return; }
            if (e.key === 'Tab') {
                // Mantiene el foco dentro del índice abierto
                var f = qa('a, button', panel);
                var first = f[0], last = f[f.length - 1];
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
            }
        });
    }

    /* ---------- 2. Folio ---------- */
    function initFolio() {
        var label = q('[data-folio-label]');
        var chapters = qa('[data-chapter]');
        if (!label || !chapters.length) return;
        var current = '';
        var ticking = false;

        function update() {
            ticking = false;
            var line = window.innerHeight * 0.45;
            var name = chapters[0].getAttribute('data-chapter');
            // Orden del documento: un capítulo anidado (cada proyecto) sobrescribe al que lo contiene
            chapters.forEach(function (el) {
                var r = el.getBoundingClientRect();
                if (r.top <= line && r.bottom > line) name = el.getAttribute('data-chapter');
            });
            if (name !== current) { current = name; label.textContent = name; }
        }
        window.addEventListener('scroll', function () {
            if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
        }, { passive: true });
        window.addEventListener('resize', update);
        update();
    }

    /* ---------- 4. Coreografía de scroll ---------- */
    function initMotion() {
        if (!window.gsap || !window.ScrollTrigger) return;
        var gsap = window.gsap;
        var ScrollTrigger = window.ScrollTrigger;
        gsap.registerPlugin(ScrollTrigger);

        var mm = gsap.matchMedia();
        mm.add({
            desk: '(min-width: 900px) and (prefers-reduced-motion: no-preference)',
            mob: '(max-width: 899px) and (prefers-reduced-motion: no-preference)'
        }, function (ctx) {
            var desk = ctx.conditions.desk;
            var mob = ctx.conditions.mob;
            if (!desk && !mob) return;

            // Las clases van primero: cambian la composición (capas apiladas, franjas visibles)
            root.classList.add('m-on');
            if (desk) root.classList.add('m-desk');

            heroScene(gsap, desk);
            manifestoScene(gsap);
            if (desk) layersScene(gsap);
            intertitleScene(gsap);
            sysScene(gsap, desk);
            tourScene(gsap);
            appsScene(gsap, desk);
            avxScene(gsap, desk);
            diagScene(gsap, desk);
            mapeoScene(gsap, desk);
            cropsScene(gsap, desk);
            buScene(gsap, desk);
            weekScene(gsap, desk);
            servicesScene(gsap);
            processScene(gsap);
            looseFills(gsap);
            closeScene(gsap, desk);

            return function () { root.classList.remove('m-on', 'm-desk'); };
        });

        window.addEventListener('load', function () { ScrollTrigger.refresh(); });
    }

    /* Escena 1 · it'sVEX se rebana. Cada tira se desplaza en sentido
       contrario a la anterior, crecen franjas blancas entre ellas y la
       franja que asomaba abajo sube hasta volverse el fondo blanco
       del capítulo siguiente. */
    function heroScene(gsap, desk) {
        var stage = q('[data-hero]');
        if (!stage) return;
        var slices = qa('.slice', stage);
        var bands = qa('[data-hero-band]', stage);
        var shifts = desk ? [-5, 8, -13, 19, -26] : [-4, 6, -9, 12, -16];

        var tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
                trigger: stage, start: 'top top', end: desk ? '+=140%' : '+=90%',
                pin: true, scrub: 0.6, anticipatePin: 1
            }
        });
        tl.to(qa('[data-hero-copy], .hero__ctas', stage), { y: -48, autoAlpha: 0, duration: 0.28 }, 0)
          .to(slices, { x: function (i) { return shifts[i] + 'vw'; }, duration: 0.75 }, 0)
          .fromTo(bands, { scaleY: 0 }, { scaleY: 1, duration: 0.42, stagger: 0.07 }, 0.16)
          .to(q('[data-hero-rear]', stage), { yPercent: -10, scale: 1.12, duration: 1 }, 0)
          .to(q('[data-hero-grid]', stage), { opacity: 0, duration: 0.5 }, 0)
          .to(q('[data-hero-fg="a"]', stage), { x: '72vw', duration: 0.8 }, 0)
          .to(q('[data-hero-fg="b"]', stage), { x: '-66vw', duration: 0.8 }, 0)
          .fromTo(q('[data-hero-cover]', stage), { scaleY: 0.012 }, { scaleY: 1, duration: 0.38 }, 0.62);
    }

    /* Escena 2 · Cuatro capas reales. Una franja negra barre el marco
       y deja detrás la capa siguiente; al final sube un bloque negro
       que entrega el fondo al intertítulo de proyectos. */
    function layersScene(gsap) {
        var stage = q('[data-layers]');
        if (!stage) return;
        var box = q('[data-layer-frames]', stage);
        var frames = qa('[data-layer-frame]', stage);
        var items = qa('[data-layer-item]', stage);
        var wipe = q('[data-layer-wipe]', stage);
        var active = 0;

        function setActive(i) {
            if (i === active) return;
            active = i;
            items.forEach(function (li, n) { li.classList.toggle('is-on', n === i); });
        }

        var tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: {
                trigger: stage, start: 'top top', end: '+=230%', pin: true, scrub: 0.6, anticipatePin: 1,
                invalidateOnRefresh: true,
                onUpdate: function (self) {
                    var t = self.progress * tl.duration();
                    setActive(t < 0.55 ? 0 : t < 1.55 ? 1 : t < 2.55 ? 2 : 3);
                }
            }
        });
        for (var i = 1; i < frames.length; i++) {
            var at = (i - 1) + 0.2;
            tl.fromTo(frames[i], { clipPath: 'inset(0% 100% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7 }, at)
              .fromTo(q('img', frames[i]), { scale: 1.08 }, { scale: 1, duration: 0.9 }, at)
              .fromTo(wipe,
                  { x: function () { return -wipe.offsetWidth; } },
                  { x: function () { return box.offsetWidth; }, duration: 0.7, immediateRender: false }, at);
        }
        tl.to({}, { duration: 0.25 })
          .fromTo(q('[data-layer-exit]', stage), { scaleY: 0 }, { scaleY: 1, duration: 0.55 });
        items.forEach(function (li, n) { li.classList.toggle('is-on', n === 0); });
    }

    /* Intertítulo · la palabra viaja impresa sobre una franja blanca */
    function intertitleScene(gsap) {
        var block = q('[data-intertitle]');
        if (!block) return;
        gsap.fromTo(q('[data-intertitle-band]', block),
            { x: function () { return window.innerWidth * 0.32; } },
            { x: function () { return -window.innerWidth * 0.06; }, ease: 'none',
              scrollTrigger: { trigger: block, start: 'top bottom', end: 'bottom top', scrub: true, invalidateOnRefresh: true } });
    }

    /* ---------- Palabras que se aclaran de izquierda a derecha ----------
       Divide el texto de cada [data-fill] en palabras (<span class="w">).
       El texto real no cambia: lectores de pantalla y copiar/pegar siguen igual. */
    function splitFill() {
        qa('[data-fill]').forEach(function (el) {
            var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
            var nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            nodes.forEach(function (node) {
                var parts = node.textContent.split(/(\s+)/);
                var frag = document.createDocumentFragment();
                parts.forEach(function (p) {
                    if (!p) return;
                    if (/^\s+$/.test(p)) { frag.appendChild(document.createTextNode(p)); return; }
                    var s = document.createElement('span');
                    s.className = 'w';
                    s.textContent = p;
                    frag.appendChild(s);
                });
                node.parentNode.replaceChild(frag, node);
            });
        });
    }
    function fillTween(gsap, el, vars) {
        return gsap.fromTo(qa('.w', el), { opacity: 0.16 }, Object.assign({ opacity: 1, ease: 'none', stagger: 0.12 }, vars || {}));
    }

    /* Fills sueltos (fuera de escenas fijadas): índice de proyectos, servicios, proceso */
    function looseFills(gsap) {
        qa('[data-fill]').forEach(function (el) {
            if (el.closest('.case__stage') || el.getAttribute('data-fill') === 'manifesto') return;
            fillTween(gsap, el, { scrollTrigger: { trigger: el, start: 'top 86%', end: 'top 42%', scrub: 0.5 } });
        });
    }

    /* Manifiesto: el párrafo se queda fijo y se ilumina palabra por palabra */
    function manifestoScene(gsap) {
        var sec = q('[data-manifesto]');
        if (!sec) return;
        fillTween(gsap, q('[data-fill]', sec), {
            scrollTrigger: { trigger: sec, start: 'top 15%', end: 'bottom 85%', scrub: 0.5 }
        });
    }

    /* Índice de proyectos: la etiqueta "Ver caso" sigue al puntero */
    function initProjectIndex() {
        if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
        qa('[data-pindex]').forEach(function (item) {
            var thumb = q('.pindex__thumb', item);
            item.addEventListener('pointermove', function (e) {
                var r = thumb.getBoundingClientRect();
                thumb.style.setProperty('--mx', (e.clientX - r.left) + 'px');
                thumb.style.setProperty('--my', (e.clientY - r.top) + 'px');
            });
        });
    }

    /* Videos que avanzan con el scroll (grabaciones reales de la app).
       Se cargan solo cuando la escena está cerca. */
    function scrubVideo(video) {
        var loaded = false;
        var target = 0;
        var raf = null;
        function load() {
            if (loaded) return;
            loaded = true;
            qa('source[data-src]', video).forEach(function (s) { s.src = s.getAttribute('data-src'); });
            video.preload = 'auto';
            video.load();
        }
        function apply() {
            raf = null;
            if (video.readyState < 1 || !video.duration) return;
            var t = Math.min(video.duration - 0.05, Math.max(0, target * video.duration));
            if (Math.abs(video.currentTime - t) > 0.03) video.currentTime = t;
        }
        return {
            load: load,
            set: function (p) {
                target = p;
                if (!raf) raf = window.requestAnimationFrame(apply);
            }
        };
    }
    function pinTimeline(gsap, stage, end, extra) {
        return gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: Object.assign({ trigger: stage, start: 'top top', end: end, pin: true, scrub: 0.6, anticipatePin: 1, invalidateOnRefresh: true }, extra || {})
        });
    }

    /* ===== Frutas Finas Durán · A · El sistema =====
       Los módulos se encienden fila por fila y las conexiones se dibujan. */
    function sysScene(gsap, desk) {
        var stage = q('[data-sys]');
        if (!stage) return;
        var nodes = qa('[data-sys-node]', stage);
        var lines = qa('[data-sys-line]', stage);
        var tl = pinTimeline(gsap, stage, desk ? '+=140%' : '+=110%');
        tl.add(fillTween(gsap, q('[data-fill]', stage), { duration: 0.5, stagger: 0.15 }), 0)
          .fromTo(nodes, { opacity: 0.2 }, { opacity: 0.2, duration: 0.01 }, 0)
          .to(nodes.slice(0, 2), { opacity: 1, duration: 0.15, stagger: 0.08 }, 0.35)
          .fromTo(lines.slice(0, 4), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.35, stagger: 0.05 }, 0.5)
          .to(nodes.slice(2, 5), { opacity: 1, duration: 0.15, stagger: 0.08 }, 0.8)
          .fromTo(lines.slice(4, 7), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.3, stagger: 0.05 }, 1.0)
          .to(nodes.slice(5, 7), { opacity: 1, duration: 0.15, stagger: 0.08 }, 1.25)
          .fromTo(lines.slice(7), { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.3, stagger: 0.05 }, 1.4)
          .to(nodes[7], { opacity: 1, duration: 0.15 }, 1.65)
          .to({}, { duration: 0.3 });
    }

    /* ===== Frutas Finas Durán · B · Recorrido de cámara =====
       La cámara recorre el dashboard real y se detiene en cada zona. */
    function tourScene(gsap) {
        var stage = q('[data-tour]');
        if (!stage) return;
        var frame = q('.tour__frame', stage);
        var cam = q('[data-tour-cam]', stage);
        var steps = qa('[data-tour-step]', stage);
        var boxes = steps.map(function (li) { return li.getAttribute('data-box').split(',').map(Number); });
        var RATIO = 1253 / 1600;
        var active = -1;

        function T(i) {
            var b = boxes[i];
            var Fw = frame.clientWidth, Fh = frame.clientHeight;
            var W = Fw, H = W * RATIO;
            var bw = (b[2] - b[0]) * W, bh = (b[3] - b[1]) * H;
            var s = Math.min(Fw / bw, Fh / bh) * (i === 0 ? 1 : 0.9);
            return { x: Fw / 2 - s * (b[0] + b[2]) / 2 * W, y: Fh / 2 - s * (b[1] + b[3]) / 2 * H, scale: s };
        }
        function setActive(i) {
            if (i === active) return;
            active = i;
            steps.forEach(function (li, n) { li.classList.toggle('is-on', n === i); });
        }
        var tl = pinTimeline(gsap, stage, '+=' + (boxes.length * 50) + '%', {
            onUpdate: function (self) {
                var t = self.progress * tl.duration();
                setActive(Math.max(0, Math.min(boxes.length - 1, Math.floor((t - 1) / 1.5) + 1)));
            }
        });
        tl.fromTo(cam, { x: function () { return T(0).x; }, y: function () { return T(0).y; }, scale: function () { return T(0).scale; } },
                       { x: function () { return T(0).x; }, y: function () { return T(0).y; }, scale: function () { return T(0).scale; }, duration: 0.5 });
        boxes.forEach(function (b, i) {
            if (i === 0) return;
            tl.to(cam, {
                x: function () { return T(i).x; }, y: function () { return T(i).y; }, scale: function () { return T(i).scale; },
                duration: 1, ease: 'power2.inOut'
            }).to({}, { duration: 0.5 });
        });
        setActive(0);
    }

    /* ===== Frutas Finas Durán · C · Dos accesos ===== */
    function appsScene(gsap, desk) {
        var stage = q('[data-apps]');
        if (!stage) return;
        if (!desk) {
            fillTween(gsap, q('[data-fill]', stage), { scrollTrigger: { trigger: stage, start: 'top 80%', end: 'top 30%', scrub: 0.5 } });
            qa('.shot', stage).forEach(function (shot) {
                gsap.fromTo(shot, { y: 50, clipPath: 'inset(0% 0% 100% 0%)' }, { y: 0, clipPath: 'inset(0% 0% 0% 0%)', ease: 'none',
                    scrollTrigger: { trigger: shot, start: 'top 95%', end: 'top 60%', scrub: true } });
            });
            return;
        }
        var tl = pinTimeline(gsap, stage, '+=120%');
        tl.add(fillTween(gsap, q('[data-fill]', stage), { duration: 0.45, stagger: 0.1 }), 0)
          .fromTo(q('[data-apps-pos]', stage), { x: '-40vw', rotation: -4 }, { x: 0, rotation: 0, duration: 0.55 }, 0.15)
          .fromTo(q('[data-apps-erp]', stage), { x: '40vw', rotation: 4 }, { x: 0, rotation: 0, duration: 0.55 }, 0.15)
          .fromTo(q('[data-apps-pay]', stage), { y: '60vh' }, { y: 0, duration: 0.5 }, 0.6)
          .to({}, { duration: 0.3 })
          .fromTo(qa('[data-apps-exit] span', stage), { scaleY: 0 }, { scaleY: 1, duration: 0.45, stagger: 0.04 });
    }

    /* ===== AVOTEX · A · La huerta se abre por surcos (pico) ===== */
    function avxScene(gsap, desk) {
        var stage = q('[data-avx]');
        if (!stage) return;
        if (!desk) {
            var photo = q('[data-avx-photo]', stage);
            gsap.fromTo(qa('[data-avx-rows] span', stage), { scaleY: 1 }, { scaleY: 0, ease: 'none', stagger: { each: 0.05, from: 'center' },
                scrollTrigger: { trigger: photo, start: 'top 85%', end: 'bottom 45%', scrub: true } });
            gsap.fromTo(q('img', photo), { scale: 1.25 }, { scale: 1, ease: 'none', scrollTrigger: { trigger: photo, start: 'top bottom', end: 'bottom top', scrub: true } });
            return;
        }
        var tl = pinTimeline(gsap, stage, '+=160%', { scrub: 0.7 });
        tl.fromTo(qa('[data-avx-rows] span', stage), { scaleY: 1 }, { scaleY: 0, duration: 0.6, stagger: { each: 0.05, from: 'center' } }, 0)
          .fromTo(q('[data-avx-photo] img', stage), { scale: 1.35 }, { scale: 1.02, duration: 1.8 }, 0)
          .fromTo(q('[data-avx-panel]', stage), { xPercent: -101 }, { xPercent: 0, duration: 0.5, ease: 'power2.out' }, 0.45)
          .to({}, { duration: 0.35 });
    }

    /* ===== AVOTEX · B · Diagnóstico: el scroll reproduce la grabación ===== */
    function diagScene(gsap, desk) {
        var stage = q('[data-diag]');
        if (!stage) return;
        var vid = scrubVideo(q('[data-scrub-video]', stage));
        var steps = qa('[data-diag-step]', stage);
        var active = -1;
        function setActive(i) {
            if (i === active) return;
            active = i;
            steps.forEach(function (li, n) { li.classList.toggle('is-on', n === i); });
        }
        var tl = pinTimeline(gsap, stage, desk ? '+=180%' : '+=150%', {
            onEnter: vid.load, onEnterBack: vid.load,
            onUpdate: function (self) {
                vid.set(self.progress);
                setActive(self.progress < 0.3 ? 0 : self.progress < 0.78 ? 1 : 2);
            }
        });
        tl.fromTo(q('.diag__photo img', stage), { scale: 1.15 }, { scale: 1, duration: 1 }, 0);
        ScrollTrigger_preload(stage, vid.load);
        setActive(0);
    }

    /* ===== AVOTEX · C · Mapeo: el NDVI barre la imagen satelital ===== */
    function mapeoScene(gsap, desk) {
        var stage = q('[data-mapeo]');
        if (!stage) return;
        var vid = scrubVideo(q('[data-scrub-video]', stage));
        var sat = q('.mapeo__sat', stage);
        var edge = q('[data-mapeo-edge]', stage);
        var tl = pinTimeline(gsap, stage, desk ? '+=150%' : '+=130%', {
            onEnter: vid.load, onEnterBack: vid.load,
            onUpdate: function (self) { vid.set(self.progress); }
        });
        tl.add(fillTween(gsap, q('[data-fill]', stage), { duration: 0.35, stagger: 0.06 }), 0)
          .fromTo(q('[data-mapeo-ndvi]', stage), { clipPath: 'inset(0% 0% 0% 100%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.7 }, 0.25)
          .fromTo(edge, { x: function () { return sat.clientWidth; } }, { x: 0, duration: 0.7 }, 0.25)
          .to(edge, { opacity: 0, duration: 0.05 })
          .to({}, { duration: 0.1 });
        ScrollTrigger_preload(stage, vid.load);
    }
    function ScrollTrigger_preload(stage, fn) {
        if (!('IntersectionObserver' in window)) { fn(); return; }
        var io = new IntersectionObserver(function (entries) {
            if (entries[0].isIntersecting) { fn(); io.disconnect(); }
        }, { rootMargin: '150% 0px' });
        io.observe(stage);
    }

    /* ===== AVOTEX · D · Seis cultivos en recorrido lateral ===== */
    function cropsScene(gsap, desk) {
        var stage = q('[data-crops]');
        if (!stage) return;
        var rail = q('[data-crops-rail]', stage);
        var vp = q('.crops__viewport', stage);
        function dist() { return Math.max(0, rail.scrollWidth - vp.clientWidth + parseFloat(getComputedStyle(vp).paddingLeft)); }
        var tl = pinTimeline(gsap, stage, function () { return '+=' + (dist() + window.innerHeight * (desk ? 0.6 : 0.4)); });
        tl.add(fillTween(gsap, q('[data-fill]', stage), { duration: 0.3, stagger: 0.05 }), 0)
          .to(rail, { x: function () { return -dist(); }, duration: 1.4 }, 0.15);
        tl.to({}, { duration: 0.15 });
        if (desk) tl.fromTo(q('[data-crops-exit]', stage), { scaleX: 0 }, { scaleX: 1, duration: 0.3 });
    }

    /* ===== Between Us · A · "us" se cierra ===== */
    function buScene(gsap, desk) {
        var stage = q('[data-bu]');
        if (!stage) return;
        if (!desk) {
            var st = { trigger: q('.bu__mark', stage), start: 'top 90%', end: 'top 35%', scrub: true };
            gsap.fromTo(q('[data-bu-letter="u"]', stage), { x: '-22vw' }, { x: 0, ease: 'none', scrollTrigger: st });
            gsap.fromTo(q('[data-bu-letter="s"]', stage), { x: '22vw' }, { x: 0, ease: 'none', scrollTrigger: st });
            return;
        }
        var tl = pinTimeline(gsap, stage, '+=110%');
        tl.fromTo(q('[data-bu-letter="u"]', stage), { x: '-20vw' }, { x: 0, duration: 1 }, 0)
          .fromTo(q('[data-bu-letter="s"]', stage), { x: '20vw' }, { x: 0, duration: 1 }, 0)
          .fromTo(q('[data-bu-photo="l"]', stage), { x: '-34vw' }, { x: 0, duration: 1 }, 0)
          .fromTo(q('[data-bu-photo="r"]', stage), { x: '34vw' }, { x: 0, duration: 1 }, 0)
          .to({}, { duration: 0.3 });
    }

    /* ===== Between Us · B · Una semana: recorrido lateral y Phil gira ===== */
    function weekScene(gsap, desk) {
        var stage = q('[data-week]');
        if (!stage) return;
        var rail = q('[data-week-rail]', stage);
        var vp = q('.week__viewport', stage);
        var phil = q('[data-phil]', stage);
        var frame = -1;
        function dist() { return Math.max(0, rail.scrollWidth - vp.clientWidth); }
        var tl = pinTimeline(gsap, stage, function () { return '+=' + (dist() + window.innerHeight * (desk ? 0.6 : 0.4)); }, {
            onUpdate: function (self) {
                // Phil da vuelta y media mientras pasa la semana
                var f = Math.floor(self.progress * 12) % 6;
                if (f !== frame) { frame = f; phil.style.backgroundPosition = (f * 20) + '% 50%'; }
            }
        });
        tl.to(rail, { x: function () { return -dist(); }, duration: 1.4 }, 0.1)
          .to({}, { duration: 0.15 });
        if (desk) tl.fromTo(q('[data-week-exit]', stage), { scaleX: 0 }, { scaleX: 1, duration: 0.3 });
    }

    /* ===== Proceso: cada palabra se ilumina y el dibujo crece ===== */
    function processScene(gsap) {
        var sec = q('#proceso');
        if (!sec) return;
        qa('[data-proc-step]', sec).forEach(function (step, i) {
            var g = q('[data-draw="' + i + '"]', sec);
            if (!g) return;
            gsap.fromTo(qa('*', g), { strokeDashoffset: 1 }, {
                strokeDashoffset: 0, ease: 'none', stagger: 0.08,
                scrollTrigger: { trigger: step, start: 'top 80%', end: 'top 30%', scrub: 0.5 }
            });
        });
    }

    /* Escena 4 · Una franja blanca cruza cada fila y la invierte
       (mix-blend-mode: difference). Al terminar, la lista es blanca. */
    function servicesScene(gsap) {
        qa('[data-svc-row]').forEach(function (row) {
            gsap.fromTo(q('[data-svc-band]', row), { scaleX: 0 }, {
                scaleX: 1, ease: 'none',
                scrollTrigger: { trigger: row, start: 'top 80%', end: 'top 46%', scrub: 0.4 }
            });
        });
    }

    /* Escena 6 · Dos franjas llegan desde los extremos, se encuentran
       y giran hasta formar la X de VEX detrás de la pregunta final. */
    function closeScene(gsap, desk) {
        var stage = q('[data-close]');
        if (!stage) return;
        var a = q('[data-close-band="a"]', stage);
        var b = q('[data-close-band="b"]', stage);
        var tl = gsap.timeline({
            defaults: { ease: 'none' },
            scrollTrigger: desk
                ? { trigger: stage, start: 'top top', end: '+=100%', pin: true, scrub: 0.6, anticipatePin: 1 }
                : { trigger: stage, start: 'top 85%', end: 'center 45%', scrub: 0.5 }
        });
        tl.fromTo(a, { x: '-130vw', rotation: 0 }, { x: 0, duration: 0.5 }, 0)
          .fromTo(b, { x: '130vw', rotation: 0 }, { x: 0, duration: 0.5 }, 0)
          .to(a, { rotation: -29, duration: 0.4, ease: 'power1.inOut' }, 0.5)
          .to(b, { rotation: 29, duration: 0.4, ease: 'power1.inOut' }, 0.5);
        if (desk) tl.to({}, { duration: 0.15 });
    }

    /* ---------- Ajuste del hero: it'sVEX ocupa el ancho disponible ---------- */
    function fitHeroWord() {
        var word = q('[data-hero-word]');
        var first = word && q('.slice', word);
        if (!first) return;
        var stage = q('[data-hero]');
        var cs = window.getComputedStyle(stage);
        var avail = stage.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
        word.style.fontSize = '';
        var base = parseFloat(window.getComputedStyle(word).fontSize);
        var range = document.createRange();
        range.selectNodeContents(first);
        var w = range.getBoundingClientRect().width;
        if (!w) return;
        var maxByHeight = window.innerHeight * (window.innerWidth < 900 ? 0.3 : 0.46);
        word.style.fontSize = Math.min(base * (avail * 0.985) / w, maxByHeight) + 'px';
    }
    function initFit() {
        fitHeroWord();
        var t;
        window.addEventListener('resize', function () {
            clearTimeout(t);
            t = setTimeout(function () {
                fitHeroWord();
                if (window.ScrollTrigger) window.ScrollTrigger.refresh();
            }, 150);
        });
        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(function () {
                fitHeroWord();
                if (window.ScrollTrigger) window.ScrollTrigger.refresh();
            });
        }
    }

    function start() {
        splitFill();
        initFit();
        initIndex();
        initFolio();
        initProjectIndex();
        initMotion();
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
