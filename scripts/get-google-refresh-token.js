// One-time helper: obtains a Google OAuth refresh token for Sheets access.
// Run with: npm run google:auth
// Requires GOOGLE_SHEETS_CLIENT_ID and GOOGLE_SHEETS_CLIENT_SECRET already set in .env.

const fs = require("fs");
const path = require("path");
const http = require("http");
const { google } = require("googleapis");

const PORT = 3577;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];

function loadDotEnv() {
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
    if (!match) continue;
    const [, key, rawValue = ""] = match;
    if (process.env[key] === undefined) {
      process.env[key] = rawValue.replace(/^["']|["']$/g, "");
    }
  }
}

loadDotEnv();

const clientId = process.env.GOOGLE_SHEETS_CLIENT_ID;
const clientSecret = process.env.GOOGLE_SHEETS_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Missing GOOGLE_SHEETS_CLIENT_ID / GOOGLE_SHEETS_CLIENT_SECRET in .env"
  );
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

const authUrl = oAuth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: SCOPES,
});

console.log("\nOpen this URL, sign in, and grant access:\n");
console.log(authUrl);
console.log(`\nWaiting for the redirect on ${REDIRECT_URI} ...\n`);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/oauth2callback") {
    res.writeHead(404);
    res.end();
    return;
  }

  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/plain" });
    res.end(`Authorization failed: ${error}`);
    console.error(`Authorization failed: ${error}`);
    server.close();
    process.exit(1);
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Authorized. You can close this tab and return to the terminal.");

    if (!tokens.refresh_token) {
      console.error(
        "\nNo refresh_token returned. Revoke prior access at https://myaccount.google.com/permissions and re-run this script."
      );
      server.close();
      process.exit(1);
    }

    console.log("\nAdd this to your .env:\n");
    console.log(`GOOGLE_SHEETS_REFRESH_TOKEN=${tokens.refresh_token}\n`);
  } catch (err) {
    res.writeHead(500, { "Content-Type": "text/plain" });
    res.end("Token exchange failed.");
    console.error("Token exchange failed:", err.message);
  } finally {
    server.close();
  }
});

server.listen(PORT);
