# Plan: 체인 스킬 전체 이동/점프 잠금 + 버스트 스텝(Blink) 취소

**Status: pending approval**

## Requirements Summary
1. 체인 시전 시작부터 **모든 체인 스킬(진행 중 + 예약)** 이 끝날 때까지 캐스터의 **좌우 이동 + 점프를 완전히 잠근다.**
2. 체인 도중 **C키(버스트 스텝 / Blink)** 를 누르면:
   - 현재 스킬의 **caster 모션/이동잠금이 즉시 해제**되어 **idle 상태로 복귀**(Blink 대시 정상 발동).
   - **예약(대기) 체인 스텝은 전부 취소**되어 발동하지 않는다.
   - 현재 진행 중이던 스킬이 **이미 생성한 데미지 판정(area / hitbox / 표창 투사체)은 남아서 완료**된다.

## Key Facts (코드 근거)
- 체인은 **서버 사이드**: `RequestCastNextChainSkill`(@Server, L1103) → `TryCastNextChainSkill`(L1255) → `runtime.PendingSteps/PendingStepIndex/PendingStepCount` → `StartNextQueuedChainStep`(L1342) → `StartSkillCast` → `self._T.activeCasts` → `TickActiveCasts`(ServerOnly `OnUpdate`) → `FinishSkillCast`(L1816) → 다음 스텝 or "chain sequence end".
- **데미지 판정은 cast와 독립**: `StartAreaCapture` → `self._T.activeAreas`; `TickActiveAreas`가 cast와 무관하게 틱 → **cast 취소해도 이미 시작된 area는 데미지 완료**. 표창(`ThrowStarProjectile`)/코인도 독립 엔티티로 비행/판정 지속.
- `CancelTargetChain(entity, reason)`(L3882): `ClearQueuedChainRuntime`(예약 취소) + 해당 유저 `activeCasts`에 `cast.Cancelled=true`(cast 타임라인 정지=모션 취소). `activeAreas`는 건드리지 않음 → **요구사항의 취소 동작 뼈대가 이미 존재**.
- 이동잠금 현황: `ApplyCasterActionLimit`(L4672)은 `skill_action_restrictions.csv` 기반인데 **파일이 없어 rate=1(잠금 없음)**. 최근 추가한 post-delay freeze는 후딜 구간만 `InputSpeed=0`. **점프는 어디서도 안 막힘.**
- **Nimbus가 이미 `PlayerControllerComponent.Enable=false`로 라이딩 중 좌우+점프를 잠그는 검증된 패턴** 사용(`ApplyNimbusMovement`/`RestoreNimbusMovement`, BRCommonSkillSystem). → 체인 잠금에 동일 패턴 재사용.
- Blink(`TryBlink`, BRCommonSkillSystem L244)는 **클라 사이드, C키**. 대시는 `RigidbodyComponent:SetWorldPosition`(컨트롤러 Enable 무관하게 동작). 현재 체인과 상호작용 없음 → 서버 RPC로 체인 취소 요청 추가 필요.

## Design

### Feature 1 — 체인 전체 이동/점프 잠금 (BRSkillSystem.mlua)
- **잠금 적용**: `TryCastNextChainSkill`에서 `PendingSteps` 커밋 직후(시퀀스 시작) `ApplyCasterChainLock(caster, userId)`:
  - 백업: `PlayerControllerComponent.Enable`, `MovementComponent.InputSpeed` → `self._T.chainLocks[userId]`.
  - `PlayerControllerComponent.Enable = false`(좌우+점프 차단), `MovementComponent.InputSpeed = 0`.
- **매 서버 프레임 재적용**: `TickActiveCasts`(또는 `OnUpdate`)에서 체인 활성(`ActiveCastCount>0` 또는 `HasPendingChainSteps`)인 동안 `Enable=false`+`InputSpeed=0` 재적용(로비 컨트롤러가 매틱 되돌리므로).
- **해제**: 체인 완전 종료 시(`FinishSkillCast`에서 `activeCount<=0` && `!HasPendingChainSteps` = "chain sequence end" 분기) `RestoreCasterChainLock(userId)`(Enable/InputSpeed 원복) + idle 리셋(`ChangeState("IDLE")` + 클라 Stand 리셋). 스텝 사이 순간 `activeCount=0`이나 pending 존재 시 다음 스텝을 즉시 시작하므로 이 분기에서만 해제 → soft-lock 없음.
- **일원화**: 최근 post-delay freeze의 `InputSpeed` 조작(`ApplyCasterPostDelayFreeze`/`RestoreCasterPostDelayFreeze`의 이동 부분)은 chain-lock과 중복 → 제거. **원샷 공격 모션(`PlayCasterAttackOnceClient`)과 후딜 타이밍(프레임 연장)은 유지.**

