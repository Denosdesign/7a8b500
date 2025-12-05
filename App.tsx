
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
    const randomize = (arr: Player[]) => [...arr].sort(() => Math.random() - 0.5);

    type TeamPool = {
      color: TeamColor;
      forced: Player[];
      males: Player[];
      females: Player[];
      nonBinary: Player[];
    };

    const poolsByColor: Record<TeamColor, TeamPool> = {} as Record<TeamColor, TeamPool>;

    Object.values(TeamColor).forEach(color => {
      const team = currentTeams.find(t => t.color === color);
      const members = team ? [...team.members] : [];
      const forced = members.filter(m => m.forceFirstMatch);
      const available = members.filter(m => !m.forceFirstMatch);

      poolsByColor[color] = {
        color,
        forced,
        males: randomize(available.filter(m => m.gender === Gender.Male)),
        females: randomize(available.filter(m => m.gender === Gender.Female)),
        nonBinary: randomize(available.filter(m => m.gender === Gender.NonBinary))
      };
    });

    const orderedPools = Object.values(TeamColor).map(color => poolsByColor[color]);
    const hasForced = orderedPools.some(pool => pool.forced.length > 0);
    const matchups: Matchup[] = [];

    if (hasForced) {
      const firstRowPlayers: MatchupPlayer[] = Object.values(TeamColor).map(color => {
        const pool = poolsByColor[color];
        if (!pool) {
          return { color, player: null };
        }
        const player =
          pool.forced.shift() ||
          pool.males.shift() ||
          pool.females.shift() ||
          pool.nonBinary.shift() ||
          null;
        return { color, player };
      });

      if (firstRowPlayers.some(entry => entry.player)) {
        matchups.push({ id: 1, players: firstRowPlayers });
      }
    }

    const maxCounts = orderedPools.reduce(
      (acc, pool) => {
        acc.maxMales = Math.max(acc.maxMales, pool.males.length);
        acc.maxFemales = Math.max(acc.maxFemales, pool.females.length);
        acc.maxNonBinary = Math.max(acc.maxNonBinary, pool.nonBinary.length);
        return acc;
      },
      { maxMales: 0, maxFemales: 0, maxNonBinary: 0 }
    );

    let maleRowIndex = 0;
    let femaleRowIndex = 0;
    let nonBinaryRowIndex = 0;
    let isMaleRow = true;

    while (
      maleRowIndex < maxCounts.maxMales ||
      femaleRowIndex < maxCounts.maxFemales ||
      nonBinaryRowIndex < maxCounts.maxNonBinary
    ) {
      const rowPlayers: MatchupPlayer[] = [];

      if (isMaleRow && maleRowIndex < maxCounts.maxMales) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: pool?.males[maleRowIndex] ?? null });
        });
        maleRowIndex++;
      } else if (!isMaleRow && femaleRowIndex < maxCounts.maxFemales) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: pool?.females[femaleRowIndex] ?? null });
        });
        femaleRowIndex++;
      } else if (nonBinaryRowIndex < maxCounts.maxNonBinary) {
        Object.values(TeamColor).forEach(color => {
          const pool = poolsByColor[color];
          rowPlayers.push({ color, player: pool?.nonBinary[nonBinaryRowIndex] ?? null });
        });
        nonBinaryRowIndex++;
      } else {
        break;
      }

      if (rowPlayers.some(entry => entry.player)) {
        matchups.push({ id: matchups.length + 1, players: rowPlayers });
      }

      isMaleRow = !isMaleRow;
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
