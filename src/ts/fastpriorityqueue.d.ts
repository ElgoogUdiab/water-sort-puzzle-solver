declare module 'fastpriorityqueue' {
    export default class FastPriorityQueue<T> {
        constructor(comparator?: (a: T, b: T) => boolean);
        add(item: T): boolean;
        poll(): T | undefined;
        peek(): T | undefined;
        isEmpty(): boolean;
    }
}

