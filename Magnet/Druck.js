// =====================================================
// p5 + Matter.js (Rotation only)
// + Long-press = stronger magnetic attraction
// + Yellow ball = moving magnet (physics body)
// + Magnet activates when yellow ball is near ANY time pixel (more sensitive)
// + Mobile REAL gravity (DeviceOrientation) controls yellow ball direction
//   - iPhone needs HTTPS + user tap to request permission
//   - This sketch includes an on-screen debug overlay (disabled below)
// + Space = charge & kick (works mid-air)
// + A/D = mid-air horizontal control
// =====================================================

/* global Matter */

//Matter.use && Matter.use("matter-wrap"); // safe if wrap plugin exists

// --------------------- Grid ---------------------
let cols = 21; // 改小行列数，让整体看起来更大 (原 26)
let rows = 17; // (原 21)

let spacingX, spacingY;
let baseDotR;

let dots = [];
let timeDots = [];
let timeMask;
let lastMinute = -1;

let influenceRadius;

// --------------------- Matter ---------------------
let engine, world;
let rotBodies = [];
let pinConstraints = [];
let mouseConstraint;
let canvasEl;
let frameWalls = [];

// --------------------- Long press (mouse) ---------------------
let isPressing = false;
let pressStartMs = 0;

const BOOST = {
  holdDelayMs: 120,
  rampMs: 700,
  maxRadiusMul: 4, // ✅ 恢复为 4，确保物理磁力范围足够大
  maxKMul: 2.2,
  maxCloseMul: 1.4
};

const ROT = {
  backAngle: 0,
  frontAngle: Math.PI,

  // snappier PD
  k: 0.18,
  d: 0.22,

  air: 0.18,

  pinStiffness: 1.0,
  pinDamping: 0.20,

  minFlip: 0.02,
  closeRatio: 0.24
};

// --------------------- Yellow ball ---------------------
let yellowBall = null;
const YELLOW_R = 30; // ✅ 15 -> 30 (恢复小球原本大小)

// fallback downward gravity if device not available
const YELLOW_GRAVITY = 0.0009;

// ✅ 定义两种物理状态的参数
const PHYSICS_WATER = { frictionAir: 0.15, density: 0.001 }; // 左侧：高阻力，低密度（轻）
const PHYSICS_AIR   = { frictionAir: 0.01, density: 0.08 };  // 右侧：低阻力，正常密度（重）

// activation radius = influenceRadius * magnetTriggerMul
let magnetTriggerMul = 1.0;

// --------------------- Device Gravity ---------------------
let deviceGX = 0; // [-1..1]
let deviceGY = 1; // [-1..1]
let deviceGravityEnabled = false;
let deviceGravityStatus = "init";
let needsPermissionIOS = false;
let orientationListenerAttached = false;
let motionListenerAttached = false;
let lastOrientationEventMs = 0;
const ORIENTATION_STALE_MS = 1200;

// strength of device gravity force
const DEVICE_G = 0.0022;
// smoothing
const GRAVITY_FILTER = 0.18;

// --------------------- Space kick (jump) ---------------------
let spacePressing = false;
let spaceStartMs = 0;

const SPACE_KICK = {
  holdDelayMs: 0,
  rampMs: 850,

  // impulse range (press longer = stronger)
  minImpulse: 0.018,
  maxImpulse: 0.35,

  // optional: tiny upward bias even on short tap
  minUpBias: 0.0
};

// --------------------- Air control (A / D) ---------------------
let moveLeft = false;
let moveRight = false;

const AIR_CTRL = {
  force: 0.0016,  // 每帧水平推力强度（0.0008~0.0025）
  maxVX: 8.0,     // 水平最高速度限制
  damping: 0.997  // 水平阻尼（越接近1越滑）
};

// =====================================================
// p5 Setup / Draw
// =====================================================
function getCanvasSize() {
  const s = min(windowWidth, windowHeight);
  return constrain(s, 320, 960);
}

