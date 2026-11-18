/* Walking character: a small 3D version of Riju strolls along the bottom of the hero.
   She walks to a spot, turns to face the visitor, idles, then walks somewhere else.
   Clicking her makes her stop, face you, hop and say hi.
   Uses three.js (loaded through the import map in index.html). The model is a glTF file
   with two animations: "Walk" (a 1.1 s in-place loop) and "Idle". */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const stage = document.querySelector('.character-stage');
if (stage) start(stage);

function start(stage) {
  const canvas = stage.querySelector('canvas');
  const bubble = stage.querySelector('.character-bubble');
  const modelUrl = stage.dataset.model || 'assets/character/riju_character.glb';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fail = () => { stage.hidden = true; };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
  } catch (error) { fail(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NoToneMapping;

  // ---- scene, camera and light ------------------------------------------------------
  const scene = new THREE.Scene();
  const FOV = 22;
  const VIEW_HEIGHT = 1.32;          // world units visible top to bottom (she is 1.0 tall)
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const distance = VIEW_HEIGHT / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  camera.position.set(0, 0.18, distance);
  camera.lookAt(0, 0.02, 0);

  // mostly soft, even light so her colours read the way they were painted; the two
  // directional lights only add a little shape
  scene.add(new THREE.HemisphereLight(0xffffff, 0xdccfbd, 2.3));
  const key = new THREE.DirectionalLight(0xffffff, 1.05);
  key.position.set(-1.5, 2.5, 4);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xfff4e6, 0.3);
  fill.position.set(3, 1.5, 2);
  scene.add(fill);

  // soft round shadow under her feet (cheaper and softer than real shadows)
  const shadow = (() => {
    const size = 128;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(21,36,30,0.30)');
    grad.addColorStop(1, 'rgba(21,36,30,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.62, 0.26),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false })
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.y = -0.498;
    scene.add(mesh);
    return mesh;
  })();

  // ---- sizing ---------------------------------------------------------------------------
  let halfWidth = 1;                 // half of the visible floor width, in world units
  const MARGIN = 0.32;               // keep her this far from the edges
  function resize() {
    const w = stage.clientWidth, h = stage.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfWidth = (VIEW_HEIGHT * camera.aspect) / 2;
  }
  resize();
  new ResizeObserver(resize).observe(stage);

  // ---- character state ----------------------------------------------------------------
  const SPEED = 0.41;                // world units per second; matches the stride of the walk
  const TURN_SPEED = 6;              // how quickly she turns (higher is faster)
  const FACE_VIEWER = 0;             // rotation that faces the camera
  let model, mixer, walk, idle, current;
  let mode = 'idle', timer = 1.5, targetX = 0, heading = FACE_VIEWER, hop = 0;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
  loader.setDRACOLoader(draco);

  function play(action, fade = 0.25) {
    if (current === action) return;
    action.reset().setEffectiveWeight(1).fadeIn(fade).play();
    if (current) current.fadeOut(fade);
    current = action;
  }

  function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function turnToward(goal, dt) {
    const diff = wrapAngle(goal - heading);
    heading += diff * Math.min(1, TURN_SPEED * dt);
    model.rotation.y = heading;
    return Math.abs(diff) < 0.05;
  }
  function pickTarget() {
    const limit = Math.max(0, halfWidth - MARGIN);
    let x = model.position.x;
    for (let i = 0; i < 8 && Math.abs(x - model.position.x) < 0.6; i += 1) x = (Math.random() * 2 - 1) * limit;
    return x;
  }

  function update(dt) {
    if (!model) return;
    const x = model.position.x;
    const limit = Math.max(0, halfWidth - MARGIN);
    if (Math.abs(x) > limit && mode !== 'walk') model.position.x = Math.sign(x) * limit;

    if (mode === 'idle') {
      turnToward(FACE_VIEWER, dt);
      timer -= dt;
      if (timer <= 0 && !reduceMotion && limit > 0.4) {
        targetX = pickTarget();
        mode = 'turn';
      }
    } else if (mode === 'turn') {
      const goal = targetX > x ? Math.PI / 2 : -Math.PI / 2;
      if (turnToward(goal, dt)) { mode = 'walk'; play(walk); }
    } else if (mode === 'walk') {
      const dir = Math.sign(targetX - x);
      const step = SPEED * dt;
      if (Math.abs(targetX - x) <= step) {
        model.position.x = targetX;
        mode = 'idle';
        timer = 2 + Math.random() * 3;
        play(idle);
      } else {
        model.position.x += dir * step;
      }
    } else if (mode === 'react') {
      turnToward(FACE_VIEWER, dt);
      timer -= dt;
      if (timer <= 0) { mode = 'idle'; timer = 1.5 + Math.random() * 2; }
    }

    // happy hop: two small bounces after a click
    if (hop > 0) {
      hop = Math.max(0, hop - dt);
      const t = 1 - hop / 0.9;                      // 0 -> 1 over the hop
      const bounce = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * 0.07;
      model.position.y = bounce;
    } else {
      model.position.y = 0;
    }
    shadow.position.x = model.position.x;
    const s = 1 - model.position.y * 3;
    shadow.scale.set(s, s, 1);
    placeBubble();
  }

  // ---- speech bubble -------------------------------------------------------------------
  const greetings = ['Hi there! 👋', 'Hello! Thanks for visiting 😊', 'Hi! Want to see my research?'];
  let greeting = 0, bubbleTimer = 0;
  const head = new THREE.Vector3();
  function placeBubble() {
    if (!bubble || bubble.hidden) return;
    head.set(model.position.x, 0.62, 0).project(camera);
    bubble.style.left = `${(head.x * 0.5 + 0.5) * 100}%`;
    bubble.style.top = `${(-head.y * 0.5 + 0.5) * 100}%`;
  }
  function say(text) {
    if (!bubble) return;
    bubble.textContent = text;
    bubble.hidden = false;
    bubbleTimer = 2.8;
    placeBubble();
  }

  // ---- clicking her --------------------------------------------------------------------
  const corner = new THREE.Vector3();
  function hitTest(event) {
    if (!model) return false;
    const rect = canvas.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width * 2 - 1;
    const py = -((event.clientY - rect.top) / rect.height * 2 - 1);
    corner.set(model.position.x - 0.26, -0.5, 0).project(camera);
    const left = corner.x, bottom = corner.y;
    corner.set(model.position.x + 0.26, 0.5, 0).project(camera);
    return px >= left && px <= corner.x && py >= bottom && py <= corner.y;
  }
  canvas.addEventListener('pointermove', event => stage.classList.toggle('is-hover', hitTest(event)));
  canvas.addEventListener('pointerleave', () => stage.classList.remove('is-hover'));
  canvas.addEventListener('click', event => {
    if (!hitTest(event)) return;
    mode = 'react';
    timer = 2.6;
    play(idle, 0.15);
    if (!reduceMotion) hop = 0.9;
    say(greetings[greeting]);
    greeting = (greeting + 1) % greetings.length;
  });

  // ---- loop: only runs while the stage is on screen and the tab is visible -------------
  const clock = new THREE.Clock();
  let onScreen = false, running = false;
  function frame() {
    if (!onScreen || document.hidden) { running = false; return; }
    const dt = Math.min(clock.getDelta(), 0.05);
    if (mixer) mixer.update(dt);
    update(dt);
    if (bubbleTimer > 0) { bubbleTimer -= dt; if (bubbleTimer <= 0) bubble.hidden = true; }
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  function wake() {
    if (running || !onScreen || document.hidden) return;
    running = true;
    clock.getDelta();
    requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', wake);

  let requested = false;
  function load() {
    if (requested) return;
    requested = true;
    const onLoad = gltf => {
      model = gltf.scene;
      const anisotropy = renderer.capabilities.getMaxAnisotropy();
      model.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        if (o.material.map) o.material.map.anisotropy = anisotropy;
      });
      scene.add(model);
      mixer = new THREE.AnimationMixer(model);
      const clip = name => gltf.animations.find(a => a.name.toLowerCase() === name);
      const walkClip = clip('walk'), idleClip = clip('idle');
      if (!walkClip || !idleClip) { fail(); return; }
      walk = mixer.clipAction(walkClip);
      idle = mixer.clipAction(idleClip);
      model.position.x = reduceMotion ? 0 : -Math.max(0, halfWidth - MARGIN) * 0.6;
      play(idle, 0);
      stage.classList.add('is-ready');
      wake();
    };
    // a page may embed the model as base64 text (used by the private preview); the site loads the file
    const inline = window.CHARACTER_GLB_BASE64;
    if (inline) {
      const bytes = Uint8Array.from(atob(inline), ch => ch.charCodeAt(0));
      loader.parse(bytes.buffer, '', onLoad, fail);
    } else {
      loader.load(modelUrl, onLoad, undefined, fail);
    }
  }

  new IntersectionObserver(entries => {
    onScreen = entries.some(entry => entry.isIntersecting);
    if (onScreen) { load(); wake(); }
  }, { rootMargin: '200px' }).observe(stage);
}
