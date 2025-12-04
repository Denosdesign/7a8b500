import React from 'react';
import { Icons } from '../constants';
import { Button } from './Button';

// The Single Bill Component
const SquidBill = () => {
  return (
    <div className="relative w-[800px] h-[340px] bg-[#fdfbf7] overflow-hidden border-8 border-double border-squid-pink shadow-2xl print:shadow-none print:border-4">
      {/* Background Texture & Patterns */}
      <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')]"></div>
      
      {/* Guilloche-ish Background Pattern */}
      <div className="absolute inset-0 opacity-10" 
           style={{ 
             backgroundImage: 'radial-gradient(circle at 50% 50%, #249f9c 2px, transparent 2.5px)',
             backgroundSize: '20px 20px'
           }}>
      </div>
      
      {/* Geometric Watermark */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] opacity-5 pointer-events-none flex justify-center items-center">
         <Icons.Circle className="w-full h-full text-squid-pink absolute animate-spin-slow" />
         <Icons.Triangle className="w-[350px] h-[350px] text-squid-pink absolute" />
         <Icons.Square className="w-[200px] h-[200px] text-squid-pink absolute" />
      </div>

      {/* --- CONTENT LAYER --- */}

      {/* Top Left: Serial Number */}
      <div className="absolute top-4 left-4 font-mono text-sm tracking-widest text-squid-pink font-bold z-10">
        ALV-2025-XMAS-001
      </div>

      {/* Top Right: Value */}
      <div className="absolute top-2 right-4 text-right z-10">
         <div className="font-display text-5xl font-black text-squid-pink tracking-tighter drop-shadow-sm">100</div>
         <div className="font-mono text-xs text-squid-green font-bold tracking-[0.5em] -mt-1">HKD</div>
      </div>

      {/* Bottom Left: Value */}
      <div className="absolute bottom-4 left-4 z-10">
         <div className="font-display text-5xl font-black text-squid-pink tracking-tighter drop-shadow-sm">100</div>
         <div className="font-mono text-xs text-squid-green font-bold tracking-[0.5em] -mt-1">HKD</div>
      </div>

      {/* Bottom Right: Signature */}
      <div className="absolute bottom-6 right-6 z-10 text-right">
        <div className="w-32 h-px bg-squid-dark mb-1"></div>
        <div className="font-script font-mono text-[10px] text-squid-dark uppercase tracking-wider">The Front Man</div>
      </div>

      {/* Center Logo */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center">
        <img 
            src="https://files.catbox.moe/k57z08.png" 
            alt="Squid Logo" 
            className="h-24 object-contain drop-shadow-md mb-2" 
        />
        <h2 className="font-display text-squid-dark text-xl uppercase tracking-[0.2em] font-bold border-b-2 border-squid-pink pb-1">
          Bank of Squid
        </h2>
        <p className="font-mono text-[10px] text-squid-green mt-1 tracking-widest uppercase">
          In Debt We Trust
        </p>
      </div>

      {/* Left Character: Young-hee (Girl) */}
      <div className="absolute bottom-0 left-16 h-[260px] w-[180px] z-10 overflow-hidden mix-blend-multiply opacity-90">
         <img 
            src="https://files.catbox.moe/hkztd2.webp" 
            alt="Young-hee" 
            className="w-full h-full object-cover object-top filter contrast-125 sepia-[0.3]"
         />
         {/* Vignette mask for character */}
         <div className="absolute inset-0 bg-gradient-to-t from-[#fdfbf7] via-transparent to-transparent"></div>
         <div className="absolute inset-0 bg-gradient-to-r from-[#fdfbf7] via-transparent to-transparent"></div>
      </div>

      {/* Right Character: Cheol-su (Boy) */}
      <div className="absolute bottom-0 right-28 h-[260px] w-[180px] z-10 overflow-hidden mix-blend-multiply opacity-90">
         <img 
            src="https://files.catbox.moe/ovqmir.webp" 
            alt="Cheol-su" 
            className="w-full h-full object-cover object-top filter contrast-125 sepia-[0.3]"
         />
         <div className="absolute inset-0 bg-gradient-to-t from-[#fdfbf7] via-transparent to-transparent"></div>
         <div className="absolute inset-0 bg-gradient-to-l from-[#fdfbf7] via-transparent to-transparent"></div>
      </div>

      {/* Decorative Borders */}
      <div className="absolute top-0 left-0 w-16 h-16 border-t-[6px] border-l-[6px] border-squid-green rounded-tl-3xl m-2"></div>
      <div className="absolute top-0 right-0 w-16 h-16 border-t-[6px] border-r-[6px] border-squid-green rounded-tr-3xl m-2"></div>
      <div className="absolute bottom-0 left-0 w-16 h-16 border-b-[6px] border-l-[6px] border-squid-green rounded-bl-3xl m-2"></div>
      <div className="absolute bottom-0 right-0 w-16 h-16 border-b-[6px] border-r-[6px] border-squid-green rounded-br-3xl m-2"></div>

      {/* Icons Strip */}
      <div className="absolute top-6 left-1/2 -translate-x-1/2 flex gap-4 opacity-30">
        <Icons.Circle className="w-4 h-4 text-squid-dark" />
        <Icons.Triangle className="w-4 h-4 text-squid-dark" />
        <Icons.Square className="w-4 h-4 text-squid-dark" />
      </div>

    </div>
  );
};

export const MoneyMakerPhase: React.FC<{ onBack: () => void }> = ({ onBack }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="w-full min-h-screen flex flex-col items-center animate-fade-in pb-20 pt-10 relative">
      
      {/* Print Styles */}
      <style>{`
        @media print {
          @page { margin: 0.5cm; size: landscape; }
          body { background-color: white !important; -webkit-print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .crt-overlay { display: none !important; }
          .bill-wrapper { margin-bottom: 20px; page-break-inside: avoid; }
        }
        @media screen {
          .print-only { display: none; }
        }
      `}</style>

      {/* HEADER (Screen Only) */}
      <div className="w-full max-w-7xl flex justify-between items-center px-6 mb-12 no-print">
         <div className="flex items-center gap-4">
             <Button variant="secondary" onClick={onBack} className="text-xs px-4 py-2 border-gray-600 text-gray-400 hover:text-white hover:border-white">
                ← RETURN TO TERMINAL
             </Button>
             <h1 className="font-display text-2xl text-squid-pink uppercase tracking-widest hidden md:block">
               Currency Mint
             </h1>
         </div>
         <div className="bg-squid-card border border-gray-800 p-4 rounded flex items-center gap-6">
            <div className="text-right">
                <p className="text-[10px] text-gray-500 font-mono">DENOMINATION</p>
                <p className="text-xl font-display text-white">HKD 100</p>
            </div>
            <Button onClick={handlePrint} className="animate-pulse shadow-[0_0_20px_rgba(36,159,156,0.4)] border-squid-green text-squid-green hover:bg-squid-green hover:text-white">
               PRINT SHEET
            </Button>
         </div>
      </div>

      {/* PREVIEW AREA (Screen Only) */}
      <div className="no-print relative z-10 transform scale-75 md:scale-90 origin-top flex flex-col items-center">
         <div className="mb-4 font-mono text-gray-500 text-xs tracking-widest uppercase">
            --- PREVIEW MODE: SINGLE NOTE ---
         </div>
         <SquidBill />
         <div className="mt-8 max-w-2xl text-center text-gray-500 font-mono text-xs">
            <p>NOTE: Click "PRINT SHEET" to generate a layout of 3 bills optimized for A4 landscape paper.</p>
         </div>
      </div>

      {/* PRINT AREA (Hidden on Screen, Visible on Print) */}
      <div className="print-only w-full flex flex-col items-center justify-center gap-8 pt-4">
         <div className="bill-wrapper"><SquidBill /></div>
         <div className="bill-wrapper"><SquidBill /></div>
         <div className="bill-wrapper"><SquidBill /></div>
      </div>

    </div>
  );
};
