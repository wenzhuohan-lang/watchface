// try to load matter-wrap plugin; if incompatible, skip without breaking the sketch
try {
  Matter.use('matter-wrap');
} catch (err) {
  console.warn('matter-wrap plugin skipped (incompatible with this matter-js version):', err);
}

// eigene dist-Funktion in dieser Datei umbennen: localDist
function localDist(x1, y1, x2, y2) {
  if (arguments.length === 2) return Math.hypot(x1, y1);
  return Math.hypot(x2 - x1, y2 - y1);
}

let handMin;
let handHour;
let mouse;
let center;
let radius;
const CIRCLE_DIAM = 36;

let CENTER_CIRCLE_DIAM;
let centerBall;
let zielkreis;
let ZIELKREIS_DIAM;

let HAND_MIN_LEN;
let HAND_MIN_W;
let HAND_HOUR_LEN;
let HAND_HOUR_W;
let EXTENSION_W;
let EXTENSION_LEN;

let prevMinute;
let prevSecond;

let engine;
let world;
let fallingCircles = [];

let lastSpawnMillis = 0;
window.stepcounter = window.stepcounter || 500;

// LIMIT stays at 10000 (as requested)
const STEP_MIN = 0;
const STEP_MAX = 10000;

// thousand event (kept)
window.prevStepThousands = Math.floor(window.stepcounter / 1000);
let thousandEventActive = false;
let thousandEventStart = 0;
const THOUSAND_EVENT_DURATION = 15000;

let thousandEventFadeActive = false;
let thousandEventFadeStart = 0;
const THOUSAND_EVENT_FADE_MS = 3000;

let fallingRepelActive = false;
let fallingRepelStart = 0;
const FALLING_REPEL_DURATION = 2000;
const FALLING_REPEL_IMPULSE = 0.0004;
const FALLING_REPEL_CONTINUOUS = 0.00006;

// logging flags
let HANDS_LOG = false;
let lastHandsLogAt = 0;
const HANDS_LOG_INTERVAL = 500;

// --- invisible physical shields (per element) ---
let handMinMainShield, handMinExtShield;
let handHourMainShield, handHourExtShield;
let centerShield;

const CIRCLE_VISIBLE_MS = 10000;
const CIRCLE_DISSOLVE_MS = 10000;
const CIRCLE_LIFE_MS = CIRCLE_VISIBLE_MS + CIRCLE_DISSOLVE_MS;

let secondsGapWidth;

// collision categories
const CAT_SECONDS = 0x0001;
const CAT_HANDS   = 0x0002;
const CAT_CENTER  = 0x0004;
const CAT_FALLING = 0x0008;
const CAT_LINE    = 0x0010;

// === SEKUNDEN-LINIE SYSTEM ===
let lineColor = { r: 255, g: 220, b: 0 }; // Gelb
let isGrowingCycle = true;
let lastRecordedMinute = -1;

// === Magnet: default = zieht an. Space gedrückt = invert (stößt ab) ===
let spaceHeld = false;

// === WASSER-PHYSIK ===
const WATER_DRAG = 0.5975;
const AIR_DRAG = 0.995;

// base drift (clockwise)
const WATER_DRIFT_FORCE = 0.00018;     // leicht erhöht (mehr Wassergefühl)
window.WATER_DRIFT_MULT = window.WATER_DRIFT_MULT || 1;

// extra water "feeling"
const WATER_TURB_FORCE   = 0.00012;    // Turbulenz
const WATER_RADIAL_WAVE  = 0.00008;    // leichte radiale Welle
const WATER_TURB_SPEED   = 0.0011;     // Noise speed

// === Outline/Physik match ===
// Wichtig: Physik-Body bleibt immer = visualR.
// Umrandung hat damit "Physik", weil wir den weißen Fill kleiner zeichnen,
// sodass die Außenkante inkl. Stroke exakt = Body-Durchmesser ist.
const OUTLINE_W = 2;

// === NO-OVERLAP HARD SOLVER ===
const SEPARATION_PASSES = 4;   // höher = härter, aber teurer
const SEPARATION_SLOP = 0.25;  // minimaler Abstand, damit wirklich "nicht überlappt"
const SEPARATION_MAX_PUSH = 12; // px pro pass (safety)

// === BALL MATERIAL SETTINGS (stable) ===
const BALL_MAT = {
  friction: 0.04,
  frictionStatic: 0,
  restitution: 0.06,
  frictionAir: 0.06,
  slop: 0.008,
  density: 0.001
};

// === GLOBAL ANGLES (single source of truth) ===
let gAngleMin = 0;
let gAngleHour = 0;

// === Stepcounter key "S" (hold) ===
let sHeld = false;
let stepInterval = null;

function clampStepcounter() {
  window.stepcounter = Math.max(STEP_MIN, Math.min(STEP_MAX, window.stepcounter || 0));
}

