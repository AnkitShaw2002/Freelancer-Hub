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

describe('Freelancer API', () => {
  it('should return a freelancer bids list', async () => {
    const freelancer = await createUser({ email: 'freelancer.bids@example.com', role: 'freelancer', firstName: 'Bid', lastName: 'Freelancer' });
    const client = await createUser({ email: 'client.bids@example.com', role: 'client', firstName: 'Bid', lastName: 'Client' });

    await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Biddable Project',
      description: 'Project that already contains a freelancer bid.',
      category: 'Web Development',
      skills: ['Testing'],
      budget: { type: 'fixed', min: 600, max: 900 },
      status: 'open',
      isDeleted: false,
      bids: [
        {
          freelancerId: freelancer._id,
          freelancerName: freelancer.displayName,
          freelancerAvatar: '',
          amount: 700,
          deliveryDays: 5,
          proposal: 'Ready to start soon.'
        }
      ]
    });

    const res = await request(app)
      .get('/api/freelancer/bids')
      .set('Cookie', [getAuthCookie(freelancer)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(1);
    expect(res.body.data[0].myBid.amount).toBe(700);
  });
});
