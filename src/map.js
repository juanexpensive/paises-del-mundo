import { geoNaturalEarth1, geoPath, geoCentroid, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import 'd3-transition';
import world from 'world-atlas/countries-50m.json';
import { BY_ID, MAP_ALIASES, MISSING_POINTS } from './countries.js';

const W = 1000;
const H = 520;
const SMALL_AREA = 22; // px2: por debajo se dibuja ademas un punto para poder verlo y pulsarlo
const DOT_R = 3.2;

// Recuadros [lon, lat] para encuadrar cada continente (Rusia estropearia los limites automaticos de Europa).
const CONTINENT_BOX = {
  Africa: [[-20, -36], [55, 38]],
  America: [[-168, -56], [-32, 72]],
  Asia: [[26, -11], [148, 56]],
  Europa: [[-25, 34], [45, 71]],
  Oceania: [[112, -48], [180, 12]],
};

export function createMap(container, { onClick, onHover } = {}) {
  const land = feature(world, world.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
  const projection = geoNaturalEarth1().fitExtent([[8, 8], [W - 8, H - 8]], { type: 'FeatureCollection', features: land });
  const path = geoPath(projection);

  const svg = select(container).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'map');
  svg.append('rect').attr('class', 'ocean').attr('width', W).attr('height', H);
  const layer = svg.append('g');
  layer.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  layer.append('path').attr('class', 'graticule').attr('d', path(geoGraticule10()));
  const shapes = layer.append('g');
  const dots = layer.append('g');

  // id de pais -> { els: [elementos svg], features: [] }
  const byCode = new Map();
  const entry = (id) => {
    if (!byCode.has(id)) byCode.set(id, { els: [], features: [] });
    return byCode.get(id);
  };

  for (const f of land) {
    const id = MAP_ALIASES[f.properties.name] ?? f.id;
    const isCountry = BY_ID.has(id);
    const el = shapes.append('path').attr('d', path(f)).attr('class', isCountry ? 'country' : 'land');
    if (isCountry) {
      el.attr('data-id', id).attr('data-cont', BY_ID.get(id).continent);
      entry(id).els.push(el.node());
      entry(id).features.push(f);
    }
  }

  for (const [id, e] of byCode) {
    const area = e.features.reduce((sum, f) => sum + path.area(f), 0);
    if (area < SMALL_AREA) {
      const biggest = e.features.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
      addDot(id, projection(geoCentroid(biggest)));
    }
  }
  for (const [id, lonLat] of Object.entries(MISSING_POINTS)) addDot(id, projection(lonLat));

  function addDot(id, [x, y]) {
    const el = dots.append('circle').attr('cx', x).attr('cy', y).attr('r', DOT_R).attr('class', 'country dot').attr('data-id', id).attr('data-cont', BY_ID.get(id).continent);
    entry(id).els.push(el.node());
    entry(id).point = [x, y];
  }

  // Interaccion
  const idOf = (event) => event.target.closest?.('[data-id]')?.getAttribute('data-id') ?? null;
  svg.on('click', (event) => onClick?.(idOf(event), event));
  svg.on('mouseover', (event) => onHover?.(idOf(event), event));
  svg.on('mousemove', (event) => idOf(event) && onHover?.(idOf(event), event));
  svg.on('mouseout', (event) => !event.relatedTarget?.closest?.('[data-id]') && onHover?.(null, event));

  let k = 1;
  const zoomer = zoom()
    .scaleExtent([1, 60])
    .translateExtent([[0, 0], [W, H]])
    .on('zoom', (event) => {
      k = event.transform.k;
      layer.attr('transform', event.transform);
      dots.selectAll('circle').attr('r', DOT_R / Math.sqrt(k));
    });
  svg.call(zoomer).on('dblclick.zoom', null);

  function fit([[x0, y0], [x1, y1]], { minSize = 0, maxScale = 30 } = {}) {
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const w = Math.max(x1 - x0, minSize);
    const h = Math.max(y1 - y0, minSize * (H / W));
    const scale = Math.max(1, Math.min(maxScale, 0.9 / Math.max(w / W, h / H)));
    const t = zoomIdentity.translate(W / 2 - scale * cx, H / 2 - scale * cy).scale(scale);
    svg.transition().duration(650).call(zoomer.transform, t);
  }

  function boundsOf(id) {
    const e = byCode.get(id);
    if (!e) return null;
    if (!e.features.length || e.point) {
      const [x, y] = e.point;
      return [[x, y], [x, y]];
    }
    // Usa solo la pieza mayor si el pais esta muy disperso (p. ej. EEUU con Alaska y Hawai).
    const all = path.bounds({ type: 'FeatureCollection', features: e.features });
    if (all[1][0] - all[0][0] < W * 0.4) return all;
    const biggest = e.features.reduce((a, b) => (path.area(b) > path.area(a) ? b : a));
    return path.bounds(biggest);
  }

  function projectBox([[lon0, lat0], [lon1, lat1]]) {
    const pts = [];
    for (let i = 0; i <= 8; i++) {
      const lon = lon0 + ((lon1 - lon0) * i) / 8;
      const lat = lat0 + ((lat1 - lat0) * i) / 8;
      pts.push(projection([lon, lat0]), projection([lon, lat1]), projection([lon0, lat]), projection([lon1, lat]));
    }
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
  }

  return {
    ids: () => [...byCode.keys()],
    // Estados: found, missed, target, hl, dim
    setClass(id, cls, on = true) {
      for (const el of byCode.get(id)?.els ?? []) el.classList.toggle(cls, on);
    },
    clearClass(cls) {
      container.querySelectorAll(`.${cls}`).forEach((el) => el.classList.remove(cls));
    },
    zoomToCountry(id) {
      const b = boundsOf(id);
      if (b) fit(b, { minSize: 140, maxScale: 14 });
    },
    zoomToContinent(continent) {
      if (!CONTINENT_BOX[continent]) return this.reset();
      fit(projectBox(CONTINENT_BOX[continent]));
    },
    zoomBy(factor) {
      svg.transition().duration(250).call(zoomer.scaleBy, factor);
    },
    reset() {
      svg.transition().duration(650).call(zoomer.transform, zoomIdentity);
    },
  };
}
