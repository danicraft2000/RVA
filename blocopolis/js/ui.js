// Blocópolis — interface: barra de ferramentas, painéis, menus e controles de toque

class UI {
  constructor(game) {
    this.g = game;
    this.iconCache = {};
    this.hintTimer = null;
    this.toastTimer = null;
    this.prevSpeed = 1;
    this.joy = null;
    this.lookPtr = null;
    document.body.classList.add(IS_TOUCH ? 'touch' : 'desk');

    this.buildToolbar();
    this.bindTop();
    this.bindStart();
    this.bindMenu();
    this.bindPalette();
    this.bindFp();
    this.el('toolPanel').addEventListener('click', (e) => this.onPanelClick(e));
    this.showStart();
  }

  el(id) {
    return document.getElementById(id);
  }

  show(id, on = true) {
    this.el(id).classList.toggle('hidden', !on);
  }

  icon(id) {
    if (!this.iconCache[id]) this.iconCache[id] = this.g.atlas.icon(id);
    return this.iconCache[id];
  }

  toast(msg, ms = 2600) {
    const t = this.el('toast');
    t.textContent = msg;
    t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => t.classList.remove('on'), ms);
  }

  // ---------------------------------------------------------------- telas

  showStart() {
    this.show('startScreen');
    this.show('startMain');
    this.show('newWorldForm', false);
    this.show('btnContinue', SaveStore.has());
    this.show('hud', false);
    this.show('fpHud', false);
  }

  showCity() {
    this.show('startScreen', false);
    this.show('loading', false);
    this.show('hud');
    this.show('fpHud', false);
    this.renderTools();
    this.updateStats();
  }

  showExplore() {
    this.show('hud', false);
    this.show('fpHud');
    this.refreshHotbar();
    this.show('lockPrompt', !IS_TOUCH && !this.g.fp.locked);
    if (IS_TOUCH) this.toast('Joystick à esquerda · arraste à direita para olhar · ⬆️ duas vezes para voar', 3500);
  }

  setLocked(locked) {
    if (this.g.mode !== 'explore' || IS_TOUCH) return;
    this.show('lockPrompt', !locked && this.el('paletteOverlay').classList.contains('hidden'));
  }

  modalOpen() {
    return ['menu', 'help', 'paletteOverlay', 'startScreen', 'loading'].some((id) => !this.el(id).classList.contains('hidden'));
  }

  closeModals() {
    for (const id of ['menu', 'help', 'paletteOverlay']) this.show(id, false);
    if (this.g.mode === 'explore') this.setLocked(this.g.fp.locked);
  }

  withLoading(fn) {
    this.show('loading');
    this.show('startScreen', false);
    this.show('menu', false);
    setTimeout(() => {
      try {
        fn();
      } catch (err) {
        console.error(err);
        this.show('loading', false);
        if (!this.g.world) this.showStart();
        this.toast('⚠️ ' + err.message, 4000);
        return;
      }
      this.show('loading', false);
    }, 60);
  }

  // ---------------------------------------------------------------- topo

  bindTop() {
    this.el('btnSpeed').addEventListener('click', () => {
      const order = [1, 2, 3, 0];
      this.g.speed = order[(order.indexOf(this.g.speed) + 1) % order.length];
      if (this.g.speed) this.prevSpeed = this.g.speed;
      this.updateSpeed();
    });
    this.el('btnDay').addEventListener('click', () => {
      const order = ['ciclo', 'dia', 'noite'];
      this.g.dayMode = order[(order.indexOf(this.g.dayMode) + 1) % 3];
      this.toast({ ciclo: '🔄 Dia e noite passando', dia: '☀️ Sempre de dia', noite: '🌙 Sempre de noite' }[this.g.dayMode], 1500);
      this.updateStats();
    });
    this.el('btnMenu').addEventListener('click', () => this.openMenu());
  }

  togglePause() {
    if (this.g.speed) { this.prevSpeed = this.g.speed; this.g.speed = 0; }
    else this.g.speed = this.prevSpeed || 1;
    this.updateSpeed();
  }

  updateSpeed() {
    const s = this.g.speed;
    this.el('btnSpeed').textContent = s === 0 ? '⏸ Pausa' : s === 1 ? '▶ 1x' : s === 2 ? '⏩ 2x' : '⏭ 3x';
    this.el('btnSpeed').classList.toggle('paused', s === 0);
  }

  updateStats() {
    const g = this.g;
    if (!g.city) return;
    const fmt = (n) => n.toLocaleString('pt-BR');
    this.el('statPop').textContent = fmt(g.city.stats.pop);
    this.el('statJobs').textContent = fmt(g.city.stats.jobs);
    this.el('statCount').textContent = fmt(g.city.stats.count);
    this.el('cityName').textContent = g.meta.name;
    this.el('cityTitle').textContent = `${g.city.title()} · ${g.clockText()}`;
    const icon = g.dayMode === 'dia' ? '☀️' : g.dayMode === 'noite' ? '🌙' : (g.isNight ? '🌙🔄' : '☀️🔄');
    this.el('btnDay').textContent = icon;
  }

  // ---------------------------------------------------------------- ferramentas

  buildToolbar() {
    const bar = this.el('toolbar');
    TOOLS.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.title = `${t.label} (${i === 9 ? 0 : i + 1})`;
      b.innerHTML = `<span class="ti">${t.icon}</span><span class="tl">${t.label}</span>`;
      b.addEventListener('click', () => this.g.setTool(t.id));
      bar.appendChild(b);
    });
  }

  renderTools() {
    const g = this.g, t = g.tool;
    for (const b of this.el('toolbar').children) b.classList.toggle('on', b.dataset.tool === t);
    const seg = (act, items, cur) => `<div class="seg">${items.map(([v, label]) =>
      `<button data-act="${act}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${label}</button>`).join('')}</div>`;
    let html = '';
    let hint = '';
    switch (t) {
      case 'navegar':
        hint = IS_TOUCH ? 'Arraste para mover · 2 dedos giram e dão zoom · toque num prédio para ver detalhes'
          : 'Arraste para mover · botão direito gira · roda dá zoom · clique num prédio para ver detalhes';
        break;
      case 'estrada':
        hint = 'Arraste para desenhar uma estrada reta. Ela sobe e desce morros e vira ponte sobre a água.';
        break;
      case 'res': case 'com': case 'ind': {
        const z = TOOLS.find((x) => x.id === t).zone;
        html = seg('zoneErase', [[0, '🖌️ Pintar zona'], [1, '🧽 Apagar zona']], g.opts.zoneErase ? 1 : 0);
        const what = { 1: 'casas e prédios residenciais', 2: 'lojas, escritórios e arranha-céus', 3: 'galpões e fábricas' }[z];
        hint = `Arraste para pintar ao lado das ruas: ${what} nascem sozinhos!`;
        break;
      }
      case 'especial': {
        html = '<div class="specials">' + Object.entries(SPECIALS).map(([k, s]) =>
          `<button data-act="special" data-v="${k}" class="${g.opts.special === k ? 'on' : ''}"><span class="ti">${s.icon}</span><span class="tl">${s.name}</span></button>`).join('') + '</div>';
        html += '<div class="row">';
        html += '<button data-act="rotate">↻ Girar</button>';
        if (g.pendingSpecial) html += '<button data-act="confirm" class="go">✔ Construir aqui</button><button data-act="cancel">✖</button>';
        html += '</div>';
        hint = IS_TOUCH ? 'Toque no mapa para escolher o lugar e depois em ✔ Construir. A borda branca é a frente.'
          : 'Clique para construir · R ou botão direito gira · a borda branca é a frente';
        break;
      }
      case 'blocos':
        html = seg('blockMode', [['place', '➕ Colocar'], ['break', '⛏️ Quebrar'], ['pick', '💧 Copiar']], g.opts.blockMode);
        html += '<div class="palette">' + PALETTE_ORDER.map((id) =>
          `<button data-act="block" data-v="${id}" class="pb ${g.selectedBlock === id ? 'on' : ''}" title="${BLOCK_DEFS[id].name}"><img src="${this.icon(id)}" alt=""></button>`).join('') + '</div>';
        hint = IS_TOUCH ? `Toque num bloco · bloco atual: ${BLOCK_DEFS[g.selectedBlock].name}`
          : `Clique esq. coloca, direito quebra · bloco atual: ${BLOCK_DEFS[g.selectedBlock].name}`;
        break;
      case 'terreno':
        html = seg('terrainMode', [['raise', '⬆️ Elevar'], ['lower', '⬇️ Rebaixar'], ['flatten', '▬ Nivelar']], g.opts.terrainMode);
        html += seg('brush', [[1, 'Pincel P'], [2, 'M'], [4, 'G']], g.opts.brush);
        hint = 'Arraste sobre o chão. Rebaixe abaixo do mar para criar lagos.';
        break;
      case 'demolir':
        hint = 'Arraste sobre prédios, ruas, zonas e árvores para remover.';
        break;
      default:
        break;
    }
    if (IS_TOUCH && t !== 'navegar') hint += ' · 2 dedos movem a câmera';
    html += `<div class="hint" id="toolHint">${hint}</div>`;
    this.defaultHint = hint;
    const p = this.el('toolPanel');
    p.innerHTML = html;
    p.classList.toggle('hidden', false);
  }

  onPanelClick(e) {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const g = this.g, v = b.dataset.v;
    switch (b.dataset.act) {
      case 'zoneErase': g.opts.zoneErase = v === '1'; break;
      case 'special': g.opts.special = v; g.pendingSpecial = null; g.clearPreview(); break;
      case 'rotate': g.rotateSpecial(); break;
      case 'confirm': g.confirmSpecial(); return;
      case 'cancel': g.cancelSpecial(); return;
      case 'blockMode': g.opts.blockMode = v; break;
      case 'block': this.chooseBlock(Number(v)); break;
      case 'terrainMode': g.opts.terrainMode = v; break;
      case 'brush': g.opts.brush = Number(v); break;
      default: break;
    }
    this.renderTools();
  }

  chooseBlock(id) {
    const g = this.g;
    const i = g.hotbar.indexOf(id);
    if (i >= 0) g.slot = i;
    else g.hotbar[g.slot] = id;
    if (g.opts.blockMode === 'pick') g.opts.blockMode = 'place';
    this.refreshHotbar();
  }

  setHint(text) {
    const h = this.el('toolHint');
    if (!h) return;
    h.textContent = text;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => {
      const hh = this.el('toolHint');
      if (hh) hh.textContent = this.defaultHint;
    }, 1500);
  }

  hintPulse() {
    const h = this.el('toolHint');
    if (!h) return;
    h.classList.remove('pulse');
    void h.offsetWidth;
    h.classList.add('pulse');
  }

  // ---------------------------------------------------------------- início

  bindSeg(id, onPick) {
    const el = this.el(id);
    el.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      for (const x of el.children) x.classList.toggle('on', x === b);
      if (onPick) onPick(b.dataset.v);
    });
  }

  segValue(id) {
    const on = this.el(id).querySelector('.on');
    return on ? on.dataset.v : null;
  }

  bindStart() {
    this.bindSeg('segTerrain');
    this.bindSeg('segSize');
    this.el('btnNewWorld').addEventListener('click', () => {
      this.show('startMain', false);
      this.show('newWorldForm');
    });
    this.el('btnBack').addEventListener('click', () => {
      this.show('newWorldForm', false);
      this.show('startMain');
    });
    this.el('btnContinue').addEventListener('click', () => {
      this.withLoading(() => {
        this.g.loadFromData(SaveStore.read());
        this.toast(`Bem-vindo de volta a ${this.g.meta.name}!`);
      });
    });
    this.el('btnImport').addEventListener('click', () => this.importFile());
    this.el('btnHelpStart').addEventListener('click', () => this.show('help'));
    this.el('newWorldForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const opts = {
        name: this.el('inName').value.trim() || 'Blocópolis',
        terrain: this.segValue('segTerrain') || 'planicie',
        size: this.segValue('segSize') || 'medio',
        seed: this.el('inSeed').value,
      };
      this.withLoading(() => {
        this.g.newWorld(opts);
        this.toast('Dica: pinte zonas 🏠 ao lado da estrada e veja a cidade nascer!', 5000);
      });
    });
    this.el('helpClose').addEventListener('click', () => this.show('help', false));
  }

  importFile() {
    SaveStore.pickFile().then((data) => {
      this.withLoading(() => {
        this.g.loadFromData(data);
        this.g.save(false);
        this.toast(`📂 ${this.g.meta.name} carregada!`);
      });
    }).catch((err) => this.toast('⚠️ Não consegui abrir o arquivo: ' + err.message, 4000));
  }

  // ---------------------------------------------------------------- menu

  openMenu() {
    for (const b of this.el('segQuality').children) b.classList.toggle('on', b.dataset.v === this.g.quality);
    this.show('menu');
  }

  bindMenu() {
    this.bindSeg('segQuality', (v) => this.g.setQuality(v));
    this.el('mSave').addEventListener('click', () => this.g.save(true));
    this.el('mRename').addEventListener('click', () => {
      const name = prompt('Nome da cidade:', this.g.meta.name);
      if (name && name.trim()) {
        this.g.meta.name = name.trim().slice(0, 24);
        this.updateStats();
        this.g.save(false);
      }
    });
    this.el('mExport').addEventListener('click', () => {
      SaveStore.download(this.g.serialize(), this.g.meta.name);
      this.toast('📤 Arquivo baixado! Abra no outro aparelho com "Abrir arquivo".', 3500);
    });
    this.el('mImport').addEventListener('click', () => this.importFile());
    this.el('mHelp').addEventListener('click', () => this.show('help'));
    this.el('mNew').addEventListener('click', () => {
      if (!confirm('Começar uma cidade nova? A cidade atual será substituída no salvamento do navegador. (Dica: use "Baixar arquivo da cidade" antes para guardar uma cópia.)')) return;
      this.show('menu', false);
      this.g.save(false);
      this.show('hud', false);
      this.show('startScreen');
      this.show('startMain', false);
      this.show('newWorldForm');
    });
    this.el('mClose').addEventListener('click', () => this.show('menu', false));
  }

  // ---------------------------------------------------------------- paleta e barra rápida

  bindPalette() {
    const big = this.el('paletteBig');
    big.innerHTML = PALETTE_ORDER.map((id) =>
      `<button data-v="${id}" class="pb" title="${BLOCK_DEFS[id].name}"><img src="${this.icon(id)}" alt=""><span>${BLOCK_DEFS[id].name}</span></button>`).join('');
    big.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (!b) return;
      const id = Number(b.dataset.v);
      this.g.hotbar[this.g.slot] = id;
      this.refreshHotbar();
      this.closePalette();
    });
    this.el('paletteClose').addEventListener('click', () => this.closePalette());
  }

  openPalette() {
    if (document.pointerLockElement) document.exitPointerLock();
    this.show('lockPrompt', false);
    this.show('paletteOverlay');
  }

  closePalette() {
    this.show('paletteOverlay', false);
    if (this.g.mode === 'explore') this.setLocked(this.g.fp.locked);
  }

  refreshHotbar() {
    const g = this.g;
    const bar = this.el('hotbar');
    let html = g.hotbar.map((id, i) =>
      `<button data-slot="${i}" class="slot ${i === g.slot ? 'on' : ''}" title="${BLOCK_DEFS[id].name}"><img src="${this.icon(id)}" alt=""><i>${i + 1}</i></button>`).join('');
    html += '<button data-slot="more" class="slot more" title="Todos os blocos (E)">⋯</button>';
    bar.innerHTML = html;
  }

  // ---------------------------------------------------------------- primeira pessoa

  bindFp() {
    const g = this.g;
    this.el('hotbar').addEventListener('click', (e) => {
      const b = e.target.closest('[data-slot]');
      if (!b) return;
      if (b.dataset.slot === 'more') { this.openPalette(); return; }
      g.slot = Number(b.dataset.slot);
      this.refreshHotbar();
    });
    this.el('btnExitFp').addEventListener('click', () => g.exitExplore());
    this.el('btnLock').addEventListener('click', () => g.fp.requestLock());

    const touch = this.el('fpTouch');
    const joy = this.el('joystick'), knob = this.el('joyKnob');
    const R = 50;
    touch.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') {
        if (!g.fp.locked) g.fp.requestLock();
        return;
      }
      try { touch.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
      if (e.clientX < window.innerWidth * 0.45 && !this.joy) {
        this.joy = { id: e.pointerId, x: e.clientX, y: e.clientY };
        joy.style.left = e.clientX + 'px';
        joy.style.top = e.clientY + 'px';
        knob.style.transform = 'translate(-50%, -50%)';
        this.show('joystick');
      } else if (!this.lookPtr) {
        this.lookPtr = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
    });
    touch.addEventListener('pointermove', (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        let dx = e.clientX - this.joy.x, dy = e.clientY - this.joy.y;
        const d = Math.hypot(dx, dy);
        if (d > R) { dx = dx / d * R; dy = dy / d * R; }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        g.fp.move.x = dx / R;
        g.fp.move.z = dy / R;
        g.fp.sprint = d > R * 1.6;
      } else if (this.lookPtr && e.pointerId === this.lookPtr.id) {
        g.fp.look((e.clientX - this.lookPtr.x) * 0.0055, (e.clientY - this.lookPtr.y) * 0.0055);
        this.lookPtr.x = e.clientX;
        this.lookPtr.y = e.clientY;
      }
    });
    const end = (e) => {
      if (this.joy && e.pointerId === this.joy.id) {
        this.joy = null;
        g.fp.move.x = 0; g.fp.move.z = 0; g.fp.sprint = false;
        this.show('joystick', false);
      }
      if (this.lookPtr && e.pointerId === this.lookPtr.id) this.lookPtr = null;
    };
    touch.addEventListener('pointerup', end);
    touch.addEventListener('pointercancel', end);

    for (const b of document.querySelectorAll('[data-fp]')) {
      const kind = b.dataset.fp;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        try { b.setPointerCapture(e.pointerId); } catch (err) { /* ignora */ }
        b.classList.add('down');
        if (kind === 'break' || kind === 'place') g.startFpHold(kind);
        else if (kind === 'jump') { g.fp.tapJump(); g.fp.jumpHeld = true; }
        else if (kind === 'down') g.fp.downHeld = true;
        else if (kind === 'fly') this.toast(g.fp.toggleFly() ? '🕊️ Voando' : '🚶 Andando', 900);
      });
      const up = () => {
        b.classList.remove('down');
        if (kind === 'break' || kind === 'place') g.stopFpHold();
        else if (kind === 'jump') g.fp.jumpHeld = false;
        else if (kind === 'down') g.fp.downHeld = false;
      };
      b.addEventListener('pointerup', up);
      b.addEventListener('pointercancel', up);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }
}
