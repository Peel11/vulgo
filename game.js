const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const W = 960, H = 540;
canvas.width = W; canvas.height = H;

if (!ctx.roundRect) {
ctx.roundRect = function(x, y, w, h, r) {
if (typeof r === "number") r = [r, r, r, r];
const [tl, tr, br, bl] = r;
this.beginPath();
this.moveTo(x + tl, y);
this.lineTo(x + w - tr, y);
this.quadraticCurveTo(x + w, y, x + w, y + tr);
this.lineTo(x + w, y + h - br);
this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
this.lineTo(x + bl, y + h);
this.quadraticCurveTo(x, y + h, x, y + h - bl);
this.lineTo(x, y + tl);
this.quadraticCurveTo(x, y, x + tl, y);
this.closePath();
};
}

function resize() {
const s = Math.min(innerWidth / W, innerHeight / H);
canvas.style.width = W * s + "px"; canvas.style.height = H * s + "px";
}
resize(); addEventListener("resize", resize);

const GRAV = 0.55, FRIC = 0.82, SPD = 4.8, JUMP_V = -12, T = 40;
const keys = {};
addEventListener("keydown", e => { keys[e.code] = true; if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code)) e.preventDefault(); });
addEventListener("keyup", e => keys[e.code] = false);

let AC = null;
function getAC() { if (!AC) { try { AC = new AudioContext(); } catch(e) {} } return AC; }
function beep(f, d, tp="sine", v=0.12) {
const ac = getAC(); if (!ac) return;
const o = ac.createOscillator(), g = ac.createGain();
o.type = tp; o.frequency.value = f; g.gain.setValueAtTime(v, ac.currentTime);
g.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + d);
o.connect(g).connect(ac.destination); o.start(); o.stop(ac.currentTime + d);
}
function sfxCollect() { beep(523,.1); setTimeout(()=>beep(659,.1),80); setTimeout(()=>beep(784,.15),160); }
function sfxJump() { beep(300,.1,"triangle",.08); }
function sfxBounce() { beep(440,.08,"square",.06); setTimeout(()=>beep(550,.06,"square",.04),50); }

// â”€â”€ 80-col level â”€â”€  #=wall .=air B=baby P=spawn X=spring
const MAP = [
//  0         1         2         3         4         5         6         7
//  012345678901234567890123456789012345678901234567890123456789012345678901234567890
"################################################################################", // 0
"#..............................................................................#", // 1
"#..............................................................................#", // 2
"#.....B..........................................................B..............#", // 3
"#..............................................................................#", // 4
"#..............................................................................#", // 5
"#..............####............................................................#", // 6
"#..............#............####................................................#", // 7
"#............................#............####..................................#", // 8
"#...........................................#..................................#", // 9
"#...............####.........................#......####..........................#", // 10
"#..............................................#................................#", // 11
"#..B...............####.......####.............#.............####.................#", // 12
"#...............................#.............#..............#...................#", // 13
"#...............................#.............#..............#.....####..........#", // 14
"#...............................#.............#..............#.....#..............#", // 15
"#..P............####............#.............#..............#.....#..............#", // 16
"#...............#...............#.............#......#.......#.....#..............#", // 17
"#...............#...............#.............#......#.......#.....#..............#", // 18
"#...........................####.............#......#.......#.....#..............#", // 19
"#..#....X....####...............#.............#......#.......#.....#..............#", // 20
"#...........................#................#......#.......#.....#..............#", // 21
"#...........................#................#......#.......#.....#..............#", // 22
"#...........................#................#...........#.......#..............#", // 23
"#...........................####..............#...........#.......#..............#", // 24
"#................................####.........#...........#.......#.....####......#", // 25
"#................................#...........#...........#.......#.....#.........#", // 26
"#................................#...........#...........#.......#.....#.........#", // 27
"#...........................####..#...........#...........#.......#.....#.........#", // 28
"#................................#...........#...............#....#.....#.........#", // 29
"#................................#...........#...............#....#.....#.........#", // 30
"#...........................####.............#...............#....#.....#.........#", // 31
"#.........................#.............................................#...B....#", // 32
"#.........................#.............................................#...#....#", // 33
"#.........................#.............................................#...#....#", // 34
"#.........................####.......................................######......#", // 35
"#..............................................................................#", // 36
"#...........B.................................................................B.#", // 37
"#..............................................................................#", // 38
"################################################################################", // 39
];

