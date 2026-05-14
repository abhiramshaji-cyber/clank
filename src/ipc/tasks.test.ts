import { describe, expect, it } from "vitest";
import { parseTasks } from "./tasks";

describe("parseTasks", () => {
  it("returns an empty list for content with no task lines", () => {
    expect(parseTasks("# Heading\n\nSome paragraph.\n")).toEqual([]);
  });

  it("parses unchecked, checked, and capital-X tasks", () => {
    const md = ["- [ ] one", "- [x] two", "- [X] three"].join("\n");
    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({ checked: false, text: "one", indent: "" });
    expect(tasks[1]).toMatchObject({ checked: true, text: "two" });
    expect(tasks[2]).toMatchObject({ checked: true, text: "three" });
  });

  it("preserves indent and records the source line number", () => {
    const md = ["# Notes", "", "  - [ ] indented", "    - [x] deeper"].join(
      "\n",
    );
    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(2);
    expect(tasks[0].lineNumber).toBe(2);
    expect(tasks[0].indent).toBe("  ");
    expect(tasks[1].lineNumber).toBe(3);
    expect(tasks[1].indent).toBe("    ");
  });

  it("strips a trailing CR before matching", () => {
    const md = ["- [ ] crlf line\r", "regular\r"].join("\n");
    const tasks = parseTasks(md);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].rawLine).toBe("- [ ] crlf line");
  });

  it("ignores bullets that are not task lines", () => {
    const md = ["- not a task", "  - [Y] bad mark", "- [  ] double space"].join(
      "\n",
    );
    expect(parseTasks(md)).toHaveLength(0);
  });
});
