import './style.css';
import { COUNTRIES, CONTINENTS, BY_ID } from './countries.js';
import { createMatcher } from './text.js';
import { createProgress, pickNext } from './progress.js';
import { createMap } from './map.js';

const $ = (sel) => document.querySelector(sel);
const matcher = createMatcher(COUNTRIES);
const progress = createProgress();
const nameOf = (id) => BY_ID.get(id).name;
const byName = (a, b) => nameOf(a).localeCompare(nameOf(b), 'es');

const store = {
  get(key, fallback) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignorar: sin almacenamiento
    }
  },
};

const REGIONS = [{ id: 'all', label: 'Todo el mundo' }, ...CONTINENTS];
const idsIn = (region) => COUNTRIES.filter((c) => region === 'all' || c.continent === region).map((c) => c.id);

// ---------- Mapa y etiqueta ----------
const tooltip = $('#tooltip');
let hoverEnabled = () => false;
let onMapClick = () => {};
let pinnedUntil = 0;

function showTip(id, event, kind = '') {
  const box = $('.stage').getBoundingClientRect();
  tooltip.textContent = nameOf(id);
  tooltip.className = `tooltip ${kind}`;
  tooltip.style.left = `${event.clientX - box.left}px`;
  tooltip.style.top = `${event.clientY - box.top}px`;
  tooltip.hidden = false;
}

const map = createMap($('#map'), {
  onClick: (id, event) => onMapClick(id, event),
  onHover(id, event) {
    if (Date.now() < pinnedUntil) return;
    if (!id || !hoverEnabled(id)) return (tooltip.hidden = true);
    showTip(id, event);
  },
});

document.querySelectorAll('[data-zoom]').forEach((b) =>
  b.addEventListener('click', () => {
    const z = b.dataset.zoom;
    if (z === 'reset') {
      // Encuadra la region con la que estas jugando.
      const region = current?.region ?? 'all';
      CONTINENTS.some((c) => c.id === region) ? map.zoomToContinent(region) : map.reset();
    }
    else map.zoomBy(z === 'in' ? 1.8 : 1 / 1.8);
  }),
);

function dimOutside(region) {
  map.clearClass('dim');
  if (region === 'all' || region === 'fallos') return;
  for (const c of COUNTRIES) if (c.continent !== region) map.setClass(c.id, 'dim');
}

function chips(name, options, current, onChange) {
  const box = document.querySelector(`[data-chips="${name}"]`);
  box.innerHTML = '';
  for (const o of options) {
    const b = document.createElement('button');
    b.className = 'chip' + (o.id === current ? ' on' : '');
    b.textContent = o.label;
    b.addEventListener('click', () => {
      box.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === b));
      onChange(o.id);
    });
    box.append(b);
  }
}

const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Paneles plegables (boton Mas)
function setDrawer(id, open) {
  const drawer = document.getElementById(id);
  drawer.hidden = !open;
  document.querySelector(`[data-drawer="${id}"]`).setAttribute('aria-expanded', String(open));
}
document.querySelectorAll('[data-drawer]').forEach((b) =>
  b.addEventListener('click', () => setDrawer(b.dataset.drawer, document.getElementById(b.dataset.drawer).hidden)),
);

// ---------- RETO ----------
const TIME_LIMIT = { all: 15 * 60, Africa: 5 * 60, America: 4 * 60, Asia: 5 * 60, Europa: 5 * 60, Oceania: 2 * 60 };
const HELP_TEXT = '\u00bfNo sabes alguno? P\u00falsalo en el mapa: ver\u00e1s su nombre y contar\u00e1 como fallo.';