function startStepBoost() {
  if (stepInterval) return;
  stepInterval = setInterval(() => {
    if (!sHeld) return;
    window.stepcounter = (window.stepcounter || 0) + 500;
    clampStepcounter();
  }, 1000);
}

function stopStepBoost() {
  if (stepInterval) {
    clearInterval(stepInterval);
    stepInterval = null;
  }
}

// p5 key handlers
function keyPressed() {
  // SPACE: invert magnet only while held
  if (keyCode === 32) {
    spaceHeld = true;
  }

  // S hold: +500 per second, cap 10000
  if (key === 's' || key === 'S') {
    sHeld = true;
    startStepBoost();
  }
}

function keyReleased() {
  if (keyCode === 32) {
    spaceHeld = false;
  }
  if (key === 's' || key === 'S') {
    sHeld = false;
    if (!sHeld) stopStepBoost();
  }
}

function setup() {
  const canvas = createCanvas(960, 960);
  center = { x: width / 2, y: height / 2 };

  // === CANVAS TOUCH/CLICK = SPACE (Magnet invertieren) ===
  canvas.mousePressed(() => {
    spaceHeld = true;
  });
  canvas.mouseReleased(() => {
    spaceHeld = false;
  });
  canvas.touchStarted(() => {
    spaceHeld = true;
    return false; // prevent default
  });
  canvas.touchEnded(() => {
    spaceHeld = false;
    return false;
  });

  // === MOBILE STEP BUTTON ===
  createMobileStepButton();

  const obstacleR = CIRCLE_DIAM / 2;
  radius = floor(min(width, height) / 2) - 40 - obstacleR - 20;
  const centerDist = 2 * radius * sin(PI / 60);
  secondsGapWidth = max(0, centerDist - 2 * obstacleR);

  // ---- sizes ----
  CENTER_CIRCLE_DIAM = 40;
  HAND_HOUR_W = 55;
  HAND_MIN_W = 45;
  HAND_HOUR_LEN = 240;
  HAND_MIN_LEN = 300;
  EXTENSION_W = 10;
  EXTENSION_LEN = 50;
  // -------------

  engine = Matter.Engine.create();
  world = engine.world;

  // stability
  engine.positionIterations = 14;
  engine.velocityIterations = 12;
  engine.constraintIterations = 4;
  engine.enableSleeping = false;

  engine.world.gravity.y = 0;
  engine.world.gravity.x = 0;

  handMin = null;
  handHour = null;

  centerBall = new Ball(
    world,
    { x: center.x, y: center.y, r: CENTER_CIRCLE_DIAM / 2, color: 'white' },
    { isStatic: true, collisionFilter: { category: CAT_CENTER, mask: CAT_FALLING | CAT_HANDS } }
  );

  zielkreis = centerBall;
  ZIELKREIS_DIAM = CENTER_CIRCLE_DIAM;

  // --- hand shields (5px)
  const shieldDepth = 5;
  const pad = shieldDepth * 2;
  const centerRadius = CENTER_CIRCLE_DIAM / 2;

  const minMainLen = max(0, HAND_MIN_LEN - (centerRadius + EXTENSION_LEN));
  const hourMainLen = max(0, HAND_HOUR_LEN - (centerRadius + EXTENSION_LEN));

  // minute capsule
  if (minMainLen > 0) {
    const optHands = { friction: 0, restitution: 0.05, collisionFilter: { category: CAT_HANDS, mask: CAT_FALLING } };
    const minStartX = centerRadius + EXTENSION_LEN;
    const minEndX = centerRadius + EXTENSION_LEN + minMainLen;
    const minCenterX = centerRadius + EXTENSION_LEN + (minMainLen / 2);

    const minRect = Matter.Bodies.rectangle(center.x + minCenterX, center.y, minMainLen, HAND_MIN_W + pad, optHands);
    const minCapR = (HAND_MIN_W / 2) + shieldDepth;
    const minCap1 = Matter.Bodies.circle(center.x + minStartX, center.y, minCapR, optHands);
    const minCap2 = Matter.Bodies.circle(center.x + minEndX, center.y, minCapR, optHands);

    handMinMainShield = Matter.Body.create({ parts: [minRect, minCap1, minCap2] });
    Matter.Body.setStatic(handMinMainShield, true);
  } else {
    handMinMainShield = Matter.Bodies.circle(
      center.x + (centerRadius + EXTENSION_LEN),
      center.y,
      (HAND_MIN_W / 2) + shieldDepth,
      { isStatic: true, friction: 0, restitution: 0.05, collisionFilter: { category: CAT_HANDS, mask: CAT_FALLING } }
    );
  }

  handMinExtShield = Matter.Bodies.rectangle(
    center.x + (centerRadius + EXTENSION_LEN / 2),
    center.y,
    EXTENSION_LEN + pad,
    EXTENSION_W + pad,
    { isStatic: true, friction: 0, restitution: 0.05, collisionFilter: { category: CAT_HANDS, mask: CAT_FALLING } }
  );

  // hour capsule
  if (hourMainLen > 0) {
    const optHands = { friction: 0, restitution: 0.05, collisionFilter: { category: CAT_HANDS, mask: CAT_FALLING } };
    const hourStartX = centerRadius + EXTENSION_LEN;
    const hourEndX = centerRadius + EXTENSION_LEN + hourMainLen;
    const hourCenterX = centerRadius + EXTENSION_LEN + (hourMainLen / 2);

    const hourRect = Matter.Bodies.rectangle(center.x + hourCenterX, center.y, hourMainLen, HAND_HOUR_W + pad, optHands);
    const hourCapR = (HAND_HOUR_W / 2) + shieldDepth;
    const hourCap1 = Matter.Bodies.circle(center.x + hourStartX, center.y, hourCapR, optHands);
    const hourCap2 = Matter.Bodies.circle(center.x + hourEndX, center.y, hourCapR, optHands);

    handHourMainShield = Matter.Body.create({ parts: [hourRect, hourCap1, hourCap2] });
    Matter.Body.setStatic(handHourMainShield, true);
  } else {
    handHourMainShield = Matter.Bodies.circle(
      center.x + (centerRadius + EXTENSION_LEN),
      center.y,
      (HAND_HOUR_W / 2) + shieldDepth,
      { isStatic: true, friction: 0, restitution: 0.05, collisionFilter: { category: CAT_HANDS, mask: CAT_FALLING } }
    );
  }

  handHourExtShield = Matter.Bodies.rectangle(
    center.x + (centerRadius + EXTENSION_LEN / 2),
    center.y,
    EXTENSION_LEN + pad,
    EXTENSION_W + pad,
    { isStatic: true, friction: 0, restitution: 0.05, collisionFilter: { category: CAT_HANDS, mask: CAT_FALLING } }
  );

  // center shield
  centerShield = Matter.Bodies.circle(
    center.x,
    center.y,
    centerRadius + shieldDepth,
    { isStatic: true, friction: 0, restitution: 0.05, collisionFilter: { category: CAT_CENTER, mask: CAT_FALLING } }
  );

  Matter.World.add(world, [handMinMainShield, handMinExtShield, handHourMainShield, handHourExtShield, centerShield]);

  function _applyHandCollisionOptions(body, category, mask) {
    if (!body) return;
    const parts = body.parts || [body];
    for (let p of parts) {
      if (!p) continue;
      p.friction = 0;
      p.frictionStatic = 0;
      p.restitution = 0.05;
      p.isSensor = false;
      if (!p.collisionFilter) p.collisionFilter = {};
      p.collisionFilter.category = category;
      p.collisionFilter.mask = mask;
    }
    if (!body.collisionFilter) body.collisionFilter = {};
    body.collisionFilter.category = category;
    body.collisionFilter.mask = mask;
  }

  _applyHandCollisionOptions(handMinMainShield, CAT_HANDS, CAT_FALLING);
  _applyHandCollisionOptions(handMinExtShield,  CAT_HANDS, CAT_FALLING);
  _applyHandCollisionOptions(handHourMainShield, CAT_HANDS, CAT_FALLING);
  _applyHandCollisionOptions(handHourExtShield,  CAT_HANDS, CAT_FALLING);
  _applyHandCollisionOptions(centerShield,      CAT_CENTER, CAT_FALLING);

  // Compatibility: some old helper code expects `.body` + `.createdAt`
  if (handMinMainShield) { handMinMainShield.body = handMinMainShield; handMinMainShield.createdAt = millis(); }
  if (handMinExtShield)  { handMinExtShield.body  = handMinExtShield;  handMinExtShield.createdAt  = millis(); }
  if (handHourMainShield){ handHourMainShield.body= handHourMainShield;handHourMainShield.createdAt= millis(); }
  if (handHourExtShield) { handHourExtShield.body = handHourExtShield; handHourExtShield.createdAt = millis(); }
  if (centerShield)      { centerShield.body      = centerShield;      centerShield.createdAt      = millis(); }

  mouse = new Mouse(engine, canvas, { stroke: 'magenta', strokeWeight: 2 });

  // Fixed runner (120Hz)
  const runner = Matter.Runner.create({
    isFixed: true,
    delta: 1000 / 120
  });
  Matter.Runner.run(runner, engine);

  // sync hands/shields each physics step
  Matter.Events.on(engine, 'beforeUpdate', function() {
    const nowMs = millis();
    const msFrac = (nowMs % 1000) / 1000.0;
    const fracSeconds = second() + msFrac;
    const fracMinutes = minute() + (fracSeconds / 60.0);
    const fracHours = (hour() % 12) + (fracMinutes / 60.0);

    const aMin = map(fracMinutes, 0, 60, 0, TWO_PI) - HALF_PI;
    const aHour = map(fracHours, 0, 12, 0, TWO_PI) - HALF_PI;

    gAngleMin = aMin;
    gAngleHour = aHour;

    const cR = CENTER_CIRCLE_DIAM / 2;

    // minute main
    if (handMinMainShield) {
      const minMain = max(0, HAND_MIN_LEN - (cR + EXTENSION_LEN));
      const localX = (cR + EXTENSION_LEN + minMain / 2);
      const sx = center.x + localX * Math.cos(aMin);
      const sy = center.y + localX * Math.sin(aMin);
      Matter.Body.setPosition(handMinMainShield, { x: sx, y: sy });
      Matter.Body.setAngle(handMinMainShield, aMin);
    }

    // minute ext
    if (handMinExtShield) {
      const localX = (cR + EXTENSION_LEN / 2);
      const sx = center.x + localX * Math.cos(aMin);
      const sy = center.y + localX * Math.sin(aMin);
      Matter.Body.setPosition(handMinExtShield, { x: sx, y: sy });
      Matter.Body.setAngle(handMinExtShield, aMin);
    }

    // hour main
    if (handHourMainShield) {
      const hourMain = max(0, HAND_HOUR_LEN - (cR + EXTENSION_LEN));
      const localX = (cR + EXTENSION_LEN + hourMain / 2);
      const sx = center.x + localX * Math.cos(aHour);
      const sy = center.y + localX * Math.sin(aHour);
      Matter.Body.setPosition(handHourMainShield, { x: sx, y: sy });
      Matter.Body.setAngle(handHourMainShield, aHour);
    }

    // hour ext
    if (handHourExtShield) {
      const localX = (cR + EXTENSION_LEN / 2);
      const sx = center.x + localX * Math.cos(aHour);
      const sy = center.y + localX * Math.sin(aHour);
      Matter.Body.setPosition(handHourExtShield, { x: sx, y: sy });
      Matter.Body.setAngle(handHourExtShield, aHour);
    }

    // center
    if (centerShield) {
      Matter.Body.setPosition(centerShield, { x: center.x, y: center.y });
      Matter.Body.setAngle(centerShield, 0);
    }
  });

  prevMinute = minute();
  prevSecond = second();
  lastRecordedMinute = minute();
  isGrowingCycle = (minute() % 2 === 0);

  clampStepcounter();
}

