/* 从全部人物数据抽取「语义关系网」：
   - 权重 w：该人物在其他人物的小传 / 年表事件中被提及的总次数（含跨条累计）
   - 关联 deg：与之共现过的不同人物数
   - 边 count：两人共现的条目数；type=主导关系类型（由上下文关键词判定）
     k=亲属·宗族  v=君臣·统属  f=敌对·交兵  a=同盟·协作  o=其他共现
   输出 data-network.js */
const fs = require('fs');
const path = require('path');
const SRC = path.join(__dirname, '..', 'docs');   // 站点源目录

global.window = {};
const html = fs.readFileSync(path.join(SRC, 'people.html'), 'utf8');
const srcs = [...html.matchAll(/<script src="(data-[^"]+)"/g)].map(m => m[1]);
srcs.forEach(f => require(path.join(SRC, f)));

// 复刻 people.html 的 ALL 组装逻辑
const W = global.window;
const ALL = []
  .concat(W.P_WEI || [], W.P_SHU || [], W.P_WU || [], W.P_QUN || [], W.P_JIN || []);

console.log('人物总数', ALL.length);

// 姓名索引
const byName = {};
ALL.forEach(p => { byName[p.n] = p; });

/* 姓名 / 字号索引：
   小传与年表常用「字」称呼（玄德、孟德、孔明…），只匹配本名会漏掉大量共现。
   别名表 = 本名 + 字（≥2 字且不与任何本名冲突），统一映射到规范人名。 */
const alias = {};
ALL.forEach(p => { alias[p.n] = p.n; });
ALL.forEach(p => {
  const z = (p.z || '').trim();
  if (z.length >= 2 && !alias[z]) alias[z] = p.n;
});
// 按长度降序排列别名，避免短名抢占（如「刘璋」不会被「刘」截走）
const names = Object.keys(alias).sort((a, b) => b.length - a.length);
console.log('可匹配别名数', names.length, '（本名 ' + ALL.length + '）');

const ERA = [
  { id: 'p0', name: '东汉衰亡', min: 150, max: 184 },
  { id: 'p1', name: '黄巾之乱', min: 184, max: 190 },
  { id: 'p2', name: '群雄割据', min: 190, max: 200 },
  { id: 'p3', name: '三分雏形', min: 200, max: 220 },
  { id: 'p4', name: '三国鼎立', min: 220, max: 263 },
  { id: 'p5', name: '三国归晋', min: 263, max: 290 }
];
function eraOf(p) {
  const ev = p.e || [];
  const y = ev.length ? Number(ev[0][0]) : NaN;
  if (!isFinite(y)) return 'p2';
  for (const e of ERA) if (y >= e.min && y < e.max) return e.id;
  return y < 184 ? 'p0' : 'p5';
}

/* ---------- 关系类型判定 ----------
   取被提及者姓名前后各 14 字作为上下文，按固定优先级匹配。
   优先级：亲属 > 敌对 > 君臣 > 同盟 > 其他。
   刻意不用「子/兄/弟/主/与」这类单字——「天子」「太子」「公子」「主簿」
   会大量误判为亲属或君臣，因此亲属一律走「之子/长子/兄弟/父子」等词。 */
const REL_RULES = [
  ['k', /结义|义兄弟|义子|养子|亲子|之子|之弟|之兄|之女|之侄|之甥|之妻|之夫|之父|之母|之叔|之伯|长子|次子|三子|四子|幼子|少子|胞兄|胞弟|亲兄|亲弟|族兄|族弟|从弟|从兄|从子|堂弟|堂兄|兄长|弟弟|父子|母子|父女|母女|兄弟|兄妹|姐弟|姊妹|姐妹|夫妇|夫妻|妻室|妻|娶|尚主|宗室|宗族|宗亲|族人|同族|家兄|舍弟|贤弟|女婿|驸马|太后|国舅/],
  ['f', /斩|擒|大败|击败|击破|打败|战败|讨伐|征讨|讨|伐|攻|拒|围|刺|诛|害|戮|敌|叛|袭|劫|弑|鸩|缢|缚|执|逐|追|杀|破|降伏|收降|枭首|夷族/],
  ['v', /主公|明公|主上|主君|麾下|部将|帐下|属下|隶属|拜为|封为|加封|进位|任命|领兵|统率|都督|节制|统领|遣|召见|举荐|荐|辟为|迁为|拜|托孤|辅政|受禅/],
  ['a', /联盟|结盟|同盟|联合|联手|会师|会盟|相助|救援|援助|援兵|借兵|同往|同行|相随|随同|协同|投奔|归顺|归附|依附|约为|让与|许之|共讨|共击|同讨|同伐|合力|合兵|相结|相善|友善|交好|厚待|善待/]
];
const CTX = 14;
function classify(text, pos, len) {
  const s = Math.max(0, pos - CTX);
  const ctx = text.slice(s, pos + len + CTX);
  for (const [t, re] of REL_RULES) if (re.test(ctx)) return t;
  return 'o';
}

