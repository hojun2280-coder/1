// 추천 엔진: 화면(DOM)과 무관한 순수 함수만 둔다.
// 브라우저에서는 다른 스크립트와 이어 붙여 쓰고, Node에서는 require로 불러 쓴다.

const CATEGORIES = { top: '상의', bottom: '하의', outer: '아우터', dress: '원피스', shoes: '신발', acc: '소품' };

// n: 무채색·기본색 여부. 기본색은 어떤 색과도 무난하게 맞는다.
const COLORS = {
  black: { ko: '블랙', hex: '#22232a', n: 1 },
  white: { ko: '화이트', hex: '#f3f2ee', n: 1 },
  gray: { ko: '그레이', hex: '#9b9ea6', n: 1 },
  navy: { ko: '네이비', hex: '#22305a', n: 1 },
  beige: { ko: '베이지', hex: '#d8c6a3', n: 1 },
  brown: { ko: '브라운', hex: '#7b5337', n: 1 },
  denim: { ko: '데님', hex: '#5d80ab', n: 1 },
  khaki: { ko: '카키', hex: '#74764c', n: 0 },
  green: { ko: '그린', hex: '#2f7d57', n: 0 },
  blue: { ko: '블루', hex: '#2f62d0', n: 0 },
  skyblue: { ko: '하늘색', hex: '#a3cbee', n: 0 },
  red: { ko: '레드', hex: '#c7372f', n: 0 },
  pink: { ko: '핑크', hex: '#efa9bf', n: 0 },
  yellow: { ko: '옐로', hex: '#efcd4b', n: 0 },
  orange: { ko: '오렌지', hex: '#e6852f', n: 0 },
  purple: { ko: '퍼플', hex: '#7a56b3', n: 0 },
};

const STYLES = { casual: '캐주얼', neat: '단정', dressy: '꾸민', sporty: '스포티' };

const MOODS = {
  comfy: { ko: '편하게', want: ['casual', 'sporty'], avoid: [] },
  neat: { ko: '단정하게', want: ['neat'], avoid: ['sporty'] },
  dressy: { ko: '기분 내게', want: ['dressy', 'neat'], avoid: ['sporty'] },
};

const WARMTH = ['', '한여름', '여름', '간절기', '겨울', '한겨울'];

const ANALOGOUS = ['blue-skyblue', 'green-khaki', 'pink-red', 'orange-yellow', 'blue-purple', 'pink-purple'];
const CLASH = ['green-red', 'orange-pink', 'purple-yellow', 'green-purple', 'purple-red', 'orange-purple', 'green-pink', 'orange-red', 'blue-orange', 'khaki-pink'];

const pairKey = (a, b) => [a, b].sort().join('-');

