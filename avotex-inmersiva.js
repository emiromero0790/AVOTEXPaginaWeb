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
    // Columna lateral de cada módulo (la misma distribución en Vista normal y en ScreenX).
    var COLUMN_OF = { resumen: 'left', huerta: 'left', reportes: 'right', analisis: 'right' };
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
        openModule: null,          // último detalle abierto (para Escape y diagnóstico)
        details: { left: null, right: null },
        mobileCard: 'resumen',     // pantallas angostas: módulo visible en la hoja inferior
        fx: { hud: null, hudLow: null, sel: null },
        revealTimer: null,
        stage: null,
        stageToken: 0,
        stageResult: null,
        fallbackMap: null,
        fallbackLayer: null,
        sx: null,                  // estado de ScreenX (bus, registro, timers…)
        calibration: SX.sanitizeCalibration(readCalibration()),
        lastCenterCamera: null,
        pendingCameraMsg: null,
        lastLocalNavAt: 0,         // última vez que la persona movió esta pantalla lateral
        echoTimer: null,
        detectedScreens: null,
        scans: { on: false, groups: null, group: -1, loading: null },  // imágenes de escaneo (pulgar arriba)
        board: { on: false, offset: 0, shown: null, placeholder: null }  // una pestaña por pantalla (señalar)
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
        syncSelectorBackground();
        syncFx();
        syncGestures();
        if (mode === 'normal' || mode === 'screenx') loadScans();
        else if (S.scans.on) setScans(false, { propagate: false });
        if (mode !== 'normal' && mode !== 'screenx' && S.board.on) setBoard(false, { propagate: false });
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
        closeAllPanels();
        setMode('normal');
        configureStageForMode();
        refreshHud();
        updateColumns();
        revealHud();
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
        closeAllPanels();
        setMode('screenx');
        configureStageForMode();
        refreshHud();
        updateColumns();
        revealHud();
        showActiveHuerta();
        sendPresence();
        // Si las demás pantallas ya muestran los escaneos, esta también.
        var shared = S.sx && !S.sx.unsupported ? S.sx.store.get() : null;
        if (shared && shared.scans === true) setScans(true, { propagate: false, group: typeof shared.scanGroup === 'number' ? shared.scanGroup : 0 });
        if (shared && shared.board === true) setBoard(true, { propagate: false, offset: typeof shared.boardOffset === 'number' ? shared.boardOffset : 0 });
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
        if (S.scans.on) setScans(false, { propagate: false });
        if (S.board.on) setBoard(false, { propagate: false });
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
                // Justo después de que la persona movió esta lateral, la central devuelve el mismo
                // cambio: no se aplica ese eco para no "jalar" la vista mientras se arrastra.
                if (Date.now() - S.lastLocalNavAt < 450) { scheduleEchoApply(); break; }
                applyCenterCamera();
                break;
            case 'nav-request': {
                if (S.mode !== 'screenx' || S.role !== 'center' || !S.stage || roleIsDuplicated()) break;
                var sender = sx.registry.get(msg.from);
                var senderRole = sender && sender.role;
                if (senderRole && sx.registry.holdersOf(senderRole, now).length > 1) break; // lateral duplicada
                if (!SX.shouldAcceptNavRequest(msg, { selfRole: S.role, senderRole: senderRole, huertaId: S.activeHuertaId, current: S.stage.getCamera() })) break;
                var req = msg.payload;
                S.stage.applyCamera({ pano: req.pano, heading: req.heading, pitch: req.pitch, zoom: req.zoom });
                sendCamera(S.stage.getCamera()); // la central retransmite: todas quedan alineadas
                scheduleNavPad();
                break;
            }
            case 'start':
                if (S.mode === 'wizard' && S.role && !roleIsDuplicated()) enterScreenX();
                break;
            case 'open-module': {
                var pm = msg.payload || {};
                if (S.mode === 'screenx' && pm.targetRole === S.role && MODULES.indexOf(pm.module) !== -1) openModule(pm.module, { local: true, focus: false });
                break;
            }
            case 'logout':
                // Firebase también cerrará la sesión aquí; no se muestran más datos.
                S.mode = 'ended';
                root.location.replace('dashboard.html');
                break;
            case 'goadmin':
                // La central abrió el Panel Administrador: esta pantalla también, con su rol.
                if (S.mode === 'screenx' && SX.ROLES.indexOf(S.role) !== -1) goToAdmin(true);
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
        if (S.mode === 'screenx' && typeof data.scans === 'boolean') {
            var g = typeof data.scanGroup === 'number' && isFinite(data.scanGroup) ? Math.max(0, Math.floor(data.scanGroup)) : S.scans.group;
            if (data.scans !== S.scans.on || (data.scans && g !== S.scans.group)) setScans(data.scans, { propagate: false, group: g });
        }
        if (S.mode === 'screenx' && typeof data.board === 'boolean') {
            var bo = typeof data.boardOffset === 'number' && isFinite(data.boardOffset) ? Math.floor(data.boardOffset) : S.board.offset;
            if (data.board !== S.board.on || (data.board && bo !== S.board.offset)) setBoard(data.board, { propagate: false, offset: bo });
        }
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
        scheduleNavPad(); // los enlaces disponibles dependen de hacia dónde mira esta pantalla
    }

    /*
     * Pantalla lateral: la persona giró, hizo zoom o avanzó aquí. Se convierte a la cámara
     * equivalente de la central y se le pide aplicarla; la central la retransmite a todas.
     * Si la central no está conectada, el cambio se queda solo en esta pantalla.
     */
    function sendNavRequest(cam) {
        var sx = S.sx;
        if (!sx || sx.unsupported || S.mode !== 'screenx' || !S.role || S.role === 'center') return;
        S.lastLocalNavAt = Date.now();
        if (roleIsDuplicated()) return;
        var c = SX.centerCameraFromRole(cam, S.role, S.calibration);
        sx.bus.send('nav-request', { pano: cam.pano, heading: c.heading, pitch: c.pitch, zoom: c.zoom, huertaId: S.activeHuertaId });
    }

    /* Cuando la persona deja de mover la lateral, se aplica la última cámara de la central. */
    function scheduleEchoApply() {
        clearTimeout(S.echoTimer);
        S.echoTimer = setTimeout(function () {
            if (Date.now() - S.lastLocalNavAt < 450) { scheduleEchoApply(); return; }
            applyCenterCamera();
        }, 480);
    }

    // ───────────────────────── botonera de navegación ─────────────────────────

    var navPadPending = false;
    function scheduleNavPad() {
        if (navPadPending) return;
        navPadPending = true;
        (root.requestAnimationFrame || setTimeout)(function () { navPadPending = false; updateNavPad(); });
    }

    function updateNavPad() {
        var pad = $('svNav');
        if (!pad) return;
        var visible = (S.mode === 'normal' || S.mode === 'screenx') && S.stage && S.stage.hasPanorama() &&
            !$('svPano').hidden && S.stageResult && S.stageResult.status === 'OK';
        pad.hidden = !visible;
        if (!visible) return;
        var cam = S.stage.getCamera();
        var opt = SX.navOptions(S.stage.getLinks(), cam ? cam.heading : 0);
        setNavButton('forward', !!opt.forward, opt.forward ? 'Avanzar' + (opt.forward.description ? ' hacia ' + opt.forward.description : '') : 'No hay camino hacia adelante');
        setNavButton('back', !!opt.back, opt.back ? 'Retroceder' + (opt.back.description ? ' hacia ' + opt.back.description : '') : 'No hay camino hacia atrás');
    }

    function setNavButton(dir, enabled, label) {
        var b = document.querySelector('#svNav [data-nav="' + dir + '"]');
        if (!b) return;
        b.disabled = !enabled;
        b.setAttribute('aria-label', label);
        b.title = label;
    }

    var NAV_TURN_DEG = 45;
    function onNavButton(dir) {
        if (!S.stage || !S.stage.hasPanorama()) return;
        // Un botón de la botonera le quita el control a una pinza activa (no compiten dos entradas).
        if (root.AvotexGestos) root.AvotexGestos.interrupt('manual');
        if (dir === 'left') S.stage.turn(-NAV_TURN_DEG);
        else if (dir === 'right') S.stage.turn(NAV_TURN_DEG);
        else {
            var r = navigateStage(dir);
            if (r === 'loading') toast('Cargando los caminos de este punto… intenta de nuevo en un momento.', { duration: 2600 });
            else if (r !== 'ok') toast(dir === 'back' ? 'No hay camino hacia atrás desde aquí.' : 'No hay camino hacia adelante desde aquí.', { duration: 2600 });
        }
        wakeNavPad();
    }

    /*
     * Avance o retroceso compartido por la botonera y el gesto en V: usa solo los enlaces reales
     * del panorama (SX.navOptions, el más alineado con la vista dentro de ±67.5°). En la central de
     * ScreenX el cambio de panorama se propaga solo, por el evento pano_changed de siempre.
     * Devuelve 'ok', 'loading' (el punto acaba de cambiar y Google aún no da sus enlaces),
     * 'no-link' o 'unavailable'.
     */
    function navigateStage(dir) {
        if (!stageReady()) return 'unavailable';
        if (S.stage.navigate(dir)) { scheduleNavPad(); return 'ok'; }
        return (S.stage.msSincePano() < 1500 && !S.stage.getLinks().length) ? 'loading' : 'no-link';
    }

    function stageReady() {
        return !!(S.stage && S.stage.hasPanorama() && !$('svPano').hidden && S.stageResult && S.stageResult.status === 'OK');
    }

    // ───────────────────────── control por gestos (avotex-gestos.js) ─────────────────────────
    /*
     * La detección de la mano corre solo donde hay autoridad sobre la cámara: Vista normal o la
     * pantalla CENTRAL de ScreenX. Las laterales nunca piden la webcam ni cargan el modelo: siguen a
     * la central con la sincronización existente. Los gestos solo mueven esta panorámica con look()
     * (setPov) y navigateStage(); de ahí en adelante todo es el flujo de siempre.
     */
    /*
     * Pulgar abajo en Street View: abre el Panel Administrador (avotex-admin.html) con una transición
     * futurista (un destello lima que se expande antes de navegar). Respeta «reducir movimiento».
     */
    var adminGoing = false;
    function goToAdmin(fromRemote) {
        if (adminGoing) return true;
        adminGoing = true;
        if (root.AvotexGestos) root.AvotexGestos.interrupt('manual');
        if (S.scans.on) setScans(false, { propagate: true });
        // En ScreenX las tres pantallas abren el panel, cada una con su rol (una pestaña distinta).
        var sxRole = (S.mode === 'screenx' && SX.ROLES.indexOf(S.role) !== -1) ? S.role : null;
        if (!fromRemote && sxRole && S.sx && !S.sx.unsupported) { try { S.sx.bus.send('goadmin', null); } catch (e) { /* nada */ } }
        var fx = document.getElementById('toAdminFx');
        if (!fx) {
            fx = document.createElement('div');
            fx.id = 'toAdminFx';
            fx.innerHTML = '<span class="ta-ring"></span><span class="ta-ring ta-ring-2"></span><b class="ta-label">Panel de administrador</b>';
            document.body.appendChild(fx);
        }
        document.body.classList.add('to-admin');
        var reduce = root.AvotexFx && root.AvotexFx.reducedMotion && root.AvotexFx.reducedMotion();
        var url = 'avotex-admin.html' + (sxRole ? '?sx=' + sxRole : '');
        setTimeout(function () { root.location.href = url; }, reduce ? 0 : 620);
        return true;
    }

    var gestureActions = {
        canMove: function () { return stageReady() && !S.scans.on; },
        scansOpen: function () { return S.scans.on; },
        toggleScans: function () { return toggleScans(); },
        // Pulgar abajo (dislike): abre el Panel Administrador con una transición.
        openAdmin: function () { return goToAdmin(); },
        // Capa abierta (solo escaneos) y cómo cambiar su contenido con el deslizamiento de la pinza.
        overlayOpen: function () { return S.scans.on ? 'scans' : null; },
        changeOverlay: function (delta) { return S.scans.on ? changeScans(delta) : null; },
        look: function (dh, dp, minPitch, maxPitch) { return stageReady() && S.stage.look(dh, dp, minPitch, maxPitch); },
        forward: function () { return navigateStage('forward'); }
    };

    function gesturesAllowed() {
        return S.mode === 'normal' || (S.mode === 'screenx' && S.role === 'center');
    }

    function syncGestures() {
        if (root.AvotexGestos) root.AvotexGestos.setContext({ allowed: gesturesAllowed(), actions: gestureActions });
    }

    // ───────────────────────── imágenes de escaneo (pulgar arriba) ─────────────────────────
    /*
     * El gesto de pulgar arriba (o la tecla E) cubre la panorámica con imágenes de escaneo:
     * en ScreenX cada pantalla muestra la suya (izquierda, central, derecha); en Vista normal
     * se ven las tres juntas. El mismo gesto las quita y la huerta vuelve tal como estaba
     * (Street View sigue debajo, sin recargarse ni cobrar otra carga).
     * En ScreenX el encendido viaja en el estado compartido versionado, así que una ventana
     * recargada o recién conectada también lo respeta.
     * Las imágenes viven en assets/escaneos/ y se nombran en assets/escaneos/escaneos.json.
     * Puede haber varios grupos de tres: cada vez que se muestran aparece el grupo siguiente.
     */
    var SCANS_DIR = 'assets/escaneos/';
    var SCAN_SLOTS = ['left', 'center', 'right'];
    var SCAN_KEYS = { left: 'izquierda', center: 'central', right: 'derecha' };
    var SCAN_DEFAULT_FILES = { left: 'izquierda.jpg', center: 'central.jpg', right: 'derecha.jpg' };
    // La aparición recorre los monitores de izquierda a derecha, como una ola.
    var SCAN_DELAY_MS = { left: 0, center: 160, right: 320 };
    var SCAN_LEAVE_MS = 460;
    var scanLeaveTimer = null;

    function cleanScanEntry(v) {
        // Acepta "foto.jpg" o { "imagen": "foto.jpg", "titulo": "…" }. Solo archivos dentro de la carpeta.
        var file = typeof v === 'string' ? v : (v && typeof v.imagen === 'string' ? v.imagen : null);
        if (!file || !/^[\w\-. ()áéíóúñÁÉÍÓÚÑ]+\.(jpe?g|png|webp|avif|gif)$/i.test(file) || file.indexOf('..') !== -1) return null;
        return { file: file, title: v && typeof v.titulo === 'string' ? v.titulo.slice(0, 120) : '' };
    }

    /* escaneos.json: { "grupos": [ {izquierda, central, derecha}, … ] } o un solo grupo sin "grupos". */
    function parseScanGroups(json) {
        var raw = json && Array.isArray(json.grupos) ? json.grupos : [json || {}];
        var groups = raw.slice(0, 50).map(function (g, i) {
            var files = {};
            SCAN_SLOTS.forEach(function (k) {
                files[k] = cleanScanEntry(g && g[SCAN_KEYS[k]]) || (i === 0 && raw.length === 1 ? { file: SCAN_DEFAULT_FILES[k], title: '' } : null);
            });
            return files;
        }).filter(function (f) { return f.left || f.center || f.right; });
        if (!groups.length) {
            var d = {};
            SCAN_SLOTS.forEach(function (k) { d[k] = { file: SCAN_DEFAULT_FILES[k], title: '' }; });
            groups = [d];
        }
        return groups;
    }

    function loadScans() {
        if (S.scans.groups || S.scans.loading) return S.scans.loading || Promise.resolve();
        S.scans.loading = fetch(SCANS_DIR + 'escaneos.json', { cache: 'no-cache' })
            .then(function (r) { return r.ok ? r.json() : {}; })
            .catch(function () { return {}; })
            .then(function (json) {
                S.scans.groups = parseScanGroups(json);
                S.scans.loading = null;
                // Se precargan (las de esta pantalla, de todos los grupos) para que el gesto las muestre al instante.
                S.scans.groups.forEach(function (files) {
                    scanSlotsHere().forEach(function (k) {
                        if (files[k]) { var im = new Image(); im.src = SCANS_DIR + encodeURIComponent(files[k].file); }
                    });
                });
                if (S.scans.on) renderScans();
            });
        return S.scans.loading;
    }

    function currentScanFiles() {
        var groups = S.scans.groups;
        if (!groups || !groups.length) return null;
        return groups[((S.scans.group % groups.length) + groups.length) % groups.length];
    }

    function scanSlotsHere() {
        if (S.mode === 'screenx' && SX.ROLES.indexOf(S.role) !== -1) return [S.role];
        return SCAN_SLOTS.slice();
    }

    function renderScans() {
        var host = $('scanTrack');
        if (!host) return;
        var files = currentScanFiles();
        if (!files) { host.innerHTML = ''; loadScans(); return; }
        var slots = scanSlotsHere().filter(function (k) { return files[k] || scanSlotsHere().length === 1; });
        host.dataset.count = String(slots.length);
        host.innerHTML = slots.map(function (k) {
            var f = files[k] || { file: '(sin imagen en este grupo)', title: '' };
            var src = SCANS_DIR + encodeURIComponent(f.file);
            var alt = f.title || ('Escaneo de aguacate · ' + SCAN_KEYS[k]);
            return '<figure class="scan-slot" data-slot="' + k + '" style="--scan-delay:' + SCAN_DELAY_MS[k] + 'ms">' +
                '<img src="' + escapeHtml(src) + '" alt="' + escapeHtml(alt) + '" decoding="async">' +
                '<p class="scan-missing" hidden>Falta la imagen <strong>' + escapeHtml(f.file) + '</strong> en <code>' + SCANS_DIR + '</code>.</p>' +
                (f.title ? '<figcaption>' + escapeHtml(f.title) + '</figcaption>' : '') +
                '</figure>';
        }).join('');
        Array.prototype.forEach.call(host.querySelectorAll('.scan-slot img'), function (img) {
            img.addEventListener('error', function () {
                img.hidden = true;
                img.parentNode.classList.add('is-missing');
                img.parentNode.querySelector('.scan-missing').hidden = false;
            });
        });
    }

    function setScans(on, opts) {
        opts = opts || {};
        on = !!on && (S.mode === 'normal' || S.mode === 'screenx');
        var groupChanged = on && typeof opts.group === 'number' && opts.group !== S.scans.group;
        if (typeof opts.group === 'number') S.scans.group = opts.group;
        var changed = on !== S.scans.on;
        S.scans.on = on;
        if (!changed && groupChanged) renderScans();
        if (changed) {
            // Al abrir, la vista queda quieta debajo (canMove es falso) y la pinza sirve para deslizar.
            // Al cerrar, una pinza que estuviera desplazada no debe ponerse a girar de golpe.
            if (!on && root.AvotexGestos) root.AvotexGestos.interrupt('manual');
            var g = $('scanGallery');
            clearTimeout(scanLeaveTimer);
            if (g) g.classList.remove('is-leaving');
            if (on) {
                if (S.board.on) setBoard(false, { propagate: false });  // una sola capa a la vez
                renderScans();
                if (g) { g.hidden = false; g.setAttribute('aria-hidden', 'false'); }
                document.body.classList.add('scans-on');
            } else if (g && !g.hidden) {
                // Salida animada; luego se ocultan y la huerta queda como estaba.
                g.classList.add('is-leaving');
                g.setAttribute('aria-hidden', 'true');
                var reduce = root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
                scanLeaveTimer = setTimeout(function () {
                    g.hidden = true;
                    g.classList.remove('is-leaving');
                    document.body.classList.remove('scans-on');
                    if ($('scanTrack')) $('scanTrack').innerHTML = '';
                }, reduce ? 0 : SCAN_LEAVE_MS);
            } else {
                document.body.classList.remove('scans-on');
            }
        }
        if (opts.propagate && S.mode === 'screenx') {
            // Escaneos y módulos son excluyentes: al abrir uno se apaga el otro también en el estado compartido.
            proposeSharedState(on ? { scans: true, scanGroup: S.scans.group, board: false } : { scans: false, scanGroup: S.scans.group });
        }
        return on;
    }

    /* Siguiente (+1) o anterior (-1) grupo con los escaneos abiertos; en ScreenX cambia en las tres. */
    function changeScans(delta) {
        if (!S.scans.on) return null;
        var n = S.scans.groups ? S.scans.groups.length : 1;
        if (n < 2) return 'single';
        setScans(true, { propagate: true, group: (((Math.max(0, S.scans.group) + delta) % n) + n) % n });
        return S.scans.group;
    }

    function toggleScans() {
        // Cada vez que se muestran, aparece el grupo siguiente (el primero la primera vez).
        if (S.scans.on) return setScans(false, { propagate: true });
        var n = S.scans.groups ? S.scans.groups.length : 1;
        return setScans(true, { propagate: true, group: (Math.max(-1, S.scans.group) + 1) % n });
    }

    // ───────────────────────── vista de módulos (señalar) ─────────────────────────
    /*
     * El gesto de señalar (índice solo) tapa la panorámica con los módulos del panel: en ScreenX
     * una pestaña por pantalla (izquierda, central, derecha) y se intercalan con la pinza/la V o las
     * flechas; en Vista normal, una a la vez. El mismo gesto regresa a la huerta en las tres pantallas.
     * Reusa los paneles de detalle de siempre (.fpanel): se mueven a una capa a pantalla completa y
     * vuelven a su columna al cerrar, con sus gráficas y mapas intactos.
     */
    var BOARD_ROLE_INDEX = { left: 0, center: 1, right: 2 };

    /* Qué módulo muestra ESTA pantalla con el desplazamiento actual. */
    function boardModuleForHere() {
        var n = MODULES.length;
        var base = (S.mode === 'screenx' && BOARD_ROLE_INDEX.hasOwnProperty(S.role)) ? BOARD_ROLE_INDEX[S.role] : 0;
        return MODULES[(((S.board.offset + base) % n) + n) % n];
    }

    /* Mueve el panel elegido a la capa a pantalla completa (recordando su lugar para devolverlo). */
    function mountBoardPanel(name) {
        var host = $('moduleStageBody');
        if (!host) return;
        if (S.board.shown === name) return;
        unmountBoardPanel();
        var panel = panelEl(name);
        if (!panel) return;
        var ph = document.createComment('fpanel:' + name);
        panel.parentNode.insertBefore(ph, panel);
        S.board.placeholder = ph;
        S.board.shown = name;
        host.appendChild(panel);
        panel.hidden = false;
        panel.classList.add('is-board-panel');
        $('moduleStageTitle').textContent = MODULE_TITLES[name];
        // Relayout: paginación, gráficas y mapas toman su tamaño en la capa.
        if (root.AvotexRecorrido) root.AvotexRecorrido.onDetailShown(name);
        if (name === 'huerta' && typeof root.refreshHuertaMaps === 'function') root.refreshHuertaMaps();
        root.dispatchEvent(new Event('resize'));
    }

    function unmountBoardPanel() {
        var name = S.board.shown;
        if (!name) return;
        var panel = panelEl(name);
        var ph = S.board.placeholder;
        if (panel) {
            panel.classList.remove('is-board-panel');
            panel.hidden = true;
            if (ph && ph.parentNode) ph.parentNode.insertBefore(panel, ph);
        }
        if (ph && ph.parentNode) ph.parentNode.removeChild(ph);
        S.board.shown = null;
        S.board.placeholder = null;
    }

    function renderBoard() {
        if (!S.board.on) return;
        mountBoardPanel(boardModuleForHere());
    }

    function setBoard(on, opts) {
        opts = opts || {};
        on = !!on && (S.mode === 'normal' || S.mode === 'screenx');
        var offsetChanged = on && typeof opts.offset === 'number' && opts.offset !== S.board.offset;
        if (typeof opts.offset === 'number') S.board.offset = ((opts.offset % MODULES.length) + MODULES.length) % MODULES.length;
        var changed = on !== S.board.on;
        var stage = $('moduleStage');
        if (changed) {
            // Al abrir, la panorámica queda quieta debajo; al cerrar, una pinza desplazada no gira de golpe.
            if (!on && root.AvotexGestos) root.AvotexGestos.interrupt('manual');
            S.board.on = on;
            if (on) {
                if (S.scans.on) setScans(false, { propagate: false });
                closeAllPanels();
                if (stage) { stage.hidden = false; stage.setAttribute('aria-hidden', 'false'); }
                document.body.classList.add('board-on');
                renderBoard();
            } else {
                unmountBoardPanel();
                if (stage) { stage.hidden = true; stage.setAttribute('aria-hidden', 'true'); }
                document.body.classList.remove('board-on');
            }
        } else if (on && offsetChanged) {
            renderBoard();
        }
        if (opts.propagate && S.mode === 'screenx') {
            // Escaneos y módulos son excluyentes: al abrir uno se apaga el otro también en el estado compartido.
            proposeSharedState(on ? { board: true, boardOffset: S.board.offset, scans: false } : { board: false, boardOffset: S.board.offset });
        }
        return on;
    }

    /* Intercala: +1 corre todas las pantallas una pestaña; -1 al revés. En ScreenX cambia en las tres. */
    function changeBoard(delta) {
        if (!S.board.on) return null;
        setBoard(true, { propagate: true, offset: S.board.offset + (delta || 0) });
        return S.board.offset;
    }

    function toggleBoard() {
        return setBoard(!S.board.on, { propagate: true, offset: S.board.on ? undefined : 0 });
    }

    /* La botonera se atenúa si nadie la usa y vuelve al mover el cursor, tocar o usar el teclado. */
    var navIdleTimer = null;
    function wakeNavPad() {
        document.body.classList.remove('nav-idle');
        clearTimeout(navIdleTimer);
        navIdleTimer = setTimeout(function () { document.body.classList.add('nav-idle'); }, 3500);
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
        updateColumns();
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
            if (root.AvotexRecorrido) root.AvotexRecorrido.setActiveHuerta(null);
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
        if (root.AvotexRecorrido) root.AvotexRecorrido.setActiveHuerta(huerta);
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
            interactive: true,
            // Las laterales no repiten la dirección ni la fecha que ya muestra la central.
            primary: !(S.mode === 'screenx' && S.role && S.role !== 'center'),
            onCamera: function (cam) {
                if (S.mode === 'screenx' && S.role === 'center') sendCamera(cam);
                else if (S.mode === 'screenx' && S.role && cam.user) sendNavRequest(cam);
                scheduleNavPad();
            },
            onLinks: function () { scheduleNavPad(); },
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

    /* Todas las pantallas se pueden mover; las laterales piden el cambio a la central. */
    function configureStageForMode() {
        var side = S.mode === 'screenx' && S.role && S.role !== 'center';
        if (S.stage) { S.stage.setInteractive(true); S.stage.setPrimary(!side); }
        scheduleNavPad();
    }

    function setStageStatus(kind, message, action) {
        scheduleNavPad();
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
        // Cambio de huerta: cualquier giro por gestos se detiene y hay que volver a tomar el control.
        if (root.AvotexGestos) root.AvotexGestos.interrupt('huerta');
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
            scheduleNavPad();
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

    // ───────────────────────── tarjetas y detalles en los laterales ─────────────────────────
    /*
     * Cada lateral tiene sus tarjetas siempre visibles (avotex-recorrido.js las llena).
     * «Ver detalle» abre el panel completo del módulo (.fpanel, el de siempre) dentro de su
     * misma columna: la tarjeta retrocede y el panel avanza y se endereza. «Volver al resumen»
     * o Escape regresan a las tarjetas. La panorámica no se toca en ningún momento.
     */

    function panelEl(name) { return document.querySelector('.fpanel[data-module="' + name + '"]'); }
    function colEl(side) { return $(side === 'left' ? 'colLeft' : 'colRight'); }
    function isMobile() { return !!(root.matchMedia && root.matchMedia('(max-width: 760px)').matches); }

    function presentRoles() {
        var roles = connectedRoles().slice();
        if (S.role && roles.indexOf(S.role) === -1) roles.push(S.role);
        return roles;
    }

    /* Qué columnas muestra esta ventana. En ScreenX cada una va a su pantalla (ver SX.columnOwner). */
    function shownColumns() {
        if (S.mode === 'normal') return { left: true, right: true };
        if (S.mode !== 'screenx' || !S.role) return { left: false, right: false };
        var present = presentRoles();
        return { left: SX.columnOwner('left', present) === S.role, right: SX.columnOwner('right', present) === S.role };
    }

    function updateColumns() {
        var cols = shownColumns();
        var body = document.body;
        var changed = false;
        ['left', 'right'].forEach(function (side) {
            var key = side === 'left' ? 'colLeft' : 'colRight';
            var val = cols[side] ? 'on' : 'off';
            if (body.dataset[key] !== val) { body.dataset[key] = val; changed = true; }
            if (!cols[side] && S.details[side]) closeModule(S.details[side], false, { focus: false });
        });
        // Pantallas angostas: si el módulo elegido está en una columna que no se muestra, se elige otro.
        if (!cols[COLUMN_OF[S.mobileCard]]) {
            var firstShown = MODULES.filter(function (m) { return cols[COLUMN_OF[m]]; })[0];
            if (firstShown) S.mobileCard = firstShown;
        }
        body.dataset.mobileCard = S.mobileCard;
        body.dataset.mobileCol = COLUMN_OF[S.mobileCard];
        updateDock();
        if (changed) {
            if (root.AvotexRecorrido) root.AvotexRecorrido.layout();
            scheduleFxRefresh();
        }
    }

    /* Entrada: primero aparecen nodos y líneas; luego las tarjetas salen del fondo, escalonadas. */
    function revealHud() {
        var hud = $('hud');
        clearTimeout(S.revealTimer);
        hud.classList.remove('is-revealed');
        hud.classList.add('is-entering');
        void hud.offsetWidth; // reinicia la transición solo al entrar a la vista
        var still = root.AvotexFx ? root.AvotexFx.reducedMotion() : false;
        S.revealTimer = setTimeout(function () {
            hud.classList.add('is-revealed');
            hud.classList.remove('is-entering');
            if (root.AvotexRecorrido) root.AvotexRecorrido.layout();
        }, still ? 0 : 320);
    }

    function openModule(name, opts) {
        opts = opts || {};
        if (MODULES.indexOf(name) === -1) return;
        var side = COLUMN_OF[name];
        var cols = shownColumns();
        // ScreenX: si la columna de ese módulo está en otra pantalla, el detalle se abre allá.
        if (S.mode === 'screenx' && !cols[side] && S.sx && !S.sx.unsupported) {
            var target = SX.columnOwner(side, presentRoles());
            if (target && target !== S.role) {
                S.sx.bus.send('open-module', { module: name, targetRole: target });
                toast('“' + MODULE_TITLES[name] + '” se abrió en la ' + SX.ROLE_SCREEN_LABELS[target].toLowerCase() + '.');
                return;
            }
        }
        if (isMobile()) { S.mobileCard = name; document.body.dataset.mobileCard = name; document.body.dataset.mobileCol = side; }
        var col = colEl(side);
        var current = S.details[side];
        if (current && current !== name) { var prev = panelEl(current); if (prev) prev.hidden = true; }
        var el = panelEl(name);
        if (!el || !col) return;
        S.details[side] = name;
        S.openModule = name;
        col.dataset.showing = name;
        el.hidden = false;
        el.classList.add('is-arriving');
        void el.offsetWidth;
        requestAnimationFrame(function () { el.classList.remove('is-arriving'); });
        if (opts.focus !== false) {
            var h = el.querySelector('h2');
            if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
        }
        if (root.AvotexRecorrido) root.AvotexRecorrido.onDetailShown(name);
        if (name === 'huerta' && typeof root.refreshHuertaMaps === 'function') root.refreshHuertaMaps();
        updateDock();
        scheduleFxRefresh();
    }

    function closeModule(name, minimize, opts) {
        opts = opts || {};
        var side = COLUMN_OF[name];
        var el = panelEl(name);
        if (el) el.hidden = true;
        if (side && S.details[side] === name) {
            S.details[side] = null;
            var col = colEl(side);
            if (col) delete col.dataset.showing;
        }
        if (S.openModule === name) S.openModule = S.details.left || S.details.right || null;
        updateDock();
        if (root.AvotexRecorrido) root.AvotexRecorrido.layout();
        scheduleFxRefresh();
        if (opts.focus !== false) {
            var back = document.querySelector('.xcard[data-module="' + name + '"] .xcard-action');
            if (back && back.offsetParent !== null) back.focus({ preventScroll: true });
        }
    }

    function closeAllPanels() {
        MODULES.forEach(function (m) { var el = panelEl(m); if (el) el.hidden = true; });
        S.details = { left: null, right: null };
        S.openModule = null;
        ['left', 'right'].forEach(function (side) { var c = colEl(side); if (c) delete c.dataset.showing; });
        updateDock();
    }

    /* Barra de módulos: solo en pantallas angostas, elige qué tarjeta se ve en la hoja inferior. */
    function updateDock() {
        document.body.classList.toggle('has-panel', !!(S.details.left || S.details.right));
        var cols = shownColumns();
        Array.prototype.forEach.call(document.querySelectorAll('.dock-btn'), function (b) {
            var m = b.dataset.module;
            var on = S.mobileCard === m;
            b.classList.toggle('is-open', on);
            b.setAttribute('aria-pressed', String(on));
            b.hidden = !cols[COLUMN_OF[m]];
            b.title = MODULE_TITLES[m];
        });
    }

    function selectMobileCard(name) {
        if (MODULES.indexOf(name) === -1) return;
        var side = COLUMN_OF[name];
        if (S.details[side] && S.details[side] !== name) closeModule(S.details[side], false, { focus: false });
        var other = side === 'left' ? 'right' : 'left';
        if (S.details[other]) closeModule(S.details[other], false, { focus: false });
        S.mobileCard = name;
        document.body.dataset.mobileCard = name;
        document.body.dataset.mobileCol = side;
        updateDock();
        if (root.AvotexRecorrido) root.AvotexRecorrido.layout();
    }

    // ───────────────────────── capa escénica 3D (decorativa) ─────────────────────────

    function rectOf(el) {
        var r = el.getBoundingClientRect();
        return { left: r.left, top: r.top, right: r.right, bottom: r.bottom };
    }
    function visibleRects(selector) {
        return Array.prototype.filter.call(document.querySelectorAll(selector), function (el) {
            return el.offsetParent !== null && el.getBoundingClientRect().width > 0;
        }).map(rectOf);
    }

    /* Red del recorrido: concentrada en los laterales y en los bordes de las tarjetas. */
    function hudFxLayout(w, h) {
        var anchors = [], zones = [];
        var cols = shownColumns();
        var band = Math.min(150, w * 0.08);
        if (!isMobile()) {
            ['left', 'right'].forEach(function (side) {
                if (!cols[side]) return;
                var col = colEl(side);
                if (!col || col.offsetParent === null) return;
                var items = col.dataset.showing
                    ? [panelEl(col.dataset.showing)]
                    : Array.prototype.slice.call(col.querySelectorAll(':scope > .xcard')).filter(function (c) { return !c.classList.contains('is-fit-off'); });
                items.forEach(function (el) { if (el && el.offsetParent !== null) anchors.push({ rect: rectOf(el), side: side }); });
                var cr = rectOf(col);
                zones.push(side === 'left'
                    ? { left: 0, right: Math.min(w * 0.45, cr.right + band), top: 30, bottom: h - 24 }
                    : { left: Math.max(w * 0.55, cr.left - band), right: w, top: 30, bottom: h - 24 });
            });
        }
        if (!zones.length) {
            // Pantalla central de ScreenX o celular: solo un borde fino, la panorámica queda despejada.
            zones.push({ left: 0, right: w * 0.07, top: h * 0.18, bottom: h * 0.86, weight: 0.45, depth: 320 });
            zones.push({ left: w * 0.93, right: w, top: h * 0.18, bottom: h * 0.86, weight: 0.45, depth: 320 });
        }
        var avoid = visibleRects('.hud-brand-bar, .hud-actions, #hudLocation, #svNav, #hudDock, #sxBanner, #svStatus');
        return {
            anchors: anchors, zones: zones, avoid: avoid,
            seed: S.role === 'left' ? 5 : (S.role === 'right' ? 13 : 7),
            density: S.mode === 'screenx' ? 0.8 : 1,
            maxDistance: 200
        };
    }

    /* Red del selector: bordes, follaje y contorno exterior de las previsualizaciones. */
    function selFxLayout(w, h) {
        // Contorno exterior de cada previsualización (la unión de sus monitores).
        var anchors = Array.prototype.map.call(document.querySelectorAll('#modeSelector .pv-rig'), function (rig, i) {
            var r = null;
            Array.prototype.forEach.call(rig.querySelectorAll('.pv-monitor'), function (m) {
                var q = rectOf(m);
                r = r ? { left: Math.min(r.left, q.left), top: Math.min(r.top, q.top), right: Math.max(r.right, q.right), bottom: Math.max(r.bottom, q.bottom) } : q;
            });
            return { rect: r || rectOf(rig), side: i === 0 ? 'left' : 'right' };
        });
        var avoid = visibleRects('#selHeading, #modeSelector .sel-card-body, #modeSelector .sel-top');
        return {
            anchors: anchors,
            avoid: avoid,
            zones: [
                { left: 0, right: w * 0.16, top: h * 0.08, bottom: h, depth: 600 },
                { left: w * 0.84, right: w, top: h * 0.08, bottom: h, depth: 600 },
                { left: w * 0.16, right: w * 0.84, top: h * 0.86, bottom: h, weight: 0.7, depth: 500 }
            ],
            seed: 3,
            density: 0.9,
            maxDistance: 230
        };
    }

    function syncFx() {
        var wantHud = S.mode === 'normal' || S.mode === 'screenx';
        var wantSel = S.mode === 'selector';
        var low = S.mode === 'screenx';
        if (S.fx.hud && (!wantHud || S.fx.hudLow !== low)) { S.fx.hud.destroy(); S.fx.hud = null; }
        if (S.fx.sel && !wantSel) { S.fx.sel.destroy(); S.fx.sel = null; }
        if (!root.AvotexFx) return;
        if (wantHud && !S.fx.hud) {
            S.fx.hudLow = low;
            S.fx.hud = root.AvotexFx.mount($('hudFx'), { layout: hudFxLayout, lowPower: low });
        }
        if (wantSel && !S.fx.sel) {
            S.fx.sel = root.AvotexFx.mount($('selFx'), { layout: selFxLayout, lowPower: false });
        }
    }

    var fxRefreshTimer = null;
    function scheduleFxRefresh() {
        clearTimeout(fxRefreshTimer);
        // Se espera a que terminen las transiciones de las tarjetas para medir su lugar final.
        fxRefreshTimer = setTimeout(function () { if (S.fx.hud) S.fx.hud.refresh(); }, 420);
    }

    function fxFocus(el) {
        if (!S.fx.hud) return;
        S.fx.hud.setFocus(el ? rectOf(el) : null);
    }

    // ───────────────────────── fondo animado del selector ─────────────────────────
    /*
     * Si existe assets/selector/huerta-loop.(webm|mp4), se reproduce como bucle silencioso sobre
     * la foto. Sin el archivo, con movimiento reducido o si falla la reproducción, se queda la
     * foto con sus capas animadas por CSS (que también se detienen con movimiento reducido).
     */
    var selVideoTried = false;
    function syncSelectorBackground() {
        var v = $('selBgVideo');
        if (!v) return;
        var still = root.AvotexFx ? root.AvotexFx.reducedMotion() : false;
        if (S.mode !== 'selector' || still) { try { v.pause(); } catch (e) { /* nada */ } return; }
        if (selVideoTried) { if (!v.hidden) { var p = v.play(); if (p && p.catch) p.catch(function () {}); } return; }
        selVideoTried = true;
        [['webm', 'video/webm'], ['mp4', 'video/mp4']].forEach(function (t) {
            var src = v.dataset['src' + t[0].charAt(0).toUpperCase() + t[0].slice(1)];
            if (!src) return;
            var so = document.createElement('source');
            so.src = src; so.type = t[1];
            v.appendChild(so);
        });
        v.addEventListener('canplay', function () {
            if (S.mode !== 'selector') return;
            v.hidden = false;
            document.getElementById('modeSelector').classList.add('has-video');
            var p = v.play();
            if (p && p.catch) p.catch(function () { v.hidden = true; });
        }, { once: true });
        v.addEventListener('error', function () { v.hidden = true; }, true);
        v.preload = 'auto';
        try { v.load(); } catch (e) { /* sin video: queda la foto */ }
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
        updateColumns();
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
        var navBtn = e.target.closest('#svNav [data-nav]');
        if (navBtn) { if (!navBtn.disabled) onNavButton(navBtn.dataset.nav); return; }

        if (panelBtn) {
            var panel = panelBtn.closest('.fpanel');
            if (panel) closeModule(panel.dataset.module, false);
            return;
        }
        var detailBtn = e.target.closest('button[data-detail]');
        if (detailBtn) { openModule(detailBtn.dataset.detail); return; }
        if (dockBtn) { selectMobileCard(dockBtn.dataset.module); return; }
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
            case 'close-scans': setScans(false, { propagate: true }); break;
            case 'close-board': setBoard(false, { propagate: true }); break;
            case 'board-prev': changeBoard(-1); break;
            case 'board-next': changeBoard(1); break;
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
        // Teclas de respaldo para el operador del stand: E = escaneos, M = módulos (como los gestos).
        var editable = e.target && (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable);
        var plain = !e.ctrlKey && !e.metaKey && !e.altKey && !editable && (S.mode === 'normal' || S.mode === 'screenx');
        if (plain && (e.key === 'e' || e.key === 'E')) { toggleScans(); return; }
        if (e.key !== 'Escape') return;
        if (S.scans.on) { setScans(false, { propagate: true }); return; }
        if (S.board.on) { setBoard(false, { propagate: true }); return; }
        var modal = $('indexHelpModal');
        if (modal && modal.classList.contains('is-open')) return; // lo cierra el código existente
        if (!$('hudUserMenu').hidden) { toggleUserMenu(false); return; }
        if (!$('sxCalibration').hidden) { $('sxCalibration').hidden = true; return; }
        if (S.openModule && (S.mode === 'normal' || S.mode === 'screenx')) closeModule(S.openModule, false);
    }

    /* Enfocar o señalar una tarjeta ilumina su borde y los nodos cercanos de la capa 3D. */
    function bindCardFocus() {
        ['colLeft', 'colRight'].forEach(function (id) {
            var col = $(id);
            if (!col) return;
            var target = function (e) { return e.target.closest && e.target.closest('.xcard, .fpanel'); };
            col.addEventListener('pointerover', function (e) { var t = target(e); if (t) fxFocus(t); });
            col.addEventListener('pointerleave', function () { fxFocus(null); });
            col.addEventListener('focusin', function (e) { var t = target(e); if (t) fxFocus(t); });
            col.addEventListener('focusout', function (e) { if (!col.contains(e.relatedTarget)) fxFocus(null); });
        });
    }

    /* Con una capa abierta (escaneos o módulos), ← → cambian su contenido y las teclas no mueven la huerta. */
    function onScanKeys(e) {
        if (!S.scans.on && !S.board.on) return;
        if (e.target && (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) || e.target.isContentEditable)) return;
        if (!/^(Arrow(Up|Down|Left|Right)|PageUp|PageDown|Home|End|\+|-|=|_|[wasdWASD])$/.test(e.key)) return;
        e.preventDefault();
        e.stopPropagation();
        var step = e.key === 'ArrowRight' ? 1 : (e.key === 'ArrowLeft' ? -1 : 0);
        if (!step) return;
        if (S.scans.on) changeScans(step);
        else changeBoard(step);
    }

    function bindUi() {
        document.addEventListener('click', onClick);
        document.addEventListener('keydown', onScanKeys, true);
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
            updateColumns();
        });
        // Las tarjetas secundarias aparecen o se ocultan según el espacio: la red se reacomoda.
        document.addEventListener('avotex:layout', scheduleFxRefresh);
        bindCardFocus();
        ['pointermove', 'pointerdown', 'keydown', 'touchstart'].forEach(function (evName) {
            document.addEventListener(evName, wakeNavPad, { passive: true });
        });
        wakeNavPad();
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

    var LOGOUT_KEY = 'avotex_logout_at';

    function onSessionEnded() {
        // Si la sesión terminó porque la persona cerró sesión en otra ventana, se va al login
        // aunque el aviso de Firebase llegue antes que el mensaje "logout" del canal.
        var at = 0;
        try { at = Number(localStorage.getItem(LOGOUT_KEY)) || 0; } catch (e) { /* nada */ }
        if (at && Date.now() - at < 15000) {
            leaveScreenX({ silent: true });
            S.mode = 'ended';
            root.location.replace('dashboard.html');
            return;
        }
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
        if (root.AvotexGestos) root.AvotexGestos.setContext({ allowed: false });
        try { localStorage.setItem(LOGOUT_KEY, String(Date.now())); } catch (e) { /* nada */ }
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
        toggleScans: toggleScans,
        changeScans: changeScans,
        toggleBoard: toggleBoard,
        changeBoard: changeBoard,
        // Solo para diagnóstico en consola y pruebas automáticas.
        _debug: function () {
            return {
                mode: S.mode, role: S.role, windowId: S.windowId, activeHuertaId: S.activeHuertaId,
                huertasStatus: S.huertasStatus, openModule: S.openModule, details: Object.assign({}, S.details),
                columns: shownColumns(), fx: { hud: S.fx.hud && S.fx.hud.state, selector: S.fx.sel && S.fx.sel.state },
                calibration: S.calibration,
                stageResult: S.stageResult && { status: S.stageResult.status, pano: S.stageResult.pano },
                camera: S.stage && S.stage.getCamera(), lastCenterCamera: S.lastCenterCamera,
                summary: sxSummary(), synced: !!(S.sx && S.sx.synced),
                scans: { on: S.scans.on, group: S.scans.group, groups: S.scans.groups },
                board: { on: S.board.on, offset: S.board.offset, shown: S.board.shown }
            };
        }
    };
})(window);
