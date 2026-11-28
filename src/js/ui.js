// 화면. 상태(S)가 바뀌면 지금 보는 화면을 통째로 다시 그린다.

const $ = (s) => document.querySelector(s);

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
}

const GLYPH = {
  top: 'M16 8 8 14l4 7 4-3v22h16V18l4 3 4-7-8-6c-2 4-14 4-16 0Z',
  bottom: 'M15 8h18l2 32h-8l-3-22-3 22h-8Z',
  outer: 'M17 7 9 14l3 10 3-2v19h8V16l1-2 1 2v25h8V22l3 2 3-10-8-7-7 6Z',
  dress: 'M19 7l2 8-7 25h20l-7-25 2-8h-3c-1 3-3 3-4 0Z',
  shoes: 'M8 30c0-4 2-6 5-6h7l8 5c6 1 12 2 12 6v2H8Z',
  acc: 'M14 21h20l2 19H12ZM19 21c0-9 10-9 10 0h-3c0-5-4-5-4 0Z',
};

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// 옷 그림: 사진이 있으면 사진, 없으면 옷 색 바탕에 종류 그림.
function thumb(item) {
  const el = h('span', { class: 'thumb' });
  if (item.img) { el.append(h('img', { src: item.img, alt: '' })); return el; }
  const hex = (COLORS[item.color] || COLORS.gray).hex;
  el.style.background = hex;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48'); svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', GLYPH[item.category] || GLYPH.top);
  path.setAttribute('fill', luminance(hex) > 0.6 ? '#22232a' : '#ffffff');
  path.setAttribute('fill-opacity', '0.85');
  svg.append(path); el.append(svg);
  return el;
}

function dotscale(n) {
  return h('span', { class: 'dotscale', role: 'img', 'aria-label': `두께 ${n}단계 (${WARMTH[n]})` }, [1, 2, 3, 4, 5].map((i) => h('i', { class: i <= n ? 'f' : '' })));
}

const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const DEFAULT_SETTINGS = { profiles: [{ id: 'p1', name: '나' }], active: 'p1', city: 'seoul', manual: null, household: '' };

const S = {
  items: [], logs: [], settings: { ...DEFAULT_SETTINGS },
  view: 'mirror', mood: ls.get('mood', 'comfy'), schedule: '', wx: { tmin: 10, tmax: 18, rain: false, src: 'unset' },
  session: null, filter: 'all', adding: null, voiceOK: false, camOK: ls.get('camOK', true), ready: false,
};

const myItems = () => S.items.filter((i) => i.profile === S.settings.active);
const myLogs = () => S.logs.filter((l) => l.profile === S.settings.active);
const itemById = (id) => S.items.find((i) => i.id === id);
const activeProfile = () => S.settings.profiles.find((p) => p.id === S.settings.active) || S.settings.profiles[0];

// ── 저장 ──────────────────────────────────────────────
function persist(p) { return p.catch(() => toast('저장하지 못했어요. 연결 상태를 확인해 주세요.')); }
function saveItem(it) {
  if (!S.items.includes(it)) S.items.push(it);
  return persist(Store.put('item_' + it.id, it));
}
function deleteItem(it) { S.items = S.items.filter((i) => i !== it); return persist(Store.del('item_' + it.id)); }
function saveLog(l) {
  if (!S.logs.includes(l)) S.logs.push(l);
  return persist(Store.put('log_' + l.id, l));
}
function saveSettings() { return persist(Store.put('settings', S.settings)); }
function newItem(fields) {
  return { id: uid(), profile: S.settings.active, name: '새 옷', category: 'top', color: 'gray', warmth: 3, styles: ['casual'], img: null, laundryUntil: null, lastWorn: null, wornCount: 0, createdAt: todayStr(), ...fields };
}

// ── 알림과 시트 ─────────────────────────────────────────
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 3600);
}

let sheetBuild = null;
function openSheet(title, build) {
  sheetBuild = build;
  $('#sheetTitle').textContent = title;
  redrawSheet();
  $('#scrim').hidden = false;
  $('#sheetClose').focus();
}
function redrawSheet() {
  if (!sheetBuild) return;
  const body = $('#sheetBody');
  const top = body.scrollTop;
  body.replaceChildren(...[sheetBuild()].flat().filter(Boolean));
  body.scrollTop = top;
}
function closeSheet() { sheetBuild = null; $('#scrim').hidden = true; }

function optButtons(options, isOn, onPick, cls) {
  return h('div', { class: 'opts ' + (cls || '') }, options.map(([val, label, style]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(isOn(val)), 'aria-label': style ? label : null, title: style ? label : null, onclick: () => onPick(val) }, style ? '' : label);
    if (style) b.style.background = style;
    return b;
  }));
}