const reto = {
  region: 'all',
  found: new Set(),
  revealed: new Set(),
  recent: [],
  ids: [],
  running: false,
  ended: false,
  timed: store.get('paises-reto-contrarreloj', true),
  elapsed: 0,
  timer: null,
  pending: null,

  enter() {
    chips('reto', REGIONS, this.region, (r) => {
      this.region = r;
      this.reset();
    });
    this.renderTimed();
    hoverEnabled = (id) => this.ended || this.found.has(id) || this.revealed.has(id);
    onMapClick = (id, event) => id && this.reveal(id, event);
    this.reset();
  },
  leave() {
    this.stop();
  },
  reset() {
    this.stop();
    ['found', 'missed', 'flash', 'hl'].forEach((c) => map.clearClass(c));
    this.ids = idsIn(this.region);
    this.found.clear();
    this.revealed.clear();
    this.recent = [];
    this.running = false;
    this.ended = false;
    this.elapsed = 0;
    dimOutside(this.region);
    this.region === 'all' ? map.reset() : map.zoomToContinent(this.region);
    const input = $('#reto-input');
    input.disabled = false;
    input.value = '';
    $('#reto-result').hidden = true;
    setDrawer('reto-drawer', false);
    $('#reto-giveup').disabled = false;
    this.feedback(HELP_TEXT, '');
    this.render();
    input.focus({ preventScroll: true });
  },
  start() {
    if (this.running || this.ended) return;
    this.running = true;
    this.timer = setInterval(() => {
      this.elapsed++;
      this.render();
      if (this.timed && this.left() <= 0) this.end();
    }, 1000);
  },
  // Segundos que quedan en contrarreloj.
  left() {
    return TIME_LIMIT[this.region] - this.elapsed;
  },
  // Los records sin limite de tiempo se guardan aparte.
  recordKey() {
    return this.timed ? this.region : `${this.region}-libre`;
  },
  setTimed(timed) {
    this.timed = timed;
    store.set('paises-reto-contrarreloj', timed);
    this.renderTimed();
    this.reset();
  },
  renderTimed() {
    document.querySelectorAll('[data-timed]').forEach((b) => b.classList.toggle('on', (b.dataset.timed === '1') === this.timed));
  },
  stop() {
    clearInterval(this.timer);
    clearTimeout(this.pending);
  },
  isPending(id) {
    return this.ids.includes(id) && !this.found.has(id) && !this.revealed.has(id);
  },
  onInput(value) {
    if (this.ended) return;
    if (value.trim()) this.start();
    clearTimeout(this.pending);
    const id = matcher.find(value);
    if (!id || !this.ids.includes(id)) return;
    if (this.revealed.has(id)) return this.feedback(`${nameOf(id)} ya lo pulsaste en el mapa: cuenta como fallo.`, 'bad');
    if (!this.isPending(id)) return;
    // Si "Niger" puede seguir hasta "Nigeria", espera un momento (o Enter) antes de aceptarlo.
    if (matcher.isPrefixOfOther(value, id, (x) => this.isPending(x))) this.pending = setTimeout(() => this.accept(id), 900);
    else this.accept(id);
  },
  onEnter(value) {
    const id = matcher.find(value);
    if (id && this.isPending(id)) this.accept(id);
  },
  accept(id) {
    clearTimeout(this.pending);
    this.found.add(id);
    map.setClass(id, 'found');
    map.setClass(id, 'flash');
    setTimeout(() => map.setClass(id, 'flash', false), 700);
    $('#reto-input').value = '';
    this.pushRecent(id, 'ok');
    this.feedback('', '');
    this.render();
    if (this.found.size + this.revealed.size === this.ids.length) this.end();
  },
  // Pulsar un pais del mapa: dice su nombre y lo da por fallado.
  reveal(id, event) {
    if (!this.ids.includes(id)) return;
    showTip(id, event, this.found.has(id) ? 'ok' : 'bad');
    pinnedUntil = Date.now() + 2200;
    clearTimeout(this.tipTimer);
    this.tipTimer = setTimeout(() => (tooltip.hidden = true), 2200);
    if (this.ended || !this.isPending(id)) return;
    this.start();
    this.revealed.add(id);
    map.setClass(id, 'missed');
    this.pushRecent(id, 'bad');
    this.feedback(`${nameOf(id)}: cuenta como fallo.`, 'bad');
    this.render();
    $('#reto-input').focus({ preventScroll: true });
    if (this.found.size + this.revealed.size === this.ids.length) this.end();
  },
  pushRecent(id, kind) {
    this.recent = [{ id, kind }, ...this.recent].slice(0, 6);
  },
  feedback(text, kind) {
    const el = $('#reto-feedback');
    el.textContent = text;
    el.className = `feedback ${kind}`;
  },
  end() {
    this.stop();
    this.running = false;
    this.ended = true;
    $('#reto-input').disabled = true;
    $('#reto-giveup').disabled = true;
    const missed = this.ids.filter((id) => !this.found.has(id)).sort(byName);
    missed.forEach((id) => map.setClass(id, 'missed'));
    store.set('paises-ultimos-fallos', missed);

    const records = store.get('paises-records', {});
    const prev = records[this.recordKey()];
    const used = this.elapsed;
    if (!prev || this.found.size > prev.found || (this.found.size === prev.found && used < prev.time)) {
      records[this.recordKey()] = { found: this.found.size, time: used };
      store.set('paises-records', records);
    }

    const total = this.ids.length;
    $('#reto-result-title').textContent =
      missed.length === 0 ? `\u00a1Perfecto! Los ${total} en ${fmtTime(used)}` : `Has acertado ${this.found.size} de ${total}`;
    $('#reto-practice').hidden = missed.length === 0;
    this.feedback(
      missed.length
        ? `${this.found.size} de ${total}. En rojo los que te faltaron: toca o pasa el rat\u00f3n por encima.`
        : $('#reto-result-title').textContent,
      missed.length ? '' : 'good',
    );
    const box = $('#reto-missed');
    box.innerHTML = '';
    if (missed.length) {
      const summary = document.createElement('summary');
      summary.textContent = `Ver los ${missed.length} que faltaron`;
      box.append(summary);
    }
    for (const c of CONTINENTS) {
      const list = missed.filter((id) => BY_ID.get(id).continent === c.id);
      if (!list.length) continue;
      const h = document.createElement('h3');
      h.textContent = `${c.label} (${list.length})`;
      const ul = document.createElement('ul');
      ul.className = 'missed-list';
      for (const id of list) {
        const li = document.createElement('li');
        const b = document.createElement('button');
        b.className = 'missed-item';
        b.textContent = nameOf(id);
        b.addEventListener('click', () => {
          map.clearClass('hl');
          map.setClass(id, 'hl');
          map.zoomToCountry(id);
        });
        li.append(b);
        ul.append(li);
      }
      box.append(h, ul);
    }
    $('#reto-result').hidden = false;
    this.render();
  },
  render() {
    $('#reto-count').textContent = this.found.size;
    $('#reto-total').textContent = `/${this.ids.length}`;
    $('#reto-miss').textContent = this.revealed.size;
    $('#reto-timer').textContent = this.ended ? 'Fin' : fmtTime(this.timed ? this.left() : this.elapsed);
    $('#reto-timer').classList.toggle('low', this.timed && this.running && this.left() <= 30);
    const best = store.get('paises-records', {})[this.recordKey()];
    $('#reto-best').textContent = best ? `Tu r\u00e9cord: ${best.found}/${this.ids.length} en ${fmtTime(best.time)}` : '';

    const recent = $('#reto-recent');
    recent.innerHTML = '';
    for (const r of this.recent) {
      const li = document.createElement('li');
      li.className = r.kind;
      li.textContent = nameOf(r.id);
      recent.append(li);
    }

    // Leyenda del mapa: color de cada continente y cuantos llevas.
    const legend = $('#legend');
    legend.innerHTML = '';
    const conts = this.region === 'all' ? CONTINENTS : CONTINENTS.filter((c) => c.id === this.region);
    for (const c of conts) {
      const ids = idsIn(c.id);
      const n = ids.filter((id) => this.found.has(id)).length;
      const li = document.createElement('li');
      li.dataset.cont = c.id;
      li.innerHTML = '<span class="swatch"></span><span class="legend-name"></span><span class="legend-short" aria-hidden="true"></span><span class="legend-n"></span>';
      li.children[1].textContent = c.label;
      li.children[2].textContent = c.label.slice(0, 2);
      li.children[3].textContent = `${n}/${ids.length}`;
      legend.append(li);
    }
  },
};

