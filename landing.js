import { signOutUser, watchAuth } from './firebase-sync.js?v=20260929-0001';

const account = document.querySelector('#landingAccount');
const signOutButton = document.querySelector('#landingSignOut');
const signInLink = document.querySelector('#landingSignIn');

watchAuth(user => {
  account.textContent = user?.email || 'Not signed in';
  signOutButton.hidden = !user;
  signInLink.hidden = Boolean(user);
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
