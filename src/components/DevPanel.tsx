// DevPanel — a LOCAL-ONLY playtest cheat sheet (unlock units, grant currency,
// reset the save). App mounts it only under `import.meta.env.DEV`, and every
// action lives behind the same gate in GameStateContext (`dev` is undefined in
// production). So in the deployed Netlify build this whole module tree-shakes
// away and nothing here can touch the live game.
import { useState, type CSSProperties } from "react";
import { useGameState } from "@/state/GameStateContext";
import { GameIcon } from "@/components/icons/GameIcon";

const wrap: CSSProperties = {
  position: "fixed",
  left: 10,
  bottom: 10,
  zIndex: 99999,
  fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
  fontSize: 12,
};

const panel: CSSProperties = {
  marginBottom: 8,
  padding: "10px 12px",
  width: 190,
  background: "rgba(17, 17, 24, 0.94)",
  border: "1px solid #6d28d9",
  borderRadius: 8,
  boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
  color: "#e5e7eb",
  display: "flex",
  flexDirection: "column",
  gap: 6,
};

const btn: CSSProperties = {
  padding: "6px 8px",
  background: "#312e81",
  border: "1px solid #6d28d9",
  borderRadius: 5,
  color: "#ede9fe",
  cursor: "pointer",
  textAlign: "left",
};

const fab: CSSProperties = {
  padding: "6px 10px",
  background: "#6d28d9",
  border: "1px solid #a78bfa",
  borderRadius: 6,
  color: "#fff",
  cursor: "pointer",
  boxShadow: "0 3px 10px rgba(0,0,0,0.5)",
};

export function DevPanel() {
  const { save, dev } = useGameState();
  const [open, setOpen] = useState(false);

  // Belt-and-braces: even if this ever rendered in a prod build, the cheats
  // wouldn't exist. (It won't — App gates the mount on import.meta.env.DEV.)
  if (!dev) return null;

  return (
    <div style={wrap}>
      {open && (
        <div style={panel}>
          <div style={{ fontWeight: 700, color: "#c4b5fd", letterSpacing: 0.5 }}>
            <GameIcon name="dev" /> DEV — local only
          </div>
          <div style={{ opacity: 0.8 }}>
            {save.gold}g · {save.soulShards}
            <GameIcon name="shard" /> · {save.unlockedUnits.length} units
            · {Object.keys(save.items).length} items
          </div>
          <button style={btn} onClick={dev.unlockAllUnits}>
            Unlock all units
          </button>
          <button style={btn} onClick={() => dev.addGold(5000)}>
            +5000 gold
          </button>
          <button style={btn} onClick={() => dev.addShards(100)}>
            +100 shards
          </button>
          <button style={btn} onClick={dev.unlockAllDungeons}>
            Unlock all dungeons
          </button>
          <button style={btn} onClick={dev.revealBestiary}>
            Reveal full bestiary
          </button>
          <button style={btn} onClick={dev.grantAllItems}>
            Grant all items
          </button>
          <button
            style={{ ...btn, borderColor: "#b91c1c", background: "#451a1a" }}
            onClick={() => {
              if (
                window.confirm("Reset the save to a brand-new account? This wipes local progress.")
              ) {
                dev.resetSave();
              }
            }}
          >
            Reset save
          </button>
        </div>
      )}
      <button style={fab} onClick={() => setOpen((o) => !o)}>
        {open ? (
          "✕ dev"
        ) : (
          <>
            <GameIcon name="dev" /> dev
          </>
        )}
      </button>
    </div>
  );
}