// ── 그리기 ─────────────────────────────────────────────
function renderChrome() {
  const b = $('#aiBadge');
  b.textContent = AI.mode === 'local' ? '규칙 추천' : AI.canSee ? 'AI 연결됨' : 'AI 연결됨 (사진 제외)';
  b.className = 'badge' + (AI.mode === 'local' ? '' : ' on');
  $('#profileBtn').textContent = activeProfile().name;
  document.querySelectorAll('.tabs a').forEach((a) => {
    if (a.dataset.tab === S.view) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

function render() {
  if (!S.ready) return;
  renderChrome();
  const view = $('#view');
  const parts = S.view === 'closet' ? closetView() : S.view === 'log' ? logView() : S.view === 'setup' ? setupView() : mirrorView();
  view.replaceChildren(...parts.flat().filter(Boolean));
}

// ── 오늘 ──────────────────────────────────────────────
function weatherBlock() {
  const w = S.wx;
  const city = (CITIES[S.settings.city] || CITIES.seoul)[0];
  const meta = w.src === 'auto' ? `${city} · 자동` : w.src === 'manual' ? '직접 입력' : '오늘 기온을 입력해 주세요';
  return h('section', { class: 'weather' },
    h('span', { class: 'temp' }, `${w.tmin}~${w.tmax}℃`),
    w.rain && h('span', { class: 'rain' }, '비'),
    h('span', { class: 'meta', style: w.src === 'auto' || w.src === 'manual' ? null : 'color:var(--warn)' }, meta),
    h('button', { class: 'btn', type: 'button', onclick: openWeather }, '날씨 바꾸기'));
}

function moodSeg() {
  return h('div', { class: 'seg', role: 'group', 'aria-label': '오늘의 분위기' }, Object.entries(MOODS).map(([k, m]) =>
    h('button', { type: 'button', 'aria-pressed': String(S.mood === k), onclick: () => { S.mood = k; ls.set('mood', k); render(); } }, m.ko)));
}

let stopVoice = null;
function scheduleField() {
  const input = h('input', { type: 'text', id: 'schedule', value: S.schedule, maxlength: '80', placeholder: '오늘 일정이 있나요? (예: 교수님 면담)', 'aria-label': '오늘 일정', oninput: (e) => { S.schedule = e.target.value; } });
  const mic = S.voiceOK && h('button', { class: 'btn', type: 'button', id: 'micBtn', onclick: () => {
    if (stopVoice) { stopVoice(); return; }
    mic.textContent = '듣는 중…';
    stopVoice = Voice.listen((t) => { S.schedule = t.slice(0, 80); input.value = S.schedule; }, () => { stopVoice = null; mic.textContent = '말하기'; });
  } }, '말하기');
  return h('div', { class: 'field' }, input, mic);
}

function tagCard(sw, demo) {
  const it = demo ? sw.item : itemById(sw.itemId);
  if (!it) return null;
  const rep = sw.replaceId && (demo ? null : itemById(sw.replaceId));
  return h('article', { class: 'tag' },
    thumb(it),
    h('span', { class: 'slot' }, rep ? `${CATEGORIES[it.category]} 바꾸기` : `${CATEGORIES[it.category]} ${sw.replaceId ? '바꾸기' : '더하기'}`),
    h('h3', { text: it.name }),
    h('p', { class: 'why', text: sw.reason }),
    !demo && h('button', { class: 'btn primary', type: 'button', onclick: () => decide('accepted', { chosenId: it.id }) }, '이걸로 입을게요'),
    !demo && h('button', { class: 'link', type: 'button', onclick: () => markLaundry(it) }, '지금 세탁 중이에요'));
}

function demoBlock() {
  const items = sampleWardrobe().map((s, i) => ({ ...s, id: 'demo' + i, lastWorn: null }));
  const r = recommendLocal({ wornIds: ['demo0', 'demo6'], items, ctx: { tmin: S.wx.tmin, tmax: S.wx.tmax, rain: S.wx.rain, mood: S.mood }, logs: [] });
  const byId = new Map(items.map((i) => [i.id, i]));
  return h('section', { class: 'stack' },
    h('span', { class: 'demo-note' }, '예시 · 흰 반팔 티셔츠와 청바지를 입고 섰을 때'),
    h('p', { class: 'verdict', text: r.verdict }),
    h('div', { class: 'tags' }, r.swaps.map((s) => tagCard({ ...s, item: byId.get(s.itemId) }, true))));
}

function mirrorView() {
  const head = [weatherBlock(), moodSeg(), scheduleField()];
  const ses = S.session;

  if (!myItems().length) {
    return [...head,
      h('section', { class: 'empty' },
        h('h2', {}, '먼저 옷장에 옷을 넣어 주세요'),
        h('p', { class: 'muted' }, '자주 입는 옷 30벌 정도면 충분해요. 옷을 입고 이 앞에 서면, 옷장 안에서 "이것만 바꿔보세요"를 골라 드려요.'),
        h('div', { class: 'row' },
          h('button', { class: 'btn primary', type: 'button', onclick: () => { location.hash = '#closet'; } }, '옷 등록하러 가기'),
          h('button', { class: 'btn', type: 'button', onclick: addSamples }, '샘플 옷장으로 써보기'))),
      demoBlock()];
  }

  if (!ses) {
    return [...head,
      h('section', { class: 'stage plain' },
        h('button', { class: 'btn primary big', type: 'button', id: 'shootBtn', onclick: onShoot }, '지금 입은 옷 찍기'),
        h('button', { class: 'btn', type: 'button', onclick: () => openPicker([]) }, '사진 없이 입은 옷 고르기'),
        !AI.canSee && h('p', { class: 'note' }, AI.mode === 'local'
          ? 'AI가 연결되지 않아 사진을 읽을 수 없어요. 입은 옷을 직접 고르면 규칙 기반으로 추천해 드려요.'
          : '이 화면에서는 사진을 보낼 수 없어요. 입은 옷을 직접 골라 주세요.'))];
  }

  if (ses.phase === 'camera') {
    return [...head, h('section', { class: 'stage' },
      h('div', { class: 'cam' },
        h('video', { id: 'camVideo', playsinline: true, muted: true, autoplay: true }),
        h('div', { class: 'count', id: 'camCount', 'aria-live': 'assertive' }),
        h('div', { class: 'guide' }, '목 아래부터 옷이 다 보이게 서 주세요')),
      h('button', { class: 'btn', type: 'button', onclick: resetSession }, '취소'))];
  }

  if (ses.phase === 'thinking') {
    return [...head, h('section', { class: 'stage' },
      h('div', { class: 'thinking', role: 'status' }, h('span', { class: 'dots' }, h('i'), h('i'), h('i')), ses.blob && !ses.worn ? '입은 옷을 보는 중…' : '옷장에서 고르는 중…'),
      h('button', { class: 'btn', type: 'button', onclick: resetSession }, '취소'))];
  }

  const wornRow = h('div', { class: 'worn' },
    ses.worn.map((w) => {
      const it = w.id && itemById(w.id);
      if (it) return h('span', { class: 'pill' }, thumb(it), h('span', { text: it.name }));
      return h('span', { class: 'pill new' }, thumb(w), h('span', { text: w.name }), h('button', { type: 'button', onclick: () => addWornToCloset(w) }, '옷장에 추가'));
    }),
    h('button', { class: 'link', type: 'button', onclick: () => openPicker(ses.worn.map((w) => w.id).filter(Boolean)) }, ses.worn.length ? '고치기' : '입은 옷 고르기'));

  if (ses.phase === 'reject') {
    return [...head, h('section', { class: 'stage' },
      h('h2', {}, '어떤 점이 안 맞았나요?'),
      h('div', { class: 'row' }, Object.entries(REJECT_REASONS).map(([k, label]) => h('button', { class: 'btn', type: 'button', onclick: () => decide('rejected', { rejectReason: k }) }, label))),
      h('button', { class: 'btn quiet', type: 'button', onclick: () => { ses.phase = 'result'; render(); } }, '돌아가기'))];
  }

  const has = ses.swaps.length > 0;
  return [...head, h('section', { class: 'stage' },
    h('div', { class: 'stack' }, h('span', { class: 'section-title' }, '지금 입은 옷'), wornRow),
    h('p', { class: 'verdict', text: ses.verdict }),
    has && h('div', { class: 'tags' }, ses.swaps.map((s) => tagCard(s))),
    h('div', { class: 'row' },
      h('button', { class: has ? 'btn' : 'btn primary', type: 'button', onclick: () => decide('kept') }, has ? '그대로 입을게요' : '확인'),
      has && h('button', { class: 'btn quiet', type: 'button', onclick: reroll }, '다른 추천'),
      has && h('button', { class: 'btn quiet', type: 'button', onclick: () => { ses.phase = 'reject'; render(); } }, '안 입을래요')),
    h('p', { class: 'note small' }, `${ses.source === 'ai' ? 'AI 추천' : '규칙 기반 추천'} · ${(ses.log.latencyMs / 1000).toFixed(1)}초`))];
}

function resetSession() {
  const ses = S.session;
  if (ses && ses.stream) ses.stream.getTracks().forEach((t) => t.stop());
  S.session = null;
  render();
}

function onShoot() {
  const live = !claudeRT && S.camOK && navigator.mediaDevices && navigator.mediaDevices.getUserMedia;
  if (live) liveCapture(); else $('#camFile').click();
}

// 3초 세고 찍는다. 태블릿에서 한 걸음 물러설 시간을 준다.
async function liveCapture() {
  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false });
  } catch {
    S.camOK = false; ls.set('camOK', false);
    toast('카메라를 바로 쓸 수 없어요. 버튼을 다시 누르면 사진을 찍거나 고를 수 있어요.');
    return;
  }
  const ses = { phase: 'camera', stream };
  S.session = ses; render();
  const video = $('#camVideo');
  video.srcObject = stream;
  await video.play().catch(() => {});
  for (let n = 3; n >= 1; n--) {
    const c = $('#camCount');
    if (S.session !== ses || !c) { stream.getTracks().forEach((t) => t.stop()); return; }
    c.textContent = String(n);
    await sleep(1000);
  }
  if (S.session !== ses) { stream.getTracks().forEach((t) => t.stop()); return; }
  const cv = document.createElement('canvas');
  cv.width = video.videoWidth || 720; cv.height = video.videoHeight || 960;
  cv.getContext('2d').drawImage(video, 0, 0, cv.width, cv.height);
  stream.getTracks().forEach((t) => t.stop());
  cv.toBlob((blob) => { if (blob && S.session === ses) handlePhoto(blob); else resetSession(); }, 'image/jpeg', 0.9);
}

