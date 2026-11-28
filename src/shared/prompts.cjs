// AI에 보내는 지시문과 응답 해석. 브라우저(아티팩트)와 서버가 같은 문장을 쓴다.
// 브라우저에서는 engine.cjs 뒤에 이어 붙으므로 그쪽 상수를 그대로 쓴다.

const E = typeof module !== 'undefined' && module.exports ? require('./engine.cjs') : { CATEGORIES, COLORS, STYLES, MOODS, WARMTH, daysBetween, todayStr, feelTemp };

const ENUMS = [
  `category: ${Object.keys(E.CATEGORIES).join(' | ')} (${Object.values(E.CATEGORIES).join(', ')})`,
  `color: ${Object.keys(E.COLORS).join(' | ')}`,
  'warmth: 1~5 정수 (1 한여름용, 2 여름·얇은 것, 3 간절기, 4 겨울, 5 한겨울·패딩급)',
  `styles: ${Object.keys(E.STYLES).join(' | ')} 중 1~2개 (${Object.values(E.STYLES).join(', ')})`,
].join('\n');

function tagPrompt() {
  return [
    '사진 속 옷 한 벌을 옷장 앱에 등록하려고 합니다. 사진에서 가장 중심이 되는 옷 하나만 보고 아래 형식의 JSON 객체 하나만 답하세요. 다른 말은 쓰지 마세요.',
    '',
    '{"name": "한국어로 12자 이내의 짧은 이름 (예: 네이비 옥스퍼드 셔츠)", "category": "...", "color": "...", "warmth": 3, "styles": ["..."]}',
    '',
    ENUMS,
    '',
    '색은 가장 넓은 면적의 색으로 고르고, 목록에 딱 맞는 색이 없으면 가장 가까운 색을 고르세요. 청바지·청자켓은 denim입니다.',
  ].join('\n');
}

