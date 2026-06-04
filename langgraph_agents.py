from __future__ import annotations

import os
from typing import Any, NotRequired, TypedDict

from langgraph.graph import END, START, StateGraph
from openai import OpenAI


DEFAULT_NURSERIES_DATABASE = [
    {
        "name": "משפחתון חני",
        "location": "רמת גן",
        "price": 3800,
        "hasVacancies": True,
        "review": "מדהימה וחמה, מומלץ בחום!",
    },
    {
        "name": "הלול של ענת",
        "location": "רמת גן",
        "price": 3900,
        "hasVacancies": False,
        "review": "מקום נחמד, קצת המוני",
    },
    {
        "name": "משפחתון ציפי",
        "location": "בני ברק",
        "price": 3500,
        "hasVacancies": True,
        "review": "מנוסה מאוד, נקייה ומסודרת",
    },
]

DEFAULT_CAREGIVERS_DATABASE = {
    "המשפחתון של רחלי": {"price": 3200, "reviewKey": "rev_rachel"},
    "מטפלת חנה": {"price": 2900, "reviewKey": "rev_chana"},
    "פעוטון חסדי חיה": {"price": 3400, "reviewKey": "rev_chaya"},
}

DEFAULT_REVIEWS_DATABASE = {
    "rev_rachel": ["היחס היה קר מאוד ולא מומלץ בכלל."],
    "rev_chana": [
        "חנה מדהימה! חמה, מסורה, משקיעה בילדים מכל הלב.",
        "הבת שלי פורחת אצלה כבר שנה שלמה, ממליצה בחום.",
        "אזהרה! שמעתי מהשכנה שהיא משאירה לפעמים את הילדים לבד בחדר לכמה דקות!!",
    ],
    "rev_chaya": [
        "מקום נחמד מאוד, נקי ומושקע.",
        "הצוות מסור ומקסים, הילד שלי הולך בשמחה כל בוקר!",
    ],
}

DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
DEFAULT_DEEPSEEK_BASE_URL = "https://api.deepseek.com"
DEFAULT_NEGATIVE_REVIEW_TERMS = ["אזהרה", "לבד", "יחס קר", "לא מומלץ", "בעיה", "סכנה", "מסוכן"]


class NurseryState(TypedDict):
    location: str
    max_price: float
    require_vacancy: bool
    candidates: NotRequired[list[dict[str, Any]]]
    matches: NotRequired[list[dict[str, Any]]]
    status: NotRequired[str]
    found_count: NotRequired[int]


class MarketResearchState(TypedDict):
    city: str
    sector_selected: NotRequired[str]
    expert_analysis: NotRequired[str]


class CaregiverState(TypedDict):
    max_budget: float
    caregivers: NotRequired[list[str]]
    caregiver_index: NotRequired[int]
    review_index: NotRequired[int]
    current_caregiver: NotRequired[str | None]
    current_details: NotRequired[dict[str, Any] | None]
    risk_found: NotRequired[bool]
    log: NotRequired[list[str]]
    status: NotRequired[str]
    result: NotRequired[str]
    steps_taken: NotRequired[int]


class NurseryLangGraphAgent:
    """LangGraph version of the local nursery filtering MCP logic."""

    def __init__(self, nurseries_database: list[dict[str, Any]] | None = None) -> None:
        self.nurseries_database = list(nurseries_database or DEFAULT_NURSERIES_DATABASE)
        self.graph = self._create_graph()

    def _create_graph(self):
        workflow = StateGraph(NurseryState)
        workflow.add_node("filter_by_location_and_budget", self._filter_by_location_and_budget)
        workflow.add_node("filter_by_vacancy", self._filter_by_vacancy)
        workflow.add_node("format_response", self._format_response)
        workflow.add_edge(START, "filter_by_location_and_budget")
        workflow.add_edge("filter_by_location_and_budget", "filter_by_vacancy")
        workflow.add_edge("filter_by_vacancy", "format_response")
        workflow.add_edge("format_response", END)
        return workflow.compile()

    def _filter_by_location_and_budget(self, state: NurseryState) -> dict[str, Any]:
        return {
            "candidates": [
                nursery
                for nursery in self.nurseries_database
                if nursery["location"] == state["location"] and nursery["price"] <= state["max_price"]
            ]
        }

    @staticmethod
    def _filter_by_vacancy(state: NurseryState) -> dict[str, Any]:
        candidates = state.get("candidates", [])
        if state["require_vacancy"]:
            candidates = [nursery for nursery in candidates if nursery["hasVacancies"] is True]
        return {"matches": candidates}

    @staticmethod
    def _format_response(state: NurseryState) -> dict[str, Any]:
        matches = state.get("matches", [])
        return {
            "status": "success",
            "found_count": len(matches),
        }

    def find_best_nursery(
        self,
        location: str,
        max_price: float,
        require_vacancy: bool = False,
    ) -> dict[str, Any]:
        if not location:
            raise ValueError("location is required")

        numeric_max_price = float(max_price)
        state = self.graph.invoke(
            {
                "location": location,
                "max_price": numeric_max_price,
                "require_vacancy": bool(require_vacancy),
            }
        )

        return {
            "status": state["status"],
            "foundCount": state["found_count"],
            "matches": state.get("matches", []),
        }


