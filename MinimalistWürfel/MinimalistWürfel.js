/* global Matter */

Matter.use('matter-wrap');

let handSec;
let handMin;
let handHour;
let mouse;
let center;

let ringBlocks = [];   // 每个元素：{ body, theta, x, y, r, isOpen }
let balls = [];

// Anzahl der Würfel als Variable (maximal 12)
let cubeCount = 12;
let cubes = [];

// Anzahl der Kreise als Variable
let circleCount = 10;
let circles = [];
let restCircles = []; // kleine Kreise für die Rest-Minuten

let engine;
let world;

// 记录上一次分钟，用于每分钟重置小球
let prevMinute = -1;
let prevHour = -1;
let prevCircleCount = -1;
let prevRestCount = -1;

const ringRadius = 380;

// 控制外圈圆球数量与相邻重叠因子
const RING_SEGMENTS = 600;
const RING_OVERLAP  = 0.9;

// 目标维持的最大球数
const MAX_BALLS = 200;

// 拖尾长度
const TRAIL_LENGTH = 5;
let centerDotR;

// --- Helfer: Prüfen, ob eine Position mit Mindestabstand frei ist ---
const MIN_SPACING = 10;

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
    const s = obj.originalSize || 200;
    if (kind === 'cube') {
      if (aabbOverlapWithSpacing(x, y, size, size, cx, cy, s, s, MIN_SPACING)) return false;
    } else {
      const dx = Math.max(Math.abs(x - cx) - s / 2, 0);
      const dy = Math.max(Math.abs(y - cy) - s / 2, 0);
      const distToRect = Math.sqrt(dx * dx + dy * dy);
      if (distToRect < (size + MIN_SPACING)) return false;
    }
  }

  for (const obj of circles) {
    const cx = obj.body.position.x;
    const cy = obj.body.position.y;
    const r = obj.originalRadius || 100;
    if (kind === 'cube') {
      const half = size / 2;
      const dx = Math.max(Math.abs(cx - x) - half, 0);
      const dy = Math.max(Math.abs(cy - y) - half, 0);
      if (Math.sqrt(dx * dx + dy * dy) < (r + MIN_SPACING)) return false;
    } else {
      if (circleOverlapWithSpacing(x, y, size, cx, cy, r, MIN_SPACING)) return false;
    }
  }

  for (const obj of restCircles) {
    const cx = obj.body.position.x;
    const cy = obj.body.position.y;
    const r = obj.originalRadius || 37.5;
    if (kind === 'cube') {
      const half = size / 2;
      const dx = Math.max(Math.abs(cx - x) - half, 0);
      const dy = Math.max(Math.abs(cy - y) - half, 0);
      if (Math.sqrt(dx * dx + dy * dy) < (r + MIN_SPACING)) return false;
    } else {
      if (circleOverlapWithSpacing(x, y, size, cx, cy, r, MIN_SPACING)) return false;
    }
  }

  return true;
}

// ---------- Queue 类 ----------
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

// ===== iPhone 竖屏：真实重力（devicemotion）=====
let motionEnabled = false;
let gX = 0, gY = 1;       // raw -1..1
let gXSm = 0, gYSm = 1;   // smooth -1..1
const MOTION_SMOOTH = 0.18;
const GRAVITY_MAG = 0.8;

function onDeviceMotion(e) {
  const a = e.accelerationIncludingGravity;
  if (!a) return;

  // iPhone 竖屏：a.x 左右, a.y 上下（注意方向之后在 draw 里处理）
  const nx = constrain(a.x / 9.8, -1, 1);
  const ny = constrain(a.y / 9.8, -1, 1);

  gX = nx;
  gY = ny;
}

