import { Hono } from 'hono'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'

type Bindings = {
  DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// ============ Helper Functions ============
async function sha256(text: string): Promise<string> {
  const buffer = new TextEncoder().encode(text)
  const hash = await crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
const hashPassword = (p: string) => sha256(p)
function generateSessionId(): string {
  const arr = new Uint8Array(32)
  crypto.getRandomValues(arr)
  return Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
}

// ============ Auth Middleware ============
async function requireAuth(c: any, next: any) {
  const sessionId = getCookie(c, 'session_id')
  if (!sessionId) return c.json({ error: 'Unauthorized' }, 401)
  const session = await c.env.DB.prepare(
    'SELECT * FROM sessions WHERE id = ? AND expires_at > datetime("now")'
  ).bind(sessionId).first()
  if (!session) {
    deleteCookie(c, 'session_id')
    return c.json({ error: 'Session expired' }, 401)
  }
  c.set('userId', session.user_id)
  await next()
}

// ============ AUTH ============
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  if (!username || !password) return c.json({ error: 'Username & password required' }, 400)
  const passwordHash = await hashPassword(password)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE username = ? AND password_hash = ?'
  ).bind(username, passwordHash).first()
  if (!user) return c.json({ error: 'Invalid credentials' }, 401)
  const sessionId = generateSessionId()
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  await c.env.DB.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).bind(sessionId, user.id, expiresAt).run()
  setCookie(c, 'session_id', sessionId, {
    httpOnly: true, secure: true, sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60, path: '/'
  })
  return c.json({ success: true, username: user.username })
})

app.post('/api/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id')
  if (sessionId) await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  deleteCookie(c, 'session_id', { path: '/' })
  return c.json({ success: true })
})

app.get('/api/auth/check', async (c) => {
  const sessionId = getCookie(c, 'session_id')
  if (!sessionId) return c.json({ authenticated: false })
  const session = await c.env.DB.prepare(
    'SELECT s.*, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.id = ? AND s.expires_at > datetime("now")'
  ).bind(sessionId).first()
  if (!session) return c.json({ authenticated: false })
  return c.json({ authenticated: true, username: session.username })
})

app.post('/api/auth/change-password', requireAuth, async (c) => {
  const userId = c.get('userId')
  const { oldPassword, newPassword } = await c.req.json()
  if (!newPassword || newPassword.length < 4) return c.json({ error: 'Password too short' }, 400)
  const oldHash = await hashPassword(oldPassword)
  const user = await c.env.DB.prepare(
    'SELECT * FROM users WHERE id = ? AND password_hash = ?'
  ).bind(userId, oldHash).first()
  if (!user) return c.json({ error: 'Old password incorrect' }, 400)
  const newHash = await hashPassword(newPassword)
  await c.env.DB.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(newHash, userId).run()
  return c.json({ success: true })
})

// ============ BRANDING ============
app.get('/api/branding', async (c) => {
  let row = await c.env.DB.prepare('SELECT * FROM branding WHERE id = 1').first()
  if (!row) {
    await c.env.DB.prepare(
      "INSERT INTO branding (id, company_name, crm_name) VALUES (1, 'Two Star Industries', 'Two Star CRM')"
    ).run()
    row = await c.env.DB.prepare('SELECT * FROM branding WHERE id = 1').first()
  }
  return c.json({ branding: row })
})

app.put('/api/branding', requireAuth, async (c) => {
  const b = await c.req.json()
  await c.env.DB.prepare(`
    UPDATE branding SET 
      company_name = ?, crm_name = ?, logo_url = ?,
      primary_color = ?, accent_color = ?,
      received_color = ?, pending_color = ?, running_color = ?,
      bill_address = ?, bill_phone = ?, bill_footer = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = 1
  `).bind(
    b.company_name || 'Two Star Industries',
    b.crm_name || 'Two Star CRM',
    b.logo_url || '',
    b.primary_color || '#3b82f6',
    b.accent_color || '#8b5cf6',
    b.received_color || '#ef4444',
    b.pending_color || '#3b82f6',
    b.running_color || '#10b981',
    b.bill_address || '',
    b.bill_phone || '',
    b.bill_footer || ''
  ).run()
  return c.json({ success: true })
})

