import { test, expect, describe } from "bun:test";
import { assertNoGraphqlErrors } from "./graphql";

describe("assertNoGraphqlErrors", () => {
  test("does nothing when there are no errors", () => {
    expect(() => assertNoGraphqlErrors({}, "ctx")).not.toThrow();
    expect(() => assertNoGraphqlErrors({ errors: [] }, "ctx")).not.toThrow();
  });

  test("throws with the context prefix and joined messages", () => {
    expect(() =>
      assertNoGraphqlErrors(
        { errors: [{ message: "boom" }, { message: "bang" }] },
        "Slashwork auth failed",
      ),
    ).toThrow("Slashwork auth failed: boom, bang");
  });

  test("throws for a single error", () => {
    expect(() =>
      assertNoGraphqlErrors({ errors: [{ message: "nope" }] }, "GraphQL error"),
    ).toThrow("GraphQL error: nope");
  });
});