function draw() {
  background('black');

  const curSecond = second();
  const curMinute = minute();
  const curHour = hour();
  const now = millis();
  const currentMs = new Date().getMilliseconds();

  clampStepcounter();

  // cycle flip
  if (curMinute !== lastRecordedMinute) {
    isGrowingCycle = !isGrowingCycle;
    lastRecordedMinute = curMinute;
  }

  // spawning
  const stepVal = typeof window.stepcounter === 'number' ? window.stepcounter : 0;
  const spawnsPerSecond = Math.floor(stepVal / 400);

  const currThousands = Math.floor(stepVal / 1000);
  if (currThousands > (window.prevStepThousands || 0)) {
    thousandEventActive = true;
    thousandEventStart = now;
    thousandEventFadeActive = false;
    thousandEventFadeStart = 0;
    fallingRepelActive = true;
    fallingRepelStart = now;

    for (let c of fallingCircles) {
      if (!c || !c.ball || !c.ball.body) continue;
      const p = c.ball.body.position;
      const dx = p.x - center.x;
      const dy = p.y - center.y;
      const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
      Matter.Body.applyForce(c.ball.body, p, {
        x: (dx / dist) * FALLING_REPEL_IMPULSE,
        y: (dy / dist) * FALLING_REPEL_IMPULSE
      });
    }
  }
  window.prevStepThousands = currThousands;

  if (thousandEventActive && now - thousandEventStart >= THOUSAND_EVENT_DURATION) {
    thousandEventActive = false;
    thousandEventFadeActive = true;
    thousandEventFadeStart = now;
    fallingRepelActive = false;
  }

  if (spawnsPerSecond > 0) {
    const intervalMs = 1000 / spawnsPerSecond;
    if (now - lastSpawnMillis >= intervalMs) {
      const toSpawn = Math.floor((now - lastSpawnMillis) / intervalMs);
      for (let i = 0; i < toSpawn; i++) spawnFallingCircle();
      lastSpawnMillis += toSpawn * intervalMs;
      if (now - lastSpawnMillis >= intervalMs) lastSpawnMillis = now;
    }
  } else {
    lastSpawnMillis = now;
  }

  // seconds arc
  drawSecondsLine(curSecond, currentMs);

  // angles
  const angleMin = gAngleMin;
  const angleHour = gAngleHour;

  // draw hands (visual only)
  {
    push();
    translate(center.x, center.y);
    rotate(angleMin);
    noStroke();
    fill(255, 220, 0);

    const centerRadius = CENTER_CIRCLE_DIAM / 2;
    const minMainLen = HAND_MIN_LEN - (centerRadius + EXTENSION_LEN);

    if (minMainLen > 0) {
      const xStart = centerRadius + EXTENSION_LEN;
      const xEnd = xStart + minMainLen;
      const xCenter = (xStart + xEnd) / 2;
      rectMode(CENTER);
      rect(xCenter, 0, minMainLen, HAND_MIN_W);
      ellipse(xStart, 0, HAND_MIN_W, HAND_MIN_W);
      ellipse(xEnd, 0, HAND_MIN_W, HAND_MIN_W);
    }

    const xExtCenter = centerRadius + EXTENSION_LEN / 2;
    rectMode(CENTER);
    rect(xExtCenter, 0, EXTENSION_LEN, EXTENSION_W, 0);

    pop();
  }

  {
    push();
    translate(center.x, center.y);
    rotate(angleHour);
    noStroke();
    fill(255, 220, 0);

    const centerRadius = CENTER_CIRCLE_DIAM / 2;
    const hourMainLen = HAND_HOUR_LEN - (centerRadius + EXTENSION_LEN);

    if (hourMainLen > 0) {
      const xStart = centerRadius + EXTENSION_LEN;
      const xEnd = xStart + hourMainLen;
      const xCenter = (xStart + xEnd) / 2;
      rectMode(CENTER);
      rect(xCenter, 0, hourMainLen, HAND_HOUR_W);
      ellipse(xStart, 0, HAND_HOUR_W, HAND_HOUR_W);
      ellipse(xEnd, 0, HAND_HOUR_W, HAND_HOUR_W);
    }

    const xExtCenter = centerRadius + EXTENSION_LEN / 2;
    rectMode(CENTER);
    rect(xExtCenter, 0, EXTENSION_LEN, EXTENSION_W, 0);

    pop();
  }

  // center
  if (centerBall) centerBall.draw();
  noStroke();
  fill(255, 220, 0);
  ellipse(center.x, center.y, ZIELKREIS_DIAM, ZIELKREIS_DIAM);

  processFallingCircles();
  mouse.draw();
}

