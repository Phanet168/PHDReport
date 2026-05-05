# PHD Report System

ប្រព័ន្ធគ្រប់គ្រងរបាយការណ៍ | Report Management System

## Overview

PHD Report is a web-based report management system built with Firebase, featuring a Khmer language interface. The system allows users to manage departments, units, indicators, periods, and reports with role-based access control.

## Technology Stack

- **Frontend**: Vanilla JavaScript (ES6 Modules), HTML5, Bootstrap 5
- **Backend**: Firebase (Authentication, Firestore, Cloud Functions)
- **Language**: Khmer (Cambodian) interface
- **Node.js**: v18 (for Cloud Functions)

## Features

- 🔐 **User Authentication**: Firebase Authentication with role-based access (Super Admin, Admin, User)
- 📊 **Dashboard**: Overview of reports and statistics
- 🏢 **Department Management**: Manage organizational departments
- 📝 **Indicator Management**: Define and track performance indicators
- 📅 **Period Management**: Configure reporting periods
- 👥 **User Management**: Admin tools for user administration
- 📈 **Report Entry**: Data entry interface for reports
- 🔍 **Report Viewing**: View and filter reports by various criteria

## Project Structure

```
PHDReport/
├── assets/
│   ├── css/              # Custom styles
│   └── js/               # JavaScript modules
│       ├── app.auth.js   # Authentication logic
│       ├── app.api.firebase.js  # API layer
│       ├── firebase.client.js   # Firebase initialization
│       ├── router.js     # Client-side routing
│       └── pages/        # Page-specific modules
├── dist-assets/          # Third-party libraries and assets
├── functions/            # Firebase Cloud Functions
│   ├── index.js          # Cloud Functions code
│   └── package.json      # Node.js dependencies
├── pages/                # HTML page templates
│   ├── admin/            # Admin pages
│   ├── data-entry/       # Data entry interface
│   ├── departments/      # Department management
│   ├── reports/          # Report viewing
│   ├── settings/         # System settings
│   └── units/            # Unit management
├── index.html            # Main dashboard
├── login.html            # Login page
└── admin.html            # Admin interface

```

## Setup Instructions

### Prerequisites

- Node.js v18 or higher
- Firebase CLI (`npm install -g firebase-tools`)
- Firebase project with Authentication and Firestore enabled

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd PHDReport
   ```

2. **Install Firebase Functions dependencies**
   ```bash
   cd functions
   npm install
   cd ..
   ```

3. **Configure Firebase**
   - Update `assets/js/firebase.client.js` with your Firebase configuration
   - Ensure Firestore Security Rules are properly configured
   - Deploy Cloud Functions:
     ```bash
     firebase deploy --only functions
     ```

4. **Set up Firestore Database**
   - Create collections: `users`, `departments`, `units`, `indicators`, `periods`, `reports`
   - Configure indexes as needed for queries
   - Set up Security Rules (see Security section below)

5. **Deploy to Firebase Hosting** (optional)
   ```bash
   firebase deploy --only hosting
   ```

### Local Development

For local development with Firebase emulators:

```bash
# Start Firebase emulators
cd functions
npm run serve
```

Serve the frontend using any static file server:
```bash
# Using Python
python -m http.server 8000

# Or using Node.js http-server
npx http-server -p 8000
```

## User Roles

1. **Super Admin**: Full access to all features, including user management
2. **Admin**: Can manage data within their department
3. **User**: Can view and enter data with limited permissions

## Security

### Firebase Configuration

⚠️ **Important**: The Firebase API key in `firebase.client.js` is intentionally public. Security is enforced through:
- Firebase Authentication
- Firestore Security Rules
- Cloud Functions authorization checks

### Firestore Security Rules (Example)

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isSuper() {
      return isAuthenticated() && 
             request.auth.token.role == 'super';
    }
    
    function isAdmin() {
      return isAuthenticated() && 
             request.auth.token.role in ['super', 'admin'];
    }
    
    // Users collection - Super only
    match /users/{userId} {
      allow read: if isAuthenticated();
      allow write: if isSuper();
    }
    
    // Departments - Admin can read, Super can write
    match /departments/{docId} {
      allow read: if isAuthenticated();
      allow write: if isSuper();
    }
    
    // Reports - users can read/write their own
    match /reports/{reportId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated();
      allow update: if isAuthenticated() && 
                       (resource.data.owner_uid == request.auth.uid || isAdmin());
      allow delete: if isAdmin();
    }
  }
}
```

## Cloud Functions

Located in `functions/index.js`:

- **adminSetPassword**: Super Admin can reset any user's password
- **adminCreateUser**: Super Admin can create new authentication users

## Development Guidelines

### Code Style

- Use ES6+ features (const/let, arrow functions, async/await)
- Follow modular architecture with separate files for each concern
- Use Khmer language for user-facing strings
- Implement proper error handling with try/catch blocks

### Adding a New Page

1. Create HTML file in `pages/`
2. Create corresponding JavaScript module in `assets/js/pages/`
3. Import and initialize in the router if needed
4. Add navigation links to the menu

### Security Best Practices

- Always validate user input on both client and server
- Use parameterized queries to prevent injection
- Implement proper authorization checks
- Escape HTML when rendering user-generated content
- Use HTTPS only (enforced by Firebase)

## Known Issues & Improvements Needed

See the comprehensive code review document for details. Priority items:

1. **XSS Prevention**: Implement consistent HTML escaping for user-generated content
2. **Testing**: Add unit and integration tests
3. **Linting**: Configure ESLint for code quality
4. **Documentation**: Expand API and code documentation
5. **Error Handling**: Standardize error handling patterns

## Testing

Currently, there is no automated testing infrastructure. Manual testing is required.

**Planned improvements**:
- Unit tests for utility functions
- Integration tests with Firebase Emulator Suite
- E2E tests for critical user flows

## Deployment

### Firebase Hosting

```bash
# Build (if you add a build process)
npm run build

# Deploy hosting and functions
firebase deploy

# Deploy only functions
firebase deploy --only functions

# Deploy only hosting
firebase deploy --only hosting
```

## Contributing

1. Create a feature branch
2. Make your changes
3. Test thoroughly
4. Submit a pull request with description

## License

[Specify your license here]

## Support

For issues and questions, please contact [your contact information]

---

**Last Updated**: 2025-11-10
