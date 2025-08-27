import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import pino from "pino";
import pinoHttp from "pino-http";

const app = express();
const logger = pino({ level: process.env.LOG_LEVEL || "info" });

app.use(helmet());
app.use(cors({ origin: ["http://localhost:5173", "http://localhost:3000"], credentials: true }));
app.use(express.json({ limit: "2mb" }));
app.use(pinoHttp({ logger }));
app.use(rateLimit({ windowMs: 60_000, max: 300 }));

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = Number(process.env.PORT || 3000);
app.listen(port, () => logger.info({ port }, "API listening"));
