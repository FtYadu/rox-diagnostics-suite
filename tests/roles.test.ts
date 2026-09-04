import { describe, expect, it } from "vitest";
import { canPerform, requiredRole, ROLE_ORDER, type GuardedAction } from "@/lib/roles";

const ACTIONS: GuardedAction[] = [
  "read",
  "clear-dtc",
  "io-control",
  "routine",
  "write-did",
  "programming",
];

describe("role guards mirror the database policies", () => {
  it("lets every role read", () => {
    ROLE_ORDER.forEach((role) => expect(canPerform(role, "read")).toBe(true));
  });

  it("blocks technicians from clearing faults, IO control and routines", () => {
    expect(canPerform("technician", "clear-dtc")).toBe(false);
    expect(canPerform("technician", "io-control")).toBe(false);
    expect(canPerform("technician", "routine")).toBe(false);
  });

  it("allows senior technicians those actions but not writes", () => {
    expect(canPerform("senior", "clear-dtc")).toBe(true);
    expect(canPerform("senior", "routine")).toBe(true);
    expect(canPerform("senior", "write-did")).toBe(false);
    expect(canPerform("senior", "programming")).toBe(false);
  });

  it("gives workshop admins every guarded action", () => {
    ACTIONS.forEach((action) => expect(canPerform("admin", action)).toBe(true));
  });

  it("requires senior for clear/IO/routine and admin for configuration writes", () => {
    expect(requiredRole("clear-dtc")).toBe("senior");
    expect(requiredRole("io-control")).toBe("senior");
    expect(requiredRole("routine")).toBe("senior");
    expect(requiredRole("write-did")).toBe("admin");
    expect(requiredRole("programming")).toBe("admin");
  });
});
