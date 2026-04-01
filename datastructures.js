export class OrderPriorityQueue {
    constructor() {
        this.heap = [];
    }

    push(order) {
        this.heap.push(order);
        this.bubbleUp(this.heap.length - 1);
    }

    pop() {
        if (this.heap.length === 0) return null;
        if (this.heap.length === 1) return this.heap.pop();
        
        const top = this.heap[0];
        this.heap[0] = this.heap.pop();
        this.sinkDown(0);
        return top;
    }

    peek() {
        return this.heap.length > 0 ? this.heap[0] : null;
    }

    isEmpty() {
        return this.heap.length === 0;
    }

    removeById(id) {
        const index = this.heap.findIndex(o => o.id === id);
        if (index === -1) return false;
        
        const last = this.heap.pop();
        if (index !== this.heap.length) { 
            this.heap[index] = last;
            this.sinkDown(index);
            this.bubbleUp(index);
        }
        return true;
    }

    getAll() {
        return [...this.heap].sort((a, b) => {
            if (a.priority === b.priority) return a.timestamp - b.timestamp;
            return b.priority - a.priority;
        });
    }

    bubbleUp(index) {
        const element = this.heap[index];
        while (index > 0) {
            let parentIndex = Math.floor((index - 1) / 2);
            let parent = this.heap[parentIndex];
            
            if (this.compare(parent, element) <= 0) break;
            
            this.heap[index] = parent;
            this.heap[parentIndex] = element;
            index = parentIndex;
        }
    }

    sinkDown(index) {
        const length = this.heap.length;
        const element = this.heap[index];

        while (true) {
            let leftChildIdx = 2 * index + 1;
            let rightChildIdx = 2 * index + 2;
            let leftChild, rightChild;
            let swapIdx = null;

            if (leftChildIdx < length) {
                leftChild = this.heap[leftChildIdx];
                if (this.compare(element, leftChild) > 0) {
                    swapIdx = leftChildIdx;
                }
            }

            if (rightChildIdx < length) {
                rightChild = this.heap[rightChildIdx];
                if ((swapIdx === null && this.compare(element, rightChild) > 0) ||
                    (swapIdx !== null && this.compare(leftChild, rightChild) > 0)) {
                    swapIdx = rightChildIdx;
                }
            }

            if (swapIdx === null) break;
            
            this.heap[index] = this.heap[swapIdx];
            this.heap[swapIdx] = element;
            index = swapIdx;
        }
    }

    compare(a, b) {
        if (a.priority === b.priority) {
            return a.timestamp - b.timestamp;
        }
        return b.priority - a.priority;
    }
}

export class Queue {
    constructor() {
        this.items = [];
    }
    enqueue(element) { this.items.push(element); }
    dequeue() { return this.items.length ? this.items.shift() : null; }
    isEmpty() { return this.items.length === 0; }
    getAll() { return [...this.items]; }
    removeById(id) { this.items = this.items.filter(i => i.id !== id); }
}

export class Stack {
    constructor() {
        this.items = [];
    }
    push(element) { this.items.push(element); }
    pop() { return this.items.pop(); }
    isEmpty() { return this.items.length === 0; }
    getAll() { return [...this.items].reverse(); }
}
