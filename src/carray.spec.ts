import { carray } from "./carray";
import { isCell } from "./cell";

test("carray", () => {
  const ca = carray<number>();

  expect(isCell(ca)).toEqual(true);
  expect(Array.isArray(ca)).toEqual(true);
  expect(ca()).toEqual([]);

  const id = ca.id;
  ca.set([1, 2, 3]);
  expect(ca.id).not.toBe(id);
  expect(ca()).toEqual([1, 2, 3]);
  expect([...ca]).toEqual([1, 2, 3]);
  expect(ca.length).toEqual(3);

  ca.remove(1);
  expect(ca()).toEqual([2, 3]);
  expect(ca.length).toEqual(2);

  ca.remove((x) => x === 2);
  expect(ca()).toEqual([3]);
  expect(ca.length).toEqual(1);

  expect(Object.getOwnPropertyNames(Object.getPrototypeOf(ca))).toEqual(
    expect.arrayContaining(Object.getOwnPropertyNames(Array.prototype))
  );
});
