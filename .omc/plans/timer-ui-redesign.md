# 계획: RoomTestMap 페이즈 타이머 UI 리디자인 (timer_UI 배경 + 숫자 스프라이트)

**상태:** `pending approval` (실행 승인 대기 — /plan 산출물, 아직 코드 미변경)
**작성 근거:** 사용자 요청 + timer_UI.png 픽셀 분석 + 코드베이스 조사(explore)
**대상 맵:** `RoomTestMap` (`map/RoomTestMap.map`, `TileMapMode = 0` MapleTile — 단, 이 작업은 순수 UI라 맵 물리와 무관)

---

## 0. 요구사항 요약

RoomTestMap에 적용된 타이머를, 배경 스프라이트 **`timer_UI` (신규 리사이즈 버전 `timer_UI (1).png`, 224×92px)** 를 바탕으로 재구성한다. 배경에는 **"PHASE" 라벨 + 값 영역**(상단)과 **시계 아이콘 + "남은시간" + 빈칸 + "초"**(하단)가 이미 새겨져 있다. 두 값을 다음과 같이 표시한다:

> ✅ **배경 RUID 확정:** `timer_UI (1).png`(224×92)의 RUID = **`acfc12a5fb6243feb0b35a8509376530`** (사용자 제공). 배경 스프라이트 `ImageRUID`에 이 RUID 사용. (구 버전 `46b1…`(238×92)은 사용 안 함.)

| 표시 대상 | 데이터 소스 | 렌더 방식 |
|---|---|---|
| **페이즈 번호** | 자기장 시스템의 페이즈 인덱스 (신규 `PhaseNumber` 필드 추가) | **통숫자 스프라이트 단일 슬롯** — `animationclip-1091968`(1~12 통숫자)의 프레임을 페이즈 번호로 매핑 (§0-A) |
| **남은시간 (두 자리 초)** | `BRMagneticZoneSystem.PhaseTimeRemaining` (다음 축소까지 남은 초, ≤30s) | **숫자 스프라이트 2슬롯(십/일)** (아래 제공된 0~9 RUID) |

### 확정된 결정 (사용자 응답 기준)
- **Q1 데이터 소스 = 자기장 페이즈** (`BRMagneticZoneSystem` → `BRMagneticZoneUI`, `ui/MagneticZoneGroup.ui`). 두 자리 초는 `PhaseTimeRemaining`(≤`ShrinkIntervalSeconds`=30)과 정확히 일치.
- **Q2 페이즈 렌더 = 숫자 이미지 (`animationclip-1091968` 사용, 확정).** 이 클립의 프레임은 0~9 낱개가 **아니라 완성된 통숫자 1~12**(idx0=1 … idx11=12). 따라서 페이즈는 **자릿수 분해 없이 단일 슬롯에 통숫자 하나**로 표시 (페이즈 N → 프레임 idx N−1). RUID 매핑은 §0-A.
- **Q3 적용 범위 = 기존 자기장 HUD 완전 제거 후 이 배경으로 교체 (사용자 확정: "없애버려").** `MagneticZoneGroup.ui` + `BRMagneticZoneUI`를 이 배경 디자인으로 재구성하고, 기존 HUD의 부가 필드(face/active/personal + 관련 텍스트 노드)는 **제거**. HUD는 페이즈 통숫자 + 두 자리 초만 표시.

### §0-A 페이즈 번호 → 통숫자 스프라이트 RUID 매핑 (animationclip-1091968)
클립 RUID: **`4d5a4647c23c44ed96b13994067d2eb4`** (animationclip, 88×80, 12프레임). 각 프레임은 개별 sprite RUID이며 그대로 `ImageRUID`에 넣으면 해당 통숫자가 렌더됨(낱개 자릿수 조합 불필요). 프레임 이미지를 몽타주로 육안 확인함 → 1~12 통숫자.

