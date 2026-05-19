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
      'Content-Type': 'application/json'
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

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

async function getWorksheetHeaders(sheetsClient, spreadsheetId, worksheetName) {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!1:1`
  });

  const headers = response.data.values?.[0]?.map((value) => String(value || '').trim()).filter(Boolean) || [];

  if (!headers.length) {
    throw new Error('The target worksheet is missing row 1 headers.');
  }

  return headers;
}

async function hasExistingEmail(sheetsClient, spreadsheetId, worksheetName, emailColumnIndex, email) {
  const columnLetter = String.fromCharCode(65 + emailColumnIndex);
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!${columnLetter}4:${columnLetter}`
  });

  const existingValues = response.data.values || [];
  const normalizedTarget = normalizeEmail(email);

  return existingValues.some(([value]) => normalizeEmail(value) === normalizedTarget);
}

function normalizeValue(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }

  if (Array.isArray(value) || typeof value === 'object') {
    return JSON.stringify(value);
  }

  return String(value);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers: {
        Allow: 'POST, OPTIONS'
      }
    };
  }

  if (event.httpMethod !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed.' });
  }

  const missingEnvVars = getMissingEnvVars();
  if (missingEnvVars.length) {
    return jsonResponse(500, {
      error: `Missing required environment variables: ${missingEnvVars.join(', ')}`
    });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return jsonResponse(400, { error: 'Invalid JSON request body.' });
  }

  if (!payload || typeof payload !== 'object') {
    return jsonResponse(400, { error: 'Request body must be a JSON object.' });
  }

  if (!payload.submission_id || !payload.email) {
    return jsonResponse(400, { error: 'submission_id and email are required.' });
  }

  try {
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SHEETS_CLIENT_EMAIL,
      key: getPrivateKey(),
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheetsClient = google.sheets({ version: 'v4', auth });
    const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
    const worksheetName = process.env.GOOGLE_SHEETS_WORKSHEET_NAME || 'Survey Responses';
    const headers = await getWorksheetHeaders(sheetsClient, spreadsheetId, worksheetName);
    const emailColumnIndex = headers.findIndex((header) => header === 'email');

    if (emailColumnIndex === -1) {
      throw new Error('The target worksheet is missing the required email column.');
    }

    const duplicateEmail = await hasExistingEmail(
      sheetsClient,
      spreadsheetId,
      worksheetName,
      emailColumnIndex,
      payload.email
    );

    if (duplicateEmail) {
      return jsonResponse(409, {
        error: 'A survey response has already been saved for this email address.',
        code: 'DUPLICATE_EMAIL'
      });
    }

    const rowValues = headers.map((header) => normalizeValue(payload[header]));

    await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${worksheetName}!A:A`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: {
        values: [rowValues]
      }
    });

    return jsonResponse(200, {
      ok: true,
      worksheetName,
      submissionId: payload.submission_id
    });
  } catch (error) {
    console.error('submit-survey failed', error);
    return jsonResponse(500, {
      error: 'Failed to append the survey response to Google Sheets.'
    });
  }
};
