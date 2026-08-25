import { describe, expect, test } from "bun:test";
import { parseOpenApiOperations } from "./openapi-parser.ts";

describe("openapi parser", () => {
  test("parses path operations from OpenAPI 3 doc", () => {
    const ops = parseOpenApiOperations({
      openapi: "3.0.0",
      paths: {
        "/pets": {
          get: {
            operationId: "listPets",
            summary: "List pets",
          },
          post: {
            operationId: "createPet",
            summary: "Create a pet",
            requestBody: { content: { "application/json": {} } },
          },
        },
        "/pets/{id}": {
          get: {
            operationId: "getPet",
            parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
          },
        },
      },
    });
    expect(ops.map((o) => o.operationId).sort()).toEqual([
      "createPet",
      "getPet",
      "listPets",
    ]);
    expect(ops.find((o) => o.operationId === "listPets")?.method).toBe("GET");
  });
});
