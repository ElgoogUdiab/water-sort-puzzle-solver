// Graph utilities for solution postprocessing

export interface GraphNode<T = any> {
    id: string;
    data: T;
}

export class DirectedGraph<T = any> {
    private nodes: Map<string, T> = new Map();
    private edges: Map<string, Set<string>> = new Map();
    private reverseEdges: Map<string, Set<string>> = new Map();

    addNode(id: string, data: T): void {
        this.nodes.set(id, data);
        if (!this.edges.has(id)) {
            this.edges.set(id, new Set());
        }
        if (!this.reverseEdges.has(id)) {
            this.reverseEdges.set(id, new Set());
        }
    }

    addEdge(from: string, to: string): void {
        // Ensure nodes exist
        if (!this.edges.has(from)) {
            this.edges.set(from, new Set());
        }
        if (!this.edges.has(to)) {
            this.edges.set(to, new Set());
        }
        if (!this.reverseEdges.has(from)) {
            this.reverseEdges.set(from, new Set());
        }
        if (!this.reverseEdges.has(to)) {
            this.reverseEdges.set(to, new Set());
        }

        this.edges.get(from)!.add(to);
        this.reverseEdges.get(to)!.add(from);
    }

    getNodes(): Map<string, T> {
        return new Map(this.nodes);
    }

    getNodeData(id: string): T | undefined {
        return this.nodes.get(id);
    }

    getSuccessors(nodeId: string): string[] {
        return Array.from(this.edges.get(nodeId) || []);
    }

    getPredecessors(nodeId: string): string[] {
        return Array.from(this.reverseEdges.get(nodeId) || []);
    }

    getInDegree(nodeId: string): number {
        return this.reverseEdges.get(nodeId)?.size || 0;
    }

    getOutDegree(nodeId: string): number {
        return this.edges.get(nodeId)?.size || 0;
    }

    getAllEdges(): [string, string][] {
        const allEdges: [string, string][] = [];
        for (const [from, tos] of this.edges) {
            for (const to of tos) {
                allEdges.push([from, to]);
            }
        }
        return allEdges;
    }

    // Check if there's a path from 'from' to 'to'
    hasPath(from: string, to: string): boolean {
        if (from === to) return true;
        
        const visited = new Set<string>();
        const stack = [from];
        
        while (stack.length > 0) {
            const current = stack.pop()!;
            if (visited.has(current)) continue;
            visited.add(current);
            
            for (const successor of this.getSuccessors(current)) {
                if (successor === to) return true;
                if (!visited.has(successor)) {
                    stack.push(successor);
                }
            }
        }
        
        return false;
    }

    // Transitive reduction - remove edges that can be inferred through other paths
    transitiveReduction(): DirectedGraph<T> {
        const reduced = new DirectedGraph<T>();
        
        // Copy nodes
        for (const [id, data] of this.nodes) {
            reduced.addNode(id, data);
        }
        
        // For each edge, check if it's redundant
        for (const [from, to] of this.getAllEdges()) {
            // Temporarily remove this edge and check if path still exists
            const tempEdges = this.edges.get(from)!;
            tempEdges.delete(to);
            const tempReverseEdges = this.reverseEdges.get(to)!;
            tempReverseEdges.delete(from);
            
            // If no alternative path exists, the edge is necessary
            if (!this.hasPath(from, to)) {
                reduced.addEdge(from, to);
            }
            
            // Restore the edge
            tempEdges.add(to);
            tempReverseEdges.add(from);
        }
        
        return reduced;
    }

    // Topological sort with custom priority function
    topologicalSort<K>(priorityFn?: (nodeId: string) => K): string[] {
        const inDegree = new Map<string, number>();
        const result: string[] = [];
        
        // Initialize in-degrees
        for (const nodeId of this.nodes.keys()) {
            inDegree.set(nodeId, this.getInDegree(nodeId));
        }
        
        // Find nodes with zero in-degree
        const zeroInDegree: string[] = [];
        for (const [nodeId, degree] of inDegree) {
            if (degree === 0) {
                zeroInDegree.push(nodeId);
            }
        }
        
        while (zeroInDegree.length > 0) {
            // Sort by priority if provided, otherwise take first
            if (priorityFn) {
                zeroInDegree.sort((a, b) => {
                    const aPriority = priorityFn(a);
                    const bPriority = priorityFn(b);
                    if (aPriority < bPriority) return 1;  // Higher priority first
                    if (aPriority > bPriority) return -1;
                    return parseInt(a) - parseInt(b);  // Fallback to node id
                });
            }
            
            const current = zeroInDegree.shift()!;
            result.push(current);
            
            // Process successors
            for (const successor of this.getSuccessors(current)) {
                const newDegree = inDegree.get(successor)! - 1;
                inDegree.set(successor, newDegree);
                if (newDegree === 0) {
                    zeroInDegree.push(successor);
                }
            }
        }
        
        // Check for cycles
        if (result.length !== this.nodes.size) {
            throw new Error('Graph contains cycles - topological sort impossible');
        }
        
        return result;
    }
}