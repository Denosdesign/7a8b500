
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Team } from '../types';
import { TEAM_CONFIG } from '../constants';
import { getAverageScore, formatAverageScore } from '../utils';

const getTotalScore = (team: Team): number => team.score || 0;

interface ScoreboardProps {
  teams: Team[];
  condensed?: boolean;
}

// --- VISUAL ASSETS ---

// A single bill component for background rain
const WonBill = ({ className, style }: { className?: string; style?: React.CSSProperties }) => (
  <div 
    className={`relative bg-[#f0fdf4] overflow-hidden shadow-sm border border-green-200/50 ${className}`} 
    style={style}
  >
     <div className="absolute inset-0 bg-green-500/10 mix-blend-multiply"></div>
     <div className="absolute inset-[1px] border border-dashed border-green-800/30 flex items-center justify-center">
        <div className="w-[60%] h-[60%] rounded-[50%] border border-green-800/20 bg-green-500/5"></div>
     </div>
     <span className="absolute top-[1px] right-[2px] text-[4px] font-bold text-green-900 leading-none">50000</span>
     <span className="absolute bottom-[1px] left-[2px] text-[4px] font-bold text-green-900 leading-none">₩</span>
     <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 bg-green-900/10 rounded-full blur-[0.5px]"></div>
  </div>
);

// Background Falling Money
const MoneyRain = () => {
  const bills = useMemo(() => {
    return Array.from({ length: 20 }).map((_, i) => ({
      id: i,
      left: Math.random() * 100, 
      delay: Math.random() * 10, 
      duration: 10 + Math.random() * 10, // Slower rain
      scale: 0.5 + Math.random() * 0.5,
      type: Math.random() > 0.5 ? 'sway-left' : 'sway-right'
    }));
  }, []);

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none z-0 opacity-40">
      <style>{`
        @keyframes sway-left {
          0% { transform: translate(0, -10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          50% { transform: translate(20px, 50vh) rotate(90deg); opacity: 1; }
          100% { transform: translate(0, 110vh) rotate(180deg); opacity: 0; }
        }
        @keyframes sway-right {
          0% { transform: translate(0, -10vh) rotate(0deg); opacity: 0; }
          10% { opacity: 0.8; }
          50% { transform: translate(-20px, 50vh) rotate(-90deg); opacity: 1; }
          100% { transform: translate(0, 110vh) rotate(-180deg); opacity: 0; }
        }
        .animate-sway-left {
          animation-name: sway-left;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        .animate-sway-right {
          animation-name: sway-right;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
      `}</style>
      {bills.map((bill) => (
        <div
          key={bill.id}
          className={`absolute top-0 -mt-10 ${bill.type === 'sway-left' ? 'animate-sway-left' : 'animate-sway-right'}`}
          style={{
            left: `${bill.left}%`,
            width: '40px',
            height: '18px',
            animationDelay: `-${bill.delay}s`,
            animationDuration: `${bill.duration}s`,
          }}
        >
          <WonBill className="w-full h-full transform scale-100" />
        </div>
      ))}
    </div>
  );
};

const ScoreboardFXStyles = () => (
  <style>
    {`
      @keyframes beam-pulse {
        0%, 100% { opacity: 0.25; }
        50% { opacity: 0.65; }
      }
      .leader-beam {
        animation: beam-pulse 2.2s ease-in-out infinite;
      }
    `}
  </style>
);

