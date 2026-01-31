/* global Matter */

// Matter.js aliases
const { Engine, World, Bodies, Body, Composite } = Matter;

// ================== Config ==================
const CANVAS_W = 960;
const CANVAS_H = 960;

const GRID_COLS = 24;
const GRID_ROWS = 24;

// ================== Collision categories ==================
const CAT_SAND = 0x0001;
const CAT_BUBBLE = 0x0002;
const CAT_WALL = 0x0004;

// ================== Globals ==================
let engine, world;
let walls = [];
let sandParticles = [];

let p5Canvas;

function fitCanvasToScreen() {
  if (!p5Canvas) return;
  const s = min(windowWidth, windowHeight);
  const size = constrain(s, 320, CANVAS_W);
  p5Canvas.style('width', `${size}px`);
  p5Canvas.style('height', `${size}px`);
}

function windowResized() {
  fitCanvasToScreen();
}

// ================== Tide / Wave ==================
const TIDE_CYCLE_SECONDS = 6.0;
let prevTideX = null;

// ✅ Global deferred removal list - cleared before Engine.update each frame
let pendingRemoval = [];

let interactionT = 0; // hold mouse -> straight wave (noiseScale -> 0)
let prevInteractionT = 0; // track previous frame's interactionT
let shakeStrength = 0;
let shakePhase = 0;

// A key “shake scrub”
const SHAKE_FREQ = 4.0;
const SHAKE_AMP = 80;
const SCRUB_BAND = 110;
const SCRUB_FORCE = -0.018;

// return-to-grid when receding (timing envelope)
const RETURN_DELAY = 0.6;
const RETURN_RAMP = 6;
let recedeTime = 0;

// ✅ return-to-grid physics (instead of teleport lerp)
const RETURN_FORCE_BASE = 0.00008;
const RETURN_FORCE_MAX  = 0.00028;
const RETURN_DAMP_V     = 0.18;

// waterline hysteresis (sand)
const WATER_HYSTERESIS = 14;

// “push sand” params (flood pushes sand)
const PUSH_X_BASE = 0.12;
const SWIRL_Y_BASE = 0.05;
const DEPTH_RANGE = 140;
const STICK_K = 0.00008;

// sand init jitter
const INIT_JITTER = 5;
const R_SCALE = 1.2;
const R_BASE = 12 * R_SCALE;
const R_JITTER = 1.5 * R_SCALE;

// ================== Wave shape (bigger, no foam) ==================
const WAVE_STEP = 10;

const WAVE_AMP1 = 300;
const WAVE_AMP2 = 145;
const WAVE_AMP3 = 36;

const WAVE_NS1 = 0.0046;
const WAVE_NS2 = 0.021;
const WAVE_NS3 = 0.075;

const OSC_EXTRA_RIGHT = 150;  // 退潮向右延伸（中等振幅）
const OSC_EXTRA_LEFT = 100;   // 涨潮向左延伸（中等振幅）

// ================== Tide state ==================
const V_TH = 0.01;
let prevReceding = false;
let prevFlooding = false;

// ================== Time bubbles (wave leaves them) ==================
let timeBubbles = [];

// current minute queue (big=10, small=1)
let bubbleQueue = [];
let queueMinute = null;

// recede emit by distance (so it “leaves along edge”)
let recedeEmitAcc = 0;
const EMIT_STEP_PX = 24;

let recedeStartSec = null;
let recedeSpawnArmed = false;

const RECEDING_SPAWN_DELAY = (TIDE_CYCLE_SECONDS * 0.5) * (1 / 4);

// spawn in-water (edge)
const SPAWN_INWATER_MIN = 8;
const SPAWN_INWATER_MAX = 26;

// y cursor makes a “string” along edge
let emitYCursor = 0;
const EMIT_Y_JITTER = 22;

// swallow (must cover, not pop-disappear)
const SWALLOW_OFFSET_INTO_WATER = 120; // 增大，让黑球被拉入水中更深
const SWALLOW_MAX_LIFE = 4.0;
const COVER_DELETE_DELAY = 2.0; // 增加到 2 秒，确保视觉上完全覆盖
const SWALLOW_TRIGGER_DIST = 80;

// robust swallow
const SWALLOW_NEAR_EDGE = 12;
const SWALLOW_PULL_ALWAYS_IF_COVERED = true;

// ✅ FIX: missing constant (was causing crash)
const SWALLOW_PULL_K = 0.003; // 大幅增大吸力
// ✅ safety clamp for pull force (prevents “爆拉”)
const SWALLOW_PULL_MAX = 0.015; // 增大最大吸力

