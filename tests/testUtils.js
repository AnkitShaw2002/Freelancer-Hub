const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../app/models/User');
const Role = require('../app/models/roleModel');

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'test_jwt_secret';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret';
process.env.BASE_URL = process.env.BASE_URL || 'http://localhost';
process.env.MAIL_HOST = process.env.MAIL_HOST || '';
process.env.MAIL_USER = process.env.MAIL_USER || '';
process.env.MAIL_PASS = process.env.MAIL_PASS || '';

jest.setTimeout(20000);

let mongoServer;

const roles = [
  {
    name: 'admin',
    description: 'Full system admin access',
    permissions: [
      'admin:dashboard',
      'users:view',
      'users:manage',
      'projects:view',
      'projects:manage',
      'disputes:view',
      'disputes:resolve',
      'analytics:view',
      'notifications:manage',
      'messages:view',
      'messages:send'
    ]
  },
  {
    name: 'freelancer',
    description: 'Freelancer role for bidding and messaging',
    permissions: [
      'profile:view',
      'profile:edit',
      'projects:browse',
      'projects:apply',
      'projects:view-my',
      'bids:view',
      'bids:manage',
      'work:submit',
      'wallet:view',
      'messages:send',
      'messages:view',
      'reviews:view',
      'reviews:give'
    ]
  },
  {
    name: 'client',
    description: 'Client role for posting and hiring freelancers',
    permissions: [
      'profile:view',
      'profile:edit',
      'projects:create',
      'projects:edit',
      'projects:delete',
      'projects:view-my',
      'projects:award',
      'projects:complete',
      'payments:manage',
      'messages:send',
      'messages:view',
      'reviews:view',
      'reviews:give'
    ]
  }
];

const startTestDatabase = async () => {
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET_KEY = process.env.JWT_SECRET_KEY || 'test_jwt_secret';
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret';
  process.env.BASE_URL = process.env.BASE_URL || 'http://localhost';
  process.env.MAIL_HOST = process.env.MAIL_HOST || '';
  process.env.MAIL_USER = process.env.MAIL_USER || '';
  process.env.MAIL_PASS = process.env.MAIL_PASS || '';

  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongoServer.getUri();

  await mongoose.connect(process.env.MONGO_URL);
  await seedRoles();
};

const seedRoles = async () => {
  await Role.deleteMany();
  await Role.insertMany(roles);
};

const clearDatabase = async () => {
  const collections = mongoose.connection.collections;
  for (const key in collections) {
    await collections[key].deleteMany({});
  }
  await seedRoles();
};

const stopTestDatabase = async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.connection.close();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
};

const createUser = async ({
  firstName = 'Test',
  lastName = 'User',
  email = 'test@example.com',
  password = 'Password123!',
  role = 'client',
  category = '',
  isVerified = true,
  isBanned = false,
  isDeleted = false
} = {}) => {
  const hashedPassword = await bcrypt.hash(password, 12);
  return User.create({
    displayName: `${firstName} ${lastName}`,
    firstName,
    lastName,
    email: email.toLowerCase(),
    password: hashedPassword,
    role,
    category,
    isVerified,
    isBanned,
    isDeleted,
    verificationToken: isVerified ? null : 'verify-token'
  });
};

const getAuthToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      _id: user._id,
      name: user.displayName,
      email: user.email,
      role: user.role
    },
    process.env.JWT_SECRET_KEY,
    { expiresIn: '7d' }
  );
};

const getAuthCookie = (user) => {
  const token = getAuthToken(user);
  return `token=${token}`;
};

module.exports = {
  startTestDatabase,
  clearDatabase,
  stopTestDatabase,
  createUser,
  getAuthCookie,
  getAuthToken,
  seedRoles
};
