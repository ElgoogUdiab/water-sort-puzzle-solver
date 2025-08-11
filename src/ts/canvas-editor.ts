// Canvas-based game editor

import { NodeType, GameState, GameStateNode, BoardCell, PaletteColor, Color, GameMode } from './types.ts';

export class CanvasEditor {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    paletteEl: HTMLElement;
    W: number;
    H: number;
    S: number;
    board: BoardCell[][];
    palette: PaletteColor[];
    activeColorIndex: number;
    currentGameState: GameState | null;
    isErasing: boolean;
    eraseMode: boolean;

    constructor(canvasId: string, paletteId: string, options: {width?: number, height?: number} = {}) {
        this.canvas = document.getElementById(canvasId) as HTMLCanvasElement;
        this.ctx = this.canvas.getContext('2d')!;
        this.paletteEl = document.getElementById(paletteId)!;
        
        this.W = options.width || 6;
        this.H = options.height || 4;
        this.S = 36; // Fixed cell size
        
        this.board = this.createBoard(this.W, this.H);
        this.palette = [];
        this.activeColorIndex = 0;
        this.currentGameState = null;
        this.isErasing = false;
        this.eraseMode = false;
        
        this.setupEventListeners();
        this.rebuildPalette();
        this.resize();
    }
    
    createBoard(w: number, h: number): BoardCell[][] {
        return Array.from(
            { length: w },
            () => Array.from({ length: h }, () => ({ type: NodeType.EMPTY, color: null }))
        );
    }

    rebuildPalette(colorCount?: number): void {
        const numColorsInput = document.getElementById('numcolors') as HTMLInputElement | null;
        const n = colorCount ?? (numColorsInput ? parseInt(numColorsInput.value) : 3);
        const base = [
            '#D98336', '#B33C38', '#0026C9', '#DC687D', '#01E5A6',
            '#55A3E3', '#707070', '#662F8C', '#68A90F', '#663300',
            '#3A5312', '#FFE643'
        ];
        this.palette = Array.from({length: n}, (_, i) => ({
            color: new Color(base[i % base.length]),
            target: this.H,
            remaining: this.H
        }));
        
        this.recalcPaletteRemaining();
        this.renderPalette();
    }

    recalcPaletteRemaining(): void {
        for (const p of this.palette) { p.remaining = p.target; }
        for (let c = 0; c < this.W; c++) {
            for (let r = 0; r < this.H; r++) {
                const cell = this.board[c][r];
                if (cell.type === NodeType.KNOWN && cell.color) {
                    const idx = this.palette.findIndex(p => p.color.toString() === cell.color!.toString());
                    if (idx >= 0) this.palette[idx].remaining = Math.max(0, this.palette[idx].remaining - 1);
                }
            }
        }
    }

    renderPalette(): void {
        this.paletteEl.innerHTML = '';
        this.palette.forEach((p, idx) => {
            const sw = document.createElement('div');
            sw.className = 'swatch' + (idx === this.activeColorIndex ? ' active' : '');
            sw.style.background = p.color.toString();
            
            const badge = document.createElement('span');
            badge.className = 'badge';
            badge.textContent = p.remaining.toString();
            sw.appendChild(badge);
            
            sw.onclick = () => { 
                this.activeColorIndex = idx; 
                this.renderPalette(); 
            };
            this.paletteEl.appendChild(sw);
        });
    }

    resize(width?: number, height?: number): void {
        if (width !== undefined) this.W = Math.max(2, Math.min(24, width));
        if (height !== undefined) this.H = Math.max(2, Math.min(12, height));
        
        this.canvas.width = this.W * this.S;
        this.canvas.height = this.H * this.S;
        
        if (this.board.length !== this.W || this.board[0].length !== this.H) {
            this.board = this.createBoard(this.W, this.H);
        }
        
        this.palette.forEach(p => { p.target = this.H; });
        this.recalcPaletteRemaining();
        this.renderPalette();
        this.draw();
    }

