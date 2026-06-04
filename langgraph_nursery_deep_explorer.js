import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CaregiverDeepSearchLangGraphAgent } from "./langgraph_agents.js";

const caregiverAgent = new CaregiverDeepSearchLangGraphAgent();

const server = new Server(
  { name: "langgraph-nursery-loop-explorer", version: "1.0.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "deep_nursery_search",
      description: "Runs a LangGraph loop to find a safe caregiver by checking budget and reading reviews.",
      inputSchema: {
        type: "object",
        properties: {
          maxBudget: {
            type: "number",
            description: "The maximum monthly budget allowed by the parent (e.g., 3500)",
          },
        },
        required: ["maxBudget"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "deep_nursery_search") {
    const { maxBudget } = request.params.arguments;

    try {
      const result = await caregiverAgent.runCaregiverSearch(maxBudget);

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `שגיאה בהרצת הלולאה: ${error.message}` }],
      };
    }
  }

  throw new Error(`Tool not found: ${request.params.name}`);
});

process.on("uncaughtException", (err) => console.error("Uncaught Error:", err.message));
process.on("unhandledRejection", (reason) => console.error("Unhandled Rejection:", reason));
setInterval(() => {}, 1000).unref();

const transport = new StdioServerTransport();
await server.connect(transport);
