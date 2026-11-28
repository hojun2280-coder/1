import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const E = require('../src/shared/engine.cjs');
const P = require('../src/shared/prompts.cjs');

const closet = () => E.sampleWardrobe().map((s, i) => ({ ...s, id: 'x' + i, lastWorn: null, wornCount: 0 }));
const id = (items, name) => items.find((i) => i.name === name).id;
const today = '2026-11-28';

test('추운 날 겉옷이 없으면 겉옷을 더하라고 한다', () => {
  const items = closet();
  const r = E.recommendLocal({ wornIds: [id(items, '흰 반팔 티셔츠'), id(items, '청바지')], items, ctx: { tmin: 6, tmax: 12, mood: 'comfy' }, logs: [], today });
  assert.match(r.verdict, /겉옷/);
  assert.ok(r.swaps.length >= 1 && r.swaps.length <= 3);
  for (const s of r.swaps) { assert.equal(s.slot, 'outer'); assert.equal(s.replaceId, null); }
  const names = r.swaps.map((s) => items.find((i) => i.id === s.itemId).name);
  assert.ok(!names.includes('네이비 숏패딩'), '9~11도 체감에 패딩은 과하다: ' + names);
});

test('한겨울에는 두꺼운 겉옷을 고른다', () => {
  const items = closet();
  const r = E.recommendLocal({ wornIds: [id(items, '블랙 터틀넥'), id(items, '블랙 슬랙스')], items, ctx: { tmin: -6, tmax: 1, mood: 'neat' }, logs: [], today });
  const names = r.swaps.map((s) => items.find((i) => i.id === s.itemId).name);
  assert.ok(names.includes('네이비 숏패딩') || names.includes('차콜 울 코트'), names.join());
  assert.ok(!names.includes('네이비 가디건'));
});

test('더운 날 두꺼운 상의는 가벼운 옷으로 바꾸라고 한다', () => {
  const items = closet();
  const top = id(items, '그레이 맨투맨');
  const r = E.recommendLocal({ wornIds: [top, id(items, '카키 면 반바지')], items, ctx: { tmin: 24, tmax: 31, mood: 'comfy' }, logs: [], today });
  assert.ok(r.swaps.length);
  for (const s of r.swaps) { assert.equal(s.replaceId, top); assert.ok(items.find((i) => i.id === s.itemId).warmth <= 2); }
});

test("'단정하게'면 스포티한 옷을 바꾸라고 한다", () => {
  const items = closet();
  const jog = id(items, '그레이 조거 팬츠');
  const r = E.recommendLocal({ wornIds: [id(items, '네이비 옥스퍼드 셔츠'), jog, id(items, '브라운 재킷')], items, ctx: { tmin: 10, tmax: 16, mood: 'neat' }, logs: [], today });
  assert.equal(r.swaps[0].replaceId, jog);
  assert.ok(items.find((i) => i.id === r.swaps[0].itemId).styles.includes('neat'));
});

test('세탁 중인 옷, 제외한 옷, 입고 있는 옷은 추천하지 않는다', () => {
  const items = closet();
  const coat = items.find((i) => i.name === '베이지 트렌치코트'); coat.laundryUntil = '2026-11-30';
  const jacket = id(items, '브라운 재킷');
  const r = E.recommendLocal({ wornIds: [id(items, '흰 반팔 티셔츠'), id(items, '청바지')], items, ctx: { tmin: 8, tmax: 14, mood: 'comfy' }, logs: [], exclude: [jacket], today });
  const got = r.swaps.map((s) => s.itemId);
  assert.ok(!got.includes(coat.id) && !got.includes(jacket));
});

test('싫다고 한 옷은 순위가 내려간다', () => {
  const items = closet();
  const worn = [id(items, '흰 반팔 티셔츠'), id(items, '청바지')];
  const ctx = { tmin: 8, tmax: 14, mood: 'comfy' };
  const first = E.recommendLocal({ wornIds: worn, items, ctx, logs: [], today }).swaps[0].itemId;
  const logs = [1, 2, 3].map(() => ({ decision: 'rejected', rejectReason: 'dislike', swaps: [{ itemId: first }] }));
  const again = E.recommendLocal({ wornIds: worn, items, ctx, logs, today }).swaps[0].itemId;
  assert.notEqual(again, first);
});

