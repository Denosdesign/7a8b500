import React from 'react';

export const PinkSoldier: React.FC<{ size?: number; className?: string }> = ({ size = 40, className }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 100 120" className={`drop-shadow-lg ${className || ''}`}>
    <rect x="25" y="45" width="50" height="55" rx="5" fill="#ed1b76" />
    <circle cx="50" cy="30" r="25" fill="#1a1a1a" />
    <circle cx="50" cy="30" r="12" fill="none" stroke="#ed1b76" strokeWidth="3" />
    <rect x="10" y="50" width="15" height="8" rx="4" fill="#ed1b76" />
    <rect x="75" y="50" width="15" height="8" rx="4" fill="#ed1b76" />
    <rect x="30" y="100" width="12" height="18" rx="3" fill="#ed1b76" />
    <rect x="58" y="100" width="12" height="18" rx="3" fill="#ed1b76" />
    <rect x="25" y="70" width="50" height="5" fill="#1a1a1a" />
  </svg>
);

export const TriangleSoldier: React.FC<{ size?: number; className?: string }> = ({ size = 40, className }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 100 120" className={`drop-shadow-lg ${className || ''}`}>
    <rect x="25" y="45" width="50" height="55" rx="5" fill="#ed1b76" />
    <circle cx="50" cy="30" r="25" fill="#1a1a1a" />
    <polygon points="50,18 38,42 62,42" fill="none" stroke="#ed1b76" strokeWidth="3" />
    <rect x="10" y="50" width="15" height="8" rx="4" fill="#ed1b76" />
    <rect x="75" y="50" width="15" height="8" rx="4" fill="#ed1b76" />
    <rect x="30" y="100" width="12" height="18" rx="3" fill="#ed1b76" />
    <rect x="58" y="100" width="12" height="18" rx="3" fill="#ed1b76" />
    <rect x="25" y="70" width="50" height="5" fill="#1a1a1a" />
  </svg>
);

export const SquareSoldier: React.FC<{ size?: number; className?: string }> = ({ size = 40, className }) => (
  <svg width={size} height={size * 1.2} viewBox="0 0 100 120" className={`drop-shadow-lg ${className || ''}`}>
    <rect x="25" y="45" width="50" height="55" rx="5" fill="#ed1b76" />
    <circle cx="50" cy="30" r="25" fill="#1a1a1a" />
    <rect x="38" y="18" width="24" height="24" fill="none" stroke="#ed1b76" strokeWidth="3" />
    <rect x="10" y="50" width="15" height="8" rx="4" fill="#ed1b76" />
    <rect x="75" y="50" width="15" height="8" rx="4" fill="#ed1b76" />
    <rect x="30" y="100" width="12" height="18" rx="3" fill="#ed1b76" />
    <rect x="58" y="100" width="12" height="18" rx="3" fill="#ed1b76" />
    <rect x="25" y="70" width="50" height="5" fill="#1a1a1a" />
  </svg>
);