function handlePhoto(blob) {
  if (!AI.canSee) {
    S.session = null; render();
    toast('사진을 읽으려면 AI 연결이 필요해요. 입은 옷을 직접 골라 주세요.');
    openPicker([]);
    return;
  }
  runLook({ blob });
}

const toWorn = (it) => ({ id: it.id, name: it.name, category: it.category, color: it.color, warmth: it.warmth, styles: it.styles, box: null });

// 추천 한 번. 사진(blob)이면 AI가 입은 옷부터 알아보고, worn이 있으면 그 옷 기준으로 고른다.
async function runLook({ blob, worn, exclude, prev, isReroll }) {
  const items = myItems();
  const ctx = { tmin: S.wx.tmin, tmax: S.wx.tmax, rain: S.wx.rain, mood: S.mood, schedule: S.schedule.trim() };
  const logs = myLogs();
  const ex = exclude || [];
  const ses = { phase: 'thinking', blob: blob || (prev && prev.blob) || null, worn: worn || null };
  S.session = ses; render();
  const t0 = performance.now();
  const wornIds = worn ? worn.map((w) => w.id).filter(Boolean) : null;

  let ai = null, note = '';
  if (AI.mode !== 'local') {
    try { ai = await AI.look({ items, ctx, wornIds, logs, exclude: ex }, worn ? null : blob); }
    catch (e) { note = AI.message(e); }
  }
  if (S.session !== ses) return;

  if (!worn && (!ai || !ai.worn.length)) {
    S.session = null; render();
    toast(note || '사진에서 옷을 찾지 못했어요. 입은 옷을 직접 골라 주세요.');
    openPicker([]);
    return;
  }

  const finalWorn = worn || ai.worn;
  const ids = finalWorn.map((w) => w.id).filter(Boolean);
  let verdict = ai ? ai.verdict : '', swaps = ai ? ai.swaps : [], source = ai && ai.swaps.length ? 'ai' : 'local';
  if (!swaps.length || !verdict) {
    const loc = recommendLocal({ wornIds: ids, items, ctx, logs, exclude: ex });
    if (!swaps.length) swaps = loc.swaps;
    if (!verdict || source === 'local') verdict = loc.verdict;
  }

  const log = (prev && prev.log) || { id: uid(), profile: S.settings.active, date: todayStr(), ts: Date.now(), rerolls: 0, latencyMs: Math.round(performance.now() - t0) };
  if (isReroll) log.rerolls++;
  Object.assign(log, {
    mood: ctx.mood, schedule: ctx.schedule, weather: { tmin: ctx.tmin, tmax: ctx.tmax, rain: ctx.rain, src: S.wx.src === 'auto' ? 'auto' : 'manual' },
    wornIds: ids, wornNew: finalWorn.filter((w) => !w.id).map((w) => w.name), verdict, swaps, source, decision: null, chosenId: null, rejectReason: null,
  });
  saveLog(log);
  S.session = { phase: 'result', blob: ses.blob, worn: finalWorn, verdict, swaps, source, log, shown: [...((prev && prev.shown) || []), ...swaps.map((s) => s.itemId)] };
  render();
  if (note) toast(note);
}

