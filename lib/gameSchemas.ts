export interface ThisOrThatState {
  promptIndex: number;
  picks: Record<string, string>; // userId -> "optionA" | "optionB"
  revealed: boolean;
  scoreMatches: number;
  totalPlayed: number;
  updatedAt?: any;
}

export interface TruthOrDareState {
  currentTurnUid: string;
  choice: "truth" | "dare" | null;
  cardText: string | null;
  cardIndex: number;
  completedTurns: number;
  updatedAt?: any;
}

export interface CompatibilityQuizState {
  answers: Record<string, Record<number, number>>; // userId -> (questionIndex -> optionIndex)
  completed: Record<string, boolean>; // userId -> boolean
  compatibilityScore: number | null;
  updatedAt?: any;
}

export interface SketchAndGuessState {
  drawerUid: string;
  guesserUid: string;
  secretWord: string;
  wordIndex: number;
  guesses: { userId: string; text: string; time: string; isCorrect: boolean }[];
  isSolved: boolean;
  score: number;
  updatedAt?: any;
}

export interface TicTacToeState {
  board: (string | null)[]; // 9 cells
  currentTurnUid: string;
  winner: string | null; // userId or "draw"
  scores: Record<string, number>; // userId -> win count
  updatedAt?: any;
}

export interface ConnectFourState {
  grid: any; // 42 flat cells or 6x7 2D array
  currentTurnUid: string;
  winner: string | null;
  scores: Record<string, number>;
  updatedAt?: any;
}

export interface SnakesLaddersState {
  positions: Record<string, number>; // userId -> position (1..100)
  currentTurnUid: string;
  lastDiceRoll: number | null;
  winner: string | null;
  updatedAt?: any;
}

export interface NeverHaveIEverState {
  statementIndex: number;
  raisedHands: Record<string, boolean>; // userId -> boolean
  bothRaisedCount: number;
  updatedAt?: any;
}
