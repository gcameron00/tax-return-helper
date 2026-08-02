import { describe, expect, it } from "vitest";
import "../../assets/js/store.js";

const TRH = window.TRH;

describe("TRH.tally", () => {
  it("counts each status and ignores na when computing percent", () => {
    const items = [
      { status: "outstanding" },
      { status: "requested" },
      { status: "received" },
      { status: "received" },
      { status: "na" }
    ];
    const t = TRH.tally(items);
    expect(t.total).toBe(5);
    expect(t.na).toBe(1);
    expect(t.received).toBe(2);
    expect(t.relevant).toBe(4);
    expect(t.percent).toBe(50); // 2/4, na excluded from the denominator
  });

  it("treats an all-na list as 100% (nothing left to do)", () => {
    const t = TRH.tally([{ status: "na" }, { status: "na" }]);
    expect(t.relevant).toBe(0);
    expect(t.percent).toBe(100);
  });

  it("is 0% for an empty list of relevant items with nothing received", () => {
    const t = TRH.tally([{ status: "outstanding" }]);
    expect(t.percent).toBe(0);
  });
});

describe("TRH.sortedYears", () => {
  it("orders years newest first", () => {
    const state = { years: [{ taxYear: 2023 }, { taxYear: 2025 }, { taxYear: 2024 }] };
    expect(TRH.sortedYears(state).map((y) => y.taxYear)).toEqual([2025, 2024, 2023]);
  });

  it("does not mutate the original array", () => {
    const years = [{ taxYear: 2023 }, { taxYear: 2024 }];
    const state = { years };
    TRH.sortedYears(state);
    expect(years[0].taxYear).toBe(2023);
  });
});

describe("TRH.carryOver", () => {
  const source = {
    taxYear: 2024,
    categories: [
      {
        id: "cat_1",
        name: "Bank accounts",
        items: [
          { id: "it_1", name: "Statement", ownerId: "p_anna", status: "received", comment: "in the folder" },
          { id: "it_2", name: "Old N/A doc", ownerId: "p_anna", status: "na", comment: "n/a since 2022" }
        ]
      }
    ]
  };

  it("resets every carried-over item to outstanding", () => {
    const year = TRH.carryOver(source, 2025, {});
    expect(year.taxYear).toBe(2025);
    expect(year.status).toBe("open");
    const item = year.categories[0].items.find((i) => i.name === "Statement");
    expect(item.status).toBe("outstanding");
  });

  it("drops na items and comments when asked (the app's \"New tax year\" dialog defaults both checkboxes on)", () => {
    const year = TRH.carryOver(source, 2025, { skipNa: true, keepComments: false });
    const names = year.categories[0].items.map((i) => i.name);
    expect(names).not.toContain("Old N/A doc");
    const item = year.categories[0].items.find((i) => i.name === "Statement");
    expect(item.comment).toBe("");
  });

  it("keeps na items and comments when asked", () => {
    const year = TRH.carryOver(source, 2025, { skipNa: false, keepComments: true });
    const names = year.categories[0].items.map((i) => i.name);
    expect(names).toContain("Old N/A doc");
    const item = year.categories[0].items.find((i) => i.name === "Statement");
    expect(item.comment).toBe("in the folder");
  });

  it("keeps na items and drops comments with no options given (the function itself defaults to off, not on)", () => {
    const year = TRH.carryOver(source, 2025, {});
    const names = year.categories[0].items.map((i) => i.name);
    expect(names).toContain("Old N/A doc");
  });

  it("deep-copies with fresh ids, leaving the source untouched", () => {
    const year = TRH.carryOver(source, 2025, {});
    expect(year.categories[0].id).not.toBe("cat_1");
    expect(year.categories[0].items[0].id).not.toBe("it_1");
    expect(source.categories[0].items[0].status).toBe("received"); // unchanged
  });

  it("produces an empty category list with no source year", () => {
    const year = TRH.carryOver(null, 2025, {});
    expect(year.categories).toEqual([]);
  });
});
