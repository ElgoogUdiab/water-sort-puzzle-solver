import { Color, GameMode, NodeType } from "./types.js";

// 简单断言工具：失败时抛异常，同时能帮 TS 收窄类型
function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export class GameNode {
    public readonly type: NodeType;
    public readonly pos: readonly [number, number];
    public readonly color: Color | null;

    constructor(
        type: NodeType,
        pos: readonly [number, number],
        color: Color | null = null
    ) {
        // === 把 Python 的 __post_init__ 断言搬过来 ===
        if (
            type === NodeType.UNKNOWN ||
            type === NodeType.UNKNOWN_REVEALED ||
            type === NodeType.EMPTY
        ) {
            invariant(
                color === null,
                `color must be null when type=${type}`
            );
        }
        this.type = type;
        this.pos = Object.freeze([...pos]) as readonly [number, number];
        this.color = color;
        Object.freeze(this);
    }
}

export class StepOp {
    constructor(
        public src: number, 
        public dst: number
    ) {}
    
    toString(): string {
        return `${this.src + 1} -> ${this.dst + 1}`;
    }
}

export class UndoOp {
    toString(): string {
        return 'Undo';
    }
}

export class Game {
    public capacity: number;
    public readonly groups: ReadonlyArray<readonly GameNode[]>;
    public undoCount: number;
    public mode: GameMode;
    public undoTargetState: Game | null;
    public allRevealed: Set<string>;
    public revealedNew: boolean;
    public containsUnknown: boolean;

    constructor(groups: GameNode[][], undoCount = 5, capacity: number | null = null, mode = GameMode.NORMAL) {
        if (capacity == null) {
            const set = new Set(groups.map(g => g.length));
            if (set.size !== 1) throw new Error('All groups should have same length!');
            capacity = [...set][0];
        }
        this.capacity = capacity;

        // Normalize incoming groups (trim trailing EMPTY)
        let normalized = groups.map(g => Game.normalizeGroup(g));

        // Auto-complete: When exactly one color is incomplete and unknowns fill the gap,
        // replace all UNKNOWN/UNKNOWN_REVEALED with that color and force NORMAL mode.
        try {
            // Count KNOWN colors and UNKNOWN nodes
            const colorCount = new Map<string, { count: number; sample: Color }>();
            let unknownTotal = 0;
            for (const g of normalized) {
                for (const n of g) {
                    if (n.type === NodeType.KNOWN && n.color) {
                        const key = n.color.toString();
                        const entry = colorCount.get(key);
                        if (entry) entry.count += 1; else colorCount.set(key, { count: 1, sample: n.color });
                    } else if (n.type === NodeType.UNKNOWN || n.type === NodeType.UNKNOWN_REVEALED) {
                        unknownTotal += 1;
                    }
                }
            }
            const incomplete: { key: string; missing: number; sample: Color }[] = [];
            for (const [key, { count, sample }] of colorCount.entries()) {
                if (count > 0 && count < this.capacity) {
                    incomplete.push({ key, missing: this.capacity - count, sample });
                }
            }
            if (incomplete.length === 1 && unknownTotal === incomplete[0].missing && unknownTotal > 0) {
                const target = incomplete[0].sample; // Color instance
                normalized = normalized.map(g => g.map(n =>
                    (n.type === NodeType.UNKNOWN || n.type === NodeType.UNKNOWN_REVEALED)
                        ? new GameNode(NodeType.KNOWN, n.pos, new Color(target.toString()))
                        : n
                ));
                // Preserve original game mode during auto-completion
            }
        } catch {
            // Fail open: skip auto-completion on any unexpected error
        }

        this.groups = Object.freeze(
            normalized.map(g => Object.freeze(g))
        );
        this.undoCount = undoCount;
        this.mode = mode;
        this.undoTargetState = null;
        this.allRevealed = new Set();
        this.revealedNew = false;
        this.containsUnknown = this.groups.some(g => 
            g.some(n => n.type === NodeType.UNKNOWN || n.type === NodeType.UNKNOWN_REVEALED)
        );
    
        // === Strict validations aligned with Python implementation ===
        // 3a) After trimming trailing EMPTY, there should be no EMPTY left in any group
        for (const [gi, g] of this.groups.entries()) {
            for (let i = 0; i < g.length; i++) {
                if (g[i].type === NodeType.EMPTY) {
                    throw new Error(`Group ${gi}: EMPTY node found in the middle (only trailing EMPTYs are allowed).`);
                }
            }
        }
        // 3b) Each group's length must be <= capacity
        for (const [gi, g] of this.groups.entries()) {
            if (g.length > this.capacity) {
                throw new Error(`Group ${gi}: length ${g.length} exceeds capacity ${this.capacity}.`);
            }
        }
        // 3c) Total non-empty nodes across groups should be a multiple of capacity
        const totalNonEmpty = this.groups.reduce((acc, g) => acc + g.length, 0);
        if (totalNonEmpty % this.capacity !== 0) {
            throw new Error(`Total filled nodes (${totalNonEmpty}) must be a multiple of capacity (${this.capacity}).`);
        }
        // 3d) For KNOWN nodes, each color count should not exceed capacity
        const colorCount = new Map<string, number>();
        for (const g of this.groups) {
            for (const n of g) {
                if (n.type === NodeType.KNOWN && n.color) {
                    const key = n.color.toString();
                    colorCount.set(key, (colorCount.get(key) ?? 0) + 1);
                    if ((colorCount.get(key) ?? 0) > this.capacity) {
                        throw new Error(`Color ${key} appears more than capacity (${this.capacity}).`);
                    }
                }
            }
        }
}
    
