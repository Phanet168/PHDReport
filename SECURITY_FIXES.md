# Security Fixes Guide

This document outlines critical security issues found in the PHD Report system and provides implementation guidance for fixes.

## Priority 1: XSS (Cross-Site Scripting) Prevention

### Issue
User-controlled data is being inserted into HTML using `innerHTML` without sanitization, creating XSS vulnerabilities.

### Affected Files
- `assets/js/pages/units.page.js`
- `assets/js/pages/data-entry.page.js`
- `assets/js/pages/departments.page.js`
- `assets/js/pages/users.page.js`
- `assets/js/pages/periods.page.js`
- Other page modules

### Solution

#### Step 1: Create a Shared Utility Module

Create `assets/js/utils.js`:

```javascript
/**
 * Escapes HTML special characters to prevent XSS attacks
 * @param {*} str - String to escape
 * @returns {string} - Escaped string
 */
export function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/[&<>"']/g, char => {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return escapeMap[char];
  });
}

/**
 * Safely creates a text node to avoid XSS
 * @param {string} tag - HTML tag name
 * @param {string} text - Text content
 * @param {string} className - Optional CSS class
 * @returns {HTMLElement}
 */
export function createSafeElement(tag, text, className = '') {
  const el = document.createElement(tag);
  el.textContent = text; // Safe: uses textContent instead of innerHTML
  if (className) el.className = className;
  return el;
}
```

#### Step 2: Update Rendering in Page Modules

**Before (Vulnerable)**:
```javascript
tr.innerHTML = `
  <td>${u[ID_FIELD]}</td>
  <td>${u.unit_name ?? ''}</td>
  <td>${deptNameById(u.department_id)}</td>
  <td>${u.unit_type ?? ''}</td>
`;
```

**After (Secure)**:
```javascript
import { escapeHtml } from '../utils.js';

tr.innerHTML = `
  <td>${escapeHtml(u[ID_FIELD])}</td>
  <td>${escapeHtml(u.unit_name)}</td>
  <td>${escapeHtml(deptNameById(u.department_id))}</td>
  <td>${escapeHtml(u.unit_type)}</td>
`;
```

**Or (Even Better - No innerHTML)**:
```javascript
import { createSafeElement } from '../utils.js';

const td1 = createSafeElement('td', u[ID_FIELD]);
const td2 = createSafeElement('td', u.unit_name ?? '');
const td3 = createSafeElement('td', deptNameById(u.department_id));
const td4 = createSafeElement('td', u.unit_type ?? '');

tr.appendChild(td1);
tr.appendChild(td2);
tr.appendChild(td3);
tr.appendChild(td4);
```

#### Step 3: Update Select/Dropdown Rendering

**Before (Vulnerable)**:
```javascript
selDept.innerHTML = `<option value="">ជំពូកទាំងអស់</option>` +
  DEPTS.map(d => `<option value="${d.department_id}">${d.department_name||''}</option>`).join('');
```

**After (Secure)**:
```javascript
import { escapeHtml } from '../utils.js';

selDept.innerHTML = `<option value="">ជំពូកទាំងអស់</option>` +
  DEPTS.map(d => 
    `<option value="${escapeHtml(d.department_id)}">${escapeHtml(d.department_name || '')}</option>`
  ).join('');
```

**Or (Best Practice - Use DOM methods)**:
```javascript
selDept.innerHTML = ''; // Clear existing
const defaultOption = document.createElement('option');
defaultOption.value = '';
defaultOption.textContent = 'ជំពូកទាំងអស់';
selDept.appendChild(defaultOption);

DEPTS.forEach(d => {
  const option = document.createElement('option');
  option.value = d.department_id;
  option.textContent = d.department_name || '';
  selDept.appendChild(option);
});
```

## Priority 2: Weak Password Generation in Cloud Functions

### Issue
Cloud Functions use `Math.random()` for password generation, which is not cryptographically secure.

### Affected File
- `functions/index.js` (line 44)

### Solution

**Before (Insecure)**:
```javascript
const tmp = (Math.random().toString(36)+Math.random().toString(36)).slice(2, 18);
```

**After (Secure)**:
```javascript
const crypto = require('crypto');

// Generate a cryptographically secure random password
function generateSecurePassword(length = 16) {
  return crypto.randomBytes(length).toString('hex').slice(0, length);
}

// In the function
const tmp = generateSecurePassword(16); // 16 character secure password
```

### Implementation
```javascript
// functions/index.js
const functions = require('firebase-functions');
const admin    = require('firebase-admin');
const crypto   = require('crypto'); // Add this

admin.initializeApp();

// Add helper function
function generateSecurePassword(length = 16) {
  // Generate random bytes and convert to base64, then clean up
  return crypto.randomBytes(Math.ceil(length * 0.75))
    .toString('base64')
    .slice(0, length)
    .replace(/\+/g, '0')  // Replace + with 0
    .replace(/\//g, '1'); // Replace / with 1
}

/** SUPER only: create auth user (optional) */
exports.adminCreateUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const role = String(context.auth.token?.role || '').toLowerCase();
  if (role !== 'super') throw new functions.https.HttpsError('permission-denied', 'SUPER only.');

  const email = String(data?.email || '');
  const displayName = String(data?.displayName || '');
  if (!email) throw new functions.https.HttpsError('invalid-argument', 'email required');

  const tmp = generateSecurePassword(16); // SECURE: Use crypto instead of Math.random()
  
  try {
    const u = await admin.auth().createUser({ 
      email, 
      password: tmp, 
      displayName: displayName || undefined 
    });
    return { ok: true, uid: u.uid };
  } catch (e) {
    console.error('adminCreateUser failed:', e);
    throw new functions.https.HttpsError('internal', e.message || 'createUser failed');
  }
});
```

