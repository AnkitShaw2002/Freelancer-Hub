const { startTestDatabase, clearDatabase, stopTestDatabase, createUser, getAuthCookie } = require('./testUtils');
const request = require('supertest');
const app = require('../app');
const User = require('../app/models/User');

beforeAll(async () => {
  await startTestDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe('Auth API', () => {
  it('should register a new client account', async () => {
    const res = await request(app)
      .post('/api/auth/register-create')
      .send({
        firstName: 'Test',
        lastName: 'User',
        email: 'auth.user@example.com',
        password: 'Password123!',
        role: 'client'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/Registration successful/i);

    const user = await User.findOne({ email: 'auth.user@example.com' }).lean();
    expect(user).toBeTruthy();
    expect(user.role).toBe('client');
  });

  it('should redirect register-create to register page', async () => {
    const res = await request(app).get('/api/auth/register-create');
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe('/register');
  });

  it('should verify a registered account using token', async () => {
    const user = await createUser({
      email: 'verify.user@example.com',
      role: 'client',
      isVerified: false,
      firstName: 'Verify',
      lastName: 'User'
    });

    const res = await request(app).post(`/api/auth/verify-account/${user.verificationToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/verified/i);

    const refreshed = await User.findById(user._id).lean();
    expect(refreshed.isVerified).toBe(true);
  });

  it('should login a verified user', async () => {
    await createUser({
      email: 'login.user@example.com',
      role: 'client',
      password: 'Password123!',
      isVerified: true,
      firstName: 'Login',
      lastName: 'User'
    });

    const res = await request(app)
      .post('/api/auth/login-create')
      .send({ email: 'login.user@example.com', password: 'Password123!' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe('login.user@example.com');
  });

  it('should handle forgot password and reset password flow', async () => {
    const user = await createUser({
      email: 'reset.user@example.com',
      role: 'client',
      password: 'Password123!',
      isVerified: true,
      firstName: 'Reset',
      lastName: 'User'
    });

    user.resetPasswordToken = 'reset-token';
    user.resetPasswordExpires = Date.now() + 3600000;
    await user.save();

    const forgotRes = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'reset.user@example.com' });

    expect(forgotRes.statusCode).toBe(200);
    expect(forgotRes.body.success).toBe(true);

    const userWithToken = await User.findById(user._id).lean();
    expect(userWithToken.resetPasswordToken).toBeTruthy();

    const resetRes = await request(app)
      .post(`/api/auth/reset-password/${userWithToken.resetPasswordToken}`)
      .send({ password: 'NewPass123!' });

    expect(resetRes.statusCode).toBe(200);
    expect(resetRes.body.success).toBe(true);

    const updated = await User.findById(user._id).lean();
    expect(updated.resetPasswordToken).toBeNull();
  });

  it('should logout an authenticated user', async () => {
    const user = await createUser({
      email: 'logout.user@example.com',
      role: 'client',
      isVerified: true,
      firstName: 'Logout',
      lastName: 'User'
    });

    const res = await request(app)
      .get('/api/auth/logout')
      .set('Cookie', [getAuthCookie(user)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toMatch(/logged out/i);
  });
});