    static normalizeGroup(g: readonly GameNode[]): GameNode[] {
        const t = [...g];
        while (t.length && t[t.length - 1].type === NodeType.EMPTY) t.pop();
        return t;
    }
    
    isGroupCompleted(g: readonly GameNode[]): boolean {
        if (g.length !== this.capacity) return false;
        if (g.some(n => n.type !== NodeType.KNOWN || !n.color)) return false;
        const f = g[0].color!.toString();
        return g.every(n => n.color?.toString() === f);
    }
    
    ops(): (StepOp | UndoOp)[] {
        const res: (StepOp | UndoOp)[] = [];
        const avail: number[] = [];
        let seenEmpty = false;
        
        for (let i = 0; i < this.groups.length; i++) {
            const g = this.groups[i];
            if (g.length < this.capacity) {
                if (g.length === 0) {
                    if (seenEmpty) continue;
                    seenEmpty = true;
                }
                avail.push(i);
            }
        }
        
        for (let s = 0; s < this.groups.length; s++) {
            const src = this.groups[s];
            if (!src.length) continue;
            if (this.isGroupCompleted(src)) continue;
            
            const opItem = (this.mode === GameMode.QUEUE) ? src[0] : src[src.length - 1];
            const tmp: StepOp[] = [];
            
            for (const d of avail) {
                if (d === s) continue;
                const dst = this.groups[d];
                
                if (opItem.type === NodeType.KNOWN &&
                    new Set(src.map(n => n.color ? n.color.toString() : null)).size === 1 &&
                    dst.length === 0) continue;
                    
                if (opItem.type === NodeType.KNOWN &&
                    dst.length > 0 &&
                    dst[dst.length - 1].type === NodeType.KNOWN &&
                    dst[dst.length - 1].color?.toString() === opItem.color?.toString() &&
                    new Set(dst.map(n => n.color ? n.color.toString() : null)).size === 1) {
                    tmp.push(new StepOp(s, d));
                    continue;
                }
                
                // Empty destination - any block type can move here
                if (dst.length === 0) {
                    tmp.push(new StepOp(s, d));
                    continue;
                }
                
                // Color match - only for KNOWN blocks (UNKNOWN_REVEALED blocks have no color to match)
                if (opItem.type === NodeType.KNOWN &&
                    dst[dst.length - 1].type === NodeType.KNOWN &&
                    dst[dst.length - 1].color?.toString() === opItem.color?.toString()) {
                    tmp.push(new StepOp(s, d));
                    continue;
                }
            }
            res.push(...tmp);
        }
        
        if (this.containsUnknown && this.undoTargetState && this.undoCount > 0) {
            res.push(new UndoOp());
        }
        return res;
    }
    
    apply(op: StepOp | UndoOp): Game {
        if (op instanceof UndoOp) {
            if (!this.undoTargetState) return this;
            const base = this.undoTargetState;
            const newGroups = base.groups.map(g =>
                g.map(n => {
                    const key = `${n.pos[0]},${n.pos[1]}`;
                    if (this.allRevealed.has(key)) {
                        return new GameNode(NodeType.UNKNOWN_REVEALED, n.pos);
                    }
                    return n;
                })
            ) as GameNode[][];
            const ng = new Game(newGroups, this.undoCount - 1, base.capacity, base.mode);
            ng.undoTargetState = base.undoTargetState ?? null;
            ng.allRevealed = new Set(this.allRevealed);
            return ng;
        }

        if (!(op instanceof StepOp)) return this;
        const groups = this.groups.map(g => [...g]);
        const src = groups[op.src]!;
        const dst = groups[op.dst]!;
        const cap = this.capacity;
        const pickFromTop = (this.mode !== GameMode.QUEUE);
        const pickIndex = pickFromTop ? src.length - 1 : 0;
        const item = src[pickIndex];
        let revealFlag: string | null = null;

        if (item.type === NodeType.UNKNOWN_REVEALED) {
            dst.push(src.splice(pickIndex, 1)[0]!);
        } else if (item.type === NodeType.KNOWN) {
            if (this.mode === GameMode.NO_COMBO) {
                if (dst.length < cap) dst.push(src.splice(pickIndex, 1)[0]!);
            } else if (this.mode === GameMode.NORMAL) {
                const key = item.color?.toString();
                while (
                    src.length &&
                    src[src.length - 1].type === NodeType.KNOWN &&
                    src[src.length - 1].color?.toString() === key &&
                    dst.length < cap
                ) {
                    dst.push(src.pop()!);
                }
            } else if (this.mode === GameMode.QUEUE) {
                const key = item.color?.toString();
                while (
                    src.length &&
                    src[0].type === NodeType.KNOWN &&
                    src[0].color?.toString() === key &&
                    dst.length < cap
                ) {
                    dst.push(src.shift()!);
                }
            }
        }

        if (src.length && src[src.length - 1].type === NodeType.UNKNOWN) {
            const top = src[src.length - 1];
            revealFlag = `${top.pos[0]},${top.pos[1]}`;
            src[src.length - 1] = new GameNode(NodeType.UNKNOWN_REVEALED, top.pos);
        }

        const next = new Game(groups, this.undoCount, this.capacity, this.mode);
        next.undoTargetState = this;
        next.allRevealed = new Set(this.allRevealed);
        if (revealFlag) {
            next.allRevealed.add(revealFlag);
            next.revealedNew = true;
        }
        return next;
    }
    
