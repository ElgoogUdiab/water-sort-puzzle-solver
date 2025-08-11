// Main application entry point

import { Game, GameNode } from './game.ts';
import { solve, SearchState } from './solver.ts';
import { CanvasEditor } from './canvas-editor.ts';
import { GameVisualizer, SolutionVisualizer } from './visualization.ts';
import { GameState, NodeType, GameMode, Color } from './types.ts';

class WaterSortApp {
    canvasEditor: CanvasEditor;
    gameVisualizer: GameVisualizer;
    solutionVisualizer: SolutionVisualizer;

    constructor() {
        this.canvasEditor = new CanvasEditor('grid', 'palette');
        this.gameVisualizer = new GameVisualizer('gameVisualization');
        this.solutionVisualizer = new SolutionVisualizer('solutionResult');
        
        this.setupEventListeners();
        this.initialize();
    }

    setupEventListeners(): void {
        // Canvas editor controls
        (document.getElementById('cols') as HTMLInputElement).addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            this.canvasEditor.resize(parseInt(target.value), undefined);
        });

        (document.getElementById('rows') as HTMLInputElement).addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            this.canvasEditor.resize(undefined, parseInt(target.value));
        });

        document.getElementById('reset')!.addEventListener('click', () => {
            this.canvasEditor.reset();
        });

        document.getElementById('rand')!.addEventListener('click', () => {
            this.canvasEditor.randomize();
        });

        (document.getElementById('numcolors') as HTMLInputElement).addEventListener('input', (e: Event) => {
            const target = e.target as HTMLInputElement;
            this.canvasEditor.rebuildPalette(parseInt(target.value));
        });

        document.getElementById('solveBtn')!.addEventListener('click', () => {
            this.solveGame();
        });

        // Listen for game state changes from canvas
        document.getElementById('grid')!.addEventListener('gamestatechange', (e: Event) => {
            const detail = (e as CustomEvent<GameState>).detail;
            this.gameVisualizer.visualizeGameState(detail);
        });

        // Listen for setStartingState event from solution visualization
        document.addEventListener('setStartingState', (e: Event) => {
            const detail = (e as CustomEvent<GameState>).detail;
            this.setCanvasFromGameState(detail);
        });
    }

    initialize(): void {
        // Start with a simple example puzzle
        // Need to wait for canvas editor to be fully initialized
        setTimeout(() => {
            this.createSimpleExample();
        }, 50);
    }

    createSimpleExample(): void {
        // Update the HTML inputs first
        (document.getElementById('cols') as HTMLInputElement).value = '4';
        (document.getElementById('rows') as HTMLInputElement).value = '4';
        
        // Create a simple 4-tube, 4-height puzzle
        this.canvasEditor.resize(4, 4);
        
        // Clear the board first
        this.canvasEditor.reset();
        
        // Create a simple solvable puzzle manually
        const board = this.canvasEditor.board;
        const palette = this.canvasEditor.palette;
        
        // Use the first three colors from the palette
        const color1 = palette[0].rgb; // Orange
        const color2 = palette[1].rgb; // Red
        const color3 = palette[2].rgb; // Blue
        
        // Tube 1: Color1-Color1-Color2-Color2 (bottom to top)
        board[0][0] = {type: NodeType.KNOWN, color: [...color1]};
        board[0][1] = {type: NodeType.KNOWN, color: [...color1]};
        board[0][2] = {type: NodeType.KNOWN, color: [...color2]};
        board[0][3] = {type: NodeType.KNOWN, color: [...color2]};
        
        // Tube 2: Color3-Color3-Color1-Color1
        board[1][0] = {type: NodeType.KNOWN, color: [...color3]};
        board[1][1] = {type: NodeType.KNOWN, color: [...color3]};
        board[1][2] = {type: NodeType.KNOWN, color: [...color1]};
        board[1][3] = {type: NodeType.KNOWN, color: [...color1]};
        
        // Tube 3: Color2-Color2-Color3-Color3  
        board[2][0] = {type: NodeType.KNOWN, color: [...color2]};
        board[2][1] = {type: NodeType.KNOWN, color: [...color2]};
        board[2][2] = {type: NodeType.KNOWN, color: [...color3]};
        board[2][3] = {type: NodeType.KNOWN, color: [...color3]};
        
        // Tube 4: Empty
        for (let r = 0; r < 4; r++) {
            board[3][r] = {type: NodeType.EMPTY, color: null};
        }
        
        // Update palette remaining counts  
        this.canvasEditor.recalcPaletteRemaining();
        
        // Refresh the display
        this.canvasEditor.renderPalette();
        this.canvasEditor.draw();
        this.canvasEditor.syncToGameState();
    }
    
    setCanvasFromGameState(gameState: GameState): void {
        if (!gameState || !gameState.groups) return;
        
        // Determine board dimensions from game state
        const cols = gameState.groups.length;
        const rows = Math.max(...gameState.groups.map(g => g.length), 1);
        
        // Update HTML inputs
        (document.getElementById('cols') as HTMLInputElement).value = cols.toString();
        (document.getElementById('rows') as HTMLInputElement).value = rows.toString();
        
        // Resize canvas
        this.canvasEditor.resize(cols, rows);
        this.canvasEditor.reset();
        
        // Convert game state to canvas board format
        // The canvas board is [column][row] where row 0 is bottom
        for (let c = 0; c < gameState.groups.length; c++) {
            const group = gameState.groups[c];
            // Fill from bottom up - game state groups are in bottom-to-top order
            for (let r = 0; r < group.length; r++) {
                const node = group[r];
                if (node.nodeType === NodeType.KNOWN) {
                    // Known node with color
                    const color = this.hexToRgb(node.color!);
                    this.canvasEditor.board[c][r] = {type: NodeType.KNOWN, color: color};
                } else if (node.nodeType === NodeType.UNKNOWN || node.nodeType === NodeType.UNKNOWN_REVEALED) {
                    // Unknown nodes - represent as empty in canvas (will be interpreted as unknown by syncToGameState)
                    this.canvasEditor.board[c][r] = {type: NodeType.EMPTY, color: null};
                } else if (node.nodeType === NodeType.EMPTY) {
                    // Empty node - keep as empty
                    this.canvasEditor.board[c][r] = {type: NodeType.EMPTY, color: null};
                }
            }
            // All positions above the group remain empty (they're already set to empty by reset())
        }
        
        this.canvasEditor.recalcPaletteRemaining();
        this.canvasEditor.renderPalette();
        this.canvasEditor.draw();
        this.canvasEditor.syncToGameState();
    }
    
    hexToRgb(hex: string): Color {
        if (!hex) return [0, 0, 0];
        const h = hex.replace('#', '');
        return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    }

    solveGame(): void {
        const debugMode = (document.getElementById('debugMode') as HTMLInputElement).checked;
        const searchDepth = parseInt((document.getElementById('searchDepth') as HTMLInputElement).value);
        const undoCount = parseInt((document.getElementById('undo') as HTMLInputElement).value);
        const mode = Number((document.getElementById('mode') as HTMLInputElement).value) as GameMode;
        
        try {
            const gameStateForSolver = this.canvasEditor.toSolverFormat();
            
            if (!gameStateForSolver.groups || gameStateForSolver.groups.length === 0) {
                throw new Error('No game state to solve. Please create a puzzle first.');
            }
            
            if (debugMode) {
                console.log('Game state for solver:', gameStateForSolver);
            }

            // Convert to solver format
            const groups = gameStateForSolver.groups.map((group, groupIndex) =>
                group.map((node, nodeIndex) => {
                    let nodeType = NodeType.KNOWN;
                    if (node.nodeType === NodeType.UNKNOWN) nodeType = NodeType.UNKNOWN;
                    else if (node.nodeType === NodeType.UNKNOWN_REVEALED) nodeType = NodeType.UNKNOWN_REVEALED;
                    else if (node.nodeType === NodeType.EMPTY) nodeType = NodeType.EMPTY;

                    const color = node.color ? this.hexToRgb(node.color) : null;
                    return new GameNode(nodeType, [groupIndex, nodeIndex], color);
                })
            );
            
            const game = new Game(groups, undoCount, undefined, mode);
            
            if (debugMode) {
                console.log('Game created:', game);
                console.log('Game is winning:', game.winning);
                console.log('Game contains unknown:', game.containsUnknown);
                console.log('Game ops:', game.ops());
            }
            
            const startState = new SearchState(game, []);
            const result = solve(startState, searchDepth, debugMode);
            
            const formattedResult = {
                success: result.success,
                steps: result.steps,
                searchedStates: result.searchedStates,
                finalState: result.allStates[result.allStates.length - 1]
            };
            
            this.solutionVisualizer.displaySolution(formattedResult, this.canvasEditor.getGameState()!);
            
        } catch (error: unknown) {
            const err = error as Error;
            console.error('Solver error:', err);
            this.solutionVisualizer.displayError('Error: ' + err.message);
        }
    }
}

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    new WaterSortApp();
});