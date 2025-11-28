import { TeamColor } from './types';
import React from 'react';

export const TEAM_CONFIG: Record<TeamColor, { hex: string; bg: string; text?: string }> = {
  [TeamColor.Red]: { hex: '#ef4444', bg: 'bg-red-500' },
  [TeamColor.Blue]: { hex: '#3b82f6', bg: 'bg-blue-500' },
  [TeamColor.Green]: { hex: '#249f9c', bg: 'bg-teal-500' }, // Classic Squid Green
  [TeamColor.Yellow]: { hex: '#eab308', bg: 'bg-yellow-500' },
  [TeamColor.Pink]: { hex: '#ed1b76', bg: 'bg-pink-600' }, // Classic Squid Pink
  [TeamColor.Purple]: { hex: '#a855f7', bg: 'bg-purple-500' },
};

export const Icons = {
  Circle: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3.5" fill="none" />
    </svg>
  ),
  Triangle: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12 2L2 22H22L12 2Z" stroke="currentColor" strokeWidth="3.5" fill="none" strokeLinejoin="round" />
    </svg>
  ),
  Square: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <rect x="2" y="2" width="20" height="20" stroke="currentColor" strokeWidth="3.5" fill="none" />
    </svg>
  ),
  SpeakerWave: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" fill="none" d="M15.536 8.464a5 5 0 010 7.072m3.536-10.607a10 10 0 010 14.142M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
    </svg>
  ),
  SpeakerX: ({ className }: { className?: string }) => (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" fill="none" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" stroke="currentColor" fill="none" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
    </svg>
  ),
};