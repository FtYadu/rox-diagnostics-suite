import { describe, expect, it } from "vitest";
import { canPerform, requiredRole, roleTooltip } from "@/lib/roles";

describe("role guards", () => {
  it("lets every role read", () => {
    expect(canPerform("technician", "read")).toBe(true);
    expect(canPerform("admin", "read")).toBe(true);
  });

  it("requires senior for vehicle-touching diagnostics", () => {
    for (const action of ["clear-dtc", "io-control", "routine"] as const) {
      expect(requiredRole(action)).toBe("senior");
      expect(canPerform("technician", action)).toBe(false);
      expect(canPerform("senior", action)).toBe(true);
      expect(canPerform("admin", action)).toBe(true);
    }
  });

  it("requires admin for writes and programming", () => {
    for (const action of ["write-did", "programming"] as const) {
      expect(canPerform("senior", action)).toBe(false);
      expect(canPerform("admin", action)).toBe(true);
    }
  });

  it("explains the missing role", () => {
    expect(roleTooltip("write-did")).toContain("Workshop admin");
  });
});