export const Scoreboard: React.FC<ScoreboardProps> = ({ teams, condensed = false }) => {
  const [displayScores, setDisplayScores] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    teams.forEach((team) => {
      initial[team.color] = getAverageScore(team);
    });
    return initial;
  });
  const [showTotalScore, setShowTotalScore] = useState(false);
  const latestDisplayRef = useRef(displayScores);

  useEffect(() => {
    latestDisplayRef.current = displayScores;
  }, [displayScores]);

  useEffect(() => {
    if (typeof window === 'undefined' || teams.length === 0) return;

    const getScoreValue = (team: Team) => showTotalScore ? getTotalScore(team) : getAverageScore(team);

    const startValues: Record<string, number> = {};
    const endValues: Record<string, number> = {};

    teams.forEach((team) => {
      const color = team.color;
      const endValue = getScoreValue(team);
      const startValue = latestDisplayRef.current[color] ?? endValue;
      startValues[color] = startValue;
      endValues[color] = endValue;
    });

    const duration = 1200;
    const startTime = performance.now();
    let raf = 0;

    const animate = (now: number) => {
      const progress = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);

      setDisplayScores((prev) => {
        const next = { ...prev };
        teams.forEach((team) => {
          const color = team.color;
          const start = startValues[color];
          const end = endValues[color];
          next[color] = start + (end - start) * eased;
        });
        return next;
      });

      if (progress < 1) {
        raf = requestAnimationFrame(animate);
      }
    };

    raf = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf);
  }, [teams, showTotalScore]);

  // --- SCALING LOGIC ---
  const getScoreValue = (team: Team) => showTotalScore ? getTotalScore(team) : getAverageScore(team);
  const scores = teams.map(team => getScoreValue(team));
  const currentMax = scores.length ? Math.max(...scores) : 0;
  const currentMin = scores.length ? Math.min(...scores) : 0;
  const spread = currentMax - currentMin;

  // Default: Scale from 0 to Max (at least 5)
  let scaleMin = 0;
  let scaleMax = Math.max(currentMax, 5);

  // "Zoom In" Logic:
  // If the spread between top and bottom is small relative to the max score (less than 70%),
  // we effectively zoom in by raising the floor (scaleMin).
  // This helps visualize differences when scores are close (e.g., 50 vs 52).
  if (currentMax > 0 && spread / currentMax < 0.7) {
      // Calculate a comfortable padding so the lowest bar isn't at the absolute bottom
      // Padding is roughly 15-20% of the spread, or at least 1 unit.
      const padding = Math.max(1, Math.ceil(spread * 0.2));
      
      scaleMin = Math.max(0, currentMin - padding);
      scaleMax = currentMax + padding;
  }
  
  const visualRange = Math.max(scaleMax - scaleMin, 1);

  // Leader Logic
  const sortedTeams = [...teams].sort((a, b) => getScoreValue(b) - getScoreValue(a));
  const leader = sortedTeams[0];
  const leaderScore = leader ? getScoreValue(leader) : 0;
  const isTie =
    sortedTeams.length > 1 &&
    Math.abs(leaderScore - getScoreValue(sortedTeams[1])) < 0.001;

  // STATIC CASH PILE
  // A dense, aesthetically pleasing pile of money inside the sphere
  const cashPile = useMemo(() => {
    const items = [];
    const count = 180;
    
    for (let i = 0; i < count; i++) {
        // Generate positions within the sphere (cx=100, cy=130, r=80)
        // Bias towards bottom to mimic gravity
        const angle = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * 75; // 75 radius to keep margin
        
        let x = 100 + r * Math.cos(angle);
        let y = 130 + r * Math.sin(angle);
        
        // Push everything down slightly to settle at bottom
        y = y + 10 + (Math.abs(x - 100) / 4); // Parabolic settling
        
        // Clamp to circle
        const dist = Math.sqrt((x - 100)**2 + (y - 130)**2);
        if (dist > 76) {
             // pull back in
             const ratio = 76 / dist;
             x = 100 + (x - 100) * ratio;
             y = 130 + (y - 130) * ratio;
        }
        
        // Ensure not floating too high up (fill level)
        if (y < 90) y = 90 + Math.random() * 20;

        items.push({
            id: i,
            x,
            y,
            rot: Math.random() * 360,
            width: 18 + Math.random() * 6,
            height: 9 + Math.random() * 3,
            // Darker greens for better aesthetics
            fill: Math.random() > 0.4 ? '#16a34a' : '#15803d', // Green-600 / Green-700
            stroke: '#064e3b', // Green-900
        });
    }
    return items;
  }, []);

  const containerClasses = `w-full ${condensed ? 'mb-4' : 'mb-12'} ${condensed ? '' : 'animate-fade-in'} relative`;

  return (
    <div className={containerClasses}>
      <ScoreboardFXStyles />
      <MoneyRain />
      
      {/* PIGGY BANK HEADER */}
      {!condensed && (
        <div className="relative w-full flex flex-col items-center justify-center mb-16 pt-8 z-10">
        
        {/* The Glass Pig */}
        <div className="relative w-72 h-72 md:w-96 md:h-96 animate-float-slow">
             <svg viewBox="0 0 200 240" className="w-full h-full drop-shadow-[0_0_60px_rgba(251,191,36,0.1)]">
                <defs>
                   <radialGradient id="glassGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="20%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.05" />
                      <stop offset="60%" stopColor="#ffffff" stopOpacity="0.1" />
                      <stop offset="90%" stopColor="#22d3ee" stopOpacity="0.15" />
                      <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0.3" />
                   </radialGradient>
                   
                   <linearGradient id="reflection" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                      <stop offset="40%" stopColor="#ffffff" stopOpacity="0" />
                      <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                   </linearGradient>

                   <clipPath id="pigClip">
                      <circle cx="100" cy="130" r="78" />
                   </clipPath>
                </defs>

                {/* Suspension Wire */}
                <line x1="100" y1="0" x2="100" y2="50" stroke="#333" strokeWidth="2" />
                <circle cx="100" cy="50" r="4" fill="#555" />

                {/* Back Ears */}
                <path d="M45 80 Q 30 50 65 60 Z" fill="url(#glassGradient)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />
                <path d="M155 80 Q 170 50 135 60 Z" fill="url(#glassGradient)" stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" />

                {/* Darker Background of Sphere (Inside shadow) */}
                <circle cx="100" cy="130" r="78" fill="rgba(0,0,0,0.3)" />

                {/* STATIC MONEY PILE */}
                <g clipPath="url(#pigClip)">
                    {cashPile.map((cash) => (
                        <rect 
                            key={cash.id}
                            x={cash.x} 
                            y={cash.y} 
                            width={cash.width} 
                            height={cash.height} 
                            fill={cash.fill} 
                            stroke={cash.stroke}
                            strokeWidth="0.2"
                            transform={`rotate(${cash.rot} ${cash.x + cash.width/2} ${cash.y + cash.height/2})`}
                            opacity="0.9"
                        />
                    ))}
                </g>

                {/* Main Glass Body */}
                <circle cx="100" cy="130" r="80" fill="url(#glassGradient)" stroke="rgba(255,255,255,0.3)" strokeWidth="1" />
                
                {/* Reflections/Highlights on Glass */}
                <ellipse cx="70" cy="90" rx="40" ry="25" transform="rotate(-45 70 90)" fill="url(#reflection)" />
                <path d="M 160 160 Q 140 190 100 195" stroke="rgba(255,255,255,0.2)" strokeWidth="3" fill="none" strokeLinecap="round" />

                {/* Snout */}
                <g transform="translate(100, 145)">
                   <ellipse cx="0" cy="0" rx="22" ry="16" fill="rgba(255,255,255,0.15)" stroke="rgba(255,255,255,0.5)" strokeWidth="1" />
                   <circle cx="-8" cy="0" r="3.5" fill="rgba(255,255,255,0.6)" />
                   <circle cx="8" cy="0" r="3.5" fill="rgba(255,255,255,0.6)" />
                </g>
             </svg>
        </div>

        {/* LEADING TEAM BADGE */}
        <div className="absolute -bottom-10 z-20 flex flex-col items-center animate-slide-up">
            <div className="bg-squid-dark/90 backdrop-blur-md border border-gray-700 shadow-[0_0_25px_rgba(0,0,0,0.6)] px-8 py-3 rounded-sm flex flex-col items-center">
                 <span className="text-[10px] text-gray-500 font-mono uppercase tracking-[0.3em] mb-1">Current Leader</span>
                 {isTie ? (
                     <span className="text-white font-display text-xl tracking-widest">TIED MATCH</span>
                 ) : (
                     <span 
                        className="text-2xl md:text-3xl font-display font-bold uppercase tracking-widest drop-shadow-md"
                        style={{ color: TEAM_CONFIG[leader.color].hex, textShadow: `0 0 10px ${TEAM_CONFIG[leader.color].hex}40` }}
                     >
                        {leader.color}
                     </span>
                 )}
            </div>
            <div className="w-px h-6 bg-gray-700 -mt-1"></div>
        </div>
        </div>
      )}

      {/* SCORE MODE TOGGLE BUTTON */}
      <div className="flex justify-center mb-4 relative z-10">
        <button
          onClick={() => setShowTotalScore(!showTotalScore)}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 hover:border-gray-500 text-gray-300 hover:text-white font-mono text-sm uppercase tracking-widest rounded transition-colors"
        >
          {showTotalScore ? 'Total Score' : 'Avg Score'}
        </button>
      </div>

      {/* TEAM BARS */}
      <div className={`grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 px-4 h-[350px] items-end relative z-10 ${condensed ? 'pt-2' : 'pt-10'}`}>
        {teams.map((team) => {
           const score = getScoreValue(team);
           const animatedScore = displayScores[team.color] ?? score;
           const roundedScore = Math.round(animatedScore);
           const rawPercent = (animatedScore - scaleMin) / visualRange;
           const heightPercent = Math.min(Math.max(rawPercent * 100, 2), 100); // Clamp 2%-100%
           const isLeader = leader && team.color === leader.color && !isTie;
           
           return (
             <div key={team.color} className="flex flex-col h-full justify-end group relative">
               <div
                 className="text-center font-display text-2xl mb-2 transition-all"
                 style={{ color: TEAM_CONFIG[team.color].hex, textShadow: `0 0 18px ${TEAM_CONFIG[team.color].hex}` }}
                 title={`${showTotalScore ? 'Total' : 'Average'}: ${showTotalScore ? animatedScore.toFixed(0) : formatAverageScore(animatedScore)}`}
               >
                 {roundedScore}
               </div>
               <div className="relative w-full h-full flex flex-col justify-end">
                 {isLeader && (
                   <>
                     <div
                       className="absolute inset-x-[-10px] bottom-0 top-auto h-full pointer-events-none opacity-40"
                       style={{
                         background: `radial-gradient(circle at 50% 100%, ${TEAM_CONFIG[team.color].hex}55, transparent 60%)`,
                         filter: 'blur(20px)'
                       }}
                     />
                     <div
                       className="leader-beam absolute left-1/2 -translate-x-1/2 bottom-0 w-1.5 rounded-full"
                       style={{
                         height: `${heightPercent}%`,
                         background: `linear-gradient(180deg, #fff, ${TEAM_CONFIG[team.color].hex})`,
                         boxShadow: `0 0 15px ${TEAM_CONFIG[team.color].hex}`
                       }}
                     />
                   </>
                 )}
                 <div className="w-full relative bg-gray-900/50 rounded-t-lg border-x border-t border-gray-700 overflow-hidden flex flex-col justify-end transition-all duration-1000" style={{ height: '100%' }}>
                   <div 
                      className="w-full transition-all duration-1000 ease-out relative"
                      style={{ height: `${heightPercent}%`, backgroundColor: TEAM_CONFIG[team.color].hex }}
                   >
                      <div className="absolute inset-0 bg-white/12 bg-[linear-gradient(135deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:12px_12px]"></div>
                      <div className="absolute top-0 left-0 right-0 h-4 bg-white/40 blur-sm"></div>
                   </div>
                 </div>
               </div>
                <div className={`mt-3 py-2 text-center text-xs font-bold uppercase tracking-widest ${TEAM_CONFIG[team.color].bg} text-white rounded-b-sm`}>
                   {team.color.split(' ')[0]}
                </div>
             </div>
           );
        })}
      </div>
    </div>
  );
};
