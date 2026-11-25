import { geoNaturalEarth1, geoPath, geoCentroid, geoGraticule10 } from 'd3-geo';
import { feature } from 'topojson-client';
import { select } from 'd3-selection';
import { zoom, zoomIdentity } from 'd3-zoom';
import 'd3-transition';
import world from 'world-atlas/countries-50m.json';
import { BY_ID, MAP_ALIASES, MISSING_POINTS } from './countries.js';

const SMALL_AREA = 30; // px2: por debajo se dibuja ademas un punto para poder verlo y pulsarlo
const DOT_R = 3.2; // radio en pixeles de pantalla, igual con cualquier zoom
const RING_R = 18;

// Recuadros [lon, lat] para encuadrar cada continente (Rusia estropearia los limites automaticos de Europa).
const CONTINENT_BOX = {
  Africa: [[-20, -36], [55, 38]],
  America: [[-168, -56], [-32, 72]],
  Asia: [[26, -11], [148, 56]],
  Europa: [[-25, 34], [45, 71]],
  Oceania: [[112, -48], [190, 12]],
};

// Encuadre inicial en pantallas verticales: Europa y Africa (el mundo entero quedaria diminuto).
const PORTRAIT_HOME = [[-22, -36], [58, 64]];

export function createMap(container, { onClick, onHover } = {}) {
  // El SVG mide lo mismo que su contenedor, asi el mapa aprovecha todo el espacio.
  const W = Math.max(320, container.clientWidth || 1000);
  const H = Math.max(240, container.clientHeight || 520);
  const portrait = H > W;
  const land = feature(world, world.objects.countries).features.filter((f) => f.properties.name !== 'Antarctica');
  // Girado 11 grados: el corte del mapa cae en el estrecho de Bering y no parte las islas del Pacifico.
  const projection = geoNaturalEarth1().rotate([-11, 0]).fitExtent([[16, 16], [W - 16, H - 16]], { type: 'FeatureCollection', features: land });
  const path = geoPath(projection);

  const svg = select(container).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('class', 'map');
  svg.append('rect').attr('class', 'ocean').attr('width', W).attr('height', H);
  const layer = svg.append('g');
  layer.append('path').attr('class', 'sphere').attr('d', path({ type: 'Sphere' }));
  svg.append('clipPath').attr('id', 'sphere-clip').append('path').attr('d', path({ type: 'Sphere' }));
  layer.append('path').attr('class', 'graticule').attr('clip-path', 'url(#sphere-clip)').attr('d', path(geoGraticule10()));
  const shapes = layer.append('g');
  const dots = layer.append('g');
  const ring = layer.append('circle').attr('class', 'target-ring').attr('r', RING_R).style('display', 'none');

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
      dots.selectAll('circle').attr('r', DOT_R / k);
      ring.attr('r', RING_R / k);
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
      if (b) fit(b, { minSize: portrait ? W * 0.32 : Math.min(W, H) * 0.45, maxScale: 10 });
    },
    zoomToContinent(continent) {
      if (!CONTINENT_BOX[continent]) return this.reset();
      fit(projectBox(CONTINENT_BOX[continent]));
    },
    zoomBy(factor) {
      svg.transition().duration(250).call(zoomer.scaleBy, factor);
    },
    // Anillo que senala el pais a adivinar (se ve aunque el pais sea un punto).
    setTarget(id) {
      const e = id && byCode.get(id);
      if (!e) return ring.style('display', 'none');
      const biggest = e.features.length ? e.features.reduce((a, b) => (path.area(b) > path.area(a) ? b : a)) : null;
      if (!e.point && path.area(biggest) > 900) return ring.style('display', 'none');
      const [x, y] = e.point ?? path.centroid(biggest);
      ring.attr('cx', x).attr('cy', y).style('display', null);
    },
    reset() {
      if (portrait) return fit(projectBox(PORTRAIT_HOME));
      svg.transition().duration(650).call(zoomer.transform, zoomIdentity);
    },
  };
}
