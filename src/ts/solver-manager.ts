// Solver Manager - handles Web Worker communication for non-blocking solving

import { Game, StepOp, UndoOp } from './game.js';
// import { SearchState } from './solver.js'; // Removed to avoid static/dynamic import conflict

// Local interface to avoid static import dependency  
interface SearchStateInterface {
    stateGame: Game;
    path: (StepOp | UndoOp)[];
    // Add dummy properties to match SearchState interface
    instanceId: number;
    value: any;
}

interface SolverResult {
    solution: SearchStateInterface;
    searchTime: number;
}

interface SolverProgress {
    message: string;
    searchedStates?: number;
}

type ProgressCallback = (progress: SolverProgress) => void;

export class SolverManager {
    private worker: Worker | null = null;
    private currentResolve: ((result: SolverResult) => void) | null = null;
    private currentReject: ((error: Error) => void) | null = null;
    private progressCallback: ProgressCallback | null = null;

    constructor() {
        this.initWorker();
    }

    private initWorker() {
        try {
            // Create worker from the TypeScript file (Vite will handle compilation)
            this.worker = new Worker(new URL('./solver-worker.ts', import.meta.url), {
                type: 'module'
            });
            
            this.worker.onmessage = (event) => {
                this.handleWorkerMessage(event.data);
            };
            
            this.worker.onerror = (error) => {
                console.error('Worker error:', error);
                if (this.currentReject) {
                    this.currentReject(new Error(`Worker error: ${error.message}`));
                    this.cleanup();
                }
            };
            
        } catch (error) {
            console.warn('Web Worker not supported, falling back to main thread');
            this.worker = null;
        }
    }

    private handleWorkerMessage(data: any) {
        switch (data.type) {
            case 'result':
                if (this.currentResolve && data.success) {
                    // Deserialize the solution
                    const operations = data.solution.path.map((opData: any) => {
                        if (opData.type === 'step') {
                            return new StepOp(opData.src, opData.dst);
                        } else {
                            return new UndoOp();
                        }
                    });
                    
                    // Create a mock SearchState-like object for the result
                    // Note: We don't have the full final game state, but we have what we need
                    const mockFinalGame = this.lastGameSent!; // We'll store this
                    const solution: SearchStateInterface = {
                        stateGame: mockFinalGame,
                        path: operations,
                        instanceId: 0, // Dummy value
                        value: null // Dummy value
                    };
                    
                    const result: SolverResult = {
                        solution: solution,
                        searchTime: data.solution.searchTime
                    };
                    
                    this.currentResolve(result);
                    this.cleanup();
                }
                break;
                
            case 'error':
                if (this.currentReject) {
                    this.currentReject(new Error(data.error));
                    this.cleanup();
                }
                break;
                
            case 'progress':
                if (this.progressCallback) {
                    this.progressCallback({
                        message: data.message,
                        searchedStates: data.searchedStates
                    });
                }
                break;
        }
    }
    
    private lastGameSent: Game | null = null;

    private serializeGame(game: Game) {
        return {
            groups: game.groups.map(group =>
                group.map(node => ({
                    nodeType: node.type,
                    originalPos: node.pos,
                    color: node.color ? node.color.toString() : null
                }))
            ),
            undoCount: game.undoCount,
            capacity: game.capacity,
            mode: game.mode
        };
    }

    private cleanup() {
        this.currentResolve = null;
        this.currentReject = null;
        this.progressCallback = null;
        this.lastGameSent = null;
    }

    async solve(
        game: Game, 
        searchDepth = 8, 
        debug = false, 
        onProgress?: ProgressCallback
    ): Promise<SolverResult> {
        
        this.progressCallback = onProgress || null;
        
        // Fallback to main thread if worker not available
        if (!this.worker) {
            return this.solveOnMainThread(game, searchDepth, debug, onProgress);
        }

        return new Promise<SolverResult>((resolve, reject) => {
            this.currentResolve = resolve;
            this.currentReject = reject;
            this.lastGameSent = game;
            
            const message = {
                type: 'solve',
                gameState: this.serializeGame(game),
                searchDepth: searchDepth,
                debug: debug
            };
            
            this.worker!.postMessage(message);
        });
    }

    private async solveOnMainThread(
        game: Game, 
        searchDepth: number, 
        debug: boolean,
        onProgress?: ProgressCallback
    ): Promise<SolverResult> {
        
        const { solve, SearchState } = await import('./solver.js');
        
        if (onProgress) {
            onProgress({ message: 'Solving on main thread (Web Worker unavailable)...' });
        }
        
        const startTime = performance.now();
        const startState = new SearchState(game, []);
        const solution = solve(startState, searchDepth, debug);
        const endTime = performance.now();
        
        return {
            solution: {
                stateGame: solution.stateGame,
                path: solution.path,
                instanceId: solution.instanceId,
                value: solution.value
            },
            searchTime: endTime - startTime
        };
    }

    cancel() {
        if (this.worker && this.currentResolve) {
            // Terminate and recreate worker to cancel current operation
            this.worker.terminate();
            this.initWorker();
            
            if (this.currentReject) {
                this.currentReject(new Error('Operation cancelled'));
            }
            this.cleanup();
        }
    }

    destroy() {
        if (this.worker) {
            this.worker.terminate();
            this.worker = null;
        }
        this.cleanup();
    }
}