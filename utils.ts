import { Team } from './types';

export const getAverageScore = (team: Team): number => {
  const memberCount = team.members?.length ?? 0;
  if (!memberCount) return 0;
  return (team.score || 0) / memberCount;
};

export const formatAverageScore = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 100) / 100;
  if (Number.isInteger(rounded)) {
    return String(rounded);
  }
  return rounded.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
};

export const downloadData = (data: any, filename: string) => {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};
