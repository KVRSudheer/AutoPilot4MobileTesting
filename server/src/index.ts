import express from "express";
import cors from "cors";
import { env } from "./config/env.js";
import { api } from "./routes/api.js";

const app = express();

app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.use("/api", api);

app.get("/", (_req, res) => {
  res.json({ service: "UiPath Browser Test Autopilot API", status: "ok" });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: err.message });
});

app.listen(env.port, () => {
  console.log(`[autopilot] API listening on http://localhost:${env.port}`);
});