// ============ SECTIONS (folders w/ types) ============
app.get('/api/folders', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT f.*, COUNT(cl.id) as client_count 
     FROM folders f 
     LEFT JOIN clients cl ON cl.folder_id = f.id 
     GROUP BY f.id 
     ORDER BY f.sort_order, f.name`
  ).all()
  return c.json({ folders: result.results })
})

app.post('/api/folders', requireAuth, async (c) => {
  const { name, icon, color, section_type } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO folders (name, icon, color, section_type) VALUES (?, ?, ?, ?)'
  ).bind(name, icon || 'fa-folder', color || '#3b82f6', section_type || 'clients').run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, icon, color } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE folders SET name = ?, icon = ?, color = ? WHERE id = ?'
  ).bind(name, icon, color, id).run()
  return c.json({ success: true })
})

app.delete('/api/folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM folders WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ CLIENTS ============
app.get('/api/folders/:id/clients', requireAuth, async (c) => {
  const folderId = c.req.param('id')
  const result = await c.env.DB.prepare(
    `SELECT cl.*,
       (SELECT COALESCE(SUM(amount_received), 0) FROM transactions WHERE client_id = cl.id) as total_received,
       (SELECT COALESCE(SUM(amount_pending), 0) FROM transactions WHERE client_id = cl.id) as total_pending
     FROM clients cl WHERE cl.folder_id = ? ORDER BY cl.name`
  ).bind(folderId).all()
  return c.json({ clients: result.results })
})

app.get('/api/clients', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT cl.id, cl.name, cl.phone, cl.address, cl.folder_id, f.name as folder_name, f.section_type
     FROM clients cl LEFT JOIN folders f ON f.id = cl.folder_id ORDER BY cl.name`
  ).all()
  return c.json({ clients: result.results })
})

// Suppliers list — clients in folders where section_type='clients' AND folder name suggests supplier or any folder
app.get('/api/suppliers', requireAuth, async (c) => {
  // Returns all clients (so user can pick any) but with folder info
  const result = await c.env.DB.prepare(
    `SELECT cl.id, cl.name, cl.phone, f.name as folder_name
     FROM clients cl LEFT JOIN folders f ON f.id = cl.folder_id ORDER BY cl.name`
  ).all()
  return c.json({ suppliers: result.results })
})

app.post('/api/clients', requireAuth, async (c) => {
  const { folder_id, name, phone, email, address, notes, opening_balance } = await c.req.json()
  if (!folder_id || !name) return c.json({ error: 'folder_id & name required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO clients (folder_id, name, phone, email, address, notes, opening_balance) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(folder_id, name, phone || '', email || '', address || '', notes || '', opening_balance || 0).run()
  return c.json({ id: result.meta.last_row_id })
})

app.get('/api/clients/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const client = await c.env.DB.prepare('SELECT * FROM clients WHERE id = ?').bind(id).first()
  if (!client) return c.json({ error: 'Not found' }, 404)
  const cols = await c.env.DB.prepare('SELECT * FROM client_columns WHERE client_id = ?').bind(id).first()
  const labels = await c.env.DB.prepare('SELECT * FROM column_labels WHERE client_id = ?').bind(id).first()
  return c.json({
    client,
    custom_columns: cols ? JSON.parse(cols.columns_json as string) : [],
    column_labels: labels ? JSON.parse(labels.labels_json as string) : {}
  })
})

app.put('/api/clients/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, phone, email, address, notes, opening_balance } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE clients SET name = ?, phone = ?, email = ?, address = ?, notes = ?, opening_balance = ? WHERE id = ?'
  ).bind(name, phone || '', email || '', address || '', notes || '', opening_balance || 0, id).run()
  return c.json({ success: true })
})

app.delete('/api/clients/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM clients WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

app.put('/api/clients/:id/columns', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { columns } = await c.req.json()
  const json = JSON.stringify(columns || [])
  const existing = await c.env.DB.prepare('SELECT id FROM client_columns WHERE client_id = ?').bind(id).first()
  if (existing) await c.env.DB.prepare('UPDATE client_columns SET columns_json = ? WHERE client_id = ?').bind(json, id).run()
  else await c.env.DB.prepare('INSERT INTO client_columns (client_id, columns_json) VALUES (?, ?)').bind(id, json).run()
  return c.json({ success: true })
})

