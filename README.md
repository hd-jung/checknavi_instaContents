# Checknavi Japan Market Desk

한국 화장품 브랜드에 일본 시장 광고를 제안하기 위한 FastAPI 기반 분석 도구입니다. @cosme의 일본 인기 제품과 Olive Young의 한국 후보를 카테고리별로 비교하고, 광고 제안 우선순위 TOP 5와 제품 상세 근거를 제공합니다.

## 화면 구조

- `/`: 데이터 수집 상태, 환율과 현재 카테고리 신호
- `/rankings`: 카테고리별 일본 현재 제품과 한국 후보 비교
- `/opportunities`: 광고 제안 후보 TOP 5
- `/products/{category}`: 가격·성분·성능·판매·뉴스 상세 분석
- `/content`: 카드뉴스 제작 준비 화면(COMING SOON)

기존 `/workspace`, `/trend-gap`, `/releases`, `/content-studio` 주소는 새 구조의 관련 화면으로 이동합니다.

## 데이터 기준

- 일본: [@cosme 한국 코스메 랭킹](https://www.cosme.net/categories/pickup/1039/ranking/)
- 한국: Olive Young 공식 랭킹 노출과 Global 공식 상품 페이지로 검증한 최근 스냅샷
- 환율: [Frankfurter API](https://frankfurter.dev/)의 KRW/JPY 중앙은행 일일 기준환율
- 기본 화면: 검증 스냅샷을 즉시 표시
- `@cosme 최신 조회`: 최대 25초 동안 최신 공개 페이지를 다시 수집
- Olive Young: 서버 자동 접근 제한으로 현재 실시간 수집 미연결

광고 후보 점수는 매출 예측이 아니라 할인율, 신규성, 일본 제품의 리뷰 축적도를 조합한 편집·영업 우선순위입니다.

## 로컬 실행

```powershell
conda activate checknavi_py311
python -m uvicorn app.main:app --reload --port 8017
```

브라우저에서 <http://127.0.0.1:8017>을 엽니다.

## Vercel 배포

GitHub 저장소 `hd-jung/checknavi_instaContents`의 `main` 브랜치가 Vercel Production과 연결되어 있습니다.

- Framework Preset: Other 또는 자동 감지
- Python Runtime: `.python-version`의 3.12
- 환경 변수: 현재 필수 항목 없음

## API

- `GET /api/trend-gap`: 검증 데이터 기반 한·일 비교와 광고 후보 TOP 5
- `GET /api/trend-gap?refresh=true`: @cosme와 환율 최신 조회
- `GET /api/dashboard`: 기존 주간 랭킹 데이터
- `GET /api/new-releases`: 기존 신제품 데이터
- `GET /health`: 서버 상태
- `GET /docs`: FastAPI API 문서

## 테스트

```powershell
conda run -n checknavi_py311 python -m pytest -q
```
