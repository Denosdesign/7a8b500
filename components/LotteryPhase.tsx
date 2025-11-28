
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Player, Team, TeamColor, Gender } from '../types';
import { TEAM_CONFIG, Icons } from '../constants';
import { Button } from './Button';

export const LotteryPhase: React.FC<{
  players: Player[]; // All registered players
  initialTeams: Team[];
  onComplete: (teams: Team[]) => void;
  isMuted: boolean;
}> = ({ players, initialTeams, onComplete, isMuted }) => {
  // Logical pools
  const [unassignedPlayers, setUnassignedPlayers] = useState<Player[]>(players);
  const [teams, setTeams] = useState<Team[]>(initialTeams);
  
  // Visual Map: PlayerID -> TeamColor (if assigned)
  const [assignedMap, setAssignedMap] = useState<Record<string, TeamColor>>({});

  // Animation State
  const [currentTeamColor, setCurrentTeamColor] = useState<TeamColor | null>(null);
  const [teamQueue, setTeamQueue] = useState<TeamColor[]>(Object.values(TeamColor));
  const [phase, setPhase] = useState<'IDLE' | 'DRAFTING' | 'SUMMARY'>('IDLE');
  
  // Drafting Logic
  const [draftQueue, setDraftQueue] = useState<Player[]>([]);
  // We now need to track WHICH players are "decoy" highlighted (rolling) vs locked
  const [decoyIds, setDecoyIds] = useState<string[]>([]);
  const [lockedPlayers, setLockedPlayers] = useState<Player[]>([]);
  
  // Audio Refs
  const tickAudioRef = useRef<HTMLAudioElement | null>(null);
  const boomAudioRef = useRef<HTMLAudioElement | null>(null);
  const rollingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Generate random visual properties AND positions
  const playerVisuals = useMemo(() => {
    const generated: Record<string, { 
       top: string; 
       left: string; 
       baseSize: string; 
       rotation: number; 
       font: string;
       floatDuration: string;
       floatDelay: string;
       animationName: string;
       shapeType: 'circle' | 'triangle' | 'square';
    }> = {};

    const positions: {x: number, y: number}[] = [];
    const minDistance = 5; // roughly 5% distance
    
    // Seeded-ish randomness helper
    const pseudoRandom = (seed: number) => {
      const x = Math.sin(seed++) * 10000;
      return x - Math.floor(x);
    };

    players.forEach((p, index) => {
      // Generate Position
      let bestPos = { x: Math.random() * 85 + 5, y: Math.random() * 80 + 10 };
      let bestDist = 0;

      // Try 10 times to find a clear spot
      for(let i=0; i<10; i++) {
         const x = Math.random() * 85 + 5;
         const y = Math.random() * 80 + 10;
         
         // Distance to nearest
         let minDist = 100;
         for(const exist of positions) {
            const d = Math.sqrt(Math.pow(exist.x - x, 2) + Math.pow(exist.y - y, 2));
            if(d < minDist) minDist = d;
         }

         if(minDist > bestDist) {
            bestDist = minDist;
            bestPos = { x, y };
         }
         if(bestDist > minDistance) break;
      }
      positions.push(bestPos);

      // Generate Styling
      const seed = p.id.charCodeAt(0) + index;
      // MUCH LARGER SIZES for readability
      const sizeIndex = Math.floor(pseudoRandom(seed) * 4);
      const sizes = ['text-xs', 'text-sm', 'text-base', 'text-lg'];

      const rotation = (pseudoRandom(seed + 1) * 60) - 30; // -30 to 30 deg
      const font = pseudoRandom(seed + 2) > 0.4 ? 'font-display' : 'font-mono';
      
      // Float Animation params
      const floatDuration = 5 + pseudoRandom(seed + 3) * 10; // 5-15s
      const floatDelay = pseudoRandom(seed + 4) * -10; // Negative delay for instant start variance
      const animType = ['animate-float-slow', 'animate-float-medium', 'animate-float-fast'][Math.floor(pseudoRandom(seed+5) * 3)];
      const shapeType = (['circle', 'triangle', 'square'] as const)[Math.floor(pseudoRandom(seed + 6) * 3)];

      generated[p.id] = {
        top: `${bestPos.y}%`,
        left: `${bestPos.x}%`,
        baseSize: sizes[sizeIndex],
        rotation,
        font,
        floatDuration: `${floatDuration}s`,
        floatDelay: `${floatDelay}s`,
        animationName: animType,
        shapeType
      };
    });

    return generated;
  }, [players]);

  // Initialize Audio & Maps
  useEffect(() => {
    tickAudioRef.current = new Audio('/7a8b500/assets/Round and Round.mp3');
    tickAudioRef.current.volume = 0.3;
    
    boomAudioRef.current = new Audio('/7a8b500/assets/Round and Round.mp3');
    boomAudioRef.current.volume = 0.6;
    
    rollingAudioRef.current = new Audio('/7a8b500/assets/Round and Round.mp3');
    rollingAudioRef.current.volume = 0.5;
    rollingAudioRef.current.loop = false;

    // Sync initial map if resuming
    const map: Record<string, TeamColor> = {};
    initialTeams.forEach(t => {
      t.members.forEach(m => map[m.id] = t.color);
    });
    // Remove assigned from unassigned
    const assignedIds = new Set(Object.keys(map));
    setUnassignedPlayers(players.filter(p => !assignedIds.has(p.id)));
    setAssignedMap(map);
  }, [players, initialTeams]);

  // --- Logic: Pick Players ---
  const pickBatch = (pool: Player[], color: TeamColor): Player[] => {
    const males = pool.filter(p => p.gender === Gender.Male);
    const females = pool.filter(p => p.gender === Gender.Female);
    const nbs = pool.filter(p => p.gender === Gender.NonBinary);
    
    // Remaining teams count
    const teamsLeft = Object.values(TeamColor).length - Object.values(TeamColor).indexOf(color);
    
    const targetM = Math.ceil(males.length / teamsLeft);
    const targetF = Math.ceil(females.length / teamsLeft);
    const targetNB = Math.ceil(nbs.length / teamsLeft);

    const shuffle = (arr: Player[]) => [...arr].sort(() => Math.random() - 0.5);
    
    let batch = [
      ...shuffle(males).slice(0, targetM),
      ...shuffle(females).slice(0, targetF),
      ...shuffle(nbs).slice(0, targetNB)
    ];
    
    // Fill remainder
    if (batch.length < Math.floor(pool.length / teamsLeft)) {
       const usedIds = new Set(batch.map(p => p.id));
       const remainder = shuffle(pool.filter(p => !usedIds.has(p.id)));
       const needed = Math.floor(pool.length / teamsLeft) - batch.length;
       batch = [...batch, ...remainder.slice(0, needed)];
    }
    
    if (teamsLeft === 1) return pool;
    return batch;
  };

  const startNextTeam = () => {
    if (unassignedPlayers.length === 0) {
      onComplete(teams);
      return;
    }
    const nextColor = teamQueue.find(c => teams.find(t => t.color === c)?.members.length === 0);
    if (!nextColor) {
      onComplete(teams);
      return;
    }
    setCurrentTeamColor(nextColor);

    // Check if this is the last team (only 1 remaining empty team including this one)
    const remainingCount = teamQueue.filter(c => teams.find(t => t.color === c)?.members.length === 0).length;
    
    if (remainingCount === 1) {
       // --- LAST TEAM LOGIC: Skip Rolling, Group Immediately ---
       const winners = unassignedPlayers;
       setDraftQueue(winners);
       setLockedPlayers(winners);
       
       // Update visual map immediately so background names disappear
       setAssignedMap(prev => {
         const m = { ...prev };
         winners.forEach(p => m[p.id] = nextColor);
         return m;
       });

       setUnassignedPlayers([]);
       setPhase('SUMMARY');

       // Play boom effect for the group slam
       if (!isMuted && boomAudioRef.current) {
          boomAudioRef.current.currentTime = 0;
          boomAudioRef.current.play().catch(() => {});
       }
    } else {
       // --- NORMAL TEAM LOGIC: Rolling Animation ---
       const winners = pickBatch(unassignedPlayers, nextColor);
       setDraftQueue(winners);
       setLockedPlayers([]);
       setPhase('DRAFTING');
    }
  };

  // --- Animation Loop ---
  useEffect(() => {
    if (phase === 'DRAFTING' && draftQueue.length > 0) {
       let isCancelled = false;

       const processDraft = async () => {
          // Total needed for this batch
          const totalNeeded = draftQueue.length;
          let currentLockIndex = 0;

          // Start Rolling Audio & Logic
          if (!isMuted && rollingAudioRef.current) {
            rollingAudioRef.current.currentTime = 0;
            const playPromise = rollingAudioRef.current.play();
            playPromise.catch(() => {});
          }

          // CHAOS INTERVAL: Background function to flicker random names
          const chaosInterval = setInterval(() => {
              if (isCancelled) return;
              
              const neededDecoys = totalNeeded - currentLockIndex;
              if (neededDecoys <= 0) {
                  setDecoyIds([]);
                  return;
              }

              // Pick random unassigned, unlocked players to flash
              // We need to exclude players that are already locked
              const lockedIds = new Set(draftQueue.slice(0, currentLockIndex).map(p => p.id));
              const available = unassignedPlayers.filter(p => !lockedIds.has(p.id));
              
              const shuffled = [...available].sort(() => Math.random() - 0.5);
              const nextDecoys = shuffled.slice(0, neededDecoys).map(p => p.id);
              
              setDecoyIds(nextDecoys);

              if (!isMuted && tickAudioRef.current) {
                 const clone = tickAudioRef.current.cloneNode() as HTMLAudioElement;
                 clone.playbackRate = 1.0 + Math.random();
                 clone.volume = 0.2;
                 clone.play().catch(() => {});
              }
          }, 100); // Fast flicker

          // SEQUENCE LOGIC
          
          // 1. Initial "Long Roll" - Wait for audio to END to build maximum tension
          if (!isMuted && rollingAudioRef.current) {
             await new Promise<void>(resolve => {
                if(!rollingAudioRef.current) return resolve();
                
                // Fallback timeout in case audio is blocked or fails
                const fallback = setTimeout(resolve, 4500);
                
                rollingAudioRef.current.onended = () => {
                   clearTimeout(fallback);
                   resolve();
                };
                
                // If audio is already finished (unlikely) or very short
                if (rollingAudioRef.current.paused && rollingAudioRef.current.currentTime > 0 && rollingAudioRef.current.ended) {
                    clearTimeout(fallback);
                    resolve();
                }
             });
          } else {
             // Fallback wait if muted
             await new Promise(r => setTimeout(r, 2500));
          }

          // 2. Lock players one by one
          while (currentLockIndex < totalNeeded) {
              if (isCancelled) break;

              const winner = draftQueue[currentLockIndex];
              
              // Lock the winner
              setLockedPlayers(prev => [...prev, winner]);
              setAssignedMap(prev => ({ ...prev, [winner.id]: currentTeamColor! }));
              
              // Play Boom
              if (!isMuted && boomAudioRef.current) {
                boomAudioRef.current.currentTime = 0;
                boomAudioRef.current.play().catch(() => {});
              }
              
              // Increment index before waiting
              currentLockIndex++;

              // DYNAMIC DELAY (Speed Curve)
              // Calculate completion percentage (0 to 1)
              const pctComplete = currentLockIndex / totalNeeded;
              // Exponential acceleration: Starts slow, gets much faster
              // Delay ranges from ~1500ms down to ~200ms
              const delay = Math.max(200, 1500 * (1 - Math.pow(pctComplete, 1.5)));
              
              await new Promise(r => setTimeout(r, delay)); 
          }

          clearInterval(chaosInterval);
          setDecoyIds([]); // Clear any flashing
          
          if (!isCancelled) {
              await new Promise(r => setTimeout(r, 500)); // Short pause before slam
              setPhase('SUMMARY');
              setUnassignedPlayers(prev => prev.filter(p => !draftQueue.find(w => w.id === p.id)));
          }
       };

       processDraft();
       return () => { 
         isCancelled = true;
         if (rollingAudioRef.current) rollingAudioRef.current.pause();
       };
    }
  }, [phase, draftQueue, unassignedPlayers, isMuted, currentTeamColor]);


  const confirmTeam = () => {
    if (!currentTeamColor) return;
    const newTeams = teams.map(t => t.color === currentTeamColor ? { ...t, members: lockedPlayers } : t);
    setTeams(newTeams);
    
    if (unassignedPlayers.length === 0) {
      onComplete(newTeams);
    } else {
      setCurrentTeamColor(null);
      setLockedPlayers([]);
      setPhase('IDLE');
    }
  };

  const quickFinish = () => {
      let currentPool = [...unassignedPlayers];
      let currentTeams = [...teams];
      const remainingColors = teamQueue.filter(c => currentTeams.find(t => t.color === c)?.members.length === 0);
      remainingColors.forEach((color, index) => {
         const isLast = index === remainingColors.length - 1;
         const winners = isLast ? currentPool : pickBatch(currentPool, color);
         currentTeams = currentTeams.map(t => t.color === color ? { ...t, members: winners } : t);
         const winnerIds = new Set(winners.map(w => w.id));
         currentPool = currentPool.filter(p => !winnerIds.has(p.id));
      });
      setTeams(currentTeams);
      setUnassignedPlayers([]);
      onComplete(currentTeams);
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-center relative flex-1">
       
       {/* FULL SCREEN FLOATING NAME CANVAS */}
        <div className="fixed inset-0 z-0 overflow-hidden pointer-events-none">
            {players.map(player => {
                const isAssigned = !!assignedMap[player.id];
                const isLocked = lockedPlayers.some(lp => lp.id === player.id);
                const isLastLocked = lockedPlayers.length > 0 && lockedPlayers[lockedPlayers.length - 1].id === player.id;
                const isDecoy = decoyIds.includes(player.id);
                const visual = playerVisuals[player.id];
                
                if (!visual) return null;

                if (isAssigned && !isLocked) return null;
                if (phase === 'SUMMARY' && isLocked) return null; 

                const isInactive = phase === 'DRAFTING' && !isLocked && !isDecoy;

                return (
                <div 
                    key={player.id}
                    id={`player-${player.id}`}
                    className={`
                        absolute transition-all duration-300 ease-out flex flex-col items-center justify-center pointer-events-auto
                        ${isLocked
                            ? `z-50 scale-[4.0] md:scale-[6.0] transition-transform duration-500 ${isLastLocked ? 'animate-flash' : ''}`
                            : isDecoy
                            ? 'z-40 opacity-100 text-squid-pink' 
                            : `opacity-40 text-gray-500 ${isInactive ? 'opacity-30 blur-[0.5px]' : 'hover:opacity-100 hover:text-white hover:scale-150 hover:z-50 cursor-crosshair blur-0'}`
                        }
                    `}
                    style={{ 
                        top: visual.top,
                        left: visual.left,
                        transform: isLocked ? 'rotate(0deg)' : `rotate(${visual.rotation}deg)`,
                        animation: isLocked ? (isLastLocked ? undefined : 'none') : `float ${visual.floatDuration} ease-in-out infinite`,
                        animationDelay: visual.floatDelay,
                    }}
                >
                    {isLocked && (
                        <div className="absolute inset-0 flex items-center justify-center -z-10 pointer-events-none opacity-80 text-squid-pink animate-pulse">
                            {visual.shapeType === 'circle' && <Icons.Circle className="w-24 h-24" />}
                            {visual.shapeType === 'triangle' && <Icons.Triangle className="w-24 h-24" />}
                            {visual.shapeType === 'square' && <Icons.Square className="w-24 h-24" />}
                        </div>
                    )}

                    <div className={`
                        ${visual.font} font-bold leading-none text-center whitespace-nowrap transition-colors duration-200
                        ${isLocked
                            ? 'text-3xl md:text-6xl text-white drop-shadow-[0_0_30px_rgba(255,255,255,1)] font-display' 
                            : isDecoy
                            ? `text-squid-pink drop-shadow-[0_0_15px_rgba(237,27,118,1)] ${visual.baseSize}`
                            : visual.baseSize 
                        }
                    `}>
                        {player.name}
                    </div>
                </div>
                );
            })}
        </div>

       {/* Control Header */}
       {phase !== 'SUMMARY' && (
         <div className="fixed top-24 left-0 w-full z-40 px-8 md:px-12 flex justify-between items-end pointer-events-none">
            <div className="bg-black/80 backdrop-blur-md p-4 border-l-4 border-squid-pink pointer-events-auto shadow-[0_0_20px_rgba(0,0,0,0.5)]">
               <h2 className="text-2xl font-display text-white leading-none">Team Picker</h2>
               <p className="text-xs font-mono text-gray-400 mt-1">LEFT: {unassignedPlayers.length}</p>
            </div>

            <div className="pointer-events-auto flex flex-col items-end gap-2">
               {phase === 'DRAFTING' && currentTeamColor ? (
                   <div className="bg-black/80 backdrop-blur-md p-4 border-r-4 pointer-events-auto" style={{ borderColor: TEAM_CONFIG[currentTeamColor].hex }}>
                      <p className="text-[10px] font-mono text-gray-400 tracking-widest uppercase mb-1">RECRUITING FOR</p>
                      <h2 className="text-4xl font-display uppercase animate-pulse" style={{ color: TEAM_CONFIG[currentTeamColor].hex }}>
                         TEAM {currentTeamColor}
                      </h2>
                   </div>
                ) : (
                   unassignedPlayers.length > 0 && (
                      <div className="flex gap-4">
                        <Button onClick={startNextTeam} className="py-3 px-6 text-sm shadow-xl hover:scale-105 transition-transform">
                          INITIATE DRAFT
                        </Button>
                        {unassignedPlayers.length > 5 && (
                          <Button onClick={quickFinish} variant="secondary" className="py-3 px-6 text-sm bg-black/50 backdrop-blur-sm">
                             QUICK FINISH
                          </Button>
                        )}
                      </div>
                   )
                )}
            </div>
         </div>
       )}

       {/* SUMMARY SCREEN */}
       {phase === 'SUMMARY' && currentTeamColor && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
             <div className="relative w-full max-w-5xl bg-squid-dark border-2 border-white shadow-[0_0_50px_rgba(0,0,0,0.8)] overflow-hidden flex flex-col max-h-[90vh] animate-slam">
                
                <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-squid-pink z-20"></div>
                <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-squid-pink z-20"></div>
                <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-squid-pink z-20"></div>
                <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-squid-pink z-20"></div>

                <div className={`w-full py-6 ${TEAM_CONFIG[currentTeamColor].bg} flex justify-center items-center shadow-lg relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
                    <h1 className="font-display text-4xl md:text-6xl text-white uppercase drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)] tracking-widest relative z-10">
                        {currentTeamColor} TEAM
                    </h1>
                </div>
                
                <div className="p-8 flex flex-col items-center bg-squid-card relative flex-1">
                    <div className="absolute inset-0 opacity-5 bg-[linear-gradient(0deg,transparent_24%,rgba(255,255,255,.3)_25%,rgba(255,255,255,.3)_26%,transparent_27%,transparent_74%,rgba(255,255,255,.3)_75%,rgba(255,255,255,.3)_76%,transparent_77%,transparent),linear-gradient(90deg,transparent_24%,rgba(255,255,255,.3)_25%,rgba(255,255,255,.3)_26%,transparent_27%,transparent_74%,rgba(255,255,255,.3)_75%,rgba(255,255,255,.3)_76%,transparent_77%,transparent)] bg-[length:30px_30px]"></div>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 w-full overflow-y-auto px-4 py-2 custom-scrollbar relative z-10">
                        {lockedPlayers.map((p, i) => (
                            <div 
                                key={p.id} 
                                className="group relative bg-black border border-gray-700 p-4 flex flex-col items-center justify-center hover:border-white transition-all duration-300 animate-slide-up hover:shadow-[0_0_15px_rgba(255,255,255,0.3)]" 
                                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                            >
                                <div className="absolute top-1 left-1 w-1 h-1 bg-gray-500"></div>
                                <div className="absolute top-1 right-1 w-1 h-1 bg-gray-500"></div>
                                
                                <span className={`text-xl md:text-2xl font-display font-bold text-center leading-tight ${TEAM_CONFIG[currentTeamColor].text || 'text-white'}`}>
                                   {p.name}
                                </span>
                                <div className="mt-2 w-full h-px bg-gray-800"></div>
                                <span className="text-[10px] text-gray-500 mt-1 font-mono tracking-wider">{p.gender} // ID:{p.id.slice(0,4)}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-10 relative z-20 pb-4">
                         <Button onClick={confirmTeam} className="w-full md:w-auto px-16 py-4 text-xl shadow-[0_0_30px_rgba(237,27,118,0.4)] animate-pulse">
                            NEXT
                         </Button>
                    </div>
                </div>
             </div>
          </div>
       )}

    </div>
  );
};
