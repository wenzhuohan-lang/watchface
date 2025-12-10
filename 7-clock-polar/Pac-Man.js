Matter.use('matter-wrap');

let handSec;
let handMin;
let handHour;
let mouse;
let center;

let ringBlocks = [];   // 每个元素：{ body, theta, x, y, r, isOpen }
let balls = [];

let engine;
let world;

// 记录上一次分钟，用于每分钟重置小球
let prevMinute = -1;

const ringRadius = 380;

// 控制外圈圆球数量与相邻重叠因子
const RING_SEGMENTS = 600;
const RING_OVERLAP  = 0.9;

// 目标维持的最大球数
const MAX_BALLS = 200;

// 拖尾长度
const TRAIL_LENGTH = 5;

// 中心圆点半径（后面在 setup 里赋值）
let centerDotR;

let gx = 0;
let gy = 1;
// 将缩放改为 1.0（或按需设为 0.16 / 1.0 / 2.0 等）
const GRAVITY_SCALE = 1.0;

// 新增：Matter 中的基础 scale（直接影响加速度大小），和滤波参数
const BASE_GRAVITY_SCALE = 0.003; // 默认 0.003，调大重力更强（试 0.002 -> 0.006）
const GRAVITY_FILTER_ALPHA = 0.12; // 越大响应越快但越抖，越小越平滑
let targetGx = 0, targetGy = 1;    // 传感器目标值（经归一化）
let smoothedGx = gx, smoothedGy = gy; // 滤波后的值，实际写入 world.gravity

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

function setup() {
  const canvas = createCanvas(960, 960);
  center = { x: width / 2, y: height / 2 };

  engine = Matter.Engine.create();
  world = engine.world;

  // 重力小一点，减少穿模
  // 初始设置为正常向下重力（会由设备数据覆盖）
  world.gravity.y = 1;
  // 保持默认 scale（可选）：world.gravity.scale = 0.001;

  const segments = RING_SEGMENTS;
  const visualThickness = 15;
  const circumference = TWO_PI * ringRadius;

  // ------- 外圈圆环（静态圆刚体）-------
  for (let i = 0; i < segments; i++) {
    const angle = map(i, 0, segments, 0, TWO_PI);
    const x = center.x + cos(angle) * ringRadius;
    const y = center.y + sin(angle) * ringRadius;

    const arcLen = circumference / segments;
    const colliderR = max(visualThickness, arcLen) * RING_OVERLAP;

    const circleBody = Matter.Bodies.circle(x, y, colliderR, {
      isStatic: true,
      restitution: 0.25,
      friction: 0.3
    });
    Matter.World.add(world, circleBody);

    ringBlocks.push({
      body: circleBody,
      theta: angle,
      x,
      y,
      r: colliderR,
      isOpen: false
    });
  }

  // ------- 三根指针（这里只用时针 + 分针）-------
  // 用外圈小球直径当作指针的厚度基准
  const capDiameter = (ringBlocks.length > 0) ? ringBlocks[0].r * 2 : 26;

  // 中心点半径略大于指针粗细，用来盖住缝
  centerDotR = capDiameter * 1.2;

  // 时针：短一些
  const hourLen = 200;
  handHour = new Block(
    world,
    { w: capDiameter, h: hourLen, x: center.x, y: center.y - hourLen / 2, color: 'white' },
    { isStatic: true }
  );

  // 分针：略长一点（你可以改这个比例）
  const minLen = ringRadius * 1.03;  // 想刚好到环内就用 ringRadius * 1.0
  handMin = new Block(
    world,
    { w: capDiameter, h: minLen, x: center.x, y: center.y - minLen / 2, color: 'white' },
    { isStatic: true }
  );

  // 如需秒针可解开
  // handSec = new Block(
  //   world,
  //   { w: max(3, capDiameter * 0.12), h: 300, x: center.x, y: center.y - 150, color: 'white' },
  //   { isStatic: true }
  // );

  // ------- 鼠标控制 -------
  mouse = new Mouse(engine, canvas, {
    stroke: 'magenta',
    strokeWeight: 2
  });

  // ------- 画布边界 -------
  const thicknessEdge = 100;
  const edgeRest = 0.8;

  const ground = Matter.Bodies.rectangle(
    width / 2, height + thicknessEdge / 2,
    width, thicknessEdge,
    { isStatic: true, restitution: edgeRest }
  );
  const ceiling = Matter.Bodies.rectangle(
    width / 2, -thicknessEdge / 2,
    width, thicknessEdge,
    { isStatic: true, restitution: edgeRest }
  );
  const leftWall = Matter.Bodies.rectangle(
    -thicknessEdge / 2, height / 2,
    thicknessEdge, height,
    { isStatic: true, restitution: edgeRest }
  );
  const rightWall = Matter.Bodies.rectangle(
    width + thicknessEdge / 2, height / 2,
    thicknessEdge, height,
    { isStatic: true, restitution: edgeRest }
  );

  Matter.World.add(world, [ground, ceiling, leftWall, rightWall]);

  Matter.Runner.run(engine);

  // 启动设备重力监听（会请求权限于 iOS）
  setupDeviceMotion();

  prevMinute = minute();
}