// === SEKUNDEN-LINIE ZEICHNEN ===
function drawSecondsLine(curSecond, currentMs) {
  const lineRadius = radius + 150;
  const lineWeight = 300;

  const currentPosition = curSecond + (currentMs / 1000);

  let startSec, endSec;
  if (isGrowingCycle) {
    startSec = 0;
    endSec = currentPosition;
  } else {
    startSec = currentPosition;
    endSec = 60;
  }

  if (endSec > startSec) {
    stroke(lineColor.r, lineColor.g, lineColor.b);
    strokeWeight(lineWeight);
    strokeCap(ROUND);
    noFill();

    const startAngle = map(startSec, 0, 60, 0, TWO_PI) - HALF_PI;
    const endAngle = map(endSec, 0, 60, 0, TWO_PI) - HALF_PI;
    arc(center.x, center.y, lineRadius * 2, lineRadius * 2, startAngle, endAngle);
  }
}

// === FALLENDE KREISE ===
function spawnFallingCircle() {
  let x, y;
  const side = floor(random(4));

  if (side === 0) {
    x = random(30, width - 30);
    y = random(-60, -10);
  } else if (side === 1) {
    x = random(width + 10, width + 60);
    y = random(30, height - 30);
  } else if (side === 2) {
    x = random(30, width - 30);
    y = random(height + 10, height + 60);
  } else {
    x = random(-60, -10);
    y = random(30, height - 30);
  }

  const minExtra = 2;
  let physR = max(1, (secondsGapWidth / 2) + minExtra);
  physR = min(physR, 45);

  // IMPORTANT: include CAT_FALLING in mask so circles collide with each other
  const mask = CAT_FALLING | CAT_HANDS | CAT_CENTER;

  const ballObj = new Ball(world, { x: x, y: y, r: physR, color: '#D9D9D9' }, {
    ...BALL_MAT,
    collisionFilter: { category: CAT_FALLING, mask: mask }
  });

  if (ballObj && ballObj.body) ballObj.body.isSensor = false;

  fallingCircles.push({
    ball: ballObj,
    createdAt: millis(),
    life: CIRCLE_LIFE_MS,
    baseR: physR,
    stopped: false,
    lastMovedAt: millis()
  });
}

