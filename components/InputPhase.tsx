
import React, { useState, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player, Gender, Team } from '../types';
import { Icons } from '../constants';
import { Button } from './Button';
import { downloadData } from '../utils';
import logo from '../assets/logo.webp';
import youngHee from '../assets/young-hee.webp';
import cheolSu from '../assets/cheol-su.webp';

export const InputPhase: React.FC<{
  players: Player[];
  setPlayers: React.Dispatch<React.SetStateAction<Player[]>>;
  onStart: () => void;
  onImportResults: (teams: Team[]) => void;
}> = ({ players, setPlayers, onStart, onImportResults }) => {
  const [singleName, setSingleName] = useState('');
  const [singleGender, setSingleGender] = useState<Gender>(Gender.Male);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseNoGenderRestriction = (raw: unknown): boolean => {
    if (typeof raw === 'boolean') return raw;
    if (typeof raw === 'number') return raw === 0;
    if (typeof raw === 'string') {
      const normalized = raw.replace(/["']/g, '').trim().toLowerCase();
      if (!normalized) return false;

      if (normalized === 'o' || normalized === 'zero') return true;

      const numericValue = Number(normalized);
      if (!Number.isNaN(numericValue)) {
        return numericValue === 0;
      }

      if (['true', 'yes', 'y'].includes(normalized)) return true;
      if (['false', 'no', 'n'].includes(normalized)) return false;
    }
    return false;
  };

  const handleAddSingle = () => {
    if (!singleName.trim()) return;
    const newPlayer: Player = {
      id: uuidv4(),
      name: singleName.trim(),
      gender: singleGender,
      score: 0,
      noGenderRestriction: false
    };
    setPlayers([...players, newPlayer]);
    setSingleName('');
  };

  const handleClear = () => setPlayers([]);
  const removePlayer = (id: string) => setPlayers(players.filter(p => p.id !== id));

  const handleExportList = () => {
    downloadData(players, `squid-roster-${new Date().toISOString().slice(0, 10)}.json`);
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target?.result as string;
      try {
        // Try parsing as JSON first
        const jsonData = JSON.parse(content);
        
        // Check if it's a Results file (Array of Teams)
        if (Array.isArray(jsonData) && jsonData.length > 0 && 'color' in jsonData[0] && 'members' in jsonData[0]) {
          if (window.confirm("Game Results detected. Load results and skip lottery?")) {
             onImportResults(jsonData as Team[]);
          }
          return;
        }

        // Check if it's a Player List (Array of Players)
        if (Array.isArray(jsonData)) {
           const importedPlayers = jsonData.map((p: any) => ({
             id: p.id || uuidv4(),
             name: p.name,
             gender: p.gender || Gender.NonBinary,
             score: p.score || 0,
             noGenderRestriction: parseNoGenderRestriction(p.noGenderRestriction)
           }));
           setPlayers(prev => [...prev, ...importedPlayers]);
           return;
        }
      } catch (jsonError) {
        // If JSON fails, try CSV (Name, Gender)
        try {
          const lines = content.split('\n');
          const csvPlayers: Player[] = [];
          
          lines.forEach(line => {
             const [nameRaw, genderRaw, markerRaw] = line.split(',').map(s => s.trim());
             const name = nameRaw;
             if (name) {
               let gender = Gender.NonBinary;
               if (genderRaw) {
                 const g = genderRaw.toUpperCase();
                 if (g.startsWith('M')) gender = Gender.Male;
                 else if (g.startsWith('F')) gender = Gender.Female;
               }
               const noGenderRestriction = parseNoGenderRestriction(markerRaw);
               csvPlayers.push({ id: uuidv4(), name, gender, score: 0, noGenderRestriction });
             }
          });
          
          if (csvPlayers.length > 0) {
            setPlayers(prev => [...prev, ...csvPlayers]);
          } else {
             alert("Could not parse file. Please use JSON or 'Name, Gender' CSV format.");
          }
        } catch (csvError) {
          alert("Failed to read file.");
        }
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      {/* Background Characters - Setup Phase Only */}
      <div className="fixed bottom-0 left-0 z-0 pointer-events-none hidden xl:block transition-opacity duration-1000 animate-fade-in">
         <img 
            src={youngHee} 
            alt="Young-hee" 
            className="h-[80vh] max-w-[30vw] object-contain object-bottom drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] opacity-90" 
         />
      </div>
      <div className="fixed bottom-0 right-0 z-0 pointer-events-none hidden xl:block transition-opacity duration-1000 animate-fade-in">
         <img 
            src={cheolSu} 
            alt="Cheol-su" 
            className="h-[80vh] max-w-[30vw] object-contain object-bottom drop-shadow-[0_0_30px_rgba(0,0,0,0.8)] opacity-90" 
         />
      </div>

      <div className="z-10 w-full max-w-4xl mx-auto p-6 flex flex-col gap-8 animate-fade-in relative">
        <div className="text-center space-y-4">
          <div className="flex justify-center w-full relative z-20 pointer-events-none">
            <img 
                src={logo} 
                alt="Game Logo" 
                className="h-16 md:h-24 object-contain drop-shadow-[0_0_15px_rgba(237,27,118,0.4)]" 
            />
          </div>
          <h1 className="text-5xl md:text-7xl font-display font-black tracking-tighter text-squid-pink drop-shadow-[0_0_10px_rgba(237,27,118,0.8)]">
            Xmas Party 2025
          </h1>
          <p className="text-gray-400 font-mono text-sm tracking-widest uppercase">
            Waiting for Players: <span className="text-white font-bold">{players.length}</span> Registered
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Manual Input */}
          <div className="bg-squid-card border border-gray-800 p-6 rounded-sm shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 left-0 w-1 h-full bg-squid-pink"></div>
            <h2 className="text-2xl font-display mb-4 flex items-center gap-2">
              <Icons.Square className="w-5 h-5 text-squid-pink" /> MANUAL ENTRY
            </h2>
            <div className="flex flex-col gap-4">
              <input 
                type="text" 
                placeholder="Player Name" 
                className="bg-squid-dark border border-gray-700 p-3 text-white focus:border-squid-pink focus:outline-none font-mono"
                value={singleName}
                onChange={(e) => setSingleName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleAddSingle()}
              />
              <div className="flex gap-2">
                {[Gender.Male, Gender.Female, Gender.NonBinary].map(g => (
                  <button
                    key={g}
                    onClick={() => setSingleGender(g)}
                    className={`flex-1 py-2 font-mono text-xs border ${singleGender === g ? 'bg-white text-black border-white' : 'bg-transparent text-gray-500 border-gray-700'}`}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <Button onClick={handleAddSingle} disabled={!singleName}>ADD PLAYER</Button>
            </div>
          </div>

          {/* Data I/O */}
          <div className="bg-squid-card border border-gray-800 p-6 rounded-sm shadow-2xl relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1 h-full bg-squid-green"></div>
             <h2 className="text-2xl font-display mb-4 flex items-center gap-2">
              <Icons.Circle className="w-5 h-5 text-squid-green" /> DATA TERMINAL
            </h2>
            <div className="flex flex-col gap-4 h-full justify-center">
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".json,.csv"
                onChange={handleFileUpload}
              />
              <Button variant="secondary" onClick={() => fileInputRef.current?.click()} className="w-full">
                IMPORT FILE (JSON/CSV)
              </Button>
              <div className="h-px bg-gray-800 w-full my-2"></div>
              <Button variant="secondary" onClick={handleExportList} disabled={players.length === 0} className="w-full">
                EXPORT ROSTER
              </Button>
              <p className="text-[10px] text-gray-500 font-mono text-center mt-2">
                Supports: Roster Lists (.json/.csv) & Game Results (.json)
              </p>
            </div>
          </div>
        </div>

        {/* Player List */}
        {players.length > 0 && (
          <div className="bg-squid-card p-6 border-t-4 border-gray-800">
             <div className="flex justify-between items-center mb-4">
              <h3 className="font-display">REGISTERED PLAYERS</h3>
              <button onClick={handleClear} className="text-xs text-red-500 hover:text-red-400 font-mono tracking-wider hover:underline">
                ELIMINATE ALL
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
              {players.map(p => (
                <div key={p.id} className="group relative bg-squid-dark border border-gray-800 p-2 flex items-center justify-between text-xs font-mono hover:border-squid-pink transition-colors">
                  <span className="truncate">{p.name}</span>
                  <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-bold ${p.gender === 'M' ? 'text-blue-400' : p.gender === 'F' ? 'text-pink-400' : 'text-purple-400'}`}>
                    {p.gender}
                  </span>
                  <button 
                    onClick={() => removePlayer(p.id)}
                    className="absolute inset-0 bg-red-900/90 hidden group-hover:flex items-center justify-center text-white font-bold tracking-widest"
                  >
                    ELIMINATE
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-center mt-4">
          <Button onClick={onStart} disabled={players.length < 2} className="w-full md:w-auto text-xl py-6 shadow-xl">
            BEGIN DISTRIBUTION
          </Button>
        </div>
      </div>
    </>
  );
};
