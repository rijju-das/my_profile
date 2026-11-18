/* 3D character: a small 3D version of Riju stands in the hero, where the portrait used to be.
   She walks a few steps, turns to face the visitor, idles, then walks somewhere else.
   Moving the pointer over her area makes her walk towards it: left of her, she goes left; right, she goes right.
   Clicking her makes her stop, face you and say something.
   The three buttons under her change her mood: her face, how briskly she walks and what she says.
   Uses three.js (loaded through the import map in index.html). The model is a glTF file
   with two animations: "Walk" (a 1.1 s in-place loop) and "Idle". It may also carry one gesture
   per mood, named "Gesture_happy", "Gesture_angry" and "Gesture_disgusted"; when a gesture is there
   she plays it on a click, on a mood change and now and then while resting. */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

/* Each mood: tempo scales the walk, rest is how long she stands between walks (seconds),
   enter is what she says when the mood is chosen, lines are what she says when clicked.
   Every mood other than happy needs two pictures in the assets folder:
   face_<mood>.png (her face, painted over the model's texture) and portrait_<mood>.jpg (speech bubble). */
const MOODS = {
  happy: {
    tempo: 1, rest: [2, 5],
    enter: 'Happy to see you! 😊',
    lines: ['Hi there! 👋', 'Hello! Thanks for visiting 😊', 'Hi! Want to see my research?'],
  },
  angry: {
    tempo: 1.3, rest: [0.8, 2],
    enter: 'Grr… the model overfitted again. 😠',
    lines: ['Hmph. 😠', 'Not now. I am debugging.', 'Who mislabelled my data?'],
  },
  disgusted: {
    tempo: 0.8, rest: [2.5, 5],
    enter: 'Eww, who left this bug here? 🤢',
    lines: ['Eww. 🤢', 'Yuck. Blurry test images.', 'Is that a 0.049 p-value?'],
  },
};

const stage = document.querySelector('.character-stage');
if (stage) start(stage);

