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

describe('Review API', () => {
  it('should submit a review for a completed project', async () => {
    const client = await createUser({ email: 'review.client@example.com', role: 'client', firstName: 'Review', lastName: 'Client' });
    const freelancer = await createUser({ email: 'review.freelancer@example.com', role: 'freelancer', firstName: 'Review', lastName: 'Freelancer' });

    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Completed Review Project',
      description: 'A completed project ready for review.',
      category: 'Web Development',
      skills: ['Node.js'],
      budget: { type: 'fixed', min: 100, max: 100 },
      status: 'completed',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/reviews/${project._id}`)
      .set('Cookie', [getAuthCookie(client)])
      .send({ rating: 5, comment: 'Excellent work!' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.newAverageRating).toBe(5);
  });
});
