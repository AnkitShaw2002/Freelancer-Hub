const request = require('supertest');
const app = require('./app');
const { startTestDatabase, clearDatabase, stopTestDatabase } = require('./tests/testUtils');
const User = require('./app/models/User');
const Project = require('./app/models/Project');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

(async () => {
  try {
    process.env.NODE_ENV = 'test';
    await startTestDatabase();
    const hash = await bcrypt.hash('Password123!', 12);
    const user = await User.create({ displayName: 'Client Meta', firstName: 'Client', lastName: 'Meta', email: 'client.meta@example.com', password: hash, role: 'client', isVerified: true });
    const token = jwt.sign({ id: user._id, _id: user._id, name: user.displayName, email: user.email, role: user.role }, process.env.JWT_SECRET_KEY, { expiresIn: '7d' });
    const project = await Project.create({ clientId: user._id, clientName: user.displayName, title: 'Editable Project', description: 'Project editing test.', category: 'Web Development', skills: ['Edit'], budget: { type: 'fixed', min: 400, max: 500 }, status: 'open', isDeleted: false });
    const res = await request(app).get(`/api/client/projects/${project._id}/edit`).set('Cookie', [`token=${token}`]);
    console.log('status', res.status);
    console.log('body', JSON.stringify(res.body, null, 2));
    const res2 = await request(app).post(`/api/client/projects/${project._id}/status`).set('Cookie', [`token=${token}`]).send({ status: 'completed' });
    console.log('status2', res2.status);
    console.log('body2', JSON.stringify(res2.body, null, 2));
    const p2 = await Project.create({ clientId: user._id, clientName: user.displayName, freelancerId: user._id, freelancerName: user.displayName, title: 'Pay Project', description: 'Pay test', category: 'Web', skills: ['Payment'], budget: { type: 'fixed', min: 700, max: 900 }, status: 'assigned', isPaid: false, selectedBidId: null, bids: [{ freelancerId: user._id, freelancerName: user.displayName, amount: 750, deliveryDays: 7, proposal: 'Ready to deliver.' }] });
    p2.selectedBidId = p2.bids[0]._id;
    await p2.save();
    const res3 = await request(app).post(`/api/client/projects/${p2._id}/pay`).set('Cookie', [`token=${token}`]);
    console.log('status3', res3.status);
    console.log('body3', JSON.stringify(res3.body, null, 2));
    await clearDatabase();
    await stopTestDatabase();
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
