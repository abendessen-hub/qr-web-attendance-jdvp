# JDVP Attendance

## Run locally

1. Install Node.js 20 or later.
2. Install the project dependencies:

   ```sh
   npm ci
   ```

3. Create a `.env` file in the project root from `.env.example` and set:
   - `ACCOUNTS`: comma-separated `username:password:qualification` entries, where qualification is `1`–`6`; use `all` for an administrator. Legacy `username:password` entries are assigned by list order (entries 1–6 get their matching qualification and entry 7 is administrator).
   - `AUTH_SECRET`: a long, random secret used to sign login cookies.
   - `API_URL`: the deployed Google Apps Script Web App URL.
4. Start the site and its Vercel Functions:

   ```sh
   npm run server
   ```

   Open `http://localhost:3000`. The functions require Vercel Dev; opening
   `index.html` directly will not provide authentication or API configuration.

The local `.env` file is ignored by Git. Replace the example account values with
strong credentials before deployment.

Each account's qualification is enforced by the authenticated API, including
attendance and trainee registration. Accounts 1–6 have Time In and Time Out
windows enforced in Apps Script (Time In 7:00 AM–3:00 PM; Time Out 3:00 PM–10:00 PM);
Account 7 can scan at any time. Put the
qualification number in each account entry explicitly to avoid relying on list
order. The Apps Script Web App is public to support the proxy, so direct calls
to its URL can bypass account restrictions.

The scan page uses the `qr-scanner` browser module. Keep its worker file beside
the module under `back-end/lib` when updating the dependency.

## Deploy to Vercel

Import this repository in Vercel with the **Other** framework preset. Keep the
root directory as `.`, leave the build command empty, and set the output
directory to `.`. Add `ACCOUNTS`, `AUTH_SECRET`, and `API_URL` as project
environment variables for Production, Preview, and Development as appropriate.
Do not commit `.env` or put secrets in `vercel.json`.