// === MAGNET-FUNKTION ===
function applyMagnetToCircles() {
  if (!zielkreis || !zielkreis.body) return;
  const target = zielkreis.body.position;

  const angleMin = gAngleMin;
  const angleHour = gAngleHour;

  const minTip = { x: center.x + Math.cos(angleMin) * HAND_MIN_LEN, y: center.y + Math.sin(angleMin) * HAND_MIN_LEN };
  const hourTip = { x: center.x + Math.cos(angleHour) * HAND_HOUR_LEN, y: center.y + Math.sin(angleHour) * HAND_HOUR_LEN };

  const TIP_CLEAR_FORCE = 0.00055;
  const TIP_CLEAR_R_MIN = (HAND_MIN_W / 2) + 18;
  const TIP_CLEAR_R_HOUR = (HAND_HOUR_W / 2) + 18;

  // Magnet kräftiger, damit er auch aus dem Wasser zieht (verzögert durch Drag)
  const baseStrength = 0.00028;

  // SPACE held => invert magnet (momentary)
  const repelNow = spaceHeld; // default attract; while space => repel
  const sign = repelNow ? -1 : 1;

  for (let c of fallingCircles) {
    if (!c || !c.ball || !c.ball.body) continue;

    const body = c.ball.body;
    const pos = body.position;

    const dx = target.x - pos.x;
    const dy = target.y - pos.y;
    const dist = Math.max(0.1, Math.sqrt(dx * dx + dy * dy));

    const isInWater = isPositionInWater(pos);

    // im Wasser etwas schwächer, aber immer noch stark genug
    const strength = isInWater ? baseStrength * 0.65 : baseStrength;

    Matter.Body.applyForce(body, pos, {
      x: sign * (dx / dist) * strength,
      y: sign * (dy / dist) * strength
    });

    // keep tips clean
    // minute tip
    {
      const tx = pos.x - minTip.x;
      const ty = pos.y - minTip.y;
      const tdist = Math.sqrt(tx * tx + ty * ty);
      if (tdist > 0.1 && tdist < TIP_CLEAR_R_MIN) {
        const falloff = 1 - (tdist / TIP_CLEAR_R_MIN);
        const nx = tx / tdist;
        const ny = ty / tdist;
        Matter.Body.applyForce(body, pos, { x: nx * TIP_CLEAR_FORCE * falloff, y: ny * TIP_CLEAR_FORCE * falloff });
        Matter.Body.applyForce(body, pos, { x: (-ny) * TIP_CLEAR_FORCE * 0.25 * falloff, y: (nx) * TIP_CLEAR_FORCE * 0.25 * falloff });
      }
    }

    // hour tip
    {
      const tx = pos.x - hourTip.x;
      const ty = pos.y - hourTip.y;
      const tdist = Math.sqrt(tx * tx + ty * ty);
      if (tdist > 0.1 && tdist < TIP_CLEAR_R_HOUR) {
        const falloff = 1 - (tdist / TIP_CLEAR_R_HOUR);
        const nx = tx / tdist;
        const ny = ty / tdist;
        Matter.Body.applyForce(body, pos, { x: nx * TIP_CLEAR_FORCE * falloff, y: ny * TIP_CLEAR_FORCE * falloff });
        Matter.Body.applyForce(body, pos, { x: (-ny) * TIP_CLEAR_FORCE * 0.25 * falloff, y: (nx) * TIP_CLEAR_FORCE * 0.25 * falloff });
      }
    }
  }
}

