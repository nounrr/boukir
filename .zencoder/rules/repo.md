---
description: Repository Information Overview
alwaysApply: true
---

# Boukir Diamond Information

## Summary
A full-featured commercial management application built with React.js, TypeScript, and Express.js. The system includes authentication, employee management, inventory, contacts, orders, and payments management.

## Structure
- **frontend/**: React.js application with TypeScript
- **backend/**: Express.js API server with MySQL database
- **sql.sql/**: SQL table definitions and schema
- **exceels/**: Excel files for data import

## Main Components
- **Frontend**: React SPA with Redux Toolkit for state management
- **Backend**: Express.js REST API with MySQL database
- **Authentication**: JWT-based authentication system
- **Database**: MySQL with multiple related tables

## Frontend

### Language & Runtime
**Language**: TypeScript
**Version**: TypeScript ~5.8.3
**Framework**: React 19.1.0
**Build System**: Vite 7.0.4
**Package Manager**: npm

### Dependencies
**Main Dependencies**:
- React 19.1.0 with React Router 7.7.1
- Redux Toolkit 2.8.2 with Redux Persist 6.0.0
- Tailwind CSS 3.4.0
- Formik 2.4.6 with Yup 1.7.0
- jsPDF 3.0.1 and html2canvas 1.4.1

**Development Dependencies**:
- TypeScript 5.8.3
- ESLint 9.30.1
- Vite 7.0.4
- Tailwind CSS 3.4.0

### Build & Installation
```bash
npm install
npm run dev        # Frontend only
npm run dev:full   # Frontend + Backend
npm run build      # Production build
```

## Backend

### Language & Runtime
**Language**: JavaScript (ES Modules)
**Framework**: Express.js 4.19.2
**Database**: MySQL 2.x

### Dependencies
**Main Dependencies**:
- express 4.19.2
- mysql2 3.11.3
- bcryptjs 2.4.3
- jsonwebtoken 9.0.2
- multer 2.0.2
- cors 2.8.5
- dotenv 16.4.5

### Configuration
**Database**: MySQL connection configured via environment variables
**Authentication**: JWT-based with configurable secret and expiration
**File Storage**: Local file storage for uploads (employee documents, payments)

### API Routes
- Authentication: `/api/auth`
- Employees: `/api/employees`
- Products: `/api/products`
- Categories: `/api/categories`
- Contacts: `/api/contacts`
- Orders: `/api/commandes`, `/api/bons`, `/api/comptant`
- Payments: `/api/payments`
- Reports: Various endpoints for business reporting

## Docker
No Docker configuration found in the repository.

## Testing
No formal testing framework found in the repository.

## Development Requirements
**Node.js**: 20+ recommended
**Database**: MySQL 5.7+
**Environment**: Development environment variables in `.env` files