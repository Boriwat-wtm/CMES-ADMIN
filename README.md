# CMES-ADMIN - Customer Management & E-Commerce System (Admin Portal)

A comprehensive admin dashboard and management system for the CMES platform, built with React, Node.js, Express, and MongoDB with real-time features.

## 🎯 Key Features

### Admin Dashboard
- 📊 Real-time analytics and statistics
- 📈 Visual charts and data visualization
- 👥 User management and filtering
- 🎁 Gift rewards management system
- 🎡 Lucky wheel configuration
- 📸 Image queue and asset management
- 🏆 Ranking and VIP tracking
- ⚙️ System settings and configuration

### Advanced Features
- ✅ Real-time updates with Socket.io
- ✅ Multi-user admin access with roles
- ✅ MongoDB persistent storage
- ✅ File upload management system
- ✅ Automated scheduled tasks (node-cron)
- ✅ Secure JWT authentication
- ✅ Role-based access control (RBAC)
- ✅ Comprehensive logging and audit trail

### Technical Highlights
- 🚀 React v19.0.0 with hooks
- ⚡ Express v4.21.2 (Node.js)
- 📦 MongoDB with Mongoose v9.0.1
- 🔐 bcrypt password hashing
- 🔄 Socket.io v4.8.1 real-time
- 📱 Responsive UI (Tailwind CSS)

---

## 🚀 Quick Start

### Prerequisites
- Node.js 16+ (Recommended: 18 LTS)
- npm or yarn
- MongoDB 4.4+ (local or cloud)
- Available ports: 3001 (frontend) and 5001 (backend)

### Installation

#### Automated Setup (Recommended)

**Windows (PowerShell):**
```powershell
.\setup.ps1
```

**Mac/Linux (Bash):**
```bash
chmod +x setup.sh
./setup.sh
```

#### Manual Setup

**Step 1: Backend Installation**
```bash
cd backend
npm install

# Create .env file
cp .env.example .env
```

**.env Configuration:**
```env
PORT=5001
NODE_ENV=development
JWT_SECRET=change-this-to-a-secure-random-string
MONGODB_URI=mongodb://localhost:27017/cmes-admin
DATABASE_NAME=cmes-admin
ADMIN_JWT_EXPIRY=7d
USER_API_BASE=http://localhost:4000
```

**Start Backend:**
```bash
npm start
# or for development with auto-reload
npm run dev
# Server runs on http://localhost:5001
```

**Step 2: Frontend Installation (new terminal)**
```bash
cd frontend
npm install

# Create .env file
cp .env.example .env
```

**.env Configuration:**
```env
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_SOCKET_URL=http://localhost:5001
REACT_APP_ADMIN_NAME=Admin Portal
```

**Start Frontend:**
```bash
npm start
# Frontend runs on http://localhost:3001
```

---

## 📁 Project Structure