    clone(): Game {
        const gs = this.groups.map(g =>
            g.map(n => new GameNode(n.type, n.pos, n.color ? new Color(n.color.toString()) : null))
        ) as GameNode[][];
        const c = new Game(gs, this.undoCount, this.capacity, this.mode);
        c.undoTargetState = this.undoTargetState;
        c.allRevealed = new Set(this.allRevealed);
        c.revealedNew = this.revealedNew;
        return c;
    }
    
    get winning(): boolean {
        return this.groups.every(g => !g.length || this.isGroupCompleted(g));
    }
    
    get unknownRevealedCount(): number {
        return this.groups.reduce((a, g) => 
            a + g.filter(n => n.type === NodeType.UNKNOWN_REVEALED).length, 0
        );
    }
    
    get segments(): number {
        let seg = 0;
        for (const g of this.groups) {
            let last: GameNode | null = null;
            for (let i = 0; i < g.length; i++) {
                const n = g[i];
                if (i === 0) {
                    seg++;
                } else {
                    if (last === null || n.type !== last.type) {
                        seg++;
                    } else if (n.type === NodeType.UNKNOWN || n.type === NodeType.UNKNOWN_REVEALED) {
                        seg++;
                    } else if (last !== null && n.color?.toString() !== last.color?.toString()) {
                        seg++;
                    }
                }
                last = n;
            }
        }
        return seg;
    }

    get revealableInOne(): number {
        // Number of available ops that reveal a new unknown immediately
        // We simulate each legal op once and count how many would set
        // `revealedNew` on the resulting state. `Undo` ops don't contribute.
        let count = 0;
        try {
            for (const op of this.ops()) {
                // Skip undo as it doesn't create a new reveal
                if (op instanceof UndoOp) {
                    continue;
                }
                const newState = this.apply(op);
                if (newState.revealedNew) {
                    count++;
                }
            }
        } catch {
            // Fail open: return 0 on any unexpected error
        }
        return count;
    }

    get unknownCount(): number {
        // Count total UNKNOWN nodes (not UNKNOWN_REVEALED)
        let count = 0;
        for (const g of this.groups) {
            for (const n of g) {
                if (n.type === NodeType.UNKNOWN) {
                    count++;
                }
            }
        }
        return count;
    }

    get shouldTerminateUnknownSearch(): boolean {
        // Terminal condition for unknown search - stop when we have enough info to complete
        // Returns true when:
        // 1. Only one UNKNOWN node remains, OR
        // 2. We've revealed most unknowns (heuristic for having enough info)
        
        if (!this.containsUnknown) {
            return false;
        }
        
        // Count total unrevealed unknowns
        const totalUnknown = this.unknownCount;
        if (totalUnknown <= 1) {
            return true;
        }
        
        // Count how many unknowns we've revealed vs total
        const unknownRevealed = this.unknownRevealedCount;
        const totalNodesWithUnknowns = totalUnknown + unknownRevealed;
        
        // If we've revealed most unknowns, we probably have enough info
        if (totalNodesWithUnknowns > 0 && unknownRevealed >= (totalNodesWithUnknowns - 1)) {
            return true;
        }
        
        return false;
    }
    
    get completedGroupCount(): number {
        return this.groups.filter(g => this.isGroupCompleted(g)).length;
    }
    
    get heuristic(): [number, number] {
        return [this.segments, this.completedGroupCount];
    }
    
    get isMeaningfulState(): boolean {
        if (!this.revealedNew) return false;
        for (const group of this.groups) {
            if (group.some(node => node.type === NodeType.UNKNOWN_REVEALED)) {
                return true;
            }
        }
        return false;
    }
    
    key(): string {
        return JSON.stringify({
            g: this.groups.map(g => g.map(n => ({ t: n.type, c: n.color }))),
            u: this.undoCount,
            m: this.mode
        });
    }
}
