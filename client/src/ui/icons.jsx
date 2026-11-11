/** Small inline SVG icons for the HUD (no icon font or image downloads). */

export function GemIcon({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M8 4h16l6 8-14 17L2 12z" fill="#e8385a" stroke="#3b2414" strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M2 12h28M8 4l4 8 4-8 4 8 4-8M12 12l4 17 4-17" fill="none" stroke="#7a1028" strokeWidth="1.4" />
      <path d="M9 6l2.5 5H5z" fill="#ff9db0" />
    </svg>
  )
}

export function LockIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="#3b2414" strokeWidth="3" />
      <rect x="4" y="10" width="16" height="12" rx="3" fill="#ffc83a" stroke="#3b2414" strokeWidth="2.2" />
      <circle cx="12" cy="16" r="1.8" fill="#7a4a10" />
    </svg>
  )
}

export function HourglassIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 3h12M6 21h12" stroke="#3b2414" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M7 3c0 5 5 6 5 9s-5 4-5 9h10c0-5-5-6-5-9s5-4 5-9z" fill="#fff4dc" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 19c1-2 2-3 3-3s2 1 3 3z" fill="#f2b53a" />
    </svg>
  )
}

export function UsersIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" fill="#ffd34d" stroke="#3b2414" strokeWidth="2" />
      <circle cx="16.5" cy="9" r="3" fill="#ffb84d" stroke="#3b2414" strokeWidth="2" />
      <path d="M2.5 20c0-4 3-6 6.5-6s6.5 2 6.5 6z" fill="#ffd34d" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M14 14.5c1-.5 1.8-.6 2.5-.6 3 0 5.5 2 5.5 5.6h-5" fill="#ffb84d" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function GearIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path
        d="M12 2.5l1.6 2.3 2.7-.7.6 2.7 2.6 1-.8 2.6 1.8 2.1-2.1 1.8.8 2.6-2.6 1-.6 2.7-2.7-.7L12 21.5l-1.6-2.3-2.7.7-.6-2.7-2.6-1 .8-2.6L3.5 12l2.1-1.8-.8-2.6 2.6-1 .6-2.7 2.7.7z"
        fill="#fff4dc"
        stroke="#3b2414"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.2" fill="#f2b53a" stroke="#3b2414" strokeWidth="1.8" />
    </svg>
  )
}

export function SoundIcon({ muted, className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 9h4l5-4v14l-5-4H3z" fill="#fff4dc" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      {muted ? (
        <path d="M16 9l5 6M21 9l-5 6" stroke="#e8385a" strokeWidth="2.5" strokeLinecap="round" />
      ) : (
        <path d="M15.5 8.5a5 5 0 0 1 0 7M18 6a8.5 8.5 0 0 1 0 12" fill="none" stroke="#3b2414" strokeWidth="2.2" strokeLinecap="round" />
      )}
    </svg>
  )
}

export function ArrowUpIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M12 4l7 8h-4v7H9v-7H5z" fill="#fff4dc" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function CoinIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <ellipse cx="12" cy="13.5" rx="9" ry="8" fill="#b07a10" />
      <ellipse cx="12" cy="11.5" rx="9" ry="8" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.6" />
      <ellipse cx="12" cy="11.5" rx="5.6" ry="4.8" fill="none" stroke="#c98a12" strokeWidth="1.6" />
    </svg>
  )
}

export function BagIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M11 6h10l-2 5h-6z" fill="#c8a26a" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M13 11c-6 2-9 7-9 12 0 4 3 6 12 6s12-2 12-6c0-5-3-10-9-12z" fill="#d9b27a" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M12 11h8" stroke="#7a4a2a" strokeWidth="2.4" strokeLinecap="round" />
      <ellipse cx="16" cy="20" rx="4" ry="3.4" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.4" />
    </svg>
  )
}

export function ScrollIcon({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 4h11a3 3 0 0 1 3 3v11a2 2 0 0 1-2 2H8a3 3 0 0 1-3-3V5" fill="#fff4dc" stroke="#3b2414" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M5 5a2 2 0 1 0-1 4h2" fill="#f3dfb8" stroke="#3b2414" strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M9 9h7M9 12h7M9 15h5" stroke="#8a5a34" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 17l2-3 2 3-2 3z" fill="#4caf50" stroke="#3b2414" strokeWidth="1.2" />
    </svg>
  )
}

