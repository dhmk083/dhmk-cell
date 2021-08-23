import { cell, isCell, map, reduce, batch } from "./cell";

describe("cell", () => {
  test("basic", () => {
    const c = cell(1);

    expect(isCell(c)).toEqual(true);
    expect(c()).toEqual(1);

    c.set(2);

    expect(c()).toEqual(2);

    const spyValue = jest.fn();
    const d = c.observe(spyValue);
    c.set(3);
    d();
    c.set(4);

    expect(spyValue).toBeCalledTimes(1);
    expect(spyValue).nthCalledWith(1, 3);
  });

  test("oldValue eq newValue == don`t invalidate children", () => {
    const a = cell(1);
    const b = map(a, (x) => x % 2);
    const spy = jest.fn();
    const c = map(b, spy);
    c.observe(() => {});

    c(); // b = 1

    expect(spy).toBeCalledTimes(1);

    a.set(3); // b = 1
    c();

    expect(spy).toBeCalledTimes(1);

    a.set(5); // b = 0
    c();
    a.set(6); // b = 0
    c();

    expect(spy).toBeCalledTimes(2);
  });

  test("observe deep cell", () => {
    const a = cell(1);
    const b = map(a, (x) => x % 2);
    const c = map(b, (x) => x + 1);
    const spy = jest.fn();

    a.set(2);
    c.observe(spy);
    a.set(3);

    expect(spy).toBeCalledTimes(1);
  });
});

describe("map", () => {
  test("basic", () => {
    const a = cell(1);
    const b = cell(2);
    const c = map([a, b], (x, y) => x + y);

    expect(isCell(c)).toEqual(true);
    expect(c()).toEqual(3);

    a.set(2);

    expect(c()).toEqual(4);

    const spyValue = jest.fn();
    const d = c.observe(spyValue);
    b.set(3);
    d();
    b.set(4);

    expect(spyValue).toBeCalledTimes(1);
    expect(spyValue).nthCalledWith(1, 5);
  });

  test("diamond", () => {
    const a = cell(1);
    const b = map(a, (x) => x + 1);
    const c = map(a, (x) => x * 10);
    const d = map([b, c], (x, y) => x + y);

    expect(d()).toEqual(12);

    const spy = jest.fn();
    d.observe(spy);

    a.set(2);
    expect(d()).toEqual(23);
    expect(spy).toBeCalledTimes(1);
    expect(spy).nthCalledWith(1, 23);
  });

  test("deps arg", () => {
    const a = cell(1);
    const b = cell(2);

    const c = map(a, (x) => x + 1);
    expect(c()).toEqual(2);

    const d = map([a, b], (x, y) => x + y);
    expect(d()).toEqual(3);

    const e = map(
      () => a,
      (x) => x + 1
    );
    expect(e()).toEqual(2);

    const f = map(
      () => [a, b],
      (x, y) => x + y
    );
    expect(f()).toEqual(3);
  });
});

test("reduce", () => {
  const x1 = cell(1);
  const x2 = cell(1);
  const x3 = cell(1);
  const x4 = cell(10);
  const a = cell([x1, x2, x3]);

  const b = reduce(a, (arr) => arr.reduce((acc, x) => acc + x(), 0));

  expect(b()).toEqual(3);

  const spy = jest.fn();
  b.observe(spy);
  a.set([x2, x1, x4]);

  expect(spy).toBeCalledTimes(1);
  expect(spy).nthCalledWith(1, 12);
  expect(b()).toEqual(12);
});

test("batch", () => {
  const a = cell(1);
  const b = cell(2);
  const c = map([a, b], (x, y) => x + y);

  const spy = jest.fn();
  c.observe(spy);

  batch(() => {
    a.set(2);
    b.set(3);
  });

  expect(spy).toBeCalledTimes(1);
  expect(spy).nthCalledWith(1, 5);
});
