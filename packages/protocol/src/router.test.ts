import { describe, expect, test } from "bun:test";
import { AgentRouter } from "../src/index.ts";

describe("AgentRouter", () => {
  const agents = [
    {
      id: "1",
      slug: "klaus",
      name: "Klaus",
      description: "Executive assistant",
      capabilities: ["assistant", "coordination", "delegation"],
    },
    {
      id: "2",
      slug: "dev",
      name: "Dev",
      description: "Builds TypeScript and Bun applications",
      capabilities: ["typescript", "bun", "backend", "coding"],
    },
    {
      id: "3",
      slug: "researcher",
      name: "Researcher",
      description: "Research and information gathering",
      capabilities: ["research", "web"],
    },
  ];

  test("prefers explicit agent name", () => {
    const router = new AgentRouter();
    const match = router.route(agents, {
      task: "create a hello world Bun server",
      prefer: "Dev",
      excludeAgentIds: ["1"],
    });
    expect(match?.agent.slug).toBe("dev");
  });

  test("routes by capability overlap without hardcoding", () => {
    const router = new AgentRouter();
    const match = router.route(agents, {
      task: "I need typescript bun backend help",
      excludeAgentIds: ["1"],
    });
    expect(match?.agent.slug).toBe("dev");
  });

  test("routes research tasks to researcher", () => {
    const router = new AgentRouter();
    const match = router.route(agents, {
      task: "research web summarization sources",
      excludeAgentIds: ["1"],
    });
    expect(match?.agent.slug).toBe("researcher");
  });
});
