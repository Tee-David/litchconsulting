import { describe, expect, it } from "vitest";
import { FIRM_PENDING_ERROR, supersedePlan, type PendingInvite } from "./invitation-rules";

const staff: PendingInvite = { id: "s1", role: "staff", clientId: null };
const admin: PendingInvite = { id: "a1", role: "admin", clientId: null };
const clientA: PendingInvite = { id: "cA", role: "client", clientId: "A" };
const clientB: PendingInvite = { id: "cB", role: "client", clientId: "B" };

describe("supersedePlan", () => {
  it("lets a firm invitation replace everything pending", () => {
    expect(supersedePlan({ role: "admin" }, [staff, clientA, clientB])).toEqual({ ok: true, revokeIds: ["s1", "cA", "cB"] });
    expect(supersedePlan({ role: "staff" }, [admin, clientA])).toEqual({ ok: true, revokeIds: ["a1", "cA"] });
  });

  it("refuses a client invitation when a firm invitation is pending", () => {
    expect(supersedePlan({ role: "client", clientId: "A" }, [staff])).toEqual({ ok: false, error: FIRM_PENDING_ERROR });
    expect(supersedePlan({ role: "client", clientId: "A" }, [clientA, admin])).toEqual({ ok: false, error: FIRM_PENDING_ERROR });
  });

  it("replaces only the same company's earlier client invitation", () => {
    expect(supersedePlan({ role: "client", clientId: "A" }, [clientA, clientB])).toEqual({ ok: true, revokeIds: ["cA"] });
  });

  it("never lets one client withdraw another company's invitation", () => {
    expect(supersedePlan({ role: "client", clientId: "B" }, [clientA])).toEqual({ ok: true, revokeIds: [] });
  });

  it("does nothing when nothing is pending", () => {
    expect(supersedePlan({ role: "client", clientId: "A" }, [])).toEqual({ ok: true, revokeIds: [] });
  });
});
