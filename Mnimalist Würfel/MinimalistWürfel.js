/* global Matter */



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

// Ersetze die Kraft-Konstanten am Anfang der Datei (ca. Zeile 28-50):

// Strömungskräfte (direkt, ohne Anziehungspunkte)
let waterForceX = 0;      // Aktuelle horizontale Kraft im Wasser
let waterForceY = 0;      // Aktuelle vertikale Kraft im Wasser
let airForceX = 0;        // Aktuelle horizontale Kraft in der Luft
let airForceY = 0;        // Aktuelle vertikale Kraft in der Luft

// Ziel-Kräfte (wohin die Strömung sich entwickelt)
let waterForceTargetX = 0;
let waterForceTargetY = 0;
let airForceTargetX = 0;
let airForceTargetY = 0;

// Zykluszeiten für Kraftwechsel
const WATER_CYCLE_X = 10000;    // Alle 10 Sek wechselt horizontale Wasser-Richtung
const WATER_CYCLE_Y = 7000;     // Alle 7 Sek wechselt vertikale Wasser-Richtung
const AIR_CYCLE_X = 12000;      // Alle 12 Sek wechselt horizontale Luft-Richtung
const AIR_CYCLE_Y = 9000;       // Alle 9 Sek wechselt vertikale Luft-Richtung

// Maximale Kraftstärken
const WATER_FORCE_MAX_X = 0.003;    // Horizontale Wasser-Strömung (vorher: 0.0012)
const WATER_FORCE_MAX_Y = 0.002;    // Vertikale Wasser-Strömung (vorher: 0.0006)
const AIR_FORCE_MAX_X = 0.002;      // Horizontaler Wind (vorher: 0.0008)
const AIR_FORCE_MAX_Y = 0.0012;     // Vertikaler Wind (vorher: 0.0004)

// Wie schnell sich die Kraft ändert (0-1, höher = schneller)
const FORCE_SMOOTH = 0.03;          // Vorher: 0.02

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

  console.log(`Zeit-Update: ${h}:${m.toString().padStart(2, '0')} -> Würfel: ${desiredCubes}, 10er-Kreise: ${desiredCircles}, Rest-Kreise: ${desiredRestCount}`);

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
  
  console.log(`Aktuell: Würfel: ${cubes.length}, 10er-Kreise: ${circles.length}, Rest-Kreise: ${restCircles.length}`);
}

// --- Objekte hinzufügen ---

function addCubeFromTop() {
  const cubeSize = 190;
  const x = random(cubeSize / 2 + 50, width - cubeSize / 2 - 50);
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
  const r = 50;
  const x = random(r + 50, width - r - 50);
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
  const r = 30;
  const x = random(100 + r, width - 100 - r);
  const y = -50;

  const smallBody = Matter.Bodies.circle(x, y, r, {
    restitution: 0.5,
    friction: 0.2,
    frictionAir: 0.02,
    density: 0.02
  });

  Matter.World.add(world, smallBody);
  restCircles.push({ body: smallBody, shrinkStart: null, originalRadius: r });
}

// --- Merge Animation ---

function startMergeAnimation() {
  mergeAnimationActive = true;
  mergeStartTime = millis();
  mergeTargetX = random(150, width - 150);
  mergeTargetY = random(150, height - 150);
  console.log('Merge Animation gestartet! Ziel:', mergeTargetX, mergeTargetY);
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
      
      if (obj.currentRadius === undefined) {
        obj.currentRadius = obj.originalRadius;
      }
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
      if (obj.currentRadius === undefined) {
        obj.currentRadius = obj.originalRadius;
      }
      obj.currentRadius = obj.originalRadius * 0.2 * (1 - finalProgress);
    }
  }
  
  if (progress >= 1) {
    finishMergeAnimation();
  }
}

