import type { InspectedUnit } from "@/hooks/useBattleEngine";
import { RARITIES } from "@/data/rarities";
import { FIELD_HEIGHT, FIELD_WIDTH } from "@/utils/constants";
import { clamp } from "@/utils/math";

const EFFECT_LABELS: Record<string, string> = {
  burn: "Burning",
  slow: "Slowed",
  stun: "Stunned",
  shield: "Shielded",
  haste: "Hastened",
  poison: "Poisoned",
  silence: "Silenced",
  stealth: "Hidden",
  death_immune: "Undying",
  taunt: "Taunted",
  fear: "Feared",
};

/** A small overlay tooltip pinned by a battlefield unit, showing live stats. */
export function BattleUnitTip({
  unit,
  onClose,
}: {
  unit: InspectedUnit;
  onClose: () => void;
}) {
  const rarity = RARITIES[unit.rarity];
  const hpPct = Math.max(0, Math.min(100, (unit.hp / unit.maxHp) * 100));
  const leftPct = clamp((unit.pos.x / FIELD_WIDTH) * 100, 20, 80);
  const topPct = (unit.pos.y / FIELD_HEIGHT) * 100;
  // Flip below the unit when it's near the top so it doesn't clip off-screen.
  const below = unit.pos.y < FIELD_HEIGHT * 0.34;
  const rangeLabel = unit.range <= 80 ? "Melee" : "Ranged";
  const effects = unit.effects.map((e) => EFFECT_LABELS[e] ?? e);

  return (
    <div
      className="unit-tip"
      style={{
        left: `${leftPct}%`,
        top: `${topPct}%`,
        transform: `translate(-50%, ${below ? "26px" : "calc(-100% - 26px)"})`,
        borderColor: rarity.color,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="unit-tip-close" onClick={onClose} aria-label="Close">
        ✕
      </button>
      <div className="unit-tip-head">
        <span className="unit-tip-name" style={{ color: rarity.color }}>
          {unit.name}
        </span>
        <span className={`unit-tip-team ${unit.team}`}>
          {unit.team === "player" ? "You" : "Enemy"}
        </span>
      </div>
      <div className="unit-tip-hpbar">
        <div className="unit-tip-hpfill" style={{ width: `${hpPct}%` }} />
      </div>
      <div className="unit-tip-hpval">
        {unit.hp} / {unit.maxHp} HP
      </div>
      <div className="unit-tip-stats">
        DMG {unit.damage} · ATK {unit.attackSpeed.toFixed(1)}s · {rangeLabel}
      </div>
      <div className="unit-tip-ability">✦ {unit.abilityName}</div>
      {unit.traits.map((t) => (
        <div className="unit-tip-trait" key={t}>
          ◇ {t}
        </div>
      ))}
      {effects.length > 0 && (
        <div className="unit-tip-effects">{effects.join(" · ")}</div>
      )}
    </div>
  );
}
