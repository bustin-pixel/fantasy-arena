// ============================================================================
// ShopScreen — Grubbins' Pawn-Den. A full-screen App view (the BattleScreen
// pattern, not a sheet): animated shopkeeper set piece up top, the daily
// shelf + premium stub below.
//
// The shelf is DERIVED every render from (todayIdx, rerolls) via meta/shop —
// never stored — so what you see is exactly what the purchase fold re-derives.
// All mutations go through the context's pure folds; this component only
// routes taps, plays sounds, and makes the goblin emote.
// ============================================================================

import { useEffect, useMemo, useRef, useState } from "react";
import { useGameState } from "@/state/GameStateContext";
import { GrubbinsScene, SCENE_ASPECT } from "@/components/GrubbinsScene";
import { GrubbinsPixelScene } from "@/components/GrubbinsPixelScene";
import { getSettings, subscribeSettings } from "@/state/settings";
import { GoldPill, ShardPill } from "@/components/CurrencyPills";
import { ItemIcon } from "@/components/ItemIcon";
import { describeItemKey, ITEM_LINES, makeItemKey } from "@/data/items";
import { RARITIES } from "@/data/rarities";
import { getUnitDef } from "@/data/units";
import {
  dayIndexLocal,
  normalizeShopDay,
  rollDailyStock,
} from "@/meta/shop";
import {
  SHOP_PREMIUM_PACKS,
  SHOP_REROLL_COST,
  SHOP_REROLLS_PER_DAY,
} from "@/meta/economy";
import { GameIcon } from "@/components/icons/GameIcon";
import { playSfx, type SfxKey } from "@/audio/sfx";

interface Props {
  onExit: () => void;
}

/** Grubbins' canned lines, cycled per kind so repeat visits vary a little. */
const BARKS = {
  greet: [
    "Grubbins acquires. Grubbins provides.",
    "Fresh stock! Barely cursed.",
    "Ahh… a customer with pockets.",
  ],
  purchase: [
    "Pleasure doin' business.",
    "Sold! No refunds. Ever.",
    "A fine choice… for one of us.",
  ],
  broke: [
    "Your purse says otherwise, friend.",
    "Come back with more shine.",
  ],
  soldOut: ["Already sold ya that one."],
  inspect: [
    "Aha, an eye for quality!",
    "That one? Barely haunted.",
    "Genuine! Mostly.",
    "Go on, have a squint. Lookin's free.",
  ],
  mint: [
    "Mint's closed, friend. Come back when the smelter's lit.",
    "Real coin? Heh. Grubbins wishes.",
  ],
  reroll: ["New junk— er, treasures!"],
} as const;
type BarkKind = keyof typeof BARKS;

const BARK_MS = 2600;

/** Gibberish mumble per bark mood — Grubbins "speaks" every bubble. */
const BARK_VOICE: Record<BarkKind, SfxKey> = {
  greet: "grubbinsGreet",
  purchase: "grubbinsHappy",
  broke: "grubbinsSad",
  soldOut: "grubbinsNeutral",
  inspect: "grubbinsNeutral",
  mint: "grubbinsHappy",
  reroll: "grubbinsHappy",
};

