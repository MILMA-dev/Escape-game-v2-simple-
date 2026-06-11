import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// --- CONFIGURATION & ÉTAT ---
const CONFIG = {
    moveSpeed: 0.12,
    interactionDistance: 3.5,
    inventory: [],
    unlockedEnds: [],
};

// Accès sécurisé au localStorage
try {
    const saved = localStorage.getItem('escaped_ends');
    if (saved) CONFIG.unlockedEnds = JSON.parse(saved);
} catch (e) {
    console.warn("LocalStorage inaccessible:", e);
}

const gameState = {
    safeOpened: false,
    leverState: [false, false, false],
    gameEnded: false,
    startTime: Date.now(),
    audioEnabled: false,
};

const walls = [];

// --- INITIALISATION THREE.JS ---
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.12);

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 1.6, 0);

const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game-canvas'), antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
renderer.shadowMap.enabled = true;

// --- AUDIO (Robuste) ---
const listener = new THREE.AudioListener();
const ambientSound = new THREE.Audio(listener);
const audioLoader = new THREE.AudioLoader();

function initAudio() {
    if (gameState.audioEnabled) return;
    try {
        camera.add(listener);
        // Utilisation d'une URL plus permissive ou gestion silencieuse de l'échec
        audioLoader.load('https://actions.google.com/sounds/v1/ambiences/wind_on_the_lake.ogg', (buffer) => {
            ambientSound.setBuffer(buffer);
            ambientSound.setLoop(true);
            ambientSound.setVolume(0.1);
            ambientSound.play();
        }, undefined, (err) => {
            console.warn("Échec du chargement audio (CORS ou Réseau). Le jeu continue sans son.");
        });
    } catch (e) {
        console.warn("Initialisation audio échouée:", e);
    }
    gameState.audioEnabled = true;
}

// --- CONTRÔLES ---
const controls = new PointerLockControls(camera, document.body);
const keys = { z: false, q: false, s: false, d: false };

document.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = true;
    if (key === 'e') interact();
});

document.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key in keys) keys[key] = false;
});

// --- UI ---
const sidebar = document.getElementById('sidebar');
const inventoryList = document.getElementById('inventory-list');
const descText = document.getElementById('desc-text');
const interactionPrompt = document.getElementById('interaction-prompt');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-button');
const notification = document.getElementById('notification');

function isMobile() { return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 800; }

startBtn.addEventListener('click', () => {
    initAudio();
    overlay.classList.add('hidden');
    if (!isMobile()) {
        try {
            controls.lock();
        } catch (e) {
            console.warn("Pointer lock refusé");
        }
    }
});

controls.addEventListener('unlock', () => {
    if (sidebar.classList.contains('hidden') && !gameState.gameEnded) {
        overlay.classList.remove('hidden');
    }
});

document.getElementById('open-sidebar').onclick = () => { sidebar.classList.remove('hidden'); if (!isMobile()) controls.unlock(); };
document.getElementById('toggle-sidebar').onclick = () => { sidebar.classList.add('hidden'); if (!isMobile() && !gameState.gameEnded) controls.lock(); };

// --- ENVIRONNEMENT ---
const wallMat = new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.9 });
const floorMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
const ceilingMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 1 });

function createWall(w, h, pos, rot, isPhysical = true) {
    const geo = new THREE.PlaneGeometry(w, h);
    const wall = new THREE.Mesh(geo, wallMat);
    wall.position.set(pos.x, pos.y, pos.z);
    wall.rotation.set(rot.x, rot.y, rot.z);
    wall.receiveShadow = true;
    scene.add(wall);
    if (isPhysical) {
        const colGeo = new THREE.BoxGeometry(w, h, 0.1);
        const colMesh = new THREE.Mesh(colGeo, new THREE.MeshBasicMaterial({ visible: false }));
        colMesh.position.copy(wall.position);
        colMesh.rotation.copy(wall.rotation);
        scene.add(colMesh);
        walls.push(colMesh);
    }
}

