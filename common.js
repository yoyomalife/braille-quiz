/* 점자 구구단 퀴즈 — 선생님·학생 공통 코드 (저장소 · 로그인 · 점자 · 화면 도우미) */

/* ---------- 1. 저장소 어댑터 ---------- */
const TS = {".sv": "timestamp"};
function splitPath(p){ return p.split("/").filter(Boolean); }
function getAt(obj, p){ let o = obj; for (const k of splitPath(p)) { if (o == null) return null; o = o[k]; } return o === undefined ? null : o; }
function setAt(obj, p, v){
  const ks = splitPath(p); let o = obj;
  for (let i = 0; i < ks.length - 1; i++) { if (o[ks[i]] == null || typeof o[ks[i]] !== "object") o[ks[i]] = {}; o = o[ks[i]]; }
  if (v === null || v === undefined) delete o[ks[ks.length - 1]]; else o[ks[ks.length - 1]] = v;
}
function resolveTS(v){
  if (v && typeof v === "object") {
    if (v[".sv"] === "timestamp") return Date.now();
    const out = Array.isArray(v) ? [] : {}; for (const k in v) out[k] = resolveTS(v[k]); return out;
  }
  return v;
}

/* 데모: 같은 브라우저 탭끼리 localStorage + BroadcastChannel로 연결. 탭마다 다른 사용자(sessionStorage) */
function LocalDB(){
  const KEY = "bq_demo_db"; const ch = ("BroadcastChannel" in window) ? new BroadcastChannel("bq_demo") : null;
  let root = JSON.parse(localStorage.getItem(KEY) || "{}"); const subs = new Set();
  function fire(){ for (const s of subs) { const v = getAt(root, s.path); const j = JSON.stringify(v); if (j !== s.last) { s.last = j; s.cb(v == null ? null : JSON.parse(j)); } } }
  function commit(){ localStorage.setItem(KEY, JSON.stringify(root)); if (ch) ch.postMessage(1); fire(); }
  if (ch) ch.onmessage = () => { root = JSON.parse(localStorage.getItem(KEY) || "{}"); fire(); };
  window.addEventListener("storage", e => { if (e.key === KEY) { root = JSON.parse(e.newValue || "{}"); fire(); } });
  let uid = sessionStorage.getItem("bq_demo_uid");
  if (!uid) { uid = "u" + Math.random().toString(36).slice(2, 10); sessionStorage.setItem("bq_demo_uid", uid); }
  return {
    demo: true,
    set: async (p, v) => { setAt(root, p, resolveTS(v)); commit(); },
    update: async (p, obj) => { for (const k in obj) setAt(root, p + "/" + k, resolveTS(obj[k])); commit(); },
    get: async (p) => { const v = getAt(root, p); return v == null ? null : JSON.parse(JSON.stringify(v)); },
    remove: async (p) => { setAt(root, p, null); commit(); },
    on: (p, cb) => { const s = {path: p, cb, last: undefined}; subs.add(s); setTimeout(() => { const v = getAt(root, p); s.last = JSON.stringify(v); cb(v == null ? null : JSON.parse(s.last)); }, 0); return () => subs.delete(s); },
    now: () => Date.now(),
    auth: {
      current: async () => ({uid, email: "demo", isAnonymous: false}),
      anon: async () => uid,
      login: async () => uid,
      logout: async () => {},
      uid: () => uid,
    },
  };
}

