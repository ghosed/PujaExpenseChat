/**
 * 2025 Puja Expense Google Spreadsheet - Webhook & Audit Sync
 * ------------------------------------------------------------
 * Attach this script to your Google Spreadsheet via Extensions > Apps Script.
 * 
 * Functions:
 * 1. onEdit(e): Triggered whenever any cell is modified.
 * 2. Logs changes to an 'Audit Log' sheet with Timestamp, User, Range, Old Value, and New Value.
 * 3. Sends an HTTP POST Webhook payload to the Puja Chatbot service to instantly refresh cache.
 */

// Replace with your deployed Puja Chatbot Webhook URL
// E.g., "https://ais-pre-4m5e2x2p3ikja7yvjshbdo-374154763775.us-east5.run.app/api/webhook/refresh"
var WEBHOOK_URL = "YOUR_CHATBOT_WEBHOOK_URL/api/webhook/refresh";

/**
 * Triggered on spreadsheet edits
 */
function onEdit(e) {
  if (!e || !e.range) return;
  
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();
  
  // Prevent infinite loops on Audit Log sheet edits
  if (sheetName === "Audit Log") {
    return;
  }
  
  var timestamp = new Date();
  var user = Session.getActiveUser().getEmail() || "Anonymous / Editor";
  var cellA1 = e.range.getA1Notation();
  var oldValue = e.oldValue || "";
  var newValue = e.value || "";
  
  // 1. Log to Audit Log sheet
  try {
    logToAuditSheet(timestamp, user, sheetName, cellA1, oldValue, newValue);
  } catch (err) {
    Logger.log("Audit log error: " + err.toString());
  }
  
  // 2. Trigger webhook cache invalidation
  try {
    triggerWebhook(sheetName, cellA1, user, timestamp);
  } catch (err) {
    Logger.log("Webhook error: " + err.toString());
  }
}

/**
 * Creates or appends to the Audit Log sheet
 */
function logToAuditSheet(timestamp, user, sheetName, cellA1, oldValue, newValue) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var auditSheet = ss.getSheetByName("Audit Log");
  
  if (!auditSheet) {
    auditSheet = ss.insertSheet("Audit Log");
    auditSheet.appendRow(["Timestamp", "User Email", "Sheet", "Cell Range", "Old Value", "New Value"]);
    auditSheet.getRange("A1:F1").setFontWeight("bold").setBackground("#F3F4F6");
    auditSheet.setFrozenRows(1);
  }
  
  auditSheet.appendRow([
    timestamp,
    user,
    sheetName,
    cellA1,
    oldValue,
    newValue
  ]);
}

/**
 * Sends POST request to the Chatbot Webhook endpoint
 */
function triggerWebhook(sheetName, cellA1, user, timestamp) {
  if (!WEBHOOK_URL || WEBHOOK_URL.indexOf("YOUR_CHATBOT") !== -1) {
    Logger.log("Webhook URL not configured yet.");
    return;
  }
  
  var payload = {
    event: "sheet_edit",
    sheet: sheetName,
    cell: cellA1,
    user: user,
    timestamp: timestamp.toISOString()
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  var response = UrlFetchApp.fetch(WEBHOOK_URL, options);
  Logger.log("Webhook response code: " + response.getResponseCode());
}

/**
 * Manual test function to trigger webhook from Apps Script editor
 */
function testWebhook() {
  triggerWebhook("Transactions", "E2", Session.getActiveUser().getEmail(), new Date());
}
