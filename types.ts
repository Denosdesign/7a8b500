
export enum Gender {
  Male = 'M',
  Female = 'F',
  NonBinary = 'NB'
}

export interface Player {
  id: string;
  name: string;
  gender: Gender;
  score: number;
  noGenderRestriction?: boolean; // "0" marker - can go to either male or female games
  isHelper?: boolean; // "H" marker - helper role prioritized for select games
}

export enum TeamColor {
  Red = 'Red',
  Blue = 'Blue',
  Green = 'Green',
  Yellow = 'Yellow',
  Pink = 'Pink',
  Purple = 'Purple'
}

export interface Team {
  color: TeamColor;
  members: Player[];
  hex: string;
  score: number;
}

export enum AppState {
  Landing = 'LANDING',
  Setup = 'SETUP',
  Lottery = 'LOTTERY',
  Results = 'RESULTS',
  Matchups = 'MATCHUPS',
  Raffle = 'RAFFLE'
}

export interface MatchupPlayer {
  color: TeamColor;
  player: Player | null;
}

export interface Matchup {
  id: number;
  players: MatchupPlayer[];
}
