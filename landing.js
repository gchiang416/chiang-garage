import { isAuthorizedUser, signIn, signOutUser, watchAuth } from './firebase-sync.js?v=20261006-0001';

const authGate = document.querySelector('#landingAuthGate');
const garageShell = document.querySelector('#garageShell');
const loginForm = document.querySelector('#landingLoginForm');
const loginError = document.querySelector('#landingLoginError');
const account = document.querySelector('#landingAccount');
const signOutButton = document.querySelector('#landingSignOut');

const friendlyAuthError = error => {
  const code = error?.code || '';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'That email or password is not correct.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  if (code.includes('network-request-failed')) return 'Firebase could not be reached. Check your internet connection.';
  return 'Sign-in could not be completed. Check the account and try again.';
};

loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  const submit = loginForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  submit.textContent = 'Signing in…';
  try {
    await signIn(document.querySelector('#landingEmail').value.trim(), document.querySelector('#landingPassword').value);
    document.querySelector('#landingPassword').value = '';
  } catch (error) {
    loginError.textContent = friendlyAuthError(error);
  } finally {
    submit.disabled = false;
    submit.textContent = 'Sign in';
  }
});

watchAuth(async user => {
  if (!user) {
    authGate.hidden = false;
    garageShell.hidden = true;
    account.textContent = '';
    return;
  }
  if (!isAuthorizedUser(user)) {
    loginError.textContent = 'This account does not have access to The Chiang Garage.';
    await signOutUser();
    return;
  }
  account.textContent = user.email || '';
  authGate.hidden = true;
  garageShell.hidden = false;
});

signOutButton.addEventListener('click', async () => {
  signOutButton.disabled = true;
  signOutButton.textContent = 'Signing out…';
  try {
    await signOutUser();
  } finally {
    signOutButton.disabled = false;
    signOutButton.textContent = 'Sign out';
  }
});
