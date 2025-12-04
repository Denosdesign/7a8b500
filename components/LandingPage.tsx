import React, { useState } from 'react';
import { Icons } from '../constants';
import logo from '../assets/logo.webp';

interface LandingPageProps {
  onInteract: () => void;
  onComplete: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({ onInteract, onComplete }) => {
  const [clicked, setClicked] = useState(false);
  const [zooming, setZooming] = useState(false);

  const handleClick = () => {
    if (clicked) return;
    
    // Trigger audio immediately
    onInteract();
    setClicked(true);
    
    // Delay zoom to allow flip animation to finish and "ACCESS GRANTED" to be read
    setTimeout(() => {
      setZooming(true);
    }, 1200);

    // Final transition after slow zoom
    setTimeout(() => {
      onComplete();
    }, 3700);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black overflow-hidden font-mono">
      {/* Background Ambience */}
      <div className={`absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-900 via-black to-black opacity-80 transition-opacity duration-[2500ms] ${zooming ? 'opacity-0' : 'opacity-80'}`}></div>
      
      {/* Animated Particles */}
      <div className={`absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')] opacity-20 animate-pulse transition-opacity duration-[2500ms] ${zooming ? 'opacity-0' : 'opacity-20'}`}></div>

      {/* Main Container - Handles Scale/Zoom */}
      <div className={`relative z-10 flex flex-col items-center transition-all duration-[2500ms] ease-in-out ${zooming ? 'scale-[20] opacity-0 filter blur-sm' : 'scale-100 opacity-100'}`}>
        
        {/* Logo - Static (No Float) */}
        <div className="mb-16 relative">
          <img 
            src={logo} 
            alt="Game Logo" 
            className="h-24 md:h-32 object-contain drop-shadow-[0_0_25px_rgba(237,27,118,0.6)]" 
          />
        </div>

        {/* The Invitation Card */}
        <div 
          onClick={handleClick}
          className="group relative w-80 h-48 cursor-pointer [perspective:1000px]"
        >
          {/* Card Inner Container - Handles the flip */}
          <div className={`relative w-full h-full transition-all duration-1000 [transform-style:preserve-3d] ${clicked ? '[transform:rotateY(180deg)]' : 'group-hover:[transform:rotateY(10deg)_rotateX(10deg)]'}`}>
            
            {/* Front Side */}
            <div className="absolute inset-0 bg-[#c9b488] rounded-sm shadow-2xl flex items-center justify-center border border-[#b39e74] [backface-visibility:hidden]">
              {/* Paper Texture Effect */}
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')] mix-blend-multiply"></div>
              
              <div className="flex gap-6 opacity-90 relative z-10">
                 {/* Icons with dark stroke */}
                 <div className="w-12 h-12 text-gray-900"><Icons.Circle className="w-full h-full" /></div>
                 <div className="w-12 h-12 text-gray-900"><Icons.Triangle className="w-full h-full" /></div>
                 <div className="w-12 h-12 text-gray-900"><Icons.Square className="w-full h-full" /></div>
              </div>
            </div>

            {/* Back Side (The "Flip" result) */}
             <div className="absolute inset-0 bg-[#c9b488] rounded-sm shadow-2xl flex flex-col items-center justify-center border border-[#b39e74] [backface-visibility:hidden] [transform:rotateY(180deg)]">
              <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cardboard.png')] mix-blend-multiply"></div>
              <p className="font-display text-gray-900 text-lg font-bold tracking-widest mb-2">ACCESS GRANTED</p>
              <div className="w-full h-px bg-gray-800/20 my-2"></div>
              <p className="font-mono text-gray-800 text-xs tracking-wider">GAME INITIATED</p>
            </div>

          </div>
          
          {/* Shadow/Glow behind card - Only visible on hover when not clicked */}
          <div className={`absolute inset-0 bg-squid-pink/30 blur-2xl -z-10 rounded-full transition-opacity duration-500 ${clicked ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}></div>
        </div>

        {/* CTA Text */}
        <div className={`mt-20 text-center transition-all duration-500 ${clicked ? 'opacity-0 translate-y-10' : 'opacity-100'}`}>
          <p className="font-mono text-[10px] md:text-xs text-squid-pink tracking-[0.6em] uppercase animate-pulse">
            You're Invited
          </p>
        </div>
      </div>
    </div>
  );
};