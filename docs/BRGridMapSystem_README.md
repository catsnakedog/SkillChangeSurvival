# BRGridMapSystem 설명

## 핵심 개념

이 맵 시스템은 MSW에서 타일맵을 런타임에 생성하거나 이동할 수 없다는 전제를 기준으로 만든다.

실제 방, 타일맵, 발판, 장식, 상자 위치는 Maker에 미리 배치한다. 코드는 `gridMap_{x}_{y}` 앵커의 현재 월드 위치를 읽어서 논리 그리드 좌표와 연결한다.

즉, `gridMap_1_1`은 방 프리팹이 아니라 이미 존재하는 고정 방 위치를 가리키는 빈 앵커다.

## 남겨진 구성

- `BRGridMapDataLogic`
  - 5x5 논리 맵 데이터를 생성한다.
  - 네 모서리 스폰 방과 중앙 목적지 연결, 고립 방 연결, 포탈 방향 생성을 담당한다.
- `BRGridMapLayoutTool`
  - `GridParts/gridMap_{x}_{y}` 앵커를 등록한다.
  - 생성된 포탈 방향 데이터에 맞춰 앵커 하위 `PortalGuide*` 마커를 켜고 끈다.
  - 필요 시 누락된 앵커를 보조 생성하는 Inspector 버튼을 제공한다.
- `BRGridPortalComponent`
  - 포탈 마커에 현재 방 좌표, 방향, 목적지 좌표 메타데이터를 붙인다.

## RoomTestMap 구조

`RoomTestMap`에는 아래 구조만 맵 시스템용으로 남긴다.

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

삭제된 레거시 구성:

- `TestMapGenerate`
- `RoomTemplates`
- `GeneratedRooms`
- `BRGridRoomCatalogLogic`

## 세팅 방법

1. Maker에서 `RoomTestMap > GridParts` 아래의 `gridMap_1_1`부터 `gridMap_5_5`까지 확인한다.
2. 각 `gridMap_x_y` 앵커를 실제 고정 방의 중앙 위치로 옮긴다.
3. 각 앵커 하위의 `PortalGuideNorth/East/South/West`를 실제 입구 위치에 맞춘다.
4. 타일맵이나 방 오브젝트 자체는 코드로 이동시키지 않는다.
5. `BRGridMapController`에서 `Generate And Apply Map`을 실행하거나 `GenerateOnBeginPlay=true`로 테스트한다.

## 주요 Inspector 값

```text
GenerateOnBeginPlay = true
EnablePortalRouting = false
GridWidth = 5
GridHeight = 5
RoomWidth = 16
RoomHeight = 9
GridPartRootPath = "GridParts"
GridPartTemplatePath = "GridPartTemplate"
TotalPartCount = 25
```

## Inspector 버튼

- `Register Fixed Grid Rooms`
  - 현재 존재하는 `gridMap_x_y` 앵커를 등록하고 위치를 로그로 출력한다.
- `Create Missing Grid Anchors`
  - 누락된 `gridMap_x_y` 앵커를 `GridPartTemplate` 기준으로 런타임 보조 생성한다.
  - 클라이언트에서 눌러도 서버에서 실행되도록 `@ExecSpace("Server")`로 열어두었다.
- `Generate And Apply Map`
  - 논리 맵 데이터를 생성하고, 기존 앵커의 포탈 마커 표시와 메타데이터를 갱신한다.
- `Debug Grid Map`
  - 마지막 생성 요약을 로그로 출력한다.

## 테스트 방법

1. Maker Refresh를 실행한다.
2. Build Console에 Error가 없는지 확인한다.
3. Play Test를 실행한다.
4. Runtime Console에서 아래 로그를 확인한다.

```text
[BRGridMapLayoutTool] fixed grid room registration count=25 target=25
[BRGridMapDataLogic] generated 5x5, rooms=25, portalDirs=...
[BRGridMapLayoutTool] apply complete 5x5, rooms=25, portalDirs=..., seed=..., preplacedRooms=25
```

`fixed grid room missing: gridMap_1_1` 같은 로그가 뜨면 코드 문제가 아니라 해당 앵커가 `GridParts` 아래에 없거나 이름이 맞지 않는 상태다.

## 주의 사항

- 타일맵 엔티티 위치를 코드로 바꾸지 않는다.
- 방 자체를 런타임에 `SpawnByEntity`, `SpawnByModelId`, `Clone`으로 만들지 않는다.
- `gridMap_x_y` 앵커만 실제 방 위치를 가리키도록 옮긴다.
- `PortalGuide*`는 실제 포탈 프리팹이 아니라 배치/메타데이터용 마커다.
- 현재 자동 포탈 이동은 `EnablePortalRouting=false`로 꺼져 있다. 배치 검증 후 켠다.
