// 실행 환경 연결: 저장소, AI, 날씨, 음성, 파일 저장.
// 같은 화면 코드가 세 곳에서 돈다: Claude 아티팩트 안, 직접 띄운 서버, 그냥 연 파일.

const claudeRT = typeof window !== 'undefined' && window.claude && typeof window.claude.use === 'function' ? window.claude : null;

function timeout(p, ms, label) {
  return new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error(label || 'timeout')), ms);
    Promise.resolve(p).then((v) => { clearTimeout(t); res(v); }, (e) => { clearTimeout(t); rej(e); });
  });
}

const ls = {
  get(k, d) { try { const v = localStorage.getItem('cm.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cm.' + k, JSON.stringify(v)); } catch { /* 저장 못 해도 화면은 돈다 */ } },
};

// ── 저장소 ─────────────────────────────────────────────
// 문서 하나가 옷 한 벌, 기록 한 건, 또는 설정이다. 키는 item_*, log_*, settings.
const Store = (() => {
  let impl = null;
  let kind = 'memory';
  const chains = new Map();

  function memory() {
    const m = new Map();
    return { all: async () => [...m.values()], put: async (k, d) => { m.set(k, { ...d, key: k }); }, del: async (k) => { m.delete(k); } };
  }

  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('closet-mirror', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('docs', { keyPath: 'key' });
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = (mode, fn) => new Promise((res, rej) => {
          const t = db.transaction('docs', mode);
          const r = fn(t.objectStore('docs'));
          t.oncomplete = () => res(r && r.result);
          t.onerror = () => rej(t.error);
        });
        resolve({
          all: () => tx('readonly', (s) => s.getAll()),
          put: (k, d) => tx('readwrite', (s) => s.put({ ...d, key: k })),
          del: (k) => tx('readwrite', (s) => s.delete(k)),
        });
      };
    });
  }

  // Claude 계정에 묶인 개인 저장 공간. 같은 계정으로 연 다른 기기에서도 같은 옷장이 보인다.
  async function cloud() {
    const [db, user] = await Promise.all([claudeRT.use('db'), claudeRT.use('user')]);
    if (!db || !user) return null;
    const uid = await user.id();
    if (!uid) return null;
    const col = db.collection('data/users/' + uid);
    const snap = await col.limit(1000).get();
    const first = snap.docs.map((d) => ({ ...d.data(), key: d.id }));
    let served = false;
    return {
      all: async () => {
        if (!served) { served = true; return first; }
        const s = await col.limit(1000).get();
        return s.docs.map((d) => ({ ...d.data(), key: d.id }));
      },
      put: (k, d) => { const body = { ...d }; delete body.key; return col.doc(k).set(body); },
      del: (k) => col.doc(k).delete(),
    };
  }

  async function init() {
    if (claudeRT) {
      try {
        const c = await timeout(cloud(), 10000, 'store');
        if (c) { impl = c; kind = 'cloud'; return kind; }
      } catch { /* 아래 기기 저장소로 내려간다 */ }
    }
    try { impl = await timeout(idb(), 4000, 'idb'); kind = 'device'; }
    catch { impl = memory(); kind = 'memory'; }
    return kind;
  }

  // 같은 문서에 대한 쓰기는 한 번에 하나씩 순서대로 보낸다.
  function queue(key, fn) {
    const prev = chains.get(key) || Promise.resolve();
    const next = prev.catch(() => {}).then(fn);
    chains.set(key, next);
    return next;
  }

  return {
    init,
    get kind() { return kind; },
    all: () => impl.all(),
    put: (key, doc) => queue(key, () => impl.put(key, doc)),
    del: (key) => queue(key, () => impl.del(key)),
  };
})();

// ── 이미지 ─────────────────────────────────────────────
async function loadBitmap(blob) {
  if (window.createImageBitmap) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch { /* 아래 방식으로 */ }
  }
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); res(img); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('image')); };
    img.src = url;
  });
}

