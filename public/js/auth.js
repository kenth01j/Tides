// Proposal objective: role-based access for LGU administrators, staff, and enforcement officers.
(() => {
  const USER_KEY = 'tidesUser';
  localStorage.removeItem('tidesToken');

  async function api(url, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
    const response = await fetch(url, { ...options, headers });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || `Request failed (${response.status}).`);
    return data;
  }

  async function signOut() {
    localStorage.removeItem(USER_KEY);
    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) throw new Error(`Logout failed (${response.status}).`);
    } catch (error) {
      console.error('Unable to clear the server sign-in cookie:', error);
    }
    location.href = '/admin-login.html';
  }

  window.Tides = {
    api,
    currentUser: () => {
      try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
    },
    signOut
  };

  document.querySelectorAll('[data-logout]').forEach(button => button.addEventListener('click', signOut));

  const loginForm = document.querySelector('#login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      const notice = document.querySelector('#login-notice');
      const submit = loginForm.querySelector('[type="submit"]');
      notice.textContent = '';
      window.TidesButtonMotion.start(submit);
      try {
        const data = await api('/api/auth/login', {
          method: 'POST',
          body: JSON.stringify({
            email: loginForm.elements.email.value,
            password: loginForm.elements.password.value
          })
        });
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        window.TidesButtonMotion.complete(submit);
        const destination = data.user.mustChangePassword
          ? '/password.html?required=1'
          : data.user.role === 'enforcement' ? '/enforcement.html' : '/admin.html';
        window.setTimeout(() => { location.href = destination; }, 400);
      } catch (error) {
        notice.textContent = error.message;
        window.TidesButtonMotion.fail(submit);
      }
    });
  }

  const passwordForm = document.querySelector('#password-form');
  if (passwordForm) {
    passwordForm.addEventListener('submit', async event => {
      event.preventDefault();
      const notice = document.querySelector('#password-notice');
      notice.textContent = '';
      try {
        const values = Object.fromEntries(new FormData(passwordForm).entries());
        const result = await api('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify(values)
        });
        const user = window.Tides.currentUser();
        if (user) {
          user.mustChangePassword = false;
          localStorage.setItem(USER_KEY, JSON.stringify(user));
        }
        passwordForm.reset();
        notice.textContent = result.message;
        notice.className = 'notice success';
        if (new URLSearchParams(location.search).get('required') === '1') {
          location.href = user && user.role === 'enforcement' ? '/enforcement.html' : '/admin.html';
        }
      } catch (error) {
        notice.textContent = error.message;
        notice.className = 'notice';
      }
    });
  }

  const protectedPage = document.body.dataset.role;
  if (protectedPage) {
    const user = window.Tides.currentUser();
    if (!user || (protectedPage === 'admin' && !['admin', 'staff'].includes(user.role)) ||
        (protectedPage === 'enforcement' && !['admin', 'staff', 'enforcement'].includes(user.role))) {
      location.replace('/admin-login.html');
    } else if (user.mustChangePassword && location.pathname !== '/password.html') {
      location.replace('/password.html?required=1');
    }
  }
})();
