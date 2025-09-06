// Web Worker for non-blocking puzzle solving
// This runs in a separate thread to avoid blocking the main UI

import { Game, GameNode, StepOp } from './game.js';
import { GameMode, NodeType, Color } from './types.js';
import { SearchState, solve } from './solver.js';

interface SolveMessage {
    type: 'solve';
    gameState: any; // Serialized game state
    searchDepth: number;
    debug: boolean;
}

interface SolveResult {
    type: 'result';
    success: true;
    solution: {
        path: any[]; // Serialized operations
        pathLength: number;
        searchTime: number;
    };
}

interface SolveError {
    type: 'error';
    success: false;
    error: string;
}

interface SolveProgress {
    type: 'progress';
    message: string;
    searchedStates?: number;
}

type WorkerMessage = SolveMessage;
// type WorkerResponse = SolveResult | SolveError | SolveProgress; // Currently unused

// Helper to deserialize game state from main thread
function deserializeGameState(data: any): Game {
    const groups: GameNode[][] = data.groups.map((group: any[]) =>
        group.map((nodeData: any) => {
            const nodeType = nodeData.nodeType as NodeType;
            const pos = nodeData.originalPos as [number, number];
            const color = nodeData.color ? new Color(nodeData.color) : null;
            return new GameNode(nodeType, pos, color);
        })
    );
    
    return new Game(
        groups,
        data.undoCount || 5,
        data.capacity || null,
        data.mode || GameMode.NORMAL
    );
}

// Helper to serialize solution for main thread
function serializeSolution(searchState: SearchState) {
    return {
        path: searchState.path.map(op => ({
            type: op instanceof StepOp ? 'step' : 'undo',
            src: op instanceof StepOp ? op.src : undefined,
            dst: op instanceof StepOp ? op.dst : undefined,
            toString: op.toString()
        })),
        pathLength: searchState.path.length,
        finalState: {
            winning: searchState.stateGame.winning,
            segments: searchState.stateGame.segments
        }
    };
}

// Handle messages from main thread
self.onmessage = async (event: MessageEvent<WorkerMessage>) => {
    const message = event.data;
    
    if (message.type === 'solve') {
        try {
            // Send progress update
            const progressResponse: SolveProgress = {
                type: 'progress',
                message: 'Initializing solver...'
            };
            self.postMessage(progressResponse);
            
            // Deserialize game state
            const game = deserializeGameState(message.gameState);
            
            // Send progress update
            self.postMessage({
                type: 'progress',
                message: 'Solving puzzle...'
            } as SolveProgress);
            
            const startTime = performance.now();
            
            // Create start state and solve
            const startState = new SearchState(game, []);
            const solvedState = solve(startState, message.searchDepth, message.debug);
            
            const endTime = performance.now();
            const searchTime = endTime - startTime;
            
            // Send progress update
            self.postMessage({
                type: 'progress',
                message: 'Solution found! Processing results...'
            } as SolveProgress);
            
            // Serialize and send result
            const result: SolveResult = {
                type: 'result',
                success: true,
                solution: {
                    ...serializeSolution(solvedState),
                    searchTime: searchTime
                }
            };
            
            self.postMessage(result);
            
        } catch (error) {
            const errorResponse: SolveError = {
                type: 'error',
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
            self.postMessage(errorResponse);
        }
    }
};

// Handle worker errors
self.onerror = (error) => {
    const errorResponse: SolveError = {
        type: 'error',
        success: false,
        error: `Worker error: ${typeof error === 'string' ? error : (error as any).message || 'Unknown error'}`
    };
    self.postMessage(errorResponse);
};