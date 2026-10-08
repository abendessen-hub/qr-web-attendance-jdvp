# JDVP Attendance

## Run locally

1. Install Node.js 20 or later.
2. Install the project dependencies:

   ```sh
   npm ci
   ```

3. Create a `.env` file in the project root from `.env.example` and set:
   - `ACCOUNTS`: comma-separated `username:password` pairs.
   - `AUTH_SECRET`: a long, random secret used to sign login cookies.
   - `API_URL`: the deployed Google Apps Script Web App URL.
4. Start the site and its Vercel Functions:

   ```sh
   npm run serve
   ```

   Open `http://localhost:3000`. The functions require Vercel Dev; opening
   `index.html` directly will not provide authentication or API configuration.

The local `.env` file is ignored by Git. Replace the example account values with
strong credentials before deployment.

## Deploy to Vercel

Import this repository in Vercel with the **Other** framework preset. Keep the
root directory as `.`, leave the build command empty, and set the output
directory to `.`. Add `ACCOUNTS`, `AUTH_SECRET`, and `API_URL` as project
environment variables for Production, Preview, and Development as appropriate.
Do not commit `.env` or put secrets in `vercel.json`.