function reroll() {
  const ses = S.session;
  runLook({ worn: ses.worn, exclude: ses.shown, prev: ses, isReroll: true });
}

function markLaundry(it) {
  const d = new Date(); d.setDate(d.getDate() + 3);
  it.laundryUntil = todayStr(d);
  saveItem(it);
  const ses = S.session;
  ses.swaps = ses.swaps.filter((s) => s.itemId !== it.id);
  ses.log.swaps = ses.swaps;
  saveLog(ses.log);
  toast(`${it.name}: 3일 동안 추천에서 뺄게요.`);
  if (!ses.swaps.length) reroll(); else render();
}

function decide(decision, extra) {
  const ses = S.session;
  const log = ses.log;
  Object.assign(log, { decision, decidedAt: Date.now() }, extra || {});
  saveLog(log);
  const today = todayStr();
  for (const id of finalOutfit(log)) {
    const it = itemById(id);
    if (!it || it.lastWorn === today) continue;
    it.lastWorn = today; it.wornCount = (it.wornCount || 0) + 1;
    saveItem(it);
  }
  S.session = null; S.schedule = '';
  render();
  toast(decision === 'accepted' ? '기록했어요. 좋은 하루 보내세요.' : decision === 'kept' ? '그대로 입는 걸로 기록했어요.' : '알려주셔서 고마워요. 다음 추천에 반영할게요.');
}

async function addWornToCloset(w) {
  const ses = S.session;
  const it = newItem({ name: w.name, category: w.category, color: w.color, warmth: w.warmth, styles: w.styles && w.styles.length ? w.styles : ['casual'] });
  if (ses.blob && w.box) {
    try { it.img = await resizeImage(ses.blob, 360, { box: w.box, dataUrl: true, quality: 0.8 }); } catch { /* 사진 없이 등록 */ }
  }
  await saveItem(it);
  w.id = it.id;
  ses.log.wornIds = ses.worn.map((x) => x.id).filter(Boolean);
  ses.log.wornNew = ses.worn.filter((x) => !x.id).map((x) => x.name);
  saveLog(ses.log);
  render();
  toast('옷장에 추가했어요. 옷장에서 고칠 수 있어요.');
}

function openPicker(selected) {
  const sel = new Set(selected);
  const prev = S.session && S.session.phase === 'result' ? S.session : null;
  openSheet('지금 입은 옷 고르기', () => {
    const groups = Object.keys(CATEGORIES).map((cat) => {
      const list = myItems().filter((i) => i.category === cat);
      if (!list.length) return null;
      return h('div', { class: 'stack' }, h('span', { class: 'section-title' }, CATEGORIES[cat]),
        h('div', { class: 'pick' }, list.map((it) => h('button', { type: 'button', 'aria-pressed': String(sel.has(it.id)), onclick: () => { if (sel.has(it.id)) sel.delete(it.id); else sel.add(it.id); redrawSheet(); } }, thumb(it), h('span', { class: 'nm', text: it.name })))));
    });
    return [...groups,
      h('button', { class: 'btn primary', type: 'button', disabled: !sel.size, onclick: () => {
        const keepNew = prev ? prev.worn.filter((w) => !w.id) : [];
        const worn = [...myItems().filter((i) => sel.has(i.id)).map(toWorn), ...keepNew];
        closeSheet();
        runLook({ worn, prev });
      } }, sel.size ? `${sel.size}벌로 추천받기` : '입은 옷을 골라 주세요')];
  });
}

