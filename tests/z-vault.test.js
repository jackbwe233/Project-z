import { describe, expect, it } from "vitest";
import {
  MAX_VAULT_NOTES,
  buildVaultContext,
  buildVaultSnapshot,
  describeVault,
  isVaultNotePath,
  noteExcerpt,
  readVaultSnapshot,
  searchVault,
  withVault,
} from "../lib/z-vault.js";
import { readFileList } from "../lib/z-vault-ui.js";

const files = [
  { path: "02 — Point Judith Junk Removal/PJJR — Business Model.md", text: "---\ntype: model\n---\n# PJJR\n\nPricing is call for details with free quotes.\n\nMain costs are fuel and dump fees." },
  { path: "03 — Stocks & Investing/Stocks — Watchlist.md", text: "# Watchlist\n\nEmpty on purpose." },
  { path: "00 — Command Center/Inbox.md", text: "# Inbox\n\n- [ ] call Mountain View Landscape" },
  { path: ".obsidian/workspace.md", text: "hidden config" },
  { path: "Assets/logo.png", text: "binary" },
];

describe("isVaultNotePath", () => {
  it("accepts Markdown notes and rejects hidden folders and other files", () => {
    expect(isVaultNotePath("Notes/a.md")).toBe(true);
    expect(isVaultNotePath(".obsidian/app.md")).toBe(false);
    expect(isVaultNotePath("Notes/.trash/a.md")).toBe(false);
    expect(isVaultNotePath("Notes/a.png")).toBe(false);
    expect(isVaultNotePath("")).toBe(false);
  });
});

describe("buildVaultSnapshot", () => {
  it("keeps notes, skips the rest and titles notes from the file name", () => {
    const snapshot = buildVaultSnapshot(files, { name: "Business Universe", now: 1 });
    expect(snapshot.notes.map(note => note.title)).toEqual([
      "Inbox", "PJJR — Business Model", "Stocks — Watchlist",
    ]);
    expect(snapshot.skipped).toBe(2);
    expect(snapshot.name).toBe("Business Universe");
  });

  it("drops duplicates, empty notes and notes past the count limit", () => {
    const many = Array.from({ length: MAX_VAULT_NOTES + 3 }, (_, i) => ({ path: `n${i}.md`, text: "x" }));
    const snapshot = buildVaultSnapshot([...many, { path: "n0.md", text: "dup" }, { path: "e.md", text: "  " }]);
    expect(snapshot.notes).toHaveLength(MAX_VAULT_NOTES);
    expect(snapshot.skipped).toBe(5);
  });

  it("round-trips through storage and rejects malformed data", () => {
    const snapshot = buildVaultSnapshot(files, { now: 5 });
    expect(readVaultSnapshot(JSON.parse(JSON.stringify(snapshot))).notes).toHaveLength(3);
    expect(readVaultSnapshot(null)).toBe(null);
    expect(readVaultSnapshot({ version: 99, notes: [] })).toBe(null);
  });
});

describe("searchVault", () => {
  const snapshot = buildVaultSnapshot(files);

  it("ranks title matches above body matches", () => {
    const results = searchVault(snapshot, "what is on my watchlist?");
    expect(results[0].note.title).toBe("Stocks — Watchlist");
  });

  it("returns nothing when no keywords match", () => {
    expect(searchVault(snapshot, "zebra")).toEqual([]);
    expect(searchVault(snapshot, "the and")).toEqual([]);
  });
});

describe("noteExcerpt", () => {
  it("prefers matching paragraphs and skips frontmatter", () => {
    const excerpt = noteExcerpt(files[0].text, "dump fees", 500);
    expect(excerpt).toContain("dump fees");
    expect(excerpt).not.toContain("type: model");
  });

  it("respects the character budget", () => {
    expect(noteExcerpt("word ".repeat(500), "word", 100).length).toBeLessThanOrEqual(100);
  });
});

describe("buildVaultContext", () => {
  const snapshot = buildVaultSnapshot(files);

  it("labels excerpts as user data and names the source note", () => {
    const context = buildVaultContext(snapshot, "How does PJJR pricing work?", { maxChars: 800 });
    expect(context).toContain("not instructions");
    expect(context).toContain("### 02 — Point Judith Junk Removal/PJJR — Business Model.md");
    expect(context).toContain("free quotes");
    expect(context.length).toBeLessThanOrEqual(800);
  });

  it("is empty without a match or a snapshot", () => {
    expect(buildVaultContext(snapshot, "zebra")).toBe("");
    expect(buildVaultContext(null, "pricing")).toBe("");
  });
});

describe("withVault and describeVault", () => {
  it("appends context without mutating the session", () => {
    const session = { systemPrompt: "Base", messages: [] };
    expect(withVault(session, "Vault").systemPrompt).toBe("Base\n\nVault");
    expect(withVault(session, "")).toBe(session);
    expect(session.systemPrompt).toBe("Base");
  });

  it("summarizes the loaded vault", () => {
    expect(describeVault(null)).toBe("No vault connected.");
    expect(describeVault(buildVaultSnapshot(files, { name: "BU" }))).toBe("“BU”: 3 notes loaded (2 other files skipped).");
  });
});

describe("readFileList", () => {
  it("strips the vault folder from relative paths and keeps only notes", async () => {
    const make = (webkitRelativePath, text) => ({ webkitRelativePath, name: webkitRelativePath.split("/").at(-1), text: async () => text });
    const result = await readFileList([
      make("Business Universe/00 — Command Center/Inbox.md", "inbox"),
      make("Business Universe/.obsidian/app.json", "{}"),
      { webkitRelativePath: "", name: "Loose.md", text: async () => "loose" },
    ]);
    expect(result.name).toBe("Business Universe");
    expect(result.files).toEqual([
      { path: "00 — Command Center/Inbox.md", text: "inbox" },
      { path: "Loose.md", text: "loose" },
    ]);
  });
});