app.put('/api/clients/:id/column-labels', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { labels } = await c.req.json()
  const json = JSON.stringify(labels || {})
  const existing = await c.env.DB.prepare('SELECT client_id FROM column_labels WHERE client_id = ?').bind(id).first()
  if (existing) await c.env.DB.prepare('UPDATE column_labels SET labels_json = ? WHERE client_id = ?').bind(json, id).run()
  else await c.env.DB.prepare('INSERT INTO column_labels (client_id, labels_json) VALUES (?, ?)').bind(id, json).run()
  return c.json({ success: true })
})

// ============ TRANSACTIONS (LEDGER) ============
app.get('/api/clients/:id/transactions', requireAuth, async (c) => {
  const id = c.req.param('id')
  const result = await c.env.DB.prepare(
    'SELECT * FROM transactions WHERE client_id = ? ORDER BY entry_date ASC, id ASC'
  ).bind(id).all()
  return c.json({ transactions: result.results })
})

app.post('/api/transactions', requireAuth, async (c) => {
  const { client_id, entry_date, bill_no, amount_received, amount_pending, status, description, custom_data } = await c.req.json()
  if (!client_id) return c.json({ error: 'client_id required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO transactions (client_id, entry_date, bill_no, amount_received, amount_pending, status, description, custom_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    client_id,
    entry_date || new Date().toISOString().slice(0, 10),
    bill_no || '',
    amount_received || 0,
    amount_pending || 0,
    status || 'Pending',
    description || '',
    JSON.stringify(custom_data || {})
  ).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { entry_date, bill_no, amount_received, amount_pending, status, description, custom_data } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE transactions SET entry_date = ?, bill_no = ?, amount_received = ?, amount_pending = ?, status = ?, description = ?, custom_data = ? WHERE id = ?'
  ).bind(
    entry_date, bill_no || '',
    amount_received || 0, amount_pending || 0,
    status || 'Pending', description || '',
    JSON.stringify(custom_data || {}), id
  ).run()
  return c.json({ success: true })
})

app.delete('/api/transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ INVENTORY ============
app.get('/api/inventory', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM inventory ORDER BY name ASC').all()
  return c.json({ items: result.results })
})

app.post('/api/inventory', requireAuth, async (c) => {
  const { name, sku, unit, rate, quantity, category, notes } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO inventory (name, sku, unit, rate, quantity, category, notes) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(name, sku || '', unit || 'pcs', parseFloat(rate) || 0, parseFloat(quantity) || 0, category || '', notes || '').run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/inventory/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, sku, unit, rate, quantity, category, notes } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE inventory SET name = ?, sku = ?, unit = ?, rate = ?, quantity = ?, category = ?, notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(name, sku || '', unit || 'pcs', parseFloat(rate) || 0, parseFloat(quantity) || 0, category || '', notes || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/inventory/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM inventory WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ Helper: sync bill ↔ ledger ============
async function syncBillLedger(env: any, billId: number, b: any) {
  // After bill saved: create or update a transaction row in client's ledger
  // We only attach if client_id is present
  if (!b.client_id) {
    // If previously linked, drop it
    const old = await env.DB.prepare('SELECT ledger_transaction_id FROM bills WHERE id = ?').bind(billId).first()
    if (old?.ledger_transaction_id) {
      await env.DB.prepare('DELETE FROM transactions WHERE id = ? AND auto_generated = 1').bind(old.ledger_transaction_id).run()
      await env.DB.prepare('UPDATE bills SET ledger_transaction_id = NULL WHERE id = ?').bind(billId).run()
    }
    return
  }
  const total = parseFloat(b.total) || 0
  const paid = parseFloat(b.paid) || 0
  const due = total - paid
  const status = due <= 0 ? 'Received' : (paid > 0 ? 'Partial' : 'Pending')
  const desc = `Bill ${b.bill_no || ''}`
  // Find existing
  const existing = await env.DB.prepare('SELECT ledger_transaction_id FROM bills WHERE id = ?').bind(billId).first()
  if (existing?.ledger_transaction_id) {
    // Verify it still exists & is auto
    const tx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(existing.ledger_transaction_id).first()
    if (tx) {
      await env.DB.prepare(
        `UPDATE transactions SET client_id = ?, entry_date = ?, bill_no = ?, amount_received = ?, amount_pending = ?, status = ?, description = ?
         WHERE id = ?`
      ).bind(b.client_id, b.bill_date, b.bill_no || '', paid, due, status, desc, existing.ledger_transaction_id).run()
      return
    }
  }
  // Insert new
  const result = await env.DB.prepare(
    `INSERT INTO transactions (client_id, entry_date, bill_no, amount_received, amount_pending, status, description, bill_id, auto_generated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
  ).bind(b.client_id, b.bill_date, b.bill_no || '', paid, due, status, desc, billId).run()
  await env.DB.prepare('UPDATE bills SET ledger_transaction_id = ? WHERE id = ?').bind(result.meta.last_row_id, billId).run()
}

// ============ BILLS ============
app.get('/api/bills', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT b.*, cl.name as client_name 
    FROM bills b LEFT JOIN clients cl ON cl.id = b.client_id 
    ORDER BY b.bill_date DESC, b.id DESC
  `).all()
  return c.json({ bills: result.results })
})

app.get('/api/bills/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const bill = await c.env.DB.prepare('SELECT * FROM bills WHERE id = ?').bind(id).first()
  if (!bill) return c.json({ error: 'Not found' }, 404)
  const items = await c.env.DB.prepare('SELECT * FROM bill_items WHERE bill_id = ? ORDER BY sort_order ASC, id ASC').bind(id).all()
  return c.json({ bill, items: items.results })
})

