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
      "INSERT INTO branding (id, company_name, crm_name) VALUES (1, 'Two Star Industries', 'Two Star Essentials')"
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
    b.crm_name || 'Two Star Essentials',
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
  const { name, icon, color, section_type, ledger_type } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const lt = (ledger_type === 'supplier') ? 'supplier' : 'customer'
  const result = await c.env.DB.prepare(
    'INSERT INTO folders (name, icon, color, section_type, ledger_type) VALUES (?, ?, ?, ?, ?)'
  ).bind(name, icon || 'fa-folder', color || '#3b82f6', section_type || 'clients', lt).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, icon, color, ledger_type } = await c.req.json()
  if (ledger_type === 'customer' || ledger_type === 'supplier') {
    await c.env.DB.prepare(
      'UPDATE folders SET name = ?, icon = ?, color = ?, ledger_type = ? WHERE id = ?'
    ).bind(name, icon, color, ledger_type, id).run()
  } else {
    await c.env.DB.prepare(
      'UPDATE folders SET name = ?, icon = ?, color = ? WHERE id = ?'
    ).bind(name, icon, color, id).run()
  }
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

// ============ INVENTORY MOVEMENTS (sold / returned / adjusted) ============
// IMPORTANT: these /api/inventory/movements* routes must be declared BEFORE the
// /api/inventory/:id routes, otherwise Hono would match "movements" as :id.
// Recent entries log so the user can see, day by day, how many items were
// sold / returned and which item. Each movement also updates the product's stock.
app.get('/api/inventory/movements', requireAuth, async (c) => {
  const invId = c.req.query('inventory_id')
  const limit = parseInt(c.req.query('limit') || '50')
  let rows
  if (invId) {
    rows = await c.env.DB.prepare(
      `SELECT m.*, i.name as item_name FROM inventory_movements m
       LEFT JOIN inventory i ON i.id = m.inventory_id
       WHERE m.inventory_id = ?
       ORDER BY m.entry_date DESC, m.id DESC LIMIT ?`
    ).bind(invId, limit).all()
  } else {
    rows = await c.env.DB.prepare(
      `SELECT m.*, i.name as item_name FROM inventory_movements m
       LEFT JOIN inventory i ON i.id = m.inventory_id
       ORDER BY m.entry_date DESC, m.id DESC LIMIT ?`
    ).bind(limit).all()
  }
  return c.json({ movements: rows.results })
})

app.post('/api/inventory/movements', requireAuth, async (c) => {
  const body = await c.req.json()
  const inventory_id = parseInt(body.inventory_id)
  if (!inventory_id) return c.json({ error: 'inventory_id required' }, 400)
  const type = ['sale', 'return', 'adjust', 'restock'].includes(body.type) ? body.type : 'sale'
  const quantity = Math.abs(parseFloat(body.quantity) || 0)
  if (quantity <= 0) return c.json({ error: 'quantity must be > 0' }, 400)

  const item = await c.env.DB.prepare('SELECT * FROM inventory WHERE id = ?').bind(inventory_id).first() as any
  if (!item) return c.json({ error: 'Product not found' }, 404)

  const rate = parseFloat(body.rate) || parseFloat(item.rate) || 0
  const total = quantity * rate
  const entry_date = body.entry_date || new Date().toISOString().slice(0, 10)

  // Stock direction: sale = decrease, return/restock = increase, adjust = use sign of body.direction ('in'/'out')
  let delta = 0
  if (type === 'sale') delta = -quantity
  else if (type === 'return') delta = quantity
  else if (type === 'restock') delta = quantity
  else if (type === 'adjust') delta = (body.direction === 'out') ? -quantity : quantity

  // Supplier info for restock
  const supplier_id = body.supplier_id ? parseInt(body.supplier_id) : null
  const supplier_name = body.supplier_name || ''

  await c.env.DB.prepare(
    `INSERT INTO inventory_movements (inventory_id, product_name, entry_date, type, quantity, rate, total, customer_name, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(inventory_id, item.name, entry_date, type, quantity, rate, total,
    type === 'restock' ? (supplier_name || body.customer_name || '') : (body.customer_name || ''),
    body.notes || '').run()

  await c.env.DB.prepare(
    `UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`
  ).bind(delta, inventory_id).run()

  // If restock has a linked supplier client, create a ledger entry in their transactions
  if (type === 'restock' && supplier_id && total > 0) {
    // Verify the supplier/client exists
    const supplier = await c.env.DB.prepare('SELECT id FROM clients WHERE id = ?').bind(supplier_id).first() as any
    if (supplier) {
      const desc = `Restock: ${item.name} × ${quantity} units @ PKR ${rate}`
      await c.env.DB.prepare(
        `INSERT INTO transactions (client_id, entry_date, bill_no, amount_received, amount_pending, status, description)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(supplier_id, entry_date, '', 0, total, 'Pending', desc).run()
    }
  }

  return c.json({ success: true })
})

app.delete('/api/inventory/movements/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const mov = await c.env.DB.prepare('SELECT * FROM inventory_movements WHERE id = ?').bind(id).first() as any
  if (!mov) return c.json({ error: 'Not found' }, 404)
  // Reverse the stock effect before deleting
  let reverse = 0
  if (mov.type === 'sale') reverse = mov.quantity            // add back what was sold
  else if (mov.type === 'return') reverse = -mov.quantity    // remove what was returned
  else if (mov.type === 'restock') reverse = -mov.quantity   // remove what was restocked
  else reverse = 0 // adjust: leave stock as-is to avoid wrong guesses
  if (reverse !== 0) {
    await c.env.DB.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .bind(reverse, mov.inventory_id).run()
  }
  await c.env.DB.prepare('DELETE FROM inventory_movements WHERE id = ?').bind(id).run()
  return c.json({ success: true })
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

// ============ CUSTOMER PRODUCT RATES (#3 per-customer selling price) ============
// Manufacturing rate is same for everyone, but the SELLING rate can differ per
// customer. Here the user saves "for THIS customer, THIS product is sold at THIS
// rate". When a bill is made for that customer, the saved rate auto-fills.

// All special rates for one customer (joined with inventory product info)
app.get('/api/clients/:id/product-rates', requireAuth, async (c) => {
  const clientId = c.req.param('id')
  const rows = await c.env.DB.prepare(`
    SELECT cpr.id, cpr.inventory_id, cpr.rate,
           inv.name as product_name, inv.unit as product_unit,
           inv.rate as default_rate, inv.sku
    FROM customer_product_rates cpr
    LEFT JOIN inventory inv ON inv.id = cpr.inventory_id
    WHERE cpr.client_id = ?
    ORDER BY inv.name ASC
  `).bind(clientId).all()
  return c.json({ rates: rows.results })
})

// Save (upsert) a special rate for a customer+product
app.post('/api/clients/:id/product-rates', requireAuth, async (c) => {
  const clientId = parseInt(c.req.param('id'))
  const { inventory_id, rate } = await c.req.json()
  if (!inventory_id) return c.json({ error: 'Product required' }, 400)
  const r = parseFloat(rate) || 0
  await c.env.DB.prepare(`
    INSERT INTO customer_product_rates (client_id, inventory_id, rate)
    VALUES (?, ?, ?)
    ON CONFLICT(client_id, inventory_id)
    DO UPDATE SET rate = excluded.rate, updated_at = CURRENT_TIMESTAMP
  `).bind(clientId, inventory_id, r).run()
  return c.json({ success: true })
})

// Delete a special rate (revert to default)
app.delete('/api/clients/:id/product-rates/:rid', requireAuth, async (c) => {
  const clientId = c.req.param('id')
  const rid = c.req.param('rid')
  await c.env.DB.prepare('DELETE FROM customer_product_rates WHERE id = ? AND client_id = ?').bind(rid, clientId).run()
  return c.json({ success: true })
})

// Lookup a single customer's saved rate map { inventory_id: rate } — used by the bill builder
app.get('/api/clients/:id/rate-map', requireAuth, async (c) => {
  const clientId = c.req.param('id')
  const rows = await c.env.DB.prepare(
    'SELECT inventory_id, rate FROM customer_product_rates WHERE client_id = ?'
  ).bind(clientId).all()
  const map: Record<string, number> = {}
  for (const r of (rows.results as any[])) map[String(r.inventory_id)] = parseFloat(r.rate) || 0
  return c.json({ rateMap: map })
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
//
// IMPORTANT: A raw material can have MULTIPLE suppliers (each batch/purchase
// can be sourced from a different supplier). Each purchase is recorded in
// the `raw_material_purchases` table. The supplier's "amount_pending" on
// the raw material itself is the LATEST/primary supplier (legacy field).
//
// Suppliers are clients (in any folder). When a purchase is recorded with
// a paid_amount, the REMAINING (total - paid) is auto-pushed to the
// supplier's ledger as an entry that we OWE the supplier.
// In ledger terms (we are the business):
//   - "amount_received" = how much money WE GAVE the supplier (we paid them)
//   - "amount_pending"  = how much we still OWE the supplier (the bill amount)
// This way the supplier ledger Remaining Balance = (we owe) - (we paid)
// and a positive remaining means we still owe them.

// Helper: sync a raw-material purchase to the supplier's ledger.
// Auto-creates / updates a transaction in transactions table for that supplier.
async function syncRawPurchaseLedger(env: any, purchaseId: number, p: any) {
  // p = { supplier_id, supplier_name, entry_date, total_amount, paid_amount, raw_name, quantity, unit, rate, ... }
  if (!p.supplier_id) {
    // If previously linked, drop it
    const old = await env.DB.prepare('SELECT ledger_transaction_id FROM raw_material_purchases WHERE id = ?').bind(purchaseId).first() as any
    if (old?.ledger_transaction_id) {
      await env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(old.ledger_transaction_id).run()
      await env.DB.prepare('UPDATE raw_material_purchases SET ledger_transaction_id = NULL WHERE id = ?').bind(purchaseId).run()
    }
    return
  }
  const total = parseFloat(p.total_amount) || 0
  const paid = parseFloat(p.paid_amount) || 0
  const due = total - paid
  // Status (supplier ledger): Paid = we fully paid them, Partial = some paid, Pending = nothing paid
  const status = due <= 0 ? 'Paid' : (paid > 0 ? 'Partial' : 'Pending')
  // Description shows what was bought
  const desc = `Raw Material Purchase: ${p.raw_name || ''} — ${p.quantity || 0} ${p.unit || ''} @ PKR ${p.rate || 0}`

  // Find existing linked transaction
  const existing = await env.DB.prepare('SELECT ledger_transaction_id FROM raw_material_purchases WHERE id = ?').bind(purchaseId).first() as any
  if (existing?.ledger_transaction_id) {
    const tx = await env.DB.prepare('SELECT * FROM transactions WHERE id = ?').bind(existing.ledger_transaction_id).first() as any
    if (tx) {
      await env.DB.prepare(
        `UPDATE transactions SET client_id=?, entry_date=?, amount_pending=?, amount_received=?, status=?, description=?
         WHERE id = ?`
      ).bind(p.supplier_id, p.entry_date, total, paid, status, desc, existing.ledger_transaction_id).run()
      return
    }
  }
  // Insert new ledger row in supplier's ledger
  // amount_pending = total bill (we owe), amount_received = how much WE paid them
  const result = await env.DB.prepare(
    `INSERT INTO transactions (client_id, entry_date, bill_no, amount_received, amount_pending, status, description, rm_purchase_id, auto_generated)
     VALUES (?, ?, '', ?, ?, ?, ?, ?, 1)`
  ).bind(p.supplier_id, p.entry_date, paid, total, status, desc, purchaseId).run()
  await env.DB.prepare('UPDATE raw_material_purchases SET ledger_transaction_id = ? WHERE id = ?').bind(result.meta.last_row_id, purchaseId).run()
}

// Recompute the raw material's aggregate (quantity, weighted-avg rate, total_value)
// from its underlying purchase rows. Keeps `supplier_id` / `supplier_name` as the
// LAST (most recent) purchase's supplier (for display in the legacy column).
async function recomputeRawMaterialFromPurchases(env: any, rawId: number) {
  const purchases = await env.DB.prepare(
    'SELECT * FROM raw_material_purchases WHERE raw_material_id = ? ORDER BY entry_date ASC, id ASC'
  ).bind(rawId).all()
  const rows = (purchases.results as any[]) || []
  let totalQty = 0
  let totalValue = 0
  for (const r of rows) {
    const q = parseFloat(r.quantity) || 0
    const rt = parseFloat(r.rate) || 0
    totalQty += q
    totalValue += q * rt
  }
  const avgRate = totalQty > 0 ? (totalValue / totalQty) : 0
  // Latest supplier
  const last: any = rows.length > 0 ? rows[rows.length - 1] : null
  await env.DB.prepare(
    `UPDATE raw_materials SET quantity=?, rate=?, total_value=?, supplier_id=?, supplier_name=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(totalQty, avgRate, totalValue, last ? (last.supplier_id || null) : null, last ? (last.supplier_name || '') : '', rawId).run()
}

app.get('/api/raw-materials', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT rm.*, cl.name as supplier_name_resolved 
     FROM raw_materials rm LEFT JOIN clients cl ON cl.id = rm.supplier_id
     ORDER BY rm.name ASC`
  ).all()
  // For each material, also fetch a list of suppliers (distinct)
  const items = result.results as any[]
  if (items.length > 0) {
    const ids = items.map(i => i.id)
    const placeholders = ids.map(() => '?').join(',')
    const purchases = await c.env.DB.prepare(
      `SELECT rmp.raw_material_id, rmp.supplier_id, rmp.supplier_name,
              cl.name as supplier_name_resolved,
              SUM(rmp.total_amount) as total_amount,
              SUM(rmp.paid_amount) as paid_amount,
              SUM(rmp.remaining_amount) as remaining_amount,
              COUNT(*) as purchase_count
       FROM raw_material_purchases rmp
       LEFT JOIN clients cl ON cl.id = rmp.supplier_id
       WHERE rmp.raw_material_id IN (${placeholders})
       GROUP BY rmp.raw_material_id, rmp.supplier_id, rmp.supplier_name`
    ).bind(...ids).all()
    const supBy: Record<number, any[]> = {}
    for (const p of (purchases.results as any[])) {
      const k = p.raw_material_id
      if (!supBy[k]) supBy[k] = []
      supBy[k].push(p)
    }
    for (const it of items) {
      it.suppliers = supBy[it.id] || []
    }
  }
  return c.json({ items })
})

// Get a single raw material with full purchase/batch history
app.get('/api/raw-materials/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const item = await c.env.DB.prepare(
    `SELECT rm.*, cl.name as supplier_name_resolved
     FROM raw_materials rm LEFT JOIN clients cl ON cl.id = rm.supplier_id
     WHERE rm.id = ?`
  ).bind(id).first()
  if (!item) return c.json({ error: 'Not found' }, 404)
  const purchases = await c.env.DB.prepare(
    `SELECT rmp.*, cl.name as supplier_name_resolved
     FROM raw_material_purchases rmp
     LEFT JOIN clients cl ON cl.id = rmp.supplier_id
     WHERE rmp.raw_material_id = ?
     ORDER BY rmp.entry_date DESC, rmp.id DESC`
  ).bind(id).all()
  return c.json({ item, purchases: purchases.results })
})

