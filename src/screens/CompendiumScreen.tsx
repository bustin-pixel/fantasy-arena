import { useEffect, useMemo, useRef, useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { DECKABLE_UNIT_IDS, getUnitDef } from "@/data/units";
import { DEPTHS_TIERS } from "@/data/depths";
import { RARITIES } from "@/data/rarities";
import { renderPortrait } from "@/engine/Renderer";
import { UnitDetail } from "@/components/UnitDetail";
import type { BestiaryEntry } from "@/state/persistence";

/**
 * Compendium / Bestiary — the 3-tier reveal over every hero and Depths monster:
 *   Undiscovered (dark silhouette + ???) → Encountered (named silhouette) →
 *   Defeated (full art; tap for the complete lore page).
 * Backed by the save's `bestiary` map, recorded on battle end by BattleScreen.
 */

type RevealTier = "undiscovered" | "encountered" | "defeated";

function tierOf(entry: BestiaryEntry | undefined): RevealTier {
  if (entry?.defeated) return "defeated";
  if (entry?.encountered) return "encountered";
  return "undiscovered";
}

/** Silhouette fills for the two hidden tiers (drawn over the card art bg). */
const SILHOUETTE: Record<Exclude<RevealTier, "defeated">, string> = {
  undiscovered: "#0d0b08",
  encountered: "#4a4438",
};

/** The Depths bestiary roster, in tier order: each tier's monsters then its
 *  boss. Grows automatically as later tiers land in data/depths.ts. */
const MONSTER_IDS: string[] = (() => {
  const out: string[] = [];
  for (const tier of DEPTHS_TIERS) {
    for (const id of Object.keys(tier.monsters)) {
      if (!out.includes(id)) out.push(id);
    }
    if (!out.includes(tier.boss)) out.push(tier.boss);
  }
  return out;
})();

const ART = 96;

function CompendiumCard({
  defId,
  tier,
  onOpen,
}: {
  defId: string;
  tier: RevealTier;
  onOpen: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = getUnitDef(defId);
  const rarity = RARITIES[def.rarity];
  const revealed = tier === "defeated";

  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    renderPortrait(ctx, defId, ART, revealed ? undefined : { silhouette: SILHOUETTE[tier] });
  }, [defId, tier, revealed]);

  return (
    <button
      type="button"
      className={`comp-card ${tier}`}
      style={{ borderColor: revealed ? rarity.color : "#3a3126" }}
      onClick={revealed ? onOpen : undefined}
      disabled={!revealed}
      aria-label={
        revealed
          ? `${def.name} — view lore`
          : tier === "encountered"
          ? `${def.name} — defeat one to unlock`
          : "Undiscovered"
      }
    >
      <canvas ref={ref} width={ART} height={ART} className="card-canvas" />
      <span className="card-name">
        {tier === "undiscovered" ? "???" : def.name}
      </span>
      {revealed ? (
        <span className="card-rarity" style={{ color: rarity.color }}>
          {rarity.label}
        </span>
      ) : (
        <span className="comp-hint-tag">
          {tier === "encountered" ? "Sighted" : "Unknown"}
        </span>
      )}
    </button>
  );
}

function Section({
  title,
  sub,
  ids,
  bestiary,
  onOpen,
}: {
  title: string;
  sub: string;
  ids: string[];
  bestiary: Record<string, BestiaryEntry>;
  onOpen: (id: string) => void;
}) {
  const slain = ids.filter((id) => bestiary[id]?.defeated).length;
  return (
    <section className="comp-section">
      <div className="comp-section-head">
        <h2 className="comp-section-title">{title}</h2>
        <span className="comp-section-count">
          {slain}/{ids.length} defeated
        </span>
      </div>
      <p className="comp-section-sub">{sub}</p>
      <div className="card-grid">
        {ids.map((id) => (
          <CompendiumCard
            key={id}
            defId={id}
            tier={tierOf(bestiary[id])}
            onOpen={() => onOpen(id)}
          />
        ))}
      </div>
    </section>
  );
}

export function CompendiumScreen() {
  const { save } = useGameState();
  const [openId, setOpenId] = useState<string | null>(null);

  const heroes = useMemo(() => DECKABLE_UNIT_IDS, []);

  return (
    <div className="screen compendium">
      <header className="hub-header">
        <div>
          <h1 className="title">Compendium</h1>
          <p className="subtitle">Bestiary &amp; unit lore</p>
        </div>
      </header>

      <Section
        title="Monsters of the Depths"
        sub="Horrors from below. Face one to sight it; slay one to record its lore."
        ids={MONSTER_IDS}
        bestiary={save.bestiary}
        onOpen={setOpenId}
      />

      <Section
        title="Heroes of the Arena"
        sub="Rival champions. Defeat them in the Arena to complete their pages."
        ids={heroes}
        bestiary={save.bestiary}
        onOpen={setOpenId}
      />

      {openId && (
        <UnitDetail
          defId={openId}
          deck={save.deck}
          onToggle={() => {}}
          onClose={() => setOpenId(null)}
          readonly
        />
      )}
    </div>
  );
}