    draw(): void {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let c = 0; c < this.W; c++) {
            for (let r = 0; r < this.H; r++) {
                const y = (this.H - 1 - r) * this.S, x = c * this.S, cell = this.board[c][r];

                if (cell.type === NodeType.EMPTY || (!cell.color && cell.type !== NodeType.UNKNOWN)) {
                    this.ctx.fillStyle = '#0b1220';
                } else if (cell.type === NodeType.UNKNOWN) {
                    this.ctx.fillStyle = '#000';
                } else {
                    this.ctx.fillStyle = cell.color!.toString();
                }
                this.ctx.fillRect(x, y, this.S, this.S);
                this.ctx.strokeStyle = 'rgba(255,255,255,.08)';
                this.ctx.strokeRect(x + 0.5, y + 0.5, this.S - 1, this.S - 1);
                
                // Draw question mark for unknown blocks
                if (cell.type === NodeType.UNKNOWN) {
                    this.ctx.fillStyle = '#fff';
                    this.ctx.font = 'bold 18px Arial';
                    this.ctx.textAlign = 'center';
                    this.ctx.textBaseline = 'middle';
                    this.ctx.fillText('?', x + this.S/2, y + this.S/2);
                }
            }
        }
    }

    setupEventListeners(): void {
        this.canvas.addEventListener('contextmenu', (e: Event) => e.preventDefault());
        this.canvas.style.touchAction = 'none';

        document.getElementById('eraseMode')?.addEventListener('change', (e: Event) => {
            this.eraseMode = (e.target as HTMLInputElement).checked;
        });

        this.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
            if (e.button === 2 || (e.button === 0 && this.eraseMode)) {
                const rect = this.canvas.getBoundingClientRect();
                const cx = Math.floor((e.clientX - rect.left) / this.S);
                const cy = this.H - 1 - Math.floor((e.clientY - rect.top) / this.S);
                this.isErasing = true;
                this.eraseCell(cx, cy);
            } else if (e.button === 0) {
                this.handleCanvasPointer(e);
            }
        });
        this.canvas.addEventListener('pointermove', (e: PointerEvent) => {
            if (this.isErasing) {
                const rect = this.canvas.getBoundingClientRect();
                const cx = Math.floor((e.clientX - rect.left) / this.S);
                const cy = this.H - 1 - Math.floor((e.clientY - rect.top) / this.S);
                this.eraseCell(cx, cy);
            }
        });
        this.canvas.addEventListener('pointerup', () => { this.isErasing = false; });
        this.canvas.addEventListener('pointerleave', () => { this.isErasing = false; });
        this.canvas.addEventListener('pointercancel', () => { this.isErasing = false; });
    }

    private eraseCell(cx: number, cy: number): void {
        if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return;
        const cell = this.board[cx][cy];
        if (cell.type !== NodeType.EMPTY) {
            const idx = this.palette.findIndex(p => p.color.toString() === cell.color?.toString());
            if (idx >= 0) {
                this.palette[idx].remaining = Math.min(this.palette[idx].target, this.palette[idx].remaining + 1);
            }
            this.board[cx][cy] = { type: NodeType.EMPTY, color: null };
            this.renderPalette();
            this.draw();
            this.syncToGameState();
        }
    }

    handleCanvasPointer(e: PointerEvent): void {
        if (e.button !== 0) return;
        const rect = this.canvas.getBoundingClientRect();
        const cx = Math.floor((e.clientX - rect.left) / this.S);
        const cy = this.H - 1 - Math.floor((e.clientY - rect.top) / this.S);
        if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return;

        const cell = this.board[cx][cy];
        const p = this.palette[this.activeColorIndex];
        if (!p || p.remaining <= 0) return;

        // If replacing an existing known color, refund its palette first
        if (cell.type !== NodeType.EMPTY && cell.type !== NodeType.UNKNOWN) {
            const idx = this.palette.findIndex(pp => pp.color.toString() === cell.color?.toString());
            if (idx >= 0) this.palette[idx].remaining = Math.min(this.palette[idx].target, this.palette[idx].remaining + 1);
        }

        this.board[cx][cy] = { type: NodeType.KNOWN, color: new Color(p.color.toString()) };
        p.remaining -= 1;
        this.renderPalette();
        this.draw();
        this.syncToGameState();
    }

    reset(): void {
        this.board = this.createBoard(this.W, this.H);
        this.recalcPaletteRemaining();
        this.renderPalette();
        this.draw();
        this.syncToGameState();
    }

    syncToGameState(): void {
        // Update currentGameState from canvas
        const groups: GameStateNode[][] = [];
        for (let c = 0; c < this.W; c++) {
            const group: GameStateNode[] = [];
            for (let r = 0; r < this.H; r++) {
                const cell = this.board[c][r];
                if (cell.type === NodeType.EMPTY) {
                    // Check if there are known blocks above (at any position above this one)
                    const hasKnownAbove = this.board[c].slice(r + 1).some(cellAbove => cellAbove.type === NodeType.KNOWN);
                    if (hasKnownAbove) {
                        // Blank block with known blocks above = unknown block
                        group.push({
                          nodeType: NodeType.UNKNOWN,
                          color: null,
                          originalPos: [c, r]
                        });
                    }
                    // Skip empty blocks with no known blocks above
                } else {
                    group.push({
                        nodeType: cell.type,
                        color: cell.color ? new Color(cell.color.toString()) : null,
                        originalPos: [c, r]
                    });
                }
            }
            groups.push(group);
        }
        
        this.currentGameState = { groups, capacity: this.H };
        
        // Trigger custom event for game state update
        this.canvas.dispatchEvent(new CustomEvent<GameState>('gamestatechange', {
            detail: this.currentGameState
        }));
    }

    getGameState(): GameState | null {
        return this.currentGameState;
    }

    // Convert to solver format
    toSolverFormat(): GameState {
        const groups: GameStateNode[][] = [];
        for (let c = 0; c < this.board.length; c++) {
            const g: GameStateNode[] = [];
            for (let r = 0; r < this.board[0].length; r++) {
                const cell = this.board[c][r];
                if (cell.type === NodeType.EMPTY) {
                    const hasKnownAbove = this.board[c]
                        .slice(r + 1)
                        .some(cellAbove => cellAbove.type === NodeType.KNOWN);
                    if (hasKnownAbove) {
                        g.push({ nodeType: NodeType.UNKNOWN, originalPos: [c, r], color: null });
                    } else {
                        g.push({ nodeType: NodeType.EMPTY, originalPos: [c, r], color: null });
                    }
                } else if (cell.type === NodeType.UNKNOWN || cell.type === NodeType.UNKNOWN_REVEALED) {
                    g.push({ nodeType: cell.type, originalPos: [c, r], color: null });
                } else {
                    const color = cell.color ? new Color(cell.color.toString()) : new Color('#000000');
                    g.push({ nodeType: NodeType.KNOWN, originalPos: [c, r], color: color });
                }
            }
            groups.push(g);
        }
        return { groups, capacity: this.H };
    }

    exportToJSON(mode: GameMode): string {
        const data = {
            cols: this.W,
            rows: this.H,
            mode,
            groups: this.toSolverFormat().groups
        };
        return JSON.stringify(data);
    }
}