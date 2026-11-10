import { INDIA_DOTS, INDIA_OUTLINE, INDIA_VIEWBOX } from './indiaShape'

/**
 * India, in the spirit of Nearby's regional map. The silhouette is traced
 * from a supplied outline image (see indiaShape.ts), so every curve follows
 * the source: an exact contour plus a dot-matrix fill sampled inside it. Zero
 * client JS and no image request.
 *
 * City pins are illustrative of where pilots are being onboarded, not a live
 * list. They are placed by a linear lon/lat fit to the traced image.
 */

const px = (lon: number) => 33 + (lon - 68.15) * 16.1
const py = (lat: number) => 2 + (37.1 - lat) * 18.1

const CITIES = [
  { name: 'Delhi NCR', lon: 77.2, lat: 28.6, dx: 10, dy: -9 },
  { name: 'Kolkata', lon: 88.4, lat: 22.6, dx: -64, dy: 4 },
  { name: 'Mumbai', lon: 72.9, lat: 19.1, dx: -68, dy: 4 },
  { name: 'Pune', lon: 73.9, lat: 18.5, dx: 10, dy: 15 },
  { name: 'Hyderabad', lon: 78.5, lat: 17.4, dx: 10, dy: 3 },
  { name: 'Bengaluru', lon: 77.6, lat: 13.0, dx: -70, dy: 4 },
  { name: 'Chennai', lon: 80.3, lat: 13.1, dx: 10, dy: 4 },
] as const

export function IndiaMap() {
  return (
    <svg
      className="india"
      viewBox={INDIA_VIEWBOX}
      role="img"
      aria-label="Map of India with pilot cities marked"
    >
      <path className="india__shape" d={INDIA_OUTLINE} />
      <path className="india__dots" d={INDIA_DOTS} />
      <path className="india__edge" d={INDIA_OUTLINE} />
      {CITIES.map((c) => (
        <g key={c.name} transform={`translate(${px(c.lon).toFixed(1)} ${py(c.lat).toFixed(1)})`}>
          <circle className="india__pulse" r="7" />
          <circle className="india__pin" r="4" />
          <text className="india__label" x={c.dx} y={c.dy}>
            {c.name}
          </text>
        </g>
      ))}
    </svg>
  )
}
