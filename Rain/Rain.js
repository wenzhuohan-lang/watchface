const Engine = Matter.Engine;
const Runner = Matter.Runner;
const World = Matter.World;
const Events = Matter.Events;
const Bodies = Matter.Bodies;

// the Matter engine to animate the world
let engine, runner, world, mouse;
let isDrag = false;
const dim = { w: 960, h: 960 };
let off = { x: 0, y: 0 };
let blocks = [];
let testBall, canvasElem;
const testColor = 'red';
const collideWith = 'Hitter';

// Varibalen für magentische Blasen
let pinkBlocks = [];
let pixelSpawnInterval;
const MAX_BLASEN = Infinity;
const BUBBLE_LIFETIME = 125;

// collisionFilter: {group: 0x00, category: 0b0000 0000 0000 0001, mask: 0b1111 1111 1111 1111}
const cfM = { group: 0, category: 0x0002, mask: 0x0021 };
const cfX = { group: 0, category: 0x0004, mask: 0xffff };

const digits = {
    0: [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    1: [
        [0, 0, 1, 1, 0, 0],
        [0, 1, 1, 1, 0, 0],
        [1, 1, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [1, 1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0, 0]
    ],
    2: [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [0, 0, 0, 0, 1, 1],
        [0, 0, 0, 1, 1, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 1, 1, 0, 0, 0],
        [1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 1],
        [0, 0, 0, 0, 0, 0]
    ],
    3: [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [0, 0, 0, 0, 1, 1],
        [0, 0, 1, 1, 1, 0],
        [0, 0, 1, 1, 1, 0],
        [0, 0, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    4: [
        [0, 0, 0, 1, 1, 0],
        [0, 0, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 1, 1, 0],
        [1, 1, 1, 1, 1, 1],
        [0, 0, 0, 1, 1, 0],
        [0, 0, 0, 1, 1, 0],
        [0, 0, 0, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    5: [
        [1, 1, 1, 1, 1, 1],
        [1, 1, 0, 0, 0, 0],
        [1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 1, 1],
        [0, 0, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    6: [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 0, 0],
        [1, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    7: [
        [1, 1, 1, 1, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 0, 0, 0, 1, 1],
        [0, 0, 0, 1, 1, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 1, 1, 0, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    8: [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
    ],
    9: [
        [0, 1, 1, 1, 1, 0],
        [1, 1, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 1],
        [0, 0, 0, 0, 1, 1],
        [0, 0, 0, 0, 1, 1],
        [1, 1, 0, 0, 1, 1],
        [0, 1, 1, 1, 1, 0],
        [0, 0, 0, 0, 0, 0]
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

function shouldBeBlack(col, row) {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const timeString = hours + minutes;

    const digitWidth = 6;
    const digitHeight = 9;
    const digitSpacing = 1;
    const colonWidth = 3;

    const totalWidth = 4 * digitWidth + colonWidth + 4 * digitSpacing;
    const startCol = Math.floor((32 - totalWidth) / 2) + 1;
    const startRow = Math.floor((32 - digitHeight) / 2) + 1;

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
    console.log(windowWidth, windowHeight);
    canvasElem = document.getElementById('thecanvas');
    let canvas = createCanvas(windowWidth, windowHeight);
    canvas.parent('thecanvas');

    engine = Engine.create();
    runner = Runner.create({ isFixed: true, delta: 1000 / 60 });
    world = engine.world;

    /*mouse = new Mouse(engine, canvas, { stroke: 'blue', strokeWeight: 3 });*/

    /*mouse.on('startdrag', (evt) => {
        isDrag = true;
    });*/
    /*mouse.on('mouseup', (evt) => {
        if (!isDrag) {
            addTestBall({ x: evt.mouse.position.x, y: evt.mouse.position.y }, testColor, cfM);
        }
        isDrag = false;
    });*/

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
    Runner.run(runner, engine);
}

function createScene() {
    console.log();

    // Keine Schwerkraft 
    engine.world.gravity.y = 0;

    new BlocksFromSVG(
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
    );

    const anzahl = 32;
    const rechteckBreite = 28;
    const rechteckHöhe = 28;
    const abstand = 2;
    const startPos = 0;

    // Ziffern als Magneten erstellen
    const digitMagnets = [];

    for (let row = 0; row < anzahl; row++) {
        for (let col = 0; col < anzahl; col++) {
            const isBlack = shouldBeBlack(col, row);

            if (isBlack) {
                const x = startPos + col * (rechteckBreite + abstand);
                const y = startPos + row * (rechteckHöhe + abstand);

                // Magnet erstellen
                const magnet = new Magnet(
                    world,
                    {
                        x: x,
                        y: y,
                        r: rechteckBreite / 2,
                        color: 'white',
                        attraction: 0.8e-5
                    },
                    { isStatic: true }
                );

                blocks.push(magnet);
                digitMagnets.push(magnet);
            }
        }
    }

    // Speichere Magneten global 
    window.digitMagnets = digitMagnets;

    console.log(`Ziffern erstellt: ${blocks.length}`);

    createInvisibleGround();
    startPixelSpawning();
}

function createInvisibleGround() {
    const frameStart = 0;
    const frameSize = 960;
    const wallThickness = 50;

    // Boden
    const ground = Bodies.rectangle(
        frameStart + frameSize / 2,
        frameStart + frameSize + wallThickness / 2,
        frameSize + wallThickness * 2,
        wallThickness,
        {
            isStatic: true,
            friction: 0.5,
            restitution: 0.2,
            collisionFilter: {
                category: 0x0004,
                mask: 0xFFFF
            }
        }
    );

    // Links
    const leftWall = Bodies.rectangle(
        frameStart - wallThickness / 2,
        frameStart + frameSize / 2,
        wallThickness,
        frameSize + wallThickness * 2,
        {
            isStatic: true,
            friction: 0.5,
            restitution: 0.2,
            collisionFilter: {
                category: 0x0004,
                mask: 0xFFFF
            }
        }
    );

    // Rechts
    const rightWall = Bodies.rectangle(
        frameStart + frameSize + wallThickness / 2,
        frameStart + frameSize / 2,
        wallThickness,
        frameSize + wallThickness * 2,
        {
            isStatic: true,
            friction: 0.5,
            restitution: 0.2,
            collisionFilter: {
                category: 0x0004,
                mask: 0xFFFF
            }
        }
    );

    // Decke
    const ceiling = Bodies.rectangle(
        frameStart + frameSize / 2,
        frameStart - wallThickness / 2,
        frameSize + wallThickness * 2,
        wallThickness,
        {
            isStatic: true,
            friction: 0.5,
            restitution: 0.2,
            collisionFilter: {
                category: 0x0004,
                mask: 0xFFFF
            }
        }
    );

    World.add(world, [ground, leftWall, rightWall, ceiling]);
    console.log('Wände mit Bounce erstellt!');
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

function draw() {
    clear();

    // Schwarzer Hintergrund
    fill(0);
    noStroke();
    rect(0, 0, 960, 960);

    // Ziffern zeichnen
    if (window.digitMagnets) {
        window.digitMagnets.forEach(magnet => {
            magnet.draw();
        });
    }

    // Rote Linie um den Frame
    /*noFill();
    stroke(255, 0, 0); // Rot
    strokeWeight(2);
    rect(100, 100, 960, 960);
    noStroke();*/

    // Magnet System
    if (window.digitMagnets) {
        pinkBlocks.forEach(bubble => {
            let nearestMagnet = null;
            let minDistance = Infinity;

            window.digitMagnets.forEach(magnet => {
                const dx = magnet.body.position.x - bubble.body.position.x;
                const dy = magnet.body.position.y - bubble.body.position.y;
                const dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < minDistance) {
                    minDistance = dist;
                    nearestMagnet = magnet;
                }
            });

            // Nur bewegliche Blasen zum Magneten ziehen
            if (nearestMagnet && !bubble.body.isStatic) {
                nearestMagnet.attracted = [bubble.body];
                nearestMagnet.attract();

                // Wenn sehr nah → festkleben
                if (minDistance < 30) {
                    Matter.Body.setStatic(bubble.body, true);
                }
            }
        });
    }

    // Lebenszeit
    // Entferne Blasen, die ihre Lebenszeit überschritten haben
    for (let i = pinkBlocks.length - 1; i >= 0; i--) {
        const bubble = pinkBlocks[i];
        bubble.lifeTime = (bubble.lifeTime || 0) + 1;

        if (bubble.lifeTime > BUBBLE_LIFETIME) {
            console.log('⏱️ Blase nach 20 Sekunden entfernt');
            // Entferne aus Physics World
            World.remove(world, bubble.body);
            // Entferne aus blocks Array
            const blockIndex = blocks.indexOf(bubble);
            if (blockIndex > -1) {
                blocks.splice(blockIndex, 1);
            }
            // Entferne aus pinkBlocks Array
            pinkBlocks.splice(i, 1);
        }
    }

    // Blasen zeichnen 
    pinkBlocks.forEach((block) => {
        block.draw();
    });

    //mouse.draw();
}

// Spawn System

function startPixelSpawning() {
    pixelSpawnInterval = setInterval(() => {
        if (pinkBlocks.length < MAX_BLASEN) {
            spawnMagneticBubble();
        }
    }, 50);
}

function spawnMagneticBubble() {
    // Zufällige Seite (0=oben, 1=rechts, 2=unten, 3=links)
    const side = Math.floor(Math.random() < 0.5 ? 0 : 2);
    let spawnX, spawnY;

    switch (side) {
        case 0: // Oben
            spawnX = 20 + Math.random() * 920;
            spawnY = 10;
            break;
        case 1: // Rechts
            spawnX = 1050;
            spawnY = 120 + Math.random() * 840;
            break;
        case 2: // Unten
            spawnX = 20 + Math.random() * 920;
            spawnY = 950;
            break;
        case 3: // Links
            spawnX = 110;
            spawnY = 120 + Math.random() * 840;
            break;
    }

    const radius = Math.floor(Math.random() * 11) + 10;  // 10-20

    const ball = new Ball(
        world,
        {
            x: spawnX,
            y: spawnY,
            r: radius,
            color: '#4169E1',
        },
        {
            isStatic: false,
            restitution: 0.2,     // Bounce
            friction: 0.8,         // Reibung
            frictionStatic: 1.0,   //  statische Reibung
            density: 0.002,
            frictionAir: 0.0001       // Luftwiderstand
        }
    );

    ball.body.collisionFilter = {
        group: 0,
        category: 0x0002,
        mask: 0xFFFF  // Kollidiert mit allem
    };

    ball.isMagnetic = true;
    ball.lifeTime = 0;  // Lebenszeit-Counter startet bei 0

    blocks.push(ball);
    pinkBlocks.push(ball);
}