function openWeather() {
  const d = { tmin: S.wx.tmin, tmax: S.wx.tmax, rain: !!S.wx.rain };
  const step = (key, label) => h('div', {}, h('span', { class: 'lbl' }, label), h('div', { class: 'stepper' },
    h('button', { type: 'button', 'aria-label': label + ' 내리기', onclick: () => { d[key]--; if (d.tmin > d.tmax) d[key === 'tmin' ? 'tmax' : 'tmin'] = d[key]; redrawSheet(); } }, '−'),
    h('output', {}, `${d[key]}℃`),
    h('button', { type: 'button', 'aria-label': label + ' 올리기', onclick: () => { d[key]++; if (d.tmin > d.tmax) d[key === 'tmin' ? 'tmax' : 'tmin'] = d[key]; redrawSheet(); } }, '+')));
  openSheet('오늘 날씨', () => h('div', { class: 'form' },
    step('tmin', '최저 기온'), step('tmax', '최고 기온'),
    h('div', {}, h('span', { class: 'lbl' }, '비 또는 눈'), optButtons([[false, '없음'], [true, '있음']], (v) => d.rain === v, (v) => { d.rain = v; redrawSheet(); })),
    AI.server && h('div', {}, h('label', { for: 'citySel' }, '지역 (자동 날씨)'),
      h('select', { class: 'input', id: 'citySel', onchange: (e) => { S.settings.city = e.target.value; } }, Object.entries(CITIES).map(([k, c]) => h('option', { value: k, selected: S.settings.city === k }, c[0])))),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        S.settings.manual = { ...d, date: todayStr() };
        await saveSettings(); S.wx = { ...d, src: 'manual' }; closeSheet(); render();
      } }, '이 날씨로 저장'),
      AI.server && h('button', { class: 'btn', type: 'button', onclick: async () => {
        S.settings.manual = null; ls.set('wx', null);
        await saveSettings(); S.wx = await Weather.today(S.settings); closeSheet(); render();
      } }, '자동 날씨 쓰기')),
    !AI.server && h('p', { class: 'note' }, '이 화면에서는 날씨를 자동으로 받아올 수 없어, 하루에 한 번 직접 입력해요. 날씨 앱의 최저·최고 기온을 넣어 주세요.')));
}

// ── 옷장 ──────────────────────────────────────────────
function staleDays(it) { return it.lastWorn ? daysBetween(it.lastWorn, todayStr()) : null; }

function closetView() {
  const all = myItems();
  const today = todayStr();
  const filters = [['all', '전체'], ...Object.entries(CATEGORIES), ['laundry', '세탁 중']];
  const list = all.filter((i) => S.filter === 'all' || (S.filter === 'laundry' ? !isAvailable(i, today) : i.category === S.filter));
  const actions = h('div', { class: 'row' },
    h('button', { class: 'btn primary', type: 'button', disabled: !!S.adding, onclick: () => $('#addFile').click() }, S.adding ? `등록 중 ${S.adding.done}/${S.adding.total}` : '사진으로 옷 추가'),
    h('button', { class: 'btn', type: 'button', onclick: () => openEdit(newItem({}), true) }, '사진 없이 추가'));

  if (!all.length) {
    return [actions, h('section', { class: 'empty' },
      h('h2', {}, '옷장이 비어 있어요'),
      h('p', { class: 'muted' }, AI.canSee ? '옷 사진을 여러 장 한꺼번에 골라도 돼요. 종류, 색, 두께는 AI가 채우고 나중에 고칠 수 있어요.' : '옷 사진을 찍어 올리고 종류, 색, 두께를 골라 주세요.'),
      h('button', { class: 'btn', type: 'button', onclick: addSamples }, '샘플 옷장으로 써보기'))];
  }
  return [actions,
    h('div', { class: 'filters', role: 'group', 'aria-label': '종류로 보기' }, filters.map(([k, label]) => h('button', { type: 'button', 'aria-pressed': String(S.filter === k), onclick: () => { S.filter = k; render(); } }, label))),
    h('p', { class: 'muted small' }, `${list.length}벌`),
    h('div', { class: 'grid' }, list.map((it) => {
      const t = thumb(it);
      const sd = staleDays(it);
      if (!isAvailable(it, today)) t.append(h('span', { class: 'flag' }, '세탁 중'));
      else if (sd != null && sd >= 14) t.append(h('span', { class: 'flag' }, `${sd}일째 안 입음`));
      return h('button', { class: 'card', type: 'button', onclick: () => openEdit(it, false) }, t,
        h('span', { class: 'nm', text: it.name }),
        h('span', { class: 'sub' }, `${(COLORS[it.color] || COLORS.gray).ko} · `, dotscale(it.warmth), it.wornCount ? ` · ${it.wornCount}번` : ''));
    }))];
}