app.post('/api/raw-materials', requireAuth, async (c) => {
  const body = await c.req.json()
  const { name, unit, quantity, rate, supplier_id, supplier_name, category, notes,
          merge_mode, target_id, paid_amount, entry_date } = body
  if (!name) return c.json({ error: 'Name required' }, 400)
  const q = parseFloat(quantity) || 0, r = parseFloat(rate) || 0
  const u = unit || 'pcs'
  const sid = supplier_id || null
  const sname = supplier_name || ''
  const total = q * r
  const paid = parseFloat(paid_amount) || 0
  const remaining = Math.max(0, total - paid)
  const eDate = entry_date || new Date().toISOString().slice(0, 10)

  // Helper to record purchase batch + sync supplier ledger
  const recordPurchase = async (rawId: number) => {
    if (q <= 0) return // nothing actually purchased — skip batch entry
    const ins = await c.env.DB.prepare(
      `INSERT INTO raw_material_purchases (raw_material_id, supplier_id, supplier_name, entry_date,
                                           quantity, rate, total_amount, paid_amount, remaining_amount, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(rawId, sid, sname, eDate, q, r, total, paid, remaining, notes || '').run()
    const purchaseId = ins.meta.last_row_id as number
    await syncRawPurchaseLedger(c.env, purchaseId, {
      supplier_id: sid, supplier_name: sname, entry_date: eDate,
      total_amount: total, paid_amount: paid,
      raw_name: name, quantity: q, unit: u, rate: r
    })
    return purchaseId
  }

  // If client explicitly asks to merge into a specific existing material, do that
  if (target_id) {
    const existing = await c.env.DB.prepare('SELECT * FROM raw_materials WHERE id = ?').bind(target_id).first() as any
    if (existing) {
      await recordPurchase(target_id)
      await recomputeRawMaterialFromPurchases(c.env, target_id)
      return c.json({ id: target_id, merged: true })
    }
  }

  // Auto-merge by (name + unit). We allow multiple suppliers, so we DON'T
  // require supplier match anymore — same material name+unit = same item.
  if (merge_mode !== 'force_new') {
    const dup = await c.env.DB.prepare(
      `SELECT * FROM raw_materials WHERE LOWER(TRIM(name)) = LOWER(TRIM(?)) AND LOWER(TRIM(unit)) = LOWER(TRIM(?)) LIMIT 1`
    ).bind(name, u).first() as any
    if (dup) {
      await recordPurchase(dup.id)
      // Update name/category/notes if user changed them, then recompute
      await c.env.DB.prepare(
        `UPDATE raw_materials SET category=COALESCE(NULLIF(?, ''), category), notes=COALESCE(NULLIF(?, ''), notes) WHERE id=?`
      ).bind(category || '', notes || '', dup.id).run()
      await recomputeRawMaterialFromPurchases(c.env, dup.id)
      return c.json({ id: dup.id, merged: true })
    }
  }

  // Create brand new material
  const result = await c.env.DB.prepare(
    `INSERT INTO raw_materials (name, unit, quantity, rate, total_value, supplier_id, supplier_name, category, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, u, 0, 0, 0, sid, sname, category || '', notes || '').run()
  const newId = result.meta.last_row_id as number
  await recordPurchase(newId)
  await recomputeRawMaterialFromPurchases(c.env, newId)
  return c.json({ id: newId })
})

// Restock helper: add a new purchase batch to an existing raw material with optional supplier payment.
app.post('/api/raw-materials/:id/restock', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const { quantity, rate, supplier_id, supplier_name, paid_amount, entry_date, notes } = body
  const addQty = parseFloat(quantity) || 0
  const addRate = parseFloat(rate) || 0
  if (addQty <= 0) return c.json({ error: 'Quantity must be > 0' }, 400)
  const existing = await c.env.DB.prepare('SELECT * FROM raw_materials WHERE id = ?').bind(id).first() as any
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const sid = supplier_id || null
  const sname = supplier_name || ''
  const total = addQty * addRate
  const paid = parseFloat(paid_amount) || 0
  const remaining = Math.max(0, total - paid)
  const eDate = entry_date || new Date().toISOString().slice(0, 10)
  const ins = await c.env.DB.prepare(
    `INSERT INTO raw_material_purchases (raw_material_id, supplier_id, supplier_name, entry_date,
                                         quantity, rate, total_amount, paid_amount, remaining_amount, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(id, sid, sname, eDate, addQty, addRate, total, paid, remaining, notes || '').run()
  const purchaseId = ins.meta.last_row_id as number
  await syncRawPurchaseLedger(c.env, purchaseId, {
    supplier_id: sid, supplier_name: sname, entry_date: eDate,
    total_amount: total, paid_amount: paid,
    raw_name: existing.name, quantity: addQty, unit: existing.unit, rate: addRate
  })
  await recomputeRawMaterialFromPurchases(c.env, id)
  return c.json({ success: true, id, purchase_id: purchaseId })
})

// Update an existing purchase batch (rate, qty, supplier, payment)
app.put('/api/raw-material-purchases/:pid', requireAuth, async (c) => {
  const pid = parseInt(c.req.param('pid'))
  const body = await c.req.json()
  const { quantity, rate, supplier_id, supplier_name, paid_amount, entry_date, notes } = body
  const existing = await c.env.DB.prepare('SELECT * FROM raw_material_purchases WHERE id = ?').bind(pid).first() as any
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const q = parseFloat(quantity) || 0, rt = parseFloat(rate) || 0
  const sid = supplier_id || null
  const sname = supplier_name || ''
  const total = q * rt
  const paid = parseFloat(paid_amount) || 0
  const remaining = Math.max(0, total - paid)
  const eDate = entry_date || existing.entry_date
  await c.env.DB.prepare(
    `UPDATE raw_material_purchases SET supplier_id=?, supplier_name=?, entry_date=?,
        quantity=?, rate=?, total_amount=?, paid_amount=?, remaining_amount=?, notes=?, updated_at=CURRENT_TIMESTAMP
     WHERE id=?`
  ).bind(sid, sname, eDate, q, rt, total, paid, remaining, notes || '', pid).run()
  // Get raw name/unit for ledger description
  const rm = await c.env.DB.prepare('SELECT name, unit FROM raw_materials WHERE id = ?').bind(existing.raw_material_id).first() as any
  await syncRawPurchaseLedger(c.env, pid, {
    supplier_id: sid, supplier_name: sname, entry_date: eDate,
    total_amount: total, paid_amount: paid,
    raw_name: rm?.name || '', quantity: q, unit: rm?.unit || '', rate: rt
  })
  await recomputeRawMaterialFromPurchases(c.env, existing.raw_material_id)
  return c.json({ success: true })
})

// Delete a purchase batch (also drops linked supplier ledger row)
app.delete('/api/raw-material-purchases/:pid', requireAuth, async (c) => {
  const pid = parseInt(c.req.param('pid'))
  const existing = await c.env.DB.prepare('SELECT * FROM raw_material_purchases WHERE id = ?').bind(pid).first() as any
  if (!existing) return c.json({ error: 'Not found' }, 404)
  if (existing.ledger_transaction_id) {
    await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(existing.ledger_transaction_id).run()
  }
  await c.env.DB.prepare('DELETE FROM raw_material_purchases WHERE id = ?').bind(pid).run()
  await recomputeRawMaterialFromPurchases(c.env, existing.raw_material_id)
  return c.json({ success: true })
})

// Pay a supplier against one specific purchase batch (adds to paid_amount, reduces remaining,
// and updates the linked ledger row).
app.post('/api/raw-material-purchases/:pid/pay', requireAuth, async (c) => {
  const pid = parseInt(c.req.param('pid'))
  const body = await c.req.json()
  const addPaid = parseFloat(body.amount) || 0
  if (addPaid <= 0) return c.json({ error: 'Amount must be > 0' }, 400)
  const existing = await c.env.DB.prepare('SELECT * FROM raw_material_purchases WHERE id = ?').bind(pid).first() as any
  if (!existing) return c.json({ error: 'Not found' }, 404)
  const total = parseFloat(existing.total_amount) || 0
  const newPaid = (parseFloat(existing.paid_amount) || 0) + addPaid
  const newRemaining = Math.max(0, total - newPaid)
  await c.env.DB.prepare(
    `UPDATE raw_material_purchases SET paid_amount=?, remaining_amount=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(newPaid, newRemaining, pid).run()
  const rm = await c.env.DB.prepare('SELECT name, unit FROM raw_materials WHERE id = ?').bind(existing.raw_material_id).first() as any
  await syncRawPurchaseLedger(c.env, pid, {
    supplier_id: existing.supplier_id, supplier_name: existing.supplier_name,
    entry_date: existing.entry_date,
    total_amount: total, paid_amount: newPaid,
    raw_name: rm?.name || '', quantity: existing.quantity, unit: rm?.unit || '', rate: existing.rate
  })
  return c.json({ success: true, paid_amount: newPaid, remaining_amount: newRemaining })
})

app.put('/api/raw-materials/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, unit, category, notes } = await c.req.json()
  // Only basic fields editable here — quantity/rate/supplier are derived from purchases.
  await c.env.DB.prepare(
    `UPDATE raw_materials SET name=?, unit=?, category=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, unit || 'pcs', category || '', notes || '', id).run()
  return c.json({ success: true })
})

app.delete('/api/raw-materials/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  // Drop linked ledger rows first
  const purchases = await c.env.DB.prepare('SELECT ledger_transaction_id FROM raw_material_purchases WHERE raw_material_id = ?').bind(id).all()
  for (const p of (purchases.results as any[])) {
    if (p.ledger_transaction_id) {
      await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(p.ledger_transaction_id).run()
    }
  }
  await c.env.DB.prepare('DELETE FROM raw_materials WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ PRODUCTS (MANUFACTURING / RECIPES) ============
// A product (e.g. "Rack") is built from raw materials (e.g. A=2kg, B=5ft, C=3kg)
// per 1 finished unit. Using current raw_materials.quantity we compute
// how many finished units can be built right now.

// List all products with their recipe + computed "buildable" count.
// A product recipe can mix RAW MATERIALS (product_ingredients) and
// COMPONENTS (product_components). Buildable = min over all recipe lines.
app.get('/api/products', requireAuth, async (c) => {
  const products = await c.env.DB.prepare('SELECT * FROM products ORDER BY name ASC').all()
  const ingredients = await c.env.DB.prepare(
    `SELECT pi.*, rm.name as raw_name, rm.unit as raw_unit, rm.quantity as raw_quantity, rm.rate as raw_rate
     FROM product_ingredients pi
     LEFT JOIN raw_materials rm ON rm.id = pi.raw_material_id
     ORDER BY pi.product_id, pi.sort_order, pi.id`
  ).all()
  const compLinks = await c.env.DB.prepare(
    `SELECT pc.*, cp.name as comp_name, cp.unit as comp_unit, cp.quantity as comp_quantity, cp.default_rate as comp_rate
     FROM product_components pc
     LEFT JOIN components cp ON cp.id = pc.component_id
     ORDER BY pc.product_id, pc.sort_order, pc.id`
  ).all()

  const ingByProduct: Record<number, any[]> = {}
  for (const ing of (ingredients.results as any[])) {
    if (!ingByProduct[ing.product_id]) ingByProduct[ing.product_id] = []
    ingByProduct[ing.product_id].push(ing)
  }
  const compByProduct: Record<number, any[]> = {}
  for (const pc of (compLinks.results as any[])) {
    if (!compByProduct[pc.product_id]) compByProduct[pc.product_id] = []
    compByProduct[pc.product_id].push(pc)
  }

  // Set items (extra parts added at PACK stage), enriched with current stock.
  const setItems = await c.env.DB.prepare(
    `SELECT * FROM product_set_items ORDER BY product_id, sort_order, id`
  ).all()
  const setByProduct: Record<number, any[]> = {}
  for (const si of (setItems.results as any[])) {
    if (!setByProduct[si.product_id]) setByProduct[si.product_id] = []
    setByProduct[si.product_id].push(si)
  }

  const list = (products.results as any[]).map(p => {
    const ings = ingByProduct[p.id] || []
    const comps = compByProduct[p.id] || []
    const set_items = setByProduct[p.id] || []
    // buildable = floor(min over all recipe lines of (available / qty_required))
    let buildable: number | null = null
    let cost_per_unit = 0
    let any_missing = false
    // Raw material lines
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
    // Component lines
    for (const pc of comps) {
      const need = parseFloat(pc.quantity_required) || 0
      const have = parseFloat(pc.comp_quantity) || 0
      const rate = parseFloat(pc.comp_rate) || 0
      cost_per_unit += need * rate
      if (need <= 0) continue
      if (pc.component_id == null) { any_missing = true; continue }
      const can = have / need
      if (buildable === null || can < buildable) buildable = can
    }
    if (ings.length === 0 && comps.length === 0) buildable = 0
    if (any_missing) buildable = 0
    return {
      ...p,
      ingredients: ings,
      components: comps,
      set_items,
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
  const components = await c.env.DB.prepare(
    `SELECT pc.*, cp.name as comp_name, cp.unit as comp_unit, cp.quantity as comp_quantity, cp.default_rate as comp_rate
     FROM product_components pc
     LEFT JOIN components cp ON cp.id = pc.component_id
     WHERE pc.product_id = ?
     ORDER BY pc.sort_order ASC, pc.id ASC`
  ).bind(id).all()
  const setItems = await c.env.DB.prepare(
    `SELECT * FROM product_set_items WHERE product_id = ? ORDER BY sort_order ASC, id ASC`
  ).bind(id).all()
  const prodLogs = await c.env.DB.prepare(
    `SELECT * FROM product_production_logs WHERE product_id = ? ORDER BY entry_date DESC, id DESC LIMIT 50`
  ).bind(id).all()
  return c.json({ product, ingredients: ingredients.results, components: components.results, set_items: setItems.results, production: prodLogs.results })
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

// Sync the COMPONENT lines of a product recipe (product_components)
async function syncProductComponents(env: any, productId: number, components: any[]) {
  await env.DB.prepare('DELETE FROM product_components WHERE product_id = ?').bind(productId).run()
  if (!Array.isArray(components)) return
  for (let i = 0; i < components.length; i++) {
    const pc = components[i]
    if (!pc || !pc.component_id) continue
    const qty = parseFloat(pc.quantity_required) || 0
    if (qty <= 0) continue
    await env.DB.prepare(
      `INSERT INTO product_components (product_id, component_id, quantity_required, sort_order)
       VALUES (?, ?, ?, ?)`
    ).bind(productId, pc.component_id, qty, i).run()
  }
}

// Sync the SET ITEMS of a product (extra parts added at PACK stage)
async function syncProductSetItems(env: any, productId: number, setItems: any[]) {
  await env.DB.prepare('DELETE FROM product_set_items WHERE product_id = ?').bind(productId).run()
  if (!Array.isArray(setItems)) return
  for (let i = 0; i < setItems.length; i++) {
    const si = setItems[i]
    if (!si) continue
    const qty = parseFloat(si.quantity_required) || 0
    if (qty <= 0) continue
    const sourceType = si.source_type || 'component'
    let name = si.item_name || ''
    let unit = si.unit || 'pcs'
    let sourceId = si.source_id || null
    // Resolve snapshot name + unit from the source table when possible
    if (sourceType === 'component' && sourceId) {
      const cp = await env.DB.prepare('SELECT name, unit FROM components WHERE id = ?').bind(sourceId).first() as any
      if (cp) { name = name || cp.name; unit = cp.unit || unit }
    } else if (sourceType === 'raw' && sourceId) {
      const rm = await env.DB.prepare('SELECT name, unit FROM raw_materials WHERE id = ?').bind(sourceId).first() as any
      if (rm) { name = name || rm.name; unit = rm.unit || unit }
    } else {
      sourceId = null
    }
    if (!name) continue
    await env.DB.prepare(
      `INSERT INTO product_set_items (product_id, source_type, source_id, item_name, unit, quantity_required, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).bind(productId, sourceType, sourceId, name, unit, qty, i).run()
  }
}

app.post('/api/products', requireAuth, async (c) => {
  const { name, unit, category, notes, sale_rate, ingredients, components, set_items, assemble_rate, paint_rate, pack_rate } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    `INSERT INTO products (name, unit, category, notes, sale_rate, assemble_rate, paint_rate, pack_rate) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(sale_rate) || 0,
    parseFloat(assemble_rate) || 0, parseFloat(paint_rate) || 0, parseFloat(pack_rate) || 0).run()
  const productId = result.meta.last_row_id as number
  await syncProductIngredients(c.env, productId, ingredients || [])
  await syncProductComponents(c.env, productId, components || [])
  await syncProductSetItems(c.env, productId, set_items || [])
  return c.json({ id: productId })
})

app.put('/api/products/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const { name, unit, category, notes, sale_rate, ingredients, components, set_items, assemble_rate, paint_rate, pack_rate } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  await c.env.DB.prepare(
    `UPDATE products SET name=?, unit=?, category=?, notes=?, sale_rate=?, assemble_rate=?, paint_rate=?, pack_rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
  ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(sale_rate) || 0,
    parseFloat(assemble_rate) || 0, parseFloat(paint_rate) || 0, parseFloat(pack_rate) || 0, id).run()
  await syncProductIngredients(c.env, id, ingredients || [])
  await syncProductComponents(c.env, id, components || [])
  await syncProductSetItems(c.env, id, set_items || [])
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
  const compRes = await c.env.DB.prepare(
    `SELECT pc.*, cp.name as comp_name, cp.quantity as comp_quantity
     FROM product_components pc LEFT JOIN components cp ON cp.id = pc.component_id
     WHERE pc.product_id = ?`
  ).bind(id).all()
  const comps = compRes.results as any[]
  if (ings.length === 0 && comps.length === 0) return c.json({ error: 'This product has no recipe yet' }, 400)

  // Pre-check: enough raw material stock?
  for (const ing of ings) {
    const need = (parseFloat(ing.quantity_required) || 0) * u
    const have = parseFloat(ing.raw_quantity) || 0
    if (need > have + 1e-9) {
      return c.json({
        error: `Not enough "${ing.raw_name}" (need ${need}, have ${have})`
      }, 400)
    }
  }
  // Pre-check: enough component stock?
  for (const pc of comps) {
    const need = (parseFloat(pc.quantity_required) || 0) * u
    const have = parseFloat(pc.comp_quantity) || 0
    if (need > have + 1e-9) {
      return c.json({
        error: `Not enough component "${pc.comp_name}" (need ${need}, have ${have})`
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
  // Deduct components
  for (const pc of comps) {
    const need = (parseFloat(pc.quantity_required) || 0) * u
    await c.env.DB.prepare(
      `UPDATE components SET quantity = MAX(0, quantity - ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(need, pc.component_id).run()
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

// =====================================================
// ===== PRODUCT MANUFACTURING STAGE PRODUCTION ========
//   Flow:  COMPONENTS  ->  ASSEMBLE  ->  PAINT  ->  PACK (final)
//   Each stage logged by a worker who is paid per piece.
// =====================================================

// List product production logs (optional filters)
app.get('/api/product-production', requireAuth, async (c) => {
  const empId = c.req.query('employee_id')
  const prodId = c.req.query('product_id')
  const stage = c.req.query('stage')
  const from = c.req.query('from')
  const to = c.req.query('to')
  let sql = 'SELECT * FROM product_production_logs WHERE 1=1'
  const binds: any[] = []
  if (empId) { sql += ' AND employee_id = ?'; binds.push(empId) }
  if (prodId) { sql += ' AND product_id = ?'; binds.push(prodId) }
  if (stage) { sql += ' AND stage = ?'; binds.push(stage) }
  if (from) { sql += ' AND entry_date >= ?'; binds.push(from) }
  if (to) { sql += ' AND entry_date <= ?'; binds.push(to) }
  sql += ' ORDER BY entry_date DESC, id DESC'
  const res = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ production: res.results })
})

// Record a product stage production entry.
// body: { entry_date, stage('assemble'|'paint'|'pack'), product_id, employee_id, quantity, rate, deduct, notes }
app.post('/api/product-production', requireAuth, async (c) => {
  const body = await c.req.json()
  const { entry_date, stage, product_id, employee_id, quantity, rate, deduct, notes } = body
  const qty = parseFloat(quantity) || 0
  const validStages = ['assemble', 'paint', 'pack']
  if (!product_id) return c.json({ error: 'Product required' }, 400)
  if (!validStages.includes(stage)) return c.json({ error: 'Invalid stage' }, 400)
  if (qty <= 0) return c.json({ error: 'Quantity must be > 0' }, 400)

  const product = await c.env.DB.prepare('SELECT * FROM products WHERE id = ?').bind(product_id).first() as any
  if (!product) return c.json({ error: 'Product not found' }, 404)

  let emp: any = null
  if (employee_id) emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(employee_id).first()

  // Default rate by stage if rate not given
  const stageDefaultRate = stage === 'assemble' ? (parseFloat(product.assemble_rate) || 0)
    : stage === 'paint' ? (parseFloat(product.paint_rate) || 0)
    : (parseFloat(product.pack_rate) || 0)
  const r = (rate === undefined || rate === null || rate === '') ? stageDefaultRate : (parseFloat(rate) || 0)
  const payout = qty * r
  const doDeduct = deduct === false ? 0 : 1
  const dateStr = entry_date || new Date().toISOString().slice(0, 10)

  const assembled = parseFloat(product.assembled_qty) || 0
  const painted = parseFloat(product.painted_qty) || 0

  // ---- Stock movement checks + apply ----
  if (stage === 'assemble') {
    // Consume the recipe COMPONENTS (and raw materials) for `qty` products.
    if (doDeduct) {
      const compRes = await c.env.DB.prepare(
        `SELECT pc.*, cp.name as comp_name, cp.quantity as comp_quantity
         FROM product_components pc LEFT JOIN components cp ON cp.id = pc.component_id
         WHERE pc.product_id = ?`
      ).bind(product_id).all()
      const comps = compRes.results as any[]
      const ingRes = await c.env.DB.prepare(
        `SELECT pi.*, rm.name as raw_name, rm.quantity as raw_quantity
         FROM product_ingredients pi LEFT JOIN raw_materials rm ON rm.id = pi.raw_material_id
         WHERE pi.product_id = ?`
      ).bind(product_id).all()
      const ings = ingRes.results as any[]
      const shortages: string[] = []
      for (const pc of comps) {
        const need = (parseFloat(pc.quantity_required) || 0) * qty
        const have = parseFloat(pc.comp_quantity) || 0
        if (need > have + 1e-9) shortages.push(`${pc.comp_name || 'Component'}: need ${+need.toFixed(3)}, have ${+have.toFixed(3)}`)
      }
      for (const ing of ings) {
        const need = (parseFloat(ing.quantity_required) || 0) * qty
        const have = parseFloat(ing.raw_quantity) || 0
        if (need > have + 1e-9) shortages.push(`${ing.raw_name || 'Raw material'}: need ${+need.toFixed(3)}, have ${+have.toFixed(3)}`)
      }
      if (shortages.length > 0) return c.json({ error: 'Not enough stock to assemble this quantity.', shortages }, 400)
      for (const pc of comps) {
        const need = (parseFloat(pc.quantity_required) || 0) * qty
        if (need > 0) await c.env.DB.prepare('UPDATE components SET quantity = MAX(0, quantity - ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(need, pc.component_id).run()
      }
      for (const ing of ings) {
        const need = (parseFloat(ing.quantity_required) || 0) * qty
        if (need > 0) await c.env.DB.prepare('UPDATE raw_materials SET quantity = MAX(0, quantity - ?), total_value = MAX(0, quantity - ?) * rate, updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(need, need, ing.raw_material_id).run()
      }
    }
    await c.env.DB.prepare('UPDATE products SET assembled_qty = assembled_qty + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(qty, product_id).run()
  } else if (stage === 'paint') {
    if (doDeduct && qty > assembled + 1e-9) {
      return c.json({ error: `Not enough assembled stock to paint. Assembled = ${+assembled.toFixed(3)}, requested = ${qty}` }, 400)
    }
    await c.env.DB.prepare('UPDATE products SET assembled_qty = MAX(0, assembled_qty - ?), painted_qty = painted_qty + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(doDeduct ? qty : 0, qty, product_id).run()
  }

  // Insert the log (we get id; pack stage records set-usage detail after)
  const insLog = await c.env.DB.prepare(
    `INSERT INTO product_production_logs (entry_date, stage, product_id, product_name, employee_id, employee_name, quantity, rate, payout, deducted, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(dateStr, stage, product_id, product.name, employee_id || null, emp?.name || '', qty, r, payout, doDeduct, notes || '').run()
  const logId = insLog.meta.last_row_id as number

  if (stage === 'pack') {
    if (doDeduct && qty > painted + 1e-9) {
      // rollback the log we just created
      await c.env.DB.prepare('DELETE FROM product_production_logs WHERE id = ?').bind(logId).run()
      return c.json({ error: `Not enough painted stock to pack. Painted = ${+painted.toFixed(3)}, requested = ${qty}` }, 400)
    }
    // Consume set items (tyres, rolling, tiers, etc.)
    if (doDeduct) {
      const setRes = await c.env.DB.prepare('SELECT * FROM product_set_items WHERE product_id = ?').bind(product_id).all()
      const setItems = setRes.results as any[]
      // pre-check stock
      const shortages: string[] = []
      for (const si of setItems) {
        const need = (parseFloat(si.quantity_required) || 0) * qty
        if (need <= 0) continue
        if (si.source_type === 'component' && si.source_id) {
          const cp = await c.env.DB.prepare('SELECT quantity FROM components WHERE id = ?').bind(si.source_id).first() as any
          const have = cp ? (parseFloat(cp.quantity) || 0) : 0
          if (need > have + 1e-9) shortages.push(`${si.item_name}: need ${+need.toFixed(3)}, have ${+have.toFixed(3)}`)
        } else if (si.source_type === 'raw' && si.source_id) {
          const rm = await c.env.DB.prepare('SELECT quantity FROM raw_materials WHERE id = ?').bind(si.source_id).first() as any
          const have = rm ? (parseFloat(rm.quantity) || 0) : 0
          if (need > have + 1e-9) shortages.push(`${si.item_name}: need ${+need.toFixed(3)}, have ${+have.toFixed(3)}`)
        }
      }
      if (shortages.length > 0) {
        await c.env.DB.prepare('DELETE FROM product_production_logs WHERE id = ?').bind(logId).run()
        return c.json({ error: 'Not enough set-item stock to pack this quantity.', shortages }, 400)
      }
      for (const si of setItems) {
        const need = (parseFloat(si.quantity_required) || 0) * qty
        if (need <= 0) continue
        if (si.source_type === 'component' && si.source_id) {
          await c.env.DB.prepare('UPDATE components SET quantity = MAX(0, quantity - ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(need, si.source_id).run()
        } else if (si.source_type === 'raw' && si.source_id) {
          await c.env.DB.prepare('UPDATE raw_materials SET quantity = MAX(0, quantity - ?), total_value = MAX(0, quantity - ?) * rate, updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(need, need, si.source_id).run()
        }
        await c.env.DB.prepare('INSERT INTO product_set_usage (product_log_id, source_type, source_id, item_name, qty_used) VALUES (?, ?, ?, ?, ?)').bind(logId, si.source_type, si.source_id || null, si.item_name || '', need).run()
      }
    }
    // Move painted -> packed (final finished product). Also add to inventory.
    await c.env.DB.prepare('UPDATE products SET painted_qty = MAX(0, painted_qty - ?), packed_qty = packed_qty + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(doDeduct ? qty : 0, qty, product_id).run()
    const existing = await c.env.DB.prepare('SELECT id FROM inventory WHERE name = ? COLLATE NOCASE').bind(product.name).first() as any
    if (existing) {
      await c.env.DB.prepare('UPDATE inventory SET quantity = quantity + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(qty, existing.id).run()
    } else {
      await c.env.DB.prepare('INSERT INTO inventory (name, unit, rate, quantity, category, notes) VALUES (?, ?, ?, ?, ?, ?)').bind(product.name, product.unit || 'pcs', parseFloat(product.sale_rate) || 0, qty, product.category || '', product.notes || '').run()
    }
  }

  // Per-piece worker payout (shows in worker profile + weekly total)
  let empTxId: number | null = null
  if (employee_id && payout > 0) {
    const stageLabel = stage === 'assemble' ? 'Assemble' : stage === 'paint' ? 'Paint' : 'Pack'
    const insTx = await c.env.DB.prepare(
      `INSERT INTO employee_transactions
        (employee_id, entry_date, type, amount, description, entry_type, item_id, item_name, quantity, rate, paid_amount, product_log_id)
       VALUES (?, ?, 'salary', ?, ?, 'per_piece', NULL, ?, ?, ?, 0, ?)`
    ).bind(employee_id, dateStr, payout, `${stageLabel}: ${product.name}`, `${product.name} (${stageLabel})`, qty, r, logId).run()
    empTxId = insTx.meta.last_row_id as number
    await c.env.DB.prepare('UPDATE product_production_logs SET emp_tx_id = ? WHERE id = ?').bind(empTxId, logId).run()
  }

  return c.json({ id: logId, payout, emp_tx_id: empTxId })
})

// Edit a product production log (only safe fields: date, quantity, rate, notes).
app.put('/api/product-production/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const old = await c.env.DB.prepare('SELECT * FROM product_production_logs WHERE id = ?').bind(id).first() as any
  if (!old) return c.json({ error: 'Not found' }, 404)

  const newQty = parseFloat(body.quantity)
  const finalQty = isNaN(newQty) ? (parseFloat(old.quantity) || 0) : newQty
  const newRate = (body.rate === undefined || body.rate === null || body.rate === '') ? (parseFloat(old.rate) || 0) : (parseFloat(body.rate) || 0)
  const newDate = body.entry_date || old.entry_date
  const newNotes = body.notes !== undefined ? body.notes : old.notes
  const payout = finalQty * newRate
  const qtyDelta = finalQty - (parseFloat(old.quantity) || 0)

  // Adjust the stage stock counters by the delta (does NOT re-adjust consumed
  // components/set-items to keep edits simple & predictable).
  if (old.product_id && qtyDelta !== 0) {
    if (old.stage === 'assemble') {
      await c.env.DB.prepare('UPDATE products SET assembled_qty = MAX(0, assembled_qty + ?) WHERE id = ?').bind(qtyDelta, old.product_id).run()
    } else if (old.stage === 'paint') {
      await c.env.DB.prepare('UPDATE products SET painted_qty = MAX(0, painted_qty + ?) WHERE id = ?').bind(qtyDelta, old.product_id).run()
    } else if (old.stage === 'pack') {
      await c.env.DB.prepare('UPDATE products SET packed_qty = MAX(0, packed_qty + ?) WHERE id = ?').bind(qtyDelta, old.product_id).run()
    }
  }

  await c.env.DB.prepare('UPDATE product_production_logs SET entry_date=?, quantity=?, rate=?, payout=?, notes=? WHERE id=?')
    .bind(newDate, finalQty, newRate, payout, newNotes, id).run()
  if (old.emp_tx_id) {
    await c.env.DB.prepare('UPDATE employee_transactions SET entry_date=?, amount=?, quantity=?, rate=? WHERE id=?')
      .bind(newDate, payout, finalQty, newRate, old.emp_tx_id).run()
  }
  return c.json({ success: true, payout })
})

// Delete a product production log (reverses stock movement + set-item usage + payout).
app.delete('/api/product-production/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const old = await c.env.DB.prepare('SELECT * FROM product_production_logs WHERE id = ?').bind(id).first() as any
  if (!old) return c.json({ error: 'Not found' }, 404)
  const qty = parseFloat(old.quantity) || 0

  if (old.product_id) {
    if (old.stage === 'assemble') {
      // remove assembled units; if it had deducted recipe stock, restore it
      await c.env.DB.prepare('UPDATE products SET assembled_qty = MAX(0, assembled_qty - ?) WHERE id = ?').bind(qty, old.product_id).run()
      if (old.deducted) {
        const compRes = await c.env.DB.prepare('SELECT * FROM product_components WHERE product_id = ?').bind(old.product_id).all()
        for (const pc of (compRes.results as any[])) {
          const back = (parseFloat(pc.quantity_required) || 0) * qty
          if (back > 0) await c.env.DB.prepare('UPDATE components SET quantity = quantity + ? WHERE id = ?').bind(back, pc.component_id).run()
        }
        const ingRes = await c.env.DB.prepare('SELECT * FROM product_ingredients WHERE product_id = ?').bind(old.product_id).all()
        for (const ing of (ingRes.results as any[])) {
          const back = (parseFloat(ing.quantity_required) || 0) * qty
          if (back > 0) await c.env.DB.prepare('UPDATE raw_materials SET quantity = quantity + ?, total_value = (quantity + ?) * rate WHERE id = ?').bind(back, back, ing.raw_material_id).run()
        }
      }
    } else if (old.stage === 'paint') {
      await c.env.DB.prepare('UPDATE products SET painted_qty = MAX(0, painted_qty - ?), assembled_qty = assembled_qty + ? WHERE id = ?').bind(qty, old.deducted ? qty : 0, old.product_id).run()
    } else if (old.stage === 'pack') {
      await c.env.DB.prepare('UPDATE products SET packed_qty = MAX(0, packed_qty - ?), painted_qty = painted_qty + ? WHERE id = ?').bind(qty, old.deducted ? qty : 0, old.product_id).run()
      // restore set-item usage
      const usage = await c.env.DB.prepare('SELECT * FROM product_set_usage WHERE product_log_id = ?').bind(id).all()
      for (const u of (usage.results as any[])) {
        const back = parseFloat(u.qty_used) || 0
        if (back <= 0 || !u.source_id) continue
        if (u.source_type === 'component') await c.env.DB.prepare('UPDATE components SET quantity = quantity + ? WHERE id = ?').bind(back, u.source_id).run()
        else if (u.source_type === 'raw') await c.env.DB.prepare('UPDATE raw_materials SET quantity = quantity + ?, total_value = (quantity + ?) * rate WHERE id = ?').bind(back, back, u.source_id).run()
      }
      // reverse inventory
      const inv = await c.env.DB.prepare('SELECT id, quantity FROM inventory WHERE name = ? COLLATE NOCASE').bind(old.product_name).first() as any
      if (inv) await c.env.DB.prepare('UPDATE inventory SET quantity = MAX(0, quantity - ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?').bind(qty, inv.id).run()
    }
  }
  if (old.emp_tx_id) await c.env.DB.prepare('DELETE FROM employee_transactions WHERE id = ?').bind(old.emp_tx_id).run()
  await c.env.DB.prepare('DELETE FROM product_production_logs WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================================
// ============ COMPONENTS (Raw -> Components -> Product) ============
// =====================================================

// List all components with their recipe + buildable info
app.get('/api/components', requireAuth, async (c) => {
  const comps = await c.env.DB.prepare('SELECT * FROM components ORDER BY name ASC').all()
  const ings = await c.env.DB.prepare(
    `SELECT ci.*, rm.name as raw_name, rm.unit as raw_unit, rm.quantity as raw_quantity, rm.rate as raw_rate
     FROM component_ingredients ci
     LEFT JOIN raw_materials rm ON rm.id = ci.raw_material_id
     ORDER BY ci.component_id, ci.sort_order, ci.id`
  ).all()
  // #4: child-component lines (component made from other components)
  const subs = await c.env.DB.prepare(
    `SELECT csc.*, ch.name as child_name, ch.unit as child_unit, ch.quantity as child_quantity, ch.default_rate as child_rate
     FROM component_subcomponents csc
     LEFT JOIN components ch ON ch.id = csc.child_component_id
     ORDER BY csc.component_id, csc.sort_order, csc.id`
  ).all()
  const ingBy: Record<number, any[]> = {}
  for (const ing of (ings.results as any[])) {
    if (!ingBy[ing.component_id]) ingBy[ing.component_id] = []
    ingBy[ing.component_id].push(ing)
  }
  const subBy: Record<number, any[]> = {}
  for (const s of (subs.results as any[])) {
    if (!subBy[s.component_id]) subBy[s.component_id] = []
    subBy[s.component_id].push(s)
  }
  const list = (comps.results as any[]).map(comp => {
    const list2 = ingBy[comp.id] || []
    const subList = subBy[comp.id] || []
    let buildable: number | null = null
    let material_cost = 0
    for (const ing of list2) {
      const need = parseFloat(ing.quantity_required) || 0
      const have = parseFloat(ing.raw_quantity) || 0
      const rate = parseFloat(ing.raw_rate) || 0
      material_cost += need * rate
      if (need <= 0) continue
      if (ing.raw_material_id == null) { buildable = 0; continue }
      const can = have / need
      if (buildable === null || can < buildable) buildable = can
    }
    // child components also limit buildable + add to cost
    for (const s of subList) {
      const need = parseFloat(s.quantity_required) || 0
      const have = parseFloat(s.child_quantity) || 0
      const rate = parseFloat(s.child_rate) || 0
      material_cost += need * rate
      if (need <= 0) continue
      if (s.child_component_id == null) { buildable = 0; continue }
      const can = have / need
      if (buildable === null || can < buildable) buildable = can
    }
    return {
      ...comp,
      ingredients: list2,
      subcomponents: subList,
      buildable_units: buildable === null ? null : Math.floor(buildable),
      material_cost_per_unit: material_cost
    }
  })
  return c.json({ components: list })
})

app.get('/api/components/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const comp = await c.env.DB.prepare('SELECT * FROM components WHERE id = ?').bind(id).first()
  if (!comp) return c.json({ error: 'Not found' }, 404)
  const ings = await c.env.DB.prepare(
    `SELECT ci.*, rm.name as raw_name, rm.unit as raw_unit, rm.quantity as raw_quantity, rm.rate as raw_rate
     FROM component_ingredients ci
     LEFT JOIN raw_materials rm ON rm.id = ci.raw_material_id
     WHERE ci.component_id = ? ORDER BY ci.sort_order ASC, ci.id ASC`
  ).bind(id).all()
  const subs = await c.env.DB.prepare(
    `SELECT csc.*, ch.name as child_name, ch.unit as child_unit, ch.quantity as child_quantity, ch.default_rate as child_rate
     FROM component_subcomponents csc
     LEFT JOIN components ch ON ch.id = csc.child_component_id
     WHERE csc.component_id = ? ORDER BY csc.sort_order ASC, csc.id ASC`
  ).bind(id).all()
  // recent production for this component
  const prod = await c.env.DB.prepare(
    'SELECT * FROM production_logs WHERE component_id = ? ORDER BY entry_date DESC, id DESC LIMIT 50'
  ).bind(id).all()
  return c.json({ component: comp, ingredients: ings.results, subcomponents: subs.results, production: prod.results })
})

async function syncComponentIngredients(env: any, componentId: number, ingredients: any[]) {
  await env.DB.prepare('DELETE FROM component_ingredients WHERE component_id = ?').bind(componentId).run()
  if (!Array.isArray(ingredients)) return
  for (let i = 0; i < ingredients.length; i++) {
    const ing = ingredients[i]
    if (!ing || !ing.raw_material_id) continue
    const qty = parseFloat(ing.quantity_required) || 0
    if (qty <= 0) continue
    const rm = await env.DB.prepare('SELECT unit FROM raw_materials WHERE id = ?').bind(ing.raw_material_id).first() as any
    const unit = ing.unit || rm?.unit || ''
    await env.DB.prepare(
      `INSERT INTO component_ingredients (component_id, raw_material_id, quantity_required, unit, sort_order)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(componentId, ing.raw_material_id, qty, unit, i).run()
  }
}

// #4: Sync the CHILD-COMPONENT lines (a component made from other components)
async function syncComponentSubcomponents(env: any, componentId: number, subs: any[]) {
  await env.DB.prepare('DELETE FROM component_subcomponents WHERE component_id = ?').bind(componentId).run()
  if (!Array.isArray(subs)) return
  for (let i = 0; i < subs.length; i++) {
    const s = subs[i]
    if (!s || !s.child_component_id) continue
    const childId = parseInt(s.child_component_id)
    // Guard: a component cannot be its own child (no self-reference / direct loop)
    if (childId === componentId) continue
    const qty = parseFloat(s.quantity_required) || 0
    if (qty <= 0) continue
    await env.DB.prepare(
      `INSERT INTO component_subcomponents (component_id, child_component_id, quantity_required, sort_order)
       VALUES (?, ?, ?, ?)`
    ).bind(componentId, childId, qty, i).run()
  }
}

app.post('/api/components', requireAuth, async (c) => {
  const { name, unit, category, notes, default_rate, quantity, ingredients, subcomponents } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    `INSERT INTO components (name, unit, category, notes, default_rate, quantity) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(default_rate) || 0, parseFloat(quantity) || 0).run()
  const cid = result.meta.last_row_id as number
  await syncComponentIngredients(c.env, cid, ingredients || [])
  await syncComponentSubcomponents(c.env, cid, subcomponents || [])
  return c.json({ id: cid })
})

app.put('/api/components/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const { name, unit, category, notes, default_rate, quantity, ingredients, subcomponents } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  // quantity can be edited manually (correction). If undefined, keep existing.
  if (quantity === undefined || quantity === null || quantity === '') {
    await c.env.DB.prepare(
      `UPDATE components SET name=?, unit=?, category=?, notes=?, default_rate=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(default_rate) || 0, id).run()
  } else {
    await c.env.DB.prepare(
      `UPDATE components SET name=?, unit=?, category=?, notes=?, default_rate=?, quantity=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`
    ).bind(name, unit || 'pcs', category || '', notes || '', parseFloat(default_rate) || 0, parseFloat(quantity) || 0, id).run()
  }
  await syncComponentIngredients(c.env, id, ingredients || [])
  await syncComponentSubcomponents(c.env, id, subcomponents || [])
  return c.json({ success: true })
})

app.delete('/api/components/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM components WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// =====================================================
// ============ PRODUCTION LOGS (Worker reports production) ============
// =====================================================

// List production logs with optional filters: ?employee_id= &component_id= &from= &to=
app.get('/api/production', requireAuth, async (c) => {
  const empId = c.req.query('employee_id')
  const compId = c.req.query('component_id')
  const from = c.req.query('from')
  const to = c.req.query('to')
  let sql = 'SELECT * FROM production_logs WHERE 1=1'
  const binds: any[] = []
  if (empId) { sql += ' AND employee_id = ?'; binds.push(empId) }
  if (compId) { sql += ' AND component_id = ?'; binds.push(compId) }
  if (from) { sql += ' AND entry_date >= ?'; binds.push(from) }
  if (to) { sql += ' AND entry_date <= ?'; binds.push(to) }
  sql += ' ORDER BY entry_date DESC, id DESC'
  const res = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ production: res.results })
})

// Record a new production entry
// body: { entry_date, employee_id, component_id, quantity, rate, deduct_raw, scrap_qty, notes }
app.post('/api/production', requireAuth, async (c) => {
  const body = await c.req.json()
  const { entry_date, employee_id, component_id, quantity, rate, deduct_raw, scrap_qty, notes } = body
  const qty = parseFloat(quantity) || 0
  if (!component_id) return c.json({ error: 'Component required' }, 400)
  if (qty <= 0) return c.json({ error: 'Quantity must be > 0' }, 400)

  const comp = await c.env.DB.prepare('SELECT * FROM components WHERE id = ?').bind(component_id).first() as any
  if (!comp) return c.json({ error: 'Component not found' }, 404)

  let emp: any = null
  if (employee_id) {
    emp = await c.env.DB.prepare('SELECT * FROM employees WHERE id = ?').bind(employee_id).first()
  }

  const r = (rate === undefined || rate === null || rate === '') ? (parseFloat(comp.default_rate) || 0) : (parseFloat(rate) || 0)
  const payout = qty * r
  const doDeduct = deduct_raw ? 1 : 0
  const dateStr = entry_date || new Date().toISOString().slice(0, 10)
  const totalScrap = parseFloat(scrap_qty) || 0

  // Recipe (raw material per 1 component)
  const ingsRes = await c.env.DB.prepare(
    `SELECT ci.*, rm.name as raw_name, rm.quantity as raw_quantity
     FROM component_ingredients ci LEFT JOIN raw_materials rm ON rm.id = ci.raw_material_id
     WHERE ci.component_id = ?`
  ).bind(component_id).all()
  const ings = ingsRes.results as any[]

  // #4: child-component recipe (other components consumed to make this one)
  const subsRes = await c.env.DB.prepare(
    `SELECT csc.*, ch.name as child_name, ch.quantity as child_quantity
     FROM component_subcomponents csc LEFT JOIN components ch ON ch.id = csc.child_component_id
     WHERE csc.component_id = ?`
  ).bind(component_id).all()
  const subs = subsRes.results as any[]

  // ---- block production if raw material OR child components are insufficient ----
  // Only enforce when auto-deduct is ON AND the component has a recipe.
  if (doDeduct && (ings.length > 0 || subs.length > 0)) {
    const shortages: string[] = []
    for (const ing of ings) {
      const perUnit = parseFloat(ing.quantity_required) || 0
      if (perUnit <= 0) continue
      const need = perUnit * qty
      const available = parseFloat(ing.raw_quantity) || 0
      if (need > available + 1e-9) {
        shortages.push(`${ing.raw_name || 'Raw material'}: need ${(+need.toFixed(3))}, have ${(+available.toFixed(3))}`)
      }
    }
    for (const s of subs) {
      const perUnit = parseFloat(s.quantity_required) || 0
      if (perUnit <= 0) continue
      const need = perUnit * qty
      const available = parseFloat(s.child_quantity) || 0
      if (need > available + 1e-9) {
        shortages.push(`${s.child_name || 'Component'} (component): need ${(+need.toFixed(3))}, have ${(+available.toFixed(3))}`)
      }
    }
    if (shortages.length > 0) {
      return c.json({
        error: 'Not enough raw material / components to produce this quantity.',
        shortages
      }, 400)
    }
  }

  let totalRawUsed = 0

  // Insert production log first (to get id)
  const insLog = await c.env.DB.prepare(
    `INSERT INTO production_logs
      (entry_date, employee_id, employee_name, component_id, component_name, quantity, rate, payout, raw_used, scrap_qty, deducted_raw, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    dateStr, employee_id || null, emp?.name || '', component_id, comp.name,
    qty, r, payout, 0, totalScrap, doDeduct, notes || ''
  ).run()
  const logId = insLog.meta.last_row_id as number

  // Deduct raw material (recipe-based) + record usage detail
  if (doDeduct && ings.length > 0) {
    for (const ing of ings) {
      const need = (parseFloat(ing.quantity_required) || 0) * qty
      if (need <= 0) continue
      totalRawUsed += need
      await c.env.DB.prepare(
        `UPDATE raw_materials SET quantity = MAX(0, quantity - ?), total_value = MAX(0, quantity - ?) * rate, updated_at=CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(need, need, ing.raw_material_id).run()
      await c.env.DB.prepare(
        `INSERT INTO production_raw_usage (production_log_id, raw_material_id, raw_name, qty_used, scrap_qty) VALUES (?, ?, ?, ?, ?)`
      ).bind(logId, ing.raw_material_id, ing.raw_name || '', need, 0).run()
    }
  }

  // #4: Deduct CHILD COMPONENT stock used to assemble this component
  if (doDeduct && subs.length > 0) {
    for (const s of subs) {
      const need = (parseFloat(s.quantity_required) || 0) * qty
      if (need <= 0 || !s.child_component_id) continue
      await c.env.DB.prepare(
        `UPDATE components SET quantity = MAX(0, quantity - ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?`
      ).bind(need, s.child_component_id).run()
      // record usage detail so it can be reversed on delete
      await c.env.DB.prepare(
        `INSERT INTO production_raw_usage (production_log_id, raw_material_id, child_component_id, raw_name, qty_used, scrap_qty) VALUES (?, NULL, ?, ?, ?, ?)`
      ).bind(logId, s.child_component_id, (s.child_name || ''), need, 0).run()
    }
  }

  // If scrap entered AND there is a single ingredient, deduct scrap from that raw material too
  if (doDeduct && totalScrap > 0 && ings.length === 1) {
    const ing = ings[0]
    await c.env.DB.prepare(
      `UPDATE raw_materials SET quantity = MAX(0, quantity - ?), total_value = MAX(0, quantity - ?) * rate, updated_at=CURRENT_TIMESTAMP WHERE id = ?`
    ).bind(totalScrap, totalScrap, ing.raw_material_id).run()
  }

  // Update raw_used on the log
  await c.env.DB.prepare('UPDATE production_logs SET raw_used = ? WHERE id = ?').bind(totalRawUsed, logId).run()

  // Add produced quantity to component stock
  await c.env.DB.prepare(
    'UPDATE components SET quantity = quantity + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?'
  ).bind(qty, component_id).run()

  // Record the worker's per-piece payout in employee_transactions (so it shows in profile + weekly total)
  let empTxId: number | null = null
  if (employee_id && payout > 0) {
    const insTx = await c.env.DB.prepare(
      `INSERT INTO employee_transactions
        (employee_id, entry_date, type, amount, description, entry_type, item_id, item_name, quantity, rate, paid_amount, production_log_id)
       VALUES (?, ?, 'salary', ?, ?, 'per_piece', NULL, ?, ?, ?, 0, ?)`
    ).bind(
      employee_id, dateStr, payout,
      `Production: ${comp.name}`, comp.name, qty, r, logId
    ).run()
    empTxId = insTx.meta.last_row_id as number
    await c.env.DB.prepare('UPDATE production_logs SET emp_tx_id = ? WHERE id = ?').bind(empTxId, logId).run()
  }

  return c.json({ id: logId, payout, raw_used: totalRawUsed, emp_tx_id: empTxId })
})

// Edit a production log (re-applies stock/payout deltas)
app.put('/api/production/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const body = await c.req.json()
  const old = await c.env.DB.prepare('SELECT * FROM production_logs WHERE id = ?').bind(id).first() as any
  if (!old) return c.json({ error: 'Not found' }, 404)

  const newQty = parseFloat(body.quantity)
  const finalQty = isNaN(newQty) ? (parseFloat(old.quantity) || 0) : newQty
  const newRate = (body.rate === undefined || body.rate === null || body.rate === '') ? (parseFloat(old.rate) || 0) : (parseFloat(body.rate) || 0)
  const newDate = body.entry_date || old.entry_date
  const newScrap = (body.scrap_qty === undefined || body.scrap_qty === null || body.scrap_qty === '') ? (parseFloat(old.scrap_qty) || 0) : (parseFloat(body.scrap_qty) || 0)
  const newNotes = body.notes !== undefined ? body.notes : old.notes
  const payout = finalQty * newRate

  // Adjust component stock by the delta (newQty - oldQty)
  const qtyDelta = finalQty - (parseFloat(old.quantity) || 0)
  if (old.component_id) {
    await c.env.DB.prepare(
      'UPDATE components SET quantity = MAX(0, quantity + ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(qtyDelta, old.component_id).run()
  }

  await c.env.DB.prepare(
    `UPDATE production_logs SET entry_date=?, quantity=?, rate=?, payout=?, scrap_qty=?, notes=? WHERE id=?`
  ).bind(newDate, finalQty, newRate, payout, newScrap, newNotes, id).run()

  // Update linked employee transaction (payout)
  if (old.emp_tx_id) {
    await c.env.DB.prepare(
      `UPDATE employee_transactions SET entry_date=?, amount=?, quantity=?, rate=? WHERE id=?`
    ).bind(newDate, payout, finalQty, newRate, old.emp_tx_id).run()
  }
  return c.json({ success: true, payout })
})

// Delete a production log (reverses stock + removes linked payout)
app.delete('/api/production/:id', requireAuth, async (c) => {
  const id = parseInt(c.req.param('id'))
  const old = await c.env.DB.prepare('SELECT * FROM production_logs WHERE id = ?').bind(id).first() as any
  if (!old) return c.json({ error: 'Not found' }, 404)
  // reverse component stock
  if (old.component_id) {
    await c.env.DB.prepare(
      'UPDATE components SET quantity = MAX(0, quantity - ?), updated_at=CURRENT_TIMESTAMP WHERE id = ?'
    ).bind(parseFloat(old.quantity) || 0, old.component_id).run()
  }
  // restore deducted raw materials AND child components
  if (old.deducted_raw) {
    const usage = await c.env.DB.prepare('SELECT * FROM production_raw_usage WHERE production_log_id = ?').bind(id).all()
    for (const u of (usage.results as any[])) {
      if (u.raw_material_id) {
        await c.env.DB.prepare(
          'UPDATE raw_materials SET quantity = quantity + ?, total_value = (quantity + ?) * rate, updated_at=CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(parseFloat(u.qty_used) || 0, parseFloat(u.qty_used) || 0, u.raw_material_id).run()
      } else if (u.child_component_id) {
        // #4: restore child component stock that was consumed
        await c.env.DB.prepare(
          'UPDATE components SET quantity = quantity + ?, updated_at=CURRENT_TIMESTAMP WHERE id = ?'
        ).bind(parseFloat(u.qty_used) || 0, u.child_component_id).run()
      }
    }
  }
  // remove linked employee transaction
  if (old.emp_tx_id) {
    await c.env.DB.prepare('DELETE FROM employee_transactions WHERE id = ?').bind(old.emp_tx_id).run()
  }
  await c.env.DB.prepare('DELETE FROM production_logs WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// Weekly payout summary for a worker (Thursday -> Wednesday weeks)
// ?employee_id=  (required)  optional ?weeks=  number of recent weeks (default 12)
app.get('/api/production/weekly', requireAuth, async (c) => {
  const empId = c.req.query('employee_id')
  if (!empId) return c.json({ error: 'employee_id required' }, 400)

  // Weekly payout is now based on ALL per-piece earnings recorded in
  // employee_transactions. This covers BOTH:
  //   - Components Production (production_logs -> per_piece salary tx)
  //   - Products Manufacturing  Assemble/Paint/Pack (product_production_logs -> per_piece salary tx)
  // Any per-piece earning (whatever field/stage the worker is in) shows here.
  const txRows = await c.env.DB.prepare(
    `SELECT entry_date, item_name, quantity, amount
       FROM employee_transactions
      WHERE employee_id = ? AND type = 'salary' AND entry_type = 'per_piece'
      ORDER BY entry_date ASC, id ASC`
  ).bind(empId).all()

  // Scrap is only tracked for component production; fetch it separately so the
  // weekly view can still show "Scrap this week".
  const scrapRows = await c.env.DB.prepare(
    `SELECT entry_date, COALESCE(scrap_qty,0) AS scrap_qty
       FROM production_logs WHERE employee_id = ?`
  ).bind(empId).all()

  // Group into weeks that START on Thursday.
  // Helper: given a date, find the Thursday on/before it.
  const weekStartOf = (dateStr: string): string => {
    const d = new Date(dateStr + 'T00:00:00Z')
    const dow = d.getUTCDay() // 0=Sun ... 4=Thu
    // days since last Thursday
    let diff = (dow - 4 + 7) % 7
    d.setUTCDate(d.getUTCDate() - diff)
    return d.toISOString().slice(0, 10)
  }
  const addDays = (dateStr: string, n: number): string => {
    const d = new Date(dateStr + 'T00:00:00Z')
    d.setUTCDate(d.getUTCDate() + n)
    return d.toISOString().slice(0, 10)
  }

  const weekMap: Record<string, any> = {}
  const ensureWeek = (ws: string) => {
    if (!weekMap[ws]) {
      weekMap[ws] = {
        week_start: ws,            // Thursday
        week_end: addDays(ws, 6),  // Wednesday
        total_pieces: 0,
        total_payout: 0,
        total_scrap: 0,
        components: {} as Record<string, any>,
        days: {} as Record<string, any>,
        logs: []
      }
    }
    return weekMap[ws]
  }

  for (const log of (txRows.results as any[])) {
    if (!log.entry_date) continue
    const ws = weekStartOf(log.entry_date)
    const w = ensureWeek(ws)
    const q = parseFloat(log.quantity) || 0
    const p = parseFloat(log.amount) || 0
    w.total_pieces += q
    w.total_payout += p
    // item_name carries "Component" or "Product (Stage)" — use it as the grouping label.
    const cn = log.item_name || 'Production'
    if (!w.components[cn]) w.components[cn] = { name: cn, pieces: 0, payout: 0 }
    w.components[cn].pieces += q
    w.components[cn].payout += p
    if (!w.days[log.entry_date]) w.days[log.entry_date] = { date: log.entry_date, pieces: 0, payout: 0 }
    w.days[log.entry_date].pieces += q
    w.days[log.entry_date].payout += p
    w.logs.push(log)
  }

  // Fold scrap into the matching week (don't create a week just for scrap).
  for (const s of (scrapRows.results as any[])) {
    const scrap = parseFloat(s.scrap_qty) || 0
    if (scrap <= 0 || !s.entry_date) continue
    const ws = weekStartOf(s.entry_date)
    if (weekMap[ws]) weekMap[ws].total_scrap += scrap
  }

  const weeks = Object.values(weekMap)
    .map((w: any) => ({
      ...w,
      components: Object.values(w.components),
      days: Object.values(w.days).sort((a: any, b: any) => a.date.localeCompare(b.date))
    }))
    .sort((a: any, b: any) => b.week_start.localeCompare(a.week_start))

  const limit = parseInt(c.req.query('weeks') || '12')
  return c.json({ weeks: weeks.slice(0, limit) })
})

// ============ EMPLOYEES ============
app.get('/api/employees', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(
    `SELECT e.*,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_amount,
       (SELECT COALESCE(SUM(CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END),0)
          FROM employee_transactions WHERE employee_id = e.id AND type='salary') as total_paid,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='advance') as total_advance,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='payment') as total_payment,
       (SELECT COALESCE(SUM(amount),0)
          FROM employee_transactions
          WHERE employee_id = e.id AND type='advance' AND COALESCE(deferred,0)=0) as advance_active,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='bonus') as total_bonus,
       (SELECT COALESCE(SUM(amount),0) FROM employee_transactions WHERE employee_id = e.id AND type='deduction') as total_deduction
     FROM employees e ORDER BY e.name`
  ).all()
  // Attach each employee's per-piece item rates (used to auto-fill rate in Log Production)
  const items = await c.env.DB.prepare(
    'SELECT employee_id, item_name, rate FROM employee_items ORDER BY sort_order ASC, id ASC'
  ).all()
  const itemsByEmp: Record<number, any[]> = {}
  for (const it of (items.results as any[])) {
    if (!itemsByEmp[it.employee_id]) itemsByEmp[it.employee_id] = []
    itemsByEmp[it.employee_id].push(it)
  }
  const employees = (result.results as any[]).map(e => ({ ...e, items: itemsByEmp[e.id] || [] }))
  return c.json({ employees })
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
  // deferred: only meaningful for advance — 1 means "don't cut this from remaining yet"
  const deferred = (type === 'advance' && body.deferred) ? 1 : 0
  const result = await c.env.DB.prepare(
    `INSERT INTO employee_transactions (employee_id, entry_date, type, amount, description, entry_type, item_id, item_name, quantity, rate, paid_amount, deferred) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    employee_id, entry_date || new Date().toISOString().slice(0, 10), type, amt, description || '',
    eType, item_id || null, item_name || '', qty, r, paid, deferred
  ).run()
  return c.json({ id: result.meta.last_row_id })
})

// Toggle the "deferred" flag of an advance (defer = don't deduct from remaining this week)
app.post('/api/employee-transactions/:id/toggle-defer', requireAuth, async (c) => {
  const id = c.req.param('id')
  const row = await c.env.DB.prepare('SELECT * FROM employee_transactions WHERE id = ?').bind(id).first() as any
  if (!row) return c.json({ error: 'Not found' }, 404)
  if (row.type !== 'advance') return c.json({ error: 'Only advances can be deferred' }, 400)
  const newVal = (row.deferred ? 0 : 1)
  await c.env.DB.prepare('UPDATE employee_transactions SET deferred = ? WHERE id = ?').bind(newVal, id).run()
  return c.json({ success: true, deferred: newVal })
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
  const deferred = (type === 'advance' && body.deferred) ? 1 : 0
  await c.env.DB.prepare(
    `UPDATE employee_transactions SET entry_date=?, type=?, amount=?, description=?, 
     entry_type=?, item_id=?, item_name=?, quantity=?, rate=?, paid_amount=?, deferred=? WHERE id=?`
  ).bind(entry_date, type, amt, description || '', eType, item_id || null, item_name || '', qty, r, paid, deferred, id).run()
  return c.json({ success: true })
})

app.delete('/api/employee-transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM employee_transactions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ SIDE EXPENSE FOLDERS (Ledgers) ============
app.get('/api/side-expense-folders', requireAuth, async (c) => {
  const result = await c.env.DB.prepare(`
    SELECT f.*,
      (SELECT COUNT(*) FROM side_expenses WHERE folder_id = f.id) as expense_count,
      (SELECT COALESCE(SUM(amount),0) FROM side_expenses WHERE folder_id = f.id) as total_amount
    FROM side_expense_folders f
    ORDER BY f.sort_order ASC, f.id ASC
  `).all()
  return c.json({ folders: result.results })
})

app.post('/api/side-expense-folders', requireAuth, async (c) => {
  const { name, icon, color, description, sort_order } = await c.req.json()
  if (!name || !String(name).trim()) {
    return c.json({ error: 'Folder name required' }, 400)
  }
  const result = await c.env.DB.prepare(
    'INSERT INTO side_expense_folders (name, icon, color, description, sort_order) VALUES (?, ?, ?, ?, ?)'
  ).bind(String(name).trim(), icon || 'fa-folder', color || '#ef4444', description || '', sort_order || 0).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/side-expense-folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { name, icon, color, description, sort_order } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE side_expense_folders SET name=?, icon=?, color=?, description=?, sort_order=? WHERE id=?'
  ).bind(String(name || '').trim(), icon || 'fa-folder', color || '#ef4444', description || '', sort_order || 0, id).run()
  return c.json({ success: true })
})

app.delete('/api/side-expense-folders/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  // Unlink any expenses inside this folder (do not delete the expenses themselves)
  await c.env.DB.prepare('UPDATE side_expenses SET folder_id = NULL WHERE folder_id = ?').bind(id).run()
  await c.env.DB.prepare('DELETE FROM side_expense_folders WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ SIDE EXPENSES ============
app.get('/api/side-expenses', requireAuth, async (c) => {
  const folderId = c.req.query('folder_id')
  let sql = `SELECT se.*, f.name as folder_name, f.icon as folder_icon, f.color as folder_color
             FROM side_expenses se
             LEFT JOIN side_expense_folders f ON f.id = se.folder_id`
  const binds: any[] = []
  if (folderId === 'null' || folderId === '0') {
    sql += ' WHERE se.folder_id IS NULL'
  } else if (folderId) {
    sql += ' WHERE se.folder_id = ?'
    binds.push(folderId)
  }
  sql += ' ORDER BY se.entry_date DESC, se.id DESC'
  const result = await c.env.DB.prepare(sql).bind(...binds).all()
  return c.json({ expenses: result.results })
})

app.post('/api/side-expenses', requireAuth, async (c) => {
  const { entry_date, category, description, amount, paid_to, notes, folder_id } = await c.req.json()
  const result = await c.env.DB.prepare(
    'INSERT INTO side_expenses (entry_date, category, description, amount, paid_to, notes, folder_id) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).bind(
    entry_date || new Date().toISOString().slice(0, 10),
    category || '', description || '', parseFloat(amount) || 0,
    paid_to || '', notes || '',
    folder_id ? parseInt(folder_id) : null
  ).run()
  return c.json({ id: result.meta.last_row_id })
})

app.put('/api/side-expenses/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { entry_date, category, description, amount, paid_to, notes, folder_id } = await c.req.json()
  await c.env.DB.prepare(
    'UPDATE side_expenses SET entry_date=?, category=?, description=?, amount=?, paid_to=?, notes=?, folder_id=? WHERE id=?'
  ).bind(
    entry_date, category || '', description || '', parseFloat(amount) || 0,
    paid_to || '', notes || '',
    folder_id ? parseInt(folder_id) : null,
    id
  ).run()
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
         rawList, empList, expenseList, profitStats, productList, invMfgList,
         supplierStats, mfgProducts, mfgIngredients, builtSoldStats,
         salesTodayStats, salesMonthStats, salesAllTimeStats,
         salesTodayProducts, salesMonthProducts, salesAllTimeProducts,
         rawCostStats, salaryPaidStats, compProdStats, compProdList] = await Promise.all([
    // NET receivable / payable computed PER CLIENT first, then summed.
    // For each client: net = opening_balance + SUM(amount_pending) - SUM(amount_received).
    //   net > 0  => an outstanding balance (customer owes us / we owe supplier)
    //   net < 0  => an ADVANCE (customer paid extra / we paid supplier extra)
    // We only sum the POSITIVE nets into receivable/payable so that one client's
    // advance does NOT wrongly cancel another client's outstanding debt, and so
    // that overpaying a single supplier shows 0 payable (not the gross bill amount).
    c.env.DB.prepare(`
      WITH client_net AS (
        SELECT cl.id AS client_id,
               COALESCE(f.ledger_type,'customer') AS ledger_type,
               COALESCE(cl.opening_balance,0)
                 + COALESCE(SUM(t.amount_pending),0)
                 - COALESCE(SUM(t.amount_received),0) AS net
        FROM clients cl
        LEFT JOIN folders f ON f.id = cl.folder_id
        LEFT JOIN transactions t ON t.client_id = cl.id
        GROUP BY cl.id
      )
      SELECT
        (SELECT COALESCE(SUM(amount_received),0) FROM transactions) as total_received,
        (SELECT COALESCE(SUM(amount_pending),0) FROM transactions) as total_pending,
        (SELECT COUNT(*) FROM transactions) as total_transactions,
        -- Customer side: net money customers still owe US (only positive nets)
        COALESCE(SUM(CASE WHEN ledger_type = 'customer' AND net > 0 THEN net ELSE 0 END),0) as customer_pending,
        -- Money customers paid us in ADVANCE (negative nets, shown as positive)
        COALESCE(SUM(CASE WHEN ledger_type = 'customer' AND net < 0 THEN -net ELSE 0 END),0) as customer_advance,
        -- Supplier side: net money WE still owe suppliers (only positive nets)
        COALESCE(SUM(CASE WHEN ledger_type = 'supplier' AND net > 0 THEN net ELSE 0 END),0) as supplier_pending,
        -- Money WE paid suppliers in ADVANCE (negative nets, shown as positive)
        COALESCE(SUM(CASE WHEN ledger_type = 'supplier' AND net < 0 THEN -net ELSE 0 END),0) as supplier_advance
      FROM client_net
    `).first(),
    // Per-folder summary. "remaining" is computed PER CLIENT (only positive nets
    // summed) so an advance to one client does not cancel another's debt, and an
    // overpaid client shows 0 remaining. "advance" is the total over-payment in
    // that folder. total_received / total_pending stay as gross sums for display.
    c.env.DB.prepare(`
      WITH client_net AS (
        SELECT cl.id AS client_id, cl.folder_id AS folder_id,
               COALESCE(SUM(t.amount_received),0) AS received,
               COALESCE(SUM(t.amount_pending),0) AS pending,
               COALESCE(cl.opening_balance,0)
                 + COALESCE(SUM(t.amount_pending),0)
                 - COALESCE(SUM(t.amount_received),0) AS net
        FROM clients cl
        LEFT JOIN transactions t ON t.client_id = cl.id
        GROUP BY cl.id
      )
      SELECT f.id, f.name, f.icon, f.color, f.section_type,
             COALESCE(f.ledger_type,'customer') as ledger_type,
             (SELECT COUNT(*) FROM clients c2 WHERE c2.folder_id = f.id) as client_count,
             COALESCE(SUM(cn.received),0) as total_received,
             COALESCE(SUM(cn.pending),0) as total_pending,
             COALESCE(SUM(CASE WHEN cn.net > 0 THEN cn.net ELSE 0 END),0) as remaining,
             COALESCE(SUM(CASE WHEN cn.net < 0 THEN -cn.net ELSE 0 END),0) as advance
      FROM folders f
      LEFT JOIN client_net cn ON cn.folder_id = f.id
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
    c.env.DB.prepare(`SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as total,
       COALESCE(SUM(CASE WHEN entry_date = date('now') THEN amount ELSE 0 END), 0) as total_today,
       COALESCE(SUM(CASE WHEN entry_date >= date('now','start of month') THEN amount ELSE 0 END), 0) as total_month
       FROM side_expenses`).first(),
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
    `).all(),
    // Supplier stats (how much we owe suppliers across all raw-material purchases)
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total_purchased,
        COALESCE(SUM(paid_amount), 0) as total_paid,
        COALESCE(SUM(remaining_amount), 0) as total_remaining,
        COUNT(*) as purchase_count
      FROM raw_material_purchases
    `).first(),
    // Manufacturing products with recipes
    c.env.DB.prepare(`SELECT id, name, unit, sale_rate, category FROM products ORDER BY name ASC`).all(),
    // All product ingredients (joined with raw materials for cost & stock lookups)
    c.env.DB.prepare(`
      SELECT pi.product_id, pi.raw_material_id, pi.quantity_required, pi.unit,
             rm.name as raw_name, rm.unit as raw_unit, rm.quantity as raw_quantity, rm.rate as raw_rate
      FROM product_ingredients pi
      LEFT JOIN raw_materials rm ON rm.id = pi.raw_material_id
    `).all(),
    // Bills items grouped by product to compute units sold (i.e. produced)
    c.env.DB.prepare(`
      SELECT product_name,
             COALESCE(SUM(quantity), 0) as units_sold,
             COALESCE(SUM(total), 0) as total_revenue,
             COALESCE(SUM(quantity * manufacturing_cost), 0) as total_mfg_cost
      FROM bill_items
      WHERE product_name IS NOT NULL AND product_name != ''
      GROUP BY product_name
    `).all(),
    // Sales totals — today
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(bi.quantity), 0) as units_sold,
             COALESCE(SUM(bi.total), 0) as total_revenue,
             COUNT(DISTINCT b.id) as bill_count
      FROM bill_items bi
      LEFT JOIN bills b ON b.id = bi.bill_id
      WHERE b.bill_date = date('now')
    `).first(),
    // Sales totals — this month
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(bi.quantity), 0) as units_sold,
             COALESCE(SUM(bi.total), 0) as total_revenue,
             COUNT(DISTINCT b.id) as bill_count
      FROM bill_items bi
      LEFT JOIN bills b ON b.id = bi.bill_id
      WHERE b.bill_date >= date('now','start of month')
    `).first(),
    // Sales totals — all time
    c.env.DB.prepare(`
      SELECT COALESCE(SUM(bi.quantity), 0) as units_sold,
             COALESCE(SUM(bi.total), 0) as total_revenue,
             COUNT(DISTINCT b.id) as bill_count
      FROM bill_items bi
      LEFT JOIN bills b ON b.id = bi.bill_id
    `).first(),
    // Per-product sales — today
    c.env.DB.prepare(`
      SELECT bi.product_name,
             COALESCE(SUM(bi.quantity), 0) as units_sold,
             COALESCE(SUM(bi.total), 0) as total_revenue
      FROM bill_items bi
      LEFT JOIN bills b ON b.id = bi.bill_id
      WHERE b.bill_date = date('now') AND bi.product_name IS NOT NULL AND bi.product_name != ''
      GROUP BY bi.product_name
      ORDER BY units_sold DESC
    `).all(),
    // Per-product sales — this month
    c.env.DB.prepare(`
      SELECT bi.product_name,
             COALESCE(SUM(bi.quantity), 0) as units_sold,
             COALESCE(SUM(bi.total), 0) as total_revenue
      FROM bill_items bi
      LEFT JOIN bills b ON b.id = bi.bill_id
      WHERE b.bill_date >= date('now','start of month') AND bi.product_name IS NOT NULL AND bi.product_name != ''
      GROUP BY bi.product_name
      ORDER BY units_sold DESC
    `).all(),
    // Per-product sales — all time
    c.env.DB.prepare(`
      SELECT bi.product_name,
             COALESCE(SUM(bi.quantity), 0) as units_sold,
             COALESCE(SUM(bi.total), 0) as total_revenue
      FROM bill_items bi
      LEFT JOIN bills b ON b.id = bi.bill_id
      WHERE bi.product_name IS NOT NULL AND bi.product_name != ''
      GROUP BY bi.product_name
      ORDER BY units_sold DESC
    `).all(),
    // Raw material PURCHASE cost (actual money spent buying raw material) — today / month / all
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(total_amount), 0) as total_all,
        COALESCE(SUM(CASE WHEN entry_date = date('now') THEN total_amount ELSE 0 END), 0) as total_today,
        COALESCE(SUM(CASE WHEN entry_date >= date('now','start of month') THEN total_amount ELSE 0 END), 0) as total_month
      FROM raw_material_purchases
    `).first(),
    // Employee salary/payments actually PAID (salary paid + advance + bonus) — today / month / all
    // We treat the actual cash that went out to workers as a cost for Net Profit.
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(paidval), 0) as total_all,
        COALESCE(SUM(CASE WHEN entry_date = date('now') THEN paidval ELSE 0 END), 0) as total_today,
        COALESCE(SUM(CASE WHEN entry_date >= date('now','start of month') THEN paidval ELSE 0 END), 0) as total_month
      FROM (
        SELECT entry_date,
          CASE
            WHEN type='salary' THEN (CASE WHEN paid_amount IS NULL THEN amount ELSE paid_amount END)
            WHEN type IN ('advance','bonus','payment','per_piece') THEN amount
            ELSE 0
          END as paidval
        FROM employee_transactions
      )
    `).first(),
    // #5: Components Production summary — overall totals (pieces produced today / month / all + payout)
    c.env.DB.prepare(`
      SELECT
        COALESCE(SUM(quantity),0) as pieces_all,
        COALESCE(SUM(payout),0) as payout_all,
        COALESCE(SUM(CASE WHEN entry_date = date('now') THEN quantity ELSE 0 END),0) as pieces_today,
        COALESCE(SUM(CASE WHEN entry_date = date('now') THEN payout ELSE 0 END),0) as payout_today,
        COALESCE(SUM(CASE WHEN entry_date >= date('now','start of month') THEN quantity ELSE 0 END),0) as pieces_month,
        COALESCE(SUM(CASE WHEN entry_date >= date('now','start of month') THEN payout ELSE 0 END),0) as payout_month,
        COUNT(*) as log_count
      FROM production_logs
    `).first(),
    // #5: Components list with current stock + total produced (all time)
    c.env.DB.prepare(`
      SELECT cmp.id, cmp.name, cmp.unit, cmp.quantity, cmp.default_rate,
        (SELECT COALESCE(SUM(pl.quantity),0) FROM production_logs pl WHERE pl.component_id = cmp.id) as produced_all,
        (SELECT COALESCE(SUM(pl.quantity),0) FROM production_logs pl WHERE pl.component_id = cmp.id AND pl.entry_date >= date('now','start of month')) as produced_month
      FROM components cmp
      ORDER BY cmp.name ASC
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
    invMfgList: invMfgList.results,
    supplierStats,
    mfgProducts: mfgProducts.results,
    mfgIngredients: mfgIngredients.results,
    builtSoldStats: builtSoldStats.results,
    salesTodayStats,
    salesMonthStats,
    salesAllTimeStats,
    salesTodayProducts: salesTodayProducts.results,
    salesMonthProducts: salesMonthProducts.results,
    salesAllTimeProducts: salesAllTimeProducts.results,
    rawCostStats,
    salaryPaidStats,
    compProdStats,
    compProdList: compProdList.results
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
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>Two Star Essentials</title>
<!-- PWA -->
<link rel="manifest" href="/manifest.webmanifest">
<meta name="theme-color" content="#4f46e5">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Two Star Essentials">
<link rel="icon" type="image/png" href="/icons/favicon.png">
<link rel="apple-touch-icon" href="/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="preconnect" href="https://cdn.tailwindcss.com">
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"></script>
<script src="https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js"></script>
<link rel="stylesheet" href="/static/style.css">
</head>
<body class="bg-gray-100 antialiased">
<div id="app">
  <div class="boot-loader">
    <div class="boot-spinner"></div>
    <p class="boot-text">Loading Two Star Essentials...</p>
  </div>
</div>
<!-- PWA install prompt button (hidden until browser allows install) -->
<button id="pwa-install-btn" type="button" aria-label="App install karein" style="display:none;position:fixed;right:16px;bottom:16px;z-index:9999;background:#4f46e5;color:#fff;border:none;border-radius:9999px;padding:12px 18px;font-size:14px;font-weight:600;box-shadow:0 6px 20px rgba(79,70,229,.45);cursor:pointer;">
  <i class="fas fa-download" style="margin-right:8px;"></i>App Install Karein
</button>
<script src="/static/app.js" defer></script>
<script>
(function () {
  // --- Service worker registration ---
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('/sw.js').catch(function (e) {
        console.warn('SW registration failed', e);
      });
    });
  }

  // --- Install prompt handling (Android / desktop Chrome / Edge) ---
  var deferredPrompt = null;
  var btn = document.getElementById('pwa-install-btn');

  function isStandalone() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  }

  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (btn && !isStandalone()) btn.style.display = 'inline-flex';
  });

  if (btn) {
    btn.addEventListener('click', async function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null;
      btn.style.display = 'none';
    });
  }

  window.addEventListener('appinstalled', function () {
    deferredPrompt = null;
    if (btn) btn.style.display = 'none';
  });

  // iOS Safari has no beforeinstallprompt — show a one-time hint to use "Add to Home Screen".
  var isIos = /iphone|ipad|ipod/i.test(window.navigator.userAgent);
  if (isIos && !isStandalone() && btn) {
    var seen = false;
    try { seen = localStorage.getItem('ios-a2hs-hint') === '1'; } catch (e) {}
    if (!seen) {
      btn.innerHTML = '<i class="fas fa-arrow-up-from-bracket" style="margin-right:8px;"></i>Share \u2192 Add to Home Screen';
      btn.style.display = 'inline-flex';
      btn.addEventListener('click', function () {
        try { localStorage.setItem('ios-a2hs-hint', '1'); } catch (e) {}
        btn.style.display = 'none';
      });
    }
  }
})();
</script>
</body>
</html>`)
})

export default app
