const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const multer = require('multer');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.static('views'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

// File upload setup
const upload = multer({ dest: 'public/uploads/' });

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
    res.redirect('/login');
});

// Login Page
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/login.html'));
});

// Home Page
app.get('/home', (req, res) => {
    res.sendFile(path.join(__dirname, 'views/home.html'));
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

    let user = users.find(u => u.username === username);
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

// API to post
app.post('/api/post', upload.single('file'), (req, res) => {
    const { username, caption } = req.body;
    const file = req.file ? `/uploads/${req.file.filename}` : '';

    const newPost = {
        id: posts.length + 1,
        username,
        caption,
        file,
        timestamp: Date.now(),
        liked: false, // Default to not liked
    };

    posts.push(newPost);
    fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
    res.json({ success: true, post: newPost });
});

// API to fetch posts
app.get('/api/posts', (req, res) => {
    res.json(posts.sort((a, b) => b.timestamp - a.timestamp));
});

// API to fetch user info
app.get('/api/user/:username', (req, res) => {
    const username = req.params.username;
    const user = users.find(u => u.username === username);
    const userPosts = posts.filter(p => p.username === username);
    if (user) {
        res.json({ user, posts: userPosts });
    } else {
        res.status(404).json({ message: 'User not found.' });
    }
});

// API to upload/update profile picture
app.post('/api/profile-picture', upload.single('file'), (req, res) => {
    const username = req.body.username;
    const user = users.find(u => u.username === username);

    if (user) {
        user.profilePicture = `/uploads/${req.file.filename}`;
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, profilePicture: user.profilePicture });
    } else {
        res.status(404).json({ success: false, message: 'User not found' });
    }
});

// API to follow/unfollow a user
app.post('/api/follow', (req, res) => {
    const { username, target } = req.body;

    const user = users.find(u => u.username === username);
    const targetUser = users.find(u => u.username === target);

    if (user && targetUser && username !== target) {
        if (!user.following) user.following = [];
        if (user.following.includes(target)) {
            user.following = user.following.filter(f => f !== target);
            targetUser.followers -= 1;
        } else {
            user.following.push(target);
            targetUser.followers += 1;
        }
        fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
        res.json({ success: true, following: user.following });
    } else {
        res.status(400).json({ success: false, message: 'Invalid follow request' });
    }
});

// API to like/unlike a post
app.post('/api/like', (req, res) => {
    const { postId, liked } = req.body;

    const post = posts.find(p => p.id === postId);

    if (post) {
        post.liked = liked; // Update the like status

        fs.writeFileSync(POSTS_FILE, JSON.stringify(posts, null, 2));
        res.json({ success: true, liked: post.liked });
    } else {
        res.status(404).json({ success: false, message: 'Post not found' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});