import React, { useState, useEffect, useRef, useMemo, useLayoutEffect, useCallback } from 'react';
import { Player, Team, TeamColor } from '../types';
import { TEAM_CONFIG, Icons } from '../constants';
import { Button } from './Button';

const HUD_TOP_OFFSET = 80;
const WINNER_COLOR_HEX = TEAM_CONFIG[TeamColor.Pink].hex;
const LOCAL_STORAGE_RAFFLE_WINNERS = 'squid-raffle-winners';

type RaffleSystemProps = {
  teams: Team[];
  onBack: () => void;
  isMuted?: boolean;
  rollDurationMs?: number;
};

const getStoredWinnerIds = (): string[] => {
  if (typeof window === 'undefined') {
    return [];
  }
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_RAFFLE_WINNERS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const RaffleSystem: React.FC<RaffleSystemProps> = ({ teams, onBack, isMuted = false, rollDurationMs }) => {
  const players = useMemo(() => teams.flatMap(team => team.members), [teams]);
  const rollDuration = Math.max(500, rollDurationMs ?? 6800);

  const [winnerIds, setWinnerIds] = useState<string[]>(() => getStoredWinnerIds());
  const winnerIdSet = useMemo(() => new Set(winnerIds), [winnerIds]);

  // Keep stored winners in sync with the current roster
  useEffect(() => {
    setWinnerIds(prev => prev.filter(id => players.some(player => player.id === id)));
  }, [players]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(LOCAL_STORAGE_RAFFLE_WINNERS, JSON.stringify(winnerIds));
    }
  }, [winnerIds]);

  const pool = useMemo(() => players.filter(player => !winnerIdSet.has(player.id)), [players, winnerIdSet]);
  const winners = useMemo(() => players.filter(player => winnerIdSet.has(player.id)), [players, winnerIdSet]);

  const [isRolling, setIsRolling] = useState(false);
  const [rollingCandidate, setRollingCandidate] = useState<Player | null>(null);
  const [drawnPlayer, setDrawnPlayer] = useState<Player | null>(null);

  const tickAudioRef = useRef<HTMLAudioElement | null>(null);
  const boomAudioRef = useRef<HTMLAudioElement | null>(null);
  const rollingAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    tickAudioRef.current = new Audio('https://files.catbox.moe/eny100.mp3');
    tickAudioRef.current.volume = 0.3;

    boomAudioRef.current = new Audio('https://files.catbox.moe/729555.mp3');
    boomAudioRef.current.volume = 0.6;

    rollingAudioRef.current = new Audio('https://files.catbox.moe/d8ddtx.mp3');
    rollingAudioRef.current.volume = 0.5;
    rollingAudioRef.current.loop = false;
  }, []);

  const startDraw = async () => {
    if (pool.length === 0 || isRolling) return;

    setIsRolling(true);
    setDrawnPlayer(null);

    if (!isMuted && rollingAudioRef.current) {
      rollingAudioRef.current.currentTime = 0;
      rollingAudioRef.current.play().catch(() => {});
    }

    const winnerIndex = Math.floor(Math.random() * pool.length);
    const finalWinner = pool[winnerIndex];

    const duration = rollDuration;
    const startTime = Date.now();
    const rollingOrder = [...pool];

    // Simple Fisher-Yates shuffle so the sweep order feels fresh every draw
    for (let i = rollingOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rollingOrder[i], rollingOrder[j]] = [rollingOrder[j], rollingOrder[i]];
    }

    const tickInterval = 80;
    const sequenceLength = Math.max(
      rollingOrder.length,
      Math.ceil(duration / tickInterval)
    );
    const sequence = Array.from({ length: sequenceLength }, (_, idx) => rollingOrder[idx % rollingOrder.length]);
    let sequenceIndex = 0;

    await new Promise<void>(resolve => {
      const fadeOutDuration = 300; // ms for fade out
      const interval = setInterval(() => {
        const elapsed = Date.now() - startTime;
        const candidate = sequence[sequenceIndex];
        sequenceIndex = (sequenceIndex + 1) % sequence.length;
        setRollingCandidate(candidate);

        if (!isMuted && tickAudioRef.current && Math.random() > 0.5) {
          const clone = tickAudioRef.current.cloneNode() as HTMLAudioElement;
          clone.playbackRate = 0.8 + Math.random() * 0.6;
          clone.volume = 0.15;
          clone.play().catch(() => {});
        }

        if (elapsed >= duration) {
          clearInterval(interval);
          
          // Fade out rolling audio
          if (!isMuted && rollingAudioRef.current) {
            const fadeOutInterval = setInterval(() => {
              if (rollingAudioRef.current) {
                rollingAudioRef.current.volume = Math.max(0, rollingAudioRef.current.volume - 0.05);
                if (rollingAudioRef.current.volume <= 0) {
                  clearInterval(fadeOutInterval);
                  rollingAudioRef.current.pause();
                  rollingAudioRef.current.volume = 0.5; // Reset for next use
                }
              }
            }, fadeOutDuration / 10);
          }
          
          resolve();
        }
      }, 80);
    });

    setRollingCandidate(null);
    setDrawnPlayer(finalWinner);
    setIsRolling(false);

    if (!isMuted && boomAudioRef.current) {
      boomAudioRef.current.currentTime = 0;
      boomAudioRef.current.play().catch(() => {});
    }
  };

  const handleKeepInPool = () => {
    setDrawnPlayer(null);
  };

  const handleRemoveFromPool = () => {
    if (!drawnPlayer) return;
    setWinnerIds(prev => (prev.includes(drawnPlayer.id) ? prev : [...prev, drawnPlayer.id]));
    setDrawnPlayer(null);
  };

  const handleResetPool = () => {
    if (window.confirm('Reset raffle winners and return everyone to the pool?')) {
      setWinnerIds([]);
      setDrawnPlayer(null);
      setRollingCandidate(null);
    }
  };

  const handleBack = () => {
    setDrawnPlayer(null);
    setRollingCandidate(null);
    setIsRolling(false);
    onBack();
  };

  const sortedPlayers = useMemo(() => {
    return [...players].sort((a, b) => a.name.localeCompare(b.name));
  }, [players]);

  const tileLayout = useMemo(() => {
    const tileSize = 100;
    const tileGap = 8;
    const diag = tileSize * Math.SQRT2;
    const spacingX = diag + tileGap;
    const spacingY = diag / 2 + tileGap / 2;
    const aspectRatio = 1;
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

  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);

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
    const paddingRatio = 1.0;
    const fitScale = Math.max(0.1, Math.min(width / worldWidth, height / worldHeight) * paddingRatio);
    const clampedScale = Math.min(fitScale, 5);

    const pointX = (width - worldWidth * clampedScale) / 0.8;
    const pointY = (height - worldHeight * clampedScale) / 2;
    const yOffset = 80;
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

  useLayoutEffect(() => {
    setTimeout(resetView, 100);
  }, [resetView]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const state = viewState.current;
      const xs = (e.clientX - state.pointX) / state.scale;
      const ys = (e.clientY - state.pointY) / state.scale;
      const delta = -e.deltaY;
      delta > 0 ? (state.scale *= 1.1) : (state.scale /= 1.1);
      state.scale = Math.min(Math.max(0.1, state.scale), 5);
      state.pointX = e.clientX - xs * state.scale;
      state.pointY = e.clientY - ys * state.scale;
      updateTransform();
    };

    const onMouseDown = (e: MouseEvent) => {
      viewState.current.panning = true;
      viewState.current.startX = e.clientX - viewState.current.pointX;
      viewState.current.startY = e.clientY - viewState.current.pointY;
      viewport.style.cursor = 'grabbing';
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!viewState.current.panning) return;
      e.preventDefault();
      viewState.current.pointX = e.clientX - viewState.current.startX;
      viewState.current.pointY = e.clientY - viewState.current.startY;
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
      <div ref={viewportRef} className="flex-1 min-h-0 w-full overflow-hidden cursor-grab flex justify-center items-center relative z-0">
        <div
          ref={worldRef}
          className="origin-top-left absolute will-change-transform"
          style={{
            width: `${tileLayout.totalWidth}px`,
            height: `${tileLayout.totalHeight}px`,
            top: 0,
            left: 0
          }}
        >
          <div ref={gridRef} className="absolute top-0 left-0">
            {tileLayout.positions.map(({ player, index, x, y }) => {
              const isWinner = winners.some(w => w.id === player.id);
              const isRollingHighlight = rollingCandidate?.id === player.id;
              const isDrawn = drawnPlayer?.id === player.id;

              let bgStyle: React.CSSProperties = { backgroundColor: '#2e2e2e' };
              let nameClass = 'text-[#00fff2]';
              let borderClass = 'border border-[#444]';
              let shadowClass = 'shadow-[inset_0_0_20px_rgba(0,0,0,0.8)]';
              let scale = 'scale(1)';
              let zIndex = 'z-10';
              let opacity = 'opacity-100';

              if (isWinner) {
                bgStyle = { backgroundColor: WINNER_COLOR_HEX };
                nameClass = 'text-white';
                borderClass = 'border border-white';
                shadowClass = 'shadow-[0_0_15px_rgba(237,27,118,0.4)]';
                opacity = 'opacity-40 blur-[1px]';
                zIndex = 'z-0';
                scale = 'scale(0.8)';
              } else if (isRollingHighlight || isDrawn) {
                bgStyle = { backgroundColor: '#fff' };
                nameClass = 'text-black';
                borderClass = 'border-4 border-squid-pink';
                shadowClass = 'shadow-[0_0_50px_rgba(255,255,255,0.8)]';
                scale = 'scale(1.2)';
                zIndex = 'z-50';
              } else if (isRolling) {
                opacity = 'opacity-30';
              }

              return (
                <div
                  key={player.id}
                  className={`absolute w-[120px] h-[120px] transition-all duration-300 ease-out ${shadowClass} ${borderClass} ${zIndex} ${opacity}`}
                  style={{
                    ...bgStyle,
                    left: `${x}px`,
                    top: `${y}px`,
                    width: `${tileLayout.tileSize}px`,
                    height: `${tileLayout.tileSize}px`,
                    transform: `translate(-50%, -50%) rotate(45deg) ${scale}`
                  }}
                >
                  <div className="absolute inset-0 flex flex-col justify-center items-center gap-1 pointer-events-none transform -rotate-45 px-2 text-center">
                    <div className={`font-display text-base leading-tight uppercase ${nameClass}`}>
                      {player.name}
                    </div>
                    <div className={`text-[10px] uppercase tracking-widest ${isWinner ? 'text-white/70' : 'text-gray-500'}`}>
                      {player.gender}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="fixed top-0 left-0 w-full h-24 pointer-events-none flex items-center justify-between px-8 z-40 bg-gradient-to-b from-black/80 to-transparent" style={{ top: HUD_TOP_OFFSET }}>
        <div className="flex flex-col pointer-events-auto">
          <div className="text-gray-500 text-xs font-mono tracking-[0.2em] mb-1">POOL</div>
          <div className="text-white font-display text-4xl tracking-widest drop-shadow-md">
            <span className="text-squid-pink">{pool.length}</span>
            <span className="text-gray-500 mx-2">/</span>
            {players.length}
          </div>
        </div>

        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="flex flex-col items-end mr-6">
            <span className="text-gray-500 text-xs font-mono tracking-[0.2em] mb-1">WINNERS</span>
            <span className="text-white font-display text-4xl tracking-widest drop-shadow-md">
              {winners.length}
            </span>
          </div>

          {pool.length > 0 ? (
            <Button
              onClick={startDraw}
              disabled={isRolling || !!drawnPlayer}
              className={`py-4 px-10 text-xl font-display uppercase tracking-widest shadow-[0_0_20px_rgba(237,27,118,0.3)] border-2 border-squid-pink bg-black/50 backdrop-blur-sm text-white transition-all ${
                isRolling ? 'opacity-50 cursor-not-allowed' : 'hover:bg-squid-pink hover:scale-105 hover:shadow-[0_0_40px_rgba(237,27,118,0.6)]'
              }`}
            >
              {isRolling ? 'ROLLING...' : 'DRAW NAME'}
            </Button>
          ) : (
            <div className="flex gap-3">
              <Button onClick={handleResetPool} className="py-4 px-8 bg-yellow-600 hover:bg-yellow-500 text-white text-sm uppercase tracking-widest">
                Reset Pool
              </Button>
              <Button onClick={handleBack} className="py-4 px-10 bg-green-600 hover:bg-green-500 text-white text-sm uppercase tracking-widest">
                Done
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="fixed bottom-5 right-5 flex gap-2 z-50">
        <Button onClick={handleBack} variant="secondary" className="bg-black/80 border-gray-700 text-xs">
          Back to Scoreboard
        </Button>
        <button
          onClick={resetView}
          className="px-4 py-2 bg-[#333] text-white border border-[#555] hover:bg-[#444] font-bold text-xs uppercase tracking-wider"
        >
          Reset View
        </button>
      </div>

      {drawnPlayer && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-2xl bg-gradient-to-b from-gray-900 to-black border-2 border-squid-pink rounded-lg shadow-[0_0_100px_rgba(237,27,118,0.4)] overflow-hidden flex flex-col items-center animate-slam">
            <div className="w-full py-8 flex flex-col items-center bg-white/5 border-b border-white/10">
              <div className="text-squid-pink text-sm uppercase tracking-[0.4em] mb-2 animate-pulse">Always Very Lucky</div>
              <div className="flex items-center justify-center gap-6 mb-6 animate-pop-in">
                <Icons.Circle className="w-10 h-10 text-[#ff5fb7] drop-shadow-[0_0_12px_rgba(255,55,155,0.6)]" />
                <Icons.Triangle className="w-10 h-10 text-white drop-shadow-[0_0_12px_rgba(255,255,255,0.5)]" />
                <Icons.Square className="w-10 h-10 text-[#67e8f9] drop-shadow-[0_0_12px_rgba(103,232,249,0.6)]" />
              </div>
            </div>

            <div className="flex flex-col items-center py-10 px-6 text-center">
              <h1 className="font-display text-5xl md:text-7xl text-white uppercase tracking-wider drop-shadow-[0_0_20px_rgba(255,255,255,0.5)] animate-scale-in">
                {drawnPlayer.name}
              </h1>
              <div className="mt-4 flex items-center gap-3">
                <span className="px-3 py-1 bg-white/10 rounded text-xs text-gray-400 uppercase tracking-widest border border-white/10">
                  {drawnPlayer.gender === 'M' ? 'Male' : drawnPlayer.gender === 'F' ? 'Female' : 'Non-Binary'}
                </span>
              </div>
            </div>

            <div className="w-full grid grid-cols-2 gap-px bg-gray-800 border-t border-gray-700">
              <button
                onClick={handleKeepInPool}
                className="py-6 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors uppercase tracking-widest text-sm font-bold flex flex-col items-center gap-1 group"
              >
                <span>KEEP</span>
              </button>
              <button
                onClick={handleRemoveFromPool}
                className="py-6 bg-squid-pink hover:bg-pink-600 text-white transition-colors uppercase tracking-widest text-lg font-bold shadow-[inset_0_0_20px_rgba(0,0,0,0.2)] flex flex-col items-center gap-1"
              >
                <span>REMOVE</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