export function ShopScreen({ onExit }: Props) {
  const { save, visitShop, purchaseShopItem, rerollShop } = useGameState();

  // Today's shelf, derived exactly like the purchase fold derives it.
  const todayIdx = dayIndexLocal();
  const shopView = normalizeShopDay(save.shop, todayIdx);
  const stock = useMemo(
    () => rollDailyStock(todayIdx, shopView.rerolls),
    [todayIdx, shopView.rerolls]
  );

  // Grubbins' speech bubble + pleased reaction.
  const [bark, setBark] = useState<{ text: string; nonce: number } | null>(null);
  const [reactNonce, setReactNonce] = useState(0);

  // Which Grubbins. The SAME Settings → Visuals → "Pixel sprites" flag that
  // swaps the unit roster swaps the shopkeeper, so the original hand-built
  // PixiJS scene stays reachable instead of being replaced. Both components
  // take the same props and share SCENE_ASPECT, so the sizing below is
  // untouched either way. (This one screen can't use `useSpriteEpoch` — that
  // counter also fires on sprite DECODE, which would remount the scene mid-
  // animation; here only the flag itself matters.)
  const [pixelArt, setPixelArt] = useState(() => getSettings().pixelArt);
  useEffect(() => subscribeSettings((s) => setPixelArt(s.pixelArt)), []);
  const barkCounts = useRef<Partial<Record<BarkKind, number>>>({});
  const barkTimer = useRef<number | null>(null);
  const say = (kind: BarkKind) => {
    const n = barkCounts.current[kind] ?? 0;
    barkCounts.current[kind] = n + 1;
    const lines = BARKS[kind];
    setBark((b) => ({ text: lines[n % lines.length], nonce: (b?.nonce ?? 0) + 1 }));
    // A little rate jitter so repeat barks don't sound stamped out.
    playSfx(BARK_VOICE[kind], 0.95 + Math.random() * 0.1);
    if (barkTimer.current !== null) window.clearTimeout(barkTimer.current);
    barkTimer.current = window.setTimeout(() => setBark(null), BARK_MS);
  };

  // Entering the den: roll the day forward (clears the Home FAB pip) + greet.
  useEffect(() => {
    visitShop(dayIndexLocal());
    const tm = window.setTimeout(() => say("greet"), 450);
    return () => {
      window.clearTimeout(tm);
      if (barkTimer.current !== null) window.clearTimeout(barkTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Slot index of the item whose detail panel is open (null = closed).
  const [inspect, setInspect] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape peels one layer: the detail panel first, then the shop itself.
      setInspect((cur) => {
        if (cur === null) onExit();
        return null;
      });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onExit]);

  // Scene sizing: fill the column width when there's room, but SHRINK (kept
  // centered, aspect fixed) so the whole shop — shelf AND premium vault —
  // fits the viewport without scrolling. Width derives from the height left
  // over after the body content; refs are stable so the resize closure can't
  // go stale.
  const wrapRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [sceneW, setSceneW] = useState(0);
  const measure = () => {
    const wrapW = wrapRef.current?.clientWidth ?? 0;
    const bodyH = bodyRef.current?.offsetHeight ?? 0;
    // -6: the scene wrap's bottom border + canvas height rounding, so the
    // fit is exact instead of 'one FAB-height of scroll'.
    const availH = Math.max(150, window.innerHeight - bodyH - 6);
    const target = Math.min(wrapW, Math.floor(availH * SCENE_ASPECT));
    setSceneW((w) => (Math.abs(w - target) > 1 ? target : w));
  };
  useEffect(() => {
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Re-measure after every render: sold states / note text can rewrap and
  // change the body height by a line.
  useEffect(measure);

  // Brief pop on the card that just sold.
  const [justBought, setJustBought] = useState<number | null>(null);
  useEffect(() => {
    if (justBought === null) return;
    const tm = window.setTimeout(() => setJustBought(null), 650);
    return () => window.clearTimeout(tm);
  }, [justBought]);

  const buy = (slotIdx: number) => {
    const idx = dayIndexLocal();
    const view = normalizeShopDay(save.shop, idx);
    const offer = rollDailyStock(idx, view.rerolls)[slotIdx];
    if (view.bought.includes(slotIdx)) {
      playSfx("uiDeny");
      say("soldOut");
      return;
    }
    if (save.gold < offer.price) {
      playSfx("uiDeny");
      say("broke");
      return;
    }
    purchaseShopItem(idx, slotIdx);
    playSfx("coinSpend");
    playSfx("itemReveal");
    setReactNonce((n) => n + 1);
    setJustBought(slotIdx);
    say("purchase");
    // Close the detail panel so the sold-card pop and Grubbins' reaction show.
    setInspect(null);
  };

  const openInspect = (slotIdx: number) => {
    playSfx("uiOpen");
    setInspect(slotIdx);
    // One sales-patter line on the FIRST inspect of a visit — window-shopping
    // gets flavor without Grubbins yammering at every single tap.
    if (!barkCounts.current.inspect) say("inspect");
  };

  const rerollUsed = shopView.rerolls >= SHOP_REROLLS_PER_DAY;
  const rerollBlocked =
    rerollUsed || shopView.bought.length > 0 || save.gold < SHOP_REROLL_COST;
  const rerollNote = rerollUsed
    ? "Grubbins restocks once a day."
    : shopView.bought.length > 0
      ? "No re-rolls after a purchase."
      : save.gold < SHOP_REROLL_COST
        ? "Not enough gold to re-roll."
        : "Re-rolls the whole shelf.";

  const reroll = () => {
    if (rerollBlocked) return;
    rerollShop(dayIndexLocal());
    playSfx("coinSpend");
    say("reroll");
  };

  return (
    <div className="shop-screen">
      <div className="shop-scene-wrap" ref={wrapRef}>
        {sceneW > 0 &&
          (pixelArt ? (
            <GrubbinsPixelScene width={sceneW} reactNonce={reactNonce} />
          ) : (
            <GrubbinsScene width={sceneW} reactNonce={reactNonce} />
          ))}
        <div className="shop-header">
          <button
            type="button"
            className="shop-back"
            onClick={() => { playSfx("uiClose"); onExit(); }}
            aria-label="Back to Home"
          >
            ← Home
          </button>
          <div className="shop-pills">
            <ShardPill />
            <GoldPill />
          </div>
        </div>
        {bark && (
          <div key={bark.nonce} className="shop-bark" role="status">
            {bark.text}
          </div>
        )}
        <h1 className="shop-title">Grubbins&rsquo; Pawn-Den</h1>
      </div>

      <div className="shop-body" ref={bodyRef}>
        <div className="shop-shelf-head">
          <h2 className="shop-shelf-title">Today&rsquo;s Shelf</h2>
          <button
            type="button"
            className="shop-reroll"
            disabled={rerollBlocked}
            onClick={reroll}
            title={rerollNote}
          >
            ⟳ Reroll · <GameIcon name="gold" /> {SHOP_REROLL_COST}
          </button>
        </div>
        <p className="shop-note">{rerollNote} New stock at midnight.</p>

        <div className="shop-grid">
          {stock.map((offer) => {
            const sold = shopView.bought.includes(offer.slotIdx);
            const key = makeItemKey(offer.lineId, offer.quality, 1);
            const line = ITEM_LINES[offer.lineId];
            const cant = !sold && save.gold < offer.price;
            const qColor = RARITIES[offer.quality].color;
            return (
              <button
                key={offer.slotIdx}
                type="button"
                className={`shop-card${sold ? " sold" : ""}${
                  justBought === offer.slotIdx ? " just-bought" : ""
                }`}
                style={{ borderColor: qColor }}
                onClick={() => openInspect(offer.slotIdx)}
                aria-label={
                  sold
                    ? `${line.name} — sold (tap to view)`
                    : `View ${line.name} — ${offer.price} gold`
                }
              >
                <ItemIcon itemKey={key} size={38} hideStars />
                <span className="shop-card-name">{line.name}</span>
                <span className="shop-card-sub" style={{ color: qColor }}>
                  {offer.quality} {offer.slot}
                </span>
                <span className={`shop-card-price${cant ? " cant" : ""}`}>
                  <GameIcon name="gold" /> {offer.price}
                </span>
                {sold && <span className="shop-sold-stamp">SOLD</span>}
              </button>
            );
          })}
        </div>

        {inspect !== null &&
          (() => {
            // Re-derive the offer exactly like buy() does — the panel can never
            // disagree with what a purchase would actually grant.
            const offer = stock[inspect];
            if (!offer) return null;
            const line = ITEM_LINES[offer.lineId];
            const key = makeItemKey(offer.lineId, offer.quality, 1);
            const rarity = RARITIES[offer.quality];
            const sold = shopView.bought.includes(offer.slotIdx);
            const cant = save.gold < offer.price;
            const owned = save.items[key] ?? 0;
            const holders = Object.keys(save.loadouts).filter((id) => {
              const l = save.loadouts[id];
              return l.weapon === key || l.armor === key || l.trinket === key;
            });
            return (
              <div
                className="shop-detail-overlay"
                onClick={() => setInspect(null)}
              >
                <div
                  className="shop-detail"
                  style={{ borderColor: rarity.color }}
                  role="dialog"
                  aria-label={`${line.name} details`}
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="shop-detail-head">
                    <ItemIcon itemKey={key} size={56} hideStars />
                    <div className="shop-detail-title">
                      <span
                        className="shop-detail-name"
                        style={{ color: rarity.color }}
                      >
                        {line.name}
                      </span>
                      <span className="shop-detail-tier">
                        {rarity.label} {offer.slot}
                        {line.dungeonId && " · dungeon relic"}
                      </span>
                      <span className="shop-detail-owned">
                        {owned > 0 ? `Owned ×${owned}` : "Not owned yet"}
                        {holders.length > 0 &&
                          ` · worn by ${holders
                            .map((id) => getUnitDef(id).name)
                            .join(", ")}`}
                      </span>
                    </div>
                  </div>
                  <p className="shop-detail-desc">{line.desc}</p>
                  <ul className="shop-detail-effects">
                    {describeItemKey(key).map((l) => (
                      <li key={l}>{l}</li>
                    ))}
                  </ul>
                  <div className="shop-detail-actions">
                    <button
                      type="button"
                      className="btn shop-detail-close"
                      onClick={() => setInspect(null)}
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      className={`btn btn-gold shop-detail-buy${
                        cant && !sold ? " cant" : ""
                      }`}
                      disabled={sold}
                      onClick={() => buy(offer.slotIdx)}
                    >
                      {sold ? (
                        "SOLD"
                      ) : (
                        <>
                          Buy — <GameIcon name="gold" /> {offer.price}
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}

        <h2 className="shop-shelf-title shop-premium-title">Premium Vault</h2>
        <p className="shop-note">
          Soul Shards &amp; gold, for real coin — the mint isn&rsquo;t open yet.
        </p>
        <div className="shop-grid shop-premium-grid">
          {SHOP_PREMIUM_PACKS.map((pack) => (
            <button
              key={pack.id}
              type="button"
              className="shop-card shop-pack"
              onClick={() => say("mint")}
              aria-label={`${pack.label} — coming soon`}
            >
              <span
                className={`shop-pack-icon ${
                  pack.kind === "shards" ? "shards" : "gold"
                }`}
                aria-hidden
              >
                <GameIcon name={pack.kind === "shards" ? "shard" : "gold"} />
              </span>
              <span className="shop-card-name">{pack.label}</span>
              <span className="shop-card-sub">
                {pack.amount.toLocaleString()}{" "}
                {pack.kind === "shards" ? "shards" : "gold"}
              </span>
              <span className="shop-ribbon">Coming soon</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
