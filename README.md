# SaveBoth

**Save the current tab as PDF + Markdown, at the same time. 100% local.**

SaveBoth는 현재 보고 있는 웹페이지를 클릭 한 번으로 **PDF 파일**과 **Markdown 파일**로 동시에 저장하는 Chrome 확장(Manifest V3)입니다. 모든 처리는 브라우저 안에서만 이루어지며, 어떤 데이터도 외부 서버로 전송하지 않습니다.

## 핵심 기능

- **Save PDF + Markdown** — 페이지를 스크롤하며 화면을 캡처해 여러 페이지 PDF로 만들고, 동시에 본문을 Markdown으로 추출해 두 파일을 같은 이름으로 다운로드
- **Save PDF Only** / **Save Markdown Only** — 필요한 형식만 저장
- 긴 페이지 지원: viewport 단위로 캡처하여 PDF 여러 페이지로 구성
- 스마트 페이지 분할: 페이지를 자를 때 콘텐츠(이미지·버튼) 한가운데가 아닌 빈 여백에서 분할
- SPA 지원: ChatGPT처럼 내부 스크롤 컨테이너를 쓰는 페이지는 컨테이너를 자동 감지해 그 영역을 스크롤·캡처
- Markdown에 제목, 원본 URL, 저장 시각(front matter), 본문(제목/링크/코드블록/표/이미지) 포함
- 저장 후 원래 스크롤 위치 복원
- 지원되지 않는 페이지(`chrome://` 등)에 대한 명확한 오류 표시
- 부분 성공 처리: PDF와 Markdown 중 하나가 실패해도 나머지는 저장

## 설치 방법 (unpacked)

1. 이 저장소를 내려받습니다.
2. Chrome에서 `chrome://extensions` 를 엽니다.
3. 우측 상단의 **개발자 모드**를 켭니다.
4. **압축해제된 확장 프로그램을 로드합니다** 를 클릭합니다.
5. `saveboth-extension` 폴더를 선택합니다.

## 사용 방법

1. 저장하고 싶은 웹페이지를 엽니다.
2. 툴바에서 SaveBoth 아이콘을 클릭합니다.
3. 팝업에 현재 페이지 제목과 URL이 표시됩니다.
4. **Save PDF + Markdown** 버튼을 클릭합니다.
5. 확장이 페이지를 위에서 아래로 스크롤하며 캡처합니다 (수 초 소요).
6. 다운로드 폴더에 두 파일이 생성됩니다:

```text
page-title_2026-07-03_10-30.pdf
page-title_2026-07-03_10-30.md
```

> 저장이 진행되는 동안에는 탭을 그대로 두는 것이 가장 좋습니다. 완료되면 원래 스크롤 위치로 돌아갑니다.

## Chrome 권한 설명

| 권한 | 사용 목적 |
|------|----------|
| `activeTab` | 사용자가 확장을 클릭한 **현재 탭**에만 접근 |
| `scripting` | 현재 탭에 content script를 주입해 DOM 추출·스크롤 제어 |
| `downloads` | 생성된 PDF/Markdown 파일을 로컬로 다운로드 |
| `storage` | 저장 진행 상태 등 간단한 로컬 상태 저장 |

`<all_urls>`, `debugger`, host permissions 등 광범위한 권한은 사용하지 않습니다.

## 로컬 우선 원칙 (Local-first)

- 웹페이지 콘텐츠, 스크린샷, URL, Markdown 내용을 **외부 서버로 전송하지 않습니다.**
- 원격 분석(telemetry), tracking 코드가 없습니다.
- 계정, 로그인, 클라우드 동기화가 없습니다.
- 확장은 사용자가 버튼을 클릭했을 때만 동작하며, 백그라운드에서 탭을 감시하지 않습니다.

## 생성되는 파일

| 파일 | 내용 |
|------|------|
| `{제목}_{YYYY-MM-DD_HH-mm}.pdf` | 페이지를 위→아래 순서로 캡처한 이미지 기반 PDF (긴 페이지는 여러 PDF 페이지) |
| `{제목}_{YYYY-MM-DD_HH-mm}.md` | front matter(제목·원본 URL·저장 시각) + 본문 Markdown, UTF-8 |

