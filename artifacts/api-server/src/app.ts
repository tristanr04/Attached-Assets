import express from "express";
import cors, { type CorsOptions } from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import { logger } from "./lib/logger";
import router from "./routes";

const app = express();

function configuredCorsOrigins(): Set<string> {
  const configured = (process.env.CORS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (process.env.NODE_ENV !== "production") {
    configured.push(
      "http://localhost:3000",
      "http://localhost:4173",
      "http://localhost:5173",
      "http://127.0.0.1:3000",
      "http://127.0.0.1:4173",
      "http://127.0.0.1:5173",
    );
  }

  return new Set(configured);
}

const allowedCorsOrigins = configuredCorsOrigins();
const corsOptions: CorsOptions = {
  credentials: true,
  origin(origin, callback) {
    // Requests without an Origin header (server-to-server, health checks, native clients)
    // are not browser cross-origin requests and may continue.
    if (!origin) {
      callback(null, true);
      return;
    }

    if (allowedCorsOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    logger.warn({ origin }, "Blocked request from unapproved CORS origin");
    callback(new Error("Origin is not allowed by CORS policy"));
  },
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must come before body parsers (streams raw bytes)
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);

export default app;