function finishMergeAnimation() {
  console.log('Merge Animation beendet!');
  
  for (const obj of restCircles) {
    if (obj && obj.body) {
      Matter.World.remove(world, obj.body);
    }
  }
  restCircles = [];
  
  const r = 50;
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
  
  // WASSER: Horizontale Strömung (Sinus-Welle für sanften Wechsel)
  const waterPhaseX = (now % WATER_CYCLE_X) / WATER_CYCLE_X;
  waterForceTargetX = Math.sin(waterPhaseX * Math.PI * 2) * WATER_FORCE_MAX_X;
  
  // WASSER: Vertikale Strömung
  const waterPhaseY = (now % WATER_CYCLE_Y) / WATER_CYCLE_Y;
  waterForceTargetY = Math.sin(waterPhaseY * Math.PI * 2) * WATER_FORCE_MAX_Y;
  
  // LUFT: Horizontaler Wind
  const airPhaseX = (now % AIR_CYCLE_X) / AIR_CYCLE_X;
  airForceTargetX = Math.sin(airPhaseX * Math.PI * 2) * AIR_FORCE_MAX_X;
  
  // LUFT: Vertikaler Wind
  const airPhaseY = (now % AIR_CYCLE_Y) / AIR_CYCLE_Y;
  airForceTargetY = Math.sin(airPhaseY * Math.PI * 2) * AIR_FORCE_MAX_Y;
  
  // Sanfter Übergang zu Ziel-Kräften
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
    
    // Bestimme Objekttyp
    let objectType;
    let objectHeight;
    
    if (obj.originalSize) {
      objectType = 'cube';
      objectHeight = obj.originalSize;
    } else if (obj.originalRadius === 50) {
      objectType = 'circle';
      objectHeight = obj.originalRadius * 2;
    } else {
      objectType = 'rest';
      objectHeight = (obj.originalRadius || 30) * 2;
    }
    
    // Berechne wie viel Prozent des Objekts im Wasser ist
    const objectTop = pos.y - objectHeight / 2;
    const objectBottom = pos.y + objectHeight / 2;
    
    let percentInWater;
    if (objectBottom <= currentYLine) {
      percentInWater = 0;
    } else if (objectTop >= currentYLine) {
      percentInWater = 1;
    } else {
      const waterPart = objectBottom - currentYLine;
      percentInWater = waterPart / objectHeight;
    }
    
    const isInWater = percentInWater > 0.5;
    
    if (!isInWater) {
      applyAirPhysics(obj, objectType, pos, vel);
    } else {
      applyWaterPhysics(obj, objectType, pos, vel);
    }
    
    applyRotation(obj, objectType, isInWater);
  }
}

function applyAirPhysics(obj, objectType, pos, vel) {
  let frictionAir, baseFloat, forceMultX, forceMultY, damping;
  
  switch (objectType) {
    case 'rest':
      // Mini-Kreise: Bleiben so wie sie sind (funktioniert gut)
      frictionAir = 0.012;
      baseFloat = 0.0008;
      forceMultX = 6.0;
      forceMultY = 5.0;
      damping = 0.995;
      break;
      
    case 'circle':
      // 10-Min-Kreise: VIEL MEHR Bewegung
      frictionAir = 0.008;        // Weniger Reibung (vorher: 0.018)
      baseFloat = 0.0015;         // Weniger Auftrieb (vorher: 0.002)
      forceMultX = 5.0;           // Stärker (vorher: 4.5)
      forceMultY = 3.5;           // Viel stärker (vorher: 1.5)
      damping = 0.995;            // Weniger Dämpfung (vorher: 0.99)
      break;
      
    case 'cube':
      // Würfel: VIEL MEHR Bewegung
      frictionAir = 0.005;        // Weniger Reibung (vorher: 0.008)
      baseFloat = 0.0001;         // Fast kein Auftrieb (vorher: 0.0003)
      forceMultX = 3.5;           // Viel stärker (vorher: 1.5)
      forceMultY = 2.5;           // Viel stärker (vorher: 0.8)
      damping = 0.995;            // Weniger Dämpfung (vorher: 0.97)
      break;
  }
  
  obj.body.frictionAir = frictionAir;
  
  // Basis-Auftrieb (nach oben)
  Matter.Body.applyForce(obj.body, pos, { x: 0, y: -baseFloat });
  
  // Horizontale Wind-Kraft
  Matter.Body.applyForce(obj.body, pos, { x: airForceX * forceMultX, y: 0 });
  
  // Vertikale Wind-Kraft
  Matter.Body.applyForce(obj.body, pos, { x: 0, y: airForceY * forceMultY });
  
  // Würfel: Tendenz zur Mitte der Luft (stärker)
  if (objectType === 'cube') {
    const airMiddle = currentYLine / 2;
    const distToMiddle = pos.y - airMiddle;
    const pullToMiddle = distToMiddle * 0.00015;  // Stärker (vorher: 0.00006)
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: -pullToMiddle });
  }
  
  // 10-Min-Kreise: Tendenz nach oben (aber weniger stark)
  if (objectType === 'circle') {
    const targetY = 120;
    const distToTop = pos.y - targetY;
    const pullToTop = distToTop * 0.00008;  // Etwas schwächer (vorher: 0.0001)
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: -pullToTop });
  }
  
  // Nahe der Decke: sanft abbremsen
  if (pos.y < 60) {
    const topResist = (60 - pos.y) / 60 * 0.001;
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: topResist });
  }
  
  // Geschwindigkeitsdämpfung
  Matter.Body.setVelocity(obj.body, {
    x: vel.x * damping,
    y: vel.y * damping
  });
}

