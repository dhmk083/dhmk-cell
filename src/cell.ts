import { noop, signal, disposable } from "@dhmk/utils";

export interface Cell<T> {
  (): T;
  observe(onValue: (x: T) => void): () => void;
}

type ValueChanged = true;
type ValueNotChanged = false;

export interface WritableCell<T> extends Cell<T> {
  set(value: T): ValueChanged | ValueNotChanged;
}

export type CellOptions<T> = Readonly<
  Partial<{
    eq: (a: T, b: T) => boolean;
    onBecomeObserved: () => void;
    onBecomeUnobserved: () => void;
  }>
>;

const pendingCells = new Set<_Cell<any>>();
let batchCount = 0;

function enqueueCell(cell: _Cell<any>) {
  pendingCells.add(cell);
}

function runPendingCells() {
  if (batchCount > 0) return;

  pendingCells.forEach((c) => {
    pendingCells.delete(c);
    c.actualize();
  });
}

export function batch(fn: Function) {
  try {
    batchCount++;
    fn();
  } finally {
    batchCount--;
    runPendingCells();
  }
}

interface _ICell<T> extends Cell<T> {
  readonly cell: _Cell<T>;
}

export const isCell = (x: any): x is Cell<any> => x && x.cell instanceof _Cell;

export function cell<T>(
  value: T,
  options: CellOptions<T> = {}
): WritableCell<T> {
  const c = new _Cell(value, false, options as any);
  const self = () => c.get();
  self.set = (x) => c.set(x);
  self.observe = (onV) => c.observe(onV);
  self.cell = c;
  self.valueOf = self.toString = self.toJSON = self;
  return self as any;
}

type CellState = number;

// states
const ACTUAL = 0;
const CHECK = 1;
const DIRTY = 2;
const DETACHED = 3;

class _Cell<T> {
  private state: CellState = this.isComputed ? DETACHED : ACTUAL;
  private readonly sig = signal<T>();
  private sigPending = false;
  protected observersCount = 0;
  protected readonly children = new Set<_Cell<any>>();
  private readonly sigCell: any;

  constructor(
    private value: T,
    private readonly isComputed: boolean,
    protected readonly options: any
  ) {
    if (!options.eq) options.eq = Object.is;
    if (!options.onBecomeObserved) options.onBecomeObserved = noop;
    if (!options.onBecomeUnobserved) options.onBecomeUnobserved = noop;

    const self = this;

    this.sigCell = {
      self,
      actualize() {
        if (self.sigPending || self.state !== ACTUAL) {
          self.sig.emit(self.get());
          self.sigPending = false;
        }
      },
    };
  }

  get() {
    this.actualize();
    if (this.value instanceof Error) throw this.value;
    return this.value;
  }

  set(newValue: T) {
    if (this.options.eq(this.value, newValue)) return false;

    this.value = newValue;
    this.sigPending = true;

    if (!this.isComputed && this.observersCount) {
      enqueueCell(this.sigCell);
    }

    this.children.forEach((c) => c.mark(DIRTY));

    if (!this.isComputed) runPendingCells();

    return true;
  }

  mark(state: CellState) {
    if (this.state === DIRTY || this.state === state) return;

    this.state = state;

    if (this.observersCount) {
      enqueueCell(this.sigCell);
    }

    this.children.forEach((c) => c.mark(CHECK));
  }

  actualize() {
    if (this.state !== ACTUAL) {
      this.actualizeParents();

      if (this.state === CHECK) {
        this.state = ACTUAL;
      } else {
        this.state = this.isActive() ? ACTUAL : DETACHED;
        let newValue;
        try {
          newValue = this.evaluate();
        } catch (e) {
          newValue = e;
        }
        this.set(newValue);
      }
    }
  }

  // only for computed
  isActive() {
    return this.observersCount || this.children.size;
  }

  // abstract
  actualizeParents() {}

  // abstract
  evaluate() {}

  observe(onV: (x: T) => void) {
    if (!this.observersCount) {
      this.onBecomeObserved(); // may throw
    }

    this.observersCount++;

    return disposable(this.sig.subscribe(onV), () => {
      if (!--this.observersCount) {
        this.state = this.isComputed ? DETACHED : ACTUAL;
        this.onBecomeUnobserved(); // may throw
      }
    });
  }

  onBecomeObserved() {
    this.options.onBecomeObserved(); // may throw
  }

  onBecomeUnobserved() {
    this.options.onBecomeUnobserved(); // may throw
  }

  addChild(cell: _Cell<any>) {
    this.children.add(cell);
  }

  removeChild(cell: _Cell<any>) {
    this.children.delete(cell);
    if (this.isComputed && !this.isActive()) this.state = DETACHED;
  }
}

class CellMap<T, P> extends _Cell<T> {
  private parents?: Array<_ICell<P>>;

  constructor(
    private ps: any,
    private readonly mapFn: (...args: any[]) => T,
    options: any
  ) {
    super(undefined as any, true, options);
  }

