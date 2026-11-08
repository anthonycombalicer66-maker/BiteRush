(function () {
  'use strict';

  const accountsKey = 'biterush_demo_accounts';
  const sessionKey = 'biterush_demo_authenticated';
  const iterations = 210000;

  function setMessage(id, text) {
    const message = document.getElementById(id);
    if (!message) return;
    message.textContent = text;
    message.hidden = !text;
  }

  function defaultProfileImage() {
    return "data:image/svg+xml;charset=UTF-8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 160'%3E%3Crect width='160' height='160' rx='80' fill='%23f5c430'/%3E%3Ccircle cx='80' cy='62' r='26' fill='%23ffffff'/%3E%3Cpath d='M43 122c8-20 27-32 37-32s29 12 37 32' fill='%23ffffff'/%3E%3C/svg%3E";
  }

  function readAccounts() {
    const stored = localStorage.getItem(accountsKey);
    if (!stored) return [];
    const accounts = JSON.parse(stored);
    if (!Array.isArray(accounts) || accounts.some(account =>
      !account ||
      typeof account.email !== 'string' ||
      typeof account.username !== 'string' ||
      typeof account.fullname !== 'string' ||
      typeof account.salt !== 'string' ||
      !/^(?:[0-9a-f]{2}){16}$/i.test(account.salt) ||
      typeof account.passwordHash !== 'string' ||
      !/^[0-9a-f]{64}$/i.test(account.passwordHash) ||
      (account.profileImage !== undefined && typeof account.profileImage !== 'string')
    )) {
      throw new Error('Saved account data is invalid. Clear this site’s local storage and try again.');
    }
    return accounts;
  }

  function requireCrypto() {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
      throw new Error('Account registration and sign-in require a secure browser context. Open the site over HTTPS or localhost.');
    }
  }

  function toHex(bytes) {
    return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function derivePasswordHash(password, salt) {
    const key = await window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const bits = await window.crypto.subtle.deriveBits(
      { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
      key,
      256
    );
    return toHex(bits);
  }

  function hashesMatch(first, second) {
    if (first.length !== second.length) return false;
    let difference = 0;
    for (let index = 0; index < first.length; index += 1) {
      difference |= first.charCodeAt(index) ^ second.charCodeAt(index);
    }
    return difference === 0;
  }

  function startSession(account) {
    const profileImage = typeof account.profileImage === 'string' && account.profileImage
      ? account.profileImage
      : defaultProfileImage();

    localStorage.setItem('username', account.username);
    localStorage.setItem('fullname', account.fullname);
    localStorage.setItem('email', account.email);
    localStorage.setItem('biterush_profile_image', profileImage);
    localStorage.setItem(sessionKey, account.email);
  }

  function showStorageError(id, error) {
    if (error instanceof DOMException && error.name === 'QuotaExceededError') {
      setMessage(id, 'This browser is out of storage space. Free space and try again.');
      return;
    }
    setMessage(id, error && error.message ? error.message : 'The browser could not save your account. Check storage permissions and try again.');
  }

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
    loginForm.addEventListener('submit', async event => {
      event.preventDefault();
      setMessage('auth-message', '');
      const button = loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        requireCrypto();
        const identity = document.getElementById('login-identity').value.trim().toLowerCase();
        const password = document.getElementById('login-password').value;
        const account = readAccounts().find(item =>
          item.email === identity || item.username === identity
        );
        if (!account) {
          setMessage('auth-message', 'Username/email or password is incorrect. Create an account if you have not registered in this browser.');
          return;
        }
        const actualHash = await derivePasswordHash(password, Uint8Array.from(
          account.salt.match(/.{2}/g).map(byte => parseInt(byte, 16))
        ));
        if (!hashesMatch(actualHash, account.passwordHash)) {
          setMessage('auth-message', 'Username/email or password is incorrect.');
          return;
        }
        startSession(account);
        window.location.href = '../BiteRushHomePage/index.html';
      } catch (error) {
        showStorageError('auth-message', error);
      } finally {
        button.disabled = false;
      }
    });
  }

  const signupForm = document.getElementById('signup-form');
  if (signupForm) {
    const password = document.getElementById('signup-password');
    const confirmation = document.getElementById('signup-confirm-password');
    const updateConfirmationValidity = () => {
      confirmation.setCustomValidity(
        confirmation.value && confirmation.value !== password.value
          ? 'Passwords do not match.'
          : ''
      );
    };
    password.addEventListener('input', updateConfirmationValidity);
    confirmation.addEventListener('input', updateConfirmationValidity);

    signupForm.addEventListener('submit', async event => {
      event.preventDefault();
      setMessage('signup-message', '');
      updateConfirmationValidity();
      if (!signupForm.reportValidity()) return;

      const button = signupForm.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        requireCrypto();
        const fullname = document.getElementById('signup-name').value.trim();
        const username = document.getElementById('signup-username').value.trim().toLowerCase();
        const email = document.getElementById('signup-email').value.trim().toLowerCase();
        const accounts = readAccounts();
        if (accounts.some(account => account.email === email)) {
          setMessage('signup-message', 'An account with that email already exists in this browser.');
          return;
        }
        if (accounts.some(account => account.username === username)) {
          setMessage('signup-message', 'That username is already in use in this browser.');
          return;
        }

        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const account = {
          fullname,
          username,
          email,
          profileImage: defaultProfileImage(),
          salt: toHex(salt),
          passwordHash: await derivePasswordHash(password.value, salt)
        };
        localStorage.setItem(accountsKey, JSON.stringify([...accounts, account]));
        startSession(account);
        window.location.href = '../BiteRushHomePage/index.html';
      } catch (error) {
        showStorageError('signup-message', error);
      } finally {
        button.disabled = false;
      }
    });
  }

  const toggle = document.querySelector('.toggle-password');
  if (toggle) {
    toggle.addEventListener('click', () => {
      const input = document.getElementById('login-password');
      const icon = toggle.querySelector('i');
      if (!input || !icon) return;
      const visible = input.type === 'text';
      input.type = visible ? 'password' : 'text';
      icon.classList.toggle('fa-eye', visible);
      icon.classList.toggle('fa-eye-slash', !visible);
      toggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
    });
  }
})();
