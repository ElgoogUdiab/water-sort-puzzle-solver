#!/usr/bin/env node
// TypeScript equivalent of python_prototype/json_identifier.py

import * as fs from 'fs';
import * as path from 'path';
import { Game, GameNode, StepOp } from './game.js';
import { GameMode, NodeType, Color } from './types.js';
import { SearchState, solve } from './solver.js';

// Helper functions for color conversion (currently unused but may be needed for output formatting)
// function hexToRgb(hex: string): [number, number, number] {
//     const cleanHex = hex.replace('#', '');
//     if (cleanHex.length !== 6) {
//         throw new Error(`Invalid hex color: ${hex}`);
//     }
//     return [
//         parseInt(cleanHex.substring(0, 2), 16),
//         parseInt(cleanHex.substring(2, 4), 16),
//         parseInt(cleanHex.substring(4, 6), 16)
//     ];
// }

// function rgbToHex(rgb: [number, number, number]): string {
//     return `#${rgb.map(c => c.toString(16).padStart(2, '0')).join('')}`;
// }

interface JsonNode {
    nodeType: string;
    originalPos: [number, number];
    color?: string | null;
}

interface JsonGame {
    groups: JsonNode[][];
    undoCount?: number;
    gameMode?: string;
    mode?: number;
    groupCapacity?: number;
    rows?: number;
}

function nodeFromJson(nodeData: JsonNode): GameNode {
    const nodeType = nodeData.nodeType as NodeType;
    const pos = nodeData.originalPos;
    let color: Color | null = null;
    
    if (nodeType === NodeType.KNOWN) {
        const colorStr = nodeData.color;
        if (!colorStr) {
            throw new Error('Known node missing color');
        }
        color = new Color(colorStr);
    }
    
    return new GameNode(nodeType, pos, color);
}

function gameFromJson(data: string | JsonGame): Game {
    if (typeof data === 'string') {
        data = JSON.parse(data) as JsonGame;
    }
    
    const groups: GameNode[][] = [];
    for (const g of data.groups) {
        groups.push(g.map(n => nodeFromJson(n)));
    }
    
    const undoCount = data.undoCount ?? 5;
    
    // Parse game mode
    let gameMode = GameMode.NORMAL;
    const gameModeRaw = data.gameMode ?? data.mode;
    if (gameModeRaw !== undefined) {
        try {
            if (typeof gameModeRaw === 'string') {
                // Try by name first
                gameMode = GameMode[gameModeRaw as keyof typeof GameMode];
            } else {
                // Try by numeric value
                gameMode = gameModeRaw as GameMode;
            }
        } catch {
            // Fall back to NORMAL on invalid value
            gameMode = GameMode.NORMAL;
        }
    }
    
    const groupCapacity = data.groupCapacity ?? data.rows ?? null;
    
    return new Game(groups, undoCount, groupCapacity, gameMode);
}

function readJsonFile(filePath: string): Game {
    try {
        const fullPath = path.resolve(filePath);
        const content = fs.readFileSync(fullPath, 'utf-8');
        return gameFromJson(content);
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        process.exit(1);
    }
}

function solveAndPrint(game: Game): SearchState {
    console.log(`Game mode: ${GameMode[game.mode]} (${game.mode})`);
    console.log(`Groups: ${game.groups.length}`);
    console.log(`Capacity: ${game.capacity}`);
    console.log(`Contains unknown: ${game.containsUnknown}`);
    console.log(`Undo count: ${game.undoCount}`);
    console.log(`Is winning: ${game.winning}`);
    console.log();
    
    if (game.winning) {
        console.log('🎉 Game is already in winning state!');
        return new SearchState(game, []);
    }
    
    console.log('🔍 Solving...');
    const startTime = Date.now();
    
    const startState = new SearchState(game, []);
    const solvedState = solve(startState, 8, false); // depth=8, debug=false
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    console.log(`✅ Solved in ${duration}ms`);
    console.log(`Solution length: ${solvedState.path.length} moves`);
    console.log();
    
    console.log('Solution steps:');
    const stepOps = solvedState.path.filter((op): op is StepOp => op instanceof StepOp);
    stepOps.forEach((op, index) => {
        console.log(`  ${index + 1}: ${op.toString()}`);
    });
    
    return solvedState;
}

function main(): void {
    const args = process.argv.slice(2);
    if (args.length !== 1) {
        console.error('Usage: npm run json_input_test <puzzle.json>');
        console.error('Example: npm run json_input_test python_prototype/input.json');
        process.exit(1);
    }
    
    const jsonFile = args[0];
    console.log(`📖 Reading puzzle from: ${jsonFile}`);
    
    const game = readJsonFile(jsonFile);
    solveAndPrint(game);
    
    console.log();
    console.log('🏁 Done!');
}

// Only run main if this file is executed directly
if (process.argv[1].endsWith('json-solver.js')) {
    main();
}