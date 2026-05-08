// 打工人合成记 · 微信小游戏主入口
// 单文件 / 全 Canvas UI / 无 DOM 依赖
//
// 整体结构：
//   1. 平台适配（canvas, 屏幕尺寸, dpr, 触摸, 存储）
//   2. 数据：ROLES, QUOTES, COMBO_QUOTES, OVER_TITLES
//   3. 游戏状态机：READY / PLAY / OVER
//   4. 物理引擎（与 web 版一致）
//   5. 渲染：顶栏 / 球 / 粒子 / COMBO / 进化条 / 弹幕台词 / 全屏遮罩面板
//   6. 触摸路由：游戏区拖动+丢下；遮罩按钮命中测试
//   7. wx.* 集成：分享、激励视频续命、埋点

// ========== 1. 平台适配 ==========
const canvas = wx.createCanvas();
const ctx = canvas.getContext('2d');
const sys = wx.getSystemInfoSync();
const dpr = sys.pixelRatio || 1;
const W = sys.windowWidth;
const H = sys.windowHeight;
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

const Storage = {
  get(k, fallback) {
    try { const v = wx.getStorageSync(k); return v === '' ? fallback : v; } catch (e) { return fallback; }
  },
  set(k, v) { try { wx.setStorageSync(k, v); } catch (e) {} },
};

const track = (event, params = {}) => {
  const data = { event, ts: Date.now(), platform: 'wx', ...params };
  try { if (wx.reportEvent) wx.reportEvent(event, params); } catch (e) {}
  if (GameGlobal.__DEBUG_TRACK__) console.log('[track]', data);
};

// ========== 激励视频（续命） ==========
const Ad = {
  inst: null,
  ready: false,
  init() {
    if (!wx.createRewardedVideoAd) return;
    try {
      this.inst = wx.createRewardedVideoAd({ adUnitId: 'TODO_REPLACE_WX_AD_UNIT_ID' });
      this.inst.onLoad(() => { this.ready = true; });
      this.inst.onError((err) => { this.ready = false; track('ad_error', { code: err && err.errCode }); });
      this.inst.load && this.inst.load();
    } catch (e) {}
  },
  available() { return !!(this.inst && this.ready); },
  show(onReward, onFail) {
    if (!this.inst) { onFail && onFail({ reason: 'no_inst' }); return; }
    const onClose = (res) => {
      try { this.inst.offClose(onClose); } catch (e) {}
      if (res && res.isEnded) onReward(res);
      else onFail && onFail({ reason: 'user_skip' });
      this.ready = false;
      this.inst.load && this.inst.load();
    };
    this.inst.onClose(onClose);
    this.inst.show().catch(() => {
      this.inst.load().then(() => this.inst.show()).catch((e) => onFail && onFail({ reason: 'load_fail', error: e }));
    });
  },
};
Ad.init();

// ========== 微信右上角分享菜单 ==========
wx.showShareMenu && wx.showShareMenu({ withShareTicket: false, menus: ['shareAppMessage', 'shareTimeline'] });
wx.onShareAppMessage && wx.onShareAppMessage(() => {
  const imageUrl = buildShareImagePath();
  return {
    title: shareTitle(),
    imageUrl: imageUrl || undefined,
    query: 'from=topbar&role=' + highestRole,
  };
});

// 触觉反馈封装：按事件强度区分轻 / 中 / 重
function buzz(kind) {
  if (!wx.vibrateShort) return;
  try { wx.vibrateShort({ type: kind || 'light' }); } catch (e) {}
}

// ========== 2. 数据 ==========
const ROLES = [
  { r: 14,  color: '#95a5a6', emoji: '🎓', name: '实习生',     score: 1 },
  { r: 19,  color: '#7eb8e2', emoji: '😩', name: '试用期',     score: 3 },
  { r: 26,  color: '#4a90e2', emoji: '💻', name: '专员',       score: 6 },
  { r: 33,  color: '#9b59b6', emoji: '📋', name: '主管',       score: 10 },
  { r: 41,  color: '#e67e22', emoji: '👔', name: '经理',       score: 15 },
  { r: 50,  color: '#e74c3c', emoji: '💼', name: '总监',       score: 21 },
  { r: 60,  color: '#c0392b', emoji: '🎯', name: 'VP',         score: 28 },
  { r: 72,  color: '#f1c40f', emoji: '👑', name: 'CEO',        score: 36 },
  { r: 86,  color: '#1abc9c', emoji: '🚀', name: '创始人',     score: 45 },
  { r: 102, color: '#27ae60', emoji: '💰', name: '投资人',     score: 55 },
  { r: 120, color: '#16a085', emoji: '🏝', name: '财富自由',   score: 100 },
];

