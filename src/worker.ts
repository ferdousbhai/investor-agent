import { createMcpHandler } from "agents/mcp";
import { createServer } from "./server.js";

/** No bindings are configured in wrangler.jsonc; `env` is forwarded to the MCP handler untouched. */
interface WorkerEnv {}

export default {
  async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "GET" && new URL(request.url).pathname === "/") {
      return new Response("OK");
    }
    // Fresh McpServer per request — a connected server cannot be reused.
    return createMcpHandler(createServer())(request, env, ctx);
  },
};
