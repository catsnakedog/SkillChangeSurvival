# 병렬 버그수정 시스템 (3 워커 + 1 통합자)

> 이 폴더는 **git에 커밋하지 않는다** (조정용 로컬 보드). `git add .coordination` 금지.

## 토폴로지

| 역할 | 위치 | 브랜치 | MCP | 담당 |
|---|---|---|---|---|
| **통합자(Integrator)** | `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival` (이 메인 세션) | `main` | ✅ msw-maker-mcp | 버그 분배, 브랜치 병합 + **모든 병합 충돌 해결**, refresh/play/logs **런타임 검증**, **밸런싱(수치 튜닝) 전담**, 크로스도메인 중재 |

### 통합자 확장 책무 (사용자 지시)
1. **충돌 해결 전담**: 워커→main 병합에서 발생하는 모든 conflict 는 통합자가 해결한다. 워커는 conflict 를 만질 필요 없다.
2. **워커는 `git merge main` 을 스스로 하지 않는다** (이전 프롬프트의 "주기적 merge main" 지시는 **철회**). 모든 크로스브랜치 통합은 통합자가 branch→main 방향으로 수행. 워커는 자기 브랜치에 커밋 + READY 만.
3. **밸런싱(수치 튜닝) 전담**: 데미지 계수/지속/쿨/점프/레벨업 배수 등 "값" 조정은 통합자가 live playtest 로 확정한다.
   - 워커가 **현재 편집 중인 파일**의 값 → 통합자가 status 파일에 목표값을 요청 → 워커가 자기 커밋에 반영 (동시 편집 회피).
   - 워커가 손대지 않는 파일이거나 해당 버그가 VERIFIED 되어 워커가 떠난 값 → 통합자가 main 에서 직접 편집.
| **Agent A (Skill/Data)** | `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival-agentA` | `bugfix/agent-a` | ❌ | 스킬 시스템 코드 + 데이터 CSV |
| **Agent B (UI)** | `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival-agentB` | `bugfix/agent-b` | ❌ | UI 스크립트 + `.ui` |
| **Agent C (Battle/AI)** | `C:/Users/andrew/Documents/GitHub/SkillChangeSurvival-agentC` | `bugfix/agent-c` | ❌ | 전투/매칭/AI/모델 |

**시스템 범위 = 전투 + UI 버그만.** 맵(`map/**`, `_Scripts/Map/**`) 은 이 시스템 관할이 아니다 — 맵 버그가 접수되면 수정하지 않고 `BUGS.md` 에 `OUT_OF_SCOPE` 로 기록만 한다.

MSW Maker는 **메인 체크아웃만** 바라본다. 따라서 refresh·play·로그 검증은 통합자만 가능하다.
워커는 정적 구현 + 자가 리뷰까지만 하고, 런타임 동작을 "확인했다"고 주장하지 않는다.

## 파일 소유권 (충돌 방지의 핵심 — 겹침 없음)

| 경로 | 소유자 |
|---|---|
| `RootDesk/MyDesk/_Scripts/Skill/**` | **A** |
| `RootDesk/MyDesk/Data/**` (모든 CSV, README) | **A** (독점 — CSV는 병합 충돌 최다 발생 지점) |
| `RootDesk/MyDesk/_Scripts/UI/**` | **B** |
| `ui/**` | **B** |
| `RootDesk/MyDesk/_Scripts/Battle/**`, `Match/**`, `AI/**` | **C** |
| `RootDesk/MyDesk/Models/**` (전투 관련 모델만) | **C** |
| `_Scripts/Map/BRCharacterSwitchNPC.mlua`, `BRTrainingDummy.mlua`, `BRLobbyTrainingController.mlua` (게임플레이 로직 — 등록된 in-scope 버그에 한해) | **C** |
| `RootDesk/MyDesk/_Scripts/Map/**`(위 예외 제외), `map/**` (지형/타일/포탈/룸) | **관할 외 — 아무도 수정 금지 (OUT_OF_SCOPE)** |

> "맵"의 정의 = **지형/타일/포탈/룸 배치**. `_Scripts/Map/` 폴더에 있어도 NPC 상호작용·훈련장 레벨업 같은 **게임플레이 로직**은 in-scope이며 `BUGS.md`에 명시된 파일만 담당자가 만진다.
| `Global/`, `Environment/`, `*.codeblock`, `.mcp.json`, `.codex/` | **아무도 수정 금지** |
| 그 외 전체 | 읽기 전용. 수정 필요 시 상태 파일에 REQUEST 작성 → 통합자 중재 |

핫스팟 규칙: `BRSkillSystem.mlua`는 B/C도 자주 **읽지만** 수정은 오직 A. B/C가 스킬 시스템 수정이 필요한 버그를 만나면 REQUEST로 넘긴다.

## 작업 흐름

1. **분배**: 통합자가 `BUGS.md`에 버그를 등록하고 도메인 기준으로 담당을 지정 (`OPEN`).
2. **수정**: 워커는 자기 담당 `OPEN` 버그를 골라 자기 상태 파일에 `IN_PROGRESS` 기록 → 소유 경로 안에서만 수정 → `log()` 체크포인트 추가 → 명시적 경로로 `git add` → 커밋 (`fix(skill|ui|battle): ...`).
3. **제출**: 상태 파일에 `READY_FOR_VERIFY` + 커밋 해시 + "통합자가 런타임에서 확인할 체크리스트" 기록.
4. **검증**: 통합자가 `git merge bugfix/agent-x` → maker refresh → logs(build) 0에러 → play → logs(normal)에서 체크리스트 확인 → `BUGS.md`를 `VERIFIED` 또는 `FAILED`(+피드백을 워커 상태 파일에 기록)로 갱신.
5. **동기화**: 검증 통과분이 main에 쌓이면 워커는 주기적으로 자기 워크트리에서 `git merge main` (소유권이 겹치지 않으므로 충돌 없음).

## 단일 작성자 원칙 (파일 경합 방지)

- `BUGS.md` — **통합자만** 쓴다.
- `status/agent-a.md` — **A만** 쓴다. (b, c 동일)
- 워커 간 직접 통신 없음. 모든 조정은 통합자 경유.