function createRoom(name, w, d, pos, openings = {}) {
    const h = 4;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(w, d), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(pos.x, pos.y, pos.z);
    floor.receiveShadow = true;
    scene.add(floor);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(w, d), ceilingMat);
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(pos.x, pos.y + h, pos.z);
    scene.add(ceil);
    if (!openings.n) createWall(w, h, { x: pos.x, y: pos.y + h/2, z: pos.z - d/2 }, { x: 0, y: 0, z: 0 });
    if (!openings.s) createWall(w, h, { x: pos.x, y: pos.y + h/2, z: pos.z + d/2 }, { x: 0, y: Math.PI, z: 0 });
    if (!openings.e) createWall(d, h, { x: pos.x + w/2, y: pos.y + h/2, z: pos.z }, { x: 0, y: -Math.PI/2, z: 0 });
    if (!openings.w) createWall(d, h, { x: pos.x - w/2, y: pos.y + h/2, z: pos.z }, { x: 0, y: Math.PI/2, z: 0 });
}

createRoom('Cellule', 6, 6, { x: 0, y: 0, z: 0 }, { n: true });
createRoom('Couloir', 4, 15, { x: 0, y: 0, z: -10.5 }, { s: true, n: true, e: true, w: true });
createRoom('Bureau', 8, 8, { x: 6, y: 0, z: -10.5 }, { w: true });
createRoom('Sous-sol', 10, 10, { x: -7, y: 0, z: -10.5 }, { e: true });

const hintCanvas = document.createElement('canvas');
const ctx = hintCanvas.getContext('2d');
hintCanvas.width = 256; hintCanvas.height = 64;
ctx.fillStyle = "rgba(100,0,0,0.4)";
ctx.font = "30px Courier New";
ctx.fillText("CODE: 1984", 10, 40);
const hintTex = new THREE.CanvasTexture(hintCanvas);
const hintMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.4), new THREE.MeshBasicMaterial({ map: hintTex, transparent: true }));
hintMesh.position.set(1.9, 1.8, -10);
hintMesh.rotation.y = -Math.PI/2;
scene.add(hintMesh);

const cellLight = new THREE.PointLight(0xffaa66, 0.6, 10);
cellLight.position.set(0, 3, 0);
scene.add(cellLight);

const basementLight = new THREE.PointLight(0xff0000, 0.4, 10);
basementLight.position.set(-7, 3, -10.5);
scene.add(basementLight);

// --- OBJETS ---
function createObject(name, desc, pos, type = 'item', color = 0xffffff, size = 0.3) {
    const geo = new THREE.BoxGeometry(size, size, size);
    const mat = new THREE.MeshStandardMaterial({ color: color });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(pos.x, pos.y, pos.z);
    mesh.userData = { interactable: true, type, name, description: desc };
    scene.add(mesh);
    return mesh;
}

createObject('Clé en Argent', 'Ouvre le bureau.', { x: 2, y: 0.2, z: 2 }, 'item', 0xaaaaaa);
createObject('Lampe de Poche', 'Pour éclairer les ténèbres.', { x: -2, y: 0.2, z: -12 }, 'item', 0x333333);
createObject('Poupée Maudite', 'Ses yeux semblent bouger.', { x: -7, y: 0.2, z: -14 }, 'item', 0xffaaaa);
createObject('Vieux Couteau', 'Encore tranchant.', { x: 6, y: 0.2, z: -14 }, 'item', 0x888888);
createObject('Journal Déchiré', 'Parle d\'une "huitième fin".', { x: 8, y: 0.2, z: -7 }, 'item', 0xffffcc);

const officeDoor = createObject('Porte de Bureau', 'Verrouillée.', { x: 2.1, y: 1.5, z: -10.5 }, 'door', 0x331100);
officeDoor.scale.set(0.1, 3, 1.5);
officeDoor.userData.onInteract = () => {
    if (hasItem('Clé en Argent')) { showNotification("Bureau ouvert."); scene.remove(officeDoor); }
    else showNotification("Il faut la clé en argent.");
};

