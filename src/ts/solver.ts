// Solver logic - TypeScript port of solver.py

import { Game, StepOp, UndoOp } from './game.js';
import { NodeType, GameMode } from './types.js';
import FastPriorityQueue from 'fastpriorityqueue';
import { solutionToGraph, priorityTopoSort } from './solution-postprocess.js';

export class SearchState {
    static instanceCount = 0;
    public stateGame: Game;
    public path: (StepOp | UndoOp)[];
    public instanceId: number;

    static assignNewInstanceId(): number {
        const result = this.instanceCount;
        this.instanceCount += 1;
        return result;
    }

    constructor(state: Game, path: (StepOp | UndoOp)[]) {
        this.stateGame = state;
        this.path = path;
        this.instanceId = SearchState.assignNewInstanceId();
    }

    get value(): number[] {
        /**
         * Priority tuple for the search queue.
         * 
         * - Unknown-aware mode: prefer states that revealed more unknowns, can
         *   reveal in the next move, just revealed something, and with shorter
         *   paths; then fall back to structural heuristics.
         * - Normal mode: fall back to existing structural heuristic.
         */
        if (this.stateGame.containsUnknown) {
            const unknownRevealed = this.stateGame.unknownRevealedCount;
            // More immediate reveal options is better
            const revealableNext = this.stateGame.revealableInOne;
            const justRevealedPenalty = this.stateGame.revealedNew ? 0 : 1;
            return [
                -unknownRevealed,
                -revealableNext,
                justRevealedPenalty,
                this.path.length,
                ...this.stateGame.heuristic,
                this.instanceId
            ];
        }
        return [this.path.length, ...this.stateGame.heuristic, this.instanceId];
    }
}

function compSearchState(a: SearchState, b: SearchState): boolean {
    // is_a_more_valueable_than_b from Python version
    const aCount = a.stateGame.unknownRevealedCount;
    const bCount = b.stateGame.unknownRevealedCount;
    if (aCount > bCount) return true;
    if (aCount < bCount) return false;
    
    // Prefer states that can reveal in the very next move
    const aNext = a.stateGame.revealableInOne;
    const bNext = b.stateGame.revealableInOne;
    if (aNext !== bNext) {
        return aNext > bNext;
    }
    
    // Shorter path is better
    if (a.path.length !== b.path.length) {
        return a.path.length < b.path.length;
    }
    
    // Fallback to fewer segments
    return a.stateGame.segments < b.stateGame.segments;
}

function canonicalStateKey(stateGame: Game): string {
    // Build groups as arrays of node descriptors
    const groups = stateGame.groups.map(g =>
        g.map(n => {
            const base: { t: NodeType; c: typeof n.color; p?: readonly [number, number] } = { t: n.type, c: n.color };
            if (n.type === NodeType.UNKNOWN || n.type === NodeType.UNKNOWN_REVEALED) {
                base.p = n.pos;
            }
            return base;
        })
    );
    const groupStrings = groups.map(grp => {
        const items = grp.map(x => JSON.stringify(x));
        // 保持组内顺序，只对组列表排序以忽略顺序差异
        return JSON.stringify(items);
    });
    // Sort groups to ignore group order (frozenset of groups)
    groupStrings.sort();
    return groupStrings.join("|");
}

function solveNoUnknown(startState: SearchState, debug = false): SearchState {
    // Solve when the starting game contains no unknowns
    const discoveredDict = new Map<string, [Game, number]>();
    let bestSolutionLength = Infinity;  // Track best solution found
    let searchedStateCount = 0;

    // Min-heap comparator on SearchState.value (lexicographic ascending)
    const pq = new FastPriorityQueue<SearchState>((a: SearchState, b: SearchState): boolean => {
        const av = a.value, bv = b.value;
        for (let i = 0; i < Math.min(av.length, bv.length); i++) {
            if (av[i] !== bv[i]) return av[i] < bv[i];
        }
        return av.length < bv.length;
    });
    pq.add(startState);

    while (!pq.isEmpty()) {
        const currentSearchState = pq.poll()!;
        const stateGame = currentSearchState.stateGame;

        // Prune paths that are already longer than best solution
        if (currentSearchState.path.length >= bestSolutionLength) {
            continue;
        }

        const discovered = discoveredDict.get(canonicalStateKey(stateGame));
        if (discovered !== undefined) {
            if (discovered[1] >= stateGame.undoCount) {
                continue;
            }
        }

        searchedStateCount++;
        if (debug) {
            console.log(`segments=${stateGame.segments}, searchedStateCount=${searchedStateCount}`);
        }

        if (stateGame.winning) {
            bestSolutionLength = currentSearchState.path.length;
            return currentSearchState;
        }

        const path = currentSearchState.path;
        discoveredDict.set(canonicalStateKey(stateGame), [stateGame, stateGame.undoCount]);
        const ops = stateGame.ops();
        
        if (debug) {
            console.log(`Available operations: ${ops.length}`, ops.map(op => op.toString()));
        }
        
        for (const op of ops) {
            const newPath = [...path, op];
            // Only add to queue if path length is promising
            if (newPath.length < bestSolutionLength) {
                pq.add(new SearchState(stateGame.apply(op), newPath));
            }
        }
    }

    return startState;
}

