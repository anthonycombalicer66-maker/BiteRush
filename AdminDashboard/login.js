'use strict';

const adminSessionKey = 'biterushAdminLoggedIn';
const adminIdentityKey = 'biterushAdminIdentity';
const loginAttemptsKey = 'biterushAdminLoginAttempts';
const adminLoginForm = document.getElementById('adminLoginForm');
const loginError = document.getElementById('loginError');

const accounts = [
    { username: 'Gabgabb', password: 'gabgab192208', role: 'Admin', name: 'Gabriel' },
    { username: 'Joezyl', password: 'joe12345', role: 'Staff', name: 'Joezyl' }
];

adminLoginForm.addEventListener('submit', event => {
    event.preventDefault();
    const username = document.getElementById('adminUsername').value.trim();
    const password = document.getElementById('adminPassword').value;
    let attempts;
    try {
        attempts = JSON.parse(localStorage.getItem(loginAttemptsKey) || '{"count":0,"lockedUntil":0}');
    } catch {
        attempts = { count: 0, lockedUntil: 0 };
    }

    if (Number(attempts.lockedUntil) > Date.now()) {
        const seconds = Math.ceil((Number(attempts.lockedUntil) - Date.now()) / 1000);
        loginError.textContent = `Too many attempts. Try again in ${seconds} seconds.`;
        return;
    }

    const account = accounts.find(entry =>
        entry.username.toLocaleLowerCase() === username.toLocaleLowerCase()
        && entry.password === password
    );
    if (account) {
        localStorage.removeItem(loginAttemptsKey);
        localStorage.setItem(adminSessionKey, 'true');
        localStorage.setItem(adminIdentityKey, JSON.stringify({
            username: account.username,
            name: account.name,
            role: account.role
        }));
        window.location.href = 'dashboard.html';
        return;
    }

    attempts.count = Number(attempts.count || 0) + 1;
    if (attempts.count >= 5) {
        attempts.lockedUntil = Date.now() + 15 * 60 * 1000;
        loginError.textContent = 'Too many failed attempts. Sign in is temporarily locked for 15 minutes.';
    } else {
        loginError.textContent = `Invalid username or password. ${5 - attempts.count} attempts remaining.`;
    }
    localStorage.setItem(loginAttemptsKey, JSON.stringify(attempts));
});
