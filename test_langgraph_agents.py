from types import SimpleNamespace
from unittest import TestCase, main

from langgraph_agents import (
    CaregiverDeepSearchLangGraphAgent,
    MarketResearchLangGraphAgent,
    NurseryLangGraphAgent,
)


class FakeChatCompletions:
    def __init__(self):
        self.calls = []

    def create(self, model, messages):
        self.calls.append({"model": model, "messages": messages})
        system_prompt = messages[0]["content"]

        if "נתב" in system_prompt:
            content = "ULTRA_ORTHODOX"
        else:
            content = "ניתוח עבור המגזר החרדי"

        return SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(content=content),
                )
            ]
        )


class FakeOpenAI:
    def __init__(self):
        self.chat = SimpleNamespace(completions=FakeChatCompletions())


class LangGraphAgentTests(TestCase):
    def test_nursery_agent_filters_location_budget_and_vacancy(self):
        agent = NurseryLangGraphAgent()

        result = agent.find_best_nursery(
            location="רמת גן",
            max_price=4000,
            require_vacancy=True,
        )

        self.assertEqual(result["status"], "success")
        self.assertEqual(result["foundCount"], 1)
        self.assertEqual(result["matches"][0]["name"], "משפחתון חני")

    def test_market_research_agent_routes_to_selected_expert(self):
        fake_openai = FakeOpenAI()
        agent = MarketResearchLangGraphAgent(openai_client=fake_openai)

        result = agent.research_city("בני ברק")

        self.assertEqual(result["city"], "בני ברק")
        self.assertEqual(result["sectorSelected"], "ULTRA_ORTHODOX")
        self.assertEqual(result["expertAnalysis"], "ניתוח עבור המגזר החרדי")
        self.assertEqual(len(fake_openai.chat.completions.calls), 2)
        self.assertIn("מגזר החרדי", fake_openai.chat.completions.calls[1]["messages"][0]["content"])

    def test_caregiver_agent_finds_first_safe_caregiver_within_budget(self):
        agent = CaregiverDeepSearchLangGraphAgent()

        result = agent.run_caregiver_search(3500)

        self.assertEqual(result["status"], "SUCCESS")
        self.assertIn("פעוטון חסדי חיה", result["result"])
        self.assertTrue(any("rev_chaya" in entry for entry in result["log"]))

    def test_caregiver_agent_fails_when_no_caregiver_is_safe_and_affordable(self):
        agent = CaregiverDeepSearchLangGraphAgent()

        result = agent.run_caregiver_search(3000)

        self.assertEqual(result["status"], "FAILED")
        self.assertIn("לא נמצאה מטפלת", result["result"])


if __name__ == "__main__":
    main()
