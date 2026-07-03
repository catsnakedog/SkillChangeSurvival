# 방 내부 미니맵 (BRRoomMiniMapUI) — 작업 계획

상태: **구현 완료 — 런타임 검증 대기** (Maker MCP 미연결로 refresh/play 검증 불가; 정적 검증(ui_lint clean, 바인딩 주입)은 통과)
작성: 2026-07-03 | 구현: 2026-07-04 | 세션: 미니맵 작업

## 1. 요구사항 요약

- 5×5 그리드 지도(기존 `BRMiniMapUI`)는 **그대로 유지**하고, 별개 패널로 **플레이어가 현재 들어가 있는 방(한 칸, 10×10 월드유닛) 내부**를 보여주는 메이플 스타일 미니맵을 신규 제작한다.
- 초기 버전은 **반투명 검은 배경** + 마커만 (지형 아트 없음).
- 표시 요소 (사용자 확정):
  1. **내 위치** — 노란 점, 실시간
  2. **같은 방의 다른 플레이어** — 빨간 점
  3. **아이템/보급품** — 방 안에 떨어진 스킬 파츠·보급 상자
  4. **포탈 방향** — 현재 방에서 열려 있는 N/E/S/W 방향을 가장자리에 파란색 표시
  5. **발판(Foothold)** — 밟을 수 있는 플랫폼을 밝은 회색 선분으로 표시 (메이플 미니맵의 지형 실루엣)

## 2. 산출물

| 파일 | 내용 |
|---|---|
| `RootDesk/MyDesk/_Scripts/UI/BRRoomMiniMapUI.mlua` | 신규 @Component (ClientOnly 렌더 루프) |
| `ui/BRRoomMiniMapGroup.ui` | 신규 UI 그룹 (UIBuilder로 생성) |

## 3. UI 구조 (UIBuilder)

```
BRRoomMiniMapGroup [GROUP, default_show=true]
├── Controller [script.BRRoomMiniMapUI, stretch]
└── Panel [top-left 앵커, pos≈(20,-20), 240×286, 초기 Enable=false]
    ├── Bg        [SPR 검정, alpha 0.65, stretch]
    ├── Title     [TEXT 상단, 방 좌표/이름 예: "ROOM 2-3"]
    └── MapArea   [PANEL 200×200 — 10×10 유닛 → 1유닛=20px 선형 매핑]
        ├── Fh_1 .. Fh_24       [SPR 밝은 회색(예: #9AA5B1, alpha 0.9) 얇은 바, 기본 Enable=false] (발판 풀, 마커보다 아래 레이어)
        ├── PortalN / PortalE / PortalS / PortalW  [SPR 파랑, 각 변 중앙, 기본 Enable=false]
        ├── Item_1 .. Item_12   [SPR 8×8, 기본 Enable=false]  (정적 풀)
        ├── Enemy_1 .. Enemy_8  [SPR 10×10 빨강, 기본 Enable=false] (정적 풀)
        └── Me                  [SPR 10×10 노랑, 최상단]
```

- 기존 그리드 지도 Panel은 pos=[-169,0](우측)이므로 **좌측 상단** 배치로 겹침 회피 (메이플 관례와 동일).
- 정적 마커 풀 + Enable 토글 방식 — 기존 `BRMiniMapUI`의 Cell/Link 정적 풀 패턴과 동일 (런타임 Clone 최소화).

## 4. 스크립트 설계 (`BRRoomMiniMapUI.mlua`)

기존 `BRMiniMapUI.mlua`의 검증된 패턴을 재사용:

- **라이프사이클**: `OnBeginPlay`(ClientOnly)에서 `_TimerService:SetTimerRepeat` 등록, `OnEndPlay`에서 해제 (BRMiniMapUI.mlua:34-51 패턴). 위치 갱신 주기 0.1s, 아이템 스캔 주기 0.5s 분리.
- **표시 조건**: `_BRRoomGraphGenerator.LastMiniMapMapName == localPlayer.CurrentMapName` (BRMiniMapUI.mlua:72-88 `ShouldShow()`와 동일 규칙).
- **현재 방 판정**: `LastMiniMapAssignments` 파싱 → 물리 방(`/maps/{map}/EditorGeneratedGrid/{room}`)의 `WorldPosition` + 반크기(`BRGridMapEditorTool:GetRoomWidth/Height`, 폴백 10×10)로 포함 판정 — `BRRoomGraphGenerator.mlua:1106-1150` `GetLogicalRoomForPosition` 로직의 클라이언트 버전.
- **좌표 변환**: `uiPos = (worldPos − roomCenter) × 20`, 패널 경계로 클램프. `Me`/`Enemy_n` 마커의 `UITransformComponent.anchoredPosition`에 대입.
- **다른 플레이어**: `_UserService:GetUsersByMapName(mapName)` → 로컬 제외, 생존(`PlayerComponent.Hp > 0`, BRRoomGraphGenerator.mlua:1095-1104 패턴), 같은 방 포함 판정 통과한 것만 빨간 점.
- **아이템**: `mapEntity:GetChildComponentsByTypeName("script.BRDroppedSkillPart", true)` + `"script.BRPartBox"` (BRItemPickupSystem.mlua:119-156과 동일 API) → 현재 방 경계 내 필터 → Item 풀에 배치. 0.5s 주기 + 방 변경 시 즉시 재스캔.
- **포탈 방향**: `LastMiniMapConnections`(@Sync, 클라이언트 안전) 파싱 → 현재 논리 셀 기준 열린 방향 계산 (E/S 레코드 + 이웃 셀의 E/S가 나를 가리키는 경우 W/N). BRMiniMapUI.mlua:178-192 `ParseConnections` 패턴 재사용.
- **발판**: `mapEntity.FootholdComponent:GetFootholdAll()` (BRBattleLogic.mlua:515-521과 동일 API) → `StartPoint`/`EndPoint`가 현재 방 사각형(약간의 여유 마진 포함) 안에 있는 선분만 필터 → Fh 풀의 스프라이트 바로 렌더:
  - 수평 발판(`IsHorizontal()` == true, 대부분): 바 폭 = `길이×20px`, 높이 3px, 중점 = `(GetCenter() − roomCenter)×20`.
  - 경사 발판: `UITransformComponent`의 회전 필드가 있으면 각도 적용, 없으면 `LineGUIRendererComponent`(UIBuilder `line()` 컴포넌트)의 런타임 포인트 갱신으로 대체 — **구현 1단계에서 component-api.md로 회전/Line 런타임 API를 확인 후 택1** (수용 기준은 두 방식 모두 동일).
  - 발판은 방 배치 후 불변이므로 **방 진입 시 1회만** 재계산 (매 틱 스캔 금지). 방 바닥은 `CustomFootholdComponent.edgeLists`(@Sync, BRGridMapEditorTool.mlua:425-431에서 생성)에서 나오는 발판도 `GetFootholdAll()`에 포함되므로 별도 처리 불필요.