// 统计
const mention = {};   // name -> 被提及次数
const edges = {};     // "a|b" -> {c: 共现条目数, t: {k:n,f:n,v:n,a:n,o:n}}
const eraHit = {};    // name -> {eraId: 次数}

function edgeOf(a, b) {
  const k = a < b ? a + '|' + b : b + '|' + a;
  if (!edges[k]) edges[k] = { a: a, b: b, c: 0, t: {} };
  return edges[k];
}
function addEdge(a, b, type) {
  if (a === b) return;
  const e = edgeOf(a, b);
  e.c += 1;
  e.t[type] = (e.t[type] || 0) + 1;
}

ALL.forEach(p => {
  const evs = (p.e || []).map(x => ({ y: Number(x[0]), t: String(x[1]) }));
  const texts = [{ y: null, t: p.g || '' }].concat(evs);
  texts.forEach(rec => {
    const seenHere = {};
    names.forEach(nm => {
      const who = alias[nm];                 // 别名 → 规范人名
      if (who === p.n) return;               // 自己的本名或字，跳过
      const txt = rec.t;
      if (!txt) return;
      const pos = txt.indexOf(nm);
      if (pos === -1) return;
      // 同一条文本里同一个人只记一次（本名与字同时出现也只算一次）
      if (seenHere[who]) return;
      seenHere[who] = 1;
      mention[who] = (mention[who] || 0) + 1;
      addEdge(p.n, who, classify(txt, pos, nm.length));
      const q = byName[who];
      if (q) {
        const er = rec.y != null ? eraOf({ e: [[rec.y, '']] }) : null;
        if (er) { eraHit[who] = eraHit[who] || {}; eraHit[who][er] = (eraHit[who][er] || 0) + 1; }
      }
    });
  });
});

/* ---------- 第二数据源：时间轴 ----------
   人物小传普遍很短（如孙权全文不含「周瑜」二字），仅靠小传会漏掉大量真实关联。
   时间轴里有 58 场战役的「关键人物」名单（k），以及战役/事件/群体轨迹的长文（d/t/intro），
   是质量更高的共现来源：同一场战役、同一条大事记中出现的人，视为一次共现。 */
const TL_FILES = ['data-timeline.js', 'data-timeline2.js', 'data-timeline-p0.js',
  'data-timeline-pol.js', 'data-timeline-pol2.js', 'data-timeline-more.js'];
TL_FILES.forEach(f => { try { require(path.join(SRC, f)); } catch (e) { console.log('跳过', f, e.message); } });

const TL_ITEMS = [];
['TL_A', 'TL_B', 'TL_C', 'TL_P0', 'TL_POL', 'TL_POL2', 'TL_MORE',
 'TL_POL_PATCHED', 'TL_POL2_PATCHED'].forEach(k => {
  const v = W[k]; if (!v) return;
  const periods = Array.isArray(v) ? v : Object.keys(v).map(x => v[x]);
  periods.forEach(p => {
    if (!p || typeof p !== 'object') return;
    Object.keys(p).forEach(kk => {
      const arr = p[kk];
      if (Array.isArray(arr)) arr.forEach(it => { if (it && typeof it === 'object' && !Array.isArray(it)) TL_ITEMS.push(it); });
    });
  });
});
console.log('时间轴条目', TL_ITEMS.length);

