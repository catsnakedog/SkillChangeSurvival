# Plan: 스킬 단축키 표시 + 키세팅(퀵슬롯식 재바인딩) 모드

**Status: pending approval** — /omc-plan 산출물(계획만). 승인 전 소스 미수정.

## Requirements Summary
1. **단축키 표시**: 각 스킬 아이콘의 **왼쪽 아래**에 단축키를 작은 글씨로 상시 표시.
2. **키세팅 진입**: (미래) 설정창의 "키세팅" 버튼 → 키세팅 모드 진입. 설정창은 **꺼지지 않음**.
3. **키세팅 오버레이**: 화면 전체를 어둡게(딤) + **스킬 UI만 밝게**(단, **체인 상태 UI 제외**). 화면 중앙에 "밝게 변경할 스킬을 선택하세요" 텍스트 + **확인/취소** 버튼.
   - 확인 = **저장 및 종료**, 취소 = **진입 전 상태로 롤백**.
4. **선택 표시**: 키세팅 중 스킬 아이콘을 **마우스 클릭** → 그 아이콘 **테두리가 흰색으로 빛남**(선택 상태).
5. **키 재바인딩**: 선택 상태에서 **제한 키를 제외한** 키 입력 → 그 스킬 단축키를 해당 키로 변경. 왼쪽 아래 라벨 즉시 갱신.
6. 레퍼런스: **메이플스토리 퀵슬롯 변경**과 동일 UX.

## Key Codebase Facts
- 스킬 UI 파일: `ui/BRBattleHudGroup.ui`(배틀 HUD, 체인 슬롯 `Bg/ChainPart_1..5` + 대표아이콘 `Bg/SkillChain_5`), `ui/BRSkillChainGroup.ui`, `ui/BRSkillPartTestGroup.ui`(스킬 인벤토리 25슬롯). 컨트롤러: `RootDesk/MyDesk/_Scripts/UI/BRSkillChainUI.mlua`, `BRSkillPartTestUI.mlua`.
- **"체인 상태 UI"** = 배틀 HUD의 체인 슬롯 표시(`BRSkillChainUI` on `/ui/BRBattleHudGroup`). 키세팅 시 밝게 할 "스킬 UI"에서 **제외 대상**.
- 입력: `_InputService:ConnectEvent(KeyDownEvent, ...)` + `event.key == KeyboardKey.X` 패턴(BRCommonSkillSystem L159, BRSkillChainUI L340).
- **예약(사용 중) 키**: `Q`(유니크), `C`(버스트스텝/Blink & NPC), `E`(근두운), `V`(캐릭터전환), `F`(파츠NPC), `X`, `Z`(아이템 획득), 방향키(이동/Blink 방향), `Mouse0/1/2`(체인 슬롯 드래그·우클릭). → 재바인딩 금지 후보.
- 스킬 시전은 현재 **체인 시퀀스 방식**(`BRSkillSystem:RequestCastNextChainSkill`) — 개별 스킬당 핫키 캐스팅 모델이 아직 없음(핵심 결정 포인트 D1).
- `.ui`는 **UIBuilder(msw-ui-system) 경유 필수**, `.mlua`는 `.codeblock` 페어 + Maker refresh. UI 관련 규칙은 msw-ui-system + builder-protocol 준수.

## Open Decision Points (승인 전 확정 필요 — 구현 막힘 방지)
- **D1 캐스팅 모델**: 단축키가 (a) 개별 스킬을 각각 시전하는 **신규 퀵슬롯 캐스팅**인지, (b) 표시/체인 편집용 라벨인지, (c) 기존 체인 트리거 키 재지정인지. → 현재 체인 시퀀스 구조와 어떻게 연동할지가 전체 범위를 좌우.
- **D2 대상 슬롯**: 단축키/키세팅 대상이 배틀 HUD 체인 슬롯(`ChainPart_1..5`)인지, 스킬 인벤토리(25슬롯)인지, 둘 다인지.
- **D3 제한 키 목록**: Q/C/E/V/F/X/Z/방향키/마우스 확정. 점프·공격(Ctrl) 포함 여부.
- **D4 중복 키**: 이미 다른 슬롯에 쓰이는 키를 누르면 → 스왑 / 거부 / 덮어쓰기 중 택1.
- **D5 저장 영속화**: `_DataStorageService`(계정별 저장) vs 세션 한정. 저장 스키마.

