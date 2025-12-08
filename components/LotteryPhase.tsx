import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { Player, Team, TeamColor, Gender } from '../types';
import { TEAM_CONFIG } from '../constants';
import { Button } from './Button';

const HUD_TOP_OFFSET = 80; // keeps HUD from covering the floating logo layer

const TEAM_COLORS_LIST: TeamColor[] = Object.values(TeamColor);
const GENDER_KEYS: Gender[] = [Gender.Male, Gender.Female, Gender.NonBinary];

const createGenderCount = (): Record<Gender, number> => ({
    [Gender.Male]: 0,
    [Gender.Female]: 0,
    [Gender.NonBinary]: 0
});

const rotateArray = <T,>(arr: T[], offset: number): T[] => {
    if (arr.length === 0) return [];
    const normalized = ((offset % arr.length) + arr.length) % arr.length;
    return [...arr.slice(normalized), ...arr.slice(0, normalized)];
};

const shufflePlayers = (arr: Player[]): Player[] => [...arr].sort(() => Math.random() - 0.5);

// Build gender targets only from players WITH gender restrictions (not "0" marked)
// This determines how many M/F/NB each team should have (excluding flexible players)
const buildGenderTargets = (players: Player[]): Record<TeamColor, Record<Gender, number>> => {
    const template = TEAM_COLORS_LIST.reduce((acc, color) => {
        acc[color] = createGenderCount();
        return acc;
    }, {} as Record<TeamColor, Record<Gender, number>>);

    const colorCount = TEAM_COLORS_LIST.length;
    if (colorCount === 0) return template;

    // Only count players WITHOUT noGenderRestriction for gender distribution
    const genderRestrictedPlayers = players.filter(p => !p.noGenderRestriction);
    
    const genderTotals = genderRestrictedPlayers.reduce((acc, player) => {
        acc[player.gender] = (acc[player.gender] ?? 0) + 1;
        return acc;
    }, createGenderCount());

    GENDER_KEYS.forEach(gender => {
        const total = genderTotals[gender];
        if (total === 0) {
            TEAM_COLORS_LIST.forEach(color => {
                template[color][gender] = 0;
            });
            return;
        }

        const base = Math.floor(total / colorCount);
        const remainder = total % colorCount;
        TEAM_COLORS_LIST.forEach((color, idx) => {
            template[color][gender] = base + (idx < remainder ? 1 : 0);
        });
    });

    return template;
};


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
    const [teamQueue, setTeamQueue] = useState<TeamColor[]>(TEAM_COLORS_LIST);
  const [phase, setPhase] = useState<'IDLE' | 'FIRST_TEAM_INTRO' | 'DRAFTING' | 'SUMMARY' | 'NEXT_TEAM_PREVIEW' | 'LAST_TEAM_ASSIGN' | 'FINAL_RECAP'>('IDLE');
  const [lastTeamInfo, setLastTeamInfo] = useState<{ color: TeamColor; members: Player[] } | null>(null);
  const [introTeamColor, setIntroTeamColor] = useState<TeamColor | null>(null);
  
  // Drafting Logic
  const [draftQueue, setDraftQueue] = useState<Player[]>([]);
  const [decoyIds, setDecoyIds] = useState<string[]>([]);
  const [lockedPlayers, setLockedPlayers] = useState<Player[]>([]);
  
  // New: Slam animation & preview states
  const [slamPlayerId, setSlamPlayerId] = useState<string | null>(null);
  const [nextTeamColor, setNextTeamColor] = useState<TeamColor | null>(null);
  const [completedTeams, setCompletedTeams] = useState<Team[]>([]);

    const genderTargets = useMemo(() => buildGenderTargets(players), [players]);
    
    // Count total flexible players
    const flexiblePlayerCount = useMemo(() => players.filter(p => p.noGenderRestriction).length, [players]);
  
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
  // Flexible ("0" marked) players should go to teams that are SHORT on players
  // to fill empty slots in matchups
    const pickBatch = (pool: Player[], color: TeamColor, snapshotTeams: Team[]): Player[] => {
        const targetByGender = genderTargets[color] || createGenderCount();
        
        // Calculate base team size from gender targets (without flexible)
        const genderBasedSize = (Object.values(targetByGender) as number[]).reduce((sum, count) => sum + count, 0);
        
        const currentTeam = snapshotTeams.find(t => t.color === color);
        const assignedMembers = currentTeam?.members ?? [];

        // Count already assigned by gender (excluding flexible players)
        const assignedCounts = assignedMembers.reduce((acc, member) => {
            if (!member.noGenderRestriction) {
                acc[member.gender] = (acc[member.gender] ?? 0) + 1;
            }
            return acc;
        }, createGenderCount());

        const usedIds = new Set<string>();
        let batch: Player[] = [];

        // First, pick gender-restricted players to meet gender targets
        const neededCounts = GENDER_KEYS.reduce((acc, gender) => {
            acc[gender] = Math.max((targetByGender[gender] ?? 0) - (assignedCounts[gender] ?? 0), 0);
            return acc;
        }, createGenderCount());

        GENDER_KEYS.forEach(gender => {
            const needed = neededCounts[gender];
            if (needed <= 0) return;
            // Only pick non-flexible players for gender slots
            const available = pool.filter(p => p.gender === gender && !usedIds.has(p.id) && !p.noGenderRestriction);
            const picks = shufflePlayers(available).slice(0, needed);
            picks.forEach(player => {
                usedIds.add(player.id);
                assignedCounts[gender] = (assignedCounts[gender] ?? 0) + 1;
            });
            batch = batch.concat(picks);
        });

        // Calculate how many flexible players THIS team should get
        // Flexible players go to teams that will be SHORT (缺人)
        // We need to figure out if this team needs flexible players to match the max team size
        
        // Calculate what each team's gender-based size is
        const teamGenderSizes = TEAM_COLORS_LIST.map(c => {
            const target = genderTargets[c] || createGenderCount();
            return (Object.values(target) as number[]).reduce((sum, count) => sum + count, 0);
        });
        const maxGenderBasedSize = Math.max(...teamGenderSizes);
        
        // This team's shortage compared to max
        const thisTeamShortage = maxGenderBasedSize - genderBasedSize;
        
        // How many flexible players are available?
        const flexibleInPool = pool.filter(p => p.noGenderRestriction && !usedIds.has(p.id));
        
        // Assign flexible players to fill the shortage
        if (thisTeamShortage > 0 && flexibleInPool.length > 0) {
            const flexibleNeeded = Math.min(thisTeamShortage, flexibleInPool.length);
            const flexiblePicks = shufflePlayers(flexibleInPool).slice(0, flexibleNeeded);
            flexiblePicks.forEach(player => {
                usedIds.add(player.id);
            });
            batch = batch.concat(flexiblePicks);
        }

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
    
    // Check if this is the FIRST team (all teams are empty)
    const allTeamsEmpty = teams.every(t => t.members.length === 0);
    
    if (allTeamsEmpty) {
      // Show cinematic intro for first team, then auto-start
      setIntroTeamColor(nextColor);
      setPhase('FIRST_TEAM_INTRO');
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
    const winners = pickBatch(unassignedPlayers, nextColor, teams);
             if (winners.length === 0) {
                 setDraftQueue([]);
                 setLockedPlayers([]);
                 setPhase('SUMMARY');
                 return;
             }
             setDraftQueue(winners);
             setLockedPlayers([]);
             setPhase('DRAFTING');
    }
  };
  
  // Auto-transition from FIRST_TEAM_INTRO to DRAFTING
  useEffect(() => {
    if (phase === 'FIRST_TEAM_INTRO' && introTeamColor) {
      const timer = setTimeout(() => {
        setCurrentTeamColor(introTeamColor);
        const winners = pickBatch(unassignedPlayers, introTeamColor, teams);
        if (winners.length === 0) {
          setDraftQueue([]);
          setLockedPlayers([]);
          setPhase('SUMMARY');
          return;
        }
        setDraftQueue(winners);
        setLockedPlayers([]);
        setIntroTeamColor(null);
        setPhase('DRAFTING');
      }, 3500); // 3.5 seconds for cinematic reveal
      
      return () => clearTimeout(timer);
    }
  }, [phase, introTeamColor, unassignedPlayers, teams]);

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
              
              // Randomize how many to show (creates more dynamic flickering)
              const flickerCount = Math.max(1, Math.floor(neededDecoys * (0.5 + Math.random() * 0.5)));
              const shuffled = [...available].sort(() => Math.random() - 0.5);
              const nextDecoys = shuffled.slice(0, flickerCount).map(p => p.id);
              
              setDecoyIds(nextDecoys);

              if (!isMuted && tickAudioRef.current) {
                 const clone = tickAudioRef.current.cloneNode() as HTMLAudioElement;
                 clone.playbackRate = 0.8 + Math.random() * 0.6;
                 clone.volume = 0.15;
                 clone.play().catch(() => {});
              }
          }, 100); // Slightly faster for more excitement

          // SEQUENCE LOGIC
          
          // 1. Initial "Long Roll" - Wait for audio to END to build maximum tension
          if (!isMuted && rollingAudioRef.current) {
             await new Promise<void>(resolve => {
                if(!rollingAudioRef.current) return resolve();
                
                // Fallback timeout in case audio is blocked or fails
                const fallback = setTimeout(resolve, 1500);
                
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
             await new Promise(r => setTimeout(r, 800));
          }

          // 2. Lock players one by one
          while (currentLockIndex < totalNeeded) {
              if (isCancelled) break;

              const winner = draftQueue[currentLockIndex];
              const remainingAfterThis = totalNeeded - currentLockIndex;
              
              // SUSPENSE PAUSE for final 2 players
              if (remainingAfterThis <= 2 && totalNeeded > 2) {
                // Stop the chaos flickering momentarily
                setDecoyIds([]);
                
                // Dramatic pause - longer for the very last player
                const suspenseDuration = remainingAfterThis === 1 ? 1200 : 800;
                await new Promise(r => setTimeout(r, suspenseDuration));
                
                // Resume chaos briefly before lock
                if (remainingAfterThis > 1) {
                  const lockedIds = new Set(draftQueue.slice(0, currentLockIndex).map(p => p.id));
                  const available = unassignedPlayers.filter(p => !lockedIds.has(p.id));
                  const shuffled = [...available].sort(() => Math.random() - 0.5);
                  setDecoyIds(shuffled.slice(0, remainingAfterThis).map(p => p.id));
                  await new Promise(r => setTimeout(r, 300));
                }
              }
              
              // Lock the winner
              setLockedPlayers(prev => [...prev, winner]);
              setAssignedMap(prev => ({ ...prev, [winner.id]: currentTeamColor! }));
              
              // Trigger slam animation
              setSlamPlayerId(winner.id);
              
              // Play Boom
              if (!isMuted && boomAudioRef.current) {
                boomAudioRef.current.currentTime = 0;
                boomAudioRef.current.play().catch(() => {});
              }
              
              // Clear slam after animation
              setTimeout(() => setSlamPlayerId(null), 400);
              
              // Increment index before waiting
              currentLockIndex++;

              // DYNAMIC DELAY (Speed Curve) - Faster!
              const pctComplete = currentLockIndex / totalNeeded;
              const delay = Math.max(80, 500 * (1 - Math.pow(pctComplete, 1.5)));
              
              await new Promise(r => setTimeout(r, delay)); 
          }

          clearInterval(chaosInterval);
          setDecoyIds([]); // Clear any flashing
          
          if (!isCancelled) {
              await new Promise(r => setTimeout(r, 300)); // Short pause before summary
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
    let newTeams = teams.map(t => t.color === currentTeamColor ? { ...t, members: lockedPlayers } : t);
    
    // Track completed team for recap
    const completedTeam = newTeams.find(t => t.color === currentTeamColor);
    if (completedTeam) {
      setCompletedTeams(prev => [...prev, completedTeam]);
    }
    
    if (unassignedPlayers.length === 0) {
      // Show final recap before completing
      setTeams(newTeams);
      setPhase('FINAL_RECAP');
    } else {
      // Find next team color for preview
      const remainingColors = teamQueue.filter(c => newTeams.find(t => t.color === c)?.members.length === 0);
      
      if (remainingColors.length === 1) {
        // LAST TEAM: Show combined summary with both Pink (just confirmed) and Purple (auto-assigned)
        const lastTeamColor = remainingColors[0];
        const remainingPlayers = [...unassignedPlayers];
        
        // Auto-assign all remaining players to the last team
        newTeams = newTeams.map(t => t.color === lastTeamColor ? { ...t, members: remainingPlayers } : t);
        setTeams(newTeams);
        
        // Update visual map so Purple tiles light up on the grid
        setAssignedMap(prev => {
          const m = { ...prev };
          remainingPlayers.forEach(p => m[p.id] = lastTeamColor);
          return m;
        });
        
        setUnassignedPlayers([]);
        
        // Keep current team as the one just confirmed (Pink), store last team info
        // This way both teams' tiles show on the grid
        setLastTeamInfo({ color: lastTeamColor, members: remainingPlayers });
        
        // Set lockedPlayers to the last team's members for display
        setLockedPlayers(remainingPlayers);
        
        // Play a subtle sound
        if (!isMuted && boomAudioRef.current) {
          boomAudioRef.current.currentTime = 0;
          boomAudioRef.current.play().catch(() => {});
        }
        
        // First go to IDLE briefly so user can see both teams' tiles light up
        setPhase('IDLE');
        
        // Then show the combined summary after a delay
        setTimeout(() => {
          setPhase('LAST_TEAM_ASSIGN');
        }, 1200);
      } else if (remainingColors.length > 1) {
        setTeams(newTeams);
        setNextTeamColor(remainingColors[0]);
        setCurrentTeamColor(null);
        setLockedPlayers([]);
        setPhase('NEXT_TEAM_PREVIEW');
        // User will click BEGIN SELECTION to proceed
      } else {
        setTeams(newTeams);
        setCurrentTeamColor(null);
        setLockedPlayers([]);
        setPhase('IDLE');
      }
    }
  };
  
  // Start draft for the next team from preview screen
  const initiateNextTeam = () => {
    if (!nextTeamColor) return;
    setCurrentTeamColor(nextTeamColor);
    setNextTeamColor(null);
    
    // Check if this is the last team
    const remainingCount = teamQueue.filter(c => teams.find(t => t.color === c)?.members.length === 0).length;
    
    if (remainingCount === 1) {
      // Last team - assign all remaining
      const winners = unassignedPlayers;
      setDraftQueue(winners);
      setLockedPlayers(winners);
      
      setAssignedMap(prev => {
        const m = { ...prev };
        winners.forEach(p => m[p.id] = nextTeamColor);
        return m;
      });

      setUnassignedPlayers([]);
      setPhase('SUMMARY');

      if (!isMuted && boomAudioRef.current) {
        boomAudioRef.current.currentTime = 0;
        boomAudioRef.current.play().catch(() => {});
      }
    } else {
      // Normal draft
      const winners = pickBatch(unassignedPlayers, nextTeamColor, teams);
      if (winners.length === 0) {
        setDraftQueue([]);
        setLockedPlayers([]);
        setPhase('SUMMARY');
        return;
      }
      setDraftQueue(winners);
      setLockedPlayers([]);
      setPhase('DRAFTING');
    }
  };
  
  const finishDraft = () => {
    onComplete(teams);
  };

  const quickFinish = () => {
      let currentPool = [...unassignedPlayers];
      let currentTeams = [...teams];
      const remainingColors = teamQueue.filter(c => currentTeams.find(t => t.color === c)?.members.length === 0);
      remainingColors.forEach((color, index) => {
         const isLast = index === remainingColors.length - 1;
         const winners = isLast ? currentPool : pickBatch(currentPool, color, currentTeams);
         currentTeams = currentTeams.map(t => t.color === color ? { ...t, members: winners } : t);
         const winnerIds = new Set(winners.map(w => w.id));
         currentPool = currentPool.filter(p => !winnerIds.has(p.id));
      });
      setTeams(currentTeams);
      setUnassignedPlayers([]);
      
      // Update assigned map for all players
      const newAssignedMap: Record<string, TeamColor> = {};
      currentTeams.forEach(team => {
        team.members.forEach(member => {
          newAssignedMap[member.id] = team.color;
        });
      });
      setAssignedMap(newAssignedMap);
      
      // Show Final Recap instead of immediately completing
      setPhase('FINAL_RECAP');
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
      const paddingRatio = 1.0; // leave breathing room on edges
      const fitScale = Math.max(
          0.1,
          Math.min(width / worldWidth, height / worldHeight) * paddingRatio
      );
      const clampedScale = Math.min(fitScale, 5);

      const pointX = (width - worldWidth * clampedScale) / 0.8;
      const pointY = (height - worldHeight * clampedScale) / 2;
      const yOffset = 80; // pixels to push it down
      viewState.current = {
          scale: clampedScale,
          pointX,
          pointY: pointY + yOffset,
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
                        const isSlam = slamPlayerId === player.id;
                        
                        // During LAST_TEAM_ASSIGN, both currentTeamColor AND lastTeamInfo.color should be "current"
                        const isCurrentTeam = isAssigned && (
                          teamColor === currentTeamColor || 
                          (phase === 'LAST_TEAM_ASSIGN' && lastTeamInfo && teamColor === lastTeamInfo.color)
                        );
                        const isPreviousTeam = isAssigned && !isCurrentTeam;
                        
                        // Determine Style
                        let bgStyle: React.CSSProperties = { backgroundColor: '#2e2e2e' };
                        let nameClass = "text-[#00fff2]";
                        let numberClass = "text-[#00fff2]";
                        let genderClass = "text-gray-500";
                        let shadowClass = "shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]";
                        let borderClass = "border border-[#444]";
                        let zIndex = "z-0";
                        let slamClass = "";
                        let scaleStyle = "scale(1)";
                        
                        if (isSlam) {
                            // SLAM animation - scale up then down
                            slamClass = "animate-slam-tile";
                            zIndex = "z-30";
                        }
                        
                        if (isAssigned) {
                            const config = TEAM_CONFIG[teamColor];
                            
                            if (isCurrentTeam) {
                              // Current drafting team - full color, normal size
                              bgStyle = { backgroundColor: config.hex };
                              nameClass = "text-white";
                              numberClass = "text-white";
                              genderClass = "text-white/70";
                              shadowClass = isSlam 
                                ? "shadow-[0_0_50px_rgba(255,255,255,1)]" 
                                : "shadow-[0_0_20px_rgba(255,255,255,0.6)]";
                              borderClass = isSlam ? "border-4 border-white" : "border border-white";
                              zIndex = isSlam ? "z-30" : "z-10";
                              // Keep normal scale for current team
                            } else {
                              // Previously assigned teams - smaller, lighter & blurred
                              bgStyle = { backgroundColor: `${config.hex}40` }; // Even more transparent
                              nameClass = "text-white/60";
                              numberClass = "text-white/60";
                              genderClass = "text-white/40";
                              shadowClass = "shadow-none";
                              borderClass = "border border-white/30";
                              zIndex = "z-0";
                              scaleStyle = "scale(0.7)";
                            }
                        } else if (isDecoy && currentTeamColor) {
                            // Flickering candidates - use current team color
                            const teamConfig = TEAM_CONFIG[currentTeamColor];
                            bgStyle = { 
                              backgroundColor: teamConfig.hex,
                              boxShadow: `0 0 30px ${teamConfig.hex}, 0 0 60px ${teamConfig.hex}80`
                            };
                            nameClass = "text-white";
                            numberClass = "text-white";
                            genderClass = "text-white/80";
                            shadowClass = ""; // Using inline style instead
                            borderClass = "border-2 border-white";
                            zIndex = "z-20";
                            scaleStyle = "scale(1.05)"; // Slight pop
                        }
                        
                        if (!isAssigned && !isDecoy) {
                            genderClass = "text-blue-200/70";
                        }

                        return (
                            <div 
                                key={player.id}
                                className={`
                                    absolute w-[120px] h-[120px] transition-all duration-150 ease-out
                                    ${shadowClass} ${borderClass} ${zIndex} ${slamClass}
                                    ${isPreviousTeam ? 'blur-[1px] opacity-60' : ''}
                                    ${isDecoy ? 'animate-pulse' : ''}
                                `}
                                style={{
                                    ...bgStyle,
                                    left: `${x}px`,
                                    top: `${y}px`,
                                    width: `${tileLayout.tileSize}px`,
                                    height: `${tileLayout.tileSize}px`,
                                    transform: `translate(-50%, -50%) rotate(45deg) ${scaleStyle}`
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
                   unassignedPlayers.length > 0 && phase !== 'SUMMARY' && phase !== 'FIRST_TEAM_INTRO' && (
                      <div className="flex gap-4">
                        <Button onClick={startNextTeam} className="py-3 px-8 text-lg shadow-[0_0_20px_rgba(237,27,118,0.3)] hover:shadow-[0_0_30px_rgba(237,27,118,0.6)] hover:scale-105 transition-all border-2 border-squid-pink bg-black/50 hover:bg-squid-pink text-white backdrop-blur-sm">
                          START
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
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
             <div className="relative w-full max-w-4xl bg-gradient-to-b from-gray-900 to-black border border-gray-700 rounded-lg shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[90vh] animate-slam">
                
                {/* Header */}
                <div className="w-full py-6 flex flex-col items-center relative">
                    <div 
                      className="w-20 h-20 rotate-45 flex items-center justify-center border-4 shadow-[0_0_40px_currentColor] mb-4"
                      style={{ backgroundColor: TEAM_CONFIG[currentTeamColor].hex, borderColor: 'white', color: TEAM_CONFIG[currentTeamColor].hex }}
                    >
                      <span className="-rotate-45 text-white font-display text-2xl uppercase">
                        {currentTeamColor.charAt(0)}
                      </span>
                    </div>
                    <h1 
                      className="font-display text-4xl md:text-5xl uppercase tracking-[0.3em]"
                      style={{ color: TEAM_CONFIG[currentTeamColor].hex }}
                    >
                      TEAM {currentTeamColor}
                    </h1>
                    <p className="text-gray-500 text-sm mt-2 tracking-widest">{lockedPlayers.length} MEMBERS</p>
                </div>
                
                {/* Player List - Name First */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {lockedPlayers.map((p, i) => (
                            <div 
                                key={p.id} 
                                className="flex items-center gap-4 p-4 bg-white/5 rounded-lg border border-white/10 animate-pop-in hover:bg-white/10 transition-colors"
                                style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'backwards' }}
                            >
                                {/* Player Number Badge */}
                                <div 
                                  className="w-12 h-12 rotate-45 flex-shrink-0 flex items-center justify-center border-2"
                                  style={{ backgroundColor: TEAM_CONFIG[currentTeamColor].hex, borderColor: 'rgba(255,255,255,0.5)' }}
                                >
                                  <span className="-rotate-45 text-white font-mono text-sm font-bold">
                                    {String(sortedPlayers.findIndex(sp => sp.id === p.id) + 1).padStart(3, '0')}
                                  </span>
                                </div>
                                
                                {/* Player Info - Name First */}
                                <div className="flex flex-col flex-1 min-w-0">
                                  <span className="text-white font-display text-lg uppercase tracking-wide truncate">
                                    {p.name}
                                  </span>
                                  <span className="text-gray-500 text-xs uppercase tracking-widest">
                                    {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Non-Binary'}
                                  </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 flex justify-center bg-black/50">
                     <Button 
                       onClick={confirmTeam} 
                       className="px-16 py-4 text-xl border-2 bg-transparent hover:text-black transition-all"
                       style={{ 
                         borderColor: TEAM_CONFIG[currentTeamColor].hex, 
                         color: TEAM_CONFIG[currentTeamColor].hex,
                       }}
                       onMouseEnter={(e) => e.currentTarget.style.backgroundColor = TEAM_CONFIG[currentTeamColor].hex}
                       onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                     >
                        CONFIRM TEAM
                     </Button>
                </div>
             </div>
          </div>
       )}

       {/* FIRST TEAM INTRO - AUTO-PLAY CINEMATIC */}
       {phase === 'FIRST_TEAM_INTRO' && introTeamColor && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden">
             
             {/* Fade out container */}
             <div 
               className="absolute inset-0 flex items-center justify-center"
               style={{
                 animation: 'fadeIn 0.5s ease-out forwards, fadeOut 0.8s ease-in 2.7s forwards',
               }}
             >
               {/* Radial Light Burst */}
               <div 
                 className="absolute w-[800px] h-[800px] rounded-full animate-radial-pulse"
                 style={{
                   background: `radial-gradient(circle, ${TEAM_CONFIG[introTeamColor].hex}40 0%, transparent 70%)`,
                 }}
               />
               <div 
                 className="absolute w-[600px] h-[600px] rounded-full animate-radial-pulse"
                 style={{
                   background: `radial-gradient(circle, ${TEAM_CONFIG[introTeamColor].hex}30 0%, transparent 60%)`,
                   animationDelay: '0.5s',
                 }}
               />
               
               {/* Vertical Light Beams */}
               {[...Array(5)].map((_, i) => (
                 <div
                   key={`beam-${i}`}
                   className="absolute h-full w-1 animate-light-beam opacity-60"
                   style={{
                     background: `linear-gradient(to top, transparent, ${TEAM_CONFIG[introTeamColor].hex}, transparent)`,
                     left: `${20 + i * 15}%`,
                     animationDelay: `${0.1 * i}s`,
                     filter: 'blur(4px)',
                   }}
                 />
               ))}
               
               {/* Floating Particles */}
               <div className="absolute inset-0 overflow-hidden pointer-events-none">
                 {[...Array(20)].map((_, i) => (
                   <div
                     key={i}
                     className="absolute w-2 h-2 rotate-45 animate-particle-float"
                     style={{
                       backgroundColor: TEAM_CONFIG[introTeamColor].hex,
                       left: `${5 + (i * 4.5)}%`,
                       bottom: '-20px',
                       animationDelay: `${i * 0.15}s`,
                       animationDuration: `${2.5 + Math.random() * 2}s`,
                       opacity: 0.8,
                       boxShadow: `0 0 10px ${TEAM_CONFIG[introTeamColor].hex}`,
                     }}
                   />
                 ))}
               </div>
               
               {/* Spinning Outer Ring */}
               <div 
                 className="absolute w-96 h-96 rounded-full animate-tile-rotate"
                 style={{
                   background: `conic-gradient(from 0deg, transparent 0%, ${TEAM_CONFIG[introTeamColor].hex}50 10%, transparent 20%, transparent 50%, ${TEAM_CONFIG[introTeamColor].hex}50 60%, transparent 70%)`,
                   filter: 'blur(8px)',
                 }}
               />
               
               {/* Second Counter-Rotating Ring */}
               <div 
                 className="absolute w-80 h-80 rounded-full"
                 style={{
                   background: `conic-gradient(from 180deg, transparent 0%, ${TEAM_CONFIG[introTeamColor].hex}30 15%, transparent 30%, transparent 50%, ${TEAM_CONFIG[introTeamColor].hex}30 65%, transparent 80%)`,
                   filter: 'blur(6px)',
                   animation: 'tileRotate 15s linear infinite reverse',
                 }}
               />
               
               <div className="flex flex-col items-center relative z-10">
                 
                 {/* Top Banner */}
                 <div 
                   className="mb-8 px-12 py-3 border-t border-b animate-banner-unfurl"
                   style={{ 
                     borderColor: `${TEAM_CONFIG[introTeamColor].hex}80`,
                     background: `linear-gradient(90deg, transparent, ${TEAM_CONFIG[introTeamColor].hex}20, transparent)`,
                     animationDelay: '0.3s',
                     animationFillMode: 'backwards'
                   }}
                 >
                   <span className="text-gray-300 text-sm uppercase tracking-[0.5em] font-light">FIRST TEAM</span>
                 </div>
                 
                 {/* Motion Trail Effect */}
                 {[...Array(3)].map((_, i) => (
                   <div
                     key={`trail-${i}`}
                     className="absolute h-3 animate-trail-effect"
                     style={{
                       background: `linear-gradient(to left, ${TEAM_CONFIG[introTeamColor].hex}, transparent)`,
                       top: '50%',
                       marginTop: '-6px',
                       animationDelay: `${i * 0.1}s`,
                       opacity: 0.6 - i * 0.15,
                       filter: 'blur(4px)',
                     }}
                   />
                 ))}
                 
                 {/* Guild Emblem Container */}
                 <div className="relative" style={{ animation: 'floatVertical 3s ease-in-out infinite', animationDelay: '1.5s' }}>
                   
                   {/* Pulsing Glow Behind */}
                   <div 
                     className="absolute inset-0 -m-8 animate-emblem-glow"
                     style={{ color: TEAM_CONFIG[introTeamColor].hex, animationDelay: '1s' }}
                   />
                   
                   {/* Outer Decorative Frame */}
                   <div 
                     className="absolute -inset-6 border-2 rotate-45 animate-fade-in"
                     style={{ 
                       borderColor: `${TEAM_CONFIG[introTeamColor].hex}40`,
                       animationDelay: '1s',
                       animationFillMode: 'backwards'
                     }}
                   />
                   <div 
                     className="absolute -inset-10 border rotate-45 animate-fade-in"
                     style={{ 
                       borderColor: `${TEAM_CONFIG[introTeamColor].hex}20`,
                       animationDelay: '1.2s',
                       animationFillMode: 'backwards'
                     }}
                   />
                   
                   {/* Main Emblem Tile - FLY IN FROM RIGHT */}
                   <div 
                     className="w-56 h-56 flex items-center justify-center border-4 animate-fly-in-right"
                     style={{ 
                       backgroundColor: TEAM_CONFIG[introTeamColor].hex, 
                       borderColor: 'white', 
                       boxShadow: `
                         0 0 60px ${TEAM_CONFIG[introTeamColor].hex}, 
                         0 0 120px ${TEAM_CONFIG[introTeamColor].hex}80,
                         inset 0 0 60px rgba(255,255,255,0.2)
                       `
                     }}
                   >
                     {/* Inner Glow */}
                     <div 
                       className="absolute inset-4 border opacity-50"
                       style={{ borderColor: 'rgba(255,255,255,0.3)' }}
                     />
                     
                     {/* Team Name */}
                     <span className="-rotate-45 text-white font-display text-6xl uppercase drop-shadow-[0_0_30px_rgba(255,255,255,1)] tracking-wider">
                       {introTeamColor}
                     </span>
                   </div>
                   
                   {/* Shimmer Overlay */}
                   <div 
                     className="absolute inset-0 rotate-45 overflow-hidden pointer-events-none animate-fade-in"
                     style={{ animationDelay: '1.2s', animationFillMode: 'backwards' }}
                   >
                     <div 
                       className="absolute inset-0 animate-shimmer"
                       style={{
                         background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                         backgroundSize: '200% 100%',
                       }}
                     />
                   </div>
                   
                   {/* Corner Diamonds */}
                   {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => (
                     <div
                       key={`corner-${i}`}
                       className="absolute w-4 h-4 rotate-45 animate-fade-in"
                       style={{
                         backgroundColor: TEAM_CONFIG[introTeamColor].hex,
                         boxShadow: `0 0 15px ${TEAM_CONFIG[introTeamColor].hex}`,
                         top: y < 0 ? '-24px' : 'auto',
                         bottom: y > 0 ? '-24px' : 'auto',
                         left: x < 0 ? '-24px' : 'auto',
                         right: x > 0 ? '-24px' : 'auto',
                         animationDelay: `${1 + i * 0.1}s`,
                         animationFillMode: 'backwards',
                       }}
                     />
                   ))}
                 </div>
                 
                 {/* Auto-Start Text */}
                 <div 
                   className="mt-12 flex flex-col items-center gap-4 animate-fade-in"
                   style={{ animationDelay: '1s', animationFillMode: 'backwards' }}
                 >
                   {/* Decorative Line */}
                   <div className="flex items-center gap-4 w-full max-w-md">
                     <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${TEAM_CONFIG[introTeamColor].hex})` }} />
                     <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TEAM_CONFIG[introTeamColor].hex }} />
                     <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${TEAM_CONFIG[introTeamColor].hex})` }} />
                   </div>
                   
                   {/* Loading indicator */}
                   <div className="flex items-center gap-3 mt-4">
                     <div className="flex gap-1">
                       {[0, 1, 2].map(i => (
                         <div 
                           key={i}
                           className="w-2 h-2 rounded-full animate-pulse"
                           style={{ 
                             backgroundColor: TEAM_CONFIG[introTeamColor].hex,
                             animationDelay: `${i * 0.2}s`
                           }}
                         />
                       ))}
                     </div>
                     <span className="text-gray-400 text-sm uppercase tracking-[0.3em]">PREPARING DRAFT</span>
                     <div className="flex gap-1">
                       {[0, 1, 2].map(i => (
                         <div 
                           key={i}
                           className="w-2 h-2 rounded-full animate-pulse"
                           style={{ 
                             backgroundColor: TEAM_CONFIG[introTeamColor].hex,
                             animationDelay: `${0.6 + i * 0.2}s`
                           }}
                         />
                       ))}
                     </div>
                   </div>
                 </div>
                 
                 {/* Bottom Decorative Element */}
                 <div 
                   className="mt-8 flex items-center gap-2 animate-fade-in"
                   style={{ animationDelay: '1.4s', animationFillMode: 'backwards' }}
                 >
                   {[...Array(5)].map((_, i) => (
                     <div
                       key={`dot-${i}`}
                       className="w-1.5 h-1.5 rotate-45"
                       style={{
                         backgroundColor: i === 2 ? TEAM_CONFIG[introTeamColor].hex : `${TEAM_CONFIG[introTeamColor].hex}40`,
                       }}
                     />
                   ))}
                 </div>
               </div>
             </div>
          </div>
       )}

       {/* NEXT TEAM PREVIEW - CINEMATIC GUILD REVEAL */}
       {phase === 'NEXT_TEAM_PREVIEW' && nextTeamColor && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/80 backdrop-blur-sm overflow-hidden">
             
             {/* Radial Light Burst */}
             <div 
               className="absolute w-[800px] h-[800px] rounded-full animate-radial-pulse"
               style={{
                 background: `radial-gradient(circle, ${TEAM_CONFIG[nextTeamColor].hex}40 0%, transparent 70%)`,
               }}
             />
             <div 
               className="absolute w-[600px] h-[600px] rounded-full animate-radial-pulse"
               style={{
                 background: `radial-gradient(circle, ${TEAM_CONFIG[nextTeamColor].hex}30 0%, transparent 60%)`,
                 animationDelay: '0.5s',
               }}
             />
             
             {/* Vertical Light Beams */}
             {[...Array(5)].map((_, i) => (
               <div
                 key={`beam-${i}`}
                 className="absolute h-full w-1 animate-light-beam opacity-60"
                 style={{
                   background: `linear-gradient(to top, transparent, ${TEAM_CONFIG[nextTeamColor].hex}, transparent)`,
                   left: `${20 + i * 15}%`,
                   animationDelay: `${0.1 * i}s`,
                   filter: 'blur(4px)',
                 }}
               />
             ))}
             
             {/* Floating Particles */}
             <div className="absolute inset-0 overflow-hidden pointer-events-none">
               {[...Array(20)].map((_, i) => (
                 <div
                   key={i}
                   className="absolute w-2 h-2 rotate-45 animate-particle-float"
                   style={{
                     backgroundColor: TEAM_CONFIG[nextTeamColor].hex,
                     left: `${5 + (i * 4.5)}%`,
                     bottom: '-20px',
                     animationDelay: `${i * 0.15}s`,
                     animationDuration: `${2.5 + Math.random() * 2}s`,
                     opacity: 0.8,
                     boxShadow: `0 0 10px ${TEAM_CONFIG[nextTeamColor].hex}`,
                   }}
                 />
               ))}
             </div>
             
             {/* Spinning Outer Ring */}
             <div 
               className="absolute w-96 h-96 rounded-full animate-tile-rotate"
               style={{
                 background: `conic-gradient(from 0deg, transparent 0%, ${TEAM_CONFIG[nextTeamColor].hex}50 10%, transparent 20%, transparent 50%, ${TEAM_CONFIG[nextTeamColor].hex}50 60%, transparent 70%)`,
                 filter: 'blur(8px)',
               }}
             />
             
             {/* Second Counter-Rotating Ring */}
             <div 
               className="absolute w-80 h-80 rounded-full"
               style={{
                 background: `conic-gradient(from 180deg, transparent 0%, ${TEAM_CONFIG[nextTeamColor].hex}30 15%, transparent 30%, transparent 50%, ${TEAM_CONFIG[nextTeamColor].hex}30 65%, transparent 80%)`,
                 filter: 'blur(6px)',
                 animation: 'tileRotate 15s linear infinite reverse',
               }}
             />
             
             <div className="flex flex-col items-center relative z-10">
               
               {/* Top Banner */}
               <div 
                 className="mb-8 px-12 py-3 border-t border-b animate-banner-unfurl"
                 style={{ 
                   borderColor: `${TEAM_CONFIG[nextTeamColor].hex}80`,
                   background: `linear-gradient(90deg, transparent, ${TEAM_CONFIG[nextTeamColor].hex}20, transparent)`,
                   animationDelay: '0.3s',
                   animationFillMode: 'backwards'
                 }}
               >
                 <span className="text-gray-300 text-sm uppercase tracking-[0.5em] font-light">NOW RECRUITING</span>
               </div>
               
               {/* Guild Emblem Container */}
               <div className="relative animate-float-vertical" style={{ animationDelay: '1.2s' }}>
                 
                 {/* Pulsing Glow Behind */}
                 <div 
                   className="absolute inset-0 -m-8 animate-emblem-glow"
                   style={{ color: TEAM_CONFIG[nextTeamColor].hex }}
                 />
                 
                 {/* Outer Decorative Frame */}
                 <div 
                   className="absolute -inset-6 border-2 rotate-45 animate-fade-in"
                   style={{ 
                     borderColor: `${TEAM_CONFIG[nextTeamColor].hex}40`,
                     animationDelay: '0.8s',
                     animationFillMode: 'backwards'
                   }}
                 />
                 <div 
                   className="absolute -inset-10 border rotate-45 animate-fade-in"
                   style={{ 
                     borderColor: `${TEAM_CONFIG[nextTeamColor].hex}20`,
                     animationDelay: '1s',
                     animationFillMode: 'backwards'
                   }}
                 />
                 
                 {/* Main Emblem Tile */}
                 <div 
                   className="w-56 h-56 flex items-center justify-center border-4 animate-emblem-reveal"
                   style={{ 
                     backgroundColor: TEAM_CONFIG[nextTeamColor].hex, 
                     borderColor: 'white', 
                     boxShadow: `
                       0 0 60px ${TEAM_CONFIG[nextTeamColor].hex}, 
                       0 0 120px ${TEAM_CONFIG[nextTeamColor].hex}80,
                       inset 0 0 60px rgba(255,255,255,0.2)
                     `
                   }}
                 >
                   {/* Inner Glow */}
                   <div 
                     className="absolute inset-4 border opacity-50"
                     style={{ borderColor: 'rgba(255,255,255,0.3)' }}
                   />
                   
                   {/* Team Name */}
                   <span className="-rotate-45 text-white font-display text-6xl uppercase drop-shadow-[0_0_30px_rgba(255,255,255,1)] tracking-wider">
                     {nextTeamColor}
                   </span>
                 </div>
                 
                 {/* Shimmer Overlay */}
                 <div 
                   className="absolute inset-0 rotate-45 overflow-hidden pointer-events-none animate-fade-in"
                   style={{ animationDelay: '1.2s', animationFillMode: 'backwards' }}
                 >
                   <div 
                     className="absolute inset-0 animate-shimmer"
                     style={{
                       background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                       backgroundSize: '200% 100%',
                     }}
                   />
                 </div>
                 
                 {/* Corner Diamonds */}
                 {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, y], i) => (
                   <div
                     key={`corner-${i}`}
                     className="absolute w-4 h-4 rotate-45 animate-fade-in"
                     style={{
                       backgroundColor: TEAM_CONFIG[nextTeamColor].hex,
                       boxShadow: `0 0 15px ${TEAM_CONFIG[nextTeamColor].hex}`,
                       top: y < 0 ? '-24px' : 'auto',
                       bottom: y > 0 ? '-24px' : 'auto',
                       left: x < 0 ? '-24px' : 'auto',
                       right: x > 0 ? '-24px' : 'auto',
                       animationDelay: `${1 + i * 0.1}s`,
                       animationFillMode: 'backwards',
                     }}
                   />
                 ))}
               </div>
               
               {/* Guild Info Banner */}
               <div 
                 className="mt-12 flex flex-col items-center gap-4 animate-fade-in"
                 style={{ animationDelay: '0.8s', animationFillMode: 'backwards' }}
               >
                 {/* Decorative Line */}
                 <div className="flex items-center gap-4 w-full max-w-md">
                   <div className="flex-1 h-px" style={{ background: `linear-gradient(to right, transparent, ${TEAM_CONFIG[nextTeamColor].hex})` }} />
                   <div className="w-2 h-2 rotate-45" style={{ backgroundColor: TEAM_CONFIG[nextTeamColor].hex }} />
                   <div className="flex-1 h-px" style={{ background: `linear-gradient(to left, transparent, ${TEAM_CONFIG[nextTeamColor].hex})` }} />
                 </div>
                 
                 {/* Stats */}
                 <div className="flex items-center gap-6 text-gray-400 text-sm uppercase tracking-widest">
                   <div className="flex flex-col items-center">
                     <span className="text-3xl font-display" style={{ color: TEAM_CONFIG[nextTeamColor].hex }}>
                       {unassignedPlayers.length}
                     </span>
                     <span className="text-xs text-gray-500">SURVIVORS</span>
                   </div>
                   <div className="w-px h-12" style={{ backgroundColor: `${TEAM_CONFIG[nextTeamColor].hex}40` }} />
                   <div className="flex flex-col items-center">
                     <span className="text-3xl font-display" style={{ color: TEAM_CONFIG[nextTeamColor].hex }}>
                       {(Object.values(genderTargets[nextTeamColor] || {}) as number[]).reduce((a, b) => a + b, 0)}
                     </span>
                     <span className="text-xs text-gray-500">TO DRAFT</span>
                   </div>
                 </div>
               </div>
               
               {/* Epic Initiate Button */}
               <Button 
                 onClick={initiateNextTeam} 
                 className="mt-10 py-5 px-20 text-xl font-display uppercase tracking-[0.3em] transition-all duration-300 border-2 bg-transparent text-white relative overflow-hidden group animate-fade-in"
                 style={{ 
                   borderColor: TEAM_CONFIG[nextTeamColor].hex,
                   animationDelay: '1.2s',
                   animationFillMode: 'backwards'
                 }}
                 onMouseEnter={(e) => {
                   e.currentTarget.style.backgroundColor = TEAM_CONFIG[nextTeamColor].hex;
                   e.currentTarget.style.boxShadow = `0 0 60px ${TEAM_CONFIG[nextTeamColor].hex}, 0 0 100px ${TEAM_CONFIG[nextTeamColor].hex}60`;
                   e.currentTarget.style.transform = 'scale(1.05)';
                 }}
                 onMouseLeave={(e) => {
                   e.currentTarget.style.backgroundColor = 'transparent';
                   e.currentTarget.style.boxShadow = 'none';
                   e.currentTarget.style.transform = 'scale(1)';
                 }}
               >
                 <span className="relative z-10">BEGIN SELECTION</span>
                 {/* Button Shimmer */}
                 <div 
                   className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity animate-shimmer"
                   style={{
                     background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.2) 50%, transparent 100%)',
                     backgroundSize: '200% 100%',
                   }}
                 />
               </Button>
               
               {/* Skip Button */}
               <button
                 onClick={() => {
                   // Skip this team - auto-assign and move to next
                   if (!nextTeamColor) return;
                   const winners = pickBatch(unassignedPlayers, nextTeamColor, teams);
                   const newTeams = teams.map(t => t.color === nextTeamColor ? { ...t, members: winners } : t);
                   setTeams(newTeams);
                   
                   const winnerIds = new Set(winners.map(w => w.id));
                   const remaining = unassignedPlayers.filter(p => !winnerIds.has(p.id));
                   setUnassignedPlayers(remaining);
                   
                   // Update assigned map
                   setAssignedMap(prev => {
                     const updated = { ...prev };
                     winners.forEach(w => { updated[w.id] = nextTeamColor; });
                     return updated;
                   });
                   
                   // Find next team
                   const remainingColors = teamQueue.filter(c => newTeams.find(t => t.color === c)?.members.length === 0);
                   
                   if (remaining.length === 0 || remainingColors.length === 0) {
                     setNextTeamColor(null);
                     setPhase('FINAL_RECAP');
                   } else if (remainingColors.length === 1) {
                     // Last team - auto-assign all remaining
                     const lastColor = remainingColors[0];
                     const finalTeams = newTeams.map(t => t.color === lastColor ? { ...t, members: remaining } : t);
                     setTeams(finalTeams);
                     setUnassignedPlayers([]);
                     setAssignedMap(prev => {
                       const updated = { ...prev };
                       remaining.forEach(p => { updated[p.id] = lastColor; });
                       return updated;
                     });
                     setNextTeamColor(null);
                     setPhase('FINAL_RECAP');
                   } else {
                     // Move to next team preview
                     setNextTeamColor(remainingColors[0]);
                   }
                 }}
                 className="mt-3 text-gray-500 text-xs uppercase tracking-widest hover:text-gray-300 transition-colors animate-fade-in"
                 style={{ animationDelay: '1.4s', animationFillMode: 'backwards' }}
               >
                 Skip Team →
               </button>
               
               {/* Bottom Decorative Element */}
               <div 
                 className="mt-8 flex items-center gap-2 animate-fade-in"
                 style={{ animationDelay: '1.4s', animationFillMode: 'backwards' }}
               >
                 {[...Array(5)].map((_, i) => (
                   <div
                     key={`dot-${i}`}
                     className="w-1.5 h-1.5 rotate-45"
                     style={{
                       backgroundColor: i === 2 ? TEAM_CONFIG[nextTeamColor].hex : `${TEAM_CONFIG[nextTeamColor].hex}40`,
                     }}
                   />
                 ))}
               </div>
             </div>
          </div>
       )}

       {/* LAST TEAM ASSIGNMENT - Same modal style as SUMMARY but showing both teams */}
       {phase === 'LAST_TEAM_ASSIGN' && lastTeamInfo && currentTeamColor && (
          <div className="fixed inset-0 z-[65] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
             <div className="relative w-full max-w-5xl bg-gradient-to-b from-gray-900 to-black border border-gray-700 rounded-lg shadow-[0_0_100px_rgba(0,0,0,1)] overflow-hidden flex flex-col max-h-[90vh] animate-slam">
                
                {/* Header with both team emblems */}
                <div className="w-full py-6 flex flex-col items-center relative">
                    <div className="flex items-center gap-8 mb-4">
                      {/* Pink Team Emblem */}
                      <div 
                        className="w-16 h-16 rotate-45 flex items-center justify-center border-4 shadow-[0_0_30px_currentColor]"
                        style={{ backgroundColor: TEAM_CONFIG[currentTeamColor].hex, borderColor: 'white', color: TEAM_CONFIG[currentTeamColor].hex }}
                      >
                        <span className="-rotate-45 text-white font-display text-xl uppercase">
                          {currentTeamColor.charAt(0)}
                        </span>
                      </div>
                      
                      <span className="text-gray-500 font-display text-2xl">&</span>
                      
                      {/* Purple Team Emblem */}
                      <div 
                        className="w-16 h-16 rotate-45 flex items-center justify-center border-4 shadow-[0_0_30px_currentColor]"
                        style={{ backgroundColor: TEAM_CONFIG[lastTeamInfo.color].hex, borderColor: 'white', color: TEAM_CONFIG[lastTeamInfo.color].hex }}
                      >
                        <span className="-rotate-45 text-white font-display text-xl uppercase">
                          {lastTeamInfo.color.charAt(0)}
                        </span>
                      </div>
                    </div>
                    <h1 className="font-display text-3xl md:text-4xl uppercase tracking-[0.3em] text-white">
                      FINAL TEAMS
                    </h1>
                    <p className="text-gray-500 text-sm mt-2 tracking-widest">DRAFT COMPLETE</p>
                </div>
                
                {/* Player Lists - Two columns */}
                <div className="flex-1 overflow-y-auto px-6 pb-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      
                      {/* Pink Team Column */}
                      <div>
                        <div 
                          className="flex items-center gap-3 mb-4 pb-2 border-b"
                          style={{ borderColor: `${TEAM_CONFIG[currentTeamColor].hex}40` }}
                        >
                          <span 
                            className="font-display text-xl uppercase tracking-wider"
                            style={{ color: TEAM_CONFIG[currentTeamColor].hex }}
                          >
                            Team {currentTeamColor}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {teams.find(t => t.color === currentTeamColor)?.members.length || 0} MEMBERS
                          </span>
                        </div>
                        <div className="space-y-2">
                          {teams.find(t => t.color === currentTeamColor)?.members.map((p, i) => (
                            <div 
                              key={p.id} 
                              className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/10 animate-pop-in hover:bg-white/10 transition-colors"
                              style={{ animationDelay: `${i * 30}ms`, animationFillMode: 'backwards' }}
                            >
                              <div 
                                className="w-10 h-10 rotate-45 flex-shrink-0 flex items-center justify-center border-2"
                                style={{ backgroundColor: TEAM_CONFIG[currentTeamColor].hex, borderColor: 'rgba(255,255,255,0.5)' }}
                              >
                                <span className="-rotate-45 text-white font-mono text-xs font-bold">
                                  {String(sortedPlayers.findIndex(sp => sp.id === p.id) + 1).padStart(3, '0')}
                                </span>
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-white font-display text-base uppercase tracking-wide truncate">
                                  {p.name}
                                </span>
                                <span className="text-gray-500 text-xs uppercase tracking-widest">
                                  {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Non-Binary'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                      
                      {/* Purple Team Column */}
                      <div>
                        <div 
                          className="flex items-center gap-3 mb-4 pb-2 border-b"
                          style={{ borderColor: `${TEAM_CONFIG[lastTeamInfo.color].hex}40` }}
                        >
                          <span 
                            className="font-display text-xl uppercase tracking-wider"
                            style={{ color: TEAM_CONFIG[lastTeamInfo.color].hex }}
                          >
                            Team {lastTeamInfo.color}
                          </span>
                          <span className="text-gray-500 text-xs">
                            {lastTeamInfo.members.length} MEMBERS
                          </span>
                        </div>
                        <div className="space-y-2">
                          {lastTeamInfo.members.map((p, i) => (
                            <div 
                              key={p.id} 
                              className="flex items-center gap-4 p-3 bg-white/5 rounded-lg border border-white/10 animate-pop-in hover:bg-white/10 transition-colors"
                              style={{ animationDelay: `${100 + i * 30}ms`, animationFillMode: 'backwards' }}
                            >
                              <div 
                                className="w-10 h-10 rotate-45 flex-shrink-0 flex items-center justify-center border-2"
                                style={{ backgroundColor: TEAM_CONFIG[lastTeamInfo.color].hex, borderColor: 'rgba(255,255,255,0.5)' }}
                              >
                                <span className="-rotate-45 text-white font-mono text-xs font-bold">
                                  {String(sortedPlayers.findIndex(sp => sp.id === p.id) + 1).padStart(3, '0')}
                                </span>
                              </div>
                              <div className="flex flex-col flex-1 min-w-0">
                                <span className="text-white font-display text-base uppercase tracking-wide truncate">
                                  {p.name}
                                </span>
                                <span className="text-gray-500 text-xs uppercase tracking-widest">
                                  {p.gender === 'M' ? 'Male' : p.gender === 'F' ? 'Female' : 'Non-Binary'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-gray-800 flex justify-center bg-black/50">
                     <Button 
                       onClick={() => {
                         setLastTeamInfo(null);
                         setCurrentTeamColor(null);
                         setPhase('FINAL_RECAP');
                       }} 
                       className="px-16 py-4 text-xl border-2 bg-transparent hover:text-black transition-all border-squid-pink text-squid-pink hover:bg-squid-pink"
                     >
                        VIEW ALL TEAMS
                     </Button>
                </div>
             </div>
          </div>
       )}

       {/* FINAL RECAP */}
       {phase === 'FINAL_RECAP' && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/98 backdrop-blur-md overflow-auto py-8">
             <div className="w-full max-w-6xl px-6 flex flex-col items-center">
               
               {/* Header */}
               <div className="flex items-center gap-4 mb-8 animate-fade-in">
                 <div className="h-px w-16 bg-gradient-to-r from-transparent to-squid-pink"></div>
                 <h1 className="font-display text-3xl md:text-4xl text-white uppercase tracking-[0.3em]">
                   Draft Complete
                 </h1>
                 <div className="h-px w-16 bg-gradient-to-l from-transparent to-squid-pink"></div>
               </div>
               
               {/* Teams Grid - Horizontal Scrollable on Mobile */}
               <div className="w-full grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                 {teams.filter(t => t.members.length > 0).map((team, teamIndex) => (
                   <div 
                     key={team.color} 
                     className="bg-white/5 rounded-lg border border-white/10 overflow-hidden animate-pop-in"
                     style={{ animationDelay: `${teamIndex * 100}ms`, animationFillMode: 'backwards' }}
                   >
                     {/* Team Header */}
                     <div 
                       className="px-4 py-3 flex items-center gap-3 border-b border-white/10"
                       style={{ backgroundColor: `${TEAM_CONFIG[team.color].hex}20` }}
                     >
                       <div 
                         className="w-8 h-8 rotate-45 flex items-center justify-center"
                         style={{ backgroundColor: TEAM_CONFIG[team.color].hex }}
                       >
                         <span className="-rotate-45 text-white font-bold text-sm">
                           {team.members.length}
                         </span>
                       </div>
                       <span 
                         className="font-display text-xl uppercase tracking-wider"
                         style={{ color: TEAM_CONFIG[team.color].hex }}
                       >
                         {team.color}
                       </span>
                     </div>
                     
                     {/* Team Members - Name Focused */}
                     <div className="p-3 space-y-1 max-h-[340px] overflow-y-auto custom-scrollbar">
                       {team.members.map((member, i) => (
                         <div 
                           key={member.id}
                           className="flex items-center gap-3 px-2 py-1 rounded hover:bg-white/5 transition-colors"
                         >
                           <span 
                             className="text-xs font-mono w-8 text-center"
                             style={{ color: TEAM_CONFIG[team.color].hex }}
                           >
                             {String(sortedPlayers.findIndex(sp => sp.id === member.id) + 1).padStart(3, '0')}
                           </span>
                           <span className="text-white text-sm font-medium flex-1 truncate">
                             {member.name}
                           </span>
                           <span className="text-gray-600 text-xs">
                             {member.gender}
                           </span>
                         </div>
                       ))}
                     </div>
                   </div>
                 ))}
               </div>
               
               {/* Footer Stats */}
               <div className="flex items-center gap-8 mb-8 text-gray-500 text-sm">
                 <span>{teams.filter(t => t.members.length > 0).length} Teams</span>
                 <span className="w-1 h-1 rounded-full bg-gray-600"></span>
                 <span>{players.length} Players</span>
               </div>
               
               <Button 
                 onClick={finishDraft} 
                 className="px-12 py-4 text-lg border-2 border-squid-pink bg-squid-pink/10 hover:bg-squid-pink text-white transition-all"
               >
                 CONTINUE TO RESULTS
               </Button>
             </div>
          </div>
       )}

    </div>
  );
};
