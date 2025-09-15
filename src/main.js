import * as THREE from "three";
import { WebGPURenderer, MeshBasicNodeMaterial } from "three/webgpu";
import { texture as tslTexture, uv, vec2, vec3, clamp, float, uniform, select, max, sin, cos, sqrt, dot } from "three/tsl";
import { fromArrayBuffer } from "geotiff";
import { Pane } from "tweakpane";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// Minimal WebGPU + TSL scene with a cube
(async () => {
  const renderer = new WebGPURenderer({
    antialias: true,
    requiredLimits: {
      maxTextureDimension2D: 16384,
      // Allow large staging buffers for texture uploads (e.g., 10012x10012 R32F)
      maxBufferSize: 2_147_483_648,
    },
  });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  await renderer.init();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111319);

  // Use an extremely small near plane to effectively remove near clipping
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 1e-5, 1000);
  camera.position.z = 3;

  // Create one empty 32-bit data texture for a USGS tile (10012x10012)
  // Note: allocates ~401 MB of Float32 memory
  const TILE_W = 10012;
  const TILE_H = 10012;
  const tileData = new Float32Array(TILE_W * TILE_H); // zeros
  let tileTexture = new THREE.DataTexture(
    tileData,
    TILE_W,
    TILE_H,
    THREE.RedFormat,
    THREE.FloatType
  );
  tileTexture.colorSpace = THREE.NoColorSpace;
  tileTexture.magFilter = THREE.NearestFilter;
  tileTexture.minFilter = THREE.NearestFilter;
  tileTexture.wrapS = THREE.ClampToEdgeWrapping;
  tileTexture.wrapT = THREE.ClampToEdgeWrapping;
  tileTexture.needsUpdate = true;
  // Expose for future use/debug (not used by the cube)
  globalThis.tileTexture = tileTexture;

  // Single plane; color from GeoTIFF height via TSL
  const geometry = new THREE.PlaneGeometry(1, 1, 1, 1);
  const material = new MeshBasicNodeMaterial({ toneMapped: false });
  const uv0 = uv();
  // Uniforms for min/max and nodata cutoff
  const minHeightU = uniform(0.0, 'float');
  const maxHeightU = uniform(1.0, 'float');
  const nodataCutoffU = uniform(-9990.0, 'float');
  const colorMethodU = uniform(1.0, 'float'); // 0=height, 1=hillshade (default hillshade)
  const floodLevelU = uniform(0.0, 'float'); // normalized [0..1] flood threshold
  // Pixel step in UV space (1/width, 1/height)
  const duU = uniform(1.0 / TILE_W, 'float');
  const dvU = uniform(1.0 / TILE_H, 'float');
  // Sample R32F, clamp, normalize to [0,1], grayscale color
  const sampleR = () => tslTexture(tileTexture, uv0).r;
  const hRaw = sampleR();
  const hSafe = select(hRaw.lessThan(nodataCutoffU), minHeightU, hRaw);
  const denom = max(maxHeightU.sub(minHeightU), float(1e-6));
  const tNorm = clamp(hSafe.sub(minHeightU).div(denom), float(0.0), float(1.0));
  const heightColor = vec3(tNorm, tNorm, tNorm);

  // Hillshade (Horn 3x3) with sun azimuth/altitude
  const DEG2RAD = float(0.017453292519943295);
  const sunAzimuthU = uniform(75.0, 'float');
  const sunAltitudeU = uniform(8.0, 'float');
  const az = sunAzimuthU.mul(DEG2RAD);
  const el = sunAltitudeU.mul(DEG2RAD);
  const cosEl = cos(el);
  const L = vec3(cosEl.mul(cos(az)), cosEl.mul(sin(az)), sin(el));
  const uvIn = uv0;
  const du = duU; const dv = dvU;
  const s1 = tslTexture(tileTexture, vec2(uvIn.x.sub(du), uvIn.y.add(dv))).r; // NW
  const s2 = tslTexture(tileTexture, vec2(uvIn.x,          uvIn.y.add(dv))).r; // N
  const s3 = tslTexture(tileTexture, vec2(uvIn.x.add(du), uvIn.y.add(dv))).r; // NE
  const s4 = tslTexture(tileTexture, vec2(uvIn.x.sub(du), uvIn.y         )).r; // W
  const s6 = tslTexture(tileTexture, vec2(uvIn.x.add(du), uvIn.y         )).r; // E
  const s7 = tslTexture(tileTexture, vec2(uvIn.x.sub(du), uvIn.y.sub(dv))).r; // SW
  const s8 = tslTexture(tileTexture, vec2(uvIn.x,          uvIn.y.sub(dv))).r; // S
  const s9 = tslTexture(tileTexture, vec2(uvIn.x.add(du), uvIn.y.sub(dv))).r; // SE
  const z1 = clamp(select(s1.lessThan(nodataCutoffU), hSafe, s1), minHeightU, maxHeightU);
  const z2 = clamp(select(s2.lessThan(nodataCutoffU), hSafe, s2), minHeightU, maxHeightU);
  const z3 = clamp(select(s3.lessThan(nodataCutoffU), hSafe, s3), minHeightU, maxHeightU);
  const z4 = clamp(select(s4.lessThan(nodataCutoffU), hSafe, s4), minHeightU, maxHeightU);
  const z6 = clamp(select(s6.lessThan(nodataCutoffU), hSafe, s6), minHeightU, maxHeightU);
  const z7 = clamp(select(s7.lessThan(nodataCutoffU), hSafe, s7), minHeightU, maxHeightU);
  const z8 = clamp(select(s8.lessThan(nodataCutoffU), hSafe, s8), minHeightU, maxHeightU);
  const z9 = clamp(select(s9.lessThan(nodataCutoffU), hSafe, s9), minHeightU, maxHeightU);
  const eight = float(8.0);
  const east = z3.add(z6.mul(float(2.0))).add(z9);
  const west = z1.add(z4.mul(float(2.0))).add(z7);
  const north = z1.add(z2.mul(float(2.0))).add(z3);
  const south = z7.add(z8.mul(float(2.0))).add(z9);
  const gx = east.sub(west).div(eight);
  const gy = north.sub(south).div(eight);
  const N = vec3(gx.mul(float(-1.0)), gy.mul(float(-1.0)), float(1.0));
  const nLen = sqrt(N.x.mul(N.x).add(N.y.mul(N.y)).add(N.z.mul(N.z)));
  const nUnit = vec3(N.x.div(nLen), N.y.div(nLen), N.z.div(nLen));
  const lambert = clamp(dot(nUnit, L), float(0.0), float(1.0));
  const hsColor = vec3(lambert, lambert, lambert);
  const baseColor = select(colorMethodU.lessThan(float(0.5)), heightColor, hsColor);
  const red = vec3(float(1.0), float(0.0), float(0.0));
  // If normalized height is below flood level, color red; otherwise baseColor
  material.colorNode = select(tNorm.lessThan(floodLevelU), red, baseColor);
  const plane = new THREE.Mesh(geometry, material);
  scene.add(plane);

  // Orbit controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.enablePan = true;

  // Load GeoTIFF from public/ and put its Float32 data into the DataTexture
  async function loadGeoTiffIntoTexture(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const buf = await resp.arrayBuffer();
      const tiff = await fromArrayBuffer(buf);
      const image = await tiff.getImage();
      const width = image.getWidth();
      const height = image.getHeight();
      let raster = await image.readRasters({ interleave: true });
      let data;
      if (raster instanceof Float32Array) data = raster;
      else if (raster instanceof Float64Array) data = new Float32Array(raster);
      else if (Array.isArray(raster)) data = raster[0] instanceof Float32Array ? raster[0] : new Float32Array(raster[0]);
      else data = new Float32Array(raster);

      // Compute min/max ignoring nodata and non-finite
      let mn = Number.POSITIVE_INFINITY;
      let mx = Number.NEGATIVE_INFINITY;
      const cutoff = -9990.0;
      for (let i = 0; i < data.length; i++) {
        const v = data[i];
        if (!Number.isFinite(v) || v <= cutoff) continue;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      if (!Number.isFinite(mn) || !Number.isFinite(mx)) { mn = 0; mx = 1; }

      // Update existing texture image in-place to keep node binding valid
      tileTexture.image.width = width;
      tileTexture.image.height = height;
      tileTexture.image.data = data;
      tileTexture.needsUpdate = true;

      // Push normalization uniforms
      minHeightU.value = mn;
      maxHeightU.value = mx;
      duU.value = 1.0 / Math.max(1, width);
      dvU.value = 1.0 / Math.max(1, height);

      // Adjust plane aspect to match the GeoTIFF
      const aspect = width / Math.max(1, height);
      plane.scale.set(aspect, 1, 1);

      console.log(`Loaded GeoTIFF ${url} into DataTexture: ${width}x${height}, min=${mn}, max=${mx}`);
    } catch (err) {
      console.error("Failed to load GeoTIFF:", err);
    }
  }

  // Kick off load (file should be in public/)
  // To use your own GeoTIFF, place it in public/ and change the path below
  // e.g., loadGeoTiffIntoTexture("/my_tile.tif");
  loadGeoTiffIntoTexture("/tile_x38y447_1m.tif");

  // Tweakpane controls
  const params = { colorMethod: 'hillshade', sunAzimuth: 75, sunAltitude: 8, floodLevel: 0.0 };
  const pane = new Pane({ title: 'Controls' });
  pane.addBinding(params, 'colorMethod', { options: { Height: 'height', Hillshade: 'hillshade' } }).on('change', (ev) => {
    colorMethodU.value = (ev.value === 'height') ? 0.0 : 1.0;
  });
  pane.addBinding(params, 'sunAzimuth', { min: 0, max: 360, step: 1 }).on('change', (ev) => {
    sunAzimuthU.value = ev.value;
  });
  pane.addBinding(params, 'sunAltitude', { min: 0, max: 90, step: 1 }).on('change', (ev) => {
    sunAltitudeU.value = ev.value;
  });
  pane.addBinding(params, 'floodLevel', { min: 0, max: 1, step: 0.000001, label: 'Flood Level' }).on('change', (ev) => {
    // Quantize to Float32 to match data granularity
    const f32 = new Float32Array(1);
    f32[0] = ev.value;
    floodLevelU.value = f32[0];
  });

  // Resize handling
  addEventListener("resize", () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // Animate
  function animate() {
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
  }
  animate();
})();
