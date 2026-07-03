# 계획: 메소 익스플로전 (도적 후속타 스킬) + 크루얼 스텝(테스트용)

**상태:** 승인됨 (사용자 "알아서 다 만들어" + 4개 질문 답변 완료) → 자율 구현
**작성 근거:** 사용자 요청 + 스킬 시스템 explore + 데이터 CSV/코드 직접 확인 + RUID 타입 확인

---

## 0. 확정된 요구사항 & 답변

메소 익스플로전 = 도적 스킬 체인의 **후속타(장전형)** 스킬. 체인에서 메소 익스플로전 **뒤에 스킬이 있을 때만** 발동 — 그 뒤 스킬이 적을 맞히면 메소 코인이 그 적을 추적해 때린다. 뒤에 스킬이 없으면 발동 안 함.

**사용자 답변(확정):**
- 메소 익스플로전 = **순수 장전** (자체 데미지/히트박스 없음). 코인만 데미지.
- 코인 데미지 = **공격력 × 50%** (기본 공격력 300 → 코인당 150).
- 코인 퍼짐 = **sin × 2.5유닛** (최대 반경 2.5 world unit).
- 크루얼 스텝(테스트) = **단순 근접 단타, 공격력 100%**.

**차수별 코인 수:** 1차=1, 2차=3, 3차=5, 4차=7 → `coinCount(tier) = 2*tier - 1`.

**코인 모션(코인 1개):**
1. 뒤 스킬이 적 E를 맞힌 위치에서 생성.
2. 랜덤 360° 방향 `θ` 부여 (코인마다 독립).
3. 1초 tween: 매 프레임 `coinPos = E.현재WorldPos + dir(θ) × sin(π·t) × 2.5` (t: 0→1). E가 움직이면 앵커도 따라감(끝까지 추적).
   - t=0: offset 0 (E 위치). t=0.5: 최대 2.5유닛. t=1: offset 0 (E 현재 위치) → 피격.
4. 비행 중: 코인 `SpriteRendererComponent.SpriteRUID = f2f02260507a45c493d831eeca270e95`(animationclip, 월드 스프라이트에서 자동재생).
5. t≥1 피격: E 현재 위치에 `_EffectService:PlayEffect(644458b8c91949b4b4b84ff949eba8ca)`(anim) + `5c365eebdfe047cb812f66c3c0433b81`(sprite) 동시 재생 + 데미지(150) 적용 → 코인 Destroy.

**시전자 이펙트:** 메소 익스플로전 시전 시(장전) 시전 애니메이션 + `61840689ea7b44f09f91960734232e34`(anim) **×2** 를 플레이어 몸에 `PlayEffectAttached`.

---

## 1. 기존 시스템 (확인 완료)

