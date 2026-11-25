import './style.css';
import { COUNTRIES, CONTINENTS, BY_ID, continentLabel } from './countries.js';
import { createMatcher, norm } from './text.js';
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

// ---------- Mapa y tooltip ----------
const tooltip = $('#tooltip');
let hoverEnabled = () => false;
let onMapClick = () => {};

const map = createMap($('#map'), {
  onClick: (id) => onMapClick(id),
  onHover(id, event) {
    if (!id || !hoverEnabled(id)) return (tooltip.hidden = true);
    const box = $('.map-wrap').getBoundingClientRect();
    tooltip.textContent = nameOf(id);
    tooltip.style.left = `${event.clientX - box.left}px`;
    tooltip.style.top = `${event.clientY - box.top}px`;
    tooltip.hidden = false;
  },
});

document.querySelectorAll('[data-zoom]').forEach((b) =>
  b.addEventListener('click', () => {
    const z = b.dataset.zoom;
    if (z === 'reset') map.reset();
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

// ---------- RETO ----------
const TIME_LIMIT = { all: 15 * 60, Africa: 5 * 60, America: 4 * 60, Asia: 5 * 60, Europa: 5 * 60, Oceania: 2 * 60 };

const reto = {
  region: 'all',
  found: new Set(),
  ids: [],
  running: false,
  ended: false,
  left: 0,
  timer: null,
  pending: null,

  enter() {
    chips('reto', REGIONS, this.region, (r) => {
      this.region = r;
      this.reset();
    });
    hoverEnabled = () => this.ended;
    onMapClick = () => {};
    this.reset();
  },
  leave() {
    this.stop();
  },
  reset() {
    this.stop();
    ['found', 'missed', 'flash'].forEach((c) => map.clearClass(c));
    this.ids = idsIn(this.region);
    this.found.clear();
    this.running = false;
    this.ended = false;
    this.left = TIME_LIMIT[this.region];
    dimOutside(this.region);
    this.region === 'all' ? map.reset() : map.zoomToContinent(this.region);
    const input = $('#reto-input');
    input.disabled = false;
    input.value = '';
    $('#reto-result').hidden = true;
    $('#reto-giveup').disabled = false;
    this.render();
    input.focus();
  },
  start() {
    this.running = true;
    this.timer = setInterval(() => {
      this.left--;
      this.render();
      if (this.left <= 0) this.end();
    }, 1000);
  },
  stop() {
    clearInterval(this.timer);
    clearTimeout(this.pending);
  },
  onInput(value) {
    if (this.ended) return;
    if (!this.running && value.trim()) this.start();
    clearTimeout(this.pending);
    const id = matcher.find(value);
    if (!id || !this.ids.includes(id) || this.found.has(id)) return;
    // Si "Niger" puede seguir hasta "Nigeria", espera un momento (o Enter) antes de aceptarlo.
    const pendingIds = (x) => this.ids.includes(x) && !this.found.has(x);
    if (matcher.isPrefixOfOther(value, id, pendingIds)) this.pending = setTimeout(() => this.accept(id), 900);
    else this.accept(id);
  },
  onEnter(value) {
    const id = matcher.find(value);
    if (id && this.ids.includes(id) && !this.found.has(id)) this.accept(id);
  },
  accept(id) {
    clearTimeout(this.pending);
    this.found.add(id);
    map.setClass(id, 'found');
    map.setClass(id, 'flash');
    setTimeout(() => map.setClass(id, 'flash', false), 700);
    $('#reto-input').value = '';
    this.render();
    if (this.found.size === this.ids.length) this.end();
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
    const prev = records[this.region];
    const used = TIME_LIMIT[this.region] - this.left;
    if (!prev || this.found.size > prev.found || (this.found.size === prev.found && used < prev.time)) {
      records[this.region] = { found: this.found.size, time: used };
      store.set('paises-records', records);
    }

    const total = this.ids.length;
    $('#reto-result-title').textContent =
      missed.length === 0
        ? `\u00a1Perfecto! Los ${total} en ${fmtTime(used)}`
        : `Has nombrado ${this.found.size} de ${total}`;
    $('#reto-practice').hidden = missed.length === 0;
    const box = $('#reto-missed');
    box.innerHTML = '';
    for (const c of CONTINENTS) {
      const list = missed.filter((id) => BY_ID.get(id).continent === c.id);
      if (!list.length) continue;
      const h = document.createElement('h3');
      h.textContent = `${c.label} (${list.length})`;
      const ul = document.createElement('ul');
      ul.className = 'missed-list';
      for (const id of list) {
        const li = document.createElement('li');
        li.innerHTML = `<button class="missed-item"></button>`;
        li.firstChild.textContent = nameOf(id);
        li.firstChild.addEventListener('click', () => {
          map.clearClass('hl');
          map.setClass(id, 'hl');
          map.zoomToCountry(id);
        });
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
    $('#reto-timer').textContent = fmtTime(this.left);
    $('#reto-timer').classList.toggle('low', this.running && this.left <= 30);
    const best = store.get('paises-records', {})[this.region];
    $('#reto-best').textContent = best ? `Tu r\u00e9cord: ${best.found}/${this.ids.length} en ${fmtTime(best.time)}` : '';

    const bars = $('#reto-bars');
    bars.innerHTML = '';
    const conts = this.region === 'all' ? CONTINENTS : CONTINENTS.filter((c) => c.id === this.region);
    for (const c of conts) {
      const ids = idsIn(c.id);
      const n = ids.filter((id) => this.found.has(id)).length;
      const li = document.createElement('li');
      li.innerHTML = `<span class="bar-label"></span><span class="bar"><span style="width:${(n / ids.length) * 100}%"></span></span><span class="bar-n">${n}/${ids.length}</span>`;
      li.firstChild.textContent = c.label;
      bars.append(li);
    }
  },
};

$('#reto-input').addEventListener('input', (e) => reto.onInput(e.target.value));
$('#reto-input').addEventListener('keydown', (e) => e.key === 'Enter' && reto.onEnter(e.target.value));
$('#reto-giveup').addEventListener('click', () => reto.end());
$('#reto-restart').addEventListener('click', () => reto.reset());
$('#reto-practice').addEventListener('click', () => {
  practice.region = 'fallos';
  setMode('practicar');
});

// ---------- ESTUDIAR ----------
const study = {
  region: 'all',
  selected: null,

  enter() {
    chips('estudiar', REGIONS, this.region, (r) => {
      this.region = r;
      this.apply();
    });
    hoverEnabled = () => true;
    onMapClick = (id) => id && this.select(id, false);
    this.apply();
    if (this.selected) map.setClass(this.selected, 'sel');
  },
  leave() {
    map.clearClass('sel');
    map.clearClass('hl');
  },
  apply() {
    dimOutside(this.region);
    this.region === 'all' ? map.reset() : map.zoomToContinent(this.region);
    this.renderList();
  },
  renderList() {
    const q = norm($('#study-search').value);
    const ul = $('#study-list');
    ul.innerHTML = '';
    for (const id of idsIn(this.region).sort(byName)) {
      const c = BY_ID.get(id);
      if (q && ![c.name, ...c.alt].some((n) => norm(n).includes(q))) continue;
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.textContent = c.name;
      b.dataset.id = id;
      b.classList.toggle('on', id === this.selected);
      b.addEventListener('mouseenter', () => map.setClass(id, 'hl'));
      b.addEventListener('mouseleave', () => map.setClass(id, 'hl', false));
      b.addEventListener('click', () => this.select(id, true));
      li.append(b);
      ul.append(li);
    }
  },
  select(id, zoom) {
    map.clearClass('sel');
    this.selected = id;
    map.setClass(id, 'sel');
    if (zoom) map.zoomToCountry(id);
    const c = BY_ID.get(id);
    $('#study-name').textContent = c.name;
    $('#study-cont').textContent = continentLabel(c.continent) + (c.alt.length ? ` \u00b7 tambi\u00e9n: ${c.alt.join(', ')}` : '');
    $('#study-list')
      .querySelectorAll('button')
      .forEach((b) => b.classList.toggle('on', b.dataset.id === id));
    $(`#study-list button[data-id="${id}"]`)?.scrollIntoView({ block: 'nearest' });
  },
};

$('#study-search').addEventListener('input', () => study.renderList());

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

  enter() {
    const regions = [...REGIONS, { id: 'fallos', label: '\u00daltimos fallos' }];
    chips('practicar', regions, this.region, (r) => {
      this.region = r;
      this.start();
    });
    hoverEnabled = (id) => this.done && id === this.target;
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
    this.target = pickNext(this.pool, progress, this.recent);
    this.recent = [...this.recent, this.target].slice(-Math.min(5, this.pool.length - 1));
    this.hint = 0;
    this.failed = false;
    this.done = false;
    map.setClass(this.target, 'target');
    map.zoomToCountry(this.target);
    const input = $('#practice-input');
    input.value = '';
    input.disabled = false;
    input.placeholder = 'Nombre del pa\u00eds...';
    $('#practice-feedback').textContent = '';
    $('#practice-feedback').className = 'feedback';
    $('#practice-next').hidden = true;
    $('#practice-hint').hidden = false;
    $('#practice-skip').hidden = false;
    this.renderOptions();
    if (this.mode === 'escribir') input.focus();
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
          this.feedback(`No, ese es otro pa\u00eds.`, 'bad');
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
    if (this.mode === 'opciones') {
      // En modo opciones la pista elimina una opcion incorrecta.
      const wrong = [...document.querySelectorAll('.option:not(:disabled)')].filter((b) => b.textContent !== name);
      if (wrong.length) wrong[0].disabled = true;
      this.feedback('Pista: he quitado una opci\u00f3n incorrecta.', '');
    }
    input.focus();
  },
  correct() {
    this.done = true;
    const result = this.failed ? 'fail' : this.hint ? 'hinted' : 'ok';
    progress.record(this.target, result);
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
    this.streak = 0;
    this.feedback(`Era ${nameOf(this.target)}. Saldr\u00e1 otra vez pronto.`, 'bad');
    document.querySelectorAll('.option').forEach((b) => b.textContent === nameOf(this.target) && b.classList.add('right'));
    $('#practice-input').disabled = true;
    $('#practice-next').hidden = false;
    $('#practice-hint').hidden = true;
    $('#practice-skip').hidden = true;
    $('#practice-next').focus();
    this.renderStats();
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
    $('#practice-bar').style.width = `${(m / ids.length) * 100}%`;
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
document.querySelectorAll('[data-pmode]').forEach((b) =>
  b.addEventListener('click', () => {
    practice.mode = b.dataset.pmode;
    store.set('paises-modo-practica', practice.mode);
    practice.renderMode();
    if (practice.pool.length) practice.next();
  }),
);

// ---------- Cambio de modo ----------
const modes = { reto, estudiar: study, practicar: practice };
let current = null;

function setMode(name) {
  if (!modes[name]) name = 'reto';
  current?.leave();
  ['dim', 'hl', 'sel', 'target', 'found', 'missed'].forEach((c) => map.clearClass(c));
  tooltip.hidden = true;
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.mode === name));
  document.querySelectorAll('[data-panel]').forEach((p) => (p.hidden = p.dataset.panel !== name));
  current = modes[name];
  current.enter();
  if (location.hash !== `#${name}`) history.replaceState(null, '', `#${name}`);
}

document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => setMode(t.dataset.mode)));
setMode(location.hash.slice(1));