const COLS = MAP[0].length, ROWS = MAP.length;
const WW = COLS * T, WH = ROWS * T;

function tileAt(c, r) { return (r >= 0 && r < ROWS && c >= 0 && c < COLS) ? MAP[r][c] === "#" : true; }
function pxAt(px, py) { return tileAt(Math.floor(px / T), Math.floor(py / T)); }

const platforms = [];
const springs = [];
const babySpots = [];
let spawn = { x: 2 * T, y: 15 * T };

for (let r = 0; r < ROWS; r++)
for (let c = 0; c < COLS; c++) {
const ch = MAP[r][c];
if (ch === "#") platforms.push({ x: c * T, y: r * T, w: T, h: T });
if (ch === "P") spawn = { x: c * T, y: r * T };
if (ch === "X") springs.push({ x: c * T, y: r * T, w: T, h: T / 2 });
if (ch === "B") babySpots.push({ x: c * T + T / 2, y: r * T + T / 2, found: false, anim: Math.random() * 6.28 });
}

console.log("Babies found:", babySpots.length);

const P = {
x: spawn.x, y: spawn.y, vx: 0, vy: 0, w: 24, h: 32,
gnd: false, face: 1, wf: 0, wt: 0, found: 0,
idle: 0, blinkT: 0, blink: false, tail: 0, hat: 0,
coyote: 0, jmpBuf: 0, wallDir: 0, wallJump: false,
_jh: false,
};

const cam = { x: 0, y: 0 };
const parts = [];
let winT = 0, state = "play";

const flies = Array.from({ length: 50 }, () => ({
x: Math.random() * WW, y: Math.random() * WH,
ph: Math.random() * 6.28, sp: 0.2 + Math.random() * 0.4, r: 1.5 + Math.random() * 2,
}));

const stalacs = [];
for (let c = 0; c < COLS; c++)
if (MAP[0][c] === "#" && Math.random() > 0.5)
stalacs.push({ x: c * T + T / 2, y: T, h: 15 + Math.random() * 35, w: 3 + Math.random() * 5 });

const drips = Array.from({ length: 15 }, () => ({
x: 80 + Math.random() * (WW - 160), y: T, sp: 0.8 + Math.random() * 1.2, act: false, tmr: Math.random() * 300,
}));

function emitP(x, y, col, n, sp = 6) {
for (let i = 0; i < n; i++)
parts.push({ x, y, vx: (Math.random() - 0.5) * sp, vy: -Math.random() * 5 - 1,
life: 1, dec: 0.02 + Math.random() * 0.03, sz: 2 + Math.random() * 4, col });
}

function rectHit(x, y, w, h, rs) {
for (const r of rs) if (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y) return r;
return null;
}

const ml = () => keys.ArrowLeft || keys.KeyA;
const mr = () => keys.ArrowRight || keys.KeyD;
const jmp = () => keys.ArrowUp || keys.KeyW || keys.Space;

