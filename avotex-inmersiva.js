/*
 * AVOTEX — Experiencia inmersiva del agricultor (Vista normal y ScreenX).
 *
 * - El paisaje (Street View) ocupa toda la ventana y los módulos existentes
 *   (Resumen, Mi Huerta, Reportes Satelitales, Análisis IA) se muestran en paneles flotantes.
 * - ScreenX: tres ventanas del mismo navegador (izquierda, central, derecha) coordinadas con
 *   BroadcastChannel. La pantalla central es la referencia de la cámara.
 *
 * Qué se guarda y dónde:
 *  - sessionStorage (solo esta pestaña): identificador de ventana, modalidad, rol y huerta,
 *    para sobrevivir a una recarga. Nada sensible.
 *  - localStorage: solo la calibración de ScreenX (números).
 *  - BroadcastChannel: mensajes entre ventanas del mismo origen y del mismo usuario
 *    (huerta activa por id, rol, cámara). Nunca tokens ni datos de la base.
 *
 * Cada ventana carga sus propios datos con su propia sesión de Firebase; un mensaje de otra
 * ventana nunca trae datos: solo indica qué huerta (de las que esta sesión ya cargó) mostrar.
 */
(function (root) {
    'use strict';

    var SX = root.AvotexScreenX;
    var SV = root.AvotexStreetView;

    var MODULES = ['resumen', 'huerta', 'reportes', 'analisis'];
    var MODULE_TITLES = { resumen: 'Resumen', huerta: 'Mi Huerta', reportes: 'Reportes Satelitales', analisis: 'Análisis IA' };
    var SESSION_KEY = 'avotex_sx_window';
    var CALIBRATION_KEY = 'avotex_screenx_calibration';
    var MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

    var S = {
        user: null,
        mode: 'boot',              // boot | selector | wizard | normal | screenx | ended
        role: null,                // left | center | right (solo ScreenX)
        wizardStep: 1,
        windowId: null,
        bornAt: Date.now(),
        huertas: [],
        huertasStatus: 'loading',  // loading | ready | empty | error | unauthorized
        activeHuertaId: null,
        pendingHuertaId: null,     // huerta pedida por otra ventana antes de cargar las propias
        openModule: null,
        minimized: {},
        stage: null,
        stageToken: 0,
        stageResult: null,
        fallbackMap: null,
        fallbackLayer: null,
        sx: null,                  // estado de ScreenX (bus, registro, timers…)
        calibration: SX.sanitizeCalibration(readCalibration()),
        lastCenterCamera: null,
        pendingCameraMsg: null,
        detectedScreens: null
    };

    // ───────────────────────── utilidades ─────────────────────────

    function $(id) { return document.getElementById(id); }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function readSession() {
        try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null') || {}; } catch (e) { return {}; }
    }

    function saveSession() {
        try {
            sessionStorage.setItem(SESSION_KEY, JSON.stringify({
                windowId: S.windowId,
                mode: (S.mode === 'normal' || S.mode === 'screenx' || S.mode === 'wizard') ? S.mode : null,
                role: S.role,
                huertaId: S.activeHuertaId
            }));
        } catch (e) { /* almacenamiento no disponible: solo se pierde la reanudación tras recargar */ }
    }

    function readCalibration() {
        try { return JSON.parse(localStorage.getItem(CALIBRATION_KEY) || 'null'); } catch (e) { return null; }
    }

    function saveCalibration() {
        try { localStorage.setItem(CALIBRATION_KEY, JSON.stringify(S.calibration)); } catch (e) { /* nada */ }
    }

    function newWindowId() {
        if (root.crypto && typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
        var a = new Uint32Array(4);
        (root.crypto || root.msCrypto).getRandomValues(a);
        return Array.prototype.map.call(a, function (n) { return n.toString(16); }).join('-');
    }

    function activeHuerta() {
        for (var i = 0; i < S.huertas.length; i++) if (S.huertas[i].id === S.activeHuertaId) return S.huertas[i];
        return null;
    }

    function formatImageDate(ym) {
        var m = /^(\d{4})-(\d{2})/.exec(ym || '');
        if (!m) return null;
        return MONTHS[Number(m[2]) - 1] + ' ' + m[1];
    }

    function imageAgeYears(ym) {
        var m = /^(\d{4})-(\d{2})/.exec(ym || '');
        if (!m) return null;
        var d = new Date(Number(m[1]), Number(m[2]) - 1, 1);
        return (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
    }

    function formatDistance(m) {
        if (!isFinite(m)) return '';
        return m >= 1000 ? (m / 1000).toLocaleString('es-MX', { maximumFractionDigits: 1 }) + ' km' : Math.round(m) + ' m';
    }

    function toast(message, opts) {
        opts = opts || {};
        var host = $('hudToasts');
        if (!host) return;
        var el = document.createElement('div');
        el.className = 'hud-toast' + (opts.kind ? ' is-' + opts.kind : '');
        el.innerHTML = '<span>' + escapeHtml(message) + '</span>';
        if (opts.action) {
            var b = document.createElement('button');
            b.type = 'button';
            b.textContent = opts.action.label;
            b.addEventListener('click', function () { opts.action.run(); el.remove(); });
            el.appendChild(b);
        }
        host.appendChild(el);
        while (host.children.length > 3) host.firstElementChild.remove();
        setTimeout(function () { el.classList.add('is-leaving'); setTimeout(function () { el.remove(); }, 300); }, opts.duration || 5200);
    }

    // ───────────────────────── modalidades ─────────────────────────

    function setMode(mode) {
        S.mode = mode;
        document.body.dataset.mode = mode;
        document.body.dataset.role = (mode === 'screenx' || mode === 'wizard') && S.role ? S.role : '';
        $('bootScreen').hidden = mode !== 'boot';
        $('modeSelector').hidden = mode !== 'selector';
        $('sxWizard').hidden = mode !== 'wizard';
        $('sessionEnded').hidden = mode !== 'ended';
        $('hud').hidden = !(mode === 'normal' || mode === 'screenx');
        updateTitle();
        saveSession();
    }

    function updateTitle() {
        var base = 'Mi Huerta — AVOTEX';
        if (S.mode === 'screenx' && S.role) document.title = SX.ROLE_SCREEN_LABELS[S.role] + ' · ScreenX — AVOTEX';
        else if (S.mode === 'wizard') document.title = 'Configurar ScreenX — AVOTEX';
        else document.title = base;
    }

    function showSelector() {
        leaveScreenX({ silent: false });
        closeAllPanels();
        setMode('selector');
        var first = document.querySelector('[data-action="choose-screenx"]');
        if (first) first.focus({ preventScroll: true });
    }

    function enterNormal() {
        leaveScreenX({ silent: false });
        S.role = null;
        setMode('normal');
        configureStageForMode();
        refreshHud();
        showActiveHuerta();
    }

    function startWizard(step) {
        S.wizardStep = step || 1;
        setMode('wizard');
        joinScreenX();
        renderWizard();
    }

    function enterScreenX() {
        if (!S.role) { startWizard(2); return; }
        joinScreenX();
        setMode('screenx');
        configureStageForMode();
        refreshHud();
        showActiveHuerta();
        openDefaultPanelForRole();
        sendPresence();
    }

    function openDefaultPanelForRole() {
        closeAllPanels();
        if (S.role === 'left') openModule('huerta', { local: true });
        else if (S.role === 'right') openModule('resumen', { local: true });
    }

    // ───────────────────────── ScreenX: canal entre ventanas ─────────────────────────

    function channelName() {
        // Un canal por usuario: ventanas de otra cuenta en el mismo navegador nunca se mezclan.
        return 'avotex-screenx:' + (S.user ? S.user.uid : 'anon');
    }

    function joinScreenX() {
        if (S.sx) return S.sx;
        if (typeof root.BroadcastChannel !== 'function') {
            S.sx = { unsupported: true };
            return S.sx;
        }
        var transport = new root.BroadcastChannel(channelName());
        var sx = {
            transport: transport,
            bus: SX.createBus(transport, S.windowId),
            registry: SX.createPeerRegistry(S.windowId, { staleMs: SX.PEER_STALE_MS }),
            store: SX.createStateStore(S.windowId, { huertaId: S.activeHuertaId, calibration: S.calibration }),
            joinedAt: Date.now(),
            synced: false,
            timers: []
        };
        S.sx = sx;
        sx.off = sx.bus.on(onBusMessage);
        sx.timers.push(setInterval(sendPresence, SX.PRESENCE_INTERVAL_MS));
        sx.timers.push(setInterval(pruneSx, 1000));
        sx.bus.send('state-request', null);
        sendPresence();
        // Si nadie responde en unos segundos, esta ventana es la primera: ya está "sincronizada".
        sx.timers.push(setTimeout(function () {
            if (S.sx !== sx) return;
            sx.synced = true;
            maybeSeedSharedState();
            refreshSxStatus();
        }, 2500));
        return sx;
    }

    /*
     * Si ninguna ventana ha fijado todavía la huerta compartida, la propone la ventana que
     * entró primero a ScreenX (normalmente donde la persona ya estaba trabajando), para que
     * una ventana recién abierta no imponga su huerta por defecto.
     */
    function maybeSeedSharedState() {
        var sx = S.sx;
        if (!sx || sx.unsupported || !sx.synced || sx.store.version() > 0) return;
        if (!S.activeHuertaId || S.huertasStatus !== 'ready') return;
        var older = liveScreenxPeers().some(function (p) {
            return typeof p.joinedAt === 'number' && (p.joinedAt < sx.joinedAt || (p.joinedAt === sx.joinedAt && p.id < S.windowId));
        });
        if (older) return;
        proposeSharedState({ huertaId: S.activeHuertaId, calibration: S.calibration });
    }

    function leaveScreenX(opts) {
        var sx = S.sx;
        if (!sx) return;
        if (!sx.unsupported) {
            if (!(opts && opts.silent)) { try { sx.bus.send('bye', { role: S.role }); } catch (e) { /* nada */ } }
            sx.timers.forEach(function (t) { clearInterval(t); clearTimeout(t); });
            if (sx.off) sx.off();
            sx.bus.close();
        }
        S.sx = null;
        S.lastCenterCamera = null;
        S.pendingCameraMsg = null;
        $('sxBanner').hidden = true;
    }

    function sendPresence() {
        var sx = S.sx;
        if (!sx || sx.unsupported) return;
        sx.bus.send('presence', {
            role: S.role,
            mode: S.mode,
            huertaId: S.activeHuertaId,
            stateVersion: sx.store.version(),
            bornAt: S.bornAt,
            joinedAt: sx.joinedAt
        });
    }

    function liveScreenxPeers() {
        var sx = S.sx;
        if (!sx || sx.unsupported) return [];
        return sx.registry.live(Date.now()).filter(function (p) { return p.mode === 'screenx' || p.mode === 'wizard'; });
    }

    function sxSummary() {
        var sx = S.sx;
        if (!sx || sx.unsupported) return null;
        return sx.registry.summary(S.role, Date.now());
    }

    function connectedRoles() {
        var sum = sxSummary();
        if (!sum) return [];
        return SX.ROLES.filter(function (r) { return sum.status[r].state === 'peer'; });
    }

    function centerHolders() {
        var sx = S.sx;
        if (!sx || sx.unsupported) return [];
        var ids = sx.registry.holdersOf('center', Date.now()).map(function (p) { return p.id; });
        if (S.role === 'center') ids.unshift(S.windowId);
        return ids;
    }

    function onBusMessage(msg) {
        var sx = S.sx;
        if (!sx) return;
        var now = Date.now();

        if (msg.type === '__collision') { handleIdCollision(msg.payload); return; }

        switch (msg.type) {
            case 'presence': {
                var p = msg.payload || {};
                var role = SX.ROLES.indexOf(p.role) !== -1 ? p.role : null;
                var upd = sx.registry.update(msg.from, { role: role, mode: p.mode, huertaId: p.huertaId, bornAt: p.bornAt, joinedAt: p.joinedAt }, now);
                if (!sx.synced && (!p.stateVersion || sx.store.version() >= p.stateVersion)) sx.synced = true;
                if (upd && upd.isNew && sx.store.version() > 0) sx.bus.send('state', sx.store.snapshot());
                if (upd && (upd.isNew || upd.roleChanged)) {
                    if (upd.isNew && S.mode === 'screenx' && role) toast(SX.ROLE_SCREEN_LABELS[role] + ' conectada.', { kind: 'ok', duration: 2600 });
                    if (S.role === 'center' && role && role !== 'center' && S.stage) {
                        // Una pantalla lateral nueva necesita la cámara actual aunque nadie la mueva.
                        var cam = S.stage.getCamera();
                        if (cam) sendCamera(cam);
                    }
                }
                // Una cámara que llegó antes de conocer a su emisor se aplica ahora, si es la central.
                if (S.pendingCameraMsg && S.pendingCameraMsg.from === msg.from) {
                    var pending = S.pendingCameraMsg;
                    S.pendingCameraMsg = null;
                    onBusMessage(pending);
                }
                refreshSxStatus();
                break;
            }
            case 'bye': {
                var gone = sx.registry.remove(msg.from);
                sx.bus.forget(msg.from);
                if (gone && gone.role && S.mode === 'screenx') toast(SX.ROLE_SCREEN_LABELS[gone.role] + ' se cerró o cambió de modalidad.', { kind: 'warn' });
                refreshSxStatus();
                break;
            }
            case 'state-request':
                if (sx.store.version() > 0) sx.bus.send('state', sx.store.snapshot());
                // Una ventana que se acaba de abrir o recargar necesita la cámara actual.
                if (S.role === 'center' && S.stage && S.stage.getCamera()) sendCamera(S.stage.getCamera());
                break;
            case 'state':
                sx.synced = true;
                if (sx.store.receive(msg.payload)) applySharedState(sx.store.get());
                refreshSxStatus();
                break;
            case 'camera':
                if (S.mode !== 'screenx') break;
                if (!sx.registry.get(msg.from)) { S.pendingCameraMsg = msg; break; } // aún no se sabe quién es
                if (!SX.shouldApplyCamera(msg, { selfRole: S.role, centerHolders: centerHolders(), huertaId: S.activeHuertaId })) break;
                S.lastCenterCamera = msg.payload;
                applyCenterCamera();
                break;
            case 'start':
                if (S.mode === 'wizard' && S.role && !roleIsDuplicated()) enterScreenX();
                break;
            case 'open-module': {
                var pm = msg.payload || {};
                if (S.mode === 'screenx' && pm.targetRole === S.role && MODULES.indexOf(pm.module) !== -1) openModule(pm.module, { local: true });
                break;
            }
            case 'logout':
                // Firebase también cerrará la sesión aquí; no se muestran más datos.
                S.mode = 'ended';
                root.location.replace('dashboard.html');
                break;
        }
    }

    /* Una pestaña duplicada copia sessionStorage y con él el identificador de ventana. */
    function handleIdCollision(otherMsg) {
        var otherBorn = otherMsg && otherMsg.payload && otherMsg.payload.bornAt;
        if (otherBorn && otherBorn > S.bornAt) return; // la otra es la copia; ella cambiará
        leaveScreenX({ silent: true });
        S.windowId = newWindowId();
        S.role = null;
        saveSession();
        if (S.mode === 'screenx' || S.mode === 'wizard') {
            startWizard(2);
            toast('Esta ventana era una copia de otra. Asígnale su propio rol.', { kind: 'warn', duration: 7000 });
        }
    }

    function pruneSx() {
        var sx = S.sx;
        if (!sx || sx.unsupported) return;
        var removed = sx.registry.prune(Date.now());
        removed.forEach(function (p) {
            sx.bus.forget(p.id);
            if (p.role && S.mode === 'screenx') {
                toast('Se perdió la conexión con la ' + SX.ROLE_SCREEN_LABELS[p.role].toLowerCase() + '. Las demás pantallas siguen funcionando.', { kind: 'warn', duration: 7000 });
            }
        });
        refreshSxStatus();
    }

    function roleIsDuplicated() {
        var sum = sxSummary();
        return !!(sum && S.role && sum.status[S.role].state === 'duplicate');
    }

    function proposeSharedState(patch) {
        var sx = S.sx;
        if (!sx || sx.unsupported) return;
        var snap = sx.store.propose(patch);
        sx.bus.send('state', snap);
    }

    function applySharedState(data) {
        if (data.calibration) {
            S.calibration = SX.sanitizeCalibration(data.calibration);
            saveCalibration();
            renderCalibration();
            applyCenterCamera();
        }
        if (data.huertaId && data.huertaId !== S.activeHuertaId) {
            if (S.huertasStatus !== 'ready') { S.pendingHuertaId = data.huertaId; return; }
            if (!findHuerta(data.huertaId)) {
                toast('Otra ventana seleccionó una huerta que no está disponible en esta sesión. Se conserva la actual.', { kind: 'warn', duration: 7000 });
                return;
            }
            setActiveHuerta(data.huertaId, { propagate: false });
        }
    }

    function sendCamera(cam) {
        var sx = S.sx;
        if (!sx || sx.unsupported || S.mode !== 'screenx' || S.role !== 'center') return;
        if (roleIsDuplicated()) return; // con dos centrales nadie es la referencia
        sx.bus.send('camera', {
            pano: cam.pano,
            heading: cam.heading,
            pitch: cam.pitch,
            zoom: cam.zoom,
            huertaId: S.activeHuertaId
        });
    }

    function applyCenterCamera() {
        if (S.mode !== 'screenx' || !S.role || S.role === 'center' || !S.stage || !S.lastCenterCamera) return;
        if (!S.stageResult || S.stageResult.status !== 'OK') return;
        var cam = SX.cameraForRole(S.lastCenterCamera, S.role, S.calibration);
        cam.pano = S.lastCenterCamera.pano || S.stageResult.pano;
        S.stage.applyCamera(cam);
    }

    // ───────────────────────── estado visible de ScreenX ─────────────────────────

    function refreshSxStatus() {
        if (S.mode === 'wizard') renderWizard();
        if (S.mode !== 'screenx') return;
        var chip = $('sxStatusChip');
        var banner = $('sxBanner');
        var sx = S.sx;
        if (!sx) return;
        if (sx.unsupported) {
            chip.hidden = false;
            chip.className = 'hud-chip is-error';
            chip.textContent = 'Sin sincronización';
            banner.hidden = false;
            banner.innerHTML = 'Este navegador no permite comunicar ventanas (BroadcastChannel). Usa Chrome, Edge, Firefox o Safari recientes, o cambia a Vista normal.';
            return;
        }
        var sum = sxSummary();
        chip.hidden = false;
        var missingTxt = sum.missing.map(function (r) { return SX.ROLE_LABELS[r]; }).join(', ');
        if (!sx.synced) {
            chip.className = 'hud-chip is-pending';
            chip.textContent = 'Sincronizando…';
        } else if (sum.duplicates.length) {
            chip.className = 'hud-chip is-error';
            chip.textContent = 'Rol duplicado';
        } else if (sum.complete) {
            chip.className = 'hud-chip is-ok';
            chip.textContent = 'ScreenX · 3 de 3 pantallas';
        } else {
            chip.className = 'hud-chip is-warn';
            chip.textContent = 'Modo parcial · falta ' + missingTxt.toLowerCase();
        }

        var messages = [];
        if (sum.duplicates.length) {
            messages.push('Hay dos ventanas con el rol <strong>' + sum.duplicates.map(function (r) { return SX.ROLE_LABELS[r]; }).join(', ') +
                '</strong>. Corrige la asignación para que la panorámica se sincronice. <button type="button" data-action="change-role">Cambiar el rol de esta ventana</button>');
        }
        if (S.role !== 'center' && sum.status.center.state === 'missing') {
            messages.push('La pantalla central no está conectada: esta vista no se sincroniza hasta que vuelva.');
        }
        banner.hidden = messages.length === 0;
        banner.innerHTML = messages.join('<br>');
        updateDockDestinations();
    }

    // ───────────────────────── asistente de ScreenX ─────────────────────────

    function renderWizard() {
        var body = $('sxWizardBody');
        if (!body) return;
        Array.prototype.forEach.call(document.querySelectorAll('#wizardSteps li'), function (li) {
            var n = Number(li.dataset.step);
            li.classList.toggle('is-current', n === S.wizardStep);
            li.classList.toggle('is-done', n < S.wizardStep);
            if (n === S.wizardStep) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
        });

        if (S.sx && S.sx.unsupported) {
            body.innerHTML = '<div class="wizard-alert is-error">Este navegador no permite comunicar ventanas entre sí (BroadcastChannel), así que ScreenX no puede sincronizarse aquí. ' +
                'Usa una versión reciente de Chrome, Edge, Firefox o Safari.</div>' +
                '<div class="wizard-actions"><button type="button" class="mode-btn mode-btn-secondary" data-action="choose-normal">Usar Vista normal</button></div>';
            return;
        }

        var html = S.wizardStep === 1 ? wizardStep1() : (S.wizardStep === 2 ? wizardStep2() : wizardStep3());
        // El asistente se refresca con cada latido de las otras ventanas: solo se redibuja si
        // cambió algo, y se devuelve el foco al mismo botón para no estorbar con el teclado.
        if (body.__html === html) return;
        var active = document.activeElement;
        var focusKey = active && body.contains(active) ? (active.dataset.action || '') + '|' + (active.dataset.role || '') : null;
        body.__html = html;
        body.innerHTML = html;
        if (focusKey) {
            var parts = focusKey.split('|');
            var sel = '[data-action="' + parts[0] + '"]' + (parts[1] ? '[data-role="' + parts[1] + '"]' : '');
            var again = body.querySelector(sel);
            if (again && !again.disabled) again.focus({ preventScroll: true });
        }
    }

    var PREP_ICONS = {
        plug: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></svg>',
        extend: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="1.5" y="6" width="6" height="9" rx="1"/><rect x="9" y="6" width="6" height="9" rx="1"/><rect x="16.5" y="6" width="6" height="9" rx="1"/><path d="M4.5 18.5h15"/></svg>',
        windows: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="7" y="3" width="14" height="11" rx="2"/><path d="M17 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2"/></svg>',
        role: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>'
    };

    function wizardStep1() {
        var open = Math.min(3, 1 + liveScreenxPeers().length);
        var meter = [0, 1, 2].map(function (i) {
            return '<span class="win-slot' + (i < open ? ' is-on' : '') + '"><i></i></span>';
        }).join('');
        var openTxt = open === 1
            ? 'Solo esta ventana. Abre dos más.'
            : (open === 2 ? '2 de 3 ventanas abiertas. Falta una.' : 'Las 3 ventanas están abiertas.');

        var detect;
        if ('getScreenDetails' in root) {
            detect = '<button type="button" class="link-btn" data-action="detect-screens">Consultar pantallas conectadas</button>' +
                '<p class="wizard-hint" id="wizardDetectOut">' + (S.detectedScreens ? escapeHtml(S.detectedScreens) : 'Opcional. El navegador puede decir cuántas pantallas ve, pero no cuál está a la izquierda o a la derecha.') + '</p>';
        } else {
            detect = '<p class="wizard-hint">Este navegador no informa cuántas pantallas hay. No hace falta: la asignación es manual.</p>';
        }
        if (root.screen && typeof root.screen.isExtended === 'boolean') {
            detect += '<p class="sys-pill ' + (root.screen.isExtended ? 'is-ok' : 'is-warn') + '">' +
                (root.screen.isExtended ? 'Windows indica pantallas extendidas' : 'Windows indica una sola pantalla activa') + '</p>';
        }

        var steps = [
            ['plug', 'Conecta los monitores al equipo.', 'Tres monitores, cada uno con su propia salida de video.'],
            ['extend', 'En la configuración de Windows, selecciona la opción de extender las pantallas.', 'Tecla <kbd>Windows</kbd> + <kbd>P</kbd> → “Extender”.'],
            ['windows', 'Abre la aplicación web en una ventana para cada monitor.', 'Arrastra cada ventana a su monitor y pulsa <kbd>F11</kbd>. Usa el mismo navegador en las tres.'],
            ['role', 'Regresa a la aplicación para asignar el rol de cada ventana.', 'En el siguiente paso eliges Izquierda, Central o Derecha.']
        ].map(function (st, i) {
            return '<li class="prep-step"><span class="prep-icon">' + PREP_ICONS[st[0]] + '<b>' + (i + 1) + '</b></span>' +
                '<span class="prep-text"><strong>' + st[1] + '</strong><span>' + st[2] + '</span></span></li>';
        }).join('');

        return '' +
            '<div class="wizard-grid">' +
            '<section class="wizard-card">' +
            '<h2>Preparación</h2>' +
            '<p class="wizard-lead">Para la experiencia completa necesitas <strong>tres pantallas independientes</strong>.</p>' +
            '<ol class="prep-steps">' + steps + '</ol>' +
            '</section>' +
            '<aside class="wizard-side">' +
            '<section class="side-card">' +
            '<h3>Ventanas de ScreenX</h3>' +
            '<div class="win-meter" aria-hidden="true">' + meter + '</div>' +
            '<p class="win-count" role="status">' + openTxt + '</p>' +
            '<button type="button" class="mode-btn mode-btn-primary mode-btn-block" data-action="open-window"' + (open >= 3 ? ' disabled' : '') + '>' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>' +
            'Abrir otra ventana</button>' +
            '<p class="wizard-hint">Cuenta solo las ventanas abiertas en este navegador, no los monitores.</p>' +
            '</section>' +
            '<section class="side-card is-subtle">' + detect + '</section>' +
            '</aside>' +
            '</div>' +
            '<div class="wizard-actions">' +
            '<button type="button" class="mode-btn mode-btn-ghost" data-action="back-to-selector">Atrás</button>' +
            '<button type="button" class="mode-btn mode-btn-primary" data-action="wizard-next">Continuar</button>' +
            '</div>';
    }

    function roleCardState(role, sum) {
        var st = sum ? sum.status[role].state : 'missing';
        if (st === 'self') return { cls: 'is-self', txt: 'Esta ventana' };
        if (st === 'peer') return { cls: 'is-taken', txt: 'Asignada a otra ventana' };
        if (st === 'duplicate') return { cls: 'is-duplicate', txt: 'Rol duplicado' };
        return { cls: '', txt: 'Disponible' };
    }

    function wizardStep2() {
        var sum = sxSummary();
        var cards = SX.ROLES.map(function (role) {
            var st = roleCardState(role, sum);
            return '<button type="button" class="role-card ' + st.cls + '" data-action="claim-role" data-role="' + role + '" aria-pressed="' + (S.role === role) + '">' +
                '<span class="role-art role-art-' + role + '" aria-hidden="true"><i></i><i></i><i></i></span>' +
                '<span class="role-name">' + SX.ROLE_LABELS[role] + '</span>' +
                '<span class="role-state">' + st.txt + '</span>' +
                '</button>';
        }).join('');
        var confirm = '';
        if (S.role) {
            if (sum && sum.status[S.role].state === 'duplicate') {
                confirm = '<div class="wizard-alert is-error" role="alert">Otra ventana también es la <strong>' + SX.ROLE_SCREEN_LABELS[S.role].toLowerCase() + '</strong>. Elige otro rol aquí o cambia el de la otra ventana.</div>';
            } else {
                confirm = '<div class="wizard-alert is-ok" role="status">✓ Esta ventana es la <strong>' + SX.ROLE_SCREEN_LABELS[S.role].toLowerCase() + '</strong>.</div>';
            }
        }
        return '' +
            '<div class="wizard-card">' +
            '<h2>¿En qué monitor está esta ventana?</h2>' +
            '<p class="wizard-lead">Elige el rol según el monitor físico donde estás viendo <strong>esta</strong> ventana. Repite el paso en las otras dos.</p>' +
            '<div class="role-cards">' + cards + '</div>' +
            '<div id="wizardRoleMsg">' + confirm + '</div>' +
            '</div>' +
            '<div class="wizard-actions">' +
            '<button type="button" class="mode-btn mode-btn-secondary" data-action="wizard-back">Atrás</button>' +
            '<button type="button" class="mode-btn mode-btn-primary" data-action="wizard-next"' + (S.role ? '' : ' disabled') + '>Continuar</button>' +
            '</div>';
    }

    function wizardStep3() {
        var sum = sxSummary();
        var synced = S.sx && S.sx.synced;
        var rows = SX.ROLES.map(function (role) {
            var st = sum ? sum.status[role].state : 'missing';
            var label = { self: 'Esta ventana', peer: 'Otra ventana conectada', duplicate: 'Dos ventanas con este rol', missing: 'Sin asignar' }[st];
            return '<li class="check-row is-' + st + '"><span class="check-dot" aria-hidden="true"></span><span class="check-role">' + SX.ROLE_SCREEN_LABELS[role] + '</span><span class="check-state">' + label + '</span></li>';
        }).join('');
        var msg, enterLabel = 'Entrar a ScreenX', enterDisabled = false;
        if (!S.role) {
            msg = '<div class="wizard-alert is-error">Esta ventana todavía no tiene un rol. Regresa al paso anterior.</div>';
            enterDisabled = true;
        } else if (sum && sum.duplicates.length) {
            msg = '<div class="wizard-alert is-error" role="alert">Hay roles repetidos: <strong>' + sum.duplicates.map(function (r) { return SX.ROLE_LABELS[r]; }).join(', ') + '</strong>. Cambia el rol en una de esas ventanas.</div>';
            enterDisabled = true;
        } else if (!synced) {
            msg = '<div class="wizard-alert">Buscando otras ventanas de ScreenX…</div>';
        } else if (sum && sum.complete) {
            msg = '<div class="wizard-alert is-ok" role="status">✓ Las tres pantallas están asignadas y conectadas.</div>';
        } else {
            msg = '<div class="wizard-alert is-warn">Falta: <strong>' + sum.missing.map(function (r) { return SX.ROLE_LABELS[r]; }).join(', ') +
                '</strong>. Puedes continuar en modo parcial con las pantallas disponibles; la panorámica no estará completa.</div>';
            enterLabel = 'Continuar en modo parcial';
        }
        return '' +
            '<div class="wizard-card">' +
            '<h2>Validación</h2>' +
            '<p class="wizard-lead">Estado de las ventanas abiertas en este navegador. Se actualiza solo.</p>' +
            '<ul class="check-list">' + rows + '</ul>' + msg +
            '<p class="wizard-hint">AVOTEX solo puede ver las ventanas abiertas en este navegador; no comprueba cuántos monitores físicos hay.</p>' +
            '</div>' +
            '<div class="wizard-actions">' +
            '<button type="button" class="mode-btn mode-btn-secondary" data-action="wizard-back">Cambiar mi rol</button>' +
            '<button type="button" class="mode-btn mode-btn-ghost" data-action="choose-normal">Usar Vista normal</button>' +
            '<button type="button" class="mode-btn mode-btn-primary" data-action="sx-enter"' + (enterDisabled ? ' disabled' : '') + '>' + enterLabel + '</button>' +
            '</div>';
    }

    function claimRole(role) {
        if (SX.ROLES.indexOf(role) === -1) return;
        var sx = S.sx;
        var holders = sx && !sx.unsupported ? sx.registry.holdersOf(role, Date.now()) : [];
        if (holders.length && S.role !== role) {
            renderWizard();
            var box = $('wizardRoleMsg');
        if (box) $('sxWizardBody').__html = null;
            if (box) box.innerHTML = '<div class="wizard-alert is-error" role="alert">La <strong>' + SX.ROLE_SCREEN_LABELS[role].toLowerCase() +
                '</strong> ya está asignada a otra ventana. Elige otro rol o cambia el rol en esa ventana.</div>';
            return;
        }
        S.role = role;
        document.body.dataset.role = role;
        saveSession();
        sendPresence();
        renderWizard();
    }

    async function detectScreens() {
        var out;
        try {
            var details = await root.getScreenDetails();
            var n = details.screens.length;
            out = 'El navegador informa ' + n + (n === 1 ? ' pantalla' : ' pantallas') + '. Es información orientativa: la asignación de cada ventana sigue siendo manual.';
        } catch (e) {
            out = 'No se concedió el permiso para consultar las pantallas. Puedes continuar con la asignación manual.';
        }
        S.detectedScreens = out;
        var el = $('wizardDetectOut');
        if (el) el.textContent = out;
    }

    function openExtraWindow() {
        // Sin opener: la ventana nueva no copia sessionStorage (su rol empieza vacío).
        // Se abre solo por clic del usuario; el navegador decide en qué monitor aparece.
        var url = root.location.pathname + '#screenx';
        root.open(url, '_blank', 'popup=yes,noopener=yes,noreferrer=yes,width=1280,height=800');
        toast('Si no se abrió una ventana nueva, permite las ventanas emergentes o abre otra ventana del navegador en ' + root.location.host + root.location.pathname + '.', { duration: 8000 });
    }

    // ───────────────────────── huertas ─────────────────────────

    function findHuerta(id) {
        for (var i = 0; i < S.huertas.length; i++) if (S.huertas[i].id === id) return S.huertas[i];
        return null;
    }

    function onHuertas(detail) {
        S.huertasStatus = detail.status;
        S.huertas = (detail.rows || []).filter(function (h) { return h && h.id; });
        renderHuertaSelect();
        if (S.huertasStatus !== 'ready') {
            S.activeHuertaId = null;
            showActiveHuerta();
            return;
        }
        var saved = readSession().huertaId;
        var candidate = S.pendingHuertaId || (S.sx && !S.sx.unsupported && S.sx.store.get().huertaId) || S.activeHuertaId || saved;
        S.pendingHuertaId = null;
        if (!findHuerta(candidate)) candidate = S.huertas[0].id;
        setActiveHuerta(candidate, { propagate: false, force: true });
        maybeSeedSharedState();
    }

    function renderHuertaSelect() {
        var sel = $('huertaSelect');
        if (!sel) return;
        if (S.huertasStatus === 'loading') {
            sel.innerHTML = '<option>Cargando huertas…</option>';
            sel.disabled = true;
            return;
        }
        if (S.huertasStatus !== 'ready') {
            var txt = { empty: 'Sin huertas registradas', unauthorized: 'Sin autorización', error: 'Error al cargar' }[S.huertasStatus] || 'Sin huertas';
            sel.innerHTML = '<option>' + txt + '</option>';
            sel.disabled = true;
            return;
        }
        sel.innerHTML = S.huertas.map(function (h) {
            var name = (h.nombre || '').trim() || ('Huerta ' + String(h.id).slice(0, 8));
            return '<option value="' + escapeHtml(h.id) + '">' + escapeHtml(name) + '</option>';
        }).join('');
        sel.disabled = false;
        if (S.activeHuertaId) sel.value = S.activeHuertaId;
    }

    function setActiveHuerta(id, opts) {
        opts = opts || {};
        var huerta = findHuerta(id); // solo huertas cargadas con la sesión de esta ventana
        if (!huerta) return;
        var changed = S.activeHuertaId !== id;
        S.activeHuertaId = id;
        var sel = $('huertaSelect');
        if (sel && sel.value !== id) sel.value = id;
        saveSession();
        markActiveHuertaCard(id);
        if (changed || opts.force) {
            S.lastCenterCamera = null;
            showActiveHuerta();
        }
        if (opts.propagate && S.sx && !S.sx.unsupported) proposeSharedState({ huertaId: id });
        sendPresence();
    }

    /* En "Mi Huerta" la huerta activa se resalta y pasa al principio; las demás siguen ahí. */
    function markActiveHuertaCard(id) {
        var list = $('huertaList');
        if (!list) return;
        var target = null;
        Array.prototype.forEach.call(list.querySelectorAll('.huerta-card'), function (card) {
            var on = card.dataset.huertaId === id;
            card.classList.toggle('is-active', on);
            if (on) target = card;
        });
        if (target && list.firstElementChild !== target) {
            list.insertBefore(target, list.firstElementChild);
            if (typeof root.refreshHuertaMaps === 'function') root.refreshHuertaMaps();
        }
    }

    // ───────────────────────── paisaje (Street View) ─────────────────────────

    function ensureStage() {
        if (S.stage) return S.stage;
        S.stage = SV.createStage($('svPano'), {
            // Las pantallas laterales nacen sin interacción: su cámara la decide la central.
            interactive: !(S.mode === 'screenx' && S.role !== 'center'),
            onCamera: function (cam) {
                if (S.mode === 'screenx' && S.role === 'center') sendCamera(cam);
            },
            onStatus: function (status) {
                if (status && status !== 'OK') {
                    setStageStatus('error', 'Google no pudo mostrar este panorama (' + status + ').');
                }
            }
        });
        SV.onAuthFailure(function (err) {
            $('svPano').hidden = true;
            showFallbackMap(activeHuerta());
            setStageStatus('error', SV.errorMessage(err.code));
        });
        return S.stage;
    }

    function configureStageForMode() {
        var follower = S.mode === 'screenx' && S.role !== 'center';
        $('svShield').hidden = !follower;
        if (S.stage) S.stage.setInteractive(!follower);
    }

    function setStageStatus(kind, message, action) {
        var el = $('svStatus');
        if (!kind) { el.hidden = true; el.innerHTML = ''; return; }
        el.hidden = false;
        el.className = 'sx-stage-status is-' + kind;
        var icon = kind === 'loading' ? '<span class="sx-spinner" aria-hidden="true"></span>' : '';
        el.innerHTML = icon + '<span>' + escapeHtml(message) + '</span>' +
            (action ? '<button type="button" data-action="' + action.action + '">' + escapeHtml(action.label) + '</button>' : '');
    }

    async function showActiveHuerta() {
        if (!(S.mode === 'normal' || S.mode === 'screenx')) return;
        var token = ++S.stageToken;
        var huerta = activeHuerta();
        renderLocation(null);

        if (!huerta) {
            $('svPano').hidden = true;
            hideFallbackMap();
            var msg = {
                loading: 'Cargando tus huertas…',
                empty: 'Tu cuenta todavía no tiene huertas delimitadas. Cuando el equipo AVOTEX registre una, aparecerá aquí. Tus módulos siguen disponibles.',
                unauthorized: 'No tienes autorización para consultar tus huertas. Vuelve a iniciar sesión.',
                error: 'No se pudieron cargar tus huertas. Revisa tu conexión e intenta de nuevo.'
            }[S.huertasStatus] || 'Selecciona una huerta.';
            setStageStatus(S.huertasStatus === 'loading' ? 'loading' : (S.huertasStatus === 'empty' ? 'info' : 'error'), msg,
                S.huertasStatus === 'error' ? { action: 'reload-page', label: 'Reintentar' } : null);
            return;
        }

        var name = (huerta.nombre || 'tu huerta').trim();
        setStageStatus('loading', 'Buscando imágenes de Street View cerca de “' + name + '”…');
        ensureStage();
        try {
            var result = await SV.resolveHuerta(huerta);
            if (token !== S.stageToken) return; // el usuario ya eligió otra huerta
            S.stageResult = result;

            if (result.status === 'NO_LOCATION') {
                S.stage.hide();
                $('svPano').hidden = true;
                hideFallbackMap();
                setStageStatus('warn', '“' + name + '” no tiene una ubicación válida registrada, así que no podemos mostrar su paisaje. Puedes seguir usando los módulos; pide al equipo AVOTEX que delimite la huerta.');
                renderLocation({ huerta: huerta, result: result });
                return;
            }
            if (result.status === 'ZERO_RESULTS') {
                S.stage.hide();
                $('svPano').hidden = true;
                showFallbackMap(huerta);
                setStageStatus('info', 'Google no tiene imágenes de Street View a menos de 1 km de “' + name + '”. Te mostramos la vista satelital de la huerta.');
                renderLocation({ huerta: huerta, result: result });
                return;
            }

            var base = { heading: result.placement ? result.placement.headingToHuerta : 0, pitch: 0, zoom: 1 };
            var camera = base;
            if (S.mode === 'screenx' && S.role && S.role !== 'center') {
                var ref = (S.lastCenterCamera && S.lastCenterCamera.huertaId === huerta.id) ? S.lastCenterCamera : base;
                camera = SX.cameraForRole(ref, S.role, S.calibration);
            }
            hideFallbackMap();
            $('svPano').hidden = false;
            await S.stage.show(result.pano, camera);
            if (token !== S.stageToken) return;
            setStageStatus(null);
            renderLocation({ huerta: huerta, result: result });
            if (S.mode === 'screenx' && S.role !== 'center') applyCenterCamera();
        } catch (err) {
            if (token !== S.stageToken) return;
            console.warn('AVOTEX Street View:', err && (err.code || err.message), err && err.detail);
            $('svPano').hidden = true;
            showFallbackMap(huerta);
            var retry = err && (err.code === 'SEARCH_FAILED') ? { action: 'retry-stage', label: 'Reintentar' } :
                (err && (err.code === 'TIMEOUT' || err.code === 'LOAD_FAILED') ? { action: 'reload-page', label: 'Recargar' } : null);
            setStageStatus('error', SV.errorMessage(err && err.code), retry);
        }
    }

    function renderLocation(info) {
        var el = $('hudLocation');
        // En ScreenX solo la pantalla central muestra la ficha, para no cortar la panorámica.
        if (!info || !info.huerta || (S.mode === 'screenx' && S.role !== 'center')) { el.hidden = true; el.innerHTML = ''; return; }
        var h = info.huerta, r = info.result || {};
        var name = escapeHtml((h.nombre || 'Huerta').trim());
        var lines = [];
        if (r.status === 'OK') {
            var pl = r.placement || {};
            if (pl.insidePolygon) lines.push('Vista desde dentro de la huerta');
            else lines.push('Vista desde el punto más cercano con imágenes · a ' + formatDistance(pl.distanceM) + ' del centro de la huerta');
            var date = formatImageDate(r.imageDate);
            if (date) {
                var age = imageAgeYears(r.imageDate);
                lines.push('Imagen de ' + date + (age != null && age > 4 ? ' · <span class="loc-old">imagen antigua: la huerta pudo cambiar</span>' : ''));
            }
            if (r.copyright && !/google/i.test(r.copyright)) lines.push('Foto 360° de un usuario (' + escapeHtml(r.copyright) + ')');
        } else if (r.status === 'ZERO_RESULTS') {
            lines.push('Sin Street View cercano · vista satelital');
        } else if (r.status === 'NO_LOCATION') {
            lines.push('Sin ubicación registrada');
        }
        el.innerHTML = '<strong>' + name + '</strong>' + lines.map(function (l) { return '<span>' + l + '</span>'; }).join('');
        el.hidden = false;
    }

    /* Alternativa cuando no hay Street View: imagen satelital (Esri) con el contorno de la huerta. */
    function showFallbackMap(huerta) {
        var el = $('svFallbackMap');
        var target = huerta ? SX.huertaTarget(huerta) : null;
        if (!target || typeof root.L === 'undefined') { hideFallbackMap(); return; }
        el.hidden = false;
        if (!S.fallbackMap) {
            S.fallbackMap = root.L.map(el, { zoomControl: true, attributionControl: true, maxZoom: 17 });
            S.fallbackMap.zoomControl.setPosition('bottomright');
            root.L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
                maxZoom: 17, attribution: 'Imágenes &copy; Esri'
            }).addTo(S.fallbackMap);
        }
        if (S.fallbackLayer) { S.fallbackMap.removeLayer(S.fallbackLayer); S.fallbackLayer = null; }
        S.fallbackMap.invalidateSize();
        if (target.vertices && target.vertices.length >= 3) {
            S.fallbackLayer = root.L.polygon(target.vertices, { color: '#ffffff', weight: 3, fillColor: '#34d399', fillOpacity: 0.22 }).addTo(S.fallbackMap);
            S.fallbackMap.fitBounds(S.fallbackLayer.getBounds(), { padding: [80, 80], maxZoom: 17 });
        } else {
            S.fallbackLayer = root.L.circleMarker([target.lat, target.lng], { radius: 9, color: '#ffffff', weight: 3, fillColor: '#34d399', fillOpacity: 0.7 }).addTo(S.fallbackMap);
            S.fallbackMap.setView([target.lat, target.lng], 16);
        }
        setTimeout(function () { if (S.fallbackMap) S.fallbackMap.invalidateSize(); }, 120);
    }

    function hideFallbackMap() { $('svFallbackMap').hidden = true; }

    // ───────────────────────── paneles flotantes ─────────────────────────

    function panelEl(name) { return document.querySelector('.fpanel[data-module="' + name + '"]'); }

    function openModule(name, opts) {
        opts = opts || {};
        if (MODULES.indexOf(name) === -1) return;
        if (S.mode === 'screenx' && !opts.local && S.sx && !S.sx.unsupported) {
            var target = SX.moduleTargetRole(name, S.role, connectedRoles());
            if (target !== S.role) {
                S.sx.bus.send('open-module', { module: name, targetRole: target });
                toast('“' + MODULE_TITLES[name] + '” se abrió en la ' + SX.ROLE_SCREEN_LABELS[target].toLowerCase() + '.', {
                    action: { label: 'Abrir aquí', run: function () { openModule(name, { local: true }); } }
                });
                return;
            }
        }
        MODULES.forEach(function (m) {
            var el = panelEl(m);
            if (!el) return;
            var on = m === name;
            el.hidden = !on;
            if (on) delete S.minimized[m];
        });
        S.openModule = name;
        updateDock();
        var el = panelEl(name);
        if (el) {
            var body = el.querySelector('.fpanel-body');
            if (opts.focus !== false) {
                var h = el.querySelector('h2');
                if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
            }
            if (body && opts.resetScroll) body.scrollTop = 0;
        }
        if (name === 'huerta' && typeof root.refreshHuertaMaps === 'function') root.refreshHuertaMaps();
    }

    function closeModule(name, minimize) {
        var el = panelEl(name);
        if (el) el.hidden = true;
        if (minimize) S.minimized[name] = true; else delete S.minimized[name];
        if (S.openModule === name) S.openModule = null;
        updateDock();
        var btn = document.querySelector('.dock-btn[data-module="' + name + '"]');
        if (btn) btn.focus({ preventScroll: true });
    }

    function closeAllPanels() {
        MODULES.forEach(function (m) { var el = panelEl(m); if (el) el.hidden = true; });
        S.openModule = null;
        S.minimized = {};
        updateDock();
    }

    function updateDock() {
        Array.prototype.forEach.call(document.querySelectorAll('.dock-btn'), function (b) {
            var m = b.dataset.module;
            b.classList.toggle('is-open', S.openModule === m);
            b.classList.toggle('is-minimized', !!S.minimized[m]);
            b.setAttribute('aria-pressed', String(S.openModule === m));
        });
        updateDockDestinations();
    }

    /* En la pantalla central, indica qué módulos se abrirán en una pantalla lateral. */
    function updateDockDestinations() {
        var roles = S.mode === 'screenx' ? connectedRoles() : [];
        Array.prototype.forEach.call(document.querySelectorAll('.dock-btn'), function (b) {
            var m = b.dataset.module;
            var dest = b.querySelector('.dock-dest');
            var target = S.mode === 'screenx' ? SX.moduleTargetRole(m, S.role, roles) : S.role;
            var remote = S.mode === 'screenx' && target !== S.role;
            b.classList.toggle('is-remote', remote);
            if (dest) dest.textContent = remote ? (target === 'left' ? '←' : '→') : '';
            b.title = remote ? 'Se abre en la ' + SX.ROLE_SCREEN_LABELS[target].toLowerCase() : MODULE_TITLES[m];
        });
    }

    // ───────────────────────── HUD ─────────────────────────

    function refreshHud() {
        var badge = $('hudRoleBadge');
        var sx = S.mode === 'screenx';
        badge.hidden = !sx;
        if (sx && S.role) badge.textContent = SX.ROLE_SCREEN_LABELS[S.role];
        $('sxStatusChip').hidden = !sx;
        $('btnSxCalibrate').hidden = !(sx && S.role === 'center');
        if (!(sx && S.role === 'center')) $('sxCalibration').hidden = true;
        $('sxBanner').hidden = true;
        renderCalibration();
        refreshSxStatus();
        updateDock();
    }

    function renderCalibration() {
        var zoom = S.stage && S.stage.getCamera() ? S.stage.getCamera().zoom : 1;
        var fov = SX.fovFromZoom(zoom);
        var off = SX.sideOffsetDeg(zoom, S.calibration);
        var fmt = function (n) { return (Math.round(n * 10) / 10).toLocaleString('es-MX') + '°'; };
        if ($('sxCalFov')) $('sxCalFov').textContent = fmt(fov);
        if ($('sxCalOffset')) $('sxCalOffset').textContent = fmt(off);
        if ($('sxCalBezel')) { $('sxCalBezel').value = S.calibration.bezelDeg; $('sxCalBezelOut').textContent = fmt(S.calibration.bezelDeg); }
        if ($('sxCalFine')) { $('sxCalFine').value = S.calibration.fineDeg; $('sxCalFineOut').textContent = fmt(S.calibration.fineDeg); }
    }

    var calibrationTimer = null;
    function onCalibrationInput() {
        S.calibration = SX.sanitizeCalibration({ bezelDeg: $('sxCalBezel').value, fineDeg: $('sxCalFine').value });
        renderCalibration();
        saveCalibration();
        clearTimeout(calibrationTimer);
        calibrationTimer = setTimeout(function () { proposeSharedState({ calibration: S.calibration }); }, 120);
    }

    // ───────────────────────── eventos de la interfaz ─────────────────────────

    function onClick(e) {
        var actionEl = e.target.closest('[data-action]');
        var panelBtn = e.target.closest('[data-panel-action]');
        var dockBtn = e.target.closest('.dock-btn');

        if (panelBtn) {
            var panel = panelBtn.closest('.fpanel');
            if (panel) closeModule(panel.dataset.module, panelBtn.dataset.panelAction === 'minimize');
            return;
        }
        if (dockBtn) {
            var m = dockBtn.dataset.module;
            if (S.openModule === m) closeModule(m, false);
            else openModule(m, { resetScroll: false });
            return;
        }
        if (!actionEl) {
            // En el selector, toda la tarjeta funciona como su botón.
            var card = e.target.closest('.mode-card');
            if (card) { var btn = card.querySelector('[data-action]'); if (btn) btn.click(); return; }
            if (!e.target.closest('.hud-user')) toggleUserMenu(false);
            return;
        }
        switch (actionEl.dataset.action) {
            case 'choose-normal': enterNormal(); break;
            case 'choose-screenx': startWizard(1); break;
            case 'back-to-selector': showSelector(); break;
            case 'change-mode': showSelector(); break;
            case 'wizard-next': S.wizardStep = Math.min(3, S.wizardStep + 1); renderWizard(); break;
            case 'wizard-back': S.wizardStep = Math.max(1, S.wizardStep - 1); renderWizard(); break;
            case 'claim-role': claimRole(actionEl.dataset.role); break;
            case 'detect-screens': detectScreens(); break;
            case 'open-window': openExtraWindow(); break;
            case 'sx-enter':
                if (S.sx && !S.sx.unsupported) S.sx.bus.send('start', null);
                enterScreenX();
                break;
            case 'change-role': startWizard(2); break;
            case 'toggle-calibration': $('sxCalibration').hidden = !$('sxCalibration').hidden; renderCalibration(); break;
            case 'reset-calibration':
                S.calibration = SX.sanitizeCalibration(SX.SCREENX_DEFAULTS);
                renderCalibration(); saveCalibration(); proposeSharedState({ calibration: S.calibration });
                break;
            case 'open-sx-status': startWizard(3); break;
            case 'toggle-user-menu': toggleUserMenu(); break;
            case 'logout': if (typeof root.doLogout === 'function') root.doLogout(); break;
            case 'retry-stage': showActiveHuerta(); break;
            case 'reload-page': root.location.reload(); break;
        }
    }

    function toggleUserMenu(force) {
        var menu = $('hudUserMenu');
        var btn = document.querySelector('[data-action="toggle-user-menu"]');
        if (!menu || !btn) return;
        var open = typeof force === 'boolean' ? force : menu.hidden;
        menu.hidden = !open;
        btn.setAttribute('aria-expanded', String(open));
    }

    function onKey(e) {
        if (e.key !== 'Escape') return;
        var modal = $('indexHelpModal');
        if (modal && modal.classList.contains('is-open')) return; // lo cierra el código existente
        if (!$('hudUserMenu').hidden) { toggleUserMenu(false); return; }
        if (!$('sxCalibration').hidden) { $('sxCalibration').hidden = true; return; }
        if (S.openModule && (S.mode === 'normal' || S.mode === 'screenx')) closeModule(S.openModule, false);
    }

    function bindUi() {
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onKey);
        $('huertaSelect').addEventListener('change', function (e) {
            setActiveHuerta(e.target.value, { propagate: true });
        });
        $('sxCalBezel').addEventListener('input', onCalibrationInput);
        $('sxCalFine').addEventListener('input', onCalibrationInput);
        document.addEventListener('avotex:huertas', function (e) { onHuertas(e.detail || {}); });
        root.addEventListener('pagehide', function () { leaveScreenX({ silent: false }); });
        root.addEventListener('pageshow', function (e) {
            // Al volver desde la caché del navegador, la ventana se vuelve a anunciar.
            if (e.persisted && (S.mode === 'screenx' || S.mode === 'wizard')) { joinScreenX(); sendPresence(); }
        });
        root.addEventListener('resize', function () {
            if (S.fallbackMap && !$('svFallbackMap').hidden) S.fallbackMap.invalidateSize();
        });
        // Los paneles empiezan debajo de la ficha de ubicación, mida lo que mida.
        var loc = $('hudLocation');
        var syncLocSpace = function () {
            var h = loc.hidden ? 0 : loc.offsetHeight + 10;
            document.body.style.setProperty('--ix-loc-space', h + 'px');
        };
        if (typeof root.ResizeObserver === 'function') new root.ResizeObserver(syncLocSpace).observe(loc);
        if (typeof root.MutationObserver === 'function') new root.MutationObserver(syncLocSpace).observe(loc, { attributes: true, attributeFilter: ['hidden'] });
        // El zoom de la cámara central cambia el campo de visión mostrado en la calibración.
        setInterval(function () { if (!$('sxCalibration').hidden) renderCalibration(); }, 800);
    }

    // ───────────────────────── API pública (la usa admin.html) ─────────────────────────

    function onAuthenticated(user) {
        S.user = { email: user.email, uid: user.uid };
        if ($('selectorEmail')) $('selectorEmail').textContent = user.email;

        var saved = readSession();
        S.windowId = saved.windowId || newWindowId();
        if (saved.huertaId) S.activeHuertaId = saved.huertaId;

        var wantsScreenx = root.location.hash === '#screenx';
        if (wantsScreenx && root.history && root.history.replaceState) root.history.replaceState(null, '', root.location.pathname + root.location.search);

        // Una recarga de la misma pestaña reanuda donde estaba; una entrada nueva pregunta la modalidad.
        if (saved.mode === 'screenx' && SX.ROLES.indexOf(saved.role) !== -1) {
            S.role = saved.role;
            enterScreenX();
        } else if (saved.mode === 'wizard' || wantsScreenx) {
            S.role = SX.ROLES.indexOf(saved.role) !== -1 ? saved.role : null;
            startWizard(wantsScreenx && !S.role ? 2 : (S.role ? 3 : 2));
        } else if (saved.mode === 'normal') {
            enterNormal();
        } else {
            setMode('selector');
        }
    }

    function onSessionEnded() {
        leaveScreenX({ silent: true });
        closeAllPanels();
        if (S.stage) S.stage.hide();
        $('svPano').hidden = true;
        hideFallbackMap();
        setStageStatus(null);
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* nada */ }
        setMode('ended');
    }

    function beforeLogout() {
        if (S.sx && !S.sx.unsupported) S.sx.bus.send('logout', null);
        leaveScreenX({ silent: true });
        try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { /* nada */ }
    }

    // El script va al final del <body>: los elementos de la interfaz ya existen.
    bindUi();

    root.AvotexInmersiva = {
        onAuthenticated: onAuthenticated,
        onSessionEnded: onSessionEnded,
        beforeLogout: beforeLogout,
        openModule: openModule,
        // Solo para diagnóstico en consola y pruebas automáticas.
        _debug: function () {
            return {
                mode: S.mode, role: S.role, windowId: S.windowId, activeHuertaId: S.activeHuertaId,
                huertasStatus: S.huertasStatus, openModule: S.openModule, calibration: S.calibration,
                stageResult: S.stageResult && { status: S.stageResult.status, pano: S.stageResult.pano },
                camera: S.stage && S.stage.getCamera(), lastCenterCamera: S.lastCenterCamera,
                summary: sxSummary(), synced: !!(S.sx && S.sx.synced)
            };
        }
    };
})(window);
