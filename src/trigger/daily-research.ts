import { schedules, logger } from "@trigger.dev/sdk";
import OpenAI from "openai";
import { env } from "../env";
import { getSheetsClient } from "../google-sheets";

// Fixed topic — not user-supplied. Edit this constant to change what's researched.
const RESEARCH_TOPIC = "Recent developments in AI Governance Framework and Implementation Roadmap";

const SHEET_TAB_NAME = "Sheet1"; // must already exist in the target spreadsheet
const SEARCH_RESULT_LIMIT = 5;
const HEADER_ROW = [
  "Date",
  "Topic",
  "Status",
  "Summary",
  "Source Count",
  "Source URLs",
  "Error Detail",
];

type SearchResult = { title: string; url: string; snippet: string };

async function ensureHeaderRow(sheets: ReturnType<typeof getSheetsClient>) {
  const existing = await sheets.spreadsheets.values.get({
    spreadsheetId: env.googleSheetsSpreadsheetId,
    range: `${SHEET_TAB_NAME}!A1:G1`,
  });

  if (existing.data.values && existing.data.values.length > 0) return;

  await sheets.spreadsheets.values.update({
    spreadsheetId: env.googleSheetsSpreadsheetId,
    range: `${SHEET_TAB_NAME}!A1:G1`,
    valueInputOption: "RAW",
    requestBody: { values: [HEADER_ROW] },
  });
  logger.log("daily-research: header row inserted");
}

async function searchFirecrawl(query: string): Promise<SearchResult[]> {
  const res = await fetch("https://api.firecrawl.dev/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.firecrawlApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, limit: SEARCH_RESULT_LIMIT }),
  });

  if (!res.ok) {
    throw new Error(`Firecrawl search failed: ${res.status} ${await res.text()}`);
  }

  const json: any = await res.json();
  // Firecrawl's /v1/search has returned either `data: [...]` or `data: { web: [...] }`
  // across versions — accept both so a shape drift doesn't throw here.
  const raw = Array.isArray(json?.data)
    ? json.data
    : Array.isArray(json?.data?.web)
      ? json.data.web
      : [];

  return raw.slice(0, SEARCH_RESULT_LIMIT).map((r: any) => ({
    title: r.title ?? "",
    url: r.url ?? "",
    snippet: r.description ?? r.snippet ?? "",
  }));
}

async function synthesize(topic: string, results: SearchResult[]): Promise<string> {
  const openai = new OpenAI({ apiKey: env.openaiApiKey });

  const sourcesBlock = results
    .map((r, i) => `${i + 1}. ${r.title} (${r.url})\n${r.snippet}`)
    .join("\n\n");

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1024,
    messages: [
      {
        role: "system",
        content:
          "You are a research analyst. Given raw web search results about a topic, " +
          "write a concise, factual 3-6 sentence summary synthesizing the key findings. " +
          "Only use information present in the provided sources — do not fabricate. " +
          "If the results are sparse or irrelevant, say so briefly.",
      },
      {
        role: "user",
        content: `Topic: ${topic}\n\nSearch results:\n\n${sourcesBlock}`,
      },
    ],
  });

  const summary = completion.choices[0]?.message?.content?.trim();
  if (!summary) throw new Error("OpenAI returned no text content");
  return summary;
}

export const dailyResearchTask = schedules.task({
  id: "daily-research",
  cron: {
    pattern: "0 8 * * *", // 08:00 every day
    timezone: "Africa/Lagos", // WAT (UTC+1) — IANA identifier required by Trigger.dev
  },
  maxDuration: 300, // 5 minutes — overrides the 3600s project default
  run: async (payload) => {
    logger.log("daily-research: starting", {
      topic: RESEARCH_TOPIC,
      scheduleId: payload.scheduleId,
      timestamp: payload.timestamp,
    });

    let results: SearchResult[] = [];
    let searchError: string | undefined;
    try {
      results = await searchFirecrawl(RESEARCH_TOPIC);
      logger.log("daily-research: search complete", { count: results.length });
    } catch (error) {
      searchError = error instanceof Error ? error.message : String(error);
      logger.error("daily-research: search failed", { error: searchError });
    }

    let summary: string;
    let synthesisError: string | undefined;
    if (results.length === 0) {
      summary = searchError
        ? `Search failed, no synthesis attempted: ${searchError}`
        : "No search results were found for this topic.";
    } else {
      try {
        summary = await synthesize(RESEARCH_TOPIC, results);
        logger.log("daily-research: synthesis complete");
      } catch (error) {
        synthesisError = error instanceof Error ? error.message : String(error);
        logger.error("daily-research: synthesis failed", { error: synthesisError });
        summary = `Synthesis failed: ${synthesisError}`;
      }
    }

    const status = searchError ? "error" : synthesisError ? "partial" : "ok";
    const errorDetail = [searchError, synthesisError].filter(Boolean).join(" | ");
    const date = new Date().toISOString().slice(0, 10);
    const sourceUrls = results.map((r) => r.url).join("\n");

    try {
      const sheets = getSheetsClient();

      try {
        await ensureHeaderRow(sheets);
      } catch (error) {
        // Non-fatal: a missing header row doesn't invalidate the data row itself.
        logger.error("daily-research: header row check failed", {
          error: error instanceof Error ? error.message : String(error),
        });
      }

      await sheets.spreadsheets.values.append({
        spreadsheetId: env.googleSheetsSpreadsheetId,
        range: `${SHEET_TAB_NAME}!A:G`,
        valueInputOption: "RAW", // avoid formula injection from synthesized/scraped text
        insertDataOption: "INSERT_ROWS",
        requestBody: {
          values: [[date, RESEARCH_TOPIC, status, summary, results.length, sourceUrls, errorDetail]],
        },
      });
      logger.log("daily-research: sheet row written", { status });
    } catch (error) {
      // Deliberately not swallowed: if we can't write the row, there's nothing
      // to show for the run, so let Trigger.dev's retry + dashboard error
      // tracking be the trace of record for this failure mode.
      logger.error("daily-research: sheet append failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    return { status, summary, sourceCount: results.length };
  },
});
