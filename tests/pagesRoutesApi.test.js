const { startTestDatabase, clearDatabase, stopTestDatabase } = require('./testUtils');
const request = require('supertest');
const app = require('../app');

beforeAll(async () => {
  await startTestDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe('Page Router API', () => {
  it('should return landing page data', async () => {
    const res = await request(app).get('/api');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('title');
    expect(res.body.data.stats).toBeDefined();
  });

  it('should return register page metadata', async () => {
    const res = await request(app).get('/api/register');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.authenticated).toBe(false);
    expect(res.body.title).toBe('Register');
  });

  it('should block unauthenticated access to settings', async () => {
    const res = await request(app).get('/api/settings');
    expect(res.statusCode).toBe(401);
    expect(res.body.status).toBe(false);
    expect(res.body.message).toContain('Authentication required');
  });

  it('should return verify token context', async () => {
    const res = await request(app).get('/api/verify/test-token');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('test-token');
  });
});
