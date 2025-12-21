// ✅ 在你现有代码基础上：加入“手机真实重力”（陀螺仪/加速度）控制黄色球
// 用法：
// 1) 把下面这段「DEVICE GRAVITY」整段复制进你的代码（建议放在全局变量区，YELLOW_GRAVITY 附近）
// 2) 把 updateYellowBallGravity() 替换成下面的新版本
// 3) 在 setup() 最后加一行：setupDeviceGravity();

// =====================================================
// DEVICE GRAVITY (mobile tilt → gravity vector)
// =====================================================
let deviceGX = 0; // [-1..1]
let deviceGY = 1; // [-1..1]
let deviceGravityEnabled = false;

// 真实重力强度：调大=更“重”、更敏感（建议 0.0010~0.0040）
const DEVICE_G = 0.0022;

// 方向/抖动滤波：越大越稳，但反应更慢（0.10~0.30）
const GRAVITY_FILTER = 0.18;

// iOS（Safari）需要用户手势请求权限：我们用一次点击/触摸触发
function setupDeviceGravity() {
  // 桌面也不报错
  if (typeof window === "undefined") return;

  // 尽量兼容：iOS 走 requestPermission，其他直接监听
  const needsPermission =
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function";

  const enable = async () => {
    try {
      if (needsPermission) {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== "granted") return;
      }
      attachDeviceOrientation();
      deviceGravityEnabled = true;
    } catch (e) {
      // 忽略：用户拒绝/不支持
    }
  };

  // 第一次触摸/点击触发授权（符合 iOS 要求）
  window.addEventListener("pointerdown", enable, { once: true });
  window.addEventListener("touchstart", enable, { once: true, passive: true });

  // 非 iOS：直接挂
  if (!needsPermission) {
    attachDeviceOrientation();
    deviceGravityEnabled = true;
  }
}

function attachDeviceOrientation() {
  window.addEventListener(
    "deviceorientation",
    (e) => {
      // beta: 前后倾斜（-180..180）
      // gamma: 左右倾斜（-90..90）
      const beta = e.beta ?? 0;
      const gamma = e.gamma ?? 0;

      // 映射到 [-1, 1]
      // gamma 左负右正 → x
      // beta  前正后负 → y（这里让“往下”为正）
      let gx = constrain(gamma / 45, -1, 1);
      let gy = constrain(beta / 45, -1, 1);

      // 根据屏幕方向做旋转修正
      const ang = (screen.orientation && typeof screen.orientation.angle === "number")
        ? screen.orientation.angle
        : (typeof window.orientation === "number" ? window.orientation : 0);

      // 旋转向量以匹配屏幕坐标（p5: x→右, y→下）
      let rx = gx, ry = gy;
      if (ang === 90)  { rx = gy;  ry = -gx; }
      if (ang === -90 || ang === 270) { rx = -gy; ry = gx; }
      if (ang === 180) { rx = -gx; ry = -gy; }

      // 低通滤波：更稳
      deviceGX = lerp(deviceGX, rx, GRAVITY_FILTER);
      deviceGY = lerp(deviceGY, ry, GRAVITY_FILTER);
    },
    true
  );
}

// =====================================================
// ✅ 用这个替换你原来的 updateYellowBallGravity()
// （黄色球：手机真实重力 + 可选的常规向下重力）
// =====================================================
function updateYellowBallGravity() {
  if (!yellowBall) return;
  const b = yellowBall.body;

  // 被鼠标拖拽时不要施力（否则手感很怪）
  if (typeof isYellowBallDragged === "function" && isYellowBallDragged()) return;

  // 1) 手机真实重力（倾斜方向决定重力方向）
  if (deviceGravityEnabled) {
    const fx = DEVICE_G * b.mass * deviceGX;
    const fy = DEVICE_G * b.mass * deviceGY;
    Matter.Body.applyForce(b, b.position, { x: fx, y: fy });
  } else {
    // 2) 没有传感器/未授权时：退回你原来的向下重力
    const gForce = YELLOW_GRAVITY * b.mass;
    Matter.Body.applyForce(b, b.position, { x: 0, y: gForce });
  }

  // 3) 可选：轻微阻尼（避免手机抖动时太疯）
  //    想更“滑”就把 0.02 降低；想更“稳”就提高到 0.05
  Matter.Body.setVelocity(b, {
    x: b.velocity.x * 0.98,
    y: b.velocity.y * 0.98
  });
}

// =====================================================
// ✅ 你需要在 setup() 末尾加这一行：
// setupDeviceGravity();
// =====================================================
// 例如：
// function setup() {
//   ...
//   buildRotationPhysicsForTimePixels();
//   setupDeviceGravity();  // ✅ 加在这里
// }