export function HandIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path
        d="M9 17V8.5a2 2 0 0 1 4 0V15V6a2 2 0 0 1 4 0v9V7.5a2 2 0 0 1 4 0V16v-5a2 2 0 0 1 4 0v8c0 6-4 10-9 10h-1c-3 0-5-1-7-4l-4-6a2 2 0 0 1 3-2.5z"
        fill="#f0c39a"
        stroke="#3b2414"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="16" cy="21" r="3" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.6" />
    </svg>
  )
}

export function BootIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M8 4h9v13l9 4c2 1 3 3 3 5v2H5V8z" fill="#8a5a32" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M5 24h24" stroke="#3b2414" strokeWidth="2" />
      <path d="M8 9h9M8 13h9" stroke="#ffc83a" strokeWidth="2" />
      <path d="M2 10l3-1M1 15l4-1M2 20l3-1" stroke="#fff4dc" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function ChestIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M4 14c0-6 5-8 12-8s12 2 12 8z" fill="#9a5a30" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <rect x="4" y="14" width="24" height="13" rx="2" fill="#7a4527" stroke="#3b2414" strokeWidth="2" />
      <path d="M4 14h24" stroke="#ffc83a" strokeWidth="2.4" />
      <rect x="13" y="12" width="6" height="7" rx="1.5" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.6" />
      <circle cx="11" cy="6" r="2.2" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.2" />
      <circle cx="21" cy="5" r="2.2" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.2" />
    </svg>
  )
}

export function BoltIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M18 2L6 18h8l-2 12 14-17h-9z" fill="#ffd34d" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  )
}

export function GoblinIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M8 14L1 10l3 8zM24 14l7-4-3 8z" fill="#6fbf4a" stroke="#3b2414" strokeWidth="1.8" strokeLinejoin="round" />
      <rect x="7" y="9" width="18" height="17" rx="5" fill="#6fbf4a" stroke="#3b2414" strokeWidth="2" />
      <path d="M9 10l7-8 7 8z" fill="#c0392b" stroke="#3b2414" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="12.5" cy="16" r="2.4" fill="#ffe14a" stroke="#3b2414" strokeWidth="1.2" />
      <circle cx="19.5" cy="16" r="2.4" fill="#ffe14a" stroke="#3b2414" strokeWidth="1.2" />
      <path d="M12 22c2 1.5 6 1.5 8 0" fill="none" stroke="#3b2414" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

export function SackIcon({ className = 'h-8 w-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <path d="M12 9c-6 4-8 9-8 13 0 4 4 7 12 7s12-3 12-7c0-4-2-9-8-13z" fill="#b07a45" stroke="#3b2414" strokeWidth="2" strokeLinejoin="round" />
      <path d="M11 9h10l-2-4h-6z" fill="#8a5a32" stroke="#3b2414" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="16" cy="20" r="4.5" fill="#ffc83a" stroke="#3b2414" strokeWidth="1.6" />
      <path d="M16 17.5v5" stroke="#a06a00" strokeWidth="1.6" />
    </svg>
  )
}

export function ArrowRightIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M3 12h14M12 6l7 6-7 6" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* Tool pictures for the hotbar and the Tool Shelf (48-unit grid, ink outlines). */

/** A stroke drawn twice: dark outline underneath, colour on top. */
function Outlined({ d, color, width, cap = 'round' }) {
  return (
    <>
      <path d={d} fill="none" stroke="#3b2414" strokeWidth={width + 3} strokeLinecap={cap} strokeLinejoin="round" />
      <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap={cap} strokeLinejoin="round" />
    </>
  )
}

const Coin = ({ x, y, r = 4.6 }) => (
  <g>
    <ellipse cx={x} cy={y} rx={r} ry={r * 0.72} fill="#ffc83a" stroke="#3b2414" strokeWidth="1.6" />
    <ellipse cx={x} cy={y - 0.3} rx={r * 0.55} ry={r * 0.36} fill="none" stroke="#e09a12" strokeWidth="1.2" />
  </g>
)