function addEnableMotionButton() {
  const btn = createButton('Enable Motion');
  btn.position(20, 20);
  btn.style('font-size', '18px');
  btn.style('padding', '10px 14px');
  btn.style('z-index', '9999');

  btn.mousePressed(async () => {
    try {
      // iOS 13+ 需要显式请求权限
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

function setup() {
  const canvas = createCanvas(960, 960);
  center = { x: width / 2, y: height / 2 };

  engine = Matter.Engine.create();
  world = engine.world;
  world.gravity.y = GRAVITY_MAG;

  // iPhone：按钮启用 motion（最稳）
  addEnableMotionButton();

  // --- ENTFERNT: Physik für äußeren Kreis (Zifferblatt) ---
  ringBlocks = []; // leer lassen

  // 用外圈小球直径当作指针的厚度基准
  const capDiameter = (ringBlocks.length > 0) ? ringBlocks[0].r * 2 : 26;
  centerDotR = capDiameter * 1.2;

  // ------- 鼠标控制 -------
  mouse = new Mouse(engine, canvas, {
    stroke: 'magenta',
    strokeWeight: 2
  });

  // ------- 画布边界 -------
  const thicknessEdge = 100;
  const edgeRest = 0.8;

  const wallOpts = {
    isStatic: true,
    restitution: edgeRest,
    friction: 0.9,
    density: 1000
  };

  const ground = Matter.Bodies.rectangle(width / 2, height + thicknessEdge / 2, width, thicknessEdge, wallOpts);
  const ceiling = Matter.Bodies.rectangle(width / 2, -thicknessEdge / 2, width, thicknessEdge, wallOpts);
  const leftWall = Matter.Bodies.rectangle(-thicknessEdge / 2, height / 2, thicknessEdge, height, wallOpts);
  const rightWall = Matter.Bodies.rectangle(width + thicknessEdge / 2, height / 2, thicknessEdge, height, wallOpts);

  Matter.World.add(world, [ground, ceiling, leftWall, rightWall]);

  // Würfel (Stunden)
  let h = hour() % 12;
  if (h === 0) h = 12;
  cubes = [];
  let cubeSize = 200;

  for (let i = 0; i < h; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 1000) {
      const x = random(cubeSize / 2 + 50, width - cubeSize / 2 - 50);
      const y = random(cubeSize / 2 + 50, height - cubeSize / 2 - 50);
      if (positionIsFree(x, y, 'cube', cubeSize)) {
        const cubeBody = Matter.Bodies.rectangle(x, y, cubeSize, cubeSize, {
          restitution: 0.3,
          friction: 0.2,
          frictionAir: 0.01,
          density: 0.15,
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
  const bigR = 100;

  for (let i = 0; i < circleCountLocal; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const x = random(100 + bigR, width - 100 - bigR);
      const y = random(100 + bigR, height - 100 - bigR);
      if (positionIsFree(x, y, 'circle', bigR)) {
        const circleBody = Matter.Bodies.circle(x, y, bigR, {
          restitution: 0.9,
          friction: 0.7,
          frictionAir: 0.04,
          density: 0.03
        });
        Matter.World.add(world, circleBody);
        circles.push({ body: circleBody, shrinkStart: null, originalRadius: bigR });
        placed = true;
      }
      attempts++;
    }
  }

  // Rest-Minuten (m % 10)
  const restCount = m % 10;
  restCircles = [];
  const restR = 37.5;

  for (let i = 0; i < restCount; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const x = random(100 + restR, width - 100 - restR);
      const y = random(100 + restR, height - 100 - restR);
      if (positionIsFree(x, y, 'rest', restR)) {
        const smallBody = Matter.Bodies.circle(x, y, restR, {
          restitution: 0.95,
          friction: 0.15,
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

// ---------- 小球：从“天空”生成 ----------
function spawnBall() {
  if (balls.length > 1000) return;

  const x = random(width * 0.2, width * 0.8);
  const y = -50;
  const r = 7.5;

  let body = Matter.Bodies.circle(x, y, r, {
    restitution: 0.9,
    friction: 0.01,
    frictionAir: 0.005,
    density: 0.0008
  });

  Matter.Body.setVelocity(body, { x: random(-0.5, 0.5), y: random(0, 1) });

  const trail = new Queue(TRAIL_LENGTH);
  trail.add({ x, y });

  Matter.World.add(world, body);

  balls.push({
    body,
    r,
    rOriginal: r,
    isDying: false,
    shrinkSpeed: 0.96,
    bornFrame: frameCount,
    trail,
    color: color(0)
  });
}

function controlPopulation() {
  let aliveCount = 0;
  for (const b of balls) if (!b.isDying) aliveCount++;
  if (aliveCount <= MAX_BALLS) return;

  const toMarkPerFrame = 2;
  let marked = 0;
  for (let i = 0; i < balls.length && marked < toMarkPerFrame; i++) {
    const b = balls[i];
    if (!b.isDying) {
      b.isDying = true;
      marked++;
    }
  }
}

function resetBalls() {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    try { if (b && b.body) Matter.World.remove(world, b.body); } catch (e) {}
  }
  balls.length = 0;
}

let shrinkCounterActive = false;
let shrinkStartFrame = 0;

// helper: fügt ein Stundenwürfel von oben hinzu
function addCubeFromTop() {
  const cubeSize = 200;
  const maxTries = 300;
  let landX, landY;

  for (let t = 0; t < maxTries; t++) {
    const x = random(cubeSize / 2 + 50, width - cubeSize / 2 - 50);
    const y = random(cubeSize / 2 + 50, height - cubeSize / 2 - 50);
    if (positionIsFree(x, y, 'cube', cubeSize)) {
      landX = x; landY = y;
      break;
    }
  }

  const x = landX !== undefined ? landX : random(cubeSize / 2 + 50, width - cubeSize / 2 - 50);
  const y = -200;

  const cubeBody = Matter.Bodies.rectangle(x, y, cubeSize, cubeSize, {
    restitution: 0.3,
    friction: 0.2,
    frictionAir: 0.01,
    density: 0.15
  });

  Matter.World.add(world, cubeBody);
  cubes.push({ body: cubeBody, shrinkStart: null, originalSize: cubeSize });
}

function addCircleFromTop() {
  const r = 100;
  const maxTries = 300;
  let landX, landY;

  for (let t = 0; t < maxTries; t++) {
    const x = random(100 + r, width - 100 - r);
    const y = random(100 + r, height - 100 - r);
    if (positionIsFree(x, y, 'circle', r)) {
      landX = x; landY = y;
      break;
    }
  }

  const x = landX !== undefined ? landX : random(100 + r, width - 100 - r);
  const y = -150;

  const circleBody = Matter.Bodies.circle(x, y, r, {
    restitution: 0.9,
    friction: 0.7,
    frictionAir: 0.04,
    density: 0.03
  });

  Matter.World.add(world, circleBody);
  circles.push({ body: circleBody, shrinkStart: null, originalRadius: r });
}

function addRestCircleFromTop() {
  const r = 37.5;
  const maxTries = 300;
  let landX, landY;

  for (let t = 0; t < maxTries; t++) {
    const x = random(100 + r, width - 100 - r);
    const y = random(100 + r, height - 100 - r);
    if (positionIsFree(x, y, 'rest', r)) {
      landX = x; landY = y;
      break;
    }
  }

  const x = landX !== undefined ? landX : random(100 + r, width - 100 - r);
  const y = -150;

  const smallBody = Matter.Bodies.circle(x, y, r, {
    restitution: 0.95,
    friction: 0.15,
    frictionAir: 0.02,
    density: 0.02
  });

  Matter.World.add(world, smallBody);
  restCircles.push({ body: smallBody, shrinkStart: null, originalRadius: r });
}

function draw() {
  background('#D9D9D9');

  // ===== 重力：iPhone motion 优先；没启用就用键盘 =====
  if (motionEnabled) {
    // 平滑一下
    gXSm = lerp(gXSm, gX, MOTION_SMOOTH);
    gYSm = lerp(gYSm, gY, MOTION_SMOOTH);

    // iPhone 竖屏：左右用 x；上下用 y，但要反一下才是“向下”
    world.gravity.x = GRAVITY_MAG * gXSm;
    world.gravity.y = GRAVITY_MAG * (-gYSm);
  } else {
    // 键盘 fallback
    let gx = gravityX;
    let gy = gravityY;
    if (gx !== 0 || gy !== 0) {
      let len = sqrt(gx * gx + gy * gy);
      world.gravity.x = GRAVITY_MAG * gx / len;
      world.gravity.y = GRAVITY_MAG * gy / len;
    } else {
      world.gravity.x = 0;
      world.gravity.y = GRAVITY_MAG;
    }
  }

  // Debug（你不想要就删掉）
  fill(0);
  noStroke();
  textSize(14);
  text(`motion:${motionEnabled}  gX:${gXSm.toFixed(2)} gY:${gYSm.toFixed(2)}`, 20, 70);

  const s = second();
  const m = minute();
  let h = hour() % 12;
  if (h === 0) h = 12;

  // === Stundenwürfel数量跟随小时 ===
  const desiredCubes = h;
  if (prevHour === -1) prevHour = desiredCubes;

  if (desiredCubes > cubes.length) {
    const toAdd = desiredCubes - cubes.length;
    for (let i = 0; i < toAdd; i++) addCubeFromTop();
  } else if (desiredCubes < cubes.length) {
    const toRemove = cubes.length - desiredCubes;
    for (let i = 0; i < toRemove; i++) {
      const obj = cubes[cubes.length - 1];
      if (obj.shrinkStart === null) obj.shrinkStart = frameCount;
    }
  }
  prevHour = h;

  // === Minuten/10 Kreise ===
  const desiredCircles = Math.floor(m / 10);
  if (prevCircleCount === -1) prevCircleCount = desiredCircles;

  if (desiredCircles > prevCircleCount) {
    const toAdd = desiredCircles - prevCircleCount;
    for (let i = 0; i < toAdd; i++) addCircleFromTop();
  } else if (desiredCircles < prevCircleCount) {
    const toRemove = prevCircleCount - desiredCircles;
    for (let i = 0; i < toRemove; i++) {
      const obj = circles[circles.length - 1 - i];
      if (obj && obj.shrinkStart === null) obj.shrinkStart = frameCount;
    }
  }
  prevCircleCount = desiredCircles;

  // === Rest-Minuten ===
  const desiredRestCount = m % 10;
  if (prevRestCount === -1) prevRestCount = desiredRestCount;

  if (desiredRestCount > prevRestCount) {
    const toAdd = desiredRestCount - prevRestCount;
    for (let i = 0; i < toAdd; i++) addRestCircleFromTop();
  } else if (desiredRestCount < prevRestCount) {
    const toRemove = prevRestCount - desiredRestCount;
    for (let i = 0; i < toRemove; i++) {
      const obj = restCircles[restCircles.length - 1 - i];
      if (obj && obj.shrinkStart === null) obj.shrinkStart = frameCount;
    }
  }
  prevRestCount = desiredRestCount;

  // 每分钟重置一次所有小球
  if (m !== prevMinute) {
    resetBalls();
    prevMinute = m;
    shrinkCounterActive = false;
    shrinkStartFrame = 0;
  }

  // 秒针小球：每秒生成一个
  if (!shrinkCounterActive && balls.length < 59 && frameCount % 60 === 0) spawnBall();

  // 最后 3 秒开始缩小消失
  if (balls.length >= 57 && !shrinkCounterActive) {
    shrinkCounterActive = true;
    shrinkStartFrame = frameCount;
  }

  if (shrinkCounterActive) {
    let t = constrain((frameCount - shrinkStartFrame) / 180, 0, 1);
    for (let i = balls.length - 1; i >= 0; i--) {
      const b = balls[i];
      b.r = b.rOriginal * (1 - t);
      if (b.r < 1) {
        try { Matter.World.remove(world, b.body); } catch (e) {}
        balls.splice(i, 1);
      }
    }
  }

  controlPopulation();

  // ------- 小球绘制（拖尾） -------
  noStroke();

  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    const body = b.body;
    const p = body.position;

    // 限速
    const v = body.velocity;
    const maxV = 25;
    Matter.Body.setVelocity(body, { x: constrain(v.x, -maxV, maxV), y: constrain(v.y, -maxV, maxV) });

    if (frameCount % 2 === 0) b.trail.add({ x: p.x, y: p.y });

    const points = b.trail.all();
    for (let j = 0; j < points.length - 1; j++) {
      const p1 = points[j];
      const p2 = points[j + 1];
      const steps = 4;
      const totalSegments = max(1, points.length - 1);
      const size = b.r * 2;

      for (let k = 0; k < steps; k++) {
        const tt = k / steps;
        const x = lerp(p1.x, p2.x, tt);
        const y = lerp(p1.y, p2.y, tt);
        const progress = (j + tt) / totalSegments;
        const alpha = lerp(40, 255, progress);

        fill(0, alpha);
        ellipse(x, y, size, size);
      }
    }

    // 主体
    fill(0);
    ellipse(p.x, p.y, b.r * 2, b.r * 2);
  }

  // === Würfel zeichnen + schrumpfen ===
  fill(0);
  stroke(0);
  for (let i = cubes.length - 1; i >= 0; i--) {
    const obj = cubes[i];
    const pos = obj.body.position;
    const angle = obj.body.angle;

    let currentSize = obj.originalSize;
    if (obj.shrinkStart !== null) {
      const shrinkDuration = 180;
      const t = constrain((frameCount - obj.shrinkStart) / shrinkDuration, 0, 1);
      currentSize = obj.originalSize * (1 - t);

      if (currentSize < 1) {
        try { Matter.World.remove(world, obj.body); } catch (e) {}
        cubes.splice(i, 1);
        continue;
      }
    }

    push();
    translate(pos.x, pos.y);
    rotate(angle);
    rectMode(CENTER);
    rect(0, 0, currentSize, currentSize, 40);
    pop();
  }

  // === Minuten Kreise ===
  fill(0);
  stroke(0);
  for (let i = circles.length - 1; i >= 0; i--) {
    const obj = circles[i];
    const pos = obj.body.position;

    let currentRadius = obj.originalRadius;
    if (obj.shrinkStart !== null) {
      const shrinkDuration = 180;
      const t = constrain((frameCount - obj.shrinkStart) / shrinkDuration, 0, 1);
      currentRadius = obj.originalRadius * (1 - t);

      if (currentRadius < 1) {
        try { Matter.World.remove(world, obj.body); } catch (e) {}
        circles.splice(i, 1);
        continue;
      }
    }

    push();
    translate(pos.x, pos.y);
    ellipse(0, 0, currentRadius * 2, currentRadius * 2);
    pop();
  }

  // === Rest-Minuten Kreise ===
  fill(0);
  stroke(0);
  for (let i = restCircles.length - 1; i >= 0; i--) {
    const obj = restCircles[i];
    const pos = obj.body.position;

    let currentRadius = obj.originalRadius;
    if (obj.shrinkStart !== null) {
      const shrinkDuration = 180;
      const t = constrain((frameCount - obj.shrinkStart) / shrinkDuration, 0, 1);
      currentRadius = obj.originalRadius * (1 - t);

      if (currentRadius < 1) {
        try { Matter.World.remove(world, obj.body); } catch (e) {}
        restCircles.splice(i, 1);
        continue;
      }
    }

    push();
    translate(pos.x, pos.y);
    ellipse(0, 0, currentRadius * 2, currentRadius * 2);
    pop();
  }

  mouse.draw();
}

// ------- 辅助：画没有端点球的圆角矩形指针 -------
function drawHandSimple(body, clr, minThickness = null) {
  if (!body) return;

  const cx = body.position.x;
  const cy = body.position.y;
  const angle = body.angle || 0;

  const axis = { x: Math.cos(angle), y: Math.sin(angle) };
  const perp = { x: -axis.y, y: axis.x };

  let maxProjAxis = 0;
  let maxProjPerp = 0;
  for (const v of body.vertices) {
    const rx = v.x - cx;
    const ry = v.y - cy;
    const pa = Math.abs(rx * axis.x + ry * axis.y);
    const pp = Math.abs(rx * perp.x + ry * perp.y);
    if (pa > maxProjAxis) maxProjAxis = pa;
    if (pp > maxProjPerp) maxProjPerp = pp;
  }

  const halfLen = Math.max(maxProjAxis, maxProjPerp);
  const halfTh  = Math.min(maxProjAxis, maxProjPerp);

  const len = halfLen * 2;
  let thickness = halfTh * 2;
  if (minThickness !== null) thickness = max(thickness, minThickness);

  const rectLen = len;
  const drawAngle = (maxProjAxis >= maxProjPerp) ? angle : angle + HALF_PI;

  push();
  translate(cx, cy);
  rotate(drawAngle);
  noStroke();
  fill(clr);
  rectMode(CENTER);
  rect(0, 0, rectLen, thickness, thickness / 2);
  pop();
}

// Schwerkraftsteuerung per Pfeiltasten（fallback）
let gravityX = 0;
let gravityY = 0;

function keyPressed() {
  if (keyCode === LEFT_ARROW) gravityX = -1;
  if (keyCode === RIGHT_ARROW) gravityX = 1;
  if (keyCode === UP_ARROW) gravityY = -1;
  if (keyCode === DOWN_ARROW) gravityY = 1;
}

function keyReleased() {
  if (keyCode === LEFT_ARROW && gravityX === -1) gravityX = 0;
  if (keyCode === RIGHT_ARROW && gravityX === 1) gravityX = 0;
  if (keyCode === UP_ARROW && gravityY === -1) gravityY = 0;
  if (keyCode === DOWN_ARROW && gravityY === 1) gravityY = 0;
}
