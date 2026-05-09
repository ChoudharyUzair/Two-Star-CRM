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
function generateUniqueBillNo(): string {
  // 4-digit unique-ish: epoch tail + random
  const t = Date.now().toString().slice(-4)
  const r = Math.floor(Math.random() * 9000 + 1000)
  return `${t}${r}`
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
      bill_website = ?, bill_email = ?,
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
    b.bill_footer || '',
    b.bill_website || '',
    b.bill_email || ''
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

// ============ BILL NO VALIDATION ============
// Bill numbers must be at least 3 digits and globally unique across bills + transactions.
// IMPORTANT: When checking, ignore auto-linked ledger rows that mirror the same bill (auto_generated=1 + matching bill_id),
// otherwise editing a bill/ledger row falsely reports its OWN linked twin as duplicate.
async function isBillNoTaken(env: any, billNo: string, excludeBillId?: number, excludeTxId?: number): Promise<boolean> {
  if (!billNo || !billNo.trim()) return false
  const trimmed = billNo.trim()

  // Check bills table
  let q = 'SELECT id FROM bills WHERE bill_no = ? COLLATE NOCASE'
  const args: any[] = [trimmed]
  if (excludeBillId) { q += ' AND id != ?'; args.push(excludeBillId) }
  const billHit = await env.DB.prepare(q).bind(...args).first()
  if (billHit) return true

  // Check transactions table BUT exclude auto-linked rows that belong to a bill we're editing,
  // or any auto-linked row whose parent bill has the same bill_no (those are mirrors, not duplicates)
  let q2 = `SELECT t.id FROM transactions t
            LEFT JOIN bills b ON b.id = t.bill_id
            WHERE t.bill_no = ? COLLATE NOCASE
              AND NOT (t.auto_generated = 1 AND b.bill_no = ? COLLATE NOCASE)`
  const args2: any[] = [trimmed, trimmed]
  if (excludeTxId) { q2 += ' AND t.id != ?'; args2.push(excludeTxId) }
  if (excludeBillId) { q2 += ' AND (t.bill_id IS NULL OR t.bill_id != ?)'; args2.push(excludeBillId) }
  const txHit = await env.DB.prepare(q2).bind(...args2).first()
  return !!txHit
}

function billNoValid(billNo: string): boolean {
  if (!billNo) return true // empty allowed (will be auto-generated)
  const t = billNo.trim()
  if (!t) return true
  // Must contain at least 3 consecutive digits and start with a digit OR have at least 3 digits total
  const digits = (t.match(/\d/g) || []).length
  return digits >= 3
}

app.get('/api/bill-no/check', requireAuth, async (c) => {
  const billNo = c.req.query('bill_no') || ''
  const excludeBill = c.req.query('exclude_bill')
  const excludeTx = c.req.query('exclude_tx')
  if (!billNoValid(billNo)) return c.json({ valid: false, error: 'Bill No must contain at least 3 digits' })
  const taken = await isBillNoTaken(c.env, billNo, excludeBill ? parseInt(excludeBill) : undefined, excludeTx ? parseInt(excludeTx) : undefined)
  return c.json({ valid: !taken, error: taken ? 'Bill No already exists' : null })
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
  const billNoT = (bill_no || '').trim()
  if (billNoT) {
    if (!billNoValid(billNoT)) return c.json({ error: 'Bill No must contain at least 3 digits' }, 400)
    if (await isBillNoTaken(c.env, billNoT)) return c.json({ error: `Bill No "${billNoT}" already exists` }, 400)
  }
  const result = await c.env.DB.prepare(
    'INSERT INTO transactions (client_id, entry_date, bill_no, amount_received, amount_pending, status, description, custom_data) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    client_id,
    entry_date || new Date().toISOString().slice(0, 10),
    billNoT,
    amount_received || 0,
    amount_pending || 0,
    status || 'Pending',
    description || '',
    JSON.stringify(custom_data || {})
  ).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/transactions/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const { entry_date, bill_no, amount_received, amount_pending, status, description, custom_data } = await c.req.json()
  const billNoT = (bill_no || '').trim()
  // Look up if this transaction is linked to a bill — if so we must allow that bill's bill_no
  const existingTx = await c.env.DB.prepare('SELECT bill_id FROM transactions WHERE id = ?').bind(id).first() as any
  const linkedBillId = existingTx?.bill_id ? parseInt(existingTx.bill_id) : undefined
  if (billNoT) {
    if (!billNoValid(billNoT)) return c.json({ error: 'Bill No must contain at least 3 digits' }, 400)
    if (await isBillNoTaken(c.env, billNoT, linkedBillId, id)) return c.json({ error: `Bill No "${billNoT}" already exists` }, 400)
  }
  await c.env.DB.prepare(
    'UPDATE transactions SET entry_date = ?, bill_no = ?, amount_received = ?, amount_pending = ?, status = ?, description = ?, custom_data = ? WHERE id = ?'
  ).bind(
    entry_date, billNoT,
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
  const { name, sku, unit, rate, quantity, category, notes, manufacturing_cost } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO inventory (name, sku, unit, rate, quantity, category, notes, manufacturing_cost) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).bind(name, sku || '', unit || 'pcs', parseFloat(rate) || 0, parseFloat(quantity) || 0, category || '', notes || '', parseFloat(manufacturing_cost) || 0).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/inventory/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, sku, unit, rate, quantity, category, notes, manufacturing_cost } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE inventory SET name = ?, sku = ?, unit = ?, rate = ?, quantity = ?, category = ?, notes = ?, manufacturing_cost = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(name, sku || '', unit || 'pcs', parseFloat(rate) || 0, parseFloat(quantity) || 0, category || '', notes || '', parseFloat(manufacturing_cost) || 0, id).run()
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

// Compute and persist net_profit for a bill: sum((rate - mfg_cost) * qty) for each item
// Manufacturing cost per item is snapshotted from the inventory product at sale time.
async function computeAndSaveBillProfit(env: any, billId: number, items: any[]): Promise<number> {
  let totalProfit = 0
  for (const it of (items || [])) {
    const qty = parseFloat(it.quantity) || 0
    const rate = parseFloat(it.rate) || 0
    let mfgCost = parseFloat(it.manufacturing_cost) || 0
    // If client did not send mfg_cost, look it up from inventory
    if ((!mfgCost || mfgCost <= 0) && it.product_id) {
      const inv = await env.DB.prepare('SELECT manufacturing_cost FROM inventory WHERE id = ?').bind(it.product_id).first() as any
      if (inv && inv.manufacturing_cost) mfgCost = parseFloat(inv.manufacturing_cost) || 0
    }
    totalProfit += (rate - mfgCost) * qty
  }
  await env.DB.prepare('UPDATE bills SET net_profit = ? WHERE id = ?').bind(totalProfit, billId).run()
  return totalProfit
}

app.post('/api/bills', requireAuth, async (c) => {
  const b = await c.req.json()
  const billNo = (b.bill_no || '').trim() || generateUniqueBillNo()
  const billDate = b.bill_date || new Date().toISOString().slice(0, 10)
  if (!billNoValid(billNo)) return c.json({ error: 'Bill No must contain at least 3 digits' }, 400)
  if (await isBillNoTaken(c.env, billNo)) return c.json({ error: `Bill No "${billNo}" already exists` }, 400)
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
      // Snapshot manufacturing_cost from inventory if not explicitly provided
      let mfgCost = parseFloat(it.manufacturing_cost) || 0
      if ((!mfgCost || mfgCost <= 0) && it.product_id) {
        const inv = await c.env.DB.prepare('SELECT manufacturing_cost FROM inventory WHERE id = ?').bind(it.product_id).first() as any
        if (inv && inv.manufacturing_cost) mfgCost = parseFloat(inv.manufacturing_cost) || 0
      }
      await c.env.DB.prepare(`
        INSERT INTO bill_items (bill_id, product_id, product_name, quantity, rate, total, sort_order, manufacturing_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(billId, it.product_id || null, it.product_name || '',
              parseFloat(it.quantity) || 0, parseFloat(it.rate) || 0, parseFloat(it.total) || 0, i, mfgCost).run()
      if (it.product_id && parseFloat(it.quantity) > 0) {
        await c.env.DB.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?')
          .bind(parseFloat(it.quantity), it.product_id).run()
      }
    }
  }

  // Compute & persist net_profit for this bill (sum of (rate - mfg_cost) * qty)
  await computeAndSaveBillProfit(c.env, billId, b.items || [])

  // Auto-link to client ledger
  await syncBillLedger(c.env, billId, { ...b, bill_no: billNo, bill_date: billDate })

  return c.json({ id: billId, bill_no: billNo })
})

app.put('/api/bills/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const b = await c.req.json()
  const billNoT = (b.bill_no || '').trim()
  // Look up the bill's own linked ledger transaction so we can exclude it from the duplicate check
  const existingBill = await c.env.DB.prepare('SELECT ledger_transaction_id FROM bills WHERE id = ?').bind(id).first() as any
  const linkedTxId = existingBill?.ledger_transaction_id ? parseInt(existingBill.ledger_transaction_id) : undefined
  if (billNoT) {
    if (!billNoValid(billNoT)) return c.json({ error: 'Bill No must contain at least 3 digits' }, 400)
    if (await isBillNoTaken(c.env, billNoT, id, linkedTxId)) return c.json({ error: `Bill No "${billNoT}" already exists` }, 400)
  }

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
    billNoT, b.bill_date || new Date().toISOString().slice(0, 10),
    b.client_id || null, b.customer_name || '', b.customer_phone || '', b.customer_address || '',
    parseFloat(b.subtotal) || 0, parseFloat(b.discount) || 0, parseFloat(b.tax) || 0,
    parseFloat(b.total) || 0, parseFloat(b.paid) || 0, b.notes || '', b.status || 'Unpaid', id
  ).run()

  await c.env.DB.prepare('DELETE FROM bill_items WHERE bill_id = ?').bind(id).run()

  if (Array.isArray(b.items)) {
    for (let i = 0; i < b.items.length; i++) {
      const it = b.items[i]
      // Snapshot mfg_cost from inventory if not explicitly provided
      let mfgCost = parseFloat(it.manufacturing_cost) || 0
      if ((!mfgCost || mfgCost <= 0) && it.product_id) {
        const inv = await c.env.DB.prepare('SELECT manufacturing_cost FROM inventory WHERE id = ?').bind(it.product_id).first() as any
        if (inv && inv.manufacturing_cost) mfgCost = parseFloat(inv.manufacturing_cost) || 0
      }
      await c.env.DB.prepare(`
        INSERT INTO bill_items (bill_id, product_id, product_name, quantity, rate, total, sort_order, manufacturing_cost)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(id, it.product_id || null, it.product_name || '',
              parseFloat(it.quantity) || 0, parseFloat(it.rate) || 0, parseFloat(it.total) || 0, i, mfgCost).run()
      if (it.product_id && parseFloat(it.quantity) > 0) {
        await c.env.DB.prepare('UPDATE inventory SET quantity = quantity - ? WHERE id = ?').bind(parseFloat(it.quantity), it.product_id).run()
      }
    }
  }

  // Recompute & persist net_profit
  await computeAndSaveBillProfit(c.env, id, b.items || [])

  await syncBillLedger(c.env, id, { ...b, bill_no: billNoT || b.bill_no })

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

// ============ PRODUCTS (MANUFACTURING / RECIPES) ============
// A product (e.g. "Rack") is built from raw materials (e.g. A=2kg, B=5ft, C=3kg)
// per 1 finished unit. Using current raw_materials.quantity we compute
// how many finished units can be built right now.

// List all products with their recipe + computed "buildable" count.
app.get('/api/products', requireAuth, async (c) => {
  const products = await c.env.DB.prepare('SELECT * FROM products ORDER BY name ASC').all()
  const ingredients = await c.env.DB.prepare(
    `SELECT pi.*, rm.name as raw_name, rm.unit as raw_unit, rm.quantity as raw_quantity, rm.rate as raw_rate
     FROM product_ingredients pi
     LEFT JOIN raw_materials rm ON rm.id = pi.raw_material_id
     ORDER BY pi.product_id, pi.sort_order, pi.id`
  ).all()

  const ingByProduct: Record<number, any[]> = {}
  for (const ing of (ingredients.results as any[])) {
    if (!ingByProduct[ing.product_id]) ingByProduct[ing.product_id] = []
    ingByProduct[ing.product_id].push(ing)
  }

  const list = (products.results as any[]).map(p => {
    const ings = ingByProduct[p.id] || []
    // buildable = floor(min over ingredients of (raw.quantity / qty_required))
    let buildable: number | null = null
    let cost_per_unit = 0
    let any_missing = false
    for (const ing of ings) {
      const need = parseFloat(ing.quantity_required) || 0
      const have = parseFloat(ing.raw_quantity) || 0
      const rate = parseFloat(ing.raw_rate) || 0
      cost_per_unit += need * rate
      if (need <= 0) continue
      if (ing.raw_material_id == null) { any_missing = true; continue }
      const can = have / need
      if (buildable === null || can < buildable) buildable = can
    }
    if (ings.length === 0) buildable = 0
    if (any_missing) buildable = 0
    return {
      ...p,
      ingredients: ings,
      buildable_units: buildable === null ? 0 : Math.floor(buildable),
      cost_per_unit
    }
  })
  return c.json({ products: list })
})

app.get('/api/products/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first()
  if (!product) return c.json({ error: 'Not found' }, 404)
  const ingredients = await c.env.DB.prepare(
    `SELECT pi.*, rm.name as raw_name, rm.unit as raw_unit, rm.quantity as raw_quantity, rm.rate as raw_rate
     FROM product_ingredients pi
     LEFT JOIN raw_materials rm ON rm.id = pi.raw_material_id
     WHERE pi.product_id = ?
     ORDER BY pi.sort_order ASC, pi.id ASC`
  ).bind(id).all()
  return c.json({ product, ingredients: ingredients.results })
})

async function syncProductIngredients(env: any, productId: number, ingredients: any[]) {
  await env.DB.prepare('DELETE FROM product_ingredients WHERE product_id = ?').bind(productId).run()
  if (!Array.isArray(ingredients)) return
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]
    if (!ing || !ing.raw_material_id) continue
    const qty = parseFloat(ing.quantity_required) || 0
    if (qty <= 0) continue
    // Get the raw material's unit as a snapshot
    const rm = await env.DB.prepare('SELECT unit FROM raw_materials WHERE id = ?').bind(ing.raw_material_id).first() as any
    const unit = ing.unit || rm?.unit || ''
    await env.DB.prepare(
      `INSERT INTO product_ingredients (product_id, raw_material_id, quantity_required, unit, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(productId, ing.raw_material_id, qty, unit, i).run()
  }
}

app.post('/api/products', requireAuth, async (c) => {
  const { name, unit, category, notes, sale_rate, ingredients } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    `INSERT INTO products (name, unit, category, notes, sale_rate) VALUES (?, ?, ?, ?, ?)`
  ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(sale_rate) || 0).run()
  const productId = result.meta.last_row_id as number
  await syncProductIngredients(c.env, productId, ingredients || [])
  return c.json({ id: productId })
})

app.put('/api/products/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const { name, unit, category, notes, sale_rate, ingredients } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  await c.env.DB.prepare(
    `UPDATE products SET name=?, unit=?, category=?, notes=?, sale_rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(sale_rate) || 0, id).run()
  await syncProductIngredients(c.env, id, ingredients || [])
  return c.json({ success: true })
})

