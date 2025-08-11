// Game visualization utilities

import { NodeType, GameState } from './types.ts';

export class GameVisualizer {
    container: HTMLElement;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId)!;
    }

    visualizeGameState(gameState: GameState | null): void {
        this.container.innerHTML = '';

        if (!gameState || !gameState.groups) return;
        
        const maxHeight = Math.max(...gameState.groups.map(g => g.length), 1);
        
        for (let i = 0; i < gameState.groups.length; i++) {
            const tube = document.createElement('div');
            tube.className = 'tube';
            tube.style.height = (maxHeight * 40 + 20) + 'px';
            
            const group = gameState.groups[i];
            for (let j = 0; j < group.length; j++) {
                const node = group[j];
                
                // Skip EMPTY nodes
                if (node.nodeType === NodeType.EMPTY) continue;
                
                const ball = document.createElement('div');
                ball.className = 'ball';
                ball.style.bottom = (j * 38 + 2) + 'px';
                
                if (node.nodeType === NodeType.UNKNOWN) {
                    ball.style.backgroundColor = '#000';
                    ball.style.color = '#fff';
                    ball.style.display = 'flex';
                    ball.style.alignItems = 'center';
                    ball.style.justifyContent = 'center';
                    ball.style.fontSize = '18px';
                    ball.style.fontWeight = 'bold';
                    ball.textContent = '?';
                    ball.title = 'Unknown';
                } else if (node.nodeType === NodeType.UNKNOWN_REVEALED) {
                    ball.style.backgroundColor = '#ccc';
                    ball.style.color = '#333';
                    ball.style.display = 'flex';
                    ball.style.alignItems = 'center';
                    ball.style.justifyContent = 'center';
                    ball.style.fontSize = '18px';
                    ball.style.fontWeight = 'bold';
                    ball.textContent = '?';
                    ball.title = 'Unknown Revealed';
                } else if (node.color) {
                    ball.style.backgroundColor = node.color;
                    ball.title = node.color;
                }
                
                tube.appendChild(ball);
            }
            
            const label = document.createElement('div');
            label.textContent = (i + 1).toString();
            label.style.textAlign = 'center';
            label.style.marginTop = '5px';
            label.style.fontSize = '12px';
            
            const tubeContainer = document.createElement('div');
            tubeContainer.style.display = 'inline-block';
            tubeContainer.style.textAlign = 'center';
            tubeContainer.appendChild(tube);
            tubeContainer.appendChild(label);
            
            this.container.appendChild(tubeContainer);
        }
    }
}

interface DisplayResult {
    success: boolean;
    steps: string[];
    searchedStates: number;
    isPartialSolution?: boolean;
}

export class SolutionVisualizer {
    container: HTMLElement;
    solutionStates: GameState[] | null = null;
    revealSteps: ({col: number, row: number} | null)[] | null = null;

    constructor(resultContainerId: string) {
        this.container = document.getElementById(resultContainerId)!;
    }

    displaySolution(result: DisplayResult, initialGameState: GameState): void {
        if (result.success) {
            const isPartial = result.isPartialSolution;
            const title = isPartial ? '🔍 Unknown Blocks Revealed!' : '✅ Solution Found!';
            const description = isPartial
                ? '<p><em>This sequence reveals unknown blocks. Solve again after seeing the revealed blocks for a complete solution.</em></p>'
                : '<p><em>Complete solution found!</em></p>';

            const calc = this.calculateSolutionStates(result.steps, initialGameState);
            this.solutionStates = calc.states;
            this.revealSteps = calc.reveals;

            this.container.innerHTML = `
                <div class='solution'>
                    <h4>${title}</h4>
                    <p><strong>Steps:</strong> ${result.steps.length}</p>
                    <p><strong>States Searched:</strong> ${result.searchedStates}</p>
                    ${description}
                    <p><em>Click on any step to see the game state at that point</em></p>
                    <ol class='steps' id='solutionSteps'>
                        ${result.steps.map((step: string, index: number) => {
                            const reveal = this.revealSteps ? this.revealSteps[index] : null;
                            const extra = reveal ? ` - reveal column ${reveal.col}, row ${reveal.row}` : '';
                            return `<li onclick='showStepState(${index + 1})' style='cursor: pointer; padding: 12px 16px; margin: 4px 0; border-radius: 8px;' onmouseover="this.style.backgroundColor='#1f2937'" onmouseout="this.style.backgroundColor='#0b1220'">${step}${extra}</li>`;
                        }).join('')}
                    </ol>
                    <div id='stepStateVisualization' style='margin-top: 20px;'></div>
                </div>
            `;

            // Make showStepState globally available
            window.showStepState = (stepIndex: number) => this.showStepState(stepIndex);

        } else {
            this.container.innerHTML = `
                <div class='error'>
                    <h4>❌ No Solution Found</h4>
                    <p>The solver couldn't find a solution within the search depth limit.</p>
                    <p>Try increasing the search depth or check if the puzzle is solvable.</p>
                </div>
            `;
        }
    }
    displayError(message: string): void {
        this.container.innerHTML = `<div class="error">${message}</div>`;
    }

