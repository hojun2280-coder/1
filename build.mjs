// 소스 조각을 한 장의 페이지로 합친다.
//  - dist/closet-mirror.html : Claude 아티팩트로 올리는 본문 조각
//  - dist/index.html         : 서버가 내보내는 완전한 문서
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(path.join(here, 'src', p), 'utf8');

export function buildFragment() {
  const script = ['shared/engine.cjs', 'shared/prompts.cjs', 'js/platform.js', 'js/ui.js'].map(read).join('\n');
  // replace()는 치환 문자열의 $를 해석하므로 split/join으로 넣는다.
  return read('app.html').split('/*__STYLES__*/').join(read('styles.css')).split('/*__SCRIPT__*/').join(script);
}

const RESET = ':root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}';

export function buildDocument() {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${RESET}</style></head><body>${buildFragment()}</body></html>`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  mkdirSync(path.join(here, 'dist'), { recursive: true });
  writeFileSync(path.join(here, 'dist', 'closet-mirror.html'), buildFragment());
  writeFileSync(path.join(here, 'dist', 'index.html'), buildDocument());
  console.log('dist/closet-mirror.html, dist/index.html 을 만들었습니다.');
}
