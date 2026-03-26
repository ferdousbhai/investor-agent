import { createMcpHandler } from "agents/mcp";
import { createServer } from "./server.js";

const handler = createMcpHandler(createServer());

export default {
  async fetch(request: Request, env: unknown, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname === "/") {
      return new Response("OK");
    }
    return handler(request, env, ctx);
  },
};