app.post('/api/bills', requireAuth, async (c) => {
  const b = await c.req.json()
  const billNo = b.bill_no || ('BILL-' + Date.now())
  const billDate = b.bill_date || new Date().toISOString().slice(0, 10)
  const result = await c.env.DB.prepare(`
    INSERT INTO bills (bill_no, bill_date, client_id, customer_name, customer_phone, customer_address,
      subtotal, discount, tax, total, paid, notes, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    billNo, billDate, b.client_id || null,
    b.customer_name || '', b.customer_phone || '', b.customer_address || '',
    parseFloat(b.subtotal) || 0, parseFloat(b.discount) || 0, parseFloat(b.tax) || 0,
    parseFloat(b.total) || 0, parseFloat(b.paid) || 0, b.notes || '', b.status || 'Unpaid'
  ).run()
  const billId = result.meta.last_row_id as number

  if (Array.isArray(b.items)) {
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i]
      await c.env.DB.prepare(`
        INSERT INTO bill_items (bill_id, product_id, product_name, quantity, rate, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(billId, it.product_id || null, it.product_name || '',
              parseFloat(it.quantity) || 0, parseFloat(it.rate) || 0, parseFloat(it.total) || 0, i).run()
      if (it.product_id && parseFloat(it.quantity) > 0) {
        await c.env.DB.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?')
          .bind(parseFloat(it.quantity), it.product_id).run()
      }
    }
  }

  // Auto-link to client ledger
  await syncBillLedger(c.env, billId, { ...b, bill_no: billNo, bill_date: billDate })

  return c.json({ id: billId, bill_no: billNo })
})

