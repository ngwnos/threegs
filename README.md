**Overview**
- Minimal Bun + Three.js (WebGPU) app that loads a GeoTIFF and colors a plane via TSL nodes.
- Tweakpane UI toggles height vs hillshade and sun angles.

**Prerequisites**
- Bun installed: `curl -fsSL https://bun.sh/install | bash`
- WebGPU‑capable browser (recent Chrome, Edge, or Safari TP).

**Run**
- Install deps: `bun install`
- Dev (watch + server): `bun run dev` then open `http://localhost:3000`
- Prod build + serve: `bun run serve`

**Use Your Own GeoTIFF**
- Place your `.tif` in `public/` (e.g., `public/my_tile.tif`).
- Edit `src/main.js` and change the path in the loader call:
  - Find: `loadGeoTiffIntoTexture("/tile_x38y447_1m.tif");`
  - Replace with: `loadGeoTiffIntoTexture("/my_tile.tif");`
- Dimensions are detected automatically; UV pixel steps and min/max are updated after load.

**Controls**
- Tweakpane (on page):
  - `Color Method`: `height` or `hillshade`
  - `Sun Azimuth` (°), `Sun Altitude` (°) for hillshade

**Notes**
- Large textures: R32F 10012×10012 uses ~401 MB of RAM; the app requests a larger `maxBufferSize` for uploads. Device limits vary.
- Keep texture dimensions below `16384` per side (set via `requiredLimits.maxTextureDimension2D`).
- Main files: `src/main.js` (scene + loader + UI), `public/index.html` (entry), `server.js` (static server).

