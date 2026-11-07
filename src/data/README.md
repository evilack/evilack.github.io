# 설정과 소스 편집 안내

`website/`의 HTML·CSS·JS는 생성 결과입니다. 저장소 게시본에서는 같은 결과가 루트에 있습니다. 결과를 직접 고치면 다음 빌드에서 덮어쓰므로 아래 원본을 수정하고 `pnpm build`를 실행합니다.

## 무엇을 어디에서 바꾸나요?

| 바꿀 내용 | 수정할 원본 |
| --- | --- |
| 사이트 이름·작성자·공개 주소·포트폴리오/프로젝트 링크 | `src/data/site.json`의 `site` |
| 지원 언어·기본 언어·URL 매개변수·저장 키 | `site.json`의 `localization` |
| 언어별 페이지 파일명·호환 주소 | `site.json`의 `pages` |
| 공통 메뉴 순서와 목적지 | `site.json`의 `navigation` |
| 프로젝트/소개/후원 섹션의 앵커 이름 | `site.json`의 `anchors` |
| 대표 앱·이미지 파일·이미지 크기 | `site.json`의 `featured`, `assets` |
| 응원할 프로젝트 이름·식별자·실제 결제 주소 | `site.json`의 `support.projects` |
| 후원 기본 선택·URL 매개변수·저장 키 | `site.json`의 `support` |
| 화면에 표시하는 영어·한국어 문구 | `src/locales/en.json`, `ko.json` |
| 화면의 의미 구조 | `src/templates/home.html`, `support.html` |
| 색·여백·반응형 규칙 | `src/styles/` |
| 출력/게시 경로·미리보기 포트·검증 환경 | `project.config.json` |

`dom`은 템플릿과 브라우저 컨트롤러를 연결하는 식별자입니다. 일반적인 문구 변경에는 수정할 필요가 없습니다. 식별자를 변경하면 빌더가 HTML과 런타임 설정을 함께 갱신합니다. 메뉴의 `anchor`에는 실제 ID를 반복해서 적지 않고 `anchors`의 키(예: `work`)를 지정합니다.

정적 호스팅에서 `/`를 열 때는 `index.html`이 필요합니다. 홈페이지 파일명을 바꿀 경우 `pages.home.aliases`에 `index.html`과 대상 언어를 남깁니다. 루트 진입점이 없으면 설정 검증에서 빌드를 중단합니다.

## 후원 프로젝트 추가

`support.projects`에 기존 항목과 같은 형태의 객체를 추가합니다. `id`는 소문자로 시작하는 고유 식별자이고, 이름은 공통 `name` 또는 언어별 `labels`로 지정합니다. `payment.url`은 PayPal에서 실제로 만든 결제 항목의 주소여야 하며, `payment.itemName`에는 그 결제 항목명을 기록합니다. 프로젝트 이름을 URL에 붙이는 것만으로 PayPal 결제 항목이 새로 만들어지지는 않습니다.

이 카탈로그 한 곳으로 라디오 선택 목록, JavaScript를 끈 상태의 직접 링크, 선택 요약과 실제 결제 버튼을 생성합니다. 새 프로젝트를 위해 컨트롤러에 `if` 분기를 추가하지 않습니다. 기본 선택은 `support.defaultProject`입니다. 저장 키와 프로젝트 ID는 기존 방문자의 선택을 기억하는 계약이므로 의도적으로 마이그레이션할 때만 변경합니다.

## 문구와 템플릿

번역의 `{brand}`, `{featured}`, `{author}`, `{currency}`, `{provider}`는 설정에서 채웁니다. 같은 이름이나 통화를 여러 문장에서 직접 반복할 필요가 없습니다. `ui`는 홈페이지와 후원 페이지가 공유하는 메뉴·접근성 문구입니다.

템플릿의 `{{text.hero.title}}` 같은 이중 중괄호는 HTML을 이스케이프합니다. 삼중 중괄호는 빌더가 만든 공통 헤더·목록 등의 조각에만 사용합니다. 문구에 필요한 줄바꿈과 강조 태그는 제한된 허용 목록으로 처리합니다. 누락된 번역·자리표시자를 빈 문자열로 숨기지 않고 빌드를 중단합니다.

## 실행 흐름과 캡슐화

1. `tools/build-site.mjs`가 공통 설정을 읽고 검증합니다.
2. `tools/lib/site-builder.mjs`가 두 템플릿으로 다섯 정적 페이지를 생성합니다. 헤더·푸터·후원 선택 목록은 공통 렌더러를 사용합니다.
3. esbuild가 홈페이지용 언어 기능과 후원 페이지용 언어/선택 기능을 각각 하나의 작은 번들로 만듭니다. 홈페이지에는 사용하지 않는 후원 선택 코드와 결제 카탈로그를 싣지 않습니다.
4. 설정 JSON은 HTML에 함께 넣습니다. 초기 언어 선택에 추가 네트워크 요청이 필요하지 않습니다. 번들 주소와 CSS 버전에는 내용 해시를 사용합니다.
5. `LanguagePolicy`와 `ProjectPolicy`는 우선순위만 결정합니다. DOM과 저장소를 알지 않으므로 입력값으로 독립 검증할 수 있습니다.
6. `PreferenceStore`는 저장소 차단·읽기/쓰기 실패를 처리합니다. `LocaleController`와 `SupportController`는 이벤트와 DOM 연결을 맡고 내부 상태를 private 필드에 보관합니다.

초기 언어 판단은 다른 언어 화면이 잠깐 나타나는 일을 줄이기 위해 `head`에서 실행합니다. 나머지 연결은 DOM 준비 후 수행합니다. 뒤로 가기 캐시에서는 스크립트가 다시 실행되지 않으므로 `pageshow`에서 선택을 복원합니다. 결제 URL은 사용자 입력으로 조립하지 않고 검증된 카탈로그에서만 가져옵니다.

## 생성·검증·게시

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check:generated
pnpm test
pnpm preview
```

별도 터미널에서 `pnpm verify:home`, `verify:locale`, `verify:header`, `verify:projects`, `verify:paypal`, `verify:history`를 실행합니다. `CHROME_PATH`로 Chrome 경로, `EV_CABINET_PREVIEW_PORT`로 로컬 포트, `EV_CABINET_VERIFY_ORIGIN`으로 검사할 공개 주소를 지정할 수 있습니다.

`--check`는 파일을 쓰지 않습니다. 일반 빌드는 이전 생성 목록과 명시된 구형 생성물만 정리하고, 그 외 파일은 보존합니다. 빌드 전에 데이터·번역·번들을 메모리에서 완성하므로 설정 오류를 먼저 발견할 수 있습니다. 파일 시스템 오류가 발생한 경우에는 오류를 해결하고 다시 빌드합니다.

`pnpm prepare:publish`는 최신 생성물과 편집 원본을 설정된 게시 준비 폴더로 모읍니다. 자체적으로 푸시하지 않습니다. 원격 저장소의 정적 출력 위치는 `publication.output`에서 지정합니다. 게시 후 `node tools/watch-publication.mjs <전체 커밋 SHA>`로 해당 커밋의 Pages 실행을 확인하고 `pnpm verify:published`로 실제 공개 파일과 브라우저 동작을 대조합니다.

JavaScript의 `const`는 지역 변수의 재대입 방지에 사용합니다. 사용자께서 요청하신 상수/하드코딩 제거는 변경 가능한 서비스 정보·주소·키·문구를 설정 데이터로 모으고 중복 정의를 없애는 뜻으로 적용했습니다. 테스트에는 기존 동작을 독립적으로 대조하기 위한 기대값이 남아 있습니다.
