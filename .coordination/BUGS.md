# 버그 보드 (작성자: 통합자 전용)

상태: `OPEN` → `IN_PROGRESS` → `READY_FOR_VERIFY` → `VERIFYING` → `VERIFIED` / `FAILED` / `OUT_OF_SCOPE`

**시스템 범위: 전투 + UI 버그만.** "맵"은 지형/타일/포탈/룸 배치를 뜻한다(`map/**`, 포탈·룸그래프·그리드에디터 등). `_Scripts/Map/` 폴더에 있어도 **게임플레이 로직**(NPC 상호작용, 훈련장 레벨업)은 사용자가 명시 지목했으므로 in-scope로 처리하고, 필요한 파일만 담당자에게 개별 배정한다. 순수 지형 버그는 담당 배정 없이 `OUT_OF_SCOPE`.

| ID | 증상 | 도메인 | 담당 | 상태 | 커밋 | 비고/포인터 |
|---|---|---|---|---|---|---|
| BUG-001 | 점멸(섀도우 대시) 위로 점멸 시 플랫폼에 안 올라감 | Skill | A | OPEN | — | `ShadowDashProjectile.mlua`, `BRSkillSystem` 점멸 처리. 착지=foothold 스냅 필요할 수 있음 → 맵 지형 수정이 필요하면 REQUEST/보류 |
| BUG-002 | 칼 휘두르는 모션을 스킬 발동 타이밍에 맞추기 | Skill | A | OPEN | — | `skills.csv` frame_event 타이밍 + `BRSkillSystem` 모션 트리거. 필요 시 msw-avatar 로드 |
| BUG-003 | 럭키 세븐 / 수리검 투사체 안 사라짐 | Skill | A | OPEN | — | `ThrowStarProjectile.mlua` 소멸 처리, 럭키 세븐 스킬 정의 |
| BUG-004 | 피어싱 애로우 투사체가 경사면 따라 내려감 | Skill | A | OPEN | — | 투사체 궤적/중력 무시 처리, `projectile_spawn_actions.csv`·`BRSkillSystem` StartProjectile |
| BUG-005 | 피어싱 애로우가 뚝뚝 끊겨서 나감 | Skill | A | OPEN | — | 투사체 이동 보간/프레임 스텝 (SkillFrameSeconds 0.03), 끊김 원인 |
| BUG-006 | 점프 높이 1 올리기 | Battle | C | OPEN | — | `BRBattleLogic.mlua:68` `BattleWalkJump = 1.95` → 2.95 (단위 확인: JumpForce/WalkJump 둘 다 이 값 사용) |
| BUG-007 | 훈련장 레벨업 안 됨 | Battle | C | OPEN | — | `BRSupplySystem.mlua:674 LevelUpMonstersForMap`. 훈련장 트리거가 `_Scripts/Map/BRTrainingDummy`/`BRLobbyTrainingController`일 수 있음(게임플레이 로직=in-scope). 순수 지형이면 OOS 반납 |
| BUG-008 | 서포트 몽키 밸런싱: 지속/쿨 3초로 | Skill | A | OPEN | — | `PirateMonkeySummon` 계열, `Data/*.csv` 소환 밸런스 값 |
| BUG-009 | 몽키 퓨리어스가 2번 나가는 문제 | Skill | A | OPEN | — | 소환/투사체 중복 발동. `PirateProjectileTrigger`·`PirateMonkeySummon` 이벤트 이중 트리거 점검 |
| BUG-010 | 점멸 조작감: 이동했을 때 이펙트 바로 나가게 | Skill | A | OPEN | — | 점멸 이펙트 재생 타이밍(이동 시점에 즉시). `BRSkillSystem` PlaySkillVisual 타이밍 |
| BUG-011 | 스킬 아이콘 UI가 없음 | UI | B | ✅VERIFIED | 4eb0adb | B: `script.BRSkillChainUI` 를 Controller 에 부착. **런타임 확인**: play 로그에 `[BRSkillChainUI] authored battle hud`·`handlers connected count=49`·`ready chainRoot=...`·`bag render` 출력(베이스라인엔 없던 로그). 아이콘 렌더 동작 |
| BUG-015 | 전 직업 기본스킬이 근두운으로 잡힘 (basic_skill_id FK 깨짐) | Data | A | ✅VERIFIED | 49cfe6a | A: `basic_skill_id` 실제 id로 교정. **런타임 확인**: `GetDefaultBasicSkillIdForUser` → `기본공격_슬래시블러스트`(근두운 아님), starterChain=paladin_chain. execute_script 검증 |
| BUG-016 | 표창(럭키 세븐) 파츠박스에 0 피해 | Skill | A | 병합·정적검증 | dd44cef | A: `ApplyThrowStarDamage` 에 partBox 분기 추가. **빌드·데이터로드 그린**. 인배틀 피해 확인(VerboseLog+표창 발사)은 전투 playtest 시 최종 확인 |
| BUG-017 | 둔화 건 유저 리셋/이탈 시 몬스터 속도 영구감소 | Skill | A | 병합·정적검증 | dd44cef | A: `RemoveStatusesForUser` 에 `RestoreTargetSlow` 추가(만료경로와 일치). **빌드 그린**. 속도 원복은 전투 playtest 시 최종 확인 |
| BUG-012 | NPC 말걸기 / 상호작용 키 고장 | Battle | C | OPEN | — | `_Scripts/Map/BRCharacterSwitchNPC.mlua` (`InteractionKeyName="V"`, `KeyDownEvent`). UI 단축 표시가 얽히면 `BRBattleHudNpcShortcutUI`(B)에 REQUEST |
| BUG-013 | 전사 기본공격: 이펙트 없는 전(前)딜레이 줄이기 | Skill | A | 병합·정적검증 | 19c2d91 | A: `GetSkillPreDelaySeconds` 가 area스킬에 일괄 0.5s → 근접평타(타격=area)가 이펙트없이 0.5s 대기. `기본 공격` 카테고리만 별도 선딜 `BasicAttackPreDelaySeconds`(**통합자 0.12s 확정**), 파츠는 0.5s 유지. **빌드 그린**. 즉발감은 전투 playtest 최종확인 |
| BUG-014 | 훈련장 진입 시 기본 6레벨로 시작 | Battle | C | OPEN | — | 훈련장 진입 시 레벨 6 부여(`BRLobbyTrainingController`/`BRSupplySystem`, maxLevel=6). BUG-007(레벨업)과 연관. 값(6)은 통합자 확정 |

