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

describe('Client API', () => {
  it('should allow a client to create a project', async () => {
    const client = await createUser({ email: 'client.project@example.com', role: 'client', firstName: 'Client', lastName: 'Creator' });
    const res = await request(app)
      .post('/api/client/projects')
      .set('Cookie', [getAuthCookie(client)])
      .send({
        title: 'Test Project for Client',
        description: 'This is a project description long enough to pass validation.',
        category: 'Web Development',
        budget_type: 'fixed',
        budget_min: 1000,
        budget_max: 2000,
        deadline: '2026-09-01'
      });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Test Project for Client');
  });

  it('should retrieve the client projects list', async () => {
    const client = await createUser({ email: 'client.list@example.com', role: 'client', firstName: 'Client', lastName: 'List' });
    await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Client Project',
      description: 'A project posted by the client.',
      category: 'Web Development',
      skills: ['Express'],
      budget: { type: 'fixed', min: 500, max: 1000 },
      deadline: new Date('2026-08-01'),
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .get('/api/client/projects')
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(Array.isArray(res.body.data)).toBe(true);
  });
});