```
Phase 1 =1e00a3a798d142e89dd89367339eb966   Phase 7 =dae13cdce6f0428d887e7548ca86081b
Phase 2 =41665d3e5a17402f945f3ddb10a6e349   Phase 8 =d5998a5cee0e4e0b88cb84a2007c99ce
Phase 3 =702c35ede00e49738c03f24c7eff888f   Phase 9 =40ca61bd99dd433585a051fd14f0dae6
Phase 4 =37ead2abdc1343be9cbc98958c65593f   Phase 10=0dba9c1519a0412890c3813f0d3d5660
Phase 5 =7aae391f60c949bb83c153548252ff5b   Phase 11=97dc24721e944f63aed083d41a4c46f1
Phase 6 =adfbfca1cf304fb79135deaa5e41fa2b   Phase 12=15482fd65a82463786a997255511cde4
```
- `PhaseNumber`는 [1,12]로 clamp. (대안: 클립 RUID를 직접 `ImageRUID`로 넣고 `StartFrameIndex=EndFrameIndex=PhaseNumber−1`, `PlayRate=0`으로 프레임 고정 — 개별 프레임 RUID 방식과 동등하나, 개별 RUID 매핑이 시간 숫자 패턴과 일관되어 권장.)

### 시간 표시용 숫자 RUID (사용자 제공)
```
0=404804a4f462458e9ebb30475e8c4f18  1=503223f2741d45edba6f752d373881ca
2=190a70eb00e941248fc815536f186058  3=5a2a31f2fe4348d2908a2599430f5f7b
4=721481c17ae84c7389cd9dc1ac826d9d  5=bcce0a1a96974bb2acc49720c5077387
6=ad7abc9214a547c8b3b75cdf102b61c3  7=68a07ce4e3df46719c5c8f06518f77d8
8=1091ca4ddf384d6799899c31fa3632c7  9=3dc79b51e05f4359874ac8bbef083632
```
(메이플 secret vault timer number 스프라이트. 세로가 긴 형태, 글리프 종횡비 ≈ 0.55(w/h). `PreserveAspect=true`로 사용.)

---

## 1. 배경 픽셀 분석 결과 (v2 `timer_UI (1).png` = 224×92px, 좌상단 원점)

5배 확대 + 알파/휘도 밴드 스캔으로 분석한 v2 실측 좌표(레이아웃은 v1과 동일, 폭만 238→224):

| 요소 | X 범위 | Y 범위 | 비고 |
|---|---|---|---|
| 상단 프레임(값 셀) | ~40–198 | ~13–57 | 좌측 라벨 셀 / 우측 값 셀, x≈105에 세로 구분선 |
| "PHASE" 라벨(각인) | 16–68 | 38–52 | 좌측 셀 하단 |
| 시계 아이콘(보라)  | 38–51 | 63–82 | 하단 행 좌측 |
| "남은시간"(각인)   | 58–110 | 63–80 | |
| 빈칸(밑줄)         | ~114–198 | 밑줄 y≈80–83 | **여기에 초 숫자** (중심 x≈156) |
| "초"(각인)         | 200–211 | 63–80 | 우측 끝 |

### 값 배치 좌표 (배경 대비 비율 — 스케일 무관)

배경 위에 얹을 숫자 슬롯의 중심을, 배경 크기(224×92)에 대한 비율로 확정한다. (구현 시 `anchoredPosition = bgSize × (frac − 0.5)`, Y축 상하 반전. W/2=112, H/2=46)

| 슬롯 | 배경 픽셀 중심 | 비율(좌상단 기준) | 중심-원점 로컬(native, px) | 크기(native) |
|---|---|---|---|---|
| **페이즈 통숫자** (우측 값 셀, 단일) | (156, 35) | (0.696, 0.380) | (+44, +11) | 약 44×40 (클립 88×80 비율) |
| **초 십의자리** | (146, 71) | (0.652, 0.772) | (+34, −25) | 약 12×22 (0.55 비율) |
| **초 일의자리** | (170, 71) | (0.759, 0.772) | (+58, −25) | 약 12×22 (0.55 비율) |

