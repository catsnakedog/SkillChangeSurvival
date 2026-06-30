# BRGridMapSystem 후속 작업 프롬프트

이 프로젝트는 MapleStory Worlds 프로젝트다. 맵 시스템 작업 전에는 MSW foundation 문서와 `msw-scripting` 검증 절차를 먼저 따른다.

## 현재 방향

MSW에서는 타일맵을 런타임에 생성하거나 임의 위치로 이동시키지 않는다. 따라서 이 시스템은 실제 방을 만드는 코드가 아니라, Maker에 미리 배치된 고정 방 위치를 논리 5x5 맵 데이터와 연결하는 시스템이다.

`gridMap_{x}_{y}`는 방 프리팹이 아니다. 각 방 중앙을 가리키는 빈 앵커다.

## 현재 남은 파일

- `RootDesk/MyDesk/_Scripts/Map/BRGridMapDataLogic.mlua`
  - 5x5 논리 맵 생성.
- `RootDesk/MyDesk/_Scripts/Map/BRGridMapLayoutTool.mlua`
  - `GridParts/gridMap_{x}_{y}` 등록.
  - 포탈 마커 표시/숨김.
  - 누락 앵커 런타임 보조 생성.
- `RootDesk/MyDesk/_Scripts/Map/BRGridPortalComponent.mlua`
  - 포탈 마커 메타데이터 저장.
- `docs/BRGridMapSystem_README.md`
  - 현재 구조와 테스트 방법.

## 제거된 레거시

아래 구성은 새 정적 앵커 방식과 충돌하므로 제거했다.

- `TestMapGenerate.mlua`
- `BRGridRoomCatalogLogic.mlua`
- `RoomTestMap/TestMapGenerate`
- `RoomTestMap/RoomTemplates`
- `RoomTestMap/GeneratedRooms`

## RoomTestMap 기준 구조

```text
RoomTestMap
  BRGridMapController
  GridParts
    gridMap_1_1
      PortalGuideNorth
      PortalGuideEast
      PortalGuideSouth
      PortalGuideWest
    ...
    gridMap_5_5
  GridPartTemplate
```

## 금지 사항

- 타일맵 엔티티 위치를 코드로 변경하지 말 것.
- 방/타일맵을 런타임에 `Clone`, `SpawnByEntity`, `SpawnByModelId`로 생성하지 말 것.
- `gridMap_x_y.TransformComponent.Position`을 자동 계산식으로 강제 재배치하지 말 것.
- 기존 고정 방이 보이거나 겹친다고 해서 타일맵을 옮기지 말 것.

## 허용되는 작업

- 논리 맵 데이터 생성.
- `GridParts` 아래의 `gridMap_x_y` 존재 여부 검증.
- 누락된 빈 앵커 보조 생성.
- 기존 앵커의 현재 월드 위치 읽기.
- `PortalGuide*` 표시/숨김.
- `BRGridPortalComponent` 메타데이터 부착.
- 플레이어를 목적지 고정 방 위치로 이동시키는 포탈 라우팅.

## 검증 기준

성공 로그:

```text
[BRGridMapLayoutTool] fixed grid room registration count=25 target=25
[BRGridMapLayoutTool] apply complete 5x5, rooms=25, portalDirs=..., seed=..., preplacedRooms=25
```

클라이언트에서 Inspector 버튼을 눌러도 서버 실행이 되어야 한다. `Generate And Apply Map`, `Register Fixed Grid Rooms`, `Create Missing Grid Anchors`, `Debug Grid Map`은 `@ExecSpace("Server")`여야 한다.

`LEA-3022 InvalidExecSpace`가 다시 뜨면 버튼으로 호출되는 함수의 ExecSpace를 먼저 확인한다.

## 다음 작업 후보

- 실제 입구/출구 위치를 `PortalGuide*` 월드 위치 기준으로 사용하는 포탈 이동 정밀화.
- `EnablePortalRouting=true` 상태에서 플레이어 포탈 이동 검증.
- 상자 스폰 위치, 몬스터 스폰 위치, 플레이어 스폰 위치를 각 `gridMap_x_y` 하위 마커로 등록.
