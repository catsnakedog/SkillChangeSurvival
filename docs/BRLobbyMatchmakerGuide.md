# BR Lobby Matchmaker Guide

이 구조는 대기 큐, 큐 저장소, 진행 중 매치룸, 전투 맵 실행, 로비 흐름 조율을 분리한다.

## 모듈 역할

- `BRMatchQueue`: 아직 매칭 대기 중인 `Ticket`과 `Queue` 자료구조를 다룬다.
- `BRMatchQueueStore`: `BRMatchQueue`를 Local runtime 또는 `GlobalDataStorage`에 읽고 쓴다.
- `BRMatchRoomQueue`: 이미 매칭이 성사된 `MatchRoom` 목록과 상태를 다룬다.
- `BRBattleLauncher`: `DynamicMap` 생성, 플레이어 이동, 스폰 위치 계산, 맵 삭제를 다룬다.
- `BRLobbyMatchmaker`: 유저 입장/퇴장, 자동 큐 등록, heartbeat, poll tick, 각 모듈 호출 순서를 조율한다.

## 전체 흐름

```text
유저 로비 입장
-> HandleUserEnterEvent
-> JoinQueue
-> BRMatchQueue:CreateTicket
-> BRMatchQueueStore:ReadQueueSnapshot
-> 큐에 티켓 추가
-> BRMatchQueueStore:CommitQueueAndUpdate

Poll Timer
-> OnMatchmakerTick
-> CleanExpiredMatchRooms
-> RefreshLocalTicketHeartbeats
-> TryMakeMatch
-> TryMakeSingleMatch
-> BRMatchQueue:TakeLocalTickets
-> StartMatchFromTickets
-> BRMatchRoomQueue:CreateMatchRoom
-> BRMatchRoomQueue:AddRoom
-> BRBattleLauncher:StartMatchRoom
-> BRMatchRoomQueue:UpdateRoomState("Gathered")
```

## BRMatchQueue

`BRMatchQueue`는 대기열만 안다. 게임 진행, 맵 이동, 저장소 종류는 모른다.

주요 함수:

- `CreateEmptyQueue(now)`: 빈 대기 큐를 만든다.
- `CreateTicket(...)`: 유저 한 명의 매칭 신청 티켓을 만든다.
- `NormalizeQueue(queue)`: 오래되거나 비어 있는 큐에 기본 필드를 채운다.
- `CleanExpiredTickets(queue, now)`: 만료된 티켓을 제거한다.
- `RefreshLocalTickets(...)`: 현재 서버가 보유한 티켓의 만료 시간을 연장한다.
- `TakeLocalTickets(queue, count, worldInstanceId)`: 현재 WorldInstance가 처리할 수 있는 티켓만 목표 인원만큼 뽑는다.
- `EncodeQueue` / `DecodeQueue`: `GlobalDataStorage` 저장용 문자열 포맷으로 변환한다.

## BRMatchQueueStore

`BRMatchQueueStore`는 큐 저장 위치만 안다.

주요 함수:

- `ReadQueueSnapshot(owner)`: 설정에 따라 local 또는 global 큐를 읽는다.
- `ReadLocalQueueSnapshot(owner)`: `owner._T.queue`를 사용한다.
- `ReadGlobalQueueSnapshot(owner)`: `GlobalDataStorage`에서 문자열을 읽고 `BRMatchQueue:DecodeQueue`로 복원한다.
- `CommitQueueSnapshot(owner, snapshot)`: 변경된 큐를 저장한다.
- `CommitQueueAndUpdate(owner, snapshot, queue)`: 저장 후 `owner:UpdateQueueCounts(queue)`를 호출한다.
- `CommitGlobalQueueSnapshot(owner, snapshot)`: `UpdateAndWait` 기반 CAS 저장을 유지한다.

`BRLobbyMatchmaker` 안의 같은 이름 함수들은 wrapper로 남아 있어서 기존 호출 흐름을 크게 바꾸지 않는다.

## BRMatchRoomQueue

`BRMatchRoomQueue`는 매칭이 성사된 이후의 방 목록을 관리한다.

RoomQueue 구조:

```lua
{
    Version = 1,
    Rooms = {},
    UpdatedAt = now
}
```

MatchRoom 상태:

```text
Creating
Moving
Gathered
Playing
Ended
Failed
Expired
```

주요 함수:

- `CreateEmptyRoomQueue(now)`: 빈 room queue를 만든다.
- `CreateMatchRoom(tickets, ...)`: 선택된 티켓으로 match room을 만든다.
- `AddRoom(roomQueue, room)`: 중복 `MatchId`가 없으면 room을 추가한다.
- `GetRoom(roomQueue, matchId)`: room을 찾는다.
- `RemoveRoom(roomQueue, matchId)`: room을 제거한다.
- `UpdateRoomState(roomQueue, matchId, state, now)`: 상태와 시간 필드를 갱신한다.
- `SetRoomDynamicMap(...)`: 생성된 동적 맵 이름을 저장한다.
- `GetActiveRoomCount(roomQueue)`: `Creating`, `Moving`, `Gathered`, `Playing` 상태 room 수를 센다.
- `CleanExpiredRooms(roomQueue, now)`: 오래된 active room을 `Expired` 상태로 바꾼다. 실제 로비 복귀와 동적 맵 제거는 `BRLobbyMatchmaker:CleanExpiredMatchRooms`가 `BRBattleLauncher`를 통해 처리한다.

## BRBattleLauncher

`BRBattleLauncher`는 전투 맵 실행만 안다. 큐 저장과 티켓 복구는 하지 않는다.

주요 함수:

- `StartMatchRoom(matchRoom, owner)`: 동적 맵 생성 후 room의 플레이어를 이동한다.
- `CreateDynamicMapForRoom(matchRoom, owner)`: `DynamicMapService`로 동적 맵을 만든다.
- `MovePlayersToMatchRoom(matchRoom, owner)`: 현재 서버에 있는 유저를 맵으로 이동시킨다.
- `ReturnPlayersToLobby(matchRoom, owner)`: 이동 실패 처리 시 가능한 유저를 로비로 되돌린다.
- `GetSpawnPosition(matchRoom, index, total, owner)`: 기존 gather 배치 계산을 담당한다.
- `DestroyDynamicMap(mapName)`: 동적 맵을 삭제한다.
- `SetGatherName(userId, index, total)`: 이동한 플레이어의 NameTag를 바꾼다.

## BRLobbyMatchmaker

`BRLobbyMatchmaker`는 이제 흐름을 조율한다.

주요 책임:

- 로비 맵에서만 실행되도록 제어한다.
- 유저 입장/퇴장 이벤트를 받아 `JoinQueue`, `CancelQueue`를 호출한다.
- poll tick에서 heartbeat와 매칭 시도를 실행한다.
- active match 제한을 확인한다.
- 선택된 티켓으로 `MatchRoom`을 만들고 `BRBattleLauncher`를 호출한다.
- 실패하면 room 상태를 `Failed`로 바꾸고 티켓을 복구한다.
- 성공하면 room 상태를 `Gathered`로 바꾸고 Sync 필드를 갱신한다.

## 실패 처리

매칭 성사 후 실패할 수 있는 지점:

- 선택된 유저가 현재 서버에 없음
- `DynamicMap` 생성 실패
- 이동 성공 인원이 `MinStartPlayerCount`보다 적음

실패 시 처리:

```text
MatchRoom State = Failed
DynamicMap 삭제 시도
Ticket Restore
ActiveMatchCount 갱신
MatchmakingPhase / LastError 갱신
```

## 읽는 순서 추천

1. `BRLobbyMatchmaker:HandleUserEnterEvent`
2. `BRLobbyMatchmaker:JoinQueue`
3. `BRMatchQueue:CreateTicket`
4. `BRMatchQueueStore:ReadQueueSnapshot`
5. `BRLobbyMatchmaker:OnMatchmakerTick`
6. `BRLobbyMatchmaker:TryMakeSingleMatch`
7. `BRMatchQueue:TakeLocalTickets`
8. `BRLobbyMatchmaker:StartMatchFromTickets`
9. `BRMatchRoomQueue:CreateMatchRoom`
10. `BRBattleLauncher:StartMatchRoom`