function update() {
if (state === "won") { winT++; return; }

const wl = pxAt(P.x - 2, P.y + 4) || pxAt(P.x - 2, P.y + P.h - 4);
const wr = pxAt(P.x + P.w + 2, P.y + 4) || pxAt(P.x + P.w + 2, P.y + P.h - 4);
P.wallJump = !P.gnd && ((wl && ml()) || (wr && mr()));
P.wallDir = wl ? 1 : wr ? -1 : 0;

let moving = false;
if (ml()) { P.vx -= SPD * 0.35; P.face = -1; moving = true; }
if (mr()) { P.vx += SPD * 0.35; P.face = 1; moving = true; }

if (P.gnd) P.coyote = 6; else if (P.coyote > 0) P.coyote--;
if (jmp() && !P._jh) P.jmpBuf = 8; else if (P.jmpBuf > 0) P.jmpBuf--;
P._jh = !!jmp();

if (P.jmpBuf > 0) {
if (P.coyote > 0) {
P.vy = JUMP_V; P.gnd = false; P.coyote = 0; P.jmpBuf = 0;
sfxJump(); emitP(P.x + P.w / 2, P.y + P.h, "#8B7355", 5);
} else if (P.wallJump) {
P.vx = P.wallDir * SPD * 1.3; P.vy = JUMP_V * 0.95; P.face = P.wallDir;
P.jmpBuf = 0; sfxJump(); emitP(P.x + P.w / 2, P.y + P.h / 2, "#8B7355", 4);
}
}

P.vx *= FRIC;
if (Math.abs(P.vx) < 0.1) P.vx = 0;
P.vx = Math.max(-SPD, Math.min(SPD, P.vx));

P.vy += GRAV;
if (P.wallJump && P.vy > 0) P.vy = Math.min(P.vy, 2.5);
if (P.vy > 16) P.vy = 16;

P.x += P.vx;
const xc = rectHit(P.x, P.y, P.w, P.h, platforms);
if (xc) { P.x = P.vx > 0 ? xc.x - P.w : xc.x + xc.w; P.vx = 0; }

P.y += P.vy; P.gnd = false;
const yc = rectHit(P.x, P.y, P.w, P.h, platforms);
if (yc) {
if (P.vy > 0) { P.y = yc.y - P.h; if (P.vy > 8) emitP(P.x + P.w / 2, P.y + P.h, "#6B5B3D", 4); P.gnd = true; }
else if (P.vy < 0) P.y = yc.y + yc.h;
P.vy = 0;
}

for (const s of springs)
if (P.vy > 0 && rectHit(P.x, P.y, P.w, P.h, s)) {
P.vy = JUMP_V * 1.35; P.gnd = false; sfxBounce(); emitP(s.x + s.w / 2, s.y, "#FF6347", 8, 4);
}

if (P.x < T) { P.x = T; P.vx = 0; }
if (P.x + P.w > WW - T) { P.x = WW - T - P.w; P.vx = 0; }
if (P.y < T) { P.y = T; P.vy = 0; }
if (P.y > WH + 60) { P.x = spawn.x; P.y = spawn.y; P.vx = 0; P.vy = 0; }

if (moving) { P.wt += 0.16; P.wf = Math.sin(P.wt) * 3; P.idle = 0; }
else { P.idle++; P.wt = 0; P.wf = 0; }
P.blinkT++;
if (P.blinkT > 180 + Math.random() * 120) { P.blink = true; P.blinkT = 0; }
if (P.blink && P.blinkT > 8) P.blink = false;
P.tail += 0.08; P.hat = Math.sin(P.wt * 2) * (moving ? 3 : 0.5);

for (const b of babySpots) {
if (!b.found) {
const dx = P.x + P.w / 2 - b.x, dy = P.y + P.h / 2 - b.y;
if (Math.abs(dx) < 30 && Math.abs(dy) < 30) {
b.found = true; P.found++; sfxCollect();
emitP(b.x, b.y, "#FFD700", 20); emitP(b.x, b.y, "#FFA500", 15);
if (P.found >= 6) state = "won";
}
}
b.anim += 0.04;
}

for (let i = parts.length - 1; i >= 0; i--) {
const pt = parts[i]; pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.15; pt.life -= pt.dec;
if (pt.life <= 0) parts.splice(i, 1);
}
for (const f of flies) { f.ph += 0.02; f.x += Math.sin(f.ph) * f.sp; f.y += Math.cos(f.ph * 1.3) * f.sp * 0.5; }
for (const d of drips) {
if (!d.act) { d.tmr--; if (d.tmr <= 0) { d.act = true; d.y = T; } }
else { d.y += d.sp; if (d.y > WH) { d.act = false; d.tmr = 200 + Math.random() * 400; } }
}

cam.x = Math.max(0, Math.min(WW - W, P.x + P.w / 2 - W / 2));
cam.y = Math.max(0, Math.min(WH - H, P.y + P.h / 2 - H / 2));
}

