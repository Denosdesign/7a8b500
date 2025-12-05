
import React, { useState, useEffect, useRef } from 'react';
import { Team, TeamColor, Matchup } from '../types';
import { TEAM_CONFIG } from '../constants';
import { Button } from './Button';
import { downloadData } from '../utils';
import rollingSound from '../assets/Random.mp3';

export const PlayingOrderPhase: React.FC<{ 
  teams: Team[]; 
  matchups: Matchup[];
  onProceed: () => void;
  onReroll: () => void;
}> = ({ teams, matchups, onProceed, onReroll }) => {
  const [revealIndex, setRevealIndex] = useState(-1);
  const [rollingText, setRollingText] = useState<Record<string, string>>({});
  
  // Sounds
  const rollSoundRef = useRef<HTMLAudioElement | null>(null);
  const lockSoundRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Initialize audio
    rollSoundRef.current = new Audio(rollingSound); // Rolling
    rollSoundRef.current.loop = true;
    rollSoundRef.current.volume = 0.5;
    
    lockSoundRef.current = new Audio(rollingSound); // Tick/Lock
    lockSoundRef.current.volume = 0.6;

    // Start rolling immediately
    if (rollSoundRef.current) rollSoundRef.current.play().catch(() => {});

    // Animation Sequence
    // Delay start of locking to let it roll for a bit
    const max = matchups.length;
    let isAnimating = true;
    
    const startDelay = setTimeout(() => {
      const interval = setInterval(() => {
        setRevealIndex(prev => {
           const next = prev + 1;
           if (next >= max) {
             clearInterval(interval);
             isAnimating = false;
             if (rollSoundRef.current) {
                 rollSoundRef.current.pause();
                 rollSoundRef.current.currentTime = 0;
             }
           }
           // Only play lock sound if still animating
           if (isAnimating && lockSoundRef.current && !lockSoundRef.current.paused && lockSoundRef.current.currentTime > 0) {
             // Don't play if already playing
             return next;
           }
           if (isAnimating && lockSoundRef.current) {
             lockSoundRef.current.currentTime = 0;
             const playPromise = lockSoundRef.current.play();
             playPromise.catch(() => {});
           }
           return next;
        });
      }, 800); // 800ms per row
    }, 2000); // 2 seconds of chaos before locking starts

    return () => {
        clearTimeout(startDelay);
        isAnimating = false;
        if (rollSoundRef.current) rollSoundRef.current.pause();
        if (lockSoundRef.current) lockSoundRef.current.pause();
    };
  }, [matchups.length, matchups]); // Trigger on matchups change

  // Rolling Text Effect
  useEffect(() => {
    const interval = setInterval(() => {
        // For every cell in a row >= revealIndex, pick a random name from that team's full roster
        // This is purely visual
        const newText: Record<string, string> = {};
        teams.forEach(t => {
            if (t.members.length > 0) {
               newText[t.color] = t.members[Math.floor(Math.random() * t.members.length)].name;
            } else {
               newText[t.color] = "---";
            }
        });
        setRollingText(prev => {
            // We just need a random name for each color to display in rolling cells
            return newText; 
        });
    }, 50); // Fast cycle
    return () => clearInterval(interval);
  }, [teams]);

  const handleExportMatchups = () => {
      downloadData(matchups, `squid-matchups-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleReroll = () => {
      // Reset reveal state for new animation
      setRevealIndex(-1);
      onReroll();
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-8 animate-fade-in pb-20 mt-12 flex flex-col items-center">
        <div className="w-full flex justify-between items-center mb-6 bg-black/80 p-4 border-l-4 border-squid-pink backdrop-blur-md sticky top-0 z-50 shadow-2xl">
            <h2 className="text-3xl font-display text-white uppercase tracking-widest">
                <span className="text-squid-pink mr-2">MATCH</span>  ORDER</h2>
            <div className="flex gap-4">
                 <Button onClick={handleExportMatchups} variant="secondary" className="text-xs py-2 px-4">DOWNLOAD</Button>
                 <Button onClick={handleReroll} variant="secondary" className="text-xs py-2 px-4 hover:border-red-500 hover:text-red-500">REROLL</Button>
                 <Button onClick={onProceed} className="text-xs py-2 px-4 shadow-[0_0_15px_rgba(237,27,118,0.5)]">SCOREBOARD</Button>
            </div>
        </div>

        {/* The Board */}
        <div className="w-full overflow-x-auto custom-scrollbar">
            <div className="min-w-[800px] border-4 border-gray-800 bg-black shadow-[0_0_30px_rgba(0,0,0,0.8)]">
                {/* Header Row */}
                <div className="grid grid-cols-7 bg-gray-900 border-b-2 border-gray-700">
                    <div className="p-4 flex items-center justify-center border-r border-gray-800 font-display text-gray-500">
                        GAME #
                    </div>
                    {Object.values(TeamColor).map(color => (
                        <div key={color} className={`p-4 flex items-center justify-center border-r border-gray-800 last:border-0 ${TEAM_CONFIG[color].bg} text-white font-display uppercase tracking-wider`}>
                             {color}
                        </div>
                    ))}
                </div>

                {/* Game Rows */}
                {matchups.map((matchup, index) => {
                    const isRolling = index > revealIndex;
                    const isJustLocked = index === revealIndex;

                    return (
                        <div 
                            key={matchup.id} 
                            className={`
                                grid grid-cols-7 border-b border-gray-800 transition-colors duration-300
                                ${isJustLocked ? 'bg-white/10' : index % 2 === 0 ? 'bg-squid-card' : 'bg-black'}
                            `}
                        >
                            {/* Game Number */}
                            <div className="p-4 flex items-center justify-center border-r border-gray-800 font-mono text-squid-pink font-bold text-xl">
                                {matchup.id.toString().padStart(2, '0')}
                            </div>

                            {/* Player Cells */}
                            {Object.values(TeamColor).map(color => {
                                const playerObj = matchup.players.find(p => p.color === color);
                                const playerName = playerObj?.player?.name;
                                const playerGender = playerObj?.player?.gender;
                                
                                return (
                                    <div 
                                        key={color} 
                                        className={`
                                            p-3 flex flex-col items-center justify-center border-r border-gray-800 last:border-0 min-h-[60px] relative overflow-hidden
                                            ${isRolling ? 'text-gray-500 blur-[0.5px]' : 'text-white'}
                                        `}
                                    >
                                        {isRolling ? (
                                            <span className="font-mono text-xs opacity-50 uppercase tracking-tighter truncate w-full text-center animate-pulse">
                                                {rollingText[color] || '...'}
                                            </span>
                                        ) : (
                                            playerName ? (
                                                <>
                                                    <span className={`font-display font-bold text-sm md:text-base tracking-tight truncate w-full text-center ${isJustLocked ? 'animate-scale-in text-squid-pink' : ''}`}>
                                                        {playerName}
                                                    </span>
                                                    <span className={`text-[10px] font-mono mt-1 px-1.5 py-0.5 rounded-sm ${playerGender === 'M' ? 'bg-blue-900/50 text-blue-300' : playerGender === 'F' ? 'bg-pink-900/50 text-pink-300' : 'bg-purple-900/50 text-purple-300'}`}>
                                                        {playerGender === 'M' ? '♂ MALE' : playerGender === 'F' ? '♀ FEMALE' : '⊕ NB'}
                                                    </span>
                                                </>
                                            ) : (
                                                <span className="text-gray-700 font-mono text-xs">---</span>
                                            )
                                        )}
                                        
                                        {/* Status Line for filled slots */}
                                        {!isRolling && playerName && (
                                            <div className={`absolute bottom-0 left-0 h-0.5 w-full ${TEAM_CONFIG[color].bg} opacity-50`}></div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
        
        {/* Footer info */}
        <div className="mt-8 text-center font-mono text-gray-500 text-xs">
        </div>
    </div>
  );
};
