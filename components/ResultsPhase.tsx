
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Team, TeamColor, Matchup, Player } from '../types';
import { TEAM_CONFIG } from '../constants';
import { Button } from './Button';
import { downloadData, getAverageScore, formatAverageScore } from '../utils';
import { Scoreboard } from './Scoreboard';

const renumberMatchups = (list: Matchup[]): Matchup[] =>
   list.map((matchup, index) => ({ ...matchup, id: index + 1 }));

const cloneTeams = (teams: Team[]): Team[] =>
   teams.map(team => ({
      ...team,
      members: team.members.map(member => ({ ...member })),
   }));

interface FloatingPadProps {
   value: string;
   position: { top: number; left: number };
   onInput: (key: string) => void;
   onSave: () => void;
   onClose: () => void;
   padRef: React.RefObject<HTMLDivElement>;
   label?: string;
}

const FloatingNumberPad: React.FC<FloatingPadProps> = ({ value, position, onInput, onSave, onClose, padRef, label }) => {
   const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'];
   const labels: Record<string, string> = { clear: 'CLR', back: 'DEL' };

   return (
      <div
         ref={padRef}
         className="fixed z-40 w-44 bg-black/90 border border-squid-pink/40 rounded-md shadow-2xl p-3 backdrop-blur"
         style={{ top: position.top, left: position.left }}
      >
         {label && <div className="text-[10px] uppercase tracking-widest text-gray-400 mb-1 text-center">{label}</div>}
         <div className="text-center text-lg font-display tracking-widest text-squid-pink mb-2">{value}</div>
         <div className="grid grid-cols-3 gap-2">
            {keys.map((key) => (
               <button
                  key={key}
                  onClick={() => onInput(key)}
                  className="py-2 text-sm font-bold rounded bg-gray-900/80 border border-gray-700 text-white hover:bg-squid-pink/30 transition-colors"
               >
                  {labels[key] || key}
               </button>
            ))}
         </div>
         <div className="flex gap-2 mt-3 text-xs font-bold uppercase tracking-wide">
            <button onClick={onSave} className="flex-1 py-2 rounded bg-squid-pink text-black hover:bg-white transition-colors">
               Save
            </button>
            <button onClick={onClose} className="w-16 py-2 rounded border border-gray-700 text-gray-300 hover:border-squid-pink/60 hover:text-white transition-colors">
               Close
            </button>
         </div>
      </div>
   );
};