app.put('/api/bills/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()

  const oldItems = await c.env.DB.prepare('SELECT product_id, quantity FROM bill_items WHERE bill_id = ?').bind(id).all()
  for (const oi of (oldItems.results as any[])) {
    if (oi.product_id && oi.quantity > 0) {
      await c.env.DB.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').bind(oi.quantity, oi.product_id).run()
    }
  }

  await c.env.DB.prepare(`
    UPDATE bills SET bill_no = ?, bill_date = ?, client_id = ?, customer_name = ?,
      customer_phone = ?, customer_address = ?, subtotal = ?, discount = ?, tax = ?,
      total = ?, paid = ?, notes = ?, status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    b.bill_no || '', b.bill_date || new Date().toISOString().slice(0, 10),
    b.client_id || null, b.customer_name || '', b.customer_phone || '', b.customer_address || '',
    parseFloat(b.subtotal) || 0, parseFloat(b.discount) || 0, parseFloat(b.tax) || 0,
    parseFloat(b.total) || 0, parseFloat(b.paid) || 0, b.notes || '', b.status || 'Unpaid', id
  ).run()

  await c.env.DB.prepare('DELETE FROM bill_items WHERE bill_id = ?').bind(id).run()

  if (Array.isArray(b.items)) {
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i]
      await c.env.DB.prepare(`
        INSERT INTO bill_items (bill_id, product_id, product_name, quantity, rate, total, sort_order)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(id, it.product_id || null, it.product_name || '',
              parseFloat(it.quantity) || 0, parseFloat(it.rate) || 0, parseFloat(it.total) || 0, i).run()
      if (it.product_id && parseFloat(it.quantity) > 0) {
        await c.env.DB.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').bind(parseFloat(it.quantity), it.product_id).run()
      }
    }
  }

  await syncBillLedger(c.env, id, b)

  return c.json({ success: true })
})

app.delete('/api/bills/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const oldItems = await c.env.DB.prepare('SELECT product_id, quantity FROM bill_items WHERE bill_id = ?').bind(id).all()
  for (const oi of (oldItems.results as any[])) {
    if (oi.product_id && oi.quantity > 0) {
      await c.env.DB.prepare('UPDATE inventory SET quantity = quantity + ? WHERE id = ?').bind(oi.quantity, oi.product_id).run()
    }
  }
  // Drop linked ledger transaction
  const bill = await c.env.DB.prepare('SELECT ledger_transaction_id FROM bills WHERE id = ?').bind(id).first()
  if (bill?.ledger_transaction_id) {
    await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(bill.ledger_transaction_id).run()
  }
  await c.env.DB.prepare('DELETE FROM bills WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ RAW MATERIALS ============
app.get('/api/raw-materials', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT rm.*, cl.name as supplier_name_resolved 
     FROM raw_materials rm LEFT JOIN clients cl ON cl.id = rm.supplier_id
     ORDER BY rm.name ASC`
  ).all()
  return c.json({ items: result.results })
})

app.post('/api/raw-materials', requireAuth, async (c) => {
  const { name, unit, quantity, rate, supplier_id, supplier_name, category, notes } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const q = parseFloat(quantity) || 0, r = parseFloat(rate) || 0
  const result = await c.env.DB.prepare(
    `INSERT INTO raw_materials (name, unit, quantity, rate, total_value, supplier_id, supplier_name, category, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, unit || 'pcs', q, r, q * r, supplier_id || null, supplier_name || '', category || '', notes || '').run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/raw-materials/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, unit, quantity, rate, supplier_id, supplier_name, category, notes } = await c.req.json()
  const q = parseFloat(quantity) || 0, r = parseFloat(rate) || 0
  await c.env.DB.prepare(
    `UPDATE raw_materials SET name=?, unit=?, quantity=?, rate=?, total_value=?, supplier_id=?, supplier_name=?, category=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, unit || 'pcs', q, r, q * r, supplier_id || null, supplier_name || '', category || '', notes || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/raw-materials/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM raw_materials WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ EMPLOYEES ============
app.get('/api/employees', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT e.*,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_paid,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='advance') as total_advance,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='bonus') as total_bonus,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='deduction') as total_deduction
     FROM employees e ORDER BY e.name`
  ).all()
  return c.json({ employees: result.results })
})

app.get('/api/employees/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(id).first()
  if (!emp) return c.json({ error: 'Not found' }, 404)
  const tx = await c.env.DB.prepare(
    'SELECT * FROM employee_transactions WHERE employee_id = ? ORDER BY entry_date DESC, id DESC'
  ).bind(id).all()
  return c.json({ employee: emp, transactions: tx.results })
})

