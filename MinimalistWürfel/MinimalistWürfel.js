/* global Matter */

// =======================
// ✅ Mobile responsive layer (NEW)
// =======================
const BASE_CANVAS = 960;

function getCanvasSize() {
  const margin = 16; // 留边，避免贴边
  const w = window.innerWidth - margin;
  const h = window.innerHeight - margin;
  return Math.max(280, Math.min(w, h)); // 最小 280，防止太小
}

let SCALE = 1; // s / 960
function S(v) { return v * SCALE; } // scale helper

function windowResized() {
  // 最稳方案：页面尺寸变化（旋转/地址栏收起）直接重载
  // Matter.js 不用硬做复杂缩放，避免穿墙/错位
  location.reload();
}

// =======================
// 原代码开始
// =======================

let handSec;
let handMin;
let handHour;
let mouse;
let center;

let ringBlocks = [];
let balls = [];

let cubeCount = 12;
let cubes = [];

let circleCount = 10;
let circles = [];
let restCircles = [];

let engine;
let world;

let prevMinute = -1;
let prevHour = -1;
let prevRestCount = -1;

// Strömungskräfte
let waterForceX = 0;
let waterForceY = 0;
let airForceX = 0;
let airForceY = 0;

// Ziel-Kräfte
let waterForceTargetX = 0;
let waterForceTargetY = 0;
let airForceTargetX = 0;
let airForceTargetY = 0;

// Zykluszeiten
const WATER_CYCLE_X = 10000;
const WATER_CYCLE_Y = 7000;
const AIR_CYCLE_X = 12000;
const AIR_CYCLE_Y = 9000;

// Maximale Kraftstärken（不随画布缩放，保持手感）
const WATER_FORCE_MAX_X = 0.003;
const WATER_FORCE_MAX_Y = 0.002;
const AIR_FORCE_MAX_X = 0.002;
const AIR_FORCE_MAX_Y = 0.0012;

const FORCE_SMOOTH = 0.03;

// 这些如果你后面不用也没事
const ringRadius = 380;
const RING_SEGMENTS = 600;
const RING_OVERLAP = 0.9;
const MAX_BALLS = 200;
const TRAIL_LENGTH = 5;
let centerDotR;

const MIN_SPACING = 10;

// Pfeiltasten-Schwerkraft
let arrowGravity = { x: 0, y: 0 };
let arrowKeysActive = false;

// Sekundenlinie Y-Position
let currentYLine = 0;

// Merge-Animation
let mergeAnimationActive = false;
let mergeTargetX = 0;
let mergeTargetY = 0;
let mergeStartTime = 0;
const MERGE_DURATION = 2000;
const MERGE_FORCE = 0.008;

// Manuelle Zeitsteuerung
let manualTimeEnabled = false;
let manualHour = 0;
let manualMinute = 0;
let manualSecond = 0;
let manualTimeStartMs = 0;

// Motion
let motionEnabled = false;
let gX = 0, gY = 1;
let gXSm = 0, gYSm = 1;
const MOTION_SMOOTH = 0.18;
let gravityMagnitude = 0.8;
let lastShakeMs = 0;
const SHAKE_COOLDOWN_MS = 220;
const SHAKE_MAG_THRESHOLD = 15.5;
const SHAKE_FORCE_BASE = 0.002;
const SHAKE_FORCE_EXTRA = 0.010;

// --- Hilfsfunktionen ---

function aabbOverlapWithSpacing(x1, y1, w1, h1, x2, y2, w2, h2, spacing = MIN_SPACING) {
  return !(
    x1 + w1 / 2 + spacing <= x2 - w2 / 2 ||
    x1 - w1 / 2 - spacing >= x2 + w2 / 2 ||
    y1 + h1 / 2 + spacing <= y2 - h2 / 2 ||
    y1 - h1 / 2 - spacing >= y2 + h2 / 2
  );
}

function circleOverlapWithSpacing(x1, y1, r1, x2, y2, r2, spacing = MIN_SPACING) {
  const d = dist(x1, y1, x2, y2);
  return d < (r1 + r2 + spacing);
}

