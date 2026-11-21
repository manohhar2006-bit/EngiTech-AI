# EngiTrace Local Setup & Execution Guide

This guide provides instructions for setting up, running, and testing **EngiTrace** locally.

---

## 📋 System Requirements

- **Operating System**: macOS, Linux, or Windows (PowerShell / CMD)
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher

---

## 🛠️ Step-by-Step Installation

### Step 1: Environment Setup
Ensure you are in the workspace root directory:
```bash
cd engitrace
```

Copy `.env.example` to create your local `.env`:
```bash
cp .env.example .env
```

### Step 2: Install Frontend Dependencies
Navigate to the frontend directory and install dependencies:
```bash
cd frontend
npm install
```

### Step 3: Run Frontend in Development Mode
Start Vite's local dev server:
```bash
npm run dev
```
The application will launch automatically at `http://localhost:5173`.

---

## 🧪 Verification & Testing Commands

### Type Checking & Linting
Run TypeScript compiler check across the project:
```bash
cd frontend
npm run build
```

---

## 🚀 Directory Structure Overview

```text
engitrace/
├── frontend/     # React 18/19 + Vite + TypeScript UI application
├── backend/      # Express API gateway scaffold
├── analyzer/     # Git mining & AST parser scaffold
├── graph-engine/ # WhyGraph ontology & engine scaffold
├── ai-engine/    # Prompt chains & risk analyzer scaffold
└── docs/         # System architecture & specs
```