export const ResultsPhase: React.FC<{ 
  teams: Team[]; 
  matchups: Matchup[];
  onReset: () => void;
  onViewMatchups: () => void; 
   onOpenRaffle: () => void;
  updateTeamScore: (teamColor: TeamColor, delta: number) => void;
  updatePlayerScore: (teamColor: TeamColor, playerId: string, delta: number) => void;
  onLoadResults?: (teams: Team[], matchups: Matchup[]) => void;
  onUpdateMatchups?: (matchups: Matchup[]) => void;
   onUpdateTeams?: (teams: Team[]) => void;
}> = ({ teams, matchups, onReset, onViewMatchups, onOpenRaffle, updateTeamScore, updatePlayerScore, onLoadResults, onUpdateMatchups, onUpdateTeams }) => {
   const fileInputRef = useRef<HTMLInputElement>(null);

   const [isEditingMatchOrder, setIsEditingMatchOrder] = useState(false);
   const [draftMatchups, setDraftMatchups] = useState<Matchup[]>(matchups);
   const [dragSource, setDragSource] = useState<{ matchIndex: number; color: TeamColor } | null>(null);
   const [dragTarget, setDragTarget] = useState<{ matchIndex: number; color: TeamColor } | null>(null);
   const dragSourceRef = useRef<{ matchIndex: number; color: TeamColor } | null>(null);
   const [draftTeams, setDraftTeams] = useState<Team[]>(cloneTeams(teams));

   useEffect(() => {
      if (!isEditingMatchOrder) {
         setDraftMatchups(matchups);
         setDraftTeams(cloneTeams(teams));
      }
   }, [matchups, teams, isEditingMatchOrder]);

   const startMatchOrderEdit = () => {
      setDraftMatchups(matchups);
      setDraftTeams(cloneTeams(teams));
      setIsEditingMatchOrder(true);
   };

   const cancelMatchOrderEdit = () => {
      setDraftMatchups(matchups);
      setDraftTeams(cloneTeams(teams));
      setIsEditingMatchOrder(false);
      dragSourceRef.current = null;
      setDragSource(null);
      setDragTarget(null);
   };

   const handleSaveMatchOrder = () => {
      const normalized = renumberMatchups(draftMatchups);
      if (onUpdateMatchups) {
         onUpdateMatchups(normalized);
      }
      if (onUpdateTeams) {
         onUpdateTeams(cloneTeams(draftTeams));
      }
      setDraftMatchups(normalized);
      setIsEditingMatchOrder(false);
      dragSourceRef.current = null;
      setDragSource(null);
      setDragTarget(null);
   };

   const moveMatchupRow = (index: number, direction: 'up' | 'down') => {
      setDraftMatchups(prev => {
         const next = [...prev];
         const target = direction === 'up' ? index - 1 : index + 1;
         if (target < 0 || target >= next.length) return prev;
         [next[index], next[target]] = [next[target], next[index]];
         return next;
      });
   };
   const updateTeamMemberships = (
      currentTeams: Team[],
      sourcePlayer: Player,
      sourceColor: TeamColor,
      targetPlayer: Player | null,
      targetColor: TeamColor
   ): Team[] => {
      if (sourceColor === targetColor) return currentTeams;

      return currentTeams.map(team => {
         if (team.color === sourceColor) {
            let members = team.members.filter(member => member.id !== sourcePlayer.id);
            if (targetPlayer && targetColor !== sourceColor) {
               if (!members.some(member => member.id === targetPlayer.id)) {
                  members = [...members, targetPlayer];
               }
            }
            return { ...team, members };
         }

         if (team.color === targetColor) {
            let members = [...team.members];
            if (targetPlayer) {
               members = members.filter(member => member.id !== targetPlayer.id);
            }
            if (!members.some(member => member.id === sourcePlayer.id)) {
               members = [...members, sourcePlayer];
            }
            return { ...team, members };
         }

         return team;
      });
   };

   const transferPlayers = (source: { matchIndex: number; color: TeamColor }, target: { matchIndex: number; color: TeamColor }) => {
      setDraftMatchups(prev => {
         const sourceMatch = prev[source.matchIndex];
         const targetMatch = prev[target.matchIndex];
         if (!sourceMatch || !targetMatch) return prev;

         const sourceEntry = sourceMatch.players.find(p => p.color === source.color);
         const targetEntry = targetMatch.players.find(p => p.color === target.color);
         if (!sourceEntry || !sourceEntry.player) return prev;

         if (source.matchIndex === target.matchIndex && source.color === target.color) {
            return prev;
         }

         const sourcePlayer = sourceEntry.player;
         const targetPlayer = targetEntry?.player ?? null;

         const updatedMatchups = prev.map((matchup, idx) => {
            if (idx === source.matchIndex && idx === target.matchIndex) {
               return {
                  ...matchup,
                  players: matchup.players.map(entry => {
                     if (entry.color === source.color) return { ...entry, player: targetPlayer };
                     if (entry.color === target.color) return { ...entry, player: sourcePlayer };
                     return entry;
                  })
               };
            }

            if (idx === source.matchIndex) {
               return {
                  ...matchup,
                  players: matchup.players.map(entry =>
                     entry.color === source.color ? { ...entry, player: targetPlayer } : entry
                  )
               };
            }

            if (idx === target.matchIndex) {
               return {
                  ...matchup,
                  players: matchup.players.map(entry =>
                     entry.color === target.color ? { ...entry, player: sourcePlayer } : entry
                  )
               };
            }

            return matchup;
         });

         if (source.color !== target.color) {
            setDraftTeams(prevTeams =>
               updateTeamMemberships(prevTeams, sourcePlayer, source.color, targetPlayer, target.color)
            );
         }

         return updatedMatchups;
      });
   };

   const handleDragStart = (event: React.DragEvent<HTMLDivElement>, matchIndex: number, color: TeamColor) => {
      const payload = { matchIndex, color };
      if (event.dataTransfer) {
         const serialized = JSON.stringify(payload);
         event.dataTransfer.effectAllowed = 'move';
         event.dataTransfer.setData('application/json', serialized);
         event.dataTransfer.setData('text/plain', serialized);
      }
      dragSourceRef.current = payload;
      setDragSource(payload);
      setDragTarget(null);
   };

   const handleDragEnter = (matchIndex: number, color: TeamColor) => {
      if (!dragSource) return;
      if (dragSource.matchIndex === matchIndex && dragSource.color === color) return;
      setDragTarget({ matchIndex, color });
   };

   const handleDragOver = (event: React.DragEvent<HTMLTableCellElement>) => {
      if (!dragSourceRef.current) return;
      event.preventDefault();
   };

   const handleDrop = (event: React.DragEvent<HTMLTableCellElement>, matchIndex: number, color: TeamColor) => {
      event.preventDefault();
      let activeSource = dragSourceRef.current;
      if (!activeSource && event.dataTransfer) {
         const data = event.dataTransfer.getData('application/json') || event.dataTransfer.getData('text/plain');
         if (data) {
            try {
               activeSource = JSON.parse(data);
            } catch {
               activeSource = null;
            }
         }
      }
      if (!activeSource) return;
      if (activeSource.matchIndex === matchIndex && activeSource.color === color) {
         dragSourceRef.current = null;
         setDragSource(null);
         setDragTarget(null);
         return;
      }
      transferPlayers(activeSource, { matchIndex, color });
      dragSourceRef.current = null;
      setDragSource(null);
      setDragTarget(null);
   };

   const handleDragEnd = () => {
      dragSourceRef.current = null;
      setDragSource(null);
      setDragTarget(null);
   };

   const handleDragLeave = (event: React.DragEvent<HTMLTableCellElement>, matchIndex: number, color: TeamColor) => {
      if (!dragTarget) return;
      const related = event.relatedTarget as Node | null;
      if (related && event.currentTarget.contains(related)) return;
      if (dragTarget.matchIndex === matchIndex && dragTarget.color === color) {
         setDragTarget(null);
      }
   };

   const handleExportResults = () => {
      const exportData = { teams, matchups };
      downloadData(exportData, `squid-results-${new Date().toISOString().slice(0, 10)}.json`);
   };

   const handleLoadResults = (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
         const content = e.target?.result as string;
         try {
            const data = JSON.parse(content);
            
            // Handle both old format (direct array) and new format (object with teams and matchups)
            const loadedTeams = Array.isArray(data) ? data : data.teams;
            const loadedMatchups = data.matchups || [];

            // If a callback is provided, use it to fully reload teams (preferred approach)
            if (onLoadResults) {
               onLoadResults(loadedTeams, loadedMatchups);
            } else {
               // Fallback: Update all team scores incrementally
               loadedTeams.forEach((loadedTeam: Team) => {
                  const currentTeam = teams.find(t => t.color === loadedTeam.color);
                  if (currentTeam) {
                     const scoreDelta = (loadedTeam.score || 0) - (currentTeam.score || 0);
                     if (scoreDelta !== 0) {
                        updateTeamScore(loadedTeam.color, scoreDelta);
                     }
                     // Update individual player scores
                     (loadedTeam.members || []).forEach((loadedMember) => {
                        const currentMember = currentTeam.members.find(m => m.id === loadedMember.id);
                        if (currentMember) {
                           const playerScoreDelta = (loadedMember.score || 0) - (currentMember.score || 0);
                           if (playerScoreDelta !== 0) {
                              updatePlayerScore(loadedTeam.color, loadedMember.id, playerScoreDelta);
                           }
                        }
                     });
                  }
               });
            }

            // Optionally restore matchups if available
            if (loadedMatchups.length > 0) {
               localStorage.setItem('squid-matchups-data', JSON.stringify(loadedMatchups));
            }

            alert('Results loaded successfully!' + (loadedMatchups.length > 0 ? ' Match order restored.' : ''));
         } catch (error) {
            alert('Failed to load results. Invalid file format.');
            console.error(error);
         }
      };
      reader.readAsText(file);
      if (fileInputRef.current) fileInputRef.current.value = '';
   };

   const scoreboardWrapperRef = useRef<HTMLDivElement | null>(null);
   const scoreboardContentRef = useRef<HTMLDivElement | null>(null);
   const scoreboardInitialTopRef = useRef<number>(0);
   const [isScoreboardPinned, setIsScoreboardPinned] = useState(false);
   const [scoreboardSpace, setScoreboardSpace] = useState(0);
   const PIN_OFFSET = 32;
   const EXTRA_SPACE = 48;

   const measureScoreboard = useCallback(() => {
      if (scoreboardWrapperRef.current) {
         const wrapperRect = scoreboardWrapperRef.current.getBoundingClientRect();
         scoreboardInitialTopRef.current = wrapperRect.top + window.scrollY;
      }
      if (scoreboardContentRef.current && !isScoreboardPinned) {
         const rect = scoreboardContentRef.current.getBoundingClientRect();
         setScoreboardSpace(rect.height + EXTRA_SPACE);
      }
   }, [EXTRA_SPACE, isScoreboardPinned]);

   useEffect(() => {
      const handleScroll = () => {
         if (!scoreboardWrapperRef.current) return;
         const threshold = scoreboardInitialTopRef.current;
         if (!threshold && threshold !== 0) return;
         const shouldPin = window.scrollY + PIN_OFFSET >= threshold;
         setIsScoreboardPinned(shouldPin);
      };

      measureScoreboard();
      handleScroll();

      window.addEventListener('resize', measureScoreboard);
      window.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
         window.removeEventListener('resize', measureScoreboard);
         window.removeEventListener('scroll', handleScroll);
      };
   }, [measureScoreboard, PIN_OFFSET]);

   useEffect(() => {
      const frame = requestAnimationFrame(() => measureScoreboard());
      return () => cancelAnimationFrame(frame);
   }, [teams, measureScoreboard]);

   const keypadRef = useRef<HTMLDivElement | null>(null);
   const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
   const [activePad, setActivePad] = useState<{
      teamColor: TeamColor;
      playerId: string;
      value: string;
      position: { top: number; left: number };
   } | null>(null);

   const getInputKey = useCallback((teamColor: TeamColor, playerId: string) => `${teamColor}-${playerId}`, []);

   const computePadPosition = useCallback((teamColor: TeamColor, playerId: string) => {
      const inputEl = inputRefs.current[getInputKey(teamColor, playerId)];
      if (!inputEl) return null;

      const inputRect = inputEl.getBoundingClientRect();
      const padWidth = 176; // w-44 ~ 176px
      const padHeight = keypadRef.current?.offsetHeight ?? 260;
      const gutter = 12;
      const viewportPadding = 16;
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;

      let left = inputRect.right + gutter;
      const fitsRight = left + padWidth + viewportPadding <= viewportWidth;
      if (!fitsRight) {
         left = inputRect.left - padWidth - gutter;
      }
      left = Math.max(viewportPadding, Math.min(left, viewportWidth - padWidth - viewportPadding));

      const spaceBelow = viewportHeight - inputRect.bottom - viewportPadding;
      const spaceAbove = inputRect.top - viewportPadding;
      let top: number;

      if (spaceBelow >= padHeight + gutter || spaceBelow >= spaceAbove) {
         top = Math.min(inputRect.bottom + gutter, viewportHeight - padHeight - viewportPadding);
      } else if (spaceAbove >= padHeight + gutter) {
         top = Math.max(inputRect.top - padHeight - gutter, viewportPadding);
      } else {
         top = Math.max(viewportPadding, (viewportHeight - padHeight) / 2);
      }

      top = Math.max(viewportPadding, Math.min(top, viewportHeight - padHeight - viewportPadding));

      return { top, left };
   }, [getInputKey]);

   const closePad = useCallback(() => setActivePad(null), []);

   const openPadForPlayer = useCallback((teamColor: TeamColor, playerId: string) => {
      const team = teams.find(t => t.color === teamColor);
      const player = team?.members.find(m => m.id === playerId);
      if (!player) return;
      const position = computePadPosition(teamColor, playerId) || { top: 0, left: 0 };
      setActivePad({ teamColor, playerId, value: String(player.score || 0), position });
   }, [teams, computePadPosition]);

   const handlePadInput = useCallback((key: string) => {
      const MAX_LENGTH = 5;
      setActivePad(prev => {
         if (!prev) return prev;
         let nextValue = prev.value;
         if (key === 'clear') {
            nextValue = '0';
         } else if (key === 'back') {
            nextValue = nextValue.length <= 1 ? '0' : nextValue.slice(0, -1);
         } else if (/^\d$/.test(key)) {
            if (nextValue === '0') {
               nextValue = key;
            } else if (nextValue.length < MAX_LENGTH) {
               nextValue = `${nextValue}${key}`;
            }
         }
         if (nextValue === prev.value) return prev;
         return { ...prev, value: nextValue };
      });
   }, []);

   const commitPadValue = useCallback(() => {
      if (!activePad) return;
      const team = teams.find(t => t.color === activePad.teamColor);
      const player = team?.members.find(m => m.id === activePad.playerId);
      if (!player) {
         closePad();
         return;
      }
      const numericValue = Math.max(0, parseInt(activePad.value || '0', 10) || 0);
      const delta = numericValue - (player.score || 0);
      if (delta !== 0) {
         updatePlayerScore(activePad.teamColor, activePad.playerId, delta);
      }
      closePad();
   }, [activePad, closePad, teams, updatePlayerScore]);

   const refreshPadPosition = useCallback(() => {
      setActivePad(prev => {
         if (!prev) return prev;
         const coords = computePadPosition(prev.teamColor, prev.playerId);
         return coords ? { ...prev, position: coords } : prev;
      });
   }, [computePadPosition]);

   useEffect(() => {
      if (!activePad) return;

      const handleMouseDown = (event: MouseEvent) => {
         const target = event.target as Node;
         const padEl = keypadRef.current;
         const inputEl = inputRefs.current[getInputKey(activePad.teamColor, activePad.playerId)];
         if (padEl?.contains(target) || inputEl?.contains(target)) return;
         closePad();
      };

      const handleKeyDown = (event: KeyboardEvent) => {
         if (event.key === 'Escape') {
            closePad();
         }
         if (event.key === 'Enter') {
            event.preventDefault();
            commitPadValue();
         }
      };

      const handleScroll = () => refreshPadPosition();

      refreshPadPosition();

      document.addEventListener('mousedown', handleMouseDown);
      document.addEventListener('keydown', handleKeyDown);
      window.addEventListener('resize', refreshPadPosition);
      window.addEventListener('scroll', handleScroll, { passive: true });

      return () => {
         document.removeEventListener('mousedown', handleMouseDown);
         document.removeEventListener('keydown', handleKeyDown);
         window.removeEventListener('resize', refreshPadPosition);
         window.removeEventListener('scroll', handleScroll);
      };
   }, [activePad, closePad, commitPadValue, getInputKey, refreshPadPosition]);

   const activePlayer = activePad
      ? teams.find(t => t.color === activePad.teamColor)?.members.find(m => m.id === activePad.playerId) || null
      : null;

   const displayedMatchups = isEditingMatchOrder ? draftMatchups : matchups;

  return (
      <div className="relative w-full max-w-7xl mx-auto p-4 md:p-6 animate-fade-in pb-20 mt-8">
      
         {/* SCOREBOARD SECTION */}
         <div
            ref={scoreboardWrapperRef}
            className="relative"
            style={{ height: isScoreboardPinned ? Math.max(scoreboardSpace, 1) : undefined }}
         >
            <div
               ref={scoreboardContentRef}
               className={`${isScoreboardPinned ? 'fixed left-1/2 -translate-x-1/2 w-full max-w-7xl px-4 md:px-6 z-40 backdrop-blur-md' : '-mx-4 md:-mx-6 px-4 md:px-6'} pt-6 pb-4`}
               style={isScoreboardPinned ? { top: `${PIN_OFFSET}px` } : undefined}
            >
               <Scoreboard teams={teams} condensed={isScoreboardPinned} />
            </div>
         </div>

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-gray-800 pb-4 bg-black/50 backdrop-blur-sm p-4 rounded-t-lg gap-4 mt-12 relative z-20">
        <h2 className="text-3xl font-display text-white"><span className="text-squid-pink">GAME</span> STATUS</h2>
        <div className="flex flex-wrap justify-center gap-4">
                <Button onClick={onOpenRaffle} className="px-4 py-2 text-xs">
                   RAFFLE SYSTEM
                </Button>
           {/* Actions Toolbar */}
           <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".json"
              onChange={handleLoadResults}
           />
           <Button onClick={() => fileInputRef.current?.click()} variant="secondary" className="px-4 py-2 text-xs">LOAD RESULTS</Button>
           <Button onClick={handleExportResults} variant="secondary" className="px-4 py-2 text-xs">EXPORT RESULTS</Button>
        </div>
      </div>

      {/* INLINE MATCHUPS TABLE (Always Visible) */}
        <div className="mb-12 relative z-10 animate-slide-up">
           <div className="bg-squid-card border-x border-t border-gray-800 p-2 flex justify-between items-center bg-gray-900/50">
               <span className="text-xs font-mono text-squid-pink tracking-widest uppercase">MATCH ORDER</span>
               <div className="flex items-center gap-2 text-[10px] text-gray-500 font-mono">
                  <span>{displayedMatchups.length} ROUNDS</span>
                  {!isEditingMatchOrder && (
                     <button
                        onClick={startMatchOrderEdit}
                        className="px-2 py-0.5 border border-gray-700 text-gray-300 hover:text-white hover:border-squid-pink transition-colors rounded-sm"
                     >
                        EDIT
                     </button>
                  )}
                  {isEditingMatchOrder && (
                     <>
                        <button
                           onClick={handleSaveMatchOrder}
                           className="px-2 py-0.5 border border-squid-pink text-squid-pink hover:bg-squid-pink hover:text-black transition-colors rounded-sm"
                        >
                           SAVE
                        </button>
                        <button
                           onClick={cancelMatchOrderEdit}
                           className="px-2 py-0.5 border border-gray-700 text-gray-300 hover:text-white hover:border-gray-500 transition-colors rounded-sm"
                        >
                           CANCEL
                        </button>
                     </>
                  )}
               </div>
           </div>
           {isEditingMatchOrder && (
              <div className="border-x border-b border-gray-800 bg-black/60 p-3 flex flex-col gap-2 text-[11px] text-gray-400">
                  <span className="font-mono uppercase tracking-widest text-squid-pink">Edit Mode</span>
                  <span className="text-[10px]">
                     Use the arrows to move rounds, then drag and drop player chips between slots to match the official order. Dropping a name into a different color will move that player to the new team once you save.
                  </span>
              </div>
           )}
           <div className="overflow-x-auto border-b border-gray-800 bg-black/40 custom-scrollbar">
              <table className="w-full min-w-[800px] border-collapse">
                 <thead>
                    <tr>
                       <th className="p-3 border-r border-b border-gray-800 w-16 text-center text-xs font-mono text-gray-500">#</th>
                       {Object.values(TeamColor).map(c => (
                          <th key={c} className={`p-3 border-r border-b border-gray-800 w-1/6 text-center font-display text-xs uppercase tracking-wider text-white ${TEAM_CONFIG[c].bg}`}>
                             {c}
                          </th>
                       ))}
                    </tr>
                 </thead>
                 <tbody>
                    {displayedMatchups.map((m, idx) => (
                       <tr key={m.id} className={`hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                          <td className="p-3 border-r border-gray-800/50 text-center font-mono text-squid-pink font-bold text-xs">
                             <div className="flex items-center justify-center gap-2">
                                <span>{m.id}</span>
                                {isEditingMatchOrder && (
                                   <div className="flex flex-col gap-0.5 text-gray-400">
                                      <button
                                         onClick={() => moveMatchupRow(idx, 'up')}
                                         disabled={idx === 0}
                                         className="px-1 text-[10px] border border-gray-700 rounded-sm disabled:opacity-30"
                                         aria-label={`Move round ${m.id} up`}
                                      >
                                         ↑
                                      </button>
                                      <button
                                         onClick={() => moveMatchupRow(idx, 'down')}
                                         disabled={idx === displayedMatchups.length - 1}
                                         className="px-1 text-[10px] border border-gray-700 rounded-sm disabled:opacity-30"
                                         aria-label={`Move round ${m.id} down`}
                                      >
                                         ↓
                                      </button>
                                   </div>
                                )}
                             </div>
                          </td>
                          {Object.values(TeamColor).map(c => {
                              const player = m.players.find(p => p.color === c)?.player;
                              const isDragOrigin = dragSource && dragSource.matchIndex === idx && dragSource.color === c;
                              const isDragHover = dragTarget && dragTarget.matchIndex === idx && dragTarget.color === c;
                             return (
                                   <td
                                      key={c}
                                      className={`p-3 border-r border-gray-800/50 text-center ${isDragHover ? 'bg-white/10' : ''}`}
                                      onDragOver={isEditingMatchOrder ? handleDragOver : undefined}
                                      onDragEnter={isEditingMatchOrder ? () => handleDragEnter(idx, c) : undefined}
                                      onDragLeave={isEditingMatchOrder ? (e) => handleDragLeave(e, idx, c) : undefined}
                                      onDrop={isEditingMatchOrder ? (e) => handleDrop(e, idx, c) : undefined}
                                   >
                                   {isEditingMatchOrder ? (
                                      <div
                                         className={`flex flex-col items-center gap-1 rounded border border-dashed ${isDragOrigin ? 'border-squid-pink' : 'border-gray-700/60'} ${player ? 'bg-black/60' : 'bg-transparent'} px-2 py-2`}
                                         draggable={Boolean(player)}
                                         onDragStart={player ? (e) => handleDragStart(e, idx, c) : undefined}
                                         onDragEnd={player ? handleDragEnd : undefined}
                                      >
                                         <span className={`text-[11px] font-mono uppercase tracking-wide ${player ? 'text-gray-100' : 'text-gray-600'}`}>
                                            {player ? player.name : '(empty)'}
                                         </span>
                                         {player && (
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded text-center ${player.gender === 'M' ? 'bg-blue-900/50 text-blue-300' : player.gender === 'F' ? 'bg-pink-900/50 text-pink-300' : 'bg-purple-900/50 text-purple-300'}`}>
                                               {player.gender === 'M' ? '♂ M' : player.gender === 'F' ? '♀ F' : '⊕ NB'}
                                            </span>
                                         )}
                                      </div>
                                   ) : (
                                      player ? (
                                         <div className="flex flex-col items-center gap-1">
                                            <span className="font-mono text-xs text-gray-300 block truncate px-2 w-full">
                                               {player.name}
                                            </span>
                                            <span className={`text-[10px] px-1.5 py-0.5 rounded ${player.gender === 'M' ? 'bg-blue-900/50 text-blue-300' : player.gender === 'F' ? 'bg-pink-900/50 text-pink-300' : 'bg-purple-900/50 text-purple-300'}`}>
                                               {player.gender === 'M' ? '♂ M' : player.gender === 'F' ? '♀ F' : '⊕ NB'}
                                            </span>
                                         </div>
                                      ) : (
                                         <span className="text-gray-800 text-xs">-</span>
                                      )
                                   )}
                                </td>
                             );
                          })}
                       </tr>
                    ))}
                 </tbody>
              </table>
           </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 relative z-10">
        {teams.map(team => (
          <div key={team.color} className="bg-squid-card border border-gray-800 rounded relative overflow-hidden group hover:border-gray-600 transition-colors">
            <div className={`absolute top-0 left-0 w-full h-1 ${TEAM_CONFIG[team.color].bg}`}></div>
            <div className="p-4 flex justify-between items-center bg-black/20">
              <h3 className="font-display text-xl uppercase tracking-wider" style={{ color: TEAM_CONFIG[team.color].hex }}>
                {team.color} TEAM
              </h3>
              <div className="flex gap-1">
                 {/* Mini Gender Stats */}
                 <span className="text-[10px] bg-gray-800 px-1 rounded text-blue-300">M:{team.members.filter(m => m.gender === 'M').length}</span>
                 <span className="text-[10px] bg-gray-800 px-1 rounded text-pink-300">F:{team.members.filter(m => m.gender === 'F').length}</span>
              </div>
            </div>
            <div className="p-4 min-h-[150px]">
              <div className="mb-4 text-center">
                 <span className="text-xs text-gray-500 font-mono">AVG SCORE</span>
                 <div className="text-2xl font-display" style={{ color: TEAM_CONFIG[team.color].hex }}>
                    {formatAverageScore(getAverageScore(team))}
                 </div>
                 <div className="text-[10px] text-gray-600 font-mono mt-1">Total: {team.score || 0}</div>
              </div>
              <ul className="space-y-2">
                {team.members.map(member => (
                  <li key={member.id} className="flex justify-between items-center text-sm font-mono border-b border-gray-800/50 pb-1 last:border-0">
                    <span className="text-gray-300 truncate flex-1 min-w-0 pr-2">{member.name}</span>
                    <div className="flex items-center gap-2 shrink-0">
                      
                      {/* Player Score Controls */}
                                 <div className="flex items-center border border-gray-700 rounded bg-black/40">
                          <button 
                             onClick={() => updatePlayerScore(team.color, member.id, -1)}
                             className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-500 hover:bg-white/10 text-xs transition-colors"
                          >
                            -
                          </button>
                          
                          {/* Input Score Setting */}
                                       <input 
                                          ref={(el) => { inputRefs.current[getInputKey(team.color, member.id)] = el; }}
                                          type="number" 
                                          readOnly
                                          className="w-8 text-center text-xs font-bold bg-transparent text-yellow-400 focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none cursor-pointer select-none m-0 p-0"
                                          value={member.score || 0}
                                          onClick={(e) => {
                                             e.stopPropagation();
                                             openPadForPlayer(team.color, member.id);
                                          }}
                                          onFocus={() => openPadForPlayer(team.color, member.id)}
                                       />

                          <button 
                             onClick={() => updatePlayerScore(team.color, member.id, 1)}
                             className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-green-500 hover:bg-white/10 text-xs transition-colors"
                          >
                            +
                          </button>
                      </div>

                      <span className={`text-[10px] font-bold w-6 text-center ${member.gender === 'M' ? 'text-blue-500' : member.gender === 'F' ? 'text-pink-500' : 'text-purple-500'}`}>
                        {member.gender}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
              {team.members.length === 0 && <span className="text-xs text-gray-700 italic">No survivors... yet.</span>}
            </div>
          </div>
        ))}
      </div>
         {activePad && (
            <FloatingNumberPad
               value={activePad.value}
               position={activePad.position}
               onInput={handlePadInput}
               onSave={commitPadValue}
               onClose={closePad}
               padRef={keypadRef}
               label={activePlayer ? `${activePlayer.name} • ${activePad.teamColor}` : undefined}
            />
         )}
    </div>
  );
};