```
CMES-ADMIN/
├── backend/
│   ├── models/
│   │   ├── AdminUser.js             # Admin user schema
│   │   ├── AdminReport.js           # Report generation model
│   │   ├── GiftSetting.js           # Gift configuration
│   │   ├── Ranking.js               # User rankings
│   │   ├── ImageQueue.js            # Image processing queue
│   │   ├── CheckHistory.js          # Check/verification history
│   │   ├── TimeHistory.js           # Time-based history logs
│   │   └── Setting.js               # System settings
│   │
│   ├── public/
│   │   ├── obs-image-overlay.html   # OBS image streaming overlay
│   │   ├── obs-ranking-overlay.html # OBS ranking display
│   │   └── data-icon/               # Icon assets
│   │
│   ├── uploads/
│   │   ├── gifts/                   # Gift images
│   │   ├── qr-codes/                # Generated QR codes
│   │   └── user-uploads/            # User-submitted files
│   │
│   ├── server.js                    # Express server (REST API)
│   ├── realtime-server.js           # Socket.io server
│   ├── check_db.js                  # Database validation script
│   ├── create-admin.js              # Admin user creation script
│   ├── hashPasswords.js             # Password hashing utility
│   ├── package.json                 # Dependencies
│   ├── .env                         # Environment variables
│   └── DATABASE_SCHEMA.md           # Database documentation
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── App.js               # Main component
│   │   │   ├── AdminReport.js       # Reports page
│   │   │   ├── CheckHistory.js      # Check history view
│   │   │   ├── Giftsetting.js       # Gift management
│   │   │   ├── ImageQueue.js        # Image queue manager
│   │   │   ├── LuckyWheel.js        # Lucky wheel config
│   │   │   ├── TimeHistory.js       # Time history view
│   │   │   ├── Stat-slip.js         # Statistics display
│   │   │   ├── home.js              # Home/Dashboard
│   │   │   ├── Register.js          # Admin registration
│   │   │   └── ProtectedRoute.js    # Route protection
│   │   │
│   │   ├── styles/
│   │   │   ├── App.css
│   │   │   ├── AdminReport.css
│   │   │   ├── CheckHistory.css
│   │   │   ├── Giftsetting.css
│   │   │   ├── ImageQueue.css
│   │   │   ├── LuckyWheel.css
│   │   │   ├── TimeHistory.css
│   │   │   ├── home.css
│   │   │   ├── theme.css
│   │   │   └── index.css
│   │   │
│   │   ├── index.js                 # React entry
│   │   └── index.html               # HTML template
│   │
│   ├── public/
│   │   ├── index.html               # Static HTML
│   │   └── manifest.json            # PWA manifest
│   │
│   ├── build/                       # Production build (auto-generated)
│   ├── package.json                 # Dependencies
│   ├── tailwind.config.js           # Tailwind CSS config
│   └── postcss.config.js            # PostCSS config
│
├── App.js                           # Root component
├── tailwind.config.js               # Tailwind CSS configuration
├── postcss.config.js                # PostCSS configuration
├── package.json                     # Root package.json
└── README.md                        # This file
```

---

## ⚙️ Configuration

### Backend Environment Variables

Create `backend/.env`:
```env
# Server Configuration
PORT=5001
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/cmes-admin
DATABASE_NAME=cmes-admin

# Authentication
JWT_SECRET=change-this-to-a-secure-random-string
ADMIN_JWT_EXPIRY=7d

# External APIs
USER_API_BASE=http://localhost:4000
USER_API_TIMEOUT=5000

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# File Upload
MAX_FILE_SIZE=5242880
ALLOWED_IMAGE_TYPES=jpg,jpeg,png,gif,webp
UPLOAD_DIR=./uploads

# Logging
LOG_LEVEL=debug
LOG_FILE=./logs/app.log
```

### Frontend Environment Variables

Create `frontend/.env`:
```env
REACT_APP_API_URL=http://localhost:5001/api
REACT_APP_SOCKET_URL=http://localhost:5001
REACT_APP_ADMIN_NAME=Admin Portal
REACT_APP_ENV=development
REACT_APP_LOG_LEVEL=debug
```

---

## 🔐 Admin Setup

### ⚠️ Critical Security Notes

**NEVER expose sensitive information in version control:**
- ❌ Do NOT commit `.env` files to GitHub
- ❌ Do NOT hardcode passwords or secrets in code
- ❌ Do NOT include real MongoDB credentials in documentation
- ❌ Do NOT share JWT secrets or API keys
- ❌ Never push email passwords to repositories

**What to Keep Secret:**
```
- JWT_SECRET (use 32+ character random string)
- MONGODB_URI with credentials
- API keys and tokens
- Email passwords
- Admin passwords
- Any authentication data
```

**Use .gitignore to protect:**
```
.env
.env.local
.env.*.local
node_modules/
uploads/
logs/
```

### Create Admin User

**First Time Setup:**
```bash
cd backend
node create-admin.js
```

Follow the prompts to enter:
- Username (e.g., `admin`)
- Email (e.g., `admin@example.com`)
- Password (must be strong)

### Password Management

**Hash Existing Passwords:**
```bash
node hashPasswords.js
```

