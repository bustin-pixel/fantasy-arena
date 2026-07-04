// ============================================================================
// Economy data — every tunable number in the meta-layer economy lives here.
// Pure data: imports only from data/ (never from state/ or engine/), so the
// persistence layer and the rewards module can both read it without cycles.
// ============================================================================

/** Units a brand-new save starts with. Grandfathered saves (version < 3)
 *  instead unlock everything that existed at migration time. */
export const STARTER_UNIT_IDS = [
  "ogre",
  "archer",
  "knight",
  "fire_mage",
] as const;