// ✅ FINAL FIX: coverage margin + multi-sample waterline
const COVER_MARGIN = 80; // 大幅增加，确保视觉上完全没入才算覆盖

// bubble sizes
const BUBBLE_BIG_R = 35;
const BUBBLE_SMALL_R = 15;

// ================== Bubble on-sand micro inertia ==================
const BUBBLE_SAND_IMPULSE_K = 1;
const BUBBLE_SAND_MIN_VX = 2.50;
const BUBBLE_SAND_MAX_VX = 7.50;
const BUBBLE_SAND_FRICTION_AIR = 0.03;

const BUBBLE_DRY_INERTIA_DELAY = 0.03;
const BUBBLE_DRY_INERTIA_TIME = 2.0;
const BUBBLE_DRY_INERTIA_MAX_DX = 200;

// ================== Wet-follow inertia ==================
const WET_FOLLOW_OFFSET = 18;
const WET_FOLLOW_K = 0.00028;
const WET_MAX_VX = 2.2;

// ================== p5 ==================
function setup() {
  p5Canvas = createCanvas(CANVAS_W, CANVAS_H);
  pixelDensity(1);
  fitCanvasToScreen();
  colorMode(RGB);

  engine = Engine.create();
  world = engine.world;

  world.gravity.x = 0;
  world.gravity.y = 0;

  createWalls();

  // sand grid
  const stepX = width / GRID_COLS;
  const stepY = height / GRID_ROWS;

  for (let i = 0; i < GRID_COLS; i++) {
    for (let j = 0; j < GRID_ROWS; j++) {
      const x = i * stepX + stepX / 2 + random(-INIT_JITTER, INIT_JITTER);
      const y = j * stepY + stepY / 2 + random(-INIT_JITTER, INIT_JITTER);
      const r = R_BASE + random(-R_JITTER, R_JITTER);
      sandParticles.push(new SandParticle(x, y, r));
    }
  }

  emitYCursor = random(0, height);
}