function loadScript(src){ return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); }); }
async function FirebaseDB(cfg){
  const V = "10.12.2", B = `https://www.gstatic.com/firebasejs/${V}/`;
  await loadScript(B + "firebase-app-compat.js");
  await Promise.all([loadScript(B + "firebase-database-compat.js"), loadScript(B + "firebase-auth-compat.js")]);
  firebase.initializeApp(cfg); const d = firebase.database(), A = firebase.auth(); let offset = 0;
  d.ref(".info/serverTimeOffset").on("value", s => offset = s.val() || 0);
  const fix = v => JSON.parse(JSON.stringify(v), (k, x) => (x && x[".sv"] === "timestamp") ? firebase.database.ServerValue.TIMESTAMP : x);
  const firstUser = new Promise(res => { const off = A.onAuthStateChanged(u => { off(); res(u); }); });
  return {
    demo: false,
    set: (p, v) => d.ref(p).set(fix(v)),
    update: (p, obj) => d.ref(p).update(fix(obj)),
    get: async (p) => (await d.ref(p).get()).val(),
    remove: (p) => d.ref(p).remove(),
    on: (p, cb) => { const r = d.ref(p); const h = r.on("value", s => cb(s.val()), () => {}); return () => r.off("value", h); },
    now: () => Date.now() + offset,
    auth: {
      current: async () => { await firstUser; return A.currentUser; },
      anon: async () => { await firstUser; if (!A.currentUser) await A.signInAnonymously(); return A.currentUser.uid; },
      login: async (email, pw) => (await A.signInWithEmailAndPassword(email, pw)).user.uid,
      logout: () => A.signOut(),
      uid: () => A.currentUser && A.currentUser.uid,
    },
  };
}
async function connectDB(){
  if (window.FIREBASE_CONFIG) return FirebaseDB(window.FIREBASE_CONFIG);
  document.getElementById("demoBar").style.display = "block"; return LocalDB();
}

/* ---------- 2. 점자 (한국 점자 규정: 수표 ③④⑤⑥, 숫자 1~0, 곱셈 ①⑥, 등호 ②⑤ 두 칸) ---------- */
const NUMSIGN = [3,4,5,6];
const DIGIT = {"1":[1],"2":[1,2],"3":[1,4],"4":[1,4,5],"5":[1,5],"6":[1,2,4],"7":[1,2,4,5],"8":[1,2,5],"9":[2,4],"0":[2,4,5]};
const MUL = [1,6], EQ = [2,5];
const numCells = n => [{d:NUMSIGN, hl:true, lab:"수표"}].concat(String(n).split("").map(c => ({d:DIGIT[c], lab:c})));
const problemCells = (a, b) => [...numCells(a), {d:MUL, lab:"×"}, ...numCells(b)];
const DOT_ORDER = [1,4,2,5,3,6];
function cellHTML(c, opt = {}){
  const dots = DOT_ORDER.map(n => `<span class="dot ${c.d.includes(n) ? "on" : ""}"></span>`).join("");
  const box = `<div class="bcell ${opt.hlNum && c.hl ? "hl" : ""}">${dots}</div>`;
  return opt.labels ? `<div>${box}<div class="blab">${c.lab}</div></div>` : box;
}
const brailleHTML = (cells, opt = {}) => `<div class="braille" style="${opt.style || ""}">${cells.map(c => cellHTML(c, opt)).join("")}</div>`;

/* ---------- 3. 화면 도우미 ---------- */
const $app = document.getElementById("app");
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
const R = code => `rooms/${code}`;
const KEYS = ["①","②","③","④"];
const rnd = n => Math.floor(Math.random() * n);
let unsubs = []; const clearSubs = () => { unsubs.forEach(u => u()); unsubs = []; };
let tick = null; const clearTick = () => { if (tick) clearInterval(tick); tick = null; };
function setWho(t){ document.getElementById("who").textContent = t; }
function podiumHTML(top){
  const slot = (i, cls) => top[i] ? `<div class="pod ${cls}"><div class="nm">${esc(top[i].name)}</div><div class="sc">${top[i].score}점</div><div class="bl">${i + 1}</div></div>` : `<div class="pod ${cls}"></div>`;
  return `<div class="podium">${slot(1, "p2")}${slot(0, "p1")}${slot(2, "p3")}</div>`;
}
function failScreen(e){
  $app.innerHTML = `<div class="card center"><h2>연결 실패</h2><p>인터넷 연결이나 Firebase 설정을 확인해 주세요.</p><p class="muted small">${esc(e && e.message || e)}</p></div>`;
}
