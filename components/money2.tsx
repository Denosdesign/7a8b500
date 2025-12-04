
import React from 'react';
import { Icons } from '../constants';
import { Button } from './Button';

interface MoneyVoucherProps {
  onBack: () => void;
}

export const MoneyVoucher: React.FC<MoneyVoucherProps> = ({ onBack }) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] w-full p-4 md:p-8 animate-fade-in relative z-20">
      
      {/* Controls - Hidden when printing */}
      <div className="flex gap-4 mb-8 print:hidden">
        <Button variant="secondary" onClick={onBack}>
          BACK TO GAME
        </Button>
        <Button onClick={handlePrint} className="animate-pulse shadow-[0_0_20px_rgba(36,159,156,0.6)] border-squid-green text-squid-green hover:bg-squid-green hover:text-white">
          PRINT VOUCHER
        </Button>
      </div>

      <div className="text-center mb-4 print:hidden">
        <p className="text-gray-400 font-mono text-xs">PREVIEW MODE /// OFFICIAL CURRENCY</p>
      </div>

      {/* The Banknote Container */}
      <div className="relative w-[850px] h-[400px] bg-[#d6c4a0] text-gray-900 overflow-hidden shadow-2xl print:shadow-none print:w-[100%] print:h-auto print:aspect-[2.125/1] print:absolute print:top-1/2 print:left-1/2 print:-translate-x-1/2 print:-translate-y-1/2 print:block">
        
        {/* Paper Texture Overlay */}
        <div className="absolute inset-0 opacity-40 bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')] mix-blend-multiply pointer-events-none z-0"></div>
        <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] pointer-events-none z-0"></div>

        {/* Border Frame */}
        <div className="absolute inset-3 border-[3px] border-gray-800 z-10"></div>
        <div className="absolute inset-4 border border-gray-800 z-10 border-dashed"></div>
        
        {/* Corner Ornaments */}
        <div className="absolute top-6 left-6 z-20 bg-gray-900 text-[#d6c4a0] w-12 h-12 flex items-center justify-center font-display font-bold text-xl rounded-full border-2 border-[#d6c4a0] shadow-sm">
          100
        </div>
        <div className="absolute bottom-6 right-6 z-20 bg-gray-900 text-[#d6c4a0] w-12 h-12 flex items-center justify-center font-display font-bold text-xl transform rotate-45 border-2 border-[#d6c4a0] shadow-sm">
          <div className="transform -rotate-45">100</div>
        </div>
        
        {/* Top Right Serial */}
        <div className="absolute top-6 right-6 z-20 font-mono text-xs font-bold tracking-widest text-red-700 opacity-80 rotate-0">
           NO. 456-001-HKD
        </div>

        {/* Left Character: Young-hee */}
        <div className="absolute bottom-0 left-12 z-10 h-[90%] w-auto">
           <img 
              src="https://files.catbox.moe/hkztd2.webp" 
              alt="Young-hee" 
              className="h-full w-auto object-contain drop-shadow-[-5px_0_5px_rgba(0,0,0,0.3)] filter sepia-[0.3] contrast-125"
           />
        </div>

        {/* Right Character: Cheol-su */}
        <div className="absolute bottom-0 right-16 z-10 h-[90%] w-auto">
           <img 
              src="https://files.catbox.moe/ovqmir.webp" 
              alt="Cheol-su" 
              className="h-full w-auto object-contain drop-shadow-[5px_0_5px_rgba(0,0,0,0.3)] filter sepia-[0.3] contrast-125"
           />
        </div>

        {/* Center Content */}
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pt-4">
            
            {/* Logo */}
            <img 
              src="https://files.catbox.moe/k57z08.png" 
              alt="Logo" 
              className="h-16 object-contain mb-4 opacity-90 drop-shadow-sm filter brightness-0 invert-[0.1]" 
            />

            {/* Main Value */}
            <div className="relative mb-2">
               <h1 className="text-7xl font-display font-black tracking-tight text-gray-900 drop-shadow-sm z-10 relative">
                  HKD 100
               </h1>
               <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-9xl opacity-[0.07] font-display font-black text-squid-pink whitespace-nowrap pointer-events-none">
                  ₩₩₩₩
               </div>
            </div>

            {/* Text Title */}
            <div className="bg-gray-900 text-[#d6c4a0] px-6 py-1 mb-4 clip-path-polygon">
               <h2 className="font-display uppercase tracking-[0.5em] text-sm md:text-base">Cash Voucher</h2>
            </div>

            {/* Geometric Watermark (Center) */}
            <div className="flex gap-4 opacity-60 mb-6">
               <Icons.Circle className="w-6 h-6 text-squid-pink" />
               <Icons.Triangle className="w-6 h-6 text-gray-800" />
               <Icons.Square className="w-6 h-6 text-squid-green" />
            </div>

            {/* Footer Text */}
            <div className="absolute bottom-8 w-full text-center px-24">
               <p className="font-mono text-[9px] md:text-[10px] uppercase tracking-wider text-gray-700 border-t border-gray-600 pt-2 mx-auto max-w-md">
                  Please proceed to the Accounts Department to redeem your prize.
               </p>
               <p className="text-[7px] text-gray-500 font-mono mt-1">
                  ISSUED BY FRONT MAN • ALVANON XMAS PARTY 2025 • NOT LEGAL TENDER
               </p>
            </div>
        </div>

        {/* Security Strip */}
        <div className="absolute top-0 bottom-0 left-[28%] w-[2px] bg-gray-400/30 z-20 border-r border-gray-500/20 border-dashed"></div>

      </div>
      
      {/* CSS for Printing */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          .print\\:hidden {
            display: none !important;
          }
          /* Target the banknote specifically */
          .relative.w-\\[850px\\] {
             visibility: visible;
             position: absolute;
             left: 50%;
             top: 50%;
             transform: translate(-50%, -50%) scale(1) !important;
             width: 100% !important;
             max-width: 18cm !important;
             margin: 0 !important;
             box-shadow: none !important;
             border: 2px solid #333 !important; /* Force border visibility on print */
          }
          /* Ensure children are visible */
          .relative.w-\\[850px\\] * {
            visibility: visible;
          }
          /* Force background colors */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
};
