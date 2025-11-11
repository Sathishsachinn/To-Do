// app.js — main To-Do application logic
// Responsibilities:
// - Load the current user and their stored tasks/settings from localStorage (fallback to a guest user)
// - Render tasks and user info
// - Support add/edit/delete/complete tasks
// - Persist changes to localStorage under `todo_user_<userId>`
// - Provide theme toggle (light/dark) saved per-user
// - Add privacy: move tasks to private list and protect with a password stored (hashed) in localStorage

(function(){
  // Initialize EmailJS (defensive: don't throw if library not present)
  if(typeof emailjs !== 'undefined' && emailjs.init){
    try{
      emailjs.init('QTXLp_Scxkf4wLMWw'); // inserted public key
    }catch(e){
      console.warn('EmailJS init failed', e);
    }
  }else{
    console.warn('EmailJS library not loaded; feedback email disabled.');
  }

  // Configure these with your EmailJS values if you want automatic sending
  const EMAILJS_SERVICE_ID = 'service_kmhmdd9';
  const EMAILJS_TEMPLATE_ID = 'template_u7hyyqd';

  // Helper: ensure a current user (fall back to a guest user instead of redirecting to a login page)
  function ensureCurrentUser(){
    let user = auth.getCurrentUser();
    if(!user){
      user = { id: 'guest_' + Date.now(), name: 'Guest', email: '', picture: '' };
      localStorage.setItem('current_user', JSON.stringify(user));
    }
    return user;
  }

  function getStorage(){
    const user = ensureCurrentUser();
    const key = `todo_user_${user.id}`;
    const raw = localStorage.getItem(key);
    if(!raw){
      const init = { tasks: [], privateTasks: [], settings: { theme: 'light' } };
      localStorage.setItem(key, JSON.stringify(init));
      return init;
    }
    try{ 
      const parsed = JSON.parse(raw);
      // ensure privateTasks exists for older versions
      if(!parsed.privateTasks) parsed.privateTasks = [];
      if(!parsed.settings) parsed.settings = { theme: 'light' };
      return parsed;
    }catch(e){
      console.error('Failed to parse storage for user', e);
      return { tasks: [], privateTasks: [], settings: { theme: 'light' } };
    }
  }

  function saveStorage(data){
    const user = ensureCurrentUser();
    const key = `todo_user_${user.id}`;
    const toSave = Object.assign({}, data);
    // If encryption key is available, do not write plaintext privateTasks to storage.
    if(privacyCryptoKey){
      try{
        // remove plaintext from snapshot
        toSave.privateTasks = [];
        // write snapshot without plaintext (encrypted payload will be written once ready)
        localStorage.setItem(key, JSON.stringify(toSave));
        // async encrypt and persist encrypted blob
        (async ()=>{
          try{
            const enc = await encryptPrivateTasksWithKey(privacyCryptoKey, data.privateTasks || []);
            toSave.encryptedPrivate = enc;
            localStorage.setItem(key, JSON.stringify(toSave));
          }catch(e){ console.error('Failed to encrypt privateTasks during save', e); }
        })();
        return;
      }catch(e){ console.warn('saveStorage encryption path failed', e); }
    }
    // Default: persist entire state
    localStorage.setItem(key, JSON.stringify(toSave));
  }

  // DOM refs
  const taskList = document.getElementById('taskList');
  const privateList = document.getElementById('privateList');
  const privacyToggleBtn = document.getElementById('privacyToggleBtn');
  const setPrivacyPwdBtn = document.getElementById('setPrivacyPwdBtn');
  const privateLockedNotice = document.getElementById('privateLockedNotice');
  const privacyModal = document.getElementById('privacyModal');
  const privacyModalClose = document.getElementById('privacyModalClose');
  const privacyPwdInput = document.getElementById('privacyPwdInput');
  const privacyUnlockBtn = document.getElementById('privacyUnlockBtn');
  const privacyChangeToggle = document.getElementById('privacyChangeToggle');
  const privacyChangeArea = document.getElementById('privacyChangeArea');
  const privacyCurrentInput = document.getElementById('privacyCurrentInput');
  const privacyNewInput = document.getElementById('privacyNewInput');
  const privacyConfirmNewInput = document.getElementById('privacyConfirmNewInput');
  const privacyChangeConfirmBtn = document.getElementById('privacyChangeConfirmBtn');
  const privacyCancelBtn = document.getElementById('privacyCancelBtn');
  const privacyResetBtn = document.getElementById('privacyResetBtn');
  const privacyResetArea = document.getElementById('privacyResetArea');
  const privacyResetCancel = document.getElementById('privacyResetCancel');
  const privacyResetMove = document.getElementById('privacyResetMove');
  const privacyResetDelete = document.getElementById('privacyResetDelete');
  const searchInput = document.getElementById('searchInput');

  const addForm = document.getElementById('addForm');
  const taskInput = document.getElementById('taskInput');
  const filterSel = document.getElementById('filterSel');
  const stats = document.getElementById('stats');
  const clearCompleted = document.getElementById('clearCompleted');
  const clearAll = document.getElementById('clearAll');
  const userName = document.getElementById('userName');
  const userEmail = document.getElementById('userEmail');
  const userPic = document.getElementById('userPic');
  const signOutBtn = document.getElementById('signOutBtn');
  const themeToggle = document.getElementById('themeToggle');
  const exportBtn = document.getElementById('exportBtn');
  const importBtn = document.getElementById('importBtn');
  const importFile = document.getElementById('importFile');
  const viewFeedbackBtn = document.getElementById('viewFeedbackBtn');
  const feedbackAdminModal = document.getElementById('feedbackAdminModal');
  const feedbackList = document.getElementById('feedbackList');
  const closeFeedbackAdminBtn = document.getElementById('closeFeedbackAdminBtn');
  const clearFeedbacksBtn = document.getElementById('clearFeedbacksBtn');

  let state = getStorage();

  // Migrate global privacy hash into per-user storage if present (preserve existing users)
  try{
    const globalHash = localStorage.getItem('todo_privacy_hash');
    if(globalHash && !state.privacyHash){
      state.privacyHash = globalHash;
      localStorage.removeItem('todo_privacy_hash');
      saveStorage(state);
    }
  }catch(e){ /* ignore */ }

  // Privacy state
  let privacyUnlocked = false; // when true, private list is visible/editable
  // In-memory CryptoKey when unlocked and encryption is enabled
  let privacyCryptoKey = null;

  // Apply saved theme
  function applyTheme(theme){
    if(theme === 'dark') document.documentElement.setAttribute('data-theme','dark');
    else document.documentElement.removeAttribute('data-theme');
  }
  applyTheme(state.settings.theme || 'light');

  // Render user info
  const current = ensureCurrentUser();
  userName.textContent = current.name || 'User';
  userEmail.textContent = current.email || '';
  if(current.picture) userPic.src = current.picture; else userPic.style.display = 'none';

  // Utilities
  function uid(){ return 't_' + Math.random().toString(36).slice(2,9) }

  // Search query state
  let searchQuery = '';

  // Simple SHA-256 hashing helper (returns hex)
  async function hashPwd(text){
    const enc = new TextEncoder();
    const data = enc.encode(text);
    const hash = await crypto.subtle.digest('SHA-256', data);
    const arr = Array.from(new Uint8Array(hash));
    return arr.map(b => b.toString(16).padStart(2,'0')).join('');
  }

  // --- Encryption helpers (AES-GCM) ---
  function bufToBase64(buf){
    return btoa(String.fromCharCode.apply(null, new Uint8Array(buf)));
  }
  function base64ToBuf(b64){
    const str = atob(b64);
    const buf = new Uint8Array(str.length);
    for(let i=0;i<str.length;i++) buf[i] = str.charCodeAt(i);
    return buf.buffer;
  }

  async function deriveKeyFromPassword(password, saltB64){
    const saltBuf = base64ToBuf(saltB64);
    const enc = new TextEncoder();
    const pwKey = await crypto.subtle.importKey('raw', enc.encode(password), {name:'PBKDF2'}, false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2', salt: saltBuf, iterations: 150000, hash: 'SHA-256'}, pwKey, {name:'AES-GCM', length:256}, false, ['encrypt','decrypt']);
    return key;
  }

  async function encryptPrivateTasksWithKey(key, tasks){
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const data = new TextEncoder().encode(JSON.stringify(tasks || []));
    const cipher = await crypto.subtle.encrypt({name:'AES-GCM', iv}, key, data);
    return { iv: bufToBase64(iv.buffer), data: bufToBase64(cipher) };
  }

  async function decryptPrivateTasksWithKey(key, encrypted){
    if(!encrypted || !encrypted.data) return [];
    const iv = base64ToBuf(encrypted.iv);
    const cipherBuf = base64ToBuf(encrypted.data);
    const plain = await crypto.subtle.decrypt({name:'AES-GCM', iv:new Uint8Array(iv)}, key, cipherBuf);
    const txt = new TextDecoder().decode(plain);
    return JSON.parse(txt || '[]');
  }

  // Privacy helpers
  function hasPrivacyHash(){
    return !!(state && state.privacyHash);
  }

  async function setPrivacyPassword(){
    // Prompt user for new password, store per-user hash, create salt and encrypt existing private tasks
    const p1 = prompt('Set a privacy password (will be required to view private tasks):');
    if(p1 === null) return false;
    if(p1.length < 4){ alert('Password should be at least 4 characters.'); return false; }
    const p2 = prompt('Confirm privacy password:');
    if(p1 !== p2){ alert('Passwords do not match.'); return false; }
    const h = await hashPwd(p1);
    // generate salt for key derivation
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const saltB64 = bufToBase64(salt.buffer);
    // derive key and encrypt any existing privateTasks
    const key = await deriveKeyFromPassword(p1, saltB64);
    privacyCryptoKey = key;
    // encrypt and persist via saveStorage
    state.privacyHash = h;
    state.privacySalt = saltB64;
    // If there are existing privateTasks, they will be encrypted by saveStorage's async step
    saveStorage(state);
    alert('Privacy password set. Private tasks will now be protected.');
    // Reset locked state and update UI
    privacyUnlocked = false;
    updatePrivacyControls();
    return true;
  }

  async function checkPrivacyPassword(entered){
    if(!entered) return false;
    const stored = state && state.privacyHash;
    if(!stored) return false;
    const h = await hashPwd(entered);
    return h === stored;
  }

  // Render functions
  function renderPublicTasks(){
    taskList.innerHTML = '';

    // Filter
    const filter = filterSel.value;
    let tasks = state.tasks.slice();
    // Text search filter
    if(searchQuery){
      tasks = tasks.filter(t => t.text && t.text.toLowerCase().includes(searchQuery));
    }
    if(filter === 'active') tasks = tasks.filter(t => !t.completed);
    if(filter === 'completed') tasks = tasks.filter(t => t.completed);

    if(tasks.length === 0){
      const li = document.createElement('li');
      li.className = 'muted small';
      li.textContent = 'No tasks yet — add your first task!';
      taskList.appendChild(li);
    }

    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item' + (task.completed ? ' completed' : '');

      // color chip
      const chip = document.createElement('div');
      chip.style.width = '12px';chip.style.height='40px';chip.style.borderRadius='8px';chip.style.background=task.color||'var(--accent)';

      const content = document.createElement('div');
      content.className = 'task-content';

      const title = document.createElement('div');
      title.className = 'task-title';
      title.textContent = task.text;
      title.title = 'Double-click to edit';

      const meta = document.createElement('div');
      meta.className = 'task-meta';
      meta.textContent = new Date(task.createdAt).toLocaleString();

      content.appendChild(title);
      content.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'task-actions';

      const editBtn = document.createElement('button');
      editBtn.className = 'btn small secondary';
      editBtn.textContent = 'Edit';

      const delBtn = document.createElement('button');
      delBtn.className = 'btn small light';
      delBtn.textContent = 'Delete';

      const privBtn = document.createElement('button');
      privBtn.className = 'btn small light';
      privBtn.textContent = 'Private';

      actions.appendChild(editBtn);
      actions.appendChild(delBtn);
      actions.appendChild(privBtn);

      li.appendChild(chip);
      li.appendChild(content);
      li.appendChild(actions);

      // Toggle complete on click of the item (except when clicking buttons)
      li.addEventListener('click', (e)=>{
        if(e.target === editBtn || e.target === delBtn || e.target === privBtn) return;
        toggleComplete(task.id);
      });

      editBtn.addEventListener('click',(e)=>{ e.stopPropagation(); editTask(task.id); });
      delBtn.addEventListener('click',(e)=>{ e.stopPropagation(); deleteTask(task.id); });
      privBtn.addEventListener('click',(e)=>{ e.stopPropagation(); makePrivate(task.id); });

      // Double click to edit title
      title.addEventListener('dblclick', (e)=>{ e.stopPropagation(); editTask(task.id); });

      taskList.appendChild(li);
    });
  }

  function renderPrivateTasks(){
    // Show/hide private list depending on unlocked state
    if(!privacyUnlocked){
      privateList.style.display = 'none';
      privateLockedNotice.style.display = 'block';
    } else {
      privateList.style.display = '';
      privateLockedNotice.style.display = 'none';
    }

    privateList.innerHTML = '';
    const tasks = state.privateTasks || [];

    if(tasks.length === 0){
      const li = document.createElement('li');
      li.className = 'muted small';
      li.textContent = 'No private tasks yet.';
      privateList.appendChild(li);
    }

    tasks.forEach(task => {
      const li = document.createElement('li');
      li.className = 'task-item' + (task.completed ? ' completed' : '');

      const chip = document.createElement('div');
      chip.style.width = '12px';chip.style.height='40px';chip.style.borderRadius='8px';chip.style.background=task.color||'var(--accent)';

      const content = document.createElement('div');
      content.className = 'task-content';

      const title = document.createElement('div');
      title.className = 'task-title';
      title.textContent = task.text;

      const meta = document.createElement('div');
      meta.className = 'task-meta';
      meta.textContent = new Date(task.createdAt).toLocaleString();

      content.appendChild(title);
      content.appendChild(meta);

      const actions = document.createElement('div');
      actions.className = 'task-actions';

      const unprivBtn = document.createElement('button');
      unprivBtn.className = 'btn small secondary';
      unprivBtn.textContent = 'Unprivate';

      const delBtn = document.createElement('button');
      delBtn.className = 'btn small light';
      delBtn.textContent = 'Delete';

      actions.appendChild(unprivBtn);
      actions.appendChild(delBtn);

      li.appendChild(chip);
      li.appendChild(content);
      li.appendChild(actions);

      unprivBtn.addEventListener('click', (e)=>{ e.stopPropagation(); makePublic(task.id); });
      delBtn.addEventListener('click', (e)=>{ e.stopPropagation(); deletePrivateTask(task.id); });

      privateList.appendChild(li);
    });
  }

  // Update visibility/text of privacy controls (set password vs lock/unlock)
  function updatePrivacyControls(){
    try{
      if(!setPrivacyPwdBtn || !privacyToggleBtn) return;
      if(!hasPrivacyHash()){
        // No password set yet: show only Set password
        setPrivacyPwdBtn.style.display = '';
        privacyToggleBtn.style.display = 'none';
      }else{
        // Password exists: hide Set password, show Lock/Unlock
        setPrivacyPwdBtn.style.display = 'none';
        privacyToggleBtn.style.display = '';
        privacyToggleBtn.textContent = privacyUnlocked ? 'Lock' : 'Unlock';
      }
    }catch(e){ console.warn('updatePrivacyControls failed', e); }
  }

  function render(){
    renderPublicTasks();
    renderPrivateTasks();

    // Stats
    const total = (state.tasks||[]).length + (state.privateTasks||[]).length;
    const done = ((state.tasks||[]).filter(t => t.completed).length + (state.privateTasks||[]).filter(t => t.completed).length);
    stats.textContent = `${total} task${total!==1?'s':''} • ${done} completed`;
  }

  // Actions
  function addTask(text){
    if(!text || !text.trim()) return;
    const newTask = { id: uid(), text: text.trim(), color: 'var(--accent)', completed: false, createdAt: Date.now() };
    state.tasks.unshift(newTask);
    saveStorage(state); render();
  }

  function toggleComplete(id){
    let t = state.tasks.find(x => x.id===id);
    if(t){ t.completed = !t.completed; saveStorage(state); render(); return; }
    t = (state.privateTasks||[]).find(x => x.id===id);
    if(t){ t.completed = !t.completed; saveStorage(state); render(); }
  }

  function deleteTask(id){
    if(!confirm('Delete this task?')) return;
    state.tasks = state.tasks.filter(x => x.id !== id); saveStorage(state); render();
  }

  function deletePrivateTask(id){
    if(!confirm('Delete this private task?')) return;
    state.privateTasks = (state.privateTasks||[]).filter(x => x.id !== id); saveStorage(state); render();
  }

  function editTask(id){
    let t = state.tasks.find(x => x.id===id);
    if(t){
      const newText = prompt('Edit task text', t.text);
      if(newText === null) return; // cancelled
      t.text = newText.trim() || t.text;
      saveStorage(state); render();
      return;
    }
    t = (state.privateTasks||[]).find(x => x.id===id);
    if(t && privacyUnlocked){
      const newText = prompt('Edit private task text', t.text);
      if(newText === null) return;
      t.text = newText.trim() || t.text;
      saveStorage(state); render();
    }
  }

  async function makePrivate(id){
    // Ensure password exists
    if(!hasPrivacyHash()){
      const created = await setPrivacyPassword();
      if(!created) return; // user cancelled
    }

    const idx = state.tasks.findIndex(x => x.id === id);
    if(idx === -1) return;
    const [task] = state.tasks.splice(idx,1);
    state.privateTasks = state.privateTasks || [];
    state.privateTasks.unshift(task);
    saveStorage(state);
    // Keep private list locked until user explicitly unlocks
    privacyUnlocked = false;
    render();
    // Scroll to privacy panel
    document.getElementById('privacyPanel').scrollIntoView({ behavior: 'smooth' });
  }

  async function makePublic(id){
    const idx = (state.privateTasks||[]).findIndex(x => x.id === id);
    if(idx === -1) return;
    // Require password to unprivate
    if(hasPrivacyHash()){
      const pw = prompt('Enter privacy password to unprivate this task:');
      if(pw === null) return; // cancelled
      const ok = await checkPrivacyPassword(pw);
      if(!ok){ showToast && showToast('Incorrect password', 'error'); return; }
    }
    const [task] = state.privateTasks.splice(idx,1);
    state.tasks.unshift(task);
    saveStorage(state); render();
  }

  // Clear actions
  clearCompleted.addEventListener('click', ()=>{
    if(!confirm('Remove all completed tasks?')) return;
    state.tasks = state.tasks.filter(t => !t.completed);
    state.privateTasks = (state.privateTasks||[]).filter(t => !t.completed);
    saveStorage(state); render();
  });

  clearAll.addEventListener('click', ()=>{
    if(!confirm('Remove ALL tasks? This cannot be undone.')) return;
    state.tasks = [];
    state.privateTasks = [];
    saveStorage(state); render();
  });

  // Form
  addForm.addEventListener('submit', (e)=>{
    e.preventDefault(); addTask(taskInput.value); taskInput.value='';
  });

  // Search input
  if(searchInput){
    searchInput.addEventListener('input', (e)=>{ searchQuery = e.target.value.trim().toLowerCase(); render(); });
  }

  // Export / Import handlers
  if(exportBtn){
    exportBtn.addEventListener('click', ()=>{
      const data = { tasks: state.tasks || [], privateTasks: state.privateTasks || [], settings: state.settings || {} };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `todo_export_${Date.now()}.json`; document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url);
      showToast('Tasks exported', 'success');
    });
  }

  if(importBtn && importFile){
    importBtn.addEventListener('click', ()=> importFile.click());
    importFile.addEventListener('change', (e)=>{
      const f = e.target.files && e.target.files[0];
      if(!f) return;
      const reader = new FileReader();
      reader.onload = (ev)=>{
        try{
          const parsed = JSON.parse(ev.target.result);
          if(!parsed) throw new Error('Invalid JSON');
          if(confirm('Replace existing tasks with imported data? Click Cancel to append instead.')){
            state.tasks = parsed.tasks || [];
            state.privateTasks = parsed.privateTasks || [];
          }else{
            state.tasks = (state.tasks || []).concat(parsed.tasks || []);
            state.privateTasks = (state.privateTasks || []).concat(parsed.privateTasks || []);
          }
          saveStorage(state); render(); showToast('Import complete', 'success');
        }catch(err){
          console.error('Import failed', err); showToast('Import failed: invalid file', 'error');
        }
      };
      reader.readAsText(f);
      e.target.value = '';
    });
  }

  // View feedback admin
  if(viewFeedbackBtn){
    viewFeedbackBtn.addEventListener('click', ()=>{
      const list = JSON.parse(localStorage.getItem('app_feedbacks') || '[]');
      feedbackList.innerHTML = '';
      if(list.length === 0){
        const li = document.createElement('li'); li.className='muted small'; li.textContent = 'No feedback yet.'; feedbackList.appendChild(li);
      }else{
        list.slice().reverse().forEach((f, idx)=>{
          const li = document.createElement('li'); li.style.display='flex'; li.style.justifyContent='space-between'; li.style.alignItems='center';
          const txt = document.createElement('div'); txt.style.flex='1'; txt.innerHTML = `<div class="strong">${f.user||'Guest'}</div><div class="muted small">${new Date(f.timestamp).toLocaleString()}</div><div style="margin-top:6px">${escapeHtml(f.message)}</div>`;
          const del = document.createElement('button'); del.className='btn small light'; del.textContent='Delete';
          del.addEventListener('click', ()=>{
            if(!confirm('Delete this feedback?')) return;
            const all = JSON.parse(localStorage.getItem('app_feedbacks') || '[]');
            all.splice(all.length - 1 - idx, 1); // reverse index
            localStorage.setItem('app_feedbacks', JSON.stringify(all));
            li.remove();
          });
          li.appendChild(txt); li.appendChild(del); feedbackList.appendChild(li);
        });
      }
      feedbackAdminModal.style.display = 'flex';
    });
  }

  if(closeFeedbackAdminBtn){ closeFeedbackAdminBtn.addEventListener('click', ()=> feedbackAdminModal.style.display = 'none'); }
  if(clearFeedbacksBtn){ clearFeedbacksBtn.addEventListener('click', ()=>{
    if(!confirm('Clear all saved feedback?')) return; localStorage.removeItem('app_feedbacks'); feedbackList.innerHTML=''; showToast('Feedback cleared','info');
  }); }

  function escapeHtml(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  // Filters
  filterSel.addEventListener('change', render);

  // Sign out
  signOutBtn.addEventListener('click', ()=>{ auth.signOut(); });

  // Theme toggle
  themeToggle.addEventListener('click', ()=>{
    const cur = state.settings.theme || 'light';
    const next = cur === 'light' ? 'dark' : 'light';
    state.settings.theme = next; saveStorage(state); applyTheme(next);
  });

  // Privacy button handlers
  privacyToggleBtn.addEventListener('click', ()=>{
    if(!privacyUnlocked){
      // try to unlock via modal
      if(!hasPrivacyHash()){ alert('No privacy password set yet. Click "Set password" to create one.'); return; }
      openPrivacyModal();
    }else{
      // lock
      privacyUnlocked = false; clearAutoLockTimer();
      // clear in-memory crypto key and private tasks for safety
      privacyCryptoKey = null;
      state.privateTasks = [];
      saveStorage(state);
      updatePrivacyControls(); render();
    }
  });

  setPrivacyPwdBtn.addEventListener('click', async ()=>{
    await setPrivacyPassword();
  });

  // Feedback button handlers
  const feedbackBtn = document.getElementById('feedbackBtn');
  const feedbackModal = document.getElementById('feedbackModal');
  const closeFeedbackBtn = document.getElementById('closeFeedbackBtn');
  const cancelFeedbackBtn = document.getElementById('cancelFeedbackBtn');
  const feedbackForm = document.getElementById('feedbackForm');
  const feedbackText = document.getElementById('feedbackText');

  feedbackBtn.addEventListener('click', ()=>{
    feedbackModal.style.display = 'flex';
    feedbackText.focus();
  });

  closeFeedbackBtn.addEventListener('click', ()=>{
    feedbackModal.style.display = 'none';
  });

  cancelFeedbackBtn.addEventListener('click', ()=>{
    feedbackModal.style.display = 'none';
  });

  // Toast helper
  const toastContainer = document.getElementById('toastContainer');
  function showToast(message, type = 'info', timeout = 4000){
    if(!toastContainer) return; // defensive
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = message;
    toastContainer.appendChild(t);
    setTimeout(()=>{ t.style.opacity = '0'; t.addEventListener('transitionend', ()=>t.remove()); }, timeout);
  }

  // Privacy modal helpers
  function openPrivacyModal(){
    if(!privacyModal) return;
    // reset fields
    if(privacyPwdInput) privacyPwdInput.value = '';
    if(privacyCurrentInput) privacyCurrentInput.value = '';
    if(privacyNewInput) privacyNewInput.value = '';
    if(privacyConfirmNewInput) privacyConfirmNewInput.value = '';
    if(privacyChangeArea) privacyChangeArea.style.display = 'none';
    if(privacyChangeToggle) privacyChangeToggle.style.display = '';
    privacyModal.style.display = 'flex';
    if(privacyPwdInput) privacyPwdInput.focus();
  }

  function closePrivacyModal(){
    if(!privacyModal) return;
    privacyModal.style.display = 'none';
  }

  // Auto-lock helpers
  let autoLockTimer = null;
  const AUTO_LOCK_DEFAULT_MINUTES = 5;
  function getAutoLockMs(){
    const mins = (state.settings && state.settings.autoLockMinutes) || AUTO_LOCK_DEFAULT_MINUTES;
    return mins * 60 * 1000;
  }
  function startAutoLockTimer(){
    clearAutoLockTimer();
    if(!privacyUnlocked) return;
    autoLockTimer = setTimeout(()=>{
      privacyUnlocked = false;
      updatePrivacyControls(); render();
      showToast('Private area locked due to inactivity', 'info');
    }, getAutoLockMs());
  }
  function clearAutoLockTimer(){ if(autoLockTimer){ clearTimeout(autoLockTimer); autoLockTimer = null; } }

  // Reset auto-lock timer on user activity when unlocked
  function resetAutoLockTimer(){ if(privacyUnlocked) startAutoLockTimer(); }
  ['mousemove','keydown','click','touchstart'].forEach(ev => window.addEventListener(ev, resetAutoLockTimer, { passive: true }));
  // Lock immediately when window loses focus
  window.addEventListener('blur', ()=>{ if(privacyUnlocked){ privacyUnlocked = false; clearAutoLockTimer(); updatePrivacyControls(); render(); showToast('Private area locked (window lost focus)', 'info'); } });

  // Modal button wiring
  if(privacyModalClose) privacyModalClose.addEventListener('click', ()=> closePrivacyModal());
  if(privacyCancelBtn) privacyCancelBtn.addEventListener('click', ()=> closePrivacyModal());
  if(privacyModal) privacyModal.addEventListener('click', (e)=>{ if(e.target === privacyModal) closePrivacyModal(); });

  if(privacyUnlockBtn){
    privacyUnlockBtn.addEventListener('click', async ()=>{
      const pw = privacyPwdInput && privacyPwdInput.value;
      if(!pw){ showToast('Please enter password', 'error'); return; }
      const ok = await checkPrivacyPassword(pw);
      if(!ok){ showToast('Incorrect password', 'error'); return; }
      // derive key and decrypt private tasks if encrypted
      try{
        if(state.privacySalt && state.encryptedPrivate){
          privacyCryptoKey = await deriveKeyFromPassword(pw, state.privacySalt);
          const decrypted = await decryptPrivateTasksWithKey(privacyCryptoKey, state.encryptedPrivate);
          state.privateTasks = decrypted || [];
        }else{
          // no encryption present; keep any existing plain privateTasks
        }
      }catch(e){ console.error('Decrypt failed', e); showToast('Failed to decrypt private tasks', 'error'); return; }
      privacyUnlocked = true; closePrivacyModal(); updatePrivacyControls(); render(); startAutoLockTimer();
    });
  }

  if(privacyChangeToggle){
    privacyChangeToggle.addEventListener('click', ()=>{
      if(privacyChangeArea) privacyChangeArea.style.display = '';
      if(privacyChangeToggle) privacyChangeToggle.style.display = 'none';
      if(privacyCurrentInput) privacyCurrentInput.focus();
    });
  }

  if(privacyChangeConfirmBtn){
    privacyChangeConfirmBtn.addEventListener('click', async ()=>{
      const cur = privacyCurrentInput && privacyCurrentInput.value;
      const n1 = privacyNewInput && privacyNewInput.value;
      const n2 = privacyConfirmNewInput && privacyConfirmNewInput.value;
      if(!cur || !n1 || !n2){ showToast('Please fill all fields', 'error'); return; }
      if(n1.length < 4){ showToast('New password must be at least 4 characters', 'error'); return; }
      if(n1 !== n2){ showToast('New passwords do not match', 'error'); return; }
      const ok = await checkPrivacyPassword(cur);
      if(!ok){ showToast('Current password is incorrect', 'error'); return; }
      try{
        // decrypt with current password (use existing crypto key if available)
        let tasks = [];
        if(privacyCryptoKey){
          tasks = state.privateTasks || [];
        }else if(state.privacySalt && state.encryptedPrivate){
          const oldKey = await deriveKeyFromPassword(cur, state.privacySalt);
          tasks = await decryptPrivateTasksWithKey(oldKey, state.encryptedPrivate);
        }else{
          tasks = state.privateTasks || [];
        }
        // derive new salt/key and re-encrypt
        const newSalt = crypto.getRandomValues(new Uint8Array(16));
        const newSaltB64 = bufToBase64(newSalt.buffer);
        const newKey = await deriveKeyFromPassword(n1, newSaltB64);
        const enc = await encryptPrivateTasksWithKey(newKey, tasks || []);
        const h = await hashPwd(n1);
        state.privacyHash = h;
        state.privacySalt = newSaltB64;
        state.encryptedPrivate = enc;
        // keep tasks decrypted in memory and set active crypto key
        state.privateTasks = tasks || [];
        privacyCryptoKey = newKey;
        saveStorage(state);
        showToast('Password changed', 'success');
        privacyUnlocked = true; closePrivacyModal(); updatePrivacyControls(); render(); startAutoLockTimer();
      }catch(e){ console.error('Password change failed', e); showToast('Failed to change password', 'error'); }
    });
  }
  // Reset password handler: open reset area inside modal (no confirm())
  if(privacyResetBtn){
    privacyResetBtn.addEventListener('click', ()=>{
      if(!hasPrivacyHash()){ showToast && showToast('No privacy password set', 'info'); return; }
      // show reset area and hide change area
      if(privacyChangeArea) privacyChangeArea.style.display = 'none';
      if(privacyResetArea) privacyResetArea.style.display = '';
      if(privacyChangeToggle) privacyChangeToggle.style.display = 'none';
    });
  }

  if(privacyResetCancel){
    privacyResetCancel.addEventListener('click', ()=>{
      if(privacyResetArea) privacyResetArea.style.display = 'none';
      if(privacyChangeToggle) privacyChangeToggle.style.display = '';
    });
  }

  if(privacyResetMove){
    privacyResetMove.addEventListener('click', ()=>{
      // Move private to public, clear hash
  state.tasks = (state.tasks || []).concat(state.privateTasks || []);
  state.privateTasks = [];
  delete state.privacyHash;
  delete state.privacySalt;
  delete state.encryptedPrivate;
  saveStorage(state);
  privacyUnlocked = false; clearAutoLockTimer();
  if(privacyResetArea) privacyResetArea.style.display = 'none';
  closePrivacyModal();
  updatePrivacyControls(); render();
      showToast('Password reset — private tasks moved to public', 'success');
    });
  }

  if(privacyResetDelete){
    privacyResetDelete.addEventListener('click', ()=>{
      // Delete private tasks and clear hash
  state.privateTasks = [];
  delete state.privacyHash;
  delete state.privacySalt;
  delete state.encryptedPrivate;
  saveStorage(state);
  privacyUnlocked = false; clearAutoLockTimer();
  if(privacyResetArea) privacyResetArea.style.display = 'none';
  closePrivacyModal();
  updatePrivacyControls(); render();
      showToast('Password reset — private tasks deleted', 'success');
    });
  }

  feedbackForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const msg = feedbackText.value.trim();
    if(!msg){ alert('Please enter some feedback.'); return; }
  // Always save feedback locally as a backup
  const feedbacks = JSON.parse(localStorage.getItem('app_feedbacks') || '[]');
  feedbacks.push({ message: msg, timestamp: new Date().toISOString(), user: current.email || 'Guest' });
  localStorage.setItem('app_feedbacks', JSON.stringify(feedbacks));

  feedbackBtn.disabled = true;
  feedbackForm.querySelector('button[type="submit"]').disabled = true;

    // Template params for EmailJS or mailto fallback
    const templateParams = {
      to_email: 'regullasthish@gmail.com',
      subject: 'New To-Do App Feedback',
      message: msg,
      user_email: current.email || 'Guest User',
      timestamp: new Date().toLocaleString()
    };

    // Use EmailJS if available and configured (replace placeholder IDs first)
    const emailjsConfigured = (typeof emailjs !== 'undefined' && emailjs.send && EMAILJS_SERVICE_ID && EMAILJS_TEMPLATE_ID
      && !EMAILJS_SERVICE_ID.startsWith('YOUR_') && !EMAILJS_TEMPLATE_ID.startsWith('YOUR_'));

    if(emailjsConfigured){
      emailjs.send(EMAILJS_SERVICE_ID, EMAILJS_TEMPLATE_ID, templateParams)
        .then((resp) => {
          console.log('EmailJS send success', resp);
          showToast('Feedback sent — thank you!', 'success');
          feedbackText.value = '';
          feedbackModal.style.display = 'none';
        })
        .catch((error) => {
          console.error('EmailJS error:', error);
          showToast('Email send failed — saved locally. See console for details.', 'error');
          feedbackText.value = '';
          feedbackModal.style.display = 'none';
        })
        .finally(() => {
          feedbackBtn.disabled = false;
          feedbackForm.querySelector('button[type="submit"]').disabled = false;
        });
    }else{
      // Fallback: try to open user's mail client, but keep local copy
      const subject = encodeURIComponent('New To-Do App Feedback');
      const body = encodeURIComponent(`From: ${templateParams.user_email}\nTime: ${templateParams.timestamp}\n\n${templateParams.message}`);
      const mailto = `mailto:regullasthish@gmail.com?subject=${subject}&body=${body}`;
      // open in same tab to avoid popup blockers
      window.location.href = mailto;
      showToast('Feedback saved locally. Email client opened for manual send.', 'info');
      feedbackText.value = '';
      feedbackModal.style.display = 'none';
      feedbackBtn.disabled = false;
      feedbackForm.querySelector('button[type="submit"]').disabled = false;
    }
  });

  // Close modal when clicking outside
  feedbackModal.addEventListener('click', (e)=>{
    if(e.target === feedbackModal) feedbackModal.style.display = 'none';
  });

  // Scroll up button
  const scrollUpBtn = document.getElementById('scrollUpBtn');
  scrollUpBtn.addEventListener('click', ()=>{
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  // Ensure privacy controls reflect current state
  updatePrivacyControls();
  // Initial render
  render();
})();