class MarketResearchLangGraphAgent:
    """LangGraph router that mirrors market_research_mcp.js."""

    def __init__(
        self,
        openai_client: Any | None = None,
        api_key: str | None = None,
        base_url: str | None = None,
        model: str = DEFAULT_DEEPSEEK_MODEL,
    ) -> None:
        self.openai = openai_client or OpenAI(
            api_key=api_key or os.getenv("DEEPSEEK_API_KEY") or os.getenv("OPENAI_API_KEY") or "api_key",
            base_url=base_url or os.getenv("DEEPSEEK_BASE_URL") or DEFAULT_DEEPSEEK_BASE_URL,
        )
        self.model = model
        self.graph = self._create_graph()

    def _create_graph(self):
        workflow = StateGraph(MarketResearchState)
        workflow.add_node("route_market_research", self._route_market_research)
        workflow.add_node("ultra_orthodox_expert", self._ultra_orthodox_expert)
        workflow.add_node("general_public_expert", self._general_public_expert)
        workflow.add_edge(START, "route_market_research")
        workflow.add_conditional_edges(
            "route_market_research",
            lambda state: state["sector_selected"],
            {
                "ULTRA_ORTHODOX": "ultra_orthodox_expert",
                "GENERAL": "general_public_expert",
            },
        )
        workflow.add_edge("ultra_orthodox_expert", END)
        workflow.add_edge("general_public_expert", END)
        return workflow.compile()

    def _call_chat(self, messages: list[dict[str, str]]) -> str:
        response = self.openai.chat.completions.create(
            model=self.model,
            messages=messages,
        )
        return response.choices[0].message.content or ""

    def _route_market_research(self, state: MarketResearchState) -> dict[str, str]:
        decision = self._call_chat(
            [
                {
                    "role": "system",
                    "content": "תפקידך לשמש כנתב (Router). קבל עיר והחזר אך ורק: 'ULTRA_ORTHODOX' או 'GENERAL'.",
                },
                {"role": "user", "content": f"הקלט שלי הוא העיר: {state['city']}"},
            ]
        )
        selected = "ULTRA_ORTHODOX" if decision.strip().upper() == "ULTRA_ORTHODOX" else "GENERAL"
        return {"sector_selected": selected}

    def _ultra_orthodox_expert(self, state: MarketResearchState) -> dict[str, str]:
        return {
            "expert_analysis": self._call_chat(
                [
                    {"role": "system", "content": "אתה סוכן AI מומחה לדמוגרפיה ותמחור במגזר החרדי."},
                    {"role": "user", "content": f"נתח את העיר: {state['city']}"},
                ]
            )
        }

    def _general_public_expert(self, state: MarketResearchState) -> dict[str, str]:
        return {
            "expert_analysis": self._call_chat(
                [
                    {"role": "system", "content": "אתה סוכן AI מומחה לדמוגרפיה ותמחור במגזר הכללי/חילוני."},
                    {"role": "user", "content": f"נתח את העיר: {state['city']}"},
                ]
            )
        }

    def research_city(self, city: str) -> dict[str, Any]:
        if not city:
            raise ValueError("city is required")

        state = self.graph.invoke({"city": city})
        return {
            "city": state["city"],
            "sectorSelected": state["sector_selected"],
            "expertAnalysis": state["expert_analysis"],
        }