function draw() {
  const now = new Date();
  const minutes = now.getMinutes();

  const colSandBg = color("#D9D9D9");
  const colSandBall = color("#EBC407");
  const colWaterDeep = color(0);

  // ✅ Process pending removals BEFORE Engine.update to avoid collision errors
  // Use Set to avoid duplicate removals
  const uniqueRemovals = [...new Set(pendingRemoval)];
  for (const b of uniqueRemovals) {
    removeTimeBubble(b);
  }
  pendingRemoval = [];

  // ✅ Clear collision pairs BEFORE update to prevent stale body references
  if (engine.pairs) {
    engine.pairs.list = [];
    engine.pairs.table = {};
  }

  // ✅ keep engine update first (with error recovery)
  try {
    Engine.update(engine, 1000 / 60);
  } catch (e) {
    console.warn('Matter.js engine error, attempting recovery:', e.message);
    // Clear all pending collisions
    if (engine.pairs) {
      engine.pairs.list = [];
      engine.pairs.table = {};
    }
  }

  const timeSec = millis() / 1000;
  const dt = deltaTime / 1000;

  // hold mouse -> straighten wave
  const targetT = mouseIsPressed ? 1.0 : 0.0;
  prevInteractionT = interactionT;
  interactionT = lerp(interactionT, targetT, 0.05);
  const noiseScale = 1.0 - interactionT;
  
  // ✅ Interaction just ended: reset bubble queue and clear existing bubbles
  const interactionJustEnded = prevInteractionT >= 0.01 && interactionT < 0.01;
  if (interactionJustEnded) {
    // Clear existing bubbles
    for (const b of timeBubbles) {
      if (b.body) {
        b.body.collisionFilter.category = 0;
        b.body.collisionFilter.mask = 0;
        Body.setStatic(b.body, true);
        Body.setPosition(b.body, { x: -9999, y: -9999 });
        b.removed = true;
      }
    }
    timeBubbles = [];
    // Also clear pendingRemoval to avoid stale references
    pendingRemoval = [];
    
    bubbleQueue = [];
    queueMinute = null;
    recedeSpawnArmed = false;
    // Start a new recede cycle immediately so bubbles spawn on next recede
    recedeStartSec = timeSec;
    recedeEmitAcc = 0;
  }

  // tide
  const cycle = (millis() / 1000) % TIDE_CYCLE_SECONDS;
  const t = cycle / TIDE_CYCLE_SECONDS;

  const timeFloat = now.getHours() + minutes / 60.0 + now.getSeconds() / 3600.0;
  const limitX = map(timeFloat, 0, 24, width, 0);

  const cosT = Math.cos(t * TWO_PI);
  const movement = (cosT < 0 ? -Math.pow(Math.abs(cosT), 0.7) : Math.pow(cosT, 0.7));
  const oscillatingTideX = map(movement, -1, 1, limitX - OSC_EXTRA_LEFT, width + OSC_EXTRA_RIGHT);

  // A shake
  const aDown = keyIsDown(65) || keyIsDown(97);
  shakeStrength = lerp(shakeStrength, aDown ? 1.0 : 0.0, 0.15);

  const baseTideX = lerp(oscillatingTideX, limitX, interactionT);
  shakePhase += dt * TWO_PI * SHAKE_FREQ;
  const shakeOffset = Math.sin(shakePhase) * SHAKE_AMP * shakeStrength;
  const tideX = baseTideX + shakeOffset;

  if (prevTideX === null) prevTideX = tideX;
  const tideVel = tideX - prevTideX; // >0 recede (right), <0 flood (left)
  prevTideX = tideX;

  const receding = tideVel > V_TH;
  const flooding = tideVel < -V_TH;

  // sand return timer
  if (tideVel > 0.01) {
    recedeTime = Math.min(recedeTime + dt, RETURN_DELAY + RETURN_RAMP + 0.5);
  } else {
    const bleed = 2.5;
    recedeTime = Math.max(0, recedeTime - dt * bleed);
  }
  const returnBlend = constrain((recedeTime - RETURN_DELAY) / RETURN_RAMP, 0, 1);

  // time bubbles update
  updateTimeBubbles(minutes, tideX, tideVel, timeSec, noiseScale, dt, receding, flooding);

  // sand physics
  for (const p of sandParticles) {
    const pos = p.body.position;

    // sanity - tighter bounds to prevent sand from going off-screen
    if (
      !isFinite(pos.x) || !isFinite(pos.y) ||
      pos.x < -50 || pos.x > width + 50 ||
      pos.y < -50 || pos.y > height + 50
    ) {
      Body.setPosition(p.body, { x: p.initialPos.x, y: p.initialPos.y });
      Body.setVelocity(p.body, { x: 0, y: 0 });
      Body.setAngularVelocity(p.body, 0);
      p.body.frictionAir = 0.3;
      p.inWaterState = false;
      continue;
    }

    // ✅ return phase (PHYSICS, not teleport)
    if (returnBlend > 0 && shakeStrength < 0.05) {
      const k = lerp(RETURN_FORCE_BASE, RETURN_FORCE_MAX, returnBlend);

      const dx = p.initialPos.x - pos.x;
      const dy = p.initialPos.y - pos.y;

      Body.applyForce(p.body, pos, {
        x: dx * k * p.body.mass - p.body.velocity.x * RETURN_DAMP_V * k * p.body.mass * 60,
        y: dy * k * p.body.mass - p.body.velocity.y * RETURN_DAMP_V * k * p.body.mass * 60,
      });

      p.body.frictionAir = 0.22;
      p.inWaterState = false;
      continue;
    }

    // space reset
    if (keyIsDown(32)) {
      Body.setPosition(p.body, {
        x: lerp(pos.x, p.initialPos.x, 0.18),
        y: lerp(pos.y, p.initialPos.y, 0.18),
      });
      Body.setVelocity(p.body, { x: 0, y: 0 });
      Body.setAngularVelocity(p.body, 0);
      p.body.frictionAir = 0.3;
      p.inWaterState = false;
      continue;
    }

    const waterLineX = waterlineAtY(pos.y, tideX, timeSec, noiseScale);

    // hysteresis
    if (!p.inWaterState && pos.x > waterLineX + WATER_HYSTERESIS) p.inWaterState = true;
    if ( p.inWaterState && pos.x < waterLineX - WATER_HYSTERESIS) p.inWaterState = false;
    const inWater = p.inWaterState;

    const inScrubBand = shakeStrength > 0.01 && pos.x > waterLineX - SCRUB_BAND * shakeStrength;

    if (inWater) {
      // ✅ 长按或松开鼠标过渡期间不推动沙子（interactionT > 0.01 表示正在交互或过渡）
      if (tideVel <= 0 && interactionT < 0.01) {
        const dx = p.initialPos.x - pos.x;
        const dy = p.initialPos.y - pos.y;

        const depth = constrain((pos.x - waterLineX) / DEPTH_RANGE, 0, 1);
        const v = -tideVel;
        const tideStrength = constrain(map(v, 0, 6, 0.25, 1.0), 0.25, 1.0);
        const flow = (noise(pos.y * 0.015, timeSec * 0.6) - 0.5);

        const pushX = -PUSH_X_BASE * depth * tideStrength;
        const swirlY =  SWIRL_Y_BASE * depth * tideStrength * flow;

        Body.applyForce(p.body, pos, {
          x: (pushX * p.body.mass) + dx * STICK_K * p.body.mass,
          y: (swirlY * p.body.mass) + dy * STICK_K * p.body.mass,
        });

        p.body.frictionAir = 0.05;
      } else {
        p.body.frictionAir = 0.18;
      }
    } else {
      p.body.frictionAir = 0.25;
    }

    // A scrub
    if (inScrubBand) {
      Body.applyForce(p.body, pos, { x: SCRUB_FORCE * shakeStrength * p.body.mass, y: 0 });
      p.body.frictionAir = Math.min(p.body.frictionAir, 0.06);
    }

    // bounds
    const r = p.r;
    const vx = p.body.velocity.x;
    const vy = p.body.velocity.y;
    let newX = pos.x;
    let newY = pos.y;
    let hitEdge = false;

    // Use smaller margin to allow particles closer to edge
    const edgeMargin = r * 0.3;
    if (newX < edgeMargin) {
      newX = edgeMargin; hitEdge = true;
      Body.setVelocity(p.body, { x: Math.abs(vx) * 0.15, y: vy });
    } else if (newX > width - edgeMargin) {
      newX = width - edgeMargin; hitEdge = true;
      Body.setVelocity(p.body, { x: -Math.abs(vx) * 0.15, y: vy });
    }

    if (newY < edgeMargin) {
      newY = edgeMargin; hitEdge = true;
      Body.setVelocity(p.body, { x: p.body.velocity.x, y: Math.abs(vy) * 0.15 });
    } else if (newY > height - edgeMargin) {
      newY = height - edgeMargin; hitEdge = true;
      Body.setVelocity(p.body, { x: p.body.velocity.x, y: -Math.abs(vy) * 0.15 });
    }

    if (hitEdge) Body.setPosition(p.body, { x: newX, y: newY });
  }

  // ===== Render =====
  background(colSandBg);

  for (const p of sandParticles) p.display(colSandBall);
  for (const b of timeBubbles) b.display();

  drawWave(tideX, colWaterDeep, 0, timeSec, noiseScale);

  prevReceding = receding;
  prevFlooding = flooding;
}