function positionIsFree(x, y, kind, size) {
  for (const obj of cubes) {
    const cx = obj.body.position.x;
    const cy = obj.body.position.y;
    const s = obj.originalSize || S(200);
    if (kind === 'cube') {
      if (aabbOverlapWithSpacing(x, y, size, size, cx, cy, s, s, S(MIN_SPACING))) return false;
    } else {
      const dx = Math.max(Math.abs(x - cx) - s / 2, 0);
      const dy = Math.max(Math.abs(y - cy) - s / 2, 0);
      const distToRect = Math.sqrt(dx * dx + dy * dy);
      if (distToRect < (size + S(MIN_SPACING))) return false;
    }
  }

  for (const obj of circles) {
    const cx = obj.body.position.x;
    const cy = obj.body.position.y;
    const r = obj.originalRadius || S(100);
    if (kind === 'cube') {
      const half = size / 2;
      const dx = Math.max(Math.abs(cx - x) - half, 0);
      const dy = Math.max(Math.abs(cy - y) - half, 0);
      if (Math.sqrt(dx * dx + dy * dy) < (r + S(MIN_SPACING))) return false;
    } else {
      if (circleOverlapWithSpacing(x, y, size, cx, cy, r, S(MIN_SPACING))) return false;
    }
  }

  for (const obj of restCircles) {
    const cx = obj.body.position.x;
    const cy = obj.body.position.y;
    const r = obj.originalRadius || S(37.5);
    if (kind === 'cube') {
      const half = size / 2;
      const dx = Math.max(Math.abs(cx - x) - half, 0);
      const dy = Math.max(Math.abs(cy - y) - half, 0);
      if (Math.sqrt(dx * dx + dy * dy) < (r + S(MIN_SPACING))) return false;
    } else {
      if (circleOverlapWithSpacing(x, y, size, cx, cy, r, S(MIN_SPACING))) return false;
    }
  }

  return true;
}

// Queue Klasse
class Queue {
  constructor(maxLength) {
    this.maxLength = maxLength;
    this.elements = [];
  }
  add(element) {
    if (this.elements.length < this.maxLength) {
      this.elements.push(element);
    } else {
      this.elements.push(element);
      this.elements.shift();
    }
  }
  all() {
    return this.elements;
  }
}

// --- Motion ---

function onDeviceMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a) return;
  const ax = Number.isFinite(a.x) ? a.x : 0;
  const ay = Number.isFinite(a.y) ? a.y : 0;
  const az = Number.isFinite(a.z) ? a.z : 0;
  const nx = constrain(ax / 9.8, -1, 1);
  const ny = constrain(ay / 9.8, -1, 1);
  gX = nx;
  gY = ny;

  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  const nowMs = (typeof millis === 'function') ? millis() : Date.now();
  if (mag >= SHAKE_MAG_THRESHOLD && (nowMs - lastShakeMs) >= SHAKE_COOLDOWN_MS) {
    lastShakeMs = nowMs;
    triggerShakeImpulse(mag);
  }
}

function triggerShakeImpulse(mag) {
  const allBodies = [...cubes, ...circles, ...restCircles];
  const t = constrain((mag - SHAKE_MAG_THRESHOLD) / 12, 0, 1);
  const k = SHAKE_FORCE_BASE + SHAKE_FORCE_EXTRA * t;
  for (const obj of allBodies) {
    if (!obj || !obj.body) continue;
    const pos = obj.body.position;
    const fx = random(-1, 1) * k;
    const fy = random(-1, 1) * k;
    Matter.Body.applyForce(obj.body, pos, { x: fx, y: fy });
  }
}

function addEnableMotionButton() {
  const btn = createButton('Enable Motion');
  btn.position(20, 20);
  btn.style('font-size', '18px');
  btn.style('padding', '10px 14px');
  btn.style('z-index', '9999');

  btn.mousePressed(async () => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined' &&
          typeof DeviceMotionEvent.requestPermission === 'function') {
        const res = await DeviceMotionEvent.requestPermission();
        if (res !== 'granted') {
          btn.html('Permission denied ❌');
          return;
        }
      }
      window.addEventListener('devicemotion', onDeviceMotion, true);
      motionEnabled = true;
      btn.html('Motion Enabled ✅');
    } catch (err) {
      btn.html('Motion Failed ❌');
    }
  });
}

