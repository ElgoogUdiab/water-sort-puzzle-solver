// Solver logic - TypeScript port of solver.py

import { Game, StepOp, UndoOp } from './game.ts';
import FastPriorityQueue from 'fastpriorityqueue';

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
    
    get value(): [number, number, number] {
        return [...this.stateGame.heuristic, this.instanceId] as [number, number, number];
    }
}

function isAMoreValueableThanB(a: SearchState, b: SearchState): boolean {
    const aCount = a.stateGame.unknownRevealedCount;
    const bCount = b.stateGame.unknownRevealedCount;
    if (aCount > bCount) return true;
    if (aCount < bCount) return false;
    return a.path.length < b.path.length;
}

export interface SolveResult {
    success: boolean;
    steps: string[];
    searchedStates: number;
    finalState: Game;
    isPartialSolution?: boolean;
}

export function solve(startState: SearchState, depth = 8, debug = false): SolveResult {
    // Check if the starting state is already winning
    if (!startState.stateGame.containsUnknown && startState.stateGame.winning) {
        if (debug) {
            console.log('Starting state is already winning!');
        }
        return {
            success: true,
            steps: [],
            searchedStates: 1,
            finalState: startState.stateGame
        };
    }
    
    
    const discoveredDict = new Map<string, [Game, number]>();
    let candidateState: SearchState | null = null;
    let candidateSearchStateCount = Infinity;
    
    let searchedStateCount = 0;
    
    
    // Min-heap comparator on SearchState.value (lexicographic ascending)
    const pq = new FastPriorityQueue<SearchState>((a, b) => {
        const av = a.value, bv = b.value;
        for (let i = 0; i < Math.min(av.length, bv.length); i++) {
            if (av[i] !== bv[i]) return av[i] < bv[i];
        }
        return av.length < bv.length;
    });
    pq.add(startState);
function canonicalStateKey(stateGame: Game): string {
    // Build groups as arrays of {t, c} ignoring positions
    const groups = stateGame.groups.map(g => g.map(n => ({ t: n.type, c: n.color })));
    // Sort each group's items by (t,c) string to make inner tuple canonical
    const groupStrings = groups.map(grp => {
        const items = grp.map(x => JSON.stringify(x));
        // Do NOT sort inside a group: Python uses tuple(group) which preserves order inside each group.
        // So we keep inner order to match Python; only sort groups themselves.
        return JSON.stringify(items);
    });
    // Sort groups to ignore group order (frozenset of groups)
    groupStrings.sort();
    return groupStrings.join("|");
}
    
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
        
        if (!startState.stateGame.containsUnknown) {
            if (stateGame.winning) {
                return {
                    success: true,
                    steps: currentSearchState.path.map(op => op.toString()),
                    searchedStates: searchedStateCount,
                    finalState: stateGame
                };
            }
        } else {
            if (depth === 0) {
                if (candidateState === null) {
                    candidateState = currentSearchState;
                } else {
                    if (currentSearchState.stateGame.segments < candidateState.stateGame.segments) {
                        candidateState = currentSearchState;
                    }
                }
            } else {
                if (stateGame.isMeaningfulState) {
                    if (candidateState === null) {
                        if (searchedStateCount > 1) {
                            if (debug) {
                                console.log(`Setting first candidate state at search state ${searchedStateCount}`);
                            }
                            candidateState = currentSearchState;
                            candidateSearchStateCount = searchedStateCount;
                        }
                    } else if (isAMoreValueableThanB(currentSearchState, candidateState)) {
                        if (debug) {
                            console.log(`Updating candidate state to state ${searchedStateCount} (${currentSearchState.stateGame.unknownRevealedCount}, ${currentSearchState.path.length} -> ${candidateState.stateGame.unknownRevealedCount}, ${candidateState.path.length})`);
                        }
                        candidateState = currentSearchState;
                        candidateSearchStateCount = searchedStateCount;
                    }
                }
                
                if (candidateState && searchedStateCount > 2 * candidateSearchStateCount) {
                    if (debug) {
                        console.log(`Too long since last candidate state update. Start search from last candidate state`);
                    }
                    return solve(candidateState, depth - 1, debug);
                }
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
        return {
            success: true, // Changed: when unknown blocks present, finding revealing steps is success
            steps: candidateState.path.map(op => op.toString()),
            searchedStates: searchedStateCount,
            finalState: candidateState.stateGame,
            isPartialSolution: true // Indicate this reveals unknowns rather than solves completely
        };
    }
    
    return {
        success: false,
        steps: [],
        searchedStates: searchedStateCount,
        finalState: startState.stateGame
    };
}