const QUOTES = [
  [],
  ['试用期通过！', '人事说还行', '续签了三个月', '老板拍肩："你不错"'],
  ['终于转正了 🎉', '工号下来了', '入职大礼包到了', 'HR 帮我办了门禁'],
  ['升职为主管', '管 3 个人了', '可以坐 C 位了', '工位换大了一档'],
  ['签了 OKR，又要加班', '经理 hat 戴上了', '开会能甩锅了', '部门年会我主持'],
  ['年终翻倍 💰', '总监！配车了', '战略会议有我一席', 'HRBP 改口叫我哥'],
  ['副总裁，飘了', '美元年薪到手', '助理排我档期', 'PR 稿上有我名字'],
  ['公司是我的了 👑', '上过财经封面', '股东问我下季度规划', '出门有 SUV'],
  ['敲钟梦想成真 🚀', 'IPO 当天涨停', '路演讲了 100 次', '招股书都背下来了'],
  ['FA：有好项目吗', '我现在是 LP', '写小作文教年轻人', '投了 30 个项目'],
  ['老板我不干了 🏝', 'WLB 我自己定', '在马尔代夫敲键盘', '退休躺平专家'],
];

const COMBO_QUOTES = [
  '加薪 30%！', '团建去三亚！', 'OKR 直接 3.75', '股票翻倍！',
  '拿到 SP offer', '猎头狂打电话',
];

const OVER_TITLES = [
  { title: '被优化了 💼', sub: '感谢你的贡献，祝前程似锦' },
  { title: '组织架构调整', sub: '你的岗位被合并了' },
  { title: '毕业典礼', sub: 'N+1 已到账，请保持联系' },
  { title: '精神内耗', sub: '建议休假调整一下' },
  { title: '不是个人能力问题', sub: '是大环境不好' },
  { title: '降本增效', sub: '你不幸地代表了「本」' },
];

const pickQuote = (lvl) => {
  const arr = QUOTES[lvl] || [];
  return arr.length ? arr[(Math.random() * arr.length) | 0] : '';
};
const pickCombo = () => COMBO_QUOTES[(Math.random() * COMBO_QUOTES.length) | 0];

// ========== 3. 状态 ==========
const STATE = { READY: 0, PLAY: 1, OVER: 2 };
let state = STATE.READY;

// 舞台：球场区域。在屏幕中按比例缩放至 380x540 的设计尺寸。
// 上方 92px 留给顶栏，下方 70px 留给进化条。
const TOP_BAR_H = 92;
const EVO_H = 70;
const DESIGN_W = 380, DESIGN_H = 540;
const stageScale = Math.min(
  (W - 16) / DESIGN_W,
  (H - TOP_BAR_H - EVO_H - 16) / DESIGN_H,
  1.5
);
const SW = DESIGN_W * stageScale;
const SH = DESIGN_H * stageScale;
const SX = (W - SW) / 2;
const SY = TOP_BAR_H + (H - TOP_BAR_H - EVO_H - SH) / 2;

// 物理用「设计坐标」，渲染时再缩放
const WALL_L = 6, WALL_R = DESIGN_W - 6, WALL_B = DESIGN_H - 6;
const DROP_Y = 56, DANGER_Y = 96;

let balls = [], particles = [], combos = [];
let nextId = 1, score = 0;
let best = +(Storage.get('dgr_best', 0));
let bestRole = +(Storage.get('dgr_best_role', 0));
let dropX = DESIGN_W / 2;
let cooldown = 0, dangerTimer = 0;
let curLevel = 0, nextLevel = 0;
let unlocked = new Array(ROLES.length).fill(false);
let comboCount = 0, comboTimer = 0;
let won = false;
let dropCount = 0, mergeCount = 0, highestRole = 0;
let firstMergeFired = false, levelMilestoneFired = new Set();
let startTime = 0;
let quoteText = '', quoteTimer = 0;
let reviveUsed = false;
let reviveLoading = false;
let buttons = []; // 当前激活面板的按钮命中测试列表
let overTitle = '', overSub = '';

function shareTitle() {
  if (highestRole > 0) return `我已升到 ${ROLES[highestRole].name}（工资 ${score}），你能比我高吗？`;
  return '从实习生卷到财富自由——打工人合成记';
}

