// Builds the service-area map geometry from U.S. Census Bureau boundaries (public domain).
//   node scripts/build-service-area-geo.mjs
// Outputs (commit these; the site build never touches the network):
//   src/service-area-geo.json            projected, simplified SVG paths for the instant preview
//   public/data/service-area.geojson     lon/lat polygons for the on-demand Google Map layer
// Source: TIGERweb "County Subdivisions" (Massachusetts towns/cities are county subdivisions).
// Coverage is decided by src/service-area.json, never by this geometry.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { towns } = JSON.parse(readFileSync(join(root, 'src/service-area.json'), 'utf8'));
const SERVED = new Map(towns.map((t) => [t.name, t.slug]));

const ENDPOINT = 'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/1/query';
const VIEW_W = 640;
const SERVED_TOL = 0.55; // px
const CONTEXT_TOL = 1.1; // px
const ADJACENT_DEG = 0.0015;

async function query(params) {
  const url = `${ENDPOINT}?${new URLSearchParams({ outSR: '4326', f: 'geojson', outFields: 'BASENAME,NAME', ...params })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TIGERweb ${res.status}`);
  return (await res.json()).features;
}

const ring = (f) => (f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());

// 1. The confirmed towns.
const names = [...SERVED.keys()].map((n) => `'${n}'`).join(',');
const served = (await query({ where: `STATE='25' AND BASENAME IN (${names})` })).filter((f) => SERVED.has(f.properties.BASENAME));
if (served.length !== SERVED.size) throw new Error(`expected ${SERVED.size} towns, got ${served.length}`);

// 2. Neighbouring towns that touch them, drawn as muted context so the shapes read as a real map.
let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
for (const f of served) for (const r of ring(f)) for (const [x, y] of r) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
const pad = 0.02;
const around = await query({
  where: `STATE='25'`,
  geometry: `${minX - pad},${minY - pad},${maxX + pad},${maxY + pad}`,
  geometryType: 'esriGeometryEnvelope', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
});
const cell = (x, y) => `${Math.floor(x / ADJACENT_DEG)}:${Math.floor(y / ADJACENT_DEG)}`;
const grid = new Set();
for (const f of served) for (const r of ring(f)) for (const [x, y] of r) {
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) grid.add(cell(x + dx * ADJACENT_DEG, y + dy * ADJACENT_DEG));
}
const context = around.filter((f) => !SERVED.has(f.properties.BASENAME) && !/not defined/i.test(f.properties.BASENAME) && ring(f).some((r) => r.some(([x, y]) => grid.has(cell(x, y)))));

// 3. Project (equirectangular, scaled by cos(latitude)) into one shared viewBox.
const all = served.concat(context);
[minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
for (const f of all) for (const r of ring(f)) for (const [x, y] of r) { minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y); }
const k = Math.cos(((minY + maxY) / 2) * Math.PI / 180);
const scale = (VIEW_W - 8) / ((maxX - minX) * k);
const VIEW_H = Math.ceil((maxY - minY) * scale + 8);
const px = ([x, y]) => [(x - minX) * k * scale + 4, (maxY - y) * scale + 4];

// Douglas–Peucker for an open polyline.
function simplifyOpen(points, tol) {
  if (points.length < 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0, idx = -1;
    const [ax, ay] = points[a], [bx, by] = points[b];
    const len = Math.hypot(bx - ax, by - ay) || 1e-9;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((by - ay) * points[i][0] - (bx - ax) * points[i][1] + bx * ay - by * ax) / len;
      if (d > max) { max = d; idx = i; }
    }
    if (max > tol) { keep[idx] = 1; stack.push([a, idx], [idx, b]); }
  }
  return points.filter((_, i) => keep[i]);
}

