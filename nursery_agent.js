import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

// מאגר הנתונים המקומי שלך
const nurseriesDatabase = [
  { name: "משפחתון חני", location: "רמת גן", price: 3800, hasVacancies: true, review: "מדהימה וחמה, מומלץ בחום!" },
  { name: "הלול של ענת", location: "רמת גן", price: 3900, hasVacancies: false, review: "מקום נחמד, קצת המוני" },
  { name: "משפחתון ציפי", location: "בני ברק", price: 3500, hasVacancies: true, review: "מנוסה מאוד, נקייה ומסודרת" }
];

// יצירת שרת ה-MCP
const server = new Server({ name: "nursery-agent-server", version: "1.0.0" }, { capabilities: { tools: {} } });

// 1. הגדרת הכלי ש-Cline יראה בממשק שלו
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "find_best_nursery",
    description: "Finds available nurseries based on location, budget, and availability constraints.",
    inputSchema: {
      type: "object",
      properties: {
        location: { type: "string", description: "The city or neighborhood (e.g., 'רמת גן', 'בני ברק')" },
        maxPrice: { type: "number", description: "Maximum monthly budget in ILS" },
        requireVacancy: { type: "boolean", description: "Set to true if the mother needs a spot immediately" }
      },
      required: ["location", "maxPrice"]
    }
  }]
}));

// 2. לוגיקת החשיבה והסינון של הסוכן שלך
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "find_best_nursery") {
    const { location, maxPrice, requireVacancy } = request.params.arguments;
    
    console.log(` הסוכן המקומי מופעל: מחפש ב-${location} עד ${maxPrice} ש"ח...`);

    // שלב א': סינון ראשוני לפי מיקום ומחיר
    let results = nurseriesDatabase.filter(n => n.location === location && n.price <= maxPrice);

    // שלב ב': סינון לפי מקומות פנויים (אם נדרש)
    if (requireVacancy) {
      results = results.filter(n => n.hasVacancies === true);
    }

    // החזרת התוצאה המעובדת ישירות ל-Cline
    return {
      content: [{
        type: "text",
        text: JSON.stringify({
          status: "success",
          foundCount: results.length,
          matches: results
        })
      }]
    };
  }
  
  throw new Error("Tool not found");
});

// הרצת השרת
const transport = new StdioServerTransport();
await server.connect(transport);