// === HARD NO-OVERLAP SOLVER ===
function separateFallingCircles() {
  // gather bodies
  const bodies = [];
  for (let c of fallingCircles) {
    if (!c || !c.ball || !c.ball.body) continue;
    bodies.push(c.ball.body);
  }
  if (bodies.length < 2) return;

  for (let pass = 0; pass < SEPARATION_PASSES; pass++) {
    for (let i = 0; i < bodies.length; i++) {
      const a = bodies[i];
      if (!a || !a.position) continue;
      const ra = a.circleRadius || 0;

      for (let j = i + 1; j < bodies.length; j++) {
        const b = bodies[j];
        if (!b || !b.position) continue;
        const rb = b.circleRadius || 0;

        const dx = b.position.x - a.position.x;
        const dy = b.position.y - a.position.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.0001;

        const minDist = ra + rb + SEPARATION_SLOP;
        if (dist < minDist) {
          const nx = dx / dist;
          const ny = dy / dist;

          let push = (minDist - dist) * 0.5;
          push = Math.min(push, SEPARATION_MAX_PUSH);

          // move both apart
          Matter.Body.setPosition(a, { x: a.position.x - nx * push, y: a.position.y - ny * push });
          Matter.Body.setPosition(b, { x: b.position.x + nx * push, y: b.position.y + ny * push });

          // damp relative velocity along normal (prevents re-penetration)
          const vax = a.velocity.x, vay = a.velocity.y;
          const vbx = b.velocity.x, vby = b.velocity.y;
          const rvx = vbx - vax;
          const rvy = vby - vay;
          const relN = rvx * nx + rvy * ny;

          if (relN < 0) {
            const corr = relN * 0.5;
            Matter.Body.setVelocity(a, { x: vax + nx * corr, y: vay + ny * corr });
            Matter.Body.setVelocity(b, { x: vbx - nx * corr, y: vby - ny * corr });
          }
        }
      }
    }
  }
}

