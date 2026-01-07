# Buildproof

## Overview

Buildproof is a construction project management application for tracking construction sites and their verification proofs. The app allows site managers to create projects, upload photo evidence of construction progress, and manage verification status of submitted proofs. It features a dashboard with project statistics, individual project detail views, and proof management capabilities.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: Dual setup with Next.js (App Router) for potential SSR/static pages and Vite + React for the main SPA client
- **Routing**: Wouter for lightweight client-side routing in the Vite app
- **State Management**: TanStack React Query for server state management with custom hooks (`use-projects`, `use-proofs`)
- **UI Components**: Shadcn/ui component library with Radix UI primitives
- **Styling**: Tailwind CSS v4 with custom design tokens (industrial blue/grey palette with orange safety accents)
- **Forms**: React Hook Form with Zod validation

### Backend Architecture
- **Server**: Express.js with TypeScript
- **API Design**: REST endpoints defined in `shared/routes.ts` with Zod schemas for type-safe request/response handling
- **Database ORM**: Drizzle ORM with PostgreSQL dialect
- **Storage Layer**: Abstracted storage interface (`IStorage`) implemented by `DatabaseStorage` class

### Data Layer
- **Schema Location**: `shared/schema.ts` defines database tables and Zod validation schemas
- **Entities**: 
  - `projects`: Construction sites with name, description, location, and status
  - `proofs`: Photo evidence linked to projects with verification status

### Build System
- **Client Build**: Vite for development and production builds
- **Server Build**: esbuild with selective dependency bundling for optimized cold starts
- **Output**: Combined build outputs to `dist/` directory

### Shared Code Pattern
The `shared/` directory contains code used by both frontend and backend:
- `schema.ts`: Drizzle table definitions and Zod validation schemas
- `routes.ts`: API route definitions with type-safe input/output schemas

## External Dependencies

### Database
- **PostgreSQL**: Primary database (configured via `DATABASE_URL` environment variable)
- **Drizzle ORM**: Database toolkit with migrations stored in `/migrations`

### UI Libraries
- **Radix UI**: Headless component primitives (dialog, dropdown, tabs, etc.)
- **Lucide React**: Icon library
- **date-fns**: Date formatting utilities

### Development Tools
- **Replit Plugins**: Runtime error overlay, cartographer, and dev banner for Replit environment
- **ESLint**: Code linting with Next.js configuration