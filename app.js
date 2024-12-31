const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware for serving static files
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// File upload setup
const upload = multer({ dest: 'public/uploads/' });

// File paths
const USERS_FILE = './users.json';
const POSTS_FILE = './posts.json';

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
app.post('/api/post', upload.single('file'), (req, res) => {
    const { username, caption } = req.body;
    const file = req.file ? `/uploads/${req.file.filename}` : '';

    // Create the new post object
    const newPost = {
        id: posts.length + 1,
        username,
        caption,
        file,
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
    const { postId } = req.body;

    const post = posts.find((p) => p.id === postId);

    if (post) {
        post.shares = (post.shares || 0) + 1;

        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, shares: post.shares });
    } else {
        res.status(404).json({ success: false, message: 'Post not found' });
    }
});

// API to follow/unfollow a user
app.post('/api/follow', (req, res) => {
    const { follower, followee } = req.body;

    // Find the follower and followee users
    const followerUser = users.find((u) => u.username === follower);
    const followeeUser = users.find((u) => u.username === followee);

    if (!followerUser || !followeeUser) {
        return res.status(404).json({ success: false, message: 'User not found.' });
    }

    // Initialize followersList if it doesn't exist
    if (!followeeUser.followersList) followeeUser.followersList = [];

    if (followerUser.following.includes(followee)) {
        // Unfollow logic
        followerUser.following = followerUser.following.filter((f) => f !== followee);
        followeeUser.followersList = followeeUser.followersList.filter((f) => f !== follower);
        followeeUser.followers = Math.max(0, followeeUser.followers - 1); // Prevent negative counts
    } else {
        // Follow logic
        followerUser.following.push(followee);
        followeeUser.followersList.push(follower);
        followeeUser.followers = (followeeUser.followers || 0) + 1; // Handle uninitialized followers count
    }

    // Save updated users data to the file
    try {
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ 
            success: true, 
            followersCount: followeeUser.followers, 
            followingCount: followerUser.following.length,
            followersList: followeeUser.followersList, 
        });
    } catch (error) {
        console.error('Error saving users data:', error);
        res.status(500).json({ success: false, message: 'Failed to save user data.' });
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
