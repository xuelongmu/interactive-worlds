import assert from "node:assert/strict";
import test from "node:test";
import { PausableTimeouts } from "./timers.ts";

class FakeClock {
  time = 0;
  nextId = 1;
  tasks = new Map();
  now = () => this.time;
  set = (callback, delayMs) => {
    const id = this.nextId++;
    this.tasks.set(id, { callback, due: this.time + delayMs });
    return id;
  };
  clear = (id) => { this.tasks.delete(id); };
  advance(ms) {
    const target = this.time + ms;
    while (true) {
      const next = [...this.tasks.entries()]
        .filter(([, task]) => task.due <= target)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      const [id, task] = next;
      this.tasks.delete(id);
      this.time = task.due;
      task.callback();
    }
    this.time = target;
  }
}

test("pause preserves timeout remainder before control is granted", () => {
  const clock = new FakeClock();
  const timers = new PausableTimeouts(clock);
  let granted = 0;
  timers.schedule(() => granted++, 3000);

  clock.advance(1000);
  timers.pause();
  clock.advance(5000);
  assert.equal(granted, 0);

  timers.resume();
  clock.advance(1999);
  assert.equal(granted, 0);
  clock.advance(1);
  assert.equal(granted, 1);
});

test("recurring bark timer rearms after pause and cancelAll prevents another bark", () => {
  const clock = new FakeClock();
  const timers = new PausableTimeouts(clock);
  let barks = 0;
  const schedule = () => timers.schedule(() => { barks++; schedule(); }, 1000);
  schedule();

  clock.advance(1000);
  assert.equal(barks, 1);
  clock.advance(250);
  timers.pause();
  clock.advance(4000);
  assert.equal(barks, 1);

  timers.resume();
  clock.advance(749);
  assert.equal(barks, 1);
  clock.advance(1);
  assert.equal(barks, 2);

  timers.cancelAll();
  clock.advance(5000);
  assert.equal(barks, 2);
});

test("canceling a pausable wait settles its black-hold promise", async () => {
  const clock = new FakeClock();
  const timers = new PausableTimeouts(clock);
  let settled = false;
  const hold = timers.wait(3000).then(() => { settled = true; });
  timers.cancelAll();
  await hold;
  assert.equal(settled, true);
});

test("signature dwell callback retains its remaining wall-clock time", () => {
  const clock = new FakeClock();
  const timers = new PausableTimeouts(clock);
  let dwells = 0;
  timers.schedule(() => dwells++, 10_000);
  clock.advance(7500);
  timers.pause();
  clock.advance(20_000);
  assert.equal(dwells, 0);
  timers.resume();
  clock.advance(2499);
  assert.equal(dwells, 0);
  clock.advance(1);
  assert.equal(dwells, 1);
});
