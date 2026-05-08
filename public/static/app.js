// CRM Frontend Application
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
    view: 'dashboard' // 'dashboard' | 'ledger'
  },

  // ========== API Helpers ==========
  api: {
    async req(method, url, body) {
      const opts = { method, headers: { 'Content-Type': 'application/json' }, credentials: 'include' };
      if (body) opts.body = JSON.stringify(body);
      const res = await fetch(url, opts);
      if (res.status === 401) {
        App.state.authenticated = false;
        App.renderLogin();
        throw new Error('Unauthorized');
      }
      return res.json();
    },
    get(url) { return this.req('GET', url); },
    post(url, body) { return this.req('POST', url, body); },
    put(url, body) { return this.req('PUT', url, body); },
    delete(url) { return this.req('DELETE', url); }
  },

  // ========== Toast ==========
  toast(msg, type = 'info') {
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'} mr-2"></i>${msg}`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 3000);
  },

  // ========== Init ==========
  async init() {
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

  // ========== Login Screen ==========
  renderLogin() {
    document.getElementById('app').innerHTML = `
      <div class="login-container">
        <div class="login-box">
          <div class="text-center mb-6">
            <div class="inline-block p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4">
              <i class="fas fa-briefcase text-white text-3xl"></i>
            </div>
            <h1 class="text-2xl font-bold text-gray-800">CRM System</h1>
            <p class="text-gray-500 text-sm mt-1">Muhammad Uzair - Company CRM</p>
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

  // ========== Main App Layout ==========
  renderApp() {
    document.getElementById('app').innerHTML = `
      <div class="sidebar" id="sidebar">
        <div class="p-4 border-b border-white/10">
          <div class="flex items-center justify-between">
            <div>
              <h1 class="text-lg font-bold flex items-center gap-2">
                <i class="fas fa-briefcase text-blue-400"></i> CRM
              </h1>
              <p class="text-xs text-gray-400 mt-1">Welcome, ${this.state.username}</p>
            </div>
            <div class="dropdown" id="user-dropdown">
              <button onclick="App.toggleDropdown()" class="text-gray-300 hover:text-white p-2">
                <i class="fas fa-ellipsis-v"></i>
              </button>
              <div class="dropdown-content">
                <a href="#" onclick="App.showChangePassword(); return false;"><i class="fas fa-key mr-2"></i>Change Password</a>
                <a href="#" onclick="App.logout(); return false;"><i class="fas fa-sign-out-alt mr-2"></i>Logout</a>
              </div>
            </div>
          </div>
        </div>

        <div class="p-3">
          <button onclick="App.showDashboard()" class="folder-item w-full flex items-center gap-3 px-3 py-2.5 mb-2 text-left ${this.state.view === 'dashboard' ? 'active' : ''}" id="dashboard-btn">
            <i class="fas fa-chart-line text-purple-400"></i>
            <span class="font-medium">Dashboard</span>
          </button>
        </div>

        <div class="px-3 pb-2 flex items-center justify-between">
          <span class="text-xs uppercase font-semibold text-gray-400 tracking-wider">Folders</span>
          <button onclick="App.showAddFolder()" class="text-blue-400 hover:text-blue-300" title="Add Folder">
            <i class="fas fa-plus-circle"></i>
          </button>
        </div>

        <div id="folders-list" class="px-3 pb-4"></div>
      </div>

      <div class="main-content">
        <div id="content-area"></div>
      </div>
    `;
    this.renderFolders();
  },

  // ========== Folders ==========
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
      list.innerHTML = '<p class="text-gray-500 text-sm px-3 py-2">No folders. Click + to add.</p>';
      return;
    }
    list.innerHTML = this.state.folders.map(f => {
      const isActive = this.state.currentFolderId === f.id && this.state.view !== 'dashboard';
      const isExpanded = this.state.currentFolderId === f.id;
      const clientsHtml = isExpanded && this.state.clients.length > 0
        ? this.state.clients.map(c => `
            <div class="client-item flex items-center gap-2 px-3 py-2 my-1 text-sm ${this.state.currentClientId === c.id ? 'active' : ''}"
                 onclick="App.openClient(${c.id})">
              <i class="fas fa-user text-gray-400 text-xs"></i>
              <span class="flex-1 truncate">${this.escapeHtml(c.name)}</span>
            </div>
          `).join('')
        : '';

      return `
        <div class="mb-1">
          <div class="folder-item flex items-center gap-3 px-3 py-2 ${isActive ? 'active' : ''}" 
               onclick="App.openFolder(${f.id})">
            <i class="fas ${f.icon || 'fa-folder'}" style="color: ${f.color || '#3b82f6'}"></i>
            <span class="flex-1 truncate font-medium">${this.escapeHtml(f.name)}</span>
            <span class="text-xs text-gray-400">${f.client_count || 0}</span>
            <button onclick="event.stopPropagation(); App.editFolder(${f.id})" class="text-gray-400 hover:text-white" title="Edit">
              <i class="fas fa-pen text-xs"></i>
            </button>
          </div>
          <div class="ml-2">${clientsHtml}</div>
          ${isExpanded ? `
            <button onclick="App.showAddClient(${f.id})" class="text-blue-400 hover:text-blue-300 text-xs ml-10 mt-1 mb-2">
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
          <input id="f-name" type="text" required class="input-field" value="${this.escapeHtml(folder.name)}">
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

  // ========== Clients ==========
  async openFolder(folderId) {
    this.state.currentFolderId = folderId;
    this.state.view = 'folder';
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
      <div class="bg-white shadow-sm border-b px-6 py-4">
        <div class="flex items-center justify-between">
          <div>
            <h1 class="text-2xl font-bold text-gray-800 flex items-center gap-3">
              <i class="fas ${folder.icon}" style="color: ${folder.color}"></i>
              ${this.escapeHtml(folder.name)}
            </h1>
            <p class="text-sm text-gray-500 mt-1">${this.state.clients.length} client(s)</p>
          </div>
          <button onclick="App.showAddClient(${folder.id})" class="btn btn-primary">
            <i class="fas fa-user-plus"></i> Add Client
          </button>
        </div>
      </div>
      <div class="p-6">
        ${this.state.clients.length === 0 ? `
          <div class="bg-white rounded-xl p-12 text-center text-gray-500">
            <i class="fas fa-user-friends text-5xl mb-4 text-gray-300"></i>
            <p class="text-lg mb-2">No clients yet</p>
            <p class="text-sm">Click "Add Client" to add one</p>
          </div>
        ` : `
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${this.state.clients.map(c => `
              <div class="stat-card cursor-pointer" onclick="App.openClient(${c.id})">
                <div class="flex items-start justify-between">
                  <div class="flex-1">
                    <h3 class="font-bold text-gray-800 text-lg">${this.escapeHtml(c.name)}</h3>
                    ${c.phone ? `<p class="text-sm text-gray-500 mt-1"><i class="fas fa-phone mr-1"></i>${this.escapeHtml(c.phone)}</p>` : ''}
                    ${c.email ? `<p class="text-sm text-gray-500"><i class="fas fa-envelope mr-1"></i>${this.escapeHtml(c.email)}</p>` : ''}
                  </div>
                  <i class="fas fa-arrow-right text-blue-500"></i>
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

  // ========== Client Ledger ==========
  async openClient(clientId) {
    this.state.currentClientId = clientId;
    this.state.view = 'ledger';
    try {
      const cdata = await this.api.get(`/api/clients/${clientId}`);
      this.state.currentClient = cdata.client;
      this.state.customColumns = cdata.custom_columns || [];
      const tdata = await this.api.get(`/api/clients/${clientId}/transactions`);
      this.state.transactions = tdata.transactions || [];
      // Make sure folder is expanded
      this.state.currentFolderId = cdata.client.folder_id;
      const fdata = await this.api.get(`/api/folders/${cdata.client.folder_id}/clients`);
      this.state.clients = fdata.clients || [];
      this.renderFolders();
      this.renderLedger();
    } catch (e) { console.error(e); }
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

    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="bg-white shadow-sm border-b px-6 py-4">
        <div class="flex items-center justify-between flex-wrap gap-3">
          <div>
            <div class="text-sm text-gray-500"><a href="#" onclick="App.openFolder(${folder.id}); return false;" class="hover:text-blue-500"><i class="fas ${folder.icon} mr-1"></i>${this.escapeHtml(folder.name)}</a></div>
            <h1 class="text-2xl font-bold text-gray-800">${this.escapeHtml(c.name)}</h1>
            <div class="text-sm text-gray-500 mt-1">
              ${c.phone ? `<span class="mr-3"><i class="fas fa-phone mr-1"></i>${this.escapeHtml(c.phone)}</span>` : ''}
              ${c.email ? `<span class="mr-3"><i class="fas fa-envelope mr-1"></i>${this.escapeHtml(c.email)}</span>` : ''}
            </div>
          </div>
          <div class="flex gap-2">
            <button onclick="App.showEditClient()" class="btn btn-secondary"><i class="fas fa-edit"></i> Edit</button>
            <button onclick="App.showCustomColumns()" class="btn btn-secondary"><i class="fas fa-columns"></i> Columns</button>
            <button onclick="App.deleteClient()" class="btn btn-danger"><i class="fas fa-trash"></i></button>
          </div>
        </div>
      </div>

      <div class="p-6 space-y-6">
        <!-- Summary boxes -->
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div class="stat-card">
            <p class="text-sm text-gray-500">Opening Balance</p>
            <p class="text-2xl font-bold text-gray-800">PKR ${this.fmt(opening)}</p>
          </div>
          <div class="stat-card">
            <p class="text-sm text-gray-500">Total Received</p>
            <p class="text-2xl font-bold text-green-600">PKR ${this.fmt(totalReceived)}</p>
          </div>
          <div class="stat-card">
            <p class="text-sm text-gray-500">Total Pending</p>
            <p class="text-2xl font-bold text-orange-600">PKR ${this.fmt(totalPending)}</p>
          </div>
          <div class="balance-box">
            <p class="text-sm opacity-90">Net Balance Due</p>
            <p class="text-3xl font-bold mt-1">PKR ${this.fmt(netBalance)}</p>
            <p class="text-xs opacity-80 mt-1">${netBalance > 0 ? 'Client owes you' : netBalance < 0 ? 'You owe client' : 'Settled'}</p>
          </div>
        </div>

        <!-- Ledger table -->
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          <div class="px-4 py-3 border-b flex items-center justify-between flex-wrap gap-2">
            <h2 class="font-bold text-gray-800"><i class="fas fa-book mr-2"></i>Khata / Ledger</h2>
            <button onclick="App.addRow()" class="btn btn-success btn-sm" style="padding: 0.4rem 0.8rem;">
              <i class="fas fa-plus"></i> Add Row
            </button>
          </div>
          <div class="overflow-x-auto">
            <table class="ledger-table" id="ledger-table">
              <thead>
                <tr>
                  <th style="width:40px;">#</th>
                  <th style="width:140px;">Date</th>
                  <th style="width:120px;">Bill No</th>
                  <th style="width:140px;">Amount Received</th>
                  <th style="width:140px;">Amount Pending</th>
                  <th style="width:130px;">Status</th>
                  <th>Description</th>
                  ${this.state.customColumns.map(col => `<th>${this.escapeHtml(col.name)}</th>`).join('')}
                  <th style="width:140px;" class="text-right">Running Total</th>
                  <th style="width:60px;"></th>
                </tr>
              </thead>
              <tbody id="ledger-body">${this.renderRows(opening)}</tbody>
              <tfoot>
                <tr class="bg-gray-100 font-bold">
                  <td colspan="3" class="text-right">TOTALS:</td>
                  <td class="text-green-600">PKR ${this.fmt(totalReceived)}</td>
                  <td class="text-orange-600">PKR ${this.fmt(totalPending)}</td>
                  <td colspan="${2 + this.state.customColumns.length}"></td>
                  <td class="text-right text-blue-600">PKR ${this.fmt(netBalance)}</td>
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
          <td><input type="number" step="0.01" value="${rec}" onchange="App.updateRow(${t.id}, 'amount_received', parseFloat(this.value)||0)" class="text-green-600 font-medium"></td>
          <td><input type="number" step="0.01" value="${pen}" onchange="App.updateRow(${t.id}, 'amount_pending', parseFloat(this.value)||0)" class="text-orange-600 font-medium"></td>
          <td>
            <select onchange="App.updateRow(${t.id}, 'status', this.value)">
              ${['Pending','Received','Partial','Overdue','Cancelled'].map(s => `<option value="${s}" ${t.status === s ? 'selected' : ''}>${s}</option>`).join('')}
            </select>
          </td>
          <td><input type="text" value="${this.escapeAttr(t.description || '')}" onchange="App.updateRow(${t.id}, 'description', this.value)" placeholder="Notes..."></td>
          ${this.state.customColumns.map(col => `
            <td><input type="${col.type === 'number' ? 'number' : 'text'}" value="${this.escapeAttr(customData[col.key] || '')}" onchange="App.updateCustom(${t.id}, '${col.key}', this.value)"></td>
          `).join('')}
          <td class="text-right font-bold ${running > 0 ? 'text-blue-600' : running < 0 ? 'text-red-600' : 'text-gray-600'}">PKR ${this.fmt(running)}</td>
          <td class="text-center">
            <button onclick="App.deleteRow(${t.id})" class="text-red-500 hover:text-red-700" title="Delete"><i class="fas fa-trash text-sm"></i></button>
          </td>
        </tr>
      `;
    }).join('');
  },

  async addRow() {
    try {
      await this.api.post('/api/transactions', {
        client_id: this.state.currentClientId,
        entry_date: new Date().toISOString().slice(0, 10),
        bill_no: '',
        amount_received: 0,
        amount_pending: 0,
        status: 'Pending',
        description: ''
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
        await this.refreshLedger();
      } catch (e) { this.toast('Update failed', 'error'); }
    }, 400);
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
    }, 400);
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

  showCustomColumns() {
    const cols = [...this.state.customColumns];
    const renderColsList = () => cols.map((col, i) => `
      <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
        <input type="text" class="input-field flex-1" data-col-name="${i}" value="${this.escapeAttr(col.name)}" placeholder="Column name">
        <select class="input-field" style="width:120px;" data-col-type="${i}">
          <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
          <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
        </select>
        <button type="button" class="btn btn-danger" onclick="App._removeCol(${i})"><i class="fas fa-times"></i></button>
      </div>
    `).join('');

    this._tempCols = cols;
    this._removeCol = (i) => {
      this._tempCols.splice(i, 1);
      document.getElementById('cols-list').innerHTML = this._tempCols.map((col, j) => `
        <div class="flex gap-2 items-center bg-gray-50 p-2 rounded mb-2">
          <input type="text" class="input-field flex-1" data-col-name="${j}" value="${this.escapeAttr(col.name)}" placeholder="Column name">
          <select class="input-field" style="width:120px;" data-col-type="${j}">
            <option value="text" ${col.type === 'text' ? 'selected' : ''}>Text</option>
            <option value="number" ${col.type === 'number' ? 'selected' : ''}>Number</option>
          </select>
          <button type="button" class="btn btn-danger" onclick="App._removeCol(${j})"><i class="fas fa-times"></i></button>
        </div>
      `).join('');
    };

    this.openModal(`
      <h2 class="text-xl font-bold mb-4"><i class="fas fa-columns text-blue-500 mr-2"></i>Custom Columns</h2>
      <p class="text-sm text-gray-500 mb-3">Add extra columns to this client's ledger sheet.</p>
      <div id="cols-list">${renderColsList()}</div>
      <button type="button" class="btn btn-secondary mb-4" onclick="App._addColRow()"><i class="fas fa-plus"></i> Add Column</button>
      <div class="flex gap-2 justify-end pt-2 border-t">
        <button type="button" class="btn btn-secondary" onclick="App.closeModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="App._saveColumns()"><i class="fas fa-save"></i> Save</button>
      </div>
    `);
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
        <button type="button" class="btn btn-danger" onclick="App._removeCol(${j})"><i class="fas fa-times"></i></button>
      </div>
    `).join('');
  },

  async _saveColumns() {
    // Read inputs
    document.querySelectorAll('#cols-list [data-col-name]').forEach(el => {
      const i = parseInt(el.dataset.colName);
      if (this._tempCols[i]) this._tempCols[i].name = el.value;
    });
    document.querySelectorAll('#cols-list [data-col-type]').forEach(el => {
      const i = parseInt(el.dataset.colType);
      if (this._tempCols[i]) this._tempCols[i].type = el.value;
    });
    // Ensure each has a key
    this._tempCols.forEach(c => { if (!c.key) c.key = 'col_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); });
    try {
      await this.api.put(`/api/clients/${this.state.currentClientId}/columns`, { columns: this._tempCols });
      this.state.customColumns = this._tempCols;
      this.closeModal();
      this.renderLedger();
      this.toast('Columns updated', 'success');
    } catch (e) { this.toast('Failed', 'error'); }
  },

  // ========== Dashboard ==========
  async showDashboard() {
    this.state.view = 'dashboard';
    this.state.currentFolderId = null;
    this.state.currentClientId = null;
    this.renderFolders();
    document.querySelectorAll('.folder-item').forEach(el => el.classList.remove('active'));
    const dbBtn = document.getElementById('dashboard-btn');
    if (dbBtn) dbBtn.classList.add('active');

    try {
      const data = await this.api.get('/api/dashboard');
      this.renderDashboard(data);
    } catch (e) {}
  },

  renderDashboard(data) {
    const { totals, perFolder, topPending, recent, statuses, clientCount, folderCount } = data;
    const area = document.getElementById('content-area');
    area.innerHTML = `
      <div class="bg-white shadow-sm border-b px-6 py-4">
        <h1 class="text-2xl font-bold text-gray-800"><i class="fas fa-chart-line text-purple-500 mr-2"></i>Dashboard</h1>
        <p class="text-sm text-gray-500 mt-1">Overall financial summary</p>
      </div>

      <div class="p-6 space-y-6">
        <!-- Top stats -->
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Total Received</p>
                <p class="text-2xl font-bold text-green-600 mt-1">PKR ${this.fmt(totals.total_received)}</p>
              </div>
              <i class="fas fa-arrow-down text-3xl text-green-200"></i>
            </div>
          </div>
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Total Pending</p>
                <p class="text-2xl font-bold text-orange-600 mt-1">PKR ${this.fmt(totals.total_pending)}</p>
              </div>
              <i class="fas fa-clock text-3xl text-orange-200"></i>
            </div>
          </div>
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Total Clients</p>
                <p class="text-2xl font-bold text-blue-600 mt-1">${clientCount}</p>
              </div>
              <i class="fas fa-users text-3xl text-blue-200"></i>
            </div>
          </div>
          <div class="stat-card">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm text-gray-500">Folders / Transactions</p>
                <p class="text-2xl font-bold text-purple-600 mt-1">${folderCount} / ${totals.total_transactions}</p>
              </div>
              <i class="fas fa-folder text-3xl text-purple-200"></i>
            </div>
          </div>
        </div>

        <!-- Per-folder breakdown -->
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h2 class="font-bold text-gray-800 mb-4"><i class="fas fa-folder-tree mr-2"></i>Per-Folder Summary</h2>
          ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-4">No folders yet</p>' : `
            <div class="overflow-x-auto">
              <table class="w-full">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="text-left p-3 text-sm font-semibold text-gray-700">Folder</th>
                    <th class="text-right p-3 text-sm font-semibold text-gray-700">Clients</th>
                    <th class="text-right p-3 text-sm font-semibold text-gray-700">Received</th>
                    <th class="text-right p-3 text-sm font-semibold text-gray-700">Pending</th>
                    <th class="text-right p-3 text-sm font-semibold text-gray-700">Net</th>
                  </tr>
                </thead>
                <tbody>
                  ${perFolder.map(f => `
                    <tr class="border-t hover:bg-gray-50 cursor-pointer" onclick="App.openFolder(${f.id})">
                      <td class="p-3"><i class="fas ${f.icon} mr-2" style="color:${f.color}"></i>${this.escapeHtml(f.name)}</td>
                      <td class="text-right p-3">${f.client_count}</td>
                      <td class="text-right p-3 text-green-600 font-medium">PKR ${this.fmt(f.total_received)}</td>
                      <td class="text-right p-3 text-orange-600 font-medium">PKR ${this.fmt(f.total_pending)}</td>
                      <td class="text-right p-3 text-blue-600 font-bold">PKR ${this.fmt(f.total_pending - f.total_received)}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>

        <!-- Charts -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div class="bg-white rounded-xl shadow-sm p-6">
            <h2 class="font-bold text-gray-800 mb-4"><i class="fas fa-chart-pie mr-2"></i>Status Breakdown</h2>
            ${statuses.length === 0 ? '<p class="text-gray-500 text-center py-8">No transactions</p>' : '<canvas id="statusChart" height="200"></canvas>'}
          </div>
          <div class="bg-white rounded-xl shadow-sm p-6">
            <h2 class="font-bold text-gray-800 mb-4"><i class="fas fa-chart-bar mr-2"></i>Folder Comparison</h2>
            ${perFolder.length === 0 ? '<p class="text-gray-500 text-center py-8">No data</p>' : '<canvas id="folderChart" height="200"></canvas>'}
          </div>
        </div>

        <!-- Top pending clients -->
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h2 class="font-bold text-gray-800 mb-4"><i class="fas fa-exclamation-triangle text-orange-500 mr-2"></i>Top Pending Clients</h2>
          ${topPending.length === 0 ? '<p class="text-gray-500 text-center py-4">No pending amounts</p>' : `
            <div class="space-y-2">
              ${topPending.filter(c => c.pending > 0).map(c => `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer" onclick="App.openClient(${c.id})">
                  <div>
                    <p class="font-medium text-gray-800">${this.escapeHtml(c.name)}</p>
                    <p class="text-xs text-gray-500">${this.escapeHtml(c.folder_name || '')}</p>
                  </div>
                  <div class="text-right">
                    <p class="font-bold text-orange-600">PKR ${this.fmt(c.pending)}</p>
                    <p class="text-xs text-gray-500">Received: PKR ${this.fmt(c.received)}</p>
                  </div>
                </div>
              `).join('') || '<p class="text-gray-500 text-center py-4">No pending amounts</p>'}
            </div>
          `}
        </div>

        <!-- Recent transactions -->
        <div class="bg-white rounded-xl shadow-sm p-6">
          <h2 class="font-bold text-gray-800 mb-4"><i class="fas fa-history mr-2"></i>Recent Transactions</h2>
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
                      <td class="p-2 text-right text-green-600 font-medium">PKR ${this.fmt(t.amount_received)}</td>
                      <td class="p-2 text-right text-orange-600 font-medium">PKR ${this.fmt(t.amount_pending)}</td>
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

    // Render charts
    setTimeout(() => {
      if (statuses.length > 0) {
        const ctx = document.getElementById('statusChart');
        if (ctx) {
          new Chart(ctx, {
            type: 'doughnut',
            data: {
              labels: statuses.map(s => s.status),
              datasets: [{
                data: statuses.map(s => s.count),
                backgroundColor: ['#f59e0b','#10b981','#3b82f6','#ef4444','#6b7280']
              }]
            },
            options: { plugins: { legend: { position: 'bottom' } } }
          });
        }
      }
      if (perFolder.length > 0) {
        const ctx = document.getElementById('folderChart');
        if (ctx) {
          new Chart(ctx, {
            type: 'bar',
            data: {
              labels: perFolder.map(f => f.name),
              datasets: [
                { label: 'Received', data: perFolder.map(f => f.total_received), backgroundColor: '#10b981' },
                { label: 'Pending', data: perFolder.map(f => f.total_pending), backgroundColor: '#f59e0b' }
              ]
            },
            options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true } } }
          });
        }
      }
    }, 50);
  },

  // ========== Auth UI ==========
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

  // ========== Modal ==========
  openModal(content) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'modal-overlay';
    overlay.innerHTML = `<div class="modal-box">${content}</div>`;
    overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeModal(); });
    document.body.appendChild(overlay);
  },

  closeModal() {
    const m = document.getElementById('modal-overlay');
    if (m) m.remove();
  },

  // ========== Helpers ==========
  fmt(n) {
    n = parseFloat(n) || 0;
    return n.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },
  escapeHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  },
  escapeAttr(s) { return this.escapeHtml(s); }
};

// Init on DOM ready
document.addEventListener('DOMContentLoaded', () => App.init());

// Close dropdowns on outside click
document.addEventListener('click', (e) => {
  if (!e.target.closest('#user-dropdown')) {
    const d = document.getElementById('user-dropdown');
    if (d) d.classList.remove('open');
  }
});
