require('dotenv').config();
const mongoose = require('mongoose');
const roleModel = require('./app/models/roleModel');
const logger = require('./app/utils/logger');

const roles = [
    {
        name: 'admin',
        description: 'Full access to the system. Manage users, projects, disputes, and analytics.',
        permissions: [
            'admin:dashboard',

            'users:view',
            'users:manage',

            'projects:view',
            'projects:manage',

            'disputes:view',
            'disputes:resolve',

            'analytics:view',

            'notifications:manage',
            
            'messages:view',
            'messages:send'
        ]
    },
    {
        name: 'freelancer',
        description: 'Can apply for projects, manage bids, and complete work.',
        permissions: [
            'profile:view',
            'profile:edit',

            'projects:browse',
            'projects:apply',
            'projects:view-my',

            'bids:view',
            'bids:manage',

            'work:submit',

            'wallet:view',

            'messages:send',
            'messages:view',

            'reviews:view',
            'reviews:give'
        ]
    },
    {
        name: 'client',
        description: 'Can post projects, hire freelancers, and manage payments.',
        permissions: [
            'profile:view',
            'profile:edit',

            'projects:create',
            'projects:edit',
            'projects:delete',
            'projects:view-my',
            'projects:award',
            'projects:complete',

            'payments:manage',

            'messages:send',
            'messages:view',
            'reviews:view',
            'reviews:give'
        ]
    }
];

const seedRoles = async () => {
    try {
        if (!process.env.MONGO_URL) {
            throw new Error('MONGO_URL not found in environment variables');
        }

        await mongoose.connect(process.env.MONGO_URL);
        console.log('✅ Database connected for seeding');

        for (const role of roles) {
            const existingRole = await roleModel.findOne({ name: role.name });
            if (!existingRole) {
                await roleModel.create(role);
                console.log(`🆕 Role created: ${role.name}`);
            } else {
                // Update existing role to ensure permissions and description are up to date
                existingRole.permissions = role.permissions;
                existingRole.description = role.description;
                await existingRole.save();
                console.log(`🔄 Role updated: ${role.name}`);
            }
        }

        console.log('✨ Roles seeded successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Seeding error:', error.message);
        process.exit(1);
    }
};

seedRoles();
