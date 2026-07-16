// ============================================================================
// ExitChoiceOverlay — the post-victory "which way deeper?" moment. Three glowing
// arrows at the field's edges (top, left, right), each showing an OMEN of what
// lies that way: a safe road, an ominous path (a tough encounter, richer loot),
// or glinting treasure. The pick sets the next floor's encounter; the warband
// files off-screen that way and the run descends.
//
// The omen shown is the arrow's own `omen`, NOT a read of its `kind` — a rare
// quarry wears its host arrow's omen so it can never be spotted coming (see
// encounters.assignOmens). Deriving the glyph from `kind` here would leak it.
// ============================================================================

import { playSfx } from "@/audio/sfx";
import type { OutroDir } from "@/hooks/OutroCinematic";
import { OMEN_META, type OmenArrow, type OmenDir } from "@/data/encounters";

interface Props {
  /** What each arrow shows + leads to (a rare quarry's omen is a disguise). */
  omens: Record<OmenDir, OmenArrow>;
  onChoose: (dir: OutroDir) => void;
}

const HEADING: Record<OutroDir, string> = {
  up: "Head north",
  left: "Head west",
  right: "Head east",
};

export function ExitChoiceOverlay({ omens, onChoose }: Props) {
  return (
    <div className="exit-choice" role="dialog" aria-label="Choose your path">
      <div className="exit-choice-banner">The band rests… choose a path onward</div>
      {(["up", "left", "right"] as const).map((dir) => {
        const omen = omens[dir].omen;
        const meta = OMEN_META[omen];
        return (
          <button
            key={dir}
            type="button"
            className={`exit-arrow ${dir} omen-${omen}`}
            aria-label={`${HEADING[dir]} — ${meta.label}`}
            title={meta.label}
            onClick={() => {
              playSfx("uiConfirm");
              onChoose(dir);
            }}
          >
            <span className="exit-arrow-chevron" aria-hidden />
            <span className="exit-arrow-omen" aria-hidden>
              {meta.glyph}
            </span>
          </button>
        );
      })}
    </div>
  );
}
