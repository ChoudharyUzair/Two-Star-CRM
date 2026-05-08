// ===== Two Star CRM Frontend v2 =====
const App = {
  state: {
    authenticated: false,
    username: '',
    folders: [],
    customSections: [],
    clients: [],
    currentFolderId: null,
    currentClientId: null,
    currentClient: null,
    currentCustomSectionId: null,
    transactions: [],
    customColumns: [],
    columnLabels: {},
    inventory: [],
    bills: [],
    allClients: [],
    rawMaterials: [],
    employees: [],
    currentEmployee: null,
    employeeTransactions: [],
    sideExpenses: [],
    customSectionRows: [],
    currentCustomSection: null,
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

  defaultLabels: {
    sno: '#', date: 'Date', bill_no: 'Bill No',
    amount_received: 'Amount Received', amount_pending: 'Amount Pending',
    status: 'Status', description: 'Description', running_total: 'Running Balance'
  },

  _cache: {},
  api: {
    async req(method, url, body, useCache = false) {
      if (method === 'GET' && useCache && App._cache[url]) return App._cache[url];
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

  toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${msg}`;
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity 0.2s'; }, 2400);
    setTimeout(() => el.remove(), 2700);
  },

  async init() {
    try {
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
        await this.loadCustomSections();
        this.renderApp();
        this.showDashboard();
      } else {
        this.renderLogin();
      }
    } catch (e) { this.renderLogin(); }
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
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input id="username" type="text" required class="input-field" placeholder="admin"></div>
            <div><label class="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input id="password" type="password" required class="input-field" placeholder="Enter password"></div>
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
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          credentials: 'include', body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (data.success) {
          this.state.authenticated = true;
          this.state.username = data.username;
          await this.loadFolders();
          await this.loadCustomSections();
          this.renderApp();
          this.showDashboard();
          this.toast('Login successful', 'success');
        } else this.toast(data.error || 'Login failed', 'error');
      } catch (err) { this.toast('Network error', 'error'); }
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
            <button onclick="App.toggleDropdown()" class="text-gray-300 hover:text-white p-1"><i class="fas fa-ellipsis-v"></i></button>
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
          <button class="nav-btn ${this.state.view === 'raw' ? 'active' : ''}" id="nav-raw" onclick="App.showRawMaterials()">
            <i class="fas fa-cubes"></i><span>Raw Material</span>
          </button>
          <button class="nav-btn ${this.state.view === 'employees' ? 'active' : ''}" id="nav-employees" onclick="App.showEmployees()">
            <i class="fas fa-users-gear"></i><i class="fas fa-user-tie" style="display:none;"></i><span>Employees</span>
          </button>
          <button class="nav-btn ${this.state.view === 'side-expenses' ? 'active' : ''}" id="nav-side-expenses" onclick="App.showSideExpenses()">
            <i class="fas fa-money-bill-wave"></i><span>Side Expenses</span>
          </button>
          <button class="nav-btn ${this.state.view === 'branding' ? 'active' : ''}" id="nav-branding" onclick="App.showBranding()">
            <i class="fas fa-palette"></i><span>Branding</span>
          </button>
        </div>

        <div class="nav-section" id="sections-nav">
          <div class="nav-section-title">
            <span>Sections</span>
            <button onclick="App.showAddFolder()" class="text-blue-400 hover:text-blue-300" title="Add Section"><i class="fas fa-plus-circle"></i></button>
          </div>
          <div id="folders-nav-list"></div>
          <div id="folders-list" style="display:none;"></div>
        </div>

      </aside>

      <main class="main-content">
        <div id="content-area"></div>
      </main>
    `;
    this.renderFolders();
    this.renderCustomSections();
  },

  toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); },
  closeSidebarOnMobile() {
    if (window.innerWidth <= 768) document.getElementById('sidebar')?.classList.remove('open');
  },
  setActiveNav(name) {
    ['dashboard','bills','inventory','raw','employees','side-expenses','branding'].forEach(n => {
      const el = document.getElementById('nav-' + n);
      if (el) el.classList.toggle('active', n === name);
    });
  },

  // ========= Folders / Sections =========
  async loadFolders() {
    try {
      const data = await this.api.get('/api/folders');
      this.state.folders = data.folders || [];
    } catch (e) {}
  },
  async loadCustomSections() {
    try {
      const data = await this.api.get('/api/custom-sections');
      this.state.customSections = data.sections || [];
    } catch (e) {}
  },

  renderFolders() {
    const list = document.getElementById('folders-nav-list');
    if (!list) return;
    if (this.state.folders.length === 0) {
      list.innerHTML = '<p class="text-gray-500 text-xs px-3 py-2">No sections yet.</p>';
      return;
    }
    // Render each folder as a top-level nav-btn (matches Bills, Inventory, etc.)
    // with edit pencil + count badge.
    list.innerHTML = this.state.folders.map(f => {
      const isActive = this.state.currentFolderId === f.id && (this.state.view === 'folder' || this.state.view === 'ledger');
      return `
        <div class="nav-btn-wrap" style="position:relative;">
          <button class="nav-btn ${isActive ? 'active' : ''}" onclick="App.openFolder(${f.id})">
            <i class="fas ${f.icon || 'fa-folder'}" style="color: ${f.color || '#3b82f6'}"></i>
            <span style="flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(f.name)}</span>
            <span class="text-xs text-gray-400 ml-1">${f.client_count || 0}</span>
            <span class="ml-1 nav-edit" onclick="event.stopPropagation(); App.editFolder(${f.id})" title="Edit Section"><i class="fas fa-pen text-xs"></i></span>
          </button>
        </div>`;
    }).join('');
  },

  renderCustomSections() {
    const list = document.getElementById('custom-sections-list');
    if (!list) return;
    if (this.state.customSections.length === 0) {
      list.innerHTML = '<p class="text-gray-500 text-xs px-3 py-2">No custom sections.</p>';
      return;
    }
    list.innerHTML = this.state.customSections.map(s => {
      const isActive = this.state.currentCustomSectionId === s.id;
      return `
        <div class="nav-btn-wrap" style="position:relative;">
          <button class="nav-btn ${isActive ? 'active' : ''}" onclick="App.openCustomSection(${s.id})">
            <i class="fas ${s.icon || 'fa-folder'}" style="color: ${s.color || '#3b82f6'}"></i>
            <span style="flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${this.escapeHtml(s.name)}</span>
            <span class="text-xs text-gray-400 ml-1">${s.row_count || 0}</span>
            <span class="ml-1 nav-edit" onclick="event.stopPropagation(); App.editCustomSection(${s.id})" title="Edit"><i class="fas fa-pen text-xs"></i></span>
          </button>
        </div>`;
    }).join('');
  },

  showAddFolder() {
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-folder-plus text-blue-500 mr-2"></i>Add New Section</h2>
      <form id="folder-form" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Section Name</label>
          <input id="f-name" type="text" required class="input-field" placeholder="e.g., Customers, Suppliers"></div>
        <div><label class="block text-sm font-medium mb-1">Icon</label>
          <select id="f-icon" class="input-field">
            <option value="fa-folder">Folder</option><option value="fa-users">Users</option>
            <option value="fa-truck">Truck</option><option value="fa-money-bill-wave">Money</option>
            <option value="fa-building">Building</option><option value="fa-shopping-cart">Cart</option>
            <option value="fa-handshake">Handshake</option><option value="fa-briefcase">Briefcase</option>
            <option value="fa-chart-pie">Chart</option><option value="fa-tag">Tag</option>
          </select></div>
        <div><label class="block text-sm font-medium mb-1">Color</label>
          <input id="f-color" type="color" value="#3b82f6" class="input-field h-12"></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`);
    document.getElementById('folder-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await this.api.post('/api/folders', {
          name: document.getElementById('f-name').value,
          icon: document.getElementById('f-icon').value,
          color: document.getElementById('f-color').value,
          section_type: 'clients'
        });
        this.closeModal();
        await this.loadFolders();
        this.renderFolders();
        this.toast('Section created', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  editFolder(id) {
    const folder = this.state.folders.find(f => f.id === id);
    if (!folder) return;
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-edit text-blue-500 mr-2"></i>Edit Section</h2>
      <form id="folder-edit-form" class="space-y-4">
        <div><label class="block text-sm font-medium mb-1">Name</label>
          <input id="f-name" type="text" required class="input-field" value="${this.escapeAttr(folder.name)}"></div>
        <div><label class="block text-sm font-medium mb-1">Icon</label>
          <select id="f-icon" class="input-field">
            ${['fa-folder','fa-users','fa-truck','fa-money-bill-wave','fa-building','fa-shopping-cart','fa-handshake','fa-briefcase','fa-chart-pie','fa-tag'].map(i => `<option value="${i}" ${folder.icon === i ? 'selected' : ''}>${i.replace('fa-','')}</option>`).join('')}
          </select></div>
        <div><label class="block text-sm font-medium mb-1">Color</label>
          <input id="f-color" type="color" value="${folder.color}" class="input-field h-12"></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-danger mr-auto" onclick="App.deleteFolder(${id})"><i class="fas fa-trash"></i> Delete</button>
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
        </div>
      </form>`);
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
        this.toast('Section updated', 'success');
      } catch (err) { this.toast('Update failed', 'error'); }
    });
  },

  async deleteFolder(id) {
    if (!confirm('Delete this section and ALL its data?')) return;
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
      this.toast('Section deleted', 'success');
    } catch (err) { this.toast('Delete failed', 'error'); }
  },

  // ========= Clients (Section Entries) =========
  async openFolder(folderId) {
    this.state.currentFolderId = folderId;
    this.state.currentCustomSectionId = null;
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
          <p class="page-subtitle">${this.state.clients.length} entry(ies)</p>
        </div>
        <button onclick="App.showAddClient(${folder.id})" class="btn btn-primary">
          <i class="fas fa-user-plus"></i> Add Entry
        </button>
      </div>
      <div class="p-4 md:p-6">
        ${this.state.clients.length === 0 ? `
          <div class="bg-white rounded-xl empty-state">
            <i class="fas fa-user-friends"></i>
            <p class="text-lg mb-2">No entries yet</p>
            <p class="text-sm">Click "Add Entry" to add one</p>
          </div>` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${this.state.clients.map(c => {
              const rec = parseFloat(c.total_received) || 0;
              const pen = parseFloat(c.total_pending) || 0;
              const opn = parseFloat(c.opening_balance) || 0;
              const due = opn + pen - rec;
              return `
              <div class="stat-card cursor-pointer" onclick="App.openClient(${c.id})">
                <div class="flex items-start justify-between">
                  <div class="flex-1 min-w-0">
                    <h3 class="font-bold text-gray-800 text-lg truncate">${this.escapeHtml(c.name)}</h3>
                    ${c.phone ? `<p class="text-sm text-gray-500 mt-1"><i class="fas fa-phone mr-1"></i>${this.escapeHtml(c.phone)}</p>` : ''}
                    <p class="text-xs text-gray-500 mt-2">Due: <span class="amount-running font-bold">PKR ${this.fmt(due)}</span></p>
                  </div>
                  <i class="fas fa-arrow-right text-blue-500 ml-2"></i>
                </div>
              </div>`;
            }).join('')}
          </div>`}
      </div>`;
  },

  showAddClient(folderId) {
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-user-plus text-blue-500 mr-2"></i>Add New Entry</h2>
      <form id="client-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Name *</label><input id="c-name" type="text" required class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Phone</label><input id="c-phone" type="text" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Email</label><input id="c-email" type="email" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Address</label><input id="c-address" type="text" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Opening Balance</label><input id="c-balance" type="number" step="1" value="0" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="c-notes" class="input-field" rows="2"></textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`);
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
        this.toast('Entry added', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
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

  getColLabel(key) { return this.state.columnLabels[key] || this.defaultLabels[key] || key; },

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
      <i class="fas fa-pen col-rename" title="Rename" onclick="App.renameBuiltInCol('${key}')"></i>`;

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
          <div class="stat-card"><p class="text-xs text-gray-500">Opening Balance</p>
            <p class="text-xl font-bold text-gray-800 mt-1">PKR ${this.fmt(opening)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">${this.escapeHtml(this.getColLabel('amount_pending'))}</p>
            <p class="text-xl font-bold mt-1 amount-pending">PKR ${this.fmt(totalPending)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">${this.escapeHtml(this.getColLabel('amount_received'))}</p>
            <p class="text-xl font-bold mt-1 amount-received">PKR ${this.fmt(totalReceived)}</p></div>
          <div class="balance-box"><p class="text-xs opacity-90">Net Balance Due</p>
            <p class="text-2xl font-bold mt-1">PKR ${this.fmt(netBalance)}</p>
            <p class="text-xs opacity-80 mt-1">${netBalance > 0 ? 'Owes you' : netBalance < 0 ? 'You owe' : 'Settled'}</p></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 class="font-bold text-gray-800"><i class="fas fa-book mr-2"></i>Khata / Ledger</h2>
            <button onclick="App.addRow()" class="btn btn-success btn-sm"><i class="fas fa-plus"></i> Add Row</button>
          </div>
          <div class="overflow-x-auto">
            <table class="ledger-table" id="ledger-table">
              <thead><tr>
                <th style="width:40px;">${colHeader('sno')}</th>
                <th style="width:120px;">${colHeader('date')}</th>
                <th style="width:110px;">${colHeader('bill_no')}</th>
                <th style="width:130px;">${colHeader('amount_pending')}</th>
                <th style="width:130px;">${colHeader('amount_received')}</th>
                <th style="width:120px;">${colHeader('status')}</th>
                <th>${colHeader('description')}</th>
                ${this.state.customColumns.map((col, i) => `<th>${this.escapeHtml(col.name)}<i class="fas fa-pen col-rename" onclick="App.renameCustomCol(${i})"></i></th>`).join('')}
                <th style="width:130px;" class="text-right">${colHeader('running_total')}</th>
                <th style="width:90px;">Action</th>
              </tr></thead>
              <tbody id="ledger-body">${this.renderRows(opening)}</tbody>
              <tfoot>
                <tr class="bg-gray-100 font-bold">
                  <td colspan="3" class="text-right">TOTALS:</td>
                  <td class="amount-pending">PKR ${this.fmt(totalPending)}</td>
                  <td class="amount-received">PKR ${this.fmt(totalReceived)}</td>
                  <td colspan="${2 + this.state.customColumns.length}"></td>
                  <td class="text-right amount-running">PKR ${this.fmt(netBalance)}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      </div>`;
  },

  renderRows(opening) {
    if (this.state.transactions.length === 0) {
      return `<tr><td colspan="${9 + this.state.customColumns.length}" class="text-center py-8 text-gray-500">
        <i class="fas fa-inbox text-3xl mb-2 block"></i>No transactions yet. Click "Add Row" to start.</td></tr>`;
    }
    let running = opening;
    return this.state.transactions.map((t, i) => {
      const rec = parseFloat(t.amount_received) || 0;
      const pen = parseFloat(t.amount_pending) || 0;
      running = running + pen - rec;
      const customData = (() => { try { return JSON.parse(t.custom_data || '{}'); } catch { return {}; } })();
      const isAuto = t.auto_generated == 1;
      const lockIcon = isAuto ? `<i class="fas fa-link text-blue-400 ml-1" title="Auto-linked from Bill #${this.escapeAttr(t.bill_no || '')}"></i>` : '';
      return `
        <tr data-id="${t.id}" class="${isAuto ? 'row-auto' : ''}">
          <td class="text-gray-500">${i + 1}${lockIcon}</td>
          <td class="cell-display">${t.entry_date || ''}</td>
          <td class="cell-display">${this.escapeHtml(t.bill_no || '')}</td>
          <td class="amount-pending cell-display">PKR ${this.fmt(pen)}</td>
          <td class="amount-received cell-display">PKR ${this.fmt(rec)}</td>
          <td><span class="status-badge status-${(t.status||'').toLowerCase()}">${this.escapeHtml(t.status || '')}</span></td>
          <td class="cell-display">${this.escapeHtml(t.description || '')}</td>
          ${this.state.customColumns.map(col => `<td class="cell-display">${this.escapeHtml(customData[col.key] || '')}</td>`).join('')}
          <td class="text-right amount-running">PKR ${this.fmt(running)}</td>
          <td class="text-center">
            <button onclick="App.editLedgerRow(${t.id})" class="btn btn-secondary btn-sm" title="Edit"><i class="fas fa-edit"></i></button>
            <button onclick="App.deleteRow(${t.id})" class="text-red-500 hover:text-red-700 ml-1" title="Delete"><i class="fas fa-trash text-sm"></i></button>
          </td>
        </tr>`;
    }).join('');
  },

  // === EDIT LEDGER ROW (POPUP, BILL-STYLE) ===
  editLedgerRow(id) {
    const t = this.state.transactions.find(t => t.id === id);
    if (!t) return;
    const customData = (() => { try { return JSON.parse(t.custom_data || '{}'); } catch { return {}; } })();
    const isAuto = t.auto_generated == 1;

    const customRows = this.state.customColumns.map((col, i) => `
      <div>
        <label class="block text-sm font-medium mb-1">${this.escapeHtml(col.name)}</label>
        <input id="er-cd-${i}" data-key="${this.escapeAttr(col.key)}" type="${col.type === 'number' ? 'number' : 'text'}" 
               class="input-field" value="${this.escapeAttr(customData[col.key] || '')}">
      </div>`).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-edit text-blue-500 mr-2"></i>Edit Ledger Row</h2>
      ${isAuto ? `<div class="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-800">
        <i class="fas fa-link mr-2"></i>This row is auto-linked from Bill <strong>${this.escapeHtml(t.bill_no || '')}</strong>. 
        You can edit it here but updates to the original Bill will overwrite changes.</div>` : ''}
      <form id="ledger-edit-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('date'))}</label>
          <input id="er-date" type="date" class="input-field" value="${t.entry_date || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('bill_no'))}</label>
          <input id="er-bill" type="text" class="input-field" value="${this.escapeAttr(t.bill_no || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('amount_pending'))} (PKR)</label>
          <input id="er-pen" type="number" step="1" min="0" class="input-field" value="${parseInt(t.amount_pending) || 0}"></div>
        <div><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('amount_received'))} (PKR)</label>
          <input id="er-rec" type="number" step="1" min="0" class="input-field" value="${parseInt(t.amount_received) || 0}"></div>
        <div><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('status'))}</label>
          <select id="er-status" class="input-field">
            ${['Pending','Received','Partial','Overdue','Cancelled'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('description'))}</label>
          <textarea id="er-desc" class="input-field" rows="2">${this.escapeHtml(t.description || '')}</textarea></div>
        ${customRows ? `<div class="md:col-span-2 pt-2 border-t"><h3 class="font-semibold text-sm text-gray-700 mb-2">Custom Columns</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${customRows}</div></div>` : ''}
        <div class="md:col-span-2 flex gap-2 justify-end pt-3 border-t">
          <button type="button" class="btn btn-danger mr-auto" onclick="App.deleteRow(${id})"><i class="fas fa-trash"></i> Delete</button>
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');

    document.getElementById('ledger-edit-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newCustom = {};
      document.querySelectorAll('#ledger-edit-form [id^="er-cd-"]').forEach(el => {
        newCustom[el.dataset.key] = el.value;
      });
      const billNo = (document.getElementById('er-bill').value || '').trim();
      if (billNo && !this.validateBillNo(billNo)) return;
      try {
        const res = await fetch(`/api/transactions/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({
            entry_date: document.getElementById('er-date').value,
            bill_no: billNo,
            amount_received: parseInt(document.getElementById('er-rec').value) || 0,
            amount_pending: parseInt(document.getElementById('er-pen').value) || 0,
            status: document.getElementById('er-status').value,
            description: document.getElementById('er-desc').value,
            custom_data: newCustom
          })
        });
        const data = await res.json();
        if (!res.ok || data.error) { this.toast(data.error || 'Update failed', 'error'); return; }
        App._cache = {};
        this.closeModal();
        await this.refreshLedger();
        this.toast('Row updated', 'success');
      } catch (err) { this.toast('Update failed', 'error'); }
    });
  },

  validateBillNo(billNo) {
    const t = (billNo || '').trim();
    if (!t) return true;
    const digits = (t.match(/\d/g) || []).length;
    if (digits < 3) {
      this.toast('Bill No must contain at least 3 digits', 'error');
      return false;
    }
    return true;
  },

  async renameBuiltInCol(key) {
    const current = this.getColLabel(key);
    const newName = prompt(`Rename "${this.defaultLabels[key]}" column to:`, current);
    if (newName === null) return;
    const trimmed = newName.trim();
    const labels = { ...this.state.columnLabels };
    if (!trimmed || trimmed === this.defaultLabels[key]) delete labels[key];
    else labels[key] = trimmed;
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
      const res = await this.api.post('/api/transactions', {
        client_id: this.state.currentClientId,
        entry_date: new Date().toISOString().slice(0, 10),
        bill_no: '', amount_received: 0, amount_pending: 0,
        status: 'Pending', description: ''
      });
      if (res?.error) { this.toast(res.error, 'error'); return; }
      await this.refreshLedger();
      this.toast('Row added', 'success');
      // Open editor on the new row
      if (res?.id) setTimeout(() => this.editLedgerRow(res.id), 100);
    } catch (e) { this.toast('Failed', 'error'); }
  },

  async deleteRow(id) {
    if (!confirm('Delete this row?')) return;
    try {
      await this.api.delete(`/api/transactions/${id}`);
      this.closeModal();
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
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-user-edit text-blue-500 mr-2"></i>Edit Entry</h2>
      <form id="client-edit-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Name *</label><input id="c-name" type="text" required class="input-field" value="${this.escapeAttr(c.name)}"></div>
        <div><label class="block text-sm font-medium mb-1">Phone</label><input id="c-phone" type="text" class="input-field" value="${this.escapeAttr(c.phone || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Email</label><input id="c-email" type="email" class="input-field" value="${this.escapeAttr(c.email || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Address</label><input id="c-address" type="text" class="input-field" value="${this.escapeAttr(c.address || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Opening Balance</label><input id="c-balance" type="number" step="1" class="input-field" value="${c.opening_balance || 0}"></div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="c-notes" class="input-field" rows="2">${this.escapeHtml(c.notes || '')}</textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
        </div>
      </form>`);
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
        this.toast('Updated', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  async deleteClient() {
    const c = this.state.currentClient;
    if (!confirm(`Delete "${c.name}" and all data?`)) return;
    try {
      await this.api.delete(`/api/clients/${c.id}`);
      const folderId = c.folder_id;
      this.state.currentClientId = null;
      await this.loadFolders();
      await this.openFolder(folderId);
      this.toast('Deleted', 'success');
    } catch (err) { this.toast('Failed', 'error'); }
  },

  showCustomColumns() {
    this._tempCols = [...this.state.customColumns];
    const renderColsList = () => this._tempCols.map((col, i) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-col-name="${i}" value="${this.escapeAttr(col.name)}">
        <select class="input-field" style="width:120px;" data-col-type="${i}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeCol(${i})"><i class="fas fa-times"></i></button>
      </div>`).join('');
    this._removeCol = (i) => {
      this._tempCols.splice(i, 1);
      document.getElementById('cols-list').innerHTML = renderColsList();
    };
    const lbl = this.state.columnLabels;
    const builtInRows = Object.entries(this.defaultLabels).map(([key, def]) => `
      <div class="flex gap-2 items-center mb-2">
        <span class="text-sm text-gray-500" style="width:140px;">${this.escapeHtml(def)}:</span>
        <input type="text" class="input-field flex-1" data-builtin="${key}" value="${this.escapeAttr(lbl[key] || '')}" placeholder="${this.escapeAttr(def)}">
      </div>`).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-3"><i class="fas fa-columns text-blue-500 mr-2"></i>Manage Columns</h2>
      <div class="border-b pb-3 mb-3">
        <h3 class="font-semibold text-sm text-gray-700 mb-2"><i class="fas fa-edit mr-1"></i>Rename Existing Columns</h3>
        ${builtInRows}
      </div>
      <h3 class="font-semibold text-sm text-gray-700 mb-2"><i class="fas fa-plus-circle mr-1"></i>Custom Extra Columns</h3>
      <div id="cols-list">${renderColsList()}</div>
      <button type="button" class="btn btn-secondary btn-sm mb-3" onclick="App._addColRow()"><i class="fas fa-plus"></i> Add Column</button>
      <div class="flex gap-2 justify-end pt-2 border-t">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="App._saveColumns()"><i class="fas fa-save"></i> Save</button>
      </div>`, 'modal-lg');
  },

  _addColRow() {
    this._tempCols.push({ name: 'New Column', type: 'text', key: 'col_' + Date.now() });
    document.getElementById('cols-list').innerHTML = this._tempCols.map((col, j) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-col-name="${j}" value="${this.escapeAttr(col.name)}">
        <select class="input-field" style="width:120px;" data-col-type="${j}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeCol(${j})"><i class="fas fa-times"></i></button>
      </div>`).join('');
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
    const labels = {};
    document.querySelectorAll('[data-builtin]').forEach(el => {
      const v = el.value.trim();
      if (v) labels[el.dataset.builtin] = v;
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
      this.toast('Saved', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= Dashboard =========
  async showDashboard() {
    this.state.view = 'dashboard';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.state.currentCustomSectionId = null;
    this.setActiveNav('dashboard');
    this.closeSidebarOnMobile();
    this.renderFolders();
    this.renderCustomSections();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-chart-line text-purple-500"></i>Dashboard</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const data = await this.api.get('/api/dashboard');
      this.renderDashboard(data);
    } catch (e) {}
  },

  renderDashboard(data) {
    const { totals, perFolder, topPending, recent, statuses, clientCount, folderCount, billStats,
            empCount, empPaid, empAdvance, expenseStats, rawStats, customSecCount } = data;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-chart-line text-purple-500"></i>Dashboard</h1>
          <p class="page-subtitle">Overall financial summary — auto-updated</p>
        </div>
        <button onclick="App.showDashboard()" class="btn btn-secondary btn-sm"><i class="fas fa-sync-alt"></i> Refresh</button>
      </div>

      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-arrow-down mr-1"></i>Total Received</p>
            <p class="text-xl font-bold mt-1 amount-received">PKR ${this.fmt(totals.total_received)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-clock mr-1"></i>Total Pending</p>
            <p class="text-xl font-bold mt-1 amount-pending">PKR ${this.fmt(totals.total_pending)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-balance-scale mr-1"></i>Net Balance</p>
            <p class="text-xl font-bold mt-1 amount-running">PKR ${this.fmt((totals.total_pending||0) - (totals.total_received||0))}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-file-invoice mr-1"></i>Bills</p>
            <p class="text-xl font-bold text-purple-600 mt-1">${billStats?.count || 0}</p>
            <p class="text-xs text-gray-400 mt-1">PKR ${this.fmt(billStats?.total_amount || 0)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-users mr-1"></i>Clients/Sections</p>
            <p class="text-xl font-bold text-blue-600 mt-1">${clientCount} / ${folderCount}</p></div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="stat-card cursor-pointer" onclick="App.showRawMaterials()">
            <p class="text-xs text-gray-500"><i class="fas fa-cubes mr-1"></i>Raw Materials</p>
            <p class="text-xl font-bold text-orange-600 mt-1">${rawStats?.count || 0} items</p>
            <p class="text-xs text-gray-400 mt-1">Stock Value: PKR ${this.fmt(rawStats?.total || 0)}</p>
          </div>
          <div class="stat-card cursor-pointer" onclick="App.showEmployees()">
            <p class="text-xs text-gray-500"><i class="fas fa-user-tie mr-1"></i>Employees</p>
            <p class="text-xl font-bold text-blue-600 mt-1">${empCount}</p>
            <p class="text-xs text-gray-400 mt-1">Paid: PKR ${this.fmt(empPaid)} | Advance: PKR ${this.fmt(empAdvance)}</p>
          </div>
          <div class="stat-card cursor-pointer" onclick="App.showSideExpenses()">
            <p class="text-xs text-gray-500"><i class="fas fa-money-bill-wave mr-1"></i>Side Expenses</p>
            <p class="text-xl font-bold text-red-600 mt-1">${expenseStats?.count || 0}</p>
            <p class="text-xs text-gray-400 mt-1">Total: PKR ${this.fmt(expenseStats?.total || 0)}</p>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-folder-tree mr-2"></i>Per-Section Summary</h2>
          ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-4">No sections yet</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Section</th><th class="text-right p-3">Entries</th>
                <th class="text-right p-3">Received</th><th class="text-right p-3">Pending</th><th class="text-right p-3">Net</th>
              </tr></thead><tbody>
                ${perFolder.map(f => `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openFolder(${f.id})">
                    <td class="p-3"><i class="fas ${f.icon} mr-2" style="color:${f.color}"></i>${this.escapeHtml(f.name)}</td>
                    <td class="text-right p-3">${f.client_count}</td>
                    <td class="text-right p-3 amount-received">PKR ${this.fmt(f.total_received)}</td>
                    <td class="text-right p-3 amount-pending">PKR ${this.fmt(f.total_pending)}</td>
                    <td class="text-right p-3 amount-running">PKR ${this.fmt(f.total_pending - f.total_received)}</td>
                  </tr>`).join('')}
              </tbody></table></div>`}
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-chart-pie mr-2"></i>Status Breakdown</h2>
            ${statuses.length === 0 ? '<p class="text-gray-500 text-center py-8">No transactions</p>' : '<canvas id="statusChart" height="200"></canvas>'}
          </div>
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-chart-bar mr-2"></i>Section Comparison</h2>
            ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-8">No data</p>' : '<canvas id="folderChart" height="200"></canvas>'}
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>Top Pending Clients</h2>
          ${topPending.filter(c => c.pending > 0).length === 0 ? '<p class="text-gray-500 text-center py-4">No pending amounts</p>' : `
            <div class="space-y-2">${topPending.filter(c => c.pending > 0).map(c => `
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer" onclick="App.openClient(${c.id})">
                <div><p class="font-medium text-gray-800">${this.escapeHtml(c.name)}</p>
                  <p class="text-xs text-gray-500">${this.escapeHtml(c.folder_name || '')}</p></div>
                <div class="text-right"><p class="font-bold amount-pending">PKR ${this.fmt(c.pending)}</p>
                  <p class="text-xs text-gray-500">Received: PKR ${this.fmt(c.received)}</p></div>
              </div>`).join('')}</div>`}
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-history mr-2"></i>Recent Transactions</h2>
          ${recent.length === 0 ? '<p class="text-gray-500 text-center py-4">No transactions</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-2">Date</th><th class="text-left p-2">Client</th>
                <th class="text-left p-2">Bill</th><th class="text-right p-2">Received</th>
                <th class="text-right p-2">Pending</th><th class="text-left p-2">Status</th>
              </tr></thead><tbody>
                ${recent.map(t => `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openClient(${t.client_id})">
                    <td class="p-2">${t.entry_date}</td>
                    <td class="p-2">${this.escapeHtml(t.client_name || '')} <span class="text-xs text-gray-500">/ ${this.escapeHtml(t.folder_name || '')}</span></td>
                    <td class="p-2">${this.escapeHtml(t.bill_no || '-')}</td>
                    <td class="p-2 text-right amount-received">PKR ${this.fmt(t.amount_received)}</td>
                    <td class="p-2 text-right amount-pending">PKR ${this.fmt(t.amount_pending)}</td>
                    <td class="p-2"><span class="status-badge status-${(t.status||'').toLowerCase()}">${this.escapeHtml(t.status || '')}</span></td>
                  </tr>`).join('')}
              </tbody></table></div>`}
        </div>
      </div>`;

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
      <div class="page-header"><h1 class="page-title"><i class="fas fa-boxes text-orange-500"></i>Inventory</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const data = await this.api.get('/api/inventory');
      this.state.inventory = data.items || [];
      this.renderInventory();
    } catch (e) {}
  },

  renderInventory(filter = '') {
    const items = filter ? this.state.inventory.filter(i =>
      (i.name || '').toLowerCase().includes(filter.toLowerCase()) ||
      (i.sku || '').toLowerCase().includes(filter.toLowerCase()) ||
      (i.category || '').toLowerCase().includes(filter.toLowerCase())) : this.state.inventory;
    const totalValue = this.state.inventory.reduce((s, i) => s + (parseFloat(i.rate) || 0) * (parseFloat(i.quantity) || 0), 0);
    const totalQty = this.state.inventory.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fas fa-boxes text-orange-500"></i>Inventory</h1>
          <p class="page-subtitle">${this.state.inventory.length} product(s) · Total Value: PKR ${this.fmt(totalValue)}</p></div>
        <div class="flex gap-2 flex-wrap">
          <input type="text" id="inv-search" placeholder="Search..." class="input-field" style="max-width:240px;" oninput="App.renderInventory(this.value)" value="${this.escapeAttr(filter)}">
          <button onclick="App.showInventoryEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Product</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Products</p><p class="text-xl font-bold text-blue-600">${this.state.inventory.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Quantity</p><p class="text-xl font-bold text-purple-600">${this.fmt(totalQty)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Inventory Value</p><p class="text-xl font-bold amount-running">PKR ${this.fmt(totalValue)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Low Stock (≤5)</p><p class="text-xl font-bold text-red-600">${this.state.inventory.filter(i => (parseFloat(i.quantity)||0) <= 5).length}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Product</th><th style="width:120px;">SKU</th>
              <th style="width:90px;">Unit</th><th style="width:120px;">Rate</th>
              <th style="width:120px;">Qty</th><th style="width:130px;">Stock Value</th>
              <th style="width:120px;">Category</th><th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="9" class="text-center py-8 text-gray-500">
                <i class="fas fa-box-open text-3xl mb-2 block"></i>${filter ? 'No matching products' : 'No products yet.'}</td></tr>` :
                items.map((it, i) => {
                  const rate = parseFloat(it.rate) || 0, qty = parseFloat(it.quantity) || 0;
                  const value = rate * qty, lowStock = qty <= 5;
                  return `<tr>
                    <td class="text-gray-500">${i + 1}</td>
                    <td>${this.escapeHtml(it.name)}</td>
                    <td>${this.escapeHtml(it.sku || '')}</td>
                    <td>${this.escapeHtml(it.unit || 'pcs')}</td>
                    <td>${this.fmt(rate)}</td>
                    <td class="${lowStock ? 'low-stock' : 'in-stock'}">${this.fmt(qty)}</td>
                    <td class="amount-running text-right font-bold">PKR ${this.fmt(value)}</td>
                    <td>${this.escapeHtml(it.category || '')}</td>
                    <td>
                      <button onclick="App.showInventoryEditor(${it.id})" class="btn btn-secondary btn-sm" title="Edit"><i class="fas fa-edit"></i></button>
                      <button onclick="App.deleteInv(${it.id})" class="text-red-500 hover:text-red-700 ml-1" title="Delete"><i class="fas fa-trash text-sm"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  showInventoryEditor(id = null) {
    const it = id ? this.state.inventory.find(x => x.id === id) : { name:'', sku:'', unit:'pcs', rate:0, quantity:0, category:'', notes:'' };
    if (id && !it) return;
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-box text-orange-500 mr-2"></i>${id ? 'Edit' : 'Add'} Product</h2>
      <form id="inv-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Product Name *</label>
          <input id="i-name" type="text" required class="input-field" value="${this.escapeAttr(it.name || '')}"></div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">SKU</label><input id="i-sku" type="text" class="input-field" value="${this.escapeAttr(it.sku || '')}"></div>
          <div><label class="block text-sm font-medium mb-1">Unit</label><input id="i-unit" type="text" class="input-field" value="${this.escapeAttr(it.unit || 'pcs')}"></div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">Rate (PKR)</label><input id="i-rate" type="number" step="1" class="input-field" value="${it.rate || 0}"></div>
          <div><label class="block text-sm font-medium mb-1">Quantity</label><input id="i-qty" type="number" step="1" class="input-field" value="${it.quantity || 0}"></div>
        </div>
        <div><label class="block text-sm font-medium mb-1">Category</label><input id="i-cat" type="text" class="input-field" value="${this.escapeAttr(it.category || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="i-notes" class="input-field" rows="2">${this.escapeHtml(it.notes || '')}</textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteInv(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`);
    document.getElementById('inv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('i-name').value,
        sku: document.getElementById('i-sku').value,
        unit: document.getElementById('i-unit').value || 'pcs',
        rate: parseFloat(document.getElementById('i-rate').value) || 0,
        quantity: parseFloat(document.getElementById('i-qty').value) || 0,
        category: document.getElementById('i-cat').value,
        notes: document.getElementById('i-notes').value
      };
      try {
        if (id) await this.api.put(`/api/inventory/${id}`, payload);
        else await this.api.post('/api/inventory', payload);
        this.closeModal();
        await this.showInventory();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  async deleteInv(id) {
    if (!confirm('Delete this product?')) return;
    try {
      await this.api.delete(`/api/inventory/${id}`);
      this.closeModal();
      await this.showInventory();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= RAW MATERIALS =========
  async showRawMaterials() {
    this.state.view = 'raw';
    this.state.currentFolderId = null;
    this.setActiveNav('raw');
    this.closeSidebarOnMobile();
    this.renderFolders();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-cubes text-orange-500"></i>Raw Material</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const [rmData, supData] = await Promise.all([
        this.api.get('/api/raw-materials'),
        this.api.get('/api/suppliers')
      ]);
      this.state.rawMaterials = rmData.items || [];
      this.state.allClients = supData.suppliers || [];
      this.renderRawMaterials();
    } catch (e) {}
  },

  renderRawMaterials() {
    const items = this.state.rawMaterials;
    const totalValue = items.reduce((s, i) => s + (parseFloat(i.total_value) || 0), 0);
    const totalQty = items.reduce((s, i) => s + (parseFloat(i.quantity) || 0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fas fa-cubes text-orange-500"></i>Raw Material</h1>
          <p class="page-subtitle">${items.length} item(s) · Total Value: PKR ${this.fmt(totalValue)}</p></div>
        <button onclick="App.showRawEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Raw Material</button>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Items</p><p class="text-xl font-bold text-blue-600">${items.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Quantity</p><p class="text-xl font-bold text-purple-600">${this.fmt(totalQty)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Stock Value</p><p class="text-xl font-bold amount-running">PKR ${this.fmt(totalValue)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Low Stock (≤5)</p><p class="text-xl font-bold text-red-600">${items.filter(i => (parseFloat(i.quantity)||0) <= 5).length}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Material Name</th>
              <th style="width:90px;">Unit</th><th style="width:110px;">Quantity</th>
              <th style="width:110px;">Rate</th><th style="width:130px;">Total Value</th>
              <th>Supplier</th><th style="width:120px;">Category</th>
              <th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="9" class="text-center py-8 text-gray-500">
                <i class="fas fa-cubes text-3xl mb-2 block"></i>No raw materials yet.</td></tr>` :
                items.map((it, i) => {
                  const lowStock = (parseFloat(it.quantity) || 0) <= 5;
                  const supName = it.supplier_name_resolved || it.supplier_name || '';
                  return `<tr>
                    <td class="text-gray-500">${i + 1}</td>
                    <td>${this.escapeHtml(it.name)}</td>
                    <td>${this.escapeHtml(it.unit || 'pcs')}</td>
                    <td class="${lowStock ? 'low-stock' : 'in-stock'}">${this.fmt(it.quantity)}</td>
                    <td>${this.fmt(it.rate)}</td>
                    <td class="amount-running text-right font-bold">PKR ${this.fmt(it.total_value)}</td>
                    <td>${it.supplier_id ? `<a href="#" onclick="App.openClient(${it.supplier_id}); return false;" class="text-blue-500 hover:underline">${this.escapeHtml(supName)}</a>` : this.escapeHtml(supName)}</td>
                    <td>${this.escapeHtml(it.category || '')}</td>
                    <td>
                      <button onclick="App.showRawEditor(${it.id})" class="btn btn-secondary btn-sm" title="Edit"><i class="fas fa-edit"></i></button>
                      <button onclick="App.deleteRaw(${it.id})" class="text-red-500 hover:text-red-700 ml-1"><i class="fas fa-trash text-sm"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  showRawEditor(id = null) {
    const it = id ? this.state.rawMaterials.find(x => x.id === id) : { name:'', unit:'pcs', quantity:0, rate:0, supplier_id:null, supplier_name:'', category:'', notes:'' };
    if (id && !it) return;
    const supplierOpts = this.state.allClients.map(c => `<option value="${c.id}" ${it.supplier_id == c.id ? 'selected' : ''}>${this.escapeHtml(c.name)} (${this.escapeHtml(c.folder_name || '')})</option>`).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-cubes text-orange-500 mr-2"></i>${id ? 'Edit' : 'Add'} Raw Material</h2>
      <form id="raw-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Material Name *</label>
          <input id="r-name" type="text" required class="input-field" value="${this.escapeAttr(it.name || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Unit</label>
          <select id="r-unit" class="input-field">
            ${['pcs','kg','gram','ton','litre','ml','meter','cm','foot','inch','yard','box','dozen','pack','roll','bag','bottle','bundle','sheet','set','pair','carton'].map(u => `<option value="${u}" ${ (it.unit || 'pcs') === u ? 'selected' : ''}>${u}</option>`).join('')}
          </select></div>
        <div><label class="block text-sm font-medium mb-1">Category</label>
          <input id="r-cat" type="text" class="input-field" value="${this.escapeAttr(it.category || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Quantity Available</label>
          <input id="r-qty" type="number" step="1" class="input-field" value="${it.quantity || 0}" oninput="App._calcRawTotal()"></div>
        <div><label class="block text-sm font-medium mb-1">Rate per Unit (PKR)</label>
          <input id="r-rate" type="number" step="1" class="input-field" value="${it.rate || 0}" oninput="App._calcRawTotal()"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Total Value</label>
          <div id="r-total" class="input-field" style="background:#f8fafc; font-weight:bold;">PKR 0.00</div></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Supplier (link to client)</label>
          <select id="r-supplier" class="input-field">
            <option value="">-- None / Manual --</option>
            ${supplierOpts}
          </select>
          <p class="text-xs text-gray-500 mt-1">Linking to a supplier auto-shows totals on their ledger summary.</p></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Supplier Name (manual, if not linked)</label>
          <input id="r-supname" type="text" class="input-field" value="${this.escapeAttr(it.supplier_name || '')}"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label>
          <textarea id="r-notes" class="input-field" rows="2">${this.escapeHtml(it.notes || '')}</textarea></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteRaw(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');
    this._calcRawTotal();
    document.getElementById('raw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('r-name').value,
        unit: document.getElementById('r-unit').value || 'pcs',
        quantity: parseFloat(document.getElementById('r-qty').value) || 0,
        rate: parseFloat(document.getElementById('r-rate').value) || 0,
        supplier_id: document.getElementById('r-supplier').value ? parseInt(document.getElementById('r-supplier').value) : null,
        supplier_name: document.getElementById('r-supname').value,
        category: document.getElementById('r-cat').value,
        notes: document.getElementById('r-notes').value
      };
      try {
        if (id) await this.api.put(`/api/raw-materials/${id}`, payload);
        else await this.api.post('/api/raw-materials', payload);
        this.closeModal();
        await this.showRawMaterials();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  _calcRawTotal() {
    const qty = parseFloat(document.getElementById('r-qty')?.value) || 0;
    const rate = parseFloat(document.getElementById('r-rate')?.value) || 0;
    const total = document.getElementById('r-total');
    if (total) total.textContent = 'PKR ' + this.fmt(qty * rate);
  },

  async deleteRaw(id) {
    if (!confirm('Delete this raw material?')) return;
    try {
      await this.api.delete(`/api/raw-materials/${id}`);
      this.closeModal();
      await this.showRawMaterials();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= EMPLOYEES =========
  async showEmployees() {
    this.state.view = 'employees';
    this.state.currentFolderId = null;
    this.setActiveNav('employees');
    this.closeSidebarOnMobile();
    this.renderFolders();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-user-tie text-blue-500"></i>Employees</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const data = await this.api.get('/api/employees');
      this.state.employees = data.employees || [];
      this.renderEmployeesList();
    } catch (e) {}
  },

  renderEmployeesList() {
    const emps = this.state.employees;
    const totalSalary = emps.reduce((s, e) => s + (parseFloat(e.monthly_salary) || 0), 0);
    const totalPaid = emps.reduce((s, e) => s + (parseFloat(e.total_paid) || 0), 0);
    const totalAdvance = emps.reduce((s, e) => s + (parseFloat(e.total_advance) || 0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fas fa-user-tie text-blue-500"></i>Employees</h1>
          <p class="page-subtitle">${emps.length} employee(s) · Monthly Salaries: PKR ${this.fmt(totalSalary)}</p></div>
        <button onclick="App.showEmployeeEditor()" class="btn btn-primary"><i class="fas fa-user-plus"></i> Add Employee</button>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Active Employees</p><p class="text-xl font-bold text-blue-600">${emps.filter(e => e.active).length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Monthly Salaries</p><p class="text-xl font-bold text-purple-600">PKR ${this.fmt(totalSalary)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Paid (all-time)</p><p class="text-xl font-bold amount-received">PKR ${this.fmt(totalPaid)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Advance</p><p class="text-xl font-bold amount-pending">PKR ${this.fmt(totalAdvance)}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Name</th><th>Designation</th>
              <th>Phone</th><th class="text-right">Salary</th>
              <th class="text-right">Paid</th><th class="text-right">Advance</th>
              <th>Status</th><th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${emps.length === 0 ? `<tr><td colspan="9" class="text-center py-8 text-gray-500">
                <i class="fas fa-user-tie text-3xl mb-2 block"></i>No employees yet.</td></tr>` :
                emps.map((e, i) => {
                  const isPiece = e.salary_type === 'per_piece';
                  return `
                  <tr class="cursor-pointer hover:bg-gray-50" onclick="App.openEmployee(${e.id})">
                    <td>${i + 1}</td>
                    <td class="font-semibold">${this.escapeHtml(e.name)}${isPiece ? ' <i class="fas fa-cubes text-orange-500 ml-1" title="Per Piece"></i>' : ''}</td>
                    <td>${this.escapeHtml(e.designation || '-')}</td>
                    <td>${this.escapeHtml(e.phone || '-')}</td>
                    <td class="text-right">${isPiece ? '<span class="text-xs text-orange-600">Per Piece</span>' : 'PKR ' + this.fmt(e.monthly_salary)}</td>
                    <td class="text-right amount-received">PKR ${this.fmt(e.total_paid)}</td>
                    <td class="text-right amount-pending">PKR ${this.fmt(e.total_advance)}</td>
                    <td><span class="status-badge ${e.active ? 'status-received' : 'status-cancelled'}">${e.active ? 'Active' : 'Inactive'}</span></td>
                    <td onclick="event.stopPropagation()">
                      <button onclick="App.showEmployeeEditor(${e.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                    </td>
                  </tr>`}).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  async showEmployeeEditor(id = null) {
    let e = id ? this.state.employees.find(x => x.id === id) : { name:'', phone:'', cnic:'', address:'', designation:'', joining_date:'', monthly_salary:0, notes:'', active:1, salary_type:'monthly' };
    if (id && !e) return;
    let items = [];
    if (id) {
      try {
        const det = await this.api.get(`/api/employees/${id}`);
        e = det.employee || e;
        items = det.items || [];
      } catch {}
    }
    this._tempEmpItems = items.map(it => ({ item_name: it.item_name || '', rate: it.rate || 0 }));
    if (this._tempEmpItems.length === 0) this._tempEmpItems = [{ item_name: '', rate: 0 }];
    const sType = e.salary_type === 'per_piece' ? 'per_piece' : 'monthly';

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-user-tie text-blue-500 mr-2"></i>${id ? 'Edit' : 'Add'} Employee</h2>
      <form id="emp-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Name *</label><input id="e-name" type="text" required class="input-field" value="${this.escapeAttr(e.name || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Designation</label><input id="e-desig" type="text" class="input-field" value="${this.escapeAttr(e.designation || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Phone</label><input id="e-phone" type="text" class="input-field" value="${this.escapeAttr(e.phone || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">CNIC</label><input id="e-cnic" type="text" class="input-field" value="${this.escapeAttr(e.cnic || '')}"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Address</label><input id="e-addr" type="text" class="input-field" value="${this.escapeAttr(e.address || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Joining Date</label><input id="e-join" type="date" class="input-field" value="${e.joining_date || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">Salary Type</label>
          <select id="e-stype" class="input-field" onchange="App._toggleSalaryType()">
            <option value="monthly" ${sType === 'monthly' ? 'selected' : ''}>Monthly Salary</option>
            <option value="per_piece" ${sType === 'per_piece' ? 'selected' : ''}>Per Piece</option>
          </select></div>

        <div id="e-monthly-wrap" class="md:col-span-2" style="${sType === 'monthly' ? '' : 'display:none;'}">
          <label class="block text-sm font-medium mb-1">Monthly Salary (PKR)</label>
          <input id="e-sal" type="number" step="1" min="0" class="input-field" value="${parseInt(e.monthly_salary) || 0}">
        </div>

        <div id="e-piece-wrap" class="md:col-span-2" style="${sType === 'per_piece' ? '' : 'display:none;'}">
          <label class="block text-sm font-medium mb-2"><i class="fas fa-cubes text-orange-500 mr-1"></i>Items (Per Piece Rate)</label>
          <div id="emp-items-list"></div>
          <button type="button" class="btn btn-secondary btn-sm mt-1" onclick="App._addEmpItemRow()"><i class="fas fa-plus"></i> Add Item</button>
        </div>

        <div><label class="block text-sm font-medium mb-1">Status</label>
          <select id="e-active" class="input-field">
            <option value="1" ${e.active ? 'selected' : ''}>Active</option>
            <option value="0" ${!e.active ? 'selected' : ''}>Inactive</option>
          </select></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label><textarea id="e-notes" class="input-field" rows="2">${this.escapeHtml(e.notes || '')}</textarea></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteEmployee(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');
    this._renderEmpItems();
    document.getElementById('emp-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const sType = document.getElementById('e-stype').value;
      // Capture items from DOM
      this._captureEmpItems();
      const cleanItems = (this._tempEmpItems || []).filter(i => (i.item_name || '').trim().length > 0);
      if (sType === 'per_piece' && cleanItems.length === 0) {
        this.toast('Add at least 1 item with name & rate for Per Piece', 'error'); return;
      }
      const payload = {
        name: document.getElementById('e-name').value,
        designation: document.getElementById('e-desig').value,
        phone: document.getElementById('e-phone').value,
        cnic: document.getElementById('e-cnic').value,
        address: document.getElementById('e-addr').value,
        joining_date: document.getElementById('e-join').value,
        monthly_salary: sType === 'monthly' ? (parseInt(document.getElementById('e-sal').value) || 0) : 0,
        notes: document.getElementById('e-notes').value,
        active: parseInt(document.getElementById('e-active').value),
        salary_type: sType,
        items: cleanItems
      };
      try {
        if (id) await this.api.put(`/api/employees/${id}`, payload);
        else await this.api.post('/api/employees', payload);
        this.closeModal();
        await this.showEmployees();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  _toggleSalaryType() {
    const t = document.getElementById('e-stype').value;
    document.getElementById('e-monthly-wrap').style.display = t === 'monthly' ? '' : 'none';
    document.getElementById('e-piece-wrap').style.display = t === 'per_piece' ? '' : 'none';
  },

  _renderEmpItems() {
    const list = document.getElementById('emp-items-list');
    if (!list) return;
    list.innerHTML = this._tempEmpItems.map((it, i) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2" data-emp-item="${i}">
        <input type="text" class="input-field flex-1" data-ei-name="${i}" value="${this.escapeAttr(it.item_name || '')}" placeholder="Item name (e.g., Shirt, Trouser)">
        <input type="number" step="1" min="0" class="input-field" style="width:120px;" data-ei-rate="${i}" value="${parseInt(it.rate) || 0}" placeholder="Rate (PKR)">
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeEmpItemRow(${i})"><i class="fas fa-times"></i></button>
      </div>`).join('');
  },

  _captureEmpItems() {
    document.querySelectorAll('#emp-items-list [data-ei-name]').forEach(el => {
      const i = parseInt(el.dataset.eiName);
      if (this._tempEmpItems[i]) this._tempEmpItems[i].item_name = el.value;
    });
    document.querySelectorAll('#emp-items-list [data-ei-rate]').forEach(el => {
      const i = parseInt(el.dataset.eiRate);
      if (this._tempEmpItems[i]) this._tempEmpItems[i].rate = parseInt(el.value) || 0;
    });
  },

  _addEmpItemRow() {
    this._captureEmpItems();
    this._tempEmpItems.push({ item_name: '', rate: 0 });
    this._renderEmpItems();
  },

  _removeEmpItemRow(i) {
    this._captureEmpItems();
    this._tempEmpItems.splice(i, 1);
    if (this._tempEmpItems.length === 0) this._tempEmpItems.push({ item_name: '', rate: 0 });
    this._renderEmpItems();
  },

  async deleteEmployee(id) {
    if (!confirm('Delete this employee and all their salary records?')) return;
    try {
      await this.api.delete(`/api/employees/${id}`);
      this.closeModal();
      await this.showEmployees();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  async openEmployee(id) {
    try {
      const data = await this.api.get(`/api/employees/${id}`);
      this.state.currentEmployee = data.employee;
      this.state.employeeTransactions = data.transactions || [];
      this.state.currentEmployeeItems = data.items || [];
      this.renderEmployeeDetail();
    } catch (e) {}
  },

  renderEmployeeDetail() {
    const e = this.state.currentEmployee;
    const tx = this.state.employeeTransactions;
    const sumByType = (t) => tx.filter(x => x.type === t).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
    const paid = sumByType('salary'), advance = sumByType('advance'), bonus = sumByType('bonus'), deduction = sumByType('deduction');
    const net = paid + bonus - advance - deduction;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <div class="text-xs text-gray-500"><a href="#" onclick="App.showEmployees(); return false;" class="hover:text-blue-500"><i class="fas fa-user-tie mr-1"></i>Employees</a></div>
          <h1 class="page-title">${this.escapeHtml(e.name)}</h1>
          <p class="page-subtitle">${this.escapeHtml(e.designation || '')} · ${e.phone ? `<i class="fas fa-phone mx-1"></i>${this.escapeHtml(e.phone)}` : ''} · Salary PKR ${this.fmt(e.monthly_salary)}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="App.showEmployeeEditor(${e.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i> Edit</button>
          <button onclick="App.showEmployeeTxEditor(${e.id})" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> New Entry</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Salary Paid</p><p class="text-xl font-bold amount-received">PKR ${this.fmt(paid)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Advance</p><p class="text-xl font-bold amount-pending">PKR ${this.fmt(advance)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Bonus</p><p class="text-xl font-bold text-green-600">PKR ${this.fmt(bonus)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Deduction</p><p class="text-xl font-bold text-red-600">PKR ${this.fmt(deduction)}</p></div>
          <div class="balance-box"><p class="text-xs opacity-90">Net Settled</p><p class="text-2xl font-bold mt-1">PKR ${this.fmt(net)}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h2 class="font-bold text-gray-800"><i class="fas fa-history mr-2"></i>Salary / Advance Records</h2>
          </div>
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Date</th><th>Type</th>
              <th>Item / Description</th><th class="text-right">Qty</th>
              <th class="text-right">Rate</th><th class="text-right">Amount</th>
              <th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${tx.length === 0 ? `<tr><td colspan="8" class="text-center py-8 text-gray-500"><i class="fas fa-inbox text-3xl mb-2 block"></i>No records yet.</td></tr>` :
                tx.map((t, i) => {
                  const isPiece = t.entry_type === 'per_piece';
                  return `<tr>
                  <td>${i + 1}</td>
                  <td>${t.entry_date}</td>
                  <td><span class="status-badge ${t.type === 'salary' ? 'status-received' : t.type === 'advance' ? 'status-pending' : t.type === 'bonus' ? 'status-paid' : 'status-overdue'}">${this.escapeHtml(t.type)}</span>${isPiece ? ' <i class="fas fa-cubes text-orange-500 ml-1" title="Per Piece"></i>' : ''}</td>
                  <td>${isPiece ? `<strong>${this.escapeHtml(t.item_name || '')}</strong>${t.description ? `<div class="text-xs text-gray-500">${this.escapeHtml(t.description)}</div>` : ''}` : this.escapeHtml(t.description || '')}</td>
                  <td class="text-right">${isPiece ? this.fmt(t.quantity) : '-'}</td>
                  <td class="text-right">${isPiece ? 'PKR ' + this.fmt(t.rate) : '-'}</td>
                  <td class="text-right font-bold">PKR ${this.fmt(t.amount)}</td>
                  <td>
                    <button onclick="App.showEmployeeTxEditor(${e.id}, ${t.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteEmployeeTx(${t.id})" class="text-red-500 ml-1"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`}).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  showEmployeeTxEditor(empId, txId = null) {
    const tx = txId ? this.state.employeeTransactions.find(t => t.id === txId) : { entry_date: new Date().toISOString().slice(0,10), type:'salary', amount:0, description:'', entry_type:'cash', item_id:null, item_name:'', quantity:0, rate:0 };
    if (txId && !tx) return;
    const emp = this.state.currentEmployee || {};
    const empItems = this.state.currentEmployeeItems || [];
    const isPerPieceEmp = emp.salary_type === 'per_piece';
    const initEntryType = tx.entry_type || (isPerPieceEmp ? 'per_piece' : 'cash');

    const itemOptionsHtml = empItems.map(it =>
      `<option value="${it.id}" data-rate="${it.rate}" ${tx.item_id == it.id ? 'selected' : ''}>${this.escapeHtml(it.item_name)} — PKR ${this.fmt(it.rate)}</option>`
    ).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-money-check-alt text-green-500 mr-2"></i>${txId ? 'Edit' : 'New'} Salary Entry</h2>
      <form id="etx-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label>
          <input id="etx-date" type="date" class="input-field" value="${tx.entry_date || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">Type</label>
          <select id="etx-type" class="input-field">
            ${['salary','advance','bonus','deduction'].map(t => `<option value="${t}" ${tx.type === t ? 'selected' : ''}>${t.charAt(0).toUpperCase()+t.slice(1)}</option>`).join('')}
          </select></div>

        ${isPerPieceEmp ? `
          <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Entry Type</label>
            <select id="etx-etype" class="input-field" onchange="App._toggleEtxEntryType()">
              <option value="cash" ${initEntryType === 'cash' ? 'selected' : ''}>Cash (Direct Amount)</option>
              <option value="per_piece" ${initEntryType === 'per_piece' ? 'selected' : ''}>Per Piece (Item × Quantity)</option>
            </select></div>
        ` : `<input type="hidden" id="etx-etype" value="cash">`}

        <div id="etx-piece-wrap" class="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-3" style="${initEntryType === 'per_piece' ? '' : 'display:none;'}">
          <div><label class="block text-sm font-medium mb-1">Item</label>
            <select id="etx-item" class="input-field" onchange="App._etxItemChanged()">
              <option value="">-- Select --</option>
              ${itemOptionsHtml}
            </select></div>
          <div><label class="block text-sm font-medium mb-1">Rate (PKR)</label>
            <input id="etx-rate" type="number" step="1" min="0" class="input-field" value="${parseInt(tx.rate) || 0}" oninput="App._etxRecalc()"></div>
          <div><label class="block text-sm font-medium mb-1">Quantity</label>
            <input id="etx-qty" type="number" step="1" min="0" class="input-field" value="${parseInt(tx.quantity) || 0}" oninput="App._etxRecalc()"></div>
        </div>

        <div id="etx-amount-wrap" class="md:col-span-2" style="${initEntryType === 'cash' ? '' : 'display:none;'}">
          <label class="block text-sm font-medium mb-1">Amount (PKR)</label>
          <input id="etx-amount" type="number" step="1" min="0" class="input-field" value="${parseInt(tx.amount) || 0}">
        </div>

        <div id="etx-piece-total" class="md:col-span-2" style="${initEntryType === 'per_piece' ? '' : 'display:none;'}">
          <div class="bg-blue-50 border border-blue-200 rounded p-3 flex justify-between items-center">
            <span class="text-sm font-medium">Total (Quantity × Rate):</span>
            <span id="etx-total-display" class="font-bold text-lg amount-running">PKR 0.00</span>
          </div>
        </div>

        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Description</label>
          <textarea id="etx-desc" class="input-field" rows="2">${this.escapeHtml(tx.description || '')}</textarea></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${txId ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteEmployeeTx(${txId})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');

    if (isPerPieceEmp && initEntryType === 'per_piece') this._etxRecalc();

    document.getElementById('etx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const eType = document.getElementById('etx-etype').value;
      let payload = {
        employee_id: empId,
        entry_date: document.getElementById('etx-date').value,
        type: document.getElementById('etx-type').value,
        description: document.getElementById('etx-desc').value,
        entry_type: eType
      };
      if (eType === 'per_piece') {
        const itemSel = document.getElementById('etx-item');
        const itemId = itemSel.value ? parseInt(itemSel.value) : null;
        const itemName = itemSel.value ? itemSel.options[itemSel.selectedIndex].text.split(' — ')[0] : '';
        const qty = parseInt(document.getElementById('etx-qty').value) || 0;
        const rate = parseInt(document.getElementById('etx-rate').value) || 0;
        if (qty <= 0) { this.toast('Quantity required', 'error'); return; }
        payload.item_id = itemId;
        payload.item_name = itemName;
        payload.quantity = qty;
        payload.rate = rate;
        payload.amount = qty * rate;
      } else {
        payload.amount = parseInt(document.getElementById('etx-amount').value) || 0;
      }
      try {
        if (txId) await this.api.put(`/api/employee-transactions/${txId}`, payload);
        else await this.api.post('/api/employee-transactions', payload);
        this.closeModal();
        await this.openEmployee(empId);
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  _toggleEtxEntryType() {
    const t = document.getElementById('etx-etype').value;
    document.getElementById('etx-piece-wrap').style.display = t === 'per_piece' ? '' : 'none';
    document.getElementById('etx-amount-wrap').style.display = t === 'cash' ? '' : 'none';
    document.getElementById('etx-piece-total').style.display = t === 'per_piece' ? '' : 'none';
    if (t === 'per_piece') this._etxRecalc();
  },

  _etxItemChanged() {
    const sel = document.getElementById('etx-item');
    const opt = sel.options[sel.selectedIndex];
    const rate = opt ? (parseInt(opt.dataset.rate) || 0) : 0;
    document.getElementById('etx-rate').value = rate;
    this._etxRecalc();
  },

  _etxRecalc() {
    const qty = parseInt(document.getElementById('etx-qty')?.value) || 0;
    const rate = parseInt(document.getElementById('etx-rate')?.value) || 0;
    const total = qty * rate;
    const disp = document.getElementById('etx-total-display');
    if (disp) disp.textContent = 'PKR ' + this.fmt(total);
  },

  async deleteEmployeeTx(id) {
    if (!confirm('Delete this entry?')) return;
    try {
      await this.api.delete(`/api/employee-transactions/${id}`);
      this.closeModal();
      if (this.state.currentEmployee) await this.openEmployee(this.state.currentEmployee.id);
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= SIDE EXPENSES =========
  async showSideExpenses() {
    this.state.view = 'side-expenses';
    this.state.currentFolderId = null;
    this.setActiveNav('side-expenses');
    this.closeSidebarOnMobile();
    this.renderFolders();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-money-bill-wave text-red-500"></i>Side Expenses</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const data = await this.api.get('/api/side-expenses');
      this.state.sideExpenses = data.expenses || [];
      this.renderSideExpenses();
    } catch (e) {}
  },

  renderSideExpenses() {
    const items = this.state.sideExpenses;
    const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fas fa-money-bill-wave text-red-500"></i>Side Expenses</h1>
          <p class="page-subtitle">${items.length} entry(ies) · Total: PKR ${this.fmt(total)}</p></div>
        <button onclick="App.showSideExpenseEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Expense</button>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Total Entries</p><p class="text-xl font-bold text-blue-600">${items.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Amount</p><p class="text-xl font-bold text-red-600">PKR ${this.fmt(total)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">This Month</p><p class="text-xl font-bold text-orange-600">PKR ${this.fmt(items.filter(i => (i.entry_date || '').startsWith(new Date().toISOString().slice(0,7))).reduce((s,i) => s + (parseFloat(i.amount)||0), 0))}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th style="width:120px;">Date</th>
              <th>Category</th><th>Description</th>
              <th>Paid To</th><th class="text-right">Amount</th>
              <th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="7" class="text-center py-8 text-gray-500">
                <i class="fas fa-money-bill-wave text-3xl mb-2 block"></i>No expenses yet.</td></tr>` :
                items.map((it, i) => `<tr>
                  <td>${i + 1}</td>
                  <td>${it.entry_date}</td>
                  <td>${this.escapeHtml(it.category || '-')}</td>
                  <td>${this.escapeHtml(it.description || '')}</td>
                  <td>${this.escapeHtml(it.paid_to || '')}</td>
                  <td class="text-right font-bold text-red-600">PKR ${this.fmt(it.amount)}</td>
                  <td>
                    <button onclick="App.showSideExpenseEditor(${it.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteSideExpense(${it.id})" class="text-red-500 ml-1"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  showSideExpenseEditor(id = null) {
    const it = id ? this.state.sideExpenses.find(x => x.id === id) : { entry_date: new Date().toISOString().slice(0,10), category:'', description:'', amount:0, paid_to:'', notes:'' };
    if (id && !it) return;
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-money-bill-wave text-red-500 mr-2"></i>${id ? 'Edit' : 'Add'} Side Expense</h2>
      <form id="se-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label><input id="se-date" type="date" class="input-field" value="${it.entry_date || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">Category</label>
          <input id="se-cat" type="text" list="se-cat-list" class="input-field" value="${this.escapeAttr(it.category || '')}" placeholder="e.g., Workers Food, Travel, Repairs">
          <datalist id="se-cat-list">
            <option value="Workers Food"><option value="Travel"><option value="Repairs"><option value="Utility"><option value="Stationary"><option value="Tea/Snacks"><option value="Misc">
          </datalist></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Description</label><input id="se-desc" type="text" class="input-field" value="${this.escapeAttr(it.description || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Amount (PKR)</label><input id="se-amt" type="number" step="1" class="input-field" value="${it.amount || 0}"></div>
        <div><label class="block text-sm font-medium mb-1">Paid To</label><input id="se-to" type="text" class="input-field" value="${this.escapeAttr(it.paid_to || '')}"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label><textarea id="se-notes" class="input-field" rows="2">${this.escapeHtml(it.notes || '')}</textarea></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteSideExpense(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');
    document.getElementById('se-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        entry_date: document.getElementById('se-date').value,
        category: document.getElementById('se-cat').value,
        description: document.getElementById('se-desc').value,
        amount: parseFloat(document.getElementById('se-amt').value) || 0,
        paid_to: document.getElementById('se-to').value,
        notes: document.getElementById('se-notes').value
      };
      try {
        if (id) await this.api.put(`/api/side-expenses/${id}`, payload);
        else await this.api.post('/api/side-expenses', payload);
        this.closeModal();
        await this.showSideExpenses();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  async deleteSideExpense(id) {
    if (!confirm('Delete this expense?')) return;
    try {
      await this.api.delete(`/api/side-expenses/${id}`);
      this.closeModal();
      await this.showSideExpenses();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= CUSTOM SECTIONS =========
  showAddCustomSection(id = null) {
    const sec = id ? this.state.customSections.find(s => s.id === id) : { name:'', icon:'fa-folder', color:'#3b82f6', columns_json:'[]' };
    if (id && !sec) return;
    let cols = [];
    try { cols = JSON.parse(sec.columns_json || '[]'); } catch {}
    if (cols.length === 0) cols = [{ key:'col_'+Date.now(), name:'Name', type:'text' }];
    this._tempSecCols = cols;

    const renderColsList = () => this._tempSecCols.map((col, i) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-cs-name="${i}" value="${this.escapeAttr(col.name)}" placeholder="Column name">
        <select class="input-field" style="width:130px;" data-cs-type="${i}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
          <option value="date" ${col.type === 'date' ? 'selected' : ''}>Date</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeSecCol(${i})"><i class="fas fa-times"></i></button>
      </div>`).join('');
    this._removeSecCol = (i) => {
      this._tempSecCols.splice(i, 1);
      document.getElementById('cs-cols').innerHTML = renderColsList();
    };

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-folder-plus text-blue-500 mr-2"></i>${id ? 'Edit' : 'Create'} Custom Section</h2>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Section Name *</label>
          <input id="cs-name" type="text" required class="input-field" value="${this.escapeAttr(sec.name || '')}" placeholder="e.g., Tasks, Vehicles, Projects"></div>
        <div><label class="block text-sm font-medium mb-1">Icon</label>
          <select id="cs-icon" class="input-field">
            ${['fa-folder','fa-box','fa-tag','fa-clipboard','fa-tasks','fa-car','fa-tools','fa-bookmark','fa-flag','fa-star'].map(i => `<option value="${i}" ${sec.icon === i ? 'selected' : ''}>${i.replace('fa-','')}</option>`).join('')}
          </select></div>
        <div><label class="block text-sm font-medium mb-1">Color</label>
          <input id="cs-color" type="color" value="${sec.color || '#3b82f6'}" class="input-field h-12"></div>
      </div>
      <h3 class="font-semibold text-sm text-gray-700 mb-2 pt-3 border-t"><i class="fas fa-columns mr-1"></i>Columns</h3>
      <div id="cs-cols">${renderColsList()}</div>
      <button type="button" class="btn btn-secondary btn-sm mb-3" onclick="App._addSecCol()"><i class="fas fa-plus"></i> Add Column</button>
      <div class="flex gap-2 justify-end pt-2 border-t">
        ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteCustomSection(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="App._saveCustomSection(${id || 'null'})"><i class="fas fa-save"></i> Save</button>
      </div>`, 'modal-lg');
  },

  editCustomSection(id) { this.showAddCustomSection(id); },

  _addSecCol() {
    this._tempSecCols.push({ key: 'col_' + Date.now(), name: 'New Column', type: 'text' });
    document.getElementById('cs-cols').innerHTML = this._tempSecCols.map((col, j) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-cs-name="${j}" value="${this.escapeAttr(col.name)}">
        <select class="input-field" style="width:130px;" data-cs-type="${j}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
          <option value="date" ${col.type === 'date' ? 'selected' : ''}>Date</option>
        </select>
        <button type="button" class="btn btn-danger btn-sm" onclick="App._removeSecCol(${j})"><i class="fas fa-times"></i></button>
      </div>`).join('');
  },

  async _saveCustomSection(id) {
    const name = document.getElementById('cs-name').value.trim();
    if (!name) return this.toast('Name required', 'error');
    document.querySelectorAll('#cs-cols [data-cs-name]').forEach(el => {
      const i = parseInt(el.dataset.csName);
      if (this._tempSecCols[i]) this._tempSecCols[i].name = el.value;
    });
    document.querySelectorAll('#cs-cols [data-cs-type]').forEach(el => {
      const i = parseInt(el.dataset.csType);
      if (this._tempSecCols[i]) this._tempSecCols[i].type = el.value;
    });
    this._tempSecCols.forEach(c => { if (!c.key) c.key = 'col_'+Date.now()+'_'+Math.random().toString(36).slice(2,5); });
    const payload = {
      name,
      icon: document.getElementById('cs-icon').value,
      color: document.getElementById('cs-color').value,
      columns: this._tempSecCols
    };
    try {
      if (id) await this.api.put(`/api/custom-sections/${id}`, payload);
      else await this.api.post('/api/custom-sections', payload);
      this.closeModal();
      await this.loadCustomSections();
      this.renderCustomSections();
      this.toast('Saved', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  async deleteCustomSection(id) {
    if (!confirm('Delete this custom section and all its data?')) return;
    try {
      await this.api.delete(`/api/custom-sections/${id}`);
      this.closeModal();
      if (this.state.currentCustomSectionId === id) this.state.currentCustomSectionId = null;
      await this.loadCustomSections();
      this.renderCustomSections();
      this.showDashboard();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  async openCustomSection(id) {
    this.state.view = 'custom';
    this.state.currentCustomSectionId = id;
    this.state.currentFolderId = null;
    this.setActiveNav('');
    this.closeSidebarOnMobile();
    this.renderFolders();
    this.renderCustomSections();
    try {
      const data = await this.api.get(`/api/custom-sections/${id}`);
      this.state.currentCustomSection = data.section;
      this.state.customSectionRows = data.rows || [];
      this.renderCustomSectionView();
    } catch (e) {}
  },

  renderCustomSectionView() {
    const sec = this.state.currentCustomSection;
    if (!sec) return;
    let cols = [];
    try { cols = JSON.parse(sec.columns_json || '[]'); } catch {}
    const rows = this.state.customSectionRows;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fas ${sec.icon}" style="color:${sec.color}"></i>${this.escapeHtml(sec.name)}</h1>
          <p class="page-subtitle">${rows.length} row(s)</p></div>
        <div class="flex gap-2">
          <button onclick="App.editCustomSection(${sec.id})" class="btn btn-secondary btn-sm"><i class="fas fa-cog"></i> Edit Section</button>
          <button onclick="App.showCustomRowEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Row</button>
        </div>
      </div>
      <div class="p-4 md:p-6">
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th>
              ${cols.map(c => `<th>${this.escapeHtml(c.name)}</th>`).join('')}
              <th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${rows.length === 0 ? `<tr><td colspan="${cols.length + 2}" class="text-center py-8 text-gray-500">
                <i class="fas fa-inbox text-3xl mb-2 block"></i>No rows yet.</td></tr>` :
                rows.map((row, i) => {
                  let data = {};
                  try { data = JSON.parse(row.data_json || '{}'); } catch {}
                  return `<tr>
                    <td>${i + 1}</td>
                    ${cols.map(c => `<td>${this.escapeHtml(data[c.key] || '')}</td>`).join('')}
                    <td>
                      <button onclick="App.showCustomRowEditor(${row.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                      <button onclick="App.deleteCustomRow(${row.id})" class="text-red-500 ml-1"><i class="fas fa-trash text-sm"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  showCustomRowEditor(rowId = null) {
    const sec = this.state.currentCustomSection;
    let cols = [];
    try { cols = JSON.parse(sec.columns_json || '[]'); } catch {}
    const row = rowId ? this.state.customSectionRows.find(r => r.id === rowId) : null;
    let data = {};
    if (row) { try { data = JSON.parse(row.data_json || '{}'); } catch {} }
    const fields = cols.map((c, i) => `
      <div class="${cols.length > 4 ? 'md:col-span-1' : 'md:col-span-2'}">
        <label class="block text-sm font-medium mb-1">${this.escapeHtml(c.name)}</label>
        <input id="cr-${i}" data-key="${this.escapeAttr(c.key)}" type="${c.type === 'number' ? 'number' : c.type === 'date' ? 'date' : 'text'}" 
               class="input-field" value="${this.escapeAttr(data[c.key] || '')}" ${c.type === 'number' ? 'step="1"' : ''}>
      </div>`).join('');
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas ${sec.icon} mr-2" style="color:${sec.color}"></i>${rowId ? 'Edit' : 'Add'} Row · ${this.escapeHtml(sec.name)}</h2>
      <form id="cr-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${fields}
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${rowId ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteCustomRow(${rowId})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');
    document.getElementById('cr-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const newData = {};
      document.querySelectorAll('#cr-form [id^="cr-"]').forEach(el => { newData[el.dataset.key] = el.value; });
      try {
        if (rowId) await this.api.put(`/api/custom-sections/rows/${rowId}`, { data: newData });
        else await this.api.post(`/api/custom-sections/${sec.id}/rows`, { data: newData });
        this.closeModal();
        await this.openCustomSection(sec.id);
        await this.loadCustomSections();
        this.renderCustomSections();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  async deleteCustomRow(id) {
    if (!confirm('Delete this row?')) return;
    try {
      await this.api.delete(`/api/custom-sections/rows/${id}`);
      this.closeModal();
      if (this.state.currentCustomSection) await this.openCustomSection(this.state.currentCustomSection.id);
      this.toast('Deleted', 'success');
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
      <div class="page-header"><h1 class="page-title"><i class="fas fa-file-invoice text-blue-500"></i>Bills</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
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
        <div><h1 class="page-title"><i class="fas fa-file-invoice text-blue-500"></i>Bills / Invoices</h1>
          <p class="page-subtitle">${totalBills} bill(s) · auto-linked with client ledger</p></div>
        <button onclick="App.showBillEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> New Bill</button>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Total Bills</p><p class="text-xl font-bold text-blue-600">${totalBills}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Amount</p><p class="text-xl font-bold text-purple-600">PKR ${this.fmt(totalAmount)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Paid</p><p class="text-xl font-bold amount-received">PKR ${this.fmt(totalPaid)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Outstanding</p><p class="text-xl font-bold amount-pending">PKR ${this.fmt(due)}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th>Bill No</th><th>Date</th><th>Customer</th>
              <th class="text-right">Total</th><th class="text-right">Paid</th>
              <th class="text-right">Due</th><th>Status</th>
              <th style="width:160px;">Actions</th>
            </tr></thead><tbody>
              ${this.state.bills.length === 0 ? `<tr><td colspan="8" class="text-center py-8 text-gray-500">
                <i class="fas fa-file-invoice text-3xl mb-2 block"></i>No bills yet.</td></tr>` :
                this.state.bills.map(b => {
                  const due = (parseFloat(b.total) || 0) - (parseFloat(b.paid) || 0);
                  return `<tr>
                    <td class="font-semibold">${this.escapeHtml(b.bill_no)}</td>
                    <td>${b.bill_date}</td>
                    <td>${this.escapeHtml(b.customer_name || b.client_name || '-')}${b.client_id ? ' <i class="fas fa-link text-blue-400 text-xs" title="Linked to client ledger"></i>' : ''}</td>
                    <td class="text-right font-medium">PKR ${this.fmt(b.total)}</td>
                    <td class="text-right amount-received">PKR ${this.fmt(b.paid)}</td>
                    <td class="text-right amount-pending">PKR ${this.fmt(due)}</td>
                    <td><span class="status-badge status-${(b.status||'').toLowerCase()}">${this.escapeHtml(b.status || 'Unpaid')}</span></td>
                    <td>
                      <button onclick="App.showBillEditor(${b.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                      <button onclick="App.printBill(${b.id})" class="btn btn-primary btn-sm"><i class="fas fa-print"></i></button>
                      <button onclick="App.deleteBill(${b.id})" class="btn btn-danger btn-sm"><i class="fas fa-trash"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  async showBillEditor(billId = null) {
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
        product_id: i.product_id, product_name: i.product_name,
        quantity: i.quantity, rate: i.rate, total: i.total
      }));
    } else items = [{ product_id: null, product_name: '', quantity: 1, rate: 0, total: 0 }];
    this._billItems = items;
    this._billEditing = editing;
    // Bill No: 4-digit-based, unique. e.g. timestamp tail + 4 random.
    const genBillNo = () => {
      const t = Date.now().toString().slice(-4);
      const r = Math.floor(Math.random() * 9000 + 1000);
      return `${t}${r}`;
    };
    const billNoVal = editing ? editing.bill_no : genBillNo();
    const billDateVal = editing ? editing.bill_date : new Date().toISOString().slice(0,10);

    this.openModal(`
      <h2 class="text-xl font-bold mb-3"><i class="fas fa-file-invoice text-blue-500 mr-2"></i>${editing ? 'Edit Bill' : 'New Bill'}</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div><label class="block text-sm font-medium mb-1">Bill No</label><input id="b-no" type="text" class="input-field" value="${this.escapeAttr(billNoVal)}"></div>
        <div><label class="block text-sm font-medium mb-1">Date</label><input id="b-date" type="date" class="input-field" value="${billDateVal}"></div>
        <div><label class="block text-sm font-medium mb-1">Customer Name</label>
          <input id="b-cname" list="b-cname-list" type="text" class="input-field" value="${editing ? this.escapeAttr(editing.customer_name) : ''}" placeholder="Customer name (auto-link to ledger)">
          <datalist id="b-cname-list">${this.state.allClients.map(c => `<option value="${this.escapeAttr(c.name)}">`).join('')}</datalist>
          <p class="text-xs text-blue-600 mt-1"><i class="fas fa-link mr-1"></i>If name matches a client, this bill auto-creates/updates a ledger row.</p></div>
        <div><label class="block text-sm font-medium mb-1">Phone</label><input id="b-cphone" type="text" class="input-field" value="${editing ? this.escapeAttr(editing.customer_phone || '') : ''}"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Address</label><input id="b-caddr" type="text" class="input-field" value="${editing ? this.escapeAttr(editing.customer_address || '') : ''}"></div>
      </div>

      <div class="bg-white rounded-lg overflow-hidden border mb-3">
        <table class="bill-table" id="bill-items-table">
          <thead><tr>
            <th style="width:130px;">Quantity</th><th>Product Name</th>
            <th style="width:130px;">Rate (PKR)</th><th style="width:140px;">Total (PKR)</th>
            <th style="width:50px;"></th>
          </tr></thead>
          <tbody id="bill-items-body"></tbody>
        </table>
      </div>
      <button type="button" class="btn btn-secondary btn-sm mb-3" onclick="App._addBillRow()"><i class="fas fa-plus"></i> Add Item Row</button>

      <div class="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="b-notes" class="input-field" rows="2">${editing ? this.escapeHtml(editing.notes || '') : ''}</textarea></div>
        <div class="space-y-2">
          <div class="flex justify-between items-center"><label class="text-sm">Subtotal:</label><span id="b-subtotal" class="font-bold">PKR 0.00</span></div>
          <div class="flex justify-between items-center"><label class="text-sm">Discount:</label>
            <input id="b-discount" type="number" step="1" min="0" class="input-field" style="width:140px;" value="${editing ? parseInt(editing.discount) || 0 : 0}" oninput="App._calcBill()"></div>
          <div class="flex justify-between items-center"><label class="text-sm">Tax %:</label>
            <input id="b-tax" type="number" step="1" min="0" class="input-field" style="width:140px;" value="${editing ? parseInt(editing.tax) || 0 : 0}" oninput="App._calcBill()"></div>
          <div class="flex justify-between items-center pt-2 border-t"><label class="text-sm font-bold">Total:</label><span id="b-total" class="font-bold text-lg amount-running">PKR 0.00</span></div>
          <div class="flex justify-between items-center"><label class="text-sm">Paid:</label>
            <input id="b-paid" type="number" step="1" min="0" class="input-field" style="width:140px;" value="${editing ? parseInt(editing.paid) || 0 : 0}" oninput="App._calcBill()"></div>
          <div class="flex justify-between items-center"><label class="text-sm">Due:</label><span id="b-due" class="font-bold amount-pending">PKR 0.00</span></div>
          <div class="flex justify-between items-center"><label class="text-sm">Status:</label>
            <select id="b-status" class="input-field" style="width:140px;">
              ${['Unpaid','Partial','Paid','Cancelled'].map(s => `<option value="${s}" ${editing?.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select></div>
        </div>
      </div>
      <div class="flex gap-2 justify-end pt-2 border-t">
        ${editing ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteBill(${editing.id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        ${editing ? `<button type="button" class="btn btn-primary" onclick="App._saveBill(${editing.id}, true)"><i class="fas fa-print"></i> Save & Print</button>` : `<button type="button" class="btn btn-primary" onclick="App._saveBill(null, true)"><i class="fas fa-print"></i> Save & Print</button>`}
        <button type="button" class="btn btn-success" onclick="App._saveBill(${editing ? editing.id : 'null'}, false)"><i class="fas fa-save"></i> Save</button>
      </div>`, 'modal-xl');

    this._renderBillItems();
    this._calcBill();

    document.getElementById('b-cname').addEventListener('change', (e) => {
      const c = this.state.allClients.find(c => c.name === e.target.value);
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
    } else document.getElementById('bill-product-list').innerHTML = productOpts;
    tbody.innerHTML = this._billItems.map((it, i) => `
      <tr data-row="${i}">
        <td><input type="number" step="1" min="0" value="${parseInt(it.quantity) || 0}" oninput="App._updateBillRow(${i}, 'quantity', parseInt(this.value)||0)"></td>
        <td><input type="text" list="bill-product-list" value="${this.escapeAttr(it.product_name || '')}"
                 oninput="App._updateBillProductName(${i}, this.value)" onchange="App._matchBillProduct(${i}, this.value)" placeholder="Type or pick product"></td>
        <td><input type="number" step="1" min="0" value="${parseInt(it.rate) || 0}" oninput="App._updateBillRow(${i}, 'rate', parseInt(this.value)||0)"></td>
        <td class="text-right font-bold amount-running">PKR ${this.fmt((parseInt(it.quantity)||0) * (parseInt(it.rate)||0))}</td>
        <td class="text-center"><button type="button" onclick="App._removeBillRow(${i})" class="text-red-500 hover:text-red-700"><i class="fas fa-trash text-sm"></i></button></td>
      </tr>`).join('');
  },

  _addBillRow() { this._billItems.push({ product_id: null, product_name: '', quantity: 1, rate: 0, total: 0 }); this._renderBillItems(); this._calcBill(); },
  _removeBillRow(i) { this._billItems.splice(i, 1); this._renderBillItems(); this._calcBill(); },
  _updateBillRow(i, field, value) {
    if (!this._billItems[i]) return;
    this._billItems[i][field] = value;
    this._billItems[i].total = (parseFloat(this._billItems[i].quantity) || 0) * (parseFloat(this._billItems[i].rate) || 0);
    const row = document.querySelector(`#bill-items-body tr[data-row="${i}"]`);
    if (row) row.querySelector('td.amount-running').textContent = 'PKR ' + this.fmt(this._billItems[i].total);
    this._calcBill();
  },
  _updateBillProductName(i, value) { if (this._billItems[i]) this._billItems[i].product_name = value; },
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
    const billNo = document.getElementById('b-no').value.trim();
    if (!billNo) { this.toast('Bill No required', 'error'); return; }
    if (!this.validateBillNo(billNo)) return;
    const billDate = document.getElementById('b-date').value;
    const customerName = document.getElementById('b-cname').value.trim();
    const phone = document.getElementById('b-cphone').value.trim();
    const address = document.getElementById('b-caddr').value.trim();
    const discount = parseInt(document.getElementById('b-discount').value) || 0;
    const taxPct = parseInt(document.getElementById('b-tax').value) || 0;
    const paid = parseInt(document.getElementById('b-paid').value) || 0;
    const status = document.getElementById('b-status').value;
    const notes = document.getElementById('b-notes').value;
    if (!customerName) { this.toast('Customer name required', 'error'); return; }
    if (this._billItems.length === 0) { this.toast('At least one item required', 'error'); return; }
    const subtotal = this._billItems.reduce((s, it) => s + ((parseInt(it.quantity) || 0) * (parseInt(it.rate) || 0)), 0);
    const taxable = subtotal - discount;
    const taxAmt = Math.round(taxable * (taxPct / 100));
    const total = taxable + taxAmt;
    const matched = this.state.allClients.find(c => c.name === customerName);
    const payload = {
      bill_no: billNo, bill_date: billDate,
      client_id: matched ? matched.id : null,
      customer_name: customerName, customer_phone: phone, customer_address: address,
      subtotal, discount, tax: taxPct, total, paid, notes, status,
      items: this._billItems.map(it => ({
        product_id: it.product_id || null, product_name: it.product_name || '',
        quantity: parseInt(it.quantity) || 0, rate: parseInt(it.rate) || 0,
        total: (parseInt(it.quantity) || 0) * (parseInt(it.rate) || 0)
      }))
    };
    try {
      let savedId = billId;
      let res;
      if (billId) res = await this.api.put(`/api/bills/${billId}`, payload);
      else { res = await this.api.post('/api/bills', payload); savedId = res?.id; }
      if (res?.error) { this.toast(res.error, 'error'); return; }
      this.closeModal();
      this.toast(matched ? 'Bill saved & ledger auto-updated' : 'Bill saved', 'success');
      await this.showBills();
      if (alsoPrint && savedId) setTimeout(() => this.printBill(savedId), 200);
    } catch (e) { this.toast('Save failed', 'error'); }
  },

  async deleteBill(id) {
    if (!confirm('Delete this bill? Linked ledger row will also be removed.')) return;
    try {
      await this.api.delete(`/api/bills/${id}`);
      this.closeModal();
      await this.showBills();
      this.toast('Bill deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

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
      const logoHtml = b.logo_url ? `<img src="${this.escapeAttr(b.logo_url)}" alt="logo">` :
        `<div class="logo-fallback">${this.escapeHtml((b.company_name || 'TS').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase())}</div>`;
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
            <div class="box"><label>Bill To</label><span>${this.escapeHtml(bill.customer_name || '')}</span>
              ${bill.customer_phone ? `<div style="font-size:0.85rem;color:#475569;margin-top:2px;">${this.escapeHtml(bill.customer_phone)}</div>` : ''}
              ${bill.customer_address ? `<div style="font-size:0.85rem;color:#475569;margin-top:2px;">${this.escapeHtml(bill.customer_address)}</div>` : ''}
            </div>
            <div class="box" style="text-align:right">
              <div style="margin-bottom: 6px;"><label>Bill No</label><span>${this.escapeHtml(bill.bill_no)}</span></div>
              <div><label>Date</label><span>${this.escapeHtml(bill.bill_date)}</span></div>
            </div>
          </div>
          <table class="invoice-table">
            <thead><tr><th class="col-num">#</th><th class="col-qty">Quantity</th><th>Product Name</th><th class="col-rate">Rate (PKR)</th><th class="col-tot">Total (PKR)</th></tr></thead>
            <tbody>
              ${items.length === 0 ? '<tr><td colspan="5" style="text-align:center; padding: 24px;">No items</td></tr>' :
                items.map((it, i) => `<tr>
                  <td class="col-num">${i + 1}</td><td class="col-qty">${this.fmt(it.quantity)}</td>
                  <td>${this.escapeHtml(it.product_name)}</td>
                  <td class="col-rate">${this.fmt(it.rate)}</td><td class="col-tot">${this.fmt(it.total)}</td>
                </tr>`).join('')}
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
          <div class="invoice-footer"><p>${this.escapeHtml(b.bill_footer || 'Thank you for your business!')}</p></div>
        </div>`;
      this.openModal(`
        <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 12px;" class="no-print">
          <h2 class="text-xl font-bold"><i class="fas fa-print mr-2"></i>Bill Preview</h2>
          <div class="flex gap-2">
            <button onclick="window.print()" class="btn btn-primary"><i class="fas fa-print"></i> Print</button>
            <button onclick="App.closeModal()" class="btn btn-secondary">Close</button>
          </div>
        </div>${html}`, 'modal-xl');
    } catch (e) { this.toast('Failed to load bill', 'error'); }
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
        <div><h1 class="page-title"><i class="fas fa-palette text-pink-500"></i>Branding & Settings</h1>
          <p class="page-subtitle">Customize CRM appearance and bill template</p></div>
      </div>
      <div class="p-4 md:p-6">
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div class="lg:col-span-2 bg-white rounded-xl shadow-sm p-5 space-y-4">
            <h2 class="font-bold text-gray-800 text-lg"><i class="fas fa-cog mr-2"></i>Identity</h2>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><label class="block text-sm font-medium mb-1">Company Name</label><input id="br-company" type="text" class="input-field" value="${this.escapeAttr(b.company_name)}"></div>
              <div><label class="block text-sm font-medium mb-1">CRM Display Name</label><input id="br-crm" type="text" class="input-field" value="${this.escapeAttr(b.crm_name)}"></div>

              <div class="md:col-span-2 bg-blue-50 border border-blue-200 rounded-lg p-3">
                <label class="block text-sm font-bold mb-2 text-blue-900"><i class="fas fa-image mr-2"></i>Company Logo (used on Bills)</label>
                <div class="flex items-center gap-3 mb-2">
                  <div id="logo-preview" class="logo-preview-box">
                    ${b.logo_url ? `<img src="${this.escapeAttr(b.logo_url)}" style="width:100%;height:100%;object-fit:contain">` : `<i class="fas fa-image text-gray-400"></i>`}
                  </div>
                  <div class="flex-1">
                    <input id="br-logo-file" type="file" accept="image/*" class="hidden" onchange="App._handleLogoUpload(event)">
                    <button type="button" onclick="document.getElementById('br-logo-file').click()" class="btn btn-primary btn-sm w-full"><i class="fas fa-upload"></i> Upload from Mobile/PC</button>
                    <button type="button" onclick="App._clearLogo()" class="btn btn-secondary btn-sm w-full mt-1"><i class="fas fa-times"></i> Remove Logo</button>
                  </div>
                </div>
                <label class="block text-xs font-medium mb-1 text-gray-700">Or paste image URL:</label>
                <input id="br-logo" type="text" class="input-field" value="${this.escapeAttr(b.logo_url)}" placeholder="https://example.com/logo.png" oninput="App._previewLogoUrl()">
                <p class="text-xs text-gray-500 mt-1">Logo appears on sidebar, login page, and printed bills.</p>
              </div>

              <div><label class="block text-sm font-medium mb-1">Bill Address</label><input id="br-addr" type="text" class="input-field" value="${this.escapeAttr(b.bill_address)}"></div>
              <div><label class="block text-sm font-medium mb-1">Bill Phone</label><input id="br-phone" type="text" class="input-field" value="${this.escapeAttr(b.bill_phone)}"></div>
              <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Bill Footer</label><input id="br-footer" type="text" class="input-field" value="${this.escapeAttr(b.bill_footer)}"></div>
            </div>
            <h2 class="font-bold text-gray-800 text-lg pt-4 border-t"><i class="fas fa-paint-roller mr-2"></i>Theme Colors</h2>
            ${[
              ['primary','Primary (Buttons / Links)', b.primary_color],
              ['accent','Accent (Logo gradient)', b.accent_color],
              ['received','Received Amount Color', b.received_color],
              ['pending','Pending Amount Color', b.pending_color],
              ['running','Running Balance Color', b.running_color]
            ].map(([k,n,v]) => `
              <div class="brand-color-row">
                <input type="color" value="${v}" id="br-${k}" oninput="App._previewColor('${k}', this.value)">
                <label>${n}</label>
                <code class="text-xs text-gray-500" id="br-${k}-code">${v}</code>
              </div>`).join('')}
            <div class="flex gap-2 justify-end pt-3 border-t">
              <button onclick="App._resetBranding()" class="btn btn-secondary"><i class="fas fa-undo"></i> Reset</button>
              <button onclick="App._saveBranding()" class="btn btn-primary"><i class="fas fa-save"></i> Save Changes</button>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h2 class="font-bold text-gray-800 text-lg mb-3"><i class="fas fa-eye mr-2"></i>Live Preview</h2>
            <div id="brand-preview" class="space-y-3">
              <div class="p-4 rounded-lg" style="background: linear-gradient(135deg, var(--primary), var(--accent)); color: white;">
                <div class="flex items-center gap-3">
                  <div class="logo-circle" id="prev-logo" style="background: rgba(255,255,255,0.2);">
                    ${b.logo_url ? `<img src="${this.escapeAttr(b.logo_url)}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-star"></i>`}
                  </div>
                  <div><h3 class="font-bold" id="prev-crm">${this.escapeHtml(b.crm_name)}</h3>
                    <p class="text-xs opacity-90" id="prev-company">${this.escapeHtml(b.company_name)}</p></div>
                </div>
              </div>
              <div class="p-3 bg-gray-50 rounded-lg space-y-1.5 text-sm">
                <div class="flex justify-between"><span>Received:</span><span class="amount-received font-bold">PKR 50,000</span></div>
                <div class="flex justify-between"><span>Pending:</span><span class="amount-pending font-bold">PKR 20,000</span></div>
                <div class="flex justify-between"><span>Net:</span><span class="amount-running font-bold">PKR 30,000</span></div>
              </div>
              <button class="btn btn-primary w-full justify-center"><i class="fas fa-magic"></i> Sample</button>
            </div>
          </div>
        </div>
      </div>`;
  },

  _handleLogoUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    if (file.size > 800 * 1024) {
      // Will resize
    }
    const reader = new FileReader();
    reader.onload = (e) => {
      // Resize/compress to max 400px width as PNG/JPEG, base64 encode
      const img = new Image();
      img.onload = () => {
        const maxDim = 400;
        let w = img.width, h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) { h = Math.round(h * (maxDim / w)); w = maxDim; }
          else { w = Math.round(w * (maxDim / h)); h = maxDim; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        document.getElementById('br-logo').value = dataUrl;
        this._previewLogoUrl();
        this.toast('Logo loaded — click Save to apply', 'info');
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  },

  _clearLogo() {
    document.getElementById('br-logo').value = '';
    this._previewLogoUrl();
  },

  _previewLogoUrl() {
    const url = document.getElementById('br-logo').value.trim();
    const preview = document.getElementById('logo-preview');
    const sidebarPrev = document.getElementById('prev-logo');
    if (preview) preview.innerHTML = url ? `<img src="${this.escapeAttr(url)}" style="width:100%;height:100%;object-fit:contain">` : `<i class="fas fa-image text-gray-400"></i>`;
    if (sidebarPrev) sidebarPrev.innerHTML = url ? `<img src="${this.escapeAttr(url)}" style="width:100%;height:100%;object-fit:cover">` : `<i class="fas fa-star"></i>`;
  },

  _previewColor(key, value) {
    const map = { primary: '--primary', accent: '--accent', received: '--color-received', pending: '--color-pending', running: '--color-running' };
    if (map[key]) document.documentElement.style.setProperty(map[key], value);
    const code = document.getElementById(`br-${key}-code`);
    if (code) code.textContent = value;
  },

  _resetBranding() {
    const def = {
      company_name: 'Two Star Industries', crm_name: 'Two Star CRM', logo_url: '',
      primary_color: '#3b82f6', accent_color: '#8b5cf6',
      received_color: '#ef4444', pending_color: '#3b82f6', running_color: '#10b981',
      bill_address: '', bill_phone: '', bill_footer: 'Thank you for your business!'
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
      this.renderApp();
      this.showBranding();
      this.toast('Branding saved', 'success');
    } catch (e) { this.toast('Save failed', 'error'); }
  },

  // ========= Auth UI =========
  toggleDropdown() { document.getElementById('user-dropdown').classList.toggle('open'); },

  showChangePassword() {
    this.toggleDropdown();
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-key text-blue-500 mr-2"></i>Change Password</h2>
      <form id="pw-form" class="space-y-3">
        <div><label class="block text-sm font-medium mb-1">Old Password</label><input id="pw-old" type="password" required class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">New Password</label><input id="pw-new" type="password" required minlength="4" class="input-field"></div>
        <div><label class="block text-sm font-medium mb-1">Confirm</label><input id="pw-confirm" type="password" required class="input-field"></div>
        <div class="flex gap-2 justify-end pt-2">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Update</button>
        </div>
      </form>`);
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

  openModal(content, sizeClass = '') {
    this.closeModal();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box ${sizeClass}">${content}</div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(); });
    document.body.appendChild(overlay);
  },
  closeModal() { const m = document.getElementById('modal-overlay'); if (m) m.remove(); },

  fmt(n) {
    n = parseFloat(n) || 0;
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  },
  escapeAttr(s) { return this.escapeHtml(s); }
};

document.addEventListener('DOMContentLoaded', () => App.init());
document.addEventListener('click', (e) => {
  if (!e.target.closest('#user-dropdown')) {
    const d = document.getElementById('user-dropdown');
    if (d) d.classList.remove('open');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeModal(); });