- **데이터 기반**: `RootDesk/MyDesk/Data/*.csv`. 스킬 정의 = `skills.csv`(한글 이름=id/키). 동작 = `events.csv → area_target_captures.csv → actions.csv → damage_actions.csv` 그래프. 엔진 = `_Scripts/Skill/BRSkillSystem.mlua`(5018줄).
- **차수** = 체인 5칸에 같은 스킬 연속 배치 횟수. `BuildResolvedChain`(BRSkillSystem.mlua:1177)이 연속 동일 스킬을 한 그룹으로 접고 tier 계산. tier별 키 `<skill><tier>`(예: `크루얼 스텝2`), 없으면 base로 fallback(`GetSkillDefinitionForPart`:1284).
- **skill_category**: enum `기본 스킬|스킬 파츠`. **파츠(스킬 파츠)** 여야 체인 배치 가능(`IsSkillPartCategory`:628 → `_part` 카탈로그). 현재 skills.csv엔 `기본 스킬`만 있음 → 파츠 카탈로그 비어있음.
- **실행**: Attack 액션 입력 → `RequestCastNextChainSkill`(954) → `BuildResolvedChain`(1177) → `StartSkillCast`(1376) → 타임라인 프레임마다 `ProcessSkillFrame`(1478) → `StartSkillEvent`(1499): `area`→`StartAreaCapture`(1541) → `ProcessAreaFrame`(1602)에서 대상 포착 → `ExecuteActions`(1789)→`ExecuteAction`(1878) 타입별(damage/buff/debuff/trigger/projectile/...).
- **데미지**: `ApplySkillDamage`(2235): `attackPower(300) × coefficient% / 100`, 크리(0.2/2.0). 대상 dispatch: `GetTrainingDummyComponent`→`dummy:ApplyTrainingDamage(attacker, dmg, source)` / bot→`ApplyBotDamage` / player→`player.Hp -= dmg`.
- **피격 위치**: `ProcessAreaFrame`(1602-1619)에서 새 피격 대상의 `GetEntityPosition2(target)` → `triggerX/triggerY`를 `ExecuteActions`에 전달.
- **기존 trigger 메커니즘**(1226-1258, 1421, 1907): trigger 액션 있는 스킬=start, 다음 그룹=end(consumed). start의 trigger 발동 시 `StartVirtualEndSkill`이 end 스킬을 hit 위치에 재시전. 다음 스킬 없으면 `reason=noEndSkill` 무동작. **단 trigger_actions.csv 비어있음.** ⚠ 방향이 "메소가 다음 스킬을 실행" — 우리 의도(다음 스킬이 맞으면 메소가 따라감)와 반대.
- **허수아비**: `BRTrainingDummy`(StartMap, MaxHp 500). `ApplyTrainingDamage(attacker, dmg, source)`. `GetTrainingDummyComponent`(2615)=`entity:GetComponent("script.BRTrainingDummy")`.
- **입력**: StartMap 훈련장은 `BRLobbyTrainingController`(:297 PlayerActionEvent → :318 RequestCastNextChainSkill). 체인 배치 UI=`BRSkillChainUI`(드래그앤드롭).
- **차수 코인/데미지 등 실제 스킬 파츠는 skills.csv에 아직 없음** → 신규 추가.

---

## 2. 설계 (핵심 결정)

기존 trigger 메커니즘(메소가 다음 스킬을 실행)은 사용자 의도와 방향이 반대라 **쓰지 않고**, 체인 해석 시 "메소 뒤 스킬"에 후속타 플래그를 실어보내는 방식으로 직접 구현:

1. **체인 해석 훅**: `BuildResolvedChain`에서 그룹이 `메소 익스플로전`이고 **다음 그룹이 존재**하면 → 다음 그룹(스킬)의 cast step에 `MesoFollowUpCount = coinCount(메소그룹.Tier)` 부여. 메소 자신의 step은 데미지 없이(장전) 캐스팅(시전 이펙트만). 다음 그룹 없으면 플래그 없음 → 코인 안 나감.
2. **메소 시전(장전)**: 메소 step 캐스팅 시 시전 애니메이션 + `PlayEffectAttached(61840689…, caster)` ×2.
3. **피격 시 코인 발사**: 후속타 플래그가 있는 스킬이 `ProcessAreaFrame`에서 적을 새로 맞히면 → 각 대상마다 `SpawnMesoCoins(target, MesoFollowUpCount, attacker)`.
4. **코인 투사체**: 신규 `MesoCoinProjectile.mlua`(@Component) + `MesoCoin.model`. 서버에서 N개 스폰(랜덤 dir). OnUpdate로 sine 추적 → t≥1 데미지+이펙트+Destroy.
5. **코인 데미지**: `_BRSkillSystem:ApplyMesoCoinDamage(target, attacker, 150)` (기존 대상 dispatch 재사용 → 허수아비/봇/플레이어 공통).

**대안 기각:** 기존 trigger→StartVirtualEndSkill 재활용은 "메소가 다음 스킬을 실행/소비"라 (a) 다음 스킬이 두 번 실행되거나 (b) 타이밍이 "메소 hit 시점"이 되어 사용자 의도("다음 스킬이 맞은 뒤")와 어긋남. 직접 훅이 의미상 정확하고 부작용 적음.

---

## 3. 구현 단계

