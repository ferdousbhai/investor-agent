import { InvestorAgent } from "./agent.js";

// Export the Durable Object class for wrangler
export { InvestorAgent };

const mcpHandler = InvestorAgent.serve("/mcp", {
  binding: "MCP_OBJECT",
  corsOptions: { origin: "*" },
});

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname === "/") {
      return new Response("OK");
    }
    return mcpHandler.fetch(request, env, ctx);
  },
} satisfies ExportedHandler;
