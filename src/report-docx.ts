import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

export type ReportDocxInput = {
  COMPANY_NAME: string;
  INDUSTRY: string;
  GOAL: string;
  CHALLENGE: string;
  reportBody: string;
};

// Converts the model's lightweight-markdown output (## headings, - bullets,
// plain paragraphs) into docx paragraphs. Only supports what the synthesis
// prompt in generate-company-report.ts actually asks the model to produce.
function bodyToParagraphs(reportBody: string): Paragraph[] {
  return reportBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      if (line.startsWith("## ")) {
        return new Paragraph({
          text: line.slice(3).trim(),
          heading: HeadingLevel.HEADING_2,
        });
      }
      if (line.startsWith("- ")) {
        return new Paragraph({
          text: line.slice(2).trim(),
          bullet: { level: 0 },
        });
      }
      return new Paragraph({ text: line });
    });
}

export async function buildReportDocx(input: ReportDocxInput): Promise<Buffer> {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            text: input.COMPANY_NAME,
            heading: HeadingLevel.TITLE,
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Industry: ", bold: true }),
              new TextRun(input.INDUSTRY),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Goal: ", bold: true }),
              new TextRun(input.GOAL),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Challenge: ", bold: true }),
              new TextRun(input.CHALLENGE),
            ],
          }),
          new Paragraph({ text: "" }),
          ...bodyToParagraphs(input.reportBody),
        ],
      },
    ],
  });

  return Packer.toBuffer(doc);
}
