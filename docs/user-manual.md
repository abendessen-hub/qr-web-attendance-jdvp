# JDVP Attendance Monitoring System — User Manual
**Luis Y. Ferrer Jr. Senior High School**  
**Track/Section:** ICT-CP 12-KOTLIN  
**Adviser/Subject Teacher:** Mr. Zander Allen Flores  

---

## 👥 Project Team & Attribution

### Group NEXUS
| Role | Name | Responsibilities |
| :--- | :--- | :--- |
| **Project Leader** | **Henrich Gutierrez Angeles** | Project coordination, system architecture, core integration |
| **Senior Programmer** | **Gabriel Luis Pineda** | Documentation Paper, Beta Tester, API Borrower, Code Inspector |
| **Junior Programmer** | **Martin A. Cubol** | Frontend scripting, QR scanning modules, bug fixes |
| **Analyst** | **Criz Darwin B. Aceres** | Requirements gathering, process mapping, data validation |
| **UI/UX Designer** | **Aniel John Menorca** | Responsive UI design, print layouts, component styling |
| **Secretary** | **Camille Cabamongan** | Technical documentation, user manuals, project records |

### Support Members
* **Joriel Gonzales**
* **Eduard Solomon**

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

## 3. Generating QR Badges & Printing
Navigate to **Generate QR** from the main menu:

### Generating a Single Badge:
1. Enter a 4-digit Student Badge ID (e.g. `0001` to `0400`).
2. Click **Generate**. The QR code preview card appears below.
3. Click **Download PNG** to save the QR badge image (`0001.png`).

### Generating a Batch Range & Printing Badges:
1. Under **A range of students**, enter the starting ID in **From** (e.g. `0001`) and the ending ID in **To** (e.g. `0400`).
2. Click **Generate range**. A live progress bar displays generation status across the screen grid.
3. Once generated:
   - Click **Download ZIP** to export a compressed `.zip` file containing individual PNG badge files (e.g., `jdvp-qr-codes-0001-to-0400.zip`).
   - Click **Print sheet (A4)** to open the browser print window. The layout is optimized for standard **A4 paper** fitting 12 QR badges per page (3 columns x 4 rows) with centered alignment and cutting guides.

*Note: Qualification and trainee identity are bound automatically when the 4-digit badge is scanned for the first time on the Scan QR page.*

---

## 4. Attendance Scanning & Trainee Registration Workflow
Navigate to **Scan QR** from the main menu:

1. **Camera Access:** Allow camera permissions when prompted by your browser (requires HTTPS or localhost connection).
2. **Scanning Methods:**
   - **Continuous Camera Scanner:** Hold the trainee's QR code in front of the camera view.
   - **Snap Photo of QR:** Tap **📸 Snap Photo of QR** to capture a high-resolution snapshot frame. Tap **↩ Undo / Retake Photo** to return to live scanning.
   - **Choose Photo File:** Tap **📁 Choose Photo** to upload or select a QR image from your device gallery.
   - **Flashlight:** Tap **Flashlight** on supported mobile devices to toggle the camera flash in low-light environments.

### On-the-Fly Trainee Quick Registration:
When an unregistered 4-digit badge (e.g. `0001`) is scanned for the first time:
1. A **Register Trainee** modal pops up automatically.
2. The scanned 4-digit badge is displayed in **Scanned 4-Digit Badge** (e.g. `0001`).
3. Select the student's **Qualification** from the dropdown menu (e.g. `6 - Shielded Metal Arc Welding (SMAW) NC II`).
4. The system automatically calculates and previews the assigned **5-Digit Trainee ID** (e.g. `60001`, combining the qualification prefix `6` + `0001`).
5. Enter the student's **Full Name** (e.g., `Juan Dela Cruz`).
6. Click **Register & Record Attendance**. The student is registered into their qualification's Google Sheet tab, and their **Time In** is logged immediately.

### Scanning Status Alerts:
- **Time In (First scan of the day):**
  - **Green Alert:** `[Student Name] ([ID]) — Time In: [HH:MM AM/PM]`
  - Records student info and Time In timestamp in their qualification sheet.
- **Scan Before 3:00 PM:**
  - **Yellow Alert:** `Not Time out yet`
  - Keeps initial Time In intact without recording Time Out.
- **Valid Time Out (3:00 PM – 5:00 PM):**
  - **Green Alert:** `[Student Name] ([ID]) — Time Out: [HH:MM AM/PM]`
  - Updates today's entry with the Time Out timestamp.
- **Already Completed for Today:**
  - **Yellow Alert:** `Attendance already completed for today.`
  - Prevents duplicate logs.
- **Unregistered Badge:**
  - **Red Alert:** `Badge [ID] is not registered yet.` Opens the quick registration modal.

### Manual Entry Fallback:
If the camera is unavailable or a badge is damaged:
1. Enter the 4-digit badge (e.g. `0001`) or 5-digit Trainee ID (e.g. `60001`) into the manual input box under **Camera not working?**.
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
5. Copy the deployed Web App URL (`.../exec`) and set it as `API_URL` in your Netlify environment settings.