class CaregiverDeepSearchLangGraphAgent:
    """LangGraph loop equivalent of nursery_deep_explorer.js."""

    def __init__(
        self,
        caregivers_database: dict[str, dict[str, Any]] | None = None,
        reviews_database: dict[str, list[str]] | None = None,
        negative_review_terms: list[str] | None = None,
    ) -> None:
        self.caregivers_database = dict(caregivers_database or DEFAULT_CAREGIVERS_DATABASE)
        self.reviews_database = dict(reviews_database or DEFAULT_REVIEWS_DATABASE)
        self.negative_review_terms = list(negative_review_terms or DEFAULT_NEGATIVE_REVIEW_TERMS)
        self.graph = self._create_graph()

    def _create_graph(self):
        workflow = StateGraph(CaregiverState)
        workflow.add_node("list_caregivers", self._list_caregivers)
        workflow.add_node("load_caregiver", self._load_caregiver)
        workflow.add_node("read_review", self._read_review)
        workflow.add_node("advance_caregiver", self._advance_caregiver)
        workflow.add_node("success", self._success)
        workflow.add_node("failed", self._failed)
        workflow.add_edge(START, "list_caregivers")
        workflow.add_conditional_edges(
            "list_caregivers",
            lambda state: "load_caregiver" if state.get("caregivers") else "failed",
            {"load_caregiver": "load_caregiver", "failed": "failed"},
        )
        workflow.add_conditional_edges(
            "load_caregiver",
            self._route_after_loading_caregiver,
            {
                "read_review": "read_review",
                "advance_caregiver": "advance_caregiver",
                "failed": "failed",
            },
        )
        workflow.add_conditional_edges(
            "read_review",
            self._route_after_reading_review,
            {
                "read_review": "read_review",
                "advance_caregiver": "advance_caregiver",
                "success": "success",
            },
        )
        workflow.add_conditional_edges(
            "advance_caregiver",
            lambda state: "failed" if state["caregiver_index"] >= len(state.get("caregivers", [])) else "load_caregiver",
            {"load_caregiver": "load_caregiver", "failed": "failed"},
        )
        workflow.add_edge("success", END)
        workflow.add_edge("failed", END)
        return workflow.compile()

    def _list_caregivers(self, _state: CaregiverState) -> dict[str, Any]:
        return {
            "caregivers": list(self.caregivers_database.keys()),
            "caregiver_index": 0,
            "review_index": 0,
            "risk_found": False,
            "log": ["סיבוב 1: LIST_CAREGIVERS"],
        }

    def _load_caregiver(self, state: CaregiverState) -> dict[str, Any]:
        caregiver = state["caregivers"][state["caregiver_index"]]
        details = self.caregivers_database.get(caregiver)
        log = [*state.get("log", []), f"סיבוב {len(state.get('log', [])) + 1}: CHECK_CAREGIVER: {caregiver}"]

        if details is None:
            log.append(f"לא נמצאו פרטים עבור {caregiver}.")
        elif details["price"] > state["max_budget"]:
            log.append(f"{caregiver} נפסלה כי המחיר {details['price']} גבוה מהתקציב {state['max_budget']}.")

        return {
            "current_caregiver": caregiver,
            "current_details": details,
            "review_index": 0,
            "risk_found": False,
            "log": log,
        }

    @staticmethod
    def _route_after_loading_caregiver(state: CaregiverState) -> str:
        if not state.get("current_caregiver"):
            return "failed"

        current_details = state.get("current_details")
        if current_details is None or current_details["price"] > state["max_budget"]:
            return "advance_caregiver"

        return "read_review"

    def _read_review(self, state: CaregiverState) -> dict[str, Any]:
        current_details = state["current_details"]
        reviews = self.reviews_database.get(current_details["reviewKey"], [])
        review = reviews[state["review_index"]]
        unsafe = self._review_looks_unsafe(review)
        log = [
            *state.get("log", []),
            f"סיבוב {len(state.get('log', [])) + 1}: READ_REVIEW: {current_details['reviewKey']}, {state['review_index']} -> {review}",
        ]

        if unsafe:
            log.append(f"{state['current_caregiver']} נפסלה בגלל ביקורת בעייתית.")

        return {
            "review_index": state["review_index"] + 1,
            "risk_found": bool(state.get("risk_found")) or unsafe,
            "log": log,
        }

    def _route_after_reading_review(self, state: CaregiverState) -> str:
        if state.get("risk_found"):
            return "advance_caregiver"

        current_details = state["current_details"]
        reviews = self.reviews_database.get(current_details["reviewKey"], [])
        return "read_review" if state["review_index"] < len(reviews) else "success"

    @staticmethod
    def _advance_caregiver(state: CaregiverState) -> dict[str, Any]:
        return {
            "caregiver_index": state["caregiver_index"] + 1,
            "review_index": 0,
            "risk_found": False,
            "log": [*state.get("log", []), "עובר/ת למטפלת הבאה."],
        }

    @staticmethod
    def _success(state: CaregiverState) -> dict[str, Any]:
        return {
            "status": "SUCCESS",
            "result": f"SUCCESS: המטפלת {state['current_caregiver']} מושלמת ובטוחה!",
            "steps_taken": len(state.get("log", [])),
        }

    @staticmethod
    def _failed(state: CaregiverState) -> dict[str, Any]:
        return {
            "status": "FAILED",
            "result": "לא נמצאה מטפלת מתאימה העונה על כל דרישות הבטיחות והתקציב.",
            "steps_taken": len(state.get("log", [])),
        }

    def _review_looks_unsafe(self, review: str) -> bool:
        return any(term in review for term in self.negative_review_terms)

    def run_caregiver_search(self, max_budget: float) -> dict[str, Any]:
        state = self.graph.invoke({"max_budget": float(max_budget)})
        return {
            "status": state["status"],
            "result": state["result"],
            "stepsTaken": state["steps_taken"],
            "log": state.get("log", []),
        }
