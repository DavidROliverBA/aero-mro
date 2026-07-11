import { describe, expect, test } from "bun:test";
import {
  cardGate,
  checkCertifyingPrivilege,
  chronicDefects,
  coverageGaps,
  crsBlockers,
  daysUntil,
  llpStatus,
  localIso,
  localIsoOffset,
  melClock,
  mpDue,
  shelfLife,
  toolCheck,
} from "./compliance";
import type {
  Aircraft,
  Defect,
  Engineer,
  LlpComponent,
  MpCompliance,
  MpTask,
  RosterEntry,
  TaskCard,
  Tool,
} from "./types";

// ---------------------------------------------------------------------------
// Fixture factories — minimal, override only what a test cares about.
// ---------------------------------------------------------------------------

function makeAircraft(overrides: Partial<Aircraft> = {}): Aircraft {
  return {
    id: "ac1",
    registration: "G-TEST",
    type_designator: "A320",
    msn: "0001",
    operator: "Test Air",
    total_hours: 1000,
    total_cycles: 500,
    status: "in_service",
    base: "LGW",
    next_check_type: null,
    next_check_due: null,
    ...overrides,
  };
}

function makeEngineer(overrides: Partial<Engineer> = {}): Engineer {
  return {
    id: "e1",
    full_name: "Jane Smith",
    staff_no: "S1",
    part66_licence_no: "L1",
    licence_categories: ["B1.1"],
    type_ratings: ["A320"],
    licence_expiry: localIsoOffset(365),
    company_auth: true,
    ...overrides,
  };
}

function makeDefect(overrides: Partial<Defect> = {}): Defect {
  return {
    id: "d1",
    aircraft_id: "ac1",
    raised_at: new Date().toISOString(),
    raised_by: "eng",
    description: "desc",
    ata_chapter: "21",
    mel_reference: null,
    mel_cat: null,
    severity: "minor",
    status: "open",
    deferred_until: null,
    closed_at: null,
    ai_triaged: false,
    ...overrides,
  };
}

function makeTaskCard(overrides: Partial<TaskCard> = {}): TaskCard {
  return {
    id: "tc1",
    work_order_id: "wo1",
    sequence: 1,
    description: "desc",
    ata_chapter: "21",
    status: "open",
    assigned_engineer: null,
    est_hours: 1,
    requires_inspection: false,
    completed_by: null,
    completed_at: null,
    inspected_by: null,
    inspected_at: null,
    ...overrides,
  };
}

function makeTool(overrides: Partial<Tool> = {}): Tool {
  return {
    id: "t1",
    tool_no: "TQ-1",
    description: "Torque wrench",
    location: "Store",
    last_calibrated: null,
    calibration_due: null,
    condition: "serviceable",
    assigned_to: null,
    ...overrides,
  };
}

function makeMpTask(overrides: Partial<MpTask> = {}): MpTask {
  return {
    id: "mp1",
    task_code: "TC-1",
    applies_to_type: "A320",
    title: "Task",
    ata_chapter: "21",
    interval_fh: null,
    interval_fc: null,
    interval_days: null,
    source: "MPD",
    ...overrides,
  };
}

function makeMpCompliance(overrides: Partial<MpCompliance> = {}): MpCompliance {
  return {
    id: "mpc1",
    mp_task_id: "mp1",
    aircraft_id: "ac1",
    last_done_date: null,
    last_done_fh: null,
    last_done_fc: null,
    work_order_id: null,
    ...overrides,
  };
}