// ================== ✅ NEW: multi-sample max waterline across a circle height ==================
function waterlineMaxForCircle(y, r, tideX, tSec, noiseScale, samples = 9) {
  let wlMax = -Infinity;
  for (let i = 0; i < samples; i++) {
    const a = (samples === 1) ? 0.5 : i / (samples - 1); // 0..1
    const yy = constrain(y - r + a * (2 * r), 0, height);
    const wl = waterlineAtY(yy, tideX, tSec, noiseScale);
    if (Number.isFinite(wl)) wlMax = Math.max(wlMax, wl);
  }
  return wlMax;
}

// ================== Time Bubbles ==================
function updateTimeBubbles(minutes, tideX, tideVel, tSec, noiseScale, dt, receding, flooding) {
  // flood begins
  if (flooding && !prevFlooding) {
    for (const b of timeBubbles) {
      b.covered = false;
      b.coveredT = 0;
      b.swallowLife = 0;
      b.swallowing = false;
    }
    bubbleQueue = [];
    recedeEmitAcc = 0;
  }

  // flood ends
  if (!flooding && prevFlooding) {
    for (const b of timeBubbles) {
      b.swallowing = false;
      b.covered = false;
      b.coveredT = 0;
      b.swallowLife = 0;
    }
  }

  // recede begins (only when not in mouse interaction)
  if (receding && !prevReceding && interactionT < 0.01) {
    recedeStartSec = tSec;
    recedeSpawnArmed = false;
    bubbleQueue = [];
    queueMinute = minutes;
    recedeEmitAcc = 0;
  }

  if (!receding && prevReceding) {
    recedeStartSec = null;
    recedeSpawnArmed = false;
    bubbleQueue = [];
    queueMinute = null;
    recedeEmitAcc = 0;
  }

  const recedeAge = recedeStartSec === null ? 0 : (tSec - recedeStartSec);
  // Disable spawn during mouse interaction
  const recedeReady = receding && recedeAge >= RECEDING_SPAWN_DELAY && interactionT < 0.01;

  if (recedeReady && !recedeSpawnArmed) {
    bubbleQueue = buildBubbleQueueForMinute(minutes);
    queueMinute = minutes;
    recedeEmitAcc = 0;
    recedeSpawnArmed = true;
  }

  // minute change while receding
  if (recedeReady && queueMinute !== minutes) {
    bubbleQueue = buildBubbleQueueForMinute(minutes);
    queueMinute = minutes;
    recedeEmitAcc = 0;
  }

  // receding: emit by distance
  if (recedeReady && bubbleQueue.length > 0) {
    recedeEmitAcc += Math.max(0, tideVel);

    while (recedeEmitAcc >= EMIT_STEP_PX && bubbleQueue.length > 0) {
      recedeEmitAcc -= EMIT_STEP_PX;
      const r = bubbleQueue.shift();
      spawnBubbleFromRecedingEdge(r, tideX, tideVel, tSec, noiseScale);
    }
  }

  // (Deferred removal is now handled via global pendingRemoval array)

  // update all bubbles
  for (let i = timeBubbles.length - 1; i >= 0; i--) {
    const b = timeBubbles[i];
    
    // Skip if body was already removed or marked as removed
    if (!b || !b.body || b.removed) {
      timeBubbles.splice(i, 1);
      continue;
    }
    
    const pos = b.body.position;
    
    // Extra safety: if position object is invalid
    if (!pos) {
      timeBubbles.splice(i, 1);
      continue;
    }

    // NaN => immediately hide and remove from array (don't use pendingRemoval)
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) {
      console.log('DEBUG: removed due to NaN position', pos.x, pos.y);
      // Hide immediately without going through pendingRemoval
      if (b.body) {
        b.body.collisionFilter.category = 0;
        b.body.collisionFilter.mask = 0;
        Body.setStatic(b.body, true);
        Body.setPosition(b.body, { x: -9999, y: -9999 });
      }
      b.removed = true;
      timeBubbles.splice(i, 1);
      continue;
    }

    // ✅ swallowing 中不允许越界直接删除
    if (b.swallowing && (pos.x < -100 || pos.x > width + 100)) {
      const xClamped = constrain(pos.x, b.radius + 2, width - b.radius - 2);
      Body.setPosition(b.body, { x: xClamped, y: pos.y });
      Body.setVelocity(b.body, { x: 0, y: 0 });
    } else if (!b.swallowing && (pos.x < -100 || pos.x > width + 100)) {
      console.log('DEBUG: removed due to out of bounds', pos.x);
      // Hide immediately without going through pendingRemoval
      if (b.body) {
        b.body.collisionFilter.category = 0;
        b.body.collisionFilter.mask = 0;
        Body.setStatic(b.body, true);
        Body.setPosition(b.body, { x: -9999, y: -9999 });
      }
      b.removed = true;
      timeBubbles.splice(i, 1);
      continue;
    }

    // ✅ waterline mid + multi-sample max across circle
    const yMid = pos.y;
    const wlMid = waterlineAtY(yMid, tideX, tSec, noiseScale);
    if (!Number.isFinite(wlMid)) continue;

    const wlMax = waterlineMaxForCircle(yMid, b.radius, tideX, tSec, noiseScale, 9);

    const distToWater = pos.x - wlMid;
    const centerInWater = distToWater > 0;

    // ✅ STRICT: ball's LEFT edge must be fully past the RIGHTMOST waterline + margin
    // This ensures the entire circle is visually inside the water shape
    const ballLeftEdge = pos.x - b.radius;
    // Guard against invalid wlMax (returns -Infinity if all samples failed)
    const fullyCovered = Number.isFinite(wlMax) && (ballLeftEdge >= wlMax + COVER_MARGIN);

    // swallow trigger (disabled during mouse interaction to prevent unwanted movement)
    const nearEdge = distToWater > -SWALLOW_NEAR_EDGE;
    const inBand = Math.abs(distToWater) < SWALLOW_TRIGGER_DIST;
    const shouldSwallow =
      flooding && interactionT < 0.01 && (nearEdge || inBand || (SWALLOW_PULL_ALWAYS_IF_COVERED && centerInWater) || b.swallowing);

    if (shouldSwallow) {
      if (!b.swallowing) {
        b.swallowing = true;
        b.covered = false;
        b.coveredT = 0;
        b.swallowLife = 0;
        b.isWet = true;
      }

      // ✅ 保持静止，等待浪花真实淡没（不施加吸力）
      Body.setStatic(b.body, true);
      // Guard against NaN position
      if (Number.isFinite(b.xAnchor) && Number.isFinite(b.yAnchor)) {
        Body.setPosition(b.body, { x: b.xAnchor, y: b.yAnchor });
      }

      const delta = Number.isFinite(dt) ? dt : 0.016;
      b.swallowLife += delta;

      // ✅ 移除计时器：只有当浪花完全覆盖后才开始
      if (!b.covered) {
        if (fullyCovered) {
          b.covered = true;
          b.coveredT = 0;
        }
      } else {
        if (!fullyCovered) {
          // \u6d6a\u82b1\u9000\u53bb\u4e86\uff0c\u91cd\u7f6e\u8986\u76d6\u72b6\u6001
          b.covered = false;
          b.coveredT = 0;
        } else {
          b.coveredT += delta;
          if (b.coveredT >= COVER_DELETE_DELAY) {
            console.log('DEBUG: removed due to fullyCovered', 'posX:', pos.x, 'ballLeftEdge:', pos.x - b.radius, 'wlMax:', wlMax, 'margin:', COVER_MARGIN);
            // Hide immediately without going through pendingRemoval
            if (b.body) {
              b.body.collisionFilter.category = 0;
              b.body.collisionFilter.mask = 0;
              Body.setStatic(b.body, true);
              Body.setPosition(b.body, { x: -9999, y: -9999 });
            }
            b.removed = true;
            timeBubbles.splice(i, 1);
            continue;
          }
        }
      }

      continue;
    }

    // left behind when waterline passes: freeze and lock anchor
    if (b.isWet && distToWater < -20) {
      b.isWet = false;
      // Guard against NaN anchors
      const anchorX = b.body.position.x;
      const anchorY = b.body.position.y;
      if (Number.isFinite(anchorX) && Number.isFinite(anchorY)) {
        b.xAnchor = anchorX;
        b.yAnchor = anchorY;
      }

      Body.setVelocity(b.body, { x: 0, y: 0 });
      Body.setAngularVelocity(b.body, 0);
      Body.setAngle(b.body, 0);
      b.body.frictionAir = BUBBLE_SAND_FRICTION_AIR;

      // Guard against NaN position
      if (Number.isFinite(b.xAnchor) && Number.isFinite(b.yAnchor)) {
        Body.setPosition(b.body, { x: b.xAnchor, y: b.yAnchor });
      }

      b.dryT = 0;
      b.inertiaApplied = false;
      b.inertiaLife = 0;

      Body.setStatic(b.body, true);
      continue;
    }

    // bubble on sand: static visually (with a horizontal inertia kick)
    if (!b.isWet) {
      if (!Number.isFinite(b.dryT)) b.dryT = 0;
      b.dryT += dt;

      if (!b.inertiaApplied && b.dryT >= BUBBLE_DRY_INERTIA_DELAY) {
        b.inertiaApplied = true;
        b.inertiaLife = 0;
        b.inertiaX0 = b.body.position.x;

        Body.setStatic(b.body, false);

        const base = Math.abs(tideVel) * BUBBLE_SAND_IMPULSE_K;
        const vxMag = constrain(base, BUBBLE_SAND_MIN_VX, BUBBLE_SAND_MAX_VX);
        b.body.frictionAir = BUBBLE_SAND_FRICTION_AIR;
        Body.setVelocity(b.body, { x: vxMag, y: 0 });
      }

      if (b.inertiaApplied && b.inertiaLife < BUBBLE_DRY_INERTIA_TIME) {
        b.inertiaLife += dt;
        const xNow = b.body.position.x;
        const x0 = Number.isFinite(b.inertiaX0) ? b.inertiaX0 : xNow;
        const dx = xNow - x0;

        if (Math.abs(dx) > BUBBLE_DRY_INERTIA_MAX_DX) {
          const xClamped = x0 + Math.sign(dx) * BUBBLE_DRY_INERTIA_MAX_DX;
          if (Number.isFinite(xClamped) && Number.isFinite(b.yAnchor)) {
            Body.setPosition(b.body, { x: xClamped, y: b.yAnchor });
          }
          Body.setVelocity(b.body, { x: 0, y: 0 });
          b.inertiaLife = BUBBLE_DRY_INERTIA_TIME;
        } else {
          if (Number.isFinite(xNow) && Number.isFinite(b.yAnchor)) {
            Body.setPosition(b.body, { x: xNow, y: b.yAnchor });
          }
          Body.setVelocity(b.body, {
            x: constrain(b.body.velocity.x, -BUBBLE_SAND_MAX_VX, BUBBLE_SAND_MAX_VX),
            y: 0,
          });
        }
        Body.setAngularVelocity(b.body, 0);
        Body.setAngle(b.body, 0);
      } else {
        const newAnchorX = b.body.position.x;
        if (Number.isFinite(newAnchorX)) b.xAnchor = newAnchorX;
        if (Number.isFinite(b.xAnchor) && Number.isFinite(b.yAnchor)) {
          Body.setPosition(b.body, { x: b.xAnchor, y: b.yAnchor });
        }
        Body.setVelocity(b.body, { x: 0, y: 0 });
        Body.setAngularVelocity(b.body, 0);
        Body.setAngle(b.body, 0);

        Body.setStatic(b.body, true);
      }

      continue;
    }

    // bubble is wet: allow small inertia in X, lock Y
    b.yAnchor = Number.isFinite(b.yAnchor) ? b.yAnchor : pos.y;

    Body.setStatic(b.body, false);

    // lock Y
    Body.setPosition(b.body, { x: b.body.position.x, y: b.yAnchor });
    Body.setVelocity(b.body, { x: b.body.velocity.x, y: 0 });
    Body.setAngularVelocity(b.body, 0);
    Body.setAngle(b.body, 0);

    // follow waterline slightly (midline)
    const targetX = wlMid + WET_FOLLOW_OFFSET;
    const dx = targetX - b.body.position.x;
    Body.applyForce(b.body, b.body.position, { x: dx * WET_FOLLOW_K * b.body.mass, y: 0 });

    // clamp vx
    const vx = constrain(b.body.velocity.x, -WET_MAX_VX, WET_MAX_VX);
    Body.setVelocity(b.body, { x: vx, y: 0 });

    b.body.frictionAir = 0.18;
  }

  // (Deferred removal now handled at start of draw() before Engine.update)
}

