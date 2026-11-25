import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { COUNTRIES, MAP_ALIASES, MISSING_POINTS } from '../src/countries.js';
import { createMatcher, norm } from '../src/text.js';
import { createProgress, pickNext } from '../src/progress.js';

const world = createRequire(import.meta.url)('world-atlas/countries-50m.json');

test('hay 197 paises sin ids ni nombres repetidos', () => {
  assert.equal(COUNTRIES.length, 197);
  assert.equal(new Set(COUNTRIES.map((c) => c.id)).size, 197);
  assert.equal(new Set(COUNTRIES.map((c) => norm(c.name))).size, 197);
});

test('ningun alias apunta a dos paises', () => {
  const seen = new Map();
  for (const c of COUNTRIES) {
    for (const n of [c.name, ...c.alt]) {
      const k = norm(n);
      assert.ok(!seen.has(k) || seen.get(k) === c.id, `alias repetido: ${n}`);
      seen.set(k, c.id);
    }
  }
});

test('todos los paises tienen forma o punto en el mapa', () => {
  const mapIds = new Set(world.objects.countries.geometries.map((g) => MAP_ALIASES[g.properties.name] ?? g.id));
  for (const c of COUNTRIES) assert.ok(mapIds.has(c.id) || MISSING_POINTS[c.id], `sin mapa: ${c.name}`);
});

test('el buscador acepta tildes, mayusculas, articulos y alias', () => {
  const m = createMatcher(COUNTRIES);
  assert.equal(m.find('espana'), '724');
  assert.equal(m.find('  ESPA\u00d1A '), '724');
  assert.equal(m.find('salvador'), '222');
  assert.equal(m.find('las bahamas'), '044');
  assert.equal(m.find('holanda'), '528');
  assert.equal(m.find('guinea bisau'), '624');
  assert.equal(m.find('espa\u00f1'), null);
});

test('detecta nombres que pueden seguir (Niger -> Nigeria)', () => {
  const m = createMatcher(COUNTRIES);
  const all = () => true;
  assert.ok(m.isPrefixOfOther('niger', '562', all));
  assert.ok(!m.isPrefixOfOther('nigeria', '566', all));
  assert.ok(!m.isPrefixOfOther('niger', '562', (id) => id !== '566'));
});

test('la repeticion espaciada sube, mantiene y reinicia cajas', () => {
  const p = createProgress(() => ({}), () => {});
  p.record('724', 'ok');
  p.record('724', 'ok');
  assert.equal(p.box('724'), 2);
  p.record('724', 'hinted');
  assert.equal(p.box('724'), 2);
  p.record('724', 'fail');
  assert.equal(p.box('724'), 0);
});

test('pickNext prefiere los paises flojos y evita los recientes', () => {
  const p = createProgress(() => ({ a: 4, b: 0 }), () => {});
  let b = 0;
  for (let i = 0; i < 1000; i++) if (pickNext(['a', 'b'], p) === 'b') b++;
  assert.ok(b > 800);
  assert.equal(pickNext(['a', 'b', 'c'], p, ['a', 'b']), 'c');
});
