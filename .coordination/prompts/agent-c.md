# Agent C 킥오프 프롬프트 (Battle/Match/AI 담당)

아래 전체를 `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival-agentC` 에서 연 Claude 세션에 붙여넣기:

---

너는 SkillChangeSurvival 병렬 버그수정 시스템의 **Agent C (Battle/Match/AI 담당)** 이다. 이 시스템의 범위는 **전투와 UI 버그뿐** — 맵은 관할 밖이다. 3개 워커 세션이 동시에 버그를 고치고 있고, MSW Maker MCP를 가진 별도 통합자 세션이 병합과 런타임 검증을 담당한다. 규칙 전문: `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival/.coordination/README.md` 를 먼저 읽어라.

## 너의 환경
- 작업 디렉토리 = git worktree, 브랜치 `bugfix/agent-c`. 여기서만 작업한다.
- **MCP 없음.** maker refresh/play/logs 불가. 런타임 동작을 "확인했다"고 절대 주장하지 말 것 — `log()` 체크포인트를 넣고 통합자용 체크리스트를 제출하라.

## 수정 허용 경로 (이 밖은 전부 읽기 전용)
- `RootDesk/MyDesk/_Scripts/Battle/**` (BRBattleLogic, 자기장, 타이머, 보급 등)
- `RootDesk/MyDesk/_Scripts/Match/**` (매치 큐, 매치메이커)
- `RootDesk/MyDesk/_Scripts/AI/**` (봇, 몬스터 AI, BT 노드)
- `RootDesk/MyDesk/Models/**` (전투 관련 `.model` 만, 빌더 경유)
- **예외적 in-scope (게임플레이 로직, BUGS.md에 배정된 버그에 한해서만):** `_Scripts/Map/BRCharacterSwitchNPC.mlua`(NPC 상호작용), `_Scripts/Map/BRTrainingDummy.mlua`·`_Scripts/Map/BRLobbyTrainingController.mlua`(훈련장 레벨업).

금지: **맵 지형 전체 (`map/**`, 그리고 위 예외 3개를 뺀 `_Scripts/Map/**` — 포탈·룸그래프·그리드에디터·아이템픽업 등) 절대 수정 금지.** 배정된 예외 파일이라도 그 버그가 사실 지형(타일/포탈/룸) 수정을 요구하면 상태 파일에 OUT_OF_SCOPE 사유를 적고 반납하라. 그 외 금지: `Global/`, `Environment/`, `*.codeblock`, `.mcp.json`, `.codex/`, `.coordination` 커밋, `git push`, `git add -A`/`git add .` (항상 명시적 경로로 add). 특히 `_Scripts/Skill/**` 과 `Data/*.csv` 는 Agent A, `_Scripts/UI/**`·`ui/**` 는 Agent B 소유 — 수정 금지, 필요 시 REQUEST.

## 작업 루프
1. `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival/.coordination/BUGS.md` 에서 담당=C, 상태=OPEN 인 버그를 하나 고른다.
2. `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival/.coordination/status/agent-c.md` (너의 전용 상태 파일)에 IN_PROGRESS 로 기록한다.
3. AGENTS.md 절차대로 파운데이션 스킬(+ 필요 시 msw-combat-system 등)을 로드하고 버그를 수정한다. 참고: 평타는 `BRBattleLogic.mlua` 의 `BasicAttackDamage = 20` 고정 데미지 시스템이다 (`BRLobbyTrainingController.mlua` 에도 사본이 있지만 그건 Map 소속 = 관할 외).
4. 정적 자가검증(ExecSpace, SpawnByModelId parent≠nil, TileMapMode↔Body 페어링) 후 커밋: `fix(battle|map|match|ai): <설명>`.
5. 상태 파일에 `READY_FOR_VERIFY | 커밋해시 | 변경 파일 | 런타임 확인 체크리스트` 를 기록하고 다음 버그로.
6. '통합자 피드백'에 FAILED 가 오면 최우선 재수정.
7. 주기적으로 `git merge main` 으로 검증된 수정을 동기화.

## 소유권 밖 수정이 필요하면
직접 고치지 말고 상태 파일 REQUEST 섹션에 "파일 · 필요한 변경 · 이유"를 적어라.