function buildBubbleQueueForMinute(minute) {
  const tens = Math.floor(minute / 10);
  const ones = minute % 10;
  const arr = [];
  for (let i = 0; i < tens; i++) arr.push(BUBBLE_BIG_R);
  for (let i = 0; i < ones; i++) arr.push(BUBBLE_SMALL_R);
  return arr;
}

// spawn at wave edge IN WATER (so it feels like wave left it)
function spawnBubbleFromRecedingEdge(radius, tideX, tideVel, tSec, noiseScale) {
  emitYCursor += (height / 8);
  if (emitYCursor > height) emitYCursor -= height;

  let y = emitYCursor + random(-EMIT_Y_JITTER, EMIT_Y_JITTER);
  y = constrain(y, 60, height - 60);

  const wl = waterlineAtY(y, tideX, tSec, noiseScale);

  // ✅ Guard against NaN waterline
  if (!Number.isFinite(wl)) {
    return; // skip spawning if waterline is invalid
  }

  // ✅ spawn inside water
  const x = wl + random(SPAWN_INWATER_MIN, SPAWN_INWATER_MAX);
  const safeX = constrain(x, radius + 2, width - radius - 2);

  // Double-check safeX is valid
  if (!Number.isFinite(safeX)) {
    return;
  }

  const b = new TimeBubble(safeX, y, radius);
  b.isWet = true;

  b.swallowing = false;
  b.covered = false;
  b.coveredT = 0;
  b.swallowLife = 0;

  b.xAnchor = safeX;
  b.yAnchor = y;

  Body.setStatic(b.body, false);

  // initial horizontal drift
  const vx0 = constrain(tideVel * 0.35, -WET_MAX_VX, WET_MAX_VX);
  Body.setVelocity(b.body, { x: vx0, y: 0 });
  Body.setAngularVelocity(b.body, 0);
  Body.setAngle(b.body, 0);
  b.body.frictionAir = 0.12;

  b.dryT = 0;
  b.inertiaApplied = false;
  b.inertiaLife = 0;

  timeBubbles.push(b);
}