function rebuildStaticWorld() {
  for (const w of frameWalls) {
    try { Matter.World.remove(world, w); } catch (e) {}
  }
  frameWalls = [];

  if (yellowBall && yellowBall.body) {
    try { Matter.World.remove(world, yellowBall.body); } catch (e) {}
  }
  yellowBall = null;

  clearRotationPhysics();

  const wallThickness = width * (80 / 960);
  const wallOpts = { isStatic: true, restitution: 0.9, friction: 0.0 };
  const ground = Matter.Bodies.rectangle(width / 2, height + wallThickness / 2, width, wallThickness, wallOpts);
  const ceiling = Matter.Bodies.rectangle(width / 2, -wallThickness / 2, width, wallThickness, wallOpts);
  const leftWall = Matter.Bodies.rectangle(-wallThickness / 2, height / 2, wallThickness, height, wallOpts);
  const rightWall = Matter.Bodies.rectangle(width + wallThickness / 2, height / 2, wallThickness, height, wallOpts);
  frameWalls = [ground, ceiling, leftWall, rightWall];
  Matter.World.add(world, frameWalls);

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

function windowResized() {
  const s = getCanvasSize();
  resizeCanvas(s, s);

  spacingX = width / cols;
  spacingY = height / rows;
  baseDotR = min(spacingX, spacingY) * 0.44;
  influenceRadius = max(spacingX, spacingY) * 4;

  if (engine && world) {
    rebuildStaticWorld();
  }
}

function setup() {
  const s = getCanvasSize();
  const c = createCanvas(s, s); // 1. 获取 canvas 实例
  canvasEl = c;
  pixelDensity(1); // ✅ [新增] 强制 1:1 像素密度，修复高分屏下鼠标坐标错位导致无法拾取小球的问题

  spacingX = width / cols;
  spacingY = height / rows;
  // 增大系数 (0.40 -> 0.44) 让点更饱满
  baseDotR = min(spacingX, spacingY) * 0.44;

  influenceRadius = max(spacingX, spacingY) * 4;

  // Matter engine
  engine = Matter.Engine.create();
  world = engine.world;
  world.gravity.x = 0;
  world.gravity.y = 0;

  // Mouse constraint (drag yellow ball)
  // FIX: 使用 p5 canvas 元素并强制 pixelRatio 为 1，确保坐标在任何 DPI 屏幕上都对齐
  const matterMouse = Matter.Mouse.create(c.elt);
  matterMouse.pixelRatio = 1; 

  mouseConstraint = Matter.MouseConstraint.create(engine, {
    mouse: matterMouse,
    constraint: { stiffness: 0.22, damping: 0.1, render: { visible: false } }
  });
  Matter.World.add(world, mouseConstraint);

  rebuildStaticWorld();

  // Enable device gravity (tap on iOS)
  setupDeviceGravityUI();
}

function draw() {
  // 1. 计算 120秒 循环逻辑
  const nowMs = millis();
  const cycleSeconds = (nowMs / 1000) % 120; // 0 - 120
  
  let splitX;
  if (cycleSeconds < 60) {
    // 0-60s: 左 -> 右
    splitX = map(cycleSeconds, 0, 60, 0, width);
  } else {
    // 60-120s: 右 -> 左
    splitX = map(cycleSeconds, 60, 120, width, 0);
  }

  // 2. 更新逻辑 (时间点、磁力)
  if (minute() !== lastMinute) {
    updateTimeMask();
    initDots();
    buildRotationPhysicsForTimePixels();
  }

  // 3. 物理属性更新：根据小球位置决定是 "水" 还是 "空气"
  if (yellowBall) {
    const b = yellowBall.body;
    // 如果小球中心在分界线左侧 -> 水，否则 -> 空气
    const targetPhys = (b.position.x < splitX) ? PHYSICS_WATER : PHYSICS_AIR;
    
    // 只有当属性未生效时才去设置，避免重复计算
    // 注意：浮点数比较通常需要一点容差，但这里直接赋值比较即可
    if (Math.abs(b.frictionAir - targetPhys.frictionAir) > 0.0001) {
      Matter.Body.set(b, { 
        frictionAir: targetPhys.frictionAir,
        density: targetPhys.density 
      });
    }
    
    updateYellowBallGravity();     // A/D control
    applyMagnetRotationControl();  // magnet
  }

  Matter.Engine.update(engine, 1000 / 60);

  // =========================================================
  // 4. 视觉绘制 - 两次绘制实现黑白分割
  // =========================================================

  // --- Layer A: 右侧 ("空气" - 白底黑物) ---
  background(255); // 白底
  
  // 画这一层的内容（传入 style 模式）
  drawSceneContent("AIR");

  // --- Layer B: 左侧 ("水" - 黑底黄物) - 使用裁剪 ---
  if (splitX > 0) {
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(0, 0, splitX, height); // 定义左侧裁剪区
    drawingContext.clip();

    // 绘制左侧背景
    background(0); // 黑底

    // 画这一层的内容
    drawSceneContent("WATER");

    drawingContext.restore();
  }

  drawDeviceDebugOverlay();
}

/**
 * 统一场景绘制函数
 * @param {string} mode "AIR" (右) 或 "WATER" (左)
 */
function drawSceneContent(mode) {
  noStroke();

  // 1. 绘制点阵 (恢复原本细腻的视觉规则)
  // AIR (右): 白底黑字。flip=1时显示黑色，flip=0时淡化。
  // WATER(左): 黑底白/黄字。flip=1时显示亮色，flip=0时变暗。
  
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      const d = dots[i][j];
      updateFlipFromPhysics(d); // 核心规则：更新翻转物理

      const isTime = d.isTimePixel;
      const flip = d.flip; // 0..1

      // --- 计算发光/距离感应 (保留原规则) ---
      let tGlow = 0;
      if (isTime && yellowBall) {
         const dm = dist(yellowBall.body.position.x, yellowBall.body.position.y, d.baseX, d.baseY);
         tGlow = constrain(1 - dm / influenceRadius, 0, 1);
      }

      // --- 计算缩放 (保留原规则: 翻转动画) ---
      const sx = isTime ? max(abs(cos(flip * PI)), 0.18) : 1;

      // --- 计算颜色 ---
      let finalColor;

      if (mode === "AIR") {
        // [右侧风格] 白底黑墨
        const bgDotColor = 220; // 设定统一的背景点颜色

        if (!isTime) {
          finalColor = bgDotColor; // 背景点
        } else {
          // 时间点：原本越翻转越亮(255)，现在反过来，越翻转越黑(0)
          // 基础：从背景色(220)过渡到黑(0) --- ✅ 修复：起点改为 220
          let darkness = lerp(bgDotColor, 0, flip);
          // 发光：变黑
          darkness = constrain(darkness - 60 * tGlow, 0, 255);
          finalColor = darkness;
        }
      } else {
        // [左侧风格] 黑底黄/白墨 (保留原版视觉质感)
        const bgDotColor = 50; // 设定统一的背景点颜色

        if (!isTime) {
          finalColor = bgDotColor; // 背景点
        } else {
          // 时间点：越翻转越亮
          // 基础：从背景色(50)过渡到亮色(255) --- ✅ 修复：起点改为 50
          let brightness = lerp(bgDotColor, 255, flip);
          // 发光：变得更亮
          brightness = constrain(brightness + 60 * tGlow, 0, 255);
          
          finalColor = brightness; 
        }
      }
      
      // 绘制
      push();
      translate(d.baseX, d.baseY);
      scale(sx, 1);
      
      // 如果是在左侧(WATER)且是时间点，我们可以给一点黄色倾向，或者保持原版白色
      if (mode === "WATER" && isTime) {
         // 模拟原版的高亮感，稍微加点黄
         fill(255, 255, 255 - (tGlow * 100)); // 靠近时略微发黄? 或者直接 fill(finalColor) 保持原教旨
         fill(finalColor); 
      } else {
         fill(finalColor);
      }
      
      circle(0, 0, baseDotR * 2);
      pop();
    }
  }

  // 2. 磁场圈
  if (yellowBall) {
    const holdT = getHoldT();
    const dragging = isYellowBallDragged();
    if (dragging || holdT > 0) {
      const r = influenceRadius * lerp(1, BOOST.maxRadiusMul, holdT);
      const alpha = dragging && holdT <= 0 ? 120 : lerp(110, 220, holdT);
      
      fill(mode === "AIR" ? 0 : 255, alpha * 0.1); 
      circle(yellowBall.body.position.x, yellowBall.body.position.y, r * 2);
    }
  }

  // 3. 绘制黄色/黑色小球
  drawYellowBallStyled(mode);
}