// ---------- 角度工具 ----------
function normAngle(a) {
  a = a % TWO_PI;
  if (a < 0) a += TWO_PI;
  return a;
}

function angleInArc(angle, start, end) {
  angle = normAngle(angle);
  start = normAngle(start);
  end   = normAngle(end);

  const arcLen = (end - start + TWO_PI) % TWO_PI;
  const rel    = (angle - start + TWO_PI) % TWO_PI;

  return rel <= arcLen;
}

// ---------- 小球：从“天空”生成 ----------
function spawnBall() {
  if (balls.length > 1000) return;  // 绝对上限

  const x = random(width * 0.2, width * 0.8);
  const y = -50;
  const r = random(8, 16);

  let body = Matter.Bodies.circle(x, y, r, {
    restitution: 0.9,
    friction: 0.01,
    frictionAir: 0.005,
    density: 0.0008
    // 如需 wrap，可打开：
    // plugin: {
    //   wrap: {
    //     min: { x: 0, y: 0 },
    //     max: { x: width, y: height }
    //   }
    // }
  });

  Matter.Body.setVelocity(body, {
    x: random(-0.5, 0.5),
    y: random(0, 1)
  });

  const trail = new Queue(TRAIL_LENGTH);
  trail.add({ x: x, y: y });

  Matter.World.add(world, body);

  const col = color('#ffcc66');

  balls.push({
    body,
    r,
    isDying: false,
    shrinkSpeed: 0.96,
    bornFrame: frameCount,
    trail,
    color: col
  });
}

// 控制数量：超出上限就开始标记死亡
function controlPopulation() {
  let aliveCount = 0;
  for (const b of balls) {
    if (!b.isDying) aliveCount++;
  }

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

// 移除所有小球并清理物理世界中的刚体
function resetBalls() {
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    try {
      if (b && b.body) Matter.World.remove(world, b.body);
    } catch (e) {}
  }
  balls.length = 0;
}

function draw() {
  background(0);

  const s = second();
  const m = minute();
  const h = hour() % 12;

  // 每分钟重置一次所有小球
  if (m !== prevMinute) {
    resetBalls();
    prevMinute = m;
  }

  const angleSec  = map(s, 0, 60, 0, TWO_PI);
  const angleMin  = map(m + s / 60, 0, 60, 0, TWO_PI);
  const angleHour = map(h + m / 60, 0, 12, 0, TWO_PI);

  let angleA = angleMin;
  let angleB = angleHour;

  // 把 12 点放到上方（减 HALF_PI）
  let start = angleA - HALF_PI;
  let end   = angleB - HALF_PI;

  // 取两针之间较短的那条弧作为“开口”
  let arcLen = (end - start + TWO_PI) % TWO_PI;
  if (arcLen > PI) {
    let t = start;
    start = end;
    end = t;
  }

  // ------- 指针旋转 -------
  // handSec.rotate(angleSec, center);
  handMin.rotate(angleMin,  center);
  handHour.rotate(angleHour, center);

  // 只画「圆角矩形」指针，不要端点小球
  drawHandSimple(handMin.body, 'white');
  drawHandSimple(handHour.body, 'white');
  // 若需要秒针：drawHandSimple(handSec.body, 'white', 8);

  // ------- 动态开口（控制外圈 + 碰撞）-------
  for (let seg of ringBlocks) {
    const shouldOpen = angleInArc(seg.theta, start, end);

    if (shouldOpen && !seg.isOpen) {
      try { Matter.World.remove(world, seg.body); } catch (e) {}
      seg.isOpen = true;
    } else if (!shouldOpen && seg.isOpen) {
      Matter.World.add(world, seg.body);
      seg.isOpen = false;
    }

    if (!seg.isOpen) {
      noStroke();
      fill(255);
      ellipse(seg.x, seg.y, seg.r * 2, seg.r * 2);
    }
  }

  // ------- 定时生成小球 -------
  if (frameCount % 60 === 0) {
    spawnBall();
  }

  controlPopulation();

  // ------- 更新 & 绘制小球 + 拖尾 -------
  noStroke();

  for (let i = balls.length - 1; i >= 0; i--) {
    const b = balls[i];
    const body = b.body;
    const p = body.position;

    // 限制最大速度，减少穿模
    const v = body.velocity;
    const maxV = 25;
    Matter.Body.setVelocity(body, {
      x: constrain(v.x, -maxV, maxV),
      y: constrain(v.y, -maxV, maxV)
    });

    // 拖尾：隔几帧记录一次
    if (frameCount % 2 === 0) {
      b.trail.add({ x: p.x, y: p.y });
    }

    const points = b.trail.all();

    for (let j = 0; j < points.length - 1; j++) {
      const p1 = points[j];
      const p2 = points[j + 1];

      const steps = 4;
      const totalSegments = max(1, points.length - 1);

      const size = b.r * 2;

      for (let k = 0; k < steps; k++) {
        const t = k / steps;
        const x = lerp(p1.x, p2.x, t);
        const y = lerp(p1.y, p2.y, t);

        const progress = (j + t) / totalSegments;
        const alpha = lerp(40, 255, progress);

        const c = b.color || color(255);
        fill(red(c), green(c), blue(c), alpha);
        noStroke();
        ellipse(x, y, size, size);
      }
    }

    if (b.isDying) {
      b.r *= b.shrinkSpeed;

      if (b.r < 1) {
        try {
          Matter.World.remove(world, b.body);
        } catch (e) {}
        balls.splice(i, 1);
        continue;
      }
    }

    const mainColor = b.color || color(255);
    fill(red(mainColor), green(mainColor), blue(mainColor), 255);
    noStroke();
    ellipse(p.x, p.y, b.r * 2, b.r * 2);
  }

  // 中心圆点：盖住指针与中心之间的缝，让它们连在一起
  drawCenterDot();

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
  if (minThickness !== null) {
    thickness = max(thickness, minThickness);
  }

  const rectLen = len;
  const drawAngle = (maxProjAxis >= maxProjPerp) ? angle : angle + HALF_PI;

  push();
  translate(cx, cy);
  rotate(drawAngle);
  noStroke();
  fill(clr);
  rectMode(CENTER);

  // cornerRadius = thickness / 2 让两端略圆一点（但不是独立小球）
  rect(0, 0, rectLen, thickness, thickness / 2);

  pop();
}

