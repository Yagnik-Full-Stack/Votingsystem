const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/voting_system';

// CORS configuration
app.use(cors({
  origin: ['http://localhost:5173', 'https://onlinevotingssystem.netlify.app'],
  credentials: true
}));
app.use(express.json());

// ─── Root Route ────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    message: 'Online Voting System API',
    status: 'Running',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    endpoints: {
      auth: {
        register: 'POST /api/auth/register',
        login: 'POST /api/auth/login',
        me: 'GET /api/auth/me'
      },
      elections: {
        list: 'GET /api/elections',
        create: 'POST /api/elections',
        end: 'POST /api/elections/:id/end',
        delete: 'DELETE /api/elections/:id'
      },
      votes: {
        cast: 'POST /api/votes',
        history: 'GET /api/votes/user/:userId'
      },
      stats: 'GET /api/stats'
    }
  });
});

// ─── Schemas ───────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  username: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'admin'], default: 'user' },
  voted: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const candidateSchema = new mongoose.Schema({
  id: { type: String, required: true },
  name: { type: String, required: true },
  party: { type: String, required: true },
  votes: { type: Number, default: 0 }
});

const electionSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String, default: '' },
  status: { type: String, enum: ['active', 'closed', 'pending'], default: 'active' },
  candidates: [candidateSchema],
  winnerId: { type: String, default: null },
  createdAt: { type: Number, default: Date.now }
});

const voteSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  electionId: { type: String, required: true },
  candidateId: { type: String, required: true },
  timestamp: { type: Date, default: Date.now }
});

const identitySchema = new mongoose.Schema({
  aadhaar: [{ type: String }],
  pan: [{ type: String }],
  voterId: [{ type: String }]
});

const User = mongoose.model('User', userSchema);
const Election = mongoose.model('Election', electionSchema);
const Vote = mongoose.model('Vote', voteSchema);
const Identity = mongoose.model('Identity', identitySchema);

// ─── Connect to MongoDB ────────────────────────────────────────────────

mongoose.set('bufferCommands', false);

const connectDB = async () => {
  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 15000,
      socketTimeoutMS: 45000,
      connectTimeoutMS: 15000,
      maxPoolSize: 10
    });
    console.log('Connected to MongoDB Atlas');
    await seedData();
  } catch (err) {
    console.error('MongoDB connection error:', err.message);
    if (err.message.includes('whitelist') || err.message.includes('Could not connect')) {
      console.log('\n=== FIX REQUIRED ===');
      console.log('1. Go to https://cloud.mongodb.com');
      console.log('2. Select your cluster (Cluster0)');
      console.log('3. Go to Network Access → Add IP Address');
      console.log('4. Click "Add Current IP Address" or use 0.0.0.0/0 for all IPs');
      console.log('5. Wait 1-2 minutes and restart this server');
      console.log('===================\n');
    }
    console.log('Retrying in 5 seconds...');
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// ─── Seed Data ─────────────────────────────────────────────────────────

async function seedData() {
  try {
    const adminExists = await User.findOne({ email: 'admin@securevote.com' });
    if (!adminExists) {
      const admin = new User({
        name: 'System Admin',
        username: 'admin',
        email: 'admin@securevote.com',
        password: await bcrypt.hash('password123', 10),
        role: 'admin'
      });
      await admin.save();
      console.log('Admin user created: admin@securevote.com / password123');
    }

    const electionExists = await Election.findOne({ id: 'e-1' });
    if (!electionExists) {
      const election = new Election({
        id: 'e-1',
        title: 'General Presidential Election 2024',
        description: 'The primary election to select the next national leader.',
        status: 'active',
        candidates: [
          { id: 'c-1', name: 'Yagnik Patel', party: 'Innovation Party', votes: 0 },
          { id: 'c-2', name: 'Shivam Sharma', party: 'Heritage Union', votes: 0 },
          { id: 'c-3', name: 'Yash Mehta', party: 'Green Future', votes: 0 }
        ]
      });
      await election.save();
      console.log('Sample election created');
    }
  } catch (seedErr) {
    console.error('Auto-seed error:', seedErr.message);
  }
}

// ─── Middleware: Check DB Connection ────────────────────────────────────

const checkDB = (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).json({ error: 'Database not connected. Please try again.' });
  }
  next();
};

app.use('/api', checkDB);

// ─── Auth Middleware ────────────────────────────────────────────────────

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, () => {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  });
};

// ─── Auth Routes ───────────────────────────────────────────────────────

app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, username, email, password, role = 'user' } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'Username, email, and password required' });
    }

    const existingUser = await User.findOne({ $or: [{ username }, { email }] });
    if (existingUser) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = new User({
      name: name || username,
      username,
      email,
      password: hashedPassword,
      role
    });

    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.status(201).json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        voted: user.voted
      }
    });
  } catch (error) {
    console.error('Register error:', error);
    if (error.code === 11000) {
      return res.status(400).json({ error: 'Username or email already exists' });
    }
    if (error.name === 'ValidationError') {
      return res.status(400).json({ error: error.message });
    }
    res.status(500).json({ error: error.message || 'Registration failed' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user._id, username: user.username, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role,
        voted: user.voted
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/users', authenticateAdmin, async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// ─── Election Routes ───────────────────────────────────────────────────

app.get('/api/elections', async (req, res) => {
  try {
    const elections = await Election.find().sort({ createdAt: -1 });
    res.json(elections);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch elections' });
  }
});

app.get('/api/elections/:id', async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }
    res.json(election);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch election' });
  }
});

