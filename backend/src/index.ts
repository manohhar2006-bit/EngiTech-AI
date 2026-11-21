import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import repositoryRoutes from './routes/repositoryRoutes';
import { ensureSeededRepositories } from './controllers/repositoryController';
import { graphRoutes } from './routes/graphRoutes';
import { whyRoutes } from './routes/whyRoutes';
import decisionDebtRoutes from './routes/decisionDebtRoutes';
import { impactRoutes } from './routes/impactRoutes';
import { ProviderService } from '../../ai-engine/services/providerService';

// Ensure .env is loaded from both current directory and backend/ root
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(process.cwd(), 'backend/.env') });

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Health Check Endpoint
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'online',
    system: 'EngiTrace Intelligence Engine',
    version: '0.6.0',
    phase: 'Phase 6 What-If Impact Analysis',
    githubTokenConfigured: Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_TOKEN.trim() !== '' && !process.env.GITHUB_TOKEN.includes('your_github')),
    geminiConfigured: Boolean(
      (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY.trim() !== '' && !process.env.GEMINI_API_KEY.includes('your_gemini')) ||
      (process.env.GOOGLE_API_KEY && process.env.GOOGLE_API_KEY.trim() !== '' && !process.env.GOOGLE_API_KEY.includes('your_google'))
    )
  });
});

// Phase 1 Repository Ingestion & Evidence API Routes
app.use('/api/v1/repositories', repositoryRoutes);

// Phase 2 Engineering Memory Graph API Routes
app.use('/api/v1/repositories', graphRoutes);

// Phase 3 WHY Explorer API Routes
app.use('/api/v1/repositories', whyRoutes);

// Phase 5 Decision Debt API Routes
app.use('/api/v1/repositories', decisionDebtRoutes);

// Phase 6 What-If Impact Analysis API Routes
app.use('/api/v1/repositories', impactRoutes);

ensureSeededRepositories();

const server = app.listen(PORT, async () => {
  console.log(`[EngiTrace Backend] Engine running on http://localhost:${PORT}`);
  await ProviderService.logConfigAndHealth();
});

server.on('error', (err: any) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n❌ [EngiTrace Backend Error] Port ${PORT} is already in use by another process.`);
    console.error(`→ Identify and stop the existing process on port ${PORT}, or configure an available PORT in backend/.env.\n`);
    process.exit(1);
  } else {
    console.error('[EngiTrace Backend Error]', err);
  }
});