**Change Admin Password:**
```bash
# Access MongoDB directly
mongo cmes-admin
db.adminusers.updateOne(
  { email: "admin@example.com" },
  { $set: { password: bcrypt.hashSync("newpassword", 10) } }
)
```

### Admin Roles (Future Implementation)

```javascript
// Planned roles
- SuperAdmin     // Full access to all features
- Administrator  // Can manage users and content
- Manager        // Can view reports and manage gifts
- Viewer         // Read-only access
```

---

## 🛠️ API Endpoints

### Authentication
```
POST   /api/auth/login              # Admin login
POST   /api/auth/logout             # Admin logout
GET    /api/auth/profile            # Get current admin profile
POST   /api/auth/refresh-token      # Refresh JWT token
```

### Admin Management
```
GET    /api/admins                  # List all admins
POST   /api/admins                  # Create new admin
GET    /api/admins/:id              # Get admin details
PUT    /api/admins/:id              # Update admin
DELETE /api/admins/:id              # Delete admin
```

### Gift Management
```
GET    /api/gifts                   # List all gifts
POST   /api/gifts                   # Create new gift
GET    /api/gifts/:id               # Get gift details
PUT    /api/gifts/:id               # Update gift
DELETE /api/gifts/:id               # Delete gift
GET    /api/gifts/available/count   # Get available gifts count
```

### Reports & Analytics
```
GET    /api/reports                 # Get all reports
POST   /api/reports                 # Generate new report
GET    /api/reports/:id             # Get report details
GET    /api/admin-reports           # Get admin-specific reports
GET    /api/stats/overview          # Dashboard statistics
GET    /api/stats/users             # User statistics
GET    /api/stats/gifts             # Gift statistics
```

### Rankings & History
```
GET    /api/rankings                # Get user rankings
GET    /api/rankings/top            # Get top 10 users
GET    /api/check-history           # Get check history
GET    /api/time-history            # Get time-based history
POST   /api/time-history            # Record time event
```

### System Settings
```
GET    /api/settings                # Get all settings
GET    /api/settings/:key           # Get specific setting
PUT    /api/settings/:key           # Update setting
DELETE /api/settings/:key           # Delete setting
POST   /api/settings/reset          # Reset to defaults
```

### File Management
```
POST   /api/upload/gift             # Upload gift image
POST   /api/upload/qr-code          # Generate QR code
GET    /api/uploads/:type           # List uploaded files
DELETE /api/uploads/:id             # Delete uploaded file
```

---

## 🧪 Testing

### Database Validation
```bash
cd backend
node check_db.js
```

Output shows:
- MongoDB connection status
- Database statistics
- Collection counts
- Index information

### Create Test Admin
```bash
cd backend
node create-admin.js
# Use test credentials:
# Username: testadmin
# Email: test@admin.com
# Password: TestPass123!
```

### API Testing with cURL

**Login as Admin:**
```bash
curl -X POST http://localhost:5001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email":"admin@example.com",
    "password":"YourPassword123!"
  }'
```

**Get All Admins:**
```bash
curl -X GET http://localhost:5001/api/admins \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Create Gift:**
```bash
curl -X POST http://localhost:5001/api/gifts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
    "name":"Premium Gift",
    "description":"A valuable prize",
    "quantity":100
  }'
```

**Get Statistics:**
```bash
curl -X GET http://localhost:5001/api/stats/overview \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Manual Testing (Browser)
1. Navigate to http://localhost:3001
2. Login with admin credentials
3. Test each feature:
   - Dashboard → View stats
   - Gifts → Add/Edit/Delete gifts
   - Rankings → View user rankings
   - Reports → Generate reports
   - Settings → Update configuration

### Frontend Testing
```bash
cd frontend
npm test
npm run build
```

---

## 🎨 Frontend Components

### Core Components

**App.js** - Main router and layout
- Navigation menu
- Route definitions
- User session management
- Theme switching

**home.js** - Admin Dashboard
- Key statistics cards
- Charts and graphs
- Quick actions
- Recent activity feed

