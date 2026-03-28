# Online Voting System - Backend Setup

This is a Node.js/Express backend for the Online Voting System with SQLite database.

## Project Structure
```
backend/
├── package.json      # Dependencies
├── server.js         # Express server with all API routes
└── voting.db         # SQLite database (created automatically)
```

## Setup Instructions

### 1. Install Node.js
Make sure you have Node.js installed (version 14 or higher):
```bash
node --version
```

### 2. Install Dependencies
Navigate to the backend folder and install packages:
```bash
cd backend
npm install
```

### 3. Start the Server
```bash
# Development mode (auto-restarts on changes)
npm run dev

# Production mode
npm start
```

The server will start on `http://localhost:3000`

## API Endpoints

### User Routes
- **POST** `/api/users/register` - Register a new user
- **POST** `/api/users/login` - User login (returns JWT token)

### Admin Routes
- **POST** `/api/admins/register` - Register a new admin
- **POST** `/api/admins/login` - Admin login (returns JWT token)

### Public Routes
- **GET** `/api/candidates` - Get all candidates
- **GET** `/api/results` - Get voting results

### Protected Routes (requires Bearer token)
- **POST** `/api/votes` - Cast a vote

### Admin Protected Routes (requires admin token)
- **GET** `/api/admin/stats` - Get election statistics
- **POST** `/api/admin/candidates` - Add a new candidate
- **POST** `/api/admin/reset` - Reset election (clear all votes)

## Features

- **SQLite Database**: Persistent data storage
- **JWT Authentication**: Secure login with tokens
- **bcryptjs**: Password hashing for security
- **CORS Enabled**: Frontend can communicate with backend
- **Pre-populated Candidates**: 4 default candidates from Gujarat

## Testing the Setup

1. Start the backend server: `npm run dev`
2. Open the frontend `index.html` in a browser
3. Register a new user or login
4. The frontend will connect to `http://localhost:3000`

## Stopping the Server

Press `Ctrl+C` in the terminal to stop the server. The database will persist between restarts.