// 긴 변을 max로 줄인 JPEG. box([왼,위,오,아래] 0~1)를 주면 그 영역만 잘라낸다.
async function resizeImage(blob, max, opts) {
  const bmp = await loadBitmap(blob);
  const W = bmp.width, H = bmp.height;
  let sx = 0, sy = 0, sw = W, sh = H;
  if (opts && opts.box) {
    const [x0, y0, x1, y1] = opts.box;
    const pad = 0.03;
    sx = Math.max(0, x0 - pad) * W; sy = Math.max(0, y0 - pad) * H;
    sw = Math.min(1, x1 + pad) * W - sx; sh = Math.min(1, y1 + pad) * H - sy;
  }
  const k = Math.min(1, max / Math.max(sw, sh));
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.round(sw * k)); cv.height = Math.max(1, Math.round(sh * k));
  cv.getContext('2d').drawImage(bmp, sx, sy, sw, sh, 0, 0, cv.width, cv.height);
  if (bmp.close) bmp.close();
  const q = (opts && opts.quality) || 0.82;
  if (opts && opts.dataUrl) return cv.toDataURL('image/jpeg', q);
  return new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error('image'))), 'image/jpeg', q));
}

function blobToBase64(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1]);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
}

// ── AI ────────────────────────────────────────────────
// mode: 'claude'(아티팩트에서 보는 사람의 Claude), 'server'(직접 띄운 서버의 API 키), 'local'(규칙만)
const AI = {
  mode: 'local',
  canSee: false,
  server: false,
  sample: null,
  listeners: [],
  onChange(fn) { this.listeners.push(fn); },
  set(mode, canSee) { this.mode = mode; this.canSee = canSee; this.listeners.forEach((f) => f()); },

  async detect() {
    if (claudeRT) {
      claudeRT.use('sample').then(async (sample) => {
        if (!sample) return;
        this.sample = sample;
        const lim = await sample.limits().catch(() => null);
        this.set('claude', !!(lim && lim.images));
      });
      return;
    }
    try {
      const r = await timeout(fetch('api/health'), 2500);
      if (!r.ok) return;
      const j = await r.json();
      this.server = true;
      this.needCode = !!j.needCode;
      if (j.ai) this.set('server', true); else this.listeners.forEach((f) => f());
    } catch { /* 서버 없음: 규칙만 쓴다 */ }
  },

  message(e) {
    const code = e && e.code;
    if (code === 'not_granted' || code === 'sampling_disabled' || code === 'not_declared' || code === 'capability_disabled' || code === 'capability_removed') {
      this.set('local', false);
      return 'Claude 사용이 허용되지 않아 규칙 기반으로 추천할게요.';
    }
    if (code === 'images_unavailable') { this.set(this.mode, false); return '이 화면에서는 사진을 보낼 수 없어요. 입은 옷을 직접 골라 주세요.'; }
    if (code === 'rate_limited') return '지금은 AI 요청이 많아요. 잠시 뒤에 다시 해 주세요.';
    if (code === 'session_expired') return '로그인이 만료됐어요. 다시 로그인해 주세요.';
    if (code === 'image_rejected') return '이 사진은 읽을 수 없어요. 다시 찍어 주세요.';
    if (code === 'access_code') return '접속 코드가 맞지 않아요. 설정에서 확인해 주세요.';
    return 'AI 응답을 받지 못했어요. 규칙 기반으로 추천할게요.';
  },

  async post(path, body) {
    const r = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', 'x-access-code': ls.get('code', '') }, body: JSON.stringify(body) });
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      const err = new Error(j.error || 'server');
      err.code = j.code || 'upstream_error';
      throw err;
    }
    return r.json();
  },

  // 옷 사진 한 장 → 이름·종류·색·두께·스타일
  async tag(blob) {
    const img = await resizeImage(blob, 1024);
    if (this.mode === 'claude') {
      const raw = await this.sample.json(tagPrompt(), { images: img, modelTier: 'quick' });
      return sanitizeTag(raw);
    }
    if (this.mode === 'server') return sanitizeTag(await this.post('api/ai/tag', { image: await blobToBase64(img) }));
    throw new Error('no-ai');
  },

  // 지금 차림(사진 또는 고른 옷) → 입은 옷, 한 줄 평, 바꿀 옷
  async look(args, blob) {
    const img = blob ? await resizeImage(blob, 1280) : null;
    if (this.mode === 'claude') {
      const { prompt, back } = buildLook({ ...args, hasImage: !!img });
      const opts = { modelTier: 'quick', cache: false };
      if (img) opts.images = img;
      const raw = await this.sample.json(prompt, opts);
      return sanitizeLook(parseLook(raw, back), args.items, { exclude: args.exclude });
    }
    if (this.mode === 'server') {
      const slim = {
        items: args.items.map(({ id, name, category, color, warmth, styles, laundryUntil, lastWorn }) => ({ id, name, category, color, warmth, styles, laundryUntil, lastWorn })),
        logs: (args.logs || []).filter((l) => l.decision).slice(-60).map(({ decision, rejectReason, chosenId, swaps }) => ({ decision, rejectReason, chosenId, swaps: (swaps || []).map((s) => ({ itemId: s.itemId })) })),
        ctx: args.ctx, wornIds: args.wornIds || [], exclude: args.exclude || [],
        image: img ? await blobToBase64(img) : null,
      };
      return sanitizeLook(await this.post('api/ai/look', slim), args.items, { exclude: args.exclude });
    }
    throw new Error('no-ai');
  },
};