**Register.js** - Admin Registration
- Registration form
- Validation
- Error handling
- Success messaging

### Feature Components

**Giftsetting.js** - Gift Management
- List, add, edit, delete gifts
- Gift images and descriptions
- Inventory tracking
- Gift availability status

**AdminReport.js** - Report Generation
- Create custom reports
- Date range filtering
- Export to CSV/PDF
- Report history

**Ranking.js** - User Rankings
- Top users display
- VIP tracking
- Point system
- Badge assignment

**ImageQueue.js** - Image Management
- Upload images
- Queue processing
- Image preview
- Delete functionality

**CheckHistory.js** - Verification History
- Check logs
- User activity
- Timestamp tracking
- Filter and search

**TimeHistory.js** - Time-based Logs
- Event timeline
- Duration tracking
- Performance metrics

**LuckyWheel.js** - Wheel Configuration
- Spin settings
- Prize mapping
- Animation controls
- Probability settings

**ProtectedRoute.js** - Route Protection
- Authentication checking
- Role-based access
- Redirect logic
- Session validation

---

## 📊 Real-time Features

### Socket.io Integration

```javascript
// Client-side (React component)
import io from 'socket.io-client';

const socket = io(process.env.REACT_APP_SOCKET_URL);

// Listen for real-time updates
socket.on('gift-updated', (data) => {
  console.log('Gift updated:', data);
  // Update component state
});

socket.on('ranking-updated', (data) => {
  console.log('Ranking changed:', data);
  // Refresh rankings
});

socket.on('admin-action', (data) => {
  console.log('Admin action:', data);
  // Log admin activities
});

// Emit events
socket.emit('check-gift', { giftId: '123' });
socket.emit('update-setting', { key: 'value' });
```

### Supported Events

**Gift Events:**
- `gift-created` - New gift added
- `gift-updated` - Gift information changed
- `gift-deleted` - Gift removed
- `gift-awarded` - Gift given to user

**Ranking Events:**
- `ranking-updated` - User ranking changed
- `vip-promoted` - User promoted to VIP
- `vip-demoted` - User demoted from VIP
- `points-awarded` - Points given to user

**System Events:**
- `settings-updated` - Configuration changed
- `admin-login` - Admin logged in
- `admin-logout` - Admin logged out
- `error-alert` - System error notification

**Image Events:**
- `image-uploaded` - Image file uploaded
- `image-processed` - Image processing complete
- `queue-updated` - Queue status changed

---

## 🔒 Security

### Implementation
- ✅ Passwords hashed with bcrypt (10 salt rounds)
- ✅ JWT tokens with configurable expiration
- ✅ Token validation on protected routes
- ✅ Role-based access control
- ✅ CORS protection configured
- ✅ Input validation and sanitization
- ✅ Protected file uploads with type checking
- ✅ Secure session management
- ✅ Request rate limiting (recommended)
- ✅ Audit logging for admin actions

### Best Practices
```javascript
// Password hashing
const hashedPassword = bcrypt.hashSync(password, 10);

// JWT verification
jwt.verify(token, process.env.JWT_SECRET);

// Input validation
validator.isEmail(email);
validator.isLength(password, { min: 8 });

// File upload restrictions
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/gif'];
if (!ALLOWED_TYPES.includes(file.mimetype)) {
  throw new Error('Invalid file type');
}
```

### Production Security Checklist
- [ ] Change JWT_SECRET to 32+ character random string
- [ ] Set NODE_ENV=production
- [ ] Enable HTTPS/TLS for all endpoints
- [ ] Use environment variables from secure vault
- [ ] Configure CORS to specific production domain
- [ ] Enable rate limiting (express-rate-limit)
- [ ] Set up Web Application Firewall (WAF)
- [ ] Enable request logging and monitoring
- [ ] Implement CSRF tokens
- [ ] Set secure HTTP headers (helmet.js)
- [ ] Enable Content Security Policy (CSP)
- [ ] Regular security audits
- [ ] Backup database regularly
- [ ] Monitor for suspicious activity
- [ ] Implement 2FA for admin accounts

