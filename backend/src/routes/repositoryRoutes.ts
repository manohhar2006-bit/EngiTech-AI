import { Router } from 'express';
import { RepositoryController } from '../controllers/repositoryController';

const router = Router();

// Analyze GitHub Repository URL
router.post('/analyze', RepositoryController.analyzeRepository);

// Get List of Analyzed Repositories
router.get('/', RepositoryController.getRepositories);

// Get Specific Repository Summary
router.get('/:id', RepositoryController.getRepositoryById);

// Get Repository Commits
router.get('/:id/commits', RepositoryController.getCommits);

// Get Repository File Structure
router.get('/:id/files', RepositoryController.getFiles);

// Get Repository Issues & PRs
router.get('/:id/issues', RepositoryController.getIssues);

// Get Normalized Historical Evidence Records
router.get('/:id/evidence', RepositoryController.getEvidence);

export default router;