## Design (D1~D5 확정 후 구체화; 아래는 기본안)
### A. 단축키 라벨 (선행, 독립 작업 가능)
- 각 스킬 슬롯 엔티티에 자식 `TextComponent`(SpriteGUIText) 추가, 앵커 **bottom-left**, 작은 폰트. UIBuilder로 `.ui` 편집.
- 라벨 텍스트는 런타임에 현재 키 매핑에서 채움(컨트롤러 `.mlua`에서 `SetText`).

### B. 키세팅 오버레이 (`.ui` 신규 그룹 예: `SkillKeybindGroup.ui`)
- 전체화면 반투명 검정 패널(딤). 그 **위 레이어(displayOrder 상위)** 로 스킬 UI를 복제/부각 or 스킬 UI 그룹의 displayOrder를 딤 위로 올림(체인 상태 UI 제외).
- 중앙: 안내 텍스트 + 확인/취소 버튼(기존 `UIPopup.mlua` 버튼 패턴 참고).

### C. 키세팅 상태머신 (`.mlua` 신규 예: `BRSkillKeybindUI.mlua`)
- 진입 `EnterKeybindMode()`: 현재 매핑 백업(취소 롤백용), 딤+부각 on, 입력 캡처 시작.
- 스킬 아이콘 클릭 → `selectedSlot` 설정 + 해당 아이콘 테두리 흰색 글로우(테두리 스프라이트 or 컬러 변경).
- `KeyDownEvent` 캡처 → 제한 키(D3)면 무시, 아니면 `selectedSlot` 매핑을 그 키로 갱신 + 라벨 갱신 (+ D4 중복 처리).
- 확인 = 매핑 저장(D5) + 모드 종료(딤/부각/캡처 해제). 취소 = 백업 복원 + 종료.
- 제한 키·중복·저장은 D3/D4/D5 결정에 따라 구현.

## Acceptance Criteria (testable)
1. 각 스킬 아이콘 왼쪽 아래에 현재 단축키 글씨가 보인다.
2. 키세팅 진입 시 화면이 어두워지고 스킬 UI만 밝게 보이며, **체인 상태 UI는 밝아지지 않는다**.
3. 중앙에 안내 텍스트 + 확인/취소 버튼이 보인다.
4. 스킬 아이콘 클릭 시 그 아이콘 테두리가 흰색으로 빛난다(선택 표시).
5. 선택 상태에서 제한 키 외 키 입력 시 단축키가 그 키로 바뀌고 라벨이 즉시 갱신된다.
6. 제한 키 입력은 무시된다.
7. 확인 → 변경 저장 후 종료(재진입 시 유지). 취소 → 진입 전 매핑으로 롤백 후 종료.

## Risks & Mitigations
- **R1 캐스팅 모델 불명확(D1)** → 구현 전 D1 확정. 미확정 시 A(라벨 표시)만 선행.
- **R2 입력 충돌**: 키세팅 중 캡처한 키가 게임/다른 UI 핸들러로도 전달되어 오작동 → 키세팅 모드 동안 다른 스킬/이동 입력 게이팅(모드 플래그).
- **R3 `.ui` 딤 레이어링**: 스킬 UI만 딤 위로 올리되 체인 상태 UI는 아래 유지 — displayOrder/그룹 분리 설계 필요.
- **R4 설정창 미존재**: 진입점(설정 버튼)이 아직 없음 → 임시 트리거(디버그 키/NPC)로 키세팅 모드 테스트, 설정창 생기면 버튼만 연결.
- **R5 부모 에이전트와 파일 충돌**: 부모가 현재 `BRSkillSystem.mlua`/`BRCommonSkillSystem.mlua`(입력·체인) 수정 중 → 본 작업은 **신규 UI/키세팅 파일 위주**로 한정하고 기존 스킬 시스템과는 메서드 호출 인터페이스로만 연동.

## Files (예상)
- 신규: `ui/SkillKeybindGroup.ui`(딤+안내+버튼), `RootDesk/MyDesk/_Scripts/UI/BRSkillKeybindUI.mlua`(상태머신·입력캡처·저장).
- 수정: 스킬 슬롯 `.ui`(`BRBattleHudGroup.ui` 또는 스킬 인벤 `.ui`)에 단축키 라벨 자식 추가 + 선택 글로우 테두리; 매핑 저장 연동(D5에 따라 DataStorage 또는 세션).

## Verification
- Maker refresh → play → 라벨 표시 확인 → 키세팅 진입(임시 트리거) → 딤/부각(체인 UI 제외) 확인 → 아이콘 클릭 글로우 → 키 입력 재바인딩/제한키 무시 → 확인/취소 롤백 확인.
