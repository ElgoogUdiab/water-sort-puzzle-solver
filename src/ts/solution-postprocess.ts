// Solution postprocessing - TypeScript port of Python solution_postprocess.py

import { DirectedGraph } from './graph.ts';
import { Game, StepOp } from './game.ts';
import { SearchState } from './solver.ts';
import { Color } from './types.ts';

interface StepNodeData {
    label: string;
    opSrc: number;
    opDst: number;
    opColor: Color | null;
    opRevealingColor: Color | null;
    seqIndex?: number;
    collapsable?: boolean;
}

function isStepOp(op: StepOp | any): op is StepOp {
    return op instanceof StepOp;
}

export function solutionToGraph(inputSolution: SearchState): DirectedGraph<StepNodeData> {
    // Ensure all operations are StepOp (no undo operations)
    if (!inputSolution.path.every(isStepOp)) {
        throw new Error('Solution contains non-StepOp operations');
    }

    const stepPath = inputSolution.path as StepOp[];
    
    // Reconstruct intermediate game states in order from start to end
    const states: Game[] = [];
    let gamePtr: Game | null = inputSolution.stateGame;
    while (gamePtr !== null) {
        states.push(gamePtr);
        gamePtr = gamePtr.undoTargetState;
    }
    states.reverse();
    
    if (states.length !== stepPath.length + 1) {
        throw new Error(`State count mismatch: ${states.length} vs ${stepPath.length + 1}`);
    }

    const G = new DirectedGraph<StepNodeData>();
    
    // Create nodes for each operation
    for (let i = 0; i < stepPath.length; i++) {
        const op = stepPath[i];
        const srcGroup = states[i].groups[op.src];
        const opItem = srcGroup[srcGroup.length - 1];
        const nextSrcGroup = states[i + 1].groups[op.src];
        const opRevealingColor = nextSrcGroup.length > 0 ? nextSrcGroup[nextSrcGroup.length - 1].color : null;
        
        G.addNode(i.toString(), {
            label: `${op.toString()}`,
            opSrc: op.src,
            opDst: op.dst,
            opColor: opItem.color,
            opRevealingColor: opRevealingColor
        });
    }

    // Add special start and end nodes
    G.addNode("s", { label: "s", opSrc: -1, opDst: -1, opColor: null, opRevealingColor: null });
    G.addNode("t", { label: "t", opSrc: -1, opDst: -1, opColor: null, opRevealingColor: null });

    // Track last operation on each group
    const lastOpOnGroupIndex: number[] = new Array(inputSolution.stateGame.groups.length).fill(-1);

    // Build edges based on operation dependencies
    for (let i = 0; i < stepPath.length; i++) {
        const op = stepPath[i];
        const es1 = lastOpOnGroupIndex[op.src];
        const es2 = lastOpOnGroupIndex[op.dst];
        
        if (es1 !== -1) {
            G.addEdge(es1.toString(), i.toString());
        }
        if (es2 !== -1) {
            G.addEdge(es2.toString(), i.toString());
        }
        if (es1 === -1 && es2 === -1) {
            G.addEdge("s", i.toString());
        }
        
        lastOpOnGroupIndex[op.src] = i;
        lastOpOnGroupIndex[op.dst] = i;
    }

    // Connect operations with no successors to the end node
    const srcNodes = new Set<string>();
    for (const [from, to] of G.getAllEdges()) {
        srcNodes.add(from);
    }

    for (let i = 0; i < stepPath.length; i++) {
        if (!srcNodes.has(i.toString())) {
            G.addEdge(i.toString(), "t");
        }
    }

    // Apply transitive reduction
    const TR = G.transitiveReduction();
    
    return TR;
}

