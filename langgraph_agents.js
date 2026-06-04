import { Annotation, END, START, StateGraph } from "@langchain/langgraph";
import OpenAI from "openai";

export const defaultNurseriesDatabase = Object.freeze([
  {
    name: "משפחתון חני",
    location: "רמת גן",
    price: 3800,
    hasVacancies: true,
    review: "מדהימה וחמה, מומלץ בחום!",
  },
  {
    name: "הלול של ענת",
    location: "רמת גן",
    price: 3900,
    hasVacancies: false,
    review: "מקום נחמד, קצת המוני",
  },
  {
    name: "משפחתון ציפי",
    location: "בני ברק",
    price: 3500,
    hasVacancies: true,
    review: "מנוסה מאוד, נקייה ומסודרת",
  },
]);

export const defaultCaregiversDatabase = Object.freeze({
  "המשפחתון של רחלי": { price: 3200, reviewKey: "rev_rachel" },
  "מטפלת חנה": { price: 2900, reviewKey: "rev_chana" },
  "פעוטון חסדי חיה": { price: 3400, reviewKey: "rev_chaya" },
});

export const defaultReviewsDatabase = Object.freeze({
  rev_rachel: ["היחס היה קר מאוד ולא מומלץ בכלל."],
  rev_chana: [
    "חנה מדהימה! חמה, מסורה, משקיעה בילדים מכל הלב.",
    "הבת שלי פורחת אצלה כבר שנה שלמה, ממליצה בחום.",
    "אזהרה! שמעתי מהשכנה שהיא משאירה לפעמים את הילדים לבד בחדר לכמה דקות!!",
  ],
  rev_chaya: [
    "מקום נחמד מאוד, נקי ומושקע.",
    "הצוות מסור ומקסים, הילד שלי הולך בשמחה כל בוקר!",
  ],
});

const MARKET_RESEARCH_MODEL = "deepseek-chat";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const NEGATIVE_REVIEW_TERMS = Object.freeze(["אזהרה", "לבד", "יחס קר", "לא מומלץ", "בעיה", "סכנה", "מסוכן"]);

function createDeepSeekClient({ apiKey, baseURL } = {}) {
  return new OpenAI({
    apiKey: apiKey ?? process.env.DEEPSEEK_API_KEY ?? process.env.OPENAI_API_KEY ?? "api_key",
    baseURL: baseURL ?? process.env.DEEPSEEK_BASE_URL ?? DEEPSEEK_BASE_URL,
  });
}

function getMessageText(response) {
  return response?.choices?.[0]?.message?.content ?? "";
}

function normalizeSectorDecision(decision) {
  return decision?.toString().trim().toUpperCase() === "ULTRA_ORTHODOX"
    ? "ULTRA_ORTHODOX"
    : "GENERAL";
}

export class NurseryLangGraphAgent {
  constructor({ nurseriesDatabase = defaultNurseriesDatabase } = {}) {
    this.nurseriesDatabase = [...nurseriesDatabase];
    this.graph = this.createGraph();
  }

  createGraph() {
    const NurseryState = Annotation.Root({
      location: Annotation(),
      maxPrice: Annotation(),
      requireVacancy: Annotation(),
      candidates: Annotation({ default: () => [] }),
      matches: Annotation({ default: () => [] }),
      status: Annotation({ default: () => "success" }),
      foundCount: Annotation({ default: () => 0 }),
    });

    return new StateGraph(NurseryState)
      .addNode("filterByLocationAndBudget", (state) => ({
        candidates: this.nurseriesDatabase.filter(
          (nursery) => nursery.location === state.location && nursery.price <= state.maxPrice,
        ),
      }))
      .addNode("filterByVacancy", (state) => ({
        matches: state.requireVacancy
          ? state.candidates.filter((nursery) => nursery.hasVacancies === true)
          : state.candidates,
      }))
      .addNode("formatResponse", (state) => ({
        status: "success",
        foundCount: state.matches.length,
      }))
      .addEdge(START, "filterByLocationAndBudget")
      .addEdge("filterByLocationAndBudget", "filterByVacancy")
      .addEdge("filterByVacancy", "formatResponse")
      .addEdge("formatResponse", END)
      .compile();
  }

  async findBestNursery({ location, maxPrice, requireVacancy = false }) {
    const numericMaxPrice = Number(maxPrice);

    if (!location) {
      throw new Error("location is required");
    }

    if (!Number.isFinite(numericMaxPrice)) {
      throw new Error("maxPrice must be a number");
    }

    const state = await this.graph.invoke({
      location,
      maxPrice: numericMaxPrice,
      requireVacancy: Boolean(requireVacancy),
    });

    return {
      status: state.status,
      foundCount: state.foundCount,
      matches: state.matches,
    };
  }
}