function rndStartLevel() {
  const r = Math.random();
  if (r < 0.30) return 0;
  if (r < 0.55) return 1;
  if (r < 0.78) return 2;
  if (r < 0.93) return 3;
  return 4;
}

function reset() {
  balls = []; particles = []; combos = [];
  nextId = 1; score = 0; cooldown = 0; dangerTimer = 0;
  comboCount = 0; comboTimer = 0; won = false;
  dropCount = 0; mergeCount = 0; highestRole = 0;
  firstMergeFired = false; levelMilestoneFired = new Set();
  reviveUsed = false;
  reviveLoading = false;
  unlocked = new Array(ROLES.length).fill(false);
  curLevel = rndStartLevel();
  nextLevel = rndStartLevel();
  dropX = DESIGN_W / 2;
  quoteText = ''; quoteTimer = 0;
}

function startGame() {
  reset();
  startTime = Date.now();
  state = STATE.PLAY;
  track('game_start', { best });
}

function showQuote(text) {
  if (!text) return;
  quoteText = text;
  quoteTimer = 90;
}

// ========== 4. 物理 ==========
function spawnBall(x, y, level) {
  return {
    id: nextId++, x, y, vx: 0, vy: 0,
    level, r: ROLES[level].r, mass: ROLES[level].r * ROLES[level].r,
    angle: 0, omega: 0, age: 0, justMerged: 0,
  };
}

function dropPiece() {
  if (cooldown > 0 || state !== STATE.PLAY) return;
  const role = ROLES[curLevel];
  const x = Math.max(WALL_L + role.r, Math.min(WALL_R - role.r, dropX));
  const b = spawnBall(x, DROP_Y + role.r, curLevel);
  balls.push(b);
  curLevel = nextLevel;
  nextLevel = rndStartLevel();
  cooldown = 28;
  dropCount++;
}

function step() {
  const G = 0.55, FRICTION = 0.998;
  for (const b of balls) {
    b.vy += G;
    b.vx *= FRICTION;
    b.vy *= FRICTION;
    b.x += b.vx;
    b.y += b.vy;
    b.angle += b.omega;
    b.omega *= 0.95;
    b.age++;
    if (b.justMerged > 0) b.justMerged--;
  }
  for (let it = 0; it < 5; it++) {
    for (const b of balls) {
      if (b.x - b.r < WALL_L) { b.x = WALL_L + b.r; if (b.vx < 0) b.vx = -b.vx * 0.35; }
      if (b.x + b.r > WALL_R) { b.x = WALL_R - b.r; if (b.vx > 0) b.vx = -b.vx * 0.35; }
      if (b.y + b.r > WALL_B) {
        b.y = WALL_B - b.r;
        if (b.vy > 0) b.vy = -b.vy * 0.25;
        b.vx *= 0.85; b.omega *= 0.7;
      }
    }
    for (let i = 0; i < balls.length; i++)
      for (let j = i + 1; j < balls.length; j++) resolve(balls[i], balls[j]);
  }
  // merges
  const merged = new Set();
  const toAdd = [];
  for (let i = 0; i < balls.length; i++) {
    const a = balls[i];
    if (merged.has(a.id)) continue;
    for (let j = i + 1; j < balls.length; j++) {
      const b = balls[j];
      if (merged.has(b.id)) continue;
      if (a.level !== b.level) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      const minD = a.r + b.r;
      if (d2 <= (minD + 0.6) * (minD + 0.6)) {
        merged.add(a.id); merged.add(b.id);
        mergeCount++;
        if (!firstMergeFired) { firstMergeFired = true; track('first_merge'); }
        if (a.level < ROLES.length - 1) {
          const nl = a.level + 1;
          const nx = (a.x + b.x) / 2, ny = (a.y + b.y) / 2;
          const nb = spawnBall(nx, ny, nl);
          nb.vx = (a.vx + b.vx) * 0.4;
          nb.vy = (a.vy + b.vy) * 0.4 - 1.5;
          nb.justMerged = 12;
          toAdd.push(nb);
          unlocked[nl] = true;
          burst(nx, ny, ROLES[nl].color, ROLES[nl].r);
          comboCount++; comboTimer = 60;
          const gain = ROLES[nl].score * (1 + (comboCount > 1 ? (comboCount - 1) * 0.3 : 0)) | 0;
          score += gain;
          if (comboCount >= 2) showCombo(nx, ny - 30, 'COMBO ×' + comboCount);
          if (nl > highestRole) {
            highestRole = nl;
            showQuote(pickQuote(nl));
            buzz(nl >= 7 ? 'heavy' : 'medium');
            if ([3, 5, 7, 9, 10].includes(nl) && !levelMilestoneFired.has(nl)) {
              levelMilestoneFired.add(nl);
              track('reach_level', { level: nl, role: ROLES[nl].name });
            }
          } else {
            buzz('light');
            if (comboCount >= 3 && quoteTimer < 30) showQuote(pickCombo());
          }
          if (nl === ROLES.length - 1) {
            showCombo(nx, ny - 50, '🏝 财富自由！');
            for (let k = 0; k < 40; k++) burstParticle(nx, ny, ROLES[nl].color);
            score += 500;
            if (!won) { won = true; track('won'); }
          }
        } else {
          score += 1000;
          for (let k = 0; k < 60; k++) burstParticle((a.x+b.x)/2, (a.y+b.y)/2, '#16a085');
          showCombo((a.x+b.x)/2, (a.y+b.y)/2, '+1000 财富自由 ×2');
          buzz('heavy');
        }
        break;
      }
    }
  }
  if (merged.size) balls = balls.filter(b => !merged.has(b.id));
  for (const b of toAdd) balls.push(b);
  if (comboTimer > 0) comboTimer--; else comboCount = 0;
  if (quoteTimer > 0) quoteTimer--;
  for (const p of particles) {
    p.age++; p.x += p.vx; p.y += p.vy; p.vy += 0.15; p.vx *= 0.98;
  }
  particles = particles.filter(p => p.age < p.life);
  for (const c of combos) { c.age++; c.y -= 0.6; }
  combos = combos.filter(c => c.age < c.life);

  let danger = false;
  for (const b of balls) {
    if (b.age > 30 && b.y - b.r < DANGER_Y && Math.abs(b.vy) < 1.2) { danger = true; break; }
  }
  if (danger) { dangerTimer++; if (dangerTimer > 90) gameOver(); }
  else dangerTimer = Math.max(0, dangerTimer - 2);
  if (cooldown > 0) cooldown--;
}