// --- Zeit-Funktionen ---

function getHour() {
  if (manualTimeEnabled) {
    const elapsedSec = (millis() - manualTimeStartMs) / 1000;
    const totalSeconds = manualHour * 3600 + manualMinute * 60 + manualSecond + elapsedSec;
    return Math.floor(totalSeconds / 3600) % 24;
  }
  return hour();
}

function getMinute() {
  if (manualTimeEnabled) {
    const elapsedSec = (millis() - manualTimeStartMs) / 1000;
    const totalSeconds = manualHour * 3600 + manualMinute * 60 + manualSecond + elapsedSec;
    return Math.floor(totalSeconds / 60) % 60;
  }
  return minute();
}

function getSecond() {
  if (manualTimeEnabled) {
    const elapsedSec = (millis() - manualTimeStartMs) / 1000;
    const totalSeconds = manualHour * 3600 + manualMinute * 60 + manualSecond + elapsedSec;
    return Math.floor(totalSeconds) % 60;
  }
  return second();
}

// setTime / resetTime 这些你原样保留
window.setTime = function(timeString) {
  const parts = timeString.split(':');

  if (parts.length < 2) {
    console.error('❌ Ungültiges Format! Verwende: setTime("12:34") oder setTime("12:34:56")');
    return;
  }

  manualHour = parseInt(parts[0]) || 0;
  manualMinute = parseInt(parts[1]) || 0;
  manualSecond = parts.length > 2 ? (parseInt(parts[2]) || 0) : 0;

  manualHour = constrain(manualHour, 0, 23);
  manualMinute = constrain(manualMinute, 0, 59);
  manualSecond = constrain(manualSecond, 0, 59);

  manualTimeEnabled = true;
  manualTimeStartMs = millis();

  updateTimeDisplay();

  console.log(`✅ Zeit gesetzt auf: ${manualHour.toString().padStart(2, '0')}:${manualMinute.toString().padStart(2, '0')}:${manualSecond.toString().padStart(2, '0')}`);
};

Object.defineProperty(window, 'time', {
  set: function(value) { window.setTime(value); },
  get: function() {
    if (manualTimeEnabled) {
      return `${getHour().toString().padStart(2, '0')}:${getMinute().toString().padStart(2, '0')}:${getSecond().toString().padStart(2, '0')} (manuell)`;
    } else {
      return `${hour().toString().padStart(2, '0')}:${minute().toString().padStart(2, '0')}:${second().toString().padStart(2, '0')} (System)`;
    }
  }
});

window.resetTime = function() {
  manualTimeEnabled = false;
  updateTimeDisplay();
  console.log('✅ Zurück zur Systemzeit');
};

function updateTimeDisplay() {
  const m = getMinute();
  let h = getHour() % 12;
  if (h === 0) h = 12;

  const desiredCubes = h;
  const desiredCircles = Math.floor(m / 10);
  const desiredRestCount = m % 10;

  while (cubes.length < desiredCubes) addCubeFromTop();
  while (cubes.length > desiredCubes) {
    const obj = cubes.pop();
    if (obj && obj.body) Matter.World.remove(world, obj.body);
  }

  while (circles.length < desiredCircles) addCircleFromTop();
  while (circles.length > desiredCircles) {
    const obj = circles.pop();
    if (obj && obj.body) Matter.World.remove(world, obj.body);
  }

  while (restCircles.length < desiredRestCount) addRestCircleFromTop();
  while (restCircles.length > desiredRestCount) {
    const obj = restCircles.pop();
    if (obj && obj.body) Matter.World.remove(world, obj.body);
  }

  prevMinute = m;
  prevHour = h;
}

// --- Objekte hinzufügen ---

function addCubeFromTop() {
  const cubeSize = S(190);
  const x = random(cubeSize / 2 + S(50), width - cubeSize / 2 - S(50));
  const y = -cubeSize;

  const cubeBody = Matter.Bodies.rectangle(x, y, cubeSize, cubeSize, {
    restitution: 0.3,
    friction: 0.2,
    frictionAir: 0.01,
    density: 0.06
  });

  Matter.World.add(world, cubeBody);
  cubes.push({ body: cubeBody, shrinkStart: null, originalSize: cubeSize });
}

