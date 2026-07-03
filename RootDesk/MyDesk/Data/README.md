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