const safe = createObject('Coffre', 'À code.', { x: 9, y: 0.5, z: -13 }, 'safe', 0x222222);
safe.userData.onInteract = () => {
    if (gameState.safeOpened) return;
    const code = prompt("Code ?");
    if (code === "1984") {
        showNotification("Coffre ouvert !");
        gameState.safeOpened = true;
        addToInventory('Pilule Étrange', 'Effet inconnu.');
    } else { showNotification("Code erroné."); }
};

[ {x:-11.5, z:-10}, {x:-11.5, z:-12}, {x:-11.5, z:-8} ].forEach((pos, i) => {
    const l = createObject(`Levier ${i+1}`, 'Actionnable.', { x: pos.x, y: 1.5, z: pos.z }, 'lever', 0x444444);
    l.userData.onInteract = () => {
        gameState.leverState[i] = !gameState.leverState[i];
        l.rotation.x = gameState.leverState[i] ? 0.5 : 0;
        if (gameState.leverState[0] && gameState.leverState[2] && !gameState.leverState[1]) {
            showNotification("Un bruit sourd...");
            createObject('Clé du Destin', 'Mystérieuse.', { x: 0, y: 0.5, z: -10 }, 'item', 0xff00ff);
        }
    };
});

const finalDoor = createObject('SORTIE', 'Porte finale.', { x: 0, y: 1.5, z: -17.8 }, 'exit', 0x004400);
finalDoor.scale.set(2, 3, 0.1);
finalDoor.userData.onInteract = () => calculateEnding();

// --- LOGIQUE FINS ---
function calculateEnding() {
    const inv = CONFIG.inventory.map(i => i.name);
    const time = (Date.now() - gameState.startTime) / 1000;
    let id = 1, title = "L'ÉVASION", msg = "Vous êtes libre, mais hanté.";
    if (inv.includes('Poupée Maudite') && inv.includes('Pilule Étrange')) { id = 2; title = "LE CAUCHEMAR"; msg = "C'était un rêve ?"; }
    else if (inv.includes('Vieux Couteau') && !inv.includes('Lampe de Poche')) { id = 3; title = "LA FOLIE"; msg = "Perdu dans le noir."; }
    else if (inv.includes('Clé du Destin') && inv.includes('Journal Déchiré')) { id = 4; title = "LA VÉRITÉ"; msg = "C'est une simulation."; }
    else if (time < 60) { id = 5; title = "L'ANOMALIE"; msg = "Trop rapide."; }
    else if (inv.length === 0) { id = 6; title = "L'OUBLI"; msg = "Rien emporté."; }
    else if (inv.includes('Pilule Étrange')) { id = 7; title = "L'ASCENSION"; msg = "Esprit libéré."; }
    else if (inv.length >= 5) { id = 8; title = "LE MAÎTRE"; msg = "Tout trouvé."; }
    triggerEnd(title, msg, id);
}

function triggerEnd(title, msg, id) {
    gameState.gameEnded = true;
    if (!CONFIG.unlockedEnds.includes(id)) {
        CONFIG.unlockedEnds.push(id);
        try { localStorage.setItem('escaped_ends', JSON.stringify(CONFIG.unlockedEnds)); } catch(e){}
    }
    document.getElementById('end-title').textContent = title;
    document.getElementById('end-message').textContent = `${msg} (Fin ${id}/8)`;
    document.getElementById('end-screen').classList.remove('hidden');
    controls.unlock();
}

document.getElementById('restart-button').onclick = () => location.reload();

// --- LOGIQUE GÉNÉRALE ---
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
let interactableObject = null;
function hasItem(name) { return CONFIG.inventory.some(i => i.name === name); }
function addToInventory(name, desc) {
    if (hasItem(name)) return;
    CONFIG.inventory.push({ name, desc });
    const div = document.createElement('div');
    div.className = 'inventory-item';
    div.textContent = name;
    div.onclick = () => { descText.textContent = desc; document.querySelectorAll('.inventory-item').forEach(el => el.classList.remove('selected')); div.classList.add('selected'); };
    inventoryList.appendChild(div);
}

function showNotification(text) { notification.textContent = text; notification.style.display = 'block'; setTimeout(() => { notification.style.display = 'none'; }, 3000); }

