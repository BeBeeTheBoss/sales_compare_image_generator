const xlsx = require('xlsx');

const BRANCH_ORDER = [
  'Lanthit',
  'Theik Pan',
  'Sat San',
  'East Dagon',
  'Mawlamyine',
  'Tampawady',
  'Hlaing Thar Yar',
  'Aye Thar Yar',
  'Mingalardon',
  'Bago',
  'PRO1 Plus',
  'South Dagon',
  'Da Nyin Gone',
  'Nay Pyi Taw',
  'Clearance Sale',
];

const BRANCH_ALIAS_MAP = new Map([
  ['lanthit', 'Lanthit'],
  ['theikpan', 'Theik Pan'],
  ['theik pan', 'Theik Pan'],
  ['satsan', 'Sat San'],
  ['sat san', 'Sat San'],
  ['east dagon', 'East Dagon'],
  ['mawlamyine', 'Mawlamyine'],
  ['tampawady', 'Tampawady'],
  ['hlaing tharyar', 'Hlaing Thar Yar'],
  ['hlaing thar yar', 'Hlaing Thar Yar'],
  ['aye tharyar', 'Aye Thar Yar'],
  ['aye thar yar', 'Aye Thar Yar'],
  ['mingalardon', 'Mingalardon'],
  ['bago', 'Bago'],
  ['pro 1 plus (terminal m)', 'PRO1 Plus'],
  ['pro1 plus', 'PRO1 Plus'],
  ['south dagon', 'South Dagon'],
  ['da nyin gone', 'Da Nyin Gone'],
  ['nay pyi taw', 'Nay Pyi Taw'],
  ['clearance sale', 'Clearance Sale'],
  ['dc-mingalardon', 'Clearance Sale'],
]);

function toNumber(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9.-]/g, '');
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toPercent(today, base) {
  if (!base) return 0;
  return ((today - base) / base) * 100;
}

function findSaleCompareHeaderRows(sheetData) {
  for (let i = 0; i < sheetData.length - 1; i += 1) {
    const rowA0 = String(sheetData[i]?.[0] || '').trim().toLowerCase();
    const rowB1 = String(sheetData[i + 1]?.[1] || '').trim().toLowerCase();
    const rowB2 = String(sheetData[i + 1]?.[2] || '').trim().toLowerCase();
    if (rowA0 === 'main category' && rowB1.includes('yesterday') && rowB2.includes('today')) {
      return { branchHeaderRow: i, metricHeaderRow: i + 1 };
    }
  }
  return null;
}

function extractRowsFromSaleCompare(sheetData) {
  const header = findSaleCompareHeaderRows(sheetData);
  if (!header) return [];

  const rows = [];
  const branchRow = sheetData[header.branchHeaderRow];
  const metricsRow = sheetData[header.metricHeaderRow];
  const dataStart = header.metricHeaderRow + 1;

  const branchColumns = [];
  for (let col = 1; col < metricsRow.length; col += 3) {
    const metricA = String(metricsRow[col] || '').trim().toLowerCase();
    const metricB = String(metricsRow[col + 1] || '').trim().toLowerCase();
    if (!metricA.includes('yesterday') || !metricB.includes('today')) continue;

    const rawBranch = String(branchRow[col] || '').trim();
    if (!rawBranch || rawBranch.toLowerCase() === 'grand total') continue;
    const normalizedBranch = BRANCH_ALIAS_MAP.get(rawBranch.toLowerCase());
    if (!normalizedBranch) continue;
    branchColumns.push({ branch: normalizedBranch, yesterdayCol: col, todayCol: col + 1 });
  }

  for (let i = dataStart; i < sheetData.length; i += 1) {
    const row = sheetData[i];
    const category = String(row?.[0] || '').trim();
    if (!category) continue;
    if (category.toLowerCase() === 'grand total') continue;

    for (const b of branchColumns) {
      const yesterday = toNumber(row[b.yesterdayCol]);
      const today = toNumber(row[b.todayCol]);
      if (!yesterday && !today) continue;

      rows.push({
        branch: b.branch,
        category,
        today,
        base: yesterday,
      });
    }
  }

  return rows;
}

function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames.includes('Sale Compare')
    ? 'Sale Compare'
    : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const json = xlsx.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  const rows = extractRowsFromSaleCompare(json);

  if (!rows.length) {
    throw new Error('No valid rows found in Sale Compare format.');
  }

  return buildReport(rows);
}