export function priorityTopoSort(G: DirectedGraph<StepNodeData>, initialGame: Game): string[] {
    let prevColor: Color | null = null;
    let prevReveal: Color | null = null;
    let prevGroups: Set<number> | null = null;
    let gameState = initialGame;

    const scoreFn = (nodeId: string): number => {
        if (nodeId === "s" || nodeId === "t") {
            return -1;
        }
        
        const nodeData = G.getNodeData(nodeId);
        if (!nodeData) return -1;
        
        const { opSrc, opDst, opColor } = nodeData;
        let score = 0;

        // Priority 1: completing a tube after applying the move (score +8)
        const op = new StepOp(opSrc, opDst);
        const nextGameState = gameState.apply(op);
        if (nextGameState.isGroupCompleted(nextGameState.groups[opDst])) {
            score += 8;
        }

        // Priority 2: same color as previous move (score +4)
        if (prevColor !== null && opColor !== null && opColor.toString() === prevColor.toString()) {
            score += 4;
        }

        // Priority 3: reveals expected color (score +2)
        if (prevReveal !== null && opColor !== null && opColor.toString() === prevReveal.toString()) {
            score += 2;
        }

        // Priority 4: uses same tubes as previous move (score +1)
        if (prevGroups && (prevGroups.has(opSrc) || prevGroups.has(opDst))) {
            score += 1;
        }

        return score;
    };

    const result: string[] = [];
    const inDegree = new Map<string, number>();
    
    // Initialize in-degrees
    for (const [nodeId] of G.getNodes()) {
        inDegree.set(nodeId, G.getInDegree(nodeId));
    }
    
    // Find nodes with zero in-degree
    const zeroInDegree: string[] = [];
    for (const [nodeId, degree] of inDegree) {
        if (degree === 0) {
            zeroInDegree.push(nodeId);
        }
    }

    while (zeroInDegree.length > 0) {
        let current: string;
        
        if (zeroInDegree.includes("s")) {
            current = "s";
            zeroInDegree.splice(zeroInDegree.indexOf("s"), 1);
        } else {
            // Sort by score (higher first), then by node id (lower first)
            zeroInDegree.sort((a, b) => {
                const scoreA = scoreFn(a);
                const scoreB = scoreFn(b);
                if (scoreA !== scoreB) return scoreB - scoreA;  // Higher score first
                return parseInt(a) - parseInt(b);  // Lower node id first
            });
            current = zeroInDegree.shift()!;
        }

        // Process successors
        for (const successor of G.getSuccessors(current)) {
            const newDegree = inDegree.get(successor)! - 1;
            inDegree.set(successor, newDegree);
            if (newDegree === 0) {
                zeroInDegree.push(successor);
            }
        }

        // Skip start and end nodes in output
        if (current === "s" || current === "t") {
            continue;
        }

        // Update state for next iteration
        const nodeData = G.getNodeData(current);
        if (nodeData) {
            prevColor = nodeData.opColor;
            prevReveal = nodeData.opRevealingColor;
            prevGroups = new Set([nodeData.opSrc, nodeData.opDst]);

            // Advance the simulated game state
            const op = new StepOp(nodeData.opSrc, nodeData.opDst);
            gameState = gameState.apply(op);
        }

        result.push(current);
    }

    return result;
}

export function solutionPostprocess(inputSolution: SearchState, initialGame: Game): DirectedGraph<StepNodeData> {
    const G = solutionToGraph(inputSolution);
    
    // Produce the prioritized topological order
    const orderedNodes: string[] = priorityTopoSort(G, initialGame);

    // Prefix labels with sequence numbers for readability
    for (let ind = 0; ind < orderedNodes.length; ind++) {
        const nodeId = orderedNodes[ind];
        const nodeData = G.getNodeData(nodeId);
        if (nodeData) {
            nodeData.seqIndex = ind + 1;
            nodeData.label = `${(ind + 1).toString().padStart(2, '0')}: ${nodeData.label}`;
        }
    }

    // Compute collapsable flags using a simulated game state
    let gameState = initialGame;
    for (const nodeId of orderedNodes) {
        const nodeData = G.getNodeData(nodeId);
        if (!nodeData) continue;

        const forwardOps = gameState.ops().filter(isStepOp);
        
        let collapsable = false;
        if (forwardOps.length === 1) {
            const only = forwardOps[0];
            collapsable = (only.src === nodeData.opSrc && only.dst === nodeData.opDst);
        }
        
        nodeData.collapsable = collapsable;

        // Advance simulation
        const op = new StepOp(nodeData.opSrc, nodeData.opDst);
        gameState = gameState.apply(op);
    }

    return G;
}