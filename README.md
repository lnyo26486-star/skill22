# 스킬 이펙트 스튜디오

전투 웹앱의 스킬 이펙트를 가볍게 만들고 저장하는 브라우저 도구예요. 서버도 설치도 필요 없고, GitHub Pages에 올리면 바로 쓸 수 있어요.

| 기능 | 설명 |
|---|---|
| **이펙트 편집기** | 텍스트·이미지·도형 레이어에 등장/반복/퇴장 모션을 넣고, 배경이 투명한 **WebP / WebM / PNG**로 저장 |
| **APNG 변환** | APNG(와 GIF, 움직이는 WebP)를 투명 유지한 채 **WebP / WebM**으로 변환 |
| **이미지 링크** | 이미지를 내 GitHub 저장소에 올리고 게임에서 쓸 **주소(jsDelivr / raw)** 를 받기 |

## GitHub Pages로 배포하기

1. 이 폴더의 파일 전체를 새 저장소에 올려요. (`.nojekyll` 포함)
2. 저장소 **Settings → Pages → Build and deployment**에서 Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 설정해요.
3. 잠시 뒤 `https://사용자이름.github.io/저장소이름/` 에서 열려요.

내 컴퓨터에서 바로 써 보려면 `index.html`을 더블클릭해도 돼요. (글꼴은 인터넷 연결이 있을 때 불러와요)

## 이미지 링크 기능 설정

이미지를 올릴 **공개(Public) 저장소**를 하나 만들어 두세요. (예: `my-game-assets`, README가 있는 상태로)

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token
2. Repository access: **Only select repositories** → 위 저장소만 선택
3. Permissions → Repository permissions → **Contents: Read and write**
4. 앱의 "이미지 링크" 탭 → "GitHub 연결 설정"에 토큰, `사용자이름/저장소이름`, 브랜치, 폴더를 입력하고 **연결 테스트**

토큰은 이 브라우저의 localStorage에만 저장되고 `api.github.com` 으로만 전송돼요. 공용 컴퓨터에서는 쓰고 나서 "저장된 정보 지우기"를 눌러 주세요.

올린 파일은 `https://cdn.jsdelivr.net/gh/사용자/저장소@main/assets/파일명` 형태의 주소로 열려요. 파일명 앞에 시간 코드가 붙어서 같은 이름을 올려도 덮어쓰지 않아요.

## 게임에서 쓰기

**WebP (권장)**: `<img>`로 어디서나 재생되고 투명도 유지돼요.
```html
<img class="fx" src="https://cdn.jsdelivr.net/gh/USER/REPO@main/assets/fire.webp">
```
```js
// 스킬을 쓸 때마다 처음부터 재생
function playFx(url, x, y, ms) {
  const img = new Image();
  img.src = url + '#' + Date.now();   // 새 요소라 항상 처음부터 재생
  Object.assign(img.style, { position: 'absolute', left: x + 'px', top: y + 'px', pointerEvents: 'none' });
  document.body.append(img);
  setTimeout(() => img.remove(), ms); // 이펙트 길이만큼 뒤에 제거
}
```

**WebM**: `<video autoplay muted playsinline>`으로 재생해요. 다시 재생하려면 `v.currentTime = 0; v.play()`.

## 내보내기 참고

- **WebP**: 프레임을 하나씩 정확히 그려서 만들기 때문에 시간이 일정하고 모든 브라우저에서 같은 결과가 나와요. 반복은 무한 반복이에요.
- **WebM**: 캔버스를 **실시간 녹화**해요. 녹화하는 동안 탭을 보이는 상태로 두세요. 투명 배경은 Chrome/Edge 기준이고, 결과 배경이 검게 나오면 VP8/VP9를 바꿔 보거나 WebP를 쓰세요. MediaRecorder가 만드는 WebM은 길이 정보가 없어서 일부 편집 프로그램에서는 시크가 안 될 수 있어요.
- 프로젝트는 자동 저장되고(브라우저), "프로젝트 저장"으로 JSON 파일을 내려받아 나중에 불러올 수 있어요. 이미지는 JSON 안에 포함돼요.

## 단축키 (편집기)

- 화면의 레이어를 끌어서 이동, 선택 후 방향키로 1px (Shift는 10px), Delete로 삭제
- 타임라인 막대: 가운데를 끌면 이동, 양 끝을 끌면 길이 조절

## 파일 구성

```
index.html        화면
css/style.css     스타일
js/fx.js          이펙트 엔진 (모션 계산, 그리기)
js/editor.js      편집기 UI
js/apng.js        APNG 해석·프레임 합성
js/webp.js        애니메이션 WebP 조립
js/export.js      WebP/WebM 내보내기
js/github.js      GitHub 업로드
js/app.js         탭, 결과 창, 이미지 링크, APNG 변환
```

## 지원 브라우저

최신 Chrome / Edge 권장. Firefox, Safari에서도 WebP 저장과 APNG 변환은 동작하지만 WebM 투명 녹화는 보장되지 않아요.

## 라이선스

MIT