// 옷마다 i1, i2 … 짧은 별칭을 붙여 보낸다. 긴 id를 그대로 보내면 틀리게 돌려주기 쉽다.
function buildLook({ items, ctx, wornIds, logs, exclude, hasImage, today }) {
  const day = today || E.todayStr();
  const alias = new Map(), back = new Map();
  items.forEach((it, i) => { alias.set(it.id, 'i' + (i + 1)); back.set('i' + (i + 1), it.id); });
  const ex = new Set(exclude || []);

  const lines = items.map((it) => {
    const flags = [];
    if (it.laundryUntil && it.laundryUntil >= day) flags.push('세탁 중');
    if (ex.has(it.id)) flags.push('방금 추천함');
    if (it.lastWorn) flags.push(`${E.daysBetween(it.lastWorn, day)}일 전 입음`); else flags.push('입은 기록 없음');
    return `${alias.get(it.id)} | ${E.CATEGORIES[it.category]} | ${E.COLORS[it.color] ? E.COLORS[it.color].ko : it.color} | 두께 ${it.warmth} | ${(it.styles || []).map((s) => E.STYLES[s]).join('·') || '-'} | ${it.name} | ${flags.join(', ')}`;
  });

  const disliked = new Map(), liked = new Map();
  for (const l of logs || []) {
    if (l.decision === 'rejected' && l.rejectReason === 'dislike') for (const s of l.swaps || []) disliked.set(s.itemId, (disliked.get(s.itemId) || 0) + 1);
    if (l.decision === 'accepted' && l.chosenId) liked.set(l.chosenId, (liked.get(l.chosenId) || 0) + 1);
  }
  const fmt = (m) => [...m].filter(([id]) => alias.has(id)).map(([id, n]) => `${alias.get(id)}(${n}회)`).join(', ');

  const c = ctx || {};
  const ctxLines = [
    `날씨: 최저 ${c.tmin}℃, 최고 ${c.tmax}℃${c.rain ? ', 비 예보 있음' : ''}`,
    `원하는 분위기: ${E.MOODS[c.mood] ? E.MOODS[c.mood].ko : '정하지 않음'}`,
    `오늘 일정: ${c.schedule ? String(c.schedule).slice(0, 80) : '없음'}`,
  ];

  const wornPart = hasImage
    ? '첨부한 사진은 이 사람이 지금 옷장 앞에서 입고 있는 모습입니다. 얼굴이나 사람에 대한 평가는 하지 말고 옷만 보세요. 먼저 입고 있는 옷을 종류별로 알아보고, 옷장 목록에 같은 옷이 있으면 그 별칭을 id에 적으세요. 확신이 서지 않으면 id는 null로 두고 본 대로 적으세요.'
    : `지금 입고 있는 옷: ${(wornIds || []).map((id) => alias.get(id)).filter(Boolean).join(', ') || '없음'}. worn에는 이 옷들을 그대로 적으세요.`;

  const prompt = [
    '당신은 옷장 옆 화면에서 아침 옷 입기를 돕는 스타일리스트입니다. 이 사람은 이미 옷을 입었고, 전체 코디를 새로 받고 싶은 게 아니라 "여기서 뭐 하나만 바꾸면 좋을지"를 알고 싶어 합니다.',
    '',
    wornPart,
    '',
    '[오늘]',
    ...ctxLines,
    '',
    '[옷장] 별칭 | 종류 | 색 | 두께(1 한여름~5 한겨울) | 스타일 | 이름 | 상태',
    ...lines,
    '',
    '[지난 반응]',
    `싫다고 한 추천: ${fmt(disliked) || '없음'}`,
    `골라 입은 추천: ${fmt(liked) || '없음'}`,
    '',
    '[할 일]',
    '1. 지금 차림을 오늘 날씨, 분위기, 일정에 비춰 보고 한 줄 평(verdict)을 쓰세요. 괜찮으면 괜찮다고 하세요. 한국어 40자 이내, 존댓말.',
    '2. 바꾸거나 더하면 좋을 자리 한 군데를 정하고, 그 자리에 넣을 옷을 옷장에서 1~3개 고르세요. 기온상 겉옷이 필요한데 없으면 겉옷을 더하는 것이 우선입니다. 지금 차림에 문제가 없으면 다른 느낌을 낼 수 있는 옷을 1~2개만 제안하세요.',
    '3. 반드시 옷장 목록에 있는 옷만 고르세요. "세탁 중", "방금 추천함"이 붙은 옷과 지금 입고 있는 옷은 고르지 마세요. 싫다고 한 옷은 피하고, 한동안 안 입은 옷이 잘 맞으면 우선하세요.',
    '4. 각 추천의 reason은 한국어 25자 이내로, 이 사람이 바로 납득할 구체적인 이유를 쓰세요.',
    '',
    '아래 형식의 JSON 객체 하나만 답하세요. 다른 말은 쓰지 마세요.',
    '{"worn": [{"id": "i3 또는 null", "category": "top", "color": "navy", "name": "짧은 이름", "warmth": 3, "styles": ["neat"], "box": [0.2, 0.1, 0.8, 0.5]}], "verdict": "…", "swaps": [{"replace": "바꿀 옷의 별칭, 더하는 것이면 null", "item": "i7", "reason": "…"}]}',
    '',
    ENUMS,
    hasImage ? 'box: 사진에서 그 옷이 차지하는 영역 [왼쪽, 위, 오른쪽, 아래], 각 값은 0~1 비율. 얼굴이 들어가지 않게 잡으세요. 사진이 없으면 null.' : 'box: null',
  ].join('\n');

  return { prompt, back };
}

// 별칭을 실제 id로 되돌린다. 내용 검증은 engine의 sanitizeLook이 한다.
function parseLook(raw, back) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const real = (a) => (typeof a === 'string' && back.has(a.trim()) ? back.get(a.trim()) : null);
  return {
    verdict: r.verdict,
    worn: (Array.isArray(r.worn) ? r.worn : []).map((w) => ({ ...w, id: real(w && w.id) })),
    swaps: (Array.isArray(r.swaps) ? r.swaps : []).map((s) => ({ replaceId: real(s && s.replace), itemId: real(s && s.item), reason: s && s.reason })),
  };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { tagPrompt, buildLook, parseLook };
}
