import { Color, GameMode, NodeType } from "./types";

// 简单断言工具：失败时抛异常，同时能帮 TS 收窄类型
function invariant(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export class GameNode {
    constructor(
        public type: NodeType, 
        public pos: [number, number], 
        public color: Color | null = null
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
    public groups: GameNode[][];
    public undoCount: number;
    public mode: GameMode;
    public prev: Game | null;
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
        this.groups = groups.map(g => Game.normalizeGroup(g));
        this.undoCount = undoCount;
        this.mode = mode;
        this.prev = null;
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
                if (n.type === NodeType.KNOWN) {
                    const key = JSON.stringify(n.color);
                    colorCount.set(key, (colorCount.get(key) ?? 0) + 1);
                    if ((colorCount.get(key) ?? 0) > this.capacity) {
                        throw new Error(`Color ${key} appears more than capacity (${this.capacity}).`);
                    }
                }
            }
        }
}
    
    static normalizeGroup(g: GameNode[]): GameNode[] {
        const t = [...g];
        while (t.length && t[t.length - 1].type === NodeType.EMPTY) t.pop();
        return t;
    }
    
    isGroupCompleted(g: GameNode[]): boolean {
        if (g.length !== this.capacity) return false;
        if (g.some(n => n.type !== NodeType.KNOWN)) return false;
        const f = JSON.stringify(g[0].color);
        return g.every(n => JSON.stringify(n.color) === f);
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
                    new Set(src.map(n => JSON.stringify(n.color))).size === 1 && 
                    dst.length === 0) continue;
                    
                if (opItem.type === NodeType.KNOWN && 
                    dst.length > 0 && 
                    dst[dst.length - 1].type === NodeType.KNOWN && 
                    JSON.stringify(dst[dst.length - 1].color) === JSON.stringify(opItem.color) && 
                    new Set(dst.map(n => JSON.stringify(n.color))).size === 1) {
                    tmp.splice(0, tmp.length, new StepOp(s, d));
                    break;
                }
                
                // Empty destination - any block type can move here
                if (dst.length === 0) {
                    tmp.push(new StepOp(s, d));
                    continue;
                }
                
                // Color match - only for KNOWN blocks (UNKNOWN_REVEALED blocks have no color to match)
                if (opItem.type === NodeType.KNOWN && 
                    dst[dst.length - 1].type === NodeType.KNOWN && 
                    JSON.stringify(dst[dst.length - 1].color) === JSON.stringify(opItem.color)) {
                    tmp.push(new StepOp(s, d));
                    continue;
                }
            }
            res.push(...tmp);
        }
        
        if (this.containsUnknown && this.prev && this.undoCount > 0) {
            res.push(new UndoOp());
        }
        return res;
    }
    
    apply(op: StepOp | UndoOp): Game {
        if (op instanceof UndoOp) {
            if (!this.prev) return this;
            const ng = this.prev.clone();
            ng.undoCount = this.undoCount - 1;
            ng.prev = this.prev?.prev ?? null;
            for (const g of ng.groups) {
                for (let i = 0; i < g.length; i++) {
                    const n = g[i];
                    const key = `${n.pos[0]},${n.pos[1]}`;
                    if (this.allRevealed.has(key)) {
                        g[i] = new GameNode(NodeType.UNKNOWN_REVEALED, [...n.pos]);
                    }
                }
            }
            return ng;
        }
        
        if (!(op instanceof StepOp)) return this;
        const ns = this.clone();
        const src = ns.groups[op.src], dst = ns.groups[op.dst];
        const cap = ns.capacity;
        const pickFromTop = (ns.mode !== GameMode.QUEUE);
        const pickIndex = pickFromTop ? src.length - 1 : 0;
        const item = src[pickIndex];
        let revealFlag = null;
        
        if (item.type === NodeType.UNKNOWN_REVEALED) {
            dst.push(src.splice(pickIndex, 1)[0]!);
        } else if (item.type === NodeType.KNOWN) {
            if (ns.mode === GameMode.NO_COMBO) {
                if (dst.length < cap) dst.push(src.splice(pickIndex, 1)[0]!);
            } else if (ns.mode === GameMode.NORMAL) {
                const key = JSON.stringify(item.color);
                while (src.length && 
                       src[src.length - 1].type === NodeType.KNOWN && 
                       JSON.stringify(src[src.length - 1].color) === key && 
                       dst.length < cap) {
                    dst.push(src.pop()!);
                }
            } else if (ns.mode === GameMode.QUEUE) {
                const key = JSON.stringify(item.color);
                while (src.length && 
                       src[0].type === NodeType.KNOWN && 
                       JSON.stringify(src[0].color) === key && 
                       dst.length < cap) {
                    dst.push(src.shift()!);
                }
            }
        }
        
        if (src.length && src[src.length - 1].type === NodeType.UNKNOWN) {
            const top = src[src.length - 1];
            revealFlag = `${top.pos[0]},${top.pos[1]}`;
            src[src.length - 1] = new GameNode(NodeType.UNKNOWN_REVEALED, [...top.pos]);
        }
        
        const next = new Game(
            ns.groups.map(g => g.map(n => n)), 
            ns.undoCount, 
            ns.capacity, 
            ns.mode
        );
        next.prev = this;
        next.allRevealed = new Set(this.allRevealed);
        if (revealFlag) {
            next.allRevealed.add(revealFlag);
            next.revealedNew = true;
        }
        return next;
    }
    
    clone(): Game {
        const gs = this.groups.map(g => 
            g.map(n => new GameNode(n.type, [...n.pos], n.color ? [...n.color] : null))
        );
        const c = new Game(gs, this.undoCount, this.capacity, this.mode);
        c.prev = this.prev;
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
                    } else if (last !== null && JSON.stringify(n.color) !== JSON.stringify(last.color)) {
                        seg++;
                    }
                }
                last = n;
            }
        }
        return seg;
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