function resolve(a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  let d2 = dx * dx + dy * dy;
  const minD = a.r + b.r;
  if (d2 >= minD * minD) return;
  let d = Math.sqrt(d2);
  if (d < 0.0001) d = 0.01;
  const nx = dx / d, ny = dy / d;
  const overlap = minD - d;
  const totalMass = a.mass + b.mass;
  const ka = b.mass / totalMass, kb = a.mass / totalMass;
  a.x -= nx * overlap * ka; a.y -= ny * overlap * ka;
  b.x += nx * overlap * kb; b.y += ny * overlap * kb;
  const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
  const vn = rvx * nx + rvy * ny;
  if (vn < 0) {
    const e = 0.15;
    const j = -(1 + e) * vn / (1 / a.mass + 1 / b.mass);
    const ix = j * nx, iy = j * ny;
    a.vx -= ix / a.mass; a.vy -= iy / a.mass;
    b.vx += ix / b.mass; b.vy += iy / b.mass;
    const tx = -ny, ty = nx;
    const rvt = rvx * tx + rvy * ty;
    a.omega -= rvt * 0.002; b.omega += rvt * 0.002;
  }
}

function burst(x, y, color, r) {
  const n = 14 + (r / 6) | 0;
  for (let i = 0; i < n; i++) burstParticle(x, y, color);
}
function burstParticle(x, y, color) {
  const a = Math.random() * Math.PI * 2;
  const sp = 1 + Math.random() * 4;
  particles.push({
    x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1,
    life: 30 + Math.random() * 20, age: 0, color,
    size: 2 + Math.random() * 3,
  });
}
function showCombo(x, y, text) { combos.push({ x, y, text, age: 0, life: 50 }); }

function gameOver() {
  if (state !== STATE.PLAY) return;
  state = STATE.OVER;
  let isNew = false;
  if (score > best) { best = score; Storage.set('dgr_best', best); isNew = true; }
  if (highestRole > bestRole) { bestRole = highestRole; Storage.set('dgr_best_role', bestRole); }
  track('game_over', {
    score, best, highest_role: highestRole, role_name: ROLES[highestRole].name,
    drops: dropCount, merges: mergeCount, won,
    duration_s: Math.round((Date.now() - startTime) / 1000),
  });
  if (won) { overTitle = '🏝 财富自由！'; overSub = '老板，我不干了！'; }
  else {
    const pick = OVER_TITLES[(Math.random() * OVER_TITLES.length) | 0];
    overTitle = pick.title; overSub = pick.sub;
  }
  GameGlobal.__OVER_NEW_BEST__ = isNew;
}