$('#reto-input').addEventListener('input', (e) => reto.onInput(e.target.value));
$('#reto-input').addEventListener('keydown', (e) => e.key === 'Enter' && reto.onEnter(e.target.value));
$('#reto-giveup').addEventListener('click', () => {
  if (reto.ended) return;
  if (!reto.running || confirm('\u00bfTe rindes? Ver\u00e1s en rojo los pa\u00edses que te faltan.')) reto.end();
});
$('#reto-restart').addEventListener('click', () => reto.reset());
$('#reto-practice').addEventListener('click', () => {
  practice.region = 'fallos';
  setMode('practicar');
});

// ---------- PRACTICAR ----------
const practice = {
  region: 'all',
  mode: store.get('paises-modo-practica', 'escribir'),
  pool: [],
  target: null,
  recent: [],
  hint: 0,
  failed: false,
  done: false,
  streak: 0,
  nextTimer: null,
  answered: new Map(), // id -> ok | hinted | fail en la ronda actual
  roundOver: false,

  enter() {
    const regions = [...REGIONS, { id: 'fallos', label: '\u00daltimos fallos' }];
    chips('practicar', regions, this.region, (r) => {
      this.region = r;
      this.start();
    });
    hoverEnabled = (id) => this.answered.has(id) || (this.done && id === this.target);
    onMapClick = () => {};
    this.renderMode();
    this.start();
  },
  leave() {
    clearTimeout(this.nextTimer);
    map.clearClass('target');
  },
  start() {
    this.pool = this.region === 'fallos' ? store.get('paises-ultimos-fallos', []) : idsIn(this.region);
    this.recent = [];
    this.answered.clear();
    this.roundOver = false;
    ['p-ok', 'p-hint', 'p-miss'].forEach((c) => map.clearClass(c));
    dimOutside(this.region);
    const empty = this.pool.length === 0;
    $('#practice-empty').hidden = !empty;
    $('#practice-box').hidden = empty;
    this.renderStats();
    if (empty) {
      map.clearClass('target');
      return map.reset();
    }
    this.next();
  },
  next() {
    clearTimeout(this.nextTimer);
    map.clearClass('target');
    tooltip.hidden = true;
    if (this.roundOver) return this.start();
    const remaining = this.pool.filter((id) => !this.answered.has(id));
    if (!remaining.length) return this.finishRound();
    this.target = pickNext(remaining, progress);
    this.hint = 0;
    this.failed = false;
    this.done = false;
    map.setClass(this.target, 'target');
    map.zoomToCountry(this.target);
    const input = $('#practice-input');
    input.value = '';
    input.disabled = false;
    input.placeholder = 'Nombre del pa\u00eds';
    $('#practice-feedback').textContent = '';
    $('#practice-feedback').className = 'feedback';
    $('#practice-next').hidden = true;
    $('#practice-hint').hidden = false;
    $('#practice-skip').hidden = false;
    $('#practice-next').textContent = 'Siguiente';
    this.renderCount();
    this.renderOptions();
    if (this.mode === 'escribir') input.focus({ preventScroll: true });
  },
  renderMode() {
    document.querySelectorAll('[data-pmode]').forEach((b) => b.classList.toggle('on', b.dataset.pmode === this.mode));
    $('#practice-input').hidden = this.mode !== 'escribir';
    $('#practice-options').hidden = this.mode !== 'opciones';
  },
  renderOptions() {
    const box = $('#practice-options');
    box.innerHTML = '';
    if (this.mode !== 'opciones') return;
    const t = BY_ID.get(this.target);
    // Distractores del mismo continente para que no sea demasiado facil.
    const others = COUNTRIES.filter((c) => c.continent === t.continent && c.id !== t.id)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map((c) => c.id);
    const opts = [...others, t.id].sort(() => Math.random() - 0.5);
    for (const id of opts) {
      const b = document.createElement('button');
      b.className = 'option';
      b.textContent = nameOf(id);
      b.addEventListener('click', () => {
        if (this.done) return;
        if (id === this.target) {
          b.classList.add('right');
          this.correct();
        } else {
          b.classList.add('wrong');
          b.disabled = true;
          this.failed = true;
          this.feedback('No, ese es otro pa\u00eds.', 'bad');
        }
      });
      box.append(b);
    }
  },
  onInput(value) {
    if (this.done) return;
    if (matcher.find(value) === this.target) this.correct();
  },
  onEnter(value) {
    if (this.done) return this.next();
    if (!value.trim()) return;
    const id = matcher.find(value);
    this.failed = true;
    const input = $('#practice-input');
    input.classList.remove('shake');
    void input.offsetWidth;
    input.classList.add('shake');
    this.feedback(id ? `No, ${nameOf(id)} est\u00e1 en otro sitio. Prueba otra vez.` : 'No es ese. Prueba otra vez o pide una pista.', 'bad');
  },
  showHint() {
    if (this.done) return;
    const name = nameOf(this.target);
    if (this.mode === 'opciones') {
      // En modo opciones la pista elimina una opcion incorrecta.
      this.hint++;
      const wrong = [...document.querySelectorAll('.option:not(:disabled)')].filter((b) => b.textContent !== name);
      if (wrong.length) wrong[0].disabled = true;
      return this.feedback('Pista: he quitado una opci\u00f3n incorrecta.', '');
    }
    this.hint = Math.min(this.hint + 1, name.length);
    const shown = name.slice(0, this.hint);
    const rest = name
      .slice(this.hint)
      .replace(/[^\s-]/g, '_')
      .split('')
      .join(' ');
    const input = $('#practice-input');
    input.value = '';
    input.placeholder = `${shown} ${rest}`;
    this.feedback(`Pista: empieza por \u00ab${shown}\u00bb (${name.replace(/[\s-]/g, '').length} letras)`, '');
    input.focus({ preventScroll: true });
  },
  correct() {
    this.done = true;
    const result = this.failed ? 'fail' : this.hint ? 'hinted' : 'ok';
    progress.record(this.target, result);
    this.mark(result);
    this.streak = result === 'ok' ? this.streak + 1 : 0;
    $('#practice-input').value = nameOf(this.target);
    this.feedback(`\u00a1Correcto! Es ${nameOf(this.target)}.`, 'good');
    this.renderStats();
    this.nextTimer = setTimeout(() => this.next(), 1100);
  },
  skip() {
    if (this.done) return;
    this.done = true;
    progress.record(this.target, 'fail');
    this.mark('fail');
    this.streak = 0;
    this.feedback(`Era ${nameOf(this.target)}.`, 'bad');
    document.querySelectorAll('.option').forEach((b) => b.textContent === nameOf(this.target) && b.classList.add('right'));
    $('#practice-input').disabled = true;
    $('#practice-next').hidden = false;
    $('#practice-hint').hidden = true;
    $('#practice-skip').hidden = true;
    $('#practice-next').focus();
    this.renderStats();
  },
  // Pinta el pais segun como lo has respondido: verde, amarillo (con pista) o rojo.
  mark(result) {
    this.answered.set(this.target, result);
    map.setClass(this.target, 'target', false);
    map.setClass(this.target, { ok: 'p-ok', hinted: 'p-hint', fail: 'p-miss' }[result]);
    this.renderCount();
  },
  finishRound() {
    this.roundOver = true;
    this.target = null;
    const n = (r) => [...this.answered.values()].filter((v) => v === r).length;
    this.feedback(`Ronda terminada: ${n('ok')} bien, ${n('hinted')} con pista y ${n('fail')} mal.`, n('fail') ? '' : 'good');
    $('#practice-input').disabled = true;
    $('#practice-options').innerHTML = '';
    $('#practice-hint').hidden = true;
    $('#practice-skip').hidden = true;
    $('#practice-next').hidden = false;
    $('#practice-next').textContent = 'Otra ronda';
    $('#practice-next').focus();
    this.region === 'all' || this.region === 'fallos' ? map.reset() : map.zoomToContinent(this.region);
  },
  renderCount() {
    const n = (r) => [...this.answered.values()].filter((v) => v === r).length;
    $('#practice-left').textContent = this.pool.length - this.answered.size;
    $('#practice-ok').textContent = n('ok');
    $('#practice-hinted').textContent = n('hinted');
    $('#practice-miss').textContent = n('fail');
  },
  feedback(text, kind) {
    const el = $('#practice-feedback');
    el.textContent = text;
    el.className = `feedback ${kind}`;
  },
  renderStats() {
    const ids = this.pool.length ? this.pool : idsIn('all');
    const m = progress.mastered(ids);
    $('#practice-streak').textContent = this.streak;
    $('#practice-mastered').textContent = `${m}/${ids.length}`;
    $('#practice-bar').style.transform = `scaleX(${m / ids.length})`;
  },
};