// 判断某人属于交战方数组 a 的哪一方；-1 = 无法判定
function groupIdx(name, aArr) {
  if (!Array.isArray(aArr)) return -1;
  for (let i = 0; i < aArr.length; i++) if (String(aArr[i]).indexOf(name) >= 0) return i;
  return -1;
}

let tlBattles = 0, tlTexts = 0;
TL_ITEMS.forEach(it => {
  // (1) 战役关键人物名单：两两连线，能分出敌我就标敌对/同盟，否则标「同役」
  if (Array.isArray(it.k) && it.k.length > 1) {
    tlBattles++;
    const ks = it.k.filter(n => byName[n]);
    for (let i = 0; i < ks.length; i++) {
      for (let j = i + 1; j < ks.length; j++) {
        const gi = groupIdx(ks[i], it.a), gj = groupIdx(ks[j], it.a);
        let t = 'b';
        if (gi >= 0 && gj >= 0) t = (gi === gj) ? 'a' : 'f';
        addEdge(ks[i], ks[j], t);
      }
    }
    ks.forEach(n => { mention[n] = (mention[n] || 0) + 1; });
  }
  // (2) 战役/事件长文：别名共现；判定不出具体关系时记为「同役·共事」而非「其他」
  const txts = [it.d, it.t, it.intro].filter(x => typeof x === 'string' && x.length > 3);
  if (!txts.length) return;
  tlTexts++;
  // 先在整条条目里收集「出现的人 → 首次出现处的上下文类型」
  const hit = {};
  txts.forEach(txt => {
    names.forEach(nm => {
      const who = alias[nm];
      if (!byName[who] || hit[who]) return;
      const pos = txt.indexOf(nm);
      if (pos === -1) return;
      /* 时间轴长文一律记「同役·共事」：这类文本满是「破/攻/讨/斩」等战事词，
         若照搬小传的关键词判定，会把同袍误判为敌对（如孙权—周瑜）。
         只有能明确分出交战方的战役名单才标敌对 / 同盟。 */
      hit[who] = 'b';
      mention[who] = (mention[who] || 0) + 1;
    });
  });
  const ks = Object.keys(hit);
  for (let i = 0; i < ks.length; i++) {
    for (let j = i + 1; j < ks.length; j++) addEdge(ks[i], ks[j], 'b');
  }
});
console.log('其中含关键人物名单的条目', tlBattles, '· 含长文的条目', tlTexts);

/* ---------- 第三数据源：人工校订关系表 ----------
   文本抽取只能发现「同句共现」，而父子、兄弟、君臣这类关系在小传里往往不同句出现。
   人工表覆盖文本推断的类型（人工判断优先），并在 NET_CURATED 中登记，供界面标注。 */
const CUR = require('./_relations_curated.js');
const curated = {};            // "a|b" -> 类型
let curUsed = 0, curMiss = [];
Object.keys(CUR).forEach(type => {
  (CUR[type] || []).forEach(pair => {
    const [a, b] = pair;
    if (!byName[a] || !byName[b]) { curMiss.push(a + '—' + b); return; }
    const k = a < b ? a + '|' + b : b + '|' + a;
    if (curated[k] && curated[k] !== type)
      console.log('  · 兼类：' + a + '—' + b + ' 同时标 ' + curated[k] + ' 与 ' + type + '，取 ' + type);
    curated[k] = type;
  });
});
Object.keys(curated).forEach(k => {
  const [a, b] = k.split('|');
  addEdge(a, b, curated[k]);
  if (edges[k].c === 1) edges[k].c = 2;     // 人工补入、文本未命中者给一个基础权重
  curUsed++;
});
console.log('人工校订关系', curUsed, curMiss.length ? '（未匹配到人物：' + curMiss.join('、') + '）' : '');

// 节点
const nodes = ALL.map(p => {
  const erMain = (function () {
    const h = eraHit[p.n] || {};
    let best = eraOf(p), bv = -1;
    Object.keys(h).forEach(k => { if (h[k] > bv) { bv = h[k]; best = k; } });
    return best;
  })();
  return {
    n: p.n, z: p.z || '', f: p.f, c: p.c,
    w: mention[p.n] || 0,
    era: erMain
  };
});

