/* ==========================================================================
   Between Us · Landing
   JavaScript sin dependencias. Todo es mejora progresiva: sin JS la página
   se lee completa y los enlaces funcionan.
   ========================================================================== */
(function () {
  'use strict';

  var root = document.documentElement;
  root.classList.add('js');

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');

  function $(sel, ctx) {
    return (ctx || document).querySelector(sel);
  }
  function $$(sel, ctx) {
    return Array.prototype.slice.call((ctx || document).querySelectorAll(sel));
  }

  /* ---------- Año del pie ---------- */
  $$('[data-year]').forEach(function (el) {
    el.textContent = String(new Date().getFullYear());
  });

  /* ---------- Navegación: estado al hacer scroll y sección activa ---------- */
  var nav = $('[data-nav]');
  if (nav) {
    // Sobre el hero principal la barra es transparente con texto crema.
    var stage = $('[data-stage]');
    var onScroll = function () {
      nav.classList.toggle('is-scrolled', window.scrollY > 12);
      if (stage) {
        var sheet = $('[data-menu]');
        var menuOpen = sheet && !sheet.hidden;
        nav.classList.toggle(
          'is-on-stage',
          !menuOpen && stage.getBoundingClientRect().bottom > nav.offsetHeight + 24,
        );
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  var navLinks = $$('.nav__links a[href^="#"], .toc a[href^="#"]');
  if (navLinks.length && 'IntersectionObserver' in window) {
    var byId = {};
    navLinks.forEach(function (a) {
      var id = a.getAttribute('href').slice(1);
      (byId[id] = byId[id] || []).push(a);
    });
    var sectionObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          navLinks.forEach(function (a) {
            a.removeAttribute('aria-current');
          });
          (byId[entry.target.id] || []).forEach(function (a) {
            a.setAttribute('aria-current', 'true');
          });
        });
      },
      { rootMargin: '-45% 0px -50% 0px' },
    );
    Object.keys(byId).forEach(function (id) {
      var section = document.getElementById(id);
      if (section) sectionObserver.observe(section);
    });
  }

  /* ---------- Menú móvil ---------- */
  var toggle = $('[data-menu-toggle]');
  var menu = $('[data-menu]');
  if (toggle && menu) {
    var setMenu = function (open) {
      menu.hidden = !open;
      window.dispatchEvent(new Event('scroll'));
      toggle.setAttribute('aria-expanded', String(open));
      toggle.querySelector('use').setAttribute('href', open ? '#i-close' : '#i-menu');
      toggle.querySelector('.sr-only').textContent = open ? 'Cerrar menú' : 'Abrir menú';
    };
    toggle.addEventListener('click', function () {
      setMenu(menu.hidden);
    });
    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) setMenu(false);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) {
        setMenu(false);
        toggle.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!menu.hidden && !nav.contains(e.target)) setMenu(false);
    });
  }

  /* ---------- Aparición al hacer scroll ---------- */
  var reveals = $$('.reveal');
  if ('IntersectionObserver' in window) {
    // Escalonado leve entre hermanos que aparecen juntos.
    reveals.forEach(function (el) {
      var siblings = el.parentElement ? $$(':scope > .reveal', el.parentElement) : [];
      var i = siblings.indexOf(el);
      if (i > 0) el.style.setProperty('--delay', Math.min(i, 5) * 80 + 'ms');
    });
    var revealObserver = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            revealObserver.unobserve(entry.target);
          }
        });
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    reveals.forEach(function (el) {
      revealObserver.observe(el);
    });
  } else {
    reveals.forEach(function (el) {
      el.classList.add('is-in');
    });
  }

  /* ---------- Parallax con el cursor (capas con distinta profundidad) ---------- */
  function setupParallax(stage) {
    var layers = $$('[data-depth]', stage);
    layers.forEach(function (layer) {
      layer.style.setProperty('--d', layer.getAttribute('data-depth'));
    });
    var frame = 0;
    var target = { x: 0, y: 0 };

    stage.addEventListener('pointermove', function (e) {
      if (reduceMotion.matches || !finePointer.matches) return;
      var r = stage.getBoundingClientRect();
      target.x = ((e.clientX - r.left) / r.width - 0.5) * 2; // -1 … 1
      target.y = ((e.clientY - r.top) / r.height - 0.5) * 2;
      if (!frame) frame = requestAnimationFrame(apply);
    });
    stage.addEventListener('pointerleave', function () {
      target.x = 0;
      target.y = 0;
      if (!frame) frame = requestAnimationFrame(apply);
    });

    function apply() {
      frame = 0;
      layers.forEach(function (layer) {
        layer.style.setProperty('--px', (target.x * 14).toFixed(2));
        layer.style.setProperty('--py', (target.y * 12).toFixed(2));
      });
    }
  }
  $$('[data-parallax]').forEach(setupParallax);

  /* Luz ambiental: sigue al cursor muy despacio, como luz que se mueve en la sala */
  var orbs = $$('.orb');
  if (orbs.length) {
    var orbFrame = 0;
    var mx = 0,
      my = 0;
    window.addEventListener(
      'pointermove',
      function (e) {
        if (reduceMotion.matches || !finePointer.matches) return;
        mx = e.clientX / window.innerWidth - 0.5;
        my = e.clientY / window.innerHeight - 0.5;
        if (!orbFrame)
          orbFrame = requestAnimationFrame(function () {
            orbFrame = 0;
            orbs.forEach(function (orb, i) {
              var k = (i % 2 ? -1 : 1) * (18 + i * 8);
              orb.style.setProperty('--ox', (mx * k).toFixed(1) + 'px');
              orb.style.setProperty('--oy', (my * k).toFixed(1) + 'px');
            });
          });
      },
      { passive: true },
    );
  }

  /* ---------- Inclinación sutil de paneles (solo puntero fino) ---------- */
  $$('[data-tilt]').forEach(function (el) {
    var frame = 0;
    var rx = 0,
      ry = 0;
    el.addEventListener('pointermove', function (e) {
      if (reduceMotion.matches || !finePointer.matches) return;
      if (el.classList.contains('reveal') && !el.classList.contains('is-in')) return;
      var r = el.getBoundingClientRect();
      ry = ((e.clientX - r.left) / r.width - 0.5) * 4; // grados
      rx = -((e.clientY - r.top) / r.height - 0.5) * 4;
      if (!frame)
        frame = requestAnimationFrame(function () {
          frame = 0;
          el.style.transform =
            'perspective(1200px) rotateX(' +
            rx.toFixed(2) +
            'deg) rotateY(' +
            ry.toFixed(2) +
            'deg) translateY(-4px)';
        });
    });
    el.addEventListener('pointerleave', function () {
      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
      el.style.transform = '';
    });
  });

  /* ---------- Fondo de la frase: desplazamiento lento con el scroll ---------- */
  var scrollBg = $('[data-scroll-parallax]');
  if (scrollBg && 'IntersectionObserver' in window) {
    var visible = false;
    var ticking = false;
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
    }).observe(scrollBg.parentElement);
    window.addEventListener(
      'scroll',
      function () {
        if (!visible || reduceMotion.matches || ticking) return;
        ticking = true;
        requestAnimationFrame(function () {
          ticking = false;
          var r = scrollBg.parentElement.getBoundingClientRect();
          var p = (r.top + r.height / 2 - window.innerHeight / 2) / window.innerHeight; // -1 … 1 aprox.
          scrollBg.style.transform = 'translate3d(0,' + (p * -40).toFixed(1) + 'px,0)';
        });
      },
      { passive: true },
    );
  }

  /* ---------- Chips de ánimo del hero: respuesta inmediata al tocar ---------- */
  $$('[data-mood]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      $$('[data-mood]').forEach(function (b) {
        b.classList.remove('is-picked');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('is-picked');
      btn.setAttribute('aria-pressed', 'true');
    });
  });

  /* ---------- Pasos: acordeón que cambia la imagen ---------- */
  var steps = $('[data-steps]');
  if (steps) {
    var buttons = $$('[data-step]', steps);
    var images = $$('.steps__img');
    var caption = $('[data-step-caption]');
    var captions = [
      'Código de un solo uso · vigencia de 48 horas',
      'Nota de voz · se transcribe en el teléfono',
      'Generado con IA · revisa el registro original',
    ];
    var openStep = function (index) {
      buttons.forEach(function (b, i) {
        var open = i === index;
        b.setAttribute('aria-expanded', String(open));
        b.parentElement.classList.toggle('is-open', open);
        document.getElementById(b.getAttribute('aria-controls')).hidden = !open;
      });
      images.forEach(function (img, i) {
        img.classList.toggle('is-active', i === index);
      });
      if (caption) caption.textContent = captions[index] || '';
    };
    buttons.forEach(function (b, i) {
      b.addEventListener('click', function () {
        openStep(i);
      });
    });
  }

  /* ---------- Calculadora de membresía ---------- */
  var calc = $('[data-calc]');
  if (calc) {
    var BASE = 500,
      INCLUDED = 15,
      EXTRA = 30;
    var range = $('input[type="range"]', calc);
    var count = $('[data-calc-count]', calc);
    var out = $('[data-calc-out]', calc);
    var money = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });
    var update = function () {
      var n = parseInt(range.value, 10);
      var extra = Math.max(0, n - INCLUDED);
      var total = BASE + extra * EXTRA;
      var pct = ((n - range.min) / (range.max - range.min)) * 100;
      range.style.setProperty('--fill', pct + '%');
      range.setAttribute('aria-valuetext', n + (n === 1 ? ' paciente' : ' pacientes'));
      count.textContent = String(n);
      out.innerHTML =
        '<strong>$' +
        money.format(total) +
        ' MXN al mes</strong> · ' +
        (extra === 0
          ? 'dentro de tus 15 lugares incluidos'
          : '15 lugares incluidos + ' + extra + ' extra');
    };
    range.addEventListener('input', update);
    update();
  }

  /* ---------- Formulario de contacto ---------- */
  var form = $('[data-contact]');
  if (form) {
    var status = $('[data-form-status]', form);
    var CONTACT_EMAIL = 'hola@betweenus.mx'; // Cambiar por el correo real de contacto.
    var rules = [
      {
        name: 'nombre',
        error: 'e-nombre',
        test: function (v) {
          return v.trim().length >= 2;
        },
      },
      {
        name: 'correo',
        error: 'e-correo',
        test: function (v) {
          return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());
        },
      },
      {
        name: 'mensaje',
        error: 'e-mensaje',
        test: function (v) {
          return v.trim().length >= 5;
        },
      },
    ];

    var validateField = function (rule) {
      var field = form.elements[rule.name];
      var ok = rule.test(field.value);
      var err = document.getElementById(rule.error);
      field.setAttribute('aria-invalid', String(!ok));
      if (ok) field.removeAttribute('aria-describedby');
      else field.setAttribute('aria-describedby', rule.error);
      err.hidden = ok;
      return ok;
    };

    // Valida al salir del campo, y corrige en vivo solo si ya marcó error.
    rules.forEach(function (rule) {
      var field = form.elements[rule.name];
      field.addEventListener('blur', function () {
        if (field.value) validateField(rule);
      });
      field.addEventListener('input', function () {
        if (field.getAttribute('aria-invalid') === 'true') validateField(rule);
      });
    });

    var consent = form.elements.privacidad;
    var consentError = document.getElementById('e-privacidad');
    consent.addEventListener('change', function () {
      if (consent.checked) consentError.hidden = true;
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var results = rules.map(validateField);
      var consentOk = consent.checked;
      consentError.hidden = consentOk;
      var firstBad = rules.filter(function (_, i) {
        return !results[i];
      })[0];
      if (firstBad) {
        form.elements[firstBad.name].focus();
        return;
      }
      if (!consentOk) {
        consent.focus();
        return;
      }

      // Sin servidor: se abre el correo del visitante con el mensaje listo.
      // Para enviar desde la página, reemplazar por un fetch() al endpoint real.
      var data = new FormData(form);
      var subject = 'Contacto desde la web · ' + data.get('rol');
      var body =
        'Nombre: ' +
        data.get('nombre') +
        '\nCorreo: ' +
        data.get('correo') +
        '\nMe escribo como: ' +
        data.get('rol') +
        '\n\n' +
        data.get('mensaje');
      window.location.href =
        'mailto:' +
        CONTACT_EMAIL +
        '?subject=' +
        encodeURIComponent(subject) +
        '&body=' +
        encodeURIComponent(body);
      status.textContent =
        'Listo. Abrimos tu app de correo con el mensaje; solo falta que lo envíes.';
    });
  }

  /* ---------- Hoja "Ayuda ahora" ---------- */
  var help = $('[data-help]');
  var helpOpen = $('[data-help-open]');
  if (help && helpOpen) {
    if (typeof help.showModal !== 'function') {
      // Navegadores sin <dialog>: el botón lleva a la sección de ayuda.
      helpOpen.addEventListener('click', function () {
        location.hash = '#ayuda';
      });
    } else {
      helpOpen.addEventListener('click', function () {
        help.showModal();
      });
      $('[data-help-close]', help).addEventListener('click', function () {
        help.close();
      });
      help.addEventListener('click', function (e) {
        if (e.target === help) help.close();
      });
      help.addEventListener('close', function () {
        helpOpen.focus();
      });
    }
  }
})();
