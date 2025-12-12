
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

// In your App.tsx or main entry
const APP_VERSION = '1.0.3';
const STORED_VERSION = localStorage.getItem('app-version');

if (STORED_VERSION !== APP_VERSION) {
  // Clear old data
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('app-version', APP_VERSION);
}

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

    // "0" marked players (noGenderRestriction) used to be fully flexible.
    // New rule: the FIRST "0" marked player becomes the Game 1 anchor:
    // - Game 1 starts with that player's gender (e.g. Female-first)
    // - That player is pinned into Game 1 for their team
    // - Other "0" marked players still fill gaps, but only within their own gender rows
    const findGame1Anchor = (): Player | null => {
      for (const color of Object.values(TeamColor)) {
        const team = currentTeams.find(t => t.color === color);
        const found = team?.members?.find(m => m.noGenderRestriction);
        if (found) return found;
      }
      return null;
    };

    type RowGenderKey = 'male' | 'female' | 'nonBinary';
    const toRowGenderKey = (gender: Gender): RowGenderKey => {
      if (gender === Gender.Male) return 'male';
      if (gender === Gender.Female) return 'female';
      return 'nonBinary';
    };

    const game1Anchor = findGame1Anchor();
    const game1Gender: RowGenderKey | null = game1Anchor ? toRowGenderKey(game1Anchor.gender) : null;

    type HelperBucket = 'early' | 'late';
    type HelperInfo = {
      player: Player;
      teamColor: TeamColor;
      totalPlayers: number;
    };

    const getHelperBaseSlotConfig = (gender: Gender): { earlyIndex: number | null; lateIndex: number | null } => {
      if (gender === Gender.NonBinary) return { earlyIndex: null, lateIndex: null };

      const isStartGender = Boolean(game1Anchor && game1Anchor.gender === gender);

      // Target helper games:
      // - Special Game 01 helper is pinned to index 0 for the start gender.
      // - For the start gender, DO NOT place additional helpers at index 1 (Game 3).
      //   They should go to the late slot (index 2 => Game 5) to keep Game 3 balanced.
      // - For the other gender, helpers can be early (index 0 => Game 2) and late (index 2 => Game 6).
      if (game1Anchor && isStartGender) return { earlyIndex: null, lateIndex: 2 };
      return { earlyIndex: 0, lateIndex: 2 };
    };

    const getHelperSlotConfig = (
      gender: Gender,
      totalPlayers: number
    ): { earlyIndex: number | null; lateIndex: number | null } => {
      const base = getHelperBaseSlotConfig(gender);
      if (base.earlyIndex === null && base.lateIndex === null) {
        return { earlyIndex: null, lateIndex: null };
      }

      const earlyIndex = totalPlayers > 0 && base.earlyIndex !== null && base.earlyIndex < totalPlayers ? base.earlyIndex : null;

      // Make "late" usable even for smaller teams:
      // - clamp to last index (e.g. base lateIndex=2, team has 2 players => lateIndex becomes 1)
      // - never equal earlyIndex
      let lateIndex: number | null = null;
      if (base.lateIndex !== null && totalPlayers >= 2) {
        lateIndex = Math.min(base.lateIndex, totalPlayers - 1);
        if (earlyIndex !== null && lateIndex === earlyIndex) {
          // For the start gender when a Game 01 helper is pinned at index 0,
          // never force "late" into index 0 just to avoid a collision.
          const isStartGender = Boolean(game1Anchor && game1Anchor.gender === gender);
          if (game1Anchor && isStartGender) {
            lateIndex = null;
          } else {
            lateIndex = totalPlayers >= 2 ? (earlyIndex === 0 ? 1 : 0) : null;
          }
        }

        // Same guard: don't push a helper into Game 01 for the start gender.
        const isStartGender = Boolean(game1Anchor && game1Anchor.gender === gender);
        if (game1Anchor && isStartGender && lateIndex === 0) {
          lateIndex = null;
        }
      }

      return { earlyIndex, lateIndex };
    };

    const helperBucketAssignments: Partial<Record<string, HelperBucket>> = {};
    const helperInfosByGender: Record<Gender, HelperInfo[]> = {
      [Gender.Male]: [],
      [Gender.Female]: [],
      [Gender.NonBinary]: []
    };

    const pickGame1HelperId = (gender: Gender): string | null => {
      const infos = helperInfosByGender[gender];
      if (!infos.length) return null;
      const best = [...infos]
        .sort((a, b) => {
          const firstChar = (name: string) => (name.trim().charAt(0).toUpperCase() || '\u0000');
          const byFirst = firstChar(b.player.name).localeCompare(firstChar(a.player.name), undefined, { sensitivity: 'base' });
          if (byFirst !== 0) return byFirst;
          return b.player.name.localeCompare(a.player.name, undefined, { sensitivity: 'base' });
        })[0];
      return best?.player.id ?? null;
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

    const lockedFirstByTeamAndGender: Record<TeamColor, Partial<Record<Gender, Player>>> = {} as Record<
      TeamColor,
      Partial<Record<Gender, Player>>
    >;

    const genderCountsByTeam: Record<TeamColor, Record<Gender, number>> = {} as Record<TeamColor, Record<Gender, number>>;

    Object.values(TeamColor).forEach(color => {
      const team = currentTeams.find(t => t.color === color);
      const members = team ? [...team.members] : [];

      lockedFirstByTeamAndGender[color] = {};

      const isAnchor = (player: Player) => Boolean(game1Anchor && player.id === game1Anchor.id);

      // Anchor is treated as gender-specific (so it follows its gender) and pinned to Game 1.
      // Other noGenderRestriction players remain flexible, but will only fill same-gender rows later.
      const flexible = members.filter(m => m.noGenderRestriction && !isAnchor(m));
      const genderSpecific = members.filter(m => !m.noGenderRestriction || isAnchor(m));

      const malesAll = genderSpecific.filter(m => m.gender === Gender.Male);
      const femalesAll = genderSpecific.filter(m => m.gender === Gender.Female);
      const nonBinaryAll = genderSpecific.filter(m => m.gender === Gender.NonBinary);

      const lockedMale = malesAll.find(isAnchor);
      const lockedFemale = femalesAll.find(isAnchor);
      const lockedNonBinary = nonBinaryAll.find(isAnchor);

      if (lockedMale) lockedFirstByTeamAndGender[color][Gender.Male] = lockedMale;
      if (lockedFemale) lockedFirstByTeamAndGender[color][Gender.Female] = lockedFemale;
      if (lockedNonBinary) lockedFirstByTeamAndGender[color][Gender.NonBinary] = lockedNonBinary;

      // Remove locked player from the pool that gets shuffled/ordered; we'll prepend it back later.
      const males = lockedMale ? malesAll.filter(p => p.id !== lockedMale.id) : malesAll;
      const females = lockedFemale ? femalesAll.filter(p => p.id !== lockedFemale.id) : femalesAll;
      const nonBinary = lockedNonBinary ? nonBinaryAll.filter(p => p.id !== lockedNonBinary.id) : nonBinaryAll;

      pendingPools[color] = {
        males,
        females,
        nonBinary,
        flexible: shuffleArray(flexible)
      };

      const counts = initGenderCount();
      counts[Gender.Male] = malesAll.length;
      counts[Gender.Female] = femalesAll.length;
      counts[Gender.NonBinary] = nonBinaryAll.length;
      genderCountsByTeam[color] = counts;

      malesAll.forEach(player => {
        if (player.isHelper) {
          if (isAnchor(player)) return;
          helperInfosByGender[Gender.Male].push({ player, teamColor: color, totalPlayers: malesAll.length });
        }
      });

      femalesAll.forEach(player => {
        if (player.isHelper) {
          if (isAnchor(player)) return;
          helperInfosByGender[Gender.Female].push({ player, teamColor: color, totalPlayers: femalesAll.length });
        }
      });

      nonBinaryAll.forEach(player => {
        if (player.isHelper) {
          if (isAnchor(player)) return;
          helperInfosByGender[Gender.NonBinary].push({ player, teamColor: color, totalPlayers: nonBinaryAll.length });
        }
      });
    });

    // When a "0" anchor exists, pick EXACTLY ONE Game 01 helper (global, not per team)
    // by first character Z→A (tie-breaker: full name), and exclude it from balancing.
    const game1HelperId: string | null = game1Anchor ? pickGame1HelperId(game1Anchor.gender) : null;

    Object.values(TeamColor).forEach(color => {
      const counts = genderCountsByTeam[color];
      ([Gender.Male, Gender.Female, Gender.NonBinary] as Gender[]).forEach(gender => {
        const { earlyIndex, lateIndex } = getHelperSlotConfig(gender, counts[gender]);
        if (earlyIndex !== null) {
          helperBucketCapacities[gender].early += 1;
        }
        if (lateIndex !== null) {
          helperBucketCapacities[gender].late += 1;
        }
      });
    });

    const assignBucketsForGender = (gender: Gender) => {
      const infos = helperInfosByGender[gender].filter(info => info.player.id !== game1HelperId);
      if (!infos.length) return;

      const capacities = helperBucketCapacities[gender];
      const randomized = shuffleArray(infos);
      let lateAssigned = 0;

      const usedLateTeams = new Set<TeamColor>();
      const usedEarlyTeams = new Set<TeamColor>();

      const isStartGender = Boolean(game1Anchor && game1Anchor.gender === gender);

      // If Game 1 starts with this gender, keep the remaining helpers out of the "early" slot
      // (which would otherwise land in Game 3 for that gender row). Put them into the late slot.
      if (game1Anchor && isStartGender) {
        if (capacities.late > 0) {
          const lateEligible = randomized.filter(info => getHelperSlotConfig(gender, info.totalPlayers).lateIndex !== null);
          const lateTarget = Math.min(infos.length, capacities.late, lateEligible.length);
          if (lateTarget > 0) {
            const shuffledEligible = shuffleArray(lateEligible);
            let picked = 0;
            for (const info of shuffledEligible) {
              if (picked >= lateTarget) break;
              if (usedLateTeams.has(info.teamColor)) continue;
              helperBucketAssignments[info.player.id] = 'late';
              usedLateTeams.add(info.teamColor);
              picked++;
            }
          }
        }
        return;
      }

      if (capacities.late > 0) {
        const lateEligible = randomized.filter(info => getHelperSlotConfig(gender, info.totalPlayers).lateIndex !== null);
        const lateTarget = Math.min(Math.floor(infos.length / 2), capacities.late, lateEligible.length);
        if (lateTarget > 0) {
          const shuffledEligible = shuffleArray(lateEligible);
          let picked = 0;
          for (const info of shuffledEligible) {
            if (picked >= lateTarget) break;
            if (usedLateTeams.has(info.teamColor)) continue;
            helperBucketAssignments[info.player.id] = 'late';
            usedLateTeams.add(info.teamColor);
            picked++;
          }
          lateAssigned = lateTarget;
        }
      }

      if (capacities.early > 0) {
        const remaining = randomized.filter(info => {
          if (helperBucketAssignments[info.player.id]) return false;
          if (usedEarlyTeams.has(info.teamColor)) return false;
          return getHelperSlotConfig(gender, info.totalPlayers).earlyIndex !== null;
        });
        const desiredEarly = Math.min(infos.length - lateAssigned, capacities.early, remaining.length);
        if (desiredEarly > 0) {
          remaining.slice(0, desiredEarly).forEach(info => {
            helperBucketAssignments[info.player.id] = 'early';
            usedEarlyTeams.add(info.teamColor);
          });
        }
      }
    };

    assignBucketsForGender(Gender.Male);
    assignBucketsForGender(Gender.Female);

    const buildOrderedList = (players: Player[], gender: Gender) => {
      if (players.length === 0) return [];
      const { earlyIndex, lateIndex } = getHelperSlotConfig(gender, players.length);

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

      // Decide which helpers (at most one each) get early/late.
      // Special rule: when a "0" anchor exists, ONLY ONE helper globally is pinned into Game 01.
      const isStartGender = Boolean(game1Anchor && game1Anchor.gender === gender);
      const game1Pick = isStartGender && game1HelperId ? helpers.find(h => h.id === game1HelperId) : undefined;

      const helpersForBuckets = game1Pick ? helpers.filter(h => h.id !== game1Pick.id) : helpers;

      const bucketedEarly = helpersForBuckets.filter(h => helperBucketAssignments[h.id] === 'early');
      const bucketedLate = helpersForBuckets.filter(h => helperBucketAssignments[h.id] === 'late');

      const earlyPick = earlyIndex !== null ? bucketedEarly[0] : undefined;
      const latePick = lateIndex !== null ? bucketedLate.find(h => h.id !== earlyPick?.id) : undefined;

      const spilloverHelpers = helpersForBuckets.filter(h => h.id !== earlyPick?.id && h.id !== latePick?.id);

      // For the start gender (when Game 01 is pinned), keep helpers out of index 1 (Game 3)
      // by filling regulars first.
      const remainingPool = isStartGender
        ? [...shuffleArray(regulars), ...shuffleArray(spilloverHelpers)]
        : shuffleArray([...regulars, ...spilloverHelpers]);

      const ordered: Player[] = new Array(shuffled.length);
      for (let idx = 0; idx < shuffled.length; idx++) {
        if (game1Pick && idx === 0) {
          ordered[idx] = game1Pick;
          continue;
        }
        if (earlyIndex !== null && idx === earlyIndex && earlyPick) {
          ordered[idx] = earlyPick;
          continue;
        }
        if (lateIndex !== null && idx === lateIndex && latePick) {
          ordered[idx] = latePick;
          continue;
        }
        const next = remainingPool.shift();
        if (next) ordered[idx] = next;
      }

      return ordered.filter(Boolean);
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
      const locked = lockedFirstByTeamAndGender[color];

      const orderedMalesBase = buildOrderedList(pending.males, Gender.Male);
      const orderedFemalesBase = buildOrderedList(pending.females, Gender.Female);
      const orderedNonBinaryBase = buildOrderedList(pending.nonBinary, Gender.NonBinary);

      poolsByColor[color] = {
        color,
        males: locked?.[Gender.Male] ? [locked[Gender.Male]!, ...orderedMalesBase] : orderedMalesBase,
        females: locked?.[Gender.Female] ? [locked[Gender.Female]!, ...orderedFemalesBase] : orderedFemalesBase,
        nonBinary: locked?.[Gender.NonBinary] ? [locked[Gender.NonBinary]!, ...orderedNonBinaryBase] : orderedNonBinaryBase,
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
    // Start Game 1 with the anchor's gender (Female-first if anchor is female).
    // If no anchor exists, keep the historical default (Male-first).
    let preferMale = game1Gender ? game1Gender === 'male' : true;

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
      
      // No gender-specific player available - try to use a flexible player to fill the gap,
      // but ONLY if the flexible player's own gender matches this row.
      const flexQueue = flexibleQueues[pool.color];

      const desiredGender =
        gender === 'male' ? Gender.Male : gender === 'female' ? Gender.Female : Gender.NonBinary;
      const matchingIndex = flexQueue.findIndex(p => p.gender === desiredGender);
      if (matchingIndex >= 0) {
        const picked = flexQueue.splice(matchingIndex, 1);
        return picked[0] ?? null;
      }
      
      return null;
    };

    // Determine how many rows we actually need
    const totalMaleRows = maxCounts.maxMales;
    const totalFemaleRows = maxCounts.maxFemales;
    const totalNonBinaryRows = maxCounts.maxNonBinary;

    // If the anchor is NonBinary, force Game 1 to be the NonBinary row (if any rows exist).
    if (game1Gender === 'nonBinary' && nonBinaryRowIndex < totalNonBinaryRows) {
      const rowPlayers: MatchupPlayer[] = [];
      Object.values(TeamColor).forEach(color => {
        const pool = poolsByColor[color];
        rowPlayers.push({ color, player: getNextPlayer(pool, 'nonBinary', nonBinaryRowIndex) });
      });
      nonBinaryRowIndex++;
      if (rowPlayers.some(entry => entry.player)) {
        matchups.push({ id: matchups.length + 1, players: rowPlayers });
      }
    }

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

  const handleImportResults = (importedTeams: Team[], importedMatchups?: Matchup[]) => {
    // Ensure score field exists on import
    const sanitized = importedTeams.map(t => ({ ...t, score: t.score || 0, members: t.members.map(m => ({...m, score: m.score || 0})) }));
    setTeams(sanitized);
    if (importedMatchups && importedMatchups.length > 0) {
      setMatchups(importedMatchups);
    }
    setAppState(AppState.Results);
  };

  const handleLoadResultsInScoreboard = (loadedTeams: Team[], loadedMatchups: Matchup[]) => {
    // Fully replace teams and matchups when loading from scoreboard
    const sanitized = loadedTeams.map(t => ({ ...t, score: t.score || 0, members: t.members.map(m => ({...m, score: m.score || 0})) }));
    setTeams(sanitized);
    if (loadedMatchups && loadedMatchups.length > 0) {
      setMatchups(loadedMatchups);
    }
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

  const handleUpdateMatchups = (updatedMatchups: Matchup[]) => {
    setMatchups(updatedMatchups);
  };

  const handleUpdateTeams = (updatedTeams: Team[]) => {
    setTeams(updatedTeams);
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
              onLoadResults={handleLoadResultsInScoreboard}
              onUpdateMatchups={handleUpdateMatchups}
              onUpdateTeams={handleUpdateTeams}
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