    calculateSolutionStates(steps: string[], initialGameState: GameState): {states: GameState[]; reveals: ({col: number, row: number} | null)[]} {
        const states: GameState[] = [JSON.parse(JSON.stringify(initialGameState))]; // Initial state
        const reveals: ({col: number, row: number} | null)[] = [];
        let currentState: GameState = JSON.parse(JSON.stringify(initialGameState));

        // Initialize undo count if not present
        if (!currentState.undoCount) currentState.undoCount = 5;

        for (const step of steps) {
            const prevState: GameState = JSON.parse(JSON.stringify(currentState));
            // Apply the step to get the next state
            currentState = this.applyStepToState(currentState, step);

            // Detect newly revealed unknown node
            let revealed: {col: number, row: number} | null = null;
            for (let c = 0; c < currentState.groups.length; c++) {
                const prevGroup = prevState.groups[c] || [];
                const currGroup = currentState.groups[c] || [];
                for (let r = 0; r < currGroup.length; r++) {
                    const before = prevGroup[r];
                    const after = currGroup[r];
                    if (before && after && before.nodeType === NodeType.UNKNOWN && after.nodeType === NodeType.UNKNOWN_REVEALED) {
                        revealed = {col: c + 1, row: r + 1};
                    }
                }
            }
            reveals.push(revealed);
            states.push(JSON.parse(JSON.stringify(currentState)) as GameState);
        }

        return {states, reveals};
    }


    applyStepToState(state: GameState, stepStr: string): GameState {
        // Parse step like "1 -> 2" or "Undo"
        if (stepStr === "Undo") {
            // Decrement undo count
            const newState: GameState = JSON.parse(JSON.stringify(state));
            newState.undoCount = Math.max(0, (newState.undoCount || 5) - 1);
            return newState;
        }
        
        const match = stepStr.match(/(\d+) -> (\d+)/);
        if (!match) return state;
        
        const srcIndex = parseInt(match[1]) - 1;  // Convert to 0-based
        const dstIndex = parseInt(match[2]) - 1;
        
        const newState: GameState = JSON.parse(JSON.stringify(state));
        const srcGroup = newState.groups[srcIndex];
        const dstGroup = newState.groups[dstIndex];
        
        if (srcGroup && srcGroup.length > 0) {
            // Find the top non-empty ball (skip EMPTY nodes)
            let topBallIndex = -1;
            for (let i = srcGroup.length - 1; i >= 0; i--) {
                if (srcGroup[i].nodeType !== NodeType.EMPTY) {
                    topBallIndex = i;
                    break;
                }
            }
            
            if (topBallIndex >= 0) {
                const ball = srcGroup[topBallIndex];
                
                // For normal mode, move all consecutive balls of same color from top
                const ballsToMove: any[] = [];
                for (let i = topBallIndex; i >= 0; i--) {
                    const node = srcGroup[i];
                    if (node.nodeType !== NodeType.EMPTY &&
                        JSON.stringify(node.color) === JSON.stringify(ball.color)) {
                        ballsToMove.unshift(node);
                    } else {
                        break;
                    }
                }
                
                // Remove from source (remove only the balls we're moving)
                for (let i = 0; i < ballsToMove.length; i++) {
                    srcGroup.pop(); // Remove from end
                }
                
                // Add to destination
                dstGroup.push(...ballsToMove);

                // Reveal unknown if exposed at top of source
                if (srcGroup.length > 0) {
                    const top = srcGroup[srcGroup.length - 1];
                    if (top.nodeType === NodeType.UNKNOWN) {
                        top.nodeType = NodeType.UNKNOWN_REVEALED;
                    }
                }
            }
        }
        
        return newState;
    }

    showStepState(stepIndex: number): void {
        if (!this.solutionStates || stepIndex >= this.solutionStates.length) return;

        const stepState = this.solutionStates[stepIndex];
        const container = document.getElementById('stepStateVisualization') as HTMLElement;
        
        // Calculate remaining undo steps if this is a state with unknown blocks
        const hasUnknown = stepState.groups && stepState.groups.some(group =>
            group.some(node => node.nodeType === NodeType.UNKNOWN || node.nodeType === NodeType.UNKNOWN_REVEALED)
        );
        const undoInfo = hasUnknown ? `<p><strong>Remaining Undo Steps:</strong> ${stepState.undoCount || 'N/A'}</p>` : '';
        
        const stepNumber = stepIndex === 0 ? 'Initial' : `After Step ${stepIndex}`;
        container.innerHTML = `
            <h4>Game State: ${stepNumber}</h4>
            ${undoInfo}
            <div id="stepGameVisualization"></div>
            <div style="margin-top: 10px;">
                <button onclick="makeStartingState(${stepIndex})" style="background-color: #2563eb; margin-right: 10px;">Make This Starting State</button>
                <button onclick="clearStepVisualization()">Hide State</button>
            </div>
        `;
        
        // Visualize the step state
        const stepVisualizer = new GameVisualizer('stepGameVisualization');
        stepVisualizer.visualizeGameState(stepState);
        
        // Make functions globally available
        window.clearStepVisualization = () => {
            container.innerHTML = '';
        };

        window.makeStartingState = (index: number) => {
            this.makeStartingStateFromSolution(index);
        };
    }
    makeStartingStateFromSolution(stepIndex: number): void {
        if (!this.solutionStates || stepIndex >= this.solutionStates.length) return;

        const targetState = this.solutionStates[stepIndex];

        // Dispatch custom event to update the canvas editor
        document.dispatchEvent(new CustomEvent<GameState>('setStartingState', {
            detail: targetState
        }));

        // Clear the step visualization
        window.clearStepVisualization();
    }
}

declare global {
    interface Window {
        showStepState: (stepIndex: number) => void;
        clearStepVisualization: () => void;
        makeStartingState: (index: number) => void;
    }
}