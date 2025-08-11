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

// Branded wrapper around a hex color string for stronger typing
export class Color extends String {
    constructor(hex: string) { super(hex); }
}

export interface GameStateNode {
    nodeType: NodeType;
    color: Color | null;
    originalPos: [number, number];
}

export interface GameState {
    groups: GameStateNode[][];
    capacity?: number;
    undoCount?: number;
}

export interface BoardCell {
    type: NodeType;
    color: Color | null;
}

export interface PaletteColor {
    color: Color;
    target: number;
    remaining: number;
}