// Rings are closed (first point == last point), which gives Douglas–Peucker a zero-length baseline.
// Split at the vertex farthest from the start and simplify each half.
function simplify(points, tol) {
  if (points.length < 4) return points;
  const closed = points[0][0] === points.at(-1)[0] && points[0][1] === points.at(-1)[1];
  if (!closed) return simplifyOpen(points, tol);
  let far = 1, best = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = Math.hypot(points[i][0] - points[0][0], points[i][1] - points[0][1]);
    if (d > best) { best = d; far = i; }
  }
  const left = simplifyOpen(points.slice(0, far + 1), tol);
  const right = simplifyOpen(points.slice(far), tol);
  return left.concat(right.slice(1));
}

// Relative path commands at 0.1px resolution, tracking the rounded position so error never accumulates.
function toPath(rings, tol) {
  let d = '';
  for (const r of rings) {
    const pts = simplify(r.map(px), tol);
    if (pts.length < 3) continue;
    let cx = Math.round(pts[0][0] * 10), cy = Math.round(pts[0][1] * 10);
    d += `M${(cx / 10).toFixed(1)} ${(cy / 10).toFixed(1)}l`;
    const parts = [];
    for (let i = 1; i < pts.length; i++) {
      const nx = Math.round(pts[i][0] * 10), ny = Math.round(pts[i][1] * 10);
      if (nx !== cx || ny !== cy) parts.push(`${(nx - cx) / 10} ${(ny - cy) / 10}`);
      cx = nx; cy = ny;
    }
    d += parts.join(' ') + 'z';
  }
  return d;
}

const centroid = (rings) => {
  const outer = rings[0];
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = outer.length - 1; i < outer.length; j = i++) {
    const [x0, y0] = px(outer[j]), [x1, y1] = px(outer[i]);
    const f = x0 * y1 - x1 * y0;
    a += f; cx += (x0 + x1) * f; cy += (y0 + y1) * f;
  }
  return [Math.round(cx / (3 * a)), Math.round(cy / (3 * a))];
};

const geo = {
  _comment: 'Generated by scripts/build-service-area-geo.mjs from U.S. Census Bureau TIGERweb boundaries. Do not hand-edit.',
  source: 'U.S. Census Bureau, TIGERweb County Subdivisions (public domain)',
  viewBox: [0, 0, VIEW_W, VIEW_H],
  towns: Object.fromEntries(
    towns.map((t) => {
      const f = served.find((s) => s.properties.BASENAME === t.name);
      const [cx, cy] = centroid(f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat());
      return [t.slug, { d: toPath(ring(f), SERVED_TOL), cx, cy }];
    }),
  ),
  context: context.map((f) => toPath(ring(f), CONTEXT_TOL)).filter(Boolean).join(''),
};
writeFileSync(join(root, 'src/service-area-geo.json'), JSON.stringify(geo));

// Fuller lon/lat for the Google Map layer (≈20 m tolerance, 5 decimals).
const TOL_DEG = 0.0002;
const geojson = {
  type: 'FeatureCollection',
  features: served.map((f) => ({
    type: 'Feature',
    properties: { slug: SERVED.get(f.properties.BASENAME), name: f.properties.BASENAME },
    geometry: {
      type: 'Polygon',
      coordinates: ring(f).map((r) => simplify(r, TOL_DEG).map(([x, y]) => [+x.toFixed(5), +y.toFixed(5)])),
    },
  })),
};
mkdirSync(join(root, 'public/data'), { recursive: true });
writeFileSync(join(root, 'public/data/service-area.geojson'), JSON.stringify(geojson));

console.log(`served ${served.length}, context ${context.length} (${context.map((f) => f.properties.BASENAME).join(', ')})`);
console.log(`viewBox 0 0 ${VIEW_W} ${VIEW_H}`);
const size = (p) => readFileSync(join(root, p)).length;
console.log('src/service-area-geo.json', size('src/service-area-geo.json'), 'bytes');
console.log('public/data/service-area.geojson', size('public/data/service-area.geojson'), 'bytes');