// ── 날씨 ───────────────────────────────────────────────
const CITIES = {
  seoul: ['서울', 37.57, 126.98], incheon: ['인천', 37.46, 126.71], suwon: ['수원', 37.26, 127.03], chuncheon: ['춘천', 37.88, 127.73],
  gangneung: ['강릉', 37.75, 128.88], daejeon: ['대전', 36.35, 127.38], cheongju: ['청주', 36.64, 127.49], jeonju: ['전주', 35.82, 127.15],
  gwangju: ['광주', 35.16, 126.85], daegu: ['대구', 35.87, 128.6], ulsan: ['울산', 35.54, 129.31], busan: ['부산', 35.18, 129.08], jeju: ['제주', 33.5, 126.53],
};

const Weather = {
  // 서버가 있으면 자동으로 받아오고, 없으면(아티팩트 안은 외부 통신이 막혀 있다) 직접 입력한 값을 쓴다.
  async today(settings) {
    const day = todayStr();
    const manual = settings.manual;
    if (manual && manual.date === day) return { ...manual, src: 'manual' };
    if (AI.server) {
      const cached = ls.get('wx', null);
      if (cached && cached.date === day && cached.city === settings.city) return cached;
      try {
        const [, lat, lon] = CITIES[settings.city] || CITIES.seoul;
        const r = await timeout(fetch(`api/weather?lat=${lat}&lon=${lon}`), 6000);
        if (r.ok) {
          const j = await r.json();
          const wx = { tmin: j.tmin, tmax: j.tmax, rain: !!j.rain, src: 'auto', date: day, city: settings.city };
          ls.set('wx', wx);
          return wx;
        }
      } catch { /* 아래 값으로 */ }
    }
    if (manual) return { tmin: manual.tmin, tmax: manual.tmax, rain: false, src: 'stale' };
    return { tmin: 10, tmax: 18, rain: false, src: 'unset' };
  },
};

// ── 음성 입력 ───────────────────────────────────────────
const Voice = {
  cap: null,
  cur: null,
  text: '',
  async init() {
    if (claudeRT) {
      const d = await claudeRT.use('dictation').catch(() => null);
      if (!d) return false;
      this.cap = d;
      d.onPartial(({ text }) => { if (this.cur) this.cur.onText((this.text + ' ' + text).trim()); });
      d.onFinal(({ text }) => {
        this.text = (this.text + ' ' + text).trim();
        if (this.cur) { this.cur.onText(this.text); d.stop().catch(() => {}); }
      });
      d.onState(({ state }) => { if (state === 'idle' && this.cur) { const c = this.cur; this.cur = null; c.onEnd(); } });
      return true;
    }
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  },
  // 누른 순간 바로 호출해야 한다. 들리는 대로 onText(지금까지의 문장), 끝나면 onEnd().
  listen(onText, onEnd) {
    if (this.cap) {
      this.text = '';
      this.cur = { onText, onEnd };
      this.cap.start().catch(() => { this.cur = null; onEnd(); });
      return () => this.cap.stop().catch(() => {});
    }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.lang = 'ko-KR'; rec.interimResults = true;
    rec.onresult = (ev) => onText([...ev.results].map((r) => r[0].transcript).join(' ').trim());
    rec.onend = onEnd; rec.onerror = onEnd;
    rec.start();
    return () => rec.stop();
  },
};

// ── 파일 저장 ───────────────────────────────────────────
async function saveFile(filename, text, mime) {
  if (claudeRT) {
    const dl = await claudeRT.use('downloads');
    if (!dl) throw new Error('unavailable');
    await dl.save({ filename, data: text });
    return;
  }
  const url = URL.createObjectURL(new Blob([text], { type: mime || 'text/plain' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