// 度数
const deg = {};
Object.keys(edges).forEach(k => {
  const [a, b] = k.split('|');
  deg[a] = (deg[a] || 0) + 1;
  deg[b] = (deg[b] || 0) + 1;
});
nodes.forEach(n => { n.deg = deg[n.n] || 0; });

// 边：主导类型 = 计数最高的类型；平手时按 k > f > v > a > o
/* 主导类型：按「明确程度」加权计数后取最大。
   「同役·共事」「其他共现」是泛化标签，出现次数天然多于「亲属/君臣/敌对」，
   若直接比次数，父子关系会被大量同役共现淹没，故给明确关系更高权重。 */
const TIE = ['k', 'f', 'v', 'a', 'b', 'o'];
const SPEC_W = { k: 2.2, v: 2.0, f: 1.7, a: 2.2, b: 1.0, o: 0.8 };
function dominant(t) {
  let best = 'o', bv = -1;
  for (const key of TIE) {
    const v = (t[key] || 0) * (SPEC_W[key] || 1);
    if (v > bv) { bv = v; best = key; }
  }
  return best;
}
const links = Object.keys(edges).map(k => {
  const e = edges[k];
  // 人工校订优先于任何统计推断
  let type = curated[k] || dominant(e.t);
  // 同阵营且非人工校订的「敌对」多半是战役文本噪音（同袍在某条交兵记录里同现），
  // 降级为同役；跨阵营的敌对保留。
  if (type === 'f' && !curated[k]) {
    const fa = factionOf(e.a), fb = factionOf(e.b);
    if (fa && fa === fb) type = 'b';
  }
  return [e.a, e.b, e.c, type];
}).sort((x, y) => y[2] - x[2]);

function factionOf(name) {
  const p = byName[name];
  return p ? p.f : null;
}

nodes.sort((a, b) => b.w - a.w);

const TYPES = {
  k: { name: '亲属 · 宗族', color: '#8d3025', dash: '' },
  v: { name: '君臣 · 统属', color: '#476b86', dash: '' },
  f: { name: '敌对 · 交兵', color: '#a8452f', dash: '5 3' },
  a: { name: '同盟 · 协作', color: '#527b5c', dash: '' },
  b: { name: '同役 · 共事', color: '#8a7355', dash: '' },
  o: { name: '其他共现', color: '#b3a693', dash: '2 3' }
};

const stat = {};
links.forEach(l => { stat[l[3]] = (stat[l[3]] || 0) + 1; });

console.log('边总数', links.length);
console.log('边类型分布:', Object.keys(stat).map(k => TYPES[k].name + ' ' + stat[k]).join(' · '));
console.log('权重 TOP12:');
nodes.slice(0, 12).forEach(n => console.log('  ' + n.n.padEnd(6) + ' 被提及 ' + String(n.w).padStart(3) + ' 次 · 关联 ' + n.deg + ' 人'));
console.log('零权重人数', nodes.filter(n => n.w === 0).length);

const out = '/* 关系网数据（由 _mknet.js 从全量人物数据自动抽取，勿手工编辑）\n'
  + '   w=在他人物的小传/年表中被提及总次数  deg=共现过的不同人物数  era=主要活跃期\n'
  + '   边 = [a, b, 共现条目数, 关系类型]  类型: k=亲属宗族 v=君臣统属 f=敌对交兵 a=同盟协作 b=同役共事 o=其他共现\n'
  + '   类型由被提及处的上下文关键词自动判定，属文本推断，仅供参考 */\n'
  + 'window.NET_NODES=' + JSON.stringify(nodes) + ';\n'
  + 'window.NET_LINKS=' + JSON.stringify(links) + ';\n'
  + 'window.NET_ERA=' + JSON.stringify(ERA) + ';\n'
  + 'window.NET_TYPES=' + JSON.stringify(TYPES) + ';\n'
  + 'window.NET_CURATED=' + JSON.stringify(Object.keys(curated)) + ';\n';
fs.writeFileSync(path.join(SRC, 'data-network.js'), out, 'utf8');
console.log('\n输出 data-network.js ' + (fs.statSync('data-network.js').size / 1024).toFixed(0) + ' KB');
