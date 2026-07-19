# Checknavi Beauty Intelligence

한국과 일본의 K-뷰티 시장 신호를 비교해 뉴스, 제품 분석, 카드뉴스, 릴스와 유튜브 콘텐츠 초안으로 연결하는 FastAPI 기반 운영 워크스페이스입니다.

## 주요 기능

- `TODAY`: 수집 상태, 환율, 제작 후보와 캠페인 현황
- `NEWS RADAR`: 신상·연예인 사용·앰배서더·세일 뉴스 편집 큐
- `RANK GAP`: @cosme 자동 수집과 올리브영 CSV를 이용한 한·일 랭킹 비교
- `PRODUCT LAB`: 가격·성분·성능 분석 초안
- `CONTENT STUDIO`: 일본어 제목·후킹·구성과 4:5·9:16·16:9 이미지 출력
- `CAMPAIGN`: 광고 제안, 제작물, 마감일과 진행 상태 관리

뉴스와 캠페인, 올리브영 CSV 데이터는 현재 사용 중인 브라우저에만 저장됩니다.

## 실행

```powershell
conda activate checknavi_py311
python -m uvicorn app.main:app --reload --port 8017
```

브라우저에서 <http://127.0.0.1:8017>을 엽니다.

의존성이 없는 새 환경에서 복원할 때만 다음 명령을 먼저 실행합니다.

```powershell
python -m pip install -r requirements-dev.txt
```

## Vercel 배포

이 저장소는 Vercel의 FastAPI 자동 탐지 구조로 준비되어 있습니다. Vercel 대시보드에서 GitHub 저장소 `hd-jung/checknavi_instaContents`를 Import한 뒤 별도 빌드 명령 없이 Deploy하면 됩니다.

- Framework Preset: Other 또는 자동 감지
- Python Runtime: `.python-version`에 지정된 3.12
- Build Command / Output Directory: 비워 둠
- 환경 변수: 현재는 필수 항목 없음

`main` 브랜치에 푸시하면 Production이 자동 배포되고, 다른 브랜치나 Pull Request는 Preview 배포가 생성됩니다.

## 데이터 기준

- 랭킹: [@cosme 한국 코스메 최신 리뷰 랭킹](https://www.cosme.net/categories/pickup/1039/ranking/)
- 환율: [Frankfurter API](https://frankfurter.dev/)의 KRW/JPY 중앙은행 일일 기준환율
- 서버 캐시: 랭킹 15분, 환율 30분
- 화면 자동 갱신: 60초. `새로고침` 버튼은 서버 캐시를 우회합니다.
- 올리브영: 공식 웹사이트의 자동 접속 제한을 고려해 현재 CSV 불러오기 방식 사용
- 이미지: 프로젝트에 포함된 가상 K-뷰티 뮤즈를 사용하며, 브라우저에서 권한을 보유한 인물 사진으로 교체 가능
- 내보내기: 인스타그램 4:5, 릴스 9:16, 유튜브 16:9 PNG 생성

@cosme 원본 랭킹은 매주 금요일 갱신됩니다. 이 프로젝트의 “실시간”은 최신 공개 페이지를 요청 시점에 다시 수집한다는 뜻이며, 실시간 판매 체결 데이터라는 뜻은 아닙니다.

## API

- `GET /api/dashboard`: 주간 5개 카테고리 픽과 시장 요약
- `GET /api/dashboard?refresh=true`: 외부 소스를 강제 재수집
- `GET /api/media?url=...`: 썸네일 생성을 위한 @cosme 상품 이미지 프록시
- `GET /health`: 서버 상태
- `GET /docs`: FastAPI 자동 API 문서

## 테스트

```powershell
conda run -n checknavi_py311 python -m pytest -q
```
