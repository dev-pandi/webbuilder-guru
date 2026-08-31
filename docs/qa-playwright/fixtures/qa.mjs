// qa.mjs — helper untuk record requirement vs actual result per test.
// Ditulis ke testInfo.annotations (Playwright native), lalu dibaca oleh
// excel-reporter.mjs → kolom "Expected" + "Actual" di sheet Excel.
//
// Pola pakai:
//   test('...', async ({ page }, testInfo) => {
//     req(testInfo, "GET /admin/users → 200 + tabel muncul");
//     const res = await page.goto("/admin/users");
//     ...
//     act(testInfo, `HTTP ${res.status()}, tabel visible`);
//   });

export function req(testInfo, description) {
  testInfo.annotations.push({ type: "requirement", description });
}

export function act(testInfo, description) {
  testInfo.annotations.push({ type: "actual", description });
}