export class MarketResearchLangGraphAgent {
  constructor({
    openaiClient,
    apiKey,
    baseURL,
    model = MARKET_RESEARCH_MODEL,
  } = {}) {
    this.openai = openaiClient ?? createDeepSeekClient({ apiKey, baseURL });
    this.model = model;
    this.graph = this.createGraph();
  }

  createGraph() {
    const MarketResearchState = Annotation.Root({
      city: Annotation(),
      sectorSelected: Annotation(),
      expertAnalysis: Annotation(),
    });

    return new StateGraph(MarketResearchState)
      .addNode("routeMarketResearch", async (state) => ({
        sectorSelected: await this.determineBestAgent(state.city),
      }))
      .addNode("ultraOrthodoxExpert", async (state) => ({
        expertAnalysis: await this.runUltraOrthodoxExpert(state.city),
      }))
      .addNode("generalPublicExpert", async (state) => ({
        expertAnalysis: await this.runGeneralPublicExpert(state.city),
      }))
      .addEdge(START, "routeMarketResearch")
      .addConditionalEdges(
        "routeMarketResearch",
        (state) => state.sectorSelected,
        {
          ULTRA_ORTHODOX: "ultraOrthodoxExpert",
          GENERAL: "generalPublicExpert",
        },
      )
      .addEdge("ultraOrthodoxExpert", END)
      .addEdge("generalPublicExpert", END)
      .compile();
  }

  async callChat(messages) {
    const response = await this.openai.chat.completions.create({
      model: this.model,
      messages,
    });

    return getMessageText(response);
  }

  async runUltraOrthodoxExpert(city) {
    return this.callChat([
      { role: "system", content: "אתה סוכן AI מומחה לדמוגרפיה ותמחור במגזר החרדי." },
      { role: "user", content: `נתח את העיר: ${city}` },
    ]);
  }

  async runGeneralPublicExpert(city) {
    return this.callChat([
      { role: "system", content: "אתה סוכן AI מומחה לדמוגרפיה ותמחור במגזר הכללי/חילוני." },
      { role: "user", content: `נתח את העיר: ${city}` },
    ]);
  }

  async determineBestAgent(city) {
    const decision = await this.callChat([
      {
        role: "system",
        content: "תפקידך לשמש כנתב (Router). קבל עיר והחזר אך ורק: 'ULTRA_ORTHODOX' או 'GENERAL'.",
      },
      { role: "user", content: `הקלט שלי הוא העיר: ${city}` },
    ]);

    return normalizeSectorDecision(decision);
  }

  async researchCity(city) {
    if (!city) {
      throw new Error("city is required");
    }

    const state = await this.graph.invoke({ city });

    return {
      city: state.city,
      sectorSelected: state.sectorSelected,
      expertAnalysis: state.expertAnalysis,
    };
  }
}

export class CaregiverDeepSearchLangGraphAgent {
  constructor({
    caregiversDatabase = defaultCaregiversDatabase,
    reviewsDatabase = defaultReviewsDatabase,
    negativeReviewTerms = NEGATIVE_REVIEW_TERMS,
  } = {}) {
    this.caregiversDatabase = { ...caregiversDatabase };
    this.reviewsDatabase = { ...reviewsDatabase };
    this.negativeReviewTerms = [...negativeReviewTerms];
    this.graph = this.createGraph();
  }

