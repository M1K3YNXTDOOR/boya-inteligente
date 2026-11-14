import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { simState, triggerHeatwave, toggleSpill, resetSim, updatePhysics } from './physics.js';

// Renderer & Scene
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x072233);
scene.fog = new THREE.FogExp2(0x072233, 0.018);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 200);
camera.position.set(0, 12, 26);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Lighting
scene.add(new THREE.AmbientLight(0xffffff, 0.7));
const sun = new THREE.DirectionalLight(0xfff5e4, 1.4);
sun.position.set(-15, 25, 10);
scene.add(sun);

// Coastal Bathymetry: Sloped Sandy Beach -> Shallow Shelf -> Deep Trench
const bedGeo = new THREE.PlaneGeometry(50, 24, 60, 10);
bedGeo.rotateX(-Math.PI / 2);
const pos = bedGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const x = pos.getX(i);
  let y = 0;
  if (x < -10) y = (-x - 10) * 0.45;          // Sloped sandy beach (left)
  else if (x < 4) y = -2.5;                    // Shallow reef terrace
  else y = -2.5 - Math.min(14, (x - 4) * 1.4); // Steep continental drop-off (right)
  pos.setY(i, y);
}
bedGeo.computeVertexNormals();
const seabed = new THREE.Mesh(bedGeo, new THREE.MeshStandardMaterial({ color: 0xd9b982, roughness: 0.9 }));
scene.add(seabed);

// Semi-Transparent Ocean Surface
const water = new THREE.Mesh(
  new THREE.PlaneGeometry(50, 24),
  new THREE.MeshStandardMaterial({ color: 0x0ea5e9, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.5;
scene.add(water);

// Coral Colonies on Shallow Shelf
const corals = [];
const coralMat = new THREE.MeshStandardMaterial({ color: 0x10b981 });
for (let i = 0; i < 18; i++) {
  const coral = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 + Math.random() * 0.4, 1), coralMat);
  coral.position.set(-8 + Math.random() * 10, -2.2, (Math.random() - 0.5) * 14);
  scene.add(coral);
  corals.push(coral);
}

// Thermal Buoy & Deep Trench Intake Pipe (Anchored over drop-off at x = 6)
const buoyGroup = new THREE.Group();
buoyGroup.position.set(6, 0.5, 0);

const floatBody = new THREE.Mesh(
  new THREE.CylinderGeometry(1.1, 0.9, 1.4, 16),
  new THREE.MeshStandardMaterial({ color: 0xf59e0b })
);
const intakePipe = new THREE.Mesh(
  new THREE.CylinderGeometry(0.22, 0.22, 13, 12),
  new THREE.MeshStandardMaterial({ color: 0x334155 })
);
intakePipe.position.y = -6.5;

const nozzle = new THREE.Mesh(
  new THREE.CylinderGeometry(0.18, 0.25, 1.4, 12),
  new THREE.MeshStandardMaterial({ color: 0x38bdf8 })
);
nozzle.rotation.z = Math.PI / 2;
nozzle.position.set(-0.9, -1.2, 0);

buoyGroup.add(floatBody, intakePipe, nozzle);
scene.add(buoyGroup);

// Cold-Water Particle Plume (Up pipe + Horizontal spray toward reef)
const particleCount = 160;
const pGeo = new THREE.BufferGeometry();
const pPositions = new Float32Array(particleCount * 3);
const pProgress = new Float32Array(particleCount);
for (let i = 0; i < particleCount; i++) pProgress[i] = Math.random();
pGeo.setAttribute('position', new THREE.BufferAttribute(pPositions, 3));

const particles = new THREE.Points(
  pGeo,
  new THREE.PointsMaterial({ color: 0x38bdf8, size: 0.28, transparent: true, opacity: 0.85 })
);
scene.add(particles);

// UI Bindings
const slider = document.getElementById('slider-ambient');
slider.addEventListener('input', (e) => {
  simState.ambientTemp = parseFloat(e.target.value);
});
document.getElementById('btn-heatwave').addEventListener('click', () => {
  triggerHeatwave();
  slider.value = simState.ambientTemp;
});
document.getElementById('btn-spill').addEventListener('click', toggleSpill);
document.getElementById('btn-reset').addEventListener('click', () => {
  resetSim();
  slider.value = simState.ambientTemp;
});

// Main Animation Loop
const clock = new THREE.Clock();
const healthyColor = new THREE.Color(0x10b981);
const bleachedColor = new THREE.Color(0xf8fafc);

function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.1);

  updatePhysics(dt);

  // Update Coral Bleaching Color
  const healthFactor = simState.coralHealth / 100;
  coralMat.color.copy(bleachedColor).lerp(healthyColor, healthFactor);

  // Animate Cold Water Particles when Pump Active
  const activeFlow = simState.pumpPWM > 0;
  particles.visible = activeFlow;
  if (activeFlow) {
    const speed = (simState.pumpPWM / 100) * 0.55;
    const arr = pGeo.attributes.position.array;
    for (let i = 0; i < particleCount; i++) {
      pProgress[i] = (pProgress[i] + speed * dt) % 1;
      const t = pProgress[i];
      if (t < 0.45) {
        // Rising inside deep pipe (y: -12 -> -0.7)
        const u = t / 0.45;
        arr[i * 3] = 6 + (Math.random() - 0.5) * 0.15;
        arr[i * 3 + 1] = -12 + u * 11.3;
        arr[i * 3 + 2] = (Math.random() - 0.5) * 0.15;
      } else {
        // Diffusing horizontally toward reef shelf (x: 5 -> -9)
        const u = (t - 0.45) / 0.55;
        arr[i * 3] = 5 - u * 14;
        arr[i * 3 + 1] = -0.8 - u * 1.1 + Math.sin(u * 6 + i) * 0.2;
        arr[i * 3 + 2] = (Math.sin(i * 1.7) * u) * 5.5;
      }
    }
    pGeo.attributes.position.needsUpdate = true;
  }

  // Update HUD Readouts
  document.getElementById('lbl-ambient').textContent = `${simState.ambientTemp.toFixed(1)} °C`;
  document.getElementById('val-temp').textContent = `${simState.reefTemp.toFixed(2)} °C`;
  document.getElementById('val-health').textContent = `${Math.round(simState.coralHealth)}%`;
  document.getElementById('val-pump').textContent = simState.statusText;
  document.getElementById('val-water').textContent = `${simState.tds} ppm / ${simState.turbidity.toFixed(0)} NTU`;

  controls.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

animate();