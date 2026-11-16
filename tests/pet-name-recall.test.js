import { describe, expect, it } from "vitest";
import { recallPetName } from "../lib/project-z.js";

const user = content => ({ role: "user", content });
const question = user("What’s my dog's name?");

describe("Pet-name recall", () => {
  it("recalls a fact stated before another question in the same turn", () => {
    expect(recallPetName([
      user("My dog’s name is Rocky. What’s a good nickname for him?"),
      { role: "assistant", content: "Try Rocko." },
      question,
    ])).toBe("Rocky");
  });

  it.each([
    "whats my dogs name",
    "What is the name of my dog?",
    "What is my dog called?",
    "Do you remember my dog's name?",
  ])("handles common wording: %s", (wording) => {
    expect(recallPetName([user("My dog is named Rocky."), user(wording)])).toBe("Rocky");
  });

  it.each(["What’s my dogs name", "Whatâ€™s my dogs name"])("recalls the uploaded conversation wording: %s", wording => {
    expect(recallPetName([
      user("My dogs name is rocky whatâ€™s a good nickname for him"),
      { role: "assistant", content: "I don't have access to real-time data." },
      user(wording),
    ])).toBe("rocky");
  });

  it("uses the most recent matching user statement", () => {
    expect(recallPetName([
      user("My dog's name is Rocky."),
      user("My dog's name is now Blue."),
      user("My cat's name is Pepper."),
      question,
    ])).toBe("Blue");
  });

  it("leaves unanswered and unrelated questions to the model", () => {
    expect(recallPetName([{ role: "assistant", content: "My dog's name is Rocky." }, question])).toBe("");
    expect(recallPetName([user("My dog's name is Rocky."), user("My dog's name is not Rocky."), question])).toBe("");
    expect(recallPetName([user("My dog's name is Rocky."), user("What is my dog's favorite toy?")])).toBe("");
  });
});