function processFallingCircles() {
  const now = millis();

  // forces
  applyMagnetToCircles();

  // update/draw
  for (let i = fallingCircles.length - 1; i >= 0; i--) {
    const c = fallingCircles[i];
    if (!c || !c.ball || !c.ball.body) {
      fallingCircles.splice(i, 1);
      continue;
    }

    const age = now - c.createdAt;
    if (age >= c.life) {
      Matter.World.remove(world, c.ball.body);
      fallingCircles.splice(i, 1);
      continue;
    }

    let visualR;
    if (age < CIRCLE_VISIBLE_MS) {
      visualR = c.baseR;
    } else {
      const dt = age - CIRCLE_VISIBLE_MS;
      const t = 1 - dt / CIRCLE_DISSOLVE_MS;
      visualR = c.baseR * max(0, t);

      if (visualR <= 1) {
        Matter.World.remove(world, c.ball.body);
        fallingCircles.splice(i, 1);
        continue;
      }
    }

    // rebuild body if radius changed enough (keep SAME physics params)
    if (c.ball.body.circleRadius && abs(c.ball.body.circleRadius - visualR) > 0.5 && visualR > 1) {
      const pos = c.ball.body.position;
      const vel = c.ball.body.velocity;
      const angle = c.ball.body.angle;

      Matter.World.remove(world, c.ball.body);

      c.ball.body = Matter.Bodies.circle(pos.x, pos.y, visualR, {
        ...BALL_MAT,
        collisionFilter: { category: CAT_FALLING, mask: (CAT_FALLING | CAT_HANDS | CAT_CENTER) }
      });
      c.ball.body.isSensor = false;

      Matter.Body.setVelocity(c.ball.body, vel);
      Matter.Body.setAngle(c.ball.body, angle);
      Matter.World.add(world, c.ball.body);
    }

    // ensure full mask (collide with other circles + hands + center)
    const fullMask = CAT_FALLING | CAT_HANDS | CAT_CENTER;
    const body = c.ball.body;
    if (body && body.collisionFilter.mask !== fullMask) body.collisionFilter.mask = fullMask;

    // sample water contact (any part)
    const _SAMPLES_PHYS = 18;
    let touchesWater = isPositionInWater(body.position);
    if (!touchesWater) {
      for (let s = 0; s < _SAMPLES_PHYS; s++) {
        const a = (s / _SAMPLES_PHYS) * TWO_PI;
        const sx = body.position.x + Math.cos(a) * visualR;
        const sy = body.position.y + Math.sin(a) * visualR;
        if (isPositionInWater({ x: sx, y: sy })) {
          touchesWater = true;
          break;
        }
      }
    }
    const isFullyOutOfWater = !touchesWater;

    applyWaterPhysics(body, touchesWater);

    // speed clamp
    const maxSpeed = touchesWater ? 1.05 : 3.0;
    clampBodyVelocity(body, maxSpeed);

    // extra air friction only if fully out
    if (isFullyOutOfWater) body.frictionAir = Math.max(body.frictionAir || 0, 0.03);

    // thousand repel
    if (thousandEventActive && fallingRepelActive) {
      const repelElapsed = now - fallingRepelStart;
      if (repelElapsed < FALLING_REPEL_DURATION) {
        const p = body.position;
        const dx = p.x - center.x;
        const dy = p.y - center.y;
        const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
        Matter.Body.applyForce(body, p, {
          x: (dx / dist) * FALLING_REPEL_CONTINUOUS,
          y: (dy / dist) * FALLING_REPEL_CONTINUOUS
        });
      } else {
        fallingRepelActive = false;
      }
    }

    // draw
    const pos = body.position;
    const dBall = visualR * 2;

    if (!isFullyOutOfWater) {
      // im Wasser: schwarz (ohne Outline)
      noStroke();
      fill(0);
      ellipse(pos.x, pos.y, dBall, dBall);
    } else {
      // draußen: weiß + Outline
      // Physik = visualR -> Außenkante MUSS = dBall bleiben
      stroke(0);
      strokeWeight(OUTLINE_W);
      fill(255);

      // draw smaller fill so outer edge incl. stroke = dBall
      const drawDiam = Math.max(0, dBall - OUTLINE_W);
      ellipse(pos.x, pos.y, drawDiam, drawDiam);
    }
  }

  // ABSOLUT no overlap (includes outline effect because outer edge matches body)
  separateFallingCircles();
}

// === PRÜFE OB POSITION IM WASSER (GRAU) IST ===
function isPositionInWater(pos) {
  const curSecond = second();
  const currentMs = new Date().getMilliseconds();
  const currentPosition = curSecond + (currentMs / 1000);

  const dx = pos.x - center.x;
  const dy = pos.y - center.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  const lineRadius = radius + 150;
  const lineWeight = 300;
  const innerRadius = lineRadius - lineWeight / 2;
  const outerRadius = lineRadius + lineWeight / 2;

  if (dist < innerRadius || dist > outerRadius) return false;

  let angle = Math.atan2(dy, dx) + HALF_PI;
  if (angle < 0) angle += TWO_PI;
  if (angle >= TWO_PI) angle -= TWO_PI;
  const positionInSeconds = (angle / TWO_PI) * 60;

  // round caps
  const capAngle = Math.asin(Math.min(1, (lineWeight / 2) / lineRadius));
  const capSeconds = (capAngle / TWO_PI) * 60;

  if (isGrowingCycle) {
    const end = currentPosition + capSeconds;
    return (positionInSeconds <= end) || (positionInSeconds >= 60 - capSeconds);
  } else {
    const start = currentPosition - capSeconds;
    return (positionInSeconds >= start) || (positionInSeconds <= capSeconds);
  }
}