function applyWaterPhysics(obj, objectType, pos, vel) {
  let frictionAir, sinkForce, buoyancy, forceMultX, forceMultY, damping;
  
  switch (objectType) {
    case 'cube':
      // Würfel: EXTREM SCHWER - sinken sofort zum Boden
      frictionAir = 0.005;        // Minimale Reibung
      sinkForce = 0.5;            // MASSIV erhöht (vorher: 0.15)
      buoyancy = 0.0;             // Null Auftrieb
      forceMultX = 3.0;           // Horizontale Bewegung
      forceMultY = 0.0;           // KEINE vertikale Strömungsreaktion
      damping = 0.995;            // Fast keine Dämpfung
      break;
      
    case 'circle':
      // 10-Min-Kreise: Mehr Bewegung, zwischen Würfeln und Mini-Kreisen
      frictionAir = 0.015;
      sinkForce = 0.008;
      buoyancy = 0.001;
      forceMultX = 4.5;
      forceMultY = 3.5;
      damping = 0.98;
      break;
      
    case 'rest':
      // Mini-Kreise: Bleiben so (funktioniert gut)
      frictionAir = 0.02;
      sinkForce = 0.0015;
      buoyancy = 0.0008;
      forceMultX = 5.5;
      forceMultY = 4.5;
      damping = 0.98;
      break;
  }
  
  obj.body.frictionAir = frictionAir;
  
  // Sink-Kraft nach unten
  Matter.Body.applyForce(obj.body, pos, { x: 0, y: sinkForce });
  
  // Auftrieb nach oben
  Matter.Body.applyForce(obj.body, pos, { x: 0, y: -buoyancy });
  
  // Horizontale Strömung
  Matter.Body.applyForce(obj.body, pos, { x: waterForceX * forceMultX, y: 0 });
  
  // Vertikale Strömung (Würfel ignorieren das komplett)
  if (objectType !== 'cube') {
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: waterForceY * forceMultY });
  }
  
  // Würfel: MASSIVE Kraft zum Boden
  if (objectType === 'cube') {
    // Konstante starke Kraft nach unten - IMMER
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: 0.3 });
    
    // Je weiter vom Boden, desto stärker zusätzlich
    const distToBottom = height - 100 - pos.y;
    if (distToBottom > 0) {
      const pullToBottom = distToBottom * 0.002;
      Matter.Body.applyForce(obj.body, pos, { x: 0, y: pullToBottom });
    }
    
    // Am Boden: Nur vertikale Bewegung stoppen, horizontal weiter
    if (pos.y > height - 200) {
      Matter.Body.setVelocity(obj.body, {
        x: vel.x * 0.98,    // Horizontale Bewegung bleibt
        y: Math.min(vel.y * 0.5, 2)  // Vertikale stark gedämpft und begrenzt
      });
    }
  }
  
  // 10-Min-Kreise: Zone zwischen Boden und Mitte
  if (objectType === 'circle') {
    const waterDepth = height - currentYLine;
    const targetY = currentYLine + waterDepth * 0.6;
    const distToTarget = pos.y - targetY;
    const pullToZone = distToTarget * 0.00012;
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: -pullToZone });
  }
  
  // Mini-Kreise: Freie Bewegung
  if (objectType === 'rest') {
    const waterDepth = height - currentYLine;
    const waterMiddle = currentYLine + waterDepth * 0.5;
    const distToMiddle = pos.y - waterMiddle;
    const pullToMiddle = distToMiddle * 0.00002;
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: -pullToMiddle });
  }
  
  // Nahe dem Boden: nur für Nicht-Würfel abbremsen
  if (objectType !== 'cube' && pos.y > height - 80) {
    const bottomResist = (pos.y - (height - 80)) / 80 * 0.0004;
    Matter.Body.applyForce(obj.body, pos, { x: 0, y: -bottomResist });
  }
  
  // Geschwindigkeitsdämpfung (Würfel haben eigene Logik oben)
  if (objectType !== 'cube') {
    Matter.Body.setVelocity(obj.body, {
      x: vel.x * damping,
      y: vel.y * damping
    });
  }
}

