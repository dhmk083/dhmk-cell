import { cell, isCell, Cell, CellOptions } from "./cell";

const CUSTOM_ARRAY_TAG = Symbol.for("CUSTOM_ARRAY_TAG");
const _isArray = Array.isArray;
(Array as any).isArray = (x: any) => (x && x[CUSTOM_ARRAY_TAG]) || _isArray(x);

const excludeNames = ["constructor", "length"];
const mutMethods = [
  "copyWithin",
  "fill",
  "pop",
  "push",
  "reverse",
  "sort",
  "splice",
  "shift",
  "unshift",
];

const arrayEq = (a: any, b: any) => a.length === b.length && a.length === 0;

function CArray(this: any, initial: any, options: any) {
  this.value = initial;
  this._cell = cell(initial, { eq: arrayEq, ...options });
  this.cell = this._cell.cell;
  this.id = {};
  this.update();
}

CArray.prototype[CUSTOM_ARRAY_TAG] = true;

Object.defineProperty(CArray.prototype, "length", {
  get() {
    return this.value.length;
  },
  set(x) {
    this.value.length = x;
    this.update();
  },
});

CArray.prototype.observe = function (onV: any, onD: any) {
  return this._cell.observe(onV, onD);
};

CArray.prototype.update = function () {
  CArray.ensureIndexProps(this.value.length);

  if (this._cell.set(this.value)) {
    this.id = {};
  }
};

CArray.prototype.set = function (newValue: any) {
  this.value = newValue;
  this.update();
};

CArray.prototype.remove = function (fn_value: any) {
  if (typeof fn_value !== "function") {
    const value = fn_value;
    fn_value = (x: any) => x === value;
  }

  this.set(this.value.filter((v: any, i: any, a: any) => !fn_value(v, i, a)));
};

CArray.prototype[Symbol.iterator] = function () {
  return this.value[Symbol.iterator]();
};

CArray.prototype.valueOf = CArray.prototype.toJSON = function () {
  return this.value;
};

CArray.maxIndex = 0;

CArray.ensureIndexProps = function (len: number) {
  for (let i = CArray.maxIndex; i < len; i++) {
    Object.defineProperty(CArray.prototype, i, {
      get() {
        return this.value[i];
      },
      set(x) {
        this.value[i] = x;
        this.update();
      },
    });
  }

  CArray.maxIndex = Math.max(CArray.maxIndex, len);
};

for (const name of Object.getOwnPropertyNames(Array.prototype)) {
  if (excludeNames.includes(name)) continue;

  if (mutMethods.includes(name)) {
    Object.defineProperty(CArray.prototype, name, {
      value(...args: any[]) {
        const res = this.value[name](...args);
        this.update();
        return res;
      },
    });
  } else {
    Object.defineProperty(CArray.prototype, name, {
      value(...args: any[]) {
        return this.value[name](...args);
      },
    });
  }
}

export type CellArray<T> = ReadonlyArray<T> &
  Cell<ReadonlyArray<T>> & {
    readonly id: {};
  };

export type WritableCellArray<T> = Array<T> &
  CellArray<T> & {
    set(newValue: Array<T>): void;
    remove(value: T): void;
    remove(pred: (v: T, i: number, a: ReadonlyArray<T>) => boolean): void;
  };

export function carray<T>(
  initial: Array<T> = [],
  options: CellOptions<ReadonlyArray<T>> = {}
): WritableCellArray<T> {
  const self = () => (self as any)._cell();
  // Function's own length property hides CArray.prototype.length
  // So, either `delete self.length`, or defineProperty length on self instead CArray.prototype,
  // whatever has better performance
  delete (self as any).length;
  Object.setPrototypeOf(self, CArray.prototype);
  (CArray.call as any)(self, initial, options);
  return self as any;
}

export const isCArray = (x: any): x is CellArray<any> =>
  isCell(x) && Array.isArray(x);
