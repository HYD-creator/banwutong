import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("../outputs/student_roster/", import.meta.url);
await fs.mkdir(outputDir, { recursive: true });

const workbook = Workbook.create();
const sheet = workbook.worksheets.add("学生名单");
sheet.showGridLines = false;
sheet.freezePanes.freezeRows(1);

const rows = [
  ["姓名", "学号", "性别"],
  ["王小明", "S001", "男"],
  ["李华", "S002", "女"],
  ["张琳", "S003", "女"],
  ["陈晨", "S004", "男"],
  ["赵可", "S005", "男"],
  ["周宁", "S006", "女"],
  ["林雨", "S007", "女"],
  ["孙悦", "S008", "女"],
  ["吴桐", "S009", "男"],
  ["郑欣", "S010", "女"],
  ["刘洋", "S011", "男"],
  ["高远", "S012", "男"],
];

sheet.getRange("A1:C13").values = rows;
sheet.getRange("A1:C1").format = {
  fill: "#3478F6",
  font: { bold: true, color: "#FFFFFF" },
  horizontalAlignment: "center",
  verticalAlignment: "center",
  borders: { preset: "outside", style: "thin", color: "#2862CC" },
};
sheet.getRange("A2:C13").format = {
  font: { color: "#172033" },
  verticalAlignment: "center",
  borders: { insideHorizontal: { style: "thin", color: "#E5EAF3" } },
};
sheet.getRange("B2:B13").format.numberFormat = "@";
sheet.getRange("B2:C13").format.horizontalAlignment = "center";
sheet.getRange("A1:C13").format.rowHeight = 24;
sheet.getRange("A:A").format.columnWidth = 18;
sheet.getRange("B:B").format.columnWidth = 16;
sheet.getRange("C:C").format.columnWidth = 12;
sheet.getRange("C2:C200").dataValidation = { rule: { type: "list", values: ["男", "女"] } };

const inspection = await workbook.inspect({
  kind: "region",
  sheetId: "学生名单",
  range: "A1:C13",
  maxChars: 4000,
});
console.log(inspection.ndjson);

const preview = await workbook.render({
  sheetName: "学生名单",
  autoCrop: "all",
  scale: 1.5,
  format: "png",
});
await fs.writeFile(new URL("学生名单导入示例.png", outputDir), new Uint8Array(await preview.arrayBuffer()));

const xlsx = await SpreadsheetFile.exportXlsx(workbook);
await xlsx.save(fileURLToPath(new URL("学生名单导入示例.xlsx", outputDir)));
