const express = require('express');
const User = require('../models/User');
const auth = require('../middleware/auth');
const mongoose = require('mongoose');
const router = express.Router();

// Search for users
router.get('/search', auth, async (req, res) => {
    const { username } = req.query;

    try {
        const users = await User.find({ username: { $regex: username, $options: 'i' } }).select('username');
        res.json(users);
    } catch (err) {
        console.error('Error during user search:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Send a friend request
router.post('/request', auth, async (req, res) => {
    const { userId, friendId } = req.body;

    // Validate IDs
    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({ msg: 'Invalid user IDs' });
    }

    try {
        // Prevent users from friending themselves
        if (userId === friendId) {
            return res.status(400).json({ msg: 'You cannot add yourself as a friend.' });
        }

        const user = await User.findById(userId);
        const friend = await User.findById(friendId);

        if (!user || !friend) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Prevent adding an existing friend
        if (user.friends.includes(friendId) || friend.friends.includes(userId)) {
            return res.status(400).json({ msg: 'You are already friends.' });
        }

        // Prevent sending duplicate friend requests
        if (friend.friendRequests.includes(userId)) {
            return res.status(400).json({ msg: 'Friend request already sent.' });
        }

        // Add the friend request to the friend's pending requests
        friend.friendRequests.push(userId);

        // Add a notification for the friend
        friend.notifications.push({
            message: `${user.username} has sent you a friend request.`,
        });

        await friend.save();

        res.status(200).json({ msg: 'Friend request sent' });
    } catch (err) {
        console.error('Error during friend request:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Accept a friend request
router.post('/accept', auth, async (req, res) => {
    const { userId, friendId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({ msg: 'Invalid user IDs' });
    }

    try {
        const user = await User.findById(userId);
        const friend = await User.findById(friendId);

        if (!user || !friend) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (!user.friendRequests.includes(friendId)) {
            return res.status(400).json({ msg: 'No friend request from this user.' });
        }

        // Add each other as friends
        user.friends.push(friendId);
        friend.friends.push(userId);

        // Remove the friend request
        user.friendRequests = user.friendRequests.filter((id) => id.toString() !== friendId);
        
        // Add a notification for the friend about the acceptance
        friend.notifications.push({
            message: `${user.username} has accepted your friend request.`,
            // timestamp: new Date(),
        });
        
        await user.save();
        await friend.save();

        res.status(200).json({ msg: 'Friend request accepted.' });
    } catch (err) {
        console.error('Error accepting friend request:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Reject a friend request
router.post('/reject', auth, async (req, res) => {
    const { userId, friendId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({ msg: 'Invalid user IDs' });
    }

    try {
        const user = await User.findById(userId);
        const friend = await User.findById(friendId);

        if (!user || !friend) {
            return res.status(404).json({ msg: 'User not found' });
        }

        if (!user.friendRequests.includes(friendId)) {
            return res.status(400).json({ msg: 'No friend request from this user.' });
        }

        // Remove the friend request
        user.friendRequests = user.friendRequests.filter((id) => id.toString() !== friendId);
        
        // Add a notification for the friend about the rejection
        friend.notifications.push({
            message: `${user.username} has rejected your friend request.`,
        });
        
        await user.save();
        await friend.save();

        res.status(200).json({ msg: 'Friend request rejected.' });
    } catch (err) {
        console.error('Error rejecting friend request:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Get friend requests for a user
router.get('/:userId/friendRequests', auth, async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid user ID' });
    }

    try {
        const user = await User.findById(userId).populate('friendRequests', 'username');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.status(200).json({ friendRequests: user.friendRequests });
    } catch (err) {
        console.error('Error fetching friend requests:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Get friend recommendations based on mutual friends and common interests
router.get('/:userId/recommendations', auth, async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid user ID' });
    }

    try {
        // Find the user and populate their friends
        const user = await User.findById(userId).populate('friends', 'friends');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Collect the user's friends' friends (excluding the user's direct friends and themselves)
        const friendIds = user.friends.map(friend => friend._id.toString());
        let recommendations = {};

        // Step 1: Find users with common interests
        const commonInterestUsers = await User.find({
            _id: { $ne: userId }, // Exclude the user themselves
            interests: { $in: user.interests }, // Find users with at least one common interest
        }).select('username interests friends');

        for (let potentialFriend of commonInterestUsers) {
            const potentialFriendId = potentialFriend._id.toString();

            // Exclude direct friends and already included recommendations
            if (friendIds.includes(potentialFriendId) || recommendations[potentialFriendId]) {
                continue;
            }

            // Count common interests
            const commonInterests = user.interests.filter(interest => potentialFriend.interests.includes(interest));
            recommendations[potentialFriendId] = {
                username: potentialFriend.username,
                commonInterests: commonInterests.length,
                mutualFriends: 0, // This will be updated in the next step
            };
        }

        // Step 2: Find friends of friends and update mutual friend counts
        for (let friend of user.friends) {
            const friendDetails = await User.findById(friend._id).populate('friends', 'username interests');

            for (let mutualFriend of friendDetails.friends) {
                const mutualFriendId = mutualFriend._id.toString();

                // Exclude the user themselves, direct friends, and already included recommendations
                // if (mutualFriendId === userId || friendIds.includes(mutualFriendId) || recommendations[mutualFriendId]) {
                if (mutualFriendId === userId || friendIds.includes(mutualFriendId)) {
                 
                    continue;
                }

                // Initialize the mutual friend in the recommendations list if not already present
                if (!recommendations[mutualFriendId]) {
                    recommendations[mutualFriendId] = {
                        username: mutualFriend.username,
                        commonInterests: 0, // This will be updated if found in the first step
                        mutualFriends: 0,
                    };
                }

                // Update the count of mutual friends
                recommendations[mutualFriendId].mutualFriends += 1;
            }
        }

        console.log(recommendations);

        // Step 3: Convert the recommendations object to an array and sort by common interests and mutual friends
        const recommendationsArray = Object.entries(recommendations)
            .map(([id, data]) => ({ _id: id, ...data }))
            .sort((a, b) => b.commonInterests - a.commonInterests || b.mutualFriends - a.mutualFriends);

        res.status(200).json({ recommendations: recommendationsArray });
    } catch (err) {
        console.error('Error fetching friend recommendations:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Get notifications for a user
router.get('/:userId/notifications', auth, async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid user ID' });
    }

    try {
        const user = await User.findById(userId).select('notifications');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        console.log("I am here")
        res.status(200).json({ notifications: user.notifications });
    } catch (err) {
        console.error('Error fetching notifications:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});

// Get all users excluding the current user
router.get('/:userId/users', auth, async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid user ID' });
    }

    try {
        const users = await User.find({ _id: { $ne: userId } }).select('username');
        res.status(200).json({ users });
    } catch (err) {
        console.error('Error fetching users:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});


// Get the user's friends
router.get('/:userId/friends', auth, async (req, res) => {
    const { userId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
        return res.status(400).json({ msg: 'Invalid user ID' });
    }

    try {
        const user = await User.findById(userId).populate('friends', 'username');
        if (!user) {
            return res.status(404).json({ msg: 'User not found' });
        }

        res.status(200).json({ friends: user.friends });
    } catch (err) {
        console.error('Error fetching friends:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});


// Unfriend a user
router.post('/unfriend', auth, async (req, res) => {
    const { userId, friendId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(userId) || !mongoose.Types.ObjectId.isValid(friendId)) {
        return res.status(400).json({ msg: 'Invalid user IDs' });
    }

    try {
        const user = await User.findById(userId);
        const friend = await User.findById(friendId);

        if (!user || !friend) {
            return res.status(404).json({ msg: 'User not found' });
        }

        // Remove each other from friends list
        user.friends = user.friends.filter(id => id.toString() !== friendId);
        friend.friends = friend.friends.filter(id => id.toString() !== userId);

        // Add a notification for the friend being unfriended
        friend.notifications.push({
            message: `${user.username} has unfriended you.`,
            // timestamp: new Date(),
        });

        await user.save();
        await friend.save();

        res.status(200).json({ msg: 'Unfriended successfully.' });
    } catch (err) {
        console.error('Error unfriending user:', err);
        res.status(500).json({ msg: 'Server error, please try again.' });
    }
});




module.exports = router;
