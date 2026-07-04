# 완내스 CSV 테이블/컬럼 정의서

- 인코딩: UTF-8 with BOM
- 기준 문서: `완내스 기획.pdf`
- 원칙: 기획서에 적힌 데이터 항목 중심으로 작성했습니다.
- 정규화 수준: 복수 가능 항목은 별도 매핑 테이블로 나누지 않고 한 칸에 `id1|id2|id3` 형식으로 입력합니다.
- K열 `x` 반영: 기존 정의서에서 `x` 표시된 컬럼은 새 정의서에서 제외했습니다.
- 컬럼 정의서: `00_column_definitions.csv`
- 테이블 목록: `00_tables_manifest.csv`

현재 CSV는 직업별 기본 체인과 공통 액션 런타임이 읽을 수 있는 스킬/이벤트/액션/히트박스 데이터를 포함합니다.

---

## 개발 메모 — 비직관적 시스템 (다른 작업자/에이전트 필독)

`BRSkillSystem.mlua` 가 CSV를 해석하는 방식 중, 데이터만 봐서는 알기 어려운 규칙들입니다. 수정 전 반드시 확인하세요.

### 1. 스킬 차수(진화) = `기본id` + 차수숫자 (`GetTieredSkillKey`)
- **스킬 파츠**(`skills.csv`의 `skill_category = 스킬 파츠`)를 스킬 체인 슬롯에 **연속으로 N개** 장착하면 차수가 오릅니다.
- 차수 N일 때 실제 캐스팅되는 스킬 정의 id = `{기본id}` (1차) 또는 `{기본id}{N}` (2차 이상). 예: `브랜디쉬`(1차) → `브랜디쉬2`(2차) → `브랜디쉬3` → `브랜디쉬4`. 없으면 기본 정의로 폴백.
- **상위 차수 row(`브랜디쉬2~4`)는 `skill_category = 기본 스킬` 로 둡니다.** `스킬 파츠`로 두면 롤 가능한 별도 파츠로 잡혀 파츠 풀이 오염됩니다. (`CreateCatalog` 는 `스킬 파츠` 만 파츠로 등록, `CreateSkillRuntimeCatalog` 는 카테고리 무관하게 전부 실행 정의로 등록.)
- 예시 세트: `브랜디쉬`(1차 파츠) → `레이징 블로우`(2·3차 = `브랜디쉬2/3`) → `레이징 블로우 VI`(4차 = `브랜디쉬4`).

### 2. 히트박스 픽셀 지오메트리 (`rect_hitboxes.csv`) — offset_x=0 은 "중앙"이 아니라 "정면 시작"
- 값은 픽셀 단위(런타임에서 `/100` → 월드유닛). 판정식(`IsTargetInsideHitbox`): `centerX = origin + (-direction) * (offset_x - width/2)`.
- 따라서 **`offset_x = 0` 이면 박스의 근접 모서리가 시전자 pivot 이고 정면으로 `width` 만큼 뻗습니다** (좌우 반전은 바라보는 방향으로 자동 처리). pivot **중앙 정렬**을 원하면 `offset_x = width/2`.
- 예: 브랜디쉬 계열은 `offset_x=0, width=170` → pivot에서 정면 1.7월드유닛. (히트박스 좌우 길이를 pivot→이펙트 끝에 맞추는 요청은 width만 조정.)

### 3. 이펙트 시각 스케일 (`effects.csv` `scale` 컬럼, 추가됨)
- 이펙트별 시각 크기 배율. **미입력/빈 셀 = 1.0**(`ReadNumber` 폴백). 브랜디쉬 계열만 `0.5`.
- 적용: `BRSkillSystem.PlaySkillVisualForEvent` 에서 `GetContextVisualScale`(→`GetSkillEffectScale`)로 읽어 최종 스케일에 곱산. 전역 배율은 별도로 `BRSkillSystem.SkillEffectScale`(기본 1.0, 모든 스킬 공통).

