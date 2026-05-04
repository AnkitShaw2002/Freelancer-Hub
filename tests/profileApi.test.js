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

describe('Profile API', () => {
  it('should return a list of freelancers', async () => {
    await createUser({ email: 'freelancer1@example.com', role: 'freelancer', firstName: 'Freelance', lastName: 'One' });
    const res = await request(app).get('/api/freelancers');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.freelancers.length).toBe(1);
    expect(res.body.data.freelancers[0].email).toBe('freelancer1@example.com');
  });

  it('should return public profile by user id', async () => {
    const freelancer = await createUser({ email: 'public.freelancer@example.com', role: 'freelancer', firstName: 'Public', lastName: 'Freelancer' });
    const res = await request(app).get(`/api/profile/${freelancer._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.email).toBe('public.freelancer@example.com');
    expect(res.body.data.isOwn).toBeFalsy();
  });

  it('should return the authenticated user profile', async () => {
    const user = await createUser({
      email: 'self.profile@example.com',
      role: 'freelancer',
      firstName: 'Self',
      lastName: 'Profile'
    });

    const res = await request(app)
      .get('/api/profile')
      .set('Cookie', [getAuthCookie(user)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.profile.email).toBe('self.profile@example.com');
    expect(res.body.data.isOwn).toBe(true);
  });

  it('should allow authenticated user to read edit profile data', async () => {
    const freelancer = await createUser({ email: 'edit.freelancer@example.com', role: 'freelancer', firstName: 'Edit', lastName: 'Freelancer' });
    const res = await request(app)
      .get('/api/profile/edit')
      .set('Cookie', [getAuthCookie(freelancer)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.email).toBe('edit.freelancer@example.com');
  });

  it('should update user profile data', async () => {
    const freelancer = await createUser({ email: 'update.freelancer@example.com', role: 'freelancer', firstName: 'Update', lastName: 'Freelancer' });
    const res = await request(app)
      .post('/api/profile/edit')
      .set('Cookie', [getAuthCookie(freelancer)])
      .send({ displayName: 'Updated Freelancer', skills: 'Node.js,React', hourlyRate: 40, category: 'Web Development', experience: 'expert', availability: 'true' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.displayName).toBe('Updated Freelancer');
    expect(res.body.data.skills).toContain('Node.js');
  });
});