function interact() {
    if (interactableObject) {
        const data = interactableObject.userData;
        if (data.type === 'item') { addToInventory(data.name, data.description); scene.remove(interactableObject); showNotification(`Acquis : ${data.name}`); }
        else if (data.onInteract) data.onInteract();
    }
}

function checkCollision(nextPos) {
    const playerRadius = 0.4;
    for (let wall of walls) {
        const box = new THREE.Box3().setFromObject(wall);
        box.expandByScalar(playerRadius);
        if (box.containsPoint(nextPos)) return true;
    }
    return false;
}

function animate() {
    requestAnimationFrame(animate);
    if ((controls.isLocked || (isMobile() && sidebar.classList.contains('hidden'))) && !gameState.gameEnded) {
        const dir = new THREE.Vector3();
        const fv = new THREE.Vector3(0, 0, Number(keys.s) - Number(keys.z));
        const sv = new THREE.Vector3(Number(keys.q) - Number(keys.d), 0, 0);
        if (isMobile() && window.joystickMove) { fv.z = window.joystickMove.y / 50; sv.x = -window.joystickMove.x / 50; }
        dir.subVectors(fv, sv).normalize().multiplyScalar(CONFIG.moveSpeed).applyQuaternion(camera.quaternion);
        dir.y = 0;
        const nextPos = camera.position.clone().add(dir);
        if (!checkCollision(nextPos)) camera.position.copy(nextPos);
        camera.position.y = 1.6;
    }
    raycaster.setFromCamera(pointer, camera);
    const intersects = raycaster.intersectObjects(scene.children);
    interactableObject = null;
    let found = false;
    for (let intersect of intersects) {
        if (intersect.distance < CONFIG.interactionDistance && intersect.object.userData?.interactable) {
            interactableObject = intersect.object;
            interactionPrompt.style.display = 'block';
            found = true;
            break;
        }
    }
    if (!found) interactionPrompt.style.display = 'none';
    cellLight.intensity = 0.5 + Math.random() * 0.2;
    renderer.render(scene, camera);
}

// --- MOBILE ---
if (isMobile()) {
    const jb = document.getElementById('joystick-base'), jk = document.getElementById('joystick-knob');
    window.joystickMove = { x: 0, y: 0 };
    let moveStart = { x: 0, y: 0 }, lookStart = { x: 0, y: 0 };
    const euler = new THREE.Euler(0, 0, 0, 'YXZ');
    document.addEventListener('touchstart', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.clientX < window.innerWidth / 2) {
                moveStart = { x: touch.clientX, y: touch.clientY };
                jb.style.display = 'block';
                jb.style.left = `${moveStart.x - 50}px`; jb.style.top = `${moveStart.y - 50}px`;
            } else lookStart = { x: touch.clientX, y: touch.clientY };
        }
    });
    document.addEventListener('touchmove', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.clientX < window.innerWidth / 2) {
                const dx = touch.clientX - moveStart.x, dy = touch.clientY - moveStart.y;
                const d = Math.sqrt(dx*dx + dy*dy), m = 50;
                const rx = dx * Math.min(1, m/d), ry = dy * Math.min(1, m/d);
                window.joystickMove = { x: rx, y: ry };
                jk.style.transform = `translate(${rx}px, ${ry}px)`;
            } else {
                const dx = touch.clientX - lookStart.x, dy = touch.clientY - lookStart.y;
                lookStart = { x: touch.clientX, y: touch.clientY };
                euler.setFromQuaternion(camera.quaternion);
                euler.y -= dx * 0.005; euler.x -= dy * 0.005;
                euler.x = Math.max(-Math.PI/2, Math.min(Math.PI/2, euler.x));
                camera.quaternion.setFromEuler(euler);
            }
        }
    });
    document.addEventListener('touchend', (e) => {
        for (let touch of e.changedTouches) {
            if (touch.clientX < window.innerWidth / 2) {
                window.joystickMove = { x: 0, y: 0 }; jb.style.display = 'none';
            }
        }
    });
}

window.onresize = () => { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); };
animate();
