const { startTestDatabase, clearDatabase, stopTestDatabase, createUser, getAuthCookie } = require('./testUtils');
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

describe('Messages API', () => {
  it('should return an empty inbox for a new user', async () => {
    const sender = await createUser({ email: 'sender@example.com', role: 'freelancer' });
    const res = await request(app)
      .get('/api/messages')
      .set('Cookie', [getAuthCookie(sender)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(0);
  });

  it('should send a message and fetch the conversation', async () => {
    const sender = await createUser({ email: 'sender2@example.com', role: 'freelancer' });
    const receiver = await createUser({ email: 'receiver2@example.com', role: 'client' });

    const sendRes = await request(app)
      .post('/api/messages/send')
      .set('Cookie', [getAuthCookie(sender)])
      .send({ receiverId: receiver._id, content: 'Hello from test user' });

    expect(sendRes.statusCode).toBe(201);
    expect(sendRes.body.success).toBe(true);
    expect(sendRes.body.data.content).toBe('Hello from test user');

    const convRes = await request(app)
      .get(`/api/messages/${receiver._id}`)
      .set('Cookie', [getAuthCookie(sender)]);

    expect(convRes.statusCode).toBe(200);
    expect(convRes.body.success).toBe(true);
    expect(convRes.body.data.messages.length).toBeGreaterThanOrEqual(1);
    expect(convRes.body.data.messages[0].content).toBe('Hello from test user');
  });
});
