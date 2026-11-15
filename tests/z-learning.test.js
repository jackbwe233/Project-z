import { describe, expect, it } from "vitest";
import {
  emptyLearningStore, normalizeLearningStore, learnFromUserMessage,
  setLearningEnabled, setAutoSave, approveLearning, forgetLearning, editLearning, selectRelevantMemories,
  buildPersonalMemoryContext, exportLearningBundle, importLearningBundle,
  isSensitiveCandidate, readLearningStore, writeLearningStore,
  MAX_SAVED,
} from "../lib/z-learning.js";

describe("Project Z learning vault", () => {
  it("defaults to consent off with no stored suggestions", () => {
    const store = emptyLearningStore();
    expect(store.learnEnabled).toBe(false);
    const result = learnFromUserMessage(store, "I prefer short answers.");
    expect(result.change).toBe("disabled");
    expect(result.store.saved).toEqual([]);
    expect(result.store.pending).toEqual([]);
  });

  it("remembers only explicitly requested facts without enabling suggestions", () => {
    const result = learnFromUserMessage(emptyLearningStore(), "Remember that my favorite subject is math.");
    expect(result.change).toBe("saved");
    expect(result.store.saved).toHaveLength(1);
    expect(result.store.saved[0].text).toBe("my favorite subject is math.");
  });

  it("requires approval before learning from ordinary messages", () => {
    const opted = setLearningEnabled(emptyLearningStore(), true);
    const result = learnFromUserMessage(opted, "I prefer examples before definitions.");
    expect(result.change).toBe("suggested");
    expect(result.store.saved).toHaveLength(0);
    expect(result.store.pending).toHaveLength(1);
    const approved = approveLearning(result.store, result.store.pending[0].id);
    expect(approved.saved).toHaveLength(1);
    expect(approved.pending).toHaveLength(0);
  });

  it("supports dismissing suggestions and forgetting approved memories", () => {
    const suggested = learnFromUserMessage(setLearningEnabled(emptyLearningStore(), true), "My goal is to get better at coding.").store;
    const id = suggested.pending[0].id;
    expect(forgetLearning(suggested, id).pending).toHaveLength(0);
    const approved = approveLearning(suggested, id);
    expect(forgetLearning(approved, id).saved).toHaveLength(0);
  });

  it("lets users edit approved facts but refuses sensitive edits", () => {
    const saved = learnFromUserMessage(emptyLearningStore(), "Remember that I like jazz.").store;
    const id = saved.saved[0].id;
    const changed = editLearning(saved, id, "I enjoy instrumental jazz.");
    expect(changed.saved[0].text).toBe("I enjoy instrumental jazz.");
    expect(changed.saved[0].id).not.toBe(id);
    expect(editLearning(saved, id, "my password is abc123")).toEqual(saved);
  });

  it("deduplicates repeated facts instead of growing forever", () => {
    let vault = emptyLearningStore();
    vault = learnFromUserMessage(vault, "Remember that I play guitar.").store;
    const result = learnFromUserMessage(vault, "Remember that I play guitar.");
    expect(result.change).toBe("duplicate");
    expect(result.store.saved).toHaveLength(1);
  });

  it("avoids extracting sensitive details as personal memory", () => {
    const vault = setLearningEnabled(emptyLearningStore(), true);
    const examples = [
      "Remember that my password is hunter2.",
      "My goal is to learn my friend's email example@example.com.",
      "Remember that my address is 42 Oak Street.",
      "I prefer to use this API key: abc123.",
    ];
    for (const message of examples) {
      expect(learnFromUserMessage(vault, message).store.saved).toHaveLength(0);
      expect(learnFromUserMessage(vault, message).store.pending).toHaveLength(0);
    }
    expect(isSensitiveCandidate("i live at 15 Main St")).toBe(true);
  });

  it("retrieves relevant memories and excludes unapproved suggestions", () => {
    let vault = emptyLearningStore();
    vault = learnFromUserMessage(vault, "Remember that I play guitar.").store;
    vault = learnFromUserMessage(vault, "Remember that I study Italian.").store;
    vault = learnFromUserMessage(vault, "Remember that I am learning statistics.").store;
    vault = learnFromUserMessage(setLearningEnabled(vault, true), "My goal is to build a clothing business.").store;
    const selected = selectRelevantMemories(vault, "How can I practice guitar?", { maxItems: 2 });
    expect(selected[0]).toContain("guitar");
    expect(selected.join(" ")).not.toContain("clothing business");
    const context = buildPersonalMemoryContext("", vault, "guitar");
    expect(context).not.toContain("clothing business");
  });

  it("round-trips backup contents and preserves opt-in state", () => {
    let vault = learnFromUserMessage(emptyLearningStore(), "Remember that I enjoy documentaries.").store;
    vault = setLearningEnabled(vault, true);
    const backup = exportLearningBundle("Manual notes", vault);
    const imported = importLearningBundle(backup);
    expect(imported.manualNotes).toBe("Manual notes");
    expect(imported.learning).toEqual(normalizeLearningStore(vault));
    expect(imported.learning.learnEnabled).toBe(true);
  });


  it("can automatically remember safe interests only after a separate opt-in", () => {
    const opted = setAutoSave(setLearningEnabled(emptyLearningStore(), true), true);
    const saved = learnFromUserMessage(opted, "I play hockey every weekend.");
    expect(saved.change).toBe("saved");
    expect(saved.store.saved[0].text).toBe("I play hockey every weekend.");
    expect(saved.store.pending).toHaveLength(0);
    const blocked = learnFromUserMessage(opted, "I play hockey and my password is 123456.");
    expect(blocked.change).toBe("none");
    expect(blocked.store.saved).toHaveLength(0);
    const off = setLearningEnabled(opted, false);
    expect(off.autoSave).toBe(false);
    expect(learnFromUserMessage(off, "I play guitar.").change).toBe("disabled");
  });

  it("learns preferences and hobbies in everyday language with approval", () => {
    const opted = setLearningEnabled(emptyLearningStore(), true);
    for (const message of ["I'm into jazz music.", "My favorite sport is soccer.", "I study Italian every day."]) {
      expect(learnFromUserMessage(opted, message).change).toBe("suggested");
    }
  });

  it("backs up communication style together with memories", () => {
    const style = { learnEnabled:true, tone:"casual", length:"short", explanation:"simple" };
    const bundle = exportLearningBundle("I enjoy coding.", emptyLearningStore(), style);
    const restored = importLearningBundle(bundle);
    expect(restored.communicationStyle.tone).toBe("casual");
    expect(restored.communicationStyle.length).toBe("short");
  });

  it("rejects unrelated JSON as a memory backup", () => {
    expect(() => importLearningBundle('{"saved":["bad"]}')).toThrow("Not a supported");
  });

  it("keeps storage on-device through the injected storage interface", () => {
    const data = new Map();
    const storage = {
      getItem: key => data.get(key) || null,
      setItem: (key, value) => data.set(key, value),
    };
    const vault = learnFromUserMessage(emptyLearningStore(), "Remember that I like jazz.").store;
    expect(writeLearningStore(storage, vault)).toBe(true);
    expect(readLearningStore(storage).saved).toHaveLength(1);
  });

  it("limits memory entries without deleting older approved entries", () => {
    let vault = emptyLearningStore();
    for (let i = 0; i < MAX_SAVED; i++) {
      vault = learnFromUserMessage(vault, "Remember that I like subject number " + i + ".").store;
    }
    expect(vault.saved).toHaveLength(MAX_SAVED);
    const full = learnFromUserMessage(vault, "Remember that I like another completely new subject.");
    expect(full.change).toBe("full");
    expect(full.store.saved).toHaveLength(MAX_SAVED);
  });
});
