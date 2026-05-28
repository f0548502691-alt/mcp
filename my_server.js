import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// יצירת השרת
const server = new Server({ name: "my-tools", version: "1.0.0" }, { capabilities: { tools: {} } });

// 1. הגדרת הכלים שקליין יראה
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "calculate_factorial",
    description: "Calculates the factorial of a number.",
    inputSchema: { type: "object", properties: { n: { type: "number" } }, required: ["n"] }
  }]
}));

// 2. הלוגיקה של הפעלת הכלי
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "calculate_factorial") {
    const n = request.params.arguments.n;
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return { content: [{ type: "text", text: `The factorial of ${n} is ${result}` }] };
  }
  throw new Error("Tool not found");
});

// הרצה
const transport = new StdioServerTransport();
await server.connect(transport);