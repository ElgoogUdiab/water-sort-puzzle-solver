// Game classes and logic - TypeScript port of game.py
export enum NodeType {
    UNKNOWN = '?',
    UNKNOWN_REVEALED = '!',
    KNOWN = '.',
    EMPTY = '_'
}

export enum GameMode {
    NORMAL = 0,
    NO_COMBO = 1,
    QUEUE = 2
}

export type Color = [number, number, number];

export interface GameStateNode {
    nodeType: NodeType;
    color: string | null;
    originalPos: [number, number];
}

export interface GameState {
    groups: GameStateNode[][];
    undoCount?: number;
}

export interface BoardCell {
    type: NodeType;
    color: number[] | null;
}

export interface PaletteColor {
    rgb: number[];
    target: number;
    remaining: number;
}
