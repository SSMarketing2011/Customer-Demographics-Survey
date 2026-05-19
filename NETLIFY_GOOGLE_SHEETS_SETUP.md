# Netlify and Google Sheets Setup

This survey is ready to deploy from GitHub to Netlify.

## 1. Push this folder to GitHub

- Create a new GitHub repository.
- Upload the contents of this project folder.

## 2. Connect the repo to Netlify

- In Netlify, choose `Add new site`.
- Import the GitHub repository.
- Build settings:
- Base directory: leave blank
- Publish directory: `.`
- Functions directory: `netlify/functions`

## 3. Prepare Google Sheets

- Upload `customer-survey-google-sheets-template.xlsx` into Google Sheets.
- Keep the worksheet name as `Survey Responses`, or set `GOOGLE_SHEETS_WORKSHEET_NAME` in Netlify to match your custom tab name.

## 4. Create a Google service account

- In Google Cloud, enable the Google Sheets API.
- Create a service account.
- Create a JSON key for that service account.
- Share the target Google Sheet with the service account email address so it can edit the file.

## 5. Add Netlify environment variables

Add these in Netlify Site settings > Environment variables:

- `GOOGLE_SHEETS_CLIENT_EMAIL`
- `GOOGLE_SHEETS_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_WORKSHEET_NAME` (optional if your sheet tab is still `Survey Responses`)

Notes:

- `GOOGLE_SHEETS_CLIENT_EMAIL` comes from the service account JSON.
- `GOOGLE_SHEETS_PRIVATE_KEY` comes from the service account JSON.
- When pasting the private key into Netlify, keep the full key including the begin and end lines.
- `GOOGLE_SHEETS_SPREADSHEET_ID` is the long ID from the Google Sheets URL.

## 6. Deploy

- Trigger a deploy in Netlify.
- Complete the survey on the deployed site.
- Each completed response will POST to `/.netlify/functions/submit-survey` and append a row in Google Sheets.

## Local preview note

The survey will not save to Google Sheets when opened with a basic static server. The save runs only once the site is deployed on Netlify, or when you run `netlify dev` locally.