export function ScoopIcon({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <Outlined d="M27 21L41.5 6.5" color="#b07a45" width={4.6} />
      <Outlined d="M37.5 10.5L41.5 6.5" color="#6e4120" width={4.6} />
      <Outlined d="M24.5 23.5l3.6-3.6" color="#ffd25a" width={6.5} cap="butt" />
      <path d="M5 27c0-9 9-14 18-10l8 8c4 9-4 19-14 18-7-.6-12-7-12-16z" fill="#e2b04a" stroke="#3b2414" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M8.5 27.5c0-6.5 6.5-10 13-7.5l6 6c2.5 6.5-3 13-10 12.5-5-.4-9-4.5-9-11z" fill="#9c6a1c" />
      <Coin x={15.5} y={28} />
      <Coin x={22} y={32} r={4.2} />
      <Coin x={14} y={34.5} r={4} />
      <path d="M8 22.5c2-3.5 5.5-5 9-4.6" fill="none" stroke="#fff3c4" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function RakeIcon({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <g transform="rotate(-28 24 26)">
        <Outlined d="M24 3.5V27" color="#8a5a32" width={4.4} />
        <Outlined d="M24 3.5V8" color="#5e3a1c" width={4.4} />
        <rect x="20.5" y="25.5" width="7" height="5" rx="1.5" fill="#ffd25a" stroke="#3b2414" strokeWidth="2" />
        <rect x="6" y="29.5" width="36" height="6.5" rx="3.2" fill="#c9ccd6" stroke="#3b2414" strokeWidth="2.4" />
        <path d="M8.5 31.5h31" stroke="#f4f5f9" strokeWidth="1.6" strokeLinecap="round" />
        {[9.5, 14.4, 19.2, 24, 28.8, 33.6, 38.5].map((x) => (
          <rect key={x} x={x - 1.6} y="35" width="3.2" height="8" rx="1.6" fill="#c9ccd6" stroke="#3b2414" strokeWidth="1.6" />
        ))}
      </g>
      <Coin x={40} y={41} r={4.2} />
      <Coin x={33} y={44} r={3.6} />
    </svg>
  )
}

export function VacIcon({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <Outlined d="M25 37c8 4 13-2 11-9.5" color="#2e2b38" width={4.2} />
      <rect x="12.5" y="8" width="7" height="6" rx="2" fill="#e2b04a" stroke="#3b2414" strokeWidth="2" />
      <rect x="5" y="12.5" width="22" height="30" rx="9" fill="#3f9fb8" stroke="#3b2414" strokeWidth="2.6" />
      <path d="M6.6 19.5h18.8M6.6 36h18.8" stroke="#e2b04a" strokeWidth="3" />
      <path d="M8.5 16.5c.8-1.6 2.2-2.4 3.6-2.6" fill="none" stroke="#bdf0fb" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="27.8" r="4.8" fill="#f6f1e3" stroke="#3b2414" strokeWidth="2" />
      <path d="M16 27.8l2.4-2.2" stroke="#d9483b" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M32 27.5l3-11 10 4.2-8.5 8.3z" fill="#c9ccd6" stroke="#3b2414" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M38 12.5c2.5-2.5 5.5-2.2 6.5.6M40.5 8c1.8-1.2 3.8-.6 4.4 1" fill="none" stroke="#7fdcf0" strokeWidth="2" strokeLinecap="round" />
      <Coin x={41} y={4.8} r={3.4} />
    </svg>
  )
}

export function LodestoneIcon({ className = 'h-10 w-10' }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden="true">
      <path d="M3.5 13h7M5.5 22h6M38 8.5l5-3M39.5 17h6" stroke="#ffe08a" strokeWidth="2.2" strokeLinecap="round" />
      <ellipse cx="25" cy="40.5" rx="13" ry="4.3" fill="none" stroke="#3b2414" strokeWidth="5.4" />
      <ellipse cx="25" cy="40.5" rx="13" ry="4.3" fill="none" stroke="#ffd25a" strokeWidth="2.6" />
      <path d="M13 28l3.5-14L28 7.5l10.5 6.5 2 14-7 10H19.5z" fill="#3b3550" stroke="#3b2414" strokeWidth="2.6" strokeLinejoin="round" />
      <path d="M16.5 14L28 7.5l-2.5 9z" fill="#57507a" />
      <path d="M23 21l3-8 3 8-3 6z" fill="#b9a3ff" stroke="#3b2414" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M31.5 26l2.2-5.6 2.2 5.6-2.2 4z" fill="#b9a3ff" stroke="#3b2414" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M17.5 30l1.8-4.4 1.8 4.4-1.8 3.2z" fill="#d6c8ff" stroke="#3b2414" strokeWidth="1.3" strokeLinejoin="round" />
      <Coin x={8} y={7} r={3.6} />
      <Coin x={42.5} y={25} r={3.4} />
    </svg>
  )
}

export function CloseIcon({ className = 'h-6 w-6' }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="#fff" strokeWidth="3.8" strokeLinecap="round" />
    </svg>
  )
}
