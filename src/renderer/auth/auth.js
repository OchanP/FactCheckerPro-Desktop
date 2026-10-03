// FactChecker Pro Desktop — Auth Window Script
// Ported from the extension's auth/auth.js. fc.runtime.sendMessage() and
// fc.tabs.create() calls are unchanged — they're now backed by the
// preload shim (src/preload/preload.js) instead of real chrome.* APIs.

function switchTab(tab) {
  document.getElementById('tab-login').classList.toggle('active', tab === 'login');
  document.getElementById('tab-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-login').classList.toggle('active', tab === 'login');
  document.getElementById('form-register').classList.toggle('active', tab === 'register');
  document.getElementById('form-forgot').classList.toggle('active', tab === 'forgot');
  hideMessages();
  if (tab === 'register') {
    setTimeout(() => { document.getElementById('score-preview').style.display = 'block'; }, 300);
  }
}

function showError(msg) {
  const el = document.getElementById('error-msg');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('success-msg').style.display = 'none';
}

function showSuccess(msg) {
  const el = document.getElementById('success-msg');
  el.textContent = msg; el.style.display = 'block';
  document.getElementById('error-msg').style.display = 'none';
}

function hideMessages() {
  document.getElementById('error-msg').style.display = 'none';
  document.getElementById('success-msg').style.display = 'none';
}

// ── Google Sign-In (Electron) ─────────────────────────────────────────────────
// Opens a BrowserWindow to the Google OAuth consent page. Electron intercepts
// the redirect before it leaves the process, extracts the access token, and
// sends it to our Railway backend which creates/finds the account and returns
// a JWT pair. No password needed — Google guarantees the identity.
async function handleGoogleAuth() {
  const allBtns = document.querySelectorAll('.btn-google');
  allBtns.forEach(b => { b.disabled = true; b.style.opacity = '0.7'; });
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_GOOGLE_AUTH' });
    if (result && result.ok) {
      showSuccess(`Welcome, ${result.user.displayName}! Opening your dashboard...`);
      setTimeout(() => fc.tabs.create({ url: fc.runtime.getURL('dashboard/dashboard.html') }), 1000);
    } else {
      showError((result && result.error) || 'Google sign-in failed. Please try again.');
    }
  } catch (e) {
    showError('Google sign-in failed: ' + (e.message || 'unknown error'));
  } finally {
    allBtns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
  }
}

async function handleLogin() {
  const login = document.getElementById('login-input').value.trim();
  const password = document.getElementById('login-password').value;
  const rememberMe = document.getElementById('remember-me')?.checked || false;
  if (!login || !password) return showError('Please fill in all fields.');
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in...';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_AUTH_LOGIN', login, password, rememberMe });
    if (result && result.ok) {
      showSuccess('Signed in! Opening your dashboard...');
      setTimeout(() => fc.tabs.create({ url: fc.runtime.getURL('dashboard/dashboard.html') }), 900);
    } else {
      showError((result && result.data && result.data.error) || 'Invalid credentials. Please try again.');
    }
  } catch (e) {
    showError('Cannot reach the FactChecker Pro server. Check your connection and try again.');
  }
  btn.disabled = false; btn.textContent = 'Sign In';
}

async function handleRegister() {
  const display_name = document.getElementById('reg-display').value.trim();
  const username = document.getElementById('reg-username').value.trim().replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!username || !email || !password) return showError('Please fill in all required fields.');
  if (password.length < 8) return showError('Password must be at least 8 characters.');
  if (username.length < 3) return showError('Username must be at least 3 characters.');
  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.textContent = 'Creating account...';
  try {
    const result = await fc.runtime.sendMessage({
      type: 'FC_AUTH_REGISTER',
      userData: { username, email, password, display_name: display_name || username }
    });
    if (result && result.ok) {
      showSuccess('Welcome, ' + result.data.user.display_name + '! Your transparency score starts at 60. Opening dashboard...');
      setTimeout(() => fc.tabs.create({ url: fc.runtime.getURL('dashboard/dashboard.html') }), 1200);
    } else {
      const errors = result && result.data && result.data.errors;
      showError(errors ? errors.map(function(e) { return e.msg; }).join(', ') : ((result && result.data && result.data.error) || 'Registration failed.'));
    }
  } catch (e) {
    showError('Cannot reach the FactChecker Pro server. Check your connection and try again.');
  }
  btn.disabled = false; btn.textContent = 'Create Account & Start Earning';
}

async function handleForgotPassword() {
  const email = document.getElementById('forgot-email').value.trim();
  if (!email) return showError('Please enter your email address.');
  const btn = document.getElementById('forgot-btn');
  btn.disabled = true; btn.textContent = 'Sending...';
  try {
    const result = await fc.runtime.sendMessage({ type: 'FC_AUTH_FORGOT_PASSWORD', email });
    showSuccess((result && result.data && result.data.message) || 'If that email exists, a reset link has been sent.');
    document.getElementById('forgot-email').value = '';
  } catch (e) {
    showError('Cannot reach the server. Please try again.');
  }
  btn.disabled = false; btn.textContent = 'Send Reset Link';
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('tab-login').addEventListener('click', function() { switchTab('login'); });
  document.getElementById('tab-register').addEventListener('click', function() { switchTab('register'); });
  document.getElementById('link-to-register').addEventListener('click', function(e) {
    e.preventDefault(); switchTab('register');
  });

  document.getElementById('link-forgot').addEventListener('click', function(e) {
    e.preventDefault(); switchTab('forgot');
  });
  document.getElementById('link-back-login').addEventListener('click', function(e) {
    e.preventDefault(); switchTab('login');
  });

  document.getElementById('google-login-btn').addEventListener('click', handleGoogleAuth);
  document.getElementById('google-register-btn').addEventListener('click', handleGoogleAuth);
  document.getElementById('login-btn').addEventListener('click', handleLogin);
  document.getElementById('register-btn').addEventListener('click', handleRegister);
  document.getElementById('forgot-btn').addEventListener('click', handleForgotPassword);

  document.getElementById('reg-username').addEventListener('input', function() {
    this.value = this.value.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 30);
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
      var activeForm = document.querySelector('.form-section.active');
      if (activeForm) {
        if (activeForm.id === 'form-login') handleLogin();
        else if (activeForm.id === 'form-register') handleRegister();
        else if (activeForm.id === 'form-forgot') handleForgotPassword();
      }
    }
  });

  // Pre-fill saved email and tick "Remember me" if we have a saved email
  fc.runtime.sendMessage({ type: 'FC_GET_API_USER' }).then(function(result) {
    if (result && result.isLoggedIn) {
      showSuccess('You are already signed in! Opening dashboard...');
      setTimeout(function() {
        fc.tabs.create({ url: fc.runtime.getURL('dashboard/dashboard.html') });
      }, 800);
      return;
    }
    if (result && result.savedEmail) {
      const loginInput = document.getElementById('login-input');
      if (loginInput) loginInput.value = result.savedEmail;
      const rememberBox = document.getElementById('remember-me');
      if (rememberBox) rememberBox.checked = true;
    }
  }).catch(function() {});

  // Show / hide password toggle
  const pwToggle = document.getElementById('pw-toggle-login');
  if (pwToggle) {
    pwToggle.addEventListener('click', function() {
      const pwField = document.getElementById('login-password');
      if (pwField.type === 'password') {
        pwField.type = 'text';
        pwToggle.textContent = '🙈';
      } else {
        pwField.type = 'password';
        pwToggle.textContent = '👁';
      }
    });
  }
});
