import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import OpenAI from "openai";

// התחברות ל-API (שני למפתח הפעיל שלך)
const openai = new OpenAI({
   apiKey: "api_key", // שנו למפתח שלכן!
  baseURL: "https://api.deepseek.com" 
});

// ==========================================
//    בסיס הנתונים המקומי והכלים הפנימיים
// ==========================================

const caregiversDatabase = {
  "המשפחתון של רחלי": { price: 3200, reviewKey: "rev_rachel" },
  "מטפלת חנה":        { price: 2900, reviewKey: "rev_chana" },
  "פעוטון חסדי חיה":   { price: 3400, reviewKey: "rev_chaya" }
};

const reviewsDatabase = {
  "rev_rachel": ["היחס היה קר מאוד ולא מומלץ בכלל."],
  "rev_chana":  [
    "חנה מדהימה! חמה, מסורה, משקיעה בילדים מכל הלב.",
    "הבת שלי פורחת אצלה כבר שנה שלמה, ממליצה בחום.",
    "אזהרה! שמעתי מהשכנה שהיא משאירה לפעמים את הילדים לבד בחדר לכמה דקות!!"
  ],
  "rev_chaya":  [
    "מקום נחמד מאוד, נקי ומושקע.",
    "הצוות מסור ומקסים, הילד שלי הולך בשמחה כל בוקר!"
  ]
};

function getAllCaregivers() {
  return Object.keys(caregiversDatabase);
}

function getCaregiverDetails(name) {
  return caregiversDatabase[name] || null;
}

function getCaregiverReview(reviewKey, index) {
  const reviews = reviewsDatabase[reviewKey];
  if (!reviews || index >= reviews.length) {
    return "DONE - אין יותר ביקורות לקרוא עבור מטפלת זו.";
  }
  return reviews[index];
}

// ==========================================
//     לוגיקת ה-Agent Loop האוטונומית
// ==========================================

async function runCaregiverAgentLoop(maxBudget) {
  let messages = [
    { 
      role: "system", 
      content: `תפקידך למצוא לאמא מטפלת מתאימה ובטוחה.\n` +
               `האילוצים: 1) תקציב מקסימלי: ${maxBudget} ש"ח. 2) המלצות: חובה לבדוק את *כל* הביקורות הקיימות עבור המטפלת.\n\n` +
               `הכלים שאתה יכול להפעיל:\n` +
               `- LIST_CAREGIVERS (בלי פרמטרים)\n` +
               `- CHECK_CAREGIVER: [שם המטפלת]\n` +
               `- READ_REVIEW: [קוד חוות דעת], [מספר אינדקס]\n\n` +
               `חוקי הלולאה:\n` +
               `1. לכל מטפלת יש מספר ביקורות. עליך לקרוא אותן אחת אחת לפי סדר האינדקסים (0, 1, 2...) עד שהכלי מחזיר 'DONE'.\n` +
               `2. אסור לך לאשר מטפלת (SUCCESS) לפני שקראת את כל הביקורות שלה ווידאת שאין בהן שום אזהרה, יחס קר או בעיית בטיחות.\n` +
               `3. אם מצאת ביקורת שלילית/מחשידה, פסול מיד את המטפלת הזו ועבור לחקור את המטפלת הבאה ברשימה.\n` +
               `4. בכל סיבוב החזר אך ורק פקודה אחת בפורמט המדויק.\n` +
               `5. ברגע שמצאת מטפלת שעברה את כל הביקורות בהצלחה ועומדת בתקציב, החזר: 'SUCCESS: המטפלת [שם המטפלת] מושלמת ובטוחה!'.`
    },
    { role: "user", content: `תמצא לי מטפלת בטוחה בתקציב של עד ${maxBudget} ש"ח.` }
  ];

  let isTaskComplete = false;
  let step = 1;
  let runLog = []; // נתעד את סיבובי הלולאה כדי להציג אותם ב-MCP

  while (!isTaskComplete && step <= 15) {
    const response = await openai.chat.completions.create({
      model: "deepseek-v4-flash", 
      messages: messages,
      temperature: 0
    });

    const aiAction = response.choices[0].message.content.trim();
    runLog.push(`סיבוב ${step}: הסוכן החליט -> ${aiAction}`);
    messages.push({ role: "assistant", content: aiAction });

    if (aiAction.startsWith("SUCCESS:")) {
      isTaskComplete = true;
      return { status: "SUCCESS", result: aiAction, stepsTaken: step, log: runLog };
    }

    let observation = "";
    if (aiAction.startsWith("LIST_CAREGIVERS")) {
      observation = JSON.stringify(getAllCaregivers());
    } 
    else if (aiAction.startsWith("CHECK_CAREGIVER:")) {
      const name = aiAction.replace("CHECK_CAREGIVER:", "").trim();
      observation = JSON.stringify(getCaregiverDetails(name));
    } 
    else if (aiAction.startsWith("READ_REVIEW:")) {
      const params = aiAction.replace("READ_REVIEW:", "").trim();
      const parts = params.split(",");
      const key = parts[0].trim();
      const index = parseInt(parts[1].trim());
      observation = getCaregiverReview(key, index);
    } 
    else {
      observation = "Error: Invalid command format.";
    }

    messages.push({ role: "user", content: `תוצאת הכלי: ${observation}. המשך במשימה.` });
    step++;
  }

  return { status: "FAILED", result: "לא נמצאה מטפלת מתאימה העונה על כל דרישות הבטיחות והתקציב.", stepsTaken: step, log: runLog };
}

// ==========================================
//          תשתית שרת ה-MCP
// ==========================================

const server = new Server(
  { name: "nursery-loop-explorer", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// הצהרת הכלי עבור קליין
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [{
    name: "deep_nursery_search",
    description: "Runs an autonomous Agent Loop to find a safe and recommended nursery by reading and analyzing all text reviews one-by-one.",
    inputSchema: {
      type: "object",
      properties: {
        maxBudget: { 
          type: "number", 
          description: "The maximum monthly budget allowed by the parent (e.g., 3500)" 
        }
      },
      required: ["maxBudget"]
    }
  }]
}));

// הפעלת הכלי בפועל
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === "deep_nursery_search") {
    const { maxBudget } = request.params.arguments;

    try {
      // מריצים את לולאת הסוכן האוטונומית
      const agentResult = await runCaregiverAgentLoop(maxBudget);

      return {
        content: [{
          type: "text",
          text: JSON.stringify(agentResult, null, 2)
        }]
      };
    } catch (error) {
      return {
        isError: true,
        content: [{ type: "text", text: `שגיאה בהרצת הלולאה: ${error.message}` }]
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