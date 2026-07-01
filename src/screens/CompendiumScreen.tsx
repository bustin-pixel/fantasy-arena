/**
 * Compendium / Bestiary — placeholder for slice 1. Slice 2 fills this in: a
 * 3-tier reveal (Undiscovered → Encountered → Defeated) over every unit, backed
 * by a `bestiary` map in the save (v2) recorded on battle exit.
 */
export function CompendiumScreen() {
  return (
    <div className="screen compendium">
      <header className="hub-header">
        <div>
          <h1 className="title">Compendium</h1>
          <p className="subtitle">Bestiary &amp; unit lore</p>
        </div>
      </header>

      <div className="coming-soon">
        <div className="coming-soon-icon" aria-hidden>
          📖
        </div>
        <p>
          Face a unit in battle to reveal it here — defeat one to unlock its full
          stats, abilities, and lore.
        </p>
        <span className="coming-soon-tag">Coming soon</span>
      </div>
    </div>
  );
}