- **페이즈**: 단일 슬롯. 프레임은 88×80 캔버스에 통숫자가 중앙정렬되어 있어(1~12 모두 동일 캔버스) 고정 슬롯 1개로 충분. 높이 ≈ 배경 높이의 44%, `PreserveAspect=true`. 자릿수 분해/좌우 분할 **불필요**.
- **초 숫자**: 높이 ≈ 배경 높이의 24%(native ≈ 22px), 폭 = 높이 × 0.55, `PreserveAspect=true`. 십/일 2슬롯.
- 최종 HUD 표시 스케일 S(예: 2.5배 → 595×230)를 곱하면 모든 로컬 오프셋/크기가 선형 확대. 기존 `MagneticZoneGroup` 패널의 위치·크기를 계승.

---

## 2. 현재 구조 (조사 결과)

- **`BRMagneticZoneSystem.mlua`** (`@Logic`, 서버 권위): `@Sync PhaseTimeRemaining`, `ZoneRunning`, `WarningActive`, `ShrinkFinished`, `ZoneMapName`(기본 `RoomTestMap`) 등. `AdvancePhase(delta)`에서 페이즈 타이머 감소/축소 진행. **숫자형 페이즈 인덱스는 없음** → 신규 추가 필요.
- **`BRMagneticZoneUI.mlua`** (`@Component`, `ClientOnly`, `MagneticZoneGroup/` 컨트롤러에 부착): `phaseText/faceText/timerText/activeText/personalText` 5개 TextComponent를 0.1s 주기로 갱신. `ShouldShow()`가 `ZoneRunning` + 로컬 플레이어 맵명 == `ZoneMapName`일 때만 표시.
- **`ui/MagneticZoneGroup.ui`**: 위 컴포넌트 + 5개 텍스트 노드. (`.ui`는 builder 전용)
- 참고: 별개로 존재하는 **BossTimer**(`BRBattleTimerSystem`→`BRBossTimerUI`, `BossTimerGroup.ui`, MM:SS 보라 숫자)는 이번 작업 대상 아님(사용자가 자기장 선택). 손대지 않음.

---

## 3. 구현 단계

> 모든 `.mlua`는 작성 후 `mlua-diagnose` 자동 실행 → 에러 0까지 수정. `.ui`는 **UIBuilder 전용**(raw JSON 금지). 각 단계 후 Maker `refresh`.

### 단계 A — 자기장 시스템에 페이즈 번호 추가 (`BRMagneticZoneSystem.mlua`)
1. `@Sync property integer PhaseNumber = 1` 추가. 서버 권위. **페이즈 범위 = 1~9** (사용자 확정 — 통숫자 프레임 idx 0~8만 사용, 두 자리 케이스 없음).
2. 존 시작 시(`StartZone`/리셋 지점) `PhaseNumber = 1`로 초기화.
3. `AdvancePhase`가 한 축소 사이클을 완료해 다음 페이즈로 넘어갈 때 `PhaseNumber += 1` (기존 `phaseTimer` 리셋 지점: line ~257, ~267 부근). 표시 안전을 위해 `math.min(9, ...)` clamp.
4. 종료/리셋 지점(line ~1115, ~1122)에서 `PhaseNumber = 1`로 정리.
5. `log()`로 페이즈 전환 시점 기록(검증용).

### 단계 B — 배경 + 숫자 슬롯 UI 구성 (`ui/MagneticZoneGroup.ui`, UIBuilder)
> Builder Protocol §3 재확인 후 `UIBuilder.load("ui/MagneticZoneGroup.ui")`로 시작.
1. 기존 패널(`c69a1e1b-...`) 하위를 이 배경 디자인으로 재구성.
2. **배경 스프라이트** 노드: `sprite(...)` with `ImageRUID = acfc12a5fb6243feb0b35a8509376530`, `Type=Simple(0)`, RectSize = 224×S × 92×S (S=표시 스케일), 패널 중앙 정렬. 기존 텍스트 노드(faceText/timerText/activeText/personalText 등)는 제거.
3. 배경의 자식으로 **숫자 슬롯 3개** 생성 (각 `SpriteGUIRendererComponent`, `Type=Simple(0)`, `PreserveAspect=true`):
   - `PhaseNumber` — **단일 통숫자 슬롯**, 비율(0.696, 0.380), 크기 ≈ (0.44×92×S) 높이 × 88:80 비율 폭. `ImageRUID` 초기값 = Phase 1 프레임(`1e00a3a7...`).
   - `SecTens` — 비율(0.652, 0.772)
   - `SecOnes` — 비율(0.759, 0.772)
   - 초 슬롯 RectSize = (0.24×92×S) 높이 × 0.55 폭, `ImageRUID` 초기값 = 시간 "0" 스프라이트.
