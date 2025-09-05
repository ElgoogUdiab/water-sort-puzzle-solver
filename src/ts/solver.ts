// Solver logic - TypeScript port of solver.py

import { Game, StepOp, UndoOp } from './game.ts';
import { NodeType, GameMode } from './types.ts';
import FastPriorityQueue from 'fastpriorityqueue';
import { solutionToGraph, priorityTopoSort } from './solution-postprocess.ts';

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

function compSearchState(a: SearchState, b: SearchState): boolean {
    const aCount = a.stateGame.unknownRevealedCount;
    const bCount = b.stateGame.unknownRevealedCount;
    if (aCount > bCount) return true;
    if (aCount < bCount) return false;
    return a.path.length < b.path.length;
}

export function solve(startState: SearchState, depth = 8, debug = false): SearchState {
    // Check if the starting state is already winning
    if (!startState.stateGame.containsUnknown && startState.stateGame.winning) {
        if (debug) {
            console.log('Starting state is already winning!');
        }
        return startState;
    }

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
                return currentSearchState;
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
                    } else if (compSearchState(currentSearchState, candidateState)) {
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
        const ops: (StepOp | UndoOp)[] = stateGame.ops();

        if (debug) {
            console.log(`Available operations: ${ops.length}`, ops.map((op: StepOp | UndoOp) => op.toString()));
        }

        for (const op of ops) {
            pq.add(new SearchState(stateGame.apply(op), [...path, op]));
        }
    }

    let solution: SearchState;
    if (candidateState !== null) {
        solution = candidateState;
    } else {
        solution = startState;
    }

    // Apply postprocessing for NORMAL and NO_COMBO game modes with no unknowns (reorder steps)
    if ((startState.stateGame.mode === GameMode.NORMAL || startState.stateGame.mode === GameMode.NO_COMBO) && 
        !startState.stateGame.containsUnknown) {
        
        // Use imported functions
        
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