### A. 스킬 데이터 (CSV 행 추가)
- `effects.csv`: `크루얼 스텝/effect, 81220b722d434848bbf1b891dec2bf89, false, 8` / `메소 익스플로전/effect, 61840689ea7b44f09f91960734232e34, false, 12`
- `skills.csv`:
  - `크루얼 스텝, 크루얼 스텝, 스킬 파츠, thumbnail://81220b722d434848bbf1b891dec2bf89, 단순 근접 단타, 크루얼 스텝/effect, 8, 4:크루얼 스텝/타격, 0.5, ,,,,, `
  - `메소 익스플로전, 메소 익스플로전, 스킬 파츠, thumbnail://<icon>, 후속타 메소 장전, 메소 익스플로전/effect, 12, , 0.5, ,,,,, ` (frame_event 없음 = 히트박스 없음, 순수 장전)
- `events.csv`: `크루얼 스텝/타격, area, 크루얼 스텝/범위,`
- `area_target_captures.csv`: `크루얼 스텝/범위, 크루얼 스텝/히트박스, 3, 적군, 크루얼 스텝/피해, 8`
- `rect_hitboxes.csv`: `크루얼 스텝/히트박스, 0,0, 200,150`
- `actions.csv`: `크루얼 스텝/피해, 피해, 대상`
- `damage_actions.csv`: `크루얼 스텝/피해, 100, ` (100% = 300)
- (차수별 강화 원하면 `크루얼 스텝2/3/4` 추가 가능 — 이번엔 base만.)

### B. 코인 투사체 (신규 .mlua + .model)
`RootDesk/MyDesk/Skill/MesoCoinProjectile.mlua` (@Component):
- property: `Entity targetEntity`, `Entity attackerEntity`, `number damage=150`, `number dirX`, `number dirY`, `number maxDist=2.5`, `number duration=1.0`, hit effect RUID 상수.
- `Fire(target, attacker, angleRad, dmg)`: dir 설정, `_T.t=0`, `_T.fired=true`, 앵커=target.
- `OnUpdate(delta)` (ServerOnly): `_T.t += delta/duration`; `anchor=target.WorldPosition`; `pos = anchor + dir × sin(π·min(t,1)) × maxDist`; `TransformComponent.WorldPosition = pos`(Body-less). `t>=1`이면 `OnHit`.
- `OnHit`: `_BRSkillSystem:ApplyMesoCoinDamage(target, attacker, damage)` + `ShowHitEffect`(Client: PlayEffect 644458 anim + 5c365 sprite at target pos) + Destroy. target invalid면 Destroy.
- 코인 렌더: 모델의 SpriteRenderer `SpriteRUID=f2f02260…`(animationclip 자동재생).

`RootDesk/MyDesk/Models/Skill/MesoCoin.model` (ModelBuilder, TransformOnly 기반):
- TransformComponent + SpriteRendererComponent(SpriteRUID=f2f02260…, SortingLayer=MapLayer0, OrderInLayer=6) + `script.MesoCoinProjectile`.
- Body 없음(장식/투사체). StartMap은 MapleTile(TileMapMode 0)이나 코인은 Body-less라 무관.
- ⚠ 스크립트 컴포넌트는 .mlua 작성 → refresh(codeblock 생성) → 모델에 추가 순서.

### C. BRSkillSystem.mlua 수정
1. 상수/헬퍼: `MesoExplosionSkillKey = "메소 익스플로전"`, `MesoCoinModelId = "MesoCoin"`, `MesoCoinDamageCoefficient = 50`, `MesoCoinMaxDist = 2.5`, `coinCountForTier(tier) = 2*tier-1`.
2. **체인 해석 훅**(BuildResolvedChain 그룹 루프): 그룹 skillKey == 메소 && nextGroup 존재 → 다음 step에 `MesoFollowUpCount = coinCount(group.Tier)`, `MesoAttacker = caster`. 메소 step은 그대로(장전).
3. **메소 시전 이펙트**: 메소 step StartSkillCast 시 `PlayCasterMesoEffect(caster)` (Client: PlayEffectAttached 61840689 ×2) + 시전 애니메이션(기존 캐스터 애니 파이프라인 사용/StateComponent).
4. **피격 훅**(ProcessAreaFrame 새 대상 처리): `cast.MesoFollowUpCount and >0`이면 `SpawnMesoCoins(target, count, attacker)`.
5. `SpawnMesoCoins(target, count, attacker)` (ServerOnly): `parent=attacker.CurrentMap`; i=1..count: 랜덤 angle, `SpawnByModelId("MesoCoin", "mesocoin_"..n, target.WorldPos, parent)` → `coin.MesoCoinProjectile:Fire(target, attacker, angle, attackPower*0.5)`.
6. `ApplyMesoCoinDamage(target, attacker, damage)` (ServerOnly): ApplySkillDamage의 대상 dispatch 로직 재사용(dummy/bot/player).

