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

  it('should return login page metadata', async () => {
    const res = await request(app).get('/api/login');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Login');
  });

  it('should return forgot password page metadata', async () => {
    const res = await request(app).get('/api/forgot-password');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.title).toBe('Forgot Password');
  });

  it('should return reset password page metadata', async () => {
    const res = await request(app).get('/api/reset-password/reset-token-123');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.token).toBe('reset-token-123');
  });

  it('should return the public projects list', async () => {
    const publicClient = await createUser({
      email: 'public.project@example.com',
      role: 'client',
      firstName: 'Public',
      lastName: 'Client'
    });

    await Project.create({
      clientId: publicClient._id,
      clientName: publicClient.displayName,
      title: 'Public Project Api',
      description: 'Public project listing for pages routes.',
      category: 'Web Development',
      skills: ['API'],
      budget: { type: 'fixed', min: 300, max: 500 },
      status: 'open',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app).get('/api/projects');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.projects.length).toBeGreaterThanOrEqual(1);
  });

  it('should return create project metadata when authenticated as client', async () => {
    const client = await createUser({ email: 'client.page@example.com', role: 'client' });
    const res = await request(app)
      .get('/api/projects/create')
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.categories).toBeDefined();
  });

  it('should render project detail HTML for an existing project', async () => {
    const detailClient = await createUser({
      email: 'detail.client@example.com',
      role: 'client',
      firstName: 'Detail',
      lastName: 'Client'
    });

    const project = await Project.create({
      clientId: detailClient._id,
      clientName: detailClient.displayName,
      title: 'Project Detail Page',
      description: 'Project for page route detail.',
      category: 'Web Development',
      skills: ['HTML'],
      budget: { type: 'fixed', min: 200, max: 300 },
      status: 'open',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app).get(`/api/projects/${project._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Project Detail Page');
  });

  it('should return a list of freelancers', async () => {
    await createUser({ email: 'page.freelancer@example.com', role: 'freelancer', firstName: 'Page', lastName: 'Freelancer' });
    const res = await request(app).get('/api/freelancers');
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.freelancers.length).toBeGreaterThanOrEqual(1);
  });

  it('should return notifications for authenticated user', async () => {
    const client = await createUser({
      email: 'page.notify@example.com',
      role: 'client',
      notifications: [{ message: 'New page notification', type: 'system', createdAt: new Date() }]
    });

    const res = await request(app)
      .get('/api/notifications')
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.count).toBe(1);
  });
});
