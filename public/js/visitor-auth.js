// Proposal objective: provide visitor registration and login independently from staff access.
(() => {
  const loginForm = document.querySelector('#visitor-login-form');
  const registerForm = document.querySelector('#visitor-register-form');
  if (!loginForm || !registerForm) return;

  const params = new URLSearchParams(location.search);
  const nextPath = params.get('next');
  const safeNextPath = (() => {
    if (!nextPath) return null;
    try {
      const url = new URL(nextPath, location.origin);
      if (url.origin !== location.origin ||
          !['/book.html', '/my-bookings.html', '/payment.html'].includes(url.pathname)) return null;
      return `${url.pathname}${url.search}${url.hash}`;
    } catch {
      return null;
    }
  })();

  function setMode(mode) {
    const registering = mode === 'register';
    loginForm.hidden = registering;
    registerForm.hidden = !registering;
    document.querySelector('#visitor-auth-title').textContent = registering ? 'Create your account' : 'Visitor login';
    document.querySelector('#visitor-auth-switch-copy').textContent = registering ? 'Already have an account?' : 'New here?';
    const button = document.querySelector('#visitor-auth-switch');
    button.textContent = registering ? 'Sign in' : 'Create an account';
    button.dataset.authMode = registering ? 'login' : 'register';
  }

  document.querySelector('#visitor-auth-switch').addEventListener('click', event => {
    setMode(event.currentTarget.dataset.authMode);
  });

  async function submitAccountForm(form, mode) {
    const notice = form.querySelector('.notice');
    const submit = form.querySelector('[type="submit"]');
    notice.textContent = '';
    window.TidesButtonMotion.start(submit);
    try {
      const response = await fetch(`/api/visitors/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      const data = await response.json();
      if (!response.ok) {
        const firstError = Array.isArray(data.errors) && data.errors[0];
        throw new Error(firstError ? firstError.message : data.message || 'Account access could not be completed.');
      }
      window.TidesButtonMotion.complete(submit);
      window.setTimeout(() => {
        location.href = safeNextPath || (mode === 'register' ? '/book.html' : '/my-bookings.html');
      }, 350);
    } catch (error) {
      notice.textContent = error.message;
      window.TidesButtonMotion.fail(submit);
    }
  }

  loginForm.addEventListener('submit', event => {
    event.preventDefault();
    submitAccountForm(loginForm, 'login');
  });
  registerForm.addEventListener('submit', event => {
    event.preventDefault();
    submitAccountForm(registerForm, 'register');
  });

  fetch('/api/visitors/me')
    .then(async response => {
      if (response.status === 401) return null;
      const data = await response.json();
      if (!response.ok) throw new Error(data.message || 'Visitor account could not be checked.');
      return data;
    })
    .then(data => {
      if (data) location.replace(safeNextPath || '/my-bookings.html');
    })
    .catch(error => {
      document.querySelector('#visitor-login-notice').textContent = error.message;
    });
})();