function addCircleFromTop() {
  const r = S(50);
  const x = random(r + S(50), width - r - S(50));
  const y = -r * 2;

  const circleBody = Matter.Bodies.circle(x, y, r, {
    restitution: 0.4,
    friction: 0.2,
    frictionAir: 0.02,
    density: 0.03
  });

  Matter.World.add(world, circleBody);
  circles.push({ body: circleBody, shrinkStart: null, originalRadius: r });
}

function addRestCircleFromTop() {
  const r = S(30);
  const x = random(S(100) + r, width - S(100) - r);
  const y = -S(50);

  const smallBody = Matter.Bodies.circle(x, y, r, {
    restitution: 0.5,
    friction: 0.2,
    frictionAir: 0.02,
    density: 0.02
  });

  Matter.World.add(world, smallBody);
  restCircles.push({ body: smallBody, shrinkStart: null, originalRadius: r });
}

// --- Merge Animation ---（你原样保留，略）
// 这里以下我不改你的 merge 逻辑，只要它吃的是 width/height 就会自动适配

function startMergeAnimation() {
  mergeAnimationActive = true;
  mergeStartTime = millis();
  mergeTargetX = random(S(150), width - S(150));
  mergeTargetY = random(S(150), height - S(150));
}

function updateMergeAnimation() {
  const elapsed = millis() - mergeStartTime;
  const progress = constrain(elapsed / MERGE_DURATION, 0, 1);

  if (progress < 0.7) {
    const attractProgress = progress / 0.7;

    for (const obj of restCircles) {
      if (!obj || !obj.body) continue;

      const pos = obj.body.position;
      const dx = mergeTargetX - pos.x;
      const dy = mergeTargetY - pos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 5) {
        const forceMult = MERGE_FORCE * (1 + attractProgress * 2);
        const fx = (dx / dist) * forceMult;
        const fy = (dy / dist) * forceMult;
        Matter.Body.applyForce(obj.body, pos, { x: fx, y: fy });
      }

      if (obj.currentRadius === undefined) obj.currentRadius = obj.originalRadius;
      obj.currentRadius = obj.originalRadius * (1 - attractProgress * 0.8);

      const scale = obj.currentRadius / obj.originalRadius;
      if (scale > 0.1) {
        Matter.Body.scale(obj.body, scale / (obj.lastScale || 1), scale / (obj.lastScale || 1));
        obj.lastScale = scale;
      }
    }
  }

  if (progress >= 0.7 && progress < 1) {
    const finalProgress = (progress - 0.7) / 0.3;

    for (const obj of restCircles) {
      if (!obj || !obj.body) continue;
      if (obj.currentRadius === undefined) obj.currentRadius = obj.originalRadius;
      obj.currentRadius = obj.originalRadius * 0.2 * (1 - finalProgress);
    }
  }

  if (progress >= 1) finishMergeAnimation();
}

function finishMergeAnimation() {
  for (const obj of restCircles) {
    if (obj && obj.body) Matter.World.remove(world, obj.body);
  }
  restCircles = [];

  const r = S(50);
  const circleBody = Matter.Bodies.circle(mergeTargetX, mergeTargetY, r, {
    restitution: 0.9,
    friction: 0.7,
    frictionAir: 0.04,
    density: 0.03
  });

  Matter.World.add(world, circleBody);
  circles.push({ body: circleBody, shrinkStart: null, originalRadius: r });

  mergeAnimationActive = false;
}

// --- Physik Updates ---

function updateGravity() {
  if (arrowKeysActive) {
    engine.world.gravity.x = arrowGravity.x * gravityMagnitude;
    engine.world.gravity.y = arrowGravity.y * gravityMagnitude;
  } else if (motionEnabled) {
    gXSm = gXSm + (gX - gXSm) * MOTION_SMOOTH;
    gYSm = gYSm + (gY - gYSm) * MOTION_SMOOTH;
    engine.world.gravity.x = gXSm * gravityMagnitude;
    engine.world.gravity.y = -gYSm * gravityMagnitude;
  } else {
    engine.world.gravity.x = 0;
    engine.world.gravity.y = 0;
  }
}

