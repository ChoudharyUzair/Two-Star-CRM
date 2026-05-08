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

async function hashPassword(password: string): Promise<string> {
  return await sha256(password)
}

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

// ============ AUTH ROUTES ============
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
    httpOnly: true,
    secure: true,
    sameSite: 'Lax',
    maxAge: 7 * 24 * 60 * 60,
    path: '/'
  })

  return c.json({ success: true, username: user.username })
})

app.post('/api/auth/logout', async (c) => {
  const sessionId = getCookie(c, 'session_id')
  if (sessionId) {
    await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId).run()
  }
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

// ============ FOLDERS ROUTES ============
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
  const { name, icon, color } = await c.req.json()
  if (!name) return c.json({ error: 'Name required' }, 400)
  const result = await c.env.DB.prepare(
    'INSERT INTO folders (name, icon, color) VALUES (?, ?, ?)'
  ).bind(name, icon || 'fa-folder', color || '#3b82f6').run()
  return c.json({ id: result.meta.last_row_id, name, icon, color })
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

// ============ CLIENTS ROUTES ============
app.get('/api/folders/:id/clients', requireAuth, async (c) => {
  const folderId = c.req.param('id')
  const result = await c.env.DB.prepare(
    'SELECT * FROM clients WHERE folder_id = ? ORDER BY name'
  ).bind(folderId).all()
  return c.json({ clients: result.results })
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
  return c.json({
    client,
    custom_columns: cols ? JSON.parse(cols.columns_json as string) : []
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

// Custom columns
app.put('/api/clients/:id/columns', requireAuth, async (c) => {
  const id = c.req.param('id')
  const { columns } = await c.req.json()
  const json = JSON.stringify(columns || [])
  const existing = await c.env.DB.prepare('SELECT id FROM client_columns WHERE client_id = ?').bind(id).first()
  if (existing) {
    await c.env.DB.prepare('UPDATE client_columns SET columns_json = ? WHERE client_id = ?').bind(json, id).run()
  } else {
    await c.env.DB.prepare('INSERT INTO client_columns (client_id, columns_json) VALUES (?, ?)').bind(id, json).run()
  }
  return c.json({ success: true })
})

// ============ TRANSACTIONS ROUTES ============
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
    entry_date,
    bill_no || '',
    amount_received || 0,
    amount_pending || 0,
    status || 'Pending',
    description || '',
    JSON.stringify(custom_data || {}),
    id
  ).run()
  return c.json({ success: true })
})

app.delete('/api/transactions/:id', requireAuth, async (c) => {
  const id = c.req.param('id')
  await c.env.DB.prepare('DELETE FROM transactions WHERE id = ?').bind(id).run()
  return c.json({ success: true })
})

// ============ DASHBOARD ROUTES ============
app.get('/api/dashboard', requireAuth, async (c) => {
  // Overall totals
  const totals = await c.env.DB.prepare(`
    SELECT 
      COALESCE(SUM(amount_received), 0) as total_received,
      COALESCE(SUM(amount_pending), 0) as total_pending,
      COUNT(*) as total_transactions
    FROM transactions
  `).first()

  // Per-folder totals
  const perFolder = await c.env.DB.prepare(`
    SELECT 
      f.id, f.name, f.icon, f.color,
      COUNT(DISTINCT cl.id) as client_count,
      COALESCE(SUM(t.amount_received), 0) as total_received,
      COALESCE(SUM(t.amount_pending), 0) as total_pending
    FROM folders f
    LEFT JOIN clients cl ON cl.folder_id = f.id
    LEFT JOIN transactions t ON t.client_id = cl.id
    GROUP BY f.id
    ORDER BY f.sort_order
  `).all()

  // Top clients by pending
  const topPending = await c.env.DB.prepare(`
    SELECT cl.id, cl.name, f.name as folder_name,
      COALESCE(SUM(t.amount_pending), 0) as pending,
      COALESCE(SUM(t.amount_received), 0) as received
    FROM clients cl
    LEFT JOIN folders f ON f.id = cl.folder_id
    LEFT JOIN transactions t ON t.client_id = cl.id
    GROUP BY cl.id
    ORDER BY pending DESC
    LIMIT 10
  `).all()

  // Recent transactions
  const recent = await c.env.DB.prepare(`
    SELECT t.*, cl.name as client_name, f.name as folder_name
    FROM transactions t
    LEFT JOIN clients cl ON cl.id = t.client_id
    LEFT JOIN folders f ON f.id = cl.folder_id
    ORDER BY t.created_at DESC
    LIMIT 10
  `).all()

  // Status counts
  const statuses = await c.env.DB.prepare(`
    SELECT status, COUNT(*) as count, COALESCE(SUM(amount_pending),0) as pending_sum, COALESCE(SUM(amount_received),0) as received_sum
    FROM transactions
    GROUP BY status
  `).all()

  // Client count
  const clientCount = await c.env.DB.prepare('SELECT COUNT(*) as c FROM clients').first()
  const folderCount = await c.env.DB.prepare('SELECT COUNT(*) as c FROM folders').first()

  return c.json({
    totals,
    perFolder: perFolder.results,
    topPending: topPending.results,
    recent: recent.results,
    statuses: statuses.results,
    clientCount: clientCount?.c || 0,
    folderCount: folderCount?.c || 0
  })
})

// ============ ROOT - serve frontend ============
app.get('/', (c) => {
  return c.html(`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>CRM System - Muhammad Uzair</title>
<script src="https://cdn.tailwindcss.com"></script>
<link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
<link rel="stylesheet" href="/static/style.css">
</head>
<body class="bg-gray-100 antialiased">
<div id="app"></div>
<script src="/static/app.js"></script>
</body>
</html>`)
})

export default app