  createGraph() {
    const CaregiverState = Annotation.Root({
      maxBudget: Annotation(),
      caregivers: Annotation({ default: () => [] }),
      caregiverIndex: Annotation({ default: () => 0 }),
      reviewIndex: Annotation({ default: () => 0 }),
      currentCaregiver: Annotation(),
      currentDetails: Annotation(),
      riskFound: Annotation({ default: () => false }),
      log: Annotation({ default: () => [] }),
      status: Annotation({ default: () => "RUNNING" }),
      result: Annotation(),
      stepsTaken: Annotation({ default: () => 0 }),
    });

    return new StateGraph(CaregiverState)
      .addNode("listCaregivers", () => ({
        caregivers: this.getAllCaregivers(),
        caregiverIndex: 0,
        reviewIndex: 0,
        riskFound: false,
        log: ["סיבוב 1: LIST_CAREGIVERS"],
      }))
      .addNode("loadCaregiver", (state) => this.loadCaregiver(state))
      .addNode("readReview", (state) => this.readReview(state))
      .addNode("advanceCaregiver", (state) => this.advanceCaregiver(state))
      .addNode("success", (state) => this.finishWithSuccess(state))
      .addNode("failed", (state) => this.finishWithFailure(state))
      .addEdge(START, "listCaregivers")
      .addConditionalEdges(
        "listCaregivers",
        (state) => (state.caregivers.length > 0 ? "loadCaregiver" : "failed"),
        {
          loadCaregiver: "loadCaregiver",
          failed: "failed",
        },
      )
      .addConditionalEdges(
        "loadCaregiver",
        (state) => {
          if (!state.currentCaregiver) {
            return "failed";
          }

          if (!state.currentDetails || state.currentDetails.price > state.maxBudget) {
            return "advanceCaregiver";
          }

          return "readReview";
        },
        {
          readReview: "readReview",
          advanceCaregiver: "advanceCaregiver",
          failed: "failed",
        },
      )
      .addConditionalEdges(
        "readReview",
        (state) => {
          if (state.riskFound) {
            return "advanceCaregiver";
          }

          return this.hasMoreReviews(state) ? "readReview" : "success";
        },
        {
          readReview: "readReview",
          advanceCaregiver: "advanceCaregiver",
          success: "success",
        },
      )
      .addConditionalEdges(
        "advanceCaregiver",
        (state) => (state.caregiverIndex >= state.caregivers.length ? "failed" : "loadCaregiver"),
        {
          loadCaregiver: "loadCaregiver",
          failed: "failed",
        },
      )
      .addEdge("success", END)
      .addEdge("failed", END)
      .compile();
  }

  getAllCaregivers() {
    return Object.keys(this.caregiversDatabase);
  }

  getCaregiverDetails(name) {
    return this.caregiversDatabase[name] ?? null;
  }

  getCaregiverReviews(reviewKey) {
    return this.reviewsDatabase[reviewKey] ?? [];
  }

  reviewLooksUnsafe(review) {
    return this.negativeReviewTerms.some((term) => review.includes(term));
  }

  loadCaregiver(state) {
    const currentCaregiver = state.caregivers[state.caregiverIndex];
    const currentDetails = this.getCaregiverDetails(currentCaregiver);
    const log = [...state.log, `סיבוב ${state.log.length + 1}: CHECK_CAREGIVER: ${currentCaregiver}`];

    if (!currentDetails) {
      log.push(`לא נמצאו פרטים עבור ${currentCaregiver}.`);
    } else if (currentDetails.price > state.maxBudget) {
      log.push(`${currentCaregiver} נפסלה כי המחיר ${currentDetails.price} גבוה מהתקציב ${state.maxBudget}.`);
    }

    return {
      currentCaregiver,
      currentDetails,
      reviewIndex: 0,
      riskFound: false,
      log,
    };
  }

  readReview(state) {
    const reviews = this.getCaregiverReviews(state.currentDetails.reviewKey);
    const review = reviews[state.reviewIndex];
    const log = [...state.log];

    if (review === undefined) {
      log.push(`DONE - אין יותר ביקורות לקרוא עבור ${state.currentCaregiver}.`);
      return { log };
    }

    const unsafe = this.reviewLooksUnsafe(review);
    log.push(`סיבוב ${log.length + 1}: READ_REVIEW: ${state.currentDetails.reviewKey}, ${state.reviewIndex} -> ${review}`);

    if (unsafe) {
      log.push(`${state.currentCaregiver} נפסלה בגלל ביקורת בעייתית.`);
    }

    return {
      reviewIndex: state.reviewIndex + 1,
      riskFound: state.riskFound || unsafe,
      log,
    };
  }

  hasMoreReviews(state) {
    const reviews = this.getCaregiverReviews(state.currentDetails.reviewKey);
    return state.reviewIndex < reviews.length;
  }

  advanceCaregiver(state) {
    return {
      caregiverIndex: state.caregiverIndex + 1,
      reviewIndex: 0,
      riskFound: false,
      log: [...state.log, "עובר/ת למטפלת הבאה."],
    };
  }

  finishWithSuccess(state) {
    return {
      status: "SUCCESS",
      result: `SUCCESS: המטפלת ${state.currentCaregiver} מושלמת ובטוחה!`,
      stepsTaken: state.log.length,
    };
  }

  finishWithFailure(state) {
    return {
      status: "FAILED",
      result: "לא נמצאה מטפלת מתאימה העונה על כל דרישות הבטיחות והתקציב.",
      stepsTaken: state.log.length,
    };
  }

  async runCaregiverSearch(maxBudget) {
    const numericMaxBudget = Number(maxBudget);

    if (!Number.isFinite(numericMaxBudget)) {
      throw new Error("maxBudget must be a number");
    }

    const state = await this.graph.invoke({ maxBudget: numericMaxBudget });

    return {
      status: state.status,
      result: state.result,
      stepsTaken: state.stepsTaken,
      log: state.log,
    };
  }
}