function applyRotation(obj, objectType, isInWater) {
  const currentAngularVel = obj.body.angularVelocity;
  
  if (objectType === 'cube') {
    // Würfel im Wasser: KEINE Rotation, komplett stabil
    if (isInWater) {
      Matter.Body.setAngularVelocity(obj.body, currentAngularVel * 0.8);  // Stark dämpfen
      // Keine zufällige Rotation im Wasser
    } else {
      // In der Luft: Langsame, träge Rotation
      Matter.Body.setAngularVelocity(obj.body, currentAngularVel * 0.96);
      if (random() < 0.01) {
        Matter.Body.setAngularVelocity(obj.body, currentAngularVel + random(-0.005, 0.005));
      }
    }
  } else if (objectType === 'circle') {
    // 10-Min-Kreise: Mittlere Rotation
    Matter.Body.setAngularVelocity(obj.body, currentAngularVel * 0.98);
    
    if (random() < 0.05) {
      Matter.Body.setAngularVelocity(obj.body, currentAngularVel + random(-0.02, 0.02));
    }
  } else {
    // Mini-Kreise: Freie Rotation wie Kieselsteine
    Matter.Body.setAngularVelocity(obj.body, currentAngularVel * 0.99);
    
    if (random() < 0.08) {
      Matter.Body.setAngularVelocity(obj.body, currentAngularVel + random(-0.04, 0.04));
    }
  }
}

// --- Zeichenfunktionen ---

function isPM() {
  const h = getHour();
  return h >= 12;
}

function drawAllBodiesWithStyle(style) {
  const fillColor = style.fill;
  const strokeColor = style.stroke;
  const sw = style.strokeWeight;

  push();
  fill(fillColor);
  stroke(strokeColor);
  strokeWeight(sw);
  rectMode(CENTER);
  for (const obj of cubes) {
    if (!obj || !obj.body) continue;
    const body = obj.body;
    const pos = body.position;
    const angle = body.angle;
    const size = obj.originalSize || 190;
    push();
    translate(pos.x, pos.y);
    rotate(angle);
    rect(0, 0, size, size, 40);
    pop();
  }
  pop();

  push();
  fill(fillColor);
  stroke(strokeColor);
  strokeWeight(sw);
  for (const obj of circles) {
    if (!obj || !obj.body) continue;
    const body = obj.body;
    const pos = body.position;
    const r = obj.originalRadius || 50;
    const diameter = r * 2;
    push();
    translate(pos.x, pos.y);
    ellipse(0, 0, diameter, diameter);
    pop();
  }
  pop();

  push();
  fill(fillColor);
  stroke(strokeColor);
  strokeWeight(sw);
  for (const obj of restCircles) {
    if (!obj || !obj.body) continue;
    const body = obj.body;
    const pos = body.position;
    const drawRadius = obj.currentRadius !== undefined ? obj.currentRadius : (obj.originalRadius || 30);
    const drawDiameter = drawRadius * 2;
    
    if (drawDiameter > 1) {
      push();
      translate(pos.x, pos.y);
      ellipse(0, 0, drawDiameter, drawDiameter);
      pop();
    }
  }
  pop();
}

function drawElementsClipped(yLine) {
  // Luft-Bereich (oben)
  push();
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, 0, width, yLine);
  drawingContext.clip();
  
  const airStrokeColor = isPM() ? color('#D9D9D9') : color(255);
  
  drawAllBodiesWithStyle({
    fill: color(0),
    stroke: airStrokeColor,
    strokeWeight: 5
  });
  
  drawingContext.restore();
  pop();
  
  // Wasser-Bereich (unten)
  push();
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(0, yLine, width, height - yLine);
  drawingContext.clip();
  
  drawAllBodiesWithStyle({
    fill: color(255, 220, 0),
    stroke: color(0),
    strokeWeight: 5
  });
  
  drawingContext.restore();
  pop();
}

