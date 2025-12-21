// =====================================================
// p5 + Matter.js (Rotation only)
// + Long-press mouse = stronger magnetic attraction
// + 黄色小球作为移动磁体（由程序重力驱动）
// + 当黄色小球靠近“任意时间像素”时开始吸引（更灵敏）
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
let mouseConstraint;

// ---- Long press state ----
let isPressing = false;
let pressStartMs = 0;

const BOOST = {
  holdDelayMs: 120,
  rampMs: 700,
  maxRadiusMul: 4,
  maxKMul: 2.2,
  maxCloseMul: 1.4
};

const ROT = {
  backAngle: 0,
  frontAngle: Math.PI,

  // ✅ 更灵敏的 PD 参数（比你原来更“跟手”）
  k: 0.18,
  d: 0.22,

  air: 0.18,

  pinStiffness: 1.0,
  pinDamping: 0.20,

  // ✅ 更明显的对比
  minFlip: 0.02,

  // ✅ closeR 更大，贴近更容易翻满
  closeRatio: 0.24
};

// === 黄色小球（作为磁体中心） ===
let yellowBall = null;
const YELLOW_R = 12;

// 人为重力强度：每帧施加在黄色小球上的向下力（按质量考虑）
const YELLOW_GRAVITY = 0.0009;

// 黄色小球靠近哪个位置时开始吸引（改为：靠近任意时间像素触发）
// activation radius = influenceRadius * magnetTriggerMul
let magnetTriggerMul = 1.0;

// ✅ 让球更容易回到数字附近（轻微拉向中部，可按需设为 0 关闭）
const CENTER_PULL = 0.0; // 之前为 0.00003

// =====================================================
// Setup / Draw
// =====================================================
function setup() {
  createCanvas(960, 960);

  spacingX = width / cols;
  spacingY = height / rows;

  baseDotR = min(spacingX, spacingY) * 0.40;
  dotR = baseDotR;

  influenceRadius = max(spacingX, spacingY) * 4;

  engine = Matter.Engine.create();
  world = engine.world;
  world.gravity.x = 0;
  world.gravity.y = 0;

  // Mouse constraint: drag yellow ball
  const canv = document.querySelector("canvas");
  if (canv) {
    const matterMouse = Matter.Mouse.create(canv);
    matterMouse.pixelRatio = window.devicePixelRatio || 1;
    mouseConstraint = Matter.MouseConstraint.create(engine, {
      mouse: matterMouse,
      constraint: { stiffness: 0.22, damping: 0.1, render: { visible: false } }
    });
    Matter.World.add(world, mouseConstraint);
  }

  // ---- frame walls ----
  const wallThickness = 80;
  const wallOpts = { isStatic: true, restitution: 0.9, friction: 0.0 };
  const ground = Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, wallOpts);
  const ceiling = Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, wallOpts);
  const leftWall = Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, wallOpts);
  const rightWall = Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, wallOpts);
  Matter.World.add(world, [ground, ceiling, leftWall, rightWall]);

  // Yellow ball
  const startY = height - YELLOW_R - 6;
  const yBody = Matter.Bodies.circle(width * 0.5, startY, YELLOW_R, {
    restitution: 0.6,
    friction: 0.05,
    frictionAir: 0.02,
    density: 0.08,
    label: "yellowBall"
  });
  Matter.World.add(world, yBody);
  yellowBall = { body: yBody, r: YELLOW_R };

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

  drawMagneticField();

  updateYellowBallGravity();

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

  drawYellowBall();
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
  return 1 - (1 - t) * (1 - t); // ease-out
}

function isYellowBallDragged() {
  if (!mouseConstraint || !yellowBall) return false;
  if (mouseConstraint.body && mouseConstraint.body === yellowBall.body) return true;
  const c = mouseConstraint.constraint;
  if (c) {
    if (c.body === yellowBall.body) return true;
    if (c.bodyA === yellowBall.body || c.bodyB === yellowBall.body) return true;
  }
  return false;
}

function drawMagneticField() {
  const holdT = getHoldT();
  const dragging = isYellowBallDragged();
  if (!yellowBall || (!dragging && holdT <= 0)) return;

  const cx = yellowBall.body.position.x;
  const cy = yellowBall.body.position.y;

  const r = influenceRadius * (holdT > 0 ? lerp(1, BOOST.maxRadiusMul, holdT) : 1.0);
  const alpha = dragging && holdT <= 0 ? 120 : lerp(110, 220, holdT);

  push();
  noStroke();
  fill(255, 255, 255, alpha * 0.2);
  circle(cx, cy, r * 2);
  pop();
}