$('#practice-input').addEventListener('input', (e) => practice.onInput(e.target.value));
$('#practice-input').addEventListener('keydown', (e) => e.key === 'Enter' && practice.onEnter(e.target.value));
$('#practice-hint').addEventListener('click', () => practice.showHint());
$('#practice-skip').addEventListener('click', () => practice.skip());
$('#practice-next').addEventListener('click', () => practice.next());
$('#practice-reset').addEventListener('click', () => {
  if (confirm('\u00bfBorrar todo tu progreso de pr\u00e1ctica?')) {
    progress.reset();
    practice.renderStats();
  }
});
document.querySelectorAll('[data-timed]').forEach((b) => b.addEventListener('click', () => reto.setTimed(b.dataset.timed === '1')));

document.querySelectorAll('[data-pmode]').forEach((b) =>
  b.addEventListener('click', () => {
    practice.mode = b.dataset.pmode;
    store.set('paises-modo-practica', practice.mode);
    practice.renderMode();
    if (practice.pool.length) practice.next();
  }),
);

// ---------- Cambio de modo ----------
const modes = { reto, practicar: practice };
let current = null;

function setMode(name) {
  if (!modes[name]) name = 'reto';
  current?.leave();
  ['dim', 'hl', 'target', 'found', 'missed'].forEach((c) => map.clearClass(c));
  tooltip.hidden = true;
  document.body.dataset.mode = name;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === name));
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  current = modes[name];
  current.enter();
  if (location.hash !== `#${name}`) history.replaceState(null, '', `${location.search}#${name}`);
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
setMode(location.hash.slice(1));
