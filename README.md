# 디지몬 카드 덱 메이커

디지몬 카드 게임 덱을 검색하고, 만들고, 저장하고, 공유하는 웹사이트입니다.
빌드 도구 없이 HTML/CSS/JavaScript만으로 동작합니다.

## 기능

- **카드 검색**: 이름, 카드 번호, 효과 텍스트, 색, 종류, 레벨, 세트로 검색 ([digimoncard.io](https://digimoncard.io) 공개 API 사용)
- **덱 구성 규칙 검사**: 메인 덱 50장, 디지타마 덱 최대 5장, 같은 카드 번호 최대 4장
- **덱 보기**: 리스트 / 카드 이미지 / 통계(레벨·색·코스트 분포) / 테스트 드로우(패 5장 + 시큐리티 5장)
- **저장·불러오기**: 브라우저(localStorage)에 여러 덱 저장
- **내보내기·가져오기**: `4 Agumon BT1-010` 형식의 텍스트
- **공유 링크**: 덱 구성이 담긴 URL 복사

## PC 프로그램 (Windows / Mac / Linux)

웹사이트와 같은 코드로 설치형 프로그램도 만들 수 있습니다 (Electron).

- 카드 이미지를 **반다이 공식 사이트**(영문판) 또는 digimoncard.io에서 받아 **PC에 저장** → 한 번 본 카드는 인터넷 없이도 보임
- 검색 결과도 저장해 두어 오프라인일 때 같은 검색은 그대로 동작
- 브라우저의 CORS 제한이 없어 카드 데이터를 안정적으로 불러옴
- 설정(⚙)에서 이미지 출처 선택, 저장된 데이터 확인·삭제

카드 이미지는 프로그램에 포함되지 않습니다. 사용자의 PC가 실행 중에 받아서 저장합니다. 카드 이미지의 저작권은 © BANDAI에 있습니다.

### 설치 파일 받기

GitHub 저장소의 **Actions → "PC 프로그램 빌드" → Run workflow**를 실행하면 몇 분 뒤 Windows(.exe), Mac(.dmg), Linux(.AppImage) 설치 파일이 Artifacts에 올라옵니다.
`v1.0.0` 같은 태그를 push하면 Releases 페이지에도 올라갑니다.

- Windows: 서명되지 않은 프로그램이라 "Windows의 PC 보호" 창이 뜨면 **추가 정보 → 실행**을 누르세요.
- Mac: 처음 실행할 때 앱을 **우클릭 → 열기**로 여세요.

### 직접 실행·빌드

```bash
npm install
npm start            # 개발용 실행
npm run dist:win     # Windows 설치 파일 (Windows에서 실행)
npm run dist:mac     # Mac 설치 파일 (Mac에서 실행)
npm run dist:linux   # Linux AppImage
```

## 웹사이트로 실행

```bash
python3 -m http.server 8000
# 브라우저에서 http://localhost:8000 접속
```

`index.html`을 바로 열어도 되지만, 로컬 서버로 여는 것을 권장합니다.

## 배포 (GitHub Pages)

저장소 Settings → Pages → Branch를 선택하고 루트(`/`)를 지정하면 끝입니다.

## 파일 구조

```
index.html      화면 구성
css/style.css   스타일 (반응형)
js/api.js       digimoncard.io API 호출 (요청 간격 제한 포함)
js/deck.js      덱 데이터·규칙·텍스트 변환
js/app.js       화면 로직
electron/       PC 프로그램 (main.js: 이미지 저장·API 호출, preload.js: 화면 연결)
build/icon.png  프로그램 아이콘
```

## 참고

- 카드 이름·효과는 API가 제공하는 영문 데이터입니다. 검색도 영문 이름으로 해야 합니다.
- API는 10초당 15회 요청 제한이 있어, 덱 가져오기 시 카드 수가 많으면 몇 초 걸립니다.
- 비공식 팬 제작 도구이며 Bandai와 관련이 없습니다.
