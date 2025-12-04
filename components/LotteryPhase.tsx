import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { Player, Team, TeamColor, Gender } from '../types';
import { TEAM_CONFIG } from '../constants';
import { Button } from './Button';

const HUD_TOP_OFFSET = 80; // keeps HUD from covering the floating logo layer

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
  const [decoyIds, setDecoyIds] = useState<string[]>([]);
  const [lockedPlayers, setLockedPlayers] = useState<Player[]>([]);
  
  // Audio Refs
  const tickAudioRef = useRef<HTMLAudioElement | null>(null);
  const boomAudioRef = useRef<HTMLAudioElement | null>(null);
  const rollingAudioRef = useRef<HTMLAudioElement | null>(null);

  // Initialize Audio & Maps
  useEffect(() => {
    tickAudioRef.current = new Audio('https://files.catbox.moe/eny100.mp3');
    tickAudioRef.current.volume = 0.3;
    
    boomAudioRef.current = new Audio('https://files.catbox.moe/729555.mp3');
    boomAudioRef.current.volume = 0.6;
    
    rollingAudioRef.current = new Audio('https://files.catbox.moe/d8ddtx.mp3');
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
       
       // Update visual map immediately
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
       let rollingAudioPlayed = false;

       const processDraft = async () => {
          // Total needed for this batch
          const totalNeeded = draftQueue.length;
          let currentLockIndex = 0;

          // Start Rolling Audio & Logic - Only play once
          if (!isMuted && rollingAudioRef.current && !rollingAudioPlayed) {
            rollingAudioRef.current.currentTime = 0;
            const playPromise = rollingAudioRef.current.play();
            playPromise.catch(() => {});
            rollingAudioPlayed = true;
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
              const pctComplete = currentLockIndex / totalNeeded;
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

  // Sort players for the grid (stable order)
  const sortedPlayers = useMemo(() => {
      return [...players].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const tileLayout = useMemo(() => {
      const tileSize = 100;
      const tileGap = 8;
      const diag = tileSize * Math.SQRT2;
      const spacingX = diag + tileGap;
      const spacingY = (diag / 2) + (tileGap / 2);
      const aspectRatio = 1; // widen formation so the wall stretches left/right
      const ensuredCount = Math.max(sortedPlayers.length, 1);
      const cols = Math.max(1, Math.ceil(Math.sqrt(ensuredCount * aspectRatio)));
      const rows = Math.max(1, Math.ceil(sortedPlayers.length / cols));

      const halfDiag = diag / 2;
      const positions = sortedPlayers.map((player, index) => {
          const row = Math.floor(index / cols);
          const col = index % cols;
          let x = col * spacingX;
          const y = row * spacingY;
          if (row % 2 !== 0) {
              x += spacingX / 2;
          }
          return { player, index, x: x + halfDiag, y: y + halfDiag };
      });

      const totalWidth = Math.max(diag, cols * spacingX + diag);
      const totalHeight = Math.max(diag, rows * spacingY + diag);

      return { tileSize, positions, totalWidth, totalHeight };
  }, [sortedPlayers]);

  // --- INTERACTIVE GRID LOGIC ---
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  
  // View State (Mutable for performance)
  const viewState = useRef({
      scale: 1,
      pointX: 0,
      pointY: 0,
      panning: false,
      startX: 0,
      startY: 0
  });

  const updateTransform = () => {
      if (worldRef.current) {
          const { scale, pointX, pointY } = viewState.current;
          worldRef.current.style.transform = `translate(${pointX}px, ${pointY}px) scale(${scale})`;
      }
  };

  const resetView = useCallback(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const { width, height } = viewport.getBoundingClientRect();
      if (!width || !height) return;

      const worldWidth = tileLayout.totalWidth || 1;
      const worldHeight = tileLayout.totalHeight || 1;
      const paddingRatio = 0.85; // leave breathing room on edges
      const fitScale = Math.max(
          0.1,
          Math.min(width / worldWidth, height / worldHeight) * paddingRatio
      );
      const clampedScale = Math.min(fitScale, 5);

      const pointX = (width - worldWidth * clampedScale) / 2;
      const pointY = (height - worldHeight * clampedScale) / 2;

      viewState.current = {
          scale: clampedScale,
          pointX,
          pointY,
          panning: false,
          startX: 0,
          startY: 0
      };
      updateTransform();
  }, [tileLayout.totalWidth, tileLayout.totalHeight]);

  // Initial Center on Mount
  useLayoutEffect(() => {
      // Small delay to ensure layout is computed
      const timer = setTimeout(() => {
          resetView();
      }, 100);
      return () => clearTimeout(timer);
  }, [resetView]);

  // Attach Event Listeners
  useEffect(() => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const onWheel = (e: WheelEvent) => {
          e.preventDefault();
          const state = viewState.current;
          const xs = (e.clientX - state.pointX) / state.scale;
          const ys = (e.clientY - state.pointY) / state.scale;
          
          const delta = -e.deltaY;
          (delta > 0) ? (state.scale *= 1.1) : (state.scale /= 1.1);
          state.scale = Math.min(Math.max(0.1, state.scale), 5);

          state.pointX = e.clientX - xs * state.scale;
          state.pointY = e.clientY - ys * state.scale;
          updateTransform();
      };

      const onMouseDown = (e: MouseEvent) => {
          const state = viewState.current;
          state.panning = true;
          state.startX = e.clientX - state.pointX;
          state.startY = e.clientY - state.pointY;
          viewport.style.cursor = 'grabbing';
      };

      const onMouseMove = (e: MouseEvent) => {
          const state = viewState.current;
          if (!state.panning) return;
          e.preventDefault();
          state.pointX = e.clientX - state.startX;
          state.pointY = e.clientY - state.startY;
          updateTransform();
      };

      const onMouseUp = () => {
          viewState.current.panning = false;
          viewport.style.cursor = 'grab';
      };

      viewport.addEventListener('wheel', onWheel, { passive: false });
      viewport.addEventListener('mousedown', onMouseDown);
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);

      return () => {
          viewport.removeEventListener('wheel', onWheel);
          viewport.removeEventListener('mousedown', onMouseDown);
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
      };
  }, []);


    return (
        <div className="flex-1 self-stretch w-full min-h-0 flex flex-col bg-[#1a1a1a] relative overflow-hidden font-mono">
       
       {/* VIEWPORT */}
         <div 
          ref={viewportRef}
          id="viewport"
             className="flex-1 min-h-0 w-full overflow-hidden cursor-grab flex justify-center items-center relative z-0"
       >
           {players.length === 0 && (
               <div className="absolute inset-0 flex items-center justify-center text-gray-500 font-mono z-50 pointer-events-none">
                   NO PLAYERS DETECTED
               </div>
           )}
           {/* WORLD */}
              <div 
                  ref={worldRef}
                  id="world"
                  className="origin-top-left absolute will-change-transform"
                  style={{
                        width: `${tileLayout.totalWidth}px`,
                        height: `${tileLayout.totalHeight}px`,
                        top: 0,
                        left: 0
                  }}
              >
               <div
                  ref={gridRef}
                  id="grid"
                  className="absolute top-0 left-0"
                  style={{
                      width: `${tileLayout.totalWidth}px`,
                      height: `${tileLayout.totalHeight}px`
                  }}
               >
                   {tileLayout.positions.map(({ player, index, x, y }) => {
                        const isAssigned = !!assignedMap[player.id];
                        const teamColor = assignedMap[player.id];
                        const isDecoy = decoyIds.includes(player.id);
                        
                        // Determine Style
                        let bgStyle = { backgroundColor: '#2e2e2e' };
                        let nameClass = "text-[#00fff2]";
                        let numberClass = "text-[#00fff2]";
                        let genderClass = "text-gray-500";
                        let shadowClass = "shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]";
                        let borderClass = "border border-[#444]";
                        let zIndex = "z-0";
                        
                        if (isAssigned) {
                            const config = TEAM_CONFIG[teamColor];
                            bgStyle = { backgroundColor: config.hex };
                            nameClass = "text-white";
                            numberClass = "text-white";
                            genderClass = "text-white/70";
                            shadowClass = "shadow-[0_0_20px_rgba(255,255,255,0.6)]";
                            borderClass = "border border-white";
                            zIndex = "z-10";
                        } else if (isDecoy) {
                            bgStyle = { backgroundColor: '#fff' };
                            nameClass = "text-squid-pink";
                            numberClass = "text-squid-pink";
                            genderClass = "text-squid-pink/80";
                            shadowClass = "shadow-[0_0_25px_rgba(237,27,118,0.8)]";
                            zIndex = "z-20";
                        }
                        
                        if (!isAssigned && !isDecoy) {
                            genderClass = "text-blue-200/70";
                        }

                        return (
                            <div 
                                key={player.id}
                                className={`
                                    absolute w-[120px] h-[120px] transition-all duration-300
                                    ${shadowClass} ${borderClass} ${zIndex}
                                    hover:bg-[#444] hover:z-30 hover:shadow-[0_0_15px_#00fff2]
                                `}
                                style={{
                                    ...bgStyle,
                                    left: `${x}px`,
                                    top: `${y}px`,
                                    width: `${tileLayout.tileSize}px`,
                                    height: `${tileLayout.tileSize}px`,
                                    transform: 'translate(-50%, -50%) rotate(45deg)'
                                }}
                            >
                                {/* CONTENT (Counter-Rotated) */}
                                <div className="absolute inset-0 flex flex-col justify-center items-center gap-1 pointer-events-none transform -rotate-45 px-2 text-center">
                                    <div className={`text-[10px] uppercase tracking-[0.3em] ${genderClass}`}>
                                        {player.gender}
                                    </div>
                                    <div className={`font-display text-base leading-tight uppercase ${nameClass}`}>
                                        {player.name}
                                    </div>
                                    <div className={`font-bold text-lg leading-none ${numberClass} drop-shadow-[0_0_5px_currentColor]`}>
                                        {String(index + 1).padStart(3, '0')}
                                    </div>
                                </div>
                            </div>
                        );
                   })}
               </div>
           </div>
       </div>

       {/* UI CONTROLS */}
       <div className="fixed bottom-5 right-5 flex gap-2 z-50">
            <button 
                onClick={resetView}
                className="px-4 py-2 bg-[#333] text-white border border-[#555] hover:bg-[#444] font-bold text-sm uppercase tracking-wider"
            >
                Reset View
            </button>
       </div>

       {/* Control Header (Overlay) */}
         <div 
             className="fixed left-0 w-full h-24 pointer-events-none flex items-center justify-between px-8 z-40 bg-gradient-to-b from-black/80 to-transparent"
             style={{ top: HUD_TOP_OFFSET }}
         >
            <div className="flex flex-col pointer-events-auto">
               <div className="text-gray-500 text-xs font-mono tracking-[0.2em] mb-1">SURVIVORS</div>
               <div className="text-white font-display text-4xl tracking-widest drop-shadow-md">
                   <span className="text-squid-pink">{unassignedPlayers.length}</span><span className="text-gray-500 mx-2">/</span>{players.length}
               </div>
            </div>

            <div className="flex items-center gap-4 pointer-events-auto">
               {phase === 'DRAFTING' && currentTeamColor ? (
                   <div className="flex items-center gap-4 px-8 py-3 bg-black/80 backdrop-blur border-l-4 border-r-4 rounded-sm" style={{ borderColor: TEAM_CONFIG[currentTeamColor].hex }}>
                      <div className="flex flex-col items-end">
                          <span className="text-[10px] text-gray-400 uppercase tracking-widest mb-1">RECRUITING</span>
                          <span className="text-3xl font-display uppercase leading-none" style={{ color: TEAM_CONFIG[currentTeamColor].hex }}>
                             {currentTeamColor}
                          </span>
                      </div>
                      <div className="h-10 w-px bg-gray-700"></div>
                      <div className="animate-pulse">
                          <span className="text-white font-mono text-xl">{draftQueue.length - lockedPlayers.length}</span>
                      </div>
                   </div>
                ) : (
                   unassignedPlayers.length > 0 && phase !== 'SUMMARY' && (
                      <div className="flex gap-4">
                        <Button onClick={startNextTeam} className="py-3 px-8 text-lg shadow-[0_0_20px_rgba(237,27,118,0.3)] hover:shadow-[0_0_30px_rgba(237,27,118,0.6)] hover:scale-105 transition-all border-2 border-squid-pink bg-black/50 hover:bg-squid-pink text-white backdrop-blur-sm">
                          INITIATE
                        </Button>
                        {unassignedPlayers.length > 5 && (
                          <Button onClick={quickFinish} variant="secondary" className="py-3 px-6 text-sm bg-black/50 border border-gray-700 hover:bg-gray-800 text-gray-400 backdrop-blur-sm">
                             AUTO
                          </Button>
                        )}
                      </div>
                   )
                )}
            </div>
       </div>

       {/* SUMMARY SCREEN OVERLAY */}
       {phase === 'SUMMARY' && currentTeamColor && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-fade-in">
             <div className="relative w-full max-w-6xl bg-black border border-gray-800 shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[90vh] animate-slam">
                
                {/* Header */}
                <div className={`w-full py-8 ${TEAM_CONFIG[currentTeamColor].bg} flex justify-center items-center shadow-lg relative overflow-hidden`}>
                    <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-30"></div>
                    <h1 className="font-display text-5xl md:text-7xl text-white uppercase drop-shadow-[0_4px_8px_rgba(0,0,0,0.5)] tracking-[0.2em] relative z-10">
                        {currentTeamColor}
                    </h1>
                </div>
                
                {/* Tight Grid Summary */}
                <div className="p-8 flex flex-col items-center bg-black relative flex-1 overflow-hidden">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 via-black to-black opacity-50"></div>
                    
                    <div className="flex flex-wrap justify-center gap-4 w-full overflow-y-auto px-4 py-8 custom-scrollbar relative z-10">
                        {lockedPlayers.map((p, i) => (
                            <div 
                                key={p.id} 
                                className="relative w-24 h-24 md:w-32 md:h-32 flex items-center justify-center animate-pop-in"
                                style={{ animationDelay: `${i * 50}ms`, animationFillMode: 'backwards' }}
                            >
                                <div className={`
                                    absolute inset-0 transform rotate-45 border-2 overflow-hidden shadow-lg
                                    ${TEAM_CONFIG[currentTeamColor].bg} border-white
                                `}>
                                    <div className="absolute inset-0 transform -rotate-45 flex flex-col items-center justify-center text-white">
                                        <span className="font-mono text-3xl font-bold leading-none mb-1 drop-shadow-md">
                                            {String(sortedPlayers.findIndex(sp => sp.id === p.id) + 1).padStart(3, '0')}
                                        </span>
                                        <span className="text-[10px] font-display uppercase tracking-wider text-center px-1 leading-tight">
                                            {p.name}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="mt-8 relative z-20 pb-4">
                         <Button onClick={confirmTeam} className="px-20 py-5 text-2xl shadow-[0_0_40px_rgba(255,255,255,0.2)] animate-pulse border-2 border-white bg-transparent hover:bg-white hover:text-black transition-colors">
                            CONFIRM
                         </Button>
                    </div>
                </div>
             </div>
          </div>
       )}

    </div>
  );
};
