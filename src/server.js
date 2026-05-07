const path = require('path');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');
const { parseExcel } = require('./excelParser');
const { renderDashboardImage } = require('./imageRenderer');

const app = express();
const port = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, '..', 'public', 'uploads');
const generatedDir = path.join(__dirname, '..', 'public', 'generated');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(generatedDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    const ok = file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls');
    cb(ok ? null : new Error('Only .xlsx/.xls files are allowed'), ok);
  },
});

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.post('/api/generate', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'file field is required' });
    }

    const report = parseExcel(req.file.path);
    const imageId = `${uuidv4()}.png`;
    const outputPath = path.join(generatedDir, imageId);

    await renderDashboardImage(report, outputPath);

    const imageUrl = `${req.protocol}://${req.get('host')}/generated/${imageId}`;
    return res.json({ imageUrl });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate image' });
  }
});

app.use((err, _req, res, _next) => {
  res.status(400).json({ error: err.message || 'Upload error' });
});

app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});