function openEdit(item, isNew) {
  const d = { name: item.name, category: item.category, color: item.color, warmth: item.warmth, styles: [...(item.styles || [])], laundry: !isAvailable(item, todayStr()) };
  let confirmDel = false;
  openSheet(isNew ? '옷 등록' : '옷 고치기', () => h('div', { class: 'form' },
    h('div', { class: 'preview' }, thumb({ ...item, ...d }),
      h('div', { class: 'grow' }, h('label', { for: 'itemName' }, '이름'),
        h('input', { class: 'input', type: 'text', id: 'itemName', value: d.name, maxlength: '30', oninput: (e) => { d.name = e.target.value; } }))),
    h('div', {}, h('span', { class: 'lbl' }, '종류'), optButtons(Object.entries(CATEGORIES), (v) => d.category === v, (v) => { d.category = v; redrawSheet(); })),
    h('div', {}, h('span', { class: 'lbl' }, `색: ${COLORS[d.color].ko}`), optButtons(Object.entries(COLORS).map(([k, c]) => [k, c.ko, c.hex]), (v) => d.color === v, (v) => { d.color = v; redrawSheet(); }, 'swatches')),
    h('div', {}, h('span', { class: 'lbl' }, '두께 (언제 입는 옷인가요)'), optButtons([1, 2, 3, 4, 5].map((n) => [n, WARMTH[n]]), (v) => d.warmth === v, (v) => { d.warmth = v; redrawSheet(); })),
    h('div', {}, h('span', { class: 'lbl' }, '스타일 (여러 개 가능)'), optButtons(Object.entries(STYLES), (v) => d.styles.includes(v), (v) => { d.styles = d.styles.includes(v) ? d.styles.filter((s) => s !== v) : [...d.styles, v]; redrawSheet(); })),
    !isNew && h('div', {}, h('span', { class: 'lbl' }, '상태'), optButtons([[false, '입을 수 있음'], [true, '세탁 중 (3일)']], (v) => d.laundry === v, (v) => { d.laundry = v; redrawSheet(); })),
    h('div', { class: 'row' },
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const was = !isAvailable(item, todayStr());
        const until = new Date(); until.setDate(until.getDate() + 3);
        Object.assign(item, { name: d.name.trim() || CATEGORIES[d.category], category: d.category, color: d.color, warmth: d.warmth, styles: d.styles, laundryUntil: d.laundry ? (was ? item.laundryUntil : todayStr(until)) : null });
        delete item.untagged;
        await saveItem(item); closeSheet(); render(); toast(isNew ? '옷장에 넣었어요.' : '고쳤어요.');
      } }, isNew ? '옷장에 넣기' : '저장'),
      !isNew && h('button', { class: 'btn danger', type: 'button', onclick: async () => {
        if (!confirmDel) { confirmDel = true; redrawSheet(); return; }
        await deleteItem(item); closeSheet(); render(); toast('옷장에서 뺐어요.');
      } }, confirmDel ? '정말 삭제할까요? 한 번 더 누르세요' : '삭제'))));
}

async function onAddFiles(files) {
  if (!files.length) return;
  S.adding = { done: 0, total: files.length }; render();
  let saved = 0, failed = 0, warned = false;
  for (const f of files) {
    try {
      const img = await resizeImage(f, 360, { dataUrl: true, quality: 0.8 });
      let tag = null;
      if (AI.canSee) {
        try { tag = await AI.tag(f); } catch (e) { if (!warned) { toast(AI.message(e)); warned = true; } }
      }
      const it = newItem({ ...(tag || {}), img, untagged: !tag });
      if (files.length === 1) { S.adding = null; render(); openEdit(it, true); return; }
      await saveItem(it); saved++;
    } catch { failed++; }
    S.adding.done++;
    if (S.view === 'closet') render();
  }
  S.adding = null; render();
  toast(`${saved}벌을 등록했어요.${failed ? ` ${failed}장은 읽지 못했어요.` : ''}${AI.canSee ? '' : ' 눌러서 종류와 색을 골라 주세요.'}`);
}

async function addSamples() {
  for (const s of sampleWardrobe()) await saveItem(newItem(s));
  render();
  toast('샘플 옷 18벌을 넣었어요. 설정에서 한꺼번에 지울 수 있어요.');
}