function solveWithUnknown(startState: SearchState, depth = 8, debug = false): SearchState {
    // Solve when the starting game contains unknowns, using iterative deepening with candidate states
    const discoveredDict = new Map<string, [Game, number]>();
    let candidateState: SearchState | null = null;
    let candidateSearchStateCount = Infinity;
    let searchedStateCount = 0;

    // Min-heap comparator on SearchState.value (lexicographic ascending)
    const pq = new FastPriorityQueue<SearchState>((a: SearchState, b: SearchState): boolean => {
        const av = a.value, bv = b.value;
        for (let i = 0; i < Math.min(av.length, bv.length); i++) {
            if (av[i] !== bv[i]) return av[i] < bv[i];
        }
        return av.length < bv.length;
    });
    pq.add(startState);

    while (!pq.isEmpty()) {
        const currentSearchState = pq.poll()!;
        const stateGame = currentSearchState.stateGame;

        const discovered = discoveredDict.get(canonicalStateKey(stateGame));
        if (discovered !== undefined) {
            if (discovered[1] >= stateGame.undoCount) {
                continue;
            }
        }

        searchedStateCount++;
        if (debug) {
            console.log(`segments=${stateGame.segments}, searchedStateCount=${searchedStateCount}`);
        }

        if (depth === 0) {
            if (candidateState === null) {
                candidateState = currentSearchState;
            } else {
                // Choose the state with fewer segments as the better candidate
                if (currentSearchState.stateGame.segments < candidateState.stateGame.segments) {
                    candidateState = currentSearchState;
                }
            }
        } else {
            // Check terminal condition - stop if we have enough info to complete puzzle
            if (stateGame.shouldTerminateUnknownSearch) {
                if (debug) {
                    console.log(`Terminal condition met at search state ${searchedStateCount} - enough unknowns revealed`);
                }
                return currentSearchState;
            }
            
            if (stateGame.isMeaningfulState) {
                // Whether to set a candidate state
                if (candidateState === null) {
                    if (searchedStateCount > 1) {
                        if (debug) {
                            console.log(`Setting first candidate state at search state ${searchedStateCount}`);
                        }
                        candidateState = currentSearchState;
                        candidateSearchStateCount = searchedStateCount;
                    }
                } else if (compSearchState(currentSearchState, candidateState)) {
                    if (debug) {
                        console.log(`Updating candidate state to state ${searchedStateCount} (${currentSearchState.stateGame.unknownRevealedCount}, ${currentSearchState.path.length} -> ${candidateState.stateGame.unknownRevealedCount}, ${candidateState.path.length})`);
                    }
                    candidateState = currentSearchState;
                    candidateSearchStateCount = searchedStateCount;
                }
            }

            if (searchedStateCount > 2 * candidateSearchStateCount) {
                if (debug) {
                    console.log(`Too long since last candidate state update. Start search from last candidate state`);
                }
                return solveWithUnknown(candidateState!, depth - 1, debug);
            }
        }

        const path = currentSearchState.path;
        discoveredDict.set(canonicalStateKey(stateGame), [stateGame, stateGame.undoCount]);
        const ops = stateGame.ops();
        
        if (debug) {
            console.log(`Available operations: ${ops.length}`, ops.map(op => op.toString()));
        }
        
        for (const op of ops) {
            pq.add(new SearchState(stateGame.apply(op), [...path, op]));
        }
    }

    if (candidateState !== null) {
        return candidateState;
    }
    return startState;
}

export function solve(startState: SearchState, depth = 8, debug = false): SearchState {
    // Mux: dispatch to specialized solvers based on presence of unknowns
    
    // Check if the starting state is already winning
    if (!startState.stateGame.containsUnknown && startState.stateGame.winning) {
        if (debug) {
            console.log('Starting state is already winning!');
        }
        return startState;
    }

    let solution: SearchState;
    if (!startState.stateGame.containsUnknown) {
        solution = solveNoUnknown(startState, debug);
    } else {
        solution = solveWithUnknown(startState, depth, debug);
    }

    // Apply postprocessing for NORMAL and NO_COMBO game modes with no unknowns (reorder steps)
    if ((startState.stateGame.mode === GameMode.NORMAL || startState.stateGame.mode === GameMode.NO_COMBO) && 
        !startState.stateGame.containsUnknown) {
        
        // Generate optimized step order
        const G = solutionToGraph(solution);
        const orderedNodes = priorityTopoSort(G, startState.stateGame);
        
        // Rebuild the solution path with optimized order
        const optimizedPath: StepOp[] = [];
        for (const nodeId of orderedNodes) {
            const nodeData = G.getNodeData(nodeId);
            if (nodeData) {
                const op = new StepOp(nodeData.opSrc, nodeData.opDst);
                optimizedPath.push(op);
            }
        }
        
        // Create new SearchState with optimized path
        solution = new SearchState(solution.stateGame, optimizedPath);
    }

    return solution;
}