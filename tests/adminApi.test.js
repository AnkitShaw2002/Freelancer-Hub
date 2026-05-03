const { startTestDatabase, clearDatabase, stopTestDatabase, createUser, getAuthCookie } = require('./testUtils');
const request = require('supertest');
const app = require('../app');
const Project = require('../app/models/Project');

beforeAll(async () => {
  await startTestDatabase();
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  await stopTestDatabase();
});

describe('Admin API', () => {
  it('should allow admin to fetch dashboard metrics', async () => {
    const admin = await createUser({ email: 'admin@example.com', role: 'admin', firstName: 'Admin', lastName: 'User' });
    await createUser({ email: 'client.admin@example.com', role: 'client' });
    await Project.create({
      clientId: admin._id,
      clientName: admin.displayName,
      title: 'Admin Project',
      description: 'A project for admin metrics.',
      category: 'Web Development',
      skills: ['Admin'],
      budget: { type: 'fixed', min: 100, max: 200 },
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .get('/api/admin')
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.metrics).toBeDefined();
    expect(res.body.data.metrics.users.total).toBeGreaterThanOrEqual(2);
  });

  it('should allow admin to ban a client user', async () => {
    const admin = await createUser({ email: 'admin.ban@example.com', role: 'admin' });
    const client = await createUser({ email: 'client.ban@example.com', role: 'client' });

    const res = await request(app)
      .post(`/api/admin/users/${client._id}/ban`)
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.isBanned).toBe(true);
  });

  it('should reject non-admin requests to admin endpoints', async () => {
    const client = await createUser({ email: 'client.nonadmin@example.com', role: 'client' });
    const res = await request(app)
      .get('/api/admin')
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(403);
    expect(res.body.status).toBe(false);
    expect(res.body.message).toContain('Access Denied');
  });
});