// ── 기록 ──────────────────────────────────────────────
function logView() {
  const logs = myLogs();
  const st = computeStats(logs);
  const pct = (n) => (n == null ? '–' : n + '%');
  const items = myItems();
  const most = [...items].filter((i) => i.wornCount > 0).sort((a, b) => b.wornCount - a.wornCount).slice(0, 4);
  const stale = items.filter((i) => { const d = staleDays(i); return d == null ? daysBetween(i.createdAt || todayStr(), todayStr()) >= 7 : d >= 14; }).slice(0, 8);
  const pillList = (arr, sub) => h('div', { class: 'worn' }, arr.map((it) => h('span', { class: 'pill' }, thumb(it), h('span', {}, it.name + sub(it)))));

  const exportRow = h('div', { class: 'row' },
    h('button', { class: 'btn', type: 'button', disabled: !logs.length, onclick: () => doSave(`closet-log-${todayStr()}.csv`, toCSV(logs, S.items, S.settings.household), 'text/csv') }, '기록 CSV 저장'),
    h('button', { class: 'btn', type: 'button', onclick: () => doSave(`closet-backup-${todayStr()}.json`, JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), settings: S.settings, items: S.items, logs: S.logs }), 'application/json') }, '전체 백업 저장'),
    h('button', { class: 'btn', type: 'button', onclick: () => $('#importFile').click() }, '백업 불러오기'));

  if (!logs.length) {
    return [h('section', { class: 'empty' }, h('h2', {}, '아직 기록이 없어요'),
      h('p', { class: 'muted' }, '추천을 받을 때마다 날씨, 입은 옷, 추천, 입었는지가 여기에 쌓여요. 2주 뒤 사용한 날 수와 추천 수락률을 볼 수 있어요.')), exportRow];
  }

  return [
    h('div', { class: 'stats' },
      h('div', { class: 'stat' }, h('b', {}, `${st.days}일`), h('span', {}, '사용한 날')),
      h('div', { class: 'stat' }, h('b', {}, `${st.sessions}번`), h('span', {}, '추천 받은 횟수')),
      h('div', { class: 'stat' }, h('b', {}, pct(st.acceptRate)), h('span', {}, `추천대로 입은 비율 (${st.accepted}/${st.accepted + st.kept + st.rejected})`)),
      h('div', { class: 'stat' }, h('b', {}, `${pct(st.week1Rate)} → ${pct(st.week2Rate)}`), h('span', {}, '1주차 → 2주차')),
      h('div', { class: 'stat' }, h('b', {}, st.avgLatencySec == null ? '–' : `${st.avgLatencySec}초`), h('span', {}, '추천까지 평균 시간'))),
    most.length ? h('section', { class: 'stack' }, h('span', { class: 'section-title' }, '자주 입은 옷'), pillList(most, (i) => ` · ${i.wornCount}번`)) : null,
    stale.length ? h('section', { class: 'stack' }, h('span', { class: 'section-title' }, '한동안 안 입은 옷'), pillList(stale, (i) => { const d = staleDays(i); return d == null ? ' · 기록 없음' : ` · ${d}일`; })) : null,
    h('section', { class: 'stack' }, h('span', { class: 'section-title' }, '날짜별 기록'),
      h('div', { class: 'list' }, [...logs].sort((a, b) => b.ts - a.ts).slice(0, 40).map((l) => {
        const names = (l.wornIds || []).map((id) => (itemById(id) || {}).name).filter(Boolean).join(', ');
        const chosen = l.chosenId && itemById(l.chosenId);
        return h('div', { class: 'logrow' },
          h('span', { class: 'd' }, l.date.slice(5).replace('-', '/')),
          h('span', { class: 'v', text: l.verdict || '' }),
          h('span', { class: 'r ' + (l.decision || 'none') }, DECISIONS[l.decision] || '미정'),
          h('span', { class: 's', text: `${l.weather.tmin}~${l.weather.tmax}℃ · ${MOODS[l.mood] ? MOODS[l.mood].ko : ''}${names ? ' · ' + names : ''}${chosen ? ' → ' + chosen.name : ''}${l.rejectReason ? ' · ' + REJECT_REASONS[l.rejectReason] : ''}` }));
      }))),
    exportRow];
}

async function doSave(name, text, mime) {
  try { await saveFile(name, text, mime); }
  catch (e) { if (!e || e.code !== 'declined') toast('이 화면에서는 파일을 저장할 수 없어요.'); }
}

async function onImport(file) {
  try {
    const j = JSON.parse(await file.text());
    if (!j || !Array.isArray(j.items) || !Array.isArray(j.logs)) throw new Error('shape');
    for (const it of j.items) if (it && it.id) { S.items = S.items.filter((x) => x.id !== it.id); await saveItem(it); }
    for (const l of j.logs) if (l && l.id) { S.logs = S.logs.filter((x) => x.id !== l.id); await saveLog(l); }
    if (j.settings && Array.isArray(j.settings.profiles)) {
      for (const p of j.settings.profiles) if (p && p.id && !S.settings.profiles.some((x) => x.id === p.id)) S.settings.profiles.push({ id: String(p.id), name: String(p.name || '이름 없음').slice(0, 12) });
      await saveSettings();
    }
    render(); toast(`옷 ${j.items.length}벌, 기록 ${j.logs.length}건을 불러왔어요.`);
  } catch { toast('백업 파일을 읽지 못했어요.'); }
}

// ── 설정 ──────────────────────────────────────────────
function setupView() {
  const store = Store.kind === 'cloud' ? 'Claude 계정에 저장돼요. 같은 계정으로 연 다른 기기에서도 같은 옷장이 보여요.'
    : Store.kind === 'device' ? '이 기기의 브라우저에만 저장돼요. 브라우저 데이터를 지우면 사라지니 기록 화면에서 백업을 받아 두세요.'
    : '이 환경에서는 저장할 수 없어요. 창을 닫으면 사라져요.';
  const ai = AI.mode === 'claude' ? '이 화면을 보는 사람의 Claude로 추천해요. 처음 쓸 때 허용 여부를 물어요.'
    : AI.mode === 'server' ? '서버에 설정된 Claude API 키로 추천해요.'
    : '연결된 AI가 없어 내장 규칙(기온, 분위기, 색 조합)으로 추천해요. 사진 인식은 쓸 수 없어요.';
  const samples = S.items.filter((i) => i.sample && i.profile === S.settings.active);
  let confirmWipe = false;
  const wipeBtn = h('button', { class: 'btn danger', type: 'button', onclick: async () => {
    if (!confirmWipe) { confirmWipe = true; wipeBtn.textContent = '정말 지울까요? 한 번 더 누르세요'; return; }
    for (const it of myItems()) await deleteItem(it);
    for (const l of myLogs()) { S.logs = S.logs.filter((x) => x !== l); await persist(Store.del('log_' + l.id)); }
    render(); toast('이 프로필의 옷과 기록을 지웠어요.');
  } }, '이 프로필의 옷과 기록 모두 지우기');

  return [
    h('div', { class: 'list' },
      h('div', { class: 'kv' }, h('span', {}, '프로필'), h('span', { class: 'val', text: S.settings.profiles.map((p) => p.name).join(', ') }), h('button', { class: 'btn', type: 'button', onclick: openProfiles }, '바꾸기·추가')),
      h('div', { class: 'stack' }, h('label', { for: 'household', style: 'font-weight:600' }, '가구 ID (기록 파일에 들어가요)'),
        h('input', { class: 'input', type: 'text', id: 'household', maxlength: '20', placeholder: '예: H03', value: S.settings.household || '', onchange: (e) => { S.settings.household = e.target.value.trim(); saveSettings(); } })),
      AI.needCode && h('div', { class: 'stack' }, h('label', { for: 'accessCode', style: 'font-weight:600' }, '접속 코드'),
        h('input', { class: 'input', type: 'password', id: 'accessCode', autocomplete: 'off', value: ls.get('code', ''), onchange: (e) => { ls.set('code', e.target.value.trim()); toast('접속 코드를 저장했어요.'); } })),
      h('div', { class: 'stack' }, h('span', { style: 'font-weight:600' }, '추천 방식'), h('p', { class: 'note', text: ai })),
      h('div', { class: 'stack' }, h('span', { style: 'font-weight:600' }, '저장 위치'), h('p', { class: 'note', text: store })),
      h('div', { class: 'stack' }, h('span', { style: 'font-weight:600' }, '사진'),
        h('p', { class: 'note' }, '입은 모습을 찍은 사진은 추천을 받는 동안만 쓰고 저장하지 않아요. AI가 연결돼 있으면 그 사진이 Claude로 전송돼요. 옷장에는 옷 사진의 작은 축소본만 남아요. 얼굴이 나오지 않게 목 아래부터 찍어 주세요.'))),
    h('div', { class: 'row' },
      h('button', { class: 'btn', type: 'button', onclick: addSamples }, '샘플 옷 넣기'),
      samples.length ? h('button', { class: 'btn', type: 'button', onclick: async () => { for (const it of samples) await deleteItem(it); render(); toast('샘플 옷을 지웠어요.'); } }, `샘플 옷 ${samples.length}벌 지우기`) : null),
    wipeBtn];
}

