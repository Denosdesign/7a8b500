
import React, { useState } from 'react';
import { Team, TeamColor, Matchup } from '../types';
import { TEAM_CONFIG } from '../constants';
import { Button } from './Button';
import { downloadData } from '../utils';
import { Scoreboard } from './Scoreboard';

export const ResultsPhase: React.FC<{ 
  teams: Team[]; 
  matchups: Matchup[];
  onReset: () => void;
  onViewMatchups: () => void; 
  updateTeamScore: (teamColor: TeamColor, delta: number) => void;
  updatePlayerScore: (teamColor: TeamColor, playerId: string, delta: number) => void;
}> = ({ teams, matchups, onReset, onViewMatchups, updateTeamScore, updatePlayerScore }) => {
  const [resetConfirm, setResetConfirm] = useState(false);

  const handleExportResults = () => {
    downloadData(teams, `squid-results-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleResetClick = () => {
    if (resetConfirm) {
      onReset();
      setResetConfirm(false);
    } else {
      setResetConfirm(true);
      setTimeout(() => setResetConfirm(false), 3000); // Clear confirm after 3s
    }
  };

  return (
    <div className="w-full max-w-7xl mx-auto p-4 md:p-6 animate-fade-in pb-20 mt-8">
      
      {/* SCOREBOARD SECTION */}
      <Scoreboard teams={teams} />

      <div className="flex flex-col md:flex-row justify-between items-center mb-8 border-b border-gray-800 pb-4 bg-black/50 backdrop-blur-sm p-4 rounded-t-lg gap-4 mt-12 relative z-20">
        <h2 className="text-3xl font-display text-white"><span className="text-squid-pink">GAME</span> STATUS</h2>
        <div className="flex flex-wrap justify-center gap-4">
           {/* Actions Toolbar */}
           <Button onClick={handleExportResults} variant="secondary" className="px-4 py-2 text-xs">EXPORT RESULTS</Button>
           <Button 
             onClick={handleResetClick} 
             variant="danger" 
             className={`px-4 py-2 text-xs transition-all duration-200 ${resetConfirm ? 'bg-red-700 border-white animate-pulse' : ''}`}
           >
             {resetConfirm ? "CONFIRM WIPE?" : "RESET SYSTEM"}
           </Button>
        </div>
      </div>

      {/* INLINE MATCHUPS TABLE (Always Visible) */}
      <div className="mb-12 relative z-10 animate-slide-up">
           <div className="bg-squid-card border-x border-t border-gray-800 p-2 flex justify-between items-center bg-gray-900/50">
               <span className="text-xs font-mono text-squid-pink tracking-widest uppercase">MATCH ORDER</span>
               <span className="text-[10px] text-gray-500 font-mono">{matchups.length} ROUNDS</span>
           </div>
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
                    {matchups.map((m, idx) => (
                       <tr key={m.id} className={`hover:bg-white/5 transition-colors ${idx % 2 === 0 ? 'bg-white/[0.02]' : ''}`}>
                          <td className="p-3 border-r border-gray-800/50 text-center font-mono text-squid-pink font-bold text-xs">{m.id}</td>
                          {Object.values(TeamColor).map(c => {
                             const player = m.players.find(p => p.color === c)?.player;
                             return (
                                <td key={c} className="p-3 border-r border-gray-800/50 text-center">
                                   {player ? (
                                      <span className="font-mono text-xs text-gray-300 block truncate px-2">
                                        {player.name}
                                      </span>
                                   ) : (
                                      <span className="text-gray-800 text-xs">-</span>
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
                 <span className="text-xs text-gray-500 font-mono">TOTAL SCORE</span>
                 <div className="text-2xl font-display" style={{ color: TEAM_CONFIG[team.color].hex }}>{team.score || 0}</div>
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
                            type="number" 
                            className="w-8 text-center text-xs font-bold bg-transparent text-yellow-400 focus:outline-none appearance-none [&::-webkit-inner-spin-button]:appearance-none m-0 p-0"
                            value={member.score || 0}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                                const val = parseInt(e.target.value);
                                if (!isNaN(val)) {
                                   updatePlayerScore(team.color, member.id, val - (member.score || 0));
                                }
                            }}
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
    </div>
  );
};
