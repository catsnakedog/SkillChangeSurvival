# Agent A 상태 (작성자: Agent A 전용 / 통합자는 '통합자 피드백' 섹션만 씀)

## 현재 작업
- (없음 — BUG-013 포함 제출 4건 모두 READY. 다음 OPEN 배정 대기.)
- (규약대로 merge main 안 함. 자기 브랜치 커밋 + 아래 READY만 남김.)

## 제출

### A-cand-2 (basic_skill_id FK) | READY_FOR_VERIFY | 커밋: 49cfe6a
- 도메인: Data / 변경 파일: RootDesk/MyDesk/Data/character_default_skills.csv
- 증상: `basic_skill_id`가 스킬 **표시명**(`슬래시 블러스트`)을 담아
  `GetDefaultBasicSkillIdForUser`(BRSkillSystem 1686)→`HasSkillDefinition`(id 조회, 1691)가 항상 실패
  → `FindFirstSkillIdByCategory("기본 스킬")` 폴백 = **근두운(Nimbus)**. 전 직업 기본 스킬이 근두운으로 잡힘 + 클래스선택 아이콘 빈칸.
- 수정: Knight/Archer/Mage/Rogue의 `basic_skill_id`를 실제 id(`기본공격_슬래시블러스트`/`_애로우블로우`/`_에너지볼트`/`_샤프슬래시`)로 교정. Pirate(미완성) 제외.
- ⚠️ `.userdataset`는 래퍼일 뿐 행 데이터는 `.csv` 소유 → CSV만 수정. 기존 id만 사용·행 증감 없음 → `data loaded skills=41 ...` 카운트 불변.
- 런타임 체크리스트: 1) `_BRSkillSystem:GetDefaultBasicSkillIdForUser(<KnightUserId>)` == `기본공격_슬래시블러스트`(근두운 아님). 2) 전사 선택→전투→기본공격이 **슬래시 블러스트** 재생(근두운 라이딩이면 실패). 나머지 3직업 동일. 3) 클래스선택 UI 기본스킬 아이콘 비어있지 않음.

### A-cand-3 (표창 파츠박스 0피해) | READY_FOR_VERIFY | 커밋: dd44cef
- 도메인: Skill / 변경 파일: RootDesk/MyDesk/_Scripts/Skill/BRSkillSystem.mlua (`ApplyThrowStarDamage`)
- 증상: `ApplySkillDamage`(3634)·`ApplyMesoCoinDamage`(3806)엔 있는 파츠박스 분기(`GetPartBoxComponent`→`ApplyPartBoxDamage`)가 표창에만 누락 → 표창(럭키 세븐)이 파츠박스에 **0 피해**.
- 수정: dummy 뒤에 partBox 분기 추가(dummy→partBox→bot→player 순 통일).
- 런타임 체크리스트(⚠️`_BRSkillSystem.VerboseLog=true` 필요): 1) 표창으로 파츠박스(데미지박스) 발사. 2) 로그 `[BRSkill] throw star damage partbox target=<name> amount=<n>`. 3) 파츠박스 HP 감소.

### A-cand-4 (둔화 미복구) | READY_FOR_VERIFY | 커밋: dd44cef
- 도메인: Skill / 변경 파일: RootDesk/MyDesk/_Scripts/Skill/BRSkillSystem.mlua (`RemoveStatusesForUser`)
- 증상: 만료 경로 `TickStatuses`(4455)는 `RestoreTargetSlow` 호출하지만, 리셋/이탈 경로 `RemoveStatusesForUser`는 상태만 nil → 둔화 건 유저가 리셋/종료되면 대상 몬스터 `InputSpeed` 영구 감소 잔존.
- 수정: 제거 시 `MoveSpeedRate<0.999`면 `RestoreTargetSlow(status.TargetEntity)` 호출(만료 경로와 일치).
- 런타임 체크리스트(⚠️`_BRSkillSystem.VerboseLog=true` 필요): 1) 둔화 스킬로 몬스터 느리게. 2) 지속 중 시전 유저 리셋/이탈로 `ClearUserRuntimeState` 유발. 3) 로그 `[BRSkill] status slow restored on removal ...` + 몬스터 속도 원복.

### BUG-013 (전사 기본공격 선딜 축소) | READY_FOR_VERIFY | 커밋: 19c2d91
- 도메인: Skill / 변경 파일: RootDesk/MyDesk/_Scripts/Skill/BRSkillSystem.mlua (`GetSkillPreDelaySeconds` + 신규 property)
- 근본 원인: `GetSkillPreDelaySeconds`가 area 이벤트 스킬에 일괄 **0.5s(≈17프레임)** 선딜 부여.
  근접 기본공격(슬래시 블러스트/샤프 슬래시)의 `타격` 이벤트가 events.csv에서 `area` 타입이라
  평타도 0.5s 동안 이펙트 없이 대기(`ProcessSkillFrame` 2367: 메인 이펙트를 frame==preFrames에서만 재생).
  → "이펙트 없는 전딜레이"로 평타가 굼떠 보임. (Archer/Mage 평타는 action 타입=즉발이라 무영향)
- 수정(구조/훅): `skill_category == "기본 공격"` 인 스킬만 별도 선딜 사용, 나머지 area 스킬(스킬 파츠)은 0.5s 유지(회귀 없음).
  튜닝 훅 `property number BasicAttackPreDelaySeconds`(현재 기본 0.12s) 추가. SkillCategory 미설정 티어 def 는 nil→"" 폴백으로 0.5s 유지.
- ❓ **통합자 확정 요청**: `BasicAttackPreDelaySeconds` 목표값. 임시 0.12s(≈4프레임)로 넣어둠 —
  playtest 후 원하는 수치 알려주면 이 값만 바꿔 재커밋(0 = 완전 즉발/텔레그래프 없음, 0.5 = 원상복구).
- 런타임 체크리스트(⚠️`_BRSkillSystem.VerboseLog=true` 필요): 1) 전사(Knight)로 기본공격 → 슬래시 블러스트 이펙트가
  거의 즉시(≈0.12s) 재생되는지(수정 전 0.5s 지연 대비). 2) 로그 `[BRSkill] basic attack predelay skill=기본공격_슬래시블러스트 seconds=0.12`.
  3) 스킬 파츠(브랜디쉬/디바인스윙 등 area 스킬)의 0.5s 텔레그래프는 그대로인지(회귀 확인).

## 오탐 정정 (감사 중 발견 → 수정 안 함)
- **A-cand-1 (거짓 양성)**: `ApplyLocalSkillMovementPosition`/`StartLocalSkillMovement`가 "모든 클라 텔레포트"라는 초기 감사는 **오류**.
  MSW `@ExecSpace("Client")`는 호출부 마지막 인자로 `targetUserId`를 넘겨 특정 클라만 라우팅하는 규약(선언부엔 안 씀)이며,
  호출부 3350/3374/4008/8431 모두 `move.UserId`(비어있지 않음 가드)를 그 타겟으로 정확히 전달 → 소유 클라만 실행, 정상. **수정 안 함.**

## 추가 발견 후보 (통합자 판단용 — 아직 BUGS.md 미등록, 모두 A 도메인)
- ~~A-cand-5 (skill_chains 공란)~~ → **통합자가 skill_chains.csv 삭제로 해결(2026-07-05). 재생성 안 함.**
- A-cand-6 (LOW): `BRCommonSkillSystem.PlayBlinkVisual`(1693~1694) 버스트스텝 시작/끝 이펙트 폴백 교차(코스메틱, CSV 조회 실패 시).
- A-cand-7 (LOW): `BuildResolvedChain`(1886) `skillDef.SkillKey` 무가드 역참조(스킬 카탈로그 로드 실패 시).
- A-cand-8 (LOW): Pirate 선택 가능하나 `CharacterStat.csv` 행 없음 + `basic_attack_id` 공란 → 기본 스탯 폴백(크래시 없음, 알려진 미완성).
- A-cand-9 (LOW): `00_column_definitions.csv` enum 정의가 실데이터와 불일치(검증기 오탐, 게임 무해).
- A-cand-10 (LOW/잠재): `ThrowStarProjectile.Fire`에 세로 스폰오프셋 `spread`이 `dirY` 방향 인자로 전달(BRSkillSystem 4202). count=1이라 현재 은폐, 볼리>1이면 각도 오발.
- A-cand-11 (LOW): 표창 명중이 원점반경 호밍에만 의존(`ThrowStarProjectile.mlua:74`) → 발사 후 대상이 원점반경 밖 이동 시 코앞이어도 무피해(움직이는 대상 엣지케이스).
- A-cand-12 (MINOR): `BRSkillPartPanel` 0.25s 반복 타이머가 이미 숨긴 폐기 패널 재숨김만 반복(의도된 폐기로 보임).