파일명의 위험 문자(`\ / : * ? " < > | # % & { } $ ! ' @ + ` = ` 등)는 `_` 로 치환됩니다.

## 생성하지 않는 것들

- 요약 없음
- AI 프롬프트 없음
- debug report 없음
- capture report 없음
- metadata.json 없음
- log 파일 없음
- 클라우드 업로드 없음

## 알려진 제한사항

1. PDF는 이미지 기반이므로 텍스트 선택이 되지 않을 수 있습니다.
2. 매우 긴 페이지는 안전 제한(높이 300,000px / 400 세그먼트) 때문에 일부만 저장될 수 있으며, 이 경우 UI에 경고가 표시됩니다. 긴 페이지일수록 캡처 시간이 오래 걸립니다(세그먼트당 약 0.7초, 400세그먼트 기준 최대 5분).
3. 무한 스크롤 페이지는 완전히 저장되지 않을 수 있습니다.
4. lazy-loaded 이미지가 일부 누락될 수 있습니다.
5. sticky header는 PDF 두 번째 페이지부터 자동으로 숨김 처리됩니다. 다만 일부 사이트 구조에서는 완전히 숨겨지지 않고 반복해 나타날 수 있습니다.
6. cross-origin iframe 콘텐츠는 Markdown으로 변환되지 않을 수 있습니다.
7. 사이트 구조에 따라 Markdown 품질이 달라질 수 있습니다.
8. `chrome://` 같은 브라우저 내부 페이지, 웹 스토어, `file://` 페이지는 저장할 수 없습니다.
9. 페이지 분할은 콘텐츠 사이 여백을 찾아 이루어지지만, 여백이 전혀 없는 빽빽한 페이지나 화면보다 큰 이미지는 여전히 중간에서 분할될 수 있습니다.
10. 매우 긴 채팅(ChatGPT 등)은 화면에 렌더되지 않은 과거 메시지가 Markdown에서 빠질 수 있습니다. `Save PDF + Markdown`으로 저장하면 캡처 과정에서 대화를 끝까지 스크롤하므로 더 많은 내용이 포함됩니다.

## 개발 방법

빌드 과정이 없습니다. 소스를 수정한 뒤 `chrome://extensions` 에서 새로고침 버튼을 누르면 됩니다.

```text
saveboth-extension/
  manifest.json              Manifest V3 정의
  src/
    background/serviceWorker.js   저장 파이프라인 조율 (캡처/변환/다운로드)
    popup/                        팝업 UI
    content/contentScript.js      페이지 정보·스크롤·Markdown 추출
    lib/
      captureUtils.js        세그먼트 계산, JPEG 파싱
      pdfGenerator.js        JPEG → PDF 조립 (외부 라이브러리 없음)
      markdownExtractor.js   본문 선택 + HTML → Markdown 변환
      filenameUtils.js       파일명 sanitize / timestamp
      metadataUtils.js       front matter 생성
      downloadUtils.js       chrome.downloads 래퍼
      errorUtils.js          URL 검증, 결과 집계
  tests/
    unit/                    Node 내장 test runner 기반 단위 테스트
    fixtures/                테스트용 HTML
```

## 테스트 방법

```bash
npm install   # 테스트 전용 devDependency(jsdom) 설치
npm test      # node --test tests/unit/
```

## 수동 QA 체크리스트

다음 페이지 유형에서 직접 테스트하세요.

- [ ] 짧은 블로그 글
- [ ] 긴 블로그 글
- [ ] GitHub README
- [ ] GitHub Issue
- [ ] 기술 문서 페이지
- [ ] ChatGPT 등 긴 대화 페이지
- [ ] 뉴스 기사 페이지
- [ ] 코드블록이 있는 페이지
- [ ] 표가 있는 페이지
- [ ] 이미지가 많은 페이지
- [ ] sticky header가 있는 페이지
- [ ] `chrome://extensions` 같은 지원되지 않는 페이지

각 테스트에서 확인할 항목:

1. 팝업에 현재 페이지 제목이 표시되는가?
2. 팝업에 현재 페이지 URL이 표시되는가?
3. `Save PDF + Markdown` 버튼이 동작하는가?
4. PDF 파일이 다운로드되는가?
5. Markdown 파일이 다운로드되는가?
6. PDF가 일반 뷰어에서 열리는가?
7. PDF에 주요 화면 내용이 위→아래 순서로 포함되는가?
8. Markdown에 제목, URL, 저장 시각, 본문이 포함되는가?
9. Markdown에 요약이나 AI 프롬프트가 들어가지 않는가?
10. 저장 후 원래 스크롤 위치가 복원되는가?
11. 지원되지 않는 페이지에서 명확한 오류가 표시되는가?
12. 개발자도구 Network 탭에서 외부 네트워크 요청이 발생하지 않는가?

## 라이선스 / 개인정보

개인정보 처리 원칙은 [PRIVACY.md](PRIVACY.md)를 참조하세요.
