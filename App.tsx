
import React, { useState, useEffect, useRef } from 'react';
import { AppState, Player, Team, TeamColor, Matchup, MatchupPlayer, Gender } from './types';
import { TEAM_CONFIG, Icons } from './constants';
import { LandingPage } from './components/LandingPage';
import { InputPhase } from './components/InputPhase';
import { LotteryPhase } from './components/LotteryPhase';
import { ResultsPhase } from './components/ResultsPhase';
import { PlayingOrderPhase } from './components/PlayingOrderPhase';
import { RaffleSystem } from './components/RaffleSystem';
import startTheme from './assets/start_theme.mp3';
import scoreboardMusic from './assets/scoreboard.mp3';
import bgMusic from './assets/background.mp3';

const LOCAL_STORAGE_TEAMS = 'squid-teams-data';
const LOCAL_STORAGE_MATCHUPS = 'squid-matchups-data';
const LOCAL_STORAGE_STATE = 'squid-app-state';

const App: React.FC = () => {
  // --- State Initialization with Persistence ---
  
  const [appState, setAppState] = useState<AppState>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_STATE);
    // Only restore state if it's past Setup, otherwise default to Landing/Setup logic
    return saved && saved !== AppState.Landing ? (saved as AppState) : AppState.Landing;
  });

  const [players, setPlayers] = useState<Player[]>([]);
  
  const [teams, setTeams] = useState<Team[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_TEAMS);
    if (saved) {
      return JSON.parse(saved);
    }
    return Object.values(TeamColor).map(color => ({ color, members: [], hex: TEAM_CONFIG[color].hex, score: 0 }));
  });

  const [matchups, setMatchups] = useState<Matchup[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_MATCHUPS);
    return saved ? JSON.parse(saved) : [];
  });
  
  // Audio State
  const [isMuted, setIsMuted] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // --- Persistence Effects ---
  useEffect(() => {
    if (appState !== AppState.Landing) {
      localStorage.setItem(LOCAL_STORAGE_STATE, appState);
    }
  }, [appState]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_TEAMS, JSON.stringify(teams));
  }, [teams]);

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_MATCHUPS, JSON.stringify(matchups));
  }, [matchups]);


  useEffect(() => {
    const audio = new Audio();
    audio.loop = true;
    audio.volume = 0.4;
    audioRef.current = audio;

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  // Switch audio based on app state
  useEffect(() => {
    if (!audioRef.current) return;

    let trackToPlay = startTheme; // Default to start_theme
    
    if (appState === AppState.Results) {
      trackToPlay = scoreboardMusic;
    } else if (appState === AppState.Matchups) {
      trackToPlay = bgMusic;
    } else if (appState === AppState.Lottery) {
      trackToPlay = bgMusic;
    } else if (appState === AppState.Raffle) {
      trackToPlay = bgMusic;
    }

    // Only change track if it's different - prevents stopping/restarting same track
    if (audioRef.current.src !== trackToPlay) {
      audioRef.current.src = trackToPlay;
      if (!isMuted) {
        audioRef.current.play().catch(() => {});
      }
    }
  }, [appState, isMuted]);

  // Handler: Start audio immediately on user interaction
  const handleInteraction = async () => {
    if (audioRef.current) {
      try {
        setIsMuted(false);
      } catch (err) {
        console.warn("Audio playback failed:", err);
        setIsMuted(true);
      }
    }
  };

  // Handler: Switch state after landing animation completes
  const handleLandingComplete = () => {
    setAppState(AppState.Setup);
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    
    if (isMuted) {
      // Unmuting
      audioRef.current.muted = false;
      if (audioRef.current.paused) {
        audioRef.current.play().catch(e => console.error("Play failed", e));
      }
      setIsMuted(false);
    } else {
      // Muting
      audioRef.current.muted = true;
      setIsMuted(true);
    }
  };

  const startLottery = () => setAppState(AppState.Lottery);
  
  // Helper to generate matchups
  const generateMatchups = (currentTeams: Team[]): Matchup[] => {
    const shuffleArray = <T,>(arr: T[]): T[] => [...arr].sort(() => Math.random() - 0.5);

    type HelperBucket = 'early' | 'late';
    type HelperInfo = {
      player: Player;
      teamColor: TeamColor;
      totalPlayers: number;
    };

    const HELPER_BUCKET_CONFIG: Record<Gender, { earlyIndex: number | null; lateIndex: number | null }> = {
      [Gender.Male]: { earlyIndex: 0, lateIndex: 2 },
      [Gender.Female]: { earlyIndex: 0, lateIndex: 1 },
      [Gender.NonBinary]: { earlyIndex: null, lateIndex: null }
    };

    const helperBucketAssignments: Partial<Record<string, HelperBucket>> = {};
    const helperInfosByGender: Record<Gender, HelperInfo[]> = {
      [Gender.Male]: [],
      [Gender.Female]: [],
      [Gender.NonBinary]: []
    };

    const initGenderCount = () => ({
      [Gender.Male]: 0,
      [Gender.Female]: 0,
      [Gender.NonBinary]: 0
    });

    const helperBucketCapacities: Record<Gender, { early: number; late: number }> = {
      [Gender.Male]: { early: 0, late: 0 },
      [Gender.Female]: { early: 0, late: 0 },
      [Gender.NonBinary]: { early: 0, late: 0 }
    };

    const pendingPools: Record<TeamColor, {
      males: Player[];
      females: Player[];
      nonBinary: Player[];
      flexible: Player[];
    }> = {} as Record<TeamColor, {
      males: Player[];
      females: Player[];
      nonBinary: Player[];
      flexible: Player[];
    }>;

    const genderCountsByTeam: Record<TeamColor, Record<Gender, number>> = {} as Record<TeamColor, Record<Gender, number>>;

    Object.values(TeamColor).forEach(color => {
      const team = currentTeams.find(t => t.color === color);
      const members = team ? [...team.members] : [];

      const flexible = members.filter(m => m.noGenderRestriction);
      const genderSpecific = members.filter(m => !m.noGenderRestriction);

      const males = genderSpecific.filter(m => m.gender === Gender.Male);
      const females = genderSpecific.filter(m => m.gender === Gender.Female);
      const nonBinary = genderSpecific.filter(m => m.gender === Gender.NonBinary);

      pendingPools[color] = {
        males,
        females,
        nonBinary,
        flexible: shuffleArray(flexible)
      };

      const counts = initGenderCount();
      counts[Gender.Male] = males.length;
      counts[Gender.Female] = females.length;
      counts[Gender.NonBinary] = nonBinary.length;
      genderCountsByTeam[color] = counts;

      males.forEach(player => {
        if (player.isHelper) {
          helperInfosByGender[Gender.Male].push({ player, teamColor: color, totalPlayers: males.length });
        }
      });

      females.forEach(player => {
        if (player.isHelper) {
          helperInfosByGender[Gender.Female].push({ player, teamColor: color, totalPlayers: females.length });
        }
      });

      nonBinary.forEach(player => {
        if (player.isHelper) {
          helperInfosByGender[Gender.NonBinary].push({ player, teamColor: color, totalPlayers: nonBinary.length });
        }
      });
    });

    Object.values(TeamColor).forEach(color => {
      const counts = genderCountsByTeam[color];
      ([Gender.Male, Gender.Female, Gender.NonBinary] as Gender[]).forEach(gender => {
        const { earlyIndex, lateIndex } = HELPER_BUCKET_CONFIG[gender];
        if (earlyIndex !== null && counts[gender] > earlyIndex) {
          helperBucketCapacities[gender].early += 1;
        }
        if (lateIndex !== null && counts[gender] > lateIndex) {
          helperBucketCapacities[gender].late += 1;
        }
      });
    });

    const assignBucketsForGender = (gender: Gender) => {
      const infos = helperInfosByGender[gender];
      if (!infos.length) return;

      const { earlyIndex, lateIndex } = HELPER_BUCKET_CONFIG[gender];
      const capacities = helperBucketCapacities[gender];
      const randomized = shuffleArray(infos);
      let lateAssigned = 0;

      if (lateIndex !== null && capacities.late > 0) {
        const lateEligible = randomized.filter(info => info.totalPlayers - 1 >= lateIndex);
        const lateTarget = Math.min(Math.floor(infos.length / 2), capacities.late, lateEligible.length);
        if (lateTarget > 0) {
          shuffleArray(lateEligible)
            .slice(0, lateTarget)
            .forEach(info => {
              helperBucketAssignments[info.player.id] = 'late';
            });
          lateAssigned = lateTarget;
        }
      }

      if (earlyIndex !== null && capacities.early > 0) {
        const remaining = randomized.filter(info => !helperBucketAssignments[info.player.id]);
        const desiredEarly = Math.min(infos.length - lateAssigned, capacities.early, remaining.length);
        if (desiredEarly > 0) {
          remaining.slice(0, desiredEarly).forEach(info => {
            helperBucketAssignments[info.player.id] = 'early';
          });
        }
      }
    };

    assignBucketsForGender(Gender.Male);
    assignBucketsForGender(Gender.Female);

    const buildOrderedList = (players: Player[], gender: Gender) => {
      if (players.length === 0) return [];
      const { earlyIndex, lateIndex } = HELPER_BUCKET_CONFIG[gender];

      if (earlyIndex === null && lateIndex === null) {
        return shuffleArray(players);
      }

      const shuffled = shuffleArray(players);
      const earlyQueue: Player[] = [];
      const lateQueue: Player[] = [];
      const regulars: Player[] = [];
      const helpers: Player[] = [];

      shuffled.forEach(player => {
        if (player.isHelper) {
          helpers.push(player);
        } else {
          regulars.push(player);
        }
      });

      // Assign helpers to early/late buckets
      let earlyCount = 0;
      let lateCount = 0;
      helpers.forEach(helper => {
        const bucket = helperBucketAssignments[helper.id];
        if (bucket === 'early' && earlyIndex !== null) {
          earlyQueue.push(helper);
          earlyCount++;
        } else if (bucket === 'late' && lateIndex !== null) {
          lateQueue.push(helper);
          lateCount++;
        } else if (earlyIndex !== null && earlyCount < (helpers.length - lateCount)) {
          // Distribute unassigned helpers to early
          earlyQueue.push(helper);
          earlyCount++;
        } else if (lateIndex !== null && lateCount < helpers.length) {
          // Distribute remaining to late
          lateQueue.push(helper);
          lateCount++;
        }
      });

      const ordered: Player[] = [];
      for (let idx = 0; idx < shuffled.length; idx++) {
        let selected: Player | undefined;

        if (earlyIndex !== null && idx === earlyIndex && earlyQueue.length) {
          selected = earlyQueue.shift();
        } else if (lateIndex !== null && idx === lateIndex && lateQueue.length) {
          selected = lateQueue.shift();
        }

        if (!selected) {
          // Fill remaining slots with non-helpers only (no helpers outside 1,2,4,5)
          selected = regulars.shift();
        }

        if (selected) {
          ordered.push(selected);
        }
      }

      // Ensure no helpers overflow — they only exist in earlyIndex and lateIndex positions
      return ordered;
    };

    type TeamPool = {
      color: TeamColor;
      males: Player[];
      females: Player[];
      nonBinary: Player[];
      flexible: Player[]; // Players with noGenderRestriction - can fill ANY empty slot
    };

    const poolsByColor: Record<TeamColor, TeamPool> = {} as Record<TeamColor, TeamPool>;

    Object.values(TeamColor).forEach(color => {
      const pending = pendingPools[color];
      poolsByColor[color] = {
        color,
        males: buildOrderedList(pending.males, Gender.Male),
        females: buildOrderedList(pending.females, Gender.Female),
        nonBinary: buildOrderedList(pending.nonBinary, Gender.NonBinary),
        flexible: shuffleArray(pending.flexible)
      };
    });

    const orderedPools = Object.values(TeamColor).map(color => poolsByColor[color]);
    const matchups: Matchup[] = [];

    // Calculate max rows needed - flexible players can fill any gender slot
    // Find the team with the most total players (males + females + flexible)
    const maxCounts = orderedPools.reduce(
      (acc, pool) => {
        // For male/female rows, count gender-specific + all flexible that could potentially fill
        acc.maxMales = Math.max(acc.maxMales, pool.males.length);
        acc.maxFemales = Math.max(acc.maxFemales, pool.females.length);
        acc.maxNonBinary = Math.max(acc.maxNonBinary, pool.nonBinary.length);
        acc.maxFlexible = Math.max(acc.maxFlexible, pool.flexible.length);
        return acc;
      },
      { maxMales: 0, maxFemales: 0, maxNonBinary: 0, maxFlexible: 0 }
    );

    // Total rows needed = max(males) + max(females) + max(nonBinary) + extra rows for flexible
    // But flexible should fill gaps, not create new rows

    let maleRowIndex = 0;
    let femaleRowIndex = 0;
    let nonBinaryRowIndex = 0;
    let preferMale = true;

    // Track used flexible players per team (mutable arrays for shifting)
    const flexibleQueues: Record<TeamColor, Player[]> = {} as Record<TeamColor, Player[]>;
    Object.values(TeamColor).forEach(color => {
      flexibleQueues[color] = [...poolsByColor[color].flexible];
    });

    // Helper to get next available player, using flexible to fill empty slots
    const getNextPlayer = (pool: TeamPool, gender: 'male' | 'female' | 'nonBinary', currentIndex: number): Player | null => {
      let genderArray: Player[];
      if (gender === 'male') genderArray = pool.males;
      else if (gender === 'female') genderArray = pool.females;
      else genderArray = pool.nonBinary;
      
      if (currentIndex < genderArray.length) {
        return genderArray[currentIndex];
      }
      
      // No gender-specific player available - try to use a flexible player to fill the gap
      const flexQueue = flexibleQueues[pool.color];
      if (flexQueue.length > 0) {
        return flexQueue.shift()!; // Use and remove from queue
      }
      
      return null;
    };

    // Determine how many rows we actually need
    const totalMaleRows = maxCounts.maxMales;
    const totalFemaleRows = maxCounts.maxFemales;
    const totalNonBinaryRows = maxCounts.maxNonBinary;

    while (
      maleRowIndex < totalMaleRows ||
      femaleRowIndex < totalFemaleRows ||
      nonBinaryRowIndex < totalNonBinaryRows
    ) {
      const rowPlayers: MatchupPlayer[] = [];
      let addedRow = false;

      // Try to alternate between male and female, falling back if one is exhausted
      if (preferMale && maleRowIndex < totalMaleRows) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: getNextPlayer(pool, 'male', maleRowIndex) });
        });
        maleRowIndex++;
        addedRow = true;
        preferMale = false;
      } else if (!preferMale && femaleRowIndex < totalFemaleRows) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: getNextPlayer(pool, 'female', femaleRowIndex) });
        });
        femaleRowIndex++;
        addedRow = true;
        preferMale = true;
      } else if (maleRowIndex < totalMaleRows) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: getNextPlayer(pool, 'male', maleRowIndex) });
        });
        maleRowIndex++;
        addedRow = true;
      } else if (femaleRowIndex < totalFemaleRows) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: getNextPlayer(pool, 'female', femaleRowIndex) });
        });
        femaleRowIndex++;
        addedRow = true;
      } else if (nonBinaryRowIndex < totalNonBinaryRows) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: getNextPlayer(pool, 'nonBinary', nonBinaryRowIndex) });
        });
        nonBinaryRowIndex++;
        addedRow = true;
      }

      if (!addedRow) break;

      if (rowPlayers.some(entry => entry.player)) {
        matchups.push({ id: matchups.length + 1, players: rowPlayers });
      }
    }

    // After all gender rows, if there are still unused flexible players, add extra rows
    // Check if any team still has flexible players
    let hasRemainingFlexible = Object.values(flexibleQueues).some(q => q.length > 0);
    while (hasRemainingFlexible) {
      const rowPlayers: MatchupPlayer[] = [];
      Object.values(TeamColor).forEach(color => {
        const flexQueue = flexibleQueues[color];
        rowPlayers.push({ color, player: flexQueue.shift() || null });
      });
      
      if (rowPlayers.some(entry => entry.player)) {
        matchups.push({ id: matchups.length + 1, players: rowPlayers });
      }
      
      hasRemainingFlexible = Object.values(flexibleQueues).some(q => q.length > 0);
    }

    if (matchups.length === 0) {
      return [{
        id: 1,
        players: Object.values(TeamColor).map(color => ({ color, player: null }))
      }];
    }

    return matchups.map((row, idx) => ({ ...row, id: idx + 1 }));
  };

  const completeLottery = (finalTeams: Team[]) => {
    setTeams(finalTeams);
    // Automatically generate and show matchups
    const newMatchups = generateMatchups(finalTeams);
    setMatchups(newMatchups);
    setAppState(AppState.Matchups);
  };
  
  const resetApp = () => {
    // Confirmation handled in UI to avoid blocking/z-index issues
    setAppState(AppState.Setup);
    setPlayers([]);
    setTeams(Object.values(TeamColor).map(color => ({ color, members: [], hex: TEAM_CONFIG[color].hex, score: 0 })));
    setMatchups([]);
    localStorage.removeItem(LOCAL_STORAGE_TEAMS);
    localStorage.removeItem(LOCAL_STORAGE_MATCHUPS);
    localStorage.removeItem(LOCAL_STORAGE_STATE);
  };

  const handleImportResults = (importedTeams: Team[]) => {
    // Ensure score field exists on import
    const sanitized = importedTeams.map(t => ({ ...t, score: t.score || 0, members: t.members.map(m => ({...m, score: m.score || 0})) }));
    setTeams(sanitized);
    setAppState(AppState.Results);
  };

  // --- Matchup Generation & View ---
  const handleViewMatchups = () => {
    if (matchups.length > 0) {
      setAppState(AppState.Matchups);
    } else {
      // Should rarely happen if flow is followed, but safe fallback
      const newMatchups = generateMatchups(teams);
      setMatchups(newMatchups);
      setAppState(AppState.Matchups);
    }
  };

  const handleRegenerateOrder = () => {
    if (window.confirm("Reroll matchups? This will overwrite the existing playing order.")) {
      const newMatchups = generateMatchups(teams);
      setMatchups(newMatchups);
    }
  };

  const handleBackToHome = () => {
    if (appState === AppState.Landing) return;
    if (window.confirm("Return to home? All progress will be lost.")) {
      resetApp();
    }
  };

  const handleProceedToScoreboard = () => {
    setAppState(AppState.Results);
  };

  const handleOpenRaffle = () => {
    setAppState(AppState.Raffle);
  };

  const handleCloseRaffle = () => {
    setAppState(AppState.Results);
  };

  // --- Score Handling ---
  const updateTeamScore = (teamColor: TeamColor, delta: number) => {
    setTeams(prev => prev.map(t => {
      if (t.color === teamColor) {
        return { ...t, score: Math.max(0, (t.score || 0) + delta) };
      }
      return t;
    }));
  };

  const updatePlayerScore = (teamColor: TeamColor, playerId: string, delta: number) => {
    setTeams(prev => prev.map(t => {
      if (t.color === teamColor) {
        let teamDelta = 0;
        const newMembers = t.members.map(m => {
          if (m.id === playerId) {
            const newScore = Math.max(0, (m.score || 0) + delta);
            teamDelta = newScore - (m.score || 0);
            return { ...m, score: newScore };
          }
          return m;
        });
        return { 
          ...t, 
          members: newMembers,
          score: Math.max(0, (t.score || 0) + teamDelta) // Sync team score with player score changes
        };
      }
      return t;
    }));
  };

  return (
    <div className="min-h-screen bg-squid-dark text-white relative font-mono overflow-x-hidden selection:bg-squid-pink selection:text-white flex flex-col">
      {/* CRT Overlay Effect */}
      <div className="fixed inset-0 z-50 crt-overlay pointer-events-none"></div>
      
      {/* Landing Page Overlay */}
      {appState === AppState.Landing && (
        <LandingPage onInteract={handleInteraction} onComplete={handleLandingComplete} />
      )}

      <main className={`relative z-10 flex flex-col flex-1 min-h-screen transition-opacity duration-1000 ${appState === AppState.Landing ? 'opacity-0' : 'opacity-100'}`}>
        <header className="w-full p-4 md:p-6 flex justify-between items-center relative z-20 shrink-0">
          {/* Left: Icons - Clickable to go back home */}
          <button 
            onClick={handleBackToHome}
            disabled={appState === AppState.Landing}
            className="flex gap-2 justify-start opacity-50 hover:opacity-100 transition-opacity disabled:cursor-default disabled:hover:opacity-50"
          >
            <Icons.Circle className="w-5 h-5 md:w-6 md:h-6" />
            <Icons.Triangle className="w-5 h-5 md:w-6 md:h-6" />
            <Icons.Square className="w-5 h-5 md:w-6 md:h-6" />
          </button>
          
          {/* Right: Audio Control & Version */}
          <div className="flex items-center gap-6 opacity-80 hover:opacity-100 transition-opacity">
            <button 
              onClick={toggleMute}
              className="flex items-center gap-2 text-[10px] font-mono tracking-widest text-squid-pink hover:text-white transition-colors uppercase border border-squid-pink/30 px-3 py-1 rounded-sm hover:border-squid-pink hover:bg-squid-pink/10"
            >
              {isMuted ? (
                <>
                  <Icons.SpeakerX className="w-4 h-4" /> <span>OFF</span>
                </>
              ) : (
                <>
                  <Icons.SpeakerWave className="w-4 h-4" /> <span>ON</span>
                </>
              )}
            </button>
            <div className="text-[10px] md:text-xs tracking-widest text-right">
              Alvanon Xmas Party 2025
            </div>
          </div>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center relative w-full">
          {appState === AppState.Setup && (
            <InputPhase 
              players={players} 
              setPlayers={setPlayers} 
              onStart={startLottery} 
              onImportResults={handleImportResults}
            />
          )}
          {appState === AppState.Lottery && (
            <LotteryPhase players={players} initialTeams={teams} onComplete={completeLottery} isMuted={isMuted} />
          )}
          {appState === AppState.Matchups && (
             <PlayingOrderPhase 
                teams={teams} 
                matchups={matchups} 
                onProceed={handleProceedToScoreboard} 
                onReroll={handleRegenerateOrder}
             />
          )}
          {appState === AppState.Results && (
            <ResultsPhase 
              teams={teams} 
              matchups={matchups}
              onReset={resetApp} 
              onViewMatchups={handleViewMatchups}
              onOpenRaffle={handleOpenRaffle}
              updateTeamScore={updateTeamScore}
              updatePlayerScore={updatePlayerScore}
            />
          )}
          {appState === AppState.Raffle && (
            <RaffleSystem teams={teams} onBack={handleCloseRaffle} />
          )}
        </div>
      </main>
    </div>
  );
};

export default App;