app.post('/api/elections', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, candidates } = req.body;

    const election = new Election({
      id: 'e-' + Date.now(),
      title,
      description: description || '',
      status: 'active',
      candidates: candidates.map((c, idx) => ({
        id: c.id || 'c-' + Date.now() + '-' + idx,
        name: c.name,
        party: c.party,
        votes: 0
      }))
    });

    await election.save();
    res.status(201).json(election);
  } catch (error) {
    console.error('Create election error:', error);
    res.status(500).json({ error: 'Failed to create election' });
  }
});

app.put('/api/elections/:id', authenticateAdmin, async (req, res) => {
  try {
    const { title, description, candidates } = req.body;
    const election = await Election.findOne({ id: req.params.id });

    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }

    election.title = title;
    election.description = description || '';
    election.candidates = candidates;

    await election.save();
    res.json(election);
  } catch (error) {
    res.status(500).json({ error: 'Failed to update election' });
  }
});

app.post('/api/elections/:id/end', authenticateAdmin, async (req, res) => {
  try {
    const election = await Election.findOne({ id: req.params.id });
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }

    let winner = election.candidates[0];
    election.candidates.forEach(c => {
      if (c.votes > winner.votes) winner = c;
    });

    election.status = 'closed';
    election.winnerId = winner.id;

    await election.save();
    res.json(election);
  } catch (error) {
    res.status(500).json({ error: 'Failed to end election' });
  }
});

app.delete('/api/elections/:id', authenticateAdmin, async (req, res) => {
  try {
    await Election.deleteOne({ id: req.params.id });
    await Vote.deleteMany({ electionId: req.params.id });
    res.json({ message: 'Election deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete election' });
  }
});

// ─── Vote Routes ───────────────────────────────────────────────────────

app.post('/api/votes', authenticateToken, async (req, res) => {
  try {
    const { electionId, candidateId } = req.body;
    const userId = req.user.id;

    const existingVote = await Vote.findOne({ userId, electionId });
    if (existingVote) {
      return res.status(400).json({ error: 'You have already voted in this election' });
    }

    const election = await Election.findOne({ id: electionId });
    if (!election) {
      return res.status(404).json({ error: 'Election not found' });
    }

    if (election.status !== 'active') {
      return res.status(400).json({ error: 'Election is not active' });
    }

    const candidate = election.candidates.find(c => c.id === candidateId);
    if (!candidate) {
      return res.status(400).json({ error: 'Invalid candidate' });
    }

    candidate.votes += 1;
    await election.save();

    const vote = new Vote({
      id: 'v-' + Date.now(),
      userId,
      electionId,
      candidateId
    });
    await vote.save();

    await User.findByIdAndUpdate(userId, { voted: true });

    res.json({ message: 'Vote recorded successfully' });
  } catch (error) {
    console.error('Vote error:', error);
    res.status(500).json({ error: 'Failed to record vote' });
  }
});

app.get('/api/votes/user/:userId', authenticateToken, async (req, res) => {
  try {
    const votes = await Vote.find({ userId: req.params.userId });
    res.json(votes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

app.get('/api/votes/election/:electionId', async (req, res) => {
  try {
    const votes = await Vote.find({ electionId: req.params.electionId });
    res.json(votes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch votes' });
  }
});

// ─── Stats Route ───────────────────────────────────────────────────────

app.get('/api/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalElections = await Election.countDocuments();
    const totalVotes = await Vote.countDocuments();
    const activeElections = await Election.countDocuments({ status: 'active' });

    res.json({
      totalUsers,
      totalElections,
      totalVotes,
      activeElections
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// ─── Identity Routes ───────────────────────────────────────────────────

app.get('/api/identities', authenticateToken, async (req, res) => {
  try {
    let identities = await Identity.findOne();
    if (!identities) {
      identities = new Identity({ aadhaar: [], pan: [], voterId: [] });
      await identities.save();
    }
    res.json(identities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch identities' });
  }
});

app.post('/api/identities', authenticateToken, async (req, res) => {
  try {
    const { aadhaar, pan, voterId } = req.body;
    let identities = await Identity.findOne();

    if (!identities) {
      identities = new Identity({ aadhaar: [], pan: [], voterId: [] });
    }

    if (aadhaar && !identities.aadhaar.includes(aadhaar)) {
      identities.aadhaar.push(aadhaar);
    }
    if (pan && !identities.pan.includes(pan)) {
      identities.pan.push(pan);
    }
    if (voterId && !identities.voterId.includes(voterId)) {
      identities.voterId.push(voterId);
    }

    await identities.save();
    res.json(identities);
  } catch (error) {
    res.status(500).json({ error: 'Failed to register identities' });
  }
});

// ─── Seed Route ────────────────────────────────────────────────────────

app.post('/api/seed', async (req, res) => {
  try {
    await seedData();
    res.json({ message: 'Seed data created' });
  } catch (error) {
    console.error('Seed error:', error);
    res.status(500).json({ error: 'Failed to seed data' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`MongoDB URI: ${MONGODB_URI}`);
});