function tryRevive() {
  if (reviveUsed || reviveLoading || state !== STATE.OVER) return;
  reviveLoading = true;
  track('revive_click', { score, highest_role: highestRole });
  Ad.show(
    () => {
      reviveLoading = false;
      reviveUsed = true;
      balls.sort((a, b) => a.y - b.y);
      const removeCount = Math.min(3, Math.max(1, Math.floor(balls.length * 0.3)));
      for (let i = 0; i < removeCount && balls.length > 0; i++) {
        const b = balls.shift();
        burst(b.x, b.y, ROLES[b.level].color, b.r);
      }
      dangerTimer = 0;
      state = STATE.PLAY;
      showQuote('回血成功，再战 🔥');
      buzz('heavy');
      track('revive_success', { score, highest_role: highestRole });
    },
    (err) => {
      reviveLoading = false;
      const reason = err && err.reason;
      if (reason === 'no_inst') showQuote('广告暂未配置，先再来一把');
      else if (reason === 'load_fail') showQuote('广告加载失败，再来一把');
      else showQuote('看完广告才能续命哦');
      track('revive_fail', { reason });
    }
  );
}

// ========== 5. 渲染 ==========
function lighten(hex, amt) { return mix(hex, '#ffffff', amt); }
function darken(hex, amt)  { return mix(hex, '#000000', amt); }
function mix(a, b, t) {
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 255, ag = (ah >> 8) & 255, ab = ah & 255;
  const br = (bh >> 16) & 255, bg = (bh >> 8) & 255, bb = bh & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const b2 = Math.round(ab + (bb - ab) * t);
  return '#' + [r, g, b2].map(v => v.toString(16).padStart(2, '0')).join('');
}

function drawRoundRect(x, y, w, h, r, fill, stroke, lineW) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW || 2; ctx.stroke(); }
}

function drawRoleOn(c, cx, cy, role, radius) {
  c.save();
  c.fillStyle = 'rgba(0,0,0,0.18)';
  c.beginPath();
  c.ellipse(cx, cy + radius * 0.85, radius * 0.85, radius * 0.25, 0, 0, Math.PI * 2);
  c.fill();
  const grd = c.createRadialGradient(cx - radius * 0.35, cy - radius * 0.35, radius * 0.1, cx, cy, radius);
  grd.addColorStop(0, lighten(role.color, 0.45));
  grd.addColorStop(0.55, role.color);
  grd.addColorStop(1, darken(role.color, 0.25));
  c.fillStyle = grd;
  c.beginPath();
  c.arc(cx, cy, radius, 0, Math.PI * 2);
  c.fill();
  c.strokeStyle = darken(role.color, 0.45);
  c.lineWidth = Math.max(1.5, radius * 0.06);
  c.stroke();
  c.font = `${radius * 1.2}px sans-serif`;
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(role.emoji, cx, cy + radius * 0.06);
  c.fillStyle = 'rgba(255,255,255,0.4)';
  c.beginPath();
  c.ellipse(cx - radius * 0.35, cy - radius * 0.45, radius * 0.32, radius * 0.18, -0.5, 0, Math.PI * 2);
  c.fill();
  c.restore();
}
function drawRole(cx, cy, role, radius) { drawRoleOn(ctx, cx, cy, role, radius); }

