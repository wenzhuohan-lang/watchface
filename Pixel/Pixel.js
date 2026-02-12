const Engine = Matter.Engine;
const Runner = Matter.Runner;
const World = Matter.World;
const Events = Matter.Events;
const Bodies = Matter.Bodies;

// the Matter engine to animate the world
let engine, runner, world, mouse;
let isDrag = false;
const dim = { w: 960, h: 960 };
// 统一逻辑帧尺寸，画布按容器缩放以适配手机
const FRAME_SIZE = dim.w;
let off = { x: 0, y: 0 };
let blocks = [];
let testBall, canvasElem;
const testColor = 'red';
const collideWith = 'Hitter';

// Varibalen für fallende Pixel
let pinkBlocks = [];
let pinkPositions = [];
let pixelSpawnInterval;
let isSpawningActive = true;

let isShaking = false;
let shakeAngle = 0;
let shakeDirection = 1;
let shakeIntensity = 0;
let topOfFrame = 0;

// collisionFilter: {group: 0x00, category: 0b0000 0000 0000 0001, mask: 0b1111 1111 1111 1111}
// collision of A and B: group > 0 && groupA == groupB          ,
// no collision of A and B: group < 0 && groupA == groupB
// groupA != groupB:
// collision of A and B ? (categoryA & maskB) !== 0 && (categoryB & maskA) !== 0
const cfM = { group: 0, category: 0x0002, mask: 0x0021 };
const cfX = { group: 0, category: 0x0004, mask: 0xffff };

