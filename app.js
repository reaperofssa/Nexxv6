const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
const PORT = 3000;

// Middleware for serving static files
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')))
// File upload setup

const upload = multer({ dest: 'public/uploads/' });

// File paths
const USERS_FILE = './users.json';
const POSTS_FILE = './posts.json';
const FOLLOWERS_FILE= './followers.json';

// Helper function to load data from files
function loadFile(filePath) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]');
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

// Load user data
let users = loadFile(USERS_FILE);

// Load post data
let posts = [];
if (fs.existsSync(POSTS_FILE)) {
    const data = fs.readFileSync(POSTS_FILE, 'utf-8');
    posts = JSON.parse(data);
}

if (!fs.existsSync(FOLLOWERS_FILE)) {
    fs.writeFileSync(FOLLOWERS_FILE, JSON.stringify([])); // Empty array initially
}

let followersData = JSON.parse(fs.readFileSync(FOLLOWERS_FILE, 'utf8'));

// Routes
app.get('/', (req, res) => {
    const username = req.query.username || '';
    if (username && users.find((user) => user.username === username)) {
        res.redirect('/foryou');
    } else {
        res.redirect('/login');
    }
});

// Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/login.html'));
});

// For You Page
app.get('/foryou', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/foryou.html'));
});

// Post Page
app.get('/post', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/post.html'));
});

// Me Page
app.get('/me', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/me.html'));
});

app.get('/search', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/home.html'));
});

app.get('/followerslist/:username', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/followerslist.html'));
});

// API to sign up/login
app.post('/api/auth', (req, res) => {
    const { username, password } = req.body;

    let user = users.find((u) => u.username === username);
    if (user) {
        if (user.password === password) {
            return res.json({ success: true, user });
        } else {
            return res.json({ success: false, message: 'Incorrect password.' });
        }
    } else {
        const newUser = { username, password, followers: 0, following: [], profilePicture: '' };
        users.push(newUser);
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        return res.json({ success: true, user: newUser });
    }
});

