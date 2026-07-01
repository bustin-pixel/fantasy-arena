// Vector icons for the Home mode cards (replaces the emoji). Drawn to match the
// game's flat, hand-drawn sprite aesthetic and the gold/steel/bone palette. The
// disabled card's grayscale filter dims these automatically.

/** Crossed swords — the Arena (battle) mode. */
export function ArenaIcon() {
  return (
    <svg
      className="mode-card-icon"
      viewBox="0 0 40 40"
      width="44"
      height="44"
      aria-hidden="true"
    >
      <g transform="translate(20 21)">
        <g transform="rotate(34)">
          <path d="M-1.8 4 L1.8 4 L0 -16 Z" fill="#cdd2d8" />
          <path d="M-0.6 2 L0.6 2 L0 -14 Z" fill="#eef1f4" />
          <rect x="-5" y="4" width="10" height="2.6" rx="1" fill="#f5b301" />
          <rect x="-1.6" y="6.6" width="3.2" height="7" fill="#3a2c1c" />
          <circle cx="0" cy="14.6" r="2.6" fill="#f5b301" />
        </g>
        <g transform="rotate(-34)">
          <path d="M-1.8 4 L1.8 4 L0 -16 Z" fill="#cdd2d8" />
          <path d="M-0.6 2 L0.6 2 L0 -14 Z" fill="#eef1f4" />
          <rect x="-5" y="4" width="10" height="2.6" rx="1" fill="#f5b301" />
          <rect x="-1.6" y="6.6" width="3.2" height="7" fill="#3a2c1c" />
          <circle cx="0" cy="14.6" r="2.6" fill="#f5b301" />
        </g>
      </g>
    </svg>
  );
}

/** Skull — the Swarm / PvE mode. */
export function SwarmIcon() {
  return (
    <svg
      className="mode-card-icon"
      viewBox="0 0 40 40"
      width="44"
      height="44"
      aria-hidden="true"
    >
      <g transform="translate(20 23)" fill="#cbc5b5">
        <path d="M-13 -1 C-14 -15 -8 -20 0 -20 C8 -20 14 -15 13 -1 C13 4 10 6 8 8 L-8 8 C-10 6 -13 4 -13 -1 Z" />
        <ellipse cx="-5.4" cy="-4" rx="4.2" ry="5" fill="#12100d" />
        <ellipse cx="5.4" cy="-4" rx="4.2" ry="5" fill="#12100d" />
        <path d="M0 -0.5 C-1.4 2 -2.6 2.6 -2 5 L0 3.6 L2 5 C2.6 2.6 1.4 2 0 -0.5 Z" fill="#12100d" />
        <g stroke="#6b6552" strokeWidth="0.5">
          <rect x="-7.5" y="8" width="2.4" height="4.5" rx="0.8" />
          <rect x="-4.4" y="8" width="2.4" height="5" rx="0.8" />
          <rect x="-1.2" y="8" width="2.4" height="5" rx="0.8" />
          <rect x="2" y="8" width="2.4" height="5" rx="0.8" />
          <rect x="5.1" y="8" width="2.2" height="4.5" rx="0.8" />
        </g>
      </g>
    </svg>
  );
}