// ========== 分享卡片图（5:4，给 wx.shareAppMessage 用） ==========
let _shareCanvas = null;
function buildShareImagePath() {
  try {
    if (!_shareCanvas) _shareCanvas = wx.createCanvas();   // 第二次调用 = 离屏
    const sc = _shareCanvas;
    sc.width = 500; sc.height = 400;
    const c = sc.getContext('2d');

    const grd = c.createLinearGradient(0, 0, 0, 400);
    grd.addColorStop(0, '#2c3e50');
    grd.addColorStop(0.6, '#4a5d7a');
    grd.addColorStop(1, '#e67e22');
    c.fillStyle = grd; c.fillRect(0, 0, 500, 400);

    c.fillStyle = '#ffffff';
    c.fillRect(20, 24, 460, 352);
    c.strokeStyle = '#2c3e50'; c.lineWidth = 4;
    c.strokeRect(20, 24, 460, 352);

    c.fillStyle = '#2c3e50';
    c.font = 'bold 26px sans-serif';
    c.textAlign = 'center'; c.textBaseline = 'top';
    c.fillText('打工人合成记', 250, 46);

    const role = ROLES[highestRole];
    drawRoleOn(c, 250, 180, role, 60);

    c.fillStyle = '#c0392b';
    c.font = 'bold 22px sans-serif';
    c.fillText('我升到了 ' + role.name, 250, 260);

    if (won) {
      c.fillStyle = '#16a085';
      c.font = 'bold 16px sans-serif';
      c.fillText('🏝 已实现财富自由', 250, 290);
    }

    c.fillStyle = '#7f8c8d';
    c.font = '600 14px sans-serif';
    c.fillText('工资 ' + score + ' · 你能比我高吗？', 250, won ? 314 : 300);

    c.fillStyle = '#2c3e50';
    c.font = 'bold 14px sans-serif';
    c.fillText('搜「打工人合成记」立即开玩', 250, 348);

    if (sc.toTempFilePathSync) {
      return sc.toTempFilePathSync({ x: 0, y: 0, width: 500, height: 400, fileType: 'png' });
    }
  } catch (e) {
    if (GameGlobal.__DEBUG_TRACK__) console.warn('[share-card]', e);
  }
  return '';
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#2c3e50');
  g.addColorStop(0.6, '#4a5d7a');
  g.addColorStop(1, '#e67e22');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawTopBar() {
  // 工资 / 巅峰 / 下一位
  const padding = 8;
  const boxH = 56;
  const y = 18;
  const boxW = (W - padding * 4) / 3;
  // 工资
  drawScoreBox(padding, y, boxW, boxH, '工资', String(score));
  drawScoreBox(padding * 2 + boxW, y, boxW, boxH, '巅峰', String(best));
  // 下一位
  drawNextBox(padding * 3 + boxW * 2, y, boxW, boxH);
}
function drawScoreBox(x, y, w, h, label, value) {
  drawRoundRect(x, y, w, h, 10, '#ffffff', '#2c3e50', 3);
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(label, x + 10, y + 8);
  ctx.fillStyle = '#1a2332';
  ctx.font = 'bold 22px sans-serif';
  ctx.fillText(value, x + 10, y + 24);
}
function drawNextBox(x, y, w, h) {
  drawRoundRect(x, y, w, h, 10, '#ffffff', '#2c3e50', 3);
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 11px sans-serif';
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText('下一位', x + 8, y + 8);
  drawRole(x + w - 24, y + h / 2, ROLES[nextLevel], 16);
}

function drawStage() {
  // stage 框
  drawRoundRect(SX - 6, SY - 6, SW + 12, SH + 12, 14, '#fafbfc', '#34495e', 4);
  // stage 内部背景
  ctx.save();
  ctx.fillStyle = '#e8edf3';
  ctx.fillRect(SX, SY, SW, SH);
  // 缩放到设计坐标
  ctx.translate(SX, SY);
  ctx.scale(stageScale, stageScale);

  // 危险线
  const dt = Math.min(1, dangerTimer / 90);
  ctx.strokeStyle = `rgba(231, 76, ${60 - dt * 30 | 0}, ${0.5 + dt * 0.4})`;
  ctx.setLineDash([8, 6]);
  ctx.lineWidth = 2 + dt * 1.5;
  ctx.beginPath();
  ctx.moveTo(WALL_L, DANGER_Y); ctx.lineTo(WALL_R, DANGER_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // 球
  for (const b of balls) {
    ctx.save();
    ctx.translate(b.x, b.y);
    const sc = b.justMerged > 0 ? 1 + Math.sin((12 - b.justMerged) / 12 * Math.PI) * 0.18 : 1;
    ctx.scale(sc, sc); ctx.rotate(b.angle);
    drawRole(0, 0, ROLES[b.level], b.r);
    ctx.restore();
  }
  // 粒子
  for (const p of particles) {
    const a = 1 - p.age / p.life;
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  // combo
  for (const c of combos) {
    const a = 1 - c.age / c.life;
    ctx.globalAlpha = a;
    ctx.font = '900 22px sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#fff';
    ctx.strokeText(c.text, c.x, c.y);
    ctx.fillStyle = '#e74c3c';
    ctx.fillText(c.text, c.x, c.y);
  }
  ctx.globalAlpha = 1;
  // 当前要丢的预览
  if (state === STATE.PLAY && cooldown === 0) {
    const role = ROLES[curLevel];
    const x = Math.max(WALL_L + role.r, Math.min(WALL_R - role.r, dropX));
    ctx.strokeStyle = 'rgba(52, 73, 94, .4)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, DROP_Y + role.r); ctx.lineTo(x, WALL_B);
    ctx.stroke(); ctx.setLineDash([]);
    ctx.globalAlpha = 0.95;
    drawRole(x, DROP_Y + role.r * 0.5, role, role.r);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEvolutionBar() {
  const y = SY + SH + 10;
  const totalW = W - 24;
  const x0 = 12;
  const itemW = totalW / ROLES.length;
  drawRoundRect(x0, y, totalW, EVO_H - 14, 10, 'rgba(255,255,255,0.7)', '#34495e', 2);
  ctx.save();
  for (let i = 0; i < ROLES.length; i++) {
    const cx = x0 + itemW * (i + 0.5);
    const cy = y + (EVO_H - 14) / 2;
    ctx.globalAlpha = unlocked[i] ? 1 : 0.35;
    ctx.font = `${itemW > 28 ? 18 : 14}px sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(ROLES[i].emoji, cx, cy);
  }
  ctx.restore();
}

function drawQuote() {
  if (quoteTimer <= 0 || !quoteText) return;
  const alpha = Math.min(1, quoteTimer / 20);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = 'bold 14px sans-serif';
  const tw = ctx.measureText(quoteText).width + 28;
  const bx = (W - tw) / 2;
  const by = SY + 10;
  drawRoundRect(bx, by, tw, 30, 12, '#fffbeb', '#e67e22', 2);
  ctx.fillStyle = '#c0392b';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(quoteText, W / 2, by + 16);
  ctx.restore();
}

function drawButton(b) {
  const colorMap = {
    primary: { fill: '#e74c3c', shadow: '#2c3e50' },
    secondary: { fill: '#34495e', shadow: '#1a252f' },
    revive: { fill: '#16a085', shadow: '#0e6655' },
  };
  const c = colorMap[b.kind || 'primary'];
  // 阴影底
  drawRoundRect(b.x, b.y + 4, b.w, b.h, 10, c.shadow);
  // 主体
  drawRoundRect(b.x, b.y, b.w, b.h, 10, c.fill, '#2c3e50', 3);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 16px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2);
}

function drawStartOverlay() {
  // 半透明遮罩
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 48, 300), ph = 220;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  drawRoundRect(px, py + 8, pw, ph, 14, '#1a252f');
  drawRoundRect(px, py, pw, ph, 14, '#ffffff', '#2c3e50', 4);
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText('打工人合成记', px + pw / 2, py + 24);
  ctx.fillStyle = '#4a5d7a';
  ctx.font = '13px sans-serif';
  const introSeen = Storage.get('dgr_intro_seen', '');
  const lines = introSeen
    ? ['从实习生到财富自由', '同岗位相撞 → 升职', '拖动选位置，松手丢下']
    : ['又是想躺平躺不平的一天', '把同岗位合在一起', '看你能卷到第几层'];
  for (let i = 0; i < lines.length; i++) ctx.fillText(lines[i], px + pw / 2, py + 64 + i * 20);

  buttons = [];
  const bw = 160, bh = 44;
  const bx = px + (pw - bw) / 2, by = py + ph - bh - 24;
  const btn = { x: bx, y: by, w: bw, h: bh, label: '开始打工', kind: 'primary',
    onTap: () => { Storage.set('dgr_intro_seen', '1'); startGame(); } };
  buttons.push(btn);
  drawButton(btn);
}

function drawOverOverlay() {
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(0, 0, W, H);
  const pw = Math.min(W - 32, 320), ph = 380;
  const px = (W - pw) / 2, py = (H - ph) / 2;
  drawRoundRect(px, py + 8, pw, ph, 14, '#1a252f');
  drawRoundRect(px, py, pw, ph, 14, '#ffffff', '#2c3e50', 4);
  ctx.fillStyle = '#2c3e50';
  ctx.font = 'bold 22px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  ctx.fillText(overTitle, px + pw / 2, py + 20);
  ctx.fillStyle = '#4a5d7a';
  ctx.font = '13px sans-serif';
  ctx.fillText(overSub, px + pw / 2, py + 50);

  // 已升到的角色
  const role = ROLES[highestRole];
  const ay = py + 90;
  drawRoundRect(px + 24, ay, pw - 48, 80, 10, '#fffbeb', '#e67e22', 3);
  drawRole(px + pw / 2, ay + 36, role, 22);
  ctx.fillStyle = '#c0392b';
  ctx.font = 'bold 14px sans-serif';
  ctx.fillText('我升到了：' + role.name, px + pw / 2, ay + 58);

  if (GameGlobal.__OVER_NEW_BEST__) {
    ctx.fillStyle = '#d81b60';
    ctx.font = 'bold 13px sans-serif';
    ctx.fillText('🎉 创下个人巅峰！', px + pw / 2, ay + 90);
  }

  // 工资 / 巅峰
  const sy = ay + 110;
  drawScoreBox(px + 24, sy, (pw - 60) / 2, 50, '工资', String(score));
  drawScoreBox(px + 36 + (pw - 60) / 2, sy, (pw - 60) / 2, 50, '巅峰', String(best));

  // 按钮
  buttons = [];
  const bw = (pw - 60) / 2, bh = 40;
  const bgap = 10;

  // 续命按钮：只要本局没用过 + 没赢就显示；点击时再处理"未加载/无广告位"的失败
  let nextBy = py + ph - bh * 2 - bgap - 18;
  if (!reviveUsed && !won) {
    const reviveBtn = {
      x: px + 24, y: nextBy, w: pw - 48, h: bh,
      label: reviveLoading ? '📺 加载中...' : '📺 看广告续命',
      kind: 'revive',
      onTap: reviveLoading ? () => {} : tryRevive,
    };
    buttons.push(reviveBtn);
    drawButton(reviveBtn);
  }
  nextBy = py + ph - bh - 18;

  // 再卷一次 + 分享
  const retry = { x: px + 24, y: nextBy, w: bw, h: bh, label: '再卷一次', kind: 'primary', onTap: startGame };
  const shareBtn = { x: px + 36 + bw, y: nextBy, w: bw, h: bh, label: '分享给朋友', kind: 'secondary',
    onTap: () => {
      track('share_open', { highest_role: highestRole, score });
      const imageUrl = buildShareImagePath();
      wx.shareAppMessage && wx.shareAppMessage({
        title: shareTitle(),
        imageUrl: imageUrl || undefined,
        query: 'from=share_btn&role=' + highestRole,
      });
    } };
  buttons.push(retry, shareBtn);
  drawButton(retry); drawButton(shareBtn);
}

function render() {
  drawBackground();
  drawTopBar();
  drawStage();
  drawEvolutionBar();
  drawQuote();
  if (state === STATE.READY) drawStartOverlay();
  else if (state === STATE.OVER) drawOverOverlay();
  else buttons = [];
}

function loop() {
  if (state === STATE.PLAY) step();
  render();
  requestAnimationFrame(loop);
}

// ========== 6. 触摸路由 ==========
let touching = false;
function stageTouchToDesignX(clientX) {
  return (clientX - SX) / stageScale;
}
function isInStage(clientX, clientY) {
  return clientX >= SX && clientX <= SX + SW && clientY >= SY && clientY <= SY + SH;
}
function dispatchTap(clientX, clientY) {
  // 先看遮罩按钮
  for (const b of buttons) {
    if (clientX >= b.x && clientX <= b.x + b.w && clientY >= b.y && clientY <= b.y + b.h) {
      b.onTap && b.onTap();
      return true;
    }
  }
  return false;
}
wx.onTouchStart((e) => {
  const t = e.touches[0]; if (!t) return;
  // 先尝试命中按钮
  if (dispatchTap(t.clientX, t.clientY)) return;
  if (state === STATE.PLAY && isInStage(t.clientX, t.clientY)) {
    touching = true;
    dropX = stageTouchToDesignX(t.clientX);
  }
});
wx.onTouchMove((e) => {
  if (!touching) return;
  const t = e.touches[0]; if (!t) return;
  if (state === STATE.PLAY) {
    dropX = Math.max(WALL_L + 1, Math.min(WALL_R - 1, stageTouchToDesignX(t.clientX)));
  }
});
wx.onTouchEnd((e) => {
  if (!touching) return;
  touching = false;
  if (state === STATE.PLAY) dropPiece();
});
wx.onTouchCancel(() => { touching = false; });

// 后台返回时帧循环不会停（小游戏自带管理），但保险起见监听一下
wx.onShow && wx.onShow(() => track('app_show'));
wx.onHide && wx.onHide(() => track('app_hide'));

// ========== 7. 启动 ==========
reset();
track('app_launch');
loop();
