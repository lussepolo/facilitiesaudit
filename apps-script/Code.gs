// ══════════════════════════════════════════════════════════════════════════════
// ESCOLA CONCEPT, Auditoria de Espaços
// Google Apps Script v6.0 (v5.9: grava item_scores; v6.0: PDF diário e relatório semanal na identidade Concept, ver RelatoriosConcept.js)
// Google Sheets + Google Drive photo upload + Contractor PDF report
//
// Includes:
//   - Upsert by row_key
//   - Progressive save support
//   - Final completion support
//   - Three-photo backend support
//   - Daily contractor PDF report
//   - Date-by-date report generation
//   - Date dropdown selector in Relatório Diário!B3
//   - Robust date normalization for triggers and Sheets date cells
//   - São Paulo timezone
//   - Accepts both "note" and "notes" headers
//   - Reads photo links from raw URLs and HYPERLINK formulas
//   - Includes all completed audit rows for the selected date
//   - Clears old data validations before rebuilding Relatório Diário
//   - No master spreadsheet link in contractor email
//
// Required sheet tab:
//   Auditorias
//
// Internal report tab:
//   Relatório Diário
// ══════════════════════════════════════════════════════════════════════════════

const SHEET_NAME = "Auditorias";
const FOLDER_NAME = "Auditoria Espaços — Fotos";

const REPORT_SHEET_NAME = "Relatório Diário";
const CONTRACTOR_EMAIL = "mariana.coelho@conceptedu.com.br, robson.lopes@conceptedu.com.br, luciana.polonen@conceptedu.com.br";

// ─── Headers ─────────────────────────────────────────────────────────────────

const LEGACY_HEADERS = [
  "row_key",
  "id",
  "campus",
  "date",
  "slot_id",
  "slot_label",
  "auditor",
  "area_id",
  "area_label",
  "room_number",
  "area_score",
  "overall_score",
  "note",
  "photo_url",
  "created_at",
];

const NEW_HEADERS = [
  "photo_url_2",
  "photo_url_3",
  "updated_at",
  "area_submission_id",
  "save_type",
  "audit_status",
  "completed_at",
  "item_scores",
];

const HEADERS = [...LEGACY_HEADERS, ...NEW_HEADERS];

const REPORT_HEADERS = [
  "Rodada",
  "Área",
  "Sala / Ambiente",
  "Pontuação",
  "Status",
  "Observação",
  "Foto 1",
  "Foto 2",
  "Foto 3",
  "Ação esperada",
  "Status do fornecedor",
];

// ══════════════════════════════════════════════════════════════════════════════
// SHEET SETUP
// ══════════════════════════════════════════════════════════════════════════════

function getOrCreateSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    formatHeader(sheet);
    setColumnWidths(sheet);
    return sheet;
  }

  ensureHeaders(sheet);
  formatHeader(sheet);
  setColumnWidths(sheet);

  return sheet;
}

function ensureHeaders(sheet) {
  const lastColumn = sheet.getLastColumn();

  if (lastColumn === 0) {
    sheet.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    return;
  }

  const existingHeaders = sheet
    .getRange(1, 1, 1, Math.max(lastColumn, LEGACY_HEADERS.length))
    .getValues()[0]
    .map((header) => String(header || "").trim());

  const requiredLegacyHeaders = LEGACY_HEADERS.filter(
    (header) => header !== "note"
  );

  const missingLegacyHeaders = requiredLegacyHeaders.filter(
    (header) => !existingHeaders.includes(header)
  );

  const hasNoteOrNotes =
    existingHeaders.includes("note") || existingHeaders.includes("notes");

  if (!hasNoteOrNotes) {
    missingLegacyHeaders.push("note or notes");
  }

  if (missingLegacyHeaders.length > 0) {
    throw new Error(
      "Missing required legacy header(s): " +
        missingLegacyHeaders.join(", ") +
        ". Please update the Auditorias sheet headers before deploying."
    );
  }

  const currentLastColumn = sheet.getLastColumn();
  const currentHeaders = sheet
    .getRange(1, 1, 1, currentLastColumn)
    .getValues()[0]
    .map((header) => String(header || "").trim());

  const missingNewHeaders = NEW_HEADERS.filter(
    (header) => !currentHeaders.includes(header)
  );

  if (missingNewHeaders.length > 0) {
    sheet
      .getRange(1, currentLastColumn + 1, 1, missingNewHeaders.length)
      .setValues([missingNewHeaders]);
  }
}

function formatHeader(sheet) {
  const lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) return;

  const hdr = sheet.getRange(1, 1, 1, lastColumn);
  hdr.setBackground("#0F172A");
  hdr.setFontColor("#FFFFFF");
  hdr.setFontWeight("bold");
  hdr.setFontSize(10);
  sheet.setFrozenRows(1);
}

function setColumnWidths(sheet) {
  const widthMap = {
    row_key: 240,
    id: 180,
    campus: 70,
    date: 100,
    slot_id: 80,
    slot_label: 170,
    auditor: 150,
    area_id: 140,
    area_label: 230,
    room_number: 110,
    area_score: 100,
    overall_score: 110,
    note: 260,
    notes: 260,
    photo_url: 260,
    photo_url_2: 260,
    photo_url_3: 260,
    created_at: 190,
    updated_at: 190,
    area_submission_id: 270,
    save_type: 160,
    audit_status: 140,
    completed_at: 190,
  };

  const headerMap = getHeaderMap(sheet);

  Object.keys(widthMap).forEach((header) => {
    const column = headerMap[header];
    if (column) {
      sheet.setColumnWidth(column, widthMap[header]);
    }
  });
}

