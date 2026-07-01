// The continuous crypt-brick surface of the "hall". One wide, seamless tiling
// pattern that pans 1:1 with the pager (see AppShell), so swiping feels like
// walking down the corridor. The vignette lives per-page (.pager-page::before).
// See progress.md "Dungeon-crypt page backgrounds".
export function DungeonWall() {
  return (
    <svg
      className="dungeon-wall"
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <defs>
        <pattern
          id="dw-brick"
          width="120"
          height="64"
          patternUnits="userSpaceOnUse"
        >
          <rect width="120" height="64" fill="#14181c" />
          <rect x="2" y="3" width="54" height="27" rx="2" fill="#2b3138" />
          <rect x="60" y="3" width="54" height="27" rx="2" fill="#272d34" />
          <rect x="2" y="3" width="54" height="3.5" fill="#3a434b" opacity="0.7" />
          <rect x="60" y="3" width="54" height="3.5" fill="#353d45" opacity="0.7" />
          <rect x="-28" y="34" width="54" height="27" rx="2" fill="#2c333a" />
          <rect x="30" y="34" width="54" height="27" rx="2" fill="#2f363d" />
          <rect x="92" y="34" width="54" height="27" rx="2" fill="#2c333a" />
          <rect x="30" y="34" width="54" height="3.5" fill="#38414a" opacity="0.7" />
          <rect x="92" y="34" width="54" height="3.5" fill="#333c43" opacity="0.7" />
          <rect x="-28" y="34" width="54" height="3.5" fill="#333c43" opacity="0.7" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="#0c0f12" />
      <rect width="100%" height="100%" fill="url(#dw-brick)" />
    </svg>
  );
}