const digits = {
    0: [
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    1: [
        [0, 0, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [1, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    2: [
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [0, 0, 0, 1, 1],
        [0, 0, 1, 1, 0],
        [0, 1, 1, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0]
    ],
    3: [
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [0, 0, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    4: [
        [0, 0, 1, 1, 0],
        [0, 1, 1, 1, 0],
        [1, 1, 1, 1, 0],
        [1, 0, 1, 1, 0],
        [1, 1, 1, 1, 1],
        [0, 0, 1, 1, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    5: [
        [1, 1, 1, 1, 1],
        [1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0],
        [1, 1, 1, 1, 0],
        [0, 0, 0, 1, 1],
        [0, 0, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    6: [
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 0, 0],
        [1, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    7: [
        [1, 1, 1, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 0, 0, 1, 1],
        [0, 0, 1, 1, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0]
    ],
    8: [
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ],
    9: [
        [0, 1, 1, 1, 0],
        [1, 1, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 1],
        [0, 0, 0, 1, 1],
        [0, 0, 0, 1, 1],
        [1, 1, 0, 1, 1],
        [0, 1, 1, 1, 0],
        [0, 0, 0, 0, 0]
    ]
};

const colon = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
    [0, 1, 0],
    [0, 0, 0],
    [0, 0, 0]
];

const setCollide = (cfA, cfB, on) => {
    cfA.mask = on ? cfA.mask | cfB.category : cfA.mask & (~cfB.category & 0xff);
    // console.log(cfA.mask.toString(2))
};
const doesCollide = (cfA, cfB) => {
    return (cfA.mask & cfB.category) !== 0 && (cfB.mask & cfA.category) !== 0;
};

function shouldBeBlack(col, row) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeString = hours + minutes;

    const digitWidth = 5;
    const digitHeight = 9;
    const digitSpacing = 1;
    const colonWidth = 3;

    const totalWidth = 4 * digitWidth + colonWidth + 4 * digitSpacing;
    const startCol = Math.floor((32 - totalWidth) / 2) + 1;
    const startRow = 13

    const positions = [
        { char: 0, col: startCol },
        { char: 1, col: startCol + 1 * (digitWidth + digitSpacing) },
        { char: ':', col: startCol + 2 * (digitWidth + digitSpacing) },
        { char: 2, col: startCol + 2 * (digitWidth + digitSpacing) + colonWidth + digitSpacing },
        { char: 3, col: startCol + 3 * (digitWidth + digitSpacing) + colonWidth + digitSpacing }
    ];

    for (let pos of positions) {
        const width = pos.char === ':' ? colonWidth : digitWidth;
        const pattern = pos.char === ':' ? colon : digits[timeString[pos.char]];

        if (col >= pos.col && col < pos.col + width &&
            row >= startRow && row < startRow + digitHeight) {

            const localCol = col - pos.col;
            const localRow = row - startRow;

            if (pattern[localRow] && pattern[localRow][localCol] === 1) {
                return true;
            }
        }
    }
    return false;
}

function preload() { }

function setup() {
    // This setup code is intended as "DON'T TOUCH IT"
    // If you really need to change it, please talk with Benno first.
    canvasElem = document.getElementById('thecanvas');
    // 创建逻辑尺寸为 960x960 的画布，视觉上通过容器缩放适配手机
    let canvas = createCanvas(FRAME_SIZE, FRAME_SIZE);
    canvas.parent('thecanvas');

    // 限制像素密度，提升移动端性能
    try {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        pixelDensity(dpr);
    } catch (e) {}

    function fitCanvas() {
        // 使用 90% 视口，避免与安全区/手势冲突
        const vw = window.innerWidth * 0.9;
        const vh = window.innerHeight * 0.9;
        const scale = Math.min(vw / FRAME_SIZE, vh / FRAME_SIZE, 1);

        if (canvasElem) {
            const w = Math.floor(FRAME_SIZE * scale);
            const h = Math.floor(FRAME_SIZE * scale);
            canvasElem.style.width = w + 'px';
            canvasElem.style.height = h + 'px';
            // 隐藏静态占位 canvas，避免与 p5 画布叠加
            const placeholder = canvasElem.querySelector('#canvas');
            if (placeholder) {
                placeholder.style.display = 'none';
            }
        }
        if (canvas && canvas.elt) {
            canvas.elt.style.width = '100%';
            canvas.elt.style.height = '100%';
            canvas.elt.style.display = 'block';
        }
    }

    fitCanvas();
    window.addEventListener('resize', fitCanvas);

    engine = Engine.create();
    runner = Runner.create({ isFixed: true, delta: 1000 / 60 });
    world = engine.world;

    // The Mouse is just a useful helper during the development phase
    /*mouse = new Mouse(engine, canvas, { stroke: 'blue', strokeWeight: 3 });*/
    // Matter.Mouse.setScale(mouse.mouse, {x: 0.75, y: 0.75});

    // You can also add test elements into the scene
    /*mouse.on('startdrag', (evt) => {
        isDrag = true;
    });*/
    /*mouse.on('mouseup', (evt) => {
        if (!isDrag) {
            addTestBall({ x: evt.mouse.position.x, y: evt.mouse.position.y }, testColor, cfM);
        }
        isDrag = false;
    });*/

    // Register when a "Hitter" object collides with something and
    // then trigger the 'collideWith' function on the hit object
    Events.on(engine, 'collisionStart', function (event) {
        var pairs = event.pairs;
        pairs.forEach((pair, i) => {
            if (pair.bodyA.label == 'Hitter') {
                pair.bodyA.plugin.block.collideWith(pair.bodyB.plugin.block);
            }
            if (pair.bodyB.label == 'Hitter') {
                pair.bodyB.plugin.block.collideWith(pair.bodyA.plugin.block);
            }
        });
    });

    Events.on(engine, 'collisionActive', function (event) {
        var pairs = event.pairs;
        pairs.forEach((pair, i) => {
            if (pair.bodyA.label == 'Hitter' && pair.bodyB.label == 'Active') {
                pair.bodyA.plugin.block.collideWith(pair.bodyB.plugin.block);
            }
            if (pair.bodyB.label == 'Hitter' && pair.bodyA.label == 'Active') {
                pair.bodyB.plugin.block.collideWith(pair.bodyA.plugin.block);
            }
        });
    });

    createScene();
    // Start the Matter runner: physics will be simulated
    Runner.run(runner, engine);
}

function createScene() {
    console.log("TEST Position (1,11):", shouldBeBlack(1, 11));
    console.log("TEST Position (15,13):", shouldBeBlack(15, 13));
    console.log();

    /*new BlocksFromSVG(
        world,
        'clockSquare.svg',
        blocks,
        { isStatic: true, restitution: 0.0, friction: 0.0, frictionAir: 0.0 },
        {
            save: false,
            sample: 40,
            offset: { x: 1500, y: 1000 },
            done: (added, time, fromCache) => {
                console.log('FRAME', added, time, fromCache);
            }
        }
    );*/

    const anzahl = 32;
    const rechteckBreite = 28;
    const rechteckHöhe = 28;
    const abstand = 1;
    const startPos = 0;

    // Uhrzeit Pixel erstellen 
    for (let row = 0; row < anzahl; row++) {
        for (let col = 0; col < anzahl; col++) {
            const isBlack = shouldBeBlack(col, row);

            if (isBlack) {
                const block = new Block(
                    world,
                    {
                        x: startPos + col * (rechteckBreite + abstand) + 14,
                        y: startPos + row * (rechteckHöhe + abstand),
                        w: rechteckBreite,
                        h: rechteckHöhe,
                        color: '#4169E1'
                    },
                    { isStatic: true }
                );
                blocks.push(block);
            } else {

                pinkPositions.push({
                    col: col,
                    row: row,
                    x: startPos + col * (rechteckBreite + abstand),
                    y: startPos + row * (rechteckHöhe + abstand)
                });
            }
        }
    }

    console.log(`Gespeicherte pinke Positionen: ${pinkPositions.length}`);

    // Pixel-Spawn-System starten
    startPixelSpawning();
}

/*function addTestBall(point, color, filter) {
    const ball = new Ball(
        world,
        { x: point.x, y: point.y, r: 30, color: color },
        {
            label: 'Hitter',
            restitution: 0.8,
            friction: 0.0,
            frictionAir: 0.0,
            isStatic: false,
            density: 0.001,
            collisionFilter: filter
        }
    );
    blocks.push(ball);
    return ball;
}*/

function scrollEndless(point) {
    // wohin muss verschoben werden damit point wenn möglich in der Mitte bleibt
    off = { x: Math.min(Math.max(0, point.x - window.innerWidth / 2), dim.w - window.innerWidth), y: Math.min(Math.max(0, point.y - window.innerHeight / 2), dim.h - window.innerHeight) };
    // plaziert den Canvas im aktuellen Viewport
    canvasElem.style.left = Math.round(off.x) + 'px';
    canvasElem.style.top = Math.round(off.y) + 'px';
    // korrigiert die Koordinaten
    translate(-off.x, -off.y);
    // verschiebt den ganzen Viewport
    window.scrollTo(off.x, off.y);
    /*mouse.setOffset(off);*/
}

function draw() {
    clear();

    // ===== SHAKE-CHECK JEDEN FRAME =====
    checkForStackOverflow();  // <-- Ohne if-Bedingung!

    // ===== CLEANUP GEFALLENE PIXEL =====
    cleanupFallenPixels();

    // Weißer Hintergrund
    background(0);

    // Schwarzes Rechteck für den Frame
    fill(0);
    noStroke();
    rect(0, 0, FRAME_SIZE, FRAME_SIZE);

    // Rote Linie um den Frame 
    /*noFill();
    stroke(255, 0, 0);
    strokeWeight(2);
    rect(100, 100, 960, 960);
    noStroke();*/

    /*
    stroke(255, 0, 0);
    strokeWeight(3);
    line(100, topOfFrame, 1060, topOfFrame);
    noStroke();*/

    // ===== CLIPPING: Nur innerhalb des Frames zeichnen =====
    push();
    drawingContext.save();
    drawingContext.beginPath();
    drawingContext.rect(0, 0, FRAME_SIZE, FRAME_SIZE);
    drawingContext.clip();

    blocks.forEach((block) => block.draw());

    drawingContext.restore();
    pop();

    //mouse.draw();
}

// Pixel Spawn System 

function startPixelSpawning() {

    pixelSpawnInterval = setInterval(() => {
        spawnRandomPixels(16);

        // Optional: Stoppen wenn alle Positionen aufgebraucht sind
        if (pinkPositions.length === 0) {
            clearInterval(pixelSpawnInterval);
        }
    }, 1000); // Jede Sekunde
}

function spawnRandomPixels(count) {
    if (!isSpawningActive) return;

    for (let i = 0; i < count; i++) {
        if (pinkPositions.length === 0) break;

        const randomIndex = Math.floor(Math.random() * pinkPositions.length);
        const pos = pinkPositions[randomIndex];


        const randomY = -150 - Math.random() * 50;

        const block = new Block(
            world,
            {
                x: pos.x + 14,
                y: randomY,  // Zufällig zwischen 150-200
                w: 28,
                h: 28,
                color: '#white'
            },
            {
                isStatic: false,
                restitution: 0.0,
                friction: 0.5,
                frictionAir: 0.0,
                density: 0.001
            }
        );

        block.originalPosition = { x: pos.x, y: pos.y };
        block.framesAtTop = 0;
        blocks.push(block);
        pinkBlocks.push(block);

        pinkPositions.splice(randomIndex, 1);
    }
}

function checkForStackOverflow() {
    pinkBlocks.forEach(block => {
        const isAtTop = block.body.position.y < topOfFrame + 14;
        const isAlmostStill = Math.abs(block.body.velocity.y) < 2.0;

        // Wenn Pixel gelandet ist, mache es statisch (eingefroren)
        if (!block.body.isStatic && block.body.position.y >= 0 && isAlmostStill) {
            Matter.Body.setStatic(block.body, true); // <-- Pixel einfrieren!

            const index = pinkBlocks.indexOf(block);
            if (index > -1) {
                pinkBlocks.splice(index, 1);
            }
        }

        if (!block.body.isStatic && isAtTop && isAlmostStill) {
            block.framesAtTop = (block.framesAtTop || 0) + 1;

            if (block.framesAtTop > 30 && !isShaking) {
                console.log('🔥 TRIGGER!');


                isSpawningActive = false;
                clearInterval(pixelSpawnInterval);
                pinkPositions = [];
                console.log('⏸️ Pixel-Spawning SOFORT gestoppt!');

                // Entferne nur noch fallende Pixel 
                for (let i = pinkBlocks.length - 1; i >= 0; i--) {
                    const pinkBlock = pinkBlocks[i];
                    if (pinkBlock.body && !pinkBlock.body.isStatic) {
                        World.remove(world, pinkBlock.body);
                        const blockIndex = blocks.indexOf(pinkBlock);
                        if (blockIndex > -1) {
                            blocks.splice(blockIndex, 1);
                        }
                        pinkBlocks.splice(i, 1);
                    }
                }
                console.log('🗑️ Fallende weiße Pixel entfernt!');

                disintegrateDigits();
                isShaking = true;

                setTimeout(() => {
                    isShaking = false;
                }, 5000);
            }
        }
    });
}

function disintegrateDigits() {
    console.log('💥 Ziffern zerfallen in Pixel!');

    /*// STOPPE das Pixel-Spawning!
    clearInterval(pixelSpawnInterval);
    console.log('⏸️ Pixel-Spawning gestoppt!');

    pinkPositions = [];*/

    // Finde alle weißen Ziffern-Blöcke
    const digitBlocks = blocks.filter(block => block.body && block.body.isStatic);

    digitBlocks.forEach(block => {
        // Mache Block beweglich (nicht mehr statisch)
        Matter.Body.setStatic(block.body, false);

        // Gib kleinen zufälligen Impuls
        Matter.Body.applyForce(
            block.body,
            block.body.position,
            {
                x: (Math.random() - 0.5) * 0.002,
                y: 0.001
            }
        );


        block.body.restitution = 0.0;
        block.body.friction = 1.0;
        block.body.density = 0.001;
    });

    // Nach 3 Sekunden: Alles aufräumen und neu starten
    setTimeout(() => {
        resetScene();
    }, 3000);
}

function resetScene() {
    console.log('🔄 Reset - Baue Szene neu auf!');

    // Entferne ALLE Blöcke
    blocks.forEach(block => {
        if (block.body) {
            World.remove(world, block.body);
        }
    });


    blocks = [];
    pinkBlocks = [];
    pinkPositions = [];


    isSpawningActive = true;


    createScene();
}

function cleanupFallenPixels() {
    // Entferne ALLE Pixel die unten aus dem Frame gefallen sind
    for (let i = blocks.length - 1; i >= 0; i--) {
        const block = blocks[i];

        if (block.body && !block.body.isStatic && block.body.position.y > FRAME_SIZE + 10) {
            // Entferne aus Physics World
            World.remove(world, block.body);

            // Entferne aus blocks Array
            blocks.splice(i, 1);

            // Falls es ein pink Block ist, auch aus pinkBlocks entfernen
            const pinkIndex = pinkBlocks.indexOf(block);
            if (pinkIndex > -1) {
                pinkBlocks.splice(pinkIndex, 1);
            }
        }
    }
}
