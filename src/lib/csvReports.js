// ── IndexedDB constants ──────────────────────────────────────────────────────
const DB_NAME = 'claude_trader_db'
const STORE_NAME = 'file_handles'
const HANDLE_KEY = 'reports_csv_handle'

// ── CSV column headers ───────────────────────────────────────────────────────
const CSV_HEADERS = ['date', 'startValue', 'endValue', 'dayPnl', 'dayPnlPct', 'tradeCount', 'trades', 'positions', 'commentary']

// ── IndexedDB helpers ────────────────────────────────────────────────────────

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME)
    }
    req.onsuccess = (e) => resolve(e.target.result)
    req.onerror = (e) => reject(e.target.error)
  })
}

export async function getStoredHandle() {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const req = tx.objectStore(STORE_NAME).get(HANDLE_KEY)
      req.onsuccess = (e) => resolve(e.target.result ?? null)
      req.onerror = (e) => reject(e.target.error)
    })
  } catch (err) {
    console.error('[csvReports] getStoredHandle error:', err)
    return null
  }
}

export async function storeHandle(handle) {
  try {
    const db = await openDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const req = tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY)
      req.onsuccess = () => resolve()
      req.onerror = (e) => reject(e.target.error)
    })
  } catch (err) {
    console.error('[csvReports] storeHandle error:', err)
  }
}

// ── CSV serialisation ────────────────────────────────────────────────────────

/**
 * Escape a single value for CSV:
 *  - wrap in double-quotes if it contains a comma, double-quote, or newline
 *  - double any embedded double-quotes
 */
function csvEscape(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"'
  }
  return str
}

/**
 * Convert an array of report objects to a CSV string (with header row).
 */
export function reportsToCSV(reports) {
  const rows = [CSV_HEADERS.join(',')]
  for (const r of reports) {
    const tradesJSON = JSON.stringify(r.trades ?? [])
    const posJSON = JSON.stringify(r.positionsSnapshot ?? {})
    const row = [
      csvEscape(r.date),
      csvEscape(r.startValue),
      csvEscape(r.endValue),
      csvEscape(r.dayPnl),
      csvEscape(r.dayPnlPct),
      csvEscape(r.tradesCount ?? (r.trades?.length ?? 0)),
      csvEscape(tradesJSON),
      csvEscape(posJSON),
      csvEscape(r.commentary ?? ''),
    ]
    rows.push(row.join(','))
  }
  return rows.join('\n')
}

/**
 * Parse a CSV string (produced by reportsToCSV) back into an array of report objects.
 * Handles quoted fields that may contain commas or newlines.
 */
export function parseCSV(text) {
  if (!text || !text.trim()) return []

  // Split into lines respecting quoted multi-line fields
  const lines = []
  let current = ''
  let inQuotes = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        // escaped quote
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
        current += ch
      }
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && text[i + 1] === '\n') i++ // CRLF
      if (current.length > 0) lines.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  if (current.length > 0) lines.push(current)

  if (lines.length < 2) return [] // only header or empty

  // Parse a single CSV line into an array of field strings
  function parseLine(line) {
    const fields = []
    let field = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQ = !inQ
        }
      } else if (ch === ',' && !inQ) {
        fields.push(field)
        field = ''
      } else {
        field += ch
      }
    }
    fields.push(field)
    return fields
  }

  const header = parseLine(lines[0])
  const reports = []

  for (let li = 1; li < lines.length; li++) {
    const fields = parseLine(lines[li])
    if (fields.length < header.length) continue

    const obj = {}
    header.forEach((col, idx) => {
      obj[col] = fields[idx] ?? ''
    })

    // Coerce numeric fields
    let trades = []
    let positionsSnapshot = {}
    try { trades = JSON.parse(obj.trades || '[]') } catch (_) { trades = [] }
    try { positionsSnapshot = JSON.parse(obj.positions || '{}') } catch (_) { positionsSnapshot = {} }

    reports.push({
      date: obj.date,
      startValue: parseFloat(obj.startValue) || 0,
      endValue: parseFloat(obj.endValue) || 0,
      dayPnl: parseFloat(obj.dayPnl) || 0,
      dayPnlPct: parseFloat(obj.dayPnlPct) || 0,
      tradesCount: parseInt(obj.tradeCount, 10) || 0,
      trades,
      positionsSnapshot,
      commentary: obj.commentary ?? '',
      generatedAt: obj.generatedAt ?? '',
    })
  }

  return reports
}

// ── File read/write ──────────────────────────────────────────────────────────

/**
 * Read the full text of a FileSystemFileHandle.
 */
async function readFileText(handle) {
  const file = await handle.getFile()
  return file.text()
}

/**
 * Write (overwrite) text to a FileSystemFileHandle.
 */