## REQUEST (소유권 밖 수정 요청)
(없음)

## 통합자 피드백
- ✅ **BUG-015 VERIFIED (2026-07-05)**. execute_script(server_main): `GetDefaultBasicSkillIdForUser` → `기본공격_슬래시블러스트`(근두운 아님), starterChain=`paladin_chain`. 데이터로드 카운트 불변.
- 🟡 **BUG-016 / BUG-017 병합·정적검증 통과**(빌드·데이터로드 그린). 인배틀 동작(표창→파츠박스 피해, 둔화 리셋 후 속도원복)은 전투 playtest 최종확인 예정. 재현용 최소 execute_script(봇 타겟 표창 발사 + VerboseLog)를 제안해 주면 통합자가 바로 돌려 확정한다.
- ✅ **BUG-013 값 확정: `BasicAttackPreDelaySeconds = 0.12` 채택**(네 임시값 유지). 사용자 요청 "전사 평타 이펙트 없는 전딜 줄이기"에 부합. 병합·검증 진행함. 더 즉발로 원하면(0.05~0.08) 사용자 피드백 후 이 값만 재커밋 요청하겠다. 파츠(브랜디쉬/디바인스윙) 0.5s 텔레그래프 유지 확인은 회귀검사에 포함.
- [규약 변경 2026-07-05] **`git merge main` 을 스스로 하지 마라.** 이전 프롬프트의 "주기적 merge main" 지시는 철회한다. 너는 자기 브랜치 `bugfix/agent-a` 에 커밋하고 status 에 READY 만 남겨라. 병합·충돌 해결·밸런싱 수치 확정은 전부 통합자가 한다.
- [밸런싱] 데미지 계수/지속/쿨 같은 **수치 값**은 통합자가 playtest 로 최종 확정한다. 네가 편집 중인 CSV 의 값을 통합자가 바꿔달라고 여기 적으면 네 커밋에 반영해라. 구조/버그 수정(행 추가, 소멸 처리, 이중발동 제거)은 계속 네 담당.
- 베이스라인(현재 main) 그린 확인됨: `data loaded skills=41 parts=11 events=52 actions=64 hitboxes=32 maxLevel=6`, 에러 0. 네 수정이 이 카운트를 깨면 통합자가 잡아낸다.
- [main 변경 2026-07-05] 통합자가 `Data/skill_chains.csv` **삭제** + `00_tables_manifest.csv` 에서 해당 행 제거함(빈 데이터 + 코드가 nil 폴백 처리 확인, 검증 그린). **다시 만들지 마라.** `GetDataTable("skill_chains")` 는 nil→기본시드 폴백으로 정상.
- [신규 배정] **BUG-013**: 전사 기본공격의 "이펙트 없는 전(前)딜레이" 축소. 평타 시전 파이프라인(`BRCommonSkillSystem`) 확인. 지연 수치는 통합자가 playtest 로 확정하니 구조/훅만 잡아 주고 목표값은 여기 피드백으로 받아라.
- [WIP 확인] 네 커밋 2건(dd44cef, 49cfe6a) 봤다. 아직 status 에 READY 안 적혀서 병합 대기 중. 검증 원하면 `## 제출` 에 `BUG-xxx | READY_FOR_VERIFY | 커밋: <hash>` 로 남겨라(주석 템플릿 말고 실제 섹션에).