  resolveParents() {
    if (!this.parents) {
      if (typeof this.ps === "function" && !isCell(this.ps))
        this.ps = this.ps();
      this.parents = (isCell(this.ps) ? [this.ps] : this.ps) as any;
    }
  }

  checkActivate() {
    if (this.children.size === 1 || this.observersCount === 0) {
      this.resolveParents();
      for (const p of this.parents!) p.cell.addChild(this);
    }
  }

  checkDeactivate() {
    if (this.children.size === 0 && this.observersCount === 0) {
      for (const p of this.parents!) p.cell.removeChild(this);
    }
  }

  actualizeParents() {
    this.resolveParents();
    for (const p of this.parents!) p.cell.actualize();
  }

  evaluate() {
    return this.mapFn(...this.parents!.map((p) => p()));
  }

  addChild(cell: _Cell<any>) {
    super.addChild(cell);
    this.checkActivate();
  }

  removeChild(cell: _Cell<any>) {
    super.removeChild(cell);
    this.checkDeactivate();
  }

  onBecomeObserved() {
    super.onBecomeObserved();
    this.checkActivate();
  }

  onBecomeUnobserved() {
    super.onBecomeUnobserved();
    this.checkDeactivate();
  }
}

type Tuple<T = unknown> = [T] | T[];

export function map<T, P extends Tuple>(
  ps: () => P,
  mapFn: (
    ...args: { [K in keyof P]: P[K] extends Cell<infer V> ? V : never } &
      unknown[]
  ) => T,
  options?: CellOptions<T>
): Cell<T>;

export function map<T, P>(
  ps: Cell<P>,
  mapFn: (x: P) => T,
  options?: CellOptions<T>
): Cell<T>;

export function map<T, P>(
  ps: () => Cell<P>,
  mapFn: (x: P) => T,
  options?: CellOptions<T>
): Cell<T>;

export function map<T, P extends Tuple>(
  ps: P,
  mapFn: (
    ...args: { [K in keyof P]: P[K] extends Cell<infer V> ? V : never } &
      unknown[]
  ) => T,
  options?: CellOptions<T>
): Cell<T>;

export function map<T, P>(
  ps: any,
  mapFn: (...args: P[]) => T,
  options: CellOptions<T> = {}
): Cell<T> {
  const c = new CellMap<T, P>(ps, mapFn, options as any);
  const self = () => c.get();
  self.observe = (onV) => c.observe(onV);
  self.cell = c;
  self.valueOf = self.toString = self.toJSON = self;
  return self as any;
}

class CellReduce extends _Cell<any> {
  private cArray: any;
  private cItems: any = new Set();

  constructor(
    private ca: any,
    private readonly getItemCell: any,
    private readonly mapFn: any,
    options: any
  ) {
    super(undefined as any, true, options);
  }

  resolveArray() {
    if (!this.cArray) {
      this.cArray =
        typeof this.ca === "function" && !isCell(this.ca) ? this.ca() : this.ca;
    }
  }

  syncItems() {
    // todo: skip diff if `arrayValue` didn't change
    const arrayValue = this.cArray();
    const cItemsNext = new Set<any>(arrayValue.map(this.getItemCell));

    for (const c of this.cItems) {
      if (!cItemsNext.has(c)) {
        c.cell.removeChild(this);
      }
    }

    cItemsNext.forEach((c) => {
      if (!this.cItems.has(c)) {
        c.cell.addChild(this);
      }
    });

    this.cItems = cItemsNext;
  }

  getReady() {
    this.resolveArray();
    this.syncItems();
  }

  checkActivate() {
    if (this.children.size === 1 || this.observersCount === 0) {
      this.getReady();
      this.cArray.cell.addChild(this);
    }
  }

  checkDeactivate() {
    if (this.children.size === 0 && this.observersCount === 0) {
      this.cArray.cell.removeChild(this);
      for (const c of this.cItems) {
        c.cell.removeChild(this);
      }
      this.cItems = new Set();
    }
  }

  actualizeParents() {
    this.getReady();
    for (const c of this.cItems) c.cell.actualize();
  }

  evaluate() {
    return this.mapFn(this.cArray());
  }

  addChild(cell: _Cell<any>) {
    super.addChild(cell);
    this.checkActivate();
  }

  removeChild(cell: _Cell<any>) {
    super.removeChild(cell);
    this.checkDeactivate();
  }

  onBecomeObserved() {
    super.onBecomeObserved();
    this.checkActivate();
  }

  onBecomeUnobserved() {
    super.onBecomeUnobserved();
    this.checkDeactivate();
  }
}

type MaybeLazy<T> = T | (() => T);

export function reduce<T, I, P>(
  ca: MaybeLazy<Cell<ReadonlyArray<I>>>,
  mapFn: (arr: ReadonlyArray<I>) => T,
  getItemCell: (x: I) => Cell<P> = (x: any) => x,
  options: CellOptions<T> = {}
): Cell<T> {
  const c = new CellReduce(ca, getItemCell, mapFn, options as any);
  const self = () => c.get();
  self.observe = (onV) => c.observe(onV);
  self.cell = c;
  self.valueOf = self.toString = self.toJSON = self;
  return self as any;
}