function todayStr(d) {
  const x = d ? new Date(d) : new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${x.getFullYear()}-${p(x.getMonth() + 1)}-${p(x.getDate())}`;
}

function daysBetween(a, b) {
  const pa = new Date(a + 'T00:00:00'), pb = new Date(b + 'T00:00:00');
  return Math.round((pb - pa) / 86400000);
}

// 낮 활동 시간 기준 체감 기온. 최고 기온에 무게를 더 둔다.
function feelTemp(ctx) {
  const lo = Number(ctx && ctx.tmin), hi = Number(ctx && ctx.tmax);
  if (Number.isFinite(lo) && Number.isFinite(hi)) return Math.round((lo + 2 * hi) / 3);
  if (Number.isFinite(hi)) return hi;
  if (Number.isFinite(lo)) return lo;
  return 18;
}

// 기온별 옷차림 기준. in: 상·하의 두께 범위, out: 아우터 두께 범위.
function need(t) {
  if (t >= 28) return { inMin: 1, inMax: 1, outMin: 0, outMax: 0, outer: 'no' };
  if (t >= 23) return { inMin: 1, inMax: 2, outMin: 0, outMax: 0, outer: 'no' };
  if (t >= 20) return { inMin: 2, inMax: 3, outMin: 2, outMax: 2, outer: 'optional' };
  if (t >= 17) return { inMin: 2, inMax: 3, outMin: 2, outMax: 3, outer: 'optional' };
  if (t >= 12) return { inMin: 3, inMax: 4, outMin: 2, outMax: 3, outer: 'yes' };
  if (t >= 9) return { inMin: 3, inMax: 4, outMin: 3, outMax: 4, outer: 'yes' };
  if (t >= 5) return { inMin: 3, inMax: 5, outMin: 4, outMax: 5, outer: 'yes' };
  return { inMin: 4, inMax: 5, outMin: 4, outMax: 5, outer: 'yes' };
}

// 두께가 범위에서 얼마나 벗어났는지. 음수면 얇고 양수면 두껍다.
function warmthGap(item, nd) {
  if (item.category === 'shoes' || item.category === 'acc') return 0;
  const w = Number(item.warmth) || 3;
  const lo = item.category === 'outer' ? nd.outMin : nd.inMin;
  const hi = item.category === 'outer' ? nd.outMax : nd.inMax;
  if (item.category === 'outer' && nd.outer === 'no') return w;
  if (w < lo) return w - lo;
  if (w > hi) return w - hi;
  return 0;
}

function moodFit(item, mood) {
  const m = MOODS[mood];
  const st = item.styles || [];
  if (!m || !st.length) return 1;
  if (st.some((s) => m.want.includes(s))) return 2;
  if (st.some((s) => m.avoid.includes(s))) return 0;
  return 1;
}

function colorPair(a, b) {
  const ca = COLORS[a], cb = COLORS[b];
  if (!ca || !cb) return 1.5;
  if (ca.n && cb.n) return a === b && a !== 'black' && a !== 'white' ? 1.8 : 2.2;
  if (ca.n || cb.n) return 2.5;
  if (a === b) return 1.8;
  const k = pairKey(a, b);
  if (ANALOGOUS.includes(k)) return 1.8;
  if (CLASH.includes(k)) return 0.2;
  return 1.0;
}

// 신발·소품은 색 조합 판단에서 비중을 낮춘다.
function harmony(item, others) {
  const rest = others.filter((o) => o && o.id !== item.id);
  if (!rest.length) return 2;
  let sum = 0, wsum = 0;
  for (const o of rest) {
    const w = o.category === 'shoes' || o.category === 'acc' ? 0.5 : 1;
    sum += colorPair(item.color, o.color) * w;
    wsum += w;
  }
  return sum / wsum;
}

function isAvailable(item, today) {
  return !(item.laundryUntil && item.laundryUntil >= (today || todayStr()));
}

// 지난 기록에서 배우는 가감점: 싫다고 한 옷은 덜, 골랐던 옷은 더, 오래 안 입은 옷은 조금 더.
function historyAdj(item, logs, today) {
  let disliked = 0, liked = 0;
  for (const l of logs || []) {
    const shown = (l.swaps || []).some((s) => s.itemId === item.id);
    if (!shown) continue;
    if (l.decision === 'rejected' && l.rejectReason === 'dislike') disliked++;
    if (l.decision === 'accepted' && l.chosenId === item.id) liked++;
  }
  let adj = -0.8 * Math.min(disliked, 3) + 0.4 * Math.min(liked, 3);
  const t = today || todayStr();
  if (!item.lastWorn) adj += 0.4;
  else {
    const d = daysBetween(item.lastWorn, t);
    if (d >= 14) adj += 0.6;
    else if (d <= 1 && (item.category === 'top' || item.category === 'bottom')) adj -= 0.5;
  }
  return { adj, disliked, liked, stale: !item.lastWorn || daysBetween(item.lastWorn, t) >= 14 };
}

function slotsOf(worn) {
  const s = {};
  for (const it of worn) if (it && !s[it.category]) s[it.category] = it;
  return s;
}

function rangeText(ctx) {
  const lo = Number(ctx.tmin), hi = Number(ctx.tmax);
  if (Number.isFinite(lo) && Number.isFinite(hi)) return `${lo}~${hi}℃`;
  return `${feelTemp(ctx)}℃`;
}

// 카드마다 다른 이유를 보여준다. 첫 카드는 날씨 이유, 나머지는 그 옷만의 특징을 앞세운다.
function reasonFor(s, i, pool, ctx, target, rest) {
  const c = s.c, parts = s.parts;
  const out = [];
  const weather = target.why === 'cold' || target.why === 'thin' || target.why === 'warm';
  if (weather && i === 0) out.push(`${rangeText(ctx)}에 맞는 두께예요`);
  if (parts.liked) out.push('전에 골랐던 옷이에요');
  const ws = pool.map((p) => Number(p.c.warmth) || 3);
  if (pool.length > 1 && Math.max(...ws) !== Math.min(...ws)) {
    if (c.warmth === Math.max(...ws)) out.push('이 중 가장 따뜻해요');
    else if (c.warmth === Math.min(...ws)) out.push('이 중 가장 가벼워요');
  }
  if (parts.mood === 2 && ctx.mood) out.push(`'${MOODS[ctx.mood].ko}'에 어울려요`);
  if (parts.stale) out.push('한동안 안 입은 옷이에요');
  const col = COLORS[c.color];
  if (col && rest.length) {
    if (!col.n && rest.every((r) => COLORS[r.color] && COLORS[r.color].n)) out.push(`${col.ko} 색이 포인트가 돼요`);
    else if (col.n && parts.harm >= 2.2) out.push(`무난한 ${col.ko} 색이에요`);
  }
  if (!out.length) out.push(weather ? `${rangeText(ctx)}에 맞는 두께예요` : '지금 옷과 무난하게 맞아요');
  return out.slice(0, 2).join(' · ');
}

// 지금 입은 옷에서 바꾸면 좋을 한 군데를 찾고, 그 자리에 넣을 후보를 최대 3개 고른다.
function recommendLocal({ wornIds, items, ctx, logs, exclude, today }) {
  const day = today || todayStr();
  const byId = new Map(items.map((i) => [i.id, i]));
  const worn = (wornIds || []).map((id) => byId.get(id)).filter(Boolean);
  const t = feelTemp(ctx || {});
  const nd = need(t);
  const slots = slotsOf(worn);
  const mood = ctx && ctx.mood;
  let target = null, verdict = '';

  if (nd.outer === 'yes' && !slots.outer) {
    target = { slot: 'outer', replaceId: null, why: 'cold' };
    verdict = `오늘 ${rangeText(ctx)}, 겉옷을 걸치는 게 좋아요.`;
  } else {
    // 문제가 가장 큰 자리를 찾는다.
    let worst = null;
    for (const it of worn) {
      if (it.category === 'acc') continue;
      const gap = warmthGap(it, nd);
      const mf = moodFit(it, mood);
      const hm = harmony(it, worn);
      let sev = Math.abs(gap) * 2;
      let why = gap < 0 ? 'thin' : gap > 0 ? 'warm' : null;
      if (mf === 0 && sev < 1.5) { sev = Math.max(sev, 1.5); why = 'mood'; }
      if (hm < 1 && sev < 1.2) { sev = Math.max(sev, 1.2); why = 'color'; }
      if (why && (!worst || sev > worst.sev)) worst = { it, sev, why };
    }
    if (worst && worst.it.category === 'outer' && nd.outer === 'no') {
      verdict = `오늘 ${rangeText(ctx)}, 겉옷은 벗어도 돼요.`;
      worst = null;
    }
    if (worst) {
      target = { slot: worst.it.category, replaceId: worst.it.id, why: worst.why };
      const nm = worst.it.name;
      verdict = worst.why === 'thin' ? `${nm} 대신 더 따뜻한 옷이 좋아요.`
        : worst.why === 'warm' ? `${nm} 대신 더 가벼운 옷이 좋아요.`
        : worst.why === 'mood' ? `'${MOODS[mood].ko}'라면 ${nm} 대신 이런 옷이 어울려요.`
        : `${nm} 색이 다른 옷과 부딪혀요.`;
    } else {
      if (!verdict) verdict = worn.length ? '지금 코디 괜찮아요.' : '오늘 날씨에 맞춰 골라봤어요.';
      // 문제가 없으면 겉옷(선택) 또는 상의 자리에 다른 느낌을 제안한다.
      if (nd.outer === 'optional' && !slots.outer) target = { slot: 'outer', replaceId: null, why: 'option' };
      else {
        const base = slots.outer && nd.outer !== 'no' ? slots.outer : slots.top || slots.dress || slots.bottom;
        target = base ? { slot: base.category, replaceId: base.id, why: 'option' } : { slot: 'top', replaceId: null, why: 'option' };
      }
    }
  }

  if (ctx && ctx.rain) verdict += ' 비 소식이 있어요. 우산을 챙기세요.';

  const skip = new Set([...(exclude || []), ...worn.map((w) => w.id)]);
  const rest = worn.filter((w) => w.id !== target.replaceId);
  const scored = [];
  for (const c of items) {
    if (c.category !== target.slot || skip.has(c.id) || !isAvailable(c, day)) continue;
    const gap = Math.abs(warmthGap(c, nd));
    const mf = moodFit(c, mood);
    const hm = harmony(c, rest);
    const h = historyAdj(c, logs, day);
    const score = (3 - 1.5 * gap) * 1.2 + mf + hm + h.adj;
    scored.push({ c, gap, score, parts: { mood: mf, harm: hm, liked: h.liked > 0, stale: h.stale && !!c.lastWorn } });
  }
  let pool = scored.filter((s) => s.gap === 0);
  if (!pool.length) pool = scored.filter((s) => s.gap <= 1);
  pool.sort((a, b) => b.score - a.score);

  const top = pool.slice(0, 3);
  const swaps = top.map((s, i) => ({
    slot: target.slot,
    replaceId: target.replaceId,
    itemId: s.c.id,
    reason: reasonFor(s, i, top, ctx || {}, target, rest),
  }));

  if (!swaps.length && target.why !== 'option') {
    verdict += ` 옷장에 맞는 ${CATEGORIES[target.slot]}가 없어요. 옷을 더 등록해 주세요.`;
  }
  return { verdict: verdict.trim(), swaps, source: 'local', temp: t, why: target.why };
}

// AI가 돌려준 결과를 믿지 않고 한 번 거른다: 없는 옷, 세탁 중인 옷, 이미 입은 옷, 자리가 안 맞는 옷은 버린다.
function sanitizeLook(res, items, opts) {
  const day = (opts && opts.today) || todayStr();
  const byId = new Map(items.map((i) => [i.id, i]));
  const exclude = new Set((opts && opts.exclude) || []);
  const worn = [];
  for (const w of Array.isArray(res && res.worn) ? res.worn : []) {
    if (!w || typeof w !== 'object') continue;
    const id = w.id && byId.has(w.id) ? w.id : null;
    if (id && worn.some((x) => x.id === id)) continue;
    const src = id ? byId.get(id) : w;
    const category = CATEGORIES[src.category] ? src.category : null;
    if (!category) continue;
    const box = Array.isArray(w.box) && w.box.length === 4 && w.box.every((n) => typeof n === 'number' && n >= 0 && n <= 1) && w.box[2] > w.box[0] && w.box[3] > w.box[1] ? w.box : null;
    worn.push({
      id, category,
      color: COLORS[src.color] ? src.color : 'gray',
      name: String(src.name || CATEGORIES[category]).slice(0, 30),
      warmth: Math.min(5, Math.max(1, Math.round(Number(src.warmth) || 3))),
      styles: (Array.isArray(src.styles) ? src.styles : []).filter((s) => STYLES[s]),
      box,
    });
  }
  const wornIds = new Set(worn.map((w) => w.id).filter(Boolean));
  const swaps = [];
  for (const s of Array.isArray(res && res.swaps) ? res.swaps : []) {
    if (!s || typeof s !== 'object') continue;
    const it = byId.get(s.itemId);
    if (!it || wornIds.has(it.id) || exclude.has(it.id) || !isAvailable(it, day)) continue;
    if (swaps.some((x) => x.itemId === it.id)) continue;
    const rep = s.replaceId && byId.has(s.replaceId) && wornIds.has(s.replaceId) ? s.replaceId : null;
    if (rep && byId.get(rep).category !== it.category) continue;
    swaps.push({ slot: it.category, replaceId: rep, itemId: it.id, reason: String(s.reason || '').slice(0, 60) || '지금 옷과 잘 맞아요' });
    if (swaps.length === 3) break;
  }
  return { worn, swaps, verdict: String((res && res.verdict) || '').slice(0, 120), source: 'ai' };
}

// 사진 태깅 결과 정리.
function sanitizeTag(res) {
  const r = res && typeof res === 'object' ? res : {};
  const category = CATEGORIES[r.category] ? r.category : 'top';
  return {
    name: String(r.name || CATEGORIES[category]).slice(0, 30),
    category,
    color: COLORS[r.color] ? r.color : 'gray',
    warmth: Math.min(5, Math.max(1, Math.round(Number(r.warmth) || 3))),
    styles: (Array.isArray(r.styles) ? r.styles : []).filter((s) => STYLES[s]).slice(0, 3),
  };
}

function finalOutfit(log) {
  const ids = [...(log.wornIds || [])];
  if (log.decision === 'accepted' && log.chosenId) {
    const sw = (log.swaps || []).find((s) => s.itemId === log.chosenId);
    const i = sw && sw.replaceId ? ids.indexOf(sw.replaceId) : -1;
    if (i >= 0) ids.splice(i, 1, log.chosenId); else ids.push(log.chosenId);
  }
  return ids;
}

// 2주 테스트 지표: 사용한 날, 수락률, 1주차와 2주차 비교.
function computeStats(logs) {
  const ls = [...(logs || [])].sort((a, b) => (a.ts || 0) - (b.ts || 0));
  const days = new Set(ls.map((l) => l.date));
  const decided = ls.filter((l) => l.decision && (l.swaps || []).length);
  const rate = (arr) => {
    const d = arr.filter((l) => l.decision && (l.swaps || []).length);
    return d.length ? Math.round((d.filter((l) => l.decision === 'accepted').length / d.length) * 100) : null;
  };
  const first = ls.length ? ls[0].date : null;
  const wk = (n) => ls.filter((l) => Math.floor(daysBetween(first, l.date) / 7) === n);
  const lat = ls.map((l) => l.latencyMs).filter((n) => Number.isFinite(n));
  return {
    sessions: ls.length,
    days: days.size,
    accepted: decided.filter((l) => l.decision === 'accepted').length,
    kept: decided.filter((l) => l.decision === 'kept').length,
    rejected: decided.filter((l) => l.decision === 'rejected').length,
    acceptRate: rate(ls),
    week1Rate: first ? rate(wk(0)) : null,
    week2Rate: first ? rate(wk(1)) : null,
    week1Days: first ? new Set(wk(0).map((l) => l.date)).size : 0,
    week2Days: first ? new Set(wk(1).map((l) => l.date)).size : 0,
    avgLatencySec: lat.length ? Math.round(lat.reduce((a, b) => a + b, 0) / lat.length / 100) / 10 : null,
  };
}

const REJECT_REASONS = { dislike: '마음에 안 듦', notime: '시간 없음', other: '기타' };
const DECISIONS = { accepted: '추천대로 입음', kept: '그대로 입음', rejected: '안 입음' };

function csvCell(v) {
  const s = v == null ? '' : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function toCSV(logs, items, household) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const nm = (id) => (byId.get(id) ? byId.get(id).name : '(삭제된 옷)');
  const head = ['가구', '프로필', '날짜', '시각', '분위기', '일정', '최저', '최고', '비', '날씨 출처', '입은 옷', '한 줄 평', '추천', '추천 방식', '추천까지(초)', '다시 추천 횟수', '결정', '고른 옷', '안 입은 이유'];
  const rows = [head];
  for (const l of [...logs].sort((a, b) => (a.ts || 0) - (b.ts || 0))) {
    const w = l.weather || {};
    rows.push([
      household || '', l.profile || '', l.date, l.ts ? new Date(l.ts).toTimeString().slice(0, 5) : '',
      MOODS[l.mood] ? MOODS[l.mood].ko : '', l.schedule || '', w.tmin, w.tmax, w.rain ? '예' : '아니오', w.src === 'auto' ? '자동' : '직접 입력',
      (l.wornIds || []).map(nm).concat((l.wornNew || []).map((n) => n + '(미등록)')).join(' / '),
      l.verdict || '',
      (l.swaps || []).map((s) => `${nm(s.itemId)}: ${s.reason}`).join(' / '),
      l.source === 'ai' ? 'AI' : '규칙', Number.isFinite(l.latencyMs) ? (l.latencyMs / 1000).toFixed(1) : '', l.rerolls || 0,
      DECISIONS[l.decision] || '미정', l.chosenId ? nm(l.chosenId) : '', REJECT_REASONS[l.rejectReason] || '',
    ]);
  }
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\n');
}

// 체험용 옷장. 사진 없이 색과 종류만 있다.
function sampleWardrobe() {
  const rows = [
    ['흰 반팔 티셔츠', 'top', 'white', 1, ['casual']],
    ['네이비 옥스퍼드 셔츠', 'top', 'navy', 3, ['neat']],
    ['스트라이프 긴팔 티', 'top', 'skyblue', 2, ['casual']],
    ['그레이 맨투맨', 'top', 'gray', 4, ['casual', 'sporty']],
    ['아이보리 니트', 'top', 'white', 4, ['neat', 'dressy']],
    ['블랙 터틀넥', 'top', 'black', 4, ['neat', 'dressy']],
    ['청바지', 'bottom', 'denim', 3, ['casual']],
    ['베이지 슬랙스', 'bottom', 'beige', 3, ['neat']],
    ['블랙 슬랙스', 'bottom', 'black', 3, ['neat', 'dressy']],
    ['그레이 조거 팬츠', 'bottom', 'gray', 3, ['sporty', 'casual']],
    ['카키 면 반바지', 'bottom', 'khaki', 1, ['casual']],
    ['네이비 가디건', 'outer', 'navy', 2, ['neat', 'casual']],
    ['브라운 재킷', 'outer', 'brown', 3, ['neat', 'dressy']],
    ['베이지 트렌치코트', 'outer', 'beige', 3, ['neat', 'dressy']],
    ['차콜 울 코트', 'outer', 'gray', 4, ['neat', 'dressy']],
    ['네이비 숏패딩', 'outer', 'navy', 5, ['casual']],
    ['흰 스니커즈', 'shoes', 'white', 3, ['casual']],
    ['브라운 로퍼', 'shoes', 'brown', 3, ['neat', 'dressy']],
  ];
  return rows.map(([name, category, color, warmth, styles]) => ({ name, category, color, warmth, styles, sample: true }));
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    CATEGORIES, COLORS, STYLES, MOODS, WARMTH, REJECT_REASONS, DECISIONS,
    todayStr, daysBetween, feelTemp, need, warmthGap, moodFit, colorPair, harmony, isAvailable, historyAdj,
    recommendLocal, sanitizeLook, sanitizeTag, finalOutfit, computeStats, toCSV, sampleWardrobe,
  };
}
