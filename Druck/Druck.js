// =====================================================
// p5 + Matter.js (Rotation only)
// + Long-press mouse = stronger magnetic attraction
// + Mouse shown as yellow ball
// + Magnetic field visualized as big translucent circle
// =====================================================

/* global Matter */

let cols = 26;
let rows = 21;

let spacingX, spacingY;
let dotR, baseDotR;

let dots = [];
let timeDots = [];
let timeMask;
let lastMinute = -1;

let influenceRadius;

// ---- Matter.js ----
let engine, world;
let rotBodies = [];
let pinConstraints = [];

// ---- Long press state ----
let isPressing = false;
let pressStartMs = 0;

const BOOST = {
  holdDelayMs: 120,
  rampMs: 700,
  // 长按时的半径放大倍数，增大此值可以扩大磁力/光圈范围
  maxRadiusMul: 4,
  maxKMul: 2.2,
  maxCloseMul: 1.4
};

const ROT = {
  backAngle: 0,
  frontAngle: Math.PI,

  k: 0.10,
  d: 0.35,

  air: 0.18,

  pinStiffness: 1.0,
  pinDamping: 0.20,

  minFlip: 0.10,
  closeRatio: 0.12
};

// =====================================================
// Setup / Draw
// =====================================================
function setup() {
  createCanvas(960, 960);

  spacingX = width / cols;
  spacingY = height / rows;

  baseDotR = min(spacingX, spacingY) * 0.40;
  dotR = baseDotR;

  // 缩小影响半径（从原来的 *8 改为 *4），同时会影响背景光圈与磁力范围
  influenceRadius = max(spacingX, spacingY) * 4;
  
  engine = Matter.Engine.create();
  world = engine.world;
  world.gravity.x = 0;
  world.gravity.y = 0;

  updateTimeMask();
  initDots();
  buildRotationPhysicsForTimePixels();
}

function draw() {
  background(0);

  if (minute() !== lastMinute) {
    updateTimeMask();
    initDots();
    buildRotationPhysicsForTimePixels();
  }

  // ---- Magnetic field (draw FIRST, behind dots) ----
  drawMagneticField();

  applyMouseRotationControl();
  Matter.Engine.update(engine, 1000 / 60);

  noStroke();
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const d = dots[i][j];
      updateFlipFromPhysics(d);
      drawDot(d);
    }
  }

  // ---- Mouse magnet (draw LAST, on top) ----
  drawMouseMagnet();
}

// =====================================================
// Mouse events
// =====================================================
function mousePressed() {
  isPressing = true;
  pressStartMs = millis();
}

function mouseReleased() {
  isPressing = false;
}

// =====================================================
// Magnetic visuals
// =====================================================
function getHoldT() {
  let t = 0;
  if (isPressing) {
    const held = millis() - pressStartMs - BOOST.holdDelayMs;
    if (held > 0) t = constrain(held / BOOST.rampMs, 0, 1);
  }
  // ease-out
  return 1 - (1 - t) * (1 - t);
}

function drawMagneticField() {
  const holdT = getHoldT();
  const r = influenceRadius * lerp(1, BOOST.maxRadiusMul, holdT);

  push();
  noStroke();
  // ② 透明黄色（现在不会脏）
  fill(255, 255, 255, 30);
  circle(mouseX, mouseY, r * 2);

  pop();
}


function drawMouseMagnet() {
  const holdT = getHoldT();
  const coreR = lerp(12, 20, holdT);

  noStroke();
  fill(255, 220, 0);
  circle(mouseX, mouseY, coreR * 2);
}

// =====================================================
// Data init
// =====================================================
function initDots() {
  dots = [];
  timeDots = [];

  for (let i = 0; i < cols; i++) {
    dots[i] = [];
    for (let j = 0; j < rows; j++) {
      const baseX = i * spacingX + spacingX / 2;
      const baseY = j * spacingY + spacingY / 2;
      const isTime = !!timeMask[i][j];

      const dot = {
        baseX,
        baseY,
        isTimePixel: isTime,
        flip: isTime ? ROT.minFlip : 0,
        rotBody: null
      };

      dots[i][j] = dot;
      if (isTime) timeDots.push(dot);
    }
  }
}

// =====================================================
// Matter: rotation-only bodies
// =====================================================
function clearRotationPhysics() {
  for (const c of pinConstraints) Matter.World.remove(world, c);
  for (const b of rotBodies) Matter.World.remove(world, b);

  pinConstraints = [];
  rotBodies = [];

  for (const d of timeDots) d.rotBody = null;
}

function buildRotationPhysicsForTimePixels() {
  clearRotationPhysics();

  const w = 6;
  const h = 14;

  for (const d of timeDots) {
    const body = Matter.Bodies.rectangle(d.baseX, d.baseY, w, h, {
      frictionAir: ROT.air,
      restitution: 0,
      collisionFilter: { group: -1, category: 0x0001, mask: 0x0000 }
    });

    const pin = Matter.Constraint.create({
      pointA: { x: d.baseX, y: d.baseY },
      bodyB: body,
      pointB: { x: 0, y: 0 },
      length: 0,
      stiffness: ROT.pinStiffness,
      damping: ROT.pinDamping
    });

    Matter.World.add(world, [body, pin]);

    Matter.Body.setAngle(body, ROT.backAngle);
    Matter.Body.setAngularVelocity(body, 0);

    d.rotBody = body;
    rotBodies.push(body);
    pinConstraints.push(pin);
  }
}