// === WASSER-PHYSIK ANWENDEN ===
function applyWaterPhysics(body, isInWater) {
  const pos = body.position;
  const vel = body.velocity;

  if (isInWater) {
    // damp velocity
    Matter.Body.setVelocity(body, { x: vel.x * WATER_DRAG, y: vel.y * WATER_DRAG });

    // clockwise tangent
    const dx = pos.x - center.x;
    const dy = pos.y - center.y;
    const dist = Math.max(1, Math.sqrt(dx * dx + dy * dy));
    const tangentX = -dy / dist;
    const tangentY = dx / dist;

    // radial direction
    const radialX = dx / dist;
    const radialY = dy / dist;

    const mult = (window.WATER_DRIFT_MULT || 1);

    // base drift
    const drift = WATER_DRIFT_FORCE * mult;

    // turbulence (noise-based)
    const t = millis() * WATER_TURB_SPEED;
    const n = noise(pos.x * 0.004 + t, pos.y * 0.004 - t); // 0..1
    const turbSigned = (n - 0.5) * 2; // -1..1
    const turb = WATER_TURB_FORCE * turbSigned * mult;

    // radial wave (gentle in/out)
    const wave = Math.sin(t + dist * 0.012) * WATER_RADIAL_WAVE * mult;

    // apply combined forces
    Matter.Body.applyForce(body, pos, {
      x: tangentX * (drift + turb) + radialX * wave,
      y: tangentY * (drift + turb) + radialY * wave
    });

    // "water air friction"
    body.frictionAir = 0.09;

  } else {
    body.frictionAir = 0.05;
  }
}

// === GESCHWINDIGKEIT DES KÖRPERS BEGRENZEN ===
function clampBodyVelocity(body, maxSpeed) {
  const vel = body.velocity;
  const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y);
  if (speed > maxSpeed) {
    const a = Math.atan2(vel.y, vel.x);
    Matter.Body.setVelocity(body, { x: Math.cos(a) * maxSpeed, y: Math.sin(a) * maxSpeed });
  }
}

// === MOBILE STEP BUTTON ERSTELLEN ===
function createMobileStepButton() {
  // Button erstellen
  const btn = document.createElement('button');
  btn.id = 'mobile-step-btn';
  btn.textContent = 'STEPS +';
  btn.style.cssText = `
    position: fixed;
    bottom: 60px;
    right: 20px;
    width: 160px;
    height: 50px;
    border-radius: 10px;
    background: #FFD600;
    color: #000;
    font-size: 16px;
    font-weight: bold;
    font-family: Arial, sans-serif;
    border: none;
    cursor: pointer;
    z-index: 9999;
    touch-action: manipulation;
    user-select: none;
    -webkit-user-select: none;
  `;

  function startHold() {
    sHeld = true;
    startStepBoost();
    btn.style.background = '#E6C200';
    btn.style.transform = 'scale(0.98)';
  }

  function endHold() {
    sHeld = false;
    stopStepBoost();
    btn.style.background = '#FFD600';
    btn.style.transform = 'scale(1)';
  }

  // Touch Events
  btn.addEventListener('touchstart', (e) => {
    e.preventDefault();
    startHold();
  }, { passive: false });

  btn.addEventListener('touchend', (e) => {
    e.preventDefault();
    endHold();
  }, { passive: false });

  btn.addEventListener('touchcancel', (e) => {
    e.preventDefault();
    endHold();
  }, { passive: false });

  // Mouse Events (für Desktop-Test)
  btn.addEventListener('mousedown', (e) => {
    e.preventDefault();
    startHold();
  });

  btn.addEventListener('mouseup', (e) => {
    e.preventDefault();
    endHold();
  });

  btn.addEventListener('mouseleave', (e) => {
    if (sHeld) endHold();
  });

  document.body.appendChild(btn);

  // Stepcounter-Anzeige erstellen (unter dem Button, links bündig)
  const counter = document.createElement('div');
  counter.id = 'step-counter-display';
  counter.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    width: 160px;
    text-align: left;
    color: #000;
    font-size: 18px;
    font-weight: bold;
    font-family: Arial, sans-serif;
    z-index: 9999;
  `;
  document.body.appendChild(counter);

  // Stepcounter-Anzeige aktualisieren
  setInterval(() => {
    const val = window.stepcounter || 0;
    counter.textContent = val.toLocaleString();
  }, 100);
}