// â”€â”€ DRAWING â”€â”€
function drawBg() {
const g = ctx.createLinearGradient(0, 0, 0, H);
g.addColorStop(0, "#08080f"); g.addColorStop(0.5, "#0e0e1a"); g.addColorStop(1, "#16121e");
ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
for (let i = 0; i < 25; i++) {
const x = ((i * 173 + 50) % (W + 200)) - (cam.x * 0.08) % 200;
const y = ((i * 89 + 30) % H) - cam.y * 0.04;
ctx.fillStyle = "rgba(25,20,35,0.35)"; ctx.beginPath(); ctx.ellipse(x, y, 50 + i * 8, 25 + i * 3, 0, 0, Math.PI * 2); ctx.fill();
}
}

function drawStal() {
for (const s of stalacs) {
const sx = s.x - cam.x, sy = s.y - cam.y;
if (sx < -60 || sx > W + 60) continue;
ctx.fillStyle = "#221d2c"; ctx.beginPath(); ctx.moveTo(sx - s.w, sy); ctx.lineTo(sx + s.w, sy); ctx.lineTo(sx, sy + s.h); ctx.closePath(); ctx.fill();
ctx.fillStyle = "#2d2738"; ctx.beginPath(); ctx.moveTo(sx - s.w + 2, sy); ctx.lineTo(sx, sy); ctx.lineTo(sx, sy + s.h - 4); ctx.closePath(); ctx.fill();
}
}

function drawDrips() {
for (const d of drips) {
if (!d.act) continue;
const dy = d.y - cam.y; if (dy < -10 || dy > H + 10) continue;
ctx.fillStyle = "rgba(100,160,220,0.5)"; ctx.beginPath(); ctx.ellipse(d.x - cam.x, dy, 1.5, 3, 0, 0, Math.PI * 2); ctx.fill();
}
}

function drawPlats() {
for (const p of platforms) {
const px = p.x - cam.x, py = p.y - cam.y;
if (px < -T || px > W + T || py < -T || py > H + T) continue;

const top = !tileAt(Math.floor((p.x + T / 2) / T), Math.floor((p.y - 2) / T));
const lft = !tileAt(Math.floor((p.x - 2) / T), Math.floor((p.y + T / 2) / T));
const rgt = !tileAt(Math.floor((p.x + T + 2) / T), Math.floor((p.y + T / 2) / T));

ctx.fillStyle = "#2e2015"; ctx.fillRect(px, py, T, T);
if (top) {
const g = ctx.createLinearGradient(px, py, px, py + 8);
g.addColorStop(0, "#5a4a38"); g.addColorStop(1, "#3a2a1a");
ctx.fillStyle = g; ctx.fillRect(px, py, T, 8);
ctx.fillStyle = "#6a5a48"; ctx.fillRect(px, py, T, 2);
}
if (lft) { ctx.fillStyle = "#3a2a1a"; ctx.fillRect(px, py, 3, T); }
if (rgt) { ctx.fillStyle = "#3a2a1a"; ctx.fillRect(px + T - 3, py, 3, T); }
const s = (p.x * 7 + p.y * 13) % 19;
if (s < 6) { ctx.fillStyle = "#1e1008"; ctx.fillRect(px + 8, py + 12, 7, 4); }
if (s > 11) { ctx.fillStyle = "#1e1008"; ctx.fillRect(px + 18, py + 22, 9, 3); }
}

for (const s of springs) {
const sx = s.x - cam.x, sy = s.y - cam.y;
ctx.fillStyle = "#8B0000"; ctx.fillRect(sx + 4, sy + 8, T - 8, 12);
ctx.fillStyle = "#FF4500"; ctx.fillRect(sx + 2, sy + 4, T - 4, 6);
ctx.fillStyle = "#FF6347"; ctx.fillRect(sx + 6, sy + 2, T - 12, 4);
}
}