// =====================================================
// Mouse → rotation control
// =====================================================
function applyMouseRotationControl() {
  const holdT = getHoldT();

  const r = influenceRadius * lerp(1, BOOST.maxRadiusMul, holdT);
  const closeR = r * (ROT.closeRatio * lerp(1, BOOST.maxCloseMul, holdT));
  const kNow = ROT.k * lerp(1, BOOST.maxKMul, holdT);
  const dNow = ROT.d;

  for (const d of timeDots) {
    const b = d.rotBody;
    if (!b) continue;

    const distToMouse = dist(mouseX, mouseY, d.baseX, d.baseY);

    let targetFlip;
    if (distToMouse <= closeR) targetFlip = 1;
    else if (distToMouse >= r) targetFlip = ROT.minFlip;
    else {
      const t = (distToMouse - closeR) / (r - closeR);
      const eased = 1 - t * t;
      targetFlip = ROT.minFlip + (1 - ROT.minFlip) * eased;
    }

    const targetAngle = lerp(ROT.backAngle, ROT.frontAngle, targetFlip);
    const diff = shortestAngleDiff(b.angle, targetAngle);

    const angVel = b.angularVelocity;
    const angAcc = kNow * diff - dNow * angVel;

    Matter.Body.setAngularVelocity(b, angVel + angAcc);
  }
}

function shortestAngleDiff(a, b) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

// =====================================================
// Physics → flip
// =====================================================
function updateFlipFromPhysics(d) {
  if (!d.isTimePixel || !d.rotBody) {
    d.flip = 0;
    return;
  }

  const a = constrain(d.rotBody.angle, 0, Math.PI);
  d.flip = map(a, 0, Math.PI, 0, 1);
  if (d.flip < ROT.minFlip) d.flip = ROT.minFlip;
}

// =====================================================
// Dot rendering
// =====================================================
function drawDot(d) {
  const isTime = d.isTimePixel;
  const flip = d.flip;

  const baseBrightness = isTime ? 180 : 80;
  const dm = isTime ? dist(mouseX, mouseY, d.baseX, d.baseY) : 999999;
  const tGlow = constrain(1 - dm / influenceRadius, 0, 1);

  const sx = isTime ? max(abs(cos(flip * PI)), 0.18) : 1;

  let colorLevel;
  if (isTime) {
    colorLevel = lerp(80, 255, flip);
    colorLevel = constrain(colorLevel + 60 * tGlow, 0, 255);
  } else {
    colorLevel = baseBrightness;
  }

  push();
  translate(d.baseX, d.baseY);
  scale(sx, 1);
  fill(colorLevel);
  circle(0, 0, baseDotR * 2);
  pop();
}

// =====================================================
// Time mask (HH / MM)
// =====================================================
function updateTimeMask() {
  lastMinute = minute();

  timeMask = Array(cols).fill().map(() => Array(rows).fill(false));

  const hh = nf(hour(), 2);
  const mm = nf(minute(), 2);

  const w = 5;
  const hPix = 7;
  const CHAR_GAP = 1;
  const BASE_LINE_GAP = 1;

  const maxChars = 2;
  const s = max(1, min(
    floor(cols / (maxChars * w + (maxChars - 1) * CHAR_GAP)),
    floor(rows / (2 * hPix + BASE_LINE_GAP)),
    8
  ));

  const lineGap = BASE_LINE_GAP * s;
  const lineHeight = hPix * s;
  const totalHeight = lineHeight * 2 + lineGap;
  const offsetY = floor((rows - totalHeight) / 2);

  const totalWidth = maxChars * w * s + (maxChars - 1) * CHAR_GAP * s;
  const offsetX = floor((cols - totalWidth) / 2);

  drawLineToMask(hh, 0, offsetX, offsetY, s, w, hPix, CHAR_GAP, lineHeight, lineGap);
  drawLineToMask(mm, 1, offsetX, offsetY, s, w, hPix, CHAR_GAP, lineHeight, lineGap);
}

function drawLineToMask(str, lineIndex, offsetX, offsetY, s, w, hPix, CHAR_GAP, lineHeight, lineGap) {
  for (let idx = 0; idx < str.length; idx++) {
    const pattern = charToMatrix(pixelFont[str[idx]]);
    for (let y = 0; y < hPix; y++) {
      for (let x = 0; x < w; x++) {
        if (!pattern[y][x]) continue;
        for (let sy = 0; sy < s; sy++) {
          for (let sx = 0; sx < s; sx++) {
            const px = offsetX + idx * (w * s + CHAR_GAP * s) + x * s + sx;
            const py = offsetY + lineIndex * (lineHeight + lineGap) + y * s + sy;
            if (px >= 0 && px < cols && py >= 0 && py < rows) {
              timeMask[px][py] = true;
            }
          }
        }
      }
    }
  }
}

// =====================================================
// Font
// =====================================================
function charToMatrix(rows) {
  return rows.map(r => r.split("").map(c => (c === "1" ? 1 : 0)));
}

const pixelFont = {
  "0": ["11111","1...1","1...1","1...1","1...1","1...1","11111"],
  "1": ["..1..",".11..","1.1..","..1..","..1..","..1..","11111"],
  "2": ["11111","....1","....1","11111","1....","1....","11111"],
  "3": ["11111","....1","....1",".1111","....1","....1","11111"],
  "4": ["1...1","1...1","1...1","11111","....1","....1","....1"],
  "5": ["11111","1....","1....","11111","....1","....1","11111"],
  "6": ["11111","1....","1....","11111","1...1","1...1","11111"],
  "7": ["11111","....1","...1.","..1..",".1...",".1...",".1..."],
  "8": ["11111","1...1","1...1","11111","1...1","1...1","11111"],
  "9": ["11111","1...1","1...1","11111","....1","....1","11111"]
};