app.delete('/api/products/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// "Build" / produce N units of a product: deducts raw materials and (optionally) adds to inventory.
app.post('/api/products/:id/build', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const { units, add_to_inventory } = await c.req.json()
  const u = parseFloat(units)
  if (!u || u <= 0) return c.json({ error: 'Units must be > 0' }, 400)

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(id).first() as any
  if (!product) return c.json({ error: 'Product not found' }, 404)

  const ingsRes = await c.env.DB.prepare(
    `SELECT pi.*, rm.name as raw_name, rm.quantity as raw_quantity
     FROM product_ingredients pi LEFT JOIN raw_materials rm ON rm.id = pi.raw_material_id
     WHERE pi.product_id = ?`
  ).bind(id).all()
  const ings = ingsRes.results as any[]
  if (ings.length === 0) return c.json({ error: 'This product has no recipe yet' }, 400)

  // Pre-check: enough stock?
  for (const ing of ings) {
    const need = (parseFloat(ing.quantity_required) || 0) * u
    const have = parseFloat(ing.raw_quantity) || 0
    if (need > have) {
      return c.json({
        error: `Not enough "${ing.raw_name}" (need ${need}, have ${have})`
      }, 400)
    }
  }

  // Deduct raw materials
  for (const ing of ings) {
    const need = (parseFloat(ing.quantity_required) || 0) * u
    await c.env.DB.prepare(
      `UPDATE raw_materials SET quantity = quantity - ?, total_value = (quantity - ?) * rate, updated_at=CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(need, need, ing.raw_material_id).run()
  }

  // Optionally add finished units to inventory (matching by name)
  if (add_to_inventory) {
    const existing = await c.env.DB.prepare(
      'SELECT id FROM inventory WHERE name = ? COLLATE NOCASE'
    ).bind(product.name).first() as any
    if (existing) {
      await c.env.DB.prepare(
        'UPDATE inventory SET quantity = quantity + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?'
      ).bind(u, existing.id).run()
    } else {
      await c.env.DB.prepare(
        'INSERT INTO inventory (name, unit, rate, quantity, category, notes) VALUES (?, ?, ?, ?, ?, ?)'
      ).bind(product.name, product.unit || 'pcs', parseFloat(product.sale_rate) || 0, u, product.category || '', product.notes || '').run()
    }
  }

  return c.json({ success: true, units_built: u, added_to_inventory: !!add_to_inventory })
})

// ============ EMPLOYEES ============
app.get('/api/employees', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT e.*,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_amount,
       (SELECT COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END),0)
          FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_paid,
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
  const items = await c.env.DB.prepare(
    'SELECT * FROM employee_items WHERE employee_id = ? ORDER BY sort_order ASC, id ASC'
  ).bind(id).all()
  return c.json({ employee: emp, transactions: tx.results, items: items.results })
})

async function syncEmployeeItems(env: any, empId: number, items: any[]) {
  await env.DB.prepare('DELETE FROM employee_items WHERE employee_id = ?').bind(empId).run()
  if (!Array.isArray(items)) return
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (!it || !it.item_name) continue
    await env.DB.prepare(
      'INSERT INTO employee_items (employee_id, item_name, rate, sort_order) VALUES (?, ?, ?, ?)'
    ).bind(empId, it.item_name, parseFloat(it.rate) || 0, i).run()
  }
}

app.post('/api/employees', requireAuth, async (c) => {
  const { name, phone, cnic, address, designation, joining_date, monthly_salary, notes, salary_type, items } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const sType = salary_type === 'per_piece' ? 'per_piece' : 'monthly'
  const result = await c.env.DB.prepare(
    `INSERT INTO employees (name, phone, cnic, address, designation, joining_date, monthly_salary, notes, salary_type)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, phone || '', cnic || '', address || '', designation || '', joining_date || '', parseFloat(monthly_salary) || 0, notes || '', sType).run()
  const empId = result.meta.last_row_id as number
  if (sType === 'per_piece') await syncEmployeeItems(c.env, empId, items || [])
  return c.json({ id: empId })
})

app.put('/api/employees/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const { name, phone, cnic, address, designation, joining_date, monthly_salary, notes, active, salary_type, items } = await c.req.json()
  const sType = salary_type === 'per_piece' ? 'per_piece' : 'monthly'
  await c.env.DB.prepare(
    `UPDATE employees SET name=?, phone=?, cnic=?, address=?, designation=?, joining_date=?, monthly_salary=?, notes=?, active=?, salary_type=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, phone || '', cnic || '', address || '', designation || '', joining_date || '', parseFloat(monthly_salary) || 0, notes || '', active === 0 ? 0 : 1, sType, id).run()
  if (sType === 'per_piece') await syncEmployeeItems(c.env, id, items || [])
  else await c.env.DB.prepare('DELETE FROM employee_items WHERE employee_id = ?').bind(id).run()
  return c.json({ success: true })
})

app.delete('/api/employees/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM employees WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

app.post('/api/employee-transactions', requireAuth, async (c) => {
  const body = await c.req.json()
  const { employee_id, entry_date, type, amount, description, entry_type, item_id, item_name, quantity, rate, paid_amount } = body
  if (!employee_id || !type) return c.json({ error: 'employee_id & type required' }, 400)
  const eType = entry_type === 'per_piece' ? 'per_piece' : 'cash'
  let amt = parseFloat(amount) || 0
  const qty = parseFloat(quantity) || 0
  const r = parseFloat(rate) || 0
  if (eType === 'per_piece') amt = qty * r
  // paid_amount: how much was actually paid out of the total amount.
  // Only meaningful for type='salary'. NULL means "fully paid" (legacy behaviour).
  let paid: number | null = null
  if (type === 'salary' && paid_amount !== undefined && paid_amount !== null && paid_amount !== '') {
    paid = parseFloat(paid_amount)
    if (isNaN(paid)) paid = null
  }
  const result = await c.env.DB.prepare(
    `INSERT INTO employee_transactions (employee_id, entry_date, type, amount, description, entry_type, item_id, item_name, quantity, rate, paid_amount) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    employee_id, entry_date || new Date().toISOString().slice(0, 10), type, amt, description || '',
    eType, item_id || null, item_name || '', qty, r, paid
  ).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/employee-transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const { entry_date, type, amount, description, entry_type, item_id, item_name, quantity, rate, paid_amount } = body
  const eType = entry_type === 'per_piece' ? 'per_piece' : 'cash'
  let amt = parseFloat(amount) || 0
  const qty = parseFloat(quantity) || 0
  const r = parseFloat(rate) || 0
  if (eType === 'per_piece') amt = qty * r
  let paid: number | null = null
  if (type === 'salary' && paid_amount !== undefined && paid_amount !== null && paid_amount !== '') {
    paid = parseFloat(paid_amount)
    if (isNaN(paid)) paid = null
  }
  await c.env.DB.prepare(
    `UPDATE employee_transactions SET entry_date=?, type=?, amount=?, description=?, 
     entry_type=?, item_id=?, item_name=?, quantity=?, rate=?, paid_amount=? WHERE id=?`
  ).bind(entry_date, type, amt, description || '', eType, item_id || null, item_name || '', qty, r, paid, id).run()
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
         empCount, empPaid, empAdvance, expenseStats, rawStats, customSecCount,
         rawList, empList, expenseList, profitStats, productList, invMfgList] = await Promise.all([
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
    c.env.DB.prepare(`SELECT 
       COALESCE(SUM(amount),0) as total_amount,
       COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END),0) as total_paid,
       COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN 0 ELSE (amount - paid_amount) END),0) as total_remaining
       FROM employee_transactions WHERE type='salary'`).first(),
    c.env.DB.prepare(`SELECT COALESCE(SUM(amount),0) as a FROM employee_transactions WHERE type='advance'`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total FROM side_expenses`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(total_value),0) as total, COALESCE(SUM(quantity),0) as qty FROM raw_materials`).first(),
    c.env.DB.prepare(`SELECT COUNT(*) as c FROM custom_sections`).first(),
    // Per-section breakdowns
    c.env.DB.prepare(`
      SELECT id, name, unit, quantity, rate, total_value, supplier_name
      FROM raw_materials ORDER BY name ASC
    `).all(),
    c.env.DB.prepare(`
      SELECT e.id, e.name, e.designation, e.monthly_salary, e.salary_type, e.active,
        (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_amount,
        (SELECT COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END),0)
           FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_paid,
        (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='advance') as total_advance,
        (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='bonus') as total_bonus,
        (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='deduction') as total_deduction
      FROM employees e ORDER BY e.name
    `).all(),
    c.env.DB.prepare(`
      SELECT id, entry_date, category, description, amount, paid_to
      FROM side_expenses ORDER BY entry_date DESC, id DESC LIMIT 50
    `).all(),
    // Net profit stats (sum of bills.net_profit)
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(net_profit), 0) as total_profit,
        COALESCE(SUM(CASE WHEN bill_date >= date('now','start of month') THEN net_profit ELSE 0 END), 0) as profit_this_month,
        COALESCE(SUM(CASE WHEN bill_date = date('now') THEN net_profit ELSE 0 END), 0) as profit_today
      FROM bills
    `).first(),
    // Products / Manufacturing summary
    c.env.DB.prepare(`SELECT id, name, unit, sale_rate FROM products ORDER BY name ASC`).all(),
    // Inventory items with manufacturing cost (used for "Products / Manufacturing" summary on dashboard)
    c.env.DB.prepare(`
      SELECT id, name, sku, unit, rate, quantity, manufacturing_cost, category
      FROM inventory
      ORDER BY name ASC
    `).all()
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
    customSecCount: customSecCount?.c || 0,
    rawList: rawList.results,
    empList: empList.results,
    expenseList: expenseList.results,
    empPaidStats: empPaid,
    profitStats,
    productList: productList.results,
    invMfgList: invMfgList.results
  })
})

// ============ CALENDAR ============
// Returns daily summary for a given month: received, expenses, salary paid, advance, bills count
// Optionally filter by employee_id for the employee detail calendar
app.get('/api/calendar', requireAuth, async (c) => {
  const month = c.req.query('month') || new Date().toISOString().slice(0, 7) // YYYY-MM
  const employeeId = c.req.query('employee_id')
  const start = `${month}-01`
  // Compute end of month
  const [yStr, mStr] = month.split('-')
  const y = parseInt(yStr), m = parseInt(mStr)
  const lastDay = new Date(y, m, 0).getDate()
  const end = `${month}-${String(lastDay).padStart(2, '0')}`

  if (employeeId) {
    // Per-employee: salary paid + advance + bonus + deduction by date
    const empDaily = await c.env.DB.prepare(`
      SELECT entry_date, type,
             COALESCE(SUM(amount),0) as total_amount,
             COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END),0) as total_paid
      FROM employee_transactions
      WHERE employee_id = ? AND entry_date >= ? AND entry_date <= ?
      GROUP BY entry_date, type
    `).bind(employeeId, start, end).all()
    // Build daily map
    const daily: any = {}
    for (const r of (empDaily.results as any[])) {
      const d = r.entry_date
      if (!daily[d]) daily[d] = { date: d, salary_paid: 0, advance: 0, bonus: 0, deduction: 0 }
      if (r.type === 'salary') daily[d].salary_paid += parseFloat(r.total_paid) || 0
      else if (r.type === 'advance') daily[d].advance += parseFloat(r.total_amount) || 0
      else if (r.type === 'bonus') daily[d].bonus += parseFloat(r.total_amount) || 0
      else if (r.type === 'deduction') daily[d].deduction += parseFloat(r.total_amount) || 0
    }
    // Month totals
    const totals = Object.values(daily).reduce((s: any, d: any) => ({
      salary_paid: s.salary_paid + d.salary_paid,
      advance: s.advance + d.advance,
      bonus: s.bonus + d.bonus,
      deduction: s.deduction + d.deduction
    }), { salary_paid: 0, advance: 0, bonus: 0, deduction: 0 })
    return c.json({ month, daily: Object.values(daily), totals, type: 'employee' })
  }

  // Global daily: received, billed, expenses, salary paid, net profit
  const [txDaily, billDaily, expenseDaily, empDaily] = await Promise.all([
    c.env.DB.prepare(`
      SELECT entry_date,
             COALESCE(SUM(amount_received),0) as received,
             COALESCE(SUM(amount_pending),0) as pending,
             COUNT(*) as tx_count
      FROM transactions
      WHERE entry_date >= ? AND entry_date <= ?
      GROUP BY entry_date
    `).bind(start, end).all(),
    c.env.DB.prepare(`
      SELECT bill_date,
             COUNT(*) as bills_count,
             COALESCE(SUM(total),0) as bills_total,
             COALESCE(SUM(paid),0) as bills_paid,
             COALESCE(SUM(net_profit),0) as net_profit
      FROM bills
      WHERE bill_date >= ? AND bill_date <= ?
      GROUP BY bill_date
    `).bind(start, end).all(),
    c.env.DB.prepare(`
      SELECT entry_date,
             COALESCE(SUM(amount),0) as expenses
      FROM side_expenses
      WHERE entry_date >= ? AND entry_date <= ?
      GROUP BY entry_date
    `).bind(start, end).all(),
    c.env.DB.prepare(`
      SELECT entry_date, type,
             COALESCE(SUM(amount),0) as total_amount,
             COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END),0) as total_paid
      FROM employee_transactions
      WHERE entry_date >= ? AND entry_date <= ?
      GROUP BY entry_date, type
    `).bind(start, end).all()
  ])

  const daily: any = {}
  const ensure = (d: string) => {
    if (!daily[d]) daily[d] = { date: d, received: 0, pending: 0, tx_count: 0,
                                bills_count: 0, bills_total: 0, bills_paid: 0,
                                expenses: 0, salary_paid: 0, advance: 0, net_profit: 0 }
    return daily[d]
  }
  for (const r of (txDaily.results as any[])) {
    const d = ensure(r.entry_date)
    d.received = parseFloat(r.received) || 0
    d.pending = parseFloat(r.pending) || 0
    d.tx_count = r.tx_count || 0
  }
  for (const r of (billDaily.results as any[])) {
    const d = ensure(r.bill_date)
    d.bills_count = r.bills_count || 0
    d.bills_total = parseFloat(r.bills_total) || 0
    d.bills_paid = parseFloat(r.bills_paid) || 0
    d.net_profit = parseFloat(r.net_profit) || 0
  }
  for (const r of (expenseDaily.results as any[])) {
    const d = ensure(r.entry_date)
    d.expenses = parseFloat(r.expenses) || 0
  }
  for (const r of (empDaily.results as any[])) {
    const d = ensure(r.entry_date)
    if (r.type === 'salary') d.salary_paid += parseFloat(r.total_paid) || 0
    else if (r.type === 'advance') d.advance += parseFloat(r.total_amount) || 0
  }
  const list: any[] = Object.values(daily)
  const totals = list.reduce((s: any, d: any) => ({
    received: s.received + d.received,
    bills_count: s.bills_count + d.bills_count,
    bills_total: s.bills_total + d.bills_total,
    expenses: s.expenses + d.expenses,
    salary_paid: s.salary_paid + d.salary_paid,
    advance: s.advance + d.advance,
    net_profit: s.net_profit + d.net_profit
  }), { received: 0, bills_count: 0, bills_total: 0, expenses: 0, salary_paid: 0, advance: 0, net_profit: 0 })
  return c.json({ month, daily: list, totals, type: 'global' })
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
<script src="/static/app.js" defer></script>
</body>
</html>`)
})

export default app
