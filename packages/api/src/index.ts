import "dotenv/config";
import "express-async-errors";
import express from "express";
import cors from "cors";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { authRouter } from "./routes/auth.js";
import { employeesRouter } from "./routes/employees.js";
import { schedulesRouter } from "./routes/schedules.js";
import { tasksRouter } from "./routes/tasks.js";
import { planningRouter } from "./routes/planning.js";
import { skillsRouter } from "./routes/skills.js";
import { absencesRouter } from "./routes/absences.js";

const isProduction = process.env.NODE_ENV === "production";

const app = express();
// Render (et la plupart des PaaS) placent l'appli derrière un reverse proxy qui termine le TLS :
// sans ceci, Express ne voit jamais une requête "secure" et le cookie de session ne serait jamais posé.
app.set("trust proxy", 1);

app.use(
  cors({
    origin: process.env.WEB_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());

// MemoryStore (le défaut d'express-session) perd toutes les sessions à chaque redémarrage du
// process — un vrai problème sur Render, dont le plan gratuit met le service en veille après
// inactivité (donc redémarre à chaque réveil) : tout le monde serait déconnecté en permanence.
// On stocke les sessions dans la même base Postgres dès qu'une connexion est disponible.
const PgSession = connectPgSimple(session);
const sessionStore = process.env.DATABASE_URL
  ? new PgSession({
      // Render (et la plupart des Postgres hébergés) exigent TLS sur les connexions externes ;
      // le pilote "pg" sous-jacent ne le négocie pas tout seul comme le fait Prisma, il faut le
      // demander explicitement (via conObject, pas conString) sinon la connexion échoue avec ECONNRESET.
      conObject: { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } },
      createTableIfMissing: true,
    })
  : undefined;

app.use(
  session({
    store: sessionStore,
    secret: process.env.SESSION_SECRET ?? "dev-only-secret-change-me",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      // En local, front et API partagent le même site (localhost) : "lax" + non-secure suffit.
      // En production, front et API sont sur des sous-domaines différents (requête cross-site) :
      // il faut "none" + secure, sinon le navigateur refuse d'envoyer le cookie de session.
      sameSite: isProduction ? "none" : "lax",
      secure: isProduction,
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  })
);

app.use("/auth", authRouter);
app.use("/employees", employeesRouter);
app.use("/schedules", schedulesRouter);
app.use("/tasks", tasksRouter);
app.use("/planning", planningRouter);
app.use("/skills", skillsRouter);
app.use("/absences", absencesRouter);

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(error);
  if (error && typeof error === "object" && "code" in error && error.code === "P2002") {
    res.status(409).json({ error: "Conflit : cette valeur existe déjà" });
    return;
  }
  res.status(500).json({ error: "Erreur interne du serveur" });
});

// API_PORT est prioritaire pour garder le dev local stable (voir la note d'environnement sur la
// collision avec un éventuel PORT injecté par un outil tiers) ; PORT est le fallback utilisé par
// les plateformes d'hébergement (Render, Heroku, ...) qui assignent le port dynamiquement.
const port = Number(process.env.API_PORT ?? process.env.PORT ?? 4000);
app.listen(port, () => {
  console.log(`API en écoute sur le port ${port}`);
});
