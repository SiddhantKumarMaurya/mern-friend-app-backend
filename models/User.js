const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    friendRequests: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Add friendRequests field
    interests: [{ type: String , default:[]}], // Add interests field
    notifications: [{
        message: String,
        timestamp: { type: Date, default: Date.now }
    }] // Add notifications field
});

module.exports = mongoose.model('User', UserSchema);
