// The dungeon gate — an arched portcullis with a pitch-black interior, flanked by
// two flickering wall torches and crowned with a keystone and drape vines. Sits
// behind the Home page content only. The flame/glow flicker is driven by the
// .dgate-* CSS animations (disabled under prefers-reduced-motion).
export function DungeonGate() {
  return (
    <div className="dungeon-gate" aria-hidden="true">
      <svg viewBox="60 170 560 764" preserveAspectRatio="xMidYMax meet">
        <defs>
          <radialGradient id="dg-depth" cx="0.5" cy="0.6" r="0.8">
            <stop offset="0" stopColor="#05070a" />
            <stop offset="1" stopColor="#131a21" />
          </radialGradient>
          <radialGradient id="dg-glow" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0" stopColor="#ffb066" stopOpacity="0.6" />
            <stop offset="0.42" stopColor="#c85a1e" stopOpacity="0.22" />
            <stop offset="1" stopColor="#c85a1e" stopOpacity="0" />
          </radialGradient>
          <clipPath id="dg-clip">
            <path d="M212,934 L212,412 A128,128 0 0 1 468,412 L468,934 Z" />
          </clipPath>
        </defs>

        <path
          d="M182,934 L182,400 A158,158 0 0 1 498,400 L498,934 Z"
          fill="#454d55"
          stroke="#1c2228"
          strokeWidth="3"
        />
        <g stroke="#252c33" strokeWidth="2" opacity="0.8">
          <line x1="182" y1="470" x2="212" y2="470" />
          <line x1="182" y1="545" x2="212" y2="545" />
          <line x1="182" y1="620" x2="212" y2="620" />
          <line x1="182" y1="695" x2="212" y2="695" />
          <line x1="468" y1="470" x2="498" y2="470" />
          <line x1="468" y1="545" x2="498" y2="545" />
          <line x1="468" y1="620" x2="498" y2="620" />
          <line x1="468" y1="695" x2="498" y2="695" />
          <line x1="182" y1="770" x2="212" y2="770" />
          <line x1="182" y1="845" x2="212" y2="845" />
          <line x1="182" y1="920" x2="212" y2="920" />
          <line x1="468" y1="770" x2="498" y2="770" />
          <line x1="468" y1="845" x2="498" y2="845" />
          <line x1="468" y1="920" x2="498" y2="920" />
        </g>

        <path
          d="M212,934 L212,412 A128,128 0 0 1 468,412 L468,934 Z"
          fill="url(#dg-depth)"
        />

        <g clipPath="url(#dg-clip)" stroke="#363b41" strokeWidth="5">
          <line x1="238" y1="300" x2="238" y2="934" />
          <line x1="267" y1="300" x2="267" y2="934" />
          <line x1="296" y1="290" x2="296" y2="934" />
          <line x1="325" y1="288" x2="325" y2="934" />
          <line x1="354" y1="288" x2="354" y2="934" />
          <line x1="383" y1="290" x2="383" y2="934" />
          <line x1="412" y1="300" x2="412" y2="934" />
          <line x1="441" y1="300" x2="441" y2="934" />
          <line x1="212" y1="470" x2="468" y2="470" strokeWidth="6" />
          <line x1="212" y1="620" x2="468" y2="620" strokeWidth="6" />
          <line x1="212" y1="770" x2="468" y2="770" strokeWidth="6" />
          <line x1="212" y1="900" x2="468" y2="900" strokeWidth="6" />
        </g>
        <g clipPath="url(#dg-clip)" stroke="#4c525a" strokeWidth="1.3" opacity="0.8">
          <line x1="238" y1="300" x2="238" y2="934" />
          <line x1="296" y1="290" x2="296" y2="934" />
          <line x1="354" y1="288" x2="354" y2="934" />
          <line x1="412" y1="300" x2="412" y2="934" />
        </g>

        <path
          d="M320,272 L360,272 L352,228 L328,228 Z"
          fill="#566069"
          stroke="#1c2228"
          strokeWidth="2"
        />

        <g fill="none" stroke="#26401f" strokeWidth="5" strokeLinecap="round">
          <path d="M300,256 C296,282 312,298 306,326" />
          <path d="M380,256 C384,282 368,298 374,326" />
        </g>
        <g fill="#4f8a1a">
          <ellipse cx="302" cy="294" rx="9" ry="4.5" transform="rotate(30 302 294)" />
          <ellipse cx="378" cy="294" rx="9" ry="4.5" transform="rotate(-30 378 294)" />
        </g>

        <g transform="translate(-18 -84)">
          <circle className="dgate-glow" cx="150" cy="360" r="120" fill="url(#dg-glow)" />
          <rect x="132" y="398" width="36" height="9" rx="2" fill="#2c2c32" />
          <rect x="145" y="376" width="10" height="52" rx="3" fill="#241a12" />
          <g className="dgate-flame">
            <path d="M150,324 C162,344 164,351 150,376 C136,351 138,344 150,324 Z" fill="#d9591b" />
            <path d="M150,334 C159,350 160,356 150,374 C140,356 141,350 150,334 Z" fill="#f4a015" />
            <path d="M150,345 C155,355 156,362 150,373 C144,362 145,355 150,345 Z" fill="#ffdd57" />
          </g>
        </g>
        <g transform="translate(18 -84)">
          <circle className="dgate-glow b" cx="530" cy="360" r="120" fill="url(#dg-glow)" />
          <rect x="512" y="398" width="36" height="9" rx="2" fill="#2c2c32" />
          <rect x="525" y="376" width="10" height="52" rx="3" fill="#241a12" />
          <g className="dgate-flame b">
            <path d="M530,324 C542,344 544,351 530,376 C516,351 518,344 530,324 Z" fill="#d9591b" />
            <path d="M530,334 C539,350 540,356 530,374 C520,356 521,350 530,334 Z" fill="#f4a015" />
            <path d="M530,345 C535,355 536,362 530,373 C524,362 525,355 530,345 Z" fill="#ffdd57" />
          </g>
        </g>
      </svg>
    </div>
  );
}