function updateAmbientForce() {
  const now = millis();

  const waterPhaseX = (now % WATER_CYCLE_X) / WATER_CYCLE_X;
  waterForceTargetX = Math.sin(waterPhaseX * Math.PI * 2) * WATER_FORCE_MAX_X;

  const waterPhaseY = (now % WATER_CYCLE_Y) / WATER_CYCLE_Y;
  waterForceTargetY = Math.sin(waterPhaseY * Math.PI * 2) * WATER_FORCE_MAX_Y;

  const airPhaseX = (now % AIR_CYCLE_X) / AIR_CYCLE_X;
  airForceTargetX = Math.sin(airPhaseX * Math.PI * 2) * AIR_FORCE_MAX_X;

  const airPhaseY = (now % AIR_CYCLE_Y) / AIR_CYCLE_Y;
  airForceTargetY = Math.sin(airPhaseY * Math.PI * 2) * AIR_FORCE_MAX_Y;

  waterForceX += (waterForceTargetX - waterForceX) * FORCE_SMOOTH;
  waterForceY += (waterForceTargetY - waterForceY) * FORCE_SMOOTH;
  airForceX += (airForceTargetX - airForceX) * FORCE_SMOOTH;
  airForceY += (airForceTargetY - airForceY) * FORCE_SMOOTH;
}

function updatePhysicsBasedOnPosition() {
  const allBodies = [...cubes, ...circles, ...restCircles];

  for (const obj of allBodies) {
    if (!obj || !obj.body) continue;

    const pos = obj.body.position;
    const vel = obj.body.velocity;

    let objectType;
    let objectHeight;

    if (obj.originalSize) {
      objectType = 'cube';
      objectHeight = obj.originalSize;
    } else if (Math.abs((obj.originalRadius || 0) - S(50)) < 0.0001) {
      objectType = 'circle';
      objectHeight = (obj.originalRadius || S(50)) * 2;
    } else {
      objectType = 'rest';
      objectHeight = (obj.originalRadius || S(30)) * 2;
    }

    const objectTop = pos.y - objectHeight / 2;
    const objectBottom = pos.y + objectHeight / 2;

    let percentInWater;
    if (objectBottom <= currentYLine) percentInWater = 0;
    else if (objectTop >= currentYLine) percentInWater = 1;
    else {
      const waterPart = objectBottom - currentYLine;
      percentInWater = waterPart / objectHeight;
    }

    const isInWater = percentInWater > 0.5;

    if (!isInWater) applyAirPhysics(obj, objectType, pos, vel);
    else applyWaterPhysics(obj, objectType, pos, vel);

    applyRotation(obj, objectType, isInWater);
  }
}

// 下面 applyAirPhysics / applyWaterPhysics / applyRotation / drawAllBodiesWithStyle / drawElementsClipped / key handlers
// 你原样保留（我不改）

// --- Tastatur ---
function keyPressed() {
  arrowKeysActive = true;

  if (keyCode === UP_ARROW) arrowGravity.y = -1;
  else if (keyCode === DOWN_ARROW) arrowGravity.y = 1;
  else if (keyCode === LEFT_ARROW) arrowGravity.x = -1;
  else if (keyCode === RIGHT_ARROW) arrowGravity.x = 1;

  if ([UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW].includes(keyCode)) return false;
}

function keyReleased() {
  if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) arrowGravity.y = 0;
  else if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) arrowGravity.x = 0;

  if (arrowGravity.x === 0 && arrowGravity.y === 0) arrowKeysActive = false;
}

// --- Setup ---