function drawMonkey(p, x, y, sc, baby, anim) {
const s = sc || 1;
ctx.save();
ctx.translate(x + (p ? p.w * s / 2 : 14 * s), y + (p ? p.h * s : 28 * s));
ctx.scale(p ? p.face : 1, 1);

const wk = p ? p.wf : Math.sin(anim || 0) * 1.5;
const br = Math.sin((p ? p.idle : (anim || 0) * 20) * 0.05);
const st = (!p || !p.gnd) ? 1.06 : 1;
ctx.scale(s * st, s / st);

// Tail
const tw = p ? Math.sin(p.tail) * 15 : Math.sin((anim || 0) * 3) * 12;
ctx.strokeStyle = "#8B5E3C"; ctx.lineWidth = 3.5 * s; ctx.lineCap = "round";
ctx.beginPath(); ctx.moveTo(-7, -11 + br); ctx.quadraticCurveTo(-20, -18 + br + tw * 0.3, -26, -9 + br + tw * 0.5); ctx.stroke();
ctx.strokeStyle = "#A0724A"; ctx.lineWidth = 2.5 * s;
ctx.beginPath(); ctx.moveTo(-7, -11 + br); ctx.quadraticCurveTo(-18, -20 + br + tw * 0.3, -24, -10 + br + tw * 0.5); ctx.stroke();

// Body
ctx.fillStyle = "#8B5E3C"; ctx.beginPath(); ctx.ellipse(0, -16 + br, 12, 13, 0, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#C4956A"; ctx.beginPath(); ctx.ellipse(1, -12 + br, 8, 9, 0, 0, Math.PI * 2); ctx.fill();

// Head
const hy = -32 + br;
ctx.fillStyle = "#8B5E3C"; ctx.beginPath(); ctx.ellipse(0, hy, 11, 10, 0, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#C4956A"; ctx.beginPath(); ctx.ellipse(1, hy + 2, 7, 6, 0, 0, Math.PI * 2); ctx.fill();

if (!baby && p) {
ctx.fillStyle = "#8B4513";
ctx.beginPath(); ctx.ellipse(0, hy - 9 + p.hat * 0.3, 13, 4.5, 0, Math.PI, 0); ctx.fill();
ctx.fillRect(-7, hy - 14 + p.hat * 0.3, 14, 6);
ctx.fillStyle = "#A0522D"; ctx.fillRect(-6, hy - 12 + p.hat * 0.3, 12, 2);
}

// Ears
ctx.fillStyle = "#C4956A"; ctx.beginPath(); ctx.arc(-7, hy, 3.5, 0, Math.PI * 2); ctx.arc(7, hy, 3.5, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#8B5E3C"; ctx.beginPath(); ctx.arc(-7, hy, 2, 0, Math.PI * 2); ctx.arc(7, hy, 2, 0, Math.PI * 2); ctx.fill();

// Eyes
if (p && !p.blink) {
ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(-4, hy - 1, 2, 0, Math.PI * 2); ctx.arc(4, hy - 1, 2, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-3.5, hy - 2, 0.7, 0, Math.PI * 2); ctx.arc(4.5, hy - 2, 0.7, 0, Math.PI * 2); ctx.fill();
} else if (p && p.blink) {
ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-6, hy - 1); ctx.lineTo(-2, hy - 1); ctx.moveTo(2, hy - 1); ctx.lineTo(6, hy - 1); ctx.stroke();
} else if (baby) {
const bl = Math.sin((anim || 0) * 10) > 0.95;
if (!bl) {
ctx.fillStyle = "#1a1a1a"; ctx.beginPath(); ctx.arc(-3.5, hy - 1, 2.2, 0, Math.PI * 2); ctx.arc(3.5, hy - 1, 2.2, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(-3, hy - 2, 0.8, 0, Math.PI * 2); ctx.arc(4, hy - 2, 0.8, 0, Math.PI * 2); ctx.fill();
} else {
ctx.strokeStyle = "#1a1a1a"; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(-5, hy - 1); ctx.lineTo(-1, hy - 1); ctx.moveTo(1, hy - 1); ctx.lineTo(5, hy - 1); ctx.stroke();
}
}

// Nose + mouth
ctx.fillStyle = "#6B3A2A"; ctx.beginPath(); ctx.ellipse(1, hy + 4, 2.5, 1.8, 0, 0, Math.PI * 2); ctx.fill();
const mo = baby ? Math.abs(Math.sin((anim || 0) * 5)) * 2 : 0;
ctx.fillStyle = "#C4956A"; ctx.beginPath(); ctx.ellipse(1, hy + 7, 2.5 + mo * 0.3, 1.2 + mo, 0, 0, Math.PI * 2); ctx.fill();

// Legs
const ls = wk * 1.5;
ctx.fillStyle = "#8B5E3C"; ctx.beginPath(); ctx.ellipse(-5 + ls, 2, 4.5, 6.5, 0.12, 0, Math.PI * 2); ctx.fill();
ctx.beginPath(); ctx.ellipse(5 - ls, 2, 4.5, 6.5, -0.12, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#6B3A2A"; ctx.beginPath(); ctx.ellipse(-5 + ls, 7, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();
ctx.beginPath(); ctx.ellipse(5 - ls, 7, 3.5, 2.5, 0, 0, Math.PI * 2); ctx.fill();

// Arms
const as = wk * 0.8;
ctx.fillStyle = "#8B5E3C"; ctx.beginPath(); ctx.ellipse(-11, -9 + br + as, 3.5, 8, 0.3, 0, Math.PI * 2); ctx.fill();
ctx.beginPath(); ctx.ellipse(11, -9 + br - as, 3.5, 8, -0.3, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = "#C4956A"; ctx.beginPath(); ctx.arc(-11, 0 + br + as, 3, 0, Math.PI * 2); ctx.arc(11, 0 + br - as, 3, 0, Math.PI * 2); ctx.fill();

ctx.restore();
}

function drawBabyGlow(b) {
const bx = b.x - cam.x, by = b.y - cam.y;
const gs = 30 + Math.sin(b.anim * 2) * 6;
const g = ctx.createRadialGradient(bx, by, 0, bx, by, gs);
g.addColorStop(0, "rgba(255,215,0,0.3)"); g.addColorStop(1, "rgba(255,215,0,0)");
ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, gs, 0, Math.PI * 2); ctx.fill();
}

function drawFlies() {
for (const f of flies) {
const fx = f.x - cam.x, fy = f.y - cam.y;
if (fx < -20 || fx > W + 20 || fy < -20 || fy > H + 20) continue;
const br = (Math.sin(f.ph * 2) + 1) / 2, a = 0.15 + br * 0.5;
const g = ctx.createRadialGradient(fx, fy, 0, fx, fy, f.r * 5);
g.addColorStop(0, `rgba(180,255,120,${a})`); g.addColorStop(1, "rgba(180,255,120,0)");
ctx.fillStyle = g; ctx.beginPath(); ctx.arc(fx, fy, f.r * 5, 0, Math.PI * 2); ctx.fill();
ctx.fillStyle = `rgba(220,255,170,${a})`; ctx.beginPath(); ctx.arc(fx, fy, f.r * (0.4 + br * 0.6), 0, Math.PI * 2); ctx.fill();
}
}

function drawParts() {
for (const pt of parts) {
ctx.globalAlpha = pt.life; ctx.fillStyle = pt.col;
ctx.beginPath(); ctx.arc(pt.x - cam.x, pt.y - cam.y, pt.sz * pt.life, 0, Math.PI * 2); ctx.fill();
}
ctx.globalAlpha = 1;
}

function drawUI() {
ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.beginPath(); ctx.roundRect(12, 12, 260, 52, 8); ctx.fill();
ctx.strokeStyle = "rgba(255,215,0,0.3)"; ctx.lineWidth = 1; ctx.beginPath(); ctx.roundRect(12, 12, 260, 52, 8); ctx.stroke();
ctx.fillStyle = "#FFD700"; ctx.font = "bold 16px monospace"; ctx.fillText("Baby Monkeys:", 24, 36);
for (let i = 0; i < 6; i++) {
ctx.font = "20px serif"; ctx.fillText(i < P.found ? "ðŸ’" : "ðŸµ", 180 + (i % 3) * 28, i < 3 ? 34 : 54);
}
if (P.found > 0 && P.found < 6) {
const pct = P.found / 6;
ctx.fillStyle = "rgba(255,215,0,0.15)"; ctx.fillRect(24, 46, 160, 4);
ctx.fillStyle = "#FFD700"; ctx.fillRect(24, 46, 160 * pct, 4);
}

ctx.fillStyle = "rgba(0,0,0,0.5)"; ctx.beginPath(); ctx.roundRect(W / 2 - 190, H - 32, 380, 26, 6); ctx.fill();
ctx.fillStyle = "#666"; ctx.font = "11px monospace"; ctx.textAlign = "center";
ctx.fillText("Arrows/WASD = Move  |  Up/W/Space = Jump  |  Wall jump supported!", W / 2, H - 15);
ctx.textAlign = "left";
}

function drawMinimap() {
const mw = 150, mh = 22, mx = W - mw - 14, my = 14;
ctx.fillStyle = "rgba(0,0,0,0.6)"; ctx.beginPath(); ctx.roundRect(mx - 4, my - 4, mw + 8, mh + 8, 5); ctx.fill();
ctx.fillStyle = "#12101a"; ctx.fillRect(mx, my, mw, mh);
for (const b of babySpots)
if (!b.found) { ctx.fillStyle = "#FFD700"; ctx.beginPath(); ctx.arc(mx + (b.x / WW) * mw, my + (b.y / WH) * mh, 2, 0, Math.PI * 2); ctx.fill(); }
ctx.fillStyle = "#4FC3F7"; ctx.beginPath(); ctx.arc(mx + ((P.x + P.w / 2) / WW) * mw, my + ((P.y + P.h / 2) / WH) * mh, 2.5, 0, Math.PI * 2); ctx.fill();
}

function drawWin() {
const t = Math.min(1, winT / 60);
ctx.fillStyle = `rgba(0,0,0,${t * 0.75})`; ctx.fillRect(0, 0, W, H);
if (t >= 1) {
ctx.textAlign = "center";
ctx.fillStyle = "#FFD700"; ctx.font = "bold 44px monospace"; ctx.fillText("ALL BABIES FOUND!", W / 2, H / 2 - 60);
ctx.font = "22px monospace"; ctx.fillStyle = "#C4956A"; ctx.fillText("The cave family is reunited!", W / 2, H / 2 - 15);
const b = Math.sin(winT * 0.05) * 5;
ctx.font = "38px serif"; ctx.fillText("\u{1F412} \u{1F412} \u{1F412} \u{1F412} \u{1F412} \u{1F412}", W / 2, H / 2 + 45 + b);
ctx.font = "14px monospace"; ctx.fillStyle = "#888"; ctx.fillText("Press R to play again", W / 2, H / 2 + 95);
ctx.textAlign = "left";
}
if (keys.KeyR) location.reload();
}

function draw() {
ctx.clearRect(0, 0, W, H);
drawBg(); drawStal(); drawDrips(); drawFlies(); drawPlats();
for (const b of babySpots) if (!b.found) { drawBabyGlow(b); drawMonkey(null, b.x - 14, b.y - 24, 0.8, true, b.anim); }
drawMonkey(P, P.x - cam.x, P.y - cam.y, 1, false, 0);
drawParts(); drawUI(); drawMinimap();
if (state === "won") drawWin();
}

(function loop() { update(); draw(); requestAnimationFrame(loop); })();
</script>
