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

  it('should return project creation metadata', async () => {
    const client = await createUser({ email: 'client.createinfo@example.com', role: 'client', firstName: 'Client', lastName: 'Meta' });

    const res = await request(app)
      .get('/api/client/projects/create')
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.categories)).toBe(true);
  });

  it('should return edit data for an existing client project', async () => {
    const client = await createUser({ email: 'client.editinfo@example.com', role: 'client', firstName: 'Client', lastName: 'Edit' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Editable Project',
      description: 'Project editing test.',
      category: 'Web Development',
      skills: ['Edit'],
      budget: { type: 'fixed', min: 400, max: 500 },
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .get(`/api/client/projects/${project._id}/edit`)
      .set('Cookie', [getAuthCookie(client)]);

    console.log('EDIT RES', JSON.stringify(res.body));
    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.title).toBe('Editable Project');
  });

  it('should award a bid on a client project', async () => {
    const client = await createUser({ email: 'client.award@example.com', role: 'client', firstName: 'Client', lastName: 'Award' });
    const freelancer = await createUser({ email: 'freelancer.award@example.com', role: 'freelancer', firstName: 'Freelance', lastName: 'Award' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Award Project',
      description: 'Project for awarding a bid.',
      category: 'Web Development',
      skills: ['Award'],
      budget: { type: 'fixed', min: 800, max: 1000 },
      status: 'open',
      isDeleted: false,
      bids: [
        {
          freelancerId: freelancer._id,
          freelancerName: freelancer.displayName,
          freelancerAvatar: '',
          amount: 850,
          deliveryDays: 5,
          proposal: 'I can deliver this fast.'
        }
      ]
    });

    const bidId = project.bids[0]._id;
    const res = await request(app)
      .post(`/api/client/projects/${project._id}/award/${bidId}`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('assigned');
  });

  it('should update project status for a client project', async () => {
    const client = await createUser({ email: 'client.status@example.com', role: 'client', firstName: 'Client', lastName: 'Status' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Status Project',
      description: 'Project status test.',
      category: 'Web Development',
      skills: ['Status'],
      budget: { type: 'fixed', min: 500, max: 600 },
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/client/projects/${project._id}/status`)
      .set('Cookie', [getAuthCookie(client)])
      .send({ status: 'completed' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('completed');
  });

  it('should delete a client project', async () => {
    const client = await createUser({ email: 'client.delete@example.com', role: 'client', firstName: 'Client', lastName: 'Delete' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Deletable Project',
      description: 'Project delete test.',
      category: 'Web Development',
      skills: ['Delete'],
      budget: { type: 'fixed', min: 200, max: 300 },
      status: 'open',
      isDeleted: false
    });

    const res = await request(app)
      .delete(`/api/client/projects/${project._id}`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('should allow a client to fetch checkout payment data', async () => {
    const client = await createUser({ email: 'client.checkout@example.com', role: 'client', firstName: 'Client', lastName: 'Checkout' });
    const freelancer = await createUser({ email: 'freelancer.checkout@example.com', role: 'freelancer', firstName: 'Freelance', lastName: 'Checkout' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Checkout Project',
      description: 'Project for checkout route.',
      category: 'Web Development',
      skills: ['Stripe'],
      budget: { type: 'fixed', min: 700, max: 900 },
      status: 'assigned',
      isPaid: false,
      selectedBidId: null,
      bids: [
        {
          freelancerId: freelancer._id,
          freelancerName: freelancer.displayName,
          amount: 750,
          deliveryDays: 7,
          proposal: 'Ready to deliver.'
        }
      ]
    });
    project.selectedBidId = project.bids[0]._id;
    await project.save();

    const res = await request(app)
      .get(`/api/client/projects/${project._id}/pay`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
  });

  it('should simulate payment intent for a client project', async () => {
    const client = await createUser({ email: 'client.pay@example.com', role: 'client', firstName: 'Client', lastName: 'Pay' });
    const freelancer = await createUser({ email: 'freelancer.pay@example.com', role: 'freelancer', firstName: 'Freelance', lastName: 'Pay' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Payment Project',
      description: 'Project for simulated payment.',
      category: 'Web Development',
      skills: ['Payment'],
      budget: { type: 'fixed', min: 700, max: 900 },
      status: 'assigned',
      isPaid: false,
      selectedBidId: null,
      bids: [
        {
          freelancerId: freelancer._id,
          freelancerName: freelancer.displayName,
          amount: 750,
          deliveryDays: 7,
          proposal: 'Ready to deliver.'
        }
      ]
    });
    project.selectedBidId = project.bids[0]._id;
    await project.save();

    const res = await request(app)
      .post(`/api/client/projects/${project._id}/pay`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.simulated).toBe(true);
  });

  it('should approve a submitted milestone', async () => {
    const client = await createUser({ email: 'client.approve@example.com', role: 'client', firstName: 'Client', lastName: 'Approve' });
    const freelancer = await createUser({ email: 'freelancer.approve@example.com', role: 'freelancer', firstName: 'Freelance', lastName: 'Approve' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Milestone Approval Project',
      description: 'Project for milestone approval.',
      category: 'Web Development',
      skills: ['Milestone'],
      budget: { type: 'fixed', min: 600, max: 800 },
      status: 'assigned',
      isDeleted: false,
      milestones: [
        { title: 'Phase 1', amount: 300, status: 'submitted' }
      ]
    });

    const msId = project.milestones[0]._id;

    const res = await request(app)
      .post(`/api/client/projects/${project._id}/milestones/${msId}/approve`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('approved');
  });

  it('should reject a submitted milestone', async () => {
    const client = await createUser({ email: 'client.reject@example.com', role: 'client', firstName: 'Client', lastName: 'Reject' });
    const freelancer = await createUser({ email: 'freelancer.reject@example.com', role: 'freelancer', firstName: 'Freelance', lastName: 'Reject' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Milestone Rejection Project',
      description: 'Project for milestone rejection.',
      category: 'Web Development',
      skills: ['Milestone'],
      budget: { type: 'fixed', min: 600, max: 800 },
      status: 'assigned',
      isDeleted: false,
      milestones: [
        { title: 'Phase 1', amount: 300, status: 'submitted' }
      ]
    });

    const msId = project.milestones[0]._id;

    const res = await request(app)
      .post(`/api/client/projects/${project._id}/milestones/${msId}/reject`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('in-progress');
  });
});
