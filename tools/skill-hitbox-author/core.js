(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.SkillHitboxCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const SCHEMA_NAME = "waness_skill_data";
  const TABLE_NAMES = [
    "jobs",
    "characters",
    "skills",
    "effects",
    "skill_action_restrictions",
    "events",
    "area_target_captures",
    "rect_hitboxes",
    "circle_hitboxes",
    "actions",
    "damage_actions",
    "projectile_spawn_actions",
    "ground_area_spawn_actions",
    "trigger_actions",
    "dash_actions",
    "teleport_actions",
  ];
  const RESOURCE_API_BASE = "https://maplestoryworlds-resourcesearch-new.nexon.com/api/v3/resources";
  const RESOURCE_IMAGE_BASE = "https://mod-resource-search-images.dn.nexoncdn.co.kr/maplestory_world";

  function normalizeInput(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return [value];
    throw new Error("Input must be a JSON object or an array of objects.");
  }

  function parseJsonList(text) {
    if (!text || !text.trim()) {
      throw new Error("JSON input is empty.");
    }
    return normalizeInput(JSON.parse(text));
  }

  function slugify(value, fallback) {
    const source = String(value || fallback || "skill").trim();
    const slug = source
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "_")
      .replace(/^_+|_+$/g, "");
    return slug || fallback || "skill";
  }

  function elementAction(element) {
    return String(element && element.action ? element.action : "");
  }

  function elementType(element) {
    return String(element && element.type ? element.type : "").toLowerCase();
  }

  function isUseSound(element) {
    return elementType(element) === "effect" && /audio\/use/i.test(elementAction(element));
  }

  function isHitSound(element) {
    return elementType(element) === "effect" && /audio\/hit/i.test(elementAction(element));
  }

  function isIcon(element) {
    return /^icon/i.test(elementAction(element));
  }

  function isAnimation(element) {
    return elementType(element) === "animationclip";
  }

  function isHitAnimation(element) {
    return isAnimation(element) && /^hit(\/|$)/i.test(elementAction(element));
  }

  function isMainEffect(element) {
    const action = elementAction(element);
    return isAnimation(element) && !isHitAnimation(element) && /^(effect|skill|attack)(\/|$|\d*)/i.test(action);
  }

  function firstRuid(elements, predicate) {
    const found = elements.find(predicate);
    return found ? String(found.ruid || "") : "";
  }

  function classifyPack(pack, index) {
    const elements = Array.isArray(pack.elements) ? pack.elements : [];
    const resourcePack = String(pack.resource_pack || pack.resourcePack || pack.name || "");
    const skillId = slugify(pack.skillId || pack.skill_id || resourcePack, `skill_${index + 1}`);
    const hitEffects = elements.filter(isHitAnimation);
    const mainEffectRuid =
      firstRuid(elements, isMainEffect) ||
      firstRuid(elements, (element) => isAnimation(element) && !isIcon(element));

    return {
      source: pack,
      skillId,
      resourcePack,
      elements,
      mainEffectRuid,
      iconRuid: firstRuid(elements, isIcon),
      useSoundRuid: firstRuid(elements, isUseSound),
      hitSoundRuid: firstRuid(elements, isHitSound),
      hitEffects: hitEffects.map((element) => ({
        ruid: String(element.ruid || ""),
        action: elementAction(element),
      })),
      warnings: validatePack(pack, elements),
      events: normalizeSkillEvents(pack.events, skillId, hitEffects),
    };
  }

  function validatePack(pack, elements) {
    const warnings = [];
    if (!pack.resource_pack && !pack.resourcePack) warnings.push("missing resource_pack");
    if (!Array.isArray(pack.elements)) warnings.push("elements is missing or not an array");
    if (!elements.some(isAnimation)) warnings.push("no animationclip");
    if (!elements.some(isUseSound)) warnings.push("no audio/Use");
    if (!elements.some(isHitSound)) warnings.push("no audio/Hit");
    if (!elements.some(isHitAnimation)) warnings.push("no hit animationclip");
    return warnings;
  }

  function normalizeSkillEvents(inputEvents, skillId, hitEffects) {
    if (Array.isArray(inputEvents) && inputEvents.length) {
      return inputEvents.map((skillEvent, index) => ({
        id: skillEvent.id || `${skillId}_event_${index + 1}`,
        startFrame: skillEvent.startFrame == null ? "" : skillEvent.startFrame,
        endFrame: skillEvent.endFrame == null ? "" : skillEvent.endFrame,
        damageRate: skillEvent.damageRate == null || skillEvent.damageRate === "" ? "1" : skillEvent.damageRate,
        attackInfo: skillEvent.attackInfo || `${skillId}.event${index + 1}`,
        hitEffectRuid: skillEvent.hitEffectRuid || "",
        hitboxes: Array.isArray(skillEvent.hitboxes) ? skillEvent.hitboxes : [],
        ...normalizeProjectileFields(skillEvent),
      }));
    }
    return makeDefaultEvents(skillId, hitEffects);
  }

  function normalizeProjectileFields(skillEvent) {
    return {
      actionMode: skillEvent && skillEvent.actionMode === "projectile" ? "projectile" : "area_target",
      projectileSpriteRuid: skillEvent && skillEvent.projectileSpriteRuid ? String(skillEvent.projectileSpriteRuid) : "",
      projectileRange: skillEvent && skillEvent.projectileRange != null ? skillEvent.projectileRange : "",
      projectileSpeed: skillEvent && skillEvent.projectileSpeed != null ? skillEvent.projectileSpeed : "",
      projectileFrontDirection:
        !skillEvent || skillEvent.projectileFrontDirection == null || skillEvent.projectileFrontDirection === ""
          ? true
          : parseBoolean(skillEvent.projectileFrontDirection),
      projectilePierce: skillEvent && skillEvent.projectilePierce != null ? skillEvent.projectilePierce : "",
      projectileHitbox:
        skillEvent && skillEvent.projectileHitbox && typeof skillEvent.projectileHitbox === "object"
          ? { ...skillEvent.projectileHitbox }
          : null,
      collisionDamageRate:
        !skillEvent || skillEvent.collisionDamageRate == null || skillEvent.collisionDamageRate === ""
          ? "1"
          : skillEvent.collisionDamageRate,
      collisionHitEffectRuid:
        skillEvent && skillEvent.collisionHitEffectRuid ? String(skillEvent.collisionHitEffectRuid) : "",
      collisionSoundRuid:
        skillEvent && skillEvent.collisionSoundRuid ? String(skillEvent.collisionSoundRuid) : "",
    };
  }

  function makeDefaultEvents(skillId, hitEffects) {
    const count = Math.max(1, hitEffects.length);
    const events = [];
    for (let i = 0; i < count; i += 1) {
      const n = i + 1;
      events.push({
        id: `${skillId}_event_${n}`,
        startFrame: "",
        endFrame: "",
        damageRate: "1",
        attackInfo: `${skillId}.event${n}`,
        hitEffectRuid: hitEffects[i] ? String(hitEffects[i].ruid || "") : "",
        hitboxes: [],
        ...normalizeProjectileFields(null),
      });
    }
    return events;
  }

  function classifyPacks(packs) {
    return normalizeInput(packs).map(classifyPack);
  }

  function emptyWanessTables() {
    const tables = {};
    TABLE_NAMES.forEach((name) => {
      tables[name] = [];
    });
    return tables;
  }

  function ensureClassifiedPack(pack, index) {
    if (pack && Array.isArray(pack.events) && pack.mainEffectRuid !== undefined) {
      return pack;
    }
    return classifyPack(pack, index);
  }

  function asIntegerOrBlank(value) {
    if (value === "" || value == null) return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number < 0 ? Math.ceil(number) : Math.floor(number);
  }

  function asIntegerOrNull(value) {
    const normalized = asIntegerOrBlank(value);
    return normalized === "" ? null : normalized;
  }

  function asDecimalOrBlank(value) {
    if (value === "" || value == null) return "";
    const number = Number(value);
    if (!Number.isFinite(number)) return "";
    return number;
  }

  function parseBoolean(value) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    const normalized = String(value || "").trim().toLowerCase();
    if (["false", "0", "no", "n", "off"].includes(normalized)) return false;
    return true;
  }

  function pipe(values) {
    return values.filter((value) => value !== "" && value != null).map(String).join("|");
  }

  function skillEventId(pack, skillEvent, eventIndex) {
    return String(skillEvent.id || `${pack.skillId}_event_${eventIndex + 1}`);
  }

  function eventActionId(eventId) {
    return `${eventId}_damage`;
  }

  function projectileSpawnActionId(eventId) {
    return `${eventId}_projectile_spawn`;
  }

  function projectileCollisionEventId(eventId) {
    return `${eventId}_projectile_collision`;
  }

  function projectileDamageActionId(eventId) {
    return `${eventId}_projectile_damage`;
  }

  function projectileHitboxId(eventId) {
    return `${eventId}_projectile_hitbox`;
  }

  function eventAreaTargetId(eventId) {
    return `${eventId}_target`;
  }

  function eventHitboxId(eventId, box, boxIndex) {
    const raw = box.boxId != null && box.boxId !== "" ? box.boxId : boxIndex + 1;
    return `${eventId}_hitbox_${raw}`;
  }

  function eventActionMode(skillEvent) {
    return skillEvent && skillEvent.actionMode === "projectile" ? "projectile" : "area_target";
  }

  function eventDurationFrames(skillEvent) {
    const start = asIntegerOrNull(skillEvent.startFrame);
    const end = asIntegerOrNull(skillEvent.endFrame);
    if (start == null || end == null) return 1;
    return Math.abs(end - start) + 1;
  }

  function eventFrameMap(events, eventIds) {
    const map = new Map();
    events.forEach((skillEvent, index) => {
      const start = asIntegerOrNull(skillEvent.startFrame);
      if (start == null) return;
      const id = eventIds[index];
      const ids = map.get(start) || [];
      ids.push(id);
      map.set(start, ids);
    });
    return Array.from(map.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([frame, ids]) => `${frame}:${ids.join("|")}`)
      .join(";");
  }

  function totalLengthFrames(pack, events) {
    const fromPack = asIntegerOrNull(pack.totalLengthFrames);
    if (fromPack != null && fromPack > 0) return fromPack;
    let maxFrame = -1;
    events.forEach((skillEvent) => {
      const start = asIntegerOrNull(skillEvent.startFrame);
      const end = asIntegerOrNull(skillEvent.endFrame);
      if (start != null) maxFrame = Math.max(maxFrame, start);
      if (end != null) maxFrame = Math.max(maxFrame, end);
    });
    return maxFrame >= 0 ? maxFrame + 1 : "";
  }

  function damagePercent(damageRate) {
    if (damageRate === "" || damageRate == null) return 100;
    const number = Number(damageRate);
    if (!Number.isFinite(number)) return 100;
    return Math.round(number * 100);
  }

  function legacyRightFromBox(box) {
    if (box.rightXpx != null && box.rightXpx !== "") return box.rightXpx;
    if (box.centerXpx == null || box.centerXpx === "" || box.widthPx == null || box.widthPx === "") return "";
    return Math.trunc(Number(box.centerXpx) + Number(box.widthPx) / 2);
  }

  function legacyBottomFromCenter(box) {
    if (box.bottomYpx != null && box.bottomYpx !== "") return box.bottomYpx;
    if (box.centerYpx == null || box.centerYpx === "" || box.heightPx == null || box.heightPx === "") return "";
    return Math.trunc(Number(box.centerYpx) - Number(box.heightPx) / 2);
  }

  function buildWanessSkillData(packs) {
    const tables = emptyWanessTables();
    const warnings = [];
    normalizeInput(packs).map(ensureClassifiedPack).forEach((pack) => {
      const events = Array.isArray(pack.events) ? pack.events : [];
      const eventIds = events.map((skillEvent, eventIndex) => skillEventId(pack, skillEvent, eventIndex));
      const effectId = `${pack.skillId}_effect`;

      if (!pack.mainEffectRuid) warnings.push(`${pack.skillId}: missing main effect RUID`);
      if (!pack.iconRuid) warnings.push(`${pack.skillId}: missing icon RUID`);
      if (!pack.useSoundRuid) warnings.push(`${pack.skillId}: missing use sound RUID`);
      if (!pack.hitSoundRuid) warnings.push(`${pack.skillId}: missing hit sound RUID`);

      tables.skills.push({
        id: pack.skillId,
        name: pack.resourcePack || pack.skillId,
        skill_category: "기본 스킬",
        icon_ruid: pack.iconRuid || "",
        sound_ruid: pack.useSoundRuid || "",
        description: pack.description || "",
        effect_ids: pack.mainEffectRuid ? effectId : "",
        total_length_frames: totalLengthFrames(pack, events),
        frame_event_ids: eventFrameMap(events, eventIds),
        cooldown: pack.cooldown == null ? "" : pack.cooldown,
      });

      if (pack.mainEffectRuid) {
        tables.effects.push({
          effect_id: effectId,
          effect_ruid: pack.mainEffectRuid,
          is_loop: false,
          total_length_frames: totalLengthFrames(pack, events),
        });
      }

      events.forEach((skillEvent, eventIndex) => {
        const eventId = eventIds[eventIndex];
        if (asIntegerOrNull(skillEvent.startFrame) == null) warnings.push(`${eventId}: missing start frame`);

        if (eventActionMode(skillEvent) === "projectile") {
          const spawnActionId = projectileSpawnActionId(eventId);
          const collisionEventId = projectileCollisionEventId(eventId);
          const damageActionId = projectileDamageActionId(eventId);
          const hitboxId = projectileHitboxId(eventId);
          const projectileBox = skillEvent.projectileHitbox || null;

          if (!skillEvent.projectileSpriteRuid) warnings.push(`${eventId}: missing projectile sprite RUID`);
          if (!projectileBox) warnings.push(`${eventId}: no projectile hitbox`);

          tables.events.push({
            event_id: eventId,
            event_type: "액션 실행",
            area_target_id: "",
            action_ids: spawnActionId,
          });

          tables.actions.push({
            action_id: spawnActionId,
            action_type: "투사체 생성",
            required_context: "시전자",
          });

          tables.projectile_spawn_actions.push({
            id: spawnActionId,
            projectile_sprite_ruid: skillEvent.projectileSpriteRuid || "",
            projectile_range: asIntegerOrBlank(skillEvent.projectileRange),
            projectile_speed: asDecimalOrBlank(skillEvent.projectileSpeed),
            projectile_front_direction: parseBoolean(skillEvent.projectileFrontDirection),
            projectile_hitbox_id: projectileBox ? hitboxId : "",
            projectile_pierce: skillEvent.projectilePierce == null ? "" : skillEvent.projectilePierce,
            collision_event_ids: collisionEventId,
            expire_event_ids: "",
          });

          if (projectileBox) {
            const width = asIntegerOrBlank(projectileBox.widthPx);
            const height = asIntegerOrBlank(projectileBox.heightPx);
            if (width === "" || height === "" || width <= 0 || height <= 0) {
              warnings.push(`${eventId}: projectile hitbox has invalid size`);
            }
            tables.rect_hitboxes.push({
              hitbox_id: hitboxId,
              offset_x: asIntegerOrBlank(legacyRightFromBox(projectileBox)),
              offset_y: asIntegerOrBlank(legacyBottomFromCenter(projectileBox)),
              width,
              height,
            });
          }

          tables.events.push({
            event_id: collisionEventId,
            event_type: "액션 실행",
            area_target_id: "",
            action_ids: damageActionId,
          });

          tables.actions.push({
            action_id: damageActionId,
            action_type: "피해",
            required_context: "시전자|대상",
          });

          tables.damage_actions.push({
            action_id: damageActionId,
            attack_power_coefficient_percent: damagePercent(skillEvent.collisionDamageRate),
            hit_effect_ruid: skillEvent.collisionHitEffectRuid || skillEvent.hitEffectRuid || "",
            sound_ruid: skillEvent.collisionSoundRuid || pack.hitSoundRuid || "",
          });
          return;
        }

        const areaTargetId = eventAreaTargetId(eventId);
        const actionId = eventActionId(eventId);
        const hitboxes = Array.isArray(skillEvent.hitboxes) ? skillEvent.hitboxes : [];
        const hitboxIds = hitboxes.map((box, boxIndex) => eventHitboxId(eventId, box, boxIndex));

        if (!hitboxes.length) warnings.push(`${eventId}: no hitboxes`);

        tables.events.push({
          event_id: eventId,
          event_type: "범위 대상포착",
          area_target_id: areaTargetId,
          action_ids: "",
        });

        tables.area_target_captures.push({
          area_target_id: areaTargetId,
          hitbox_ids: pipe(hitboxIds),
          duration_frames: eventDurationFrames(skillEvent),
          target: "적군",
          action_ids: actionId,
        });

        hitboxes.forEach((box, boxIndex) => {
          const width = asIntegerOrBlank(box.widthPx);
          const height = asIntegerOrBlank(box.heightPx);
          if (width === "" || height === "" || width <= 0 || height <= 0) {
            warnings.push(`${eventId}: hitbox ${boxIndex + 1} has invalid size`);
          }
          tables.rect_hitboxes.push({
            hitbox_id: eventHitboxId(eventId, box, boxIndex),
            offset_x: asIntegerOrBlank(legacyRightFromBox(box)),
            offset_y: asIntegerOrBlank(legacyBottomFromCenter(box)),
            width,
            height,
          });
        });

        tables.actions.push({
          action_id: actionId,
          action_type: "피해",
          required_context: "시전자|대상",
        });

        tables.damage_actions.push({
          action_id: actionId,
          attack_power_coefficient_percent: damagePercent(skillEvent.damageRate),
          hit_effect_ruid: skillEvent.hitEffectRuid || "",
          sound_ruid: pack.hitSoundRuid || "",
        });
      });
    });

    return {
      data: {
        schema_name: SCHEMA_NAME,
        tables,
      },
      warnings,
    };
  }

  function packsToWanessJson(packs) {
    return JSON.stringify(buildWanessSkillData(packs).data, null, 2);
  }

  function updateHitboxFromRect(hitbox, rect) {
    const trunc = (value) => (value < 0 ? Math.ceil(value) : Math.floor(value));
    const x1 = Math.min(rect.x1, rect.x2);
    const x2 = Math.max(rect.x1, rect.x2);
    const y1 = Math.min(rect.y1, rect.y2);
    const y2 = Math.max(rect.y1, rect.y2);
    const width = Math.floor(x2 - x1);
    const height = Math.floor(y2 - y1);
    if (width <= 0 || height <= 0) {
      return null;
    }
    hitbox.rightXpx = trunc(x2);
    hitbox.bottomYpx = trunc(y1);
    hitbox.widthPx = width;
    hitbox.heightPx = height;
    return hitbox;
  }

  function resourceDetailUrl(ruid) {
    return `${RESOURCE_API_BASE}/${encodeURIComponent(String(ruid || "").trim())}`;
  }

  function spriteImageUrl(spriteRuid) {
    return `${RESOURCE_IMAGE_BASE}/${encodeURIComponent(String(spriteRuid || "").trim())}.png`;
  }

  function firstFiniteNumber(...values) {
    for (const value of values) {
      const number = Number(value);
      if (Number.isFinite(number) && number > 0) return number;
    }
    return 0;
  }

  function normalizePivot(payload) {
    const pivot = payload && payload.pivot;
    if (pivot && Number.isFinite(Number(pivot.x)) && Number.isFinite(Number(pivot.y))) {
      return { x: Number(pivot.x), y: Number(pivot.y) };
    }
    const x = payload && (payload.pivotX ?? payload.pivot_x ?? payload.originX ?? payload.origin_x);
    const y = payload && (payload.pivotY ?? payload.pivot_y ?? payload.originY ?? payload.origin_y);
    if (Number.isFinite(Number(x)) && Number.isFinite(Number(y))) {
      return { x: Number(x), y: Number(y) };
    }
    return null;
  }

  function resourceType(detail) {
    return String(detail && (detail.type || detail.resourceType || detail.resource_type || "")).toLowerCase();
  }

  async function fetchResourceDetail(ruid, fetchImpl) {
    const runFetch = fetchImpl || (typeof fetch === "function" ? fetch.bind(globalThis) : null);
    if (!runFetch) {
      throw new Error("fetch is not available in this environment.");
    }
    const cleanRuid = String(ruid || "").trim();
    if (!/^[0-9a-f]{32}$/i.test(cleanRuid)) {
      throw new Error("RUID must be a 32-character hex string.");
    }
    const response = await runFetch(resourceDetailUrl(cleanRuid), {
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`Resource API failed (${response.status}) for ${cleanRuid}.`);
    }
    return response.json();
  }

  function framesFromAnimationDetail(detail) {
    if (!detail || resourceType(detail) !== "animationclip") {
      throw new Error("RUID detail is not an animationclip resource.");
    }
    const frames = detail.payload && Array.isArray(detail.payload.frames) ? detail.payload.frames : [];
    return frames.map((frame, index) => {
      const spriteRuid = String(frame.spriteRuid || frame.sprite_ruid || "");
      return {
        index: frame.index == null ? index : Number(frame.index),
        spriteRuid,
        width: Number(frame.width || 0),
        height: Number(frame.height || 0),
        pivot: frame.pivot || null,
        imageUrl: spriteRuid ? spriteImageUrl(spriteRuid) : "",
      };
    });
  }

  function spriteFrameFromDetail(detail, fallbackRuid) {
    if (!detail) {
      throw new Error("RUID detail is empty.");
    }
    const type = resourceType(detail);
    if (type === "animationclip") {
      const frames = framesFromAnimationDetail(detail);
      if (!frames.length) {
        throw new Error("Animationclip has no frames.");
      }
      return frames[0];
    }
    if (type !== "sprite") {
      throw new Error("RUID detail is not a sprite resource.");
    }
    const payload = detail.payload || {};
    const spriteRuid = String(detail.ruid || detail.id || payload.ruid || payload.spriteRuid || fallbackRuid || "");
    return {
      index: 0,
      spriteRuid,
      width: firstFiniteNumber(payload.width, payload.w, detail.width, detail.w),
      height: firstFiniteNumber(payload.height, payload.h, detail.height, detail.h),
      pivot: normalizePivot(payload) || normalizePivot(detail),
      imageUrl: spriteRuid ? spriteImageUrl(spriteRuid) : "",
    };
  }

  async function fetchAnimationFrames(ruid, fetchImpl) {
    const detail = await fetchResourceDetail(ruid, fetchImpl);
    return {
      detail,
      frames: framesFromAnimationDetail(detail),
    };
  }

  async function fetchSpriteFrame(ruid, fetchImpl) {
    const detail = await fetchResourceDetail(ruid, fetchImpl);
    return {
      detail,
      frame: spriteFrameFromDetail(detail, ruid),
    };
  }

  return {
    SCHEMA_NAME,
    TABLE_NAMES,
    RESOURCE_API_BASE,
    RESOURCE_IMAGE_BASE,
    parseJsonList,
    classifyPacks,
    classifyPack,
    buildWanessSkillData,
    packsToWanessJson,
    updateHitboxFromRect,
    resourceDetailUrl,
    spriteImageUrl,
    fetchResourceDetail,
    framesFromAnimationDetail,
    spriteFrameFromDetail,
    fetchAnimationFrames,
    fetchSpriteFrame,
  };
});
