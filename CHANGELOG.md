# Changelog

이 프로젝트의 주요 변경사항을 기록합니다.
형식은 [Keep a Changelog](https://keepachangelog.com/ko/1.0.0/)를 따릅니다.

## [Unreleased]

### Added

- 저장 위치 설정 UI (팝업의 "Save location settings"): 네이티브 폴더 선택 다이얼로그로 저장 폴더를 한 번 지정하면 변경 전까지 계속 재사용(File System Access API, `chrome.storage.local` + IndexedDB에만 저장, 추가 권한 불필요), 또는 저장할 때마다 폴더 선택 창 표시
- 지정한 폴더 접근 권한이 끊긴 경우(브라우저 재시작 등) 재연결(Reconnect) 버튼 제공, 저장 시점에 접근 불가하면 기본 Downloads 폴더로 자동 대체 저장

## [1.0.0] - 2026-07-04

### Added

- Manifest V3 기반 SaveBoth Chrome 확장 최초 구현
- `Save PDF + Markdown` / `Save PDF Only` / `Save Markdown Only` 버튼
- 현재 탭을 viewport 단위로 스크롤 캡처하여 여러 페이지 PDF로 조립 (외부 라이브러리 없는 자체 PDF 생성기)
- DOM 기반 Markdown 추출 (`article` > `main` > `[role="main"]` > 텍스트 밀도 > `body` 우선순위, front matter 포함)
- 안전한 파일명 생성 및 PDF/Markdown 동일 base filename 규칙
- 지원되지 않는 페이지(`chrome://` 등) 오류 처리, PDF/Markdown 부분 성공 처리
- 저장 후 원래 스크롤 위치 복원
- **레이아웃 테이블 인식**: 이메일 뉴스레터처럼 중첩 `<table>`로 레이아웃을 짠 페이지를 데이터 표(파이프 테이블)가 아닌 일반 본문 흐름으로 변환하고, 표 자신의 행만 처리해 중복 출력을 방지
- **스마트 페이지 분할**: PDF 페이지를 자를 때 콘텐츠 중간이 아닌 빈 여백 행을 찾아 분할해 이미지·버튼이 페이지 경계에서 잘리는 문제 방지
- **SPA/내부 스크롤 컨테이너 지원**: ChatGPT처럼 window가 아닌 내부 컨테이너가 스크롤되는 페이지를 자동 감지해 해당 영역만 스크롤·캡처
- **대화형 페이지 Markdown 보존**: 턴마다 별도 `<article>`을 쓰는 대화형 페이지에서 가장 큰 하나만이 아니라 전체 대화를 포함하도록 공통 조상 요소 선택
- **동적 캡처 루프**: 가상화된 페이지(스크롤 중 콘텐츠가 계속 늘어나는 페이지)에 대응해 매 스크롤마다 실시간 높이를 재확인하며 캡처, 첫 캡처 전 페이지 높이 안정화 대기로 잔상 페이지 방지
- **sticky/fixed 헤더 자동 숨김**: 두 번째 캡처 세그먼트부터 고정 헤더를 숨겨 PDF 콘텐츠 가림 방지
- 안전 제한 300,000px / 400 세그먼트로 상향, 폭이 넓은 캡처는 자동 축소 저장하여 파일 크기 관리
- Node 내장 테스트 러너 + jsdom 기반 단위 테스트 52개, 테스트 fixture 9종
- README.md (초보자용 설치 가이드 포함), PRIVACY.md 문서화

### Changed

- README.md 설치 방법을 단계별 상세 가이드로 개선 (ZIP/git 두 가지 다운로드 방법, 실제 명령어, 폴더 선택 스크린샷 설명, 툴바 고정 방법 추가)

[Unreleased]: https://github.com/ai-space-s/save-both-pdf-md/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/ai-space-s/save-both-pdf-md/releases/tag/v1.0.0
