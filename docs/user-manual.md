# JDVP Attendance Monitoring System — User Manual
**Luis Y. Ferrer Jr. Senior High School**  
**Track/Section:** ICT-CP 12-KOTLIN  
**Adviser/Subject Teacher:** Mr. Zander Allen Flores  

---

## 1. System Overview
The **JDVP Attendance Monitoring System** is a web-based QR scanning and automated logging solution designed for the Joint Delivery Voucher Program (JDVP) at Luis Y. Ferrer Jr. Senior High School. The system replaces manual logbooks by reading unique student QR badges via camera and recording attendance in real-time to Google Sheets across 6 technical qualifications.

### Supported Qualifications:
| Number | Qualification | ID Prefix | Assigned Google Sheet |
| :---: | :--- | :---: | :--- |
| **1** | Cookery | `1` | `Cookery` |
| **2** | House Keeping | `2` | `House Keeping` |
| **3** | Computer System Servicing (CSS) | `3` | `CSS` |
| **4** | Electrical Installation and Maintenance (EIM) | `4` | `EIM` |
| **5** | Shielded Metal Arc Welding (SMAW) NC I | `5` | `SMAW NC I` |
| **6** | Shielded Metal Arc Welding (SMAW) NC II | `6` | `SMAW NC II` |

---

## 2. Operator Login & Access Control
The system is protected by 7 authorized operator accounts:

| Operator Account | Username | Password |
| :---: | :---: | :---: |
| Account 1 | `1trainee2026` | `2026` |
| Account 2 | `2trainee2026` | `2026` |
| Account 3 | `3trainee2026` | `2026` |
| Account 4 | `4trainee2026` | `2026` |
| Account 5 | `5trainee2026` | `2026` |
| Account 6 | `6trainee2026` | `2026` |
| Account 7 | `7trainee2026` | `2026` |

1. Open the website homepage (`/index.html`).
2. Enter your assigned username and password.
3. Click **Enter**. Successful authentication grants access to the dashboard.
4. Click **Log Out** in the main menu to end your session.

---

## 3. Registering Trainees & Generating QR Badges
Navigate to **Generate QR** from the main dashboard:

### Registering a New Trainee:
1. Select the student's **Qualification** from the dropdown menu (e.g. `6 - SMAW NC II`).
2. Type the trainee's **Full Name** (e.g., `Juan Dela Cruz`).
3. The system automatically fetches and displays the **Next Available ID** (e.g., `60001`).
4. Click **Register & Generate**.
5. The trainee's information is registered into Google Sheets (`Registry` tab), and their unique QR badge preview is displayed.
6. Click **Download PNG** to save the QR code image.

### Printing Badges on Standard A4 Paper:
1. Under **Registered trainees**, select the qualification you want to print (or select *All*).
2. Click **Load** to load the list of registered students.
3. Click **Print all badges**.
4. The system opens your browser print dialog pre-formatted for standard **A4 paper** (3 columns x 4 rows per sheet, centered with even margins and high-contrast cutting guides).

---

## 4. Attendance Scanning Workflow
Navigate to **Scan QR** from the main dashboard:

1. Select the technical **Qualification** from the dropdown menu (e.g., `1 - Cookery`, `2 - House Keeping`, `6 - SMAW NC II`).
   - A qualification must be selected before scanning or manual entry.
   - When a 4-digit badge (e.g., `0001`) is scanned, it is automatically mapped to the appropriate 5-digit Trainee ID for that qualification (e.g., `10001` for Cookery, `20001` for House Keeping).
2. Allow camera permissions when prompted by your browser (requires an HTTPS or localhost connection).
3. Point the device camera at the trainee's QR code.

### Scanning Status Indicators:
- **First Scan of the Day (Time In):**
  - **Green Alert:** `[Student Name] ([ID]) — Time In: [HH:MM AM/PM]`
  - Logged into the student's qualification sheet with `Time In` recorded and `Time Out` left blank.
- **Scan Before 3:00 PM:**
  - **Yellow Alert:** `Not Time out yet`
  - Existing Time In remains intact; Time Out is not recorded.
- **Valid Time Out (3:00 PM – 5:00 PM):**
  - **Green Alert:** `[Student Name] ([ID]) — Time Out: [HH:MM AM/PM]`
  - Updates the student's row for today with their `Time Out` timestamp.
- **Already Completed for Today:**
  - **Yellow Alert:** `Attendance already completed for today.`
  - Prevents accidental repeated scans from creating duplicates.
- **Unregistered Trainee Scan:**
  - **Red Alert:** `Trainee is not registered yet.`
  - A quick-registration popup opens automatically. Select the qualification, input the student's full name, and click **Register & Record Attendance**. The system registers the student and immediately records their Time In.

### Manual ID Entry Fallback:
If a camera is unavailable or a printed QR code is damaged:
1. Enter the 5-digit Trainee ID into the manual input box (e.g., `60001`).
2. Click **Record attendance**.

---

## 5. Attendance Progress Monitoring Dashboard
Navigate to **Progress** from the main dashboard:

1. **Summary Cards:** Displays live counts of Total Trainees Registered, Active Scans Today, and Total Historical Logs.
2. **Attendance Progress by Date:**
   - Displays a dynamic history table of each date and total students recorded.
   - Shows a visual horizontal bar chart comparing attendance across days.
3. **Qualification Progress:**
   - Visual progress bars comparing attendance numbers across all 6 JDVP specializations.
4. **Daily Student Attendance Table:**
   - Filter records by **Date** (defaults to all/selectable dates).
   - Filter records by **Qualification** (`Cookery`, `House Keeping`, `CSS`, `EIM`, `SMAW NC I`, `SMAW NC II`).
   - Search records in real-time by **Trainee ID** or **Student Name**.
   - View exact `Time In` and `Time Out` timestamps for each student.
   - Click **Refresh** to sync with Google Sheets.

---

## 6. Google Sheets Backend Setup
Inside your Google Sheet:
1. Open **Extensions** → **Apps Script**.
2. Replace all script contents with the provided `backend/Code.gs`.
3. Select the `setup` function from the dropdown toolbar and click **Run**.
   - This creates **EXACTLY the 6 qualification tabs** (`Cookery`, `House Keeping`, `CSS`, `EIM`, `SMAW NC I`, `SMAW NC II`).
   - Each sheet is initialized with the exact 5 columns: `Trainee ID | Name | Date | Time In | Time Out`.
4. Click **Deploy** → **New deployment**:
   - Select type: **Web app**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the deployed Web App URL (`.../exec`) and set it as `API_URL` in your Vercel project environment variables.
