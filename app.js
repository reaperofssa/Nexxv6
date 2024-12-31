const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(express.static(path.join(__dirname)));
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// File upload setup (allow images and videos)
const upload = multer({
    dest: 'public/uploads/',
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'video/mp4', 'video/mov'];
        if (!allowedTypes.includes(file.mimetype)) {
            return cb(new Error('Invalid file type.'));
        }
        cb(null, true);
    },
});

// Load user and post data
const USERS_FILE = './users.json';
const POSTS_FILE = './posts.json';

function loadFile(filePath) {
    if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, '[]');
    return JSON.parse(fs.readFileSync(filePath));
}

let users = loadFile(USERS_FILE);
let posts = loadFile(POSTS_FILE);

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

// User Profile Page
app.get('/user/:username', (req, res) => {
    const username = req.params.username;
    const user = users.find((u) => u.username === username);

    if (user) {
        res.sendFile(path.join(__dirname, 'views/user.html'));
    } else {
        res.status(404).send('User not found.');
    }
});

// API to get user profile details
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

// API to sign up/login
app.post('/api/auth', (req, res) => {
    const { username, password } = req.body;

    let user = users.find((u) => u.username === username);
    if (user) {
        if (user.password === password) {
            return res.json({ success: true, user });
        } else {
            return res.status(401).json({ success: false, message: 'Incorrect password.' });
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

    const newPost = {
        id: posts.length + 1,
        username,
        caption,
        file,
        timestamp: Date.now(),
        likes: [],
        shares: 0,
    };

    posts.push(newPost);
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
    res.json({ success: true, post: newPost });
});

// API to fetch posts
app.get('/api/posts', (req, res) => {
    res.json(posts.sort((a, b) => b.timestamp - a.timestamp));
});

// API to like/unlike a post
app.post('/api/like', (req, res) => {
    const { postId, username } = req.body;

    const post = posts.find((p) => p.id === postId);

    if (post) {
        if (!post.likes.includes(username)) {
            post.likes.push(username); // Add like
        } else {
            post.likes = post.likes.filter((user) => user !== username); // Remove like
        }

        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, likes: post.likes.length });
    } else {
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

    const followerUser = users.find((u) => u.username === follower);
    const followeeUser = users.find((u) => u.username === followee);

    if (followerUser && followeeUser) {
        if (followerUser.following.includes(followee)) {
            // Unfollow
            followerUser.following = followerUser.following.filter((f) => f !== followee);
            followeeUser.followers = Math.max(0, followeeUser.followers - 1);
        } else {
            // Follow
            followerUser.following.push(followee);
            followeeUser.followers += 1;
        }

        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, followerCount: followeeUser.followers });
    } else {
        res.status(404).json({ success: false, message: 'User not found.' });
    }
});

// API to get my profile details
app.get('/api/me', (req, res) => {
    const username = req.query.username;

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