- **방 변경 감지**: 판정된 room key가 바뀌면 Title 갱신 + 아이템 재스캔 + 로그.
- 모든 주요 지점에 `log()` (`[BRRoomMiniMapUI]` prefix, VerboseLog 프로퍼티).

## 5. 수용 기준 (테스트 가능)

1. `refresh` 후 빌드 로그에 에러 0건, `ui_lint` clean.
2. play 모드에서 매치 그래프 활성 시(`DebugGenerateRoomGraph`) 패널 표시, `[BRRoomMiniMapUI] visible=true` 로그.
3. 방 중앙에 서면 노란 점이 MapArea 중앙(±2px), 방 경계로 이동하면 점이 패널 가장자리에 위치 (로그로 uiPos 좌표 검증).
4. 포탈로 옆 방 이동 시 0.3s 이내 Title·포탈 표시 갱신, `room changed` 로그.
5. 같은 방 생존 플레이어 수 == 빨간 점 수 (봇 테스트로 검증).
6. 방 안 스킬 파츠 수 == 아이템 마커 수, 픽업 시 0.5s 이내 소멸.
7. 파란 포탈 표시 방향 == 그리드 지도의 해당 셀 링크 방향과 일치.
8. 현재 방 경계 내 발판 수 == 회색 발판 바 수 (로그로 필터된 발판 수 출력해 비교), 방 바닥 발판이 MapArea 하단에 수평선으로 표시됨.
9. 발판 위에 서 있을 때 노란 점이 해당 발판 바 위(±3px)에 위치 — 좌표 변환 일관성 검증.

## 6. 리스크와 완화

| 리스크 | 완화 |
|---|---|
| `GetChildComponentsByTypeName` 재귀 탐색 비용 | 0.5s 주기 캐시 + 방 변경 시에만 강제 재스캔 |
| `GetUsersByMapName`이 클라이언트에서 미지원일 가능성 | 구현 전 `.d.mlua` 시그니처 확인; 폴백 = 맵 자식 중 `PlayerComponent` 보유 엔티티 순회 |
| 포탈 Enable 상태의 클라이언트 동기화 지연 | 물리 포탈 대신 이미 @Sync인 `LastMiniMapConnections` 페이로드 사용 (선택한 방식) |
| 마커 풀 고갈 (아이템 12개 초과, 발판 24개 초과) | 초과분 미표시 + 로그 1회 |
| 기존 HUD와 겹침 | 좌측 상단 배치, `preview_ui_layout.cjs`로 확인 |
| 경사 발판의 UI 회전 표현 불가 가능성 | 1순위: UITransform 회전 필드 / 2순위: LineGUIRenderer 런타임 포인트 / 최후: 경사 발판을 수평 근사 (중점 기준) — 어느 경우든 수평 발판 표시는 보장 |
| 방 경계에 걸친 발판이 이웃 방 것과 중복 표시 | 필터 조건을 "양 끝점 모두 방 사각형(+0.5유닛 마진) 내"로 제한 |

## 7. 구현 순서

1. `msw-scripting` SKILL + `verify-checklist.md` 로드 (mlua 작성 필수 선행), `msw-ui-system/references/component-api.md`에서 UITransform 회전 필드·LineGUIRenderer 런타임 API 확인 → 경사 발판 렌더 방식 확정
2. `BRRoomMiniMapUI.mlua` 작성
3. UIBuilder 스크립트로 `BRRoomMiniMapGroup.ui` 생성 + `bind`로 프로퍼티 UUID 주입
4. `refresh` → 빌드 로그 확인
5. play → `DebugGenerateRoomGraph` → 이동/픽업 시나리오 → `logs` 검증 → `stop`
6. 검증 실패 시 수정 후 4-5 반복
