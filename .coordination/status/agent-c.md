# Agent C 상태 (작성자: Agent C 전용 / 통합자는 '통합자 피드백' 섹션만 씀)

## 현재 작업
(없음)

## 통합자 피드백
- [규약 변경 2026-07-05] **`git merge main` 을 스스로 하지 마라.** 이전 프롬프트의 "주기적 merge main" 지시는 철회한다. 자기 브랜치 `bugfix/agent-c` 에 커밋하고 status 에 READY 만 남겨라. 병합·충돌 해결은 전부 통합자가 한다.
- [밸런싱 협업] BUG-006 점프 높이(`BRBattleLogic.mlua:68 BattleWalkJump`)와 BUG-007 레벨업 배수(`BRSupplySystem`)는 **수치**라 통합자가 playtest 로 최종값을 확정한다. 너는 로직/구조를 고치고, 목표 수치는 여기 피드백으로 받아 반영해라. 베이스라인: 현재 `jump=1.95 gravity=1.8`, 훈련더미 `hp=500`, NPC 상호작용 `key=V range=1.8` (BUG-012) 확인됨.
- [신규 배정] **BUG-014**: 훈련장 진입 시 기본 6레벨 부여. 런타임 로그상 훈련장은 `BRLobbyTrainingController`(map=StartMap)가 `PrepareLobbyPlayer`/`RegisterLobbyPlayer` 로 셋업, 레벨업 로직은 `BRSupplySystem.LevelUpMonstersForMap`. maxLevel=6 확인됨. 진입 시 레벨 6 세팅 지점을 잡아라(값 6은 확정). 지형 아닌 게임플레이라 in-scope.
- [규약 참고] 스킬 트리거 액션 설계 근거가 궁금하면 통합자가 보관 중인 기획서 요지 참조 요청(가상 시전자/체인 start·end 규칙). 네 도메인(전투 흐름)에서 트리거 스킬은 플레이어 행동제한 미적용이 정상.
