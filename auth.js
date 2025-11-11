// auth.js — handles parsing Google credential and managing `current_user` in localStorage
// This file is intentionally simple: it decodes the JWT returned by Google Identity Services
// and stores a small user object in localStorage under the key `current_user`.

// Parse a JWT (no verification) to extract payload as JSON
function parseJwt(token){
  try{
    const payload = token.split('.')[1];
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(atob(base64).split('').map(function(c){
      return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
    return JSON.parse(json);
  }catch(e){
    console.error('Failed to parse JWT', e);
    return null;
  }
}

// Called by Google Identity Services when the user signs in
// `response.credential` is a JWT that contains basic user info: sub (id), name, email, picture
function handleCredentialResponse(response){
  const payload = parseJwt(response.credential);
  if(!payload){
    alert('Sign in failed: could not parse credential.');
    return;
  }

  // Simplified user object we store locally
  const user = {
    id: payload.sub,
    name: payload.name || payload.email || 'User',
    email: payload.email || '',
    picture: payload.picture || ''
  };

  // Save current user and ensure per-user storage exists
  localStorage.setItem('current_user', JSON.stringify(user));

  // If there's no storage for this user yet, create a default structure
  const userKey = `todo_user_${user.id}`;
  if(!localStorage.getItem(userKey)){
    const initial = { tasks: [], settings: { theme: 'light' } };
    localStorage.setItem(userKey, JSON.stringify(initial));
  }

  // Redirect to the app
  window.location.href = 'index.html';
}

// Get the current user (or null)
function getCurrentUser(){
  const raw = localStorage.getItem('current_user');
  try{ return raw ? JSON.parse(raw) : null }catch(e){ return null }
}

// Sign out locally (clears current_user). If the Google API is loaded, try to revoke auto select too.
function signOut(){
  const user = getCurrentUser();
  if(user && user.id && typeof google !== 'undefined' && google.accounts && google.accounts.id){
    // Attempt to disable auto sign-in selection.
    try{ google.accounts.id.disableAutoSelect(); }catch(e){ /* ignore */ }
  }

  // Remove current_user and switch to a small guest identity (so app keeps working without a login page)
  localStorage.removeItem('current_user');
  const guest = { id: 'guest_' + Date.now(), name: 'Guest', email: '', picture: '' };
  localStorage.setItem('current_user', JSON.stringify(guest));
  // reload app
  window.location.href = 'index.html';
}

// Expose functions for other scripts
window.auth = {
  handleCredentialResponse,
  getCurrentUser,
  signOut
};

// Provide global callback if google identity library calls it (harmless if not present)
if(typeof window !== 'undefined'){
  window.handleCredentialResponse = handleCredentialResponse;
}
