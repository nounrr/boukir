import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import pool from '../db/pool.js';

let io = null;

/**
 * Initialize Socket.IO server
 * @param {import('http').Server} httpServer - HTTP server instance
 * @returns {Server} Socket.IO instance
 */
export function initializeSocketServer(httpServer) {
  console.log('\n📡 Initializing Socket.IO server...');
  
  const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:5173';
  console.log(`  → Frontend URL: ${frontendUrl}`);
  
  io = new Server(httpServer, {
    cors: {
      origin: frontendUrl,
      credentials: true,
      methods: ['GET', 'POST']
    },
    path: '/socket.io/',
    transports: ['websocket', 'polling'],
    allowEIO3: true
  });

  console.log('  → CORS configured');
  console.log('  → Transports: websocket, polling');
  console.log('  → Path: /socket.io/');

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
      
      // Get user from database
      // Check EMPLOYEES table first (for employee/PDG users)
      const connection = await pool.getConnection();
      try {
        const [employees] = await connection.query(
          'SELECT id, nom_complet, role FROM employees WHERE id = ? AND deleted_at IS NULL',
          [decoded.id]
        );

        if (employees.length > 0) {
          // Employee user found
          socket.user = {
            id: employees[0].id,
            nom_complet: employees[0].nom_complet,
            role: employees[0].role,
            type: 'employee'
          };
          next();
          return;
        }

        // If not found in employees, check CONTACTS table (e-commerce users)
        const [contacts] = await connection.query(
          'SELECT id, email, type_compte FROM contacts WHERE id = ? AND deleted_at IS NULL',
          [decoded.id]
        );

        if (contacts.length === 0) {
          return next(new Error('User not found'));
        }

        // Contact/e-commerce user found
        socket.user = {
          id: contacts[0].id,
          email: contacts[0].email,
          type_compte: contacts[0].type_compte,
          type: 'contact'
        };
        next();
      } finally {
        connection.release();
      }
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Invalid authentication token'));
    }
  });

  // Connection handler
  io.on('connection', (socket) => {
    console.log(`\n✓ Socket connected: ${socket.id}`);
    console.log(`  → User: ${socket.user.nom_complet || socket.user.email} (ID: ${socket.user.id})`);
    console.log(`  → Type: ${socket.user.type}`);
    if (socket.user.role) console.log(`  → Role: ${socket.user.role}`);

    // Join user to their personal room
    socket.join(`user:${socket.user.id}`);
    console.log(`  → Joined room: user:${socket.user.id}`);

    // Join PDG users to PDG room for notifications
    if (socket.user.type === 'employee' && socket.user.role === 'PDG') {
      socket.join('pdg-notifications');
      console.log(`  → Joined room: pdg-notifications (PDG employee) ✅`);
    } else {
      console.log(`  → Not PDG (${socket.user.type})`);
    }

    // Handle disconnect
    socket.on('disconnect', (reason) => {
      console.log(`\n✗ Socket disconnected: ${socket.id}`);
      console.log(`  → User: ${socket.user.email}`);
      console.log(`  → Reason: ${reason}`);
    });

    // Handle custom events (optional)
    socket.on('ping', () => {nom_complet || socket.user.
      socket.emit('pong', { timestamp: Date.now() });
    });

    // Error handler
    socket.on('error', (error) => {
      console.error(`\n❌ Socket error for ${socket.user.email}:`, error);
    });
  });

  console.log('\n✅ Socket.IO server initialized successfully\n');
  return io;
}

/**
 * Get Socket.IO instance
 * @returns {Server|null} Socket.IO instance
 */
export function getIO() {
  if (!io) {
    throw new Error('Socket.IO not initialized. Call initializeSocketServer first.');
  }
  return io;
}

/**
 * Check if user is PDG from employees table
 * Since employees table doesn't have email, we check if the contact's email
 * matches an employee's nom_complet or if there's a direct user role in auth state
 * @param {number} userId - User ID from contacts
 * @param {string} email - User email from contacts
 * @returns {Promise<boolean>} True if user is PDG
 */
async function checkIfPDG(userId, email) {
  const connection = await pool.getConnection();
  try {
    // For e-commerce users, check if they're also in employees table
    // This is a simple check - you may need to adjust based on your business logic
    // For now, we'll return false for e-commerce users (they're not employees)
    // PDG users should use the main employee login, not e-commerce login
    
    // If you want to link contacts to employees, you'll need to add a reference field
    // For now, e-commerce users (from contacts table) are not PDG
    return false;
  } catch (error) {
    console.error('  ✗ Error checking PDG status:', error);
    return false;
  } finally {
    connection.release();
  }
}

/**
 * Emit notification to PDG users
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function emitToPDG(event, data) {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit event');
    return;
  }
  io.to('pdg-notifications').emit(event, data);
  console.log(`📢 Emitted ${event} to PDG room:`, data);
}

/**
 * Emit notification to specific user
 * @param {number} userId - User ID
 * @param {string} event - Event name
 * @param {Object} data - Event data
 */
export function emitToUser(userId, event, data) {
  if (!io) {
    console.warn('Socket.IO not initialized, cannot emit event');
    return;
  }
  io.to(`user:${userId}`).emit(event, data);
  console.log(`📢 Emitted ${event} to user ${userId}:`, data);
}