### 4. 상태이상의 실제 효과 (기절·침묵·공격버프) — 데이터만으로는 무효, 코드가 enforce
- 상태는 `statusByEntityId[엔티티][statusId]`에 `ExpiresAt`(=`DurationFrames × 0.03s`)와 함께 저장됩니다. **status_id 문자열이 실제 효과를 결정**합니다.
- **기절 `stun` / 침묵 `silence`**: `BRSkillSystem.IsCasterControlBlocked`가 시전 진입부(`TryCastNextChainSkill`/`TryCastUniqueSkill`)에서 검사 → 해당 상태가 활성인 동안 **새 스킬 시전 차단**. (기절은 추가로 `cancel_chain=true`로 적용 즉시 진행 중 체인 1회 취소.) 새 CC status_id를 시전 차단으로 만들려면 이 헬퍼의 화이트리스트에 추가.
- **"후속" 침묵 표현**: 상태는 즉시 적용되고 개별 지연(delay) 필드가 없음. "2초 기절 + 1초 후속 침묵"은 **침묵 지속을 3초(=기절 2초 구간 겹침 + 이후 1초)**로 넣어 구현. 즉 기절 끝난 뒤 1초간 침묵만 남아 총 3초 시전 차단.
- **공격력 버프 `attack_power_rate`**: `buff_actions.csv`의 신설 컬럼(미입력=1.0). 버프는 `시전자`(context.SourceEntity)에게 적용되고, `ApplySkillDamage`가 공격자의 활성 버프들의 `AttackPowerRate` 곱을 데미지에 곱산(`GetAttackBuffRate`). 1.7 = 공격력 +70%.
- **자버프 발동**: `events.csv`에서 `event_type=action` 이벤트(대상 없이 `시전자` 액션 실행)로 시전자에게 버프. 예: 디바인스윙4는 `frame_event_ids`에 `6:디바인스윙4/버프`(action) 추가 → 타격(frame5) **이후** 자버프.
- ⚠️ **행동변경 주의**: 위 시전 차단은 기존 stun 스킬(페이지 오더/사슬지옥 등)에도 소급 적용되어, 기존엔 "체인 1회 취소"만 하던 기절이 이제 지속시간 동안 시전을 막습니다.

### 5. 메인 이펙트는 캐스트 frame 0에 재생, 타격(데미지)은 임팩트 프레임에 분리
- 과거: 메인 이펙트와 area 데미지가 **같은 `frame_event` 프레임에 동시 시작**(강결합) → 이펙트가 잘리거나 타격 타이밍을 이펙트 임팩트에 맞출 수 없었음.
- 현재: `ProcessSkillFrame`의 frame 0에서 **메인 이펙트(effect_ids)를 시전자 위치에 자동 1회 재생**(`cast.MainEffectPlayed`). area 이벤트(`StartAreaCapture`)는 `SuppressMainEffect`로 **메인 이펙트를 중복재생하지 않고**, 데미지 + 타겟별 hit 이펙트(hit_effect_ruid)만 실행.
- 따라서 **`frame_event_ids`의 area(타격) 프레임 = 이펙트에서 슬래시가 꽂히는 임팩트 프레임**으로 두면 됨. 이펙트는 frame 0부터 끝까지 재생.
- 임팩트 프레임은 애니메이션클립의 프레임별 width 급증 지점으로 산정(msw-search `get`). 예) 디바인 스윙 1차=f4, 2·3차=f3, 4차=f3.
- 적용 예: `디바인스윙4` → `frame_event_ids = 3:디바인스윙4/타격;5:디바인스윙4/버프` (이펙트 frame0~, 타격 f3, 자버프 f5), `total_length_frames`=클립 길이(13).
- ⚠️ **전 스킬 공통 적용**: 모든 area 스킬이 이제 이펙트를 frame0에 재생합니다(브랜디쉬 계열 등 포함). virtual(트리거 후속) 캐스트는 제외.
