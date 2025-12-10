Matter.use('matter-wrap');

let handSec;
let handMin;
let handHour;
let boxes = [];
let mouse;
let center;

let ringBlocks = [];

let engine;
let world;

function setup() {
  const canvas = createCanvas(600, 600);
  center = { x: width / 2, y: height / 2 };

  // create an engine
  engine = Matter.Engine.create();
  world = engine.world;

  const radius = 380;       // 外圈半径，可以自己调整
  const segments = 40;      // 用多少块拼一圈，越多越圆，性能稍微差一点
  const thickness = 20; 
  
  for (let i = 0; i < segments; i++) {
    const angle = map(i, 0, segments, 0, TWO_PI);   // 如果只要半圆可以改区间

    const x = center.x + cos(angle) * radius;
    const y = center.y + sin(angle) * radius;

    // 每块小砖块沿着圆周摆放
    let wall = new Block(
      world,
      {
        x: x,
        y: y,
        w: thickness,
        h: 40,           // 每块砖的长度；圆越大可以适当调大
        color: 'white'   // 先画出来看位置，之后可以改成透明逻辑
      },
      {
        isStatic: true,
        angle: angle + HALF_PI   // 让砖块的长边朝向圆心切线
      }
    );

    ringBlocks.push(wall);

      // config wrap area
  const wrap = {
    min: { x: 0, y: 0 },
    max: { x: width, y: height }
  };
  }

  // handles of the clock
  handSec = new Block(world, { w: 5, h: 300, x: center.x, y: center.y - 150, color: 'white' }, { isStatic: true });
  handMin = new Block(world, { w: 10, h: 250, x: center.x, y: center.y - 125, color: 'white' }, { isStatic: true });
  handHour = new Block(world, { w: 15, h: 200, x: center.x, y: center.y - 100, color: 'white' }, { isStatic: true });

  // add a mouse to manipulate Matter objects
  mouse = new Mouse(engine, canvas, { stroke: 'magenta', strokeWeight: 2 });

  // run the engine
  Matter.Runner.run(engine);
}

function draw() {
  background('black');

  const angleMin = map(minute(), 0, 60, 0, TWO_PI);
  const angleHour = map(hour(), 0, 12, 0, TWO_PI);

  handMin.rotate(angleMin, { x: center.x, y: center.y });
  handHour.rotate(angleHour, { x: center.x, y: center.y });

  handMin.draw();
  handHour.draw();

  // 画外圈物理边界
  for (let wall of ringBlocks) {
    wall.draw();
  }

  // 里面的随机方块
  for (let box of boxes) {
    box.draw();
  }

  mouse.draw();
}

