import { useEffect, useRef, useState } from "react";
import type { ItemLoadouts } from "@/types";
import { useBattleEngine, type BattleMode } from "@/hooks/useBattleEngine";
import { BattleHud, BattleTopBar } from "@/components/BattleHud";
import { BattleUnitTip } from "@/components/BattleUnitTip";
import { BoonPickOverlay, rarityColor } from "@/components/BoonPickOverlay";
import { CardTray } from "@/components/CardTray";
import {
  FIELD_HEIGHT,
  FIELD_WIDTH,
  PLAYER_ZONE,
  fieldTransform,
} from "@/utils/constants";
import { clamp } from "@/utils/math";
import { useGameState } from "@/state/GameStateContext";
import { endlessBestWave, highestClearedFloorOf } from "@/state/persistence";
import { computeBattleRewards, type BattleRewards } from "@/meta/rewards";
import { addXp, levelFromXp } from "@/meta/leveling";
import { RewardPanel } from "@/components/RewardPanel";
import { generateSeed } from "@/utils/rng";
import { playStinger, setMusicTrack } from "@/audio/music";
import { playSfx } from "@/audio/sfx";

interface Props {
  deck: string[];
  onExit: () => void;
  /** Solo allows fast-forward; PVP hides it and locks the sim to 1×. */
  mode?: BattleMode;
  /** Depths floor being descended (ignored outside "depths"). */
  floor?: number;
  /** Which dungeon is being descended (ignored outside "depths"). */
  dungeonId?: string;
}

