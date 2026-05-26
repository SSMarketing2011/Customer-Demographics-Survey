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

function normalizeKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
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

function toColumnLetter(columnNumber) {
  let current = Number(columnNumber) || 0;
  let result = '';

  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }

  return result;
}

async function findExistingEmailRow(sheetsClient, spreadsheetId, worksheetName, emailColumnIndex, email) {
  const columnLetter = toColumnLetter(emailColumnIndex + 1);
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!${columnLetter}4:${columnLetter}`
  });

  const existingValues = response.data.values || [];
  const normalizedTarget = normalizeEmail(email);

  for (let index = 0; index < existingValues.length; index += 1) {
    const value = existingValues[index]?.[0];
    if (normalizeEmail(value) === normalizedTarget) {
      return 4 + index;
    }
  }

  return null;
}

async function getRowValues(sheetsClient, spreadsheetId, worksheetName, rowNumber) {
  const response = await sheetsClient.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!A${rowNumber}:ZZ${rowNumber}`
  });

  return response.data.values?.[0] || [];
}

function mergeRowValues(existingRowValues, incomingRowValues) {
  return incomingRowValues.map((incomingValue, index) => {
    const normalizedIncoming = normalizeValue(incomingValue).trim();
    if (normalizedIncoming) {
      return normalizedIncoming;
    }

    return normalizeValue(existingRowValues[index]);
  });
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

const HEADER_KEY_ALIASES = {
  full_name: ['fullname', 'name'],
  first_name: ['firstname', 'first'],
  last_name: ['lastname', 'last', 'surname', 'family_name'],
  date_of_birth: ['dob', 'birth_date', 'dateofbirth'],
  family_status: ['marital_status', 'relationship_status'],
  marketing_opt_in: ['marketingoptin', 'opt_in', 'optin'],
  additional_info: ['comments', 'notes', 'feedback']
};

function getPayloadValueForHeader(payload, header) {
  if (!payload || !header) {
    return '';
  }

  if (Object.prototype.hasOwnProperty.call(payload, header)) {
    return payload[header];
  }

  const normalizedHeader = normalizeKey(header);
  if (!normalizedHeader) {
    return '';
  }

  const normalizedPayload = new Map();
  Object.keys(payload).forEach((key) => {
    normalizedPayload.set(normalizeKey(key), payload[key]);
  });

  if (normalizedPayload.has(normalizedHeader)) {
    return normalizedPayload.get(normalizedHeader);
  }

  const aliases = HEADER_KEY_ALIASES[normalizedHeader] || [];
  for (const alias of aliases) {
    const normalizedAlias = normalizeKey(alias);
    if (normalizedPayload.has(normalizedAlias)) {
      return normalizedPayload.get(normalizedAlias);
    }
  }

  return '';
}

function parseFullName(fullName) {
  const trimmed = String(fullName || '').trim();
  if (!trimmed) {
    return { first_name: '', last_name: '' };
  }

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) {
    return { first_name: parts[0], last_name: '' };
  }

  const lastName = parts[parts.length - 1];
  const firstName = parts.slice(0, -1).join(' ');

  return { first_name: firstName, last_name: lastName };
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
    const emailColumnIndex = headers.findIndex((header) => normalizeKey(header) === 'email');

    if (emailColumnIndex === -1) {
      throw new Error('The target worksheet is missing the required email column.');
    }

    const existingEmailRow = await findExistingEmailRow(
      sheetsClient,
      spreadsheetId,
      worksheetName,
      emailColumnIndex,
      payload.email
    );

    // Parse full_name into first_name and last_name if present
    const fullNameValue = getPayloadValueForHeader(payload, 'full_name');
    if (fullNameValue) {
      const { first_name, last_name } = parseFullName(fullNameValue);
      payload.first_name = first_name;
      payload.last_name = last_name;
    }

    const incomingRowValues = headers.map((header) => normalizeValue(getPayloadValueForHeader(payload, header)));

    if (existingEmailRow) {
      const existingRowValues = await getRowValues(sheetsClient, spreadsheetId, worksheetName, existingEmailRow);
      const mergedRowValues = mergeRowValues(existingRowValues, incomingRowValues);

      await sheetsClient.spreadsheets.values.update({
        spreadsheetId,
        range: `${worksheetName}!A${existingEmailRow}:ZZ${existingEmailRow}`,
        valueInputOption: 'USER_ENTERED',
        requestBody: {
          values: [mergedRowValues]
        }
      });
    } else {
      await sheetsClient.spreadsheets.values.append({
        spreadsheetId,
        range: `${worksheetName}!A:A`,
        valueInputOption: 'USER_ENTERED',
        insertDataOption: 'INSERT_ROWS',
        requestBody: {
          values: [incomingRowValues]
        }
      });
    }

    return jsonResponse(200, {
      ok: true,
      worksheetName,
      submissionId: payload.submission_id,
      merged: Boolean(existingEmailRow)
    });
  } catch (error) {
    console.error('submit-survey failed', error);
    return jsonResponse(500, {
      error: 'Failed to append the survey response to Google Sheets.'
    });
  }
};
