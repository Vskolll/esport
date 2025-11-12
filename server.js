// server.js (ESM)
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const app  = express();
const PORT = process.env.PORT || 10000;

// Рендер/прокси
app.set("trust proxy", 1);

// Статика из /public с адекватным кэшем (HTML — no-cache, ассеты — 1 час)
const publicDir = path.join(__dirname, "public");
app.use(
  express.static(publicDir, {
    etag: true,
    lastModified: true,
    extensions: ["html"],
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) {
        res.setHeader("Cache-Control", "no-cache");
      } else {
        res.setHeader("Cache-Control", "public, max-age=3600, immutable");
      }
    },
  })
);

// /register → public/register/index.html
app.get("/register", (_req, res) => {
  res.sendFile(path.join(publicDir, "register", "index.html"));
});

// healthcheck для Render
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

// Пример API
app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello from Render!" });
});

// 404 только для /api
app.use("/api", (_req, res) => res.status(404).json({ error: "Not found" }));

// SPA-фолбэк: остальные роуты отдают public/index.html
app.get("*", (_req, res) => {
  res.sendFile(path.join(publicDir, "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
