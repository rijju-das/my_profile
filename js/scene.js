/* Emotion space: a rotating 3D cloud of points grouped by emotion, drawn behind the page.
   Each group sits roughly where that emotion falls on valence (left to right) and arousal
   (bottom to top); the positions are illustrative, not measured data.
   Plain canvas, no libraries. */
(() => {
  'use strict';

  const canvas = document.getElementById('emotion-space');
  if (!canvas || !canvas.getContext) return;
  const ctx = canvas.getContext('2d');
  const labelLayer = document.querySelector('.scene-labels');
  const anchor = document.querySelector('.hero-visual');
  const hero = document.querySelector('.hero');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const smallScreen = window.matchMedia('(max-width: 760px)').matches;

  // colours come from the stylesheet (--e-joy and so on), so the palette is set in one place
  const palette = getComputedStyle(document.documentElement);
  const colourOf = (name, fallback) => {
    const parts = palette.getPropertyValue(`--e-${name}`).split(',').map(Number);
    return parts.length === 3 && parts.every(Number.isFinite) ? parts : fallback;
  };

  // name, position as [valence, arousal, depth], colour
  const EMOTIONS = [
    { name: 'joy',         at: [0.78, 0.42, 0.30],   color: [255, 200, 87] },
    { name: 'surprise',    at: [0.20, 0.88, -0.25],  color: [94, 234, 212] },
    { name: 'awe',         at: [0.52, 0.28, -0.72],  color: [125, 211, 252] },
    { name: 'contentment', at: [0.72, -0.52, 0.12],  color: [134, 239, 172] },
    { name: 'neutral',     at: [0, 0, 0],            color: [226, 232, 240] },
    { name: 'sadness',     at: [-0.70, -0.56, -0.30], color: [96, 165, 250] },
    { name: 'fear',        at: [-0.62, 0.66, -0.55], color: [167, 139, 250] },
    { name: 'anger',       at: [-0.55, 0.70, 0.55],  color: [255, 107, 107] },
    { name: 'disgust',     at: [-0.76, 0.04, 0.46],  color: [244, 114, 182] }
  ];
  EMOTIONS.forEach(emotion => { emotion.color = colourOf(emotion.name, emotion.color); });
  const AXES = [
    { name: 'valence', from: [-1.08, 0, 0], to: [1.08, 0, 0] },
    { name: 'arousal', from: [0, -1.08, 0], to: [0, 1.08, 0] }
  ];
  const DUST = EMOTIONS.length;            // sprite index for the faint background points

  // a small seeded generator, so the cloud looks the same on every visit
  let seed = 20261117;
  const random = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const gauss = () => {
    let u = 0, v = 0;
    while (!u) u = random();
    while (!v) v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const points = [];
  const perEmotion = smallScreen ? 60 : 120;
  EMOTIONS.forEach((emotion, index) => {
    for (let i = 0; i < perEmotion; i += 1) {
      points.push({
        x: emotion.at[0] + gauss() * 0.15,
        y: emotion.at[1] + gauss() * 0.15,
        z: emotion.at[2] + gauss() * 0.15,
        sprite: index,
        size: 7 + random() * 11,
        alpha: 0.55 + random() * 0.45,
        phase: random() * Math.PI * 2
      });
    }
  });
  for (let i = 0; i < (smallScreen ? 140 : 320); i += 1) {
    const radius = 1.25 + random() * 1.5;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    points.push({
      x: radius * Math.sin(phi) * Math.cos(theta),
      y: radius * Math.cos(phi),
      z: radius * Math.sin(phi) * Math.sin(theta),
      sprite: DUST,
      size: 2.5 + random() * 3.5,
      alpha: 0.25 + random() * 0.4,
      phase: random() * Math.PI * 2
    });
  }

  // On a dark page the points add up like light; on a light page they are drawn as soft ink dots.
  const additive = palette.getPropertyValue('--scene-blend').trim() === 'lighter';
  const lineColour = additive ? '255,255,255' : '21,36,30';

  // one soft dot per colour, drawn once and reused for every point
  const makeSprite = ([r, g, b]) => {
    const sprite = document.createElement('canvas');
    sprite.width = sprite.height = 64;
    const c = sprite.getContext('2d');
    const glow = c.createRadialGradient(32, 32, 0, 32, 32, 32);
    glow.addColorStop(0, additive ? 'rgba(255,255,255,1)' : `rgba(${r},${g},${b},1)`);
    glow.addColorStop(additive ? 0.16 : 0.3, `rgba(${r},${g},${b},.95)`);
    glow.addColorStop(additive ? 0.45 : 0.5, `rgba(${r},${g},${b},.24)`);
    glow.addColorStop(1, `rgba(${r},${g},${b},0)`);
    c.fillStyle = glow;
    c.fillRect(0, 0, 64, 64);
    return sprite;
  };
  const sprites = EMOTIONS.map(emotion => makeSprite(emotion.color));
  sprites.push(makeSprite(colourOf('dust', [220, 228, 214])));

  // floating names for the emotions and the two axes
  const labels = [];
  if (labelLayer) {
    EMOTIONS.forEach(emotion => {
      const el = document.createElement('span');
      el.className = 'scene-label';
      el.textContent = emotion.name;
      el.style.setProperty('--c', `rgb(${emotion.color.join(',')})`);
      labelLayer.appendChild(el);
      labels.push({ el, at: emotion.at, lift: 0.2 });
    });
    AXES.forEach(axis => {
      const el = document.createElement('span');
      el.className = 'scene-label scene-label--axis';
      el.textContent = axis.name;
      labelLayer.appendChild(el);
      labels.push({ el, at: axis.to, lift: 0, axis: true });
    });
  }

  const clamp = (value, low, high) => Math.min(high, Math.max(low, value));
  const mix = (a, b, t) => a + (b - a) * t;

  let width = 0, height = 0;
  const resize = () => {
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  };

  // the pointer turns the cloud a little; it eases towards the pointer rather than jumping
  const pointer = { x: 0, y: 0, targetX: 0, targetY: 0 };
  window.addEventListener('pointermove', event => {
    pointer.targetX = event.clientX / window.innerWidth - 0.5;
    pointer.targetY = event.clientY / window.innerHeight - 0.5;
  }, { passive: true });

  const CAMERA = 2.7;
  let yaw = 0, pitch = 0, cx = 0, cy = 0, radius = 300;
  const project = (x, y, z) => {
    const cosY = Math.cos(yaw), sinY = Math.sin(yaw);
    const cosP = Math.cos(pitch), sinP = Math.sin(pitch);
    const x1 = x * cosY + z * sinY;
    const z1 = -x * sinY + z * cosY;
    const y2 = y * cosP - z1 * sinP;
    const z2 = y * sinP + z1 * cosP;
    const scale = CAMERA / (CAMERA - z2);
    return [cx + x1 * radius * scale, cy - y2 * radius * scale, z2, scale];
  };

  const draw = now => {
    const time = now / 1000;
    pointer.x += (pointer.targetX - pointer.x) * 0.05;
    pointer.y += (pointer.targetY - pointer.y) * 0.05;

    // 0 while the first screen is in view, rising to 1 once it has scrolled away
    const heroHeight = hero ? hero.offsetHeight : height;
    const scrolled = clamp(window.scrollY / (heroHeight * 0.85), 0, 1);
    const ease = scrolled * scrolled * (3 - 2 * scrolled);

    // on the first screen the cloud sits around the portrait; further down it opens out
    // into a faint field behind the whole page
    const box = anchor ? anchor.getBoundingClientRect() : { left: 0, top: 0, width, height };
    cx = mix(box.left + box.width / 2, width / 2, ease);
    cy = mix(box.top + box.height / 2, height / 2, ease);
    radius = mix(Math.min(box.width, box.height) * 0.56, Math.max(width, height) * 0.62, ease);
    const brightness = mix(1, additive ? 0.2 : 0.16, ease);

    yaw = (reduceMotion ? 0.5 : time * 0.1) + pointer.x * 0.7 + window.scrollY * 0.0005;
    pitch = 0.2 + pointer.y * 0.4;

    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = additive ? 'lighter' : 'source-over';

    // the two axes, and a thin line from the centre to each emotion
    ctx.lineWidth = 1;
    AXES.forEach(axis => {
      const a = project(...axis.from), b = project(...axis.to);
      ctx.strokeStyle = `rgba(${lineColour},${0.2 * brightness})`;
      ctx.setLineDash([3, 7]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    });
    ctx.setLineDash([]);
    const origin = project(0, 0, 0);
    EMOTIONS.forEach(emotion => {
      const end = project(...emotion.at);
      ctx.strokeStyle = `rgba(${emotion.color.join(',')},${0.32 * brightness})`;
      ctx.beginPath(); ctx.moveTo(origin[0], origin[1]); ctx.lineTo(end[0], end[1]); ctx.stroke();
    });

    for (let i = 0; i < points.length; i += 1) {
      const point = points[i];
      const [sx, sy, depth, scale] = project(point.x, point.y, point.z);
      if (scale <= 0 || sx < -40 || sx > width + 40 || sy < -40 || sy > height + 40) continue;
      const twinkle = reduceMotion ? 1 : 1 + 0.22 * Math.sin(time * 1.4 + point.phase);
      const size = point.size * scale * twinkle * mix(1, additive ? 1.5 : 1.15, ease);
      ctx.globalAlpha = clamp(point.alpha * brightness * (0.45 + 0.55 * (depth + 1.3) / 2.6), 0, 1);
      ctx.drawImage(sprites[point.sprite], sx - size / 2, sy - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    // names fade out as the first screen scrolls away, and dim when they turn to the back
    const labelFade = clamp(1 - scrolled * 2.4, 0, 1);
    labels.forEach(label => {
      const [sx, sy, depth] = project(label.at[0], label.at[1] + label.lift, label.at[2]);
      const facing = clamp(0.6 + 0.4 * (depth + 1) / 2, 0.55, 1);
      label.el.style.opacity = (labelFade * facing * (label.axis ? 0.55 : 1)).toFixed(3);
      label.el.style.transform = `translate3d(${sx.toFixed(1)}px, ${sy.toFixed(1)}px, 0) translate(-50%, -50%)`;
    });
  };

  resize();
  window.addEventListener('resize', () => { resize(); if (reduceMotion) draw(0); });

  if (reduceMotion) {
    // no continuous motion: draw once, and again only when the page is scrolled
    draw(0);
    let queued = false;
    window.addEventListener('scroll', () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; draw(0); });
    }, { passive: true });
  } else {
    const loop = now => { draw(now); requestAnimationFrame(loop); };
    requestAnimationFrame(loop);
  }
})();
