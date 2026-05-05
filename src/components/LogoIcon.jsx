// src/components/LogoIcon.jsx
export default function LogoIcon({ size = 28 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Gear body */}
      <circle cx="50" cy="50" r="28" fill="#0052CC" />

      {/* Gear teeth — 8 teeth */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
        <rect
          key={angle}
          x="43"
          y="14"
          width="14"
          height="12"
          rx="3"
          fill="#0052CC"
          transform={`rotate(${angle} 50 50)`}
        />
      ))}

      {/* Inner hole */}
      <circle cx="50" cy="50" r="12" fill="white" />

      {/* Center bolt */}
      <circle cx="50" cy="50" r="7" fill="#0052CC" />

      {/* Happy face — eyes */}
      <ellipse cx="43" cy="46" rx="3" ry="3.5" fill="white" />
      <ellipse cx="57" cy="46" rx="3" ry="3.5" fill="white" />
      <circle cx="43" cy="47" r="1.8" fill="#002D80" />
      <circle cx="57" cy="47" r="1.8" fill="#002D80" />

      {/* Smile */}
      <path
        d="M43 56 Q50 63 57 56"
        stroke="white"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />

      {/* Cheek blush */}
      <ellipse cx="39" cy="54" rx="4" ry="2.5" fill="#5599FF" opacity="0.35" />
      <ellipse cx="61" cy="54" rx="4" ry="2.5" fill="#5599FF" opacity="0.35" />

      {/* Shine */}
      <ellipse
        cx="40"
        cy="36"
        rx="5"
        ry="3"
        fill="white"
        opacity="0.2"
        transform="rotate(-30 40 36)"
      />
    </svg>
  )
}