/**
 * 专门绘制带风格的小球
 */
function drawYellowBallStyled(mode) {
  if (!yellowBall) return;
  const p = yellowBall.body.position;
  const r = yellowBall.r;

  const dragging = isYellowBallDragged();
  const holdT = getHoldT();

  push();
  
  // 发光/光晕 (长按时)
  if (dragging || holdT > 0) {
    const glowT = constrain(holdT, 0, 1);
    
    // ✅ 视觉修正：
    // 虽然物理范围 BOOST.maxRadiusMul 是 4，但这里我们只画大约 2 倍大小的光晕
    // 使得视觉上满足“缩小一半”的要求，而物理手感保持强劲
    const visualStart = 1.3;  // 原来是 2.6
    const visualMax = 2.0;    // 原来是 4.0
    const dragStatic = 1.2;   // 原来是 2.4

    const glowMul = dragging && glowT === 0 ? dragStatic : lerp(visualStart, visualMax, glowT);
    
    // 发光颜色
    if (mode === "AIR") {
      fill(0); // 黑光 (右侧)
    } else {
      fill(255, 220, 0); // 黄光 (左侧)
    }
    
    noStroke();
    circle(p.x, p.y, r * 2 * glowMul);
  }

  // 球体本体
  noStroke();

  if (mode === "AIR") {
    // 右边：黑色
    fill(0);
  } else {
    // 左边：黄色 (255, 220, 0)
    fill(255, 220, 0);
  }

  circle(p.x, p.y, r * 2);
  pop();
}

