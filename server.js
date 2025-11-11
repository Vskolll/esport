import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();

const PORT = process.env.PORT || 10000;

// Раздаём статику (например, index.html)
app.use(express.static(path.join(__dirname, "public")));

// Тестовый эндпоинт
app.get("/api/hello", (req, res) => {
  res.json({ message: "Hello from Render!" });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
