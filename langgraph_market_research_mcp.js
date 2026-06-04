import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { MarketResearchLangGraphAgent } from "./langgraph_agents.js";

const marketResearchAgent = new MarketResearchLangGraphAgent();

const server = new Server(
  { name: "langgraph-dynamic-routing", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "smart_market_research",
      description: "Runs a LangGraph-routed market research based on the city's population type.",
      inputSchema: {
        type: "object",
        properties: { city: { type: "string" } },
        required: ["city"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "smart_market_research") {
    const { city } = request.params.arguments;
    const result = await marketResearchAgent.researchCity(city);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }

  throw new Error("Tool not found");
});

process.on("uncaughtException", (err) => console.error("Error:", err.message));
process.on("unhandledRejection", (reason) => console.error("Rejection:", reason));
setInterval(() => {}, 1000).unref();

const transport = new StdioServerTransport();
await server.connect(transport);
