// Vines draping from the top corners of a page, framing the content. Rendered per
// page (each screen gets its own pair). Purely decorative — pointer-events are off
// via CSS so clicks/drags pass through to the page.

function VineCluster() {
  return (
    <>
      <g fill="none" stroke="#2c4423" strokeWidth="8" strokeLinecap="round">
        <path d="M2 2 C58 50 42 112 104 150 C140 172 150 200 138 234" />
        <path d="M4 48 C56 76 68 112 48 160" />
      </g>
      <g fill="#3b6d11">
        <ellipse cx="52" cy="54" rx="13" ry="6.5" transform="rotate(35 52 54)" />
        <ellipse cx="92" cy="108" rx="13" ry="6.5" transform="rotate(-20 92 108)" />
        <ellipse cx="120" cy="160" rx="12" ry="6" transform="rotate(50 120 160)" />
        <ellipse cx="134" cy="208" rx="11" ry="5.5" transform="rotate(15 134 208)" />
        <ellipse cx="42" cy="146" rx="11" ry="5.5" transform="rotate(-40 42 146)" />
      </g>
    </>
  );
}

export function DungeonVines() {
  return (
    <div className="dungeon-vines" aria-hidden="true">
      <svg className="dv-corner dv-left" viewBox="0 0 150 240" width="150" height="240">
        <VineCluster />
      </svg>
      <svg className="dv-corner dv-right" viewBox="0 0 150 240" width="150" height="240">
        <g transform="translate(150 0) scale(-1 1)">
          <VineCluster />
        </g>
      </svg>
    </div>
  );
}
