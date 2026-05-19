const { google } = require('googleapis');

const REQUIRED_ENV_VARS = [
  'GOOGLE_SHEETS_CLIENT_EMAIL',
  'GOOGLE_SHEETS_PRIVATE_KEY',
  'GOOGLE_SHEETS_SPREADSHEET_ID'
];

function jsonResponse(statusCode, payload) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store'
    },
    body: JSON.stringify(payload)
  };
}

function getMissingEnvVars() {
  return REQUIRED_ENV_VARS.filter((name) => !process.env[name]);
}

function getPrivateKey() {
  return String(process.env.GOOGLE_SHEETS_PRIVATE_KEY || '').replace(/\\n/g, '\n');
}

function getAccessTokenFromRequest(event) {
  const authHeader = String(event.headers?.authorization || event.headers?.Authorization || '');
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    return authHeader.slice(7).trim();
  }

  return String(event.queryStringParameters?.token || '').trim();
}

async function getWorksheetHeaders(sheetsClient, spreadsheetId, worksheetName) {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!1:1`
  });

  const headers = response.data.values?.[0]?.map((value) => String(value || '').trim()) || [];
  return headers.filter(Boolean);
}

function mapRowsToObjects(headers, rows) {
  return rows
    .map((row) => {
      const entry = {};
      headers.forEach((header, index) => {
        entry[header] = String(row[index] || '').trim();
      });
      return entry;
    })
    .filter((entry) => entry.submission_id || entry.email);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'GET, OPTIONS'
      }
    };
  }

  if (event.httpMethod !== 'GET') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const expectedToken = String(process.env.DASHBOARD_ACCESS_TOKEN || '').trim();
  if (expectedToken) {
    const providedToken = getAccessTokenFromRequest(event);
    if (providedToken !== expectedToken) {
      return jsonResponse(401, { error: 'Unauthorized.' });
    }
  }

  const missingEnvVars = getMissingEnvVars();
  if (missingEnvVars.length) {
    return jsonResponse(500, {
      error: `Missing required environment variables: ${missingEnvVars.join(', ')}`
    });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      key: getPrivateKey(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly']
    });

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const worksheetName = process.env.GOOGLE_SHEETS_WORKSHEET_NAME || 'Survey Responses';

    const headers = await getWorksheetHeaders(sheetsClient, spreadsheetId, worksheetName);
    if (!headers.length) {
      return jsonResponse(500, { error: 'The target worksheet is missing row 1 headers.' });
    }

    const rowsResponse = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${worksheetName}!A4:ZZ`
    });

    const rows = rowsResponse.data.values || [];
    const entries = mapRowsToObjects(headers, rows);

    return jsonResponse(200, {
      ok: true,
      worksheetName,
      totalRows: entries.length,
      headers,
      entries
    });
  } catch (error) {
    console.error('get-dashboard-data failed', error);
    return jsonResponse(500, {
      error: 'Failed to load dashboard data from Google Sheets.'
    });
  }
};
