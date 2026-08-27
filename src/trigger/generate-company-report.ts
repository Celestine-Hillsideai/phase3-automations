import { task, logger } from "@trigger.dev/sdk";
import OpenAI from "openai";
import { env } from "../env";
import { buildReportDocx } from "../report-docx";
import { uploadDocxToDrive } from "../google-drive";

type Payload = {
  COMPANY_NAME: string;
  INDUSTRY: string;
  GOAL: string;
  CHALLENGE: string;
};

const REQUIRED_FIELDS = ["COMPANY_NAME", "INDUSTRY", "GOAL", "CHALLENGE"] as const;

function sanitizeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|]/g, "-").trim();
}

async function synthesizeReport(payload: Payload): Promise<string> {
  const openai = new OpenAI({ apiKey: env.openaiApiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    max_completion_tokens: 1500,
    messages: [
      {
        role: "system",
        content:
          "You are a business consultant writing a short client report. " +
          "Given a company's name, industry, goal, and challenge, write a report with exactly " +
          "these four sections, each as a markdown heading on its own line starting with '## ': " +
          "Executive Summary, Situation Analysis, Recommendations, Next Steps. " +
          "Use plain paragraphs under each heading, and '- ' bullet lines for lists where useful. " +
          "Be concrete and specific to the inputs given — do not use generic filler.",
      },
      {
        role: "user",
        content:
          `Company: ${payload.COMPANY_NAME}\n` +
          `Industry: ${payload.INDUSTRY}\n` +
          `Goal: ${payload.GOAL}\n` +
          `Challenge: ${payload.CHALLENGE}`,
      },
    ],
  });

  const body = completion.choices[0]?.message?.content?.trim();
  if (!body) throw new Error("OpenAI returned no text content");
  return body;
}

export const generateCompanyReportTask = task({
  id: "generate-company-report",
  maxDuration: 300,
  machine: "small-2x",
  run: async (payload: Payload) => {
    logger.log("generate-company-report: starting", { payload });

    const missing = REQUIRED_FIELDS.filter((key) => !payload?.[key]?.trim());
    if (missing.length > 0) {
      const message = `Missing/empty required field(s): ${missing.join(", ")}`;
      logger.error("generate-company-report: invalid payload", { missing });
      throw new Error(message);
    }

    let reportBody: string;
    try {
      reportBody = await synthesizeReport(payload);
      logger.log("generate-company-report: synthesis complete", { length: reportBody.length });
    } catch (error) {
      logger.error("generate-company-report: synthesis failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    let buffer: Buffer;
    try {
      buffer = await buildReportDocx({ ...payload, reportBody });
      logger.log("generate-company-report: docx built", { bytes: buffer.length });
    } catch (error) {
      logger.error("generate-company-report: docx build failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }

    try {
      const fileName = sanitizeFileName(
        `${payload.COMPANY_NAME} - Report - ${new Date().toISOString().slice(0, 10)}.docx`
      );
      const file = await uploadDocxToDrive(buffer, fileName);
      logger.log("generate-company-report: uploaded to Drive", file);
      return { status: "ok" as const, ...file, fileName };
    } catch (error) {
      logger.error("generate-company-report: drive upload failed", {
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  },
});