4. `write()` (자동 lint) → `injectBindings`로 `.mlua` 프로퍼티 UUID 자동 주입.

### 단계 C — 표시 컴포넌트 개편 (`BRMagneticZoneUI.mlua`)
1. 프로퍼티 교체: `phaseText/faceText/timerText/activeText/personalText`(TextComponent) → **`SpriteGUIRendererComponent phaseNumber, secTens, secOnes`** + `Entity panel`(배경).
2. **시간 숫자 RUID 테이블** `BuildTimeDigitRuidTable()`: §0의 0~9 RUID 하드코딩(사용자 제공분, 낱개 자릿수용).
3. **페이즈 통숫자 RUID 테이블** `BuildPhaseNumberRuidTable()`: §0-A의 1~9 프레임 RUID 하드코딩(`animationclip-1091968`). 페이즈 N(1~9) → 프레임 RUID 직접 매핑. (통숫자이므로 자릿수 분해 없음.)
4. `Refresh()` (0.1s 주기, `ClientOnly`):
   - `ShouldShow()` 유지(`ZoneRunning` + 맵명 일치) → 배경 패널 Enable 토글.
   - **초 표시**: `sec = clamp(ceil(PhaseTimeRemaining), 0, 99)`; 십/일의 자리 분해 → `secTens.ImageRUID`, `secOnes.ImageRUID` 갱신(변경 시에만).
   - **페이즈 표시**: `p = clamp(PhaseNumber, 1, 9)`; `phaseNumber.ImageRUID = phaseRuids[p]` 갱신(변경 시에만). 단일 슬롯.
   - 경고/금지 상태(`WarningActive`/forbidden) 시 숫자 `Color` 틴트(기존 색상 로직 재사용) — 선택.
5. `SetRootRaycastBlocked(false)` 유지(스킬 입력 방해 방지). `OnEndPlay`에서 타이머 정리(기존 유지).
6. `ImageRUID` 대입 형식은 `{ DataId = ruid }` (UI 컴포넌트 규칙).

### 단계 D — 검증 (msw-scripting verify-checklist)
`stop → clear_logs → refresh → logs(build) → play → logs(runtime) → stop`. §5 참조.

---

## 4. 승인 기준 (테스트 가능)

- [ ] `BRMagneticZoneSystem`에 `@Sync PhaseNumber`(1~9 clamp) 존재, 존 시작 시 1, 축소마다 +1 (로그로 증명).
- [ ] `ui/MagneticZoneGroup.ui`에 배경 스프라이트(신규 timer_UI(1) RUID) + 숫자 슬롯 3개(페이즈 1 + 초 2)가 UIBuilder로 생성, lint clean.
- [ ] play 중 RoomTestMap에서 존 실행 시: 배경 위 **페이즈 통숫자**(단일) + **두 자리 초**가 배경의 PHASE/남은시간 각인 위치에 정렬되어 표시.
- [ ] `PhaseTimeRemaining` 감소에 따라 초 숫자가 매초 갱신, 0~30 범위에서 두 자리(예: `05`, `28`) 정상.
- [ ] 페이즈 전환 시 페이즈 통숫자 스프라이트가 1→2→… 로 교체(1~9 범위).
- [ ] 존 미실행/타 맵에서는 HUD 숨김.
- [ ] build 에러 0 + 페이즈/초 갱신 positive 로그 증거.

