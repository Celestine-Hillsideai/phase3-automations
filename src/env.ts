function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  get openaiApiKey() {
    return requireEnv("OPENAI_API_KEY");
  },
  get firecrawlApiKey() {
    return requireEnv("FIRECRAWL_API_KEY");
  },
  get googleSheetsClientId() {
    return requireEnv("GOOGLE_SHEETS_CLIENT_ID");
  },
  get googleSheetsClientSecret() {
    return requireEnv("GOOGLE_SHEETS_CLIENT_SECRET");
  },
  get googleSheetsRefreshToken() {
    return requireEnv("GOOGLE_SHEETS_REFRESH_TOKEN");
  },
  get googleSheetsSpreadsheetId() {
    return requireEnv("GOOGLE_SHEETS_SPREADSHEET_ID");
  },
  get googleDriveFolderId() {
    return requireEnv("GOOGLE_DRIVE_FOLDER_ID");
  },
};