function removeTimeBubble(b) {
  // Guard: skip if already removed or invalid
  if (!b || !b.body) return;
  const idx = timeBubbles.indexOf(b);
  if (idx === -1) return; // already removed from array
  
  // ✅ Don't actually remove from Matter.js - just hide it
  // This avoids the collision detector crash
  b.body.collisionFilter.category = 0;
  b.body.collisionFilter.mask = 0;
  Body.setStatic(b.body, true);
  Body.setPosition(b.body, { x: -9999, y: -9999 }); // Move far off-screen
  
  // Mark as removed (body still exists but is hidden)
  b.removed = true;
  timeBubbles.splice(idx, 1);
}

// ================== Wave rendering ==================
function drawWave(baseX, colorVal, offsetMultiplier, tSec, scale) {
  fill(colorVal);
  noStroke();
  beginShape();
  vertex(width, 0);
  vertex(width, height);

  for (let y = height; y >= 0; y -= WAVE_STEP) {
    const x = waterlineAtY(y, baseX, tSec + offsetMultiplier, scale);
    vertex(x, y);
  }
  endShape(CLOSE);
}

// ================== Waterline ==================
function waterlineAtY(y, tideX, tSec, noiseScale) {
  // Guard against NaN inputs
  if (!Number.isFinite(y) || !Number.isFinite(tideX) || !Number.isFinite(tSec)) {
    return width / 2; // fallback to center
  }
  const safeNoiseScale = Number.isFinite(noiseScale) ? noiseScale : 1;
  const n1 = (noise(y * WAVE_NS1, tSec * 0.55) - 0.5) * WAVE_AMP1 * safeNoiseScale;
  const n2 = (noise(y * WAVE_NS2, tSec * 2.10) - 0.5) * WAVE_AMP2 * safeNoiseScale;
  const n3 = (noise(y * WAVE_NS3, tSec * 5.20) - 0.5) * WAVE_AMP3 * safeNoiseScale;
  const result = tideX + n1 + n2 + n3;
  return Number.isFinite(result) ? result : width / 2;
}

