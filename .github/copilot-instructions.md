# Copilot Instructions

<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

## Project Context

This is a React.js commercial management application with the following stack:
- **Frontend**: React.js with Vite and TypeScript
- **State Management**: Redux Toolkit with RTK Query for API calls
- **Routing**: React Router with protected routes
- **Styling**: Tailwind CSS
- **Forms**: Formik + Yup validation
- **Authentication**: JWT with role-based access (PDG/Employé)

## Key Features

1. **Authentication System**: Login with CIN + Password, JWT token storage
2. **Employee Management**: Full CRUD for employees (PDG only)
3. **Stock Management**: Product inventory management
4. **Contact Management**: Clients and suppliers
5. **Order Management**: Commands, sorties, comptant, avoirs, devis
6. **Payment Management**: Caisse system
7. **Audit Trail**: All actions include `created_by` field

## Code Guidelines

- Use TypeScript for type safety
- Follow Redux Toolkit patterns with RTK Query
- Implement protected routes with role-based access
- Use Tailwind CSS for styling with consistent design system
- Add proper form validation with Formik + Yup
- Include `created_by` field in all mutations
- Use fake data for testing (no real database)

## Security Rules

- **PDG Role**: Full access to all features
- **Employé Role**: Limited access (no employee management)
- All routes require authentication
- Automatic token validation and refresh