function setup() {
  // ✅ Responsive canvas
  const s = getCanvasSize();
  SCALE = s / BASE_CANVAS;

  pixelDensity(1); // 手机上更稳、更不卡
  const canvas = createCanvas(s, s);

  center = { x: width / 2, y: height / 2 };

  engine = Matter.Engine.create();
  world = engine.world;
  world.gravity.y = 0;
  world.gravity.x = 0;

  addEnableMotionButton();

  mouse = new Mouse(engine, canvas, {
    stroke: 'magenta',
    strokeWeight: 2
  });

  // ✅ Walls (scaled)
  const thicknessEdge = S(100);
  const edgeRest = 0.8;

  const wallOpts = {
    isStatic: true,
    restitution: edgeRest,
    friction: 0.90,
    density: 1000
  };

  const ground = Matter.Bodies.rectangle(width / 2, height + thicknessEdge / 2, width, thicknessEdge, wallOpts);
  const ceiling = Matter.Bodies.rectangle(width / 2, -thicknessEdge / 2, width, thicknessEdge, wallOpts);
  const leftWall = Matter.Bodies.rectangle(-thicknessEdge / 2, height / 2, thicknessEdge, height, wallOpts);
  const rightWall = Matter.Bodies.rectangle(width + thicknessEdge / 2, height / 2, thicknessEdge, height, wallOpts);

  Matter.World.add(world, [ground, ceiling, leftWall, rightWall]);

  // ✅ Inner frame (scaled)
  const frameThickness = S(20);
  const frameOpts = {
    isStatic: true,
    restitution: 0.8,
    friction: 0.9,
    density: 1000,
    render: { fillStyle: 'transparent' }
  };

  const frameTop = Matter.Bodies.rectangle(width / 2, frameThickness / 2, width, frameThickness, frameOpts);
  const frameBottom = Matter.Bodies.rectangle(width / 2, height - frameThickness / 2, width, frameThickness, frameOpts);
  const frameLeft = Matter.Bodies.rectangle(frameThickness / 2, height / 2, frameThickness, height, frameOpts);
  const frameRight = Matter.Bodies.rectangle(width - frameThickness / 2, height / 2, frameThickness, height, frameOpts);

  Matter.World.add(world, [frameTop, frameBottom, frameLeft, frameRight]);

  // Würfel (Stunden)
  let h = hour() % 12;
  if (h === 0) h = 12;
  cubes = [];
  let cubeSize = S(190);

  for (let i = 0; i < h; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      const x = random(cubeSize / 2 + S(50), width - cubeSize / 2 - S(50));
      const y = random(cubeSize / 2 + S(50), height - cubeSize / 2 - S(50));
      if (positionIsFree(x, y, 'cube', cubeSize)) {
        const cubeBody = Matter.Bodies.rectangle(x, y, cubeSize, cubeSize, {
          restitution: 0.3,
          friction: 0.2,
          frictionAir: 0.01,
          density: 0.06,
          isStatic: true
        });
        Matter.World.add(world, cubeBody);
        cubes.push({ body: cubeBody, shrinkStart: null, originalSize: cubeSize });
        placed = true;
      }
      attempts++;
    }
  }

  setTimeout(() => {
    for (let obj of cubes) Matter.Body.setStatic(obj.body, false);
  }, 100);

  // Kreise (Minuten/10)
  let m = minute();
  let circleCountLocal = Math.floor(m / 10);
  circles = [];
  const bigR = S(50);

  for (let i = 0; i < circleCountLocal; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const x = random(S(100) + bigR, width - S(100) - bigR);
      const y = random(S(100) + bigR, height - S(100) - bigR);
      if (positionIsFree(x, y, 'circle', bigR)) {
        const circleBody = Matter.Bodies.circle(x, y, bigR, {
          restitution: 0.4,
          friction: 0.2,
          frictionAir: 0.02,
          density: 0.03
        });
        Matter.World.add(world, circleBody);
        circles.push({ body: circleBody, shrinkStart: null, originalRadius: bigR });
        placed = true;
      }
      attempts++;
    }
  }

  // Rest-Minuten
  const restCount = m % 10;
  restCircles = [];
  const restR = S(30);

  for (let i = 0; i < restCount; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const x = random(S(100) + restR, width - S(100) - restR);
      const y = random(S(100) + restR, height - S(100) - restR);
      if (positionIsFree(x, y, 'rest', restR)) {
        const smallBody = Matter.Bodies.circle(x, y, restR, {
          restitution: 0.5,
          friction: 0.2,
          frictionAir: 0.02,
          density: 0.02
        });
        Matter.World.add(world, smallBody);
        restCircles.push({ body: smallBody, shrinkStart: null, originalRadius: restR });
        placed = true;
      }
      attempts++;
    }
  }

  Matter.Runner.run(engine);
  prevMinute = minute();
}

// --- Draw ---
// 你原 draw 不用改（它用的是 width/height，会自动跟 canvas 走）