---

## 5. 검증 단계

1. 단계 A~C 후 각각 `refresh` → `logs(category="build")` 에러 0 확인.
2. `play` → 자기장 시작(`AutoStartOnBeginPlay` 또는 디버그 트리거) → 수 초 대기 → `logs(category="runtime")`로 `PhaseNumber`/`sec` 갱신 로그 확인.
3. `screenshot`(사용자 요청 시)로 숫자가 각인 위치(PHASE 값칸, 남은시간 빈칸)에 정렬됐는지 육안 확인 → 필요 시 §1 비율 미세조정.
4. 두 자리 경계(예: 30→09→00) 및 페이즈 전환(1→2) 시점 캡처.

---

## 6. 리스크 & 대응

| 리스크 | 대응 |
|---|---|
| **부가 필드 드롭** (face/active/personal) — 배경에 자리 없음 | 기본은 드롭. 승인 시 확정. 대안: 해당 정보를 별도 소형 그룹으로 유지하거나 배경 하단 여백에 소형 텍스트로 재배치. |
| 페이즈가 상태(SAFE/WARNING) 기반이라 "번호"가 인위적 | 신규 `PhaseNumber`(축소 인덱스, 1~9)로 정의 — 의미가 맞는지 승인 시 확인. 원치 않으면 페이즈 슬롯에 상태별 아이콘/텍스트로 대체 가능. |
| 숫자 정렬이 각인과 어긋남 | §1 좌표는 v2(224×92) 실측 기반이나, 표시 스케일·PreserveAspect로 미세 오차 가능 → play+screenshot로 비율 보정(단계 5-3). |
| **신규 배경 RUID 미확보** | `timer_UI (1).png`는 로컬 파일 → 리소스 업로드 전엔 UI에 못 붙임. §0 ⚠️대로 사용자 제공 또는 승인 시 MCP 업로드로 선(先)확보 필요. |
| 페이즈 클립이 0~9가 아니라 1~12 통숫자 | 사용자 확정: 페이즈는 1~9만 사용 → 프레임 idx 0~8만 매핑, 안전. 통숫자라 자릿수 조합 불필요. |
| `.ui` raw 편집 위험 | UIBuilder만 사용(§3), write 시 자동 lint. |
| 대상 혼동(자기장 vs 보스타이머) | 사용자가 자기장 선택. BossTimer는 미변경. |

---

## 7. 확정 완료 — 모든 입력 수령, 구현 준비 완료
- 데이터 소스 = 자기장 시스템(`PhaseTimeRemaining` + 신규 `PhaseNumber` 1~9). ✔
- 페이즈 렌더 = `animationclip-1091968`(RUID `4d5a4647c23c44ed96b13994067d2eb4`) 통숫자 프레임, 페이즈 1~9 → 단일 슬롯. ✔
- 시간 = 두 자리 초, 제공된 0~9 낱개 숫자 RUID(십/일 2슬롯). ✔
- 배경 = `timer_UI (1).png`, RUID **`acfc12a5fb6243feb0b35a8509376530`**, 224×92, 좌표 실측 완료. ✔
- 범위 = 기존 자기장 HUD 완전 제거 후 이 배경으로 교체 (부가 필드 드롭 확정). ✔

### 유일한 실행 전 조건
- **maker MCP 재연결**: 이번 세션은 시작 시점에 `msw-maker-mcp` 연결 실패 상태 → `.mcp.json`은 고쳤으나 이 세션 반영을 위해 `/mcp` 재연결(또는 재시작) 필요. 파일 작성(.mlua/.ui)은 MCP 없이 가능하나, **검증 루프(refresh → build logs → play → runtime logs)** 는 MCP 필수. MCP 없이는 "동작 확인"을 할 수 없음(AGENTS.md 규칙).

### 표시 스케일 S
- 기존 `MagneticZoneGroup` 패널의 위치·크기를 계승하되, 배경 224×92에 맞춰 S를 정해 가독성 확보(구현 시 확정 → play+screenshot로 보정).
