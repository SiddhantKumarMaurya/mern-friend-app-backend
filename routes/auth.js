const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const router = express.Router();
const cors = require('cors'); // Import cors
router.use(cors()); // Enable CORS

// Register
router.post('/register', async (req, res) => {
    const { username, password, interests } = req.body;

    try {
        const existingUser = await User.findOne({ username });
        if (existingUser) {
            return res.status(400).json({ msg: 'User already exists' });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = new User({
            username,
            password: hashedPassword,
            interests, // Save interests
        });

        await newUser.save();
        res.status(201).json({ msg: 'User registered successfully' });
    } catch (err) {
        console.log('Error during registration:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Login
router.post('/login', async (req, res) => {
    const { username, password } = req.body;
    console.log('Received login request:', req.body); // Log the request body

    try {
        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ msg: 'Invalid credentials' });
        }

        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token, userId: user._id, username: username });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