export function BattleScreen({
  deck,
  onExit,
  mode = "solo",
  floor = 1,
  dungeonId = "depths",
}: Props) {
  const { save, recordResult, recordBestiary, grantBattleRewards } =
    useGameState();
  // Frozen at mount (useState initializers): the pre-battle XP snapshot and
  // the level map the match runs at. MUST NOT re-derive from live `save` —
  // the post-battle XP grant would change them and re-create the match under
  // the results screen. xpAtStart also feeds the RewardPanel's bar animation.
  const [xpAtStart] = useState<Record<string, number>>(() =>
    Object.fromEntries(deck.map((id) => [id, save.unitXp[id] ?? 0]))
  );
  const [unitLevels] = useState<Record<string, number>>(() =>
    Object.fromEntries(deck.map((id) => [id, levelFromXp(save.unitXp[id] ?? 0)]))
  );
  // Equipped items, frozen at mount like unitLevels — a match input. Only the
  // fielded deck's entries matter; the sim resolves + bakes them at deploy.
  const [itemLoadouts] = useState<ItemLoadouts>(() =>
    Object.fromEntries(
      deck.filter((id) => save.loadouts[id]).map((id) => [id, save.loadouts[id]])
    )
  );
  const {
    canvasRef,
    ui,
    deployAt,
    selectCard,
    speed,
    setSpeed,
    pickUnitAt,
    inspectUnit,
    enemyLedger,
    pickBoon,
    retireEndless,
    wavesSurvived,
  } = useBattleEngine(
    deck,
    mode,
    undefined,
    floor,
    dungeonId,
    unitLevels,
    itemLoadouts
  );
  const wrapRef = useRef<HTMLDivElement>(null);
  const recordedRef = useRef(false);
  // Timestamp of the last touch, to suppress the synthetic click a touchscreen
  // fires right after a tap (which would otherwise deploy a second unit).
  const lastTouchRef = useRef(0);
  const [showResult, setShowResult] = useState(false);
  // The reward bundle for the overlay. Set once, alongside the grant.
  const [rewards, setRewards] = useState<BattleRewards | null>(null);
  // Endless: waves cleared this run, captured for the results screen.
  const [endlessWaves, setEndlessWaves] = useState(0);
  // Endless: the pre-run best, frozen at mount — the post-battle grant updates
  // the save, so reading it live would always show this run as the best.
  const [bestAtStart] = useState(() => endlessBestWave(save));
  // Endless: the player chose to retire (bank + end) rather than fight on.
  // Ref for the record-once effect (stinger choice), state for the result copy.
  const retiredRef = useRef(false);
  const [retired, setRetired] = useState(false);
  // uid of the unit whose stat tooltip is open (tap a combatant to inspect).
  const [inspectedUid, setInspectedUid] = useState<string | null>(null);

  // Re-read live every render (~6/s on the throttled ui sync) so HP/effects and
  // the unit's position stay current; clears itself when the unit dies.
  const inspected = inspectedUid ? inspectUnit(inspectedUid) : null;

  // Size the render buffer to the field box's ASPECT (not a fixed 480×720), so
  // the arena fills it edge-to-edge instead of leaving black letterbox bars.
  // Height stays FIELD_HEIGHT (constant vertical resolution); width tracks the
  // box. The renderer re-centers the 480×720 world inside this wider buffer,
  // and handleTap/BattleUnitTip invert the same transform. See fieldTransform.
  useEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    const apply = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) return;
      const w = Math.max(1, Math.round(FIELD_HEIGHT * (r.width / r.height)));
      // Assigning canvas.width clears the canvas, so only touch it on a real
      // change (the rAF loop repaints every frame regardless).
      if (canvas.width !== w) canvas.width = w;
      if (canvas.height !== FIELD_HEIGHT) canvas.height = FIELD_HEIGHT;
    };
    apply();
    const ro = new ResizeObserver(apply);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [canvasRef]);

  // Record win/loss + Compendium reveals + rewards once when the match
  // resolves. The bestiary and rewards read the final field from the meta
  // layer — the sim never knows. recordedRef makes this exactly-once (the
  // grant re-renders via save, and StrictMode re-runs effects in dev).
  useEffect(() => {
    const outcome =
      ui.phase === "victory" || ui.phase === "defeat" || ui.phase === "draw"
        ? ui.phase
        : null;
    if (outcome && !recordedRef.current) {
      recordedRef.current = true;
      const isEndless = mode === "endless";
      const survived = isEndless ? wavesSurvived() : 0;
      if (isEndless) setEndlessWaves(survived);
      // The battle track ends with the battle: victory/defeat play a one-shot
      // stinger over its fade-out; a draw just falls silent. The hub theme
      // returns via App's view effect when the player exits.
      // A retirement resolves as "defeat" in the sim but is a banked win to the
      // player — give it the victory fanfare.
      if (outcome === "victory" || (isEndless && retiredRef.current)) {
        playStinger("victory");
      } else if (outcome === "defeat") playStinger("defeat");
      else setMusicTrack(null);
      // Endless runs are a survival score, not a win/loss — don't touch the W/L
      // tally (every run "ends" in a wipe).
      if (!isEndless) {
        if (outcome === "victory") recordResult(true);
        else if (outcome === "defeat") recordResult(false);
      }
      const { seen, slain } = enemyLedger();
      recordBestiary(seen, slain);
      // Grant-then-reveal: rewards are rolled (drop-time seed) and committed
      // to the save NOW; the overlay's chest ceremony is pure presentation,
      // so leaving early can't lose anything.
      const bundle = computeBattleRewards({
        mode,
        floor,
        dungeonId,
        outcome,
        unlockedUnits: save.unlockedUnits,
        highestClearedFloor: highestClearedFloorOf(save, dungeonId),
        chestSeed: generateSeed(),
        // Rare-spawn quest check: the fielded warband + which enemies died.
        deck,
        slain,
        questUnlocks: save.questUnlocks,
        wavesSurvived: survived,
        bestWave: endlessBestWave(save),
        itemLoadouts, // Lucky Coin: gold boost + seeded chest-tier upgrade
        itemPity: save.itemPity, // dry-streak insurance — forces the item roll at the threshold
      });
      grantBattleRewards(bundle, {
        mode,
        floor,
        dungeonId,
        wavesSurvived: survived,
        deck,
        // Quest-board progress facts (accepted quests tick in the grant fold).
        outcome,
        slain,
      });
      setRewards(bundle);
      setTimeout(() => setShowResult(true), 700);
    }
  }, [
    ui.phase,
    recordResult,
    recordBestiary,
    enemyLedger,
    grantBattleRewards,
    wavesSurvived,
    mode,
    floor,
    dungeonId,
    save,
  ]);

  // A tap inspects a tapped unit (either team); on empty space it dismisses any
  // tooltip and deploys a reinforcement if a slot is open in the player zone.
  const handleTap = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    // Screen → buffer → world: the buffer is wider than the 480×720 world (the
    // arena fills the margins), so undo the renderer's centering transform.
    // Taps in the side margins clamp onto the field edge.
    const { scale, offsetX, offsetY } = fieldTransform(canvas.width, canvas.height);
    const bx = ((clientX - rect.left) / rect.width) * canvas.width;
    const by = ((clientY - rect.top) / rect.height) * canvas.height;
    const fx = clamp((bx - offsetX) / scale, 0, FIELD_WIDTH);
    const fy = clamp((by - offsetY) / scale, 0, FIELD_HEIGHT);

    const hitUid = pickUnitAt({ x: fx, y: fy });
    if (hitUid) {
      // Tapping the same unit again closes its tooltip; a different unit switches.
      setInspectedUid((prev) => (prev === hitUid ? null : hitUid));
      return;
    }
    setInspectedUid(null);
    if (ui.canDeploy && fy >= PLAYER_ZONE.top) {
      // Tap ack only — the observer's deploy thud voices the actual placement.
      playSfx("uiTap");
      deployAt({ x: fx, y: fy });
    }
  };

  // Endless: chime when a new intermission (boon offer) opens.
  const prevIntermissionWave = useRef<number | null>(null);
  useEffect(() => {
    const wave = ui.intermission?.wave ?? null;
    if (wave != null && wave !== prevIntermissionWave.current) playSfx("boonChime");
    prevIntermissionWave.current = wave;
  }, [ui.intermission]);

  return (
    <div className="screen battle">
      {/* Counter/timer bar sits ABOVE the field in normal flow so units at the
          map's top edge are never hidden under it. */}
      <BattleTopBar ui={ui} mode={mode} onExit={onExit} />
      <div className="field-wrap" ref={wrapRef}>
        <canvas
          ref={canvasRef}
          width={FIELD_WIDTH}
          height={FIELD_HEIGHT}
          className="field-canvas"
          onClick={(e) => {
            // Skip the synthetic click a touchscreen fires ~300ms after a tap,
            // so one tap deploys one unit (not two on the same spot).
            if (Date.now() - lastTouchRef.current < 600) return;
            handleTap(e.clientX, e.clientY);
          }}
          onTouchStart={(e) => {
            lastTouchRef.current = Date.now();
            const t = e.touches[0];
            if (t) handleTap(t.clientX, t.clientY);
          }}
        />
        <BattleHud ui={ui} speed={speed} onSpeed={setSpeed} mode={mode} />
        {inspected && (
          <BattleUnitTip
            unit={inspected}
            bufW={canvasRef.current?.width ?? FIELD_WIDTH}
            bufH={canvasRef.current?.height ?? FIELD_HEIGHT}
            onClose={() => setInspectedUid(null)}
          />
        )}
      </div>

      <CardTray
        hand={ui.hand}
        canDeploy={ui.canDeploy}
        onSelect={selectCard}
      />

      {/* Endless: the between-wave boon pick. The sim is frozen behind it.
          The phase guard matters for retirement: the controller stays in its
          intermission after a retire, but the match has resolved. */}
      {mode === "endless" && ui.phase === "battle" && ui.intermission && (
        <BoonPickOverlay
          wave={ui.intermission.wave}
          offers={ui.intermission.offers}
          boonsPicked={ui.boonsPicked}
          onPick={(i) => { playSfx("boonPick"); pickBoon(i); }}
          onRetire={() => {
            playSfx("retireBank");
            retiredRef.current = true;
            setRetired(true);
            retireEndless();
          }}
        />
      )}

      {showResult && (
        <div className="result-overlay">
          <div
            className={`result-card ${
              mode === "endless" ? (retired ? "victory" : "defeat") : ui.phase
            }`}
          >
            {mode === "endless" ? (
              <>
                <h2>{retired ? "Run Complete" : "Run Over"}</h2>
                <p>
                  {retired ? (
                    <>
                      You banked your winnings after{" "}
                      <strong>{endlessWaves}</strong>{" "}
                      {endlessWaves === 1 ? "wave" : "waves"}.
                    </>
                  ) : (
                    <>
                      Your warband cleared <strong>{endlessWaves}</strong>{" "}
                      {endlessWaves === 1 ? "wave" : "waves"} and fell on wave{" "}
                      {endlessWaves + 1}.
                    </>
                  )}{" "}
                  Best: <strong>{Math.max(bestAtStart, endlessWaves)}</strong>
                </p>
                {ui.boonsPicked.length > 0 && (
                  <div className="boon-tally-chips result-boons">
                    {ui.boonsPicked.map((b) => (
                      <span
                        key={b.id}
                        className="boon-chip"
                        style={{ borderColor: rarityColor(b.rarity) }}
                      >
                        {b.name}
                        {b.count > 1 && <strong> ×{b.count}</strong>}
                      </span>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <>
                <h2>
                  {ui.phase === "victory"
                    ? "Victory"
                    : ui.phase === "defeat"
                    ? "Defeat"
                    : "Draw"}
                </h2>
                <p>
                  {ui.phase === "victory"
                    ? "Your warband stands triumphant."
                    : ui.phase === "defeat"
                    ? "Your warband has fallen."
                    : "Neither side could break the other."}
                </p>
              </>
            )}
            {rewards && (
              <RewardPanel
                rewards={rewards}
                floor={floor}
                mode={mode}
                // Grant-then-reveal: the save already holds the new XP; the
                // panel animates the frozen pre-grant snapshot forward with
                // the SAME addXp clamp, so the preview matches what persisted.
                xpGains={deck.map((id) => ({
                  defId: id,
                  before: xpAtStart[id] ?? 0,
                  after: addXp(xpAtStart[id] ?? 0, rewards.xp),
                }))}
              />
            )}
            <button className="btn btn-gold" onClick={onExit}>
              Return to Hub
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
