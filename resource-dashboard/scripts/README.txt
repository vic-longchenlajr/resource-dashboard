===============================================
  Resource Dashboard - Fire Suppression Tech
===============================================

QUICK START:
  1. Double-click "Start Dashboard.bat"
  2. Your browser will open to the dashboard
  3. To stop: close the command window or
     double-click "Stop Dashboard.bat"

FIRST TIME SETUP:
  1. Start the dashboard
  2. Click "Import" in the sidebar
  3. Drag your LiquidPlanner CSV exports onto
     the import area
  4. Click "Dashboard" to view your data

REQUIREMENTS:
  - Windows 10 or later
  - Chrome, Edge, or Firefox browser
  - PowerShell 5.1+ (included with Windows 10)
  - No installation or admin privileges required

NOTES:
  - Data is stored in your browser's local
    database (IndexedDB). Clearing browser
    data will erase imported timesheets.
  - The dashboard runs at http://localhost:4173
  - Only one instance can run at a time.

TROUBLESHOOTING:
  - If the browser doesn't open, manually go
    to http://localhost:4173
  - If you see a PowerShell security prompt,
    it is safe — the script only serves files
    from the app folder on localhost
  - If port 4173 is in use, run Stop Dashboard.bat
    first, then try again
  - If the dashboard doesn't start, make sure
    PowerShell is available (type "powershell"
    in Start menu to verify)