### Vulnerability Prevention
- XSS Prevention: React auto-escaping
- CSRF Protection: CSRF tokens on state-changing operations
- SQL Injection: Mongoose parameterized queries
- File Upload: Type validation, size limits, sandboxed storage
- Authentication: Strong JWT implementation
- Authorization: Role-based access control

---

## 🚀 Deployment

### Docker Deployment

**Backend Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

EXPOSE 5001

CMD ["npm", "start"]
```

**Build and Run:**
```bash
cd backend
docker build -t cmes-admin-backend .
docker run -p 5001:5001 \
  -e MONGODB_URI=<your-mongodb-uri> \
  -e JWT_SECRET=<your-secure-random-string> \
  cmes-admin-backend
```

### Cloud Deployment

**Vercel (Frontend):**
```bash
npm install -g vercel
cd frontend
vercel deploy --prod
```

**Heroku (Backend):**
```bash
heroku login
heroku create cmes-admin-backend
heroku config:set JWT_SECRET=your-secret
heroku config:set MONGODB_URI=your-atlas-uri
git push heroku main
heroku logs --tail
```

**AWS/DigitalOcean (Full Stack):**
1. Provision VM (Ubuntu 20.04+)
2. Install Node.js and MongoDB
3. Clone repository
4. Install dependencies: `npm install`
5. Configure .env file
6. Start with PM2: `npm install -g pm2`
   ```bash
   pm2 start server.js --name "cmes-admin"
   pm2 save
   pm2 startup
   ```
7. Setup reverse proxy with Nginx
8. Enable SSL with Let's Encrypt

**MongoDB Atlas (Cloud Database):**
```bash
# Get connection string from MongoDB Atlas dashboard
# Format: mongodb+srv://<username>:<password>@<cluster>.mongodb.net/cmes-admin
# Note: Never commit credentials to version control!
MONGODB_URI=<your-mongodb-atlas-connection-string>
```

---

## 📝 Database Models

### AdminUser Schema
```javascript
{
  _id: ObjectId,
  username: String (unique),
  email: String (unique),
  password: String (hashed),
  role: String (admin, moderator, viewer),
  permissions: [String],
  lastLogin: Date,
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### GiftSetting Schema
```javascript
{
  _id: ObjectId,
  name: String,
  description: String,
  image: String,
  quantity: Number,
  availableQuantity: Number,
  price: Number,
  category: String,
  status: String (active, inactive, archive),
  createdBy: ObjectId (ref: AdminUser),
  createdAt: Date,
  updatedAt: Date
}
```

### Ranking Schema
```javascript
{
  _id: ObjectId,
  userId: String,
  username: String,
  points: Number,
  rank: Number,
  vipLevel: String (bronze, silver, gold, platinum),
  badges: [String],
  totalGiftsWon: Number,
  lastUpdated: Date,
  updatedAt: Date
}
```

### AdminReport Schema
```javascript
{
  _id: ObjectId,
  reportType: String (daily, weekly, monthly, custom),
  title: String,
  data: Object,
  generatedBy: ObjectId (ref: AdminUser),
  generatedAt: Date,
  filters: Object,
  exportFormat: String (pdf, excel, json),
  status: String (draft, published, archived),
  updatedAt: Date
}
```

### ImageQueue Schema
```javascript
{
  _id: ObjectId,
  filename: String,
  originalName: String,
  path: String,
  size: Number,
  mimetype: String,
  uploadedBy: ObjectId (ref: AdminUser),
  status: String (pending, processing, completed, failed),
  uploadedAt: Date,
  processedAt: Date
}
```

### Setting Schema
```javascript
{
  _id: ObjectId,
  key: String (unique),
  value: String/Number/Boolean/Object,
  category: String,
  description: String,
  updatedBy: ObjectId (ref: AdminUser),
  updatedAt: Date
}
```

---

## 🐛 Troubleshooting

### Backend Issues

**Port 5001 Already in Use:**
```bash
# Windows
netstat -ano | findstr :5001
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :5001
kill -9 <PID>
```

**MongoDB Connection Failed:**
```bash
# Check MongoDB is running
mongod --version

# Verify connection string in .env
# Format: mongodb://localhost:27017/cmes-admin

# Test connection
mongo "mongodb://localhost:27017/cmes-admin"
```

**Module Dependencies Error:**
```bash
cd backend
rm -rf node_modules package-lock.json
npm install
```

**JWT Token Issues:**
```bash
# Verify JWT_SECRET in .env exists
echo $JWT_SECRET

# Check token validity at https://jwt.io
# Decode and verify payload
```

**Database Errors:**
```bash
cd backend
node check_db.js
# Shows connection status and stats
```

### Frontend Issues

**Port 3001 Already in Use:**
```bash
# Windows
netstat -ano | findstr :3001
taskkill /PID <PID> /F

# Mac/Linux
lsof -i :3001
kill -9 <PID>
```

**API Connection Failed:**
```bash
# Check .env has correct API URL
echo $REACT_APP_API_URL

# Verify backend is running
curl http://localhost:5001/api/health

# Check CORS configuration in backend
```

**Build Errors:**
```bash
cd frontend
npm cache clean --force
rm -rf node_modules package-lock.json
npm install
npm run build
```

**Socket.io Connection Issues:**
```bash
# Check Socket.io URL in .env
REACT_APP_SOCKET_URL=http://localhost:5001

# Verify backend socket server is running
# Check browser console for connection logs
```

### Common Error Messages

| Error | Cause | Solution |
|-------|-------|----------|
| `ERR_MODULE_NOT_FOUND` | Missing dependency | `npm install` |
| `EADDRINUSE` | Port in use | Change PORT or kill process |
| `MongooseError` | DB connection | Check MONGODB_URI |
| `JsonWebTokenError` | Invalid token | Clear localStorage, login again |
| `CORS error` | Origin not allowed | Update CORS config |
| `Cannot POST /api/...` | Backend not running | Start backend server |
| `Socket.io not connected` | Wrong URL or backend issue | Check Socket.io config |

### Debug Mode

**Backend Debugging:**
```bash
cd backend
DEBUG=app:* npm start
```

**Frontend Debugging:**
```bash
cd frontend
npm start
# Open DevTools (F12)
# Check Console tab for errors
```

**Database Debugging:**
```bash
# Use MongoDB Compass GUI
# Or command line:
mongosh cmes-admin
db.admins.find().pretty()
```

---

## 📚 Documentation

### Quick References
- **[DATABASE_SCHEMA.md](./backend/DATABASE_SCHEMA.md)** - Complete database schema
- **[GMAIL_SETUP.md](./backend/GMAIL_SETUP.md)** - Email configuration guide
- **[gift-settings.json](./backend/gift-settings.json)** - Gift configuration template
- **[settings.json](./backend/settings.json)** - System settings

### Setup Guides
- **[QUICK_START.md](./QUICK_START.md)** - 5-minute quick start
- **[setup.ps1](./setup.ps1)** - Windows automated setup
- **[setup.sh](./setup.sh)** - Mac/Linux automated setup

### API Documentation
- RESTful API endpoints documented above
- Socket.io events and listeners
- Request/response examples with cURL
- Authentication and authorization

### Code Documentation
- Inline comments in source code
- JSDoc for functions and components
- Component prop documentation
- Database query explanations

---

## 🔄 Development Workflow

### Step 1: Setup Environment
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration

cd ../frontend
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Step 2: Start Services

**Terminal 1 - Backend:**
```bash
cd backend
npm run dev
# Watches for file changes with nodemon
# Runs on http://localhost:5001
```

**Terminal 2 - Frontend:**
```bash
cd frontend
npm start
# Starts development server with HMR
# Runs on http://localhost:3001
```

**Terminal 3 - Database (Optional):**
```bash
mongod
# Starts MongoDB service
```

### Step 3: Development Process
1. Create or modify component in `frontend/src/`
2. Create or update API route in `backend/`
3. Update database model if needed
4. Test changes in browser
5. Check console for errors
6. Commit changes to git

### Step 4: Building for Production

**Backend (ready as-is):**
```bash
cd backend
npm start
# No build step needed for Node.js
```

**Frontend (build optimized bundle):**
```bash
cd frontend
npm run build
# Creates optimized build in ./build directory
# Ready for deployment
```

### Testing
```bash
# Frontend tests
cd frontend
npm test

# Backend manual testing
curl http://localhost:5001/api/health
```

---

## 🎯 Roadmap

### ✅ Completed Features
- [x] Admin authentication and login
- [x] Admin dashboard with statistics
- [x] Gift management system
- [x] User ranking and VIP tracking
- [x] Report generation
- [x] Real-time updates with Socket.io
- [x] File upload management
- [x] Image queue system
- [x] System settings management
- [x] Admin user management

### 🔄 In Progress
- [ ] Email notifications
- [ ] Advanced analytics and charts
- [ ] PDF/Excel report export
- [ ] Two-factor authentication for admins
- [ ] User activity audit logs
- [ ] Backup and restore functionality

### 📋 Planned Features
- [ ] Role-based permission system
- [ ] Admin activity logging
- [ ] Webhook notifications
- [ ] API rate limiting
- [ ] Data encryption
- [ ] Mobile admin app
- [ ] Dark mode support
- [ ] Multi-language support
- [ ] LDAP/SSO integration
- [ ] Advanced filtering and search

### 🚀 Performance & Security
- [ ] Database query optimization
- [ ] Redis caching layer
- [ ] CDN integration
- [ ] API rate limiting (express-rate-limit)
- [ ] Request validation middleware
- [ ] Comprehensive logging
- [ ] Security scanning automation
- [ ] Load testing and optimization

---

## 📄 License

ISC License - feel free to use this project

---

## 📞 Support

### หากมีปัญหา:
1. ตรวจสอบ Backend logs ใน terminal
2. ตรวจสอบ Browser console สำหรับ client-side errors
3. ตรวจสอบ Network tab ใน DevTools
4. ดูไฟล์ .env configuration
5. ลองรัน `npm install` อีกครั้ง

### Useful Commands
```bash
# Check database
node check_db.js

# Create admin
node create-admin.js

# Hash passwords
node hashPasswords.js

# Development mode
npm run dev

# Production build
npm run build
```

---

## ✨ Latest Updates

### Version 2.1.0 (January 2026)

**New Features**
- ✅ Real-time updates with Socket.io v4.8.1
- ✅ Advanced dashboard with live statistics
- ✅ Image queue management system
- ✅ Automated scheduled tasks (node-cron)
- ✅ Comprehensive admin reporting
- ✅ User ranking and VIP system
- ✅ Lucky wheel configuration
- ✅ File upload management

**Technical Enhancements**
- 🔄 React v19.0.0 with latest hooks
- 🔄 Express v4.21.2 for REST API
- 🔄 Mongoose v9.0.1 for MongoDB
- 🔄 Socket.io v4.8.1 for real-time
- 🔄 Tailwind CSS v4 for styling
- 🔄 bcrypt v6.0.0 for security
- 🔄 Multer v1.4.5 for file uploads

**Bug Fixes & Improvements**
- 🐛 Fixed Socket.io connection stability
- 🐛 Improved error handling and logging
- 🐛 Enhanced authentication security
- 🐛 Better mobile responsiveness
- 🐛 Optimized database queries
- 🐛 Reduced bundle size

### Previous Versions
- **Version 2.0.0** - Complete admin system
- **Version 1.0.0** - Initial release

### Dependency Versions
```
React: v19.0.0
Node.js: 16+ (18 LTS recommended)
Express: v4.21.2
MongoDB: 4.1+
Mongoose: v9.0.1
Socket.io: v4.8.1
bcrypt: v6.0.0
Multer: v1.4.5-lts.1
```
