import { InvestorAgent } from "./agent.js";

// Export the Durable Object class for wrangler
export { InvestorAgent };

// Worker entry point: route /mcp to the McpAgent
export default InvestorAgent.serve("/mcp", {
  binding: "MCP_OBJECT",
});