// ----------------------------------------------------
// ⚠️ 注意：原来的 drawYellowBall, drawDot, drawMagneticField 函数已被上面的
// drawSceneContent 和 drawYellowBallStyled 取代或合并，
// 请移除或注释掉原来的这些独立函数，防止冲突。
// ----------------------------------------------------

// =====================================================
// Mouse events (long press for magnet boost)
// =====================================================
function mousePressed() {
  isPressing = true;
  pressStartMs = millis();
}
function mouseReleased() {
  isPressing = false;
}

// =====================================================
// Keyboard events (space kick + A/D air control)
// =====================================================
function keyPressed() {
  if (key === "a" || key === "A") moveLeft = true;
  if (key === "d" || key === "D") moveRight = true;

  if (key === " ") {
    spacePressing = true;
    spaceStartMs = millis();
    return false; // prevent page scroll
  }
}

function keyReleased() {
  if (key === "a" || key === "A") moveLeft = false;
  if (key === "d" || key === "D") moveRight = false;

  if (key === " ") {
    spacePressing = false;
    doSpaceKick(); // works mid-air
    return false; // prevent page scroll
  }
}

// =====================================================
// Helpers: hold strength (mouse)
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

function isYellowBallDragged() {
  if (!mouseConstraint || !yellowBall) return false;
  if (mouseConstraint.body && mouseConstraint.body === yellowBall.body) return true;
  const c = mouseConstraint.constraint;
  if (!c) return false;
  if (c.body === yellowBall.body) return true;
  if (c.bodyA === yellowBall.body || c.bodyB === yellowBall.body) return true;
  return false;
}

// =====================================================
// Helpers: space hold strength
// =====================================================
function getSpaceHoldT() {
  const held = millis() - spaceStartMs - SPACE_KICK.holdDelayMs;
  const t = held > 0 ? constrain(held / SPACE_KICK.rampMs, 0, 1) : 0;
  // ease-out
  return 1 - (1 - t) * (1 - t);
}

function doSpaceKick() {
  if (!yellowBall) return;
  if (isYellowBallDragged()) return;

  const b = yellowBall.body;

  // charge -> impulse
  const holdT = getSpaceHoldT();
  const impulse = lerp(SPACE_KICK.minImpulse, SPACE_KICK.maxImpulse, holdT) + SPACE_KICK.minUpBias;

  // direction from A/D at release moment
  let dir = 0;
  if (moveLeft) dir -= 1;
  if (moveRight) dir += 1;

  // give a clean "kick" feel: reduce downward velocity a bit before applying
  // (prevents "space feels dead" when falling fast)
  const vy = b.velocity.y;
  if (vy > 0) {
    Matter.Body.setVelocity(b, { x: b.velocity.x, y: vy * 0.55 });
  }

  // apply impulse-like force
  const fx = impulse * b.mass * dir * 0.90;
  const fy = -impulse * b.mass;

  Matter.Body.applyForce(b, b.position, { x: fx, y: fy });
}

