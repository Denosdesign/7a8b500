import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Team } from '../types';
import { Button } from './Button';
import { TEAM_CONFIG } from '../constants';

interface RaffleSystemProps {
  teams: Team[];
  onBack: () => void;
}

interface PlayerWithTeam {
  id: string;
  name: string;
  gender: string;
  score: number;
  teamColor: Team['color'];
}

const LOCAL_STORAGE_EXCLUDED = 'squid-raffle-excluded';

const SquidBackdrop = () => (
  <div className="absolute inset-0 overflow-hidden pointer-events-none">
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_#0f172a,_#010104)] opacity-80" />
    <div className="absolute inset-0 mix-blend-screen opacity-40">
      <div className="absolute -left-32 top-10 w-72 h-72 border-4 border-squid-pink/60 rounded-full animate-pulse-slow" />
      <div className="absolute right-12 -top-8 w-0 h-0 border-l-[80px] border-l-transparent border-r-[80px] border-r-transparent border-b-[140px] border-b-squid-pink/40 rotate-6" />
      <div className="absolute left-1/2 bottom-0 w-48 h-48 border-[14px] border-squid-pink/30" />
    </div>
    <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[length:120px_120px] opacity-20" />
  </div>
);

export const RaffleSystem: React.FC<RaffleSystemProps> = ({ teams, onBack }) => {
  const allPlayers = useMemo<PlayerWithTeam[]>(() => {
    return teams.flatMap(team =>
      team.members.map(member => ({ ...member, teamColor: team.color }))
    );
  }, [teams]);

  const [excludedIds, setExcludedIds] = useState<string[]>(() => {
    const saved = localStorage.getItem(LOCAL_STORAGE_EXCLUDED);
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem(LOCAL_STORAGE_EXCLUDED, JSON.stringify(excludedIds));
  }, [excludedIds]);

  const eligiblePlayers = useMemo(() => allPlayers.filter(p => !excludedIds.includes(p.id)), [allPlayers, excludedIds]);
  const removedPlayers = useMemo(() => allPlayers.filter(p => excludedIds.includes(p.id)), [allPlayers, excludedIds]);

  const [isSpinning, setIsSpinning] = useState(false);
  const [displayedPlayer, setDisplayedPlayer] = useState<PlayerWithTeam | null>(null);
  const [winner, setWinner] = useState<PlayerWithTeam | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stopSpin = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setIsSpinning(false);
  };

  const handleDraw = () => {
    if (eligiblePlayers.length === 0 || isSpinning) return;

    setIsSpinning(true);
    setWinner(null);

    intervalRef.current = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * eligiblePlayers.length);
      setDisplayedPlayer(eligiblePlayers[randomIndex]);
    }, 80);

    timeoutRef.current = setTimeout(() => {
      stopSpin();
      const finalIndex = Math.floor(Math.random() * eligiblePlayers.length);
      const finalWinner = eligiblePlayers[finalIndex];
      setDisplayedPlayer(finalWinner);
      setWinner(finalWinner);
    }, 3600);
  };

  const handleRemove = () => {
    if (!winner) return;
    setExcludedIds(prev => (prev.includes(winner.id) ? prev : [...prev, winner.id]));
    setWinner(null);
    setDisplayedPlayer(null);
  };

  const handleKeep = () => {
    setWinner(null);
    setDisplayedPlayer(null);
  };

  const handleResetPool = () => {
    if (window.confirm('Reset the lucky draw pool?')) {
      setExcludedIds([]);
    }
  };

  useEffect(() => () => stopSpin(), []);

  return (
    <div className="relative min-h-screen w-full px-4 md:px-10 py-10 text-white">
      <SquidBackdrop />

      <div className="relative max-w-6xl mx-auto flex flex-col gap-10">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-6 border-b border-white/10 pb-6">
          <div>
            <p className="text-xs font-mono tracking-[0.4em] text-squid-pink">SQUID DRAW PROTOCOL</p>
            <h1 className="text-4xl md:text-6xl font-display tracking-[0.3em] text-white">RAFFLE CHAMBER</h1>
            <p className="mt-2 text-gray-400 font-mono text-xs uppercase">Name Pool: {eligiblePlayers.length} / {allPlayers.length} alive</p>
          </div>
          <div className="flex flex-wrap gap-4">
            <Button onClick={handleDraw} disabled={isSpinning || eligiblePlayers.length === 0 || !!winner} className="px-8 py-3 text-base">
              {isSpinning ? 'SPINNING' : 'INITIATE DRAW'}
            </Button>
            <Button onClick={onBack} variant="secondary" disabled={isSpinning} className="px-6 py-3 text-xs">
              BACK TO SCOREBOARD
            </Button>
          </div>
        </div>

        <div className="relative bg-black/40 border border-white/10 rounded-xl py-12 px-6 backdrop-blur-lg shadow-[0_20px_60px_rgba(0,0,0,0.65)] overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(237,27,118,0.15),transparent_60%)]" />
          <div className="absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-transparent via-squid-pink to-transparent animate-scan" />
          <div className="absolute inset-y-0 right-0 w-1 bg-gradient-to-b from-transparent via-squid-pink to-transparent animate-scan delay-1000" />

          <div className="relative flex flex-col items-center text-center gap-4">
            {displayedPlayer ? (
              <>
                <div className="text-sm font-mono tracking-[0.5em] text-gray-400">SELECTED SUBJECT</div>
                <div
                  className="text-4xl md:text-6xl font-display tracking-[0.2em]"
                  style={{ color: TEAM_CONFIG[displayedPlayer.teamColor].hex }}
                >
                  {displayedPlayer.name}
                </div>
                <div className="text-lg uppercase tracking-[0.6em] text-gray-300">
                  {displayedPlayer.teamColor}
                </div>
                <div
                  className={`text-base font-bold uppercase tracking-widest ${
                    displayedPlayer.gender === 'M'
                      ? 'text-blue-400'
                      : displayedPlayer.gender === 'F'
                      ? 'text-pink-400'
                      : 'text-purple-400'
                  }`}
                >
                  {displayedPlayer.gender}
                </div>
              </>
            ) : (
              <div className="text-gray-600 font-mono tracking-[0.4em] text-lg uppercase">PUSH THE BUTTON</div>
            )}
          </div>

          {winner && !isSpinning && (
            <div className="absolute inset-0 bg-black/80 backdrop-blur-xl flex flex-col items-center justify-center gap-6 text-center animate-fade-in">
              <p className="text-xs font-mono tracking-[0.7em] text-squid-pink">WINNER LOCKED</p>
              <h2 className="text-5xl md:text-7xl font-display tracking-[0.3em]">{winner.name}</h2>
              <p
                className="text-xl font-mono tracking-[0.6em]"
                style={{ color: TEAM_CONFIG[winner.teamColor].hex }}
              >
                {winner.teamColor} TEAM
              </p>
              <div className="flex gap-4 flex-wrap justify-center">
                <Button variant="danger" onClick={handleRemove} className="min-w-[160px]">
                  REMOVE
                </Button>
                <Button onClick={handleKeep} className="min-w-[160px]">
                  KEEP
                </Button>
              </div>
              <p className="text-[10px] text-gray-500 font-mono uppercase">Remove eliminates the player from future draws</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-black/35 border border-white/5 rounded-xl p-6 backdrop-blur">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display tracking-[0.5em] text-xs text-gray-400">ACTIVE NAME POOL</h3>
              <span className="text-xs text-gray-500 font-mono">{eligiblePlayers.length} REMAIN</span>
            </div>
            {eligiblePlayers.length === 0 ? (
              <p className="text-gray-500 text-sm font-mono">No players available. Reset the pool to continue.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
                {[...eligiblePlayers]
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map(player => (
                    <div
                      key={player.id}
                      className={`p-3 border rounded-lg text-sm font-mono transition-colors ${
                        displayedPlayer?.id === player.id
                          ? 'border-squid-pink text-white'
                          : 'border-white/10 text-gray-300 hover:border-squid-pink/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span>{player.name}</span>
                        <span className="text-[10px] text-gray-500">{player.teamColor}</span>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          <div className="bg-black/25 border border-white/5 rounded-xl p-6 backdrop-blur flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <h3 className="font-display tracking-[0.4em] text-xs text-gray-400">REMOVED</h3>
              <button
                onClick={handleResetPool}
                className="text-[10px] uppercase tracking-[0.4em] text-squid-pink hover:text-white transition-colors"
              >
                Reset Pool
              </button>
            </div>
            <div className="text-xs text-gray-500 font-mono">Excluded: {removedPlayers.length}</div>
            <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1 custom-scrollbar">
              {removedPlayers.length === 0 && <p className="text-gray-600 text-sm font-mono">No removed players.</p>}
              {removedPlayers.map(player => (
                <div key={player.id} className="p-3 border border-white/10 rounded-lg text-sm font-mono text-gray-400 flex justify-between">
                  <span>{player.name}</span>
                  <span className="text-[10px] text-gray-600">{player.teamColor}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
