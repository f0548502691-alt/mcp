import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { NurseryLangGraphAgent } from "./langgraph_agents.js";

const nurseryAgent = new NurseryLangGraphAgent();

const server = new Server(
  { name: "langgraph-nursery-agent-server", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "find_best_nursery",
      description: "Finds available nurseries with a LangGraph workflow.",
      inputSchema: {
        type: "object",
        properties: {
          location: { type: "string", description: "The city or neighborhood (e.g., 'רמת גן', 'בני ברק')" },
          maxPrice: { type: "number", description: "Maximum monthly budget in ILS" },
          requireVacancy: { type: "boolean", description: "Set to true if the mother needs a spot immediately" },
        },
        required: ["location", "maxPrice"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "find_best_nursery") {
    const result = await nurseryAgent.findBestNursery(request.params.arguments);

    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
    };
  }

  throw new Error("Tool not found");
});

const transport = new StdioServerTransport();
await server.connect(transport);
