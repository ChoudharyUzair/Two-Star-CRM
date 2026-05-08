// ===== Two Star CRM Frontend =====
const App = {
  state: {
    authenticated: false,
    username: '',
    folders: [],
    clients: [],
    currentFolderId: null,
    currentClientId: null,
    currentClient: null,
    transactions: [],
    customColumns: [],
    columnLabels: {},
    inventory: [],
    bills: [],
    allClients: [],
    branding: {
      company_name: 'Two Star Industries',
      crm_name: 'Two Star CRM',
      logo_url: '',
      primary_color: '#3b82f6',
      accent_color: '#8b5cf6',
      received_color: '#ef4444',
      pending_color: '#3b82f6',
      running_color: '#10b981',
      bill_address: '',
      bill_phone: '',
      bill_footer: 'Thank you for your business!'
    },
    view: 'dashboard'
  },

  // ========= Default labels for built-in columns =========
  defaultLabels: {
    sno: '#',
    date: 'Date',
    bill_no: 'Bill No',
    amount_received: 'Amount Received',
    amount_pending: 'Amount Pending',
    status: 'Status',
    description: 'Description',
    running_total: 'Running Balance'
  },

  // ========= API helper with simple cache =========
  _cache: {},
  api: {
    async req(method, url, body, useCache = false) {
      // Cache only GETs
      if (method === 'GET' && useCache && App._cache[url]) {
        return App._cache[url];
      }
      const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      if (res.status === 401) {
        App.state.authenticated = false;
        App.renderLogin();
        throw new Error('Unauthorized');
      }
      const data = await res.json();
      if (method === 'GET' && useCache) App._cache[url] = data;
      return data;
    },
    get(url, useCache) { return this.req('GET', url, null, useCache); },
    post(url, body) { App._cache = {}; return this.req('POST', url, body); },
    put(url, body) { App._cache = {}; return this.req('PUT', url, body); },
    delete(url) { App._cache = {}; return this.req('DELETE', url); }
  },

  // ========= Toast =========
  toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${msg}`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; }, 2400);
    setTimeout(() => el.remove(), 2700);
  },

  // ========= Init =========
  async init() {
    try {
      // Load branding (public)
      const bData = await this.api.get('/api/branding');
      if (bData?.branding) {
        this.state.branding = { ...this.state.branding, ...bData.branding };
        this.applyBrandingTheme();
        document.title = this.state.branding.crm_name || 'Two Star CRM';
      }
    } catch {}

    try {
      const r = await fetch('/api/auth/check', { credentials: 'include' });
      const data = await r.json();
      if (data.authenticated) {
        this.state.authenticated = true;
        this.state.username = data.username;
        await this.loadFolders();
        this.renderApp();
        this.showDashboard();
      } else {
        this.renderLogin();
      }
    } catch (e) {
      this.renderLogin();
    }
  },

  applyBrandingTheme() {
    const b = this.state.branding;
    const root = document.documentElement;
    root.style.setProperty('--primary', b.primary_color || '#3b82f6');
    root.style.setProperty('--accent',  b.accent_color  || '#8b5cf6');
    root.style.setProperty('--color-received', b.received_color || '#ef4444');
    root.style.setProperty('--color-pending',  b.pending_color  || '#3b82f6');
    root.style.setProperty('--color-running',  b.running_color  || '#10b981');
  },

  // ========= Login =========
  renderLogin() {
    const b = this.state.branding;
    document.getElementById('app').innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <div class="text-center mb-6">
            <div class="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
                 style="background: linear-gradient(135deg, var(--primary), var(--accent)); overflow: hidden;">
              ${b.logo_url ? `<img src="${this.escapeAttr(b.logo_url)}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-star text-white text-2xl"></i>`}
            </div>
            <h1 class="text-2xl font-bold text-gray-800">${this.escapeHtml(b.crm_name || 'Two Star CRM')}</h1>
            <p class="text-gray-500 text-sm mt-1">${this.escapeHtml(b.company_name || 'Two Star Industries')}</p>
          </div>
          <form id="login-form" class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input id="username" type="text" required class="input-field" placeholder="admin" autocomplete="username">
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="password" type="password" required class="input-field" placeholder="Enter password" autocomplete="current-password">
            </div>
            <button type="submit" class="btn btn-primary w-full justify-center" style="padding: 0.75rem;">
              <i class="fas fa-sign-in-alt"></i> Login
            </button>
            <div class="text-xs text-gray-500 text-center mt-4 p-3 bg-gray-50 rounded-lg">
              <i class="fas fa-info-circle mr-1"></i>
              Default: <strong>admin</strong> / <strong>admin123</strong><br>
              <span class="text-orange-600">Change password after first login!</span>
            </div>
          </form>
        </div>
      </div>
    `;
    document.getElementById('login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value;
      const password = document.getElementById('password').value;
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
          this.state.authenticated = true;
          this.state.username = data.username;
          await this.loadFolders();
          this.renderApp();
          this.showDashboard();
          this.toast('Login successful', 'success');
        } else {
          this.toast(data.error || 'Login failed', 'error');
        }
      } catch (err) {
        this.toast('Network error', 'error');
      }
    });
  },

  // ========= Main App Layout =========
  renderApp() {
    const b = this.state.branding;
    document.getElementById('app').innerHTML = `
      <button class="mobile-toggle no-print" onclick="App.toggleSidebar()" aria-label="Menu">
        <i class="fas fa-bars"></i>
      </button>

      <aside class="sidebar no-print" id="sidebar">
        <div class="sidebar-brand">
          <div class="logo-circle">
            ${b.logo_url ? `<img src="${this.escapeAttr(b.logo_url)}" alt="logo">` : `<i class="fas fa-star"></i>`}
          </div>
          <div class="brand-text">
            <h1>${this.escapeHtml(b.crm_name || 'Two Star CRM')}</h1>
            <p>Welcome, ${this.escapeHtml(this.state.username)}</p>
          </div>
          <div class="dropdown" id="user-dropdown">
            <button onclick="App.toggleDropdown()" class="text-gray-300 hover:text-white p-1" aria-label="User menu">
              <i class="fas fa-ellipsis-v"></i>
            </button>
            <div class="dropdown-content">
              <a onclick="App.showChangePassword()"><i class="fas fa-key mr-2"></i>Change Password</a>
              <a onclick="App.logout()"><i class="fas fa-sign-out-alt mr-2"></i>Logout</a>
            </div>
          </div>
        </div>

        <div class="nav-section">
          <button class="nav-btn ${this.state.view === 'dashboard' ? 'active' : ''}" id="nav-dashboard" onclick="App.showDashboard()">
            <i class="fas fa-chart-line"></i><span>Dashboard</span>
          </button>
          <button class="nav-btn ${this.state.view === 'bills' ? 'active' : ''}" id="nav-bills" onclick="App.showBills()">
            <i class="fas fa-file-invoice"></i><span>Bills / Invoices</span>
          </button>
          <button class="nav-btn ${this.state.view === 'inventory' ? 'active' : ''}" id="nav-inventory" onclick="App.showInventory()">
            <i class="fas fa-boxes"></i><span>Inventory</span>
          </button>
          <button class="nav-btn ${this.state.view === 'branding' ? 'active' : ''}" id="nav-branding" onclick="App.showBranding()">
            <i class="fas fa-palette"></i><span>Branding</span>
          </button>
        </div>

        <div class="nav-section">
          <div class="nav-section-title">
            <span>Folders</span>
            <button onclick="App.showAddFolder()" class="text-blue-400 hover:text-blue-300" title="Add Folder" aria-label="Add folder">
              <i class="fas fa-plus-circle"></i>
            </button>
          </div>
          <div id="folders-list"></div>
        </div>
      </aside>

      <main class="main-content">
        <div id="content-area"></div>
      </main>
    `;
    this.renderFolders();
  },

  toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
  },
  closeSidebarOnMobile() {
    if (window.innerWidth <= 768) {
      document.getElementById('sidebar')?.classList.remove('open');
    }
  },
  setActiveNav(name) {
    ['dashboard','bills','inventory','branding'].forEach(n => {
      const el = document.getElementById('nav-' + n);
      if (el) el.classList.toggle('active', n === name);
    });
  },

  // ========= Folders =========
  async loadFolders() {
    try {
      const data = await this.api.get('/api/folders');
      this.state.folders = data.folders || [];
    } catch (e) {}
  },

  renderFolders() {
    const list = document.getElementById('folders-list');
    if (!list) return;
    if (this.state.folders.length === 0) {
      list.innerHTML = '<p class="text-gray-500 text-xs px-3 py-2">No folders. Click + to add.</p>';
      return;
    }
    list.innerHTML = this.state.folders.map(f => {
      const isActive = this.state.currentFolderId === f.id && this.state.view !== 'dashboard';
      const isExpanded = this.state.currentFolderId === f.id;
      const clientsHtml = isExpanded && this.state.clients.length > 0
        ? this.state.clients.map(c => `
            <div class="client-item ${this.state.currentClientId === c.id ? 'active' : ''}"
                 onclick="App.openClient(${c.id})">
              <i class="fas fa-user text-xs mr-1.5 opacity-60"></i>${this.escapeHtml(c.name)}
            </div>
          `).join('')
        : '';

      return `
        <div class="mb-1">
          <div class="folder-item ${isActive ? 'active' : ''}" onclick="App.openFolder(${f.id})">
            <i class="fas ${f.icon || 'fa-folder'}" style="color: ${f.color || '#3b82f6'}"></i>
            <span class="flex-1 truncate">${this.escapeHtml(f.name)}</span>
            <span class="text-xs text-gray-400">${f.client_count || 0}</span>
            <button onclick="event.stopPropagation(); App.editFolder(${f.id})" class="text-gray-400 hover:text-white ml-1" title="Edit">
              <i class="fas fa-pen text-xs"></i>
            </button>
          </div>
          <div>${clientsHtml}</div>
          ${isExpanded ? `
            <button onclick="App.showAddClient(${f.id})" class="text-blue-400 hover:text-blue-300 text-xs ml-9 mt-1 mb-2">
              <i class="fas fa-plus"></i> Add Client
            </button>` : ''}
        </div>
      `;
    }).join('');
  },

  showAddFolder() {
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-folder-plus text-blue-500 mr-2"></i>Add New Folder</h2>
      <form id="folder-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Folder Name</label>
          <input id="f-name" type="text" required class="input-field" placeholder="e.g., Customers, Suppliers">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Icon</label>
          <select id="f-icon" class="input-field">
            <option value="fa-folder">Folder</option>
            <option value="fa-users">Users</option>
            <option value="fa-truck">Truck</option>
            <option value="fa-money-bill-wave">Money</option>
            <option value="fa-building">Building</option>
            <option value="fa-shopping-cart">Cart</option>
            <option value="fa-handshake">Handshake</option>
            <option value="fa-briefcase">Briefcase</option>
            <option value="fa-chart-pie">Chart</option>
            <option value="fa-tag">Tag</option>
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Color</label>
          <input id="f-color" type="color" value="#3b82f6" class="input-field h-12">
        </div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `);
    document.getElementById('folder-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await this.api.post('/api/folders', {
          name: document.getElementById('f-name').value,
          icon: document.getElementById('f-icon').value,
          color: document.getElementById('f-color').value
        });
        this.closeModal();
        await this.loadFolders();
        this.renderFolders();
        this.toast('Folder created', 'success');
      } catch (err) { this.toast('Failed to create folder', 'error'); }
    });
  },

  editFolder(id) {
    const folder = this.state.folders.find(f => f.id === id);
    if (!folder) return;
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-edit text-blue-500 mr-2"></i>Edit Folder</h2>
      <form id="folder-edit-form" class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-1">Folder Name</label>
          <input id="f-name" type="text" required class="input-field" value="${this.escapeAttr(folder.name)}">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Icon</label>
          <select id="f-icon" class="input-field">
            ${['fa-folder','fa-users','fa-truck','fa-money-bill-wave','fa-building','fa-shopping-cart','fa-handshake','fa-briefcase','fa-chart-pie','fa-tag'].map(i => `<option value="${i}" ${folder.icon === i ? 'selected' : ''}>${i.replace('fa-','')}</option>`).join('')}
          </select>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Color</label>
          <input id="f-color" type="color" value="${folder.color}" class="input-field h-12">
        </div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-danger mr-auto" onclick="App.deleteFolder(${id})"><i class="fas fa-trash"></i> Delete</button>
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
        </div>
      </form>
    `);
    document.getElementById('folder-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await this.api.put(`/api/folders/${id}`, {
          name: document.getElementById('f-name').value,
          icon: document.getElementById('f-icon').value,
          color: document.getElementById('f-color').value
        });
        this.closeModal();
        await this.loadFolders();
        this.renderFolders();
        this.toast('Folder updated', 'success');
      } catch (err) { this.toast('Update failed', 'error'); }
    });
  },

  async deleteFolder(id) {
    if (!confirm('Delete this folder and ALL its clients/transactions? This cannot be undone.')) return;
    try {
      await this.api.delete(`/api/folders/${id}`);
      this.closeModal();
      if (this.state.currentFolderId === id) {
        this.state.currentFolderId = null;
        this.state.currentClientId = null;
      }
      await this.loadFolders();
      this.renderFolders();
      this.showDashboard();
      this.toast('Folder deleted', 'success');
    } catch (err) { this.toast('Delete failed', 'error'); }
  },

  // ========= Clients =========
  async openFolder(folderId) {
    this.state.currentFolderId = folderId;
    this.state.view = 'folder';
    this.setActiveNav('');
    this.closeSidebarOnMobile();
    try {
      const data = await this.api.get(`/api/folders/${folderId}/clients`);
      this.state.clients = data.clients || [];
      this.renderFolders();
      this.renderFolderView();
    } catch (e) {}
  },

  renderFolderView() {
    const folder = this.state.folders.find(f => f.id === this.state.currentFolderId);
    if (!folder) return;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <i class="fas ${folder.icon}" style="color: ${folder.color}"></i>
            ${this.escapeHtml(folder.name)}
          </h1>
          <p class="page-subtitle">${this.state.clients.length} client(s)</p>
        </div>
        <button onclick="App.showAddClient(${folder.id})" class="btn btn-primary">
          <i class="fas fa-user-plus"></i> Add Client
        </button>
      </div>
      <div class="p-4 md:p-6">
        ${this.state.clients.length === 0 ? `
          <div class="bg-white rounded-xl empty-state">
            <i class="fas fa-user-friends"></i>
            <p class="text-lg mb-2">No clients yet</p>
            <p class="text-sm">Click "Add Client" to add one</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${this.state.clients.map(c => `
              <div class="stat-card cursor-pointer" onclick="App.openClient(${c.id})">
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-gray-800 text-lg truncate">${this.escapeHtml(c.name)}</h3>
                    ${c.phone ? `<p class="text-sm text-gray-500 mt-1"><i class="fas fa-phone mr-1"></i>${this.escapeHtml(c.phone)}</p>` : ''}
                    ${c.email ? `<p class="text-sm text-gray-500 truncate"><i class="fas fa-envelope mr-1"></i>${this.escapeHtml(c.email)}</p>` : ''}
                  </div>
                  <i class="fas fa-arrow-right text-blue-500 ml-2"></i>
                </div>
              </div>
            `).join('')}
          </div>
        `}
      </div>
    `;
  },

  showAddClient(folderId) {
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-user-plus text-blue-500 mr-2"></i>Add New Client</h2>
      <form id="client-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Name *</label><input id="c-name" type="text" required class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Phone</label><input id="c-phone" type="text" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Email</label><input id="c-email" type="email" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Address</label><input id="c-address" type="text" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Opening Balance</label><input id="c-balance" type="number" step="0.01" value="0" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="c-notes" class="input-field" rows="2"></textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `);
    document.getElementById('client-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await this.api.post('/api/clients', {
          folder_id: folderId,
          name: document.getElementById('c-name').value,
          phone: document.getElementById('c-phone').value,
          email: document.getElementById('c-email').value,
          address: document.getElementById('c-address').value,
          notes: document.getElementById('c-notes').value,
          opening_balance: parseFloat(document.getElementById('c-balance').value) || 0
        });
        this.closeModal();
        await this.loadFolders();
        await this.openFolder(folderId);
        this.toast('Client added', 'success');
      } catch (err) { this.toast('Failed to add client', 'error'); }
    });
  },

  // ========= Client Ledger =========
  async openClient(clientId) {
    this.state.currentClientId = clientId;
    this.state.view = 'ledger';
    this.setActiveNav('');
    this.closeSidebarOnMobile();
    try {
      const cdata = await this.api.get(`/api/clients/${clientId}`);
      this.state.currentClient = cdata.client;
      this.state.customColumns = cdata.custom_columns || [];
      this.state.columnLabels = cdata.column_labels || {};
      const tdata = await this.api.get(`/api/clients/${clientId}/transactions`);
      this.state.transactions = tdata.transactions || [];
      this.state.currentFolderId = cdata.client.folder_id;
      const fdata = await this.api.get(`/api/folders/${cdata.client.folder_id}/clients`);
      this.state.clients = fdata.clients || [];
      this.renderFolders();
      this.renderLedger();
    } catch (e) { console.error(e); }
  },

  // Get label for built-in column key (or default if not overridden)
  getColLabel(key) {
    return this.state.columnLabels[key] || this.defaultLabels[key] || key;
  },

  renderLedger() {
    const c = this.state.currentClient;
    const folder = this.state.folders.find(f => f.id === c.folder_id);
    const opening = parseFloat(c.opening_balance) || 0;
    let totalReceived = 0, totalPending = 0;
    this.state.transactions.forEach(t => {
      totalReceived += parseFloat(t.amount_received) || 0;
      totalPending += parseFloat(t.amount_pending) || 0;
    });
    const netBalance = opening + totalPending - totalReceived;

    const colHeader = (key) => `
      ${this.escapeHtml(this.getColLabel(key))}
      <i class="fas fa-pen col-rename" title="Rename column" onclick="App.renameBuiltInCol('${key}')"></i>
    `;

    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <div class="text-xs text-gray-500"><a href="#" onclick="App.openFolder(${folder.id}); return false;" class="hover:text-blue-500"><i class="fas ${folder.icon} mr-1"></i>${this.escapeHtml(folder.name)}</a></div>
          <h1 class="page-title">${this.escapeHtml(c.name)}</h1>
          <div class="text-xs text-gray-500 mt-1">
            ${c.phone ? `<span class="mr-3"><i class="fas fa-phone mr-1"></i>${this.escapeHtml(c.phone)}</span>` : ''}
            ${c.email ? `<span class="mr-3"><i class="fas fa-envelope mr-1"></i>${this.escapeHtml(c.email)}</span>` : ''}
          </div>
        </div>
        <div class="flex gap-2 flex-wrap">
          <button onclick="App.showEditClient()" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="App.showCustomColumns()" class="btn btn-secondary btn-sm"><i class="fas fa-columns"></i> Columns</button>
          <button onclick="App.deleteClient()" class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button>
        </div>
      </div>

      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div class="stat-card">
            <p class="text-xs text-gray-500">Opening Balance</p>
            <p class="text-xl font-bold text-gray-800 mt-1">PKR ${this.fmt(opening)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">${this.escapeHtml(this.getColLabel('amount_received'))}</p>
            <p class="text-xl font-bold mt-1 amount-received">PKR ${this.fmt(totalReceived)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">${this.escapeHtml(this.getColLabel('amount_pending'))}</p>
            <p class="text-xl font-bold mt-1 amount-pending">PKR ${this.fmt(totalPending)}</p>
          </div>
          <div class="balance-box">
            <p class="text-xs opacity-90">Net Balance Due</p>
            <p class="text-2xl font-bold mt-1">PKR ${this.fmt(netBalance)}</p>
            <p class="text-xs opacity-80 mt-1">${netBalance > 0 ? 'Client owes you' : netBalance < 0 ? 'You owe client' : 'Settled'}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 class="font-bold text-gray-800"><i class="fas fa-book mr-2"></i>Khata / Ledger</h2>
            <div class="flex gap-2">
              <button onclick="App.addRow()" class="btn btn-success btn-sm"><i class="fas fa-plus"></i> Add Row</button>
            </div>
          </div>
          <div class="overflow-x-auto">
            <table class="ledger-table" id="ledger-table">
              <thead>
                <tr>
                  <th style="width:40px;">${colHeader('sno')}</th>
                  <th style="width:140px;">${colHeader('date')}</th>
                  <th style="width:120px;">${colHeader('bill_no')}</th>
                  <th style="width:140px;">${colHeader('amount_received')}</th>
                  <th style="width:140px;">${colHeader('amount_pending')}</th>
                  <th style="width:130px;">${colHeader('status')}</th>
                  <th>${colHeader('description')}</th>
                  ${this.state.customColumns.map((col, i) => `<th>
                    ${this.escapeHtml(col.name)}
                    <i class="fas fa-pen col-rename" title="Rename" onclick="App.renameCustomCol(${i})"></i>
                  </th>`).join('')}
                  <th style="width:140px;" class="text-right">${colHeader('running_total')}</th>
                  <th style="width:50px;"></th>
                </tr>
              </thead>
              <tbody id="ledger-body">${this.renderRows(opening)}</tbody>
              <tfoot>
                <tr class="bg-gray-100 font-bold">
                  <td colspan="3" class="text-right">TOTALS:</td>
                  <td class="amount-received">PKR ${this.fmt(totalReceived)}</td>
                  <td class="amount-pending">PKR ${this.fmt(totalPending)}</td>
                  <td colspan="${2 + this.state.customColumns.length}"></td>
                  <td class="text-right amount-running">PKR ${this.fmt(netBalance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  renderRows(opening) {
    if (this.state.transactions.length === 0) {
      return `<tr><td colspan="${9 + this.state.customColumns.length}" class="text-center py-8 text-gray-500">
        <i class="fas fa-inbox text-3xl mb-2 block"></i>No transactions yet. Click "Add Row" to start.
      </td></tr>`;
    }
    let running = opening;
    return this.state.transactions.map((t, i) => {
      const rec = parseFloat(t.amount_received) || 0;
      const pen = parseFloat(t.amount_pending) || 0;
      running = running + pen - rec;
      const customData = (() => { try { return JSON.parse(t.custom_data || '{}'); } catch { return {}; } })();
      return `
        <tr data-id="${t.id}">
          <td class="text-gray-500">${i + 1}</td>
          <td><input type="date" value="${t.entry_date || ''}" onchange="App.updateRow(${t.id}, 'entry_date', this.value)"></td>
          <td><input type="text" value="${this.escapeAttr(t.bill_no || '')}" onchange="App.updateRow(${t.id}, 'bill_no', this.value)" placeholder="Bill #"></td>
          <td><input type="number" step="0.01" value="${rec}" onchange="App.updateRow(${t.id}, 'amount_received', parseFloat(this.value)||0)" class="amount-received"></td>
          <td><input type="number" step="0.01" value="${pen}" onchange="App.updateRow(${t.id}, 'amount_pending', parseFloat(this.value)||0)" class="amount-pending"></td>
          <td>
            <select onchange="App.updateRow(${t.id}, 'status', this.value)">
              ${['Pending','Received','Partial','Overdue','Cancelled'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" value="${this.escapeAttr(t.description || '')}" onchange="App.updateRow(${t.id}, 'description', this.value)" placeholder="Notes..."></td>
          ${this.state.customColumns.map(col => `
            <td><input type="${col.type === 'number' ? 'number' : 'text'}" value="${this.escapeAttr(customData[col.key] || '')}" onchange="App.updateCustom(${t.id}, '${col.key}', this.value)"></td>
          `).join('')}
          <td class="text-right amount-running">PKR ${this.fmt(running)}</td>
          <td class="text-center">
            <button onclick="App.deleteRow(${t.id})" class="text-red-500 hover:text-red-700" title="Delete"><i class="fas fa-trash text-sm"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  // ===== Rename built-in column =====
  async renameBuiltInCol(key) {
    const current = this.getColLabel(key);
    const newName = prompt(`Rename "${this.defaultLabels[key]}" column to:`, current);
    if (newName === null) return;
    const trimmed = newName.trim();
    const labels = { ...this.state.columnLabels };
    if (!trimmed || trimmed === this.defaultLabels[key]) {
      delete labels[key];
    } else {
      labels[key] = trimmed;
    }
    this.state.columnLabels = labels;
    try {
      await this.api.put(`/api/clients/${this.state.currentClientId}/column-labels`, { labels });
      this.renderLedger();
      this.toast('Column renamed', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  async renameCustomCol(index) {
    const col = this.state.customColumns[index];
    if (!col) return;
    const newName = prompt(`Rename column "${col.name}" to:`, col.name);
    if (newName === null) return;
    const trimmed = newName.trim();
    if (!trimmed) return;
    col.name = trimmed;
    try {
      await this.api.put(`/api/clients/${this.state.currentClientId}/columns`, { columns: this.state.customColumns });
      this.renderLedger();
      this.toast('Column renamed', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  async addRow() {
    try {
      await this.api.post('/api/transactions', {
        client_id: this.state.currentClientId,
        entry_date: new Date().toISOString().slice(0, 10),
        bill_no: '', amount_received: 0, amount_pending: 0,
        status: 'Pending', description: ''
      });
      await this.refreshLedger();
      this.toast('Row added', 'success');
    } catch (e) { this.toast('Failed to add row', 'error'); }
  },

  rowUpdateTimers: {},
  async updateRow(id, field, value) {
    const t = this.state.transactions.find(t => t.id === id);
    if (!t) return;
    t[field] = value;
    clearTimeout(this.rowUpdateTimers[id]);
    this.rowUpdateTimers[id] = setTimeout(async () => {
      try {
        let customData = {};
        try { customData = JSON.parse(t.custom_data || '{}'); } catch {}
        await this.api.put(`/api/transactions/${id}`, {
          entry_date: t.entry_date,
          bill_no: t.bill_no,
          amount_received: parseFloat(t.amount_received) || 0,
          amount_pending: parseFloat(t.amount_pending) || 0,
          status: t.status,
          description: t.description,
          custom_data: customData
        });
        // Lightweight refresh: just recompute running totals locally
        this.renderLedger();
      } catch (e) { this.toast('Update failed', 'error'); }
    }, 350);
  },

  async updateCustom(id, key, value) {
    const t = this.state.transactions.find(t => t.id === id);
    if (!t) return;
    let customData = {};
    try { customData = JSON.parse(t.custom_data || '{}'); } catch {}
    customData[key] = value;
    t.custom_data = JSON.stringify(customData);
    clearTimeout(this.rowUpdateTimers[id]);
    this.rowUpdateTimers[id] = setTimeout(async () => {
      try {
        await this.api.put(`/api/transactions/${id}`, {
          entry_date: t.entry_date,
          bill_no: t.bill_no,
          amount_received: parseFloat(t.amount_received) || 0,
          amount_pending: parseFloat(t.amount_pending) || 0,
          status: t.status,
          description: t.description,
          custom_data: customData
        });
      } catch (e) { this.toast('Update failed', 'error'); }
    }, 350);
  },

  async deleteRow(id) {
    if (!confirm('Delete this row?')) return;
    try {
      await this.api.delete(`/api/transactions/${id}`);
      await this.refreshLedger();
      this.toast('Row deleted', 'success');
    } catch (e) { this.toast('Delete failed', 'error'); }
  },

  async refreshLedger() {
    const tdata = await this.api.get(`/api/clients/${this.state.currentClientId}/transactions`);
    this.state.transactions = tdata.transactions || [];
    this.renderLedger();
  },

  showEditClient() {
    const c = this.state.currentClient;
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-user-edit text-blue-500 mr-2"></i>Edit Client</h2>
      <form id="client-edit-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Name *</label><input id="c-name" type="text" required class="input-field" value="${this.escapeAttr(c.name)}"></div>
        <div><label class="block text-sm font-medium mb-1">Phone</label><input id="c-phone" type="text" class="input-field" value="${this.escapeAttr(c.phone || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Email</label><input id="c-email" type="email" class="input-field" value="${this.escapeAttr(c.email || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Address</label><input id="c-address" type="text" class="input-field" value="${this.escapeAttr(c.address || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Opening Balance</label><input id="c-balance" type="number" step="0.01" class="input-field" value="${c.opening_balance || 0}"></div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="c-notes" class="input-field" rows="2">${this.escapeHtml(c.notes || '')}</textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
        </div>
      </form>
    `);
    document.getElementById('client-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await this.api.put(`/api/clients/${c.id}`, {
          name: document.getElementById('c-name').value,
          phone: document.getElementById('c-phone').value,
          email: document.getElementById('c-email').value,
          address: document.getElementById('c-address').value,
          notes: document.getElementById('c-notes').value,
          opening_balance: parseFloat(document.getElementById('c-balance').value) || 0
        });
        this.closeModal();
        await this.openClient(c.id);
        this.toast('Client updated', 'success');
      } catch (err) { this.toast('Update failed', 'error'); }
    });
  },

  async deleteClient() {
    const c = this.state.currentClient;
    if (!confirm(`Delete client "${c.name}" and all their transactions?`)) return;
    try {
      await this.api.delete(`/api/clients/${c.id}`);
      const folderId = c.folder_id;
      this.state.currentClientId = null;
      await this.loadFolders();
      await this.openFolder(folderId);
      this.toast('Client deleted', 'success');
    } catch (err) { this.toast('Delete failed', 'error'); }
  },

  // ========= Custom Columns Manager =========
  showCustomColumns() {
    this._tempCols = [...this.state.customColumns];
    const renderColsList = () => this._tempCols.map((col, i) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-col-name="${i}" value="${this.escapeAttr(col.name)}" placeholder="Column name">
        <select class="input-field" style="width:120px;" data-col-type="${i}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeCol(${i})"><i class="fas fa-times"></i></button>
      </div>
    `).join('');
    this._removeCol = (i) => {
      this._tempCols.splice(i, 1);
      document.getElementById('cols-list').innerHTML = renderColsList();
    };

    // Built-in label override editor
    const lbl = this.state.columnLabels;
    const builtInRows = Object.entries(this.defaultLabels)
      .filter(([k]) => !['sno','running_total'].includes(k) || true) // keep all renameable
      .map(([key, def]) => `
        <div class="flex gap-2 items-center mb-2">
          <span class="text-sm text-gray-500" style="width:140px;">${this.escapeHtml(def)}:</span>
          <input type="text" class="input-field flex-1" data-builtin="${key}" value="${this.escapeAttr(lbl[key] || '')}" placeholder="${this.escapeAttr(def)}">
        </div>
      `).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-3"><i class="fas fa-columns text-blue-500 mr-2"></i>Manage Columns</h2>

      <div class="border-b pb-3 mb-3">
        <h3 class="font-semibold text-sm text-gray-700 mb-2"><i class="fas fa-edit mr-1"></i> Rename Existing Columns</h3>
        <p class="text-xs text-gray-500 mb-2">Leave blank to use default name. Click pen icon on column header for quick rename.</p>
        ${builtInRows}
      </div>

      <h3 class="font-semibold text-sm text-gray-700 mb-2"><i class="fas fa-plus-circle mr-1"></i> Custom Extra Columns</h3>
      <div id="cols-list">${renderColsList()}</div>
      <button type="button" class="btn btn-secondary btn-sm mb-3" onclick="App._addColRow()"><i class="fas fa-plus"></i> Add Column</button>

      <div class="flex gap-2 justify-end pt-2 border-t">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="App._saveColumns()"><i class="fas fa-save"></i> Save</button>
      </div>
    `, 'modal-lg');
  },

  _addColRow() {
    this._tempCols.push({ name: 'New Column', type: 'text', key: 'col_' + Date.now() });
    document.getElementById('cols-list').innerHTML = this._tempCols.map((col, j) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-col-name="${j}" value="${this.escapeAttr(col.name)}" placeholder="Column name">
        <select class="input-field" style="width:120px;" data-col-type="${j}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeCol(${j})"><i class="fas fa-times"></i></button>
      </div>
    `).join('');
  },

  async _saveColumns() {
    document.querySelectorAll('#cols-list [data-col-name]').forEach(el => {
      const i = parseInt(el.dataset.colName);
      if (this._tempCols[i]) this._tempCols[i].name = el.value;
    });
    document.querySelectorAll('#cols-list [data-col-type]').forEach(el => {
      const i = parseInt(el.dataset.colType);
      if (this._tempCols[i]) this._tempCols[i].type = el.value;
    });
    this._tempCols.forEach(c => { if (!c.key) c.key = 'col_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); });

    // Read built-in label overrides
    const labels = {};
    document.querySelectorAll('[data-builtin]').forEach(el => {
      const key = el.dataset.builtin;
      const val = el.value.trim();
      if (val) labels[key] = val;
    });

    try {
      await Promise.all([
        this.api.put(`/api/clients/${this.state.currentClientId}/columns`, { columns: this._tempCols }),
        this.api.put(`/api/clients/${this.state.currentClientId}/column-labels`, { labels })
      ]);
      this.state.customColumns = this._tempCols;
      this.state.columnLabels = labels;
      this.closeModal();
      this.renderLedger();
      this.toast('Columns saved', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= Dashboard =========
  async showDashboard() {
    this.state.view = 'dashboard';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.setActiveNav('dashboard');
    this.closeSidebarOnMobile();
    this.renderFolders();

    document.getElementById('content-area').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="fas fa-chart-line text-purple-500"></i>Dashboard</h1>
      </div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>
    `;
    try {
      const data = await this.api.get('/api/dashboard');
      this.renderDashboard(data);
    } catch (e) {}
  },

  renderDashboard(data) {
    const { totals, perFolder, topPending, recent, statuses, clientCount, folderCount, billStats } = data;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-chart-line text-purple-500"></i>Dashboard</h1>
          <p class="page-subtitle">Overall financial summary</p>
        </div>
      </div>

      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <div class="stat-card">
            <p class="text-xs text-gray-500">Total Received</p>
            <p class="text-xl font-bold mt-1 amount-received">PKR ${this.fmt(totals.total_received)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Total Pending</p>
            <p class="text-xl font-bold mt-1 amount-pending">PKR ${this.fmt(totals.total_pending)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Net Balance</p>
            <p class="text-xl font-bold mt-1 amount-running">PKR ${this.fmt((totals.total_pending||0) - (totals.total_received||0))}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Clients / Folders</p>
            <p class="text-xl font-bold text-blue-600 mt-1">${clientCount} / ${folderCount}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Bills</p>
            <p class="text-xl font-bold text-purple-600 mt-1">${billStats?.count || 0}</p>
            <p class="text-xs text-gray-400 mt-1">PKR ${this.fmt(billStats?.total_amount || 0)}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-folder-tree mr-2"></i>Per-Folder Summary</h2>
          ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-4">No folders yet</p>' : `
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="text-left p-3 font-semibold text-gray-700">Folder</th>
                    <th class="text-right p-3 font-semibold text-gray-700">Clients</th>
                    <th class="text-right p-3 font-semibold text-gray-700">Received</th>
                    <th class="text-right p-3 font-semibold text-gray-700">Pending</th>
                    <th class="text-right p-3 font-semibold text-gray-700">Net</th>
                  </tr>
                </thead>
                <tbody>
                  ${perFolder.map(f => `
                    <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openFolder(${f.id})">
                      <td class="p-3"><i class="fas ${f.icon} mr-2" style="color:${f.color}"></i>${this.escapeHtml(f.name)}</td>
                      <td class="text-right p-3">${f.client_count}</td>
                      <td class="text-right p-3 amount-received">PKR ${this.fmt(f.total_received)}</td>
                      <td class="text-right p-3 amount-pending">PKR ${this.fmt(f.total_pending)}</td>
                      <td class="text-right p-3 amount-running">PKR ${this.fmt(f.total_pending - f.total_received)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-chart-pie mr-2"></i>Status Breakdown</h2>
            ${statuses.length === 0 ? '<p class="text-gray-500 text-center py-8">No transactions</p>' : '<canvas id="statusChart" height="200"></canvas>'}
          </div>
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-chart-bar mr-2"></i>Folder Comparison</h2>
            ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-8">No data</p>' : '<canvas id="folderChart" height="200"></canvas>'}
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>Top Pending Clients</h2>
          ${topPending.filter(c => c.pending > 0).length === 0 ? '<p class="text-gray-500 text-center py-4">No pending amounts</p>' : `
            <div class="space-y-2">
              ${topPending.filter(c => c.pending > 0).map(c => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer" onclick="App.openClient(${c.id})">
                  <div>
                    <p class="font-medium text-gray-800">${this.escapeHtml(c.name)}</p>
                    <p class="text-xs text-gray-500">${this.escapeHtml(c.folder_name || '')}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold amount-pending">PKR ${this.fmt(c.pending)}</p>
                    <p class="text-xs text-gray-500">Received: PKR ${this.fmt(c.received)}</p>
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-history mr-2"></i>Recent Transactions</h2>
          ${recent.length === 0 ? '<p class="text-gray-500 text-center py-4">No transactions yet</p>' : `
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="text-left p-2">Date</th>
                    <th class="text-left p-2">Client</th>
                    <th class="text-left p-2">Bill</th>
                    <th class="text-right p-2">Received</th>
                    <th class="text-right p-2">Pending</th>
                    <th class="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${recent.map(t => `
                    <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openClient(${t.client_id})">
                      <td class="p-2">${t.entry_date}</td>
                      <td class="p-2">${this.escapeHtml(t.client_name || '')} <span class="text-xs text-gray-500">/ ${this.escapeHtml(t.folder_name || '')}</span></td>
                      <td class="p-2">${this.escapeHtml(t.bill_no || '-')}</td>
                      <td class="p-2 text-right amount-received">PKR ${this.fmt(t.amount_received)}</td>
                      <td class="p-2 text-right amount-pending">PKR ${this.fmt(t.amount_pending)}</td>
                      <td class="p-2"><span class="status-badge status-${(t.status||'').toLowerCase()}">${this.escapeHtml(t.status || '')}</span></td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      </div>
    `;

    // Charts (lazy)
    requestAnimationFrame(() => {
      if (typeof Chart === 'undefined') return;
      if (statuses.length > 0) {
        const ctx = document.getElementById('statusChart');
        if (ctx) new Chart(ctx, {
          type: 'doughnut',
          data: { labels: statuses.map(s => s.status), datasets: [{ data: statuses.map(s => s.count), backgroundColor: ['#f59e0b','#10b981','#3b82f6','#ef4444','#6b7280'] }] },
          options: { plugins: { legend: { position: 'bottom' } } }
        });
      }
      if (perFolder.length > 0) {
        const ctx = document.getElementById('folderChart');
        if (ctx) new Chart(ctx, {
          type: 'bar',
          data: { labels: perFolder.map(f => f.name), datasets: [
            { label: 'Received', data: perFolder.map(f => f.total_received), backgroundColor: '#ef4444' },
            { label: 'Pending', data: perFolder.map(f => f.total_pending), backgroundColor: '#3b82f6' }
          ] },
          options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
        });
      }
    });
  },

  // ========= INVENTORY =========
  async showInventory() {
    this.state.view = 'inventory';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.setActiveNav('inventory');
    this.closeSidebarOnMobile();
    this.renderFolders();

    document.getElementById('content-area').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="fas fa-boxes text-orange-500"></i>Inventory</h1>
      </div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>
    `;
    try {
      const data = await this.api.get('/api/inventory');
      this.state.inventory = data.items || [];
      this.renderInventory();
    } catch (e) {}
  },

  renderInventory(filter = '') {
    const items = filter
      ? this.state.inventory.filter(i =>
          (i.name || '').toLowerCase().includes(filter.toLowerCase()) ||
          (i.sku || '').toLowerCase().includes(filter.toLowerCase()) ||
          (i.category || '').toLowerCase().includes(filter.toLowerCase())
        )
      : this.state.inventory;

    const totalValue = this.state.inventory.reduce((sum, i) => sum + (parseFloat(i.rate) || 0) * (parseFloat(i.quantity) || 0), 0);
    const totalQty = this.state.inventory.reduce((sum, i) => sum + (parseFloat(i.quantity) || 0), 0);

    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-boxes text-orange-500"></i>Inventory</h1>
          <p class="page-subtitle">${this.state.inventory.length} product(s) · Total Value: PKR ${this.fmt(totalValue)}</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <input type="text" id="inv-search" placeholder="Search products..." class="input-field" style="max-width:240px;" oninput="App.renderInventory(this.value)" value="${this.escapeAttr(filter)}">
          <button onclick="App.showAddInventory()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Product</button>
        </div>
      </div>

      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card">
            <p class="text-xs text-gray-500">Products</p>
            <p class="text-xl font-bold text-blue-600">${this.state.inventory.length}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Total Quantity</p>
            <p class="text-xl font-bold text-purple-600">${this.fmt(totalQty)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Inventory Value</p>
            <p class="text-xl font-bold amount-running">PKR ${this.fmt(totalValue)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Low Stock (≤5)</p>
            <p class="text-xl font-bold text-red-600">${this.state.inventory.filter(i => (parseFloat(i.quantity)||0) <= 5).length}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th style="width:40px;">#</th>
                  <th>Product Name</th>
                  <th style="width:120px;">SKU</th>
                  <th style="width:100px;">Unit</th>
                  <th style="width:130px;">Rate (PKR)</th>
                  <th style="width:130px;">Quantity</th>
                  <th style="width:140px;">Stock Value</th>
                  <th style="width:130px;">Category</th>
                  <th>Notes</th>
                  <th style="width:60px;"></th>
                </tr>
              </thead>
              <tbody>
                ${items.length === 0 ? `
                  <tr><td colspan="10" class="text-center py-8 text-gray-500">
                    <i class="fas fa-box-open text-3xl mb-2 block"></i>${filter ? 'No matching products' : 'No products yet. Click "Add Product" to start.'}
                  </td></tr>
                ` : items.map((it, i) => {
                  const rate = parseFloat(it.rate) || 0;
                  const qty = parseFloat(it.quantity) || 0;
                  const value = rate * qty;
                  const lowStock = qty <= 5;
                  return `
                    <tr data-inv-id="${it.id}">
                      <td class="text-gray-500">${i + 1}</td>
                      <td><input type="text" value="${this.escapeAttr(it.name)}" onchange="App.updateInv(${it.id}, 'name', this.value)" placeholder="Product name"></td>
                      <td><input type="text" value="${this.escapeAttr(it.sku || '')}" onchange="App.updateInv(${it.id}, 'sku', this.value)" placeholder="SKU"></td>
                      <td><input type="text" value="${this.escapeAttr(it.unit || 'pcs')}" onchange="App.updateInv(${it.id}, 'unit', this.value)" placeholder="pcs/kg/m"></td>
                      <td><input type="number" step="0.01" value="${rate}" onchange="App.updateInv(${it.id}, 'rate', parseFloat(this.value)||0)"></td>
                      <td><input type="number" step="0.01" value="${qty}" onchange="App.updateInv(${it.id}, 'quantity', parseFloat(this.value)||0)" class="${lowStock ? 'low-stock' : 'in-stock'}"></td>
                      <td class="amount-running text-right font-bold">PKR ${this.fmt(value)}</td>
                      <td><input type="text" value="${this.escapeAttr(it.category || '')}" onchange="App.updateInv(${it.id}, 'category', this.value)" placeholder="Category"></td>
                      <td><input type="text" value="${this.escapeAttr(it.notes || '')}" onchange="App.updateInv(${it.id}, 'notes', this.value)" placeholder="Notes"></td>
                      <td class="text-center">
                        <button onclick="App.deleteInv(${it.id})" class="text-red-500 hover:text-red-700" title="Delete"><i class="fas fa-trash text-sm"></i></button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  showAddInventory() {
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-box text-orange-500 mr-2"></i>Add Product</h2>
      <form id="inv-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Product Name *</label><input id="i-name" type="text" required class="input-field" placeholder="e.g., Steel Pipe 2 inch"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">SKU / Code</label><input id="i-sku" type="text" class="input-field"></div>
          <div><label class="block text-sm font-medium mb-1">Unit</label><input id="i-unit" type="text" class="input-field" value="pcs" placeholder="pcs/kg/m"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">Rate (PKR)</label><input id="i-rate" type="number" step="0.01" class="input-field" value="0"></div>
          <div><label class="block text-sm font-medium mb-1">Quantity in Stock</label><input id="i-qty" type="number" step="0.01" class="input-field" value="0"></div>
        </div>
        <div><label class="block text-sm font-medium mb-1">Category</label><input id="i-cat" type="text" class="input-field" placeholder="e.g., Pipes, Hardware"></div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="i-notes" class="input-field" rows="2"></textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `);
    document.getElementById('inv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await this.api.post('/api/inventory', {
          name: document.getElementById('i-name').value,
          sku: document.getElementById('i-sku').value,
          unit: document.getElementById('i-unit').value || 'pcs',
          rate: parseFloat(document.getElementById('i-rate').value) || 0,
          quantity: parseFloat(document.getElementById('i-qty').value) || 0,
          category: document.getElementById('i-cat').value,
          notes: document.getElementById('i-notes').value
        });
        this.closeModal();
        await this.showInventory();
        this.toast('Product added', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  invUpdateTimers: {},
  async updateInv(id, field, value) {
    const it = this.state.inventory.find(i => i.id === id);
    if (!it) return;
    it[field] = value;
    clearTimeout(this.invUpdateTimers[id]);
    this.invUpdateTimers[id] = setTimeout(async () => {
      try {
        await this.api.put(`/api/inventory/${id}`, {
          name: it.name, sku: it.sku, unit: it.unit,
          rate: parseFloat(it.rate) || 0,
          quantity: parseFloat(it.quantity) || 0,
          category: it.category, notes: it.notes
        });
        // Update value/low-stock indicators in place
        this.renderInventory(document.getElementById('inv-search')?.value || '');
      } catch (e) { this.toast('Update failed', 'error'); }
    }, 350);
  },

  async deleteInv(id) {
    if (!confirm('Delete this product?')) return;
    try {
      await this.api.delete(`/api/inventory/${id}`);
      await this.showInventory();
      this.toast('Product deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= BILLS =========
  async showBills() {
    this.state.view = 'bills';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.setActiveNav('bills');
    this.closeSidebarOnMobile();
    this.renderFolders();

    document.getElementById('content-area').innerHTML = `
      <div class="page-header">
        <h1 class="page-title"><i class="fas fa-file-invoice text-blue-500"></i>Bills</h1>
      </div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>
    `;
    try {
      const data = await this.api.get('/api/bills');
      this.state.bills = data.bills || [];
      this.renderBillsList();
    } catch (e) {}
  },

  renderBillsList() {
    const area = document.getElementById('content-area');
    const totalBills = this.state.bills.length;
    const totalAmount = this.state.bills.reduce((s, b) => s + (parseFloat(b.total) || 0), 0);
    const totalPaid = this.state.bills.reduce((s, b) => s + (parseFloat(b.paid) || 0), 0);
    const due = totalAmount - totalPaid;

    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-file-invoice text-blue-500"></i>Bills / Invoices</h1>
          <p class="page-subtitle">${totalBills} bill(s)</p>
        </div>
        <button onclick="App.showBillEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> New Bill</button>
      </div>

      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card">
            <p class="text-xs text-gray-500">Total Bills</p>
            <p class="text-xl font-bold text-blue-600">${totalBills}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Total Amount</p>
            <p class="text-xl font-bold text-purple-600">PKR ${this.fmt(totalAmount)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Paid</p>
            <p class="text-xl font-bold amount-received">PKR ${this.fmt(totalPaid)}</p>
          </div>
          <div class="stat-card">
            <p class="text-xs text-gray-500">Outstanding</p>
            <p class="text-xl font-bold amount-pending">PKR ${this.fmt(due)}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto">
            <table class="ledger-table">
              <thead>
                <tr>
                  <th>Bill No</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th class="text-right">Total</th>
                  <th class="text-right">Paid</th>
                  <th class="text-right">Due</th>
                  <th>Status</th>
                  <th style="width:160px;">Actions</th>
                </tr>
              </thead>
              <tbody>
                ${this.state.bills.length === 0 ? `
                  <tr><td colspan="8" class="text-center py-8 text-gray-500">
                    <i class="fas fa-file-invoice text-3xl mb-2 block"></i>No bills yet. Click "New Bill" to create one.
                  </td></tr>
                ` : this.state.bills.map(b => {
                  const due = (parseFloat(b.total) || 0) - (parseFloat(b.paid) || 0);
                  return `
                    <tr>
                      <td class="font-semibold">${this.escapeHtml(b.bill_no)}</td>
                      <td>${b.bill_date}</td>
                      <td>${this.escapeHtml(b.customer_name || b.client_name || '-')}</td>
                      <td class="text-right font-medium">PKR ${this.fmt(b.total)}</td>
                      <td class="text-right amount-received">PKR ${this.fmt(b.paid)}</td>
                      <td class="text-right amount-pending">PKR ${this.fmt(due)}</td>
                      <td><span class="status-badge status-${(b.status||'').toLowerCase()}">${this.escapeHtml(b.status || 'Unpaid')}</span></td>
                      <td>
                        <button onclick="App.showBillEditor(${b.id})" class="btn btn-secondary btn-sm" title="Edit"><i class="fas fa-edit"></i></button>
                        <button onclick="App.printBill(${b.id})" class="btn btn-primary btn-sm" title="Print"><i class="fas fa-print"></i></button>
                        <button onclick="App.deleteBill(${b.id})" class="btn btn-danger btn-sm" title="Delete"><i class="fas fa-trash"></i></button>
                      </td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    `;
  },

  // Bill editor (create/edit)
  async showBillEditor(billId = null) {
    // Preload inventory & clients in parallel
    const [invData, clData, billData] = await Promise.all([
      this.api.get('/api/inventory'),
      this.api.get('/api/clients'),
      billId ? this.api.get(`/api/bills/${billId}`) : Promise.resolve(null)
    ]);
    this.state.inventory = invData.items || [];
    this.state.allClients = clData.clients || [];

    let editing = null, items = [];
    if (billData) {
      editing = billData.bill;
      items = (billData.items || []).map(i => ({
        product_id: i.product_id,
        product_name: i.product_name,
        quantity: i.quantity,
        rate: i.rate,
        total: i.total
      }));
    } else {
      items = [
        { product_id: null, product_name: '', quantity: 1, rate: 0, total: 0 }
      ];
    }

    this._billItems = items;
    this._billEditing = editing;

    const billNoVal = editing ? editing.bill_no : ('BILL-' + new Date().toISOString().slice(2,10).replace(/-/g,'') + '-' + Math.floor(Math.random()*900+100));
    const billDateVal = editing ? editing.bill_date : new Date().toISOString().slice(0,10);

    this.openModal(`
      <h2 class="text-xl font-bold mb-3"><i class="fas fa-file-invoice text-blue-500 mr-2"></i>${editing ? 'Edit Bill' : 'New Bill'}</h2>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm font-medium mb-1">Bill No</label>
          <input id="b-no" type="text" class="input-field" value="${this.escapeAttr(billNoVal)}">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Date</label>
          <input id="b-date" type="date" class="input-field" value="${billDateVal}">
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Customer Name</label>
          <input id="b-cname" list="b-cname-list" type="text" class="input-field" value="${editing ? this.escapeAttr(editing.customer_name) : ''}" placeholder="Customer name">
          <datalist id="b-cname-list">
            ${this.state.allClients.map(c => `<option value="${this.escapeAttr(c.name)}" data-id="${c.id}" data-phone="${this.escapeAttr(c.phone || '')}" data-address="${this.escapeAttr(c.address || '')}">`).join('')}
          </datalist>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Phone</label>
          <input id="b-cphone" type="text" class="input-field" value="${editing ? this.escapeAttr(editing.customer_phone || '') : ''}">
        </div>
        <div class="md:col-span-2">
          <label class="block text-sm font-medium mb-1">Address</label>
          <input id="b-caddr" type="text" class="input-field" value="${editing ? this.escapeAttr(editing.customer_address || '') : ''}">
        </div>
      </div>

      <div class="bg-white rounded-lg overflow-hidden border mb-3">
        <table class="bill-table" id="bill-items-table">
          <thead>
            <tr>
              <th style="width:130px;">Quantity</th>
              <th>Product Name</th>
              <th style="width:130px;">Rate (PKR)</th>
              <th style="width:140px;">Total (PKR)</th>
              <th style="width:50px;"></th>
            </tr>
          </thead>
          <tbody id="bill-items-body"></tbody>
        </table>
      </div>
      <button type="button" class="btn btn-secondary btn-sm mb-3" onclick="App._addBillRow()"><i class="fas fa-plus"></i> Add Item Row</button>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div>
          <label class="block text-sm font-medium mb-1">Notes</label>
          <textarea id="b-notes" class="input-field" rows="2">${editing ? this.escapeHtml(editing.notes || '') : ''}</textarea>
        </div>
        <div class="space-y-2">
          <div class="flex justify-between items-center">
            <label class="text-sm">Subtotal:</label>
            <span id="b-subtotal" class="font-bold">PKR 0.00</span>
          </div>
          <div class="flex justify-between items-center">
            <label class="text-sm">Discount:</label>
            <input id="b-discount" type="number" step="0.01" class="input-field" style="width:140px;" value="${editing ? editing.discount : 0}" oninput="App._calcBill()">
          </div>
          <div class="flex justify-between items-center">
            <label class="text-sm">Tax %:</label>
            <input id="b-tax" type="number" step="0.01" class="input-field" style="width:140px;" value="${editing ? editing.tax : 0}" oninput="App._calcBill()">
          </div>
          <div class="flex justify-between items-center pt-2 border-t">
            <label class="text-sm font-bold">Total:</label>
            <span id="b-total" class="font-bold text-lg amount-running">PKR 0.00</span>
          </div>
          <div class="flex justify-between items-center">
            <label class="text-sm">Paid:</label>
            <input id="b-paid" type="number" step="0.01" class="input-field" style="width:140px;" value="${editing ? editing.paid : 0}" oninput="App._calcBill()">
          </div>
          <div class="flex justify-between items-center">
            <label class="text-sm">Due:</label>
            <span id="b-due" class="font-bold amount-pending">PKR 0.00</span>
          </div>
          <div class="flex justify-between items-center">
            <label class="text-sm">Status:</label>
            <select id="b-status" class="input-field" style="width:140px;">
              ${['Unpaid','Partial','Paid','Cancelled'].map(s => `<option value="${s}" ${editing?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </div>
        </div>
      </div>

      <div class="flex gap-2 justify-end pt-2 border-t">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        ${editing ? `<button type="button" class="btn btn-primary" onclick="App._saveBill(${editing.id}, true)"><i class="fas fa-print"></i> Save & Print</button>` : `<button type="button" class="btn btn-primary" onclick="App._saveBill(null, true)"><i class="fas fa-print"></i> Save & Print</button>`}
        <button type="button" class="btn btn-success" onclick="App._saveBill(${editing ? editing.id : 'null'}, false)"><i class="fas fa-save"></i> Save</button>
      </div>
    `, 'modal-xl');

    this._renderBillItems();
    this._calcBill();

    // Customer auto-fill on name match
    document.getElementById('b-cname').addEventListener('change', (e) => {
      const name = e.target.value;
      const c = this.state.allClients.find(c => c.name === name);
      if (c) {
        document.getElementById('b-cphone').value = c.phone || '';
        document.getElementById('b-caddr').value = c.address || '';
      }
    });
  },

  _renderBillItems() {
    const tbody = document.getElementById('bill-items-body');
    if (!tbody) return;
    const productOpts = this.state.inventory.map(i => `<option value="${this.escapeAttr(i.name)}" data-id="${i.id}" data-rate="${i.rate}">`).join('');
    if (!document.getElementById('bill-product-list')) {
      const dl = document.createElement('datalist');
      dl.id = 'bill-product-list';
      dl.innerHTML = productOpts;
      document.body.appendChild(dl);
    } else {
      document.getElementById('bill-product-list').innerHTML = productOpts;
    }

    tbody.innerHTML = this._billItems.map((it, i) => `
      <tr data-row="${i}">
        <td><input type="number" step="0.01" value="${it.quantity || 0}" oninput="App._updateBillRow(${i}, 'quantity', parseFloat(this.value)||0)"></td>
        <td>
          <input type="text" list="bill-product-list" value="${this.escapeAttr(it.product_name || '')}"
                 oninput="App._updateBillProductName(${i}, this.value)"
                 onchange="App._matchBillProduct(${i}, this.value)" placeholder="Type or pick product">
        </td>
        <td><input type="number" step="0.01" value="${it.rate || 0}" oninput="App._updateBillRow(${i}, 'rate', parseFloat(this.value)||0)"></td>
        <td class="text-right font-bold amount-running">PKR ${this.fmt((parseFloat(it.quantity)||0) * (parseFloat(it.rate)||0))}</td>
        <td class="text-center">
          <button type="button" onclick="App._removeBillRow(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash text-sm"></i></button>
        </td>
      </tr>
    `).join('');
  },

  _addBillRow() {
    this._billItems.push({ product_id: null, product_name: '', quantity: 1, rate: 0, total: 0 });
    this._renderBillItems();
    this._calcBill();
  },
  _removeBillRow(i) {
    this._billItems.splice(i, 1);
    this._renderBillItems();
    this._calcBill();
  },
  _updateBillRow(i, field, value) {
    if (!this._billItems[i]) return;
    this._billItems[i][field] = value;
    this._billItems[i].total = (parseFloat(this._billItems[i].quantity) || 0) * (parseFloat(this._billItems[i].rate) || 0);
    // Update total cell only
    const row = document.querySelector(`#bill-items-body tr[data-row="${i}"]`);
    if (row) row.querySelector('td.amount-running').textContent = 'PKR ' + this.fmt(this._billItems[i].total);
    this._calcBill();
  },
  _updateBillProductName(i, value) {
    if (!this._billItems[i]) return;
    this._billItems[i].product_name = value;
  },
  _matchBillProduct(i, value) {
    if (!this._billItems[i]) return;
    const inv = this.state.inventory.find(p => p.name === value);
    if (inv) {
      this._billItems[i].product_id = inv.id;
      this._billItems[i].product_name = inv.name;
      this._billItems[i].rate = parseFloat(inv.rate) || 0;
      this._billItems[i].total = (parseFloat(this._billItems[i].quantity) || 0) * this._billItems[i].rate;
      this._renderBillItems();
      this._calcBill();
    } else {
      this._billItems[i].product_id = null;
      this._billItems[i].product_name = value;
    }
  },
  _calcBill() {
    const subtotal = this._billItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)), 0);
    const discount = parseFloat(document.getElementById('b-discount')?.value) || 0;
    const taxPct = parseFloat(document.getElementById('b-tax')?.value) || 0;
    const taxable = subtotal - discount;
    const taxAmt = taxable * (taxPct / 100);
    const total = taxable + taxAmt;
    const paid = parseFloat(document.getElementById('b-paid')?.value) || 0;
    const due = total - paid;
    const subEl = document.getElementById('b-subtotal');
    const totEl = document.getElementById('b-total');
    const dueEl = document.getElementById('b-due');
    if (subEl) subEl.textContent = 'PKR ' + this.fmt(subtotal);
    if (totEl) totEl.textContent = 'PKR ' + this.fmt(total);
    if (dueEl) dueEl.textContent = 'PKR ' + this.fmt(due);
  },

  async _saveBill(billId, alsoPrint) {
    const billNo = document.getElementById('b-no').value.trim() || ('BILL-' + Date.now());
    const billDate = document.getElementById('b-date').value;
    const customerName = document.getElementById('b-cname').value.trim();
    const phone = document.getElementById('b-cphone').value.trim();
    const address = document.getElementById('b-caddr').value.trim();
    const discount = parseFloat(document.getElementById('b-discount').value) || 0;
    const taxPct = parseFloat(document.getElementById('b-tax').value) || 0;
    const paid = parseFloat(document.getElementById('b-paid').value) || 0;
    const status = document.getElementById('b-status').value;
    const notes = document.getElementById('b-notes').value;

    if (!customerName) { this.toast('Customer name required', 'error'); return; }
    if (this._billItems.length === 0) { this.toast('At least one item required', 'error'); return; }

    const subtotal = this._billItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)), 0);
    const taxable = subtotal - discount;
    const taxAmt = taxable * (taxPct / 100);
    const total = taxable + taxAmt;

    // match client_id if exists
    const matched = this.state.allClients.find(c => c.name === customerName);

    const payload = {
      bill_no: billNo,
      bill_date: billDate,
      client_id: matched ? matched.id : null,
      customer_name: customerName,
      customer_phone: phone,
      customer_address: address,
      subtotal,
      discount,
      tax: taxPct,
      total,
      paid,
      notes,
      status,
      items: this._billItems.map(it => ({
        product_id: it.product_id || null,
        product_name: it.product_name || '',
        quantity: parseFloat(it.quantity) || 0,
        rate: parseFloat(it.rate) || 0,
        total: (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)
      }))
    };

    try {
      let savedId = billId;
      if (billId) {
        await this.api.put(`/api/bills/${billId}`, payload);
      } else {
        const res = await this.api.post('/api/bills', payload);
        savedId = res.id;
      }
      this.closeModal();
      this.toast('Bill saved', 'success');
      await this.showBills();
      if (alsoPrint && savedId) {
        setTimeout(() => this.printBill(savedId), 200);
      }
    } catch (e) { this.toast('Save failed', 'error'); }
  },

  async deleteBill(id) {
    if (!confirm('Delete this bill?')) return;
    try {
      await this.api.delete(`/api/bills/${id}`);
      await this.showBills();
      this.toast('Bill deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // Print bill
  async printBill(id) {
    try {
      const data = await this.api.get(`/api/bills/${id}`);
      const bill = data.bill;
      const items = data.items || [];
      const b = this.state.branding;

      const subtotal = parseFloat(bill.subtotal) || 0;
      const discount = parseFloat(bill.discount) || 0;
      const taxPct = parseFloat(bill.tax) || 0;
      const taxable = subtotal - discount;
      const taxAmt = taxable * (taxPct / 100);
      const total = parseFloat(bill.total) || 0;
      const paid = parseFloat(bill.paid) || 0;
      const due = total - paid;

      const logoHtml = b.logo_url
        ? `<img src="${this.escapeAttr(b.logo_url)}" alt="logo">`
        : `<div class="logo-fallback">${this.escapeHtml((b.company_name || 'TS').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase())}</div>`;

      const html = `
        <div class="invoice-page print-area">
          <div class="invoice-header">
            <div class="company-block">
              <h1>${this.escapeHtml(b.company_name || 'Two Star Industries')}</h1>
              ${b.bill_address ? `<p>${this.escapeHtml(b.bill_address)}</p>` : ''}
              ${b.bill_phone ? `<p><i class="fas fa-phone mr-1"></i>${this.escapeHtml(b.bill_phone)}</p>` : ''}
              <h2 style="margin-top:10px; font-size: 1.3rem; color: #475569;">INVOICE</h2>
            </div>
            <div class="logo-block">${logoHtml}</div>
          </div>

          <div class="invoice-meta">
            <div class="box">
              <label>Bill To</label>
              <span>${this.escapeHtml(bill.customer_name || '')}</span>
              ${bill.customer_phone ? `<div style="font-size:0.85rem;color:#475569;margin-top:2px;">${this.escapeHtml(bill.customer_phone)}</div>` : ''}
              ${bill.customer_address ? `<div style="font-size:0.85rem;color:#475569;margin-top:2px;">${this.escapeHtml(bill.customer_address)}</div>` : ''}
            </div>
            <div class="box" style="text-align:right">
              <div style="margin-bottom: 6px;"><label>Bill No</label><span>${this.escapeHtml(bill.bill_no)}</span></div>
              <div><label>Date</label><span>${this.escapeHtml(bill.bill_date)}</span></div>
            </div>
          </div>

          <table class="invoice-table">
            <thead>
              <tr>
                <th class="col-num">#</th>
                <th class="col-qty">Quantity</th>
                <th>Product Name</th>
                <th class="col-rate">Rate (PKR)</th>
                <th class="col-tot">Total (PKR)</th>
              </tr>
            </thead>
            <tbody>
              ${items.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 24px; color: #94a3b8;">No items</td></tr>' :
                items.map((it, i) => `
                <tr>
                  <td class="col-num">${i + 1}</td>
                  <td class="col-qty">${this.fmt(it.quantity)}</td>
                  <td>${this.escapeHtml(it.product_name)}</td>
                  <td class="col-rate">${this.fmt(it.rate)}</td>
                  <td class="col-tot">${this.fmt(it.total)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="invoice-totals">
            <div><span>Subtotal:</span><span>PKR ${this.fmt(subtotal)}</span></div>
            ${discount > 0 ? `<div><span>Discount:</span><span>− PKR ${this.fmt(discount)}</span></div>` : ''}
            ${taxPct > 0 ? `<div><span>Tax (${taxPct}%):</span><span>PKR ${this.fmt(taxAmt)}</span></div>` : ''}
            <div class="grand"><span>Grand Total:</span><span>PKR ${this.fmt(total)}</span></div>
            <div><span>Paid:</span><span style="color: var(--color-received); font-weight: 700;">PKR ${this.fmt(paid)}</span></div>
            <div><span>Balance Due:</span><span style="color: var(--color-pending); font-weight: 700;">PKR ${this.fmt(due)}</span></div>
          </div>

          ${bill.notes ? `<div style="margin-top:16px; padding: 12px; background: #f8fafc; border-radius: 8px; font-size: 0.85rem;"><strong>Notes:</strong> ${this.escapeHtml(bill.notes)}</div>` : ''}

          <div class="invoice-footer">
            <p>${this.escapeHtml(b.bill_footer || 'Thank you for your business!')}</p>
          </div>
        </div>
      `;

      // Render in modal with Print button
      this.openModal(`
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 12px;" class="no-print">
          <h2 class="text-xl font-bold"><i class="fas fa-print mr-2"></i>Bill Preview</h2>
          <div class="flex gap-2">
            <button onclick="window.print()" class="btn btn-primary"><i class="fas fa-print"></i> Print</button>
            <button onclick="App.closeModal()" class="btn btn-secondary">Close</button>
          </div>
        </div>
        ${html}
      `, 'modal-xl');
    } catch (e) {
      this.toast('Failed to load bill', 'error');
    }
  },

  // ========= BRANDING =========
  async showBranding() {
    this.state.view = 'branding';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.setActiveNav('branding');
    this.closeSidebarOnMobile();
    this.renderFolders();

    try {
      const data = await this.api.get('/api/branding');
      if (data?.branding) this.state.branding = { ...this.state.branding, ...data.branding };
    } catch (e) {}

    const b = this.state.branding;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-palette text-pink-500"></i>Branding & Settings</h1>
          <p class="page-subtitle">Customize your CRM appearance and bill template</p>
        </div>
      </div>

      <div class="p-4 md:p-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <!-- Form -->
          <div class="lg:col-span-2 bg-white rounded-xl shadow-sm p-5 space-y-4">
            <h2 class="font-bold text-gray-800 text-lg"><i class="fas fa-cog mr-2"></i>Identity</h2>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label class="block text-sm font-medium mb-1">Company Name</label>
                <input id="br-company" type="text" class="input-field" value="${this.escapeAttr(b.company_name)}">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">CRM Display Name</label>
                <input id="br-crm" type="text" class="input-field" value="${this.escapeAttr(b.crm_name)}">
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium mb-1">Logo URL</label>
                <input id="br-logo" type="text" class="input-field" value="${this.escapeAttr(b.logo_url)}" placeholder="https://example.com/logo.png" oninput="App._previewLogo()">
                <p class="text-xs text-gray-500 mt-1">Paste a public image URL. Used in sidebar, login & bills.</p>
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Bill Address</label>
                <input id="br-addr" type="text" class="input-field" value="${this.escapeAttr(b.bill_address)}" placeholder="Company address (printed on bills)">
              </div>
              <div>
                <label class="block text-sm font-medium mb-1">Bill Phone</label>
                <input id="br-phone" type="text" class="input-field" value="${this.escapeAttr(b.bill_phone)}" placeholder="0300-1234567">
              </div>
              <div class="md:col-span-2">
                <label class="block text-sm font-medium mb-1">Bill Footer Text</label>
                <input id="br-footer" type="text" class="input-field" value="${this.escapeAttr(b.bill_footer)}">
              </div>
            </div>

            <h2 class="font-bold text-gray-800 text-lg pt-4 border-t"><i class="fas fa-paint-roller mr-2"></i>Theme Colors</h2>

            <div class="brand-color-row">
              <input type="color" value="${b.primary_color}" id="br-primary" oninput="App._previewColor('primary', this.value)">
              <label>Primary (Buttons / Links)</label>
              <code class="text-xs text-gray-500" id="br-primary-code">${b.primary_color}</code>
            </div>
            <div class="brand-color-row">
              <input type="color" value="${b.accent_color}" id="br-accent" oninput="App._previewColor('accent', this.value)">
              <label>Accent (Logo gradient)</label>
              <code class="text-xs text-gray-500" id="br-accent-code">${b.accent_color}</code>
            </div>
            <div class="brand-color-row">
              <input type="color" value="${b.received_color}" id="br-received" oninput="App._previewColor('received', this.value)">
              <label>Received Amount Color</label>
              <code class="text-xs text-gray-500" id="br-received-code">${b.received_color}</code>
            </div>
            <div class="brand-color-row">
              <input type="color" value="${b.pending_color}" id="br-pending" oninput="App._previewColor('pending', this.value)">
              <label>Pending Amount Color</label>
              <code class="text-xs text-gray-500" id="br-pending-code">${b.pending_color}</code>
            </div>
            <div class="brand-color-row">
              <input type="color" value="${b.running_color}" id="br-running" oninput="App._previewColor('running', this.value)">
              <label>Running Balance Color</label>
              <code class="text-xs text-gray-500" id="br-running-code">${b.running_color}</code>
            </div>

            <div class="flex gap-2 justify-end pt-3 border-t">
              <button onclick="App._resetBranding()" class="btn btn-secondary"><i class="fas fa-undo"></i> Reset to Default</button>
              <button onclick="App._saveBranding()" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
            </div>
          </div>

          <!-- Live preview -->
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-bold text-gray-800 text-lg mb-3"><i class="fas fa-eye mr-2"></i>Live Preview</h2>
            <div id="brand-preview" class="space-y-3">
              <div class="p-4 rounded-lg" style="background: linear-gradient(135deg, var(--primary), var(--accent)); color: white;">
                <div class="flex items-center gap-3">
                  <div class="logo-circle" id="prev-logo" style="background: rgba(255,255,255,0.2);">
                    ${b.logo_url ? `<img src="${this.escapeAttr(b.logo_url)}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-star"></i>`}
                  </div>
                  <div>
                    <h3 class="font-bold" id="prev-crm">${this.escapeHtml(b.crm_name)}</h3>
                    <p class="text-xs opacity-90" id="prev-company">${this.escapeHtml(b.company_name)}</p>
                  </div>
                </div>
              </div>
              <div class="p-3 bg-gray-50 rounded-lg space-y-1.5 text-sm">
                <div class="flex justify-between"><span>Received:</span><span class="amount-received font-bold">PKR 50,000</span></div>
                <div class="flex justify-between"><span>Pending:</span><span class="amount-pending font-bold">PKR 20,000</span></div>
                <div class="flex justify-between"><span>Running Balance:</span><span class="amount-running font-bold">PKR 30,000</span></div>
              </div>
              <button class="btn btn-primary w-full justify-center"><i class="fas fa-magic"></i> Sample Button</button>
            </div>
          </div>
        </div>
      </div>
    `;
  },

  _previewColor(key, value) {
    const map = { primary: '--primary', accent: '--accent', received: '--color-received', pending: '--color-pending', running: '--color-running' };
    if (map[key]) document.documentElement.style.setProperty(map[key], value);
    const code = document.getElementById(`br-${key}-code`);
    if (code) code.textContent = value;
  },
  _previewLogo() {
    const url = document.getElementById('br-logo').value.trim();
    const el = document.getElementById('prev-logo');
    if (!el) return;
    el.innerHTML = url ? `<img src="${this.escapeAttr(url)}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-star"></i>`;
  },
  _resetBranding() {
    const def = {
      company_name: 'Two Star Industries',
      crm_name: 'Two Star CRM',
      logo_url: '',
      primary_color: '#3b82f6',
      accent_color: '#8b5cf6',
      received_color: '#ef4444',
      pending_color: '#3b82f6',
      running_color: '#10b981',
      bill_address: '',
      bill_phone: '',
      bill_footer: 'Thank you for your business!'
    };
    this.state.branding = def;
    this.applyBrandingTheme();
    this.showBranding();
  },
  async _saveBranding() {
    const b = {
      company_name: document.getElementById('br-company').value || 'Two Star Industries',
      crm_name: document.getElementById('br-crm').value || 'Two Star CRM',
      logo_url: document.getElementById('br-logo').value || '',
      primary_color: document.getElementById('br-primary').value,
      accent_color: document.getElementById('br-accent').value,
      received_color: document.getElementById('br-received').value,
      pending_color: document.getElementById('br-pending').value,
      running_color: document.getElementById('br-running').value,
      bill_address: document.getElementById('br-addr').value,
      bill_phone: document.getElementById('br-phone').value,
      bill_footer: document.getElementById('br-footer').value
    };
    try {
      await this.api.put('/api/branding', b);
      this.state.branding = { ...this.state.branding, ...b };
      this.applyBrandingTheme();
      document.title = b.crm_name;
      // Re-render the entire app shell with new branding
      this.renderApp();
      this.showBranding();
      this.toast('Branding saved', 'success');
    } catch (e) { this.toast('Save failed', 'error'); }
  },

  // ========= Auth UI =========
  toggleDropdown() {
    document.getElementById('user-dropdown').classList.toggle('open');
  },

  showChangePassword() {
    this.toggleDropdown();
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-key text-blue-500 mr-2"></i>Change Password</h2>
      <form id="pw-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Old Password</label><input id="pw-old" type="password" required class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">New Password</label><input id="pw-new" type="password" required minlength="4" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Confirm New</label><input id="pw-confirm" type="password" required class="input-field"></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
        </div>
      </form>
    `);
    document.getElementById('pw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const oldP = document.getElementById('pw-old').value;
      const newP = document.getElementById('pw-new').value;
      const conf = document.getElementById('pw-confirm').value;
      if (newP !== conf) return this.toast('Passwords do not match', 'error');
      try {
        const r = await this.api.post('/api/auth/change-password', { oldPassword: oldP, newPassword: newP });
        if (r.success) { this.closeModal(); this.toast('Password changed', 'success'); }
        else this.toast(r.error || 'Failed', 'error');
      } catch (e) { this.toast('Failed', 'error'); }
    });
  },

  async logout() {
    try { await this.api.post('/api/auth/logout', {}); } catch {}
    this.state.authenticated = false;
    this.renderLogin();
  },

  // ========= Modal =========
  openModal(content, sizeClass = '') {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box ${sizeClass}">${content}</div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(); });
    document.body.appendChild(overlay);
  },

  closeModal() {
    const m = document.getElementById('modal-overlay');
    if (m) m.remove();
  },

  // ========= Helpers =========
  fmt(n) {
    n = parseFloat(n) || 0;
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  },
  escapeAttr(s) { return this.escapeHtml(s); }
};

// Init
document.addEventListener('DOMContentLoaded', () => App.init());

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#user-dropdown')) {
    const d = document.getElementById('user-dropdown');
    if (d) d.classList.remove('open');
  }
});

// Keyboard shortcut: ESC to close modal
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') App.closeModal();
});
