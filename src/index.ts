export * from "./cell";
export * from "./carray";

import { Cell, WritableCell } from "./cell";
import { CellArray, WritableCellArray } from "./carray";

export type Writable<T> = {
  [P in keyof T]: T[P] extends CellArray<infer V>
    ? WritableCellArray<V>
    : T[P] extends Cell<infer V>
    ? WritableCell<V>
    : T[P];
};
