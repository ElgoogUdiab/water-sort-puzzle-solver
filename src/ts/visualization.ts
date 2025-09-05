// Game visualization utilities

import { NodeType, GameState, Color } from './types.ts';
import { SearchState } from './solver.ts';
import { Game, StepOp, UndoOp } from './game.ts';

export class GameVisualizer {
    container: HTMLElement;

    constructor(containerId: string) {
        this.container = document.getElementById(containerId)!;
    }

    visualizeGameState(gameState: GameState | null): void {
        this.container.innerHTML = '';

        if (!gameState || !gameState.groups) return;
        
        const capacity = gameState.capacity ?? Math.max(...gameState.groups.map(g => g.length), 1);
        
        for (let i = 0; i < gameState.groups.length; i++) {
            const tube = document.createElement('div');
            tube.className = 'tube';
            tube.style.height = (capacity * 40 + 20) + 'px';
            
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
                    ball.style.backgroundColor = node.color.toString();
                    ball.title = node.color.toString();
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

export class SolutionVisualizer {
    container: HTMLElement;
    solutionStates: GameState[] | null = null;
    revealSteps: ({ col: number, row: number } | null)[] | null = null;

    constructor(resultContainerId: string) {
        this.container = document.getElementById(resultContainerId)!;
    }

    displaySearchState(result: SearchState, initialGame: Game): void {
        const ops = result.path;
        const steps = ops.map(op => op.toString());
        const isSolved = result.stateGame.winning;

        if (isSolved || steps.length > 0) {
            const isPartial = !isSolved;
            const title = isPartial ? '🔍 Unknown Blocks Revealed!' : '✅ Solution Found!';
            const description = isPartial
                ? '<p><em>Follow the steps, update the revealed blocks, and run again for a complete solution.</em></p>'
                : '<p><em>Complete solution found!</em></p>';

            const calc = this.buildSolutionGames(ops, initialGame);
            this.solutionStates = calc.states.map(g => this.gameToGameState(g));
            this.revealSteps = calc.reveals;

            this.container.innerHTML = `
                <div class='solution'>
                    <h4>${title}</h4>
                    <p><strong>Steps:</strong> ${steps.length}</p>
                    ${description}
                    <p><em>Click on any step to see the game state at that point</em></p>
                    <ol class='steps' id='solutionSteps'>
                        ${steps.map((step: string, index: number) => {
                            const reveal = this.revealSteps ? this.revealSteps[index] : null;
                            const extra = reveal ? ` - reveal column ${reveal.col}, row ${reveal.row}` : '';
                            return `<details class='step' ontoggle='showStepState(${index + 1}, this)'>\n                                <summary>${step}${extra}</summary>\n                                <div class='step-state'></div>\n                            </details>`;
                        }).join('')}
                    </ol>
                </div>
            `;

            // Make showStepState globally available
            window.showStepState = (stepIndex: number, el: HTMLElement) => this.showStepState(stepIndex, el);
            window.makeStartingState = (index: number) => {
                this.makeStartingStateFromSolution(index);
            };
        } else {
            this.container.innerHTML = `
                <div class='error'>
                    <h4>❌ No Solution Found</h4>
                    <p>The solver couldn't find a solution within the search depth limit.</p>
                </div>
            `;
        }
    }
    displayError(message: string): void {
        this.container.innerHTML = `<div class="error">${message}</div>`;
    }

    displayProgress(message: string): void {
        this.container.innerHTML = `<div class="progress">🔄 ${message}</div>`;
    }

    private buildSolutionGames(ops: (StepOp | UndoOp)[], initialGame: Game): { states: Game[]; reveals: ({ col: number, row: number } | null)[] } {
        const games: Game[] = [initialGame];
        const reveals: ({ col: number, row: number } | null)[] = [];
        let prev = initialGame;
        for (const op of ops) {
            const next = prev.apply(op);
            let revealed: { col: number; row: number } | null = null;
            for (const pos of next.allRevealed) {
                if (!prev.allRevealed.has(pos)) {
                    const [c, r] = pos.split(',').map(n => parseInt(n));
                    revealed = { col: c + 1, row: r + 1 };
                }
            }
            reveals.push(revealed);
            games.push(next);
            prev = next;
        }
        return { states: games, reveals };
    }

    private gameToGameState(game: Game): GameState {
        return {
            groups: game.groups.map(g =>
                g.map(n => ({
                    nodeType: n.type,
                    color: n.color ? new Color(n.color.toString()) : null,
                    originalPos: [n.pos[0], n.pos[1]] as [number, number]
                }))
            ),
            capacity: game.capacity,
            undoCount: game.undoCount
        };
    }

    showStepState(stepIndex: number, el: HTMLElement): void {
        if (!this.solutionStates || stepIndex >= this.solutionStates.length) return;

        const detailsEl = el as HTMLDetailsElement;
        const container = detailsEl.querySelector('.step-state') as HTMLElement;

        if (!detailsEl.open) {
            container.innerHTML = '';
            return;
        }

        const stepState = this.solutionStates[stepIndex];

        // Calculate remaining undo steps if this is a state with unknown blocks
        const hasUnknown = stepState.groups && stepState.groups.some(group =>
            group.some(node => node.nodeType === NodeType.UNKNOWN || node.nodeType === NodeType.UNKNOWN_REVEALED)
        );
        const undoInfo = hasUnknown ? `<p><strong>Remaining Undo Steps:</strong> ${stepState.undoCount || 'N/A'}</p>` : '';

        const stepNumber = stepIndex === 0 ? 'Initial' : `After Step ${stepIndex}`;
        const vizId = `stepGameVisualization-${stepIndex}`;
        container.innerHTML = `
            <h4>Game State: ${stepNumber}</h4>
            ${undoInfo}
            <div id="${vizId}"></div>
            <div style="margin-top: 10px;">
                <button onclick="makeStartingState(${stepIndex})" style="background-color: #2563eb; margin-right: 10px;">Make This Starting State</button>
            </div>
        `;

        // Visualize the step state
        const stepVisualizer = new GameVisualizer(vizId);
        stepVisualizer.visualizeGameState(stepState);
    }
    makeStartingStateFromSolution(stepIndex: number): void {
        if (!this.solutionStates || stepIndex >= this.solutionStates.length) return;

        const targetState = this.solutionStates[stepIndex];

        // Dispatch custom event to update the canvas editor
        document.dispatchEvent(new CustomEvent<GameState>('setStartingState', {
            detail: targetState
        }));

    }
}

declare global {
    interface Window {
        showStepState: (stepIndex: number, el: HTMLElement) => void;
        makeStartingState: (index: number) => void;
    }
}
