# 계획: 시퀀스 유틸기 (1차 섀도우 대시 + 2차 인투 다크니스)

**상태:** 승인됨(사용자 4개 질문 답변) → 구현
**유형:** 도적 스킬 체인 유틸기. 하나의 스킬, 차수(consecutive placement)로 1차/2차 구분.

## 0. 확정 스펙 (사용자 답변)
- **구조 = 하나의 스킬, 차수 방식** (기존 브랜디쉬처럼). 체인에 1번=1차(섀도우 대시), 2연속=2차(인투 다크니스). tier2 정의는 `<baseKey>2` (GetTieredSkillKey). 데이터레스 tier면 base로 fallback.
- **1차 섀도우 대시**: 그림자 이펙트 `bc8884dc5797493794bfbfa2ffe28965`(animationclip)가 **시전자 정면(LookDirectionX)으로 ~5유닛** 날아감 → **1초 뒤 시전자가 같은 경로·같은 속도로 대시**(그림자를 따라감). **데미지 없음(순수 이동)**. 사운드 `934e8d9af9ec4b10a9cc04a87455ef02`.
- **2차 인투 다크니스**: 정면 ~6유닛 내 **가장 가까운 적 뒤로 순간이동**(적 기준 시전자 반대편 ~0.7유닛). **적 없으면 무동작**. **데미지 없음**. 리소스팩 "인투 다크니스".
- 둘 다 데미지 없음.

## 0-A 기본값 (미지정 → 판단, 사용자 조정 가능)
- **base 스킬 이름(1차) = "섀도우 대시"** (id=키). tier2 `섀도우 대시2`의 표시명 = "인투 다크니스", 아이콘 = 인투다크니스 아이콘.
- **1차 아이콘** = `thumbnail://bc8884dc5797493794bfbfa2ffe28965` (그림자 이펙트 썸네일; 변경 가능).
- **그림자 비행/대시 속도**: 그림자 5유닛을 ~0.35초에 비행(≈14u/s). 시전자는 **cast+1.0초**에 같은 경로 5유닛을 ~0.35초에 대시(같은 속도). 프로퍼티로 노출(shadowDistance, shadowFlightTime, followDelay)해 튜닝 가능.
- **2차 리소스 사용**: 순간이동 시 시전자/목적지에 effect 애니 `173e5f5f81994d73b16b0e21dff1f52a` + ball 애니 `30f61ec72f5d48f2ab93cff43d70559e` 재생, 사운드 `b625fb6b256140c493c7a163d0c3a44c`. (세부 연출은 튜닝 가능.)

## 0-B 인투 다크니스 리소스팩
- audio/Use: b625fb6b256140c493c7a163d0c3a44c (effect=sound)
- ball(animationclip): 30f61ec72f5d48f2ab93cff43d70559e / ball/11(sprite): e51bc697db264acc876c2876da352d9a
- effect(animationclip): 173e5f5f81994d73b16b0e21dff1f52a / effect/10·11·12(sprite): c3329c4c…, c0086b75…, 21a6d4d7…
- icon: 88378dd2706542cca0a07b4c50f64fdf / iconDisabled: 0030115bbc754604b8135cb8a9ee880e / iconMouseOver: b227abb718e046fb951f21540f61b046

## 1. 기존 시스템 (확인)
- 데이터 기반 CSV(`RootDesk/MyDesk/Data/*.csv`) + 엔진 `_Scripts/Skill/BRSkillSystem.mlua`. 스킬 id=한글이름. 차수=연속 배치(BuildResolvedChain). tier키=`<key><n>`, 없으면 base fallback(GetSkillDefinitionForPart).
- **액션 타입**: actions.csv `action_type` ∈ 피해|디버프|후속효과|투사체 생성|장판 생성|트리거|이동|버프|소환|대쉬|텔레포트 등. `이동(move)` = 시전자 이동, 데이터 `dash_actions.csv`(range px, move_time_frames, vertical). `텔레포트(teleport)` = `teleport_actions.csv`(destination_coordinate) — **현재 비어있음, 커스텀 필요**. ExecuteAction(BRSkillSystem ~1878)에서 타입별 분기.
- 기존 `move` 예: 리트리트 샷/후퇴(range -260, time 8, vert 120), 기간틱 백스텝/후퇴(range -220,7,80). = 후방 대시.
- 투사체 스폰 패턴: `MesoCoinProjectile.mlua` + `SpawnByModelId` (이미 구현됨) 참고.
- 시전자 정면 = `PlayerControllerComponent.LookDirectionX`(+1/-1). 대상 위치/피격 = ProcessAreaFrame의 GetEntityPosition2. 이펙트 = `_EffectService:PlayEffect(Attached)` (Client). 사운드 = `_SoundService:PlaySound`.
- 플레이어(Body 있음) 이동: 직접 Position 금지. `MovementComponent:MoveToDirection(dir, delta)` 매 프레임, 또는 `move` 대시 액션, 또는 body:SetWorldPosition(순간이동/텔레포트).

## 2. 구현 단계

### A. 스킬 데이터 (CSV)
- `skills.csv`:
  - `섀도우 대시,섀도우 대시,스킬 파츠,thumbnail://bc8884dc5797493794bfbfa2ffe28965,그림자 대시,섀도우 대시/effect,12,0:섀도우 대시/시전,0.5,934e8d9af9ec4b10a9cc04a87455ef02,,,,,` (사운드=그림자 대시음)
  - `섀도우 대시2,인투 다크니스,스킬 파츠,88378dd2706542cca0a07b4c50f64fdf,정면 적 뒤로 순간이동,인투 다크니스/effect,12,0:인투 다크니스/시전,0.5,b625fb6b256140c493c7a163d0c3a44c,0030115bbc754604b8135cb8a9ee880e,b227abb718e046fb951f21540f61b046,,,` (표시명 인투 다크니스, 아이콘/비활성/마우스오버, 사운드)
- `effects.csv`: `섀도우 대시/effect,bc8884dc5797493794bfbfa2ffe28965,false,12` / `인투 다크니스/effect,173e5f5f81994d73b16b0e21dff1f52a,false,12`
- `events.csv`: `섀도우 대시/시전,action,,섀도우 대시/대시` / `인투 다크니스/시전,action,,인투 다크니스/텔레포트`
- `actions.csv`: `섀도우 대시/대시,이동,시전자`(또는 커스텀 타입) / `인투 다크니스/텔레포트,텔레포트,시전자`
- (데미지 액션 없음 — 둘 다 데미지 없음.)
- ⚠ 그림자 대시(투사체+지연 추적)와 인투 다크니스(적 뒤 탐색 텔레포트)는 **generic move/teleport 액션으로 표현 불가** → BRSkillSystem에 커스텀 핸들러 필요(아래 C). CSV 액션은 커스텀 훅의 진입점으로만 사용하거나, frame_event로 직접 커스텀 메서드 호출.

### B. 그림자 투사체 (신규 .mlua + .model) — MesoCoinProjectile 패턴 참고
`RootDesk/MyDesk/_Scripts/Skill/ShadowDashProjectile.mlua` (@Component):
- Fire(caster, dirX, dirY, distance, flightTime): 정면 방향으로 flightTime 동안 distance만큼 이동(OnUpdate Translate/WorldPosition). 그림자 렌더 = SpriteRenderer SpriteRUID = bc88…(animationclip 자동재생). 도착 후 잠깐 유지 or 소멸.
- 데미지 없음.
`RootDesk/MyDesk/Models/Skill/ShadowDash.model`: Transform + SpriteRenderer(bc88…, MapLayer0) + script.ShadowDashProjectile. Body 없음.

### C. BRSkillSystem 커스텀 훅
1. **1차 섀도우 대시** (frame 0 이벤트가 `섀도우 대시/대시` 커스텀 처리):
   - 시전자 정면(LookDirectionX) dir 계산, distance=5, flightTime≈0.35.
   - `SpawnShadow(caster, dir, distance, flightTime)`: 그림자 투사체 스폰+Fire. 시전 사운드는 skills.csv sound_ruid가 자동 재생(확인).
   - `followDelay=1.0` 후 시전자 대시: `_TimerService:SetTimer(1.0, ...)` → `DashCaster(caster, dir, distance, flightTime)`. 대시는 flightTime 동안 MovementComponent:MoveToDirection로 distance 이동(같은 속도) 또는 body:SetWorldPosition 보간. (플레이어 Body 이동 규칙 준수.)
2. **2차 인투 다크니스** (frame 0 이벤트가 `인투 다크니스/텔레포트` 커스텀 처리):
   - `FindFacedEnemy(caster, range=6)`: 정면(LookDirectionX) ±약간 범위, range 내 가장 가까운 적(dummy/bot/player-enemy) 탐색. CollectTargetsForContext 재사용.
   - 적 있으면: 적 뒤 = enemyPos + normalize(enemyPos - casterPos) * 0.7 (시전자 반대편). `body:SetWorldPosition(behindPos)` 순간이동. effect 애니 173e + ball 애니 30f6 + 사운드 b625 재생(캐스터/목적지, Client). 시전자 facing을 적 쪽으로.
   - 적 없으면 무동작(로그).
3. 데미지 경로 없음.

### D. 검증 (사용자 선호: MCP 플레이 검증 생략)
- 각 .mlua는 LSP mlua-diagnose 자동(에러 0까지). CSV/codeblock 통합은 `refresh` + `logs(build)` **컴파일 에러만** 1회 확인. **play/screenshot 동작 재현은 생략**(사용자가 인게임 직접 확인). [[skip-maker-mcp-verification]]

## 3. 승인 기준
- [ ] 카탈로그에 "섀도우 대시"(1차) 등록, 2연속 시 "인투 다크니스"(2차) 표시.
- [ ] ShadowDashProjectile/ShadowDash.model diagnose·build 에러 0.
- [ ] 1차: 그림자 정면 5유닛 비행 + 1초 뒤 시전자 같은 경로 대시(코드/로그로 확인 가능하게 log()).
- [ ] 2차: 정면 6유닛 내 적 뒤 순간이동 + 이펙트/사운드, 적 없으면 무동작.
- [ ] 둘 다 데미지 없음. build 에러 0.

## 4. 리스크
| 리스크 | 대응 |
|---|---|
| 플레이어 대시 이동(Body) 부드러움/동기화 | MovementComponent:MoveToDirection 매프레임 or body:SetWorldPosition 보간. 직접 Position 금지. |
| 텔레포트 데이터레스(teleport_actions 비어있음) | 커스텀 메서드로 직접 처리(CSV teleport 액션은 진입점만). |
| "적 뒤" 방향 정의 | 시전자→적 벡터 연장선(적 반대편). play 후 미세조정은 사용자. |
| generic move/teleport로 표현 불가 | frame_event → 커스텀 BRSkillSystem 메서드 호출로 처리. |
| tier2 키 `섀도우 대시2` 표시명/아이콘 | skills.csv name=인투 다크니스, icon=88378dd2. |