function makeLlp(overrides: Partial<LlpComponent> = {}): LlpComponent {
  return {
    id: "llp1",
    aircraft_id: "ac1",
    part_number: "PN-1",
    serial_number: "SN-1",
    description: "Disc",
    position: null,
    limit_fc: null,
    limit_fh: null,
    accumulated_fc: 0,
    accumulated_fh: 0,
    installed_on: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// daysUntil / localIsoOffset
// ---------------------------------------------------------------------------

describe("daysUntil", () => {
  test("null input → null", () => {
    expect(daysUntil(null)).toBeNull();
  });

  test("today → 0", () => {
    expect(daysUntil(localIsoOffset(0))).toBe(0);
  });

  test("+5 days → 5", () => {
    expect(daysUntil(localIsoOffset(5))).toBe(5);
  });

  test("-3 days → -3", () => {
    expect(daysUntil(localIsoOffset(-3))).toBe(-3);
  });
});

describe("localIsoOffset", () => {
  test("returns YYYY-MM-DD format", () => {
    expect(localIsoOffset(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(localIsoOffset(10)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test("offset 0 equals localIso(new Date())", () => {
    expect(localIsoOffset(0)).toBe(localIso(new Date()));
  });
});

// ---------------------------------------------------------------------------
// melClock
// ---------------------------------------------------------------------------

describe("melClock", () => {
  test("non-deferred defect → null", () => {
    const defect = makeDefect({ status: "open", mel_cat: "B" });
    expect(melClock(defect)).toBeNull();
  });

  test("deferred Cat B, deferred_until today+2 → warn, not breached", () => {
    const defect = makeDefect({
      status: "deferred",
      mel_cat: "B",
      deferred_until: localIsoOffset(2),
    });
    const result = melClock(defect);
    expect(result).not.toBeNull();
    expect(result!.breached).toBe(false);
    expect(result!.tone).toBe("warn");
  });

  test("deferred_until yesterday → breached, danger", () => {
    const defect = makeDefect({
      status: "deferred",
      mel_cat: "B",
      deferred_until: localIsoOffset(-1),
    });
    const result = melClock(defect);
    expect(result).not.toBeNull();
    expect(result!.breached).toBe(true);
    expect(result!.tone).toBe("danger");
  });
});

// ---------------------------------------------------------------------------
// checkCertifyingPrivilege
// ---------------------------------------------------------------------------

describe("checkCertifyingPrivilege", () => {
  test("valid B1.1 engineer with rating → valid", () => {
    const eng = makeEngineer();
    const result = checkCertifyingPrivilege(eng, "A320");
    expect(result.valid).toBe(true);
    expect(result.reasons).toEqual([]);
  });

  test("expired licence → invalid with 'Part-66 licence expired' reason", () => {
    const eng = makeEngineer({ licence_expiry: localIsoOffset(-10) });
    const result = checkCertifyingPrivilege(eng, "A320");
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("Part-66 licence expired");
  });

  test("missing type rating → invalid", () => {
    const eng = makeEngineer({ type_ratings: ["B737"] });
    const result = checkCertifyingPrivilege(eng, "A320");
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("No type rating for A320");
  });

  test("company_auth false → invalid", () => {
    const eng = makeEngineer({ company_auth: false });
    const result = checkCertifyingPrivilege(eng, "A320");
    expect(result.valid).toBe(false);
    expect(result.reasons).toContain("No Part-145 company authorisation");
  });
});

// ---------------------------------------------------------------------------
// mpDue
// ---------------------------------------------------------------------------

describe("mpDue", () => {
  test("FH-limited task, remaining < 0 → danger", () => {
    const task = makeMpTask({ interval_fh: 100 });
    const c = makeMpCompliance({ last_done_fh: 0 });
    const ac = makeAircraft({ total_hours: 150 }); // remainingFh = 0 + 100 - 150 = -50
    const result = mpDue(task, c, ac);
    expect(result.remainingFh).toBe(-50);
    expect(result.tone).toBe("danger");
  });

  test("FH-limited task, remaining/interval <= 0.1 → warn", () => {
    const task = makeMpTask({ interval_fh: 100 });
    const c = makeMpCompliance({ last_done_fh: 0 });
    const ac = makeAircraft({ total_hours: 90 }); // remainingFh = 0 + 100 - 90 = 10, norm 0.1
    const result = mpDue(task, c, ac);
    expect(result.remainingFh).toBe(10);
    expect(result.tone).toBe("warn");
  });

  test("FH-limited task, comfortable margin → ok", () => {
    const task = makeMpTask({ interval_fh: 100 });
    const c = makeMpCompliance({ last_done_fh: 0 });
    const ac = makeAircraft({ total_hours: 50 }); // remainingFh = 50, norm 0.5
    const result = mpDue(task, c, ac);
    expect(result.tone).toBe("ok");
  });

  test("whichever-first: FH comfortable but calendar overdue → days limiting, danger", () => {
    const task = makeMpTask({ interval_fh: 100, interval_days: 30 });
    const c = makeMpCompliance({
      last_done_fh: 0,
      last_done_date: localIsoOffset(-40), // due 10 days ago
    });
    const ac = makeAircraft({ total_hours: 50 }); // remainingFh = 50, comfortable
    const result = mpDue(task, c, ac);
    expect(result.tone).toBe("danger");
    expect(result.limitingLabel).toContain("days");
    expect(result.limitingLabel).not.toContain("FH");
  });

  test("interval_days = 0 with last_done_date in the past is NOT 'no limit data'", () => {
    const task = makeMpTask({ interval_days: 0 });
    const c = makeMpCompliance({ last_done_date: localIsoOffset(-5) });
    const ac = makeAircraft();
    const result = mpDue(task, c, ac);
    expect(result.limitingLabel).not.toBe("no limit data");
    expect(result.tone).toBe("danger");
  });
});

// ---------------------------------------------------------------------------
// llpStatus
// ---------------------------------------------------------------------------

describe("llpStatus", () => {
  test("97% consumed → danger", () => {
    const llp = makeLlp({ limit_fc: 100, accumulated_fc: 97 });
    expect(llpStatus(llp).tone).toBe("danger");
  });

  test("88% consumed → warn", () => {
    const llp = makeLlp({ limit_fc: 100, accumulated_fc: 88 });
    expect(llpStatus(llp).tone).toBe("warn");
  });

  test("50% consumed → ok", () => {
    const llp = makeLlp({ limit_fc: 100, accumulated_fc: 50 });
    expect(llpStatus(llp).tone).toBe("ok");
  });

  test("remainingLabel mentions FC when FC-limited", () => {
    const llp = makeLlp({ limit_fc: 100, accumulated_fc: 50 });
    expect(llpStatus(llp).remainingLabel).toContain("FC");
  });
});

// ---------------------------------------------------------------------------
// toolCheck
// ---------------------------------------------------------------------------

describe("toolCheck", () => {
  test("quarantine → danger, not usable", () => {
    const tool = makeTool({ condition: "quarantine" });
    const result = toolCheck(tool);
    expect(result.tone).toBe("danger");
    expect(result.usable).toBe(false);
  });

  test("calibration_due yesterday → danger, not usable", () => {
    const tool = makeTool({ calibration_due: localIsoOffset(-1) });
    const result = toolCheck(tool);
    expect(result.tone).toBe("danger");
    expect(result.usable).toBe(false);
  });

  test("calibration due in 10 days → warn, usable", () => {
    const tool = makeTool({ calibration_due: localIsoOffset(10) });
    const result = toolCheck(tool);
    expect(result.tone).toBe("warn");
    expect(result.usable).toBe(true);
  });

  test("calibration due in 200 days → ok", () => {
    const tool = makeTool({ calibration_due: localIsoOffset(200) });
    const result = toolCheck(tool);
    expect(result.tone).toBe("ok");
    expect(result.usable).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// cardGate / crsBlockers
// ---------------------------------------------------------------------------

describe("cardGate", () => {
  test("unsigned → not done", () => {
    const card = makeTaskCard();
    expect(cardGate(card).done).toBe(false);
  });

  test("completed + requires_inspection + no inspector → reason mentions 145.A.48", () => {
    const card = makeTaskCard({
      completed_by: "e1",
      completed_at: new Date().toISOString(),
      requires_inspection: true,
    });
    const result = cardGate(card);
    expect(result.done).toBe(false);
    expect(result.reason).toContain("145.A.48");
  });

  test("inspector === completer → not done", () => {
    const card = makeTaskCard({
      completed_by: "e1",
      completed_at: new Date().toISOString(),
      requires_inspection: true,
      inspected_by: "e1",
      inspected_at: new Date().toISOString(),
    });
    expect(cardGate(card).done).toBe(false);
  });

  test("inspector different → done", () => {
    const card = makeTaskCard({
      completed_by: "e1",
      completed_at: new Date().toISOString(),
      requires_inspection: true,
      inspected_by: "e2",
      inspected_at: new Date().toISOString(),
    });
    const result = cardGate(card);
    expect(result.done).toBe(true);
    expect(result.reason).toBeNull();
  });
});

describe("crsBlockers", () => {
  test("empty card list → non-empty blockers", () => {
    expect(crsBlockers([])).not.toEqual([]);
  });

  test("all cards done → []", () => {
    const cards = [
      makeTaskCard({ id: "tc1", completed_by: "e1", completed_at: new Date().toISOString() }),
      makeTaskCard({
        id: "tc2",
        completed_by: "e1",
        completed_at: new Date().toISOString(),
        requires_inspection: true,
        inspected_by: "e2",
        inspected_at: new Date().toISOString(),
      }),
    ];
    expect(crsBlockers(cards)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// chronicDefects
// ---------------------------------------------------------------------------

describe("chronicDefects", () => {
  test("3 defects, same aircraft+ATA within 90 days → one group", () => {
    const defects = [
      makeDefect({ id: "d1", raised_at: new Date(Date.now() - 10 * 864e5).toISOString() }),
      makeDefect({ id: "d2", raised_at: new Date(Date.now() - 20 * 864e5).toISOString() }),
      makeDefect({ id: "d3", raised_at: new Date(Date.now() - 30 * 864e5).toISOString() }),
    ];
    const groups = chronicDefects(defects);
    expect(groups.length).toBe(1);
    expect(groups[0].defects.length).toBe(3);
  });

  test("2 defects → no group", () => {
    const defects = [
      makeDefect({ id: "d1", raised_at: new Date(Date.now() - 10 * 864e5).toISOString() }),
      makeDefect({ id: "d2", raised_at: new Date(Date.now() - 20 * 864e5).toISOString() }),
    ];
    expect(chronicDefects(defects)).toEqual([]);
  });

  test("3 defects but one raised 120 days ago → no group", () => {
    const defects = [
      makeDefect({ id: "d1", raised_at: new Date(Date.now() - 10 * 864e5).toISOString() }),
      makeDefect({ id: "d2", raised_at: new Date(Date.now() - 20 * 864e5).toISOString() }),
      makeDefect({ id: "d3", raised_at: new Date(Date.now() - 120 * 864e5).toISOString() }),
    ];
    expect(chronicDefects(defects)).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// shelfLife
// ---------------------------------------------------------------------------

describe("shelfLife", () => {
  test("null → null", () => {
    expect(shelfLife(null)).toBeNull();
  });

  test("expired → danger", () => {
    expect(shelfLife(localIsoOffset(-1))!.tone).toBe("danger");
  });

  test("10 days → warn", () => {
    expect(shelfLife(localIsoOffset(10))!.tone).toBe("warn");
  });

  test("200 days → ok", () => {
    expect(shelfLife(localIsoOffset(200))!.tone).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// coverageGaps
// ---------------------------------------------------------------------------

describe("coverageGaps", () => {
  const aircraft = makeAircraft({ type_designator: "A320", base: "LGW" });

  test("engineer on duty and valid → no gap for today", () => {
    const engineers = [makeEngineer()];
    const roster: RosterEntry[] = [
      { id: "r1", engineer_id: "e1", duty_date: localIsoOffset(0), shift: "early", base: "LGW" },
    ];
    const gaps = coverageGaps(roster, engineers, [aircraft], 1);
    expect(gaps).toEqual([]);
  });

  test("engineer rostered 'off' today → gap 'no engineers rostered'", () => {
    const engineers = [makeEngineer()];
    const roster: RosterEntry[] = [
      { id: "r1", engineer_id: "e1", duty_date: localIsoOffset(0), shift: "off", base: "LGW" },
    ];
    const gaps = coverageGaps(roster, engineers, [aircraft], 1);
    expect(gaps.length).toBe(1);
    expect(gaps[0].reason).toBe("no engineers rostered");
  });

  test("engineer on duty but licence expired → gap reason includes 'cannot certify'", () => {
    const engineers = [makeEngineer({ licence_expiry: localIsoOffset(-10) })];
    const roster: RosterEntry[] = [
      { id: "r1", engineer_id: "e1", duty_date: localIsoOffset(0), shift: "early", base: "LGW" },
    ];
    const gaps = coverageGaps(roster, engineers, [aircraft], 1);
    expect(gaps.length).toBe(1);
    expect(gaps[0].reason).toContain("cannot certify");
  });
});
