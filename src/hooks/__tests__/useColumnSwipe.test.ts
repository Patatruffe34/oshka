import { describe, it, expect } from "vitest";
import { pickStop, nearestStop } from "../useColumnSwipe";

const stops = [0, 340, 680, 1020];
const width = 375;

describe("pickStop", () => {
  it("stays on the column for a short, slow pull", () => {
    expect(pickStop({ stops, from: 1, dx: -60, speed: -0.1, width })).toBe(1);
    expect(pickStop({ stops, from: 1, dx: 60, speed: 0.1, width })).toBe(1);
  });

  it("goes one column past a third of the screen", () => {
    expect(pickStop({ stops, from: 1, dx: -130, speed: 0, width })).toBe(2);
    expect(pickStop({ stops, from: 1, dx: 130, speed: 0, width })).toBe(0);
  });

  it("never goes more than one column, however far", () => {
    expect(pickStop({ stops, from: 1, dx: -900, speed: -3, width })).toBe(2);
  });

  it("takes a short flick as a request", () => {
    expect(pickStop({ stops, from: 1, dx: -50, speed: -0.8, width })).toBe(2);
  });

  it("ignores a flick that is a mere twitch, or that goes back", () => {
    expect(pickStop({ stops, from: 1, dx: -20, speed: -1.2, width })).toBe(1);
    expect(pickStop({ stops, from: 1, dx: -60, speed: 0.8, width })).toBe(1);
  });

  it("stops at both ends", () => {
    expect(pickStop({ stops, from: 0, dx: 200, speed: 1, width })).toBe(0);
    expect(pickStop({ stops, from: 3, dx: -200, speed: -1, width })).toBe(3);
  });
});

describe("nearestStop", () => {
  it("finds the closest column", () => {
    expect(nearestStop(stops, 0)).toBe(0);
    expect(nearestStop(stops, 400)).toBe(1);
    expect(nearestStop(stops, 900)).toBe(3);
  });
});