function drawYellowBall() {
  if (!yellowBall) return;
  const p = yellowBall.body.position;

  const dragging = isYellowBallDragged();
  const holdT = getHoldT();

  push();
  noStroke();

  if (dragging || holdT > 0) {
    const glowT = constrain(holdT, 0, 1);
    const alpha = dragging && glowT === 0 ? 180 : lerp(120, 255, glowT);
    const glowMul = (dragging && glowT === 0) ? 2.4 : lerp(2.6, BOOST.maxRadiusMul, glowT);
    fill(255, 220, 0, alpha);
    circle(p.x, p.y, yellowBall.r * 2 * glowMul);
  }

  fill(255, 220, 0);
  circle(p.x, p.y, yellowBall.r * 2);
  pop();
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
// ✅ NEW: activation based on nearest time pixel
// =====================================================
function isActiveNearTime(cx, cy, triggerR) {
  // timeDots 可能很多，但这里 26*21 规模很小，直接扫就行
  for (const d of timeDots) {
    if (dist(cx, cy, d.baseX, d.baseY) <= triggerR) return true;
  }
  return false;
}

// =====================================================
// YellowBall → rotation control
// =====================================================
function applyMouseRotationControl() {
  if (!yellowBall) return;

  const holdT = getHoldT();
  const cx = yellowBall.body.position.x;
  const cy = yellowBall.body.position.y;

  // ✅ 改成：靠近任意时间像素就激活（更灵敏）
  const triggerR = influenceRadius * magnetTriggerMul;
  const active = isActiveNearTime(cx, cy, triggerR);

  const r = influenceRadius * lerp(1, BOOST.maxRadiusMul, holdT);
  const closeR = r * (ROT.closeRatio * lerp(1, BOOST.maxCloseMul, holdT));

  const kActive = ROT.k * lerp(1, BOOST.maxKMul, holdT);
  const kIdle = ROT.k * 0.35; // idle 也比之前强一点，避免“钝”
  const dNow = ROT.d;

  for (const d of timeDots) {
    const b = d.rotBody;
    if (!b) continue;

    const distToMag = dist(cx, cy, d.baseX, d.baseY);

    let targetFlip;
    if (!active) {
      targetFlip = ROT.minFlip;
    } else {
      if (distToMag <= closeR) targetFlip = 1;
      else if (distToMag >= r) targetFlip = ROT.minFlip;
      else {
        const t = (distToMag - closeR) / (r - closeR);
        const eased = 1 - t * t; // stronger near center
        targetFlip = ROT.minFlip + (1 - ROT.minFlip) * eased;
      }
    }

    const targetAngle = lerp(ROT.backAngle, ROT.frontAngle, targetFlip);
    const diff = shortestAngleDiff(b.angle, targetAngle);

    const angVel = b.angularVelocity;
    const angAcc = (active ? kActive : kIdle) * diff - dNow * angVel;

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
  const dm =
    isTime && yellowBall
      ? dist(yellowBall.body.position.x, yellowBall.body.position.y, d.baseX, d.baseY)
      : 999999;

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

  timeMask = Array(cols)
    .fill()
    .map(() => Array(rows).fill(false));

  const hh = nf(hour(), 2);
  const mm = nf(minute(), 2);

  const w = 5;
  const hPix = 7;
  const CHAR_GAP = 1;
  const BASE_LINE_GAP = 1;

  const maxChars = 2;
  const s = max(
    1,
    min(
      floor(cols / (maxChars * w + (maxChars - 1) * CHAR_GAP)),
      floor(rows / (2 * hPix + BASE_LINE_GAP)),
      8
    )
  );

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

function charToMatrix(rows) {
  return rows.map((r) => r.split("").map((c) => (c === "1" ? 1 : 0)));
}

const pixelFont = {
  "0": ["11111", "1...1", "1...1", "1...1", "1...1", "1...1", "11111"],
  "1": ["..1..", ".11..", "1.1..", "..1..", "..1..", "..1..", "11111"],
  "2": ["11111", "....1", "....1", "11111", "1....", "1....", "11111"],
  "3": ["11111", "....1", "....1", ".1111", "....1", "....1", "11111"],
  "4": ["1...1", "1...1", "1...1", "11111", "....1", "....1", "....1"],
  "5": ["11111", "1....", "1....", "11111", "....1", "....1", "11111"],
  "6": ["11111", "1....", "1....", "11111", "1...1", "1...1", "11111"],
  "7": ["11111", "....1", "...1.", "..1..", ".1...", ".1...", ".1..."],
  "8": ["11111", "1...1", "1...1", "11111", "1...1", "1...1", "11111"],
  "9": ["11111", "1...1", "1...1", "11111", "....1", "....1", "11111"]
};

// =====================================================
// Yellow ball: programmed gravity (only affects yellow ball)
// + optional center pull for better interaction frequency
// =====================================================
function updateYellowBallGravity() {
  if (!yellowBall) return;
  const b = yellowBall.body;

  // 若被鼠标抓取则不施加程序力，便于拖动到任意位置
  if (isYellowBallDragged && isYellowBallDragged()) return;

  // 向下恒定力（按质量缩放），保证小球会受重力影响并能在画布内运动
  const gForce = YELLOW_GRAVITY * b.mass;
  Matter.Body.applyForce(b, b.position, { x: 0, y: gForce });

  // 不再使用中心拉力（CENTER_PULL = 0），若想要轻微横向摆动可取消下面注释并调整参数：
  // const sway = 0.00002 * b.mass * Math.sin(millis() / 400);
  // Matter.Body.applyForce(b, b.position, { x: sway, y: 0 });
}
