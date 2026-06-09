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
    products: [],
    components: [],
    employees: [],
    currentEmployee: null,
    employeeTransactions: [],
    sideExpenses: [],
    sideExpenseFolders: [],
    currentSideExpenseFolderId: null,
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
          <button class="nav-btn ${this.state.view === 'components' ? 'active' : ''}" id="nav-components" onclick="App.showComponents()">
            <i class="fas fa-puzzle-piece"></i><span>Components Production</span>
          </button>
          <button class="nav-btn ${this.state.view === 'products' ? 'active' : ''}" id="nav-products" onclick="App.showProducts()">
            <i class="fas fa-industry"></i><span>Products Manufacturing</span>
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
    ['dashboard','bills','inventory','raw','components','products','employees','side-expenses','branding'].forEach(n => {
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
        <div><label class="block text-sm font-medium mb-1">Opening Balance</label><input id="c-balance" type="number" step="any" value="0" class="input-field"></div>
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

  getColLabel(key) {
    if (this.state.columnLabels[key]) return this.state.columnLabels[key];
    // For supplier folders, swap labels so the ledger reads as "we pay them"
    if (this.isSupplierContext()) {
      const supplierLabels = {
        amount_received: 'Amount Paid',       // money WE paid the supplier
        amount_pending: 'Bill Amount',        // total of supplier's bill
        running_total: 'Outstanding Balance'  // how much we still owe
      };
      if (supplierLabels[key]) return supplierLabels[key];
    }
    return this.defaultLabels[key] || key;
  },

  // Returns true if current ledger belongs to a "supplier" folder (we pay them).
  isSupplierContext() {
    const c = this.state.currentClient;
    if (!c) return false;
    const folder = this.state.folders.find(f => f.id === c.folder_id);
    if (!folder) return false;
    const name = (folder.name || '').toLowerCase();
    return /supplier/i.test(name) || folder.section_type === 'suppliers';
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
    const isSupplier = this.isSupplierContext();

    const colHeader = (key) => `
      ${this.escapeHtml(this.getColLabel(key))}
      <i class="fas fa-pen col-rename" title="Rename" onclick="App.renameBuiltInCol('${key}')"></i>`;

    // Balance hint differs for supplier context (we owe them) vs customer (they owe us)
    const balanceHint = isSupplier
      ? (netBalance > 0 ? 'You owe supplier' : netBalance < 0 ? 'Advance paid' : 'Settled')
      : (netBalance > 0 ? 'Owes you' : netBalance < 0 ? 'You owe' : 'Settled');

    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <div class="text-xs text-gray-500"><a href="#" onclick="App.openFolder(${folder.id}); return false;" class="hover:text-blue-500"><i class="fas ${folder.icon} mr-1"></i>${this.escapeHtml(folder.name)}</a></div>
          <h1 class="page-title">${this.escapeHtml(c.name)}${isSupplier ? ' <span class="text-xs px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full ml-2 align-middle"><i class="fas fa-truck mr-1"></i>Supplier</span>' : ''}</h1>
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
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Opening Balance</p>
            <p class="text-xl font-bold text-gray-800 mt-1">PKR ${this.fmt(opening)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">${this.escapeHtml(this.getColLabel('amount_received'))}</p>
            <p class="text-xl font-bold mt-1 amount-received">PKR ${this.fmt(totalReceived)}</p></div>
          <div class="balance-box"><p class="text-xs opacity-90">${isSupplier ? 'Outstanding Balance' : 'Remaining Balance'}</p>
            <p class="text-2xl font-bold mt-1">PKR ${this.fmt(netBalance)}</p>
            <p class="text-xs opacity-80 mt-1">${balanceHint}</p></div>
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
                  <td></td>
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
      const isPaid = pen <= 0;
      return `
        <tr data-id="${t.id}" class="${isAuto ? 'row-auto' : ''}">
          <td class="text-gray-500">${i + 1}${lockIcon}</td>
          <td class="cell-display">${t.entry_date || ''}</td>
          <td class="cell-display">${this.escapeHtml(t.bill_no || '')}</td>
          <td class="amount-pending cell-display">${isPaid ? '<span class="text-gray-400">—</span>' : 'PKR ' + this.fmt(pen)}</td>
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
          <input id="er-pen" type="number" step="any" min="0" class="input-field" value="${parseFloat(t.amount_pending) || 0}"></div>
        <div><label class="block text-sm font-medium mb-1">${this.escapeHtml(this.getColLabel('amount_received'))} (PKR)</label>
          <input id="er-rec" type="number" step="any" min="0" class="input-field" value="${parseFloat(t.amount_received) || 0}"></div>
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
            amount_received: parseFloat(document.getElementById('er-rec').value) || 0,
            amount_pending: parseFloat(document.getElementById('er-pen').value) || 0,
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
        <div><label class="block text-sm font-medium mb-1">Opening Balance</label><input id="c-balance" type="number" step="any" class="input-field" value="${c.opening_balance || 0}"></div>
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
      const [data, pData] = await Promise.all([
        this.api.get('/api/dashboard'),
        this.api.get('/api/products')
      ]);
      this.state.products = pData.products || [];
      this.renderDashboard(data);
    } catch (e) {}
  },

  renderDashboard(data) {
    const { totals, perFolder, topPending, recent, statuses, clientCount, folderCount, billStats,
            empCount, empPaid, empAdvance, expenseStats, rawStats, customSecCount,
            rawList, empList, expenseList, empPaidStats, profitStats, productList, invMfgList,
            salesTodayStats, salesMonthStats, salesAllTimeStats,
            salesTodayProducts, salesMonthProducts, salesAllTimeProducts } = data;
    const totalProfit = profitStats?.total_profit || 0;
    const profitMonth = profitStats?.profit_this_month || 0;
    const profitToday = profitStats?.profit_today || 0;
    // Side expense totals for final net profit calculation
    const sideExpTotal = parseFloat(expenseStats?.total) || 0;
    const sideExpToday = parseFloat(expenseStats?.total_today) || 0;
    const sideExpMonth = parseFloat(expenseStats?.total_month) || 0;
    // Final Net Profit = Gross Profit (from products) − Side Expenses
    const finalProfitAll = totalProfit - sideExpTotal;
    const finalProfitMonth = profitMonth - sideExpMonth;
    const finalProfitToday = profitToday - sideExpToday;
    const products = productList || [];
    const invMfg = invMfgList || [];
    const supplierStats = data.supplierStats || {};
    const mfgProducts = data.mfgProducts || [];
    const mfgIngredients = data.mfgIngredients || [];
    const builtSoldStats = data.builtSoldStats || [];
    // Build a map: product_id -> { ingredients: [{raw_name, raw_unit, quantity_required, raw_quantity, raw_rate}], cost_per_unit }
    const productRecipes = {};
    mfgProducts.forEach(p => { productRecipes[p.id] = { product: p, ingredients: [], cost_per_unit: 0, buildable: Infinity }; });
    mfgIngredients.forEach(ing => {
      const r = productRecipes[ing.product_id];
      if (!r) return;
      r.ingredients.push(ing);
      const rate = parseFloat(ing.raw_rate) || 0;
      const qReq = parseFloat(ing.quantity_required) || 0;
      r.cost_per_unit += rate * qReq;
      const stock = parseFloat(ing.raw_quantity) || 0;
      const buildable = qReq > 0 ? Math.floor(stock / qReq) : Infinity;
      if (buildable < r.buildable) r.buildable = buildable;
    });
    Object.values(productRecipes).forEach(r => { if (r.buildable === Infinity) r.buildable = 0; });
    const soldMap = {};
    builtSoldStats.forEach(s => { if (s.product_name) soldMap[s.product_name] = s; });
    const empTotalAmount = (empPaidStats && empPaidStats.total_amount) || 0;
    const empTotalPaid = (empPaidStats && empPaidStats.total_paid) || (typeof empPaid === 'number' ? empPaid : 0);
    // Recompute remaining across all employees: (salary owed - paid) - ACTIVE advance
    const empTotalRemaining = (empList || []).reduce((s, em) => {
      const tAmt = parseFloat(em.total_amount) || 0;
      const tPaid = parseFloat(em.total_paid) || 0;
      const adv = (em.advance_active !== undefined && em.advance_active !== null)
        ? (parseFloat(em.advance_active) || 0)
        : (parseFloat(em.total_advance) || 0);
      return s + ((tAmt - tPaid) - adv);
    }, 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-chart-line text-purple-500"></i>Dashboard</h1>
          <p class="page-subtitle">Overall financial summary — auto-updated</p>
        </div>
        <button onclick="App.showDashboard()" class="btn btn-secondary btn-sm"><i class="fas fa-sync-alt"></i> Refresh</button>
      </div>

      <div class="p-4 md:p-6 space-y-6">

        <!-- ============ SECTION 1: KEY METRICS ============ -->
        <section id="dash-kpis">
          <h2 class="dash-section-title"><i class="fas fa-gauge-high text-purple-500"></i>Key Metrics</h2>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-arrow-down mr-1"></i>Total Received</p>
              <p class="text-xl font-bold mt-1 amount-received">PKR ${this.fmt(totals.total_received)}</p></div>
            <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-balance-scale mr-1"></i>Remaining Balance</p>
              <p class="text-xl font-bold mt-1 amount-running">PKR ${this.fmt((totals.total_pending||0) - (totals.total_received||0))}</p></div>
            <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-file-invoice mr-1"></i>Bills</p>
              <p class="text-xl font-bold text-purple-600 mt-1">${billStats?.count || 0}</p>
              <p class="text-xs text-gray-400 mt-1">PKR ${this.fmt(billStats?.total_amount || 0)}</p></div>
            <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-users mr-1"></i>Clients / Sections</p>
              <p class="text-xl font-bold text-blue-600 mt-1">${clientCount} / ${folderCount}</p></div>
            <div class="stat-card cursor-pointer" onclick="App.showRawMaterials()">
              <p class="text-xs text-gray-500"><i class="fas fa-cubes mr-1"></i>Raw Materials</p>
              <p class="text-xl font-bold text-orange-600 mt-1">${rawStats?.count || 0} items</p>
              <p class="text-xs text-gray-400 mt-1">Stock: PKR ${this.fmt(rawStats?.total || 0)}</p>
            </div>
            <div class="stat-card cursor-pointer" onclick="App.showProducts()">
              <p class="text-xs text-gray-500"><i class="fas fa-industry mr-1"></i>Products / Mfg.</p>
              <p class="text-xl font-bold text-purple-600 mt-1">${products.length} product(s)</p>
              <p class="text-xs text-gray-400 mt-1">Recipes linked to raw</p>
            </div>
            <div class="stat-card cursor-pointer" onclick="App.showEmployees()">
              <p class="text-xs text-gray-500"><i class="fas fa-user-tie mr-1"></i>Employees</p>
              <p class="text-xl font-bold text-blue-600 mt-1">${empCount}</p>
              <p class="text-xs text-gray-400 mt-1">Remaining: PKR ${this.fmt(empTotalRemaining)}</p>
            </div>
            <div class="stat-card cursor-pointer" onclick="App.showSideExpenses()">
              <p class="text-xs text-gray-500"><i class="fas fa-money-bill-wave mr-1"></i>Side Expenses</p>
              <p class="text-xl font-bold text-red-600 mt-1">${expenseStats?.count || 0}</p>
              <p class="text-xs text-gray-400 mt-1">Total: PKR ${this.fmt(expenseStats?.total || 0)}</p>
            </div>
          </div>
        </section>

        <!-- ============ SECTION 2: PROFIT OVERVIEW (combined Gross + Net into one compact table) ============ -->
        <section id="dash-profit" class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title"><span><i class="fas fa-coins text-amber-500 mr-2"></i>Profit Overview</span></h2>
          <p class="text-xs text-gray-500 mb-3">Gross Profit = (Sell − Mfg. cost) × Qty (products only). &nbsp;Net Profit = Gross − Side Expenses.</p>
          <div class="overflow-x-auto">
            <table class="w-full text-sm profit-table">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Period</th>
                <th class="text-right p-3" title="Profit from products before side expenses">Gross Profit</th>
                <th class="text-right p-3" title="All side / running expenses">Side Expenses</th>
                <th class="text-right p-3" title="Final profit after side expenses">Net Profit</th>
              </tr></thead>
              <tbody>
                <tr class="border-t">
                  <td class="p-3 font-semibold text-blue-700"><i class="fas fa-sun mr-1"></i>Today</td>
                  <td class="text-right p-3 amount-received">PKR ${this.fmt(profitToday)}</td>
                  <td class="text-right p-3 text-red-600">PKR ${this.fmt(sideExpToday)}</td>
                  <td class="text-right p-3 font-bold ${finalProfitToday >= 0 ? 'text-green-700' : 'text-red-700'}">PKR ${this.fmt(finalProfitToday)}</td>
                </tr>
                <tr class="border-t">
                  <td class="p-3 font-semibold text-teal-700"><i class="fas fa-calendar-alt mr-1"></i>This Month</td>
                  <td class="text-right p-3 amount-received">PKR ${this.fmt(profitMonth)}</td>
                  <td class="text-right p-3 text-red-600">PKR ${this.fmt(sideExpMonth)}</td>
                  <td class="text-right p-3 font-bold ${finalProfitMonth >= 0 ? 'text-green-700' : 'text-red-700'}">PKR ${this.fmt(finalProfitMonth)}</td>
                </tr>
                <tr class="border-t-2 bg-amber-50 font-bold">
                  <td class="p-3 text-amber-800"><i class="fas fa-trophy mr-1"></i>All Time</td>
                  <td class="text-right p-3 amount-received">PKR ${this.fmt(totalProfit)}</td>
                  <td class="text-right p-3 text-red-600">PKR ${this.fmt(sideExpTotal)}</td>
                  <td class="text-right p-3 ${finalProfitAll >= 0 ? 'text-green-700' : 'text-red-700'}" style="font-size:1.05rem;">PKR ${this.fmt(finalProfitAll)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        <!-- ============ SECTION 3: SALES SUMMARY (Daily / Monthly / All-Time) ============ -->
        <section id="dash-sales" class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title">
            <span><i class="fas fa-chart-bar text-green-500 mr-2"></i>Sales Summary</span>
            <button onclick="App.showBills && App.showBills()" class="dash-link-btn">View Bills <i class="fas fa-arrow-right ml-1"></i></button>
          </h2>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <!-- Today -->
            <div class="rounded-lg border border-blue-200 bg-blue-50 p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-blue-800"><i class="fas fa-sun mr-1"></i>Today</span>
                <span class="text-xs text-blue-700">${(salesTodayStats?.bill_count) || 0} bill(s)</span>
              </div>
              <p class="text-xs text-blue-700">Units Sold</p>
              <p class="text-2xl font-extrabold text-blue-700">${this.fmt(salesTodayStats?.units_sold || 0)}</p>
              <p class="text-xs text-blue-700 mt-2">Revenue</p>
              <p class="text-lg font-bold text-blue-800">PKR ${this.fmt(salesTodayStats?.total_revenue || 0)}</p>
              <div class="mt-3 pt-3 border-t border-blue-200">
                <p class="text-xs text-blue-800 font-semibold mb-1">Products Sold:</p>
                ${(!salesTodayProducts || salesTodayProducts.length === 0) ? '<p class="text-xs text-gray-500 italic">No sales today</p>' :
                  salesTodayProducts.slice(0, 8).map(p => `
                    <div class="flex justify-between text-xs py-0.5">
                      <span class="text-gray-700 truncate" title="${this.escapeAttr(p.product_name || '')}">${this.escapeHtml(p.product_name || '-')}</span>
                      <span class="font-semibold text-blue-700">${this.fmt(p.units_sold)}</span>
                    </div>`).join('')}
                ${salesTodayProducts && salesTodayProducts.length > 8 ? `<p class="text-xs text-gray-400 mt-1">+${salesTodayProducts.length - 8} more</p>` : ''}
              </div>
            </div>

            <!-- This Month -->
            <div class="rounded-lg border border-teal-200 bg-teal-50 p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-teal-800"><i class="fas fa-calendar-alt mr-1"></i>This Month</span>
                <span class="text-xs text-teal-700">${(salesMonthStats?.bill_count) || 0} bill(s)</span>
              </div>
              <p class="text-xs text-teal-700">Units Sold</p>
              <p class="text-2xl font-extrabold text-teal-700">${this.fmt(salesMonthStats?.units_sold || 0)}</p>
              <p class="text-xs text-teal-700 mt-2">Revenue</p>
              <p class="text-lg font-bold text-teal-800">PKR ${this.fmt(salesMonthStats?.total_revenue || 0)}</p>
              <div class="mt-3 pt-3 border-t border-teal-200">
                <p class="text-xs text-teal-800 font-semibold mb-1">Products Sold:</p>
                ${(!salesMonthProducts || salesMonthProducts.length === 0) ? '<p class="text-xs text-gray-500 italic">No sales this month</p>' :
                  salesMonthProducts.slice(0, 8).map(p => `
                    <div class="flex justify-between text-xs py-0.5">
                      <span class="text-gray-700 truncate" title="${this.escapeAttr(p.product_name || '')}">${this.escapeHtml(p.product_name || '-')}</span>
                      <span class="font-semibold text-teal-700">${this.fmt(p.units_sold)}</span>
                    </div>`).join('')}
                ${salesMonthProducts && salesMonthProducts.length > 8 ? `<p class="text-xs text-gray-400 mt-1">+${salesMonthProducts.length - 8} more</p>` : ''}
              </div>
            </div>

            <!-- All Time -->
            <div class="rounded-lg border border-green-200 bg-green-50 p-4">
              <div class="flex items-center justify-between mb-2">
                <span class="text-sm font-semibold text-green-800"><i class="fas fa-infinity mr-1"></i>All Time</span>
                <span class="text-xs text-green-700">${(salesAllTimeStats?.bill_count) || 0} bill(s)</span>
              </div>
              <p class="text-xs text-green-700">Units Sold</p>
              <p class="text-2xl font-extrabold text-green-700">${this.fmt(salesAllTimeStats?.units_sold || 0)}</p>
              <p class="text-xs text-green-700 mt-2">Revenue</p>
              <p class="text-lg font-bold text-green-800">PKR ${this.fmt(salesAllTimeStats?.total_revenue || 0)}</p>
              <div class="mt-3 pt-3 border-t border-green-200">
                <p class="text-xs text-green-800 font-semibold mb-1">Products Sold:</p>
                ${(!salesAllTimeProducts || salesAllTimeProducts.length === 0) ? '<p class="text-xs text-gray-500 italic">No sales yet</p>' :
                  salesAllTimeProducts.slice(0, 8).map(p => `
                    <div class="flex justify-between text-xs py-0.5">
                      <span class="text-gray-700 truncate" title="${this.escapeAttr(p.product_name || '')}">${this.escapeHtml(p.product_name || '-')}</span>
                      <span class="font-semibold text-green-700">${this.fmt(p.units_sold)}</span>
                    </div>`).join('')}
                ${salesAllTimeProducts && salesAllTimeProducts.length > 8 ? `<p class="text-xs text-gray-400 mt-1">+${salesAllTimeProducts.length - 8} more</p>` : ''}
              </div>
            </div>
          </div>
        </section>

        <!-- ============ SECTION 4: DETAILED SUMMARIES ============ -->
        <h2 class="dash-section-title"><i class="fas fa-table-list text-gray-500"></i>Detailed Summaries</h2>

        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title"><span><i class="fas fa-folder-tree text-blue-500 mr-2"></i>Per-Section Summary</span></h2>
          ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-4">No sections yet</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Section</th><th class="text-right p-3">Entries</th>
                <th class="text-right p-3">Received</th><th class="text-right p-3">Remaining Balance</th>
              </tr></thead><tbody>
                ${perFolder.map(f => `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openFolder(${f.id})">
                    <td class="p-3"><i class="fas ${f.icon} mr-2" style="color:${f.color}"></i>${this.escapeHtml(f.name)}</td>
                    <td class="text-right p-3">${f.client_count}</td>
                    <td class="text-right p-3 amount-received">PKR ${this.fmt(f.total_received)}</td>
                    <td class="text-right p-3 amount-running">PKR ${this.fmt(f.total_pending - f.total_received)}</td>
                  </tr>`).join('')}
              </tbody></table></div>`}
        </section>

        <!-- Inventory Summary -->
        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title">
            <span><i class="fas fa-boxes text-orange-500 mr-2"></i>Inventory Summary</span>
            <button onclick="App.showInventory()" class="dash-link-btn">View All <i class="fas fa-arrow-right ml-1"></i></button>
          </h2>
          ${(!invMfg || invMfg.length === 0) ? '<p class="text-gray-500 text-center py-4">No inventory products yet. <a href="#" onclick="App.showInventory(); return false;" class="text-blue-600 hover:underline">Add a product →</a></p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Product</th>
                <th class="text-left p-3">SKU</th>
                <th class="text-left p-3">Category</th>
                <th class="text-right p-3" title="Quantity available in stock">Quantity</th>
                <th class="text-right p-3" title="Manufacturing / purchase cost per unit">Cost</th>
                <th class="text-right p-3" title="Selling / Sale price per unit">Sale Price</th>
                <th class="text-right p-3" title="Total units sold to customers">Sold</th>
              </tr></thead><tbody>
                ${invMfg.map(it => {
                  const qty = parseFloat(it.quantity) || 0;
                  const cost = parseFloat(it.manufacturing_cost) || 0;
                  const rate = parseFloat(it.rate) || 0;
                  const sold = soldMap[it.name] || {};
                  const unitsSold = parseFloat(sold.units_sold) || 0;
                  const lowStock = qty <= 5;
                  return `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.showInventory()">
                    <td class="p-3"><i class="fas fa-box text-orange-500 mr-2"></i><strong>${this.escapeHtml(it.name)}</strong>
                      <div class="text-xs text-gray-400">per ${this.escapeHtml(it.unit || 'pcs')}</div></td>
                    <td class="p-3 text-gray-600">${this.escapeHtml(it.sku || '-')}</td>
                    <td class="p-3 text-gray-600">${this.escapeHtml(it.category || '-')}</td>
                    <td class="text-right p-3 ${lowStock ? 'text-red-600 font-semibold' : 'text-green-700 font-semibold'}">${this.fmt(qty)} <span class="text-xs text-gray-400">${this.escapeHtml(it.unit || '')}</span></td>
                    <td class="text-right p-3 text-orange-600">${cost > 0 ? 'PKR ' + this.fmt(cost) : '<span class="text-gray-400">—</span>'}</td>
                    <td class="text-right p-3 font-medium">PKR ${this.fmt(rate)}</td>
                    <td class="text-right p-3 text-blue-700 font-semibold">${this.fmt(unitsSold)}</td>
                  </tr>`;
                }).join('')}
              </tbody></table></div>
          `}
        </section>

        <!-- Manufacturing Summary -->
        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title">
            <span><i class="fas fa-industry text-purple-500 mr-2"></i>Manufacturing Summary</span>
            <div class="flex gap-2">
              <button onclick="App.showProducts()" class="dash-link-btn">Recipes <i class="fas fa-arrow-right ml-1"></i></button>
              <button onclick="App.showRawMaterials()" class="dash-link-btn">Raw Materials <i class="fas fa-arrow-right ml-1"></i></button>
            </div>
          </h2>
          ${(mfgProducts.length === 0) ? '<p class="text-gray-500 text-center py-4">No manufactured products yet. <a href="#" onclick="App.showProducts(); return false;" class="text-blue-600 hover:underline">Add a product recipe →</a></p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Product</th>
                <th class="text-left p-3" title="Raw materials needed per unit">Recipe (per unit)</th>
                <th class="text-right p-3" title="Mfg cost = sum of (raw rate × required qty)">Cost / unit</th>
                <th class="text-right p-3" title="Units that can be built from current raw stock">Buildable</th>
              </tr></thead><tbody>
                ${mfgProducts.slice(0, 15).map(p => {
                  const r = productRecipes[p.id] || { ingredients: [], cost_per_unit: 0, buildable: 0 };
                  const cost = r.cost_per_unit;
                  const recipeText = r.ingredients.length === 0
                    ? '<span class="text-gray-400 italic">No recipe set</span>'
                    : r.ingredients.map(ing => `<span class="inline-block bg-orange-50 text-orange-800 text-xs px-2 py-0.5 rounded mr-1 mb-1">${this.escapeHtml(ing.raw_name || '?')} × ${this.fmt(ing.quantity_required)} ${this.escapeHtml(ing.unit || ing.raw_unit || '')}</span>`).join('');
                  return `
                  <tr class="border-t hover:bg-gray-50">
                    <td class="p-3 align-top"><i class="fas fa-cogs text-purple-500 mr-2"></i><strong>${this.escapeHtml(p.name)}</strong>
                      ${p.category ? `<div class="text-xs text-gray-400">${this.escapeHtml(p.category)}</div>` : ''}
                      <div class="text-xs text-gray-400">per ${this.escapeHtml(p.unit || 'unit')}</div></td>
                    <td class="p-3 align-top">${recipeText}</td>
                    <td class="text-right p-3 align-top text-orange-600">${cost > 0 ? 'PKR ' + this.fmt(cost) : '<span class="text-gray-400">—</span>'}</td>
                    <td class="text-right p-3 align-top ${r.buildable > 0 ? 'text-green-700 font-semibold' : 'text-red-500'}">${this.fmt(r.buildable)}</td>
                  </tr>`;
                }).join('')}
              </tbody></table></div>
            ${mfgProducts.length > 15 ? `<p class="text-xs text-gray-400 text-center mt-2">Showing 15 of ${mfgProducts.length} products</p>` : ''}
          `}
        </section>

        <!-- Raw Material Summary -->
        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title">
            <span><i class="fas fa-cubes text-orange-500 mr-2"></i>Raw Material Summary</span>
            <button onclick="App.showRawMaterials()" class="dash-link-btn">View All <i class="fas fa-arrow-right ml-1"></i></button>
          </h2>

          <!-- Supplier Stats (moved here from Manufacturing Summary) -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4 text-xs">
            <div class="bg-orange-50 rounded p-3"><p class="text-gray-500"><i class="fas fa-cubes mr-1"></i>Raw Purchased</p><p class="font-bold text-orange-700 text-lg">PKR ${this.fmt(supplierStats.total_purchased || 0)}</p></div>
            <div class="bg-green-50 rounded p-3"><p class="text-gray-500"><i class="fas fa-check-circle mr-1"></i>Paid to Suppliers</p><p class="font-bold text-green-700 text-lg">PKR ${this.fmt(supplierStats.total_paid || 0)}</p></div>
            <div class="bg-red-50 rounded p-3"><p class="text-gray-500"><i class="fas fa-exclamation-circle mr-1"></i>Owed to Suppliers</p><p class="font-bold text-red-700 text-lg">PKR ${this.fmt(supplierStats.total_remaining || 0)}</p></div>
          </div>

          ${(!rawList || rawList.length === 0) ? '<p class="text-gray-500 text-center py-4">No raw materials yet</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Material</th>
                <th class="text-left p-3">Supplier</th>
                <th class="text-right p-3">Quantity</th>
                <th class="text-right p-3">Rate</th>
                <th class="text-right p-3">Total Value</th>
              </tr></thead><tbody>
                ${rawList.map(r => `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.showRawMaterials()">
                    <td class="p-3"><i class="fas fa-cube text-orange-500 mr-2"></i>${this.escapeHtml(r.name)}</td>
                    <td class="p-3 text-gray-600">${this.escapeHtml(r.supplier_name || '-')}</td>
                    <td class="text-right p-3">${this.fmt(r.quantity)} <span class="text-xs text-gray-400">${this.escapeHtml(r.unit || '')}</span></td>
                    <td class="text-right p-3">PKR ${this.fmt(r.rate)}</td>
                    <td class="text-right p-3 amount-running font-semibold">PKR ${this.fmt(r.total_value)}</td>
                  </tr>`).join('')}
                <tr class="border-t-2 bg-gray-50 font-bold">
                  <td class="p-3" colspan="4">Total Stock Value</td>
                  <td class="text-right p-3 amount-running">PKR ${this.fmt(rawStats?.total || 0)}</td>
                </tr>
              </tbody></table></div>`}
        </section>

        <!-- Employees Summary -->
        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title">
            <span><i class="fas fa-user-tie text-blue-500 mr-2"></i>Employees Summary</span>
            <button onclick="App.showEmployees()" class="dash-link-btn">View All <i class="fas fa-arrow-right ml-1"></i></button>
          </h2>
          ${(!empList || empList.length === 0) ? '<p class="text-gray-500 text-center py-4">No employees yet</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Employee</th>
                <th class="text-left p-3">Designation</th>
                <th class="text-right p-3">Total Salary</th>
                <th class="text-right p-3">Paid</th>
                <th class="text-right p-3">Remaining</th>
                <th class="text-center p-3">Status</th>
              </tr></thead><tbody>
                ${empList.map(em => {
                  const tAmt = parseFloat(em.total_amount) || 0;
                  const tPaid = parseFloat(em.total_paid) || 0;
                  const adv = (em.advance_active !== undefined && em.advance_active !== null)
                    ? (parseFloat(em.advance_active) || 0)
                    : (parseFloat(em.total_advance) || 0);
                  const tRemain = (tAmt - tPaid) - adv;
                  return `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openEmployee(${em.id})">
                    <td class="p-3"><i class="fas fa-user text-blue-500 mr-2"></i>${this.escapeHtml(em.name)}${em.salary_type === 'per_piece' ? ' <i class="fas fa-cubes text-orange-500 ml-1" title="Per Piece"></i>' : ''}</td>
                    <td class="p-3 text-gray-600">${this.escapeHtml(em.designation || '-')}</td>
                    <td class="text-right p-3">PKR ${this.fmt(tAmt)}</td>
                    <td class="text-right p-3 amount-received">PKR ${this.fmt(tPaid)}</td>
                    <td class="text-right p-3 ${tRemain < 0 ? 'amount-running' : 'amount-pending'} font-semibold">PKR ${this.fmt(tRemain)}</td>
                    <td class="text-center p-3"><span class="status-badge ${em.active ? 'status-received' : 'status-cancelled'}">${em.active ? 'Active' : 'Inactive'}</span></td>
                  </tr>`}).join('')}
                <tr class="border-t-2 bg-gray-50 font-bold">
                  <td class="p-3" colspan="2">Totals</td>
                  <td class="text-right p-3">PKR ${this.fmt(empTotalAmount)}</td>
                  <td class="text-right p-3 amount-received">PKR ${this.fmt(empTotalPaid)}</td>
                  <td class="text-right p-3 amount-pending">PKR ${this.fmt(empTotalRemaining)}</td>
                  <td></td>
                </tr>
              </tbody></table></div>`}
        </section>

        <!-- Side Expenses Summary -->
        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title">
            <span><i class="fas fa-money-bill-wave text-red-500 mr-2"></i>Side Expenses Summary</span>
            <button onclick="App.showSideExpenses()" class="dash-link-btn">View All <i class="fas fa-arrow-right ml-1"></i></button>
          </h2>
          ${(!expenseList || expenseList.length === 0) ? '<p class="text-gray-500 text-center py-4">No side expenses yet</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-3">Date</th>
                <th class="text-left p-3">Category</th>
                <th class="text-left p-3">Description</th>
                <th class="text-left p-3">Paid To</th>
                <th class="text-right p-3">Amount</th>
              </tr></thead><tbody>
                ${expenseList.slice(0, 10).map(ex => `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.showSideExpenses()">
                    <td class="p-3">${this.escapeHtml(ex.entry_date || '')}</td>
                    <td class="p-3"><span class="status-badge status-pending">${this.escapeHtml(ex.category || '-')}</span></td>
                    <td class="p-3 text-gray-700">${this.escapeHtml(ex.description || '-')}</td>
                    <td class="p-3 text-gray-600">${this.escapeHtml(ex.paid_to || '-')}</td>
                    <td class="text-right p-3 amount-received font-semibold">PKR ${this.fmt(ex.amount)}</td>
                  </tr>`).join('')}
                <tr class="border-t-2 bg-gray-50 font-bold">
                  <td class="p-3" colspan="4">Total Side Expenses (${expenseStats?.count || 0} entries)</td>
                  <td class="text-right p-3 amount-received">PKR ${this.fmt(expenseStats?.total || 0)}</td>
                </tr>
              </tbody></table></div>
            ${expenseList.length > 10 ? `<p class="text-xs text-gray-400 text-center mt-2">Showing latest 10 of ${expenseList.length} entries</p>` : ''}
          `}
        </section>

        <!-- ============ SECTION 5: ACTIVITY & HISTORY ============ -->
        <h2 class="dash-section-title"><i class="fas fa-clock-rotate-left text-gray-500"></i>Activity &amp; History</h2>

        <!-- Activity Calendar -->
        <div id="dashboard-calendar"></div>

        <section class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="dash-card-title"><span><i class="fas fa-history text-gray-500 mr-2"></i>Recent Transactions</span></h2>
          ${recent.length === 0 ? '<p class="text-gray-500 text-center py-4">No transactions</p>' : `
            <div class="overflow-x-auto"><table class="w-full text-sm">
              <thead class="bg-gray-50"><tr>
                <th class="text-left p-2">Date</th><th class="text-left p-2">Client</th>
                <th class="text-left p-2">Bill</th><th class="text-right p-2">Received</th>
                <th class="text-left p-2">Status</th>
              </tr></thead><tbody>
                ${recent.map(t => `
                  <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openClient(${t.client_id})">
                    <td class="p-2">${t.entry_date}</td>
                    <td class="p-2">${this.escapeHtml(t.client_name || '')} <span class="text-xs text-gray-500">/ ${this.escapeHtml(t.folder_name || '')}</span></td>
                    <td class="p-2">${this.escapeHtml(t.bill_no || '-')}</td>
                    <td class="p-2 text-right amount-received">PKR ${this.fmt(t.amount_received)}</td>
                    <td class="p-2"><span class="status-badge status-${(t.status||'').toLowerCase()}">${this.escapeHtml(t.status || '')}</span></td>
                  </tr>`).join('')}
              </tbody></table></div>`}
        </section>
      </div>`;

    // Render calendar
    this.renderCalendar('dashboard-calendar');

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
    // Potential profit (per-unit (rate - mfg_cost) * qty in stock) — internal indicator only
    const potentialProfit = this.state.inventory.reduce((s, i) => {
      const margin = (parseFloat(i.rate) || 0) - (parseFloat(i.manufacturing_cost) || 0);
      return s + margin * (parseFloat(i.quantity) || 0);
    }, 0);
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
          <div class="stat-card"><p class="text-xs text-gray-500" title="If all current stock sold at selling rate">Potential Profit</p><p class="text-xl font-bold text-green-600">PKR ${this.fmt(potentialProfit)}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Product</th><th style="width:120px;">SKU</th>
              <th style="width:90px;">Unit</th>
              <th style="width:130px;" title="Internal: cost to manufacture / buy one unit. Never shown on bill.">Mfg. Cost</th>
              <th style="width:120px;" title="Selling price (used on bill)">Selling Rate</th>
              <th style="width:120px;" title="Per-unit profit = Selling - Mfg.">Margin</th>
              <th style="width:110px;">Qty</th><th style="width:130px;">Stock Value</th>
              <th style="width:120px;">Category</th><th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="11" class="text-center py-8 text-gray-500">
                <i class="fas fa-box-open text-3xl mb-2 block"></i>${filter ? 'No matching products' : 'No products yet.'}</td></tr>` :
                items.map((it, i) => {
                  const rate = parseFloat(it.rate) || 0, qty = parseFloat(it.quantity) || 0;
                  const mfg = parseFloat(it.manufacturing_cost) || 0;
                  const margin = rate - mfg;
                  const value = rate * qty, lowStock = qty <= 5;
                  return `<tr>
                    <td class="text-gray-500">${i + 1}</td>
                    <td>${this.escapeHtml(it.name)}</td>
                    <td>${this.escapeHtml(it.sku || '')}</td>
                    <td>${this.escapeHtml(it.unit || 'pcs')}</td>
                    <td class="text-right text-orange-600">${mfg > 0 ? this.fmt(mfg) : '<span class="text-gray-400">—</span>'}</td>
                    <td class="text-right font-medium">${this.fmt(rate)}</td>
                    <td class="text-right ${margin >= 0 ? 'text-green-600' : 'text-red-600'} font-semibold">${this.fmt(margin)}</td>
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
    const it = id ? this.state.inventory.find(x => x.id === id) : { name:'', sku:'', unit:'pcs', rate:0, quantity:0, category:'', notes:'', manufacturing_cost:0 };
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
        <div class="bg-orange-50 border border-orange-200 rounded-lg p-3 space-y-2">
          <p class="text-xs text-orange-800"><i class="fas fa-industry mr-1"></i><strong>Pricing & Profit</strong> — Manufacturing Cost is internal and never appears on the bill. Net profit per unit = Selling Rate − Manufacturing Cost.</p>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-sm font-medium mb-1 text-orange-900">Manufacturing Cost (PKR)</label>
              <input id="i-mfg" type="number" step="any" class="input-field" value="${it.manufacturing_cost || 0}" oninput="App._calcInvMargin()" placeholder="e.g. 2000"></div>
            <div><label class="block text-sm font-medium mb-1 text-blue-900">Selling Rate / Bill Rate (PKR)</label>
              <input id="i-rate" type="number" step="any" class="input-field" value="${it.rate || 0}" oninput="App._calcInvMargin()" placeholder="e.g. 3000"></div>
          </div>
          <div class="flex justify-between items-center text-sm bg-white rounded p-2">
            <span class="text-gray-600">Net Profit per unit:</span>
            <span id="i-margin" class="font-bold text-green-600">PKR 0.00</span>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div><label class="block text-sm font-medium mb-1">Quantity in Stock</label><input id="i-qty" type="number" step="any" class="input-field" value="${it.quantity || 0}"></div>
          <div><label class="block text-sm font-medium mb-1">Category</label><input id="i-cat" type="text" class="input-field" value="${this.escapeAttr(it.category || '')}"></div>
        </div>
        <div><label class="block text-sm font-medium mb-1">Notes</label><textarea id="i-notes" class="input-field" rows="2">${this.escapeHtml(it.notes || '')}</textarea></div>
        <div class="flex gap-2 justify-end pt-2">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteInv(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`);
    this._calcInvMargin();
    document.getElementById('inv-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        name: document.getElementById('i-name').value,
        sku: document.getElementById('i-sku').value,
        unit: document.getElementById('i-unit').value || 'pcs',
        rate: parseFloat(document.getElementById('i-rate').value) || 0,
        manufacturing_cost: parseFloat(document.getElementById('i-mfg').value) || 0,
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

  _calcInvMargin() {
    const rate = parseFloat(document.getElementById('i-rate')?.value) || 0;
    const mfg = parseFloat(document.getElementById('i-mfg')?.value) || 0;
    const margin = rate - mfg;
    const el = document.getElementById('i-margin');
    if (el) {
      el.textContent = 'PKR ' + this.fmt(margin);
      el.className = 'font-bold ' + (margin >= 0 ? 'text-green-600' : 'text-red-600');
    }
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
    // Total amount we still owe suppliers across all materials (sum of suppliers[].remaining_amount)
    const totalSupOwed = items.reduce((s, it) => {
      const sups = it.suppliers || [];
      return s + sups.reduce((s2, sp) => s2 + (parseFloat(sp.remaining_amount) || 0), 0);
    }, 0);
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
          <div class="stat-card"><p class="text-xs text-gray-500"><i class="fas fa-hand-holding-usd mr-1"></i>Owed to Suppliers</p><p class="text-xl font-bold text-red-600">PKR ${this.fmt(totalSupOwed)}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Material Name</th>
              <th style="width:90px;">Unit</th><th style="width:110px;">Quantity</th>
              <th style="width:110px;">Avg Rate</th><th style="width:130px;">Total Value</th>
              <th>Suppliers</th><th style="width:120px;">Category</th>
              <th style="width:130px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="9" class="text-center py-8 text-gray-500">
                <i class="fas fa-cubes text-3xl mb-2 block"></i>No raw materials yet.</td></tr>` :
                items.map((it, i) => {
                  const lowStock = (parseFloat(it.quantity) || 0) <= 5;
                  const sups = it.suppliers || [];
                  let supHtml = '';
                  if (sups.length === 0) {
                    supHtml = '<span class="text-gray-400">—</span>';
                  } else {
                    supHtml = sups.map(sp => {
                      const nm = sp.supplier_name_resolved || sp.supplier_name || '(unnamed)';
                      const rem = parseFloat(sp.remaining_amount) || 0;
                      const remHtml = rem > 0
                        ? ` <span class="text-red-600 text-xs" title="Remaining to pay">(owe PKR ${this.fmt(rem)})</span>`
                        : ' <span class="text-green-600 text-xs">(paid)</span>';
                      const link = sp.supplier_id
                        ? `<a href="#" onclick="App.openClient(${sp.supplier_id}); return false;" class="text-blue-500 hover:underline">${this.escapeHtml(nm)}</a>`
                        : this.escapeHtml(nm);
                      return `<div class="text-xs">${link}${remHtml}</div>`;
                    }).join('');
                  }
                  return `<tr>
                    <td class="text-gray-500">${i + 1}</td>
                    <td>${this.escapeHtml(it.name)}</td>
                    <td>${this.escapeHtml(it.unit || 'pcs')}</td>
                    <td class="${lowStock ? 'low-stock' : 'in-stock'}">${this.fmt(it.quantity)}</td>
                    <td>${this.fmt(it.rate)}</td>
                    <td class="amount-running text-right font-bold">PKR ${this.fmt(it.total_value)}</td>
                    <td>${supHtml}</td>
                    <td>${this.escapeHtml(it.category || '')}</td>
                    <td>
                      <button onclick="App.showRawDetail(${it.id})" class="btn btn-secondary btn-sm" title="View / Manage Batches & Payments"><i class="fas fa-list"></i></button>
                      <button onclick="App.showRawEditor(${it.id})" class="btn btn-secondary btn-sm ml-1" title="Edit"><i class="fas fa-edit"></i></button>
                      <button onclick="App.deleteRaw(${it.id})" class="text-red-500 hover:text-red-700 ml-1"><i class="fas fa-trash text-sm"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
            </tbody></table></div>
        </div>
      </div>`;
  },

  // Raw material detail modal: shows full purchase / batch history with supplier payments.
  async showRawDetail(id) {
    try {
      const data = await this.api.get(`/api/raw-materials/${id}`);
      const it = data.item;
      const purchases = data.purchases || [];
      const totalAmt = purchases.reduce((s, p) => s + (parseFloat(p.total_amount) || 0), 0);
      const totalPaid = purchases.reduce((s, p) => s + (parseFloat(p.paid_amount) || 0), 0);
      const totalRem = purchases.reduce((s, p) => s + (parseFloat(p.remaining_amount) || 0), 0);
      this.openModal(`
        <h2 class="text-xl font-bold mb-1"><i class="fas fa-cubes text-orange-500 mr-2"></i>${this.escapeHtml(it.name)}</h2>
        <p class="text-xs text-gray-500 mb-4">Stock: <strong>${this.fmt(it.quantity)} ${this.escapeHtml(it.unit||'')}</strong> · Avg Rate: PKR ${this.fmt(it.rate)} · Total Value: <strong class="amount-running">PKR ${this.fmt(it.total_value)}</strong></p>

        <div class="grid grid-cols-3 gap-2 mb-4 text-sm">
          <div class="p-2 bg-gray-50 rounded text-center">
            <div class="text-xs text-gray-500">Total Purchased</div>
            <div class="font-bold">PKR ${this.fmt(totalAmt)}</div>
          </div>
          <div class="p-2 bg-green-50 rounded text-center">
            <div class="text-xs text-green-700">Paid to Suppliers</div>
            <div class="font-bold text-green-700">PKR ${this.fmt(totalPaid)}</div>
          </div>
          <div class="p-2 bg-red-50 rounded text-center">
            <div class="text-xs text-red-700">Still Owed</div>
            <div class="font-bold text-red-700">PKR ${this.fmt(totalRem)}</div>
          </div>
        </div>

        <div class="mb-3 flex items-center justify-between">
          <h3 class="font-semibold text-gray-800"><i class="fas fa-history mr-2"></i>Purchase / Restock History</h3>
          <button onclick="App.showRestockRaw(${id})" class="btn btn-success btn-sm"><i class="fas fa-plus"></i> Add Restock / Purchase</button>
        </div>

        <div class="overflow-x-auto"><table class="ledger-table text-xs">
          <thead><tr>
            <th>Date</th><th>Supplier</th><th class="text-right">Qty</th><th class="text-right">Rate</th>
            <th class="text-right">Total</th><th class="text-right">Paid</th><th class="text-right">Remaining</th>
            <th style="width:130px;">Action</th>
          </tr></thead><tbody>
            ${purchases.length === 0
              ? `<tr><td colspan="8" class="text-center py-6 text-gray-500">No purchase history yet.</td></tr>`
              : purchases.map(p => {
                  const supName = p.supplier_name_resolved || p.supplier_name || '(no supplier)';
                  const rem = parseFloat(p.remaining_amount) || 0;
                  return `<tr>
                    <td>${this.escapeHtml(p.entry_date || '')}</td>
                    <td>${p.supplier_id
                        ? `<a href="#" onclick="App.openClient(${p.supplier_id}); return false;" class="text-blue-500 hover:underline">${this.escapeHtml(supName)}</a>`
                        : this.escapeHtml(supName)}</td>
                    <td class="text-right">${this.fmt(p.quantity)}</td>
                    <td class="text-right">${this.fmt(p.rate)}</td>
                    <td class="text-right">PKR ${this.fmt(p.total_amount)}</td>
                    <td class="text-right text-green-700">PKR ${this.fmt(p.paid_amount)}</td>
                    <td class="text-right ${rem > 0 ? 'text-red-700 font-bold' : 'text-gray-400'}">PKR ${this.fmt(rem)}</td>
                    <td>
                      ${rem > 0 ? `<button onclick="App.showPaySupplier(${p.id}, ${id})" class="btn btn-success btn-sm" title="Pay Supplier"><i class="fas fa-money-bill-wave"></i></button>` : ''}
                      <button onclick="App.deleteRawPurchase(${p.id}, ${id})" class="text-red-500 hover:text-red-700 ml-1" title="Delete batch"><i class="fas fa-trash text-sm"></i></button>
                    </td>
                  </tr>`;
                }).join('')}
          </tbody></table></div>

        <div class="flex gap-2 justify-end pt-3 mt-3 border-t">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Close</button>
        </div>
      `, 'modal-lg');
    } catch (e) { this.toast('Failed to load detail', 'error'); }
  },

  // Modal: pay a supplier for a specific purchase batch (reduces remaining_amount).
  showPaySupplier(purchaseId, rawId) {
    this.openModal(`
      <h2 class="text-xl font-bold mb-3"><i class="fas fa-money-bill-wave text-green-600 mr-2"></i>Pay Supplier</h2>
      <p class="text-sm text-gray-600 mb-3">Enter the amount you are paying. It will be added to the supplier's ledger automatically.</p>
      <form id="pay-sup-form" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Amount Paid (PKR) *</label>
          <input id="ps-amount" type="number" step="any" min="0.01" required class="input-field" autofocus>
        </div>
        <div class="flex gap-2 justify-end pt-2 border-t">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success"><i class="fas fa-check"></i> Save Payment</button>
        </div>
      </form>
    `);
    document.getElementById('pay-sup-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const amount = parseFloat(document.getElementById('ps-amount').value) || 0;
      if (amount <= 0) { this.toast('Amount must be > 0', 'error'); return; }
      try {
        await this.api.post(`/api/raw-material-purchases/${purchaseId}/pay`, { amount });
        this.closeModal();
        await this.showRawMaterials();
        this.showRawDetail(rawId);
        this.toast('Payment recorded', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  async deleteRawPurchase(purchaseId, rawId) {
    if (!confirm('Delete this purchase batch? This will also remove its entry from the supplier ledger.')) return;
    try {
      await this.api.delete(`/api/raw-material-purchases/${purchaseId}`);
      await this.showRawMaterials();
      this.showRawDetail(rawId);
      this.toast('Batch removed', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  showRawEditor(id = null) {
    const it = id ? this.state.rawMaterials.find(x => x.id === id) : { name:'', unit:'pcs', quantity:0, rate:0, supplier_id:null, supplier_name:'', category:'', notes:'' };
    if (id && !it) return;
    const supplierOpts = this.state.allClients.map(c => `<option value="${c.id}" ${it.supplier_id == c.id ? 'selected' : ''}>${this.escapeHtml(c.name)} (${this.escapeHtml(c.folder_name || '')})</option>`).join('');

    // EDIT mode: only basic fields (name/unit/category/notes). Quantity/rate/supplier come from purchase batches.
    if (id) {
      this.openModal(`
        <h2 class="text-xl font-bold mb-4"><i class="fas fa-edit text-blue-500 mr-2"></i>Edit Raw Material</h2>
        <p class="text-xs text-gray-500 mb-4"><i class="fas fa-info-circle mr-1"></i>Quantity, rate and supplier info are managed via the purchase / restock history. Click the <i class="fas fa-list"></i> button on the list to view batches and pay suppliers.</p>
        <form id="raw-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Material Name *</label>
            <input id="r-name" type="text" required class="input-field" value="${this.escapeAttr(it.name || '')}"></div>
          <div><label class="block text-sm font-medium mb-1">Unit</label>
            <select id="r-unit" class="input-field">
              ${['pcs','kg','gram','ton','litre','ml','meter','cm','foot','inch','yard','box','dozen','pack','roll','bag','bottle','bundle','sheet','set','pair','carton'].map(u => `<option value="${u}" ${ (it.unit || 'pcs') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select></div>
          <div><label class="block text-sm font-medium mb-1">Category</label>
            <input id="r-cat" type="text" class="input-field" value="${this.escapeAttr(it.category || '')}"></div>
          <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label>
            <textarea id="r-notes" class="input-field" rows="2">${this.escapeHtml(it.notes || '')}</textarea></div>
          <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
            <button type="button" class="btn btn-danger mr-auto" onclick="App.deleteRaw(${id})"><i class="fas fa-trash"></i> Delete</button>
            <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
            <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
          </div>
        </form>`, 'modal-lg');
      document.getElementById('raw-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payload = {
          name: document.getElementById('r-name').value,
          unit: document.getElementById('r-unit').value || 'pcs',
          category: document.getElementById('r-cat').value,
          notes: document.getElementById('r-notes').value
        };
        try {
          await this.api.put(`/api/raw-materials/${id}`, payload);
          this.closeModal();
          await this.showRawMaterials();
          this.toast('Saved', 'success');
        } catch (err) { this.toast('Failed', 'error'); }
      });
      return;
    }

    // ADD mode: full form with supplier + payment fields. This creates an initial purchase batch.
    const existingPickerHtml = `
      <div class="md:col-span-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
        <label class="block text-sm font-semibold mb-1 text-amber-800"><i class="fas fa-recycle mr-1"></i>Restock an existing material? (recommended)</label>
        <select id="r-existing" class="input-field" onchange="App._pickExistingRaw()">
          <option value="">-- This is a brand new material --</option>
          ${this.state.rawMaterials.map(r => `<option value="${r.id}">${this.escapeHtml(r.name)} (${this.escapeHtml(r.unit||'pcs')}) — Stock: ${this.fmt(r.quantity)} @ PKR ${this.fmt(r.rate)}</option>`).join('')}
        </select>
        <p class="text-xs text-amber-700 mt-1">Pick an existing material to record a new <strong>purchase batch</strong> for it. Same material can have many batches from different suppliers.</p>
      </div>`;

    const today = new Date().toISOString().slice(0, 10);
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-cubes text-orange-500 mr-2"></i>Add Raw Material</h2>
      <form id="raw-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        ${existingPickerHtml}
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Material Name *</label>
          <input id="r-name" type="text" required class="input-field" value="" oninput="App._checkRawDuplicate()"></div>
        <div><label class="block text-sm font-medium mb-1">Unit</label>
          <select id="r-unit" class="input-field" onchange="App._checkRawDuplicate()">
            ${['pcs','kg','gram','ton','litre','ml','meter','cm','foot','inch','yard','box','dozen','pack','roll','bag','bottle','bundle','sheet','set','pair','carton'].map(u => `<option value="${u}" ${u === 'pcs' ? 'selected' : ''}>${u}</option>`).join('')}
          </select></div>
        <div><label class="block text-sm font-medium mb-1">Category</label>
          <input id="r-cat" type="text" class="input-field" value=""></div>

        <div><label class="block text-sm font-medium mb-1">Date</label>
          <input id="r-date" type="date" class="input-field" value="${today}"></div>
        <div><label class="block text-sm font-medium mb-1">Quantity to Add *</label>
          <input id="r-qty" type="number" step="any" min="0" required class="input-field" value="0" oninput="App._calcRawTotal()"></div>
        <div><label class="block text-sm font-medium mb-1">Rate per Unit (PKR) *</label>
          <input id="r-rate" type="number" step="any" min="0" required class="input-field" value="0" oninput="App._calcRawTotal()"></div>
        <div><label class="block text-sm font-medium mb-1">Total (Bill Amount)</label>
          <div id="r-total" class="input-field" style="background:#f8fafc; font-weight:bold;">PKR 0.00</div></div>

        <div class="md:col-span-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <h3 class="text-sm font-semibold text-green-900 mb-2"><i class="fas fa-money-bill-wave mr-1"></i>Supplier &amp; Payment</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Supplier (link to client)</label>
              <select id="r-supplier" class="input-field">
                <option value="">-- None / Manual --</option>
                ${supplierOpts}
              </select>
              <p class="text-xs text-gray-500 mt-1">If linked, the unpaid balance will auto-appear on this supplier's ledger as money you owe them.</p></div>
            <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Supplier Name (manual, if not linked)</label>
              <input id="r-supname" type="text" class="input-field" value=""></div>
            <div><label class="block text-sm font-medium mb-1">Amount Paid Now (PKR)</label>
              <input id="r-paid" type="number" step="any" min="0" class="input-field" value="0" oninput="App._calcRawPayPreview()">
              <p class="text-xs text-gray-500 mt-1">Leave 0 if you haven't paid yet. The remaining balance will be saved to the ledger.</p></div>
            <div><label class="block text-sm font-medium mb-1">Remaining (Owed)</label>
              <div id="r-remaining" class="input-field" style="background:#fef2f2; font-weight:bold; color:#b91c1c;">PKR 0.00</div></div>
          </div>
        </div>

        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label>
          <textarea id="r-notes" class="input-field" rows="2"></textarea></div>
        <div id="r-dup-hint" class="md:col-span-2 hidden p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-800"></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');
    this._calcRawTotal();
    this._calcRawPayPreview();
    this._checkRawDuplicate();
    document.getElementById('raw-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const targetId = document.getElementById('r-existing')?.value ? parseInt(document.getElementById('r-existing').value) : null;
      const payload = {
        name: document.getElementById('r-name').value,
        unit: document.getElementById('r-unit').value || 'pcs',
        quantity: parseFloat(document.getElementById('r-qty').value) || 0,
        rate: parseFloat(document.getElementById('r-rate').value) || 0,
        supplier_id: document.getElementById('r-supplier').value ? parseInt(document.getElementById('r-supplier').value) : null,
        supplier_name: document.getElementById('r-supname').value,
        paid_amount: parseFloat(document.getElementById('r-paid').value) || 0,
        entry_date: document.getElementById('r-date').value,
        category: document.getElementById('r-cat').value,
        notes: document.getElementById('r-notes').value,
        target_id: targetId
      };
      try {
        const res = await this.api.post('/api/raw-materials', payload);
        this.closeModal();
        await this.showRawMaterials();
        this.toast(res?.merged ? 'Purchase batch added' : 'Material saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  _calcRawPayPreview() {
    const qty = parseFloat(document.getElementById('r-qty')?.value) || 0;
    const rate = parseFloat(document.getElementById('r-rate')?.value) || 0;
    const paid = parseFloat(document.getElementById('r-paid')?.value) || 0;
    const total = qty * rate;
    const remaining = Math.max(0, total - paid);
    const el = document.getElementById('r-remaining');
    if (el) el.textContent = 'PKR ' + this.fmt(remaining);
  },

  // When user picks an existing material from the "Restock" dropdown,
  // auto-fill name/unit so the new batch attaches to the right material.
  // Supplier is left blank so the user can pick a different supplier for this batch.
  _pickExistingRaw() {
    const sel = document.getElementById('r-existing');
    if (!sel || !sel.value) { this._checkRawDuplicate(); return; }
    const rm = this.state.rawMaterials.find(x => x.id == sel.value);
    if (!rm) return;
    document.getElementById('r-name').value = rm.name || '';
    const unitSel = document.getElementById('r-unit');
    if (unitSel) {
      const opt = Array.from(unitSel.options).find(o => o.value === (rm.unit || 'pcs'));
      if (opt) unitSel.value = opt.value;
    }
    document.getElementById('r-cat').value = rm.category || '';
    document.getElementById('r-rate').value = rm.rate || 0;
    document.getElementById('r-qty').value = 0; // user enters quantity to ADD
    this._calcRawTotal();
    this._calcRawPayPreview();
    this._checkRawDuplicate();
  },

  // Live duplicate check: warn user that a matching material exists and a new batch will be added to it.
  _checkRawDuplicate() {
    const hint = document.getElementById('r-dup-hint');
    const picker = document.getElementById('r-existing');
    if (!hint) return;
    if (picker && picker.value) {
      const rm = this.state.rawMaterials.find(x => x.id == picker.value);
      if (rm) {
        hint.classList.remove('hidden');
        hint.innerHTML = `<i class="fas fa-info-circle mr-1"></i>A new <strong>purchase batch</strong> will be added to <strong>${this.escapeHtml(rm.name)}</strong> (current stock: ${this.fmt(rm.quantity)} ${this.escapeHtml(rm.unit||'')}). The supplier you choose below applies only to this batch.`;
        return;
      }
    }
    const name = (document.getElementById('r-name')?.value || '').trim().toLowerCase();
    const unit = (document.getElementById('r-unit')?.value || '').trim().toLowerCase();
    if (!name) { hint.classList.add('hidden'); return; }
    // Match by name + unit (suppliers can differ across batches now).
    const match = this.state.rawMaterials.find(r => {
      if ((r.name || '').trim().toLowerCase() !== name) return false;
      if ((r.unit || '').trim().toLowerCase() !== unit) return false;
      return true;
    });
    if (match) {
      hint.classList.remove('hidden');
      hint.innerHTML = `<i class="fas fa-recycle mr-1"></i>A matching raw material already exists: <strong>${this.escapeHtml(match.name)}</strong> (Stock: ${this.fmt(match.quantity)} ${this.escapeHtml(match.unit||'')} @ PKR ${this.fmt(match.rate)}). Saving will <strong>add a new purchase batch</strong> to it.`;
    } else {
      hint.classList.add('hidden');
    }
  },

  // Restock modal — adds a new purchase batch with optional supplier + payment.
  showRestockRaw(id) {
    const rm = this.state.rawMaterials.find(x => x.id === id);
    if (!rm) return;
    const supplierOpts = this.state.allClients.map(c => `<option value="${c.id}">${this.escapeHtml(c.name)} (${this.escapeHtml(c.folder_name || '')})</option>`).join('');
    const today = new Date().toISOString().slice(0, 10);
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-recycle text-green-600 mr-2"></i>Restock: ${this.escapeHtml(rm.name)}</h2>
      <div class="mb-3 p-3 bg-gray-50 rounded text-sm">
        <div class="flex justify-between"><span class="text-gray-500">Current Stock:</span><strong>${this.fmt(rm.quantity)} ${this.escapeHtml(rm.unit||'')}</strong></div>
        <div class="flex justify-between"><span class="text-gray-500">Current Avg Rate:</span><strong>PKR ${this.fmt(rm.rate)}</strong></div>
        <div class="flex justify-between"><span class="text-gray-500">Current Value:</span><strong class="amount-running">PKR ${this.fmt(rm.total_value)}</strong></div>
      </div>
      <form id="restock-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label>
          <input id="rs-date" type="date" class="input-field" value="${today}"></div>
        <div><label class="block text-sm font-medium mb-1">Quantity to Add *</label>
          <input id="rs-qty" type="number" step="any" min="0" required class="input-field" value="0" oninput="App._calcRestockPreview(${id})"></div>
        <div><label class="block text-sm font-medium mb-1">Rate per Unit for this batch (PKR)</label>
          <input id="rs-rate" type="number" step="any" min="0" class="input-field" value="${rm.rate || 0}" oninput="App._calcRestockPreview(${id})"></div>
        <div><label class="block text-sm font-medium mb-1">Total (Bill Amount)</label>
          <div id="rs-total" class="input-field" style="background:#f8fafc; font-weight:bold;">PKR 0.00</div></div>

        <div class="md:col-span-2 p-3 bg-green-50 border border-green-200 rounded-lg">
          <h3 class="text-sm font-semibold text-green-900 mb-2"><i class="fas fa-money-bill-wave mr-1"></i>Supplier &amp; Payment</h3>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Supplier (link to client)</label>
              <select id="rs-supplier" class="input-field">
                <option value="">-- None / Manual --</option>
                ${supplierOpts}
              </select></div>
            <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Supplier Name (manual, if not linked)</label>
              <input id="rs-supname" type="text" class="input-field" value=""></div>
            <div><label class="block text-sm font-medium mb-1">Amount Paid Now (PKR)</label>
              <input id="rs-paid" type="number" step="any" min="0" class="input-field" value="0" oninput="App._calcRestockPreview(${id})"></div>
            <div><label class="block text-sm font-medium mb-1">Remaining (Owed)</label>
              <div id="rs-remaining" class="input-field" style="background:#fef2f2; font-weight:bold; color:#b91c1c;">PKR 0.00</div></div>
          </div>
          <p class="text-xs text-gray-600 mt-2"><i class="fas fa-info-circle mr-1"></i>Remaining balance will auto-appear on the supplier's ledger as money you owe them.</p>
        </div>

        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label>
          <textarea id="rs-notes" class="input-field" rows="2"></textarea></div>

        <div class="md:col-span-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm" id="rs-preview">
          New stock will be calculated after you enter quantity.
        </div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-success"><i class="fas fa-plus"></i> Add Stock</button>
        </div>
      </form>`, 'modal-lg');
    this._calcRestockPreview(id);
    document.getElementById('restock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const qty = parseFloat(document.getElementById('rs-qty').value) || 0;
      const rate = parseFloat(document.getElementById('rs-rate').value) || 0;
      const paid = parseFloat(document.getElementById('rs-paid').value) || 0;
      if (qty <= 0) { this.toast('Quantity must be > 0', 'error'); return; }
      const payload = {
        quantity: qty,
        rate,
        paid_amount: paid,
        supplier_id: document.getElementById('rs-supplier').value ? parseInt(document.getElementById('rs-supplier').value) : null,
        supplier_name: document.getElementById('rs-supname').value || '',
        entry_date: document.getElementById('rs-date').value,
        notes: document.getElementById('rs-notes').value || ''
      };
      try {
        await this.api.post(`/api/raw-materials/${id}/restock`, payload);
        this.closeModal();
        await this.showRawMaterials();
        this.toast('Stock added', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  _calcRestockPreview(id) {
    const rm = this.state.rawMaterials.find(x => x.id === id);
    if (!rm) return;
    const addQty = parseFloat(document.getElementById('rs-qty')?.value) || 0;
    const addRate = parseFloat(document.getElementById('rs-rate')?.value) || 0;
    const paid = parseFloat(document.getElementById('rs-paid')?.value) || 0;
    const oldQty = parseFloat(rm.quantity) || 0;
    const oldRate = parseFloat(rm.rate) || 0;
    const newQty = oldQty + addQty;
    const newRate = newQty > 0 ? ((oldQty * oldRate) + (addQty * addRate)) / newQty : addRate;
    const newTotal = newQty * newRate;
    const batchTotal = addQty * addRate;
    const remaining = Math.max(0, batchTotal - paid);
    const tot = document.getElementById('rs-total');
    if (tot) tot.textContent = 'PKR ' + this.fmt(batchTotal);
    const rem = document.getElementById('rs-remaining');
    if (rem) rem.textContent = 'PKR ' + this.fmt(remaining);
    const el = document.getElementById('rs-preview');
    if (el) {
      el.innerHTML = `<div class="font-semibold mb-1 text-blue-800"><i class="fas fa-calculator mr-1"></i>After restock:</div>
        <div class="grid grid-cols-3 gap-2 text-blue-900">
          <div><span class="text-xs text-blue-600">New Stock</span><div class="font-bold">${this.fmt(newQty)} ${this.escapeHtml(rm.unit||'')}</div></div>
          <div><span class="text-xs text-blue-600">Avg Rate</span><div class="font-bold">PKR ${this.fmt(newRate)}</div></div>
          <div><span class="text-xs text-blue-600">Total Value</span><div class="font-bold">PKR ${this.fmt(newTotal)}</div></div>
        </div>`;
    }
  },

  _calcRawTotal() {
    const qty = parseFloat(document.getElementById('r-qty')?.value) || 0;
    const rate = parseFloat(document.getElementById('r-rate')?.value) || 0;
    const total = document.getElementById('r-total');
    if (total) total.textContent = 'PKR ' + this.fmt(qty * rate);
    this._calcRawPayPreview();
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

  // ========= PRODUCTS / MANUFACTURING =========
  // Each product has a "recipe": list of raw materials and qty needed per 1 finished unit.
  // Using current Raw Material stock we compute "buildable units" (how many can be made).
  async showProducts() {
    this.state.view = 'products';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.setActiveNav('products');
    this.closeSidebarOnMobile();
    this.renderFolders();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-industry text-purple-600"></i>Products Manufacturing</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const [pData, rmData, cData, eData, ppData] = await Promise.all([
        this.api.get('/api/products'),
        this.api.get('/api/raw-materials'),
        this.api.get('/api/components'),
        this.api.get('/api/employees'),
        this.api.get('/api/product-production')
      ]);
      this.state.products = pData.products || [];
      this.state.rawMaterials = rmData.items || [];
      this.state.componentsList = cData.components || [];
      this.state.employees = eData.employees || [];
      this.state.productProductionLogs = ppData.production || [];
      this.renderProducts();
    } catch (e) { this.toast('Failed to load', 'error'); }
  },

  renderProducts(filter = '') {
    const f = (filter || '').toLowerCase();
    const items = f ? this.state.products.filter(p =>
      (p.name || '').toLowerCase().includes(f) ||
      (p.category || '').toLowerCase().includes(f)) : this.state.products;
    const totalBuildable = this.state.products.reduce((s, p) => s + (parseFloat(p.buildable_units) || 0), 0);
    const totalPacked = this.state.products.reduce((s, p) => s + (parseFloat(p.packed_qty) || 0), 0);
    const logs = this.state.productProductionLogs || [];
    const today = new Date().toISOString().slice(0, 10);
    const todayPayout = logs.filter(l => l.entry_date === today).reduce((s, l) => s + (parseFloat(l.payout) || 0), 0);
    const stageLabel = (s) => s === 'assemble' ? 'Assemble' : s === 'paint' ? 'Paint' : 'Pack';
    const stageBadge = (s) => {
      const map = { assemble: 'bg-amber-100 text-amber-700 border-amber-200', paint: 'bg-indigo-100 text-indigo-700 border-indigo-200', pack: 'bg-green-100 text-green-700 border-green-200' };
      const ic = { assemble: 'fa-screwdriver-wrench', paint: 'fa-fill-drip', pack: 'fa-box' };
      return `<span class="inline-block px-2 py-0.5 rounded text-xs border ${map[s] || 'bg-gray-100 text-gray-700'}"><i class="fas ${ic[s] || 'fa-circle'} mr-1"></i>${stageLabel(s)}</span>`;
    };
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-industry text-purple-600"></i>Products Manufacturing</h1>
          <p class="page-subtitle">${this.state.products.length} product(s) · Components → Assemble → Paint → Pack</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <input type="text" id="prod-search" placeholder="Search products..." class="input-field" style="max-width:200px;" oninput="App.renderProducts(this.value)" value="${this.escapeAttr(filter)}">
          <button onclick="App.showProductProductionEditor()" class="btn btn-secondary"><i class="fas fa-hard-hat"></i> Log Production</button>
          <button onclick="App.showProductEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Product</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Products</p><p class="text-xl font-bold text-blue-600">${this.state.products.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Buildable Now (assemble)</p><p class="text-xl font-bold amount-running">${this.fmt(totalBuildable)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Packed (final) stock</p><p class="text-xl font-bold text-green-600">${this.fmt(totalPacked)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Worker Payout Today</p><p class="text-xl font-bold text-purple-600">PKR ${this.fmt(todayPayout)}</p></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:36px;">#</th>
              <th>Product</th>
              <th style="width:120px;">Category</th>
              <th>Recipe (Per 1 unit)</th>
              <th style="width:90px;text-align:center;" title="Components ready se kitne assemble ho sakte hain">Buildable</th>
              <th style="width:80px;text-align:center;" title="Assembled, abhi paint nahi hue">Assembled<br><span class="text-xs font-normal text-gray-400">(un-painted)</span></th>
              <th style="width:70px;text-align:center;" title="Paint ho chuke, pack ka intezaar">Painted</th>
              <th style="width:80px;text-align:center;" title="Final finished product (packed)">Packed<br><span class="text-xs font-normal text-gray-400">(final)</span></th>
              <th style="width:150px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="9" class="text-center py-10 text-gray-500">
                <i class="fas fa-industry text-4xl mb-2 block opacity-40"></i>
                ${filter ? 'No matching products.' : 'No products yet. Click "Add Product" to define your first manufactured item and its recipe.'}
              </td></tr>` :
              items.map((p, i) => {
                const ings = p.ingredients || [];
                const comps = p.components || [];
                const sets = p.set_items || [];
                const rawStr = ings.map(ing => {
                    const rmName = ing.raw_name || '(deleted)';
                    const have = parseFloat(ing.raw_quantity) || 0;
                    const need = parseFloat(ing.quantity_required) || 0;
                    const enough = have >= need;
                    const unit = ing.unit || ing.raw_unit || '';
                    return `<span class="inline-block px-2 py-0.5 rounded text-xs mr-1 mb-1 ${enough ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}">
                      <i class="fas fa-cubes opacity-60 mr-0.5"></i><strong>${this.escapeHtml(rmName)}</strong>: ${this.fmt(need)} ${this.escapeHtml(unit)} <span class="opacity-70">(stock: ${this.fmt(have)})</span>
                    </span>`;
                  }).join('');
                const compStr = comps.map(pc => {
                    const cName = pc.comp_name || '(deleted)';
                    const have = parseFloat(pc.comp_quantity) || 0;
                    const need = parseFloat(pc.quantity_required) || 0;
                    const enough = have >= need;
                    const unit = pc.comp_unit || 'pcs';
                    return `<span class="inline-block px-2 py-0.5 rounded text-xs mr-1 mb-1 ${enough ? 'bg-teal-50 text-teal-700 border border-teal-200' : 'bg-red-50 text-red-700 border border-red-200'}">
                      <i class="fas fa-puzzle-piece opacity-60 mr-0.5"></i><strong>${this.escapeHtml(cName)}</strong>: ${this.fmt(need)} ${this.escapeHtml(unit)} <span class="opacity-70">(stock: ${this.fmt(have)})</span>
                    </span>`;
                  }).join('');
                const setStr = sets.map(si => {
                    const need = parseFloat(si.quantity_required) || 0;
                    return `<span class="inline-block px-2 py-0.5 rounded text-xs mr-1 mb-1 bg-purple-50 text-purple-700 border border-purple-200" title="Pack stage par lagega">
                      <i class="fas fa-box-open opacity-60 mr-0.5"></i><strong>${this.escapeHtml(si.item_name || '')}</strong>: ${this.fmt(need)} ${this.escapeHtml(si.unit || 'pcs')} <span class="opacity-70">(pack-set)</span></span>`;
                  }).join('');
                const recipeStr = (ings.length === 0 && comps.length === 0 && sets.length === 0)
                  ? '<span class="text-gray-400">No recipe</span>'
                  : (rawStr + compStr + setStr);
                const buildable = parseFloat(p.buildable_units) || 0;
                const assembled = parseFloat(p.assembled_qty) || 0;
                const painted = parseFloat(p.painted_qty) || 0;
                const packed = parseFloat(p.packed_qty) || 0;
                const buildableClass = buildable > 0 ? 'text-green-600' : 'text-red-600';
                const hasRecipe = (ings.length > 0 || comps.length > 0);
                return `<tr>
                  <td class="text-gray-500">${i + 1}</td>
                  <td class="font-semibold">${this.escapeHtml(p.name)} <span class="text-xs text-gray-400">${this.escapeHtml(p.unit || 'pcs')}</span></td>
                  <td>${this.escapeHtml(p.category || '')}</td>
                  <td style="min-width: 300px;">${recipeStr}</td>
                  <td class="text-center"><span class="text-lg font-bold ${buildableClass}">${this.fmt(buildable)}</span></td>
                  <td class="text-center"><span class="text-lg font-bold ${assembled>0?'text-amber-600':'text-gray-300'}">${this.fmt(assembled)}</span></td>
                  <td class="text-center"><span class="text-lg font-bold ${painted>0?'text-indigo-600':'text-gray-300'}">${this.fmt(painted)}</span></td>
                  <td class="text-center"><span class="text-lg font-bold ${packed>0?'text-green-600':'text-gray-300'}">${this.fmt(packed)}</span></td>
                  <td>
                    <button onclick="App.showProductProductionEditor(null, ${p.id})" class="btn btn-secondary btn-sm" title="Log Production (Assemble / Paint / Pack)"><i class="fas fa-hard-hat"></i></button>
                    <button onclick="App.showProductEditor(${p.id})" class="btn btn-secondary btn-sm ml-1" title="Edit recipe"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteProduct(${p.id})" class="text-red-500 hover:text-red-700 ml-1" title="Delete"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody></table></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h2 class="font-bold text-gray-800"><i class="fas fa-hard-hat mr-2 text-purple-600"></i>Recent Production Log</h2>
            <span class="text-xs text-gray-500">Latest ${Math.min(logs.length, 50)} entries · kis ne kitne assemble/paint/pack kiye</span>
          </div>
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Date</th><th>Stage</th><th>Worker</th><th>Product</th>
              <th class="text-right">Pieces</th><th class="text-right">Rate</th><th class="text-right">Payout</th><th style="width:90px;">Action</th>
            </tr></thead><tbody>
              ${logs.length === 0 ? `<tr><td colspan="9" class="text-center py-8 text-gray-500"><i class="fas fa-inbox text-3xl mb-2 block"></i>No production logged yet. Use <strong>Log Production</strong> to record assemble / paint / pack work.</td></tr>` :
                logs.slice(0, 50).map((l, i) => `<tr>
                  <td>${i + 1}</td>
                  <td>${l.entry_date}</td>
                  <td>${stageBadge(l.stage)}</td>
                  <td>${l.employee_name ? this.escapeHtml(l.employee_name) : '<span class="text-gray-400">—</span>'}</td>
                  <td class="font-medium">${this.escapeHtml(l.product_name || '')}</td>
                  <td class="text-right font-bold text-purple-700">${this.fmt(l.quantity)}</td>
                  <td class="text-right">PKR ${this.fmt(l.rate)}</td>
                  <td class="text-right amount-received">PKR ${this.fmt(l.payout)}</td>
                  <td>
                    <button onclick="App.showProductProductionEditor(${l.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteProductProduction(${l.id})" class="text-red-500 ml-1"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`).join('')}
            </tbody></table></div>
        </div>

        <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 text-sm text-purple-900">
          <i class="fas fa-info-circle mr-1"></i>
          <strong>Manufacturing flow:</strong>
          <span class="inline-block px-2 py-0.5 rounded bg-teal-100 text-teal-700 mx-0.5"><i class="fas fa-puzzle-piece mr-1"></i>Components</span> →
          <span class="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-700 mx-0.5"><i class="fas fa-screwdriver-wrench mr-1"></i>Assemble</span> (non-painted) →
          <span class="inline-block px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 mx-0.5"><i class="fas fa-fill-drip mr-1"></i>Paint</span> →
          <span class="inline-block px-2 py-0.5 rounded bg-green-100 text-green-700 mx-0.5"><i class="fas fa-box mr-1"></i>Pack</span> (final finished product).
          Har stage worker karta hai aur per-piece payout uski profile + weekly total mein add hota hai. Pack karte waqt "set items" (e.g. tyres, rolling 460, tiers) stock se minus hote hain.
        </div>
      </div>`;
  },

  showProductEditor(id = null) {
    const p = id ? this.state.products.find(x => x.id === id) : { name:'', unit:'pcs', category:'', notes:'', sale_rate: 0, ingredients: [], components: [] };
    if (id && !p) return;
    // Working copy of ingredients (raw materials)
    this._editingIngredients = (p.ingredients || []).map(ing => ({
      raw_material_id: ing.raw_material_id,
      quantity_required: ing.quantity_required,
      unit: ing.unit || ing.raw_unit || ''
    }));
    // Working copy of component lines
    this._editingProdComponents = (p.components || []).map(pc => ({
      component_id: pc.component_id,
      quantity_required: pc.quantity_required
    }));
    // Working copy of set items (extra parts added at PACK stage)
    this._editingSetItems = (p.set_items || []).map(si => ({
      source_type: si.source_type || 'component',
      source_id: si.source_id,
      item_name: si.item_name || '',
      unit: si.unit || 'pcs',
      quantity_required: si.quantity_required
    }));

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-industry text-purple-600 mr-2"></i>${id ? 'Edit' : 'Add'} Product (Recipe)</h2>
      <form id="prod-form" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium mb-1">Product Name *</label>
            <input id="p-name" type="text" required class="input-field" value="${this.escapeAttr(p.name || '')}" placeholder="e.g. Rack">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Unit</label>
            <select id="p-unit" class="input-field">
              ${['pcs','set','box','dozen','pair','kg','meter','foot'].map(u => `<option value="${u}" ${ (p.unit || 'pcs') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Category</label>
            <input id="p-cat" type="text" class="input-field" value="${this.escapeAttr(p.category || '')}" placeholder="e.g. Furniture">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Sale Rate (PKR) — optional</label>
            <input id="p-rate" type="number" step="any" class="input-field" value="${p.sale_rate || 0}">
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium mb-1">Notes</label>
            <input id="p-notes" type="text" class="input-field" value="${this.escapeAttr(p.notes || '')}">
          </div>
        </div>

        <div class="border-t pt-4">
          <h3 class="text-base font-bold text-gray-800 mb-2"><i class="fas fa-hard-hat text-purple-500 mr-1"></i>Per-Piece Worker Rates (stage defaults)</h3>
          <p class="text-xs text-gray-500 mb-2">Log Production karte waqt yeh rate auto-fill hoga (optional).</p>
          <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div><label class="block text-xs text-gray-500 mb-1"><i class="fas fa-screwdriver-wrench text-amber-500 mr-1"></i>Assemble Rate</label>
              <input id="p-asm-rate" type="number" step="any" class="input-field" value="${p.assemble_rate || 0}"></div>
            <div><label class="block text-xs text-gray-500 mb-1"><i class="fas fa-fill-drip text-indigo-500 mr-1"></i>Paint Rate</label>
              <input id="p-paint-rate" type="number" step="any" class="input-field" value="${p.paint_rate || 0}"></div>
            <div><label class="block text-xs text-gray-500 mb-1"><i class="fas fa-box text-green-500 mr-1"></i>Pack Rate</label>
              <input id="p-pack-rate" type="number" step="any" class="input-field" value="${p.pack_rate || 0}"></div>
          </div>
        </div>

        <div class="border-t pt-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-cubes text-orange-500 mr-1"></i>Recipe — Raw Materials per 1 unit</h3>
            <button type="button" onclick="App._addIngredientRow()" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Add Ingredient</button>
          </div>
          ${this.state.rawMaterials.length === 0 ? `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
              <i class="fas fa-exclamation-triangle mr-1"></i>
              No raw materials found. Please add raw materials first from the <strong>Raw Material</strong> section before defining a recipe.
            </div>` : ''}
          <div id="ingredients-list" class="space-y-2"></div>
          <div id="ingredients-summary" class="mt-3 p-3 rounded-lg bg-gray-50 border text-sm"></div>
        </div>

        <div class="border-t pt-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-puzzle-piece text-teal-500 mr-1"></i>Recipe — Components per 1 unit</h3>
            <button type="button" onclick="App._addProdComponentRow()" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Add Component</button>
          </div>
          <p class="text-xs text-gray-500 mb-2">Final product banane ke liye jo components chahiye (e.g. 1 Rack = 4 Rings + 1 Bottom Jaali). Build karte waqt yeh components stock se minus honge.</p>
          ${(this.state.componentsList || []).length === 0 ? `
            <div class="bg-teal-50 border border-teal-200 rounded p-3 text-sm text-teal-800">
              <i class="fas fa-info-circle mr-1"></i>
              Abhi koi component nahi hai. Pehle <strong>Components Production</strong> section me components banayein.
            </div>` : ''}
          <div id="prod-components-list" class="space-y-2"></div>
        </div>

        <div class="border-t pt-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-box-open text-purple-500 mr-1"></i>Set Items — added at PACK stage</h3>
            <button type="button" onclick="App._addSetItemRow()" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Add Set Item</button>
          </div>
          <p class="text-xs text-gray-500 mb-2">Jo extra parts pack karte waqt lagte hain (e.g. tyres, rolling 460, tiers). Yeh component ya raw material stock se aate hain aur Pack stage par minus hote hain.</p>
          <div id="set-items-list" class="space-y-2"></div>
        </div>

        <div class="flex gap-2 justify-end pt-2 border-t">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteProduct(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `, 'modal-lg');

    this._renderIngredientRows();
    this._renderProdComponentRows();
    this._renderSetItemRows();

    document.getElementById('prod-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      // Read latest values from rows
      this._collectIngredientRows();
      this._collectProdComponentRows();
      this._collectSetItemRows();
      const ings = (this._editingIngredients || []).filter(i => i.raw_material_id && parseFloat(i.quantity_required) > 0);
      const comps = (this._editingProdComponents || []).filter(i => i.component_id && parseFloat(i.quantity_required) > 0);
      const sets = (this._editingSetItems || []).filter(i => i.source_id && parseFloat(i.quantity_required) > 0);
      const payload = {
        name: document.getElementById('p-name').value.trim(),
        unit: document.getElementById('p-unit').value || 'pcs',
        category: document.getElementById('p-cat').value,
        notes: document.getElementById('p-notes').value,
        sale_rate: parseFloat(document.getElementById('p-rate').value) || 0,
        assemble_rate: parseFloat(document.getElementById('p-asm-rate').value) || 0,
        paint_rate: parseFloat(document.getElementById('p-paint-rate').value) || 0,
        pack_rate: parseFloat(document.getElementById('p-pack-rate').value) || 0,
        ingredients: ings,
        components: comps,
        set_items: sets
      };
      if (!payload.name) { this.toast('Product name required', 'error'); return; }
      try {
        if (id) await this.api.put(`/api/products/${id}`, payload);
        else await this.api.post('/api/products', payload);
        this.closeModal();
        await this.showProducts();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed to save', 'error'); }
    });
  },

  _addIngredientRow() {
    this._collectIngredientRows();
    if (!this._editingIngredients) this._editingIngredients = [];
    this._editingIngredients.push({ raw_material_id: null, quantity_required: 0, unit: '' });
    this._renderIngredientRows();
  },

  _removeIngredientRow(idx) {
    this._collectIngredientRows();
    this._editingIngredients.splice(idx, 1);
    this._renderIngredientRows();
  },

  _collectIngredientRows() {
    const list = document.getElementById('ingredients-list');
    if (!list) return;
    const rows = list.querySelectorAll('.ingredient-row');
    const arr = [];
    rows.forEach(row => {
      const rmId = parseInt(row.querySelector('.ing-rm').value) || null;
      const qty = parseFloat(row.querySelector('.ing-qty').value) || 0;
      const rm = this.state.rawMaterials.find(r => r.id === rmId);
      arr.push({
        raw_material_id: rmId,
        quantity_required: qty,
        unit: rm ? (rm.unit || '') : ''
      });
    });
    this._editingIngredients = arr;
  },

  _renderIngredientRows() {
    const list = document.getElementById('ingredients-list');
    if (!list) return;
    const rms = this.state.rawMaterials;
    const ings = this._editingIngredients || [];
    if (ings.length === 0) {
      list.innerHTML = `<div class="text-gray-400 text-sm text-center py-4 border-2 border-dashed rounded-lg">No ingredients yet. Click <strong>Add Ingredient</strong> to link raw materials.</div>`;
    } else {
      list.innerHTML = ings.map((ing, idx) => {
        const rm = rms.find(r => r.id === ing.raw_material_id);
        const optionsHtml = `<option value="">-- Select Raw Material --</option>` +
          rms.map(r => `<option value="${r.id}" ${r.id === ing.raw_material_id ? 'selected' : ''}>${this.escapeHtml(r.name)} (Stock: ${this.fmt(r.quantity)} ${this.escapeHtml(r.unit||'')})</option>`).join('');
        const unit = rm ? (rm.unit || '') : '';
        return `
          <div class="ingredient-row grid grid-cols-12 gap-2 items-center bg-white border rounded-lg p-2">
            <div class="col-span-12 md:col-span-6">
              <label class="block text-xs text-gray-500 mb-1">Raw Material</label>
              <select class="input-field ing-rm" onchange="App._onIngredientChange(${idx})">${optionsHtml}</select>
            </div>
            <div class="col-span-7 md:col-span-3">
              <label class="block text-xs text-gray-500 mb-1">Quantity Required (per 1 unit)</label>
              <input type="number" step="any" class="input-field ing-qty" value="${ing.quantity_required || ''}" oninput="App._refreshIngredientSummary()">
            </div>
            <div class="col-span-3 md:col-span-2">
              <label class="block text-xs text-gray-500 mb-1">Unit</label>
              <input type="text" class="input-field ing-unit" value="${this.escapeAttr(unit)}" readonly style="background:#f8fafc;">
            </div>
            <div class="col-span-2 md:col-span-1 text-right">
              <button type="button" onclick="App._removeIngredientRow(${idx})" class="text-red-500 hover:text-red-700 mt-5" title="Remove"><i class="fas fa-trash"></i></button>
            </div>
          </div>`;
      }).join('');
    }
    this._refreshIngredientSummary();
  },

  _onIngredientChange(idx) {
    // Update unit display when a raw material is selected
    const list = document.getElementById('ingredients-list');
    const row = list.querySelectorAll('.ingredient-row')[idx];
    if (!row) return;
    const rmId = parseInt(row.querySelector('.ing-rm').value) || null;
    const rm = this.state.rawMaterials.find(r => r.id === rmId);
    row.querySelector('.ing-unit').value = rm ? (rm.unit || '') : '';
    this._refreshIngredientSummary();
  },

  _refreshIngredientSummary() {
    const summary = document.getElementById('ingredients-summary');
    if (!summary) return;
    const list = document.getElementById('ingredients-list');
    const rows = list ? list.querySelectorAll('.ingredient-row') : [];
    if (rows.length === 0) {
      summary.innerHTML = '<span class="text-gray-500"><i class="fas fa-info-circle mr-1"></i>Add at least one raw material to compute buildable units.</span>';
      return;
    }
    let buildable = null;
    let totalCost = 0;
    let validCount = 0;
    let detailRows = [];
    rows.forEach(row => {
      const rmId = parseInt(row.querySelector('.ing-rm').value) || null;
      const need = parseFloat(row.querySelector('.ing-qty').value) || 0;
      if (!rmId || need <= 0) return;
      const rm = this.state.rawMaterials.find(r => r.id === rmId);
      if (!rm) return;
      validCount++;
      const have = parseFloat(rm.quantity) || 0;
      const rate = parseFloat(rm.rate) || 0;
      totalCost += need * rate;
      const can = have / need;
      if (buildable === null || can < buildable) buildable = can;
      const enough = have >= need;
      detailRows.push(`<div class="text-xs ${enough ? 'text-green-700' : 'text-red-700'}">
        <i class="fas fa-${enough ? 'check' : 'times'}-circle mr-1"></i>
        <strong>${this.escapeHtml(rm.name)}</strong>: need ${this.fmt(need)} ${this.escapeHtml(rm.unit||'')} per unit, stock ${this.fmt(have)} → can make ${this.fmt(Math.floor(can))} unit(s)
      </div>`);
    });
    if (validCount === 0) {
      summary.innerHTML = '<span class="text-gray-500"><i class="fas fa-info-circle mr-1"></i>Select raw materials and enter quantities.</span>';
      return;
    }
    const buildableInt = buildable === null ? 0 : Math.floor(buildable);
    summary.innerHTML = `
      <div class="flex flex-wrap items-center gap-x-6 gap-y-2 mb-2">
        <div><span class="text-gray-600">Material cost / unit:</span> <strong class="text-purple-700">PKR ${this.fmt(totalCost)}</strong></div>
        <div><span class="text-gray-600">Can build right now:</span> <strong class="text-2xl ${buildableInt > 0 ? 'text-green-600' : 'text-red-600'}">${this.fmt(buildableInt)}</strong> <span class="text-gray-500">unit(s)</span></div>
      </div>
      <div class="space-y-0.5">${detailRows.join('')}</div>
    `;
  },

  // ----- Product recipe: COMPONENT lines -----
  _addProdComponentRow() {
    this._collectProdComponentRows();
    if (!this._editingProdComponents) this._editingProdComponents = [];
    this._editingProdComponents.push({ component_id: null, quantity_required: 0 });
    this._renderProdComponentRows();
  },
  _removeProdComponentRow(idx) {
    this._collectProdComponentRows();
    this._editingProdComponents.splice(idx, 1);
    this._renderProdComponentRows();
  },
  _collectProdComponentRows() {
    const list = document.getElementById('prod-components-list');
    if (!list) return;
    const rows = list.querySelectorAll('.prodcomp-row');
    const arr = [];
    rows.forEach(row => {
      const cId = parseInt(row.querySelector('.pc-comp').value) || null;
      const qty = parseFloat(row.querySelector('.pc-qty').value) || 0;
      arr.push({ component_id: cId, quantity_required: qty });
    });
    this._editingProdComponents = arr;
  },
  _renderProdComponentRows() {
    const list = document.getElementById('prod-components-list');
    if (!list) return;
    const comps = this.state.componentsList || [];
    const rows = this._editingProdComponents || [];
    if (rows.length === 0) {
      list.innerHTML = `<div class="text-gray-400 text-sm text-center py-4 border-2 border-dashed rounded-lg">Koi component nahi. <strong>Add Component</strong> daba kar components link karein (optional).</div>`;
      return;
    }
    list.innerHTML = rows.map((pc, idx) => {
      const c = comps.find(x => x.id === pc.component_id);
      const optionsHtml = `<option value="">-- Select Component --</option>` +
        comps.map(x => `<option value="${x.id}" ${x.id === pc.component_id ? 'selected' : ''}>${this.escapeHtml(x.name)} (Stock: ${this.fmt(x.quantity)} ${this.escapeHtml(x.unit||'pcs')})</option>`).join('');
      const unit = c ? (c.unit || 'pcs') : '';
      return `
        <div class="prodcomp-row grid grid-cols-12 gap-2 items-center bg-white border rounded-lg p-2">
          <div class="col-span-12 md:col-span-7">
            <label class="block text-xs text-gray-500 mb-1">Component</label>
            <select class="input-field pc-comp" onchange="App._renderProdComponentRowsKeep()">${optionsHtml}</select>
          </div>
          <div class="col-span-9 md:col-span-4">
            <label class="block text-xs text-gray-500 mb-1">Qty Required (per 1 product) <span class="text-gray-400">${this.escapeHtml(unit)}</span></label>
            <input type="number" step="any" class="input-field pc-qty" value="${pc.quantity_required || ''}">
          </div>
          <div class="col-span-3 md:col-span-1 text-right">
            <button type="button" onclick="App._removeProdComponentRow(${idx})" class="text-red-500 hover:text-red-700 mt-5" title="Remove"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join('');
  },
  _renderProdComponentRowsKeep() {
    this._collectProdComponentRows();
    this._renderProdComponentRows();
  },

  // ----- Product SET ITEMS (extra parts at PACK stage) -----
  _addSetItemRow() {
    this._collectSetItemRows();
    if (!this._editingSetItems) this._editingSetItems = [];
    this._editingSetItems.push({ source_type: 'component', source_id: null, item_name: '', unit: 'pcs', quantity_required: 0 });
    this._renderSetItemRows();
  },
  _removeSetItemRow(idx) {
    this._collectSetItemRows();
    this._editingSetItems.splice(idx, 1);
    this._renderSetItemRows();
  },
  _collectSetItemRows() {
    const list = document.getElementById('set-items-list');
    if (!list) return;
    const rows = list.querySelectorAll('.setitem-row');
    const arr = [];
    rows.forEach(row => {
      const sourceType = row.querySelector('.si-type').value || 'component';
      const sourceId = parseInt(row.querySelector('.si-source').value) || null;
      const qty = parseFloat(row.querySelector('.si-qty').value) || 0;
      let name = '', unit = 'pcs';
      if (sourceType === 'component') {
        const c = (this.state.componentsList || []).find(x => x.id === sourceId);
        if (c) { name = c.name; unit = c.unit || 'pcs'; }
      } else {
        const r = (this.state.rawMaterials || []).find(x => x.id === sourceId);
        if (r) { name = r.name; unit = r.unit || ''; }
      }
      arr.push({ source_type: sourceType, source_id: sourceId, item_name: name, unit, quantity_required: qty });
    });
    this._editingSetItems = arr;
  },
  _renderSetItemRows() {
    const list = document.getElementById('set-items-list');
    if (!list) return;
    const rows = this._editingSetItems || [];
    if (rows.length === 0) {
      list.innerHTML = `<div class="text-gray-400 text-sm text-center py-4 border-2 border-dashed rounded-lg">Koi set item nahi. <strong>Add Set Item</strong> daba kar tyres / rolling / tiers link karein (optional).</div>`;
      return;
    }
    const comps = this.state.componentsList || [];
    const rms = this.state.rawMaterials || [];
    list.innerHTML = rows.map((si, idx) => {
      const isComp = (si.source_type || 'component') === 'component';
      const srcOptions = isComp
        ? `<option value="">-- Select Component --</option>` + comps.map(x => `<option value="${x.id}" ${x.id === si.source_id ? 'selected' : ''}>${this.escapeHtml(x.name)} (Stock: ${this.fmt(x.quantity)} ${this.escapeHtml(x.unit||'pcs')})</option>`).join('')
        : `<option value="">-- Select Raw Material --</option>` + rms.map(x => `<option value="${x.id}" ${x.id === si.source_id ? 'selected' : ''}>${this.escapeHtml(x.name)} (Stock: ${this.fmt(x.quantity)} ${this.escapeHtml(x.unit||'')})</option>`).join('');
      return `
        <div class="setitem-row grid grid-cols-12 gap-2 items-center bg-white border rounded-lg p-2">
          <div class="col-span-12 md:col-span-3">
            <label class="block text-xs text-gray-500 mb-1">Source</label>
            <select class="input-field si-type" onchange="App._onSetItemTypeChange(${idx})">
              <option value="component" ${isComp ? 'selected' : ''}>Component</option>
              <option value="raw" ${!isComp ? 'selected' : ''}>Raw Material</option>
            </select>
          </div>
          <div class="col-span-12 md:col-span-6">
            <label class="block text-xs text-gray-500 mb-1">Item</label>
            <select class="input-field si-source">${srcOptions}</select>
          </div>
          <div class="col-span-9 md:col-span-2">
            <label class="block text-xs text-gray-500 mb-1">Qty / product</label>
            <input type="number" step="any" class="input-field si-qty" value="${si.quantity_required || ''}">
          </div>
          <div class="col-span-3 md:col-span-1 text-right">
            <button type="button" onclick="App._removeSetItemRow(${idx})" class="text-red-500 hover:text-red-700 mt-5" title="Remove"><i class="fas fa-trash"></i></button>
          </div>
        </div>`;
    }).join('');
  },
  _onSetItemTypeChange(idx) {
    this._collectSetItemRows();
    // reset source_id when switching type
    if (this._editingSetItems[idx]) { this._editingSetItems[idx].source_id = null; }
    this._renderSetItemRows();
  },

  async deleteProduct(id) {
    if (!confirm('Delete this product and its recipe?')) return;
    try {
      await this.api.delete(`/api/products/${id}`);
      this.closeModal();
      await this.showProducts();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  showBuildProduct(id) {
    const p = this.state.products.find(x => x.id === id);
    if (!p) return;
    const buildable = parseFloat(p.buildable_units) || 0;
    const ings = p.ingredients || [];
    const comps = p.components || [];
    if (ings.length === 0 && comps.length === 0) { this.toast('This product has no recipe', 'error'); return; }

    this.openModal(`
      <h2 class="text-xl font-bold mb-2"><i class="fas fa-hammer text-orange-500 mr-2"></i>Build / Produce: ${this.escapeHtml(p.name)}</h2>
      <p class="text-sm text-gray-600 mb-4">This will deduct the required raw materials from stock for each unit you build.</p>

      <div class="bg-gray-50 border rounded-lg p-3 mb-4">
        <div class="text-sm text-gray-600">Maximum buildable with current stock:</div>
        <div class="text-3xl font-bold ${buildable > 0 ? 'text-green-600' : 'text-red-600'}">${this.fmt(buildable)} <span class="text-base text-gray-600">${this.escapeHtml(p.unit || 'pcs')}</span></div>
      </div>

      <form id="build-form" class="space-y-3">
        <div>
          <label class="block text-sm font-medium mb-1">Units to Build *</label>
          <input id="build-units" type="number" step="any" min="0.01" max="${buildable}" required class="input-field" value="1" oninput="App._refreshBuildPreview(${id})" ${buildable === 0 ? 'disabled' : ''}>
        </div>
        <div id="build-preview" class="text-sm"></div>
        <label class="flex items-center gap-2 mt-2 text-sm">
          <input id="build-add-inv" type="checkbox" checked> Add finished units to <strong>Inventory</strong>
        </label>
        <div class="flex gap-2 justify-end pt-3 border-t">
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary" ${buildable === 0 ? 'disabled' : ''}><i class="fas fa-hammer"></i> Build</button>
        </div>
      </form>
    `);
    this._refreshBuildPreview(id);

    document.getElementById('build-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const units = parseFloat(document.getElementById('build-units').value) || 0;
      const addInv = document.getElementById('build-add-inv').checked;
      if (units <= 0) { this.toast('Enter a quantity greater than 0', 'error'); return; }
      try {
        const res = await this.api.post(`/api/products/${id}/build`, { units, add_to_inventory: addInv });
        if (res.error) { this.toast(res.error, 'error'); return; }
        this.closeModal();
        await this.showProducts();
        this.toast(`Built ${units} unit(s) of ${p.name}`, 'success');
      } catch (err) { this.toast('Failed to build', 'error'); }
    });
  },

  _refreshBuildPreview(productId) {
    const p = this.state.products.find(x => x.id === productId);
    if (!p) return;
    const units = parseFloat(document.getElementById('build-units')?.value) || 0;
    const preview = document.getElementById('build-preview');
    if (!preview) return;
    if (units <= 0) { preview.innerHTML = ''; return; }
    const ings = p.ingredients || [];
    const comps = p.components || [];
    let totalCost = 0;
    let html = '';
    if (ings.length > 0) {
      html += `<div class="font-medium text-gray-700 mb-1"><i class="fas fa-cubes mr-1 text-orange-500"></i>Will deduct from Raw Material:</div><div class="space-y-1 mb-2">`;
      for (const ing of ings) {
        const need = (parseFloat(ing.quantity_required) || 0) * units;
        const have = parseFloat(ing.raw_quantity) || 0;
        const rate = parseFloat(ing.raw_rate) || 0;
        totalCost += need * rate;
        const ok = have >= need;
        html += `<div class="text-xs ${ok ? 'text-green-700' : 'text-red-700'}">
          <i class="fas fa-${ok ? 'check' : 'times'}-circle mr-1"></i>
          ${this.escapeHtml(ing.raw_name || '')}: -${this.fmt(need)} ${this.escapeHtml(ing.unit || ing.raw_unit || '')} (stock will go ${this.fmt(have)} → ${this.fmt(have - need)})
        </div>`;
      }
      html += `</div>`;
    }
    if (comps.length > 0) {
      html += `<div class="font-medium text-gray-700 mb-1"><i class="fas fa-puzzle-piece mr-1 text-teal-500"></i>Will deduct Components:</div><div class="space-y-1 mb-2">`;
      for (const pc of comps) {
        const need = (parseFloat(pc.quantity_required) || 0) * units;
        const have = parseFloat(pc.comp_quantity) || 0;
        const rate = parseFloat(pc.comp_rate) || 0;
        totalCost += need * rate;
        const ok = have >= need;
        html += `<div class="text-xs ${ok ? 'text-green-700' : 'text-red-700'}">
          <i class="fas fa-${ok ? 'check' : 'times'}-circle mr-1"></i>
          ${this.escapeHtml(pc.comp_name || '')}: -${this.fmt(need)} ${this.escapeHtml(pc.comp_unit || 'pcs')} (stock will go ${this.fmt(have)} → ${this.fmt(have - need)})
        </div>`;
      }
      html += `</div>`;
    }
    html += `<div class="mt-2 text-sm"><span class="text-gray-600">Total recipe cost:</span> <strong class="text-purple-700">PKR ${this.fmt(totalCost)}</strong></div>`;
    preview.innerHTML = html;
  },

  // ========= PRODUCT STAGE PRODUCTION (Assemble / Paint / Pack) =========
  // Worker logs how many pieces of a product they assembled, painted, or packed.
  showProductProductionEditor(logId = null, presetProductId = null) {
    const log = logId ? (this.state.productProductionLogs || []).find(l => l.id === logId) : null;
    if (logId && !log) return;
    const prods = this.state.products || [];
    const emps = (this.state.employees || []).filter(e => e.active);
    const today = new Date().toISOString().slice(0, 10);
    const selProd = log ? log.product_id : presetProductId;
    const selStage = log ? log.stage : 'assemble';

    const prodOptions = `<option value="">-- Select Product --</option>` +
      prods.map(p => `<option value="${p.id}" ${selProd == p.id ? 'selected' : ''}>${this.escapeHtml(p.name)} (Buildable: ${this.fmt(p.buildable_units)} · Asm: ${this.fmt(p.assembled_qty)} · Paint: ${this.fmt(p.painted_qty)} · Packed: ${this.fmt(p.packed_qty)})</option>`).join('');
    const empOptions = `<option value="">-- (Optional) Select Worker --</option>` +
      emps.map(e => `<option value="${e.id}" ${log && log.employee_id == e.id ? 'selected' : ''}>${this.escapeHtml(e.name)}</option>`).join('');
    const stageOptions = [
      { v: 'assemble', l: 'Assemble (components → non-painted product)' },
      { v: 'paint', l: 'Paint (assembled → painted)' },
      { v: 'pack', l: 'Pack (painted + set items → final product)' }
    ].map(s => `<option value="${s.v}" ${selStage === s.v ? 'selected' : ''}>${s.l}</option>`).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-1"><i class="fas fa-hard-hat text-purple-600 mr-2"></i>${logId ? 'Edit' : 'Log'} Product Production</h2>
      <p class="text-sm text-gray-600 mb-4">Kis worker ne kitne pieces banaye / paint kiye / pack kiye. Stock stage-wise move hoga + worker payout add hoga.</p>
      <form id="pprod-log-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label>
          <input id="ppl-date" type="date" class="input-field" value="${log ? log.entry_date : today}"></div>
        <div><label class="block text-sm font-medium mb-1">Worker</label>
          <select id="ppl-emp" class="input-field" onchange="App._onPProdWorkerChange()" ${logId ? 'disabled' : ''}>${empOptions}</select>
          ${logId ? '<input type="hidden" id="ppl-emp-hidden" value="'+(log.employee_id||'')+'">' : ''}
        </div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Product *</label>
          <select id="ppl-prod" class="input-field" required onchange="App._onPProdChange()" ${logId ? 'disabled' : ''}>${prodOptions}</select>
          ${logId ? '<input type="hidden" id="ppl-prod-hidden" value="'+(log.product_id||'')+'">' : ''}
        </div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Stage *</label>
          <select id="ppl-stage" class="input-field" required onchange="App._onPProdChange()" ${logId ? 'disabled' : ''}>${stageOptions}</select>
          ${logId ? '<input type="hidden" id="ppl-stage-hidden" value="'+log.stage+'">' : ''}
        </div>
        <div class="md:col-span-2" id="ppl-stage-hint"></div>
        <div><label class="block text-sm font-medium mb-1">Pieces *</label>
          <input id="ppl-qty" type="number" step="any" min="0.01" required class="input-field" value="${log ? log.quantity : ''}" oninput="App._onPProdRecalc()"></div>
        <div><label class="block text-sm font-medium mb-1">Per-Piece Rate (PKR) <span id="ppl-rate-src" class="text-xs font-normal text-purple-600"></span></label>
          <input id="ppl-rate" type="number" step="any" class="input-field" value="${log ? log.rate : 0}" oninput="App._onPProdRecalc()"></div>
        ${logId ? '' : `<div class="md:col-span-2 flex items-center"><label class="flex items-center gap-2 text-sm"><input id="ppl-deduct" type="checkbox" checked> Auto-deduct previous-stage stock / set items</label></div>`}
        <div class="md:col-span-2" id="ppl-payout-box"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label>
          <input id="ppl-notes" type="text" class="input-field" value="${log ? this.escapeAttr(log.notes||'') : ''}"></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${logId ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteProductProduction(${logId})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `, 'modal-lg');

    if (!logId) this._autoFillPProdRate(true);
    this._onPProdRecalc();
    this._renderPProdStageHint();

    document.getElementById('pprod-log-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const prodId = logId ? document.getElementById('ppl-prod-hidden').value : document.getElementById('ppl-prod').value;
      const stage = logId ? document.getElementById('ppl-stage-hidden').value : document.getElementById('ppl-stage').value;
      const empId = logId ? (document.getElementById('ppl-emp-hidden')?.value || null) : (document.getElementById('ppl-emp').value || null);
      const qty = parseFloat(document.getElementById('ppl-qty').value) || 0;
      const rate = parseFloat(document.getElementById('ppl-rate').value) || 0;
      const notes = document.getElementById('ppl-notes').value;
      const deduct = logId ? undefined : document.getElementById('ppl-deduct').checked;
      const date = document.getElementById('ppl-date').value || today;
      if (!prodId) { this.toast('Select a product', 'error'); return; }
      if (qty <= 0) { this.toast('Pieces must be greater than 0', 'error'); return; }
      try {
        if (logId) {
          await this.api.put(`/api/product-production/${logId}`, { entry_date: date, quantity: qty, rate, notes });
        } else {
          const res = await this.api.post('/api/product-production', { entry_date: date, stage, employee_id: empId, product_id: prodId, quantity: qty, rate, deduct, notes });
          if (res.error) {
            let msg = res.error;
            if (res.shortages) msg += '\n' + res.shortages.join('\n');
            this.toast(msg, 'error');
            return;
          }
        }
        this.closeModal();
        if (this.state.view === 'products') await this.showProducts();
        else if (this.state.currentEmployee) await this.openEmployee(this.state.currentEmployee.id);
        this.toast('Production saved', 'success');
      } catch (err) { this.toast('Failed to save', 'error'); }
    });
  },

  _onPProdChange() {
    this._autoFillPProdRate(true);
    this._onPProdRecalc();
    this._renderPProdStageHint();
  },

  _onPProdWorkerChange() {
    // Worker changed → if that worker has a saved per-piece rate for the selected
    // product / stage, fill it automatically (Components Production jaisa behaviour).
    this._autoFillPProdRate(true);
    this._onPProdRecalc();
  },

  // Decide the per-piece rate. Priority (same idea as Components Production):
  //   1. Selected WORKER's saved rate for this product/stage (employee_items, match by name)
  //      - tries "<product> <stage>" (e.g. "Rack Paint"), then plain "<product>"
  //   2. Product's stage default rate (assemble_rate / paint_rate / pack_rate)
  // force=true overwrites the field; otherwise only fills if empty/zero.
  _autoFillPProdRate(force = false) {
    const prodSel = document.getElementById('ppl-prod');
    const stageSel = document.getElementById('ppl-stage');
    const empSel = document.getElementById('ppl-emp');
    const rateInput = document.getElementById('ppl-rate');
    const srcLabel = document.getElementById('ppl-rate-src');
    if (!prodSel || !rateInput || !stageSel) return;
    const prodId = parseInt(prodSel.value) || null;
    const p = (this.state.products || []).find(x => x.id === prodId);
    const stage = stageSel.value;
    const empId = empSel ? (parseInt(empSel.value) || null) : null;
    const emp = (this.state.employees || []).find(e => e.id === empId);

    let rate = null;
    let source = '';

    // 1) Worker's saved rate for this product/stage (employee profile items).
    if (emp && p && Array.isArray(emp.items)) {
      const norm = (s) => (s || '').trim().toLowerCase();
      const prodName = norm(p.name);
      const stageName = norm(stage);
      // Build candidate names in priority order (most specific first).
      const candidates = [
        prodName + ' ' + stageName,   // "rack paint"
        stageName + ' ' + prodName,   // "paint rack"
        prodName + ' - ' + stageName, // "rack - paint"
        prodName                       // "rack" (any-stage rate)
      ];
      for (const cand of candidates) {
        const it = emp.items.find(x => norm(x.item_name) === cand);
        if (it && parseFloat(it.rate) > 0) {
          rate = parseFloat(it.rate);
          source = 'from worker profile';
          break;
        }
      }
    }

    // 2) Product's stage default rate.
    if (rate === null && p) {
      const r = stage === 'assemble' ? p.assemble_rate : stage === 'paint' ? p.paint_rate : p.pack_rate;
      if (parseFloat(r) > 0) { rate = parseFloat(r); source = 'product default'; }
    }

    if (rate !== null) {
      const cur = parseFloat(rateInput.value) || 0;
      if (force || cur === 0) {
        rateInput.value = rate;
        if (srcLabel) srcLabel.textContent = source ? '(' + source + ')' : '';
      }
    } else if (srcLabel) { srcLabel.textContent = ''; }
  },

  _renderPProdStageHint() {
    const box = document.getElementById('ppl-stage-hint');
    if (!box) return;
    const prodId = parseInt(document.getElementById('ppl-prod')?.value) || null;
    const stage = document.getElementById('ppl-stage')?.value;
    const p = (this.state.products || []).find(x => x.id === prodId);
    if (!p || !stage) { box.innerHTML = ''; return; }
    let html = '';
    if (stage === 'assemble') {
      const parts = [...(p.components||[]).map(c => `${this.escapeHtml(c.comp_name||'')} ×${this.fmt(c.quantity_required)}`), ...(p.ingredients||[]).map(i => `${this.escapeHtml(i.raw_name||'')} ×${this.fmt(i.quantity_required)}`)];
      html = `<div class="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-800"><i class="fas fa-screwdriver-wrench mr-1"></i>Assemble: per piece consumes ${parts.length ? parts.join(', ') : '(no recipe)'}. Buildable now: <strong>${this.fmt(p.buildable_units)}</strong>.</div>`;
    } else if (stage === 'paint') {
      html = `<div class="bg-indigo-50 border border-indigo-200 rounded p-2 text-xs text-indigo-800"><i class="fas fa-fill-drip mr-1"></i>Paint: assembled stock se minus hoga. Available assembled: <strong>${this.fmt(p.assembled_qty)}</strong>.</div>`;
    } else if (stage === 'pack') {
      const sets = (p.set_items||[]).map(s => `${this.escapeHtml(s.item_name||'')} ×${this.fmt(s.quantity_required)}`);
      html = `<div class="bg-green-50 border border-green-200 rounded p-2 text-xs text-green-800"><i class="fas fa-box mr-1"></i>Pack: painted stock se minus + set items lagenge (${sets.length ? sets.join(', ') : 'koi set item nahi'}). Available painted: <strong>${this.fmt(p.painted_qty)}</strong>. Final packed inventory mein add hoga.</div>`;
    }
    box.innerHTML = html;
  },

  _onPProdRecalc() {
    const box = document.getElementById('ppl-payout-box');
    if (!box) return;
    const qty = parseFloat(document.getElementById('ppl-qty')?.value) || 0;
    const rate = parseFloat(document.getElementById('ppl-rate')?.value) || 0;
    const payout = qty * rate;
    box.innerHTML = `<div class="bg-purple-50 border border-purple-200 rounded-lg px-3 py-2 flex items-center justify-between">
      <span class="text-sm text-purple-800"><i class="fas fa-coins mr-1"></i>Worker Payout (${this.fmt(qty)} × PKR ${this.fmt(rate)})</span>
      <span class="text-lg font-bold text-purple-700">PKR ${this.fmt(payout)}</span></div>`;
  },

  async deleteProductProduction(id) {
    if (!confirm('Delete this production log? Stock movement, set-item usage and worker payout will be reversed.')) return;
    try {
      await this.api.delete(`/api/product-production/${id}`);
      this.closeModal();
      if (this.state.view === 'products') await this.showProducts();
      else if (this.state.currentEmployee) await this.openEmployee(this.state.currentEmployee.id);
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= COMPONENTS / PRODUCTION =========
  // A "component" is an intermediate part workers make from raw material
  // (e.g. Rings, Bottom Jaali). Workers are paid PER PIECE. When a worker
  // reports production, the component stock increases, raw material is
  // (optionally) deducted, scrap is recorded, and a per-piece payout line
  // is added to that worker's profile + weekly (Thu-Thu) total.
  async showComponents() {
    this.state.view = 'components';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.setActiveNav('components');
    this.closeSidebarOnMobile();
    this.renderFolders();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-puzzle-piece text-teal-600"></i>Components Production</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      const [cData, rmData, eData, pData] = await Promise.all([
        this.api.get('/api/components'),
        this.api.get('/api/raw-materials'),
        this.api.get('/api/employees'),
        this.api.get('/api/production')
      ]);
      this.state.components = cData.components || [];
      this.state.rawMaterials = rmData.items || [];
      this.state.employees = eData.employees || [];
      this.state.productionLogs = pData.production || [];
      this.renderComponents();
    } catch (e) { this.toast('Failed to load components', 'error'); }
  },

  renderComponents(filter = '') {
    const f = (filter || '').toLowerCase();
    const items = f ? this.state.components.filter(c =>
      (c.name || '').toLowerCase().includes(f) ||
      (c.category || '').toLowerCase().includes(f)) : this.state.components;
    const totalStock = this.state.components.reduce((s, c) => s + (parseFloat(c.quantity) || 0), 0);
    const logs = this.state.productionLogs || [];
    const today = new Date().toISOString().slice(0, 10);
    const todayPieces = logs.filter(l => l.entry_date === today).reduce((s, l) => s + (parseFloat(l.quantity) || 0), 0);
    const todayPayout = logs.filter(l => l.entry_date === today).reduce((s, l) => s + (parseFloat(l.payout) || 0), 0);
    const totalScrap = logs.reduce((s, l) => s + (parseFloat(l.scrap_qty) || 0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fas fa-puzzle-piece text-teal-600"></i>Components Production</h1>
          <p class="page-subtitle">${this.state.components.length} component(s) · Raw Material → Components → Product</p>
        </div>
        <div class="flex gap-2 flex-wrap">
          <input type="text" id="comp-search" placeholder="Search components..." class="input-field" style="max-width:220px;" oninput="App.renderComponents(this.value)" value="${this.escapeAttr(filter)}">
          <button onclick="App.showProductionEditor()" class="btn btn-secondary"><i class="fas fa-hard-hat"></i> Log Production</button>
          <button onclick="App.showComponentEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Component</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Components</p><p class="text-xl font-bold text-blue-600">${this.state.components.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Stock (pieces)</p><p class="text-xl font-bold amount-running">${this.fmt(totalStock)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Produced Today</p><p class="text-xl font-bold text-teal-600">${this.fmt(todayPieces)}</p><p class="text-xs text-gray-400 mt-1">Payout PKR ${this.fmt(todayPayout)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Scrap / Waste</p><p class="text-xl font-bold text-red-600">${this.fmt(totalScrap)}</p></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b"><h2 class="font-bold text-gray-800"><i class="fas fa-puzzle-piece mr-2 text-teal-600"></i>Components & Current Stock</h2></div>
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th>
              <th>Component</th>
              <th style="width:110px;">Category</th>
              <th>Made From (per 1 piece)</th>
              <th style="width:130px;text-align:right;">Per-Piece Rate</th>
              <th style="width:120px;text-align:center;">In Stock</th>
              <th style="width:150px;">Action</th>
            </tr></thead><tbody>
              ${items.length === 0 ? `<tr><td colspan="7" class="text-center py-10 text-gray-500">
                <i class="fas fa-puzzle-piece text-4xl mb-2 block opacity-40"></i>
                ${filter ? 'No matching components.' : 'No components yet. Click "Add Component" to define your first part (e.g. Rings, Bottom Jaali).'}
              </td></tr>` :
              items.map((c, i) => {
                const ings = c.ingredients || [];
                const recipeStr = ings.length === 0 ? '<span class="text-gray-400">Manual (no recipe)</span>' :
                  ings.map(ing => {
                    const rmName = ing.raw_name || '(deleted)';
                    const need = parseFloat(ing.quantity_required) || 0;
                    const unit = ing.unit || ing.raw_unit || '';
                    return `<span class="inline-block px-2 py-0.5 rounded text-xs mr-1 mb-1 bg-orange-50 text-orange-700 border border-orange-200">
                      <strong>${this.escapeHtml(rmName)}</strong>: ${this.fmt(need)} ${this.escapeHtml(unit)}</span>`;
                  }).join('');
                const stock = parseFloat(c.quantity) || 0;
                return `<tr>
                  <td class="text-gray-500">${i + 1}</td>
                  <td class="font-semibold">${this.escapeHtml(c.name)} <span class="text-xs text-gray-400">${this.escapeHtml(c.unit || 'pcs')}</span></td>
                  <td>${this.escapeHtml(c.category || '')}</td>
                  <td style="min-width:280px;">${recipeStr}</td>
                  <td class="text-right">${parseFloat(c.default_rate) > 0 ? 'PKR ' + this.fmt(c.default_rate) : '<span class="text-gray-400">—</span>'}</td>
                  <td class="text-center"><span class="text-2xl font-bold ${stock > 0 ? 'text-green-600' : 'text-gray-400'}">${this.fmt(stock)}</span></td>
                  <td>
                    <button onclick="App.showProductionEditor(null, ${c.id})" class="btn btn-secondary btn-sm" title="Log Production"><i class="fas fa-hard-hat"></i></button>
                    <button onclick="App.showComponentEditor(${c.id})" class="btn btn-secondary btn-sm ml-1" title="Edit"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteComponent(${c.id})" class="text-red-500 hover:text-red-700 ml-1" title="Delete"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody></table></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h2 class="font-bold text-gray-800"><i class="fas fa-hard-hat mr-2 text-teal-600"></i>Recent Production Log</h2>
            <span class="text-xs text-gray-500">Latest ${Math.min(logs.length, 50)} entries</span>
          </div>
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Date</th><th>Worker</th><th>Component</th>
              <th class="text-right">Pieces</th><th class="text-right">Rate</th><th class="text-right">Payout</th>
              <th class="text-right">Raw Used</th><th class="text-right">Scrap</th><th style="width:90px;">Action</th>
            </tr></thead><tbody>
              ${logs.length === 0 ? `<tr><td colspan="10" class="text-center py-8 text-gray-500"><i class="fas fa-inbox text-3xl mb-2 block"></i>No production logged yet.</td></tr>` :
                logs.slice(0, 50).map((l, i) => `<tr>
                  <td>${i + 1}</td>
                  <td>${l.entry_date}</td>
                  <td>${l.employee_name ? this.escapeHtml(l.employee_name) : '<span class="text-gray-400">—</span>'}</td>
                  <td class="font-medium">${this.escapeHtml(l.component_name || '')}</td>
                  <td class="text-right font-bold text-teal-700">${this.fmt(l.quantity)}</td>
                  <td class="text-right">PKR ${this.fmt(l.rate)}</td>
                  <td class="text-right amount-received">PKR ${this.fmt(l.payout)}</td>
                  <td class="text-right text-gray-500">${parseFloat(l.raw_used) > 0 ? this.fmt(l.raw_used) : '—'}</td>
                  <td class="text-right ${parseFloat(l.scrap_qty) > 0 ? 'text-red-600' : 'text-gray-400'}">${parseFloat(l.scrap_qty) > 0 ? this.fmt(l.scrap_qty) : '—'}</td>
                  <td>
                    <button onclick="App.showProductionEditor(${l.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteProduction(${l.id})" class="text-red-500 ml-1"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`).join('')}
            </tbody></table></div>
        </div>

        <div class="bg-teal-50 border border-teal-200 rounded-xl p-4 text-sm text-teal-900">
          <i class="fas fa-info-circle mr-1"></i>
          <strong>Kaise kaam karta hai:</strong> Pehle component banao (e.g. "Rings") aur uska raw-material recipe + per-piece rate set karo.
          Jab koi worker bole "aaj maine itne pieces banaye", to <strong>Log Production</strong> daba kar worker + component + quantity daalo.
          System component stock barhaega, raw material kam karega (agar recipe linked hai), scrap record karega, aur worker ki profile + weekly (Thursday→Wednesday) total mein per-piece payout add karega.
        </div>
      </div>`;
  },

  showComponentEditor(id = null) {
    const c = id ? this.state.components.find(x => x.id === id) : { name:'', unit:'pcs', category:'', notes:'', default_rate:0, quantity:0, ingredients: [] };
    if (id && !c) return;
    this._editingIngredients = (c.ingredients || []).map(ing => ({
      raw_material_id: ing.raw_material_id,
      quantity_required: ing.quantity_required,
      unit: ing.unit || ing.raw_unit || ''
    }));

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-puzzle-piece text-teal-600 mr-2"></i>${id ? 'Edit' : 'Add'} Component</h2>
      <form id="comp-form" class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div class="md:col-span-2">
            <label class="block text-sm font-medium mb-1">Component Name *</label>
            <input id="c-name" type="text" required class="input-field" value="${this.escapeAttr(c.name || '')}" placeholder="e.g. Trolley Basket Rings">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Unit</label>
            <select id="c-unit" class="input-field">
              ${['pcs','set','box','dozen','pair','kg','meter','foot'].map(u => `<option value="${u}" ${ (c.unit || 'pcs') === u ? 'selected' : ''}>${u}</option>`).join('')}
            </select>
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Category</label>
            <input id="c-cat" type="text" class="input-field" value="${this.escapeAttr(c.category || '')}" placeholder="e.g. Trolley, Sink Rack">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Default Per-Piece Rate (PKR)</label>
            <input id="c-rate" type="number" step="any" class="input-field" value="${c.default_rate || 0}" placeholder="Worker pay per piece">
          </div>
          <div>
            <label class="block text-sm font-medium mb-1">Current Stock ${id ? '(manual correction)' : ''}</label>
            <input id="c-qty" type="number" step="any" class="input-field" value="${c.quantity || 0}">
          </div>
          <div class="md:col-span-2">
            <label class="block text-sm font-medium mb-1">Notes</label>
            <input id="c-notes" type="text" class="input-field" value="${this.escapeAttr(c.notes || '')}">
          </div>
        </div>

        <div class="border-t pt-4">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-base font-bold text-gray-800"><i class="fas fa-cubes text-orange-500 mr-1"></i>Recipe — Raw Material per 1 piece (optional)</h3>
            <button type="button" onclick="App._addIngredientRow()" class="btn btn-secondary btn-sm"><i class="fas fa-plus"></i> Add Raw Material</button>
          </div>
          <p class="text-xs text-gray-500 mb-2">Agar recipe set karoge, to production log karte waqt raw material apne aap kam ho jayega. Khaali chhod sakte ho (manual).</p>
          ${this.state.rawMaterials.length === 0 ? `
            <div class="bg-yellow-50 border border-yellow-200 rounded p-3 text-sm text-yellow-800">
              <i class="fas fa-exclamation-triangle mr-1"></i> No raw materials found. Add raw materials first if you want auto-deduction.
            </div>` : ''}
          <div id="ingredients-list" class="space-y-2"></div>
          <div id="ingredients-summary" class="mt-3 p-3 rounded-lg bg-gray-50 border text-sm"></div>
        </div>

        <div class="flex gap-2 justify-end pt-2 border-t">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteComponent(${id})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `, 'modal-lg');

    this._renderIngredientRows();

    document.getElementById('comp-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      this._collectIngredientRows();
      const ings = (this._editingIngredients || []).filter(i => i.raw_material_id && parseFloat(i.quantity_required) > 0);
      const payload = {
        name: document.getElementById('c-name').value.trim(),
        unit: document.getElementById('c-unit').value || 'pcs',
        category: document.getElementById('c-cat').value,
        notes: document.getElementById('c-notes').value,
        default_rate: parseFloat(document.getElementById('c-rate').value) || 0,
        quantity: parseFloat(document.getElementById('c-qty').value) || 0,
        ingredients: ings
      };
      if (!payload.name) { this.toast('Component name required', 'error'); return; }
      try {
        if (id) await this.api.put(`/api/components/${id}`, payload);
        else await this.api.post('/api/components', payload);
        this.closeModal();
        await this.showComponents();
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed to save', 'error'); }
    });
  },

  async deleteComponent(id) {
    if (!confirm('Delete this component? Production history rows will keep their snapshot but stock is removed.')) return;
    try {
      await this.api.delete(`/api/components/${id}`);
      this.closeModal();
      await this.showComponents();
      this.toast('Deleted', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // Log production: worker reports how many pieces of a component they made.
  showProductionEditor(logId = null, presetComponentId = null) {
    const log = logId ? (this.state.productionLogs || []).find(l => l.id === logId) : null;
    if (logId && !log) return;
    const comps = this.state.components || [];
    const emps = (this.state.employees || []).filter(e => e.active);
    const today = new Date().toISOString().slice(0, 10);
    const selComp = log ? log.component_id : presetComponentId;

    const compOptions = `<option value="">-- Select Component --</option>` +
      comps.map(c => `<option value="${c.id}" data-rate="${c.default_rate || 0}" ${selComp == c.id ? 'selected' : ''}>${this.escapeHtml(c.name)} (Stock: ${this.fmt(c.quantity)})</option>`).join('');
    const empOptions = `<option value="">-- (Optional) Select Worker --</option>` +
      emps.map(e => `<option value="${e.id}" ${log && log.employee_id == e.id ? 'selected' : ''}>${this.escapeHtml(e.name)}</option>`).join('');

    const initComp = comps.find(c => c.id == selComp);
    const hasRecipe = initComp && (initComp.ingredients || []).length > 0;

    this.openModal(`
      <h2 class="text-xl font-bold mb-1"><i class="fas fa-hard-hat text-teal-600 mr-2"></i>${logId ? 'Edit' : 'Log'} Production</h2>
      <p class="text-sm text-gray-600 mb-4">Worker ne jitne pieces banaye uska record. Component stock barhega + worker payout add hoga.</p>
      <form id="prod-log-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label>
          <input id="pl-date" type="date" class="input-field" value="${log ? log.entry_date : today}"></div>
        <div><label class="block text-sm font-medium mb-1">Worker</label>
          <select id="pl-emp" class="input-field" onchange="App._onProdWorkerChange()" ${logId ? 'disabled' : ''}>${empOptions}</select>
          ${logId ? '<input type="hidden" id="pl-emp-hidden" value="'+(log.employee_id||'')+'">' : ''}
        </div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Component *</label>
          <select id="pl-comp" class="input-field" required onchange="App._onProdCompChange()" ${logId ? 'disabled' : ''}>${compOptions}</select>
          ${logId ? '<input type="hidden" id="pl-comp-hidden" value="'+(log.component_id||'')+'">' : ''}
        </div>
        <div><label class="block text-sm font-medium mb-1">Pieces Made *</label>
          <input id="pl-qty" type="number" step="any" min="0.01" required class="input-field" value="${log ? log.quantity : ''}" oninput="App._onProdRecalc()"></div>
        <div><label class="block text-sm font-medium mb-1">Per-Piece Rate (PKR) <span id="pl-rate-src" class="text-xs font-normal text-teal-600"></span></label>
          <input id="pl-rate" type="number" step="any" class="input-field" value="${log ? log.rate : (initComp ? (initComp.default_rate||0) : 0)}" oninput="App._onProdRecalc()"></div>
        <div><label class="block text-sm font-medium mb-1">Scrap / Waste (raw units)</label>
          <input id="pl-scrap" type="number" step="any" class="input-field" value="${log ? (log.scrap_qty||0) : 0}" placeholder="0"></div>
        <div class="flex items-end">
          <label class="flex items-center gap-2 text-sm pb-2">
            <input id="pl-deduct" type="checkbox" ${log ? (log.deducted_raw ? 'checked' : '') : 'checked'} ${logId ? 'disabled' : ''}>
            Auto-deduct raw material ${hasRecipe ? '' : '(no recipe linked)'}
          </label>
        </div>
        <div class="md:col-span-2" id="pl-payout-box"></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Notes</label>
          <input id="pl-notes" type="text" class="input-field" value="${log ? this.escapeAttr(log.notes||'') : ''}"></div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${logId ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteProduction(${logId})"><i class="fas fa-trash"></i> Delete</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>
    `, 'modal-lg');

    // On open: if both worker & component pre-selected, auto-fill the rate.
    if (!logId) this._autoFillProdRate(true);
    this._onProdRecalc();

    document.getElementById('prod-log-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const compId = logId ? document.getElementById('pl-comp-hidden').value : document.getElementById('pl-comp').value;
      const empId = logId ? (document.getElementById('pl-emp-hidden')?.value || null) : (document.getElementById('pl-emp').value || null);
      const qty = parseFloat(document.getElementById('pl-qty').value) || 0;
      const rate = parseFloat(document.getElementById('pl-rate').value) || 0;
      const scrap = parseFloat(document.getElementById('pl-scrap').value) || 0;
      const notes = document.getElementById('pl-notes').value;
      const deduct = logId ? undefined : document.getElementById('pl-deduct').checked;
      const date = document.getElementById('pl-date').value || today;
      if (!compId) { this.toast('Select a component', 'error'); return; }
      if (qty <= 0) { this.toast('Pieces must be greater than 0', 'error'); return; }
      try {
        if (logId) {
          await this.api.put(`/api/production/${logId}`, { entry_date: date, quantity: qty, rate, scrap_qty: scrap, notes });
        } else {
          const res = await this.api.post('/api/production', { entry_date: date, employee_id: empId, component_id: compId, quantity: qty, rate, deduct_raw: deduct, scrap_qty: scrap, notes });
          if (res.error) { this.toast(res.error, 'error'); return; }
        }
        this.closeModal();
        if (this.state.view === 'components') await this.showComponents();
        else if (this.state.currentEmployee) await this.openEmployee(this.state.currentEmployee.id);
        this.toast('Production saved', 'success');
      } catch (err) { this.toast('Failed to save', 'error'); }
    });
  },

  _onProdCompChange() {
    // Component changed → re-evaluate the auto rate (worker's rate first, else component default).
    this._autoFillProdRate(true);
    this._onProdRecalc();
  },

  _onProdWorkerChange() {
    // Worker changed → if that worker has a saved per-piece rate for the selected
    // component, fill it automatically (user na bar bar rate likhna pare).
    this._autoFillProdRate(true);
    this._onProdRecalc();
  },

  // Decide the per-piece rate. Priority:
  //   1. Selected WORKER's saved rate for this component (employee_items, match by name)
  //   2. Component's default_rate
  // force=true overwrites the field; otherwise only fills if empty/zero.
  _autoFillProdRate(force = false) {
    const compSel = document.getElementById('pl-comp');
    const empSel = document.getElementById('pl-emp');
    const rateInput = document.getElementById('pl-rate');
    const srcLabel = document.getElementById('pl-rate-src');
    if (!compSel || !rateInput) return;
    const compId = parseInt(compSel.value) || null;
    const comp = (this.state.components || []).find(c => c.id === compId);
    const empId = empSel ? (parseInt(empSel.value) || null) : null;
    const emp = (this.state.employees || []).find(e => e.id === empId);

    let rate = null;
    let source = '';
    // 1) Worker's saved rate for this component
    if (emp && comp && Array.isArray(emp.items)) {
      const it = emp.items.find(x => (x.item_name || '').trim().toLowerCase() === (comp.name || '').trim().toLowerCase());
      if (it && parseFloat(it.rate) > 0) { rate = parseFloat(it.rate); source = 'from worker profile'; }
    }
    // 2) Component default rate
    if (rate === null && comp && parseFloat(comp.default_rate) > 0) {
      rate = parseFloat(comp.default_rate); source = 'component default';
    }

    if (rate !== null) {
      const cur = parseFloat(rateInput.value) || 0;
      if (force || cur === 0) {
        rateInput.value = rate;
        if (srcLabel) srcLabel.textContent = source ? '(' + source + ')' : '';
      }
    } else if (srcLabel) {
      srcLabel.textContent = '';
    }
  },

  _onProdRecalc() {
    const box = document.getElementById('pl-payout-box');
    if (!box) return;
    const qty = parseFloat(document.getElementById('pl-qty')?.value) || 0;
    const rate = parseFloat(document.getElementById('pl-rate')?.value) || 0;
    const payout = qty * rate;
    box.innerHTML = `
      <div class="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center justify-between">
        <span class="text-sm text-gray-700"><i class="fas fa-coins text-green-600 mr-1"></i>Worker Payout (${this.fmt(qty)} × PKR ${this.fmt(rate)})</span>
        <span class="text-xl font-bold text-green-700">PKR ${this.fmt(payout)}</span>
      </div>`;
  },

  async deleteProduction(id) {
    if (!confirm('Delete this production entry? Component stock and worker payout will be reversed.')) return;
    try {
      await this.api.delete(`/api/production/${id}`);
      this.closeModal();
      if (this.state.view === 'components') await this.showComponents();
      else if (this.state.currentEmployee) await this.openEmployee(this.state.currentEmployee.id);
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
    // Remaining = (salary owed - salary paid) - ACTIVE advance (deferred advance not cut yet)
    const calcEmpRemaining = (e) => {
      const tAmt = parseFloat(e.total_amount) || 0;
      const tPaid = parseFloat(e.total_paid) || 0;
      // advance_active = advances that are NOT deferred (falls back to total_advance for old data)
      const adv = (e.advance_active !== undefined && e.advance_active !== null)
        ? (parseFloat(e.advance_active) || 0)
        : (parseFloat(e.total_advance) || 0);
      return (tAmt - tPaid) - adv;
    };
    const totalRemaining = emps.reduce((s, e) => s + calcEmpRemaining(e), 0);
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
          <div class="stat-card"><p class="text-xs text-gray-500">Remaining Amount</p><p class="text-xl font-bold amount-pending">PKR ${this.fmt(totalRemaining)}</p></div>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Name</th><th>Designation</th>
              <th>Phone</th><th class="text-right">Salary</th>
              <th class="text-right">Paid</th><th class="text-right">Remaining Amount</th>
              <th>Status</th><th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${emps.length === 0 ? `<tr><td colspan="9" class="text-center py-8 text-gray-500">
                <i class="fas fa-user-tie text-3xl mb-2 block"></i>No employees yet.</td></tr>` :
                emps.map((e, i) => {
                  const isPiece = e.salary_type === 'per_piece';
                  const tPaid = parseFloat(e.total_paid) || 0;
                  const tRemain = calcEmpRemaining(e);
                  return `
                  <tr class="cursor-pointer hover:bg-gray-50" onclick="App.openEmployee(${e.id})">
                    <td>${i + 1}</td>
                    <td class="font-semibold">${this.escapeHtml(e.name)}${isPiece ? ' <i class="fas fa-cubes text-orange-500 ml-1" title="Per Piece"></i>' : ''}</td>
                    <td>${this.escapeHtml(e.designation || '-')}</td>
                    <td>${this.escapeHtml(e.phone || '-')}</td>
                    <td class="text-right">${isPiece ? '<span class="text-xs text-orange-600">Per Piece</span>' : 'PKR ' + this.fmt(e.monthly_salary)}</td>
                    <td class="text-right amount-received">PKR ${this.fmt(tPaid)}</td>
                    <td class="text-right ${tRemain < 0 ? 'amount-running' : 'amount-pending'}">PKR ${this.fmt(tRemain)}</td>
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
          <input id="e-sal" type="number" step="any" min="0" class="input-field" value="${parseFloat(e.monthly_salary) || 0}">
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
        monthly_salary: sType === 'monthly' ? (parseFloat(document.getElementById('e-sal').value) || 0) : 0,
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
        <input type="number" step="any" min="0" class="input-field" style="width:120px;" data-ei-rate="${i}" value="${parseFloat(it.rate) || 0}" placeholder="Rate (PKR)">
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
      if (this._tempEmpItems[i]) this._tempEmpItems[i].rate = parseFloat(el.value) || 0;
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
      const [data, weekly] = await Promise.all([
        this.api.get(`/api/employees/${id}`),
        this.api.get(`/api/production/weekly?employee_id=${id}`)
      ]);
      this.state.currentEmployee = data.employee;
      this.state.employeeTransactions = data.transactions || [];
      this.state.currentEmployeeItems = data.items || [];
      this.state.employeeWeeks = weekly.weeks || [];
      this.renderEmployeeDetail();
    } catch (e) {}
  },

  renderEmployeeDetail() {
    const e = this.state.currentEmployee;
    const tx = this.state.employeeTransactions;
    const sumByType = (t) => tx.filter(x => x.type === t).reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
    // For salary entries: actual paid amount (paid_amount if set, else full amount)
    const salaryPaidActual = tx.filter(x => x.type === 'salary').reduce((s, x) => {
      const amt = parseFloat(x.amount) || 0;
      const pa = (x.paid_amount === null || x.paid_amount === undefined || x.paid_amount === '') ? amt : (parseFloat(x.paid_amount) || 0);
      return s + pa;
    }, 0);
    const salaryTotalAmount = sumByType('salary');
    const advance = sumByType('advance');
    // Active advance = advances NOT deferred. Deferred advance is parked for a later week.
    const advanceActive = tx.filter(x => x.type === 'advance' && !x.deferred)
      .reduce((s, x) => s + (parseFloat(x.amount) || 0), 0);
    const advanceDeferred = advance - advanceActive;
    // Remaining = (Salary owed) - ACTIVE advance.
    //   Salary owed = salary total - salary already paid.
    //   Advance is money the worker already took, so an ACTIVE advance reduces what's
    //   still owed (Remaining). A DEFERRED advance is not cut this week.
    // Result CAN be negative (worker took more than earned -> employer is in credit).
    const salaryRemaining = (salaryTotalAmount - salaryPaidActual) - advanceActive;
    // Salary Paid (cash out the door) = salary paid + active advance already handed over.
    const totalPaidOut = salaryPaidActual + advanceActive;
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
          <button onclick="App.showProductionForWorker(${e.id})" class="btn btn-secondary btn-sm"><i class="fas fa-hard-hat"></i> Log Production</button>
          <button onclick="App.showEmployeeTxEditor(${e.id})" class="btn btn-primary btn-sm"><i class="fas fa-plus"></i> New Entry</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Total Earned / Owed</p><p class="text-xl font-bold text-blue-600">PKR ${this.fmt(salaryTotalAmount)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Salary Paid (incl. advance)</p><p class="text-xl font-bold amount-received">PKR ${this.fmt(totalPaidOut)}</p><p class="text-xs text-gray-400 mt-1">Salary ${this.fmt(salaryPaidActual)} + Advance ${this.fmt(advanceActive)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Advance</p><p class="text-xl font-bold amount-pending">PKR ${this.fmt(advance)}</p>${advanceDeferred > 0 ? `<p class="text-xs text-orange-500 mt-1"><i class="fas fa-clock mr-1"></i>PKR ${this.fmt(advanceDeferred)} deferred (next week)</p>` : ''}</div>
          <div class="balance-box"><p class="text-xs opacity-90">Remaining</p><p class="text-2xl font-bold mt-1">PKR ${this.fmt(salaryRemaining)}</p>
            <p class="text-xs opacity-80 mt-1">${salaryRemaining > 0 ? 'You owe employee' : salaryRemaining < 0 ? 'Employee owes you' : 'Settled'}</p></div>
        </div>
        <!-- Weekly Production Payout (Thursday -> Wednesday) -->
        ${this._renderWeeklyPayout()}

        <!-- Employee Calendar -->
        <div id="employee-calendar"></div>

        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h2 class="font-bold text-gray-800"><i class="fas fa-history mr-2"></i>Salary / Advance Records</h2>
          </div>
          <div class="overflow-x-auto"><table class="ledger-table">
            <thead><tr>
              <th style="width:40px;">#</th><th>Date</th><th>Type</th>
              <th>Item / Description</th><th class="text-right">Qty</th>
              <th class="text-right">Rate</th><th class="text-right">Total</th>
              <th class="text-right">Paid</th><th class="text-right">Remaining</th>
              <th style="width:100px;">Action</th>
            </tr></thead><tbody>
              ${tx.length === 0 ? `<tr><td colspan="10" class="text-center py-8 text-gray-500"><i class="fas fa-inbox text-3xl mb-2 block"></i>No records yet.</td></tr>` :
                tx.map((t, i) => {
                  const isPiece = t.entry_type === 'per_piece';
                  const isSalary = t.type === 'salary';
                  const isAdvance = t.type === 'advance';
                  const isDeferred = isAdvance && !!t.deferred;
                  const totalAmt = parseFloat(t.amount) || 0;
                  const paidA = (t.paid_amount === null || t.paid_amount === undefined || t.paid_amount === '') ? totalAmt : (parseFloat(t.paid_amount) || 0);
                  const remainingA = Math.max(0, totalAmt - paidA);
                  return `<tr>
                  <td>${i + 1}</td>
                  <td>${t.entry_date}</td>
                  <td><span class="status-badge ${t.type === 'salary' ? 'status-received' : 'status-pending'}">${this.escapeHtml(t.type)}</span>${isPiece ? ' <i class="fas fa-cubes text-orange-500 ml-1" title="Per Piece"></i>' : ''}${isDeferred ? ' <span class="status-badge status-overdue" title="Deferred to next week"><i class="fas fa-clock"></i> deferred</span>' : ''}</td>
                  <td>${isPiece ? `<strong>${this.escapeHtml(t.item_name || '')}</strong>${t.description ? `<div class="text-xs text-gray-500">${this.escapeHtml(t.description)}</div>` : ''}` : this.escapeHtml(t.description || '')}</td>
                  <td class="text-right">${isPiece ? this.fmt(t.quantity) : '-'}</td>
                  <td class="text-right">${isPiece ? 'PKR ' + this.fmt(t.rate) : '-'}</td>
                  <td class="text-right font-bold">PKR ${this.fmt(totalAmt)}</td>
                  <td class="text-right amount-received">${isSalary ? 'PKR ' + this.fmt(paidA) : '-'}</td>
                  <td class="text-right amount-pending font-semibold">${isSalary ? 'PKR ' + this.fmt(remainingA) : '-'}</td>
                  <td>
                    ${isAdvance ? `<button onclick="App.toggleDeferAdvance(${t.id})" class="text-${isDeferred ? 'orange' : 'gray'}-500 mr-1" title="${isDeferred ? 'Is week kaat lo (un-defer)' : 'Is week mat kaato, next week kaatna (defer)'}"><i class="fas fa-clock text-sm"></i></button>` : ''}
                    <button onclick="App.showEmployeeTxEditor(${e.id}, ${t.id})" class="btn btn-secondary btn-sm"><i class="fas fa-edit"></i></button>
                    <button onclick="App.deleteEmployeeTx(${t.id})" class="text-red-500 ml-1"><i class="fas fa-trash text-sm"></i></button>
                  </td>
                </tr>`}).join('')}
            </tbody></table></div>
        </div>
      </div>`;
    // Render calendar for this employee
    this.renderCalendar('employee-calendar', { employeeId: e.id });
  },

  // Weekly production payout grouped Thursday -> Wednesday.
  // Each Thursday a new week starts; the per-piece earnings of that week are totalled.
  _renderWeeklyPayout() {
    const weeks = this.state.employeeWeeks || [];
    if (weeks.length === 0) {
      return `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between">
            <h2 class="font-bold text-gray-800"><i class="fas fa-calendar-week mr-2 text-teal-600"></i>Weekly Production Payout <span class="text-xs font-normal text-gray-500">(Thursday → Wednesday)</span></h2>
          </div>
          <div class="p-6 text-center text-gray-500"><i class="fas fa-puzzle-piece text-3xl mb-2 block opacity-40"></i>
            No production logged for this worker yet. Use <strong>Log Production</strong> to record the pieces they make.</div>
        </div>`;
    }
    const fmtDate = (s) => {
      try { const d = new Date(s + 'T00:00:00'); return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }); } catch { return s; }
    };
    const grandPieces = weeks.reduce((s, w) => s + (parseFloat(w.total_pieces) || 0), 0);
    const grandPayout = weeks.reduce((s, w) => s + (parseFloat(w.total_payout) || 0), 0);
    return `
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
          <h2 class="font-bold text-gray-800"><i class="fas fa-calendar-week mr-2 text-teal-600"></i>Weekly Production Payout <span class="text-xs font-normal text-gray-500">(Thursday → Wednesday)</span></h2>
          <div class="text-sm text-gray-600">Total: <strong class="text-teal-700">${this.fmt(grandPieces)}</strong> pieces · <strong class="amount-received">PKR ${this.fmt(grandPayout)}</strong></div>
        </div>
        <div class="divide-y">
          ${weeks.map((w, wi) => {
            const comps = (w.components || []).map(c =>
              `<span class="inline-block px-2 py-0.5 rounded text-xs mr-1 mb-1 bg-teal-50 text-teal-700 border border-teal-200">${this.escapeHtml(c.name)}: <strong>${this.fmt(c.pieces)}</strong> pcs · PKR ${this.fmt(c.payout)}</span>`
            ).join('');
            const days = (w.days || []).map(d =>
              `<div class="flex items-center justify-between text-xs py-0.5 px-2"><span class="text-gray-600">${fmtDate(d.date)} <span class="text-gray-400">(${new Date(d.date+'T00:00:00').toLocaleDateString('en-GB',{weekday:'short'})})</span></span><span><strong>${this.fmt(d.pieces)}</strong> pcs · PKR ${this.fmt(d.payout)}</span></div>`
            ).join('');
            const open = wi === 0 ? 'open' : '';
            return `
            <details ${open} class="group">
              <summary class="cursor-pointer list-none px-4 py-3 hover:bg-gray-50 flex items-center justify-between">
                <div>
                  <span class="font-semibold text-gray-800"><i class="fas fa-chevron-right text-xs text-gray-400 mr-2 transition-transform group-open:rotate-90"></i>Week: ${fmtDate(w.week_start)} → ${fmtDate(w.week_end)}</span>
                  ${wi === 0 ? '<span class="ml-2 text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">Current Week</span>' : ''}
                </div>
                <div class="text-right">
                  <div class="font-bold text-teal-700">${this.fmt(w.total_pieces)} pcs</div>
                  <div class="text-sm amount-received">PKR ${this.fmt(w.total_payout)}</div>
                </div>
              </summary>
              <div class="px-4 pb-3 pt-1 bg-gray-50/50">
                <div class="mb-2">${comps || '<span class="text-xs text-gray-400">No components</span>'}</div>
                <div class="bg-white rounded-lg border divide-y">${days}</div>
                ${parseFloat(w.total_scrap) > 0 ? `<div class="text-xs text-red-600 mt-2"><i class="fas fa-recycle mr-1"></i>Scrap this week: ${this.fmt(w.total_scrap)} units</div>` : ''}
              </div>
            </details>`;
          }).join('')}
        </div>
      </div>`;
  },

  // Open the production logger pre-filled for this worker (loads components first if needed)
  async showProductionForWorker(empId) {
    try {
      if (!this.state.components || this.state.components.length === 0) {
        const cData = await this.api.get('/api/components');
        this.state.components = cData.components || [];
      }
      if (!this.state.components || this.state.components.length === 0) {
        this.toast('No components yet. Add a component first (Components Production section).', 'error');
        return;
      }
      // Ensure the current employee is selectable
      if (!this.state.employees || this.state.employees.length === 0) {
        const eData = await this.api.get('/api/employees');
        this.state.employees = eData.employees || [];
      }
      this._prefillWorkerForProduction = empId;
      this.showProductionEditor();
      // pre-select the worker
      const empSel = document.getElementById('pl-emp');
      if (empSel) empSel.value = String(empId);
    } catch (e) { this.toast('Failed to open', 'error'); }
  },

  showEmployeeTxEditor(empId, txId = null) {
    const tx = txId ? this.state.employeeTransactions.find(t => t.id === txId) : { entry_date: new Date().toISOString().slice(0,10), type:'salary', amount:0, description:'', entry_type:'cash', item_id:null, item_name:'', quantity:0, rate:0, paid_amount:null };
    if (txId && !tx) return;
    const emp = this.state.currentEmployee || {};
    const empItems = this.state.currentEmployeeItems || [];
    const isPerPieceEmp = emp.salary_type === 'per_piece';
    const initEntryType = tx.entry_type || (isPerPieceEmp ? 'per_piece' : 'cash');
    const initType = tx.type || 'salary';
    // Default paid_amount: if existing record has explicit paid_amount, use it; otherwise default to full total
    const initialTotal = parseFloat(tx.amount) || 0;
    const hasPaidAmount = !(tx.paid_amount === null || tx.paid_amount === undefined || tx.paid_amount === '');
    const initialPaid = hasPaidAmount ? (parseFloat(tx.paid_amount) || 0) : initialTotal;

    const itemOptionsHtml = empItems.map(it =>
      `<option value="${it.id}" data-rate="${it.rate}" ${tx.item_id == it.id ? 'selected' : ''}>${this.escapeHtml(it.item_name)} — PKR ${this.fmt(it.rate)}</option>`
    ).join('');

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-money-check-alt text-green-500 mr-2"></i>${txId ? 'Edit' : 'New'} Salary Entry</h2>
      <form id="etx-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label>
          <input id="etx-date" type="date" class="input-field" value="${tx.entry_date || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">Type</label>
          <select id="etx-type" class="input-field" onchange="App._toggleEtxTypeChanged()">
            ${['salary','advance'].map(t => `<option value="${t}" ${tx.type === t ? 'selected' : ''}>${t === 'salary' ? 'Salary / Earning' : 'Advance'}</option>`).join('')}
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
            <input id="etx-rate" type="number" step="any" min="0" class="input-field" value="${parseFloat(tx.rate) || 0}" oninput="App._etxRecalc()"></div>
          <div><label class="block text-sm font-medium mb-1">Quantity</label>
            <input id="etx-qty" type="number" step="any" min="0" class="input-field" value="${parseFloat(tx.quantity) || 0}" oninput="App._etxRecalc()"></div>
        </div>

        <div id="etx-amount-wrap" class="md:col-span-2" style="${initEntryType === 'cash' ? '' : 'display:none;'}">
          <label class="block text-sm font-medium mb-1">Amount (PKR)</label>
          <input id="etx-amount" type="number" step="any" min="0" class="input-field" value="${parseFloat(tx.amount) || 0}" oninput="App._etxAmountChanged()">
        </div>

        <div id="etx-piece-total" class="md:col-span-2" style="${initEntryType === 'per_piece' ? '' : 'display:none;'}">
          <div class="bg-blue-50 border border-blue-200 rounded p-3 flex justify-between items-center">
            <span class="text-sm font-medium">Total (Quantity × Rate):</span>
            <span id="etx-total-display" class="font-bold text-lg amount-running">PKR 0.00</span>
          </div>
        </div>

        <!-- Defer option (only for advance type) -->
        <div id="etx-defer-wrap" class="md:col-span-2" style="${initType === 'advance' ? '' : 'display:none;'}">
          <label class="flex items-start gap-2 bg-orange-50 border border-orange-200 rounded-lg p-3 text-sm cursor-pointer">
            <input id="etx-defer" type="checkbox" class="mt-0.5" ${tx.deferred ? 'checked' : ''}>
            <span><strong><i class="fas fa-clock text-orange-500 mr-1"></i>Is week salary se mat kaato (defer)</strong>
            <span class="block text-xs text-gray-600 mt-0.5">Agar employee bole "is week advance na cut karo, next week kaat lena" to yeh tick karo. Deferred advance Remaining se nahi katega jab tak aap is tick ko hata na do.</span></span>
          </label>
        </div>

        <!-- Paid / Remaining section (only for salary type) -->
        <div id="etx-paid-wrap" class="md:col-span-2" style="${initType === 'salary' ? '' : 'display:none;'}">
          <div class="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
            <div class="flex items-center justify-between gap-3">
              <label class="block text-sm font-medium" for="etx-paid">
                <i class="fas fa-hand-holding-usd text-green-600 mr-1"></i>Paid Amount (PKR)
              </label>
              <input id="etx-paid" type="number" step="any" min="0" class="input-field" style="max-width:200px;" value="${initialPaid}" oninput="this.dataset.userTouched='1'; App._etxRecalcPaid()" placeholder="How much you paid">
            </div>
            <div class="flex items-center justify-between text-sm pt-1 border-t border-green-200">
              <span class="text-gray-600">Remaining:</span>
              <span id="etx-remaining-display" class="font-bold amount-pending">PKR 0.00</span>
            </div>
            <p class="text-xs text-gray-500"><i class="fas fa-info-circle mr-1"></i>Enter how much you actually paid out of the total. The difference will be tracked as remaining.</p>
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
    this._etxRecalcPaid();

    document.getElementById('etx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const eType = document.getElementById('etx-etype').value;
      const tType = document.getElementById('etx-type').value;
      let payload = {
        employee_id: empId,
        entry_date: document.getElementById('etx-date').value,
        type: tType,
        description: document.getElementById('etx-desc').value,
        entry_type: eType
      };
      if (eType === 'per_piece') {
        const itemSel = document.getElementById('etx-item');
        const itemId = itemSel.value ? parseInt(itemSel.value) : null;
        const itemName = itemSel.value ? itemSel.options[itemSel.selectedIndex].text.split(' — ')[0] : '';
        const qty = parseFloat(document.getElementById('etx-qty').value) || 0;
        const rate = parseFloat(document.getElementById('etx-rate').value) || 0;
        if (qty <= 0) { this.toast('Quantity required', 'error'); return; }
        payload.item_id = itemId;
        payload.item_name = itemName;
        payload.quantity = qty;
        payload.rate = rate;
        payload.amount = qty * rate;
      } else {
        payload.amount = parseFloat(document.getElementById('etx-amount').value) || 0;
      }
      // Defer flag only for advance type
      if (tType === 'advance') {
        const dEl = document.getElementById('etx-defer');
        payload.deferred = dEl ? !!dEl.checked : false;
      }
      // Paid amount only for salary type
      if (tType === 'salary') {
        const paidEl = document.getElementById('etx-paid');
        const paidVal = paidEl ? paidEl.value : '';
        if (paidVal !== '' && paidVal !== null && !isNaN(parseFloat(paidVal))) {
          payload.paid_amount = parseFloat(paidVal);
        } else {
          payload.paid_amount = payload.amount; // default fully paid
        }
      } else {
        payload.paid_amount = null;
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

  _toggleEtxTypeChanged() {
    const tEl = document.getElementById('etx-type')?.value;
    const paidWrap = document.getElementById('etx-paid-wrap');
    if (paidWrap) paidWrap.style.display = tEl === 'salary' ? '' : 'none';
    const deferWrap = document.getElementById('etx-defer-wrap');
    if (deferWrap) deferWrap.style.display = tEl === 'advance' ? '' : 'none';
  },

  _toggleEtxEntryType() {
    const t = document.getElementById('etx-etype').value;
    document.getElementById('etx-piece-wrap').style.display = t === 'per_piece' ? '' : 'none';
    document.getElementById('etx-amount-wrap').style.display = t === 'cash' ? '' : 'none';
    document.getElementById('etx-piece-total').style.display = t === 'per_piece' ? '' : 'none';
    if (t === 'per_piece') this._etxRecalc();
    this._etxRecalcPaid();
  },

  _etxRecalcPaid() {
    const eType = document.getElementById('etx-etype')?.value || 'cash';
    let total = 0;
    if (eType === 'per_piece') {
      const qty = parseFloat(document.getElementById('etx-qty')?.value) || 0;
      const rate = parseFloat(document.getElementById('etx-rate')?.value) || 0;
      total = qty * rate;
    } else {
      total = parseFloat(document.getElementById('etx-amount')?.value) || 0;
    }
    const paid = parseFloat(document.getElementById('etx-paid')?.value) || 0;
    const remaining = Math.max(0, total - paid);
    const disp = document.getElementById('etx-remaining-display');
    if (disp) disp.textContent = 'PKR ' + this.fmt(remaining);
  },

  _etxAmountChanged() {
    const amt = parseFloat(document.getElementById('etx-amount')?.value) || 0;
    // Auto-fill paid amount default if user hasn't manually set it
    const paidEl = document.getElementById('etx-paid');
    if (paidEl && !paidEl.dataset.userTouched) {
      paidEl.value = amt;
    }
    this._etxRecalcPaid();
  },

  _etxItemChanged() {
    const sel = document.getElementById('etx-item');
    const opt = sel.options[sel.selectedIndex];
    const rate = opt ? (parseFloat(opt.dataset.rate) || 0) : 0;
    document.getElementById('etx-rate').value = rate;
    this._etxRecalc();
  },

  _etxRecalc() {
    const qty = parseFloat(document.getElementById('etx-qty')?.value) || 0;
    const rate = parseFloat(document.getElementById('etx-rate')?.value) || 0;
    const total = qty * rate;
    const disp = document.getElementById('etx-total-display');
    if (disp) disp.textContent = 'PKR ' + this.fmt(total);
    // Auto-update paid amount default to match new total when user hasn't manually changed it
    const paidEl = document.getElementById('etx-paid');
    if (paidEl && !paidEl.dataset.userTouched) {
      paidEl.value = total;
    }
    this._etxRecalcPaid();
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

  // Defer / un-defer an advance. Deferred advance is NOT cut from this week's
  // Remaining (employee bola "is week mat kaato, next week kaat lena").
  async toggleDeferAdvance(id) {
    try {
      const res = await this.api.post(`/api/employee-transactions/${id}/toggle-defer`, {});
      if (res.error) { this.toast(res.error, 'error'); return; }
      if (this.state.currentEmployee) await this.openEmployee(this.state.currentEmployee.id);
      this.toast(res.deferred ? 'Advance deferred (next week)' : 'Advance will be cut this week', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========= SIDE EXPENSES (with Folders / Ledgers) =========
  // currentSideExpenseFolderId:
  //   null => folder grid (overview)
  //   0    => uncategorized expense list
  //   N    => expenses inside folder N
  async showSideExpenses(folderId = null) {
    this.state.view = 'side-expenses';
    this.state.currentFolderId = null;
    this.state.currentSideExpenseFolderId = folderId;
    this.setActiveNav('side-expenses');
    this.closeSidebarOnMobile();
    this.renderFolders();
    document.getElementById('content-area').innerHTML = `
      <div class="page-header"><h1 class="page-title"><i class="fas fa-money-bill-wave text-red-500"></i>Side Expenses</h1></div>
      <div class="p-6"><div class="text-gray-400 text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i></div></div>`;
    try {
      // Load folders + expenses (filtered by folder if any)
      const expenseUrl = (folderId === null) ? '/api/side-expenses' :
                        (folderId === 0 ? '/api/side-expenses?folder_id=null' : `/api/side-expenses?folder_id=${folderId}`);
      const [folderData, expenseData] = await Promise.all([
        this.api.get('/api/side-expense-folders'),
        this.api.get(expenseUrl)
      ]);
      this.state.sideExpenseFolders = folderData.folders || [];
      this.state.sideExpenses = expenseData.expenses || [];
      if (folderId === null) this.renderSideExpenseFolders();
      else this.renderSideExpenses();
    } catch (e) {}
  },

  // Folder grid (entry view) — shows all "ledger" folders + uncategorized + create button
  renderSideExpenseFolders() {
    const folders = this.state.sideExpenseFolders || [];
    const allExpenses = this.state.sideExpenses || [];
    const totalAll = allExpenses.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const uncategorized = allExpenses.filter(e => !e.folder_id);
    const uncatTotal = uncategorized.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const monthPrefix = new Date().toISOString().slice(0,7);
    const monthTotal = allExpenses.filter(i => (i.entry_date || '').startsWith(monthPrefix))
                                  .reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fas fa-money-bill-wave text-red-500"></i>Side Expenses</h1>
          <p class="page-subtitle">${folders.length} ledger folder(s) · ${allExpenses.length} total entry(ies)</p></div>
        <div class="flex gap-2">
          <button onclick="App.showSideExpenseFolderEditor()" class="btn btn-secondary"><i class="fas fa-folder-plus"></i> New Folder</button>
          <button onclick="App.showSideExpenseEditor()" class="btn btn-primary"><i class="fas fa-plus"></i> Add Expense</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Total Folders</p><p class="text-xl font-bold text-purple-600">${folders.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Total Entries</p><p class="text-xl font-bold text-blue-600">${allExpenses.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">This Month</p><p class="text-xl font-bold text-orange-600">PKR ${this.fmt(monthTotal)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">All Time Total</p><p class="text-xl font-bold text-red-600">PKR ${this.fmt(totalAll)}</p></div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h2 class="font-bold text-gray-800 mb-3"><i class="fas fa-folder-tree mr-2"></i>Ledger Folders <span class="text-xs font-normal text-gray-500">— click a folder to open</span></h2>
          ${folders.length === 0 && uncategorized.length === 0 ? `
            <div class="text-center py-10 text-gray-500">
              <i class="fas fa-folder-open text-4xl mb-3 block"></i>
              <p class="mb-3">No expense folders yet.</p>
              <button onclick="App.showSideExpenseFolderEditor()" class="btn btn-primary"><i class="fas fa-folder-plus"></i> Create First Folder</button>
            </div>` : `
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              ${folders.map(f => {
                const countStr = `${f.expense_count || 0} entry(ies)`;
                return `
                <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md cursor-pointer transition" style="border-left:4px solid ${f.color || '#ef4444'}" onclick="App.showSideExpenses(${f.id})">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="w-9 h-9 rounded-lg flex items-center justify-center text-white" style="background:${f.color || '#ef4444'}">
                        <i class="fas ${f.icon || 'fa-folder'}"></i>
                      </span>
                      <div>
                        <p class="font-bold text-gray-800">${this.escapeHtml(f.name)}</p>
                        <p class="text-xs text-gray-500">${countStr}</p>
                      </div>
                    </div>
                    <button onclick="event.stopPropagation(); App.showSideExpenseFolderEditor(${f.id})" class="text-gray-400 hover:text-blue-600" title="Edit folder"><i class="fas fa-edit"></i></button>
                  </div>
                  ${f.description ? `<p class="text-xs text-gray-500 mb-2 italic">${this.escapeHtml(f.description)}</p>` : ''}
                  <div class="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span class="text-xs text-gray-500">Total Spent</span>
                    <span class="font-bold text-red-600">PKR ${this.fmt(f.total_amount || 0)}</span>
                  </div>
                </div>`;
              }).join('')}
              ${uncategorized.length > 0 ? `
                <div class="border-2 border-dashed border-gray-300 rounded-lg p-4 hover:shadow-md cursor-pointer transition" onclick="App.showSideExpenses(0)">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex items-center gap-2">
                      <span class="w-9 h-9 rounded-lg flex items-center justify-center text-white bg-gray-400">
                        <i class="fas fa-inbox"></i>
                      </span>
                      <div>
                        <p class="font-bold text-gray-800">Uncategorized</p>
                        <p class="text-xs text-gray-500">${uncategorized.length} entry(ies)</p>
                      </div>
                    </div>
                  </div>
                  <p class="text-xs text-gray-500 mb-2 italic">Expenses not assigned to any folder</p>
                  <div class="flex items-center justify-between pt-2 border-t border-gray-100">
                    <span class="text-xs text-gray-500">Total</span>
                    <span class="font-bold text-red-600">PKR ${this.fmt(uncatTotal)}</span>
                  </div>
                </div>` : ''}
            </div>`}
        </div>
      </div>`;
  },

  // Single-folder view (or uncategorized) — list of expenses inside it
  renderSideExpenses() {
    const items = this.state.sideExpenses;
    const folderId = this.state.currentSideExpenseFolderId;
    const folders = this.state.sideExpenseFolders || [];
    const folder = folderId && folderId !== 0 ? folders.find(f => f.id === folderId) : null;
    const headerTitle = folder ? folder.name : (folderId === 0 ? 'Uncategorized Expenses' : 'Side Expenses');
    const headerIcon = folder ? (folder.icon || 'fa-folder') : (folderId === 0 ? 'fa-inbox' : 'fa-money-bill-wave');
    const headerColor = folder ? (folder.color || '#ef4444') : '#ef4444';
    const total = items.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0);
    const monthPrefix = new Date().toISOString().slice(0,7);
    const monthTotal = items.filter(i => (i.entry_date || '').startsWith(monthPrefix))
                            .reduce((s,i) => s + (parseFloat(i.amount)||0), 0);
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="page-header">
        <div>
          <h1 class="page-title">
            <button onclick="App.showSideExpenses()" class="text-gray-500 hover:text-gray-800 mr-2" title="Back to folders"><i class="fas fa-arrow-left"></i></button>
            <i class="fas ${headerIcon}" style="color:${headerColor}"></i>${this.escapeHtml(headerTitle)}
          </h1>
          <p class="page-subtitle">${items.length} entry(ies) · Total: PKR ${this.fmt(total)} ${folder && folder.description ? '· ' + this.escapeHtml(folder.description) : ''}</p>
        </div>
        <div class="flex gap-2">
          ${folder ? `<button onclick="App.showSideExpenseFolderEditor(${folder.id})" class="btn btn-secondary"><i class="fas fa-edit"></i> Edit Folder</button>` : ''}
          <button onclick="App.showSideExpenseEditor(null, ${folderId || 'null'})" class="btn btn-primary"><i class="fas fa-plus"></i> Add Expense</button>
        </div>
      </div>
      <div class="p-4 md:p-6 space-y-5">
        <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
          <div class="stat-card"><p class="text-xs text-gray-500">Entries</p><p class="text-xl font-bold text-blue-600">${items.length}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">Folder Total</p><p class="text-xl font-bold text-red-600">PKR ${this.fmt(total)}</p></div>
          <div class="stat-card"><p class="text-xs text-gray-500">This Month</p><p class="text-xl font-bold text-orange-600">PKR ${this.fmt(monthTotal)}</p></div>
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
                <i class="fas fa-money-bill-wave text-3xl mb-2 block"></i>No expenses in this folder yet.</td></tr>` :
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

  // ----- Folder editor (Add / Edit folder) -----
  showSideExpenseFolderEditor(id = null) {
    const folders = this.state.sideExpenseFolders || [];
    const f = id ? folders.find(x => x.id === id) : { name:'', icon:'fa-folder', color:'#ef4444', description:'', sort_order: 0 };
    if (id && !f) return;
    const iconOptions = ['fa-folder','fa-bolt','fa-utensils','fa-truck','fa-tools','fa-receipt','fa-fire','fa-tint','fa-wifi','fa-car','fa-shopping-cart','fa-briefcase','fa-gift','fa-medkit','fa-graduation-cap'];
    const colorOptions = ['#ef4444','#f59e0b','#10b981','#3b82f6','#8b5cf6','#ec4899','#6b7280','#0ea5e9','#14b8a6'];
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-folder text-red-500 mr-2"></i>${id ? 'Edit' : 'New'} Expense Folder</h2>
      <form id="sef-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Folder Name <span class="text-red-500">*</span></label>
          <input id="sef-name" type="text" class="input-field" value="${this.escapeAttr(f.name || '')}" placeholder="e.g., Utility Bills, Workers Food" required></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Description (optional)</label>
          <input id="sef-desc" type="text" class="input-field" value="${this.escapeAttr(f.description || '')}" placeholder="e.g., Gas, electricity, water bills"></div>
        <div>
          <label class="block text-sm font-medium mb-1">Icon</label>
          <div class="flex flex-wrap gap-2">
            ${iconOptions.map(ic => `
              <label class="cursor-pointer">
                <input type="radio" name="sef-icon" value="${ic}" ${f.icon === ic ? 'checked' : ''} class="sef-icon-radio hidden">
                <span class="w-9 h-9 rounded-lg border-2 flex items-center justify-center transition" data-icon-box="${ic}" style="border-color:${f.icon === ic ? '#3b82f6' : '#e5e7eb'};">
                  <i class="fas ${ic}"></i>
                </span>
              </label>`).join('')}
          </div>
        </div>
        <div>
          <label class="block text-sm font-medium mb-1">Color</label>
          <div class="flex flex-wrap gap-2">
            ${colorOptions.map(c => `
              <label class="cursor-pointer">
                <input type="radio" name="sef-color" value="${c}" ${f.color === c ? 'checked' : ''} class="sef-color-radio hidden">
                <span class="w-9 h-9 rounded-lg border-2 flex items-center justify-center transition" data-color-box="${c}" style="background:${c}; border-color:${f.color === c ? '#1f2937' : '#e5e7eb'};">
                  ${f.color === c ? '<i class="fas fa-check text-white"></i>' : ''}
                </span>
              </label>`).join('')}
          </div>
        </div>
        <div class="md:col-span-2 flex gap-2 justify-end pt-2 border-t">
          ${id ? `<button type="button" class="btn btn-danger mr-auto" onclick="App.deleteSideExpenseFolder(${id})"><i class="fas fa-trash"></i> Delete Folder</button>` : ''}
          <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
          <button type="submit" class="btn btn-primary"><i class="fas fa-save"></i> Save</button>
        </div>
      </form>`, 'modal-lg');
    // Wire icon/color visual selection
    document.querySelectorAll('.sef-icon-radio').forEach(r => {
      r.addEventListener('change', () => {
        document.querySelectorAll('[data-icon-box]').forEach(b => b.style.borderColor = '#e5e7eb');
        const box = document.querySelector(`[data-icon-box="${r.value}"]`);
        if (box) box.style.borderColor = '#3b82f6';
      });
    });
    document.querySelectorAll('.sef-color-radio').forEach(r => {
      r.addEventListener('change', () => {
        document.querySelectorAll('[data-color-box]').forEach(b => { b.style.borderColor = '#e5e7eb'; b.innerHTML = ''; });
        const box = document.querySelector(`[data-color-box="${r.value}"]`);
        if (box) { box.style.borderColor = '#1f2937'; box.innerHTML = '<i class="fas fa-check text-white"></i>'; }
      });
    });
    document.getElementById('sef-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const name = document.getElementById('sef-name').value.trim();
      if (!name) { this.toast('Folder name required', 'error'); return; }
      const iconRadio = document.querySelector('.sef-icon-radio:checked');
      const colorRadio = document.querySelector('.sef-color-radio:checked');
      const payload = {
        name,
        icon: iconRadio ? iconRadio.value : (f.icon || 'fa-folder'),
        color: colorRadio ? colorRadio.value : (f.color || '#ef4444'),
        description: document.getElementById('sef-desc').value,
        sort_order: f.sort_order || 0
      };
      try {
        if (id) await this.api.put(`/api/side-expense-folders/${id}`, payload);
        else await this.api.post('/api/side-expense-folders', payload);
        this.closeModal();
        await this.showSideExpenses(this.state.currentSideExpenseFolderId);
        this.toast('Folder saved', 'success');
      } catch (err) { this.toast('Failed to save folder', 'error'); }
    });
  },

  async deleteSideExpenseFolder(id) {
    if (!confirm('Delete this folder? Expenses inside it will be moved to "Uncategorized" (not deleted).')) return;
    try {
      await this.api.delete(`/api/side-expense-folders/${id}`);
      this.closeModal();
      await this.showSideExpenses();
      this.toast('Folder deleted', 'success');
    } catch (e) { this.toast('Failed to delete folder', 'error'); }
  },

  // ----- Expense editor (Add / Edit individual expense) -----
  showSideExpenseEditor(id = null, defaultFolderId = null) {
    const it = id ? this.state.sideExpenses.find(x => x.id === id)
                  : { entry_date: new Date().toISOString().slice(0,10), category:'', description:'', amount:0, paid_to:'', notes:'', folder_id: defaultFolderId };
    if (id && !it) return;
    // Ensure folders are loaded
    const folders = this.state.sideExpenseFolders || [];
    const currentFolderId = it.folder_id || (defaultFolderId && defaultFolderId !== 0 ? defaultFolderId : '');
    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-money-bill-wave text-red-500 mr-2"></i>${id ? 'Edit' : 'Add'} Side Expense</h2>
      <form id="se-form" class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="block text-sm font-medium mb-1">Date</label><input id="se-date" type="date" class="input-field" value="${it.entry_date || ''}"></div>
        <div><label class="block text-sm font-medium mb-1">Folder / Ledger</label>
          <select id="se-folder" class="input-field">
            <option value="">— Uncategorized —</option>
            ${folders.map(f => `<option value="${f.id}" ${String(currentFolderId) === String(f.id) ? 'selected' : ''}>${this.escapeHtml(f.name)}</option>`).join('')}
          </select>
        </div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Category / Sub-Type</label>
          <input id="se-cat" type="text" list="se-cat-list" class="input-field" value="${this.escapeAttr(it.category || '')}" placeholder="e.g., Gas, Electricity, Water, Internet">
          <datalist id="se-cat-list">
            <option value="Gas"><option value="Electricity"><option value="Water"><option value="Internet"><option value="Workers Food"><option value="Travel"><option value="Repairs"><option value="Stationary"><option value="Tea/Snacks"><option value="Misc">
          </datalist></div>
        <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Description</label><input id="se-desc" type="text" class="input-field" value="${this.escapeAttr(it.description || '')}"></div>
        <div><label class="block text-sm font-medium mb-1">Amount (PKR)</label><input id="se-amt" type="number" step="any" class="input-field" value="${it.amount || 0}"></div>
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
      const folderVal = document.getElementById('se-folder').value;
      const payload = {
        entry_date: document.getElementById('se-date').value,
        category: document.getElementById('se-cat').value,
        description: document.getElementById('se-desc').value,
        amount: parseFloat(document.getElementById('se-amt').value) || 0,
        paid_to: document.getElementById('se-to').value,
        notes: document.getElementById('se-notes').value,
        folder_id: folderVal ? parseInt(folderVal) : null
      };
      try {
        if (id) await this.api.put(`/api/side-expenses/${id}`, payload);
        else await this.api.post('/api/side-expenses', payload);
        this.closeModal();
        await this.showSideExpenses(this.state.currentSideExpenseFolderId);
        this.toast('Saved', 'success');
      } catch (err) { this.toast('Failed', 'error'); }
    });
  },

  async deleteSideExpense(id) {
    if (!confirm('Delete this expense?')) return;
    try {
      await this.api.delete(`/api/side-expenses/${id}`);
      this.closeModal();
      await this.showSideExpenses(this.state.currentSideExpenseFolderId);
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
               class="input-field" value="${this.escapeAttr(data[c.key] || '')}" ${c.type === 'number' ? 'step="any"' : ''}>
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
    } else items = [{ product_id: null, product_name: '', quantity: 1, rate: 0, total: 0, manufacturing_cost: 0 }];
    // Hydrate manufacturing_cost from inventory snapshot (for editing existing bills, server already returns it via bill_items)
    items = items.map(it => {
      if (it.manufacturing_cost === undefined || it.manufacturing_cost === null) {
        const inv = it.product_id ? this.state.inventory.find(p => p.id === it.product_id) : null;
        it.manufacturing_cost = inv ? (parseFloat(inv.manufacturing_cost) || 0) : 0;
      }
      return it;
    });
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
        <div>
          <label class="block text-sm font-medium mb-1">Notes</label>
          <textarea id="b-notes" class="input-field" rows="2">${editing ? this.escapeHtml(editing.notes || '') : ''}</textarea>
          <div class="mt-3 bg-green-50 border border-green-200 rounded-lg p-3" title="Internal only — never shown on the bill">
            <div class="text-xs text-green-800 font-semibold mb-1"><i class="fas fa-eye-slash mr-1"></i>Internal: Net Profit (will NOT appear on the bill)</div>
            <div class="flex justify-between items-center">
              <span class="text-xs text-gray-600">Total Mfg. Cost:</span>
              <span id="b-mfg-total" class="font-semibold text-orange-700 text-sm">PKR 0.00</span>
            </div>
            <div class="flex justify-between items-center mt-1">
              <span class="text-sm font-bold text-green-800">Net Profit:</span>
              <span id="b-net-profit" class="font-extrabold text-green-700 text-base">PKR 0.00</span>
            </div>
            <p class="text-xs text-gray-500 mt-1">= Σ (Selling Rate − Mfg. Cost) × Qty. Auto-fed to Dashboard & Calendar.</p>
          </div>
        </div>
        <div class="space-y-2">
          <div class="flex justify-between items-center"><label class="text-sm">Subtotal:</label><span id="b-subtotal" class="font-bold">PKR 0.00</span></div>
          <div class="flex justify-between items-center"><label class="text-sm">Discount:</label>
            <input id="b-discount" type="number" step="any" min="0" class="input-field" style="width:140px;" value="${editing ? parseFloat(editing.discount) || 0 : 0}" oninput="App._calcBill()"></div>
          <div class="flex justify-between items-center"><label class="text-sm">Tax %:</label>
            <input id="b-tax" type="number" step="any" min="0" class="input-field" style="width:140px;" value="${editing ? parseFloat(editing.tax) || 0 : 0}" oninput="App._calcBill()"></div>
          <div class="flex justify-between items-center pt-2 border-t"><label class="text-sm font-bold">Total:</label><span id="b-total" class="font-bold text-lg amount-running">PKR 0.00</span></div>
          <div class="flex justify-between items-center"><label class="text-sm">Paid:</label>
            <input id="b-paid" type="number" step="any" min="0" class="input-field" style="width:140px;" value="${editing ? parseFloat(editing.paid) || 0 : 0}" oninput="App._calcBill()"></div>
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
        <td><input type="number" step="any" min="0" value="${parseFloat(it.quantity) || 0}" oninput="App._updateBillRow(${i}, 'quantity', parseFloat(this.value)||0)"></td>
        <td><input type="text" list="bill-product-list" value="${this.escapeAttr(it.product_name || '')}"
                 oninput="App._updateBillProductName(${i}, this.value)" onchange="App._matchBillProduct(${i}, this.value)" placeholder="Type or pick product"></td>
        <td><input type="number" step="any" min="0" value="${parseFloat(it.rate) || 0}" oninput="App._updateBillRow(${i}, 'rate', parseFloat(this.value)||0)"></td>
        <td class="text-right font-bold amount-running">PKR ${this.fmt((parseFloat(it.quantity)||0) * (parseFloat(it.rate)||0))}</td>
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
      this._billItems[i].manufacturing_cost = parseFloat(inv.manufacturing_cost) || 0;
      this._billItems[i].total = (parseFloat(this._billItems[i].quantity) || 0) * this._billItems[i].rate;
      this._renderBillItems();
      this._calcBill();
    } else {
      this._billItems[i].product_id = null;
      this._billItems[i].product_name = value;
      this._billItems[i].manufacturing_cost = 0;
    }
  },
  _calcBill() {
    const subtotal = this._billItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)), 0);
    const mfgTotal = this._billItems.reduce((s, it) => s + ((parseFloat(it.quantity) || 0) * (parseFloat(it.manufacturing_cost) || 0)), 0);
    const netProfit = this._billItems.reduce((s, it) => {
      const q = parseFloat(it.quantity) || 0;
      const r = parseFloat(it.rate) || 0;
      const m = parseFloat(it.manufacturing_cost) || 0;
      return s + (r - m) * q;
    }, 0);
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
    const mfgEl = document.getElementById('b-mfg-total');
    const npEl = document.getElementById('b-net-profit');
    if (subEl) subEl.textContent = 'PKR ' + this.fmt(subtotal);
    if (totEl) totEl.textContent = 'PKR ' + this.fmt(total);
    if (dueEl) dueEl.textContent = 'PKR ' + this.fmt(due);
    if (mfgEl) mfgEl.textContent = 'PKR ' + this.fmt(mfgTotal);
    if (npEl) {
      npEl.textContent = 'PKR ' + this.fmt(netProfit);
      npEl.className = 'font-extrabold text-base ' + (netProfit >= 0 ? 'text-green-700' : 'text-red-700');
    }
  },

  async _saveBill(billId, alsoPrint) {
    const billNo = document.getElementById('b-no').value.trim();
    if (!billNo) { this.toast('Bill No required', 'error'); return; }
    if (!this.validateBillNo(billNo)) return;
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
    const matched = this.state.allClients.find(c => c.name === customerName);
    const payload = {
      bill_no: billNo, bill_date: billDate,
      client_id: matched ? matched.id : null,
      customer_name: customerName, customer_phone: phone, customer_address: address,
      subtotal, discount, tax: taxPct, total, paid, notes, status,
      items: this._billItems.map(it => ({
        product_id: it.product_id || null, product_name: it.product_name || '',
        quantity: parseFloat(it.quantity) || 0, rate: parseFloat(it.rate) || 0,
        manufacturing_cost: parseFloat(it.manufacturing_cost) || 0,
        total: (parseFloat(it.quantity) || 0) * (parseFloat(it.rate) || 0)
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
              ${b.bill_address ? `<p><i class="fas fa-map-marker-alt mr-1"></i>${this.escapeHtml(b.bill_address)}</p>` : ''}
              ${b.bill_phone ? `<p><i class="fas fa-phone mr-1"></i>${this.escapeHtml(b.bill_phone)}</p>` : ''}
              ${b.bill_email ? `<p><i class="fas fa-envelope mr-1"></i>${this.escapeHtml(b.bill_email)}</p>` : ''}
              ${b.bill_website ? `<p><i class="fas fa-globe mr-1"></i>${this.escapeHtml(b.bill_website)}</p>` : ''}
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

              <div class="md:col-span-2 bg-purple-50 border border-purple-200 rounded-lg p-3">
                <label class="block text-sm font-bold mb-2 text-purple-900"><i class="fas fa-file-invoice mr-2"></i>Bill / Invoice Template — Contact Details</label>
                <p class="text-xs text-purple-700 mb-3">These fields appear at the top of every printed bill. Leave any blank to hide it from the bill.</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div><label class="block text-sm font-medium mb-1"><i class="fas fa-phone text-blue-500 mr-1"></i>Number</label>
                    <input id="br-phone" type="text" class="input-field" value="${this.escapeAttr(b.bill_phone)}" placeholder="e.g. +92 300 1234567"></div>
                  <div><label class="block text-sm font-medium mb-1"><i class="fas fa-envelope text-red-500 mr-1"></i>Gmail / Email</label>
                    <input id="br-email" type="email" class="input-field" value="${this.escapeAttr(b.bill_email || '')}" placeholder="e.g. yourbusiness@gmail.com"></div>
                  <div><label class="block text-sm font-medium mb-1"><i class="fas fa-globe text-green-500 mr-1"></i>Website</label>
                    <input id="br-website" type="text" class="input-field" value="${this.escapeAttr(b.bill_website || '')}" placeholder="e.g. www.yourbusiness.com"></div>
                  <div><label class="block text-sm font-medium mb-1"><i class="fas fa-map-marker-alt text-orange-500 mr-1"></i>Address</label>
                    <input id="br-addr" type="text" class="input-field" value="${this.escapeAttr(b.bill_address)}" placeholder="e.g. Plot 12, Industrial Area, City"></div>
                </div>
              </div>
              <div class="md:col-span-2"><label class="block text-sm font-medium mb-1">Bill Footer Text</label><input id="br-footer" type="text" class="input-field" value="${this.escapeAttr(b.bill_footer)}" placeholder="Thank you for your business!"></div>
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
      bill_email: document.getElementById('br-email')?.value || '',
      bill_website: document.getElementById('br-website')?.value || '',
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
  escapeAttr(s) { return this.escapeHtml(s); },

  // ========= CALENDAR WIDGET =========
  // Shared monthly calendar state. Key by container id so dashboard & employee can have separate cals.
  _cal: {},

  async renderCalendar(containerId, opts = {}) {
    // opts: { employeeId, month (YYYY-MM) }
    const cur = this._cal[containerId] || {};
    const month = opts.month || cur.month || new Date().toISOString().slice(0, 7);
    // IMPORTANT: preserve the previous state (especially `expanded`) instead of
    // replacing the whole object — otherwise the "View Days" toggle is lost on re-render.
    this._cal[containerId] = {
      ...cur,
      month,
      employeeId: opts.employeeId || cur.employeeId || null
    };

    const url = opts.employeeId
      ? `/api/calendar?month=${month}&employee_id=${opts.employeeId}`
      : `/api/calendar?month=${month}`;
    let data;
    try { data = await this.api.get(url); } catch (e) { return; }
    this._cal[containerId].data = data;

    const container = document.getElementById(containerId);
    if (!container) return;

    const isEmployee = data.type === 'employee';
    const [yy, mm] = month.split('-').map(Number);
    const monthName = new Date(yy, mm - 1, 1).toLocaleString('en-US', { month: 'long', year: 'numeric' });
    const firstDow = new Date(yy, mm - 1, 1).getDay(); // 0=Sun
    const lastDay = new Date(yy, mm, 0).getDate();
    const todayStr = new Date().toISOString().slice(0, 10);

    // Index daily by date
    const byDate = {};
    (data.daily || []).forEach(d => { byDate[d.date] = d; });

    // Build cells: leading empty + days. COMPACT design — each day is a small
    // square showing only the day number + tiny colored dots (no text clutter).
    const cells = [];
    for (let i = 0; i < firstDow; i++) cells.push(`<div class="cal-cell empty"></div>`);
    for (let day = 1; day <= lastDay; day++) {
      const dStr = `${month}-${String(day).padStart(2, '0')}`;
      const info = byDate[dStr];
      const isToday = dStr === todayStr;
      let dots = '';
      let hasData = false, hasExpense = false;
      if (info) {
        if (isEmployee) {
          if (info.salary_paid > 0) { dots += `<span class="cal-dot d-sal" title="Salary Paid: ${this.fmt(info.salary_paid)}"></span>`; hasData = true; }
          if (info.advance > 0)     { dots += `<span class="cal-dot d-adv" title="Advance: ${this.fmt(info.advance)}"></span>`; hasData = true; }
        } else {
          if (info.net_profit > 0)      { dots += `<span class="cal-dot d-profit" title="Net Profit: ${this.fmt(info.net_profit)}"></span>`; hasData = true; }
          else if (info.net_profit < 0) { dots += `<span class="cal-dot d-exp" title="Net Loss: ${this.fmt(info.net_profit)}"></span>`; hasData = true; hasExpense = true; }
          if (info.received > 0)     { dots += `<span class="cal-dot d-rec" title="Received: ${this.fmt(info.received)}"></span>`; hasData = true; }
          if (info.bills_count > 0)  { dots += `<span class="cal-dot d-bills" title="${info.bills_count} bill(s)"></span>`; hasData = true; }
          if (info.expenses > 0)     { dots += `<span class="cal-dot d-exp" title="Expenses: ${this.fmt(info.expenses)}"></span>`; hasData = true; hasExpense = true; }
        }
      }
      const cls = `cal-cell ${hasData ? 'has-data' : ''} ${isToday ? 'today' : ''}`;
      cells.push(`<div class="${cls}" onclick="App.showCalendarDay('${containerId}','${dStr}')" title="${dStr}">
        <span class="cal-day-num">${day}</span><span class="cal-dots">${dots}</span>
      </div>`);
    }

    const t = data.totals || {};
    // Compact single-line summary chips (always visible — this is the main view).
    const chips = isEmployee
      ? `<span class="cal-chip"><b class="amount-received">PKR ${this.fmt(t.salary_paid || 0)}</b><i>Salary Paid</i></span>
         <span class="cal-chip"><b class="amount-pending">PKR ${this.fmt(t.advance || 0)}</b><i>Advance</i></span>`
      : `<span class="cal-chip ${(t.net_profit||0) >= 0 ? 'chip-profit' : 'chip-loss'}"><b>PKR ${this.fmt(t.net_profit || 0)}</b><i>Net Profit</i></span>
         <span class="cal-chip"><b class="amount-received">PKR ${this.fmt(t.received || 0)}</b><i>Received</i></span>
         <span class="cal-chip"><b class="text-purple-600">${t.bills_count || 0}</b><i>Bills</i></span>
         <span class="cal-chip"><b class="text-blue-600">PKR ${this.fmt(t.salary_paid || 0)}</b><i>Salary</i></span>
         <span class="cal-chip"><b class="text-red-600">PKR ${this.fmt(t.expenses || 0)}</b><i>Expenses</i></span>`;

    // Grid visibility persists per container (default collapsed = compact).
    const expanded = !!this._cal[containerId].expanded;

    container.innerHTML = `
      <div class="cal-wrap cal-mini">
        <div class="cal-bar">
          <div class="cal-bar-left">
            <button class="cal-arrow" onclick="App.calMove('${containerId}', -1)" title="Previous Month"><i class="fas fa-chevron-left"></i></button>
            <span class="cal-month-label"><i class="fas fa-calendar-days text-blue-500 mr-1"></i>${monthName}</span>
            <button class="cal-arrow" onclick="App.calMove('${containerId}', 1)" title="Next Month"><i class="fas fa-chevron-right"></i></button>
            <button class="cal-today-btn" onclick="App.calMove('${containerId}', 0)">Today</button>
          </div>
          <button class="cal-toggle" onclick="App.calToggleGrid('${containerId}')">
            <i class="fas fa-${expanded ? 'chevron-up' : 'calendar-alt'}"></i> ${expanded ? 'Hide' : 'View Days'}
          </button>
        </div>
        <div class="cal-chips">${chips}</div>
        <div class="cal-grid-wrap" style="${expanded ? '' : 'display:none;'}">
          <div class="cal-grid">
            ${['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => `<div class="cal-dow">${d}</div>`).join('')}
            ${cells.join('')}
          </div>
          <div class="cal-legend">
            ${isEmployee
              ? '<span><i class="cal-dot d-sal"></i>Salary</span><span><i class="cal-dot d-adv"></i>Advance</span>'
              : '<span><i class="cal-dot d-profit"></i>Profit</span><span><i class="cal-dot d-rec"></i>Received</span><span><i class="cal-dot d-bills"></i>Bills</span><span><i class="cal-dot d-exp"></i>Expense</span>'}
            <span class="cal-legend-hint">Kisi din par tap karein details ke liye</span>
          </div>
        </div>
      </div>`;
  },

  calToggleGrid(containerId) {
    const cur = this._cal[containerId];
    if (!cur) return;
    cur.expanded = !cur.expanded;
    this.renderCalendar(containerId, { month: cur.month, employeeId: cur.employeeId });
  },

  fmtCompact(n) {
    n = parseFloat(n) || 0;
    if (n >= 100000) return (n / 1000).toFixed(0) + 'k';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return Math.round(n).toString();
  },

  async calMove(containerId, dir) {
    const cur = this._cal[containerId];
    if (!cur) return;
    let month = cur.month;
    if (dir === 0) {
      month = new Date().toISOString().slice(0, 7);
    } else {
      const [y, m] = month.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      month = d.toISOString().slice(0, 7);
    }
    await this.renderCalendar(containerId, { month, employeeId: cur.employeeId });
  },

  showCalendarDay(containerId, dateStr) {
    const cur = this._cal[containerId];
    if (!cur || !cur.data) return;
    const info = (cur.data.daily || []).find(d => d.date === dateStr);
    const isEmployee = cur.data.type === 'employee';
    const friendly = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    let body = '<p class="text-gray-500 text-center py-4">No activity on this day.</p>';
    if (info) {
      if (isEmployee) {
        body = `
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-money-check-alt text-blue-500 mr-2"></i>Salary Paid</span><span class="val amount-received">PKR ${this.fmt(info.salary_paid || 0)}</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-hand-holding-usd text-orange-500 mr-2"></i>Advance</span><span class="val amount-pending">PKR ${this.fmt(info.advance || 0)}</span></div>`;
      } else {
        const np = info.net_profit || 0;
        body = `
          <div class="cal-detail-row" style="background:#ecfdf5; border-radius:6px;"><span class="lbl"><i class="fas fa-chart-line text-green-600 mr-2"></i><strong>Net Profit</strong></span><span class="val ${np >= 0 ? 'text-green-700' : 'text-red-700'}" style="font-size:1.05rem;">PKR ${this.fmt(np)}</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-arrow-down text-green-500 mr-2"></i>Total Received</span><span class="val amount-received">PKR ${this.fmt(info.received || 0)}</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-file-invoice text-purple-500 mr-2"></i>Bills Created</span><span class="val text-purple-600">${info.bills_count || 0} (PKR ${this.fmt(info.bills_total || 0)})</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-money-check-alt text-blue-500 mr-2"></i>Salary Paid</span><span class="val text-blue-600">PKR ${this.fmt(info.salary_paid || 0)}</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-hand-holding-usd text-orange-500 mr-2"></i>Advance Paid</span><span class="val text-orange-600">PKR ${this.fmt(info.advance || 0)}</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-money-bill-wave text-red-500 mr-2"></i>Side Expenses</span><span class="val text-red-600">PKR ${this.fmt(info.expenses || 0)}</span></div>
          <div class="cal-detail-row"><span class="lbl"><i class="fas fa-list text-gray-500 mr-2"></i>Ledger Entries</span><span class="val">${info.tx_count || 0}</span></div>`;
      }
    }
    this.openModal(`
      <h2 class="text-xl font-bold mb-3"><i class="fas fa-calendar-day text-blue-500 mr-2"></i>${friendly}</h2>
      <div class="bg-gray-50 rounded-lg p-2 mb-3">${body}</div>
      <div class="flex justify-end pt-2 border-t">
        <button class="btn btn-secondary" onclick="App.closeModal()">Close</button>
      </div>
    `);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
document.addEventListener('click', (e) => {
  if (!e.target.closest('#user-dropdown')) {
    const d = document.getElementById('user-dropdown');
    if (d) d.classList.remove('open');
  }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') App.closeModal(); });
