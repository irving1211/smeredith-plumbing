import type { APIRoute } from 'astro';
import geo from '../../service-area-geo.json';
import area from '../../service-area.json';

// The outline map as a static, cacheable image for the ZIP checker's approximate pin. The checker loads it only after
// a ZIP has been checked, so it never delays the first screen. Red = owner-confirmed towns (src/service-area.json);
// grey = neighbouring towns that are not confirmed. Text labels use system fonts (an SVG image cannot load web fonts).
export const GET: APIRoute = () => {
  const [x, y, w, h] = geo.viewBox;
  const towns = geo.towns as Record<string, { d: string; cx: number; cy: number }>;
  const labels = area.towns
    .map((t) => `<text x="${towns[t.slug].cx}" y="${towns[t.slug].cy}">${t.name}</text>`)
    .join('');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}" width="${w}" height="${h}">` +
    `<rect width="${w}" height="${h}" fill="#FFFFFF"/>` +
    `<path d="${geo.context}" fill="#E4E1DA" stroke="#FFFFFF" stroke-width="0.8"/>` +
    area.towns.map((t) => `<path d="${towns[t.slug].d}" fill="#F6E4E2" stroke="#B11F20" stroke-width="1.2" stroke-linejoin="round"/>`).join('') +
    `<g font-family="Arial, Helvetica, sans-serif" font-size="15" font-weight="700" fill="#313131" text-anchor="middle" paint-order="stroke" stroke="#FFFFFF" stroke-width="4" stroke-linejoin="round">${labels}</g>` +
    `</svg>`;
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml' } });
};
