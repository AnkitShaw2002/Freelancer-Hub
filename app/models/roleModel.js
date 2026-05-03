const mongoose = require('mongoose');

const RoleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true,
        enum: ['admin', 'freelancer', 'client']
    },
    permissions: [{
        type: String
    }],
    description: String
}, { timestamps: true });

const roleModel = mongoose.model('Role', RoleSchema);

module.exports = roleModel;