app.post('/api/employees', requireAuth, async (c) => {
  const { name, phone, cnic, address, designation, joining_date, monthly_salary, notes } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    `INSERT INTO employees (name, phone, cnic, address, designation, joining_date, monthly_salary, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, phone || '', cnic || '', address || '', designation || '', joining_date || '', parseFloat(monthly_salary) || 0, notes || '').run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/employees/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, phone, cnic, address, designation, joining_date, monthly_salary, notes, active } = await c.req.json()
  await c.env.DB.prepare(
    `UPDATE employees SET name=?, phone=?, cnic=?, address=?, designation=?, joining_date=?, monthly_salary=?, notes=?, active=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, phone || '', cnic || '', address || '', designation || '', joining_date || '', parseFloat(monthly_salary) || 0, notes || '', active === 0 ? 0 : 1, id).run()
  return c.json({ success: true })
})

app.delete('/api/employees/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

app.post('/api/employee-transactions', requireAuth, async (c) => {
  const { employee_id, entry_date, type, amount, description } = await c.req.json()
  if (!employee_id || !type) return c.json({ error: 'employee_id & type required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO employee_transactions (employee_id, entry_date, type, amount, description) VALUES (?, ?, ?, ?, ?)'
  ).bind(employee_id, entry_date || new Date().toISOString().slice(0, 10), type, parseFloat(amount) || 0, description || '').run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/employee-transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { entry_date, type, amount, description } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE employee_transactions SET entry_date=?, type=?, amount=?, description=? WHERE id=?'
  ).bind(entry_date, type, parseFloat(amount) || 0, description || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/employee-transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM employee_transactions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ SIDE EXPENSES ============
app.get('/api/side-expenses', requireAuth, async (c) => {
  const result = await c.env.DB.prepare('SELECT * FROM side_expenses ORDER BY entry_date DESC, id DESC').all()
  return c.json({ expenses: result.results })
})

app.post('/api/side-expenses', requireAuth, async (c) => {
  const { entry_date, category, description, amount, paid_to, notes } = await c.req.json()
  const result = await c.env.DB.prepare(
    'INSERT INTO side_expenses (entry_date, category, description, amount, paid_to, notes) VALUES (?, ?, ?, ?, ?, ?)'
  ).bind(entry_date || new Date().toISOString().slice(0, 10), category || '', description || '', parseFloat(amount) || 0, paid_to || '', notes || '').run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/side-expenses/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { entry_date, category, description, amount, paid_to, notes } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE side_expenses SET entry_date=?, category=?, description=?, amount=?, paid_to=?, notes=? WHERE id=?'
  ).bind(entry_date, category || '', description || '', parseFloat(amount) || 0, paid_to || '', notes || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/side-expenses/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM side_expenses WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ CUSTOM SECTIONS ============
app.get('/api/custom-sections', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT cs.*, (SELECT COUNT(*) FROM custom_section_rows WHERE section_id = cs.id) as row_count
     FROM custom_sections cs ORDER BY cs.sort_order, cs.name`
  ).all()
  return c.json({ sections: result.results })
})

app.get('/api/custom-sections/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const section = await c.env.DB.prepare('SELECT * FROM custom_sections WHERE id = ?').bind(id).first()
  if (!section) return c.json({ error: 'Not found' }, 404)
  const rows = await c.env.DB.prepare('SELECT * FROM custom_section_rows WHERE section_id = ? ORDER BY id DESC').bind(id).all()
  return c.json({ section, rows: rows.results })
})

app.post('/api/custom-sections', requireAuth, async (c) => {
  const { name, icon, color, columns } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO custom_sections (name, icon, color, columns_json) VALUES (?, ?, ?, ?)'
  ).bind(name, icon || 'fa-folder', color || '#3b82f6', JSON.stringify(columns || [])).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/custom-sections/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, icon, color, columns } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE custom_sections SET name=?, icon=?, color=?, columns_json=? WHERE id=?'
  ).bind(name, icon || 'fa-folder', color || '#3b82f6', JSON.stringify(columns || []), id).run()
  return c.json({ success: true })
})

app.delete('/api/custom-sections/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM custom_sections WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

app.post('/api/custom-sections/:id/rows', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { data } = await c.req.json()
  const result = await c.env.DB.prepare(
    'INSERT INTO custom_section_rows (section_id, data_json) VALUES (?, ?)'
  ).bind(id, JSON.stringify(data || {})).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/custom-sections/rows/:rowId', requireAuth, async (c) => {
  const rowId = c.req.param('rowId')
  const { data } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE custom_section_rows SET data_json=?, updated_at=CURRENT_TIMESTAMP WHERE id=?'
  ).bind(JSON.stringify(data || {}), rowId).run()
  return c.json({ success: true })
})

app.delete('/api/custom-sections/rows/:rowId', requireAuth, async (c) => {
  const rowId = c.req.param('rowId')
  await c.env.DB.prepare('DELETE FROM custom_section_rows WHERE id = ?').bind(rowId).run()
  return c.json({ success: true })
})

// ============ DASHBOARD ============
app.get('/api/dashboard', requireAuth, async (c) => {
  const [totals, perFolder, topPending, recent, statuses, clientCount, folderCount, billStats,
         empCount, empPaid, empAdvance, expenseStats, rawStats, customSecCount] = await Promise.all([
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(amount_received),0) as total_received,
             COALESCE(SUM(amount_pending),0) as total_pending,
             COUNT(*) as total_transactions FROM transactions
    `).first(),
    c.env.DB.prepare(`
      SELECT f.id, f.name, f.icon, f.color, f.section_type,
             COUNT(DISTINCT cl.id) as client_count,
             COALESCE(SUM(t.amount_received),0) as total_received,
             COALESCE(SUM(t.amount_pending),0) as total_pending
      FROM folders f
      LEFT JOIN clients cl ON cl.folder_id = f.id
      LEFT JOIN transactions t ON t.client_id = cl.id
      GROUP BY f.id ORDER BY f.sort_order
    `).all(),
    c.env.DB.prepare(`
      SELECT cl.id, cl.name, f.name as folder_name,
             COALESCE(SUM(t.amount_pending),0) as pending,
             COALESCE(SUM(t.amount_received),0) as received
      FROM clients cl LEFT JOIN folders f ON f.id = cl.folder_id
      LEFT JOIN transactions t ON t.client_id = cl.id
      GROUP BY cl.id ORDER BY pending DESC LIMIT 10
    `).all(),
    c.env.DB.prepare(`
      SELECT t.*, cl.name as client_name, f.name as folder_name
      FROM transactions t LEFT JOIN clients cl ON cl.id = t.client_id
      LEFT JOIN folders f ON f.id = cl.folder_id
      ORDER BY t.created_at DESC LIMIT 10
    `).all(),
    c.env.DB.prepare(`
      SELECT status, COUNT(*) as count, COALESCE(SUM(amount_pending),0) as pending_sum, COALESCE(SUM(amount_received),0) as received_sum
      FROM transactions GROUP BY status
    `).all(),
    c.env.DB.prepare('SELECT COUNT(*) as c FROM clients').first(),
    c.env.DB.prepare('SELECT COUNT(*) as c FROM folders').first(),
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total),0) as total_amount, COALESCE(SUM(paid),0) as total_paid FROM bills`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as c FROM employees WHERE active = 1`).first(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as a FROM employee_transactions WHERE type='salary'`).first(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as a FROM employee_transactions WHERE type='advance'`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM side_expenses`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_value),0) as total, COALESCE(SUM(quantity),0) as qty FROM raw_materials`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as c FROM custom_sections`).first()
  ])

  return c.json({
    totals,
    perFolder: perFolder.results,
    topPending: topPending.results,
    recent: recent.results,
    statuses: statuses.results,
    clientCount: clientCount?.c || 0,
    folderCount: folderCount?.c || 0,
    billStats,
    empCount: empCount?.c || 0,
    empPaid: empPaid?.a || 0,
    empAdvance: empAdvance?.a || 0,
    expenseStats,
    rawStats,
    customSecCount: customSecCount?.c || 0
  })
})

// ============ ROOT ============
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Two Star CRM</title>
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://cdn.tailwindcss.com">
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<link rel="stylesheet" href="/static/style.css">
</head>
<body class="bg-gray-100 antialiased">
<div id="app">
  <div class="boot-loader">
    <div class="boot-spinner"></div>
    <p class="boot-text">Loading Two Star CRM...</p>
  </div>
</div>
<script src="https://cdn.jsdelivr.net/npm/chart.js" defer></script>
<script src="/static/app.js" defer></script>
</body>
</html>`)
})

export default app