### Feature 2 — Blink로 체인 취소 (BRCommonSkillSystem + BRSkillSystem)
- **BRCommonSkillSystem.TryBlink** 끝(대시 수행 후): `_BRSkillSystem`가 있으면 `_BRSkillSystem:RequestCancelChainByBlink(userId)` 호출(체인 유무와 무관하게 안전 — 없으면 no-op).
- **BRSkillSystem 신규 @Server `RequestCancelChainByBlink(userId)`**: 플레이어 엔티티 해석 → `CancelChainForBlink(entity, "blink")`.
- **`CancelChainForBlink(entity, reason)`** (기존 `CancelTargetChain` 확장 or 신규):
  - `ClearQueuedChainRuntime(runtime)` → **예약 스텝 취소**.
  - `activeCasts`에 `cast.Cancelled=true` → **cast 타임라인 정지(모션 취소)**. (`activeAreas`/투사체는 유지 → **데미지 완료**)
  - `RestoreCasterChainLock(userId)` + idle 리셋 → **즉시 idle/이동가능**(cast finish 틱을 기다리지 않음).
  - Idempotent: `cast.Cancelled=true`는 다음 틱 `TickActiveCasts`→`FinishSkillCast(cancelled)`로 정리되며, 그 경로의 chain-lock 복원도 이미 해제된 상태를 안전하게 재확인.

## Acceptance Criteria (testable)
1. 체인(예: 브랜디쉬>럭키세븐) 시전 중 좌우 화살표/점프 입력 시 **캐릭터가 움직이지 않는다**(모든 스텝 끝날 때까지).
2. 체인 완전 종료(로그 `chain sequence end`) 시 **좌우 이동+점프가 즉시 복구**된다.
3. 체인 도중 C키 → **캐릭터 즉시 idle+이동가능**, Blink 대시 발동.
4. C키 시점의 **예약(미시작) 체인 스텝은 발동하지 않는다**(로그에 다음 `chain step start` 없음).
5. C키 시점에 **이미 활성화된 데미지 area/표창은 남아서 대상에게 데미지**를 준다(로그 `... damage` / `throw star` 확인).
6. **비-체인 상태 C키** → 기존 Blink 동작 정상, 부작용 없음.

## Risks & Mitigations
- **R1** PlayerController.Enable=false 부작용? → Nimbus가 동일 패턴 사용(검증됨). 백업/복원 정확히 + idle 리셋 포함.
- **R2** 복원 누락 시 영구 잠금(soft-lock). → chain-end 경로와 Blink 취소 양쪽에서 **idempotent 복원**, 해제 조건 단일화(`activeCount<=0 && !HasPendingChainSteps`).
- **R3** Blink RPC 왕복 지연 동안 잠깐 이동 불가. → 허용(순간). 대시는 클라 즉시 실행.
- **R4** post-delay freeze 제거로 스페이싱 회귀? → chain-lock이 전체 이동을 잠그므로 스페이싱 유지; 원샷 공격모션/타이밍만 남김.
- **R5 (해석 가정)** "데미지 판정까지" = **이미 생성된 판정(area/투사체)만 완료**하고, 취소 시점 이후 진행 중 cast의 **미발동 이벤트는 취소**(모션 취소와 일관). 만약 "현재 스킬은 모든 이벤트를 끝까지 발동시켜라"가 의도면 설계 변경 필요.

## Verification Steps
- Maker `refresh` → `play` → 체인 시전 중 좌우/점프 입력 → 안 움직임 확인.
- 체인 종료 후 이동/점프 복구 확인.
- 체인 중 C → idle+대시 + 예약 취소(로그) + 활성 데미지 완료(로그) 확인.
- 비체인 C → 기존 Blink 정상.
- (선호에 따라 런타임 검증은 사용자가 직접, 코드/진단은 에이전트가.)

## Files to modify
- `RootDesk/MyDesk/_Scripts/Skill/BRSkillSystem.mlua`: chain-lock 적용/재적용/복원(`TryCastNextChainSkill` / `TickActiveCasts` or `OnUpdate` / `FinishSkillCast`), `CancelChainForBlink` + `RequestCancelChainByBlink`(@Server), post-delay freeze의 이동 조작 제거(모션/타이밍 유지).
- `RootDesk/MyDesk/_Scripts/Skill/BRCommonSkillSystem.mlua`: `TryBlink` 끝에 `_BRSkillSystem:RequestCancelChainByBlink(userId)` 호출 추가.