function start(stage) {
  const view = stage.querySelector('.character-view') || stage;
  const canvas = view.querySelector('canvas');
  const bubble = view.querySelector('.character-bubble');
  const bubbleImage = bubble && bubble.querySelector('img');
  const bubbleText = bubble && bubble.querySelector('span');
  const moodButtons = [...stage.querySelectorAll('.character-moods button[data-mood]')];
  const modelUrl = stage.dataset.model || 'assets/character/riju_character.glb';
  const assets = stage.dataset.assets || 'assets/character/';
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fail = () => { stage.classList.add('is-failed'); };

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
  const VIEW_HEIGHT = 1.42;          // world units visible top to bottom (she is 1.0 tall)
  const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
  const distance = VIEW_HEIGHT / (2 * Math.tan(THREE.MathUtils.degToRad(FOV / 2)));
  camera.position.set(0, 0.2, distance);
  camera.lookAt(0, 0.07, 0);         // a little above her middle, which leaves room for the speech bubble

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
  const MARGIN = 0.27;               // keep her this far from the edges (about half her width)
  const MIN_ROOM = 0.25;             // she only walks if she has at least this much room each side
  function resize() {
    const w = view.clientWidth, h = view.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    halfWidth = (VIEW_HEIGHT * camera.aspect) / 2;
  }
  resize();
  new ResizeObserver(resize).observe(view);

  // ---- character state ----------------------------------------------------------------
  const SPEED = 0.41;                // world units per second; matches the stride of the walk
  const TURN_SPEED = 6;              // how quickly she turns (higher is faster)
  const FACE_VIEWER = 0;             // rotation that faces the camera
  const REACH = 0.1;                 // the pointer has to be this far from her before she walks to it
  let model, mixer, walk, idle, current;
  let mode = 'idle', timer = 1.5, targetX = 0, heading = FACE_VIEWER, hop = 0, shake = 0;
  let mood = 'happy';
  const gestures = {};               // mood name -> its gesture animation, when the model has one
  const follow = { active: false, once: false, x: 0 };   // where the pointer is, in world units

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

  const between = ([low, high]) => low + Math.random() * (high - low);
  function wrapAngle(a) { return Math.atan2(Math.sin(a), Math.cos(a)); }
  function turnToward(goal, dt) {
    const diff = wrapAngle(goal - heading);
    heading += diff * Math.min(1, TURN_SPEED * dt);
    return Math.abs(diff) < 0.05;
  }
  function pickTarget() {
    const limit = Math.max(0, halfWidth - MARGIN);
    const far = Math.min(0.6, limit * 0.8);         // prefer a spot at least this far away
    let x = model.position.x;
    for (let i = 0; i < 8 && Math.abs(x - model.position.x) < far; i += 1) x = (Math.random() * 2 - 1) * limit;
    return x;
  }

  function update(dt) {
    if (!model) return;
    const x = model.position.x;
    const limit = Math.max(0, halfWidth - MARGIN);
    if (Math.abs(x) > limit && mode !== 'walk') model.position.x = Math.sign(x) * limit;

    // the pointer leads her: it replaces whatever spot she had chosen for herself
    const led = follow.active && !reduceMotion && mode !== 'react';
    if (led) {
      const goal = Math.min(limit, Math.max(-limit, follow.x));
      if (mode === 'walk' || mode === 'turn') targetX = goal;
      else if (Math.abs(goal - x) > REACH) { targetX = goal; mode = 'turn'; }
    }

    if (mode === 'idle') {
      turnToward(FACE_VIEWER, dt);
      if (!led) timer -= dt;                        // while the pointer is on her area she waits for it
      if (timer <= 0 && !reduceMotion && limit > MIN_ROOM) {
        if (!restGesture()) { targetX = pickTarget(); mode = 'turn'; }
      }
    } else if (mode === 'turn') {
      const goal = targetX > x ? Math.PI / 2 : -Math.PI / 2;
      if (turnToward(goal, dt)) { mode = 'walk'; play(walk); }
    } else if (mode === 'walk') {
      const dir = Math.sign(targetX - x);
      const step = SPEED * MOODS[mood].tempo * dt;
      if (Math.abs(targetX - x) <= Math.max(step, 0.01)) {
        mode = 'idle';
        timer = between(MOODS[mood].rest);
        if (follow.once) { follow.active = false; follow.once = false; }
        play(idle);
      } else {
        // she can change direction mid-walk; she only steps forward once she mostly faces that way
        const facing = Math.abs(wrapAngle((dir > 0 ? Math.PI / 2 : -Math.PI / 2) - heading)) < 0.9;
        turnToward(dir > 0 ? Math.PI / 2 : -Math.PI / 2, dt);
        if (facing) model.position.x += dir * step;
      }
    } else if (mode === 'react') {
      turnToward(FACE_VIEWER, dt);
      timer -= dt;
      if (timer <= 0) { mode = 'idle'; timer = between(MOODS[mood].rest) * 0.6; play(idle, 0.3); }
    }

    // happy hop: two small bounces
    if (hop > 0) {
      hop = Math.max(0, hop - dt);
      const t = 1 - hop / 0.9;                      // 0 -> 1 over the hop
      model.position.y = Math.abs(Math.sin(t * Math.PI * 2)) * (1 - t) * 0.07;
    } else {
      model.position.y = 0;
    }
    // cross shake: a quick side-to-side wiggle that dies away
    let wiggle = 0;
    if (shake > 0) {
      shake = Math.max(0, shake - dt);
      wiggle = Math.sin((0.7 - shake) * 34) * 0.16 * (shake / 0.7);
    }
    model.rotation.y = heading + wiggle;

    shadow.position.x = model.position.x;
    const s = 1 - model.position.y * 3;
    shadow.scale.set(s, s, 1);
    placeBubble();
  }

  // ---- speech bubble: a small picture of her face and a line of text ---------------------
  let bubbleTimer = 0;
  const lineIndex = {};
  const head = new THREE.Vector3();
  function placeBubble() {
    if (!bubble || bubble.hidden || !model) return;
    head.set(model.position.x, 0.52, 0).project(camera);
    const w = view.clientWidth, h = view.clientHeight;
    const headX = (head.x * 0.5 + 0.5) * w;
    const half = bubble.offsetWidth / 2;
    const left = Math.min(Math.max(headX, half + 4), Math.max(half + 4, w - half - 4));   // keep it inside the view
    bubble.style.left = `${left}px`;
    bubble.style.top = `${(-head.y * 0.5 + 0.5) * h}px`;
    bubble.style.setProperty('--tail', `${Math.min(Math.max(half + headX - left, 18), bubble.offsetWidth - 18)}px`);
  }
  function say(text) {
    if (!bubble) return;
    if (bubbleImage) bubbleImage.src = `${assets}portrait_${mood}.jpg`;
    if (bubbleText) bubbleText.textContent = text; else bubble.textContent = text;
    bubble.hidden = false;
    bubbleTimer = 3.2;
    placeBubble();
  }
  function react(text) {
    mode = 'react';
    timer = 2.8;
    const gesture = !reduceMotion && gestures[mood];
    if (gesture) {
      if (current === gesture) gesture.reset(); else play(gesture, 0.2);
      timer = Math.max(timer, gesture.getClip().duration);
    } else {
      play(idle, 0.15);
      if (!reduceMotion) {
        if (mood === 'happy') hop = 0.9;
        if (mood === 'angry') shake = 0.7;
      }
    }
    if (text) say(text);
  }
  // now and then, instead of walking off after a rest, she does her mood's gesture (no speech bubble)
  let restsSinceGesture = 0;
  function restGesture() {
    if (!gestures[mood] || ++restsSinceGesture < 2) return false;
    restsSinceGesture = 0;
    react('');
    return true;
  }

  // ---- moods ---------------------------------------------------------------------------
  // The model carries the happy face. Another mood's face is a small picture that is painted
  // over a copy of the model's texture the first time that mood is chosen.
  let bodyMaterial, happyMap, moodRequest = 0;
  const moodMaps = {};
  function loadImage(url) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
  }
  function faceMap(name) {
    if (name === 'happy') return Promise.resolve(happyMap);
    if (!moodMaps[name]) {
      moodMaps[name] = loadImage(`${assets}face_${name}.png`).then(face => {
        const source = happyMap.image;
        const c = document.createElement('canvas');
        c.width = source.width;
        c.height = source.height;
        const g = c.getContext('2d');
        g.drawImage(source, 0, 0);
        g.drawImage(face, 0, 0, c.width, c.height);
        const map = new THREE.CanvasTexture(c);
        map.flipY = happyMap.flipY;
        map.colorSpace = happyMap.colorSpace;
        map.anisotropy = happyMap.anisotropy;
        map.wrapS = happyMap.wrapS;
        map.wrapT = happyMap.wrapT;
        return map;
      });
      moodMaps[name].catch(() => { delete moodMaps[name]; });   // allow another try later
    }
    return moodMaps[name];
  }
  function setMood(name) {
    if (!MOODS[name] || !model) return;
    mood = name;
    moodButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.mood === name)));
    walk.timeScale = MOODS[name].tempo;
    react(MOODS[name].enter);
    const request = ++moodRequest;
    faceMap(name).then(map => {
      if (request !== moodRequest || !bodyMaterial) return;     // a newer choice was made meanwhile
      bodyMaterial.map = map;
    }).catch(() => {});                                        // keep the face she has if the picture fails
  }
  moodButtons.forEach(button => button.addEventListener('click', () => setMood(button.dataset.mood)));

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
  // where the pointer is along the floor, in world units
  function pointerX(event) {
    const rect = canvas.getBoundingClientRect();
    return ((event.clientX - rect.left) / rect.width * 2 - 1) * halfWidth;
  }
  canvas.addEventListener('pointermove', event => {
    stage.classList.toggle('is-hover', hitTest(event));
    if (event.pointerType === 'touch') return;        // a finger leads her by tapping instead (below)
    follow.active = true;
    follow.once = false;
    follow.x = pointerX(event);
  });
  canvas.addEventListener('pointerleave', () => {
    stage.classList.remove('is-hover');
    if (!follow.once) follow.active = false;
  });
  // on a touch screen, tapping beside her sends her there
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || hitTest(event)) return;
    follow.active = true;
    follow.once = true;
    follow.x = pointerX(event);
  });
  canvas.addEventListener('click', event => {
    if (!hitTest(event)) return;
    const lines = MOODS[mood].lines;
    const i = lineIndex[mood] || 0;
    lineIndex[mood] = (i + 1) % lines.length;
    react(lines[i]);
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
      const clip = name => gltf.animations.find(a => a.name.toLowerCase() === name);
      const walkClip = clip('walk'), idleClip = clip('idle');
      if (!walkClip || !idleClip) { fail(); return; }
      model = gltf.scene;
      const anisotropy = renderer.capabilities.getMaxAnisotropy();
      model.traverse(o => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        if (o.material.map) o.material.map.anisotropy = anisotropy;
        // her face is painted on the body mesh (the other mesh is her hair)
        if (o.material.map && (!bodyMaterial || /web|body/i.test(o.name) || /web|body/i.test(o.material.name))) {
          bodyMaterial = o.material;
          happyMap = o.material.map;
        }
      });
      scene.add(model);
      mixer = new THREE.AnimationMixer(model);
      walk = mixer.clipAction(walkClip);
      idle = mixer.clipAction(idleClip);
      for (const name of Object.keys(MOODS)) {
        const gestureClip = clip(`gesture_${name}`);
        if (!gestureClip) continue;
        gestures[name] = mixer.clipAction(gestureClip);
        gestures[name].setLoop(THREE.LoopOnce, 1);
        gestures[name].clampWhenFinished = true;      // hold the last pose until she blends back to idle
      }
      model.position.x = 0;
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
