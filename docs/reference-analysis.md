# 참고한 제품과 오픈소스

2026년 11월 기준 공개 자료로 확인한 내용입니다. 각 제품에서 무엇을 가져왔고 무엇을 일부러 뺐는지 적었습니다.

## 가져온 것

| 출처 | 그쪽 기능 | 이 앱에 넣은 형태 |
|---|---|---|
| Acloset | 사진을 올리면 종류·색을 AI가 분류. 날씨·일정·기분 반영 | 옷 사진 자동 태깅(종류·색·두께·스타일), 분위기 버튼 3개, 일정 한 줄 |
| Whering | 착용 횟수, 1회 착용당 비용 등 옷장 통계 | 옷별 착용 횟수, "N일째 안 입음" 표시, 오래 안 입은 옷에 추천 가점 |
| Alta | 자주 입는 옷, 안 입는 옷 분석 | 기록 화면의 "자주 입은 옷", "한동안 안 입은 옷" |
| Google Photos Wardrobe | 과거 사진에서 옷을 찾아 옷장을 자동으로 만듦 | 촬영한 차림에서 옷장에 없는 옷을 찾아 한 번 눌러 등록(사진에서 그 옷 영역만 잘라 저장) |
| HEYMIRROR | 옷장 옆 거울, 음성·터치, 여러 사용자 구분 | 세워 둔 화면에서 멀리서도 보이는 큰 글씨, 일정 음성 입력, 가족 프로필 |
| Essembl 등 | 현재 차림에서 특정 아이템만 교체 제안 | 핵심 흐름: 전체 코디가 아니라 한 자리만 바꾸는 추천 1~3개 |
| wardrowbe (오픈소스, MIT) | Open-Meteo 날씨 연동, 자체 호스팅 | 서버에서 Open-Meteo로 오늘 최저·최고 기온과 강수 확률 조회. 코드는 가져오지 않고 구성만 참고 |
| Amazon Echo Look의 실패 | 침실 카메라에 대한 거부감 | 입은 모습 사진은 저장하지 않음. 얼굴이 안 나오게 찍도록 안내 |

## 다른 제품에 없어서 직접 만든 것

- **지금 입은 옷에서 출발**: 옷을 입고 선 뒤에 추천을 받습니다. 기존 앱은 대부분 "오늘의 코디"를 통째로 줍니다.
- **착용 기록 자동화**: 추천을 받고 결정을 누를 때마다 그날 입은 옷이 기록됩니다.
- **거절에서 배우기**: "마음에 안 듦"으로 거절한 옷은 다음 추천에서 순위가 내려가고, 골라 입은 옷은 올라갑니다. AI 지시문에도 같은 정보가 들어갑니다.
- **세탁 중**: 추천 카드에서 바로 "세탁 중"을 누르면 3일간 추천에서 빠집니다.
- **검증용 지표**: 사용한 날, 수락률, 주차별 비교, 추천까지 걸린 시간, CSV 내보내기.

## 일부러 뺀 것

| 기능 | 이유 |
|---|---|
| 가상 피팅 | 이번 제품 방향에서 제외하기로 함. Google이 무료로 제공 중 |
| 배경 제거 | 옷 사진은 원본 축소본으로 충분. 검증 단계에서 불필요 |
| 쇼핑·중고 판매 연동 | "있는 옷 더 입기"를 먼저 검증 |
| 소셜 기능 | 범위 밖 |

## 출처

- Acloset: https://apps.apple.com/us/app/acloset-ai-fashion-assistant/id1542311809
- Whering: https://apps.apple.com/us/app/-/id1519461680
- Alta: https://www.altadaily.com/blog/alta-main-features
- Google Photos Wardrobe: https://blog.google/products-and-platforms/products/photos/google-photos-wardrobe-feature/
- HEYMIRROR: https://www.ces.tech/ces-innovation-awards/2026/heymirror-smart-dressing-mirror/
- wardrowbe: https://wardrowbe-landing.pages.dev/about
- 오픈소스 옷장 앱 목록: https://github.com/topics/wardrobe