function buildReport(rows, titleDate = null) {
  const totalToday = rows.reduce((s, r) => s + r.today, 0);
  const totalBase = rows.reduce((s, r) => s + r.base, 0);
  const totalGrowth = toPercent(totalToday, totalBase);

  const byBranchMap = new Map();
  const byBranchCategoryMap = new Map();
  for (const r of rows) {
    if (!byBranchMap.has(r.branch)) byBranchMap.set(r.branch, { today: 0, base: 0 });
    const b = byBranchMap.get(r.branch);
    b.today += r.today;
    b.base += r.base;

    if (!byBranchCategoryMap.has(r.branch)) byBranchCategoryMap.set(r.branch, new Map());
    const catMap = byBranchCategoryMap.get(r.branch);
    if (!catMap.has(r.category)) catMap.set(r.category, 0);
    catMap.set(r.category, catMap.get(r.category) + r.today);
  }

  const branchGrowth = BRANCH_ORDER.filter((branch) => byBranchMap.has(branch))
    .map((branch) => {
      const vals = byBranchMap.get(branch);
      const topCategoryEntry = Array.from((byBranchCategoryMap.get(branch) || new Map()).entries())
        .sort((a, b) => b[1] - a[1])[0];
      return {
        branch,
        today: vals.today,
        base: vals.base,
        growth: toPercent(vals.today, vals.base),
        keyDriver: topCategoryEntry ? topCategoryEntry[0].replace(/^[0-9]+-/, '') : 'All categories combined',
      };
    });

  const branchGrowthSorted = [...branchGrowth].sort((a, b) => b.growth - a.growth);

  const byCategoryMap = new Map();
  for (const r of rows) {
    if (!byCategoryMap.has(r.category)) byCategoryMap.set(r.category, { today: 0, base: 0 });
    const c = byCategoryMap.get(r.category);
    c.today += r.today;
    c.base += r.base;
  }

  const categoryGrowth = Array.from(byCategoryMap.entries())
    .map(([category, vals]) => ({
      category: category.replace(/^[0-9]+-/, ''),
      growth: toPercent(vals.today, vals.base),
    }))
    .sort((a, b) => b.growth - a.growth);

  const topCategories = categoryGrowth.slice(0, 5);
  const bottomCategories = [...categoryGrowth].reverse().slice(0, 5).reverse();

  return {
    titleDate: titleDate || new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }),
    totalToday,
    totalBase,
    totalGrowth,
    branchGrowth,
    branchGrowthSorted,
    topCategories,
    bottomCategories,
  };
}

function normalizeBranchFromApi(branchName) {
  const name = String(branchName || '').split('-/-')[1] || '';
  const key = name.trim().toLowerCase();
  return BRANCH_ALIAS_MAP.get(key) || name.trim();
}

function normalizeCategoryFromApi(categoryName) {
  return String(categoryName || '').trim();
}

function parseDateFromDtype(dtype) {
  const m = String(dtype || '').match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  return new Date(`${yyyy}-${mm}-${dd}T00:00:00`);
}

function getAvgDivisorFromDailyDate(sampleDate) {
  if (!sampleDate) return 1;
  const day = sampleDate.getDate();
  if (day > 1) return day - 1;

  const year = sampleDate.getFullYear();
  const month = sampleDate.getMonth(); // 0-based
  const lastDayPrevMonth = new Date(year, month, 0).getDate();
  return Math.max(1, lastDayPrevMonth);
}

function parseSalesJson(dailySales, monthlySales) {
  if (!Array.isArray(dailySales) || !dailySales.length) {
    throw new Error('dailySales array is required');
  }
  if (!Array.isArray(monthlySales) || !monthlySales.length) {
    throw new Error('monthlySales array is required');
  }

  const dailyMap = new Map();
  dailySales.forEach((r) => {
    const branch = normalizeBranchFromApi(r.branch_name);
    const category = normalizeCategoryFromApi(r.product_category_name);
    const today = toNumber(r.saleamnt);
    if (!branch || !category) return;
    const key = `${branch}||${category}`;
    dailyMap.set(key, (dailyMap.get(key) || 0) + today);
  });

  const sampleDate = parseDateFromDtype(dailySales[0]?.dtype);
  const avgDivisor = getAvgDivisorFromDailyDate(sampleDate);

  const monthlyMap = new Map();
  monthlySales.forEach((r) => {
    const branch = normalizeBranchFromApi(r.branch_name);
    const category = normalizeCategoryFromApi(r.product_category_name);
    const monthlyTotal = toNumber(r.saleamnt);
    if (!branch || !category) return;
    const key = `${branch}||${category}`;
    monthlyMap.set(key, (monthlyMap.get(key) || 0) + monthlyTotal);
  });

  const allKeys = new Set([...dailyMap.keys(), ...monthlyMap.keys()]);
  const rows = [];
  allKeys.forEach((key) => {
    const [branch, category] = key.split('||');
    if (!BRANCH_ORDER.includes(branch)) return;
    const today = dailyMap.get(key) || 0;
    const base = (monthlyMap.get(key) || 0) / avgDivisor;
    rows.push({ branch, category, today, base });
  });

  const titleDate = sampleDate
    ? sampleDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  return buildReport(rows, titleDate);
}

module.exports = { parseExcel, parseSalesJson };
