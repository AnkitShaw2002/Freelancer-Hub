const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const request = require('supertest');
const app = require('../app');
const Project = require('../app/models/Project');
const { createUser, getAuthCookie, clearDatabase } = require('./testUtils');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  process.env.MONGO_URL = mongoServer.getUri();
  await mongoose.connect(process.env.MONGO_URL);
});

afterEach(async () => {
  await clearDatabase();
});

afterAll(async () => {
  if (mongoose.connection.readyState === 1) {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
  if (mongoServer) {
    await mongoServer.stop();
  }
});

describe('Project API', () => {
  it('should return an empty project list when no projects exist', async () => {
    const res = await request(app).get('/api/projects');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.projects).toBeDefined();
    expect(res.body.data.projects.length).toBe(0);
  });

  it('should return project listing with existing projects', async () => {
    const client = await createUser({ email: 'project.list@example.com', role: 'client', firstName: 'List', lastName: 'Client' });
    await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Public Project',
      description: 'A sample public project for listing.',
      category: 'Web Development',
      skills: ['Node.js', 'Express'],
      budget: { type: 'fixed', min: 500, max: 1000 },
      status: 'open',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app).get('/api/projects');

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data.projects)).toBe(true);
    expect(res.body.data.projects.length).toBe(1);
    expect(res.body.data.projects[0].title).toBe('Public Project');
  });

  it('should render the project detail page for an existing project', async () => {
    const client = await createUser({ email: 'project.detail@example.com', role: 'client', firstName: 'Detail', lastName: 'Client' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Detail Project',
      description: 'A project used to verify the detail page rendering flow.',
      category: 'Web Development',
      skills: ['Express'],
      budget: { type: 'fixed', min: 200, max: 400 },
      status: 'open',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app).get(`/api/projects/${project._id}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toMatch(/html/);
    expect(res.text).toContain('Detail Project');
  });

  it('should allow a freelancer to place a bid on an open project', async () => {
    const client = await createUser({ email: 'project.bidclient@example.com', role: 'client', firstName: 'Bid', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.bidfreelancer@example.com', role: 'freelancer', firstName: 'Bid', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Bidable Project',
      description: 'This project will be used for bidding tests.',
      category: 'Web Development',
      skills: ['Testing'],
      budget: { type: 'fixed', min: 800, max: 1200 },
      status: 'open',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/projects/${project._id}/bid`)
      .set('Cookie', [getAuthCookie(freelancer)])
      .send({ amount: 900, deliveryDays: 5, proposal: 'I can deliver this project quickly and cleanly.' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.bid.amount).toBe(900);
    expect(res.body.data.totalBids).toBe(1);
  });

  it('should allow a freelancer to withdraw their own pending bid', async () => {
    const client = await createUser({ email: 'project.withdrawclient@example.com', role: 'client', firstName: 'Withdraw', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.withdrawfreelancer@example.com', role: 'freelancer', firstName: 'Withdraw', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Withdrawable Project',
      description: 'A project where the freelancer will withdraw their bid.',
      category: 'Web Development',
      skills: ['Node.js'],
      budget: { type: 'fixed', min: 1000, max: 1500 },
      status: 'open',
      visibility: 'public',
      isDeleted: false,
      bids: [
        {
          freelancerId: freelancer._id,
          freelancerName: freelancer.displayName,
          freelancerAvatar: '',
          amount: 1100,
          deliveryDays: 7,
          proposal: 'Please accept my bid.'
        }
      ]
    });

    const bidId = project.bids[0]._id;
    const res = await request(app)
      .post(`/api/projects/${project._id}/bid/${bidId}/withdraw`)
      .set('Cookie', [getAuthCookie(freelancer)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.newStatus).toBe('withdrawn');
    expect(res.body.data.totalActiveBids).toBe(0);
  });

  it('should update a project status', async () => {
    const client = await createUser({ email: 'project.status@example.com', role: 'client', firstName: 'Status', lastName: 'Client' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'Status Update Project',
      description: 'Update status test.',
      category: 'Web Development',
      skills: ['Status'],
      budget: { type: 'fixed', min: 250, max: 350 },
      status: 'open',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/projects/${project._id}/status`)
      .set('Cookie', [getAuthCookie(client)])
      .send({ newStatus: 'in-progress' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('in-progress');
  });

  it('should return dispute form for an assigned project', async () => {
    const client = await createUser({ email: 'project.dispute.client@example.com', role: 'client', firstName: 'Dispute', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.dispute.freelancer@example.com', role: 'freelancer', firstName: 'Dispute', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Dispute Form Project',
      description: 'This project is eligible for dispute form retrieval.',
      category: 'Web Development',
      skills: ['Dispute'],
      budget: { type: 'fixed', min: 500, max: 600 },
      status: 'assigned',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app)
      .get(`/api/projects/${project._id}/dispute`)
      .set('Cookie', [getAuthCookie(client)]);

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.project.title).toBe('Dispute Form Project');
  });

  it('should submit a dispute for an assigned project', async () => {
    const client = await createUser({ email: 'project.dispute.submit@example.com', role: 'client', firstName: 'Submit', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.dispute.submitfreelancer@example.com', role: 'freelancer', firstName: 'Submit', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Submit Dispute Project',
      description: 'This project is being disputed.',
      category: 'Web Development',
      skills: ['Dispute'],
      budget: { type: 'fixed', min: 600, max: 700 },
      status: 'assigned',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/projects/${project._id}/dispute`)
      .set('Cookie', [getAuthCookie(client)])
      .send({ reason: 'Quality issue', description: 'The deliverable did not meet the scope.', evidence: 'Failed demo' });

    expect(res.statusCode).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.disputeId).toBeDefined();
  });

  it('should allow freelancer to submit a milestone', async () => {
    const client = await createUser({ email: 'project.milestone.client@example.com', role: 'client', firstName: 'Milestone', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.milestone.freelancer@example.com', role: 'freelancer', firstName: 'Milestone', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Milestone Submission Project',
      description: 'A milestone submission test project.',
      category: 'Web Development',
      skills: ['Milestone'],
      budget: { type: 'fixed', min: 700, max: 800 },
      status: 'in-progress',
      visibility: 'public',
      isDeleted: false,
      milestones: [{ title: 'Stage 1', amount: 300, status: 'in-progress' }]
    });

    const milestoneId = project.milestones[0]._id;
    const res = await request(app)
      .post(`/api/projects/${project._id}/milestones/${milestoneId}/submit`)
      .set('Cookie', [getAuthCookie(freelancer)])
      .send({ submittedWork: 'Milestone work has been completed.' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('submitted');
  });

  it('should allow freelancer to submit final work', async () => {
    const client = await createUser({ email: 'project.final.client@example.com', role: 'client', firstName: 'Final', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.final.freelancer@example.com', role: 'freelancer', firstName: 'Final', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      freelancerId: freelancer._id,
      freelancerName: freelancer.displayName,
      title: 'Final Work Submission Project',
      description: 'A final work submission test.',
      category: 'Web Development',
      skills: ['FinalWork'],
      budget: { type: 'fixed', min: 900, max: 1000 },
      status: 'in-progress',
      visibility: 'public',
      isDeleted: false
    });

    const res = await request(app)
      .post(`/api/projects/${project._id}/submit-final`)
      .set('Cookie', [getAuthCookie(freelancer)])
      .send({ description: 'Final deliverable is ready for review.' });

    expect(res.statusCode).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.finalWorkSubmitted).toBe(true);
  });

  it('should call bid analysis route and return a valid response status', async () => {
    const client = await createUser({ email: 'project.analyse.client@example.com', role: 'client', firstName: 'Analyse', lastName: 'Client' });
    const freelancer = await createUser({ email: 'project.analyse.freelancer@example.com', role: 'freelancer', firstName: 'Analyse', lastName: 'Freelancer' });
    const project = await Project.create({
      clientId: client._id,
      clientName: client.displayName,
      title: 'AI Analyse Project',
      description: 'A project used to test AI bid analysis.',
      category: 'Web Development',
      skills: ['AI'],
      budget: { type: 'fixed', min: 1000, max: 1200 },
      status: 'assigned',
      visibility: 'public',
      isDeleted: false,
      bids: [
        {
          freelancerId: freelancer._id,
          freelancerName: freelancer.displayName,
          amount: 1050,
          deliveryDays: 7,
          proposal: 'I will deliver high quality work.',
          freelancerRating: 4.8
        }
      ]
    });

    const res = await request(app)
      .get(`/api/projects/${project._id}/ai-analyse`)
      .set('Cookie', [getAuthCookie(client)]);

    expect([200, 503]).toContain(res.statusCode);
    if (res.statusCode === 200) {
      expect(res.body.success).toBe(true);
      expect(res.body.data).toBeDefined();
    } else {
      expect(res.body.success).toBe(false);
      expect(res.body.message).toMatch(/temporarily unavailable/i);
    }
  });
});
