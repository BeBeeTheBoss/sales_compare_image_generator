const fs = require('fs');
const { createCanvas } = require('@napi-rs/canvas');
const path = require('path');
const FONT_FAMILY = 'Roboto';

// =============================
// HELPERS
// =============================

function mmk(v) {
  const million = v / 1000000;
  return `${Math.round(million).toLocaleString('en-US')} Million MMK`;
}

function pct(v) {
  const sign = v >= 0 ? '+' : '';
  return `${sign}${Math.round(v)}%`;
}

const EXCLUDED_CATEGORY_NAMES = new Set(['Promotion/Sector', 'Office Use']);
const EXCLUDED_BRANCH_NAMES = new Set(['Clearance Sale']);

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawPanel(ctx, x, y, w, h, title) {
  ctx.fillStyle = '#163d6d';
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255,255,255,0.05)';
  ctx.lineWidth = 2;
  ctx.stroke();

  if (title) {
    ctx.fillStyle = '#244f87';
    roundRect(ctx, x + 12, y + 12, w - 24, 54, 10);
    ctx.fill();

    ctx.fillStyle = '#f4f6fa';
    ctx.font = `700 22px ${FONT_FAMILY}`;

    const tw = ctx.measureText(title).width;
    ctx.fillText(title, x + (w - tw) / 2, y + 48);
  }
}

function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;

  let s = text;

  while (
    s.length > 1 &&
    ctx.measureText(`${s}...`).width > maxWidth
  ) {
    s = s.slice(0, -1);
  }

  return `${s}...`;
}

function withClip(ctx, x, y, w, h, fn) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  fn();
  ctx.restore();
}

function drawFittedText(ctx, text, x, y, maxWidth, startSize, weight = 700) {
  let size = startSize;
  while (size > 14) {
    ctx.font = `${weight} ${size}px ${FONT_FAMILY}`;
    if (ctx.measureText(text).width <= maxWidth) break;
    size -= 1;
  }
  ctx.fillText(text, x, y);
}

function drawMyanmarRealMap(ctx, x, y, w, h) {
  try {
    const raw = fs.readFileSync(path.join(__dirname, '..', 'data-myanmar.geo.json'), 'utf8');
    const geo = JSON.parse(raw);
    let geometry = null;
    if (geo.type === 'FeatureCollection' && Array.isArray(geo.features) && geo.features.length) {
      geometry = geo.features[0].geometry;
    } else if (geo.type === 'Feature' && geo.geometry) {
      geometry = geo.geometry;
    } else if (geo.type === 'Polygon' || geo.type === 'MultiPolygon') {
      geometry = geo;
    }
    if (!geometry) return false;

    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    polygons.forEach((poly) => {
      const ring = poly[0];
      ring.forEach(([lon, lat]) => {
        minLon = Math.min(minLon, lon);
        maxLon = Math.max(maxLon, lon);
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
      });
    });

    const lonRange = maxLon - minLon || 1;
    const latRange = maxLat - minLat || 1;
    const scale = Math.min((w * 0.78) / lonRange, (h * 0.9) / latRange);
    const ox = x + (w - lonRange * scale) / 2;
    const oy = y + (h - latRange * scale) / 2;

    const px = (lon) => ox + (lon - minLon) * scale;
    const py = (lat) => oy + (maxLat - lat) * scale;

    ctx.fillStyle = '#d9c9a0';
    ctx.strokeStyle = '#bd9f5a';
    ctx.lineWidth = 2;
    polygons.forEach((poly) => {
      const ring = poly[0];
      ctx.beginPath();
      ring.forEach(([lon, lat], i) => {
        if (i === 0) ctx.moveTo(px(lon), py(lat));
        else ctx.lineTo(px(lon), py(lat));
      });
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    });
    return true;
  } catch (_err) {
    return false;
  }
}

// =============================
// MAIN RENDER
// =============================

