# JDVP Attendance

## Run locally

1. Install Node.js 20 or later.
2. Install the project dependencies:

   ```sh
   npm ci
   ```

3. Create a `.env` file in the project root (copy `.env.example`) and set:
   - `PASSWORDS`: one or more comma-separated access passwords.
   - `AUTH_SECRET`: a long, random secret used to sign login cookies.
   - `API_URL`: the deployed Google Apps Script Web App URL.
4. Start the site and its Netlify Functions:

   ```sh
   npm run dev
   ```

   Open `http://localhost:8888`. The functions require Netlify Dev; opening
   `index.html` directly will not provide authentication or API configuration.

The local `.env` file is ignored by Git. Do not use the temporary `0000`
password for a public deployment.