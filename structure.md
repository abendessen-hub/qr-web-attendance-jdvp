jdvp-attendance/
├── index.html              ← home: [Scan] [Generate] [Records]
├── scan.html               ← Option 1: camera scanner
├── generate.html           ← Option 2: QR code generator
├── records.html            ← view / search / filter attendance
├── css/
│   └── style.css
├── js/
│   ├── config.js           ← Apps Script /exec URL, MAX_ID = 400
│   ├── scan.js             ← camera → send ID → show result
│   ├── generate.js         ← single / range QR, ZIP download, print sheet
│   └── records.js          ← load rows, search by ID, filter by date
├── lib/
│   ├── html5-qrcode.min.js
│   ├── qrcode.min.js
│   └── jszip.min.js
├── backend/
│   └── Code.gs             ← doPost (record scan), doGet (return records)
└── docs/
    └── user-manual.md      ← required deliverable