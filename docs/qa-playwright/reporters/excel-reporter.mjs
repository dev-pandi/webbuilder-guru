// excel-reporter.mjs — Custom Playwright reporter yang tulis hasil ke XLSX.
//
// Output: results/qa-report-YYYYMMDD-HHmmss.xlsx dengan sheets:
//   1. Summary          — Total tests, pass/fail, duration, tanggal run
//   2. All Tests        — Semua test dengan status
//   3. Failed Tests     — Cuma failed (kalau ada) dengan error detail
//   4. Per Role         — Breakdown per role (client/agent/reseller/admin)
//
// Playwright reporter API:
//   https://playwright.dev/docs/api/class-reporter

import ExcelJS from "exceljs";
import { mkdirSync, existsSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = resolve(__dirname, "..", "results");

// Ensure output dir exists.
if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });

// Style constants — konsisten across sheets.
const STYLE = {
  headerFill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } },
  headerFont: { bold: true, color: { argb: "FFFFFFFF" }, size: 11 },
  passFill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFD1FAE5" } },
  failFill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEE2E2" } },
  skipFill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFFEF3C7" } },
  border: {
    top: { style: "thin", color: { argb: "FFD1D5DB" } },
    bottom: { style: "thin", color: { argb: "FFD1D5DB" } },
    left: { style: "thin", color: { argb: "FFD1D5DB" } },
    right: { style: "thin", color: { argb: "FFD1D5DB" } },
  },
};

class ExcelReporter {
  constructor() {
    this.results = [];
    this.startTime = null;
    this.endTime = null;
  }

  onBegin(_config, suite) {
    this.startTime = new Date();
    this.totalTests = suite.allTests().length;
    console.log(`\n🧪 Running ${this.totalTests} QA tests...\n`);
  }

  onTestEnd(test, result) {
    // Extract role from test file path:
    //   tests/10-client.spec.mjs → client
    //   tests/security/01-authz.spec.mjs → security (subfolder wins)
    const filePath = test.location?.file || "";
    const fileName = filePath.split("/").pop() || "";
    let role;
    if (filePath.includes("/security/")) {
      role = "security";
    } else if (filePath.includes("/functional/")) {
      role = "functional";
    } else if (filePath.includes("/visual/")) {
      role = "visual";
    } else if (filePath.includes("/negative/")) {
      role = "negative";
    } else {
      const roleMatch = fileName.match(/\d+-(\w+)\.spec/);
      role = roleMatch ? roleMatch[1] : "unknown";
    }

    // Requirement + actual dari test.annotations. Test bisa push multiple
    // — kita join pakai "; " kalau ada lebih dari satu step.
    const annos = test.annotations || [];
    const requirement = annos
      .filter((a) => a.type === "requirement")
      .map((a) => a.description)
      .join(" | ");
    const actual = annos
      .filter((a) => a.type === "actual")
      .map((a) => a.description)
      .join(" | ");

    this.results.push({
      role,
      testFile: fileName,
      testName: test.title,
      testPath: test.titlePath().slice(1).join(" › "),
      status: result.status, // passed | failed | timedOut | skipped | interrupted
      duration: result.duration, // ms
      requirement,
      actual,
      error: result.error?.message || "",
      errorStack: result.error?.stack || "",
      retry: result.retry,
      startTime: result.startTime,
    });
  }

  async onEnd(result) {
    this.endTime = new Date();
    const wb = new ExcelJS.Workbook();
    wb.creator = "Web Builder QA";
    wb.created = this.startTime;
    wb.modified = this.endTime;

    this._writeSummary(wb, result);
    this._writeAllTests(wb);
    this._writeFailedTests(wb);
    this._writePerRole(wb);

    // Timestamp file name — 20260819-143012
    const stamp = this.startTime
      .toISOString()
      .replace(/[-:T]/g, "")
      .replace(/\..+/, "")
      .slice(0, 15);
    const outputPath = join(OUTPUT_DIR, `qa-report-${stamp}.xlsx`);
    await wb.xlsx.writeFile(outputPath);

    // Juga simpan sebagai "qa-report-latest.xlsx" untuk gampang di-share.
    const latestPath = join(OUTPUT_DIR, "qa-report-latest.xlsx");
    await wb.xlsx.writeFile(latestPath);

    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter(
      (r) => r.status === "failed" || r.status === "timedOut",
    ).length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;

    console.log("");
    console.log("╔════════════════════════════════════════════════╗");
    console.log("║  QA Report ready                               ║");
    console.log("╚════════════════════════════════════════════════╝");
    console.log(`  ✅ Passed:  ${passed}`);
    console.log(`  ❌ Failed:  ${failed}`);
    console.log(`  ⚠️  Skipped: ${skipped}`);
    console.log(`  📊 Excel:   ${outputPath}`);
    console.log(`             ${latestPath}`);
    console.log(`  🌐 HTML:    results/html-report/index.html`);
    console.log(`  ⏱  Duration: ${((this.endTime - this.startTime) / 1000).toFixed(1)}s`);
    console.log("");
  }

  // ---------- Sheet writers ----------

  _writeSummary(wb, runResult) {
    const sheet = wb.addWorksheet("Summary", {
      properties: { tabColor: { argb: "FF1E40AF" } },
    });

    const passed = this.results.filter((r) => r.status === "passed").length;
    const failed = this.results.filter(
      (r) => r.status === "failed" || r.status === "timedOut",
    ).length;
    const skipped = this.results.filter((r) => r.status === "skipped").length;
    const durationSec = ((this.endTime - this.startTime) / 1000).toFixed(1);

    // Title
    sheet.mergeCells("A1:C1");
    const titleCell = sheet.getCell("A1");
    titleCell.value = "Web Builder — QA Test Report";
    titleCell.font = { bold: true, size: 16, color: { argb: "FF1E40AF" } };
    titleCell.alignment = { horizontal: "center", vertical: "middle" };
    sheet.getRow(1).height = 30;

    // Metadata
    const meta = [
      ["Run started", this.startTime.toLocaleString("id-ID")],
      ["Run finished", this.endTime.toLocaleString("id-ID")],
      ["Duration", `${durationSec} seconds`],
      ["Base URL", process.env.BASE_URL || "http://localhost:3000"],
      ["Total tests", this.results.length],
      ["Overall status", runResult.status || (failed > 0 ? "failed" : "passed")],
    ];

    let rowIdx = 3;
    meta.forEach(([k, v]) => {
      sheet.getCell(`A${rowIdx}`).value = k;
      sheet.getCell(`A${rowIdx}`).font = { bold: true, size: 11 };
      sheet.getCell(`B${rowIdx}`).value = v;
      sheet.getCell(`B${rowIdx}`).font = { size: 11 };
      rowIdx++;
    });

    // Stats block (big numbers)
    rowIdx += 2;
    sheet.mergeCells(`A${rowIdx}:C${rowIdx}`);
    const statsHeader = sheet.getCell(`A${rowIdx}`);
    statsHeader.value = "Test Results";
    statsHeader.font = { bold: true, size: 12, color: { argb: "FF1E40AF" } };
    statsHeader.alignment = { horizontal: "center" };
    rowIdx++;

    // Header row for stats
    const statHeaderRow = [
      { label: "Passed", value: passed, color: "FF10B981" },
      { label: "Failed", value: failed, color: "FFEF4444" },
      { label: "Skipped", value: skipped, color: "FFF59E0B" },
    ];

    statHeaderRow.forEach((s, i) => {
      const col = ["A", "B", "C"][i];
      const labelCell = sheet.getCell(`${col}${rowIdx}`);
      labelCell.value = s.label;
      labelCell.font = { bold: true, size: 11, color: { argb: "FFFFFFFF" } };
      labelCell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: s.color },
      };
      labelCell.alignment = { horizontal: "center" };
      labelCell.border = STYLE.border;

      const valCell = sheet.getCell(`${col}${rowIdx + 1}`);
      valCell.value = s.value;
      valCell.font = { bold: true, size: 24, color: { argb: s.color } };
      valCell.alignment = { horizontal: "center", vertical: "middle" };
      valCell.border = STYLE.border;
    });
    sheet.getRow(rowIdx + 1).height = 40;

    // Column widths
    sheet.getColumn("A").width = 22;
    sheet.getColumn("B").width = 40;
    sheet.getColumn("C").width = 22;
  }

  _writeAllTests(wb) {
    const sheet = wb.addWorksheet("All Tests");
    this._writeTestTable(sheet, this.results);
  }

  _writeFailedTests(wb) {
    const failed = this.results.filter(
      (r) => r.status === "failed" || r.status === "timedOut",
    );
    if (failed.length === 0) return; // skip sheet kalau tidak ada failure
    const sheet = wb.addWorksheet("Failed Tests", {
      properties: { tabColor: { argb: "FFEF4444" } },
    });
    this._writeTestTable(sheet, failed, /* includeError */ true);
  }

  _writePerRole(wb) {
    const roles = [...new Set(this.results.map((r) => r.role))].sort();
    for (const role of roles) {
      const roleName = role.charAt(0).toUpperCase() + role.slice(1);
      const sheet = wb.addWorksheet(roleName, {
        properties: { tabColor: { argb: "FF6366F1" } },
      });
      const filtered = this.results.filter((r) => r.role === role);
      this._writeTestTable(sheet, filtered);
    }
  }

  _writeTestTable(sheet, rows, includeError = false) {
    const columns = [
      { header: "#", key: "no", width: 6 },
      { header: "Role", key: "role", width: 12 },
      { header: "Test Name", key: "testName", width: 45 },
      { header: "Expected (Requirement)", key: "requirement", width: 55 },
      { header: "Actual (Result)", key: "actual", width: 55 },
      { header: "Status", key: "status", width: 12 },
      { header: "Duration (ms)", key: "duration", width: 15 },
      { header: "Retry", key: "retry", width: 8 },
    ];
    if (includeError) {
      columns.push({ header: "Error Message", key: "error", width: 60 });
    }
    sheet.columns = columns;

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.height = 24;
    headerRow.eachCell((cell) => {
      cell.fill = STYLE.headerFill;
      cell.font = STYLE.headerFont;
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = STYLE.border;
    });

    // Add rows
    rows.forEach((r, idx) => {
      const row = sheet.addRow({
        no: idx + 1,
        role: r.role,
        testName: r.testName,
        requirement: r.requirement || "—",
        actual: r.actual || "—",
        status: r.status.toUpperCase(),
        duration: r.duration,
        retry: r.retry || 0,
        error: r.error || "",
      });

      // Color status cell
      const statusCell = row.getCell("status");
      if (r.status === "passed") {
        statusCell.fill = STYLE.passFill;
        statusCell.font = { color: { argb: "FF065F46" }, bold: true };
      } else if (r.status === "failed" || r.status === "timedOut") {
        statusCell.fill = STYLE.failFill;
        statusCell.font = { color: { argb: "FF991B1B" }, bold: true };
      } else if (r.status === "skipped") {
        statusCell.fill = STYLE.skipFill;
        statusCell.font = { color: { argb: "FF92400E" }, bold: true };
      }
      statusCell.alignment = { horizontal: "center", vertical: "middle" };

      // Border + alignment untuk semua cells
      row.eachCell((cell) => {
        cell.border = STYLE.border;
        if (!cell.alignment) {
          cell.alignment = { vertical: "middle", wrapText: true };
        } else {
          cell.alignment = { ...cell.alignment, wrapText: true };
        }
      });

      // Row height fit content — Expected/Actual bisa panjang, hitung dari yang terbesar
      const longestField = Math.max(
        (r.requirement || "").length,
        (r.actual || "").length,
        includeError ? (r.error || "").length : 0,
      );
      if (longestField > 40) {
        row.height = Math.min(90, 20 + Math.ceil(longestField / 55) * 12);
      }
    });

    // Freeze header
    sheet.views = [{ state: "frozen", ySplit: 1 }];

    // Auto-filter
    if (rows.length > 0) {
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: columns.length },
      };
    }
  }
}

export default ExcelReporter;
