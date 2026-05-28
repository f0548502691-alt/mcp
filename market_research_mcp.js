
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

// חיבור ל-API
const openai = new OpenAI({
  apiKey: "sk-241c890defab484ab9ea0d005e22873a", // שנו למפתח שלכן!
  baseURL: "https://api.deepseek.com" 
});

// תתי-הסוכנים המומחים
async function runUltraOrthodoxExpert(city) {
  const response = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "אתה סוכן AI מומחה לדמוגרפיה ותמחור במגזר החרדי." },
      { role: "user", content: `נתח את העיר: ${city}` }
    ]
  });
  return response.choices[0].message.content;
}

async function runGeneralPublicExpert(city) {
  const response = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "אתה סוכן AI מומחה לדמוגרפיה ותמחור במגזר הכללי/חילוני." },
      { role: "user", content: `נתח את העיר: ${city}` }
    ]
  });
  return response.choices[0].message.content;
}

// סוכן הנתב (Router Agent)
async function determineBestAgent(city) {
  const response = await openai.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { 
        role: "system", 
        content: "תפקידך לשמש כנתב (Router). קבל עיר והחזר אך ורק: 'ULTRA_ORTHODOX' או 'GENERAL'."
      },
      { role: "user", content: `הקלט שלי הוא העיר: ${city}` }
    ]
  });
  return response.choices[0].message.content.trim();
}

// הגדרת שרת ה-MCP
const server = new Server({ name: "dynamic-routing", version: "1.0.0" }, { capabilities: { tools: {} } });

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "smart_market_research",
    description: "Runs an AI-routed market research based on the city's specific population type.",
    inputSchema: {
      type: "object",
      properties: { city: { type: "string" } },
      required: ["city"]
    }
  }]
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "smart_market_research") {
    const { city } = request.params.arguments;

    // הנתב מקבל החלטה
    const decision = await determineBestAgent(city);
    let reportFromExpert = "";

    if (decision === "ULTRA_ORTHODOX") {
      reportFromExpert = await runUltraOrthodoxExpert(city);
    } else {
      reportFromExpert = await runGeneralPublicExpert(city);
    }

    return {
      content: [{ type: "text", text: JSON.stringify({ city, sectorSelected: decision, expertAnalysis: reportFromExpert }) }]
    };
  }
  throw new Error("Tool not found");
});

process.on("uncaughtException", (err) => console.error("Error:", err.message));
process.on("unhandledRejection", (reason) => console.error("Rejection:", reason));
setInterval(() => {}, 1000).unref();

const transport = new StdioServerTransport();
await server.connect(transport);