## Priority 3: Input Validation Enhancement

### Issue
Missing comprehensive input validation on both client and server side.

### Solution

#### Server-Side (Cloud Functions)

```javascript
// functions/index.js

// Add validation helpers
const validators = {
  email: (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  },
  
  password: (password) => {
    // At least 8 chars, with at least one letter and one number
    return password.length >= 8 && 
           /[a-zA-Z]/.test(password) && 
           /[0-9]/.test(password);
  },
  
  uid: (uid) => {
    // Firebase UIDs are alphanumeric and 28 characters
    return typeof uid === 'string' && uid.length > 0 && uid.length <= 128;
  }
};

// Update adminSetPassword with validation
exports.adminSetPassword = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  
  const role = String(context.auth.token?.role || '').toLowerCase();
  if (role !== 'super') {
    throw new functions.https.HttpsError('permission-denied', 'SUPER only.');
  }

  const newPassword = String(data?.newPassword || '');
  
  // Enhanced password validation
  if (!validators.password(newPassword)) {
    throw new functions.https.HttpsError(
      'invalid-argument', 
      'Password must be at least 8 characters with letters and numbers.'
    );
  }

  let uid = String(data?.uid || '').trim();
  const email = String(data?.email || '').trim();
  
  try {
    if (!uid) {
      if (!email || !validators.email(email)) {
        throw new Error('Valid email or uid required');
      }
      const u = await admin.auth().getUserByEmail(email);
      uid = u.uid;
    }
    
    if (!validators.uid(uid)) {
      throw new Error('Invalid user ID format');
    }
    
    await admin.auth().updateUser(uid, { password: newPassword });
    return { ok: true, uid };
  } catch (e) {
    console.error('adminSetPassword failed:', e);
    throw new functions.https.HttpsError('internal', e.message || 'updateUser failed');
  }
});
```

#### Client-Side (Form Validation)

```javascript
// assets/js/validation.js (new file)

export const validators = {
  required: (value) => {
    return value != null && String(value).trim().length > 0;
  },
  
  email: (value) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(String(value).trim());
  },
  
  minLength: (value, min) => {
    return String(value).length >= min;
  },
  
  maxLength: (value, max) => {
    return String(value).length <= max;
  },
  
  number: (value) => {
    return !isNaN(Number(value));
  },
  
  positiveNumber: (value) => {
    const num = Number(value);
    return !isNaN(num) && num >= 0;
  }
};

export function validateForm(formData, rules) {
  const errors = {};
  
  for (const [field, fieldRules] of Object.entries(rules)) {
    const value = formData[field];
    
    for (const rule of fieldRules) {
      if (!rule.validate(value)) {
        errors[field] = rule.message;
        break;
      }
    }
  }
  
  return {
    isValid: Object.keys(errors).length === 0,
    errors
  };
}

// Usage example:
// const validation = validateForm(formData, {
//   email: [
//     { validate: validators.required, message: 'Email is required' },
//     { validate: validators.email, message: 'Invalid email format' }
//   ],
//   password: [
//     { validate: validators.required, message: 'Password is required' },
//     { validate: (v) => validators.minLength(v, 8), message: 'Password must be at least 8 characters' }
//   ]
// });
```

## Testing the Fixes

### Manual Testing Checklist

1. **XSS Prevention Testing**
   - [ ] Try entering `<script>alert('XSS')</script>` in form fields
   - [ ] Verify it displays as text, not executed as code
   - [ ] Test with other payloads: `<img src=x onerror=alert('XSS')>`
   - [ ] Check all data display areas (tables, cards, labels)

2. **Password Security Testing**
   - [ ] Create multiple new users and verify unique passwords
   - [ ] Verify password meets strength requirements
   - [ ] Test password reset functionality

3. **Input Validation Testing**
   - [ ] Submit forms with empty required fields
   - [ ] Submit invalid email formats
   - [ ] Submit invalid data types
   - [ ] Check error messages display correctly

## Deployment Steps

1. **Backup Current System**
   ```bash
   # Export Firestore data
   firebase firestore:export gs://your-bucket/backups/$(date +%Y%m%d)
   ```

2. **Update Code**
   - Apply fixes to all affected files
   - Test locally with Firebase emulators

3. **Deploy Functions First**
   ```bash
   cd functions
   npm install  # Ensure crypto is available (built-in)
   firebase deploy --only functions
   ```

4. **Deploy Frontend**
   ```bash
   firebase deploy --only hosting
   ```

5. **Verify in Production**
   - Test key user flows
   - Monitor Firebase Console for errors
   - Check Cloud Functions logs

## Monitoring

After deployment, monitor:
- Firebase Functions logs for errors
- User reports of issues
- Security scanning results
- Performance metrics

---

**Document Version**: 1.0
**Last Updated**: 2025-11-10
