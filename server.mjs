// 옷장 거울 서버: 화면을 내보내고, AI 요청과 날씨 요청을 대신 보낸다.
// API 키는 서버 환경변수에만 둔다. 키가 없으면 화면은 규칙 기반 추천으로 돈다.
import http from 'node:http';
import { createRequire } from 'node:module';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import * as z from 'zod/v4';
import { buildDocument } from './build.mjs';

const require = createRequire(import.meta.url);
const { tagPrompt, buildLook, parseLook } = require('./src/shared/prompts.cjs');
const { CATEGORIES, COLORS, STYLES } = require('./src/shared/engine.cjs');

const PORT = Number(process.env.PORT) || 3000;
const MODEL = process.env.CLOSET_MODEL || 'claude-opus-5-5';
const ACCESS_CODE = process.env.ACCESS_CODE || '';
const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const client = hasKey ? new Anthropic() : null;

const category = z.enum(Object.keys(CATEGORIES));
const color = z.enum(Object.keys(COLORS));
const styles = z.array(z.enum(Object.keys(STYLES)));

const TagSchema = z.object({ name: z.string(), category, color, warmth: z.number(), styles });
const LookSchema = z.object({
  worn: z.array(z.object({ id: z.string().nullable(), category, color, name: z.string(), warmth: z.number(), styles, box: z.array(z.number()).nullable() })),
  verdict: z.string(),
  swaps: z.array(z.object({ replace: z.string().nullable(), item: z.string(), reason: z.string() })),
});

// 한 번의 요청으로 정해진 모양의 JSON을 받는다. 화면 앞에서 기다리는 요청이라 effort는 낮게 둔다.
// 안전 분류기가 거절하면 서버 쪽 기본 폴백 모델이 같은 요청을 이어받는다.
async function ask(schema, text, imageB64) {
  const content = [];
  if (imageB64) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: imageB64 } });
  content.push({ type: 'text', text });
  const res = await client.beta.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low', format: zodOutputFormat(schema) },
    messages: [{ role: 'user', content }],
  });
  if (res.stop_reason === 'refusal') throw Object.assign(new Error('refused'), { code: 'refused' });
  if (!res.parsed_output) throw Object.assign(new Error('no structured output'), { code: 'invalid_json' });
  return res.parsed_output;
}

function send(res, status, body, type) {
  const data = typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'content-type': type || 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(data);
}

function readJson(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('too large'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch { reject(Object.assign(new Error('bad json'), { status: 400 })); } });
    req.on('error', reject);
  });
}

const isB64 = (s) => typeof s === 'string' && s.length > 100 && /^[A-Za-z0-9+/=]+$/.test(s);

async function handleAI(req, res, route) {
  if (!client) return send(res, 503, { error: 'AI 키가 설정되지 않았습니다.', code: 'sampling_disabled' });
  if (ACCESS_CODE && req.headers['x-access-code'] !== ACCESS_CODE) return send(res, 401, { error: '접속 코드가 필요합니다.', code: 'access_code' });
  const body = await readJson(req);
  if (route === 'tag') {
    if (!isB64(body.image)) return send(res, 400, { error: 'image가 필요합니다.', code: 'invalid_request' });
    return send(res, 200, await ask(TagSchema, tagPrompt(), body.image));
  }
  const items = Array.isArray(body.items) ? body.items.slice(0, 300) : [];
  if (!items.length) return send(res, 400, { error: 'items가 필요합니다.', code: 'invalid_request' });
  const image = isB64(body.image) ? body.image : null;
  const { prompt, back } = buildLook({ items, ctx: body.ctx || {}, wornIds: body.wornIds || [], logs: body.logs || [], exclude: body.exclude || [], hasImage: !!image });
  return send(res, 200, parseLook(await ask(LookSchema, prompt, image), back));
}

// Open-Meteo: 키 없이 쓰는 공개 날씨 API. 오늘의 최저·최고 기온과 강수 확률만 받는다.
async function handleWeather(url, res) {
  const lat = Number(url.searchParams.get('lat')), lon = Number(url.searchParams.get('lon'));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return send(res, 400, { error: 'lat, lon이 필요합니다.' });
  const api = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=1`;
  // 날씨 서버에 닿지 못해도 화면은 직접 입력으로 넘어가면 되므로 502로만 알린다.
  const r = await fetch(api, { signal: AbortSignal.timeout(5000) }).catch(() => null);
  if (!r || !r.ok) return send(res, 502, { error: '날씨를 받아오지 못했습니다.' });
  const d = (await r.json()).daily || {};
  const tmin = Math.round(d.temperature_2m_min?.[0]), tmax = Math.round(d.temperature_2m_max?.[0]);
  if (!Number.isFinite(tmin) || !Number.isFinite(tmax)) return send(res, 502, { error: '날씨 응답을 읽지 못했습니다.' });
  return send(res, 200, { tmin, tmax, rain: (d.precipitation_probability_max?.[0] ?? 0) >= 50 });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) return send(res, 200, buildDocument(), 'text/html; charset=utf-8');
    if (req.method === 'GET' && url.pathname === '/api/health') return send(res, 200, { ok: true, ai: hasKey, needCode: Boolean(ACCESS_CODE) });
    if (req.method === 'GET' && url.pathname === '/api/weather') return await handleWeather(url, res);
    if (req.method === 'POST' && url.pathname === '/api/ai/tag') return await handleAI(req, res, 'tag');
    if (req.method === 'POST' && url.pathname === '/api/ai/look') return await handleAI(req, res, 'look');
    return send(res, 404, { error: 'not found' });
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) return send(res, 429, { error: '요청이 많습니다.', code: 'rate_limited' });
    if (e instanceof Anthropic.AuthenticationError) return send(res, 502, { error: 'API 키를 확인해 주세요.', code: 'upstream_error' });
    if (e instanceof Anthropic.APIError) { console.error('Claude API 오류', e.status, e.message); return send(res, 502, { error: 'AI 응답 오류', code: 'upstream_error' }); }
    if (e && e.status) return send(res, e.status, { error: e.message, code: 'invalid_request' });
    console.error(e);
    return send(res, 500, { error: '서버 오류', code: e && e.code ? e.code : 'upstream_error' });
  }
});

server.listen(PORT, () => {
  console.log(`옷장 거울: http://localhost:${PORT}`);
  console.log(hasKey ? `AI 사용: ${MODEL}` : 'ANTHROPIC_API_KEY가 없어 규칙 기반 추천으로 동작합니다.');
});