async function renderDashboardImage(report, outputPath) {
  const width = 1920;
  const height = 1080;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // =============================
  // BACKGROUND
  // =============================

  ctx.fillStyle = '#06214a';
  ctx.fillRect(0, 0, width, height);

  // HEADER
  ctx.fillStyle = '#f2f0ea';
  ctx.fillRect(0, 0, width, 130);

  ctx.fillStyle = '#123760';
  ctx.font = `700 40px ${FONT_FAMILY}`;
  ctx.fillText(
    `PRO1 Sales Performance Summary: ${report.titleDate}`,
    30,
    72
  );

  ctx.fillStyle = '#58697f';
  ctx.font = `italic 18px ${FONT_FAMILY}`;
  ctx.fillText(
    "Analysis of Today's Sale vs. Base Avg. with Holiday Context.",
    30,
    108
  );

  // =============================
  // PANELS
  // =============================

  drawPanel(
    ctx,
    24,
    145,
    1872,
    60,
    "Executive Summary & Today's Sale Overview"
  );

  drawPanel(ctx, 24, 220, 900, 355, '');

  drawPanel(
    ctx,
    950,
    220,
    946,
    355,
    'Sales Performance by Region & Branch'
  );

  const categoryPanel = {
    x: 24,
    y: 600,
    w: 1872,
    h: 430
  };

  drawPanel(
    ctx,
    categoryPanel.x,
    categoryPanel.y,
    categoryPanel.w,
    categoryPanel.h,
    'Top & Bottom Performing Categories (Growth %)'
  );

  // =============================
  // DONUT CHART
  // =============================

  // OUTER RING
  ctx.strokeStyle = '#ece7e5';
  ctx.lineWidth = 42;

  ctx.beginPath();
  ctx.arc(165, 395, 110, 0, Math.PI * 2);
  ctx.stroke();

  // PROGRESS (green for positive, red for negative)
  const isGrowthUp = report.totalGrowth >= 0;
  const growthRatio = Math.min(Math.abs(report.totalGrowth), 100) / 100;
  ctx.strokeStyle = isGrowthUp ? '#2faa46' : '#d94b3d';

  ctx.beginPath();
  ctx.arc(
    165,
    395,
    110,
    -Math.PI / 2,
    (-Math.PI / 2) + (Math.PI * 2 * growthRatio)
  );

  ctx.stroke();

  // INNER CIRCLE
  ctx.fillStyle = '#f2ede7';

  ctx.beginPath();
  ctx.arc(165, 395, 78, 0, Math.PI * 2);
  ctx.fill();

  // CENTER TEXT
  ctx.fillStyle = isGrowthUp ? '#2faa46' : '#d94b3d';
  ctx.font = `700 56px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillText(pct(report.totalGrowth), 165, 414);
  ctx.textAlign = 'left';

  // =============================
  // TODAY SALE TEXT
  // =============================

  ctx.fillStyle = '#f4f6fa';
  ctx.font = `700 40px ${FONT_FAMILY}`;
  ctx.fillText('TODAY SALE', 355, 300);

  ctx.fillStyle = '#c7d2e2';
  ctx.font = `400 26px ${FONT_FAMILY}`;
  ctx.fillText('Grand Total (Vs. Base)', 355, 340);

  ctx.strokeStyle = '#42699a';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(355, 362);
  ctx.lineTo(870, 362);
  ctx.stroke();

  // TODAY
  ctx.fillStyle = '#d4dce8';
  ctx.font = `400 28px ${FONT_FAMILY}`;
  ctx.fillText('Today:', 355, 420);

  ctx.fillStyle = '#ffffff';
  drawFittedText(ctx, mmk(report.totalToday), 480, 420, 370, 38, 700);

  // BASE ICON (dynamic up/down)
  const isUp = report.totalToday >= report.totalBase;
  ctx.fillStyle = isUp ? '#2faa46' : '#d94b3d';
  if (isUp) {
    ctx.beginPath();
    ctx.moveTo(360, 495);
    ctx.lineTo(375, 475);
    ctx.lineTo(390, 495);
    ctx.fill();
    ctx.fillRect(366, 495, 18, 12);
  } else {
    ctx.fillRect(366, 475, 18, 12);
    ctx.beginPath();
    ctx.moveTo(360, 487);
    ctx.lineTo(375, 507);
    ctx.lineTo(390, 487);
    ctx.fill();
  }

  // BASE TEXT
  ctx.fillStyle = '#d4dce8';
  ctx.font = `400 28px ${FONT_FAMILY}`;
  ctx.fillText('Base Avg:', 410, 505);

  ctx.fillStyle = '#ffffff';
  drawFittedText(ctx, mmk(report.totalBase), 585, 505, 265, 36, 700);

  // =============================
  // SIMPLE MAP SHAPE
  // =============================

  ctx.fillStyle = '#214978';
  roundRect(ctx, 995, 310, 200, 260, 10);
  ctx.fill();

  drawMyanmarRealMap(ctx, 995, 310, 200, 260);

  const mapRows = report.branchGrowthSorted
    .filter((x) => ['South Dagon', 'Sat San', 'East Dagon', 'Tampawady'].includes(x.branch))
    .slice(0, 4);
  const pins = {
    'South Dagon': [1086, 493],
    'Sat San': [1082, 446],
    'East Dagon': [1094, 456],
    Tampawady: [1108, 470]
  };

  ctx.font = `700 11px ${FONT_FAMILY}`;
  mapRows.forEach((r) => {
    const p = pins[r.branch];
    if (!p) return;
    ctx.fillStyle = '#2db04f';
    ctx.beginPath();
    ctx.arc(p[0], p[1], 5, 0, Math.PI * 2);
    ctx.fill();

    const label = `${r.branch} ${pct(r.growth)}`;
    const w = ctx.measureText(label).width + 12;
    ctx.fillStyle = '#103258';
    roundRect(ctx, p[0] - 60, p[1] - 28, w, 19, 5);
    ctx.fill();
    ctx.strokeStyle = '#2db04f';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#f2f6fb';
    ctx.fillText(label, p[0] - 54, p[1] - 14);
  });

  // =============================
  // TABLE HEADER
  // =============================

  ctx.fillStyle = '#2b5b92';
  roundRect(ctx, 1202, 310, 674, 44, 6);
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.font = `700 18px ${FONT_FAMILY}`;

  ctx.fillText('Location', 1214, 338);
  ctx.fillText('Growth', 1478, 338);
  ctx.fillText('Key Driver', 1583, 338);

  // =============================
  // TABLE ROWS
  // =============================

  const branchRows = report.branchGrowthSorted
    .filter((r) => !EXCLUDED_BRANCH_NAMES.has(r.branch));

  const tableRows = [
    ...branchRows.slice(0, 4),
    {
      branch: 'Grand Total',
      growth: report.totalGrowth,
      keyDriver: 'All categories combined'
    }
  ];

  withClip(ctx, 1202, 356, 674, 216, () => tableRows.forEach((r, i) => {
    const y = 382 + i * 40;

    const isGrand = i === tableRows.length - 1;

    ctx.fillStyle = isGrand
      ? '#f4dfaa'
      : i % 2 === 0
      ? '#ece2c8'
      : '#e4dbc2';

    roundRect(ctx, 1202, y - 22, 674, 36, 4);
    ctx.fill();

    // BRANCH
    ctx.fillStyle = '#16355c';
    ctx.font = `700 18px ${FONT_FAMILY}`;
    ctx.fillText(fitText(ctx, r.branch, 250), 1214, y + 5);

    // GROWTH
    ctx.fillStyle = r.growth >= 0 ? '#2faa46' : '#d94b3d';
    ctx.fillText(pct(r.growth), 1478, y + 5);

    // DRIVER
    ctx.fillStyle = '#333';
    ctx.font = `400 16px ${FONT_FAMILY}`;

    ctx.fillText(
      fitText(ctx, r.keyDriver || '', 230),
      1583,
      y + 5
    );
  }));

  // =============================
  // CATEGORY BARS
  // =============================

  const pos = [...report.topCategories]
    .filter((c) => !EXCLUDED_CATEGORY_NAMES.has(c.category))
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 2);
  const neg = [...report.bottomCategories]
    .filter((c) => !EXCLUDED_CATEGORY_NAMES.has(c.category))
    .sort((a, b) => a.growth - b.growth)
    .slice(0, 4);
  const startX = categoryPanel.x + Math.floor(categoryPanel.w / 2) - 16;
  const categoryClipX = categoryPanel.x + 24;
  const categoryClipY = categoryPanel.y + 75;
  const categoryClipW = categoryPanel.w - 48;
  const categoryClipH = categoryPanel.h - 90;
  const barMaxW = 430;
  const widthByPct = (growth) => {
    const p = Math.min(Math.abs(growth), 100);
    return Math.max(24, (barMaxW * p) / 100);
  };

  withClip(ctx, categoryClipX, categoryClipY, categoryClipW, categoryClipH, () => pos.forEach((c, i) => {
    const y = 718 + i * 64;
    const barWidth = widthByPct(c.growth);
    ctx.fillStyle = '#2fa44a';
    ctx.fillRect(startX, y - 21, barWidth, 42);
    ctx.fillStyle = '#f4f6fb';
    ctx.font = `400 34px ${FONT_FAMILY}`;
    ctx.textAlign = 'right';
    ctx.fillText(fitText(ctx, c.category, 520), startX - 14, y + 4);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2fa44a';
    ctx.font = `700 32px ${FONT_FAMILY}`;
    ctx.fillText(pct(c.growth), startX + barWidth + 8, y + 4);
  }));

  withClip(ctx, categoryClipX, categoryClipY, categoryClipW, categoryClipH, () => neg.forEach((c, i) => {
    const y = 848 + i * 64;
    const barWidth = widthByPct(c.growth);
    ctx.fillStyle = '#e14335';
    ctx.fillRect(startX - barWidth, y - 21, barWidth, 42);

    ctx.fillStyle = '#f4f6fb';
    ctx.font = `400 34px ${FONT_FAMILY}`;
    ctx.textAlign = 'left';
    ctx.fillText(fitText(ctx, c.category, 580), startX + 14, y + 4);

    ctx.fillStyle = '#ff4e40';
    ctx.font = `700 32px ${FONT_FAMILY}`;
    ctx.textAlign = 'right';
    ctx.fillText(pct(c.growth), startX - barWidth - 12, y + 4);
  }));

  ctx.textAlign = 'left';

  // =============================
  // EXPORT
  // =============================

  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(outputPath, buffer);
}

module.exports = {
  renderDashboardImage
};