// ------- 辅助：中心圆点 -------
function drawCenterDot() {
  push();
  noStroke();
  fill(255);
  ellipse(center.x, center.y, centerDotR, centerDotR);
  pop();
}

// ============ 设备重力支持 ============
// 在 setup() 里调用 setupDeviceMotion();

function setupDeviceMotion() {
  if (typeof DeviceMotionEvent === "undefined") {
    console.log("DeviceMotionEvent not supported");
    return;
  }

  // 创建按钮（p5 自带 DOM，不折腾 z-index 了）
  const btn = createButton("启用重力");
  btn.position(10, 10);
  btn.style("padding", "6px 10px");
  btn.style("font-size", "14px");
  btn.style("border-radius", "6px");
  btn.style("background", "#ffffff");
  btn.style("border", "none");

  // iOS 13+ 需要 requestPermission 且不能用 async/await
  if (typeof DeviceMotionEvent.requestPermission === "function") {
    btn.mousePressed(() => {
      DeviceMotionEvent.requestPermission()
        .then((res) => {
          if (res === "granted") {
            window.addEventListener("devicemotion", handleMotion);
            btn.html("重力已启用");
            console.log("DeviceMotion granted");
          } else {
            btn.html("未授权");
            console.log("DeviceMotion permission denied:", res);
          }
        })
        .catch((err) => {
          btn.html("错误");
          console.error("DeviceMotion error:", err);
        });
    });
  } else {
    // 安卓 / 桌面：点击后直接监听
    btn.mousePressed(() => {
      window.addEventListener("devicemotion", handleMotion);
      btn.html("重力已启用");
      console.log("DeviceMotion listener attached");
    });
  }
}

// 把设备加速度映射到 Matter 的重力
function handleMotion(e) {
  const acc = e.accelerationIncludingGravity || e.acceleration;
  if (!acc) return;

  // 原始传感器值（m/s^2）
  let ax = acc.x || 0;
  let ay = acc.y || 0;
  let az = acc.z || 0;

  // 常见映射（大多数安卓/ios 手持竖屏）：将设备坐标映射到画布坐标
  // 你可以按需交换或反向下面两行来匹配你的握持方向
  // 例如：若感觉反向请试 tx = -ax / ty = -ay 或 交换 ax/ay。
  const tx = -ax; // 屏幕 x（向右为正）
  const ty = -ay; // 屏幕 y（向下为正）

  // 归一化到 [-1,1]（以 1g = 9.8 m/s^2）
  targetGx = constrain(tx / 9.8, -1, 1);
  targetGy = constrain(ty / 9.8, -1, 1);

  // 指数平滑（低通）
  smoothedGx += (targetGx - smoothedGx) * GRAVITY_FILTER_ALPHA;
  smoothedGy += (targetGy - smoothedGy) * GRAVITY_FILTER_ALPHA;

  // 写入物理世界（同时使用 BASE_GRAVITY_SCALE 控制强度）
  if (world && world.gravity) {
    world.gravity.x = smoothedGx * GRAVITY_SCALE;
    world.gravity.y = smoothedGy * GRAVITY_SCALE;
    world.gravity.scale = BASE_GRAVITY_SCALE * GRAVITY_SCALE;
  }

  //（可选）在控制台打印用于调试
  // console.log(`ax=${ax.toFixed(2)} ay=${ay.toFixed(2)} -> gx=${smoothedGx.toFixed(3)} gy=${smoothedGy.toFixed(3)} scale=${world.gravity.scale}`);
}