// ================== Matter walls ==================
function createWalls() {
  const t = 100;
  const opts = { isStatic: true, restitution: 0.0, collisionFilter: { category: CAT_WALL } };

  const top = Bodies.rectangle(width / 2, -t / 2, width, t, opts);
  const bottom = Bodies.rectangle(width / 2, height + t / 2, width, t, opts);
  const left = Bodies.rectangle(-t / 2, height / 2, t, height, opts);
  const right = Bodies.rectangle(width + t / 2, height / 2, t, height, opts);

  World.add(world, [top, bottom, left, right]);
  walls = [top, bottom, left, right];
}

// ================== Sand particle ==================
class SandParticle {
  constructor(x, y, r) {
    this.r = r;
    this.initialPos = { x, y };
    this.inWaterState = false;

    this.body = Bodies.circle(x, y, r, {
      restitution: 0.0,
      friction: 0.7,
      frictionStatic: 0.9,
      frictionAir: 0.08,
      density: 0.002,
      collisionFilter: { group: -1, category: CAT_SAND, mask: CAT_WALL | CAT_BUBBLE },
    });

    World.add(world, this.body);
  }

  display(fillColor) {
    const pos = this.body.position;
    push();
    translate(pos.x, pos.y);
    rotate(this.body.angle);
    noStroke();
    fill(fillColor);
    circle(0, 0, this.r * 2);
    pop();
  }
}