function openProfiles() {
  openSheet('프로필', () => [
    h('div', { class: 'list' }, S.settings.profiles.map((p) => h('div', { class: 'kv' },
      h('span', { text: p.name + (p.id === S.settings.active ? ' (사용 중)' : '') }),
      h('span', { class: 'row' },
        p.id !== S.settings.active && h('button', { class: 'btn', type: 'button', onclick: async () => { S.settings.active = p.id; S.session = null; await saveSettings(); closeSheet(); render(); toast(`${p.name}의 옷장으로 바꿨어요.`); } }, '이 프로필로'),
        S.settings.profiles.length > 1 && p.id !== S.settings.active && !S.items.some((i) => i.profile === p.id) && h('button', { class: 'btn danger', type: 'button', onclick: async () => { S.settings.profiles = S.settings.profiles.filter((x) => x !== p); await saveSettings(); redrawSheet(); render(); } }, '삭제'))))),
    h('div', { class: 'stack' }, h('label', { for: 'newProfile', style: 'font-weight:600' }, '가족 추가'),
      h('div', { class: 'field' }, h('input', { type: 'text', id: 'newProfile', maxlength: '12', placeholder: '이름' }),
        h('button', { class: 'btn primary', type: 'button', onclick: async () => {
          const name = $('#newProfile').value.trim();
          if (!name) return;
          S.settings.profiles.push({ id: 'p' + uid(), name });
          await saveSettings(); redrawSheet(); render();
        } }, '추가'))),
    h('p', { class: 'note' }, '프로필마다 옷장과 기록이 따로예요. 옷이 남아 있는 프로필은 삭제할 수 없어요.')]);
}

// ── 시작 ──────────────────────────────────────────────
function route() {
  const v = location.hash.replace('#', '');
  S.view = ['mirror', 'closet', 'log', 'setup'].includes(v) ? v : 'mirror';
  render();
  window.scrollTo(0, 0);
}

async function boot() {
  await Store.init();
  let docs = [];
  try { docs = await timeout(Store.all(), 10000); } catch { toast('옷장을 불러오지 못했어요. 새로 고쳐 주세요.'); }
  for (const d of docs) {
    const key = String(d.key || '');
    if (key.startsWith('item_')) S.items.push(d);
    else if (key.startsWith('log_')) S.logs.push(d);
    else if (key === 'settings') S.settings = { ...DEFAULT_SETTINGS, ...d };
  }
  if (!Array.isArray(S.settings.profiles) || !S.settings.profiles.length) S.settings.profiles = [{ id: 'p1', name: '나' }];
  if (!S.settings.profiles.some((p) => p.id === S.settings.active)) S.settings.active = S.settings.profiles[0].id;

  AI.onChange(() => { if (!S.session && $('#scrim').hidden) render(); else renderChrome(); });
  await AI.detect();
  S.wx = await Weather.today(S.settings);
  S.ready = true;
  route();
  Voice.init().then((ok) => { S.voiceOK = ok; if (ok && S.view === 'mirror' && !S.session && $('#scrim').hidden) render(); });
}

window.addEventListener('hashchange', route);
$('#sheetClose').addEventListener('click', closeSheet);
$('#scrim').addEventListener('click', (e) => { if (e.target.id === 'scrim') closeSheet(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('#scrim').hidden) closeSheet(); });
$('#profileBtn').addEventListener('click', openProfiles);
$('#camFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) handlePhoto(f); });
$('#addFile').addEventListener('change', (e) => { const fs = [...e.target.files]; e.target.value = ''; onAddFiles(fs); });
$('#importFile').addEventListener('change', (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) onImport(f); });

boot();