// API to create a post
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, path.join(__dirname, 'public/uploads')); // Save files in 'public/uploads'
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname); // Extract original file extension
        const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`; // Unique file name
        cb(null, uniqueName); // Save with unique name and correct extension
    },
});

// Initialize multer with custom storage
const uploadx = multer({ storage });

// API to create a post
app.post('/api/post', upload.single('file'), (req, res) => {
    const { username, caption } = req.body;

    if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const filePath = `/uploads/${req.file.filename}`; // Correct file path

    // Create the new post object
    const newPost = {
        id: posts.length + 1,
        username,
        caption,
        file: filePath, // Save the file path
        timestamp: Date.now(),
        likedBy: [], // Array to store usernames of users who liked the post
        likes: 0,
        shares: 0,
    };

    // Add the new post to the array
    posts.push(newPost);

    // Save the updated posts array to the file
    fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), (err) => {
        if (err) {
            console.error('Failed to save posts:', err); // Log the error for debugging
            return res.status(500).json({ success: false, message: 'Failed to save posts.' });
        }

        // Respond with success if no error
        res.json({ success: true, post: newPost });
    });
});


// API to fetch posts
app.get('/api/posts', (req, res) => {
    const username = req.query.username;

    const response = posts
        .sort((a, b) => b.timestamp - a.timestamp)
        .map((post) => ({
            ...post,
            liked: username ? post.likedBy.includes(username) : false, // Check if the user liked the post
        }));

    res.json(response);
});

// API to like/unlike a post
app.post('/api/like', (req, res) => {
    const { postId, username, liked } = req.body;

    // Validate input
    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    const post = posts.find((p) => p.id === postId);

    if (post) {
        const userIndex = post.likedBy.indexOf(username);

        // Handle like/unlike logic
        if (liked && userIndex === -1) {
            // Add user to likedBy and increment likes
            post.likedBy.push(username);
            post.likes += 1;
        } else if (!liked && userIndex !== -1) {
            // Remove user from likedBy and decrement likes
            post.likedBy.splice(userIndex, 1);
            post.likes = Math.max(0, post.likes - 1);
        }

        // Save the updated posts to the file
        fs.writeFile(POSTS_FILE, JSON.stringify(posts, null, 2), (err) => {
            if (err) {
                console.error('Failed to save posts:', err); // Log error for debugging
                return res.status(500).json({ success: false, message: 'Failed to save posts.' });
            }

            // Respond with success if no errors
            res.json({ success: true, liked, likes: post.likes });
        });
    } else {
        // Post not found
        res.status(404).json({ success: false, message: 'Post not found' });
    }
});

// API to share a post
app.post('/api/share', (req, res) => {
    const { postId, sharedBy } = req.body; // Add `sharedBy` to track who shared it

    const post = posts.find((p) => p.id === postId);

    if (post) {
        post.shares = (post.shares || 0) + 1;

        // Create a shared post entry
        const sharedPost = {
            id: `${postId}-shared-${Date.now()}`, // Unique ID for the shared post
            originalPostId: postId, // Link to the original post
            sharedBy: sharedBy || "anonymous", // Track who shared it
            file: post.file, // Use the same media file
            caption: post.caption, // Original caption
            likes: 0, // Start with 0 likes for the shared version
            shares: 0, // No shares initially for the shared version
            isShared: true, // Flag as a shared post
            timestamp: Date.now(), // Timestamp for sorting
        };

        // Add the shared post to the list of posts
        posts.unshift(sharedPost);

        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));

        res.json({
            success: true,
            message: 'Post shared successfully',
            sharedPost,
        });
    } else {
        res.status(404).json({ success: false, message: 'Post not found' });
    }
});

// API to follow/unfollow a user
app.post('/api/follow', (req, res) => {
    const currentUsername = req.headers['current-username']; // Header example

    if (!currentUsername) {
        return res.status(400).json({ success: false, message: 'Current username is required.' });
    }

    const { followee } = req.body;

    if (!followee) {
        return res.status(400).json({ success: false, message: 'Followee username is required.' });
    }

    // Find or create entry for the followee in followers.json
    let followeeEntry = followersData.find((f) => f.username === followee);
    if (!followeeEntry) {
        followeeEntry = { username: followee, followersCount: 0, followers: [] };
        followersData.push(followeeEntry);
    }

    // Follow/unfollow logic
    if (followeeEntry.followers.includes(currentUsername)) {
        // Unfollow logic
        followeeEntry.followers = followeeEntry.followers.filter((f) => f !== currentUsername);
    } else {
        // Follow logic
        followeeEntry.followers.push(currentUsername);
    }

    // Update the followers count
    followeeEntry.followersCount = followeeEntry.followers.length;

    // Save changes to the followers.json file
    fs.writeFileSync(FOLLOWERS_FILE, JSON.stringify(followersData, null, 2));

    // Respond with updated follower count and list
    res.json({
        success: true,
        followerCount: followeeEntry.followersCount,
        usersWhoFollowed: followeeEntry.followers,
    });
});

app.get('/api/followers', (req, res) => {
    res.json(followersData);
});

// Route to get followers of a specific user
app.get('/api/followers/:username', (req, res) => {
    const { username } = req.params;

    const userEntry = followersData.find((f) => f.username === username);
    if (userEntry) {
        res.json(userEntry);
    } else {
        res.status(404).json({ success: false, message: 'User not found in followers list.' });
    }
});

// API to get my profile details
app.get('/api/me', (req, res) => {
    // Retrieve the username from request headers or query parameters
    const username = req.headers['x-username'] || req.query.username;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const user = users.find((u) => u.username === username);
    const userPosts = posts.filter((p) => p.username === username);

    if (user) {
        res.json({ success: true, user, posts: userPosts });
    } else {
        res.status(404).json({ success: false, message: 'User not found.' });
    }
});

// Serve user profile page
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username;
    const user = users.find((u) => u.username === username);
    const userPosts = posts.filter((p) => p.username === username);

    if (user) {
        res.json({ success: true, user, posts: userPosts });
    } else {
        res.status(404).json({ success: false, message: 'User not found.' });
    }
});

app.get('/user/:username', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/me.html'));
});

app.get('/api/followers/:username', async (req, res) => {
    const username = req.params.username;

    if (!username) {
        return res.status(400).json({ success: false, message: 'Username is required.' });
    }

    try {
        // Fetch user data from /api/user/:username
        const userResponse = await fetch(`http://localhost:3000/api/user/${username}`);
        
        if (!userResponse.ok) {
            return res.status(userResponse.status).json({ success: false, message: 'User not found.' });
        }

        const userData = await userResponse.json();

        // Ensure the response contains followers data
        if (!userData.followersCount || !userData.followers) {
            return res.status(500).json({ success: false, message: 'Invalid user data received.' });
        }

        // Respond with followers data
        res.json({
            username,
            followersCount: userData.followersCount,
            followers: userData.followers,
        });
    } catch (error) {
        console.error('Error fetching user data:', error);
        res.status(500).json({ success: false, message: 'An error occurred while fetching followers data.' });
    }
});

// API to upload/update profile picture
app.post('/api/profile-picture', upload.single('file'), (req, res) => {
    const username = req.body.username;
    const user = users.find((u) => u.username === username);

    if (user) {
        user.profilePicture = `/uploads/${req.file.filename}`;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, profilePicture: user.profilePicture });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