// =====================================================
// Visuals: magnetic field + yellow ball
// =====================================================
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

  // glow only when dragging or long press (mouse)
  if (dragging || holdT > 0) {
    const glowT = constrain(holdT, 0, 1);
    const alpha = dragging && glowT === 0 ? 180 : lerp(120, 255, glowT);
    const glowMul = dragging && glowT === 0 ? 2.4 : lerp(2.6, BOOST.maxRadiusMul, glowT);
    fill(255, 220, 0, alpha);
    circle(p.x, p.y, yellowBall.r * 2 * glowMul);
  }

  // ✅ 恢复为普通的黄色小球，不再进行裁剪变色
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
// Activation: near any time pixel
// =====================================================
function isActiveNearTime(cx, cy, triggerR) {
  for (const d of timeDots) {
    if (dist(cx, cy, d.baseX, d.baseY) <= triggerR) return true;
  }
  return false;
}

// =====================================================
// Magnet → rotation control (PD)
// =====================================================
function applyMagnetRotationControl() {
  if (!yellowBall) return;

  const holdT = getHoldT();
  const cx = yellowBall.body.position.x;
  const cy = yellowBall.body.position.y;

  const triggerR = influenceRadius * magnetTriggerMul;
  const active = isActiveNearTime(cx, cy, triggerR);

  const r = influenceRadius * lerp(1, BOOST.maxRadiusMul, holdT);
  const closeR = r * (ROT.closeRatio * lerp(1, BOOST.maxCloseMul, holdT));

  const kActive = ROT.k * lerp(1, BOOST.maxKMul, holdT);
  const kIdle = ROT.k * 0.35;
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
        const eased = 1 - t * t;
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
  
  // ✅ 修复：使用“最短角距离”计算翻转，防止角度超过 PI 或转圈后视觉卡死
  // 原代码：const a = constrain(d.rotBody.angle, 0, Math.PI);
  
  const angle = d.rotBody.angle;
  
  // 计算当前角度距离 0 度（关闭状态）的最短绝对距离
  // shortestAngleDiff 会自动处理 360度(2PI) = 0度 的情况
  const distFromZero = Math.abs(shortestAngleDiff(angle, 0));
  
  // 结果范围是 0 到 PI -> 映射为 0..1
  d.flip = distFromZero / Math.PI;

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
  timeMask = Array(cols).fill().map(() => Array(rows).fill(false));

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

  const lineGap = BASE_LINE_GAP * s;0
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

function charToMatrix(rowsArr) {
  return rowsArr.map((r) => r.split("").map((c) => (c === "1" ? 1 : 0)));
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
// Yellow ball force: REAL device gravity (mobile) + A/D air control
// =====================================================
function updateYellowBallGravity() {
  if (!yellowBall) return;
  const b = yellowBall.body;

  // if dragged, do not apply forces
  if (isYellowBallDragged()) return;

  // --- device gravity or fallback ---
  if (deviceGravityEnabled) {
    const fx = DEVICE_G * b.mass * deviceGX;
    const fy = DEVICE_G * b.mass * deviceGY;
    Matter.Body.applyForce(b, b.position, { x: fx, y: fy });
  } else {
    const gForce = YELLOW_GRAVITY * b.mass;
    Matter.Body.applyForce(b, b.position, { x: 0, y: gForce });
  }

  // --- NEW: A/D air control (works mid-air) ---
  let dir = 0;
  if (moveLeft) dir -= 1;
  if (moveRight) dir += 1;

  if (dir !== 0) {
    const fx = AIR_CTRL.force * b.mass * dir;
    Matter.Body.applyForce(b, b.position, { x: fx, y: 0 });
  }

  // clamp + damping (horizontal)
  const vx = constrain(b.velocity.x, -AIR_CTRL.maxVX, AIR_CTRL.maxVX);
  Matter.Body.setVelocity(b, { x: vx * AIR_CTRL.damping, y: b.velocity.y });

  // slight overall damping to reduce jitter (keep your original feel)
  Matter.Body.setVelocity(b, {
    x: b.velocity.x * 0.99,
    y: b.velocity.y * 0.98
  });
}

// =====================================================
// Device gravity: permission + orientation mapping
// =====================================================
function setupDeviceGravityUI() {
  needsPermissionIOS =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  deviceGravityStatus = needsPermissionIOS ? "iOS: tap to request permission" : "listening...";

  const enable = async () => {
    try {
      if (needsPermissionIOS) {
        let grantedAny = false;
        if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
          const resOri = await DeviceOrientationEvent.requestPermission();
          grantedAny = grantedAny || (resOri === "granted");
        }
        if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
          const resMot = await DeviceMotionEvent.requestPermission();
          grantedAny = grantedAny || (resMot === "granted");
        }
        if (!grantedAny) {
          deviceGravityStatus = "permission denied";
          deviceGravityEnabled = false;
          return;
        }
      }

      attachDeviceOrientation();
      attachDeviceMotion();

      deviceGravityEnabled = true;
      deviceGravityStatus = "enabled ✅";
    } catch (e) {
      deviceGravityStatus = "enable failed: " + (e?.message || e);
      deviceGravityEnabled = false;
    }
  };

  // iOS requires user gesture
  window.addEventListener("pointerdown", enable, { passive: true });
  window.addEventListener("touchstart", enable, { passive: true });

  // non-iOS: enable immediately
  if (!needsPermissionIOS) {
    attachDeviceOrientation();
    attachDeviceMotion();
    deviceGravityEnabled = true;
    deviceGravityStatus = "enabled ✅ (no prompt)";
  }
}