async function writeFileText(handle, text) {
  const writable = await handle.createWritable()
  await writable.write(text)
  await writable.close()
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Save/append a single report to the CSV file.
 * On first call (no stored handle) opens a save picker so the user can choose location.
 * Returns the file handle on success, null on failure/unsupported.
 */
export async function saveReportToCSV(report) {
  if (!('showSaveFilePicker' in window)) {
    console.warn('[csvReports] File System Access API not supported in this browser.')
    return null
  }

  try {
    let handle = await getStoredHandle()

    if (!handle) {
      // First time — prompt user to choose save location
      handle = await window.showSaveFilePicker({
        suggestedName: 'claude-trader-reports.csv',
        types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
      })
      await storeHandle(handle)
    }

    // Verify/request write permission
    let perm = await handle.queryPermission({ mode: 'readwrite' })
    if (perm === 'prompt') {
      perm = await handle.requestPermission({ mode: 'readwrite' })
    }
    if (perm !== 'granted') {
      console.warn('[csvReports] Write permission denied.')
      return null
    }

    // Read existing content so we can append
    let existingText = ''
    try {
      existingText = await readFileText(handle)
    } catch (_) {
      // File may not exist yet (fresh handle)
    }

    let newText
    if (!existingText.trim()) {
      // Fresh file — write headers + first row
      newText = reportsToCSV([report])
    } else {
      // Append a new data row (skip header rebuild)
      const tradesJSON = JSON.stringify(report.trades ?? [])
      const posJSON = JSON.stringify(report.positionsSnapshot ?? {})
      const row = [
        csvEscape(report.date),
        csvEscape(report.startValue),
        csvEscape(report.endValue),
        csvEscape(report.dayPnl),
        csvEscape(report.dayPnlPct),
        csvEscape(report.tradesCount ?? (report.trades?.length ?? 0)),
        csvEscape(tradesJSON),
        csvEscape(posJSON),
        csvEscape(report.commentary ?? ''),
      ].join(',')

      // If the file already has a row for today, replace it; otherwise append
      const lines = existingText.trimEnd().split('\n')
      const headerLine = lines[0]
      const dataLines = lines.slice(1)
      const dateField = csvEscape(report.date)
      const existingIdx = dataLines.findIndex((l) => l.startsWith(dateField + ',') || l.startsWith(dateField + '\r'))
      if (existingIdx !== -1) {
        dataLines[existingIdx] = row
      } else {
        dataLines.push(row)
      }
      newText = [headerLine, ...dataLines].join('\n')
    }

    await writeFileText(handle, newText)
    return handle
  } catch (err) {
    if (err.name === 'AbortError') return null // user cancelled picker
    console.error('[csvReports] saveReportToCSV error:', err)
    return null
  }
}

/**
 * Load reports from the stored CSV file handle.
 * Returns { reports: [...], fileName: string, status: 'connected'|'needs-permission'|'error'|'no-handle' }
 */
export async function loadReportsFromCSV() {
  if (!('showSaveFilePicker' in window)) {
    return { reports: [], fileName: null, status: 'unsupported' }
  }

  try {
    const handle = await getStoredHandle()
    if (!handle) {
      return { reports: [], fileName: null, status: 'no-handle' }
    }

    const fileName = handle.name

    const perm = await handle.queryPermission({ mode: 'readwrite' })

    if (perm === 'granted') {
      try {
        const text = await readFileText(handle)
        const reports = parseCSV(text)
        return { reports, fileName, status: 'connected' }
      } catch (err) {
        console.error('[csvReports] loadReportsFromCSV read error:', err)
        return { reports: [], fileName, status: 'error' }
      }
    }

    if (perm === 'prompt') {
      return { reports: [], fileName, status: 'needs-permission' }
    }

    // denied
    return { reports: [], fileName, status: 'error' }
  } catch (err) {
    console.error('[csvReports] loadReportsFromCSV error:', err)
    return { reports: [], fileName: null, status: 'error' }
  }
}

/**
 * Request permission for the stored handle and read the CSV.
 * Used when status is 'needs-permission' and user clicks the banner.
 * Returns { reports, fileName, status } same shape as loadReportsFromCSV.
 */
export async function requestPermissionAndLoad() {
  try {
    const handle = await getStoredHandle()
    if (!handle) return { reports: [], fileName: null, status: 'no-handle' }

    const perm = await handle.requestPermission({ mode: 'readwrite' })
    if (perm !== 'granted') {
      return { reports: [], fileName: handle.name, status: 'error' }
    }

    const text = await readFileText(handle)
    const reports = parseCSV(text)
    return { reports, fileName: handle.name, status: 'connected' }
  } catch (err) {
    console.error('[csvReports] requestPermissionAndLoad error:', err)
    return { reports: [], fileName: null, status: 'error' }
  }
}

/**
 * Open a file picker so the user can manually select (or re-select) the reports CSV.
 * Stores the new handle and reads the file.
 * Returns { reports, fileName, status }.
 */
export async function pickAndLoadCSV() {
  if (!('showOpenFilePicker' in window)) {
    return { reports: [], fileName: null, status: 'unsupported' }
  }

  try {
    const [handle] = await window.showOpenFilePicker({
      types: [{ description: 'CSV Files', accept: { 'text/csv': ['.csv'] } }],
      multiple: false,
    })
    await storeHandle(handle)
    const text = await readFileText(handle)
    const reports = parseCSV(text)
    return { reports, fileName: handle.name, status: 'connected' }
  } catch (err) {
    if (err.name === 'AbortError') return { reports: [], fileName: null, status: 'no-handle' }
    console.error('[csvReports] pickAndLoadCSV error:', err)
    return { reports: [], fileName: null, status: 'error' }
  }
}