function getHeaderMap(sheet) {
  const headers = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map((header) => String(header || "").trim());

  const map = {};
  headers.forEach((header, index) => {
    if (header) map[header] = index + 1;
  });

  return map;
}

// ══════════════════════════════════════════════════════════════════════════════
// DRIVE PHOTO UPLOAD
// ══════════════════════════════════════════════════════════════════════════════

function getOrCreatePhotoFolder() {
  const folders = DriveApp.getFoldersByName(FOLDER_NAME);
  return folders.hasNext() ? folders.next() : DriveApp.createFolder(FOLDER_NAME);
}

function savePhotoToDrive(base64Data, fileName) {
  try {
    if (!base64Data || !String(base64Data).startsWith("data:image")) {
      return "";
    }

    const base64 = String(base64Data).replace(/^data:image\/\w+;base64,/, "");
    const bytes = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(bytes, "image/jpeg", fileName);
    const folder = getOrCreatePhotoFolder();
    const file = folder.createFile(blob);

    // MVP setting. Review with IT if photos may include identifiable people.
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return file.getUrl();
  } catch (err) {
    Logger.log("Photo upload failed: " + err.message);
    return "";
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// RECEIVE POST FROM NETLIFY APP
// ══════════════════════════════════════════════════════════════════════════════

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents || "{}");
    const rows = Array.isArray(data.rows) ? data.rows : [];

    if (rows.length === 0) {
      return jsonResponse({
        ok: false,
        error: "No rows received",
        rows_added: 0,
        rows_updated: 0,
        rows_skipped: 0,
      });
    }

    const sheet = getOrCreateSheet();
    const result = upsertRowsByRowKey(sheet, rows);

    return jsonResponse({
      ok: true,
      rows_added: result.rowsAdded,
      rows_updated: result.rowsUpdated,
      rows_skipped: result.rowsSkipped,
    });
  } catch (err) {
    return jsonResponse({
      ok: false,
      error: err.message,
      rows_added: 0,
      rows_updated: 0,
      rows_skipped: 0,
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// UPSERT ROWS BY row_key
// ══════════════════════════════════════════════════════════════════════════════

function upsertRowsByRowKey(sheet, rows) {
  const headerMap = getHeaderMap(sheet);
  const existingRowKeyMap = getExistingRowKeyMap(sheet, headerMap.row_key);

  let rowsAdded = 0;
  let rowsUpdated = 0;
  let rowsSkipped = 0;

  rows.forEach((r) => {
    const rowKey = buildRowKey(r);

    if (!rowKey) {
      rowsSkipped += 1;
      return;
    }

    const existingRowNumber = existingRowKeyMap[rowKey];

    const rowObject = buildRowObject(
      r,
      rowKey,
      sheet,
      existingRowNumber,
      headerMap
    );

    if (existingRowNumber) {
      updateExistingRow(sheet, existingRowNumber, rowObject, headerMap);
      rowsUpdated += 1;
      colorScoreCells(sheet, existingRowNumber, 1);
      linkPhotoCells(sheet, existingRowNumber, 1);
    } else {
      const newRowNumber = sheet.getLastRow() + 1;
      appendNewRow(sheet, newRowNumber, rowObject, headerMap);
      existingRowKeyMap[rowKey] = newRowNumber;
      rowsAdded += 1;
      colorScoreCells(sheet, newRowNumber, 1);
      linkPhotoCells(sheet, newRowNumber, 1);
    }
  });

  return {
    rowsAdded,
    rowsUpdated,
    rowsSkipped,
  };
}

function buildRowObject(r, rowKey, sheet, existingRowNumber, headerMap) {
  const now = new Date().toISOString();

  let existingCreatedAt = "";
  let existingPhotoUrl = "";
  let existingPhotoUrl2 = "";
  let existingPhotoUrl3 = "";

  if (existingRowNumber) {
    existingCreatedAt = getExistingCellValue(
      sheet,
      existingRowNumber,
      headerMap.created_at
    );

    existingPhotoUrl = getExistingPhotoUrl(
      sheet,
      existingRowNumber,
      headerMap.photo_url
    );

    existingPhotoUrl2 = getExistingPhotoUrl(
      sheet,
      existingRowNumber,
      headerMap.photo_url_2
    );

    existingPhotoUrl3 = getExistingPhotoUrl(
      sheet,
      existingRowNumber,
      headerMap.photo_url_3
    );
  }

  let photoUrl = existingPhotoUrl || "";
  let photoUrl2 = existingPhotoUrl2 || "";
  let photoUrl3 = existingPhotoUrl3 || "";

  if (r.photo_data && String(r.photo_data).startsWith("data:image")) {
    photoUrl = savePhotoToDrive(r.photo_data, buildPhotoFileName(r, "foto_1"));
  }

  if (r.photo_data_2 && String(r.photo_data_2).startsWith("data:image")) {
    photoUrl2 = savePhotoToDrive(
      r.photo_data_2,
      buildPhotoFileName(r, "foto_2")
    );
  }

  if (r.photo_data_3 && String(r.photo_data_3).startsWith("data:image")) {
    photoUrl3 = savePhotoToDrive(
      r.photo_data_3,
      buildPhotoFileName(r, "foto_3")
    );
  }

  const noteValue =
    r.note !== null && r.note !== undefined
      ? r.note
      : r.notes !== null && r.notes !== undefined
      ? r.notes
      : "";

  return {
    row_key: rowKey,
    id: r.id || "",
    campus: r.campus || "",
    date: r.date || "",
    slot_id: r.slot_id || "",
    slot_label: r.slot_label || "",
    auditor: r.auditor || "",
    area_id: r.area_id || "",
    area_label: r.area_label || "",
    room_number: r.room_number || "",
    area_score:
      r.area_score !== null && r.area_score !== undefined ? r.area_score : "",
    overall_score:
      r.overall_score !== null && r.overall_score !== undefined
        ? r.overall_score
        : "",
    note: noteValue,
    notes: noteValue,
    photo_url: photoUrl,
    photo_url_2: photoUrl2,
    photo_url_3: photoUrl3,
    created_at: r.created_at || existingCreatedAt || now,
    updated_at: r.updated_at || now,
    area_submission_id: r.area_submission_id || rowKey,
    save_type: r.save_type || "",
    audit_status: r.audit_status || "",
    completed_at: r.completed_at || "",
    item_scores: r.item_scores || "",
  };
}

function appendNewRow(sheet, rowNumber, rowObject, headerMap) {
  const lastColumn = sheet.getLastColumn();
  const values = new Array(lastColumn).fill("");

  Object.keys(rowObject).forEach((key) => {
    const col = headerMap[key];
    if (col) values[col - 1] = rowObject[key];
  });

  sheet.getRange(rowNumber, 1, 1, lastColumn).setValues([values]);
}

function updateExistingRow(sheet, rowNumber, rowObject, headerMap) {
  Object.keys(rowObject).forEach((key) => {
    const col = headerMap[key];
    if (!col) return;

    sheet.getRange(rowNumber, col).setValue(rowObject[key]);
  });
}

function getExistingCellValue(sheet, rowNumber, columnNumber) {
  if (!rowNumber || !columnNumber) return "";
  return sheet.getRange(rowNumber, columnNumber).getValue() || "";
}

function getExistingPhotoUrl(sheet, rowNumber, columnNumber) {
  if (!rowNumber || !columnNumber) return "";

  const cell = sheet.getRange(rowNumber, columnNumber);
  const formulaUrl = extractUrlFromHyperlinkFormula(cell.getFormula());

  if (formulaUrl) {
    return formulaUrl;
  }

  const value = String(cell.getValue() || "").trim();

  if (value.startsWith("http")) {
    return value;
  }

  return "";
}

function buildRowKey(r) {
  const id = String(r.id || "").trim();
  const areaId = String(r.area_id || "").trim();

  if (!id || !areaId) {
    return "";
  }

  return id + "_" + areaId;
}

function buildPhotoFileName(r, photoLabel) {
  const safe = (value) =>
    String(value || "")
      .trim()
      .replace(/[^\w.-]+/g, "_")
      .replace(/_+/g, "_");

  return (
    [
      safe(r.id),
      safe(r.date),
      safe(r.slot_id),
      safe(r.area_id),
      safe(r.save_type),
      safe(photoLabel),
      safe(new Date().toISOString()),
    ]
      .filter(Boolean)
      .join("_") + ".jpg"
  );
}

function getExistingRowKeyMap(sheet, rowKeyColumn) {
  if (!rowKeyColumn) {
    throw new Error("Missing row_key column");
  }

  const lastRow = sheet.getLastRow();

  if (lastRow < 2) {
    return {};
  }

  const values = sheet
    .getRange(2, rowKeyColumn, lastRow - 1, 1)
    .getValues()
    .flat();

  const map = {};

  values.forEach((value, index) => {
    const rowKey = String(value || "").trim();
    if (rowKey) {
      map[rowKey] = index + 2;
    }
  });

  return map;
}

// ══════════════════════════════════════════════════════════════════════════════
// SHEET FORMATTING
// ══════════════════════════════════════════════════════════════════════════════

function colorScoreCells(sheet, startRow, count) {
  const headerMap = getHeaderMap(sheet);
  const scoreColumns = [headerMap.area_score, headerMap.overall_score].filter(
    Boolean
  );

  for (let i = 0; i < count; i++) {
    const row = startRow + i;

    scoreColumns.forEach((col) => {
      const cell = sheet.getRange(row, col);
      const val = parseFloat(cell.getValue());

      if (isNaN(val)) return;

      if (val >= 4.5) {
        cell.setBackground("#DCFCE7");
        cell.setFontColor("#14532D");
      } else if (val >= 4.0) {
        cell.setBackground("#D1FAE5");
        cell.setFontColor("#065F46");
      } else if (val >= 3.0) {
        cell.setBackground("#FEF3C7");
        cell.setFontColor("#92400E");
      } else if (val >= 2.0) {
        cell.setBackground("#FFEDD5");
        cell.setFontColor("#9A3412");
      } else {
        cell.setBackground("#FEE2E2");
        cell.setFontColor("#991B1B");
      }

      cell.setFontWeight("bold");
    });
  }
}

function linkPhotoCells(sheet, startRow, count) {
  const headerMap = getHeaderMap(sheet);

  const photoColumns = [
    { col: headerMap.photo_url, label: "ver foto" },
    { col: headerMap.photo_url_2, label: "ver foto 2" },
    { col: headerMap.photo_url_3, label: "ver foto 3" },
  ].filter((item) => item.col);

  for (let i = 0; i < count; i++) {
    const row = startRow + i;

    photoColumns.forEach((item) => {
      const cell = sheet.getRange(row, item.col);
      const url = getExistingPhotoUrl(sheet, row, item.col);

      if (url && String(url).startsWith("http")) {
        cell.setFormula(`=HYPERLINK("${url}","${item.label}")`);
        cell.setFontColor("#1D4ED8");
      }
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// DAILY CONTRACTOR PDF REPORT
// ══════════════════════════════════════════════════════════════════════════════

function normalizeReportDate(targetDate) {
  if (
    typeof targetDate === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(targetDate)
  ) {
    return targetDate;
  }

  return getTodayDateString();
}

function normalizeSheetDateValue(value) {
  if (value instanceof Date) {
    return Utilities.formatDate(value, "America/Sao_Paulo", "yyyy-MM-dd");
  }

  const raw = String(value || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  const parsed = new Date(raw);

  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "America/Sao_Paulo", "yyyy-MM-dd");
  }

  return raw;
}

function getTodayDateString() {
  return Utilities.formatDate(
    new Date(),
    "America/Sao_Paulo",
    "yyyy-MM-dd"
  );
}

function generateDailyContractorReport(targetDate) {
  const sourceSheet = getOrCreateSheet();
  const reportSheet = getOrCreateReportSheet();

  const dateString = normalizeReportDate(targetDate);
  const sourceRange = sourceSheet.getDataRange();
  const sourceValues = sourceRange.getValues();
  const sourceFormulas = sourceRange.getFormulas();

  if (sourceValues.length < 2) {
    buildEmptyContractorReport(
      reportSheet,
      dateString,
      "Nenhum dado de auditoria encontrado."
    );

    setupReportDateDropdownValidationOnly(dateString);

    return {
      date: dateString,
      totalAudited: 0,
      issuesBelowFour: 0,
      criticalIssues: 0,
      areasWithPhotos: 0,
      rowsIncluded: 0,
      photoLinks: [],
    };
  }

  const headers = sourceValues[0].map((h) => String(h || "").trim());

  const rows = sourceValues.slice(1).map((row, i) => ({
    values: row,
    formulas: sourceFormulas.slice(1)[i] || [],
  }));

  const index = buildReportIndexMap(headers);

  validateReportRequiredColumns(index);

  const completedRowsForDate = rows.filter((item) => {
    const row = item.values;
    const rowDate = normalizeSheetDateValue(valueAtReport(row, index.date));
    const auditStatus = String(valueAtReport(row, index.audit_status)).trim();
    const saveType = String(valueAtReport(row, index.save_type)).trim();

    return (
      rowDate === dateString &&
      (auditStatus === "completed" || saveType === "final_completion")
    );
  });

  const reportRows = completedRowsForDate.sort((a, b) => {
    const scoreA = parseFloat(valueAtReport(a.values, index.area_score));
    const scoreB = parseFloat(valueAtReport(b.values, index.area_score));

    if (!isNaN(scoreA) && !isNaN(scoreB) && scoreA !== scoreB) {
      return scoreA - scoreB;
    }

    return String(valueAtReport(a.values, index.area_label)).localeCompare(
      String(valueAtReport(b.values, index.area_label)),
      "pt-BR"
    );
  });

  const summary = {
    date: dateString,
    totalAudited: completedRowsForDate.length,
    issuesBelowFour: completedRowsForDate.filter((item) => {
      const score = parseFloat(valueAtReport(item.values, index.area_score));
      return !isNaN(score) && score < 4;
    }).length,
    criticalIssues: completedRowsForDate.filter((item) => {
      const score = parseFloat(valueAtReport(item.values, index.area_score));
      return !isNaN(score) && score < 2;
    }).length,
    areasWithPhotos: completedRowsForDate.filter((item) =>
      hasAnyReportPhoto(item, index)
    ).length,
    rowsIncluded: reportRows.length,
    photoLinks: buildEmailPhotoLinks(reportRows, index),
  };

  buildContractorReportSheet(reportSheet, dateString, summary, reportRows, index);

  return summary;
}

function getOrCreateReportSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(REPORT_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(REPORT_SHEET_NAME);
  }

  return sheet;
}

function resetReportSheet(sheet) {
  const range = sheet.getRange(
    1,
    1,
    sheet.getMaxRows(),
    sheet.getMaxColumns()
  );

  try {
    range.breakApart();
  } catch (err) {
    // Ignore if there are no merged cells to break apart.
  }

  range.clearContent();
  range.clearFormat();
  range.clearDataValidations();
}

function buildContractorReportSheet(sheet, dateString, summary, rows, index) {
  resetReportSheet(sheet);

  sheet.getRange("A1").setValue("RELATÓRIO DIÁRIO DE FACILITIES");
  sheet.getRange("A2").setValue("Campus São Paulo");
  sheet.getRange("A3").setValue("Data");
  sheet.getRange("B3").setValue(dateString);

  sheet.getRange("A1:K1").merge();
  sheet.getRange("A2:K2").merge();

  sheet
    .getRange("A1")
    .setFontSize(16)
    .setFontWeight("bold")
    .setFontColor("#0F172A");

  sheet
    .getRange("A2")
    .setFontSize(11)
    .setFontColor("#475569");

  sheet.getRange("A3:B3").setFontWeight("bold");

  const summaryStartRow = 5;

  const summaryValues = [
    ["Resumo do dia", ""],
    ["Áreas auditadas", summary.totalAudited],
    ["Ocorrências abaixo de 4", summary.issuesBelowFour],
    ["Ocorrências críticas", summary.criticalIssues],
    ["Áreas com evidência fotográfica", summary.areasWithPhotos],
    ["Itens no relatório", summary.rowsIncluded],
  ];

  sheet
    .getRange(summaryStartRow, 1, summaryValues.length, 2)
    .setValues(summaryValues);

  sheet
    .getRange(summaryStartRow, 1, 1, 2)
    .setBackground("#0F172A")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold");

  sheet
    .getRange(summaryStartRow + 1, 1, summaryValues.length - 1, 2)
    .setBackground("#F8FAFC")
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#CBD5E1",
      SpreadsheetApp.BorderStyle.SOLID
    );

  sheet
    .getRange(summaryStartRow + 1, 1, summaryValues.length - 1, 1)
    .setFontWeight("bold");

  const tableTitleRow = summaryStartRow + summaryValues.length + 2;

  sheet.getRange(tableTitleRow, 1).setValue("Relatório completo da auditoria");

  sheet
    .getRange(tableTitleRow, 1, 1, REPORT_HEADERS.length)
    .merge()
    .setFontWeight("bold")
    .setFontSize(13)
    .setFontColor("#0F172A");

  const tableHeaderRow = tableTitleRow + 1;

  sheet
    .getRange(tableHeaderRow, 1, 1, REPORT_HEADERS.length)
    .setValues([REPORT_HEADERS])
    .setBackground("#1F4E79")
    .setFontColor("#FFFFFF")
    .setFontWeight("bold")
    .setFontSize(10)
    .setWrap(true)
    .setVerticalAlignment("middle");

  if (rows.length === 0) {
    sheet
      .getRange(tableHeaderRow + 1, 1)
      .setValue("Nenhuma auditoria concluída para esta data.");

    sheet
      .getRange(tableHeaderRow + 1, 1, 1, REPORT_HEADERS.length)
      .merge();

    sheet
      .getRange(tableHeaderRow + 1, 1)
      .setFontColor("#64748B")
      .setFontStyle("italic");

    sheet.setFrozenRows(tableHeaderRow);
    setContractorReportColumnWidths(sheet);
    setupReportDateDropdownValidationOnly(dateString);
    return;
  }

  const tableValues = rows.map((item) => buildContractorReportRow(item, index));

  sheet
    .getRange(tableHeaderRow + 1, 1, tableValues.length, REPORT_HEADERS.length)
    .setValues(tableValues);

  applyContractorReportFormatting(sheet, tableHeaderRow + 1, tableValues.length);

  setContractorReportColumnWidths(sheet);
  sheet.setFrozenRows(tableHeaderRow);
  setupReportDateDropdownValidationOnly(dateString);
}

function buildContractorReportRow(item, index) {
  const row = item.values;
  const formulaRow = item.formulas;

  const score = parseFloat(valueAtReport(row, index.area_score));
  const observation = valueAtAnyReport(row, index, ["note", "notes"]);

  const photoUrl1 = getPhotoUrlForReport(row, formulaRow, index, "photo_url");
  const photoUrl2 = getPhotoUrlForReport(row, formulaRow, index, "photo_url_2");
  const photoUrl3 = getPhotoUrlForReport(row, formulaRow, index, "photo_url_3");

  return [
    valueAtReport(row, index.slot_label),
    valueAtReport(row, index.area_label),
    valueAtReport(row, index.room_number),
    isNaN(score) ? "" : score,
    getContractorScoreStatus(score),
    observation,
    photoFormulaForReport(photoUrl1, "ver foto"),
    photoFormulaForReport(photoUrl2, "ver foto 2"),
    photoFormulaForReport(photoUrl3, "ver foto 3"),
    suggestContractorExpectedAction(score, observation),
    "Pendente",
  ];
}

function applyContractorReportFormatting(sheet, startRow, count) {
  const scoreCol = 4;
  const statusCol = 5;
  const notesCol = 6;
  const actionCol = 10;
  const supplierStatusCol = 11;

  const bodyRange = sheet.getRange(startRow, 1, count, REPORT_HEADERS.length);

  bodyRange
    .setFontSize(10)
    .setVerticalAlignment("middle")
    .setWrap(true)
    .setBorder(
      true,
      true,
      true,
      true,
      true,
      true,
      "#E2E8F0",
      SpreadsheetApp.BorderStyle.SOLID
    );

  for (let i = 0; i < count; i++) {
    const rowNumber = startRow + i;

    const scoreCell = sheet.getRange(rowNumber, scoreCol);
    const statusCell = sheet.getRange(rowNumber, statusCol);
    const supplierStatusCell = sheet.getRange(rowNumber, supplierStatusCol);

    const score = parseFloat(scoreCell.getValue());

    if (!isNaN(score)) {
      if (score < 2) {
        scoreCell.setBackground("#FEE2E2").setFontColor("#991B1B");
        statusCell.setBackground("#FEE2E2").setFontColor("#991B1B");
      } else if (score < 3) {
        scoreCell.setBackground("#FFEDD5").setFontColor("#9A3412");
        statusCell.setBackground("#FFEDD5").setFontColor("#9A3412");
      } else if (score < 4) {
        scoreCell.setBackground("#FEF3C7").setFontColor("#92400E");
        statusCell.setBackground("#FEF3C7").setFontColor("#92400E");
      } else {
        scoreCell.setBackground("#DCFCE7").setFontColor("#14532D");
        statusCell.setBackground("#DCFCE7").setFontColor("#14532D");
      }

      scoreCell.setFontWeight("bold");
      statusCell.setFontWeight("bold");
    }

    supplierStatusCell.setBackground("#F8FAFC").setFontColor("#475569");
  }

  sheet.getRange(startRow, notesCol, count, 1).setWrap(true);
  sheet.getRange(startRow, actionCol, count, 1).setWrap(true);
}

function setContractorReportColumnWidths(sheet) {
  const widths = [
    230,
    250,
    140,
    100,
    160,
    340,
    110,
    110,
    110,
    300,
    190,
  ];

  widths.forEach((width, index) => {
    sheet.setColumnWidth(index + 1, width);
  });
}

function buildEmptyContractorReport(sheet, dateString, message) {
  resetReportSheet(sheet);

  sheet.getRange("A1").setValue("RELATÓRIO DIÁRIO DE FACILITIES");
  sheet.getRange("A2").setValue("Campus São Paulo");
  sheet.getRange("A3").setValue("Data");
  sheet.getRange("B3").setValue(dateString);
  sheet.getRange("A5").setValue(message);

  sheet
    .getRange("A1")
    .setFontSize(16)
    .setFontWeight("bold")
    .setFontColor("#0F172A");

  sheet.getRange("A2").setFontColor("#475569");
  sheet.getRange("A5").setFontStyle("italic").setFontColor("#64748B");

  setupReportDateDropdownValidationOnly(dateString);
}

function hasAnyReportPhoto(item, index) {
  const row = item.values;
  const formulaRow = item.formulas;

  return Boolean(
    getPhotoUrlForReport(row, formulaRow, index, "photo_url") ||
      getPhotoUrlForReport(row, formulaRow, index, "photo_url_2") ||
      getPhotoUrlForReport(row, formulaRow, index, "photo_url_3")
  );
}

function getContractorScoreStatus(score) {
  if (isNaN(score)) return "";
  if (score < 2) return "Crítico";
  if (score < 3) return "Urgente";
  if (score < 4) return "Requer correção";
  return "Adequado";
}

function suggestContractorExpectedAction(score, observation) {
  if (!isNaN(score) && score < 2) {
    return "Corrigir com prioridade e confirmar retorno.";
  }

  if (!isNaN(score) && score < 3) {
    return "Corrigir no mesmo dia e registrar devolutiva.";
  }

  if (!isNaN(score) && score < 4) {
    return "Revisar o ponto indicado e corrigir na próxima rodada operacional.";
  }

  if (String(observation || "").trim()) {
    return "Verificar observação registrada e retornar quando aplicável.";
  }

  return "";
}

function extractUrlFromHyperlinkFormula(formula) {
  const text = String(formula || "").trim();

  if (!text) return "";

  const match = text.match(/=HYPERLINK\("([^"]+)"/i);

  if (match && match[1]) {
    return match[1];
  }

  return "";
}

function getPhotoUrlForReport(row, formulaRow, index, headerName) {
  const colIndex = index[headerName];

  if (colIndex === undefined || colIndex === null) {
    return "";
  }

  const formulaUrl = extractUrlFromHyperlinkFormula(formulaRow[colIndex]);

  if (formulaUrl) {
    return formulaUrl;
  }

  const rawValue = String(row[colIndex] || "").trim();

  if (rawValue.startsWith("http")) {
    return rawValue;
  }

  return "";
}

function photoFormulaForReport(url, label) {
  const cleanUrl = String(url || "").trim();

  if (!cleanUrl || !cleanUrl.startsWith("http")) {
    return "";
  }

  return `=HYPERLINK("${cleanUrl}","${label}")`;
}

function buildEmailPhotoLinks(items, index) {
  const links = [];

  items.forEach((item) => {
    const row = item.values;
    const formulaRow = item.formulas;

    const area = valueAtReport(row, index.area_label);
    const slot = valueAtReport(row, index.slot_label);

    const photoFields = [
      {
        label: "Foto 1",
        value: getPhotoUrlForReport(row, formulaRow, index, "photo_url"),
      },
      {
        label: "Foto 2",
        value: getPhotoUrlForReport(row, formulaRow, index, "photo_url_2"),
      },
      {
        label: "Foto 3",
        value: getPhotoUrlForReport(row, formulaRow, index, "photo_url_3"),
      },
    ];

    photoFields.forEach((photo) => {
      const url = String(photo.value || "").trim();

      if (url && url.startsWith("http")) {
        links.push({
          area,
          slot,
          label: photo.label,
          url,
        });
      }
    });
  });

  return links;
}

function buildReportIndexMap(headers) {
  const index = {};

  headers.forEach((header, i) => {
    if (header) index[header] = i;
  });

  return index;
}

function validateReportRequiredColumns(index) {
  const required = [
    "date",
    "slot_label",
    "area_label",
    "room_number",
    "area_score",
    "photo_url",
    "audit_status",
    "save_type",
  ];

  const missing = required.filter((header) => index[header] === undefined);

  const hasNoteOrNotes = index.note !== undefined || index.notes !== undefined;

  if (!hasNoteOrNotes) {
    missing.push("note or notes");
  }

  if (missing.length > 0) {
    throw new Error(
      "Missing required report column(s): " +
        missing.join(", ") +
        ". Please check the Auditorias sheet headers."
    );
  }
}

function valueAtReport(row, indexValue) {
  if (indexValue === undefined || indexValue === null) return "";
  return row[indexValue] || "";
}

function valueAtAnyReport(row, index, headerNames) {
  for (let i = 0; i < headerNames.length; i++) {
    const headerName = headerNames[i];
    const indexValue = index[headerName];

    if (indexValue !== undefined && indexValue !== null) {
      return row[indexValue] || "";
    }
  }

  return "";
}

// ══════════════════════════════════════════════════════════════════════════════
// REPORT DATE DROPDOWN
// ══════════════════════════════════════════════════════════════════════════════

function setupReportDateDropdown() {
  const sourceSheet = getOrCreateSheet();
  const reportSheet = getOrCreateReportSheet();

  const sourceValues = sourceSheet.getDataRange().getValues();

  if (sourceValues.length < 2) {
    reportSheet.getRange("A3").setValue("Data");
    reportSheet.getRange("B3").setValue(getTodayDateString());

    return {
      ok: false,
      message: "Nenhuma data encontrada em Auditorias.",
    };
  }

  const headers = sourceValues[0].map((h) => String(h || "").trim());
  const index = buildReportIndexMap(headers);

  if (index.date === undefined) {
    throw new Error("Missing date column in Auditorias.");
  }

  const uniqueDates = getAvailableAuditDatesFromSourceValues(sourceValues, index);

  if (uniqueDates.length === 0) {
    reportSheet.getRange("A3").setValue("Data");
    reportSheet.getRange("B3").setValue(getTodayDateString());

    return {
      ok: false,
      message: "Nenhuma data válida encontrada em Auditorias.",
    };
  }

  reportSheet.getRange("A3").setValue("Data");
  reportSheet.getRange("B3").setValue(uniqueDates[0]);

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(uniqueDates, true)
    .setAllowInvalid(false)
    .build();

  reportSheet.getRange("B3").setDataValidation(rule);
  reportSheet.getRange("A3:B3").setFontWeight("bold");

  return {
    ok: true,
    message: "Dropdown de datas criado em Relatório Diário!B3.",
    dates: uniqueDates,
  };
}

function setupReportDateDropdownValidationOnly(currentDate) {
  const sourceSheet = getOrCreateSheet();
  const reportSheet = getOrCreateReportSheet();

  const sourceValues = sourceSheet.getDataRange().getValues();

  if (sourceValues.length < 2) {
    return;
  }

  const headers = sourceValues[0].map((h) => String(h || "").trim());
  const index = buildReportIndexMap(headers);

  if (index.date === undefined) {
    return;
  }

  const uniqueDates = getAvailableAuditDatesFromSourceValues(sourceValues, index);

  if (uniqueDates.length === 0) {
    return;
  }

  const selectedDate =
    currentDate && /^\d{4}-\d{2}-\d{2}$/.test(currentDate)
      ? currentDate
      : uniqueDates[0];

  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(uniqueDates, true)
    .setAllowInvalid(false)
    .build();

  reportSheet.getRange("A3").setValue("Data");
  reportSheet.getRange("B3").setValue(selectedDate);
  reportSheet.getRange("B3").setDataValidation(rule);
  reportSheet.getRange("A3:B3").setFontWeight("bold");
}

function getAvailableAuditDatesFromSourceValues(sourceValues, index) {
  const dates = sourceValues
    .slice(1)
    .map((row) => normalizeSheetDateValue(row[index.date]))
    .filter((date) => /^\d{4}-\d{2}-\d{2}$/.test(date));

  return [...new Set(dates)].sort().reverse();
}

function getSelectedReportDate() {
  const reportSheet = getOrCreateReportSheet();

  const selectedDate = normalizeSheetDateValue(
    reportSheet.getRange("B3").getValue()
  );

  if (/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
    return selectedDate;
  }

  return getTodayDateString();
}

function generateDailyContractorReportFromSelectedDate() {
  const selectedDate = getSelectedReportDate();
  return generateDailyContractorReport(selectedDate);
}

function sendDailyContractorReportFromSelectedDate() {
  const selectedDate = getSelectedReportDate();
  return sendDailyContractorReport(selectedDate);
}

// ══════════════════════════════════════════════════════════════════════════════
// PDF EXPORT
// ══════════════════════════════════════════════════════════════════════════════

function exportDailyContractorReportPdf(targetDate) {
  const dateString = normalizeReportDate(targetDate);
  const summary = generateDailyContractorReport(dateString);

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const reportSheet = ss.getSheetByName(REPORT_SHEET_NAME);

  if (!reportSheet) {
    throw new Error("Report sheet not found after generation.");
  }

  // v6.0: PDF na identidade Concept (RelatoriosConcept.js). Se falhar, volta
  // para o PDF exportado da aba, para o fornecedor sempre receber o relatório.
  let pdfBlob;
  try {
    pdfBlob = buildDailyConceptPdf_(summary.date);
  } catch (err) {
    console.error("PDF Concept falhou, usando PDF da aba: " + err);
    pdfBlob = exportSheetAsPdf(ss, reportSheet);
  }

  pdfBlob.setName(
    "Relatorio_Diario_Facilities_Campus_SP_" + summary.date + ".pdf"
  );

  return {
    summary,
    pdfBlob,
  };
}

function exportSheetAsPdf(spreadsheet, sheet) {
  const spreadsheetId = spreadsheet.getId();
  const sheetId = sheet.getSheetId();

  const exportUrl =
    "https://docs.google.com/spreadsheets/d/" +
    spreadsheetId +
    "/export" +
    "?format=pdf" +
    "&gid=" +
    sheetId +
    "&size=A4" +
    "&portrait=false" +
    "&fitw=true" +
    "&scale=4" +
    "&sheetnames=false" +
    "&printtitle=false" +
    "&pagenumbers=false" +
    "&gridlines=false" +
    "&fzr=true" +
    "&top_margin=0.35" +
    "&bottom_margin=0.35" +
    "&left_margin=0.25" +
    "&right_margin=0.25";

  const token = ScriptApp.getOAuthToken();

  const response = UrlFetchApp.fetch(exportUrl, {
    headers: {
      Authorization: "Bearer " + token,
    },
    muteHttpExceptions: true,
  });

  const responseCode = response.getResponseCode();

  if (responseCode !== 200) {
    throw new Error(
      "PDF export failed. HTTP " +
        responseCode +
        ": " +
        response.getContentText()
    );
  }

  return response.getBlob();
}

// ══════════════════════════════════════════════════════════════════════════════
// EMAIL REPORT, WITHOUT MASTER SPREADSHEET URL
// ══════════════════════════════════════════════════════════════════════════════

function sendDailyContractorReport(targetDate) {
  const dateString = normalizeReportDate(targetDate);
  const result = exportDailyContractorReportPdf(dateString);
  const summary = result.summary;
  const pdfBlob = result.pdfBlob;

  const subject =
    "Relatório Diário de Facilities · Campus São Paulo · " + summary.date;

  const body = buildContractorEmailBody(summary);

  MailApp.sendEmail({
    to: CONTRACTOR_EMAIL,
    subject,
    body,
    attachments: [pdfBlob],
  });

  return {
    ok: true,
    sent_to: CONTRACTOR_EMAIL,
    date: summary.date,
    rows_included: summary.rowsIncluded,
    attachment_name: pdfBlob.getName(),
  };
}

function buildContractorEmailBody(summary) {
  let body =
    "Prezados,\n\n" +
    "Segue em anexo o relatório diário de Facilities.\n\n" +
    "Resumo do dia:\n" +
    "- Áreas auditadas: " +
    summary.totalAudited +
    "\n" +
    "- Ocorrências abaixo de 4: " +
    summary.issuesBelowFour +
    "\n" +
    "- Ocorrências críticas: " +
    summary.criticalIssues +
    "\n" +
    "- Áreas com evidência fotográfica: " +
    summary.areasWithPhotos +
    "\n" +
    "- Itens no relatório: " +
    summary.rowsIncluded +
    "\n\n";

  if (summary.photoLinks && summary.photoLinks.length > 0) {
    body += "Links das evidências fotográficas:\n";

    summary.photoLinks.forEach((photo, index) => {
      body +=
        index +
        1 +
        ". " +
        photo.slot +
        " · " +
        photo.area +
        " · " +
        photo.label +
        ": " +
        photo.url +
        "\n";
    });

    body += "\n";
  }

  body +=
    "Observação: este e-mail não inclui acesso à planilha interna de auditoria.\n\n" +
    "Atenciosamente,\n" +
    "Escola Concept";

  return body;
}

// ══════════════════════════════════════════════════════════════════════════════
// TRIGGER SETUP
// ══════════════════════════════════════════════════════════════════════════════

function createDailyContractorReportTrigger() {
  const functionName = "sendDailyContractorReport";
  const existingTriggers = ScriptApp.getProjectTriggers();

  const alreadyExists = existingTriggers.some(
    (trigger) => trigger.getHandlerFunction() === functionName
  );

  if (alreadyExists) {
    return {
      ok: true,
      message: "Trigger diário já existe.",
    };
  }

  ScriptApp.newTrigger(functionName)
    .timeBased()
    .everyDays(1)
    .atHour(17)
    .nearMinute(30)
    .create();

  return {
    ok: true,
    message: "Trigger diário criado para aproximadamente 17:30.",
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// DEBUG, OPTIONAL
// ══════════════════════════════════════════════════════════════════════════════

function debugDailyReportSource() {
  const sourceSheet = getOrCreateSheet();
  const sourceRange = sourceSheet.getDataRange();
  const sourceValues = sourceRange.getValues();
  const sourceFormulas = sourceRange.getFormulas();

  if (sourceValues.length < 2) {
    const emptySummary = {
      today: getTodayDateString(),
      totalRows: 0,
      message: "No data rows found in Auditorias.",
    };

    Logger.log(JSON.stringify(emptySummary, null, 2));
    return emptySummary;
  }

  const headers = sourceValues[0].map((h) => String(h || "").trim());

  const rows = sourceValues.slice(1).map((row, i) => ({
    values: row,
    formulas: sourceFormulas.slice(1)[i] || [],
  }));

  const index = buildReportIndexMap(headers);
  const today = getTodayDateString();

  const summary = {
    today,
    totalRows: rows.length,
    rowsByDate: {},
    rowsByAuditStatus: {},
    rowsBySaveType: {},
    matchingDateRows: 0,
    matchingCompletedRows: 0,
    rowsWithPhoto1: 0,
    rowsWithPhoto2: 0,
    rowsWithPhoto3: 0,
  };

  rows.forEach((item) => {
    const row = item.values;
    const formulaRow = item.formulas;

    const rowDate = normalizeSheetDateValue(valueAtReport(row, index.date));

    const auditStatus =
      String(valueAtReport(row, index.audit_status)).trim() || "(blank)";

    const saveType =
      String(valueAtReport(row, index.save_type)).trim() || "(blank)";

    summary.rowsByDate[rowDate] = (summary.rowsByDate[rowDate] || 0) + 1;

    summary.rowsByAuditStatus[auditStatus] =
      (summary.rowsByAuditStatus[auditStatus] || 0) + 1;

    summary.rowsBySaveType[saveType] =
      (summary.rowsBySaveType[saveType] || 0) + 1;

    if (rowDate === today) {
      summary.matchingDateRows += 1;
    }

    if (
      rowDate === today &&
      (auditStatus === "completed" || saveType === "final_completion")
    ) {
      summary.matchingCompletedRows += 1;
    }

    if (getPhotoUrlForReport(row, formulaRow, index, "photo_url")) {
      summary.rowsWithPhoto1 += 1;
    }

    if (getPhotoUrlForReport(row, formulaRow, index, "photo_url_2")) {
      summary.rowsWithPhoto2 += 1;
    }

    if (getPhotoUrlForReport(row, formulaRow, index, "photo_url_3")) {
      summary.rowsWithPhoto3 += 1;
    }
  });

  Logger.log(JSON.stringify(summary, null, 2));
  return summary;
}

// ══════════════════════════════════════════════════════════════════════════════
// JSON RESPONSE + HEALTH CHECK
// ══════════════════════════════════════════════════════════════════════════════

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return jsonResponse({
    ok: true,
    message:
      "Escola Concept — Auditoria de Espaços v6.0 — Concept daily PDF + weekly report active",
    timestamp: new Date().toISOString(),
    sheet_name: SHEET_NAME,
    headers: HEADERS,
    photo_folder: FOLDER_NAME,
    report_sheet_name: REPORT_SHEET_NAME,
  });
}
