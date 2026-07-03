# Skill Hitbox Author

Standalone authoring tool for MapleStory Worlds skill event hitboxes.

## Use

Open `index.html` in a browser.

1. Paste one resource pack JSON object or a JSON array.
2. Click `Parse JSON`.
3. Click `Generate JSON` to create Waness schema JSON.
4. Load the animationclip RUID frames, or load an optional frame image.
5. Select a skill and adjust events / hitboxes.
6. Copy the JSON output.

Default events are created from `hit/*` animationclips. For example, Brandish
has `hit/0` and `hit/1`, so the tool creates two events by default.

New events start with zero hitboxes. Click `Add Box`, then drag on the canvas
to draw a new hitbox. Click an existing hitbox to select it, drag a corner
handle to resize it, or click `Delete Box` to remove the selected hitbox.
Click the canvas background to clear the box selection.

For projectile skills, open `Event Info`, set `Action Mode` to `Projectile`,
enter the projectile sprite RUID and movement values, then click
`Edit Projectile Hitbox`. Projectile mode edits one dedicated rectangle stored
as `projectileHitbox`; it does not write into the normal event `hitboxes` array.

## JSON Output

The copied JSON uses this wrapper:

```json
{
  "schema_name": "waness_skill_data",
  "tables": {}
}
```

The tool fills `skills`, `effects`, `events`, `area_target_captures`,
`rect_hitboxes`, `actions`, `damage_actions`, and, for projectile events,
`projectile_spawn_actions`. Unused schema tables are included as empty arrays so
the downstream CSV agent can map them directly.

Area target event defaults:

- `event_type`: `범위 대상포착`
- `target`: `적군`
- `action_type`: `피해`
- `required_context`: `시전자|대상`
- `damageRate` `1` becomes `attack_power_coefficient_percent` `100`

Projectile event mapping:

- The authored event becomes `event_type: "액션 실행"` and runs
  `${eventId}_projectile_spawn`.
- `projectile_spawn_actions.id` is `${eventId}_projectile_spawn`.
- `projectile_spawn_actions.projectile_hitbox_id` points to
  `${eventId}_projectile_hitbox`.
- The projectile hitbox is written to `rect_hitboxes` with
  `offset_x = rightXpx`, `offset_y = bottomYpx`, `width = widthPx`, and
  `height = heightPx`.
- A collision event `${eventId}_projectile_collision` is generated
  automatically and referenced only through
  `projectile_spawn_actions.collision_event_ids`.
- `expire_event_ids` is left blank in v1.

## RUID Frame Loading

For an `animationclip` RUID, the tool calls the public MSW resource detail API:

`https://maplestoryworlds-resourcesearch-new.nexon.com/api/v3/resources/{ruid}`

The API returns each frame's `spriteRuid`, original `width` / `height`, and
`pivot`. Frame images are loaded from the public CDN as transparent PNGs:

`https://mod-resource-search-images.dn.nexoncdn.co.kr/maplestory_world/{spriteRuid}.png`

If the browser blocks the API or CDN in a future environment, keep this browser
tool for JSON editing and move the frame display path into MSW Maker with
`_ResourceService:LoadAnimationClipAndWait(ruid)` / `LoadSpriteAndWait(ruid)`.

Projectile sprite RUID loading uses the same resource detail API. If detail
metadata exposes original `width` / `height` / `pivot`, the editor applies them
automatically. If detail loading fails, the tool still fills the CDN image URL so
you can use manual image size and pivot inputs.

The tool does not write directly to MSW dataset files. It produces JSON text for
copying into the downstream schema-to-CSV agent.

## Coordinate Rules

- Stored unit: pixels.
- Canvas size is fixed at `1000 x 1000`.
- The camera/origin marker is fixed at `(500, 500)`.
- Pivot X / Y are interpreted from the image's bottom-left origin.
- The image is drawn at `(500 - pivX, 500 - height + pivY)`.
- `rect_hitboxes.offset_x` is the box's `rightXpx`.
- `rect_hitboxes.offset_y` is the box's `bottomYpx`.
- Runtime conversion: `worldUnit = px * 0.01`.

Keyboard shortcuts:

- `Left` / `Up`: previous frame
- `Right` / `Down`: next frame
