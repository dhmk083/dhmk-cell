# @dhmk/cell

> Lightweight glitch-free observable values, computed values and side-effects.

This is an alternative version of atom/cell pattern. The other one is [@dhmk/atom](https://github.com/dhmk083/dhmk-atom).

In this version atoms/cells have `.observe(onValue)` method instead of top-level `observe()` function.

```js
import { cell, map } from "@dhmk/cell";

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
```
