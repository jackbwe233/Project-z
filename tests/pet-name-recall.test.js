import { describe, expect, it } from "vitest";
import { recallPetName } from "../lib/project-z.js";

const user = content => ({ role: "user", content });
const question = user("What’s my dog's name?");

describe("iPhone pet-name recall", () => {
  it("recalls a fact stated before another question in the same turn", () => {
    expect(recallPetName([
      user("My dog’s name is Rocky. What’s a good nickname for him?"),
      { role: "assistant", content: "Try Rocko." },
      question,
    ])).toBe("Rocky");
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