function attachDeviceOrientation() {
  if (orientationListenerAttached) return;
  orientationListenerAttached = true;
  window.addEventListener(
    "deviceorientation",
    (e) => {
      deviceGravityStatus = "receiving events ✅";
      lastOrientationEventMs = millis();

      const beta = e.beta ?? 0;   // front/back tilt
      const gamma = e.gamma ?? 0; // left/right tilt

      let gx = constrain(gamma / 45, -1, 1);
      let gy = constrain(beta / 45, -1, 1);

      const ang =
        (screen.orientation && typeof screen.orientation.angle === "number")
          ? screen.orientation.angle
          : (typeof window.orientation === "number" ? window.orientation : 0);

      let rx = gx, ry = gy;
      if (ang === 90) { rx = gy; ry = -gx; }
      if (ang === -90 || ang === 270) { rx = -gy; ry = gx; }
      if (ang === 180) { rx = -gx; ry = -gy; }

      deviceGX = lerp(deviceGX, rx, GRAVITY_FILTER);
      deviceGY = lerp(deviceGY, ry, GRAVITY_FILTER);
    },
    true
  );
}

function attachDeviceMotion() {
  if (motionListenerAttached) return;
  motionListenerAttached = true;
  window.addEventListener(
    "devicemotion",
    (e) => {
      const a = e.accelerationIncludingGravity;
      if (!a) return;
      if (lastOrientationEventMs && (millis() - lastOrientationEventMs) <= ORIENTATION_STALE_MS) return;

      const ax = Number.isFinite(a.x) ? a.x : 0;
      const ay = Number.isFinite(a.y) ? a.y : 0;

      let gx = constrain(ax / 9.8, -1, 1);
      let gy = constrain(ay / 9.8, -1, 1);

      const ang =
        (screen.orientation && typeof screen.orientation.angle === "number")
          ? screen.orientation.angle
          : (typeof window.orientation === "number" ? window.orientation : 0);

      let rx = gx, ry = gy;
      if (ang === 90) { rx = gy; ry = -gx; }
      if (ang === -90 || ang === 270) { rx = -gy; ry = gx; }
      if (ang === 180) { rx = -gx; ry = -gy; }

      deviceGX = lerp(deviceGX, rx, GRAVITY_FILTER);
      deviceGY = lerp(deviceGY, ry, GRAVITY_FILTER);
    },
    true
  );
}

// =====================================================
// Debug overlay (always visible)
// =====================================================
function drawDeviceDebugOverlay() {
  // 左上角文字已移除 — 保持空实现以隐藏调试文本
}