test('문제없는 차림이면 괜찮다고 말한다', () => {
  const items = closet();
  const r = E.recommendLocal({ wornIds: [id(items, '네이비 옥스퍼드 셔츠'), id(items, '베이지 슬랙스'), id(items, '브라운 재킷')], items, ctx: { tmin: 10, tmax: 16, mood: 'neat', rain: true }, logs: [], today });
  assert.match(r.verdict, /괜찮아요/);
  assert.match(r.verdict, /우산/);
});

test('AI 응답 거르기: 없는 옷, 세탁 중, 자리 불일치를 버린다', () => {
  const items = closet();
  items[13].laundryUntil = '2026-12-05';
  const res = E.sanitizeLook({
    worn: [{ id: 'x0' }, { id: null, category: 'bottom', color: 'nope', name: '모르는 바지', warmth: 9, styles: ['zzz'], box: [0.1, 0.4, 0.9, 0.95] }, { id: 'ghost', category: 'weird' }],
    verdict: '겉옷을 걸치세요.',
    swaps: [{ itemId: 'ghost', reason: 'a' }, { itemId: 'x13', reason: '세탁 중' }, { itemId: 'x0', reason: '입는 중' }, { itemId: 'x12', replaceId: 'x0', reason: '자리 다름' }, { itemId: 'x11', replaceId: null, reason: '가볍게 걸치기 좋아요' }, { itemId: 'x11', reason: '중복' }],
  }, items, { today });
  assert.equal(res.worn.length, 2);
  assert.deepEqual([res.worn[1].color, res.worn[1].warmth, res.worn[1].styles.length], ['gray', 5, 0]);
  assert.deepEqual(res.swaps.map((s) => s.itemId), ['x11']);
});

test('별칭으로 보낸 요청과 응답이 실제 id로 돌아온다', () => {
  const items = closet();
  const { prompt, back } = P.buildLook({ items, ctx: { tmin: 5, tmax: 9, mood: 'neat', schedule: '면담' }, wornIds: ['x1'], logs: [], exclude: ['x12'], hasImage: false, today });
  assert.match(prompt, /i2 \| 상의 \| 네이비/);
  assert.match(prompt, /방금 추천함/);
  assert.match(prompt, /면담/);
  const parsed = P.parseLook({ worn: [{ id: 'i2' }], verdict: 'v', swaps: [{ replace: null, item: 'i15', reason: 'r' }, { replace: 'zz', item: 'i999', reason: 'r' }] }, back);
  assert.equal(parsed.worn[0].id, 'x1');
  assert.deepEqual(parsed.swaps.map((s) => s.itemId), ['x14', null]);
});

test('통계: 수락률과 주차별 비교, 최종 차림', () => {
  const mk = (date, decision, extra) => ({ date, ts: Date.parse(date), decision, swaps: [{ itemId: 'a', replaceId: 'w1' }], wornIds: ['w1', 'w2'], latencyMs: 2000, ...extra });
  const logs = [mk('2026-11-01', 'accepted', { chosenId: 'a' }), mk('2026-11-02', 'rejected', { rejectReason: 'dislike' }), mk('2026-11-02', 'kept'), mk('2026-11-09', 'accepted', { chosenId: 'a' }), mk('2026-11-10', null)];
  const s = E.computeStats(logs);
  assert.deepEqual([s.days, s.sessions, s.acceptRate, s.week1Rate, s.week2Rate, s.avgLatencySec], [4, 5, 50, 33, 100, 2]);
  assert.deepEqual(E.finalOutfit(logs[0]), ['a', 'w2']);
  const csv = E.toCSV(logs, [{ id: 'a', name: '코트, "울"' }], 'H01');
  assert.equal(csv.split('\n').length, 6);
  assert.match(csv, /"코트, ""울"""/);
});
