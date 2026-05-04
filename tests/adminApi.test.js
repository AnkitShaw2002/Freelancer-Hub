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

  it('should list users for admin', async () => {
    const admin = await createUser({ email: 'admin.users@example.com', role: 'admin' });
    await createUser({ email: 'client.users@example.com', role: 'client' });
    await createUser({ email: 'freelancer.users@example.com', role: 'freelancer' });

    const res = await request(app)
      .get('/api/admin/users')
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.users)).toBe(true);
    expect(res.body.users.length).toBeGreaterThanOrEqual(3);
  });

  it('should list projects for admin', async () => {
    const admin = await createUser({ email: 'admin.projects@example.com', role: 'admin' });
    await Project.create({
      clientId: admin._id,
      clientName: admin.displayName,
      title: 'Admin Listed Project',
      description: 'Project visible to admin listing.',
      category: 'Web Development',
      skills: ['API'],
      budget: { type: 'fixed', min: 300, max: 400 },
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .get('/api/admin/projects')
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.projects)).toBe(true);
    expect(res.body.projects.length).toBeGreaterThanOrEqual(1);
  });

  it('should delete a project via admin', async () => {
    const admin = await createUser({ email: 'admin.delete@example.com', role: 'admin' });
    const project = await Project.create({
      clientId: admin._id,
      clientName: admin.displayName,
      title: 'Delete Project',
      description: 'Project deleted by admin.',
      category: 'Web Development',
      skills: ['Delete'],
      budget: { type: 'fixed', min: 100, max: 200 },
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/admin/projects/${project._id}/delete`)
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.isDeleted).toBe(true);
  });

  it('should return admin notifications', async () => {
    const admin = await createUser({
      email: 'admin.notify@example.com',
      role: 'admin',
      notifications: [{ message: 'Test notification', type: 'system', createdAt: new Date() }]
    });

    const res = await request(app)
      .get('/api/admin/notifications')
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });

  it('should return admin stats', async () => {
    const admin = await createUser({ email: 'admin.stats@example.com', role: 'admin' });
    const res = await request(app)
      .get('/api/admin/stats')
      .set('Cookie', [getAuthCookie(admin)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.stats).toBeDefined();
    expect(res.body.stats.totals).toBeDefined();
  });

  it('should list disputes and resolve a dispute', async () => {
    const admin = await createUser({ email: 'admin.dispute@example.com', role: 'admin' });
    const client = await createUser({ email: 'client.dispute@example.com', role: 'client' });
    const freelancer = await createUser({ email: 'freelancer.dispute@example.com', role: 'freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Dispute Project',
      description: 'Project for dispute handling.',
      category: 'Web Development',
      skills: ['Dispute'],
      budget: { type: 'fixed', min: 500, max: 600 },
      status: 'assigned',
      isDeleted: false,
      selectedBidId: null
    });

    const dispute = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Dispute Project',
      description: 'Fake placeholder project for dispute',
      category: 'Web Development',
      skills: ['Dispute'],
      budget: { type: 'fixed', min: 500, max: 600 },
      status: 'assigned',
      isDeleted: false
    });

    const Dispute = require('../app/models/Dispute');
    const createdDispute = await Dispute.create({
      projectId: project._id,
      projectTitle: project.title,
      initiatorId: client._id,
      initiatorName: client.displayName,
      respondentId: freelancer._id,
      respondentName: freelancer.displayName,
      reason: 'Quality issue',
      description: 'The work did not meet the agreed standards.',
      status: 'open'
    });

    const listRes = await request(app)
      .get('/api/admin/disputes')
      .set('Cookie', [getAuthCookie(admin)]);

    expect(listRes.statusCode).toBe(200);
    expect(listRes.body.success).toBe(true);
    expect(Array.isArray(listRes.body.disputes)).toBe(true);
    expect(listRes.body.disputes.length).toBeGreaterThanOrEqual(1);

    const resolveRes = await request(app)
      .post(`/api/admin/disputes/${createdDispute._id}/resolve`)
      .set('Cookie', [getAuthCookie(admin)])
      .send({ action: 'resolve', resolution: 'Dispute resolved by admin' });

    expect(resolveRes.statusCode).toBe(200);
    expect(resolveRes.body.success).toBe(true);
    expect(resolveRes.body.status).toBe('resolved');
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
