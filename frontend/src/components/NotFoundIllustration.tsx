/** A customer card with nothing on it, and a magnifying glass that found nothing. Colours follow the theme. */
export function NotFoundIllustration({ className = '' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 320 220" fill="none" className={className}>
      <circle cx="160" cy="110" r="100" className="fill-chrome" />

      {/* Links to other customers, broken off: the record they lead to is not here */}
      <g strokeWidth="2" strokeDasharray="4 6" strokeLinecap="round" className="stroke-hairline">
        <path d="M84 72 44 44" />
        <path d="M84 150 40 172" />
        <path d="M226 62 272 40" />
      </g>
      <circle cx="40" cy="41" r="9" className="fill-band" />
      <circle cx="35" cy="175" r="7" className="fill-band" />
      <circle cx="277" cy="37" r="8" className="fill-band" />

      {/* The empty customer card */}
      <rect x="84" y="46" width="142" height="124" rx="12" className="fill-canvas stroke-band" strokeWidth="2" />
      <circle cx="118" cy="82" r="18" strokeWidth="2" strokeDasharray="5 5" className="stroke-hairline" />
      <rect x="146" y="70" width="62" height="9" rx="4" className="fill-band" />
      <rect x="146" y="86" width="42" height="9" rx="4" className="fill-band" />
      <rect x="100" y="116" width="108" height="9" rx="4" className="fill-band" />
      <rect x="100" y="134" width="74" height="9" rx="4" className="fill-band" />

      {/* The magnifying glass */}
      <path d="m250 168 28 28" strokeWidth="11" strokeLinecap="round" className="stroke-primary" />
      <circle cx="218" cy="136" r="42" strokeWidth="9" className="fill-band-blue stroke-primary" />
      <path d="M205 124a13 13 0 1 1 20 11c-4.5 2.8-7 5.2-7 10" strokeWidth="6" strokeLinecap="round" className="stroke-primary-deep" />
      <circle cx="218" cy="157" r="4" className="fill-primary-deep" />
    </svg>
  )
}
