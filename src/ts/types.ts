import { NodeType } from './game.ts';

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