// ================== TimeBubble ==================
class TimeBubble {
  constructor(x, y, radius) {
    // Guard against NaN inputs
    const safeX = Number.isFinite(x) ? x : width / 2;
    const safeY = Number.isFinite(y) ? y : height / 2;
    const safeRadius = Number.isFinite(radius) ? radius : 10;
    
    this.radius = safeRadius;

    // state
    this.isWet = true;

    // anchor to lock Y
    this.yAnchor = safeY;
    this.xAnchor = safeX;

    // swallow state
    this.swallowing = false;
    this.covered = false;
    this.coveredT = 0;
    this.swallowLife = 0;

    // dry inertia state
    this.dryT = 0;
    this.inertiaApplied = false;
    this.inertiaLife = 0;
    this.inertiaX0 = safeX;

    this.body = Bodies.circle(safeX, safeY, safeRadius, {
      restitution: 0.0,
      friction: 0.6,
      frictionAir: 0.02,
      density: 0.02,
      collisionFilter: { category: CAT_BUBBLE, mask: CAT_WALL | CAT_SAND },
    });

    World.add(world, this.body);
  }

  display() {
    // Skip if body was removed or marked as removed
    if (!this.body || this.removed) return;
    const pos = this.body.position;
    // Skip rendering if position is invalid (prevents ghost at 0,0)
    if (!Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;
    if (pos.x < -50 || pos.y < -50) return; // skip left-top corner ghosts
    push();
    translate(pos.x, pos.y);
    rotate(this.body.angle);
    noStroke();
    fill(0);
    circle(0, 0, this.radius * 2);
    pop();
  }
}