// --- Tastatur ---

function keyPressed() {
  arrowKeysActive = true;
  
  if (keyCode === UP_ARROW) {
    arrowGravity.y = -1;
  } else if (keyCode === DOWN_ARROW) {
    arrowGravity.y = 1;
  } else if (keyCode === LEFT_ARROW) {
    arrowGravity.x = -1;
  } else if (keyCode === RIGHT_ARROW) {
    arrowGravity.x = 1;
  }
  
  if ([UP_ARROW, DOWN_ARROW, LEFT_ARROW, RIGHT_ARROW].includes(keyCode)) {
    return false;
  }
}

function keyReleased() {
  if (keyCode === UP_ARROW || keyCode === DOWN_ARROW) {
    arrowGravity.y = 0;
  } else if (keyCode === LEFT_ARROW || keyCode === RIGHT_ARROW) {
    arrowGravity.x = 0;
  }
  
  if (arrowGravity.x === 0 && arrowGravity.y === 0) {
    arrowKeysActive = false;
  }
}

// --- Setup ---

function setup() {
  const canvas = createCanvas(960, 960);
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

  const thicknessEdge = 100;
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

  const frameThickness = 20;
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
  let cubeSize = 190;

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
  const bigR = 50;

  for (let i = 0; i < circleCountLocal; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const x = random(100 + bigR, width - 100 - bigR);
      const y = random(100 + bigR, height - 100 - bigR);
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
  const restR = 30;

  for (let i = 0; i < restCount; i++) {
    let placed = false;
    let attempts = 0;
    while (!placed && attempts < 500) {
      const x = random(100 + restR, width - 100 - restR);
      const y = random(100 + restR, height - 100 - restR);
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

function draw() {
  let msInMinute;
  if (manualTimeEnabled) {
    const elapsedMs = millis() - manualTimeStartMs;
    const totalMs = (manualHour * 3600 + manualMinute * 60 + manualSecond) * 1000 + elapsedMs;
    msInMinute = totalMs % 120000;
  } else {
    msInMinute = Date.now() % 120000;
  }
  const cycleProgress = msInMinute / 120000;

  let yLine;
  if (cycleProgress <= 0.5) {
    yLine = (cycleProgress * 2) * height;
  } else {
    yLine = (1 - (cycleProgress - 0.5) * 2) * height;
  }
  
  currentYLine = yLine;

  updateGravity();
  updateAmbientForce();
  updatePhysicsBasedOnPosition();

  background('black');

  // Luft-Bereich: Weiß bei AM, Grau bei PM
  push();
  noStroke();
  if (isPM()) {
    fill('#D9D9D9');
  } else {
    fill('white');
  }
  rect(0, 0, width, yLine);
  pop();

  push();
  stroke('white');
  strokeWeight(2);
  line(0, yLine, width, yLine);
  pop();

  drawElementsClipped(yLine);

  const m = getMinute();
  let h = getHour() % 12;
  if (h === 0) h = 12;

  const minuteChanged = (m !== prevMinute);
  const hourChanged = (h !== prevHour);

  if (minuteChanged) {
    const desiredCubes = h;
    const desiredCircles = Math.floor(m / 10);
    const desiredRestCount = m % 10;

    if (desiredRestCount === 0 && restCircles.length > 0 && !mergeAnimationActive) {
      startMergeAnimation();
    }

    if (hourChanged) {
      while (cubes.length < desiredCubes) addCubeFromTop();
      while (cubes.length > desiredCubes) {
        const obj = cubes.pop();
        if (obj && obj.body) Matter.World.remove(world, obj.body);
      }
    }

    if (!mergeAnimationActive) {
      while (circles.length < desiredCircles) addCircleFromTop();
      while (circles.length > desiredCircles) {
        const obj = circles.pop();
        if (obj && obj.body) Matter.World.remove(world, obj.body);
      }
    }

    if (!mergeAnimationActive) {
      while (restCircles.length < desiredRestCount) {
        addRestCircleFromTop();
      }
      while (restCircles.length > desiredRestCount) {
        const obj = restCircles.pop();
        if (obj && obj.body) Matter.World.remove(world, obj.body);
      }
    }

    prevMinute = m;
    prevHour = h;
  }

  if (mergeAnimationActive) {
    updateMergeAnimation();
  }

  if (mouse && typeof mouse.draw === 'function') mouse.draw();
}