## 그린 베이스라인 (2026-07-05, main@85d26b5)
- build: 에러 0 (기존 Info/Warning 만: 매치메이커/포탈/battlechainmonster 모델 속성).
- runtime: `[BRSkill] data loaded skills=41 parts=11 events=52 actions=64 hitboxes=32 characterStats=4 maxLevel=6`, `data warning missing` 없음.
- 버그 관련 현재값: 점프 `jump=1.95 gravity=1.8`(BUG-006), 훈련더미 `hp=500`(BUG-007), NPC 상호작용 `key=V range=1.8`(BUG-012), 점멸키 `C`, 평타키 `Ctrl`.
- → 워커 수정 병합 후 이 카운트가 줄거나 warning 이 뜨면 회귀로 간주.

## 밸런싱 (통합자 전담, live playtest 로 수치 확정)
| 대상 | 현재값 | 목표/메모 | 상태 |
|---|---|---|---|
| 서포트 몽키 지속/쿨 (BUG-008) | (조사 필요) | 3초 | 대기 — A의 몽키 로직(009) 정리 후 튜닝 |
| 점프 높이 (BUG-006) | 1.95 | +1 → 2.95 (단위 확인) | C 반영 후 playtest 확정 |
| 피어싱 계수/소멸 (001,004,005) | 120/150/200% | 밸런스는 수정 후 재검토 | 대기 |

## 이슈 인테이크 (구글 시트 연동)
- 시트: `https://docs.google.com/spreadsheets/d/1e3uUjL3BYVHmGZJLO_sXBvtB2_0ySkgoZRmwIIOznN8/`
- CSV 읽기 URL: `.../export?format=csv&gid=0` (헤더: `이슈`, `완료`). 공개 읽기 가능, **쓰기는 불가**.
- **읽기 주기: 사용자가 "시트 봐줘"라고 요청할 때만.** 그때 시트를 읽어 새 행을 아래 표에 `BUG-0NN`으로 등록(행 텍스트를 키로 중복 방지) + 도메인/담당 배정.
- **완료 표시: 통합자가 시트에 못 씀.** 권위 있는 완료 상태는 이 `BUGS.md`의 `VERIFIED` 이고, 통합자는 검증될 때마다 사용자가 시트 `완료`칸에 그대로 옮길 수 있는 "완료 목록"을 채팅으로 제공한다. 시트 체크는 사용자가 수행.
- 시트 원문 ↔ BUG-ID 매핑은 각 행 비고에 원문 일부를 남겨 추적.

## 도메인 판정 규칙
- 스킬 로직/투사체/소환/CSV → **A**
- HUD·팝업·`.ui`·아이콘 렌더 → **B**
- 전투 흐름(점프/데미지/레벨업)·매칭·AI·게임플레이 NPC → **C**
- 맵 지형/타일/포탈/룸/`.map` → **OUT_OF_SCOPE**
- 두 도메인에 걸치면 REQUEST로 넘기거나 ID를 분할 등록.
