import assert from "node:assert/strict";
import test from "node:test";
import {
  CaregiverDeepSearchLangGraphAgent,
  MarketResearchLangGraphAgent,
  NurseryLangGraphAgent,
} from "../langgraph_agents.js";

test("NurseryLangGraphAgent filters by location, budget, and vacancy", async () => {
  const agent = new NurseryLangGraphAgent();

  const result = await agent.findBestNursery({
    location: "רמת גן",
    maxPrice: 4000,
    requireVacancy: true,
  });

  assert.equal(result.status, "success");
  assert.equal(result.foundCount, 1);
  assert.equal(result.matches[0].name, "משפחתון חני");
});

test("MarketResearchLangGraphAgent routes to the selected expert", async () => {
  const calls = [];
  const fakeOpenAI = {
    chat: {
      completions: {
        create: async ({ messages }) => {
          calls.push(messages);
          const systemPrompt = messages[0].content;

          if (systemPrompt.includes("נתב")) {
            return { choices: [{ message: { content: "ULTRA_ORTHODOX" } }] };
          }

          return { choices: [{ message: { content: "ניתוח עבור המגזר החרדי" } }] };
        },
      },
    },
  };
  const agent = new MarketResearchLangGraphAgent({ openaiClient: fakeOpenAI });

  const result = await agent.researchCity("בני ברק");

  assert.equal(result.city, "בני ברק");
  assert.equal(result.sectorSelected, "ULTRA_ORTHODOX");
  assert.equal(result.expertAnalysis, "ניתוח עבור המגזר החרדי");
  assert.equal(calls.length, 2);
  assert.match(calls[1][0].content, /מגזר החרדי/);
});

test("CaregiverDeepSearchLangGraphAgent finds the first safe caregiver within budget", async () => {
  const agent = new CaregiverDeepSearchLangGraphAgent();

  const result = await agent.runCaregiverSearch(3500);

  assert.equal(result.status, "SUCCESS");
  assert.match(result.result, /פעוטון חסדי חיה/);
  assert.ok(result.log.some((entry) => entry.includes("rev_chaya")));
});

test("CaregiverDeepSearchLangGraphAgent fails when no caregiver is safe and affordable", async () => {
  const agent = new CaregiverDeepSearchLangGraphAgent();

  const result = await agent.runCaregiverSearch(3000);

  assert.equal(result.status, "FAILED");
  assert.match(result.result, /לא נמצאה מטפלת/);
});