### D. 크루얼 스텝/메소 파츠를 플레이어에 지급 + 체인 배치 (테스트용)
- 도적 클래스(Rogue) `character_default_skills.csv` + `skill_chains.csv`에 테스트 체인 시드, 또는 런타임 `maker_execute_script`로 파츠 지급 + 체인 슬롯 장착(`EquipPartInstanceToChainSlot` 등) 후 테스트. (배치 UI 없이 스크립트로 강제 배치가 빠름.)

---

## 4. 승인 기준 (테스트)
- [ ] skills.csv/effects.csv/events.csv/… 파츠 추가 후 build 에러 0, 카탈로그에 `크루얼 스텝`,`메소 익스플로전` 파츠 등록.
- [ ] `MesoCoinProjectile.mlua` diagnose 0, `MesoCoin.model` refresh 후 codeblock 정상.
- [ ] StartMap 허수아비 앞에서 체인 `[메소 익스플로전, 크루얼 스텝]` 장착 → Attack → 크루얼 스텝 타격 후 **코인 1개** 발사(sine 곡선, f2f0 렌더) → 허수아비 위치서 644458+5c365 이펙트 + 데미지 150.
- [ ] 체인 `[메소 익스플로전]`만(뒤 스킬 없음) → 코인 **안 나감**(로그 no-followup).
- [ ] 차수 테스트: `[메소,메소,크루얼]`=2차=**3개**, `[메소×3,크루얼]`=3차=**5개**, `[메소×4,크루얼]`=4차=**7개**.
- [ ] 메소 시전 시 플레이어 몸에 61840689 ×2 이펙트.
- [ ] 코인이 움직이는 대상(있다면)을 끝까지 추적(앵커=현재 위치).
- [ ] build 에러 0 + 코인 스폰/피격 positive 로그.

## 5. 검증 (Maker MCP)
`stop→clear_logs→refresh→logs(build)→play→(스크립트로 파츠지급+체인장착+허수아비 앞 Attack 시뮬)→logs(runtime)→screenshot→차수 변경 반복→stop`.

## 6. 리스크 & 대응
| 리스크 | 대응 |
|---|---|
| BRSkillSystem(5018줄) 수정 부작용 | 훅은 추가만(기존 분기 유지), 최소 침습. 각 단계 refresh+build 확인. |
| animationclip이 월드 SpriteRenderer/PlayEffect에서 재생 안 될 수도 | f2f0(코인)은 월드 SpriteRenderer, 644458/61840689은 PlayEffect(이펙트 전용 anim) — 이펙트 anim은 PlayEffect가 정식 경로라 UI 케이스와 다름. play에서 확인, 안 되면 프레임 스프라이트 fallback. |
| 코인 좌표(월드 유닛) 스케일 | maxDist 2.5유닛=250px. play 후 조정. |
| 차수 그룹 folding 이해 오류 | [메소,메소]=한 그룹 tier2. BuildResolvedChain 실제 코드 확인 후 훅 삽입. |
| 파츠 지급/체인 장착 API | 스크립트로 강제 장착; 안 되면 BRSkillChainUI 경로 확인. |
| 코인 데미지가 dummy에 안 들어감 | ApplyMesoCoinDamage가 ApplySkillDamage 대상 dispatch 재사용. |

## 7. 확정 사항
- 데이터/코드 위치·포맷 확인 완료(§1, §3). RUID 타입 확인 완료(코인 f2f0=anim, 피격 644458=anim+5c365=sprite, 시전 61840689=anim, 크루얼 81220=anim).
- 값: 코인 데미지 공격력50%(=150), 퍼짐 2.5유닛, 크루얼 100%, 코인수 2·tier−1, 메소 순수장전.
