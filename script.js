/* global Chart, html2canvas, jspdf, Dexie */
// @ts-check

// =======================================================
//                       BANPLEX v10.1
// =======================================================

import {
  initializeApp
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  onSnapshot,
  query,
  getDocs,
  addDoc,
  orderBy,
  deleteDoc,
  where,
  runTransaction,
  writeBatch,
  increment,
  Timestamp,
  initializeFirestore,
  persistentLocalCache,
  limit,
  startAfter
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-firestore.js";
import {
  getStorage,
  ref,
  uploadBytesResumable,
  getDownloadURL,
  deleteObject
} from "https://www.gstatic.com/firebasejs/12.3.0/firebase-storage.js";
import {
  logoData
} from './logo-data.js';

function showUpdateNotification(reg) {
    // Cek dulu, jangan tampilkan notifikasi jika sudah ada
    if (document.getElementById('update-notification')) {
        return;
    }

    // Siapkan HTML untuk notifikasi
    const notificationHTML = `
      <div class="update-card">
        <div class="update-info">
          <h4>Aplikasi telah diperbarui</h4>
          <p>Mulai ulang untuk versi terbaru.</p>
        </div>
        <button class="btn" id="restart-app-btn">Mulai Ulang</button>
      </div>
    `;

    // 1. Buat elemen dan tambahkan ke halaman DULU
    const notificationElement = document.createElement('div');
    notificationElement.id = 'update-notification';
    notificationElement.innerHTML = notificationHTML;
    document.body.appendChild(notificationElement);

    // 2. SEKARANG, setelah elemen ada di halaman, cari tombolnya
    const restartBtn = document.getElementById('restart-app-btn');

    // 3. Pasang HANYA SATU event listener yang benar
    if (restartBtn && reg && reg.waiting) {
        restartBtn.addEventListener('click', () => {
            restartBtn.disabled = true; // Nonaktifkan tombol setelah diklik
            restartBtn.textContent = 'Memuat ulang...';
            // Kirim pesan ke service worker untuk mengambil alih
            reg.waiting.postMessage({ action: 'skipWaiting' }); 
        });
    }

    // 4. Tampilkan notifikasi dengan animasi
    setTimeout(() => {
        notificationElement.classList.add('show');
    }, 100);
}
  
async function main() {

    // =======================================================
    //          FASE 1: KONFIGURASI & STATE GLOBAL
    // =======================================================
    const firebaseConfig = {
      apiKey: "AIzaSyBDTURKKzmhG8hZXlBryoQRdjqd70GI18c",
      authDomain: "banflex-3e7c4.firebaseapp.com",
      projectId: "banflex-3e7c4",
      storageBucket: "banflex-3e7c4.appspot.com",
      messagingSenderId: "192219628345",
      appId: "1:192219628345:web:f1caa28230a5803e681ee8"
    };
    const TEAM_ID = 'main';
    const OWNER_EMAIL = 'dq060412@gmail.com';

  const ALL_NAV_LINKS = [{
      id: 'dashboard',
      icon: 'dashboard',
      label: 'Dashboard',
      roles: ['Owner', 'Editor', 'Viewer']
  }, {
      id: 'pemasukan',
      icon: 'account_balance_wallet',
      label: 'Pemasukan',
      roles: ['Owner']
  }, {
      id: 'pengeluaran',
      icon: 'post_add',
      label: 'Pengeluaran',
      roles: ['Owner', 'Editor']
  }, {
      id: 'absensi',
      icon: 'person_check',
      label: 'Absensi',
      roles: ['Owner', 'Editor']
  }, {
      id: 'jurnal',
      icon: 'summarize',
      label: 'Jurnal',
      roles: ['Owner', 'Editor', 'Viewer']
  }, {
      id: 'stok',
      icon: 'inventory_2',
      label: 'Stok',
      roles: ['Owner', 'Editor', 'Viewer']
  }, {
      id: 'tagihan',
      icon: 'receipt_long',
      label: 'Tagihan',
      roles: ['Owner', 'Editor', 'Viewer']
  }, {
      id: 'laporan',
      icon: 'monitoring',
      label: 'Laporan',
      roles: ['Owner', 'Viewer']
  }, {
      id: 'simulasi',
      icon: 'payments',
      label: 'Simulasi Bayar',
      roles: ['Owner']
  }, {
      id: 'pengaturan',
      icon: 'settings',
      label: 'Pengaturan',
      roles: ['Owner', 'Editor', 'Viewer']
  }, ];
  
  // Batasi item di bottom-nav maksimal 5 per role (urut sesuai preferensi)
  const BOTTOM_NAV_BY_ROLE = {
      Owner: ['dashboard', 'pengeluaran', 'tagihan', 'absensi', 'pengaturan'],
      Editor: ['dashboard', 'pengeluaran', 'absensi', 'tagihan', 'pengaturan'],
      Viewer: ['dashboard', 'laporan', 'tagihan', 'stok', 'pengaturan']
  };

  const appState = {
    currentUser: null,
    userRole: 'Guest',
    userStatus: null,
    justLoggedIn: false,
    pendingUsersCount: 0,
    activePage: localStorage.getItem('lastActivePage') || 'dashboard',
    activeSubPage: new Map(),
    isOnline: navigator.onLine,
    isSyncing: false,
    comments: [],
    projects: [],
    clients: [],
    fundingCreditors: [],
    operationalCategories: [],
    materialCategories: [],
    otherCategories: [],
    suppliers: [],
    workers: [],
    professions: [],
    incomes: [],
    fundingSources: [],
    expenses: [],
    bills: [],
    attendance: new Map(),
    users: [],
    materials: [],
    stockTransactions: [],
    attendanceRecords: [],
    staff: [],
    tagihan: {
        currentList: [], // Untuk menyimpan daftar tagihan yang ditampilkan
    },
    selectionMode: {
        active: false,
        selectedIds: new Set(),
        pageContext: ''
    },
    billsFilter: {
        searchTerm: '',
        projectId: 'all',
        supplierId: 'all',
        sortBy: 'dueDate',
        sortDirection: 'desc',
        category: 'all'
    },
    pagination: {
        bills: {
            lastVisible: null,
            isLoading: false,
            hasMore: true
        }
    },
    dashboardTotals: {
        labaBersih: 0,
        totalUnpaid: 0,
    },
    pdfSettings: null,
    simulasiState: {
        selectedPayments: new Map()
    },
    activeListeners: new Map(),
};

// =======================================================
//      SEKSI 1.5: DATABASE LOKAL (DEXIE.JS)
// =======================================================
const localDB = new Dexie('BanPlexLocalDB');

// [REVISI FINAL] Naikkan versi dan tambahkan semua index yang dibutuhkan
localDB.version(66).stores({
    // Data Transaksi
    expenses: '&id, projectId, date, type, status, isDeleted, needsSync, attachmentNeedsSync', // <-- 'attachmentNeedsSync' ditambahkan
    bills: '&id, expenseId, status, dueDate, type, isDeleted, needsSync',
    incomes: '&id, projectId, date, isDeleted, needsSync',
    funding_sources: '&id, creditorId, status, isDeleted, needsSync',
    attendance_records: '&id, workerId, date, isPaid, isDeleted, needsSync',
    stock_transactions: '&id, materialId, date, type, isDeleted, needsSync',
    comments: '&id, parentId, parentType, createdAt, isDeleted, needsSync, [parentId+parentType]',
    files: 'id',

    // Master Data
    projects: '&id, projectName',
    suppliers: '&id, supplierName',
    workers: '&id, workerName',
    materials: '&id, materialName',
    staff: '&id, staffName',
    professions: '&id, professionName',
    operational_categories: '&id, categoryName',
    material_categories: '&id, categoryName',
    other_categories: '&id, categoryName',
    funding_creditors: '&id, creditorId',

    // Antrean offline
    pending_payments: '++id, billId, workerId, date, [billId+workerId]',
    pending_logs: '++id, action, createdAt',
    pending_conflicts: '++id, table, docId'
});

// =======================================================
//      SEKSI 1.6: INISIALISASI FIREBASE
// =======================================================
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const storage = getStorage(app);
let db;

try {
    await setPersistence(auth, browserLocalPersistence);
} catch (e) {
    console.warn("Persistence failed", e.code);
}

try {
    db = initializeFirestore(app, {
        cache: persistentLocalCache({
            tabManager: 'MEMORY_CACHE_TAB_MANAGER'
        })
    });
} catch (e) {
    db = getFirestore(app);
}

// =======================================================
//      SEKSI 1.7: REFERENSI KOLEKSI FIRETORE
// =======================================================
const membersCol = collection(db, 'teams', TEAM_ID, 'members');
const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
const fundingCreditorsCol = collection(db, 'teams', TEAM_ID, 'funding_creditors');
const opCatsCol = collection(db, 'teams', TEAM_ID, 'operational_categories');
const matCatsCol = collection(db, 'teams', TEAM_ID, 'material_categories');
const otherCatsCol = collection(db, 'teams', TEAM_ID, 'other_categories');
const suppliersCol = collection(db, 'teams', TEAM_ID, 'suppliers');
const workersCol = collection(db, 'teams', TEAM_ID, 'workers');
const professionsCol = collection(db, 'teams', TEAM_ID, 'professions');
const attendanceRecordsCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
const incomesCol = collection(db, 'teams', TEAM_ID, 'incomes');
const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
const expensesCol = collection(db, 'teams', TEAM_ID, 'expenses');
const billsCol = collection(db, 'teams', TEAM_ID, 'bills');
const logsCol = collection(db, 'teams', TEAM_ID, 'logs');
const materialsCol = collection(db, 'teams', TEAM_ID, 'materials');
const stockTransactionsCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
const staffCol = collection(db, 'teams', TEAM_ID, 'staff');
const commentsCol = collection(db, 'teams', TEAM_ID, 'comments');

// [IMPROVE-UI/UX]: Global chart instance for interactive report bar chart
let interactiveReportChart = null;

function getLastSyncTimestamp() {
    const stored = localStorage.getItem('lastSyncTimestamp');
    return stored ? new Date(parseInt(stored)) : new Date(0);
  }
  
  function setLastSyncTimestamp() {
    localStorage.setItem('lastSyncTimestamp', Date.now().toString());
  }
// =======================================================
//          SEKSI 2: UTILITAS, MODAL & AUTENTIKASI
// =======================================================
const $ = (s, context = document) => context.querySelector(s);
const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));
const fmtIDR = (n) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0
}).format(Number(n || 0));
const centerTextPlugin = {
    id: 'centerText',
    afterDraw: function(chart) {
        if (chart.config.type !== 'doughnut') return;
        
        const ctx = chart.ctx;
        const chartArea = chart.chartArea;
        const centerX = (chartArea.left + chartArea.right) / 2;
        const centerY = (chartArea.top + chartArea.bottom) / 2;
        
        ctx.save();
        
        let labelToDraw = "Total";
        let textToDraw = "";
        
        const total = chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
        textToDraw = fmtIDR(total);

        // [LOGIKA INTERAKTIF] Cek apakah ada bagian yang sedang aktif (disentuh/hover)
        const activeElements = chart.getActiveElements();
        if (activeElements.length > 0) {
            const activeIndex = activeElements[0].index;
            const activeData = chart.data.datasets[0].data[activeIndex];
            const activeLabel = chart.data.labels[activeIndex];
            
            labelToDraw = activeLabel;
            textToDraw = fmtIDR(activeData);
        }

        // Tampilkan label (mis. "Material")
        ctx.font = '600 0.8rem Inter';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text-dim').trim();
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelToDraw, centerX, centerY - 10);

        // Tampilkan jumlah nominal (mis. "Rp 71.688.000")
        ctx.font = '700 1.1rem Inter';
        ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--text').trim();
        ctx.fillText(textToDraw, centerX, centerY + 12);

        ctx.restore();
    }
};
Chart.register(centerTextPlugin);

function _createFormGroupHTML(id, labelText, inputHTML) {
    const inputWithId = inputHTML.includes(' id=') ? inputHTML : inputHTML.replace(/<(\w+)/, `<$1 id="${id}"`);

    return `
        <div class="form-group">
            <label for="${id}">${labelText}</label>
            ${inputWithId}
        </div>
    `;
}

function _serializeForm(form) {
    const fd = new FormData(form);
    const data = {};
    for (const [k, v] of fd.entries()) {
        if (data[k] !== undefined) {
            if (!Array.isArray(data[k])) data[k] = [data[k]];
            data[k].push(v);
        } else {
            data[k] = v;
        }
    }
    return data;
}

async function _submitFormAsync(form) {
    const endpoint = form.getAttribute('action') || form.dataset.endpoint;
    if (!endpoint) throw new Error('Endpoint form tidak ditemukan');
    const method = (form.getAttribute('method') || 'POST').toUpperCase();
    const isMultipart = (form.getAttribute('enctype') || '').includes('multipart/form-data') || form.querySelector('input[type="file"]');
    let body;
    const headers = { 'Accept': 'application/json' };
    // Dev helper: bila berjalan di live-server (tanpa backend), jangan panggil API agar fallback lokal jalan
    try {
        const isDevStatic = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (location.port === '5500' || location.port === '5501');
        const isAppApi = typeof endpoint === 'string' && endpoint.startsWith('/api/');
        if (isDevStatic && isAppApi) {
            throw new Error('DEV_NO_API');
        }
    } catch (_) { /* ignore if location is unavailable */ }
    if (isMultipart) {
        body = new FormData(form);
    } else {
        headers['Content-Type'] = 'application/json';
        const built = _buildApiPayload(form);
        body = JSON.stringify(built ?? _serializeForm(form));
    }
    const res = await fetch(endpoint, { method, body, headers });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(text || `HTTP ${res.status}`);
    }
    // Try parse JSON, fallback to text
    let data = null;
    try { data = await res.json(); } catch (_) { data = await res.text().catch(() => ({})); }
    return data;
}

function _buildApiPayload(form) {
    const id = form.id;
    const type = form.dataset.type;
    // Helper getters within form
    const g = (sel) => form.querySelector(sel);
    const gv = (sel) => g(sel)?.value;
    if (id === 'pemasukan-form') {
        if (type === 'termin') {
            const amount = parseFormattedNumber(gv('#pemasukan-jumlah'));
            const date = new Date(gv('#pemasukan-tanggal'));
            const projectId = gv('#pemasukan-proyek');
            const feeChecks = $$('.fee-alloc-checkbox:checked');
            const feeAllocations = feeChecks.map(cb => ({ staffId: cb.dataset.staffId, amount: Number(cb.dataset.amount || 0) }));
            return { amount, date, projectId, feeAllocations };
        } else if (type === 'pinjaman') {
            return {
                amount: parseFormattedNumber(gv('#pemasukan-jumlah')),
                date: new Date(gv('#pemasukan-tanggal')),
                creditorId: gv('#pemasukan-kreditur'),
                interestType: gv('#loan-interest-type'),
                rate: Number(gv('#loan-rate') || 0),
                tenor: Number(gv('#loan-tenor') || 0)
            };
        }
    }
    if (id === 'pengeluaran-form') {
        return {
            type,
            projectId: gv('#expense-project'),
            categoryId: gv('#expense-category') || null,
            supplierId: gv('#supplier-id') || null,
            amount: parseFormattedNumber(gv('#pengeluaran-jumlah')),
            description: gv('#pengeluaran-deskripsi') || '',
            date: new Date(gv('#pengeluaran-tanggal')),
            status: form.querySelector('input[name="status"]')?.value || 'unpaid'
        };
    }
    if (id === 'material-invoice-form') {
        const items = $$('#invoice-items-container .invoice-item-row', form).map(row => {
            const mId = row.querySelector('[name="materialId"], [data-material-id]')?.value || row.dataset.materialId || null;
            // Support both legacy names and new inputs
            const qtyRaw = row.querySelector('input[name="itemQty"], [name="quantity"], .item-qty, .qty')?.value || row.dataset.qty || 0;
            const qty = parseLocaleNumber(qtyRaw);
            const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"], [name="price"], .item-price, .price')?.value || '0');
            return { materialId: mId, qty, price };
        });
        return {
            projectId: gv('#project-id'),
            supplierId: gv('#supplier-id'),
            date: new Date(gv('#pengeluaran-tanggal')),
            formType: gv('input[name="formType"]') || 'faktur',
            items
        };
    }
    if (id === 'payment-form') {
        const billId = form.dataset.id || form.dataset.billId;
        if (type === 'bill') {
            return { billId, amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value) };
        } else if (type === 'pinjaman' || type === 'loan') {
            return { loanId: billId, amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value) };
        } else if (type === 'individual-salary') {
            return {
                billId: form.dataset.billId,
                workerId: form.dataset.workerId,
                amount: parseFormattedNumber(form.elements.amount?.value || '0'),
                date: new Date(form.elements.date?.value || new Date())
            };
        }
    }
    if (id === 'stok-in-form') {
        return {
            materialId: form.dataset.id,
            quantity: Number(form.elements.quantity.value),
            price: parseFormattedNumber(form.elements.price.value),
            date: new Date(form.elements.date.value)
        };
    }
    if (id === 'stok-out-form') {
        return {
            materialId: form.dataset.id,
            quantity: Number(form.elements.quantity.value),
            projectId: form.elements.projectId.value,
            date: new Date(form.elements.date.value)
        };
    }
    if (id === 'manual-attendance-form') {
        const dateStr = gv('#manual-attendance-date');
        const projectId = gv('#manual-attendance-project');
        const records = $$('.attendance-status-selector', form).map(sel => {
            const workerId = sel.dataset.workerId;
            const status = sel.querySelector('input:checked')?.value || 'absent';
            const pay = Number(sel.closest('.manual-attendance-item')?.querySelector('.worker-wage')?.dataset?.pay || 0);
            return { workerId, status, pay };
        });
        return { projectId, date: new Date(dateStr), records };
    }
    if (id === 'edit-attendance-form') {
        const recordId = form.dataset.id;
        if (type === 'manual') {
            return { id: recordId, type, status: form.elements.status.value };
        }
        if (type === 'timestamp') {
            return { id: recordId, type, checkIn: form.elements.checkIn.value, checkOut: form.elements.checkOut.value };
        }
    }
    if (id === 'edit-stock-form') {
        const q = Number(form.elements.quantity.value);
        const payload = { id: form.dataset.id, type: form.dataset.type, quantity: q };
        if (form.dataset.type === 'out') payload.projectId = form.elements.projectId.value;
        return payload;
    }
    if (id === 'add-master-item-form') {
        const t = form.dataset.type;
        const name = form.elements.itemName.value.trim();
        const base = { type: t, name };
        if (t === 'materials') base.unit = form.elements.itemUnit.value.trim();
        if (t === 'suppliers') base.category = form.elements.itemCategory.value;
        if (t === 'projects') { base.projectType = form.elements.projectType.value; base.budget = parseFormattedNumber(form.elements.budget.value); }
        if (t === 'staff') {
            base.paymentType = form.elements.paymentType.value;
            base.salary = parseFormattedNumber(form.elements.salary.value) || 0;
            base.feePercentage = Number(form.elements.feePercentage.value) || 0;
            base.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
        }
        if (t === 'workers') {
            base.professionId = form.elements.professionId.value;
            base.status = form.elements.workerStatus.value;
            const wages = {}; appState.projects.forEach(p => { const v = parseFormattedNumber(form.elements[`project_wage_${p.id}`]?.value || '0'); if (v > 0) wages[p.id] = v; });
            base.projectWages = wages;
        }
        return base;
    }
    if (id === 'edit-master-form') {
        const t = form.dataset.type; const base = { id: form.dataset.id, type: t, name: form.elements.itemName.value.trim() };
        if (t === 'materials') { base.unit = form.elements.unit.value.trim(); base.reorderPoint = Number(form.elements.reorderPoint.value) || 0; }
        if (t === 'suppliers') base.category = form.elements.itemCategory.value;
        if (t === 'projects') { base.projectType = form.elements.projectType.value; base.budget = parseFormattedNumber(form.elements.budget.value); }
        if (t === 'staff') { base.paymentType = form.elements.paymentType.value; base.salary = parseFormattedNumber(form.elements.salary.value) || 0; base.feePercentage = Number(form.elements.feePercentage.value) || 0; base.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0; }
        if (t === 'workers') { base.professionId = form.elements.professionId.value; base.status = form.elements.workerStatus.value; const wages={}; appState.projects.forEach(p=>{const v=parseFormattedNumber(form.elements[`project_wage_${p.id}`]?.value || '0'); if (v>0) wages[p.id]=v;}); base.projectWages = wages; }
        return base;
    }
    if (id === 'edit-item-form') {
        const t = form.dataset.type;
        const payload = { id: form.dataset.id, type: t };
        if (t === 'expense') {
            payload.amount = parseFormattedNumber(form.elements.amount.value);
            payload.description = form.elements.description.value;
            if (form.elements.categoryId) payload.categoryId = form.elements.categoryId.value;
            payload.date = new Date(form.elements.date.value);
        } else if (t === 'loan') {
            payload.totalAmount = parseFormattedNumber(form.elements.totalAmount.value);
            payload.date = new Date(form.elements.date.value);
            payload.creditorId = form.elements.creditorId.value;
            payload.interestType = form.elements.interestType.value;
            payload.rate = Number(form.elements.rate.value || 0);
            payload.tenor = Number(form.elements.tenor.value || 0);
        } else if (t === 'fee_bill') {
            payload.description = form.elements.description.value;
            payload.amount = parseFormattedNumber(form.elements.amount.value);
        }
        return payload;
    }
    // Default fallback to JSON of form inputs
    return _serializeForm(form);
}

function _applyTheme(theme) {
    const root = document.documentElement;
    root.classList.add('theme-animating');
    root.classList.toggle('dark-theme', theme === 'dark');
    localStorage.setItem('banplex_theme', theme);
    setTimeout(() => root.classList.remove('theme-animating'), 300);
    // Update icon jika ada tombol
    const btn = document.getElementById('theme-toggle-btn');
    if (btn) {
        const iconEl = btn.querySelector('.material-symbols-outlined');
        if (iconEl) iconEl.textContent = root.classList.contains('dark-theme') ? 'dark_mode' : 'light_mode';
    }
}

function toggleTheme() {
    const isDark = document.documentElement.classList.contains('dark-theme');
    _applyTheme(isDark ? 'light' : 'dark');
}

// Fallback to local handlers for async forms when network/API is unavailable
async function _fallbackLocalFormHandler(form) {
    const id = form.id;
    const type = form.dataset.type;
    const fakeEvent = { preventDefault() {}, target: form };
    try {
        if (id === 'pemasukan-form') {
            return await handleAddPemasukan(fakeEvent);
        }
        if (id === 'pengeluaran-form') {
            return await handleAddPengeluaran(fakeEvent, type);
        }
        if (id === 'material-invoice-form') {
            return await handleAddPengeluaran(fakeEvent, 'material');
        }
        if (id === 'add-master-item-form') {
            return await handleAddMasterItem(form);
        }
        if (id === 'edit-master-form') {
            return await handleUpdateMasterItem(form);
        }
        if (id === 'payment-form') {
            if (type === 'bill') return await handleProcessBillPayment(form);
            if (type === 'pinjaman' || type === 'loan') return await handleProcessPayment(form);
            if (type === 'individual-salary') return await handleProcessIndividualSalaryPayment(form);
        }
        if (id === 'edit-item-form') {
            return await handleUpdateItem(form);
        }
        if (id === 'edit-attendance-form') {
            return await handleUpdateAttendance(form);
        }
        if (id === 'manual-attendance-form') {
            return await handleSaveManualAttendance(fakeEvent);
        }
        if (id === 'stok-in-form') {
            return await processStokIn(form);
        }
        if (id === 'stok-out-form') {
            return await processStokOut(form);
        }
        if (id === 'edit-stock-form') {
            return await _processStockTransactionUpdate(form);
        }
        // Tidak ada fallback yang cocok
        throw new Error(`No fallback handler for form id=${id}`);
    } catch (e) {
        console.warn('Fallback handler gagal:', e);
        throw e;
    }
}

// --- Generic API helpers for CRUD ---
async function _apiRequest(method, url, payload = null) {
    const headers = { 'Accept': 'application/json' };
    let body;
    if (payload instanceof FormData) {
        body = payload;
    } else if (payload != null) {
        headers['Content-Type'] = 'application/json';
        body = JSON.stringify(payload);
    }
    const res = await fetch(url, { method, headers, body });
    if (!res.ok) throw new Error(`API ${method} ${url} -> ${res.status}`);
    try { return await res.json(); } catch (_) { return null; }
}

function _mapDeleteEndpoint(entity, id) {
    if (entity === 'termin' || entity === 'income') return `/api/incomes/${id}`;
    if (entity === 'pinjaman' || entity === 'loan') return `/api/loans/${id}`;
    if (entity === 'expense') return `/api/expenses/${id}`;
    if (entity === 'bill') return `/api/bills/${id}`;
    if (entity === 'attendance') return `/api/attendance/${id}`;
    if (entity === 'stock_transaction') return `/api/stock/transactions/${id}`;
    // master: entity formatted as master:{type}
    if (entity.startsWith('master:')) {
        const t = entity.split(':')[1];
        return `/api/master/${t}/${id}`;
    }
    return null;
}

const generateUUID = () => {
    try {
        if (crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch (_) {}
    // Fallback RFC4122 v4
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0,
            v = c === 'x'?r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
};

async function optimisticUpdateDoc(colRef, id, partialChanges) {
    const ref = doc(colRef, id);
    await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(ref);
        if (!snap.exists()) throw new Error('Dokumen tidak ditemukan');
        const currentRev = snap.data().rev || 0;
        const nextRev = currentRev + 1;
        transaction.update(ref, { ...partialChanges,
            rev: nextRev,
            updatedAt: serverTimestamp()
        });
    });
}

// ------------------ Breadcrumbs ------------------
function setBreadcrumb(parts = []) {
    const bc = $('#breadcrumb-container');
    if (!bc) return;
    if (!(appState.activePage === 'jurnal' || appState.activePage === 'tagihan')) {
        bc.innerHTML = '';
        return;
    }
    const html = parts.filter(Boolean).map((p, i) => i === 0?`<span>${p}</span>` : `<span style="opacity:.7">/</span><span>${p}</span>`).join(' ');
    bc.innerHTML = html;
}

function updateBreadcrumbFromState(extra = []) {
    const current = ALL_NAV_LINKS.find(l => l.id === appState.activePage)?.label || '';
    setBreadcrumb([current, ...extra]);
}

async function _enforceLocalFileStorageLimit(maxBytes = 50 * 1024 * 1024, maxFiles = 300) {
    try {
        const files = await localDB.files.toArray();
        let totalBytes = 0;
        files.forEach(f => {
            totalBytes += (f.size || (f.file && f.file.size) || 0);
        });
        if (files.length <= maxFiles && totalBytes <= maxBytes) return;
        const sorted = files.slice().sort((a, b) => new Date(a.addedAt || 0) - new Date(b.addedAt || 0));
        while ((sorted.length > maxFiles) || (totalBytes > maxBytes)) {
            const oldest = sorted.shift();
            totalBytes -= (oldest.size || (oldest.file && oldest.file.size) || 0);
            await localDB.files.delete(oldest.id);
        }
    } catch (e) {
        console.warn('Gagal menegakkan batas storage lokal:', e);
    }
}

async function getPendingSyncCounts() {
    const tables = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions'];
    let needs = 0,
        deletes = 0;
    for (const t of tables) {
        needs += await localDB[t].where('needsSync').equals(1).count();
        deletes += await localDB[t].where('isDeleted').equals(1).count();
    }
    const qPay = await localDB.pending_payments.count();
    const qLogs = await localDB.pending_logs.count();
    const qConf = await localDB.pending_conflicts.count();
    return {
        needs,
        deletes,
        qPay,
        qLogs,
        qConf,
        total: needs + deletes + qPay + qLogs + qConf
    };
}

async function updateSyncIndicator() {
    try {
        const el = document.getElementById('sync-indicator');
        if (!el) return;
        const c = await getPendingSyncCounts();
        const isOnline = navigator.onLine;
        const syncing = !!appState.isSyncing;
        const icon = syncing?'sync' : (isOnline?'cloud_done' : 'cloud_off');
        const color = syncing?'var(--warning)' : (isOnline?'var(--success)' : 'var(--danger)');
        el.innerHTML = `<span class="sync-indicator-btn" data-action="open-sync-queue" title="Lihat antrean sinkron" style="display:inline-flex;align-items:center;gap:.35rem;cursor:pointer"><span class="material-symbols-outlined" style="font-size:18px;color:${color}">${icon}</span><span>${syncing?'Sinkron...' : (isOnline?'Online' : 'Offline')}</span><span class="sync-count" style="background:#e5efff;color:#2b5cff;border-radius:10px;padding:2px 8px;">${c.total}</span></span>`;
    } catch (_) {}
}

const _getJSDate = (dateObject) => {
    // 1. Jika objeknya null atau undefined, langsung kembalikan tanggal saat ini
    if (!dateObject) {
        return new Date();
    }
    // 2. Cek jika ini adalah objek Timestamp Firestore asli
    if (typeof dateObject.toDate === 'function') {
        return dateObject.toDate();
    }
    // 3. Cek jika ini adalah objek Timestamp dari IndexedDB ({seconds: ...})
    //    Penting: Cek juga apakah nilai seconds-nya valid.
    if (dateObject && typeof dateObject.seconds === 'number') {
        // Buat objek Date dari milidetik
        const d = new Date(dateObject.seconds * 1000);
        // Jika hasilnya tanggal yang tidak valid (misal, dari seconds: null), kembalikan tanggal saat ini
        if (isNaN(d.getTime())) {
            return new Date();
        }
        return d;
    }
    // 4. Cek jika ini sudah merupakan objek Date
    if (dateObject instanceof Date) {
        // Jika tanggalnya tidak valid, kembalikan tanggal saat ini
        if (isNaN(dateObject.getTime())) {
            return new Date();
        }
        return dateObject;
    }
    // 5. Sebagai fallback terakhir, coba parsing jika formatnya string. Jika gagal, kembalikan tanggal saat ini.
    const parsedDate = new Date(dateObject);
    if (isNaN(parsedDate.getTime())) {
        return new Date();
    }
    return parsedDate;
};

const parseFormattedNumber = (str) => Number(String(str).replace(/[^0-9]/g, ''));

// Parse decimal with local comma support (e.g., "0,5" -> 0.5)
function parseLocaleNumber(val) {
  if (val == null) return 0;
  let s = String(val).trim();
  if (!s) return 0;
  // Normalize comma to dot for decimals
  s = s.replace(/,/g, '.');
  // Strip spaces
  s = s.replace(/\s+/g, '');
  // If multiple dots (thousand separators), keep the last as decimal separator
  const parts = s.split('.');
  if (parts.length > 2) {
    const dec = parts.pop();
    s = parts.join('') + '.' + dec;
  }
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}
const isViewer = () => appState.userRole === 'Viewer';
let toastTimeout = null;
let isPageTransitioning = false;

// Smoothly animate number changes inside an element (IDR formatting)
function animateNumber(element, to) {
    if (!element || to == null || isNaN(Number(to))) return;
    const currentText = element.textContent || '0';
    let from = parseFormattedNumber(currentText);
    // If equal and never animated, animate from 0 once to accentuate initial load
    if (from === to && !element.dataset.animated) {
        from = 0;
    }
    if (from === to) return;
    const duration = 600;
    const startTime = performance.now();
    element.dataset.animated = '1';

    function step(now) {
        const elapsed = now - startTime;
        if (elapsed >= duration) {
            element.textContent = fmtIDR(to);
            return;
        }
        const progress = elapsed / duration;
        const current = Math.round(from + (to - from) * progress);
        element.textContent = fmtIDR(current);
        requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

// [IMPROVE-UI/UX]: Client-side input validation helpers
function _markInvalid(input, message) {
    input.classList.add('is-invalid');
    let msg = input.parentElement?.querySelector?.('.input-error-text');
    if (!msg) {
        msg = document.createElement('small');
        msg.className = 'input-error-text';
        input.parentElement?.appendChild(msg);
    }
    msg.textContent = message || 'Input tidak valid';
}
function _clearInvalid(input) {
    input.classList.remove('is-invalid');
    const msg = input.parentElement?.querySelector?.('.input-error-text');
    if (msg) msg.remove();
}
function _attachClientValidation(form) {
    if (!form) return;
    // Example validators for Pengeluaran form
    const validators = {
        'pengeluaran-jumlah': (el) => {
            const val = parseFormattedNumber(el.value);
            return val > 0 ? null : 'Jumlah harus lebih dari 0';
        },
        'pengeluaran-deskripsi': (el) => el.value.trim() ? null : 'Deskripsi wajib diisi',
        'pengeluaran-tanggal': (el) => el.value ? null : 'Tanggal wajib diisi'
    };
    Object.keys(validators).forEach(id => {
        const el = form.querySelector(`#${id}`);
        if (!el) return;
        el.addEventListener('blur', () => {
            const error = validators[id](el);
            if (error) _markInvalid(el, error); else _clearInvalid(el);
        });
        el.addEventListener('input', () => _clearInvalid(el));
    });
    // On submit, block if invalid
    form.addEventListener('submit', (e) => {
        let firstInvalid = null;
        Object.keys(validators).forEach(id => {
            const el = form.querySelector(`#${id}`);
            if (!el) return;
            const error = validators[id](el);
            if (error) {
                _markInvalid(el, error);
                if (!firstInvalid) firstInvalid = el;
            }
        });
        if (firstInvalid) {
            e.preventDefault();
            firstInvalid.focus();
        }
    }, true);
}

// [IMPROVE-UI/UX]: Empty state helper
function _getEmptyStateHTML({ icon = 'inbox', title = 'Tidak Ada Data', desc = 'Belum ada data untuk ditampilkan.', action, actionLabel } = {}) {
    const btn = action && actionLabel ? `<button class="btn btn-primary" data-action="${action}">${actionLabel}</button>` : '';
    return `<div class="empty-state-card"><span class="material-symbols-outlined">${icon}</span><div class="title">${title}</div><div class="desc">${desc}</div>${btn}</div>`;
}

function animatePageEnter(container, effect = 'to-left') {
    if (!container) return;
    try {
        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    } catch (_) {}
    // Cleanup any exit classes
    container.classList.remove('page-exit','page-exit-left','page-exit-right','page-exit-fade');
    // Choose enter class
    let enterClass = 'page-enter-from-right'; // default: from right to center
    if (effect === 'to-right') enterClass = 'page-enter-from-left';
    else if (effect === 'fade') enterClass = 'page-enter-fade';
    else if (effect === 'up') enterClass = 'page-enter-up';
    container.classList.add(enterClass);
    // Double rAF ensures styles apply before removal to trigger transition
    requestAnimationFrame(() => requestAnimationFrame(() => container.classList.remove(enterClass)));
}

async function initializeAppSession(user) {
    appState.currentUser = user;
    const userDocRef = doc(membersCol, user.uid);
    try {
        let userDoc = await getDoc(userDocRef);
        if (!userDoc.exists()) {
            const isOwner = user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
            const initialData = {
                email: user.email,
                name: user.displayName,
                photoURL: user.photoURL,
                role: isOwner ? 'Owner' : 'Viewer',
                status: isOwner ? 'active' : 'pending',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            };
            await setDoc(userDocRef, initialData);
            userDoc = await getDoc(userDocRef);
        }
        const userData = userDoc.data();
        Object.assign(appState, {
            userRole: userData.role,
            userStatus: userData.status
        });
        attachRoleListener(userDocRef);
        if (appState.userRole === 'Owner') listenForPendingUsers();
        $('#global-loader').style.display = 'none';
        $('#app-shell').style.display = 'flex';
        await loadAllLocalDataToState();
        _calculateAndCacheDashboardTotals();
        renderUI();
        updateSyncIndicator();
        if (appState.justLoggedIn) {
            toast('success', `Selamat datang kembali, ${userData.name}!`);
            appState.justLoggedIn = false;
        }
        if (navigator.onLine) {
            await syncFromServer(); 
            await syncToServer(); 
            subscribeToMasterData(); 
        } else {
            toast('info', 'Anda sedang offline. Menampilkan data yang tersimpan di perangkat.');
        }
    } catch (error) {
        console.error("Gagal inisialisasi sesi:", error);
        toast('error', 'Gagal memuat profil. Menggunakan mode terbatas.');
        $('#global-loader').style.display = 'none';
        $('#app-shell').style.display = 'flex';
        renderUI();
    }
}

function toast(type, message, duration = 4000) {
    const container = $('#popup-container');
    if (!container) return;
    if (!container.querySelector('.popup-content')) {
        container.innerHTML = `<div class="popup-content"><span id="popup-icon"></span><p id="popup-message"></p></div>`;
    }
    const iconEl = $('#popup-icon', container);
    const msgEl = $('#popup-message', container);
    if (!msgEl || !iconEl) return;
    const icons = {
        success: 'check_circle',
        error: 'error',
        info: 'info'
    };
    container.className = `popup-container popup-${type}`;
    msgEl.textContent = message;
    if (toastTimeout) clearTimeout(toastTimeout);
    if (type === 'syncing') {
        iconEl.className = 'spinner';
    } else {
        iconEl.className = 'material-symbols-outlined';
        iconEl.textContent = icons[type] || 'info';
        toastTimeout = setTimeout(() => container.classList.remove('show'), duration);
    }
    container.classList.add('show');
}

const hideToast = () => {
    if (toastTimeout) clearTimeout(toastTimeout);
    $('#popup-container')?.classList.remove('show');
};

// script.js

// [TAMBAHKAN BLOK KODE BARU INI]
/**
 * Mengaktifkan fungsionalitas swipe-to-dismiss untuk notifikasi toast.
 */
function _initToastSwipeHandler() {
    const container = $('#popup-container');
    if (!container) return;

    let startX = 0;
    let currentX = 0;
    let isDragging = false;
    let animationFrameId = null;

    // Fungsi untuk mengupdate posisi toast saat digeser
    const updatePosition = () => {
        if (!isDragging) return;
        const diffX = currentX - startX;
        container.style.transform = `translateX(calc(-50% + ${diffX}px))`; // Geser toast sesuai gerakan jari
        animationFrameId = requestAnimationFrame(updatePosition);
    };

    container.addEventListener('touchstart', (e) => {
        // Hanya mulai jika ada notifikasi yang tampil
        if (!container.classList.contains('show')) return;
        
        // Hapus timeout otomatis jika pengguna mulai berinteraksi
        if (toastTimeout) clearTimeout(toastTimeout);

        startX = e.touches[0].clientX;
        isDragging = true;
        
        // Hapus transisi agar pergerakan mengikuti jari secara langsung
        container.style.transition = 'none';
        
        // Mulai loop animasi untuk pergerakan yang mulus
        animationFrameId = requestAnimationFrame(updatePosition);
    }, { passive: true });

    container.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
    }, { passive: true });

    container.addEventListener('touchend', (e) => {
        if (!isDragging) return;
        
        isDragging = false;
        cancelAnimationFrame(animationFrameId); // Hentikan loop animasi

        const diffX = e.changedTouches[0].clientX - startX;
        const threshold = container.offsetWidth * 0.4; // Harus digeser sejauh 40% dari lebar toast

        // Kembalikan transisi untuk animasi kembali atau keluar
        container.style.transition = 'transform 0.3s ease, opacity 0.3s ease, bottom 0.35s ease';

        if (Math.abs(diffX) > threshold) {
            // Jika swipe cukup jauh, geser keluar dan hilangkan
            const direction = diffX > 0 ? 1 : -1;
            container.style.transform = `translateX(calc(-50% + ${direction * container.offsetWidth}px))`;
            container.style.opacity = '0';
            
            // Panggil hideToast setelah animasi keluar selesai
            setTimeout(() => {
                hideToast();
                // Reset style setelah hilang
                container.style.transform = 'translateX(-50%)';
                container.style.opacity = '1';
            }, 300);

        } else {
            // Jika tidak cukup jauh, kembalikan ke posisi semula
            container.style.transform = 'translateX(-50%)';
        }
    });
}

async function loadAllLocalDataToState() {
    console.log("Memuat data dari database lokal ke state...");
    try {
        const data = await localDB.transaction('r', localDB.tables, async () => {
            const results = {};
            const tablesToLoad = {
                projects: localDB.projects,
                suppliers: localDB.suppliers,
                workers: localDB.workers,
                materials: localDB.materials,
                staff: localDB.staff,
                professions: localDB.professions,
                operational_categories: localDB.operational_categories,
                material_categories: localDB.material_categories,
                other_categories: localDB.other_categories,
                funding_creditors: localDB.funding_creditors
            };
            for (const key in tablesToLoad) {
                results[key] = await tablesToLoad[key].toArray();
            }
            // [PERBAIKAN] Saring data transaksi yang tidak memiliki properti tanggal yang valid
            results.incomes = await localDB.incomes.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.fundingSources = await localDB.funding_sources.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.expenses = await localDB.expenses.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.bills = await localDB.bills.where('isDeleted').notEqual(1).filter(item => !!item.dueDate).toArray();
            results.attendanceRecords = await localDB.attendance_records.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            results.stockTransactions = await localDB.stock_transactions.where('isDeleted').notEqual(1).filter(item => !!item.date).toArray();
            return results;
        });
        Object.assign(appState, data);
        console.log("Data lokal berhasil dimuat.");
    } catch (error) {
        console.error("Gagal memuat data lokal:", error);
    }
}

async function syncFromServer() {
    if (!navigator.onLine) return;
    console.log("Memulai sinkronisasi cerdas dari server...");
    toast('syncing', 'Mengambil data terbaru...');

    // [BARU] Ambil timestamp terakhir kali kita sinkronisasi berhasil
    const lastSync = getLastSyncTimestamp();
    console.log(`Hanya akan mengambil data yang berubah setelah: ${lastSync.toISOString()}`);

    try {
        const collectionsToSync = {
            projects: projectsCol,
            suppliers: suppliersCol,
            workers: workersCol,
            materials: materialsCol,
            staff: staffCol,
            professions: professionsCol,
            operational_categories: opCatsCol,
            material_categories: matCatsCol,
            other_categories: otherCatsCol,
            funding_creditors: fundingCreditorsCol,
            expenses: expensesCol,
            bills: billsCol,
            incomes: incomesCol,
            funding_sources: fundingSourcesCol,
            attendance_records: attendanceRecordsCol,
            stock_transactions: stockTransactionsCol,
            comments: commentsCol
        };

        let totalDocsSynced = 0;

        for (const [tableName, collectionRef] of Object.entries(collectionsToSync)) {
            // [MODIFIKASI] Tambahkan 'where' pada query untuk hanya mengambil data baru/berubah
            // Pastikan semua koleksi memiliki field 'updatedAt' agar query ini berhasil.
            const q = query(collectionRef, where("updatedAt", ">", lastSync));
            
            const snapshot = await getDocs(q);
            totalDocsSynced += snapshot.size;

            if (!snapshot.empty) {
                const firestoreData = snapshot.docs.map(d => ({ 
                    ...d.data(),
                    id: d.id,
                    serverRev: (d.data().rev || 0)
                    // Tidak perlu field updatedAt di sini karena sudah ada dari d.data()
                }));
                
                // bulkPut akan meng-update jika ID sudah ada, atau menambah jika belum ada.
                await localDB[tableName].bulkPut(firestoreData);
                console.log(`Tabel '${tableName}': ${snapshot.size} dokumen baru/berubah telah disinkronkan.`);
            }
        }

        // Muat ulang state dari Dexie ke memori aplikasi
        await loadAllLocalDataToState();
        renderPageContent(); // Render ulang UI dengan data terbaru
        
        hideToast();
        if (totalDocsSynced > 0) {
            toast('success', `${totalDocsSynced} item berhasil diperbarui.`);
        }

        // [BARU] Setelah semua berhasil, simpan timestamp sync ini untuk digunakan pada sinkronisasi berikutnya
        setLastSyncTimestamp();
        
        updateSyncIndicator();

    } catch (e) {
        console.error("Sinkronisasi dari server gagal:", e);
        toast('error', 'Gagal mengambil data terbaru. Mungkin perlu membuat index di Firestore?');
    }
}

async function syncToServer() {
    if (!navigator.onLine || appState.isSyncing) return;
    appState.isSyncing = true;
    toast('syncing', 'Mengirim perubahan ke server...');
    try {
        let totalSynced = 0;
        
        // --- Deletion Sync ---
        const tablesForDeletionSync = [ localDB.expenses, localDB.bills, localDB.incomes, localDB.funding_sources, localDB.attendance_records, localDB.stock_transactions, localDB.comments ];
        for (const table of tablesForDeletionSync) {
            const itemsToDelete = await table.where('isDeleted').equals(1).toArray();
            if (itemsToDelete.length > 0) {
                const deleteBatch = writeBatch(db);
                const idsToDelete = itemsToDelete.map(item => item.id);
                idsToDelete.forEach(id => {
                    if (id) deleteBatch.delete(doc(db, 'teams', TEAM_ID, table.name, id));
                });
                await deleteBatch.commit();
                await table.bulkDelete(idsToDelete);
                totalSynced += itemsToDelete.length;
            }
        }
        
        // --- Creation/Update Sync ---
        const collectionsToSync = ['expenses', 'bills', 'incomes', 'funding_sources', 'attendance_records', 'stock_transactions', 'comments'];
        for (const tableName of collectionsToSync) {
            const itemsToSync = await localDB[tableName].where('needsSync').equals(1).toArray();
            if (itemsToSync.length === 0) continue;
            const collectionRef = collection(db, 'teams', TEAM_ID, tableName);
            for (const item of itemsToSync) {
                const { needsSync, isDeleted, localAttachmentId, attachmentNeedsSync, serverRev, ...firestoreData } = item;
                const id = firestoreData.id || generateUUID();
                const docRef = doc(collectionRef, id);
                await runTransaction(db, async (transaction) => {
                    const snap = await transaction.get(docRef);
                    const dataToWrite = { ...firestoreData, updatedAt: serverTimestamp(), id };
                    transaction.set(docRef, dataToWrite, { merge: true });
                });
                await localDB[tableName].update(id, { needsSync: 0 });
                totalSynced += 1;
            }
        }

        // --- Attachment Sync ---
        const expensesWithFiles = await localDB.expenses.where('attachmentNeedsSync').equals(1).toArray();
        for (const expense of expensesWithFiles) {
             if (!expense.id) continue;
             const fileRecord = await localDB.files.get(expense.localAttachmentId);
             if (fileRecord && fileRecord.file) {
                 const downloadURL = await _uploadFileToCloudinary(fileRecord.file);
                 if (downloadURL) {
                     await updateDoc(doc(expensesCol, expense.id), { attachmentUrl: downloadURL });
                     await localDB.expenses.update(expense.id, { attachmentNeedsSync: 0, attachmentUrl: downloadURL });
                     await localDB.files.delete(expense.localAttachmentId);
                 }
             }
        }
        
        if (totalSynced > 0) {
            toast('success', `${totalSynced} item berhasil disinkronkan.`);
        } else {
            hideToast();
        }
    } catch (error) {
        toast('error', 'Beberapa data gagal disinkronkan.');
        console.error("Sync to server error:", error);
    } finally {
        appState.isSyncing = false;
        updateSyncIndicator();
    }
  }
  
window.addEventListener('online', syncToServer);

async function _uploadFileToFirebaseStorage(file, folder = 'attachments') {
    if (!file) return null;
    if (isViewer()) {
        toast('error', 'Viewer tidak dapat mengunggah file.');
        return null;
    }
    toast('syncing', `Mengunggah ${file.name}...`);
    try {
        const timestamp = Date.now();
        const uniqueFileName = `${timestamp}-${file.name}`;
        const storageRef = ref(storage, `${folder}/${uniqueFileName}`);
        const uploadTask = await uploadBytesResumable(storageRef, file);
        const downloadURL = await getDownloadURL(uploadTask.ref);
        hideToast();
        return downloadURL;
    } catch (error) {
        console.error("Upload error:", error);
        toast('error', 'Gagal mengunggah file.');
        return null;
    }
}

const fetchAndCacheData = async (key, col, order = 'createdAt') => {
    try {
        const snap = await getDocs(query(col, orderBy(order, 'desc')));
        appState[key] = snap.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
    } catch (e) {
        console.error(`Gagal memuat data untuk ${key}:`, e);
        appState[key] = appState[key] || []; // Jangan hapus data lama jika fetch gagal
        toast('error', `Gagal memuat data ${key}.`);
    }
};

const masterDataConfig = {
    'projects': {
        collection: projectsCol,
        stateKey: 'projects',
        nameField: 'projectName',
        title: 'Proyek'
    },
    'creditors': {
        collection: fundingCreditorsCol,
        stateKey: 'fundingCreditors',
        nameField: 'creditorName',
        title: 'Kreditur'
    },
    'op-cats': {
        collection: opCatsCol,
        stateKey: 'operationalCategories',
        nameField: 'categoryName',
        title: 'Kategori Operasional'
    },
    'other-cats': {
        collection: otherCatsCol,
        stateKey: 'otherCategories',
        nameField: 'categoryName',
        title: 'Kategori Lainnya'
    },
    'suppliers': {
        collection: suppliersCol,
        stateKey: 'suppliers',
        nameField: 'supplierName',
        title: 'Supplier'
    },
    'professions': {
        collection: professionsCol,
        stateKey: 'professions',
        nameField: 'professionName',
        title: 'Profesi'
    },
    'workers': {
        collection: workersCol,
        stateKey: 'workers',
        nameField: 'workerName',
        title: 'Pekerja'
    },
    'staff': {
        collection: collection(db, 'teams', TEAM_ID, 'staff'),
        stateKey: 'staff',
        nameField: 'staffName',
        title: 'Staf Inti'
    },
    'materials': {
        collection: materialsCol,
        stateKey: 'materials',
        nameField: 'materialName',
        title: 'Material'
    },
};

// FUNGSI BARU UNTUK MEMBUAT HTML SKELETON LOADER
function _getSkeletonLoaderHTML(pageType) {
    if (pageType === 'dashboard') {
        return `
            <div class="skeleton-wrapper">
                <div class="skeleton-grid">
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                </div>
                <div class="skeleton-actions">
                    ${Array(5).fill('').map(() => `
                        <div>
                            <div class="skeleton skeleton-icon"></div>
                            <div class="skeleton skeleton-text skeleton-text-sm"></div>
                        </div>
                    `).join('')}
                </div>
                <div class="skeleton skeleton-title"></div>
                <div class="skeleton skeleton-card" style="height: 150px;"></div>
                <div class="skeleton skeleton-card" style="height: 100px;"></div>
            </div>
        `;
    }
    // Default fallback jika tipe halaman lain belum dibuat skeletonnya
    return '<div class="loader-container"><div class="spinner"></div></div>';
}

async function handleRecalculateUsageCount() {
    createModal('confirmUserAction', {
        message: 'Aksi ini akan membaca semua histori faktur material dan menghitung ulang frekuensi penggunaan untuk semua master data. Proses ini hanya perlu dilakukan sekali. Lanjutkan?',
        onConfirm: () => _recalculateAndApplyUsageCounts()
    });
}

async function _recalculateAndApplyUsageCounts() {
    toast('syncing', 'Membaca semua faktur material...');
    console.log('Memulai perhitungan ulang frekuensi penggunaan material...');
    try {
        // 1. Ambil semua data master material dan expense material
        await fetchAndCacheData('materials', materialsCol);
        const q = query(expensesCol, where("type", "==", "material"));
        const expenseSnap = await getDocs(q);
        const materialExpenses = expenseSnap.docs.map(d => d.data());
        console.log(`Ditemukan ${materialExpenses.length} faktur material untuk dianalisis.`);
        // 2. Buat peta untuk menghitung penggunaan setiap material
        const usageMap = new Map();
        materialExpenses.forEach(expense => {
            if (expense.items && Array.isArray(expense.items)) {
                expense.items.forEach(item => {
                    if (item.materialId) { // Memastikan materialId ada
                        const currentCount = usageMap.get(item.materialId) || 0;
                        usageMap.set(item.materialId, currentCount + 1);
                    }
                });
            }
        });
        console.log('Peta penggunaan selesai dihitung:', usageMap);
        if (appState.materials.length === 0) {
            toast('info', 'Tidak ada data master material untuk diperbarui.');
            return;
        }
        toast('syncing', `Menghitung dan memperbarui ${appState.materials.length} material...`);
        // 3. Siapkan batch update ke Firestore
        const batch = writeBatch(db);
        appState.materials.forEach(material => {
            const materialRef = doc(materialsCol, material.id);
            const newCount = usageMap.get(material.id) || 0;
            // Hanya update jika ada perubahan untuk efisiensi
            if (material.usageCount !== newCount) {
                batch.update(materialRef, {
                    usageCount: newCount
                });
            }
        });
        // 4. Jalankan update
        console.log('Menerapkan pembaruan batch ke Firestore...');
        await batch.commit();
        console.log('Pembaruan batch berhasil.');
        toast('success', 'Perhitungan ulang selesai! Semua data material telah diperbarui.');
        // Sembunyikan tombol setelah berhasil dijalankan untuk mencegah eksekusi berulang
        const recalcButton = $(`[data-action="recalculate-usage"]`);
        if (recalcButton) recalcButton.style.display = 'none';
    } catch (error) {
        console.error("Gagal menghitung ulang:", error);
        toast('error', 'Terjadi kesalahan saat perhitungan ulang.');
    }
}

function _initSelectionMode(containerSelector, pageContext) {
    const container = $(containerSelector);
    if (!container) return;

    // Hapus listener lama jika ada untuk mencegah duplikasi
    if (container._selectionHandlers) {
        container.removeEventListener('pointerdown', container._selectionHandlers.start);
    }

    let pressTimer = null;
    let hasMoved = false;

    const startPress = (e) => {
        // Jangan mulai timer jika sudah mode seleksi atau targetnya adalah tombol swipe
        if (appState.selectionMode.active || e.target.closest('.swipe-actions')) return;
        
        const card = e.target.closest('.dense-list-item');
        if (!card) return;

        hasMoved = false;
        const startX = e.pageX;
        const startY = e.pageY;

        const cancelOnMove = (moveEvent) => {
            if (Math.abs(moveEvent.pageX - startX) > 10 || Math.abs(moveEvent.pageY - startY) > 10) {
                hasMoved = true;
                clearTimeout(pressTimer);
                container.removeEventListener('pointermove', cancelOnMove);
                container.removeEventListener('pointerup', endPressOrLeave);
            }
        };

        const endPressOrLeave = () => {
            clearTimeout(pressTimer);
            container.removeEventListener('pointermove', cancelOnMove);
            container.removeEventListener('pointerup', endPressOrLeave);
        };
        
        container.addEventListener('pointermove', cancelOnMove);
        container.addEventListener('pointerup', endPressOrLeave);
        container.addEventListener('pointerleave', endPressOrLeave, { once: true });
        
        pressTimer = setTimeout(() => {
            container.removeEventListener('pointermove', cancelOnMove);
            if (!hasMoved) {
                appState.selectionMode.active = true;
                appState.selectionMode.pageContext = pageContext;
                _toggleCardSelection(card);
            }
        }, 500);
    };
    
    // Simpan referensi handler ke elemen
    container._selectionHandlers = { start: startPress };
    container.addEventListener('pointerdown', startPress);
}

function _toggleCardSelection(card) {
    if (!card || !card.dataset.id) return;
    const id = card.dataset.id;
    const { selectedIds } = appState.selectionMode;

    if (selectedIds.has(id)) {
        selectedIds.delete(id);
        card.classList.remove('selected');
    } else {
        selectedIds.add(id);
        card.classList.add('selected');
    }

    if (appState.selectionMode.active && selectedIds.size === 0) {
        appState.selectionMode.active = false;
        document.body.classList.remove('selection-active');
    }
    
    _renderSelectionBar();
}

function _renderSelectionBar() {
    let bar = $('#selection-bar');
    if (!bar) {
        bar = document.createElement('div');
        bar.id = 'selection-bar';
        bar.className = 'selection-bar';
        document.body.appendChild(bar);
    }

    if (appState.selectionMode.active) {
        let total = 0;
        const { selectedIds, pageContext } = appState.selectionMode;
        
        // [LOGIKA BARU] Cek dari halaman mana seleksi berasal
        if (pageContext === 'tagihan') {
            selectedIds.forEach(id => {
                const bill = appState.tagihan.currentList.find(b => b.id === id);
                if(bill) total += (bill.amount - (bill.paidAmount || 0));
            });
        } else if (pageContext === 'pemasukan') {
            const allIncomes = [...appState.incomes, ...appState.fundingSources];
            selectedIds.forEach(id => {
                const income = allIncomes.find(i => i.id === id);
                if(income) total += (income.amount || income.totalAmount || 0);
            });
        }

        bar.innerHTML = `
            <button id="close-selection-btn" class="btn-icon"><span class="material-symbols-outlined">close</span></button>
            <div class="selection-info">
                <span id="selection-count">${selectedIds.size} item dipilih</span>
                <strong id="selection-total">${fmtIDR(total)}</strong>
            </div>
        `;
        document.body.classList.add('selection-active');
        bar.classList.add('show');
        
        $('#close-selection-btn').addEventListener('click', () => {
            appState.selectionMode.active = false;
            appState.selectionMode.selectedIds.clear();
            _renderSelectionBar();
            // Hapus kelas 'selected' dari semua kartu di halaman aktif
            $$('.dense-list-item.selected').forEach(card => card.classList.remove('selected'));
        });
    } else {
        document.body.classList.remove('selection-active');
        bar.classList.remove('show');
    }
}

function _renderSparklineChart(canvasId, data, isPositiveGood) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const positiveColor = 'rgba(34, 197, 94, 0.8)';
    const negativeColor = 'rgba(239, 68, 68, 0.8)';
    // Gradasi untuk area di bawah garis
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    const mainColor = isPositiveGood?positiveColor : negativeColor;
    gradient.addColorStop(0, mainColor.replace('0.8', '0.2')); // Warna atas (lebih transparan)
    gradient.addColorStop(1, mainColor.replace('0.8', '0')); // Warna bawah (sangat transparan)
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: Array(data.length).fill(''),
            datasets: [{
                data: data,
                borderColor: mainColor,
                borderWidth: 2,
                fill: true,
                backgroundColor: gradient,
                tension: 0.4 // Membuat garis lebih melengkung halus
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    enabled: false
                }
            },
            elements: {
                point: {
                    radius: 0
                }
            },
            scales: {
                x: {
                    display: false
                },
                y: {
                    display: false
                }
            }
        }
    });
}

function _getDashboardTrendData() {
    const trends = {
        profit: Array(7).fill(0),
        bills: Array(7).fill(0)
    };
    const today = new Date();
    today.setHours(23, 59, 59, 999);
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateString = date.toISOString().slice(0, 10);
        // Hitung profit untuk hari itu
        const dailyIncome = appState.incomes
            .filter(inc => _getJSDate(inc.date).toISOString().slice(0, 10) === dateString) // <-- PERBAIKAN DI SINI
            .reduce((sum, inc) => sum + inc.amount, 0);
        const dailyExpense = appState.expenses
            .filter(exp => _getJSDate(exp.date).toISOString().slice(0, 10) === dateString) // <-- PERBAIKAN DI SINI
            .reduce((sum, exp) => sum + exp.amount, 0);
        trends.profit[6 - i] = dailyIncome - dailyExpense;
        // Hitung total tagihan belum lunas PADA HARI ITU
        const dailyUnpaidBills = appState.bills
            .filter(b => b.status === 'unpaid' && _getJSDate(b.dueDate) <= date) // <-- PERBAIKAN DI SINI
            .reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);
        trends.bills[6 - i] = dailyUnpaidBills;
    }
    return trends;
}

async function _logActivity(action, details = {}) {
    if (!appState.currentUser || isViewer()) return;
    try {
        await addDoc(logsCol, {
            action,
            details,
            userId: appState.currentUser.uid,
            userName: appState.currentUser.displayName,
            createdAt: serverTimestamp()
        });
    } catch (error) {
        console.error("Gagal mencatat aktivitas:", error);
        // Simpan ke antrean offline untuk dikirim saat online
        try {
            await localDB.pending_logs.add({
                action,
                details,
                userId: appState.currentUser.uid,
                userName: appState.currentUser.displayName,
                createdAt: new Date()
            });
        } catch (e2) {
            console.warn('Gagal antre log offline:', e2);
        }
    }
}

// Real-time sync untuk master data menggunakan onSnapshot
function subscribeToMasterData() {
    const master = [{
        key: 'projects',
        col: projectsCol
    }, {
        key: 'suppliers',
        col: suppliersCol
    }, {
        key: 'workers',
        col: workersCol
    }, {
        key: 'professions',
        col: professionsCol
    }, {
        key: 'operational_categories',
        col: opCatsCol
    }, {
        key: 'material_categories',
        col: matCatsCol
    }, {
        key: 'other_categories',
        col: otherCatsCol
    }, {
        key: 'materials',
        col: materialsCol
    }, {
        key: 'staff',
        col: staffCol
    }, ];
    master.forEach(({
        key,
        col
    }) => {
        onSnapshot(col, async (snap) => {
            const incoming = snap.docs.map(d => ({ ...d.data(),
                id: d.id,
                serverRev: (d.data().rev || 0)
            }));
            try {
                if (incoming.length > 0) await localDB[key].bulkPut(incoming);
                appState[key] = incoming;
            } catch (e) {
                console.warn('Gagal menerapkan snapshot untuk', key, e);
            }
        }, (err) => console.warn('Snapshot error', key, err));
    });
}

async function _animateTabSwitch(contentContainer, renderNewContentFunc, direction = 'forward') {
    if (!contentContainer) return;

    // Tentukan kelas animasi berdasarkan arah perpindahan
    const exitClass = direction === 'forward' ? 'sub-page-exit-to-left' : 'sub-page-exit-to-right';
    const enterClass = direction === 'forward' ? 'sub-page-enter-from-right' : 'sub-page-enter-from-left';

    // 1. Mulai animasi keluar pada konten yang ada
    contentContainer.classList.add(exitClass);

    // 2. Tunggu 200ms (sesuai durasi transisi CSS)
    await new Promise(resolve => setTimeout(resolve, 200));

    // 3. Ganti konten dengan yang baru (setelah konten lama menghilang)
    await renderNewContentFunc();

    // 4. Siapkan konten baru untuk animasi masuk (masih transparan dan bergeser)
    contentContainer.classList.remove(exitClass);
    contentContainer.classList.add(enterClass);

    // 5. Trik agar browser menerapkan style di atas sebelum memulai animasi masuk
    requestAnimationFrame(() => {
        // 6. Hapus kelas 'enter' agar konten baru bergerak ke posisi normal
        contentContainer.classList.remove(enterClass);
    });
}

function _setActiveListeners(requiredListeners = []) {
    const collectionRefs = {
        'bills': billsCol,
        'expenses': expensesCol,
        'incomes': incomesCol,
        'attendance_records': attendanceRecordsCol,
        'comments': commentsCol,
        // Tambahkan koleksi lain jika perlu di-listen secara real-time
    };

    const currentActive = Array.from(appState.activeListeners.keys());

    // 1. Matikan listener yang tidak diperlukan lagi
    currentActive.forEach(listenerName => {
        if (!requiredListeners.includes(listenerName)) {
            const unsubscribe = appState.activeListeners.get(listenerName);
            if (typeof unsubscribe === 'function') {
                unsubscribe(); // Panggil fungsi unsubscribe dari Firestore
            }
            appState.activeListeners.delete(listenerName);
            console.log(`- Listener untuk '${listenerName}' dinonaktifkan.`);
        }
    });

    // 2. Aktifkan listener baru yang dibutuhkan (jika belum aktif)
    requiredListeners.forEach(listenerName => {
        if (!appState.activeListeners.has(listenerName)) {
            const collectionRef = collectionRefs[listenerName];
            if (collectionRef) {
                const q = query(collectionRef);
                const unsubscribe = onSnapshot(q, (snapshot) => {
                    if (snapshot.empty && snapshot.metadata.fromCache) return;
                    console.log(`Menerima ${snapshot.docChanges().length} pembaruan dari: ${listenerName}`);
                    _processRealtimeChanges(snapshot.docChanges(), listenerName);
                }, (error) => {
                    console.error(`Gagal mendengarkan ${listenerName}:`, error);
                });

                // Simpan fungsi unsubscribe ke pengelola
                appState.activeListeners.set(listenerName, unsubscribe);
                console.log(`+ Listener untuk '${listenerName}' diaktifkan.`);
            }
        }
    });
}

function _calculateAndCacheDashboardTotals() {
    console.log("Calculating dashboard totals from appState...");
    // Logika perhitungan ini diambil langsung dari renderDashboardPage
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);

    const pendapatan = (appState.incomes || []).filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
    const hpp_material = (appState.expenses || []).filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);

    let hpp_gaji = 0;
    let bebanGajiInternal = 0;
    const paidSalaryBills = (appState.bills || []).filter(b => b.type === 'gaji' && b.status === 'paid');
    const attendanceMap = new Map((appState.attendanceRecords || []).map(rec => [rec.id, rec]));

    paidSalaryBills.forEach(bill => {
        (bill.recordIds || []).forEach(recordId => {
            const record = attendanceMap.get(recordId);
            if (record) {
                if (record.projectId === mainProject?.id) {
                    hpp_gaji += record.totalPay || 0;
                } else {
                    bebanGajiInternal += record.totalPay || 0;
                }
            }
        });
    });

    const hpp_lainnya = (appState.expenses || []).filter(e => e.projectId === mainProject?.id && e.type === 'lainnya').reduce((sum, e) => sum + e.amount, 0);
    const hpp = hpp_material + hpp_gaji + hpp_lainnya;
    const labaKotor = pendapatan - hpp;
    const bebanOperasional = (appState.expenses || []).filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);

    const bebanExpenseInternal = (appState.expenses || []).filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
    const bebanInternal = bebanExpenseInternal + bebanGajiInternal;

    const labaBersih = labaKotor - bebanOperasional - bebanInternal;
    const totalUnpaid = (appState.bills || []).filter(b => b.status === 'unpaid').reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);

    // Simpan hasil perhitungan ke state
    appState.dashboardTotals.labaBersih = labaBersih;
    appState.dashboardTotals.totalUnpaid = totalUnpaid;
    
    console.log("Dashboard totals recalculated and cached:", appState.dashboardTotals);
    
    // Jika dashboard sedang terbuka, perbarui angkanya secara live
    if (appState.activePage === 'dashboard') {
        const labaEl = document.querySelector('.dashboard-balance-card .value.positive');
        const unpaidEl = document.querySelector('.dashboard-balance-card .value.negative');
        if (labaEl) animateNumber(labaEl, labaBersih);
        if (unpaidEl) animateNumber(unpaidEl, totalUnpaid);
    }
}

async function _processRealtimeChanges(changes, collectionName) {
    let hasChanged = false;
    let needsDashboardRecalc = false;

    // Langkah 1: Update database lokal (Dexie) dan state aplikasi secara inkremental
    for (const change of changes) {
        const docData = { ...change.doc.data(), id: change.doc.id };
        const localTable = localDB[collectionName];
        const stateArray = appState[collectionName];

        // Selalu update database lokal karena 'put' akan menangani tambah/ubah secara otomatis
        await localTable.put(docData);

        if (stateArray) {
            const index = stateArray.findIndex(item => item.id === docData.id);

            if (change.type === "added") {
                // HANYA tambahkan ke daftar jika item benar-benar belum ada
                if (index === -1) {
                    stateArray.push(docData);
                } else {
                    // Jika sudah ada (kasus sinkronisasi), perbarui saja
                    stateArray[index] = docData;
                }
                hasChanged = true;
            }
            else if (change.type === "modified") {
                // Jika item ditemukan, perbarui. Jika tidak, tambahkan.
                if (index > -1) {
                    stateArray[index] = docData;
                } else {
                    stateArray.push(docData);
                }
                hasChanged = true;
            }
            else if (change.type === "removed") {
                // Hapus dari database lokal dan dari daftar
                await localTable.where('id').equals(docData.id).delete();
                if (index > -1) {
                    stateArray.splice(index, 1);
                }
                hasChanged = true;
            }
        }

        // Tandai untuk kalkulasi ulang jika data keuangan berubah
        if (['incomes', 'expenses', 'bills', 'attendance_records'].includes(collectionName)) {
            needsDashboardRecalc = true;
        }
    } // <-- [PERBAIKAN] Kurung kurawal penutup untuk for loop ditambahkan di sini

    if (!hasChanged) return;

    // Jika ada perubahan data keuangan, hitung ulang total dashboard
    if (needsDashboardRecalc) {
        _calculateAndCacheDashboardTotals();
    }

    // Perbarui UI halaman yang sedang aktif
    switch (appState.activePage) {
        case 'laporan':
            if (needsDashboardRecalc) renderLaporanPage();
            break;
        case 'tagihan':
            if (['bills', 'expenses'].includes(collectionName)) _renderTagihanContent();
            break;
        case 'jurnal':
            if (collectionName === 'attendance_records') renderJurnalPage();
            break;
        case 'pemasukan':
            if (collectionName === 'incomes') renderPemasukanPage();
            break;
    }

    // Selalu perbarui UI komentar jika ada perubahan komentar
    if (collectionName === 'comments') {
        const activeModal = document.querySelector('#dataDetail-modal.show');
        if (activeModal) {
            changes.forEach(change => {
                const commentSection = activeModal.querySelector(`.comments-section[data-parent-id="${change.doc.data().parentId}"]`);
                if (commentSection) {
                    upsertCommentInUI(change.doc.data(), change.type);
                }
            });
        }
    }

    // Langkah 3: Perbarui indikator sinkronisasi
    updateSyncIndicator();
    setLastSyncTimestamp();
}

async function handleOpenConflictsPanel() {
    const conflicts = await localDB.pending_conflicts.toArray();
    const itemsHTML = conflicts.length === 0?'<p class="empty-state-small">Tidak ada konflik yang tertunda.</p>' : conflicts.map(c => {
        const when = new Date(c.when || Date.now()).toLocaleString('id-ID');
        return `
            <div class="dense-list-item" data-id="${c.id}">
                <div class="item-main-content">
                    <strong class="item-title">${c.table} / ${c.docId}</strong>
                    <span class="item-subtitle">Rev Lokal: ${c.baseRev || 0} | Rev Server: ${c.serverRev || 0} | ${when}</span>
                </div>
                <div class="item-actions">
                    <button class="btn btn-sm btn-primary" data-action="apply-conflict" data-conflict-id="${c.id}">Pakai Data Lokal</button>
                    <button class="btn btn-sm btn-secondary" data-action="discard-conflict" data-conflict-id="${c.id}">Pakai Data Server</button>
                </div>
            </div>`;
    }).join('');
    const content = `<div class="dense-list-container">${itemsHTML}</div>`;
    createModal('dataDetail', {
        title: 'Konflik Sinkron',
        content
    });
}

async function resolveConflict(conflictId, useLocal) {
    try {
        const c = await localDB.pending_conflicts.get(Number(conflictId));
        if (!c) return;
        const colMap = {
            expenses: expensesCol,
            bills: billsCol,
            incomes: incomesCol,
            funding_sources: fundingSourcesCol,
            attendance_records: attendanceRecordsCol,
            stock_transactions: stockTransactionsCol,
        };
        const dexieTable = localDB[c.table];
        const col = colMap[c.table];
        const ref = doc(col, c.docId);
        if (useLocal) {
            await runTransaction(db, async (transaction) => {
                const snap = await transaction.get(ref);
                const nextRev = (snap.exists()?(snap.data().rev || 0) : 0) + 1;
                const data = { ...(c.payload || {}),
                    id: c.docId,
                    rev: nextRev,
                    updatedAt: serverTimestamp()
                };
                if (snap.exists()) transaction.update(ref, data);
                else transaction.set(ref, data);
            });
            if (dexieTable && c.localId != null) await dexieTable.update(c.localId, {
                needsSync: 0
            });
        } else {
            const snap = await getDoc(ref);
            if (snap.exists()) {
                if (dexieTable && c.localId != null) {
                    await dexieTable.update(c.localId, { ...snap.data(),
                        serverRev: (snap.data().rev || 0),
                        needsSync: 0
                    });
                }
            }
        }
        await localDB.pending_conflicts.delete(c.id);
        toast('success', 'Konflik berhasil diproses.');
        closeModal($('#dataDetail-modal'));
    } catch (e) {
        console.error('Gagal memproses konflik:', e);
        toast('error', 'Gagal memproses konflik.');
    }
}

async function handleOpenStorageStats() {
    try {
        const files = await localDB.files.toArray();
        const counts = await getPendingSyncCounts();
        const totalBytes = files.reduce((s, f) => s + (f.size || (f.file && f.file.size) || 0), 0);
        const toMB = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
        const statsHTML = `
                <div class="card card-pad">
                    <h5>Statistik Storage Offline</h5>
                    <div class="stats-grid">
                        <div><span class="label">Jumlah File</span><strong>${files.length}</strong></div>
                        <div><span class="label">Total Ukuran</span><strong>${toMB(totalBytes)}</strong></div>
                        <div><span class="label">Antrian Sync</span><strong>${counts.total} item</strong></div>
                        <div><span class="label">Konflik</span><strong>${counts.qConf}</strong></div>
                    </div>
                    <div class="storage-actions" style="margin-top:1rem;display:flex;gap:.5rem;">
                        <button class="btn btn-secondary" data-action="evict-storage">Bersihkan Sekarang</button>
                    </div>
                </div>`;
        const modal = createModal('dataDetail', {
            title: 'Statistik Storage',
            content: statsHTML
        });
        if (modal) {
            $('[data-action="evict-storage"]', modal)?.addEventListener('click', async () => {
                await _enforceLocalFileStorageLimit();
                toast('success', 'Pembersihan selesai.');
                closeModal(modal);
            });
        }
    } catch (e) {
        console.error('Gagal membuka statistik storage:', e);
        toast('error', 'Gagal memuat statistik storage.');
    }
}

async function _collectPendingItems() {
    const tables = ['expenses','bills','incomes','funding_sources','attendance_records','stock_transactions'];
    const results = [];
    for (const t of tables) {
        try {
            const items = await localDB[t].where('needsSync').equals(1).toArray();
            for (const it of items) {
                results.push({
                    group: 'table', table: t, localId: it.localId, id: it.id,
                    label: it.description || it.projectName || it.workerName || it.materialName || it.type || t,
                    extra: (it.amount != null?`Rp ${Number(it.amount).toLocaleString('id-ID')}`:'')
                });
            }
        } catch (_) {}
    }
    try {
        const pp = await localDB.pending_payments.toArray();
        pp.forEach(p => results.push({ group: 'pending_payments', id: p.id, label: p.workerName || p.billId || 'Pembayaran Tertunda', extra: p.amount != null?`Rp ${Number(p.amount).toLocaleString('id-ID')}`:'' }));
    } catch (_) {}
    try {
        const pl = await localDB.pending_logs.toArray();
        pl.forEach(l => results.push({ group: 'pending_logs', id: l.id, label: l.action || 'Log Offline', extra: '' }));
    } catch (_) {}
    try {
        const pc = await localDB.pending_conflicts.toArray();
        pc.forEach(c => results.push({ group: 'pending_conflicts', id: c.id, label: `Konflik ${c.table}:${c.docId}`, extra: '' }));
    } catch (_) {}
    return results;
}

async function handleOpenSyncQueueModal() {
    try {
        const items = await _collectPendingItems();
        const count = items.length;
        const listHTML = count > 0 ? items.map(i => `
            <div class="dense-list-item" data-group="${i.group}" ${i.table?`data-table="${i.table}"`:''} ${i.localId!=null?`data-local-id="${i.localId}"`:''} data-id="${i.id}">
                <div class="dense-list-left">
                    <span class="material-symbols-outlined">pending</span>
                </div>
                <div class="dense-list-content">
                    <div class="title">${i.label}</div>
                    ${i.extra?`<div class="subtitle">${i.extra}</div>`:''}
                </div>
                <div class="dense-list-actions">
                    <button class="btn-icon" title="Sinkronkan" data-action="sync-item" data-group="${i.group}" ${i.table?`data-table="${i.table}"`:''} ${i.localId!=null?`data-local-id="${i.localId}"`:''} data-id="${i.id}"><span class="material-symbols-outlined">sync</span></button>
                    <button class="btn-icon btn-icon-danger" title="Hapus" data-action="delete-pending-item" data-group="${i.group}" ${i.table?`data-table="${i.table}"`:''} ${i.localId!=null?`data-local-id="${i.localId}"`:''} data-id="${i.id}"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </div>
        `).join('') : '<p class="empty-state-small">Tidak ada data tertunda.</p>';

        const content = `
            <div class="card card-pad">
                <div style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
                    <div><strong>${count}</strong> item menunggu sinkronisasi</div>
                    ${count>0?`<button class="btn btn-primary" data-action="sync-all-pending"><span class="material-symbols-outlined">sync</span> Sinkron Semua</button>`:''}
                </div>
            </div>
            <div class="list dense-list" style="margin-top:.75rem;">
                ${listHTML}
            </div>
        `;
        createModal('dataDetail', { title: 'Antrean Sinkronisasi', content });
    } catch (e) {
        console.error('Gagal membuka antrean sinkron:', e);
        toast('error', 'Gagal memuat antrean sinkron.');
    }
}

async function handleDeletePendingItem(buttonElement) {
    const ds = buttonElement.dataset; // Ambil dataset dari elemen tombol
    try {
        const group = ds.group;
        if (!group) return;

        // --- Logika Penghapusan Database (tetap sama) ---
        if (group === 'table') {
            const table = ds.table;
            const id = ds.id; // Gunakan ID utama untuk penghapusan
            if (table && id) {
                // Hapus berdasarkan ID utama, bukan localId, untuk konsistensi
                await localDB[table].where('id').equals(id).delete();
            }
        } else if (group === 'pending_payments' || group === 'pending_logs' || group === 'pending_conflicts') {
            await localDB[group].delete(Number(ds.id));
        }

        // --- [LOGIKA BARU] Memperbarui UI secara langsung ---
        const listItem = buttonElement.closest('.dense-list-item');
        if (listItem) {
            // 1. Tambahkan kelas untuk animasi keluar
            listItem.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease, padding 0.2s ease';
            listItem.style.opacity = '0';
            listItem.style.transform = 'translateX(-20px)';
            listItem.style.maxHeight = '0px';
            listItem.style.padding = '0';
            
            // 2. Hapus elemen dari DOM setelah animasi selesai
            setTimeout(() => {
                listItem.remove();
                
                // 3. Perbarui hitungan item di header modal
                const modal = $('#dataDetail-modal');
                if(modal) {
                    const countElement = modal.querySelector('.card-pad strong');
                    if(countElement) {
                        const currentCount = $$('.dense-list-item', modal).length;
                        countElement.textContent = currentCount;
                        // Sembunyikan tombol "Sinkron Semua" jika sudah kosong
                        if(currentCount === 0) {
                            modal.querySelector('[data-action="sync-all-pending"]').style.display = 'none';
                        }
                    }
                }
            }, 300);
        }

        toast('success', 'Item dihapus dari antrean.');
        updateSyncIndicator(); // Tetap perbarui indikator global

    } catch (e) {
        console.error('Gagal menghapus item antrean:', e);
        toast('error', 'Gagal menghapus item.');
    }
}

// =======================================================
//          SEKSI 2.5: FUNGSI MODAL & AUTENTIKASI
// =======================================================
function createModal(type, data = {}) {
    let modalContainer = $('#modal-container');
    if (!modalContainer) {
      modalContainer = document.createElement('div');
      modalContainer.id = 'modal-container';
      document.body.appendChild(modalContainer);
    }
  
    const modalEl = document.createElement('div');
    modalEl.id = `${type}-modal`;
    modalEl.className = 'modal-bg';
    modalEl.innerHTML = getModalContent(type, data);
    modalContainer.appendChild(modalEl);
  
    setTimeout(() => modalEl.classList.add('show'), 10);
  
    try {
        if ('pushState' in history) {
            // [REVISI MODAL] Cek state saat ini sebelum push
            if (history.state && history.state.modal === true) {
                // Jika sudah ada modal terbuka, ganti state saat ini, jangan tambah baru
                history.replaceState({ page: appState.activePage, modal: true, id: modalEl.id }, '', window.location.href);
            } else {
                // Jika tidak ada modal, baru tambahkan state baru
                history.pushState({ page: appState.activePage, modal: true, id: modalEl.id }, '', window.location.href);
            }
        }
    } catch(_) {}
  
    const closeModalFunc = () => {
        closeModal(modalEl);
        if (data.onClose) data.onClose();
    };
  
    modalEl.addEventListener('click', e => {
        if (e.target === modalEl) closeModalFunc();
    });
    modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
  
    attachModalEventListeners(type, data, closeModalFunc);
    return modalEl;
  }

function closeModal(modalEl) {
  if (!modalEl) return;
  try {
    // Jika state saat ini berasal dari modal, gunakan history.back() agar popstate menutup modal
    if (history.state && history.state.modal === true) {
      history.back();
      return;
    }
  } catch(_) {}
  // Fallback: tutup langsung
  _closeModalImmediate(modalEl);
}

// Tutup modal tanpa memanipulasi History API (digunakan oleh popstate)
function _closeModalImmediate(modalEl) {
  if (!modalEl) return;
  modalEl.classList.remove('show');
  setTimeout(() => modalEl.remove(), 300);
}

function getModalContent(type, data) {
  if (type === 'imageView') {
      return `<div class="image-view-modal" data-close-modal>
                      <img src="${data.src}" alt="Lampiran">
                      <button class="btn-icon image-view-close" data-close-modal>
                          <span class="material-symbols-outlined">close</span>
                      </button>
                  </div>`;
  }

const modalWithHeader = (title, content) => `<div class="modal-content"><div class="modal-header"><h4>${title}</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body">${content}</div></div>`;
const simpleModal = (title, content, footer) => `<div class="modal-content simple-modal-content" style="max-width:400px"><div class="modal-header"><h4>${title}</h4></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div>`;
  if (type === 'login') return simpleModal('Login', '<p>Gunakan akun Google Anda.</p>', '<button id="google-login-btn" class="btn btn-primary">Masuk dengan Google</button>');
  if (type === 'confirmLogout') return simpleModal('Keluar', '<p>Anda yakin ingin keluar?</p>', '<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button>');

  if (type === 'confirmDelete' || type === 'confirmPayment' || type === 'confirmEdit' || type === 'confirmPayBill' || type === 'confirmGenerateBill' || type === 'confirmUserAction' || type === 'confirmDeleteAttachment' || type === 'confirmDeleteRecap') {
      const titles = {
          confirmDelete: 'Konfirmasi Hapus',
          confirmPayment: 'Konfirmasi Pembayaran',
          confirmEdit: 'Konfirmasi Perubahan',
          confirmPayBill: 'Konfirmasi Pembayaran',
          confirmGenerateBill: 'Konfirmasi Buat Tagihan',
          confirmUserAction: 'Konfirmasi Aksi',
          confirmDeleteAttachment: 'Hapus Lampiran',
          confirmDeleteRecap: 'Hapus Rekap Gaji'
      };
      const messages = {
          confirmDelete: 'Anda yakin ingin menghapus data ini?',
          confirmPayment: 'Anda yakin ingin melanjutkan pembayaran?',
          confirmEdit: 'Anda yakin ingin menyimpan perubahan?',
          confirmPayBill: 'Anda yakin ingin melanjutkan pembayaran ini?',
          confirmGenerateBill: 'Anda akan membuat tagihan gaji untuk pekerja ini. Lanjutkan?',
          confirmUserAction: 'Apakah Anda yakin?',
          confirmDeleteAttachment: 'Anda yakin ingin menghapus lampiran ini?',
          confirmDeleteRecap: 'Menghapus rekap ini akan menghapus data absensi terkait. Aksi ini tidak dapat dibatalkan. Lanjutkan?'
      };
      const confirmTexts = {
          confirmDelete: 'Hapus',
          confirmPayment: 'Ya, Bayar',
          confirmEdit: 'Ya, Simpan',
          confirmPayBill: 'Ya, Bayar',
          confirmGenerateBill: 'Ya, Buat Tagihan',
          confirmUserAction: 'Ya, Lanjutkan',
          confirmDeleteAttachment: 'Ya, Hapus',
          confirmDeleteRecap: 'Ya, Hapus'
      };
      const confirmClasses = {
          confirmDelete: 'btn-danger',
          confirmPayment: 'btn-success',
          confirmEdit: 'btn-primary',
          confirmPayBill: 'btn-success',
          confirmGenerateBill: 'btn-primary',
          confirmUserAction: 'btn-primary',
          confirmDeleteAttachment: 'btn-danger',
          confirmDeleteRecap: 'btn-danger'
      };

      return simpleModal(
          titles[type],
          `<p class="confirm-modal-text">${data.message || messages[type]}</p>`,
          `<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-btn" class="btn ${confirmClasses[type]}">${confirmTexts[type]}</button>`
      );
  }

  if (type === 'confirmExpense') {
      return simpleModal(
          'Konfirmasi Status Pengeluaran',
          '<p>Apakah pengeluaran ini sudah dibayar atau akan dijadikan tagihan?</p>',
          `<button class="btn btn-secondary" id="confirm-bill-btn">Jadikan Tagihan</button><button id="confirm-paid-btn" class="btn btn-success">Sudah, Lunas</button>`
      );
  }
  if (type === 'dataDetail' || type === 'payment' || type === 'manageMaster' || type === 'editMaster' || type === 'editItem' || type === 'editAttendance' || type === 'imageView' || type === 'manageUsers') {
      return modalWithHeader(data.title, data.content);
  }
  if (type === 'actionsMenu') {
      const {
          actions,
          targetRect
      } = data;
      const top = targetRect.bottom + 8;
      const right = window.innerWidth - targetRect.right - 8;
      return `
              <div class="actions-menu" style="top:${top}px; right:${right}px;">
                  ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
              </div>`;
  }
  if (type === 'invoiceItemsDetail') {
      const {
          items,
          totalAmount
      } = data;
      const itemsHTML = items.map(item => {
          const material = appState.materials.find(m => m.id === item.materialId);
          const itemName = material?material.materialName : 'Material Dihapus';
          const itemUnit = material?`(${material.unit})` : '';
          return `
              <div class="invoice-detail-item">
                  <div class="item-main-info">
                      <span class="item-name">${itemName}</span>
                      <span class="item-total">${fmtIDR(item.total)}</span>
                  </div>
                  <div class="item-sub-info">
                      <span>${item.qty} ${itemUnit} x ${fmtIDR(item.price)}</span>
                  </div>
              </div>`;
      }).join('');

      return modalWithHeader('Rincian Faktur', `
              <div class="invoice-detail-list">${itemsHTML}</div>
              <div class="invoice-detail-summary">
                  <span>Total Faktur</span>
                  <strong>${fmtIDR(totalAmount)}</strong>
              </div>
          `);
  }

  if (type === 'billActionsModal') {
      const {
          bill,
          actions
      } = data;
      const supplierName = appState.suppliers.find(s => s.id === (appState.expenses.find(e => e.id === bill.expenseId)?.supplierId))?.supplierName || '';
      const modalBody = `
              <div class="actions-modal-header">
                  <h4>${bill.description}</h4>
                  ${supplierName?`<span>${supplierName}</span>` : ''}
                  <strong>${fmtIDR(bill.amount)}</strong>
              </div>
              <div class="actions-modal-list">
                  ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
              </div>
          `;
      const modalFooter = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;
      return `<div class="modal-content"><div class="modal-body">${modalBody}</div><div class="modal-footer">${modalFooter}</div></div>`;
  }
  return `<div>Konten tidak ditemukan</div>`;
}

function attachModalEventListeners(type, data, closeModalFunc) {
    if (type === 'login') $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
    if (type === 'confirmLogout') $('#confirm-logout-btn')?.addEventListener('click', handleLogout);
    
    if (type.startsWith('confirm') && type !== 'confirmExpense') {
        $('#confirm-btn')?.addEventListener('click', () => {
            if (data.onConfirm) {
                data.onConfirm(); // Jalankan aksi utama (misal: hapus atau simpan data)
            }
            // [PERBAIKAN] Tambahkan baris ini untuk menutup modal konfirmasi setelah aksi dipanggil.
            // Modal lain yang terbuka (misalnya form edit) akan ditutup oleh logikanya sendiri di dalam onConfirm.
            closeModalFunc();
        });
    }

    if (type === 'confirmExpense') {
        $('#confirm-paid-btn')?.addEventListener('click', () => {
            if (data.onConfirm) data.onConfirm('paid');
            closeModalFunc();
        });
        $('#confirm-bill-btn')?.addEventListener('click', () => {
            if (data.onConfirm) data.onConfirm('unpaid');
            closeModalFunc();
        });
    }

    if (type === 'payment') {
        $('#payment-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = fmtIDR(parseFormattedNumber(e.target.elements.amount.value));
            let onConfirm;
            const t = e.target.dataset.type;

            if (t === 'bill') onConfirm = () => handleProcessBillPayment(e.target);
            else if (t === 'pinjaman' || t === 'loan') onConfirm = () => handleProcessPayment(e.target);
            else if (t === 'individual-salary') onConfirm = () => handleProcessIndividualSalaryPayment(e.target);
            else onConfirm = () => {};
            
            createModal('confirmPayBill', {
                message: `Anda akan membayar sebesar ${amount}. Lanjutkan?`,
                onConfirm: () => {
                    onConfirm();
                    closeModalFunc(); // Tutup modal pembayaran setelah konfirmasi
                }
            });
        });
        $$('#payment-form input[inputmode="numeric"]')?.forEach(input => input.addEventListener('input', _formatNumberInput));
    }

    if (type === 'actionsMenu') {
        $$('.actions-menu-item').forEach(btn => btn.addEventListener('click', () => closeModalFunc()));
    }

    if (type === 'manageMaster' || type === 'editMaster') {
        const modalEl = $(`#${type}-modal`);
        if (!modalEl) return;
        
        const formId = (type === 'manageMaster') ? '#add-master-item-form' : '#edit-master-form';
        const form = $(formId, modalEl);

        if (form) {
            form.addEventListener('submit', (e) => {
                e.preventDefault();
                
                if (type === 'manageMaster') {
                    handleAddMasterItem(form);
                } else { // type === 'editMaster'
                    createModal('confirmEdit', {
                        onConfirm: () => {
                            handleUpdateMasterItem(form); 
                            closeModal(modalEl); // Tutup modal edit
                        }
                    });
                }
            });
        }
        
        _initCustomSelects(modalEl);
        $$('input[inputmode="numeric"]', modalEl).forEach(i => i.addEventListener('input', _formatNumberInput));
        if (modalEl.querySelector('[data-type="staff"]')) _attachStaffFormListeners(modalEl);
    }

    if (type === 'editItem') {
        const modalEl = $(`#${type}-modal`);
        _initCustomSelects(modalEl);
        $$('input[inputmode="numeric"]', modalEl).forEach(input => input.addEventListener('input', _formatNumberInput));
        $('#edit-item-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            createModal('confirmEdit', {
                onConfirm: () => {
                    handleUpdateItem(e.target);
                    closeModalFunc();
                }
            });
        });
        if (modalEl.querySelector('#material-invoice-form') || modalEl.querySelector('#edit-item-form[data-type="expense"] #invoice-items-container')) {
            _attachPengeluaranFormListeners('material');
        }
    }

    if (type === 'editAttendance') {
        $('#edit-attendance-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            createModal('confirmEdit', {
                onConfirm: () => {
                    handleUpdateAttendance(e.target);
                    closeModalFunc();
                }
            });
        });
    }
}

onAuthStateChanged(auth, (user) => {
  if (user) {
      initializeAppSession(user);
  } else {
      Object.assign(appState, {
          currentUser: null,
          userRole: 'Guest',
          userStatus: null,
          justLoggedIn: false
      });
      $('#global-loader').style.display = 'none';
      $('#app-shell').style.display = 'flex';
      renderUI();
      _setActiveListeners([]); // Matikan semua listener saat logout
    }
});

async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  try {
      await signInWithPopup(auth, provider);
      toast('success', 'Login berhasil. Menyiapkan akun...');
  } catch (error) {
      console.error('Popup sign-in failed:', error);
      toast('error', 'Login gagal. Coba lagi.');
  }
}

async function handleLogout() {
  closeModal($('#confirmLogout-modal'));
  toast('syncing', 'Keluar...');
  try {
      await signOut(auth);
      toast('success', 'Anda telah keluar.');
  } catch (error) {
      toast('error', `Gagal keluar.`);
  }
}

function attachRoleListener(userDocRef) {
  onSnapshot(userDocRef, (docSnap) => {
      if (docSnap.exists()) {
          const {
              role,
              status
          } = docSnap.data();
          if (appState.userRole !== role || appState.userStatus !== status) {
              Object.assign(appState, {
                  userRole: role,
                  userStatus: status
              });
              renderUI();
          }
      }
  });
}

async function listenForPendingUsers() {
  onSnapshot(query(membersCol, where("status", "==", "pending")), (snapshot) => {
      appState.pendingUsersCount = snapshot.size;
      renderBottomNav();
      renderSidebar();
  });
}

// =======================================================
//          SEKSI 3: FUNGSI-FUNGSI HALAMAN
// =======================================================

// --- SUB-SEKSI 3.1: DASHBOARD & PENGATURAN ---
// GANTI SELURUH FUNGSI LAMA renderDashboardPage DENGAN INI

async function renderDashboardPage() {
    const container = $('.page-container');

    // Data master tetap perlu dimuat untuk bagian lain di dashboard
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('incomes', incomesCol),
        fetchAndCacheData('expenses', expensesCol),
        fetchAndCacheData('bills', billsCol),
        fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date')
    ]);

    // =========================================================================
    // BLOK PERHITUNGAN INTI DIHAPUS, DIGANTI DENGAN KODE DI BAWAH
    // =========================================================================
    // Langsung ambil data total yang sudah dihitung dan disimpan di cache state
    const { labaBersih, totalUnpaid } = appState.dashboardTotals;

    // --- Perhitungan yang spesifik untuk UI Dashboard (tetap di sini) ---
    const projectsWithBudget = appState.projects.filter(p => p.budget && p.budget > 0).map(p => {
        const actual = appState.expenses
            .filter(e => e.projectId === p.id)
            .reduce((sum, e) => sum + e.amount, 0);
        const remaining = p.budget - actual;
        const percentage = p.budget > 0 ? (actual / p.budget) * 100 : 0;
        return { ...p, actual, remaining, percentage };
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todaysExpenses = appState.expenses.filter(e => _getJSDate(e.date) >= today);
    const dailyRecap = todaysExpenses.reduce((recap, expense) => {
        const projectName = appState.projects.find(p => p.id === expense.projectId)?.projectName || 'Lainnya';
        if (!recap[projectName]) recap[projectName] = 0;
        recap[projectName] += expense.amount;
        return recap;
    }, {});
    // --- Akhir Blok Perhitungan Spesifik ---

    const trendData = _getDashboardTrendData();

    // --- Memulai Blok Pembuatan HTML Lengkap ---
    const balanceCardsHTML = `
        <div class="dashboard-balance-grid">
            <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="laporan">
                <span class="label">Estimasi Laba Bersih</span>
                <strong class="value positive">${fmtIDR(labaBersih)}</strong>
                <div class="sparkline-container">
                    <canvas id="profit-sparkline-chart"></canvas>
                </div>
            </div>
            <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="tagihan">
                <span class="label">Tagihan Belum Lunas</span>
                <strong class="value negative">${fmtIDR(totalUnpaid)}</strong>
                <div class="sparkline-container">
                    <canvas id="bills-sparkline-chart"></canvas>
                </div>
            </div>
        </div>`;

    const projectBudgetHTML = `
        <h5 class="section-title-owner">Sisa Anggaran Proyek</h5>
        <div class="card card-pad">
            ${projectsWithBudget.length > 0 ? projectsWithBudget.map(p => `
                <div class="budget-item">
                    <div class="budget-info">
                        <span class="project-name">${p.projectName}</span>
                        <strong class="remaining-amount ${p.remaining < 0 ? 'negative' : ''}">${fmtIDR(p.remaining)}</strong>
                    </div>
                    <div class="progress-bar-container">
                        <div class="progress-bar" style="width: ${Math.min(p.percentage, 100)}%; background-image: ${p.percentage > 100 ? 'var(--grad-danger)' : 'var(--grad)'};"></div>
                    </div>
                    <div class="budget-details">
                        <span>Terpakai: ${fmtIDR(p.actual)}</span>
                        <span>Anggaran: ${fmtIDR(p.budget)}</span>
                    </div>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada proyek dengan anggaran.</p>'}
        </div>`;

    const dailyRecapHTML = `
         <h5 class="section-title-owner">Rekap Pengeluaran Hari Ini</h5>
         <div class="card card-pad">
            ${Object.keys(dailyRecap).length > 0 ? Object.entries(dailyRecap).map(([projectName, total]) => `
                <div class="daily-recap-item">
                    <span>${projectName}</span>
                    <strong>${fmtIDR(total)}</strong>
                </div>
            `).join('') : '<p class="empty-state-small">Tidak ada pengeluaran hari ini.</p>'}
         </div>`;

    const bottomNavIds = (BOTTOM_NAV_BY_ROLE[appState.userRole] || []);
    const accessibleLinks = ALL_NAV_LINKS.filter(link =>
        link.id !== 'dashboard' &&
        link.roles.includes(appState.userRole) &&
        !bottomNavIds.includes(link.id)
    );
    const mainActionIds = ['tagihan', 'laporan', 'stok', 'pengeluaran'];
    const mainActions = [];
    const extraActions = [];
    accessibleLinks.forEach(link => { if (mainActionIds.includes(link.id)) mainActions.push(link); else extraActions.push(link); });
    mainActions.sort((a, b) => mainActionIds.indexOf(a.id) - mainActionIds.indexOf(b.id));

    const createActionItemHTML = (link, isExtra = false) => `
        <button class="dashboard-action-item ${isExtra ? 'action-item-extra' : ''}" data-action="navigate" data-nav="${link.id}">
            <div class="icon-wrapper"><span class="material-symbols-outlined">${link.icon}</span></div>
            <span class="label">${link.label}</span>
        </button>`;

    let quickActionsHTML = '';
    const totalActions = mainActions.length + extraActions.length;
    if (totalActions > 0) {
        if (totalActions <= 5) {
            const all = [...mainActions, ...extraActions];
            const centerClass = totalActions === 4 ? 'center-4' : totalActions === 3 ? 'center-3' : totalActions === 2 ? 'center-2' : '';
            quickActionsHTML = `
                <section class="quick-actions-section">
                    <h5 class="section-title-owner">Aksi Cepat</h5>
                    <div id="quick-actions-grid" class="dashboard-actions-grid ${centerClass}">
                        ${all.map(link => createActionItemHTML(link)).join('')}
                    </div>
                </section>`;
        } else {
            quickActionsHTML = `
                <section class="quick-actions-section">
                    <h5 class="section-title-owner">Aksi Cepat</h5>
                    <div id="quick-actions-grid" class="dashboard-actions-grid actions-collapsed">
                        ${mainActions.map(link => createActionItemHTML(link)).join('')}
                        <button class="dashboard-action-item" data-action="toggle-more-actions">
                            <div class="icon-wrapper"><span class="material-symbols-outlined">grid_view</span></div>
                            <span class="label">Lainnya</span>
                        </button>
                        ${extraActions.map(link => createActionItemHTML(link, true)).join('')}
                    </div>
                </section>`;
        }
    }
    // --- Akhir Blok Pembuatan HTML Lengkap ---

    // Merender semua HTML ke dalam container
    container.innerHTML = balanceCardsHTML + quickActionsHTML + projectBudgetHTML + dailyRecapHTML;

    // Animate key numbers on dashboard
    try {
        const values = container.querySelectorAll('.dashboard-balance-card .value');
        if (values[0]) animateNumber(values[0], labaBersih);
        if (values[1]) animateNumber(values[1], totalUnpaid);
    } catch(_) {}

    // Menggambar grafik setelah semua elemen HTML ada di halaman
    _renderSparklineChart('profit-sparkline-chart', trendData.profit, true);
    _renderSparklineChart('bills-sparkline-chart', trendData.bills, false);
    
    // Panggil setActiveListeners
    _setActiveListeners(['incomes', 'expenses', 'bills', 'attendance_records']);
}

async function renderPengaturanPage() {
  const container = $('.page-container');
  const {
      currentUser,
      userRole
  } = appState;
  const photo = currentUser?.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${(currentUser?.displayName||'U')[0]}`;

  const isDark = document.documentElement.classList.contains('dark-theme');

  const ownerActions = [{
      action: 'manage-master',
      type: 'projects',
      icon: 'foundation',
      label: 'Kelola Proyek'
  }, {
      action: 'manage-master',
      type: 'staff',
      icon: 'manage_accounts',
      label: 'Kelola Staf Inti'
  }, {
      action: 'manage-master-global',
      type: null,
      icon: 'database',
      label: 'Master Data Lain'
  }, {
      action: 'manage-users',
      type: null,
      icon: 'group',
      label: 'Manajemen User'
  }, {
      action: 'edit-pdf-settings',
      type: null,
      icon: 'picture_as_pdf',
      label: 'Pengaturan Laporan PDF'
  }, {
      action: 'recalculate-usage',
      type: null,
      icon: 'calculate',
      label: 'Hitung Ulang Penggunaan Material'
  }, {
      action: 'navigate',
      nav: 'log_aktivitas',
      icon: 'history',
      label: 'Log Aktivitas'
  }, {
      action: 'open-conflicts',
      type: null,
      icon: 'report',
      label: 'Konflik Sinkron'
  }, 
  {
    action: 'force-full-sync',
    type: null,
    icon: 'sync_saved_locally',
    label: 'Paksa Sinkronisasi Penuh'
},
  
  {
      action: 'open-storage-stats',
      type: null,
      icon: 'storage',
      label: 'Statistik Storage'
  }, ];

  container.innerHTML = `
          <div class="profile-card-settings">
              <button id="theme-toggle-btn" class="btn-icon theme-toggle-btn" data-action="toggle-theme" title="Ubah Tema">
                  <span class="material-symbols-outlined">${isDark?'dark_mode':'light_mode'}</span>
              </button>
              <img src="${photo}" alt="Avatar" class="profile-avatar">
              <strong class="profile-name">${currentUser?.displayName || 'Pengguna'}</strong>
              <span class="profile-email">${currentUser?.email || ''}</span>
              <div class="profile-role-badge">${userRole}</div>
              <div class="profile-actions">
                  <button class="btn btn-secondary" data-action="auth-action">
                      <span class="material-symbols-outlined">${currentUser?'logout' : 'login'}</span>
                      <span>${currentUser?'Keluar' : 'Masuk'}</span>
                  </button>
              </div>
          </div>
          ${userRole === 'Owner'?`
              <div id="owner-settings">
                  <h5 class="section-title-owner">Administrasi Owner</h5>
                  <div class="settings-list">
                      ${ownerActions.map(act => `
                          <div class="settings-list-item" data-action="${act.action}" ${act.type?`data-type="${act.type}"` : ''} ${act.nav?`data-nav="${act.nav}"` : ''}>
                              <div class="icon-wrapper"><span class="material-symbols-outlined">${act.icon}</span></div>
                              <span class="label">${act.label}</span>
                          </div>
                      `).join('')}
                  </div>
              </div>
          ` : ''}
      `;
      _setActiveListeners([]);
    }

async function renderLogAktivitasPage() {
  const container = $('.page-container');
  container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

  // Ambil log langsung dari server karena ini bukan data krusial untuk offline
  const q = query(logsCol, orderBy("createdAt", "desc"));
  const logSnap = await getDocs(q);
  const logs = logSnap.docs.map(d => ({
      id: d.id,
      ...d.data()
  }));

  if (logs.length === 0) {
  // [IMPROVE-UI/UX]: richer empty state for activity
  container.innerHTML = _getEmptyStateHTML({ icon:'schedule', title:'Belum Ada Aktivitas', desc:'Aktivitas terbaru akan tampil di sini saat tersedia.' });
      return;
  }

  const logHTML = logs.map(log => {
      if (!log.createdAt) return ''; // Lewati log yang tidak punya timestamp
      // [PERBAIKAN] Gunakan _getJSDate
      const date = _getJSDate(log.createdAt);
      const time = date.toLocaleTimeString('id-ID', {
          hour: '2-digit',
          minute: '2-digit'
      });
      const day = date.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
      });
      return `
              <div class="log-item">
                  <div class="log-item-header">
                      <strong class="log-user">${log.userName}</strong>
                      <span class="log-time">${day}, ${time}</span>
                  </div>
                  <p class="log-action">${log.action}</p>
              </div>`;
  }).join('');

  container.innerHTML = `<div class="log-container">${logHTML}</div>`;
  _setActiveListeners([]);
}

// --- SUB-SEKSI 3.2: PEMASUKAN ---
async function renderPemasukanPage() {
    const container = $('.page-container');
    const tabs = [{ id: 'termin', label: 'Termin Proyek' }, { id: 'pinjaman', label: 'Pinjaman & Pendanaan' }];
    container.innerHTML = `
        <div class="sub-nav two-tabs">
            ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
        </div>
        <div id="sub-page-content"></div>
    `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('pemasukan', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        let formHTML = '';
        let listHTML = '<div id="pemasukan-list-container"></div>';
        if (tabId === 'termin') {
            await fetchAndCacheData('projects', projectsCol, 'projectName');
            formHTML = _getFormPemasukanHTML('termin');
        } else if (tabId === 'pinjaman') {
            await fetchAndCacheData('fundingCreditors', collection(db, 'teams', TEAM_ID, 'funding_creditors'), 'creditorName');
            formHTML = _getFormPemasukanHTML('pinjaman');
        }

        contentContainer.innerHTML = (isViewer() ? '' : formHTML) + listHTML;
        if (!isViewer()) {
            const formEl = $('#pemasukan-form');
            if (formEl) {
                formEl.setAttribute('data-draft-key', `pemasukan-${tabId}`);
                // _attachFormDraftPersistence(formEl); // Fungsi ini tampaknya hilang
            }
            _attachPemasukanFormListeners();
        }
        await _rerenderPemasukanList(tabId);
        
        // [PERBAIKAN KUNCI] Panggil fungsi seleksi & swipe di sini
        _initSelectionMode('#pemasukan-list-container', 'pemasukan');
        _attachSwipeHandlers('#pemasukan-list-container');
        
        _setActiveListeners(['incomes', 'funding_sources']);
    };
    
    try {
    onSnapshot(commentsCol, async (snapshot) => {
        if (snapshot.empty) return;
        const changes = snapshot.docChanges();
        if (!changes || changes.length === 0) return;
        for (const change of changes) {
            const data = { ...change.doc.data(), id: change.doc.id };
            // Update local cache
            try {
                if (change.type === 'removed') {
                    await localDB.comments.where('id').equals(data.id).modify({ isDeleted: 1 });
                } else {
                    await localDB.comments.put(data);
                }
            } catch (_) {}
            // Update state
            const idx = (appState.comments || []).findIndex(c => c.id === data.id);
            if (change.type === 'removed') {
                if (idx >= 0) appState.comments.splice(idx, 1);
            } else {
                if (idx >= 0) appState.comments[idx] = data; else appState.comments.push(data);
            }
            // If a detail modal with matching parent is open, update UI
            const modal = document.querySelector('.modal-bg.show #dataDetail-modal, .modal-bg#dataDetail-modal.show, #dataDetail-modal');
            const section = document.querySelector(`.comments-section[data-parent-id="${data.parentId}"][data-parent-type="${data.parentType}"]`);
            if (section) upsertCommentInUI(section, data, change.type);
        }
    }, (err) => console.warn('Snapshot error for comments:', err));
} catch(_) {}

function upsertCommentInUI(a, b, c) {
    try {
        let sectionEl, commentData, changeType;
        if (a && a.nodeType === 1) { sectionEl = a; commentData = b; changeType = c; }
        else { commentData = a; changeType = b; sectionEl = document.querySelector(`.comments-section[data-parent-id="${commentData.parentId}"][data-parent-type="${commentData.parentType}"]`); }
        
        if (!sectionEl) return;
        const list = sectionEl.querySelector('.comments-list');
        if (!list) return;

        const existing = list.querySelector(`.comment-item[data-id="${commentData.id}"]`);
        
        if (changeType === 'removed' || commentData.isDeleted) {
            if (existing) { existing.style.opacity = '0'; setTimeout(() => existing.remove(), 250); }
            return;
        }

        const isCurrentUser = appState.currentUser && appState.currentUser.uid === commentData.userId;
        const when = _getJSDate(commentData.createdAt).toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
        const canDelete = !!appState.currentUser && (isCurrentUser || appState.userRole === 'Owner');
        const safeText = String(commentData.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
        const initials = (commentData.userName || 'U').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();

        const htmlInner = `
            <div class="comment-avatar">${initials}</div>
            <div class="comment-bubble">
                <div class="comment-meta">
                    <strong class="comment-user">${commentData.userName || 'Pengguna'}</strong>
                    ${canDelete ? `<button class="btn-icon btn-icon-danger" data-action="delete-comment" data-id="${commentData.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>` : ''}
                </div>
                <div class="comment-text">${safeText}</div>
                <div class="comment-date">${when}</div>
            </div>
        `;

        if (existing) {
            existing.innerHTML = htmlInner;
            existing.className = `comment-item ${isCurrentUser ? 'is-current-user' : ''}`;
        } else {
            const wrapper = document.createElement('div');
            wrapper.className = `comment-item ${isCurrentUser ? 'is-current-user' : ''}`;
            wrapper.dataset.id = commentData.id;
            wrapper.style.opacity = '0';
            wrapper.innerHTML = htmlInner;
            list.appendChild(wrapper);
            requestAnimationFrame(() => { wrapper.style.opacity = '1'; });
        }
    } catch (e) { console.warn('upsertCommentInUI error', e); }
}

const subNavItems = $$('.sub-nav-item');
subNavItems.forEach((btn, index) => {
    btn.addEventListener('click', (e) => {
        const currentActive = $('.sub-nav-item.active');
        if (currentActive === btn) return;

        const currentIndex = Array.from(subNavItems).indexOf(currentActive);
        const direction = index > currentIndex ? 'forward' : 'backward';

        if(currentActive) currentActive.classList.remove('active');
        btn.classList.add('active');

        _animateTabSwitch(
            $("#sub-page-content"),
            () => renderTabContent(btn.dataset.tab),
            direction
        );
    });
});

const lastSubPage = appState.activeSubPage.get('pemasukan') || tabs[0].id;
$(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
await renderTabContent(lastSubPage);
}

async function _rerenderPemasukanList(type) {
  const listContainer = $('#pemasukan-list-container');
  if (!listContainer) return;
  listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
  const col = type === 'termin'?incomesCol : fundingSourcesCol;
  const key = type === 'termin'?'incomes' : 'fundingSources';
  await fetchAndCacheData(key, col);

  listContainer.innerHTML = _getListPemasukanHTML(type);
  _attachSwipeHandlers('#pemasukan-list-container'); 
}
const createMasterDataSelect = (id, label, options, selectedValue = '', masterType = null) => {
    const selectedOption = options.find(opt => opt.value === selectedValue);
    const selectedText = selectedOption ? selectedOption.text : (options.length > 0 ? options[0].text : 'Pilih...');
    const finalSelectedValue = selectedOption ? selectedValue : (options.length > 0 ? options[0].value : '');

    const showMasterButton = masterType && masterType !== 'projects' && !isViewer();

    return `
        <div class="form-group">
            <label>${label}</label>
            <div class="master-data-select">
                <div class="custom-select-wrapper" data-master-type="${masterType || ''}">
                    <input type="hidden" id="${id}" name="${id}" value="${finalSelectedValue}">
                    <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                        <span>${selectedText}</span>
                        <span class="material-symbols-outlined">arrow_drop_down</span>
                    </button>
                    <div class="custom-select-options">
                        <div class="custom-select-search-wrapper">
                            <span class="material-symbols-outlined">search</span>
                            <input type="search" class="custom-select-search" placeholder="Cari..." autocomplete="off">
                        </div>
                        <div class="custom-select-options-list">
                        ${options.map(opt => `
                            <div class="custom-select-option" data-value="${opt.value}">${opt.text}</div>
                        `).join('')}
                        </div>
                    </div>
                </div>
                ${showMasterButton ? `<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="${masterType}"><span class="material-symbols-outlined">database</span></button>` : ''}
            </div>
        </div>
    `;
};

function _getFormPemasukanHTML(type) {
  let formHTML = '';
  if (type === 'termin') {
      const projectOptions = appState.projects
          .filter(p => p.projectType === 'main_income')
          .map(p => ({
              value: p.id,
              text: p.projectName
          }));
      formHTML = `
              <div class="card card-pad">
                  <form id="pemasukan-form" data-type="termin" data-async="true" method="POST" data-endpoint="/api/incomes" data-success-msg="Pemasukan tersimpan">
                      ${createMasterDataSelect('pemasukan-proyek', 'Proyek Terkait', projectOptions, '', 'projects')}
                      <div class="form-group">
                          <label>Jumlah Termin Diterima</label>
                          <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 50.000.000">
                      </div>
                      <div class="form-group">
                          <label>Tanggal</label>
                          <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                      </div>
                      <div id="fee-allocation-container" style="margin-top: 1.5rem;"></div>
                      <button type="submit" class="btn btn-primary">Simpan Pemasukan</button>
                  </form>
              </div>
          `;
  } else if (type === 'pinjaman') {
      const creditorOptions = appState.fundingCreditors.map(c => ({
          value: c.id,
          text: c.creditorName
      }));
      const loanTypeOptions = [{
          value: 'none',
          text: 'Tanpa Bunga'
      }, {
          value: 'interest',
          text: 'Berbunga'
      }];
      formHTML = `
              <div class="card card-pad">
                  <form id="pemasukan-form" data-type="pinjaman" data-async="true" method="POST" data-endpoint="/api/loans" data-success-msg="Pinjaman tersimpan">
                      <div class="form-group">
                          <label>Jumlah</label>
                          <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 5.000.000">
                      </div>
                      <div class="form-group">
                          <label>Tanggal</label>
                          <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                      </div>
                      ${createMasterDataSelect('pemasukan-kreditur', 'Kreditur', creditorOptions, '', 'creditors')}
                      ${createMasterDataSelect('loan-interest-type', 'Jenis Pinjaman', loanTypeOptions, 'none')}
                      <div class="loan-details hidden">
                          <div class="form-group">
                              <label>Suku Bunga (% per bulan)</label>
                              <input type="number" id="loan-rate" placeholder="mis. 10" step="0.01" min="1">
                          </div>
                          <div class="form-group">
                              <label>Tenor (bulan)</label>
                              <input type="number" id="loan-tenor" placeholder="mis. 3" min="1">
                          </div>
                          <div id="loan-calculation-result" class="loan-calculation-result"></div>
                      </div>
                      <button type="submit" class="btn btn-primary">Simpan</button>
                  </form>
              </div>
          `;
  }
  return formHTML;
}

function _getListPemasukanHTML(type) {
    const list = type === 'termin' ? appState.incomes : appState.fundingSources;
    if (!list || list.length === 0) {
        return _getEmptyStateHTML({
            icon: 'account_balance_wallet',
            title: 'Belum Ada Pemasukan',
            desc: 'Catat pemasukan atau pinjaman untuk mulai melacak arus kas.',
        });
    }

    return `<div id="pemasukan-list-container" class="dense-list-container" style="margin-top: 1rem;">
        ${list.map(item => {
            const isTermin = type === 'termin';
            const title = isTermin
                ? (appState.projects.find(p => p.id === item.projectId)?.projectName || 'Termin Proyek')
                : (appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Pinjaman');
            
            const amount = item.totalAmount || item.amount || 0;
            const date = item.date ? _getJSDate(item.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' }) : 'Tanggal tidak valid';
            const isPaid = item.status === 'paid';

            let swipeActions = '';
            if (!isPaid && !isTermin) {
                swipeActions += `<button class="btn-icon btn-icon-success" data-action="pay-loan" data-id="${item.id}" data-type="pinjaman" title="Bayar"><span class="material-symbols-outlined">payment</span></button>`;
            }
            swipeActions += `<button class="btn-icon" data-action="edit-item" data-id="${item.id}" data-type="${type}" title="Edit"><span class="material-symbols-outlined">edit</span></button>`;
            swipeActions += `<button class="btn-icon btn-icon-danger" data-action="delete-item" data-id="${item.id}" data-type="${type}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`;

            let statusInfo = '';
            if (!isTermin) {
                const paidAmount = item.paidAmount || 0;
                const remainingAmount = (item.totalRepaymentAmount || amount) - paidAmount;
                statusInfo = isPaid
                    ? `<span class="status-badge positive">Lunas</span>`
                    : `<span class="status-badge warn">Sisa: ${fmtIDR(remainingAmount)}</span>`;
            }

            return `
            <div class="dense-list-item card" data-id="${item.id}">
                <div class="selection-checkmark"><span class="material-symbols-outlined">check_circle</span></div>
                <div class="swipe-actions">${swipeActions}</div>
                <div class="item-main-content" data-action="open-detail" data-id="${item.id}" data-type="${type}">                    <strong class="item-title">${title}</strong>
                    <span class="item-subtitle">${date}</span>
                    <div class="item-details">
                        <strong class="item-amount">${fmtIDR(amount)}</strong>
                        ${statusInfo}
                    </div>
                </div>
            </div>`;
        }).join('')}
    </div>`;
}

function _attachSwipeHandlers(containerSelector) {
    const container = document.querySelector(containerSelector);
    if (!container) return;

    if (container._swipeHandlers) {
        container.removeEventListener('touchstart', container._swipeHandlers.start, { passive: true });
        container.removeEventListener('touchmove', container._swipeHandlers.move, { passive: true });
        container.removeEventListener('touchend', container._swipeHandlers.end);
    }
    
    let openCard = null;
    let startX = 0;
    let currentX = 0;
    let isSwiping = false;

    const closeOpenCard = () => {
        if (openCard) {
            openCard.classList.remove('swipe-open');
            const content = openCard.querySelector('.item-main-content');
            if (content) content.style.transform = '';
            openCard = null;
        }
    };

    const onTouchStart = e => {
        if (appState.selectionMode.active) return;
        const item = e.target.closest('.dense-list-item');
        if (!item || !item.querySelector('.swipe-actions')) return;
        if (openCard && openCard !== item) closeOpenCard();
        
        isSwiping = true;
        startX = e.touches[0].clientX;
        currentX = startX;
        item.querySelector('.item-main-content').style.transition = 'none';
    };

    const onTouchMove = e => {
        if (!isSwiping) return;
        currentX = e.touches[0].clientX;
        const dx = currentX - startX;
        const item = e.target.closest('.dense-list-item');
        if (dx < 0) {
            item.querySelector('.item-main-content').style.transform = `translateX(${dx}px)`;
        }
    };

    const onTouchEnd = e => {
        // [PERBAIKAN KUNCI] Cek apakah sentuhan berakhir di atas tombol aksi.
        // Jika ya, jangan lakukan apa-apa dan biarkan listener 'click' yang bekerja.
        if (e.target.closest('.swipe-actions button, .swipe-actions a')) {
            isSwiping = false;
            return; 
        }

        if (!isSwiping) return;
        isSwiping = false;

        const item = e.target.closest('.dense-list-item');
        if (!item) return;

        const content = item.querySelector('.item-main-content');
        if (!content) return;
        
        content.style.transition = '';
        const actionsWidth = item.querySelector('.swipe-actions').offsetWidth;
        const dx = e.changedTouches[0].clientX - startX;

        if (dx < -(actionsWidth * 0.4)) {
            openCard = item;
            item.classList.add('swipe-open');
            content.style.transform = `translateX(-${actionsWidth}px)`;
        } else {
            if (openCard === item) openCard = null;
            item.classList.remove('swipe-open');
            content.style.transform = '';
        }
    };

    container._swipeHandlers = { start: onTouchStart, move: onTouchMove, end: onTouchEnd };
    container.addEventListener('touchstart', onTouchStart, { passive: true });
    container.addEventListener('touchmove', onTouchMove, { passive: true });
    container.addEventListener('touchend', onTouchEnd);

    if (!window.globalSwipeCloseListener) {
        document.body.addEventListener('click', (e) => {
            if (openCard && !e.target.closest('.dense-list-item.swipe-open')) {
                closeOpenCard();
            }
        }, true);
        window.globalSwipeCloseListener = true;
    }
}

function _createDetailContentHTML(item, type) {
  const details = [];
  const formatDate = (date) => date?_getJSDate(date).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric'
  }) : 'N/A';

  if (type === 'termin') {
      const projectName = appState.projects.find(p => p.id === item.projectId)?.projectName || 'Tidak ditemukan';
      details.push({
          label: 'Proyek',
          value: projectName
      });
      details.push({
          label: 'Jumlah',
          value: fmtIDR(item.amount)
      });
      details.push({
          label: 'Tanggal Pemasukan',
          value: formatDate(item.date)
      });
  } else { // type === 'pinjaman'
      const creditorName = appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Tidak ditemukan';
      const totalPayable = item.totalRepaymentAmount || item.totalAmount;
      details.push({
          label: 'Kreditur',
          value: creditorName
      });
      details.push({
          label: 'Jumlah Pinjaman',
          value: fmtIDR(item.totalAmount)
      });
      details.push({
          label: 'Tanggal Pinjaman',
          value: formatDate(item.date)
      });
      details.push({
          label: 'Jenis Pinjaman',
          value: item.interestType === 'interest'?'Berbunga' : 'Tanpa Bunga'
      });
      if (item.interestType === 'interest') {
          details.push({
              label: 'Suku Bunga',
              value: `${item.rate || 0}% per bulan`
          });
          details.push({
              label: 'Tenor',
              value: `${item.tenor || 0} bulan`
          });
          details.push({
              label: 'Total Tagihan',
              value: fmtIDR(item.totalRepaymentAmount)
          });
      }
      details.push({
          label: 'Sudah Dibayar',
          value: fmtIDR(item.paidAmount || 0)
      });
      details.push({
          label: 'Sisa Tagihan',
          value: fmtIDR(totalPayable - (item.paidAmount || 0))
      });
      details.push({
          label: 'Status',
          value: item.status === 'paid'?'Lunas' : 'Belum Lunas'
      });
  }

  return `
          <dl class="detail-list">
              ${details.map(d => `
                  <div>
                      <dt>${d.label}</dt>
                      <dd>${d.value}</dd>
                  </div>
              `).join('')}
          </dl>
      `;
}

function _initAutocomplete(context = document) {
  const wrappers = $$('.autocomplete-wrapper', context);

  wrappers.forEach(wrapper => {
      const input = $('input.autocomplete-input', wrapper);
      const idInput = $('input.autocomplete-id', wrapper);
      const suggestionsContainer = $('.autocomplete-suggestions', wrapper);
      const clearBtn = $('.autocomplete-clear-btn', wrapper);
      if (wrapper.dataset.initialized) return;
      wrapper.dataset.initialized = 'true';

      input.addEventListener('input', async () => {
          const searchTerm = input.value.toLowerCase();
          idInput.value = '';
          input.readOnly = false;
          if (searchTerm.length < 1) { // Tampilkan saran bahkan dari 1 huruf
              suggestionsContainer.innerHTML = '';
              suggestionsContainer.classList.remove('active');
              return;
          }
          if (!appState.materials || appState.materials.length === 0) {
              await fetchAndCacheData('materials', collection(db, 'teams', TEAM_ID, 'materials'), 'materialName');
          }
          const filteredMaterials = appState.materials.filter(m =>
              m.materialName.toLowerCase().includes(searchTerm)
          );

          if (filteredMaterials.length > 0) {
              suggestionsContainer.innerHTML = filteredMaterials.map(m => {
                  const highlightedName = m.materialName.replace(
                      new RegExp(searchTerm, 'gi'),
                      (match) => `<span class="match-highlight">${match}</span>`
                  );
                  return `
                      <div class="suggestion-item" data-id="${m.id}" data-name="${m.materialName}">
                          <strong class="suggestion-name">${highlightedName}</strong>
                          <span class="unit-badge">${m.unit || 'N/A'}</span>
                      </div>
                  `;
              }).join('');
              suggestionsContainer.classList.add('active');
          } else {
              suggestionsContainer.classList.remove('active');
          }
      });

      suggestionsContainer.addEventListener('click', (e) => {
          const selectedItem = e.target.closest('.suggestion-item');
          if (selectedItem) {
              const materialId = selectedItem.dataset.id;
              const materialName = selectedItem.dataset.name;
              input.value = selectedItem.dataset.name;
              idInput.value = selectedItem.dataset.id;
              input.readOnly = true;
              suggestionsContainer.classList.remove('active');
              if (clearBtn) clearBtn.style.display = 'flex';
              // Update unit text on the same row if exists
              const row = wrapper.closest('.invoice-item-row');
              if (row) {
                  const unitSpan = row.querySelector('.item-unit');
                  if (unitSpan) {
                      const mat = appState.materials.find(m => m.id === materialId);
                      unitSpan.textContent = mat?.unit || '';
                  }
              }
          }
      });

      if (clearBtn) {
          clearBtn.addEventListener('click', () => {
              input.value = ''; // 1. Kosongkan input nama
              idInput.value = ''; // 2. Kosongkan input ID
              input.readOnly = false; // 3. Buka kunci input
              clearBtn.style.display = 'none'; // 4. Sembunyikan tombol hapus
              input.focus();
              // 5. Fokuskan kembali ke input
              // 6. Kosongkan satuan pada baris jika ada
              const row = wrapper.closest('.invoice-item-row');
              const unitSpan = row?.querySelector('.item-unit');
              if (unitSpan) unitSpan.textContent = '';
          });
      }
  });

  document.addEventListener('click', (e) => {
      if (!e.target.closest('.autocomplete-wrapper')) {
          $$('.autocomplete-suggestions.active').forEach(s => s.classList.remove('active'));
      }
  });
}

function _updateLoanCalculation() {
  const resultEl = $('#loan-calculation-result');
  if (!resultEl) return;

  const amount = parseFormattedNumber($('#pemasukan-jumlah')?.value || '0');
  const rate = Number($('#loan-rate')?.value || '0');
  const tenor = Number($('#loan-tenor')?.value || '0');

  if (amount > 0 && rate > 0 && tenor > 0) {
      const totalInterest = amount * (rate / 100) * tenor;
      const totalRepayment = amount + totalInterest;

      resultEl.innerHTML = `
              <span class="label">Total Tagihan Pinjaman</span>
              <span class="amount">${fmtIDR(totalRepayment)}</span>
          `;
      resultEl.style.display = 'block';
  } else {
      resultEl.style.display = 'none';
  }
}

function _formatNumberInput(e) {
  const input = e.target;
  let selectionStart = input.selectionStart;
  const originalLength = input.value.length;
  const rawValue = parseFormattedNumber(input.value);

  if (isNaN(rawValue)) {
      input.value = '';
      return;
  }

  const formattedValue = new Intl.NumberFormat('id-ID').format(rawValue);

  if (input.value !== formattedValue) {
      input.value = formattedValue;
      const newLength = formattedValue.length;
      const diff = newLength - originalLength;
      if (selectionStart !== null) {
          input.setSelectionRange(selectionStart + diff, selectionStart + diff);
      }
  }
}

// GANTI FUNGSI LAMA _initCustomSelects DENGAN INI
function _initCustomSelects(context = document) {
    const closeAllSelects = (exceptThisOne) => {
        $$('.custom-select-wrapper.active').forEach(wrapper => {
            if (wrapper !== exceptThisOne) {
                wrapper.classList.remove('active');
            }
        });
    };

    document.addEventListener('click', () => closeAllSelects(null));

    context.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
        const trigger = wrapper.querySelector('.custom-select-trigger');
        const optionsList = wrapper.querySelector('.custom-select-options-list');
        const hiddenInput = wrapper.querySelector('input[type="hidden"]');
        const triggerSpan = trigger.querySelector('span:first-child');
        const searchInput = wrapper.querySelector('.custom-select-search'); // Ini bisa jadi null

        wrapper.addEventListener('click', e => e.stopPropagation());

        trigger.addEventListener('click', () => {
            const isActive = wrapper.classList.contains('active');
            closeAllSelects(null);
            if (!isActive) {
                wrapper.classList.add('active');
                
                // [PERBAIKAN #1] Cek apakah searchInput ada sebelum memanggil .focus()
                if (searchInput) {
                    searchInput.focus();
                    searchInput.value = '';
                    optionsList.querySelectorAll('.custom-select-option').forEach(opt => opt.style.display = '');
                }
            }
        });

        if(optionsList) { // Pastikan optionsList ada sebelum menambah listener
            optionsList.addEventListener('click', e => {
                const option = e.target.closest('.custom-select-option');
                if (option) {
                    hiddenInput.value = option.dataset.value;
                    triggerSpan.textContent = option.textContent;
                    closeAllSelects(null);
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        }

        // [PERBAIKAN #2] Cek apakah searchInput ada sebelum menambah listener
        if (searchInput) {
            searchInput.addEventListener('input', () => {
                const searchTerm = searchInput.value.toLowerCase();
                optionsList.querySelectorAll('.custom-select-option').forEach(option => {
                    const optionText = option.textContent.toLowerCase();
                    option.style.display = optionText.includes(searchTerm) ? '' : 'none';
                });
            });
        }
    });
}

function _attachPemasukanFormListeners() {
  $('#pemasukan-form')?.addEventListener('submit', handleAddPemasukan);
  _initCustomSelects();

  $('#loan-interest-type')?.addEventListener('change', () => {
      $('.loan-details')?.classList.toggle('hidden', $('#loan-interest-type').value === 'none');
  });

  const amountInput = $('#pemasukan-jumlah');
  const rateInput = $('#loan-rate');
  const tenorInput = $('#loan-tenor');

  if (amountInput) {
      amountInput.addEventListener('input', _formatNumberInput);
      amountInput.addEventListener('input', () => {
          const formType = $('#pemasukan-form').dataset.type;
          if (formType === 'termin') _calculateAndDisplayFees();
          else _updateLoanCalculation();
      });
  }
  rateInput?.addEventListener('input', _updateLoanCalculation);
  tenorInput?.addEventListener('input', _updateLoanCalculation);
}


async function _calculateAndDisplayFees() {
  const container = $('#fee-allocation-container');
  const amount = parseFormattedNumber($('#pemasukan-jumlah').value);
  if (!container || amount <= 0) {
      if (container) container.innerHTML = '';
      return;
  }

  await fetchAndCacheData('staff', collection(db, 'teams', TEAM_ID, 'staff'), 'staffName');
  const allStaff = appState.staff || [];
  const relevantStaff = allStaff.filter(s => s.paymentType === 'per_termin' || s.paymentType === 'fixed_per_termin');
  if (relevantStaff.length === 0) return;

  let totalFee = 0;
  const allocationHTML = relevantStaff.map(staff => {
      let feeAmount = 0;
      const isFixed = staff.paymentType === 'fixed_per_termin';

      if (isFixed) {
          feeAmount = staff.feeAmount || 0;
      } else { // per_termin
          feeAmount = amount * ((staff.feePercentage || 0) / 100);
      }

      return `
              <div class="detail-list-item">
                  ${isFixed?`<label class="custom-checkbox-label"><input type="checkbox" class="fee-alloc-checkbox" data-amount="${feeAmount}" data-staff-id="${staff.id}" checked><span class="custom-checkbox-visual"></span></label>` : '<div style="width: 20px;"></div>'}
                  <div class="item-main">
                      <span class="item-date">${staff.staffName} ${isFixed?'' : `(${staff.feePercentage}%)`}</span>
                      <span class="item-project">${isFixed?'Fee Tetap' : 'Fee Persentase'}</span>
                  </div>
                  <div class="item-secondary">
                      <strong class="item-amount positive">${fmtIDR(feeAmount)}</strong>
                  </div>
              </div>
          `;
  }).join('');

  container.innerHTML = `
          <h5 class="invoice-section-title">Alokasi Fee Tim</h5>
          <div class="detail-list-container">${allocationHTML}</div>
          <div class="invoice-total">
              <span>Total Alokasi Fee:</span>
              <strong id="total-fee-amount">${fmtIDR(totalFee)}</strong>
          </div>
      `;

  const updateTotalFee = () => {
      let currentTotal = allStaff.filter(s => s.paymentType === 'per_termin').reduce((sum, s) => sum + (amount * ((s.feePercentage || 0) / 100)), 0);
      $$('.fee-alloc-checkbox:checked').forEach(cb => {
          currentTotal += Number(cb.dataset.amount);
      });
      $('#total-fee-amount').textContent = fmtIDR(currentTotal);
  };

  $$('.fee-alloc-checkbox').forEach(cb => cb.addEventListener('change', updateTotalFee));
  updateTotalFee();
}

async function handleAddPemasukan(e) {
  e.preventDefault();
  const form = e.target;
  const type = form.dataset.type;
  const amount = parseFormattedNumber($('#pemasukan-jumlah', form).value);
  const dateInput = $('#pemasukan-tanggal', form).value;
  const date = new Date(dateInput);

  toast('syncing', 'Menyimpan data lokal...');
  try {
      if (type === 'termin') {
          const projectId = $('#pemasukan-proyek', form).value;
          if (!projectId) {
              toast('error', 'Silakan pilih proyek terkait.');
              return;
          }

          const incomeData = {
              amount,
              date,
              projectId,
              createdAt: serverTimestamp(), // Firestore akan mengganti ini saat sinkron
              needsSync: 1
          };

          await localDB.transaction('rw', localDB.incomes, localDB.bills, async () => {
              // 1. Simpan Pemasukan ke localDB
              if (!incomeData.id) incomeData.id = generateUUID();
              const newLocalIncomeId = await localDB.incomes.add(incomeData);
              // 2. Siapkan data tagihan fee
              const billsToAdd = [];
              // Fee Persentase
              appState.staff.filter(s => s.paymentType === 'per_termin').forEach(staff => {
                  const feeAmount = amount * ((staff.feePercentage || 0) / 100);
                  if (feeAmount > 0) {
                      billsToAdd.push({
                          description: `Fee ${staff.staffName} (${staff.feePercentage}%)`,
                          amount: feeAmount,
                          dueDate: date,
                          status: 'unpaid',
                          type: 'fee',
                          staffId: staff.id,
                          projectId: projectId,
                          incomeLocalId: newLocalIncomeId,
                          incomeId: incomeData.id,
                          createdAt: serverTimestamp(),
                          needsSync: 1,
                          paidAmount: 0
                      });
                  }
              });
              // Fee Tetap
              $$('.fee-alloc-checkbox:checked', form).forEach(cb => {
                  const staffId = cb.dataset.staffId;
                  const feeAmount = Number(cb.dataset.amount);
                  const staff = appState.staff.find(s => s.id === staffId);
                  if (staff && feeAmount > 0) {
                      billsToAdd.push({
                          description: `Fee Tetap ${staff.staffName}`,
                          amount: feeAmount,
                          dueDate: date,
                          status: 'unpaid',
                          type: 'fee',
                          staffId: staff.id,
                          projectId: projectId,
                          incomeLocalId: newLocalIncomeId,
                          incomeId: incomeData.id,
                          createdAt: serverTimestamp(),
                          needsSync: 1,
                          paidAmount: 0
                      });
                  }
              });
              // 3. Simpan semua tagihan fee ke localDB
              if (billsToAdd.length > 0) {
                  await localDB.bills.bulkAdd(billsToAdd);
              }
          });
          _logActivity(`Menambah Pemasukan Termin (Lokal): ${fmtIDR(amount)}`, {
              amount
          });
      } else if (type === 'pinjaman') {
          const creditorId = $('#pemasukan-kreditur', form).value;
          if (!creditorId) {
              toast('error', 'Silakan pilih kreditur.');
              return;
          }
          const interestType = $('#loan-interest-type', form).value;

          let loanData = {
              creditorId,
              totalAmount: amount,
              date,
              interestType,
              status: 'unpaid',
              paidAmount: 0,
              createdAt: serverTimestamp(),
              needsSync: 1
          };
          if (interestType === 'interest') {
              const rate = Number($('#loan-rate', form).value);
              const tenor = Number($('#loan-tenor', form).value);
              if (rate < 1 || tenor < 1) {
                  toast('error', 'Bunga dan Tenor minimal harus 1.');
                  return;
              }
              loanData.rate = rate;
              loanData.tenor = tenor;
              loanData.totalRepaymentAmount = amount * (1 + (rate / 100 * tenor));
          }

          if (!loanData.id) loanData.id = generateUUID();
          if (!loanData.id) loanData.id = generateUUID();
          await localDB.funding_sources.add(loanData);
          _logActivity(`Menambah Pinjaman (Lokal): ${fmtIDR(amount)}`, {
              creditorId,
              amount
          });
      }
      toast('success', 'Data berhasil disimpan di perangkat!');
      form.reset();
      _clearFormDraft(form);
      $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');

      await loadAllLocalDataToState(); // Muat ulang state dari localDB
      _rerenderPemasukanList(type); // Render ulang list
      syncToServer(); // Coba sinkronisasi
  } catch (error) {
      toast('error', 'Gagal menyimpan data.');
      console.error(error);
  }
}

// --- SUB-SEKSI 3.3: PENGELUARAN & STOK ---
// GANTI SELURUH FUNGSI INI

async function renderPengeluaranPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'operasional',
        label: 'Operasional'
    }, {
        id: 'material',
        label: 'Material'
    }, {
        id: 'lainnya',
        label: 'Lainnya'
    }];
    container.innerHTML = `
            <div class="sub-nav three-tabs">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('pengeluaran', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        await loadAllLocalDataToState();

        let formHTML;
        if (tabId === 'material') {
            formHTML = _getFormFakturMaterialHTML();
        } else {
            let categoryOptions = [],
                categoryMasterType = '',
                categoryLabel = '',
                categoryType = '';
            if (tabId === 'operasional') {
                categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                categoryMasterType = 'op-cats';
                categoryLabel = 'Kategori Operasional';
                categoryType = 'Operasional';
            } else if (tabId === 'lainnya') {
                categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                categoryMasterType = 'other-cats';
                categoryLabel = 'Kategori Lainnya';
                categoryType = 'Lainnya';
            }
            const supplierOptions = appState.suppliers.filter(s => s.category === categoryType).map(s => ({ value: s.id, text: s.supplierName }));
            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
            formHTML = _getFormPengeluaranHTML(tabId, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions);
        }

        contentContainer.innerHTML = isViewer()? _getEmptyStateHTML({ icon:'lock', title:'Akses Terbatas', desc:'Halaman ini khusus untuk input data.' }) : formHTML;

        if (!isViewer()) {
            const formEl = $('#pengeluaran-form') || $('#material-invoice-form');
            if (formEl) {
                formEl.setAttribute('data-draft-key', `pengeluaran-${tabId}`);
                _attachFormDraftPersistence(formEl);
            }
            _attachPengeluaranFormListeners(tabId);
        }
    };

    // [PERUBAHAN] Menerapkan event listener animasi
    const subNavItems = $$('.sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('.sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderTabContent(btn.dataset.tab),
                direction
            );
        });
    });

    const lastSubPage = appState.activeSubPage.get('pengeluaran') || tabs[0].id;
    const initialTab = $(`.sub-nav-item[data-tab="${lastSubPage}"]`);
    if (initialTab) {
        $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
        initialTab.classList.add('active');
    }
    await renderTabContent(lastSubPage);
    _setActiveListeners(['expenses', 'bills', 'comments']);
}

function _getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions) {
    return `
    <div class="card card-pad">
        <form id="pengeluaran-form" data-type="${type}" data-async="true" method="POST" data-endpoint="/api/expenses" data-success-msg="Pengeluaran tersimpan">
            ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, '', 'projects')}
            ${categoryOptions.length > 0?createMasterDataSelect('expense-category', categoryLabel, categoryOptions, '', categoryMasterType) : ''}
            <div class="form-group">
                <label>Jumlah</label>
                <input type="text" id="pengeluaran-jumlah" name="pengeluaran-jumlah" inputmode="numeric" required placeholder="mis. 50.000">
            </div>
            <div class="form-group">
                <label>Deskripsi</label>
                <input type="text" id="pengeluaran-deskripsi" name="pengeluaran-deskripsi" required placeholder="mis. Beli ATK">
            </div>
            ${createMasterDataSelect('expense-supplier', 'Supplier/Penerima', supplierOptions, '', 'suppliers')}
            <div class="form-group">
                <label>Tanggal</label>
                <input type="date" id="pengeluaran-tanggal" name="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
                        <h5 class="invoice-section-title" style="margin-top:1.5rem;">Lampiran (Opsional)</h5>
            <div class="form-group">
                <input type="file" name="attachmentFileCamera" accept="image/*" capture="environment" class="hidden-file-input" data-target-display="attachmentFile-display">
                <input type="file" name="attachmentFileGallery" accept="image/*" class="hidden-file-input" data-target-display="attachmentFile-display">
                <div class="upload-buttons">
                    <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileCamera"><span class="material-symbols-outlined">photo_camera</span> Kamera</button>
                    <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileGallery"><span class="material-symbols-outlined">image</span> Galeri</button>
                </div>
                <div class="file-name-display" id="attachmentFile-display">Belum ada file dipilih</div>
            </div>
            <div class="form-group">
                <label>Status Pembayaran</label>
                <div class="sort-direction">
                    <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                    <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
                </div>
                <input type="hidden" name="status" value="unpaid">
            </div>
            <button type="submit" class="btn btn-primary">Simpan Pengeluaran</button>
        </form>
    </div>
    `;
}

function _getFormFakturMaterialHTML() {
    const supplierOptions = appState.suppliers
        .filter(s => s.category === 'Material')
        .map(s => ({
            value: s.id,
            text: s.supplierName
        }));
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    return `
        <div class="card card-pad">
            <form id="material-invoice-form" data-type="material" data-async="true" method="POST" data-endpoint="/api/invoices/material" data-success-msg="Faktur material tersimpan">
                <div class="form-group">
                    <label>Jenis Input</label>
                    <div class="sort-direction" id="form-type-selector">
                        <button type="button" class="form-type-btn active" data-type="faktur">Faktur Lengkap</button>
                        <button type="button" class="form-type-btn" data-type="surat_jalan">Surat Jalan</button>
                    </div>
                    <input type="hidden" name="formType" value="faktur">
                </div>
                ${createMasterDataSelect('project-id', 'Proyek', projectOptions, '', 'projects')}
                <div class="form-group">
                    <label>No. Faktur/Surat Jalan</label>
                    <input type="text" id="pengeluaran-deskripsi" name="pengeluaran-deskripsi" readonly class="readonly-input">
                </div>
                ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, '', 'suppliers')}
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" id="pengeluaran-tanggal" name="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                <div class="section-header-flex" style="display:flex;justify-content:space-between;align-items:center;gap:.5rem;">
                    <h5 class="invoice-section-title" style="margin:0;">Rincian Barang</h5>
                </div>
                <div id="invoice-items-container"></div>
                <div class="add-item-action">
                    <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang"><span class="material-symbols-outlined">add_circle</span></button>
                </div>
                                <div class="invoice-total" id="total-faktur-wrapper">
                    <span>Total Faktur:</span>
                    <strong id="invoice-total-amount">Rp 0</strong>
                </div>
                <div id="payment-status-wrapper" class="form-group">
                    <label>Status Pembayaran</label>
                    <div class="sort-direction">
                        <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                        <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
                    </div>
                    <input type="hidden" name="status" value="unpaid">
                </div>
                <h5 class="invoice-section-title">Lampiran (Opsional)</h5>
                <div class="form-group">
                    <label id="attachment-label">Upload Bukti Faktur</label>
                    <input type="file" name="attachmentFileCamera" accept="image/*" capture="environment" class="hidden-file-input" data-target-display="attachmentFile-display">
                    <input type="file" name="attachmentFileGallery" accept="image/*" class="hidden-file-input" data-target-display="attachmentFile-display">
                    <div class="upload-buttons">
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileCamera"><span class="material-symbols-outlined">photo_camera</span> Kamera</button>
                        <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="attachmentFileGallery"><span class="material-symbols-outlined">image</span> Galeri</button>
                    </div>
                    <div class="file-name-display" id="attachmentFile-display">Belum ada file dipilih</div>
                </div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        </div>
        `;
}

function _attachPengeluaranFormListeners(type) {
    _initCustomSelects();
    const form = (type === 'material')?$('#material-invoice-form') : $('#pengeluaran-form');
    if (!form) return;

    form.querySelectorAll('.btn-status-payment').forEach(btn => {
        btn.addEventListener('click', () => {
            form.querySelectorAll('.btn-status-payment').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            if (form.querySelector('input[name="status"]')) {
                form.querySelector('input[name="status"]').value = btn.dataset.status;
            }
        });
    });

    if (type === 'material') {
        _initAutocomplete(form);

        $('#add-invoice-item-btn', form)?.addEventListener('click', () => {
            _addInvoiceItemRow(form);
            _initAutocomplete(form);
        });

        $('#invoice-items-container', form)?.addEventListener('input', (e) => _handleInvoiceItemChange(e, form));

        const invoiceNumberInput = $('#pengeluaran-deskripsi', form);
        if (invoiceNumberInput) {
            invoiceNumberInput.value = _generateInvoiceNumber();
        }

        if ($$('#invoice-items-container .invoice-item-row', form).length === 0) {
            _addInvoiceItemRow(form);
            _initAutocomplete(form);
        }

        // Toggle Faktur vs Surat Jalan
        const typeSelector = $('#form-type-selector', form);
        if (typeSelector) {
            typeSelector.querySelectorAll('.form-type-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    typeSelector.querySelectorAll('.form-type-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    const mode = btn.dataset.type;
                    const hidden = form.querySelector('input[name="formType"]');
                    if (hidden) hidden.value = mode;
                    _switchMaterialFormMode(form, mode);
                });
            });
        }

        // (Dipindah) Tombol tambah master material sekarang ada di samping input satuan tiap baris.
    } else {
        $('#pengeluaran-jumlah', form)?.addEventListener('input', _formatNumberInput);
        // [IMPROVE-UI/UX]: attach client-side validation on blur
        _attachClientValidation(form);
    }

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        handleAddPengeluaran(e, type);
    });
}

function _switchMaterialFormMode(form, mode) {
    const totalWrapper = $('#total-faktur-wrapper', form);
    const paymentWrapper = $('#payment-status-wrapper', form);
    const itemsContainer = $('#invoice-items-container', form);
    const attachmentLabel = $('#attachment-label', form);

    // 1. Tampilkan atau sembunyikan bagian Total dan Status Pembayaran
    const isSuratJalan = mode === 'surat_jalan';
    if (totalWrapper) totalWrapper.classList.toggle('hidden', isSuratJalan);
    if (paymentWrapper) paymentWrapper.classList.toggle('hidden', isSuratJalan);

    // 2. Ubah label untuk upload lampiran
    if (attachmentLabel) {
        attachmentLabel.textContent = isSuratJalan ? 'Upload Bukti Surat Jalan' : 'Upload Bukti Faktur';
    }

    // 3. Simpan data item yang ada, lalu bangun ulang barisnya sesuai mode baru
    const existingItems = [];
    $$('.invoice-item-row', form).forEach(row => {
        existingItems.push({
            name: row.querySelector('input[name="itemName"]')?.value || '',
            id: row.querySelector('input[name="materialId"]')?.value || '',
            qty: row.querySelector('input[name="itemQty"]')?.value || '1',
            price: row.querySelector('input[name="itemPrice"]')?.value || ''
        });
    });

    // Kosongkan container dan buat ulang baris item
    itemsContainer.innerHTML = '';
    existingItems.forEach(itemData => {
        _addInvoiceItemRow(form); // Fungsi ini sudah pintar, ia akan membuat baris sesuai mode yang aktif
        const newRow = itemsContainer.lastElementChild;
        if (newRow) {
            // Isi kembali data yang sudah diinput sebelumnya
            const nameInput = newRow.querySelector('input[name="itemName"]');
            const idInput = newRow.querySelector('input[name="materialId"]');
            const qtyInput = newRow.querySelector('input[name="itemQty"]');
            const priceInput = newRow.querySelector('input[name="itemPrice"]');

            if (nameInput) nameInput.value = itemData.name;
            if (idInput) idInput.value = itemData.id;
            if (qtyInput) qtyInput.value = itemData.qty;
            if (priceInput) priceInput.value = itemData.price;
            
            // Jika material sudah dipilih, buat input nama menjadi readonly
            if(itemData.id) {
                if (nameInput) nameInput.readOnly = true;
                const clearBtn = newRow.querySelector('.autocomplete-clear-btn');
                if(clearBtn) clearBtn.style.display = 'flex';
            }
        }
    });

    // 4. Inisialisasi ulang semua fitur interaktif
    _initAutocomplete(form); // Penting untuk mengaktifkan kembali autocomplete pada baris baru
    _updateInvoiceTotal(form); // Hitung ulang total
}

async function handleAddPengeluaran(e, type) {
    e.preventDefault();
    const form = e.target;

    toast('syncing', 'Memvalidasi dan menyimpan data di perangkat...');

    try {
        // --- Langkah 1: Kumpulkan data umum dari form ---
        const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;
        if (!projectId) {
            toast('error', 'Proyek harus dipilih.');
            return;
        }

        const status = form.querySelector('input[name="status"]').value || 'unpaid';
        const date = new Date(form.elements['pengeluaran-tanggal'].value); // Gunakan new Date()
        const attachmentFile = form.elements.attachmentFileCamera?.files[0] || form.elements.attachmentFileGallery?.files[0];

        let expenseDetails = {};
        let itemsToUpdateStock = [];

        // --- Langkah 2: Kumpulkan data spesifik berdasarkan tipe pengeluaran ---
        if (type === 'material') {
            const formMode = form.elements['formType']?.value || 'faktur';
            const items = [];
            if (formMode === 'surat_jalan') {
                $$('.invoice-item-row', form).forEach(row => {
                    const materialId = row.querySelector('input[name="materialId"]').value || null;
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    if (materialId && qty > 0) {
                        const mat = appState.materials.find(m => m.id === materialId);
                        items.push({ name: mat?.materialName || '', price: 0, qty, total: 0, materialId });
                        itemsToUpdateStock.push({ materialId, qty, price: 0 });
                    }
                });
                if (items.length === 0) { toast('error', 'Harap tambahkan minimal satu barang.'); return; }
                expenseDetails = {
                    amount: 0,
                    description: form.elements['pengeluaran-deskripsi'].value.trim() || 'Surat Jalan',
                    supplierId: form.elements['supplier-id'].value,
                    items
                };
            } else {
                $$('.invoice-item-row', form).forEach(row => {
                    const name = row.querySelector('input[name="itemName"]').value;
                    const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                    const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
                    const materialId = row.querySelector('input[name="materialId"]').value || null;
                    if (name && price > 0 && qty > 0) {
                        items.push({ name, price, qty, total: price * qty, materialId });
                        if (materialId) itemsToUpdateStock.push({ materialId, qty, price });
                    }
                });
                if (items.length === 0) { toast('error', 'Harap tambahkan minimal satu barang.'); return; }
                expenseDetails = {
                    amount: items.reduce((sum, item) => sum + item.total, 0),
                    description: form.elements['pengeluaran-deskripsi'].value.trim() || `Faktur ${items[0].name}`,
                    supplierId: form.elements['supplier-id'].value,
                    items
                };
            }
        } else { // Untuk 'operasional' dan 'lainnya'
            expenseDetails = {
                amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value),
                description: form.elements['pengeluaran-deskripsi'].value.trim(),
                supplierId: form.elements['expense-supplier'].value,
                categoryId: form.elements['expense-category']?.value || '',
            };
        }

        const requiresAmount = !(type === 'material' && (form.elements['formType']?.value || 'faktur') === 'surat_jalan');
        if ((requiresAmount && !expenseDetails.amount) || !expenseDetails.description) {
            toast('error', requiresAmount ? 'Harap isi deskripsi dan jumlah.' : 'Harap isi deskripsi.');
            return;
        }

        // --- Langkah 3: Siapkan objek data final untuk disimpan ---
        const expenseToStore = {
            ...expenseDetails,
            type,
            projectId,
            status,
            formType: (type === 'material') ? (form.elements['formType']?.value || 'faktur') : undefined,
            date,
            createdAt: new Date(), // [PERBAIKAN] Gunakan new Date() untuk waktu lokal
            needsSync: 1,
            isDeleted: 0,
            attachmentUrl: '',
            attachmentNeedsSync: !!attachmentFile,
            localAttachmentId: null
        };

        if (attachmentFile) {
            const compressed = await _compressImage(attachmentFile, 0.85, 1280);
            const blob = compressed || attachmentFile;
            const fileId = `file_${Date.now()}_${attachmentFile.name}`;
            await localDB.files.put({
                id: fileId,
                file: blob,
                addedAt: new Date(),
                size: blob.size || 0
            });
            expenseToStore.localAttachmentId = fileId;
            await _enforceLocalFileStorageLimit();
        }

        // --- Langkah 4: Simpan ke database lokal dalam satu transaksi ---
        await localDB.transaction('rw', localDB.expenses, localDB.bills, localDB.stock_transactions, localDB.materials, async () => {
            if (!expenseToStore.id) expenseToStore.id = generateUUID();
            if (type === 'material' && expenseToStore.formType === 'surat_jalan') {
                expenseToStore.status = 'delivery_order';
            }
            await localDB.expenses.add(expenseToStore);

            if (!(type === 'material' && expenseToStore.status === 'delivery_order')) {
                const billData = {
                    id: generateUUID(),
                    expenseId: expenseToStore.id,
                    description: expenseDetails.description,
                    amount: expenseDetails.amount,
                    dueDate: date,
                    status: status,
                    type: type,
                    projectId: projectId,
                    createdAt: new Date(),
                    paidAmount: status === 'paid'?expenseDetails.amount : 0,
                    ...(status === 'paid' && { paidAt: new Date() }),
                    needsSync: 1,
                    isDeleted: 0
                };
                await localDB.bills.add(billData);
            }

            if (type === 'material' && expenseToStore.status !== 'delivery_order' && status === 'paid' && itemsToUpdateStock.length > 0) {
                for (const item of itemsToUpdateStock) {
                    await localDB.materials.where('id').equals(item.materialId).modify(m => {
                        m.currentStock = (m.currentStock || 0) + item.qty;
                        m.lastPrice = item.price;
                    });
                    await localDB.stock_transactions.add({
                        id: generateUUID(),
                        materialId: item.materialId,
                        quantity: item.qty,
                        date: date,
                        type: 'in',
                        pricePerUnit: item.price,
                        createdAt: new Date(), // [PERBAIKAN] Gunakan new Date()
                        needsSync: 1,
                        isDeleted: 0
                    });
                }
            } else if (type === 'material' && expenseToStore.status === 'delivery_order' && itemsToUpdateStock.length > 0) {
                for (const item of itemsToUpdateStock) {
                    await localDB.materials.where('id').equals(item.materialId).modify(m => {
                        m.currentStock = (m.currentStock || 0) - item.qty;
                    });
                    await localDB.stock_transactions.add({
                        id: generateUUID(),
                        materialId: item.materialId,
                        quantity: item.qty,
                        date: date,
                        type: 'out',
                        projectId: projectId,
                        expenseId: expenseToStore.id,
                        createdAt: new Date(),
                        needsSync: 1,
                        isDeleted: 0
                    });
                }
            }
        });

        // --- Langkah 5: Beri feedback dan picu sinkronisasi ---
        _logActivity(`Menambah Pengeluaran (Lokal): ${expenseDetails.description}`, {
            amount: expenseDetails.amount
        });
        // [IMPROVE-UI/UX]: clearer offline feedback
        if (!navigator.onLine) {
            toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
        } else {
            toast('success', 'Pengeluaran berhasil disimpan!');
        }

        form.reset();
        _clearFormDraft(form);
        _initCustomSelects(form);
        if (type === 'material') {
            $('#invoice-items-container').innerHTML = '';
            _addInvoiceItemRow(form);
            _updateInvoiceTotal(form);
        }

        await loadAllLocalDataToState();
        renderTagihanPage();
        syncToServer();
    } catch (error) {
        toast('error', `Gagal menyimpan data: ${error.message}`);
        console.error("Error saving expense locally:", error);
    }
}

function _addInvoiceItemRow(context = document) {
    const container = $('#invoice-items-container', context);
    if (!container) return;
    const index = container.children.length;
    const mode = context?.querySelector?.('input[name="formType"]')?.value || 'faktur';
    let itemHTML = '';
    if (mode === 'surat_jalan') {
        itemHTML = `
        <div class="invoice-item-row" data-index="${index}">
            <div class="autocomplete-wrapper item-name-wrapper">
                <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" required autocomplete="off">
                <input type="hidden" name="materialId" class="autocomplete-id">
                <button type="button" class="autocomplete-clear-btn" style="display: none;" title="Hapus Pilihan">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="autocomplete-suggestions"></div>
            </div>
            <div class="item-details">
                <input type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
                <span class="item-unit" style="margin-left: 0.25rem;"></span>
                <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
            </div>
            <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
    } else {
        itemHTML = `
        <div class="invoice-item-row" data-index="${index}">
            <div class="autocomplete-wrapper item-name-wrapper">
                <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" required autocomplete="off">
                <input type="hidden" name="materialId" class="autocomplete-id">
                <button type="button" class="autocomplete-clear-btn" style="display: none;" title="Hapus Pilihan">
                    <span class="material-symbols-outlined">close</span>
                </button>
                <div class="autocomplete-suggestions"></div>
            </div>
            <div class="item-details">
                <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" required>
                <span>x</span>
                <input type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
                <span class="item-unit" style="margin-left: 0.25rem;"></span>
                <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
            </div>
            <span class="item-total">Rp 0</span>
            <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
        </div>`;
    }
    container.insertAdjacentHTML('beforeend', itemHTML);
    const newRow = container.lastElementChild;
    // Trigger enter animation
    newRow.classList.add('new-item');
    // Remove row with fade-out animation before deleting from DOM
    const removeBtn = newRow.querySelector('.remove-item-btn');
    if (removeBtn) {
        removeBtn.addEventListener('click', () => {
            newRow.style.transition = 'opacity 0.3s ease, transform 0.3s ease, max-height 0.3s ease, padding 0.3s ease, margin 0.3s ease';
            newRow.style.opacity = '0';
            newRow.style.transform = 'scale(0.95)';
            newRow.style.maxHeight = '0';
            newRow.style.padding = '0';
            newRow.style.margin = '0';
            setTimeout(() => {
                newRow.remove();
                _updateInvoiceTotal(context);
            }, 300);
        });
    }
    if (mode === 'faktur') {
        newRow.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.addEventListener('input', _formatNumberInput);
        });
    }
}


function _handleInvoiceItemChange(e, context = document) {
    if (!e.target.matches('.item-price, .item-qty')) return;
    const row = e.target.closest('.invoice-item-row');
    const priceEl = row.querySelector('.item-price');
    const qty = parseLocaleNumber(row.querySelector('.item-qty').value);
    const totalEl = row.querySelector('.item-total');
    if (priceEl && totalEl) {
        const price = parseFormattedNumber(priceEl.value);
        totalEl.textContent = fmtIDR(price * qty);
        _updateInvoiceTotal(context);
    }
}

function _updateInvoiceTotal(context = document) {
    let totalAmount = 0;
    const rows = $$('.invoice-item-row', context);
    const hasPrice = !!context.querySelector('.item-price');
    if (hasPrice) {
        rows.forEach(row => {
            const priceEl = row.querySelector('.item-price');
            const qtyEl = row.querySelector('.item-qty');
            if (!priceEl || !qtyEl) return;
            const price = parseFormattedNumber(priceEl.value);
            const qty = parseLocaleNumber(qtyEl.value);
            totalAmount += price * qty;
        });
    } else {
        totalAmount = 0;
    }
    const totalEl = $('#invoice-total-amount', context);
    if (totalEl) totalEl.textContent = fmtIDR(totalAmount);
}

function _generateInvoiceNumber() {
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `INV/${year}${month}${day}/${randomPart}`;
}

async function handleOpenMaterialSelector(dataset) {
    const {
        index
    } = dataset;
    const sortedMaterials = [...appState.materials].sort((a, b) => {
        const countA = a.usageCount || 0;
        const countB = b.usageCount || 0;
        if (countB !== countA) {
            return countB - countA;
        }
        return a.materialName.localeCompare(b.materialName);
    });
    const renderList = (items) => items.map(mat => `
        <div class="material-list-item" data-id="${mat.id}" data-name="${mat.materialName}" data-unit="${mat.unit || ''}">
            <div class="item-info">
                <strong>${mat.materialName}</strong>
                <span>Satuan: ${mat.unit || 'N/A'}</span>
            </div>
            <div class="item-stock">Stok: ${mat.currentStock || 0}</div>
        </div>
    `).join('');
    const modalHeader = `<h4>Pilih Material</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button>`;
    const searchBar = `<div class="modal-search-bar"><div class="search"><span class="material-symbols-outlined">search</span><input type="search" id="material-search-input" placeholder="Cari nama material..."></div></div>`;
    const modalBody = `<div class="material-list" id="material-list-container">${renderList(sortedMaterials)}</div>`;
    const modalContent = `<div class="modal-content"><div class="modal-header">${modalHeader}</div>${searchBar}<div class="modal-body">${modalBody}</div></div>`;

    const modalContainer = $('#modal-container');
    modalContainer.innerHTML = `<div id="materialSelectorModal" class="modal-bg material-selector-modal">${modalContent}</div>`;

    const modalEl = $('#materialSelectorModal');
    setTimeout(() => modalEl.classList.add('show'), 10);
    const closeModalFunc = () => closeModal(modalEl);
    modalEl.addEventListener('click', e => {
        if (e.target === modalEl) closeModalFunc();
    });
    modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
    $('#material-list-container', modalEl).addEventListener('click', e => {
        const itemEl = e.target.closest('.material-list-item');
        if (!itemEl) return;
        const {
            id,
            name,
            unit
        } = itemEl.dataset;
        const row = $(`#material-invoice-form .invoice-item-row[data-index="${index}"]`) || $(`#edit-item-form .invoice-item-row[data-index="${index}"]`);
        if (row) {
            // [PERUBAHAN] Update input tersembunyi, teks tombol, DAN teks satuan
            row.querySelector('input[name="materialId"]').value = id;
            row.querySelector('.custom-select-trigger span').textContent = name;
            row.querySelector('.item-unit').textContent = unit || '';
        }
        closeModalFunc();
    });
    $('#material-search-input', modalEl).addEventListener('input', e => {
        const searchTerm = e.target.value.toLowerCase();
        const filtered = sortedMaterials.filter(mat => mat.materialName.toLowerCase().includes(searchTerm));
        $('#material-list-container', modalEl).innerHTML = renderList(filtered);
    });
}

async function renderStokPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'daftar',
        label: 'Daftar Stok'
    }, {
        id: 'estimasi',
        label: 'Estimasi Belanja'
    }, {
        id: 'riwayat',
        label: 'Riwayat Stok'
    }];
    container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('stok', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        await fetchAndCacheData('materials', materialsCol, 'materialName');

        if (tabId === 'daftar') await _renderDaftarStokView(contentContainer);
        else if (tabId === 'estimasi') await _renderEstimasiBelanjaView(contentContainer);
        else if (tabId === 'riwayat') await _renderRiwayatStokView(contentContainer);
    };
    const subNavItems = $$('.sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('.sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderTabContent(btn.dataset.tab),
                direction
            );
        });
    });

    const lastSubPage = appState.activeSubPage.get('stok') || tabs[0].id;
    $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
    await renderTabContent(lastSubPage);
    _setActiveListeners(['stock_transactions']);
}

async function _renderDaftarStokView(container) {
    const materials = appState.materials || [];
    const listHTML = materials.map(item => {
        const stockLevel = item.currentStock || 0;
        const reorderPoint = item.reorderPoint || 0;
        const isLowStock = stockLevel <= reorderPoint;

        return `
                <div class="card dense-list-item">
                    <div class="item-main-content">
                        <strong class="item-title">${item.materialName}</strong>
                        <span class="item-subtitle ${isLowStock?'negative' : ''}">
                            Stok: <strong>${stockLevel} ${item.unit || ''}</strong>
                            ${isLowStock?' (Stok menipis!)' : ''}
                        </span>
                    </div>
                    <div class="item-actions">
                        <button class="btn btn-sm btn-success" data-action="stok-in" data-id="${item.id}"><span class="material-symbols-outlined">add</span>Masuk</button>
                        <button class="btn btn-sm btn-danger" data-action="stok-out" data-id="${item.id}"><span class="material-symbols-outlined">remove</span>Keluar</button>
                    </div>
                </div>
            `;
    }).join('');

    container.innerHTML = `
            <div class="stok-header sticky-toolbar">
                <button class="btn btn-primary" data-action="manage-master" data-type="materials"><span class="material-symbols-outlined">inventory_2</span> Kelola Master Material</button>
            </div>
            <div class="dense-list-container">
                ${materials.length > 0?listHTML : _getEmptyStateHTML({ icon:'inventory_2', title:'Belum Ada Material', desc:'Tambah material agar stok dapat dikelola.' })}
            </div>
        `;
}
async function _renderEstimasiBelanjaView(container) {
    const lowStockItems = (appState.materials || []).filter(item => (item.currentStock || 0) <= (item.reorderPoint || 0));

    if (lowStockItems.length === 0) {
        // [IMPROVE-UI/UX]: richer empty state for stock summary
        container.innerHTML = _getEmptyStateHTML({ icon:'inventory', title:'Stok Aman', desc:'Semua persediaan berada pada level yang sehat.' });
        return;
    }

    const listHTML = lowStockItems.map(item => `
            <div class="card estimasi-item" data-price="${item.lastPrice || 0}">
                <div class="estimasi-info">
                    <strong>${item.materialName}</strong>
                    <span>Stok: ${item.currentStock || 0} / Min: ${item.reorderPoint || 0} ${item.unit || ''}</span>
                </div>
                <div class="estimasi-input">
                    <input type="number" class="qty-beli" placeholder="Qty Beli">
                    <span class="estimasi-subtotal">Rp 0</span>
                </div>
            </div>
        `).join('');

    container.innerHTML = `
            <div id="estimasi-list">${listHTML}</div>
            <div class="invoice-total" style="margin-top:1.5rem;">
                <span>Grand Total Estimasi</span>
                <strong id="estimasi-grand-total">Rp 0</strong>
            </div>
        `;

    const updateTotal = () => {
        let grandTotal = 0;
        $$('.estimasi-item').forEach(item => {
            const price = Number(item.dataset.price);
            const qty = Number(item.querySelector('.qty-beli').value);
            const subtotal = price * qty;
            item.querySelector('.estimasi-subtotal').textContent = fmtIDR(subtotal);
            grandTotal += subtotal;
        });
        $('#estimasi-grand-total').textContent = fmtIDR(grandTotal);
    };

    $$('.qty-beli').forEach(input => input.addEventListener('input', updateTotal));
}

function _createStockTransactionDetailHTML(trans) {
    const material = appState.materials.find(m => m.id === trans.materialId);
    const project = trans.projectId?appState.projects.find(p => p.id === trans.projectId) : null;
    const date = _getJSDate(trans.date).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    const isStokIn = trans.type === 'in';
    const details = [{
        label: 'Nama Material',
        value: material?.materialName || 'Material Dihapus'
    }, {
        label: 'Jumlah',
        value: `${trans.quantity} ${material?.unit || ''}`
    }, {
        label: 'Jenis Transaksi',
        value: isStokIn?'Stok Masuk' : 'Stok Keluar (Pemakaian)'
    }, {
        label: 'Tanggal',
        value: date
    }];
    if (isStokIn && trans.pricePerUnit > 0) {
        details.push({
            label: 'Harga per Satuan',
            value: fmtIDR(trans.pricePerUnit)
        });
        details.push({
            label: 'Total Nilai',
            value: fmtIDR(trans.pricePerUnit * trans.quantity)
        });
    }
    if (!isStokIn && project) {
        details.push({
            label: 'Digunakan untuk Proyek',
            value: project.projectName
        });
    }
    return `
            <dl class="detail-list">
                ${details.map(d => `<div><dt>${d.label}</dt><dd>${d.value}</dd></div>`).join('')}
            </dl>
        `;
}
async function _renderRiwayatStokView(container) {
    const transactions = appState.stockTransactions.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

    if (transactions.length === 0) {
        container.innerHTML = _getEmptyStateHTML({ icon:'receipt_long', title:'Belum Ada Riwayat', desc:'Transaksi stok yang terjadi akan tampil di sini.' });
        return;
    }

    const listHTML = transactions.map(trans => {
        const material = appState.materials.find(m => m.id === trans.materialId);
        const project = appState.projects.find(p => p.id === trans.projectId);
        // [PERBAIKAN] Gunakan _getJSDate
        const date = _getJSDate(trans.date).toLocaleDateString('id-ID', {
            day: '2-digit',
            month: 'short'
        });
        const isStokIn = trans.type === 'in';
        return `
                <div class="jurnal-item card" data-action="open-stock-detail-and-actions-modal" data-local-id="${trans.localId}">
                    <div class="jurnal-item-content">
                        <div class="jurnal-item-header">
                            <strong>${material?.materialName || 'Material Dihapus'}</strong>
                            <strong class="${isStokIn?'positive' : 'negative'}">${isStokIn?'+' : '-'}${trans.quantity} ${material?.unit || ''}</strong>
                        </div>
                        <div class="jurnal-item-details">
                            <span>Tanggal: ${date}</span>
                            <span>${isStokIn?'Stok Masuk' : `Digunakan untuk: ${project?.projectName || 'N/A'}`}</span>
                        </div>
                    </div>
                </div>`;
    }).join('');
    container.innerHTML = `<div class="jurnal-list">${listHTML}</div>`;
}
async function handleEditStockTransaction(dataset) {
    const {
        id,
        type,
        qty,
        materialId,
        projectId
    } = dataset;
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Master material tidak ditemukan.');
    let content = '';
    if (type === 'out') {
        const projectOptions = appState.projects.map(p => ({
            value: p.id,
            text: p.projectName
        }));
        content = `
                <form id="edit-stock-form" data-id="${id}" data-type="${type}" data-old-qty="${qty}" data-material-id="${materialId}" data-async="true" method="PUT" data-endpoint="/api/stock/transactions/${id}" data-success-msg="Riwayat stok diperbarui">
                    <p>Mengubah data pemakaian untuk <strong>${material.materialName}</strong>.</p>
                    <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit})</label><input type="number" name="quantity" value="${qty}" required min="1"></div>
                    ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, projectId)}
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </form>
            `;
    } else { // type 'in'
        content = `
                <form id="edit-stock-form" data-id="${id}" data-type="${type}" data-old-qty="${qty}" data-material-id="${materialId}" data-async="true" method="PUT" data-endpoint="/api/stock/transactions/${id}" data-success-msg="Riwayat stok diperbarui">
                    <p>Mengubah data stok masuk untuk <strong>${material.materialName}</strong>.</p>
                    <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit})</label><input type="number" name="quantity" value="${qty}" required min="1"></div>
                    <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
                </form>
            `;
    }

    createModal('dataDetail', {
        title: 'Edit Riwayat Stok',
        content
    });
    _initCustomSelects($('#dataDetail-modal'));
    $('#edit-stock-form').addEventListener('submit', (e) => {
        e.preventDefault();
        _processStockTransactionUpdate(e.target);
        closeModal($('#dataDetail-modal'));
    });
}

function handleDeleteStockTransaction(dataset) {
    createModal('confirmDelete', {
        message: 'Menghapus riwayat ini juga akan mengembalikan jumlah stok. Aksi ini tidak dapat dibatalkan. Lanjutkan?',
        onConfirm: () => _processStockTransactionDelete(dataset)
    });
}

async function _processStockTransactionUpdate(form) {
    const {
        id,
        type,
        oldQty,
        materialId
    } = form.dataset;
    const newQty = Number(form.elements.quantity.value);
    const qtyDifference = newQty - Number(oldQty);
    if (qtyDifference === 0 && type === 'in') {
        toast('info', 'Tidak ada perubahan data.');
        return;
    }
    toast('syncing', 'Memperbarui transaksi...');
    try {
        const transRef = doc(stockTransactionsCol, id);
        const materialRef = doc(materialsCol, materialId);
        const dataToUpdate = {
            quantity: newQty
        };
        if (type === 'out') {
            dataToUpdate.projectId = form.elements.projectId.value;
        }
        await runTransaction(db, async (transaction) => {
            transaction.update(transRef, dataToUpdate);
            // Untuk stok keluar, penambahan qty berarti pengurangan stok, jadi kita balik nilainya
            const stockAdjustment = type === 'out'?-qtyDifference : qtyDifference;
            const mSnap = await transaction.get(materialRef);
            const mRev = mSnap.exists()?(mSnap.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(stockAdjustment),
                rev: mRev + 1,
                updatedAt: serverTimestamp()
            });
        });
        _logActivity('Mengedit Riwayat Stok', {
            transactionId: id,
            newQty
        });
        toast('success', 'Riwayat stok berhasil diperbarui.');
        renderStokPage();
    } catch (error) {
        toast('error', 'Gagal memperbarui riwayat.');
        console.error(error);
    }
}
async function _processStockTransactionDelete(dataset) {
    const {
        id,
        type,
        qty,
        materialId
    } = dataset;
    toast('syncing', 'Menghapus transaksi...');
    try {
        // Coba API delete terlebih dahulu
        let apiOk = false;
        try {
            await _apiRequest('DELETE', _mapDeleteEndpoint('stock_transaction', id));
            apiOk = true;
        } catch (_) {}
        if (!apiOk) {
            const transRef = doc(stockTransactionsCol, id);
            await runTransaction(db, async (transaction) => {
                let materialRef;
                let matDoc = null; // Inisialisasi matDoc sebagai null
                if (materialId && materialId !== 'undefined') {
                    materialRef = doc(materialsCol, materialId);
                    matDoc = await transaction.get(materialRef);
                }
                transaction.delete(transRef);
                if (matDoc && matDoc.exists()) {
                    const stockAdjustment = type === 'in'?-Number(qty) : Number(qty);
                    transaction.update(materialRef, {
                        currentStock: increment(stockAdjustment)
                    });
                } else if (materialId && materialId !== 'undefined') {
                    console.warn(`Master material dengan ID ${materialId} tidak ditemukan. Melewatkan pembaruan stok.`);
                }
            });
        }

        _logActivity('Menghapus Riwayat Stok', {
            transactionId: id
        });
        toast('success', 'Riwayat stok berhasil dihapus.');
        renderStokPage();
    } catch (error) {
        toast('error', 'Gagal menghapus riwayat.');
        console.error(error);
    }
}

async function _updateStockAfterInvoice(items) {
    if (!items || items.length === 0) return;

    try {
        const batch = writeBatch(db);
        const stockTransCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');

        for (const item of items) {
            if (item.materialId) { // Lakukan hanya jika ada ID Material
                const materialRef = doc(db, 'teams', TEAM_ID, 'materials', item.materialId);

                // 1. Tambah jumlah stok di master material
                batch.update(materialRef, {
                    currentStock: increment(item.qty)
                }); // rev bump not possible in batch without read

                // 2. Buat catatan transaksi stok
                const transRef = doc(stockTransCol);
                batch.set(transRef, {
                    materialId: item.materialId,
                    quantity: item.qty,
                    type: 'in',
                    date: serverTimestamp()
                });
            }
        }
        await batch.commit();
        console.log('Stok berhasil diperbarui secara otomatis.');
    } catch (error) {
        console.error('Gagal update stok otomatis:', error);
        toast('error', 'Gagal memperbarui stok secara otomatis.');
    }
}

async function handleStokInModal(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Material tidak ditemukan.');
    const content = `
            <form id="stok-in-form" data-id="${materialId}" data-async="true" method="POST" data-endpoint="/api/stock/in" data-success-msg="Stok masuk tersimpan">
                <p>Mencatat pembelian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Masuk (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1"></div>
                <div class="form-group"><label>Harga per Satuan</label><input type="text" name="price" inputmode="numeric" required></div>
                <div class="form-group"><label>Tanggal Pembelian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        `;
    createModal('dataDetail', {
        title: 'Form Stok Masuk',
        content
    });
    $('#stok-in-form input[name="price"]').addEventListener('input', _formatNumberInput);
    $('#stok-in-form').addEventListener('submit', (e) => {
        e.preventDefault();
        processStokIn(e.target);
        closeModal($('#dataDetail-modal'));
    });
}
async function handleStokOutModal(materialId) {
    const material = appState.materials.find(m => m.id === materialId);
    if (!material) return toast('error', 'Material tidak ditemukan.');
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    const content = `
            <form id="stok-out-form" data-id="${materialId}" data-async="true" method="POST" data-endpoint="/api/stock/out" data-success-msg="Stok keluar tersimpan">
                <p>Mencatat pemakaian untuk <strong>${material.materialName}</strong>.</p>
                <div class="form-group"><label>Jumlah Keluar (dalam ${material.unit || 'satuan'})</label><input type="number" name="quantity" required min="1" max="${material.currentStock || 0}"></div>
                ${createMasterDataSelect('projectId', 'Digunakan untuk Proyek', projectOptions, '', 'projects')}
                <div class="form-group"><label>Tanggal Pemakaian</label><input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required></div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        `;
    createModal('dataDetail', {
        title: 'Form Stok Keluar',
        content
    });
    _initCustomSelects($('#dataDetail-modal'));
    $('#stok-out-form').addEventListener('submit', (e) => {
        e.preventDefault();
        processStokOut(e.target);
        closeModal($('#dataDetail-modal'));
    });
}
async function processStokIn(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const price = parseFormattedNumber(form.elements.price.value);
    const date = new Date(form.elements.date.value);

    toast('syncing', 'Menyimpan data stok...');
    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const mSnap2 = await transaction.get(materialRef);
            const mRev2 = mSnap2.exists()?(mSnap2.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(quantity),
                rev: mRev2 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'in',
                pricePerUnit: price,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Masuk', {
            materialId,
            quantity
        });
        toast('success', 'Stok berhasil diperbarui.');
        renderStokPage();
    } catch (error) {
        toast('error', 'Gagal memperbarui stok.');
        console.error(error);
    }
}
async function processStokOut(form) {
    const materialId = form.dataset.id;
    const quantity = Number(form.elements.quantity.value);
    const projectId = form.elements.projectId.value;
    const date = new Date(form.elements.date.value);
    if (!projectId) return toast('error', 'Proyek harus dipilih.');
    toast('syncing', 'Menyimpan data pemakaian...');
    try {
        const materialRef = doc(materialsCol, materialId);
        const transRef = doc(stockTransactionsCol);
        await runTransaction(db, async (transaction) => {
            const matDoc = await transaction.get(materialRef);
            if (!matDoc.exists() || (matDoc.data().currentStock || 0) < quantity) {
                throw new Error("Stok tidak mencukupi!");
            }
            const mSnap3 = await transaction.get(materialRef);
            const mRev3 = mSnap3.exists()?(mSnap3.data().rev || 0) : 0;
            transaction.update(materialRef, {
                currentStock: increment(-quantity),
                rev: mRev3 + 1,
                updatedAt: serverTimestamp()
            });
            transaction.set(transRef, {
                materialId,
                quantity,
                date: Timestamp.fromDate(date),
                type: 'out',
                projectId,
                createdAt: serverTimestamp()
            });
        });
        _logActivity('Mencatat Stok Keluar', {
            materialId,
            quantity,
            projectId
        });
        toast('success', 'Pemakaian stok berhasil dicatat.');
        renderStokPage();
    } catch (error) {
        toast('error', error.message || 'Gagal mencatat pemakaian.');
        console.error(error);
    }
}

// --- SUB-SEKSI 3.4: ABSENSI & JURNAL ---
// GANTI SELURUH FUNGSI INI

async function renderAbsensiPage() {
    const container = $('.page-container');
    const tabs = [{
        id: 'manual',
        label: 'Input Manual'
    }, {
        id: 'harian',
        label: 'Absensi Harian'
    }];
    container.innerHTML = `
            ${isViewer()?'' : `<div class="attendance-header">
                 <button class="btn" data-action="manage-master" data-type="workers"><span class="material-symbols-outlined">engineering</span>Pekerja</button>
                 <button class="btn" data-action="manage-master" data-type="professions"><span class="material-symbols-outlined">badge</span>Profesi</button>
            </div>`}
            <div class="sub-nav two-tabs">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderTabContent = async (tabId) => {
        appState.activeSubPage.set('absensi', tabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        await Promise.all([
            fetchAndCacheData('workers', workersCol, 'workerName'),
            fetchAndCacheData('professions', collection(db, 'teams', TEAM_ID, 'professions'), 'professionName'),
            fetchAndCacheData('projects', projectsCol, 'projectName')
        ]);

        if (tabId === 'harian') {
            await _fetchTodaysAttendance();
            contentContainer.innerHTML = _getDailyAttendanceHTML();
            _initCustomSelects(contentContainer);
            contentContainer.querySelector('#attendance-profession-filter')?.addEventListener('change', () => _rerenderAttendanceList());
            contentContainer.querySelector('#attendance-project-id')?.addEventListener('change', () => _rerenderAttendanceList());
        } else if (tabId === 'manual') {
            contentContainer.innerHTML = _getManualAttendanceHTML();
            _initCustomSelects(contentContainer);
            const dateInput = $('#manual-attendance-date', contentContainer);
            const projectInput = $('#manual-attendance-project', contentContainer);
            dateInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
            projectInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
            if (!isViewer()) $('#manual-attendance-form').addEventListener('submit', handleSaveManualAttendance);

            _renderManualAttendanceList(dateInput.value, projectInput.value);
        }
    };

    // [PERUBAHAN] Menerapkan event listener animasi
    const subNavItems = $$('.sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('.sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderTabContent(btn.dataset.tab),
                direction
            );
        });
    });

    const lastSubPage = appState.activeSubPage.get('absensi') || tabs[0].id;
    $(`.sub-nav-item[data-tab="${lastSubPage}"]`)?.classList.add('active');
    await renderTabContent(lastSubPage);
    _setActiveListeners(['attendance_records']);
}

function _getDailyAttendanceHTML() {
  const today = new Date().toLocaleDateString('id-ID', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
  });
  const projectOptions = appState.projects.map(p => ({
      value: p.id,
      text: p.projectName
  }));
  const professionOptions = [{
      value: 'all',
      text: 'Semua Profesi'
  }, ...appState.professions.map(p => ({
      value: p.id,
      text: p.professionName
  }))];
  let content = (appState.workers.length === 0) ?
      _getEmptyStateHTML({ icon:'group', title:'Belum Ada Pekerja', desc:'Tambahkan pekerja untuk mulai mencatat absensi.' }) :
      `<div class="attendance-grid" id="attendance-grid-container">${_renderAttendanceGrid()}</div>`;
  return `
          <h4 class="page-title-date">${today}</h4>
          <div class="attendance-controls card card-pad">
              ${createMasterDataSelect('attendance-project-id', 'Proyek Hari Ini', projectOptions, appState.projects[0]?.id || '')}
              ${createMasterDataSelect('attendance-profession-filter', 'Filter Profesi', professionOptions, 'all')}
          </div>
          ${content}
      `;
}

function _rerenderAttendanceList() {
  $('#attendance-grid-container').innerHTML = _renderAttendanceGrid();
}

function _renderAttendanceGrid() {
  const professionFilter = $('#attendance-profession-filter')?.value;
  const projectId = $('#attendance-project-id')?.value;
  const activeWorkers = appState.workers.filter(w => w.status === 'active');
  const filteredWorkers = (professionFilter === 'all') ?
      activeWorkers :
      activeWorkers.filter(w => w.professionId === professionFilter);
  if (filteredWorkers.length === 0) {
      return `<p class="empty-state-small" style="grid-column: 1 / -1;">Tidak ada pekerja yang cocok.</p>`;
  }
  return filteredWorkers.map(worker => {
      const attendance = appState.attendance.get(worker.id);
      const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
      const dailyWage = worker.projectWages?.[projectId] || 0;
      let statusHTML = '';
      const wageHTML = `<span class="worker-wage">${fmtIDR(dailyWage)} / hari</span>`;
      if (attendance) {
          const checkInTime = _getJSDate(attendance.checkIn).toLocaleTimeString('id-ID', {
              hour: '2-digit',
              minute: '2-digit'
          });
          const earnedPayHTML = attendance.totalPay?`<strong> (${fmtIDR(attendance.totalPay)})</strong>` : '';
          if (attendance.status === 'checked_in') {
              statusHTML = `
                      <div class="attendance-status checked-in">Masuk: ${checkInTime}</div>
                      ${isViewer()?'' : `<button class="btn btn-danger" data-action="check-out" data-id="${attendance.id}">Check Out</button>`}
                  `;
          } else { // completed
              const checkOutTime = _getJSDate(attendance.checkOut).toLocaleTimeString('id-ID', {
                  hour: '2-digit',
                  minute: '2-digit'
              });
              statusHTML = `
                      <div class="attendance-status">Masuk: ${checkInTime} | Keluar: ${checkOutTime}</div>
                      <div class="attendance-status completed">Total: ${attendance.workHours.toFixed(1)} jam ${earnedPayHTML}</div>
                      ${isViewer()?'' : `<button class="btn-icon" data-action="edit-attendance" data-id="${attendance.id}" title="Edit Waktu"><span class="material-symbols-outlined">edit_calendar</span></button>`}
                  `;
          }
      } else {
          statusHTML = isViewer()?'<div class="attendance-status">Belum Hadir</div>' : `<button class="btn btn-success" data-action="check-in" data-id="${worker.id}">Check In</button>`;
      }

      return `
              <div class="card attendance-card">
                  <div class="attendance-worker-info">
                      <strong>${worker.workerName}</strong>
                      <span>${profession}</span>
                      ${wageHTML}
                  </div>
                  <div class="attendance-actions">${statusHTML}</div>
              </div>`;
  }).join('');
}

async function _fetchTodaysAttendance() {
  appState.attendance.clear();
  const today = new Date();
  const startOfDay = new Date(today.setHours(0, 0, 0, 0));
  const endOfDay = new Date(today.setHours(23, 59, 59, 999));

  const q = query(attendanceRecordsCol,
      where('date', '>=', startOfDay),
      where('date', '<=', endOfDay)
  );
  const snap = await getDocs(q);
  snap.forEach(doc => {
      const data = doc.data();
      appState.attendance.set(data.workerId, {
          id: doc.id,
          ...data
      });
  });
}

async function handleCheckIn(workerId) {
  const projectId = $('#attendance-project-id')?.value;
  if (!projectId) {
      toast('error', 'Silakan pilih proyek terlebih dahulu.');
      return;
  }

  toast('syncing', 'Mencatat jam masuk lokal...');
  try {
      const worker = appState.workers.find(w => w.id === workerId);
      if (!worker) throw new Error('Pekerja tidak ditemukan');

      const dailyWage = worker.projectWages?.[projectId] || 0;
      const hourlyWage = dailyWage / 8;
      const now = new Date();
      const attendanceData = {
          workerId,
          projectId,
          workerName: worker.workerName,
          hourlyWage,
          date: now,
          checkIn: now,
          status: 'checked_in',
          type: 'timestamp',
          needsSync: 1,
          isPaid: false
      };

      if (!attendanceData.id) attendanceData.id = generateUUID();
      await localDB.attendance_records.add(attendanceData);

      _logActivity(`Check-in Pekerja (Lokal): ${worker.workerName}`, {
          workerId,
          projectId
      });
      toast('success', `${worker.workerName} berhasil check in.`);

      await loadAllLocalDataToState();
      _rerenderAttendanceList();

      syncToServer();
  } catch (error) {
      toast('error', 'Gagal melakukan check in.');
      console.error(error);
  }
}

async function handleCheckOut(recordLocalId) {
  toast('syncing', 'Mencatat jam keluar lokal...');
  try {
      const record = await localDB.attendance_records.get(Number(recordLocalId));
      if (!record) throw new Error('Data absensi tidak ditemukan di lokal');

      const now = new Date();
      const checkOutTime = now;
      const checkInTime = record.checkIn;

      const hours = (checkOutTime.seconds - checkInTime.seconds) / 3600;
      const normalHours = Math.min(hours, 8);
      const overtimeHours = Math.max(0, hours - 8);

      const hourlyWage = record.hourlyWage || 0;
      const normalPay = normalHours * hourlyWage;
      const overtimePay = overtimeHours * hourlyWage * 1.5;
      const totalPay = normalPay + overtimePay;

      const dataToUpdate = {
          checkOut: checkOutTime,
          status: 'completed',
          workHours: hours,
          normalHours,
          overtimeHours,
          totalPay,
          needsSync: 1
      };

      await localDB.attendance_records.update(Number(recordLocalId), dataToUpdate);

      _logActivity(`Check-out Pekerja (Lokal): ${record.workerName}`, {
          recordId: record.id,
          totalPay
      });
      toast('success', `${record.workerName} berhasil check out.`);

      await loadAllLocalDataToState();
      _rerenderAttendanceList();

      syncToServer();
  } catch (error) {
      toast('error', 'Gagal melakukan check out.');
      console.error(error);
  }
}

function _getManualAttendanceHTML() {
    const today = new Date().toISOString().slice(0, 10);
    const projectOptions = appState.projects.map(p => ({
        value: p.id,
        text: p.projectName
    }));
    return `
            <form id="manual-attendance-form" data-async="true" method="POST" data-endpoint="/api/attendance/manual" data-success-msg="Absensi disimpan">
                <div class="card card-pad">
                    <div class="recap-filters">
                        <div class="form-group">
                            <label for="manual-attendance-date">Tanggal</label>
                            <input type="date" id="manual-attendance-date" value="${today}" required ${isViewer()?'disabled' : ''}>
                        </div>
                        ${createMasterDataSelect('manual-attendance-project', 'Proyek', projectOptions, appState.projects[0]?.id || '')}
                    </div>
                </div>
                <div id="manual-attendance-list-container" style="margin-top: 1.5rem;"></div>
                ${isViewer()?'' : `
                <div class="form-footer-actions" style="margin-top: 1rem;">
                    <button type="submit" class="btn btn-primary">Simpan Absensi</button>
                </div>`}
            </form>
        `;
  }

  async function _renderManualAttendanceList(dateStr, projectId) {
    const container = $('#manual-attendance-list-container');
    if (!dateStr || !projectId) {
        container.innerHTML = _getEmptyStateHTML({ icon:'event', title:'Mulai dengan Memilih Tanggal', desc:'Pilih tanggal dan proyek untuk melihat rekapan.' });
        return;
    }
    container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
    
    const date = new Date(dateStr);
    const startOfDay = new Date(new Date(date).setHours(0, 0, 0, 0));
    const endOfDay = new Date(new Date(date).setHours(23, 59, 59, 999));

    // Ambil data absensi dari localDB untuk tanggal & proyek yang dipilih
    const existingRecords = new Map();
    const recordsOnDate = await localDB.attendance_records
        .where('date').between(startOfDay, endOfDay)
        .and(rec => rec.projectId === projectId && rec.type === 'manual' && !rec.isDeleted)
        .toArray();
    recordsOnDate.forEach(rec => existingRecords.set(rec.workerId, rec));

    const activeWorkers = appState.workers.filter(w => w.status === 'active');
    if (activeWorkers.length === 0) {
        container.innerHTML = `<p class="empty-state">Tidak ada pekerja aktif.</p>`;
        return;
    }

    const listHTML = activeWorkers.map(worker => {
        const existing = existingRecords.get(worker.id);
        const currentStatus = existing?.attendanceStatus || 'absent';
        const currentJobRole = existing?.jobRole || '';

        const wageOptions = worker.projectWages?.[projectId] || {};
        let defaultWage = 0;
        let defaultRole = '';

        if (Object.keys(wageOptions).length > 0) {
            for (const roleName in wageOptions) {
                const wageAmount = wageOptions[roleName];
                let isSelected = false;
                if (currentJobRole) {
                    isSelected = (roleName === currentJobRole);
                } else if (roleName.toLowerCase().includes('default')) {
                    isSelected = true;
                }
                if (isSelected) {
                    defaultWage = wageAmount;
                    defaultRole = roleName;
                }
            }
            // Jika setelah loop tidak ada yang terpilih, pilih yang pertama
            if (!defaultRole) {
                defaultRole = Object.keys(wageOptions)[0];
                defaultWage = wageOptions[defaultRole];
            }
        }
        
        let calculatedPay = 0;
        if(currentStatus === 'full_day') calculatedPay = defaultWage;
        if(currentStatus === 'half_day') calculatedPay = defaultWage / 2;
        
        // --- [BAGIAN UTAMA PERBAIKAN HTML] ---
        return `
            <div class="manual-attendance-item card">
                <div class="attendance-card-main">
                    <div class="attendance-card-left">
                        <strong>${worker.workerName}</strong>
                        <span class="worker-wage" data-pay="${calculatedPay}">${fmtIDR(calculatedPay)}</span>
                    </div>
                    <div class="attendance-card-right">
                        <div class="form-group" style="margin: 0;">
                            <label style="font-size: 0.8rem; margin-bottom: 4px;">Peran / Tugas Hari Ini</label>
                            
                            <div class="custom-select-wrapper">
                                <input type="hidden" class="wage-role-value" name="wage_role_selector_${worker.id}" value="${defaultWage}">
                                <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                                    <span>${defaultRole || 'Tidak ada tarif'}</span>
                                    <span class="material-symbols-outlined">arrow_drop_down</span>
                                </button>
                                <div class="custom-select-options">
                                     <div class="custom-select-options-list">
                                        ${Object.keys(wageOptions).length > 0 ? Object.entries(wageOptions).map(([roleName, wageAmount]) => `
                                            <div class="custom-select-option" data-value="${wageAmount}">${roleName}</div>
                                        `).join('') : '<div class="custom-select-option" data-value="0">Tidak ada tarif</div>'}
                                     </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="attendance-status-selector" data-worker-id="${worker.id}">
                    <label><input type="radio" name="status_${worker.id}" value="full_day" ${currentStatus === 'full_day'?'checked' : ''} ${isViewer()?'disabled' : ''}><span>Hadir</span></label>
                    <label><input type="radio" name="status_${worker.id}" value="half_day" ${currentStatus === 'half_day'?'checked' : ''} ${isViewer()?'disabled' : ''}><span>1/2 Hari</span></label>
                    <label><input type="radio" name="status_${worker.id}" value="absent" ${currentStatus === 'absent'?'checked' : ''} ${isViewer()?'disabled' : ''}><span>Absen</span></label>
                </div>
            </div>
        `;
    }).join('');

    container.innerHTML = listHTML;

    // --- [BAGIAN UTAMA PERBAIKAN JAVASCRIPT] ---
    if (!isViewer()) {
        const _updatePay = (el) => {
            const card = el.closest('.manual-attendance-item');
            if (!card) return; // Pengaman jika elemen tidak ditemukan

            // KUNCI PERBAIKAN: Baca dari input tersembunyi, bukan <select>
            const hiddenInput = card.querySelector('.wage-role-value');
            const status = card.querySelector('input[type="radio"]:checked')?.value || 'absent';
            const wageEl = card.querySelector('.worker-wage');
            
            // Pengaman jika hiddenInput tidak ada
            if (!hiddenInput || !wageEl) {
                console.error("Elemen penting tidak ditemukan di kartu:", card);
                return;
            }

            const selectedWage = parseFloat(hiddenInput.value); // Nilai upah ada di sini
            let newPay = 0;
            if (status === 'full_day') newPay = selectedWage;
            else if (status === 'half_day') newPay = selectedWage / 2;
            
            wageEl.textContent = fmtIDR(newPay);
            wageEl.dataset.pay = newPay;
        };
        
        // Listener untuk tombol radio (tetap sama)
        container.querySelectorAll('.attendance-status-selector input').forEach(el => {
            el.addEventListener('change', (e) => _updatePay(e.target));
        });

        // Panggil inisialisasi untuk membuat dropdown kustom menjadi interaktif
        _initCustomSelects(container);

        // Tambahkan listener baru untuk perubahan dari dropdown kustom
        container.querySelectorAll('.wage-role-value').forEach(hiddenInput => {
            hiddenInput.addEventListener('change', (e) => _updatePay(e.target));
        });
    }
}

  async function handleDeleteSingleAttendance(recordId) {
  // Cari data absensi untuk ditampilkan di pesan konfirmasi
  const record = appState.attendanceRecords.find(r => r.id === recordId);
  const worker = record?appState.workers.find(w => w.id === record.workerId) : null;
  const message = worker ?
      `Hapus absensi untuk <strong>${worker.workerName}</strong> pada tanggal ${_getJSDate(record.date).toLocaleDateString('id-ID')}?` :
      'Hapus data absensi ini?';
  createModal('confirmDelete', {
      message,
      onConfirm: async () => {
          toast('syncing', 'Menghapus absensi...');
          try {
              // Coba API terlebih dahulu
              try {
                  await _apiRequest('DELETE', _mapDeleteEndpoint('attendance', recordId));
              } catch (_) {
                  // Fallback Firestore
                  await deleteDoc(doc(attendanceRecordsCol, recordId));
              }
              _logActivity('Menghapus Absensi', {
                  recordId,
                  workerName: worker?.workerName
              });
              toast('success', 'Absensi berhasil dihapus.');
              renderPageContent(); // Muat ulang halaman aktif
          } catch (error) {
              toast('error', 'Gagal menghapus absensi.');
              console.error(error);
          }
      }
  });
}
async function handleEditManualAttendanceModal(recordId) {
    const record = appState.attendanceRecords.find(r => r.id === recordId);
    if (!record) {
        toast('error', 'Data absensi tidak ditemukan.');
        return;
    }
    await Promise.all([
        fetchAndCacheData('workers', workersCol, 'workerName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const worker = appState.workers.find(w => w.id === record.workerId);
    if (!worker) {
        toast('error', 'Data pekerja terkait tidak ditemukan.');
        return;
    }

    let content = '';
    const dateString = _getJSDate(record.date).toLocaleDateString('id-ID');

    if (record.type === 'manual') {
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
        
        // Siapkan opsi peran berdasarkan proyek yang dipilih saat ini
        const currentWageOptions = worker.projectWages?.[record.projectId] || {};
        const roleOptions = Object.keys(currentWageOptions).map(roleName => ({
            value: roleName,
            text: `${roleName} - ${fmtIDR(currentWageOptions[roleName])}`
        }));

        content = `
            <form id="edit-attendance-form" data-id="${recordId}" data-type="manual">
                <p>Mengedit absensi untuk <strong>${worker.workerName}</strong> pada tanggal <strong>${dateString}</strong>.</p>
                
                ${createMasterDataSelect('edit-attendance-project', 'Ubah Proyek', projectOptions, record.projectId)}
                
                <div id="edit-attendance-role-container">
                    ${createMasterDataSelect('edit-attendance-role', 'Ubah Peran/Tugas', roleOptions, record.jobRole)}
                </div>

                <div class="form-group">
                    <label>Upah Kustom (Isi untuk menimpa upah peran)</label>
                    <input type="text" name="customWage" inputmode="numeric" placeholder="mis. 200.000" value="${record.customWage ? new Intl.NumberFormat('id-ID').format(record.customWage) : ''}">
                </div>

                <div class="form-group">
                    <label>Status Kehadiran</label>
                    <div class="attendance-status-selector">
                        <label><input type="radio" name="status" value="full_day" ${record.attendanceStatus === 'full_day' ? 'checked' : ''}><span>Hadir</span></label>
                        <label><input type="radio" name="status" value="half_day" ${record.attendanceStatus === 'half_day' ? 'checked' : ''}><span>1/2 Hari</span></label>
                        <label><input type="radio" name="status" value="absent" ${record.attendanceStatus === 'absent' ? 'checked' : ''}><span>Absen</span></label>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </form>`;
        
        } else { // type === 'timestamp'
        const checkInTime = _getJSDate(record.checkIn).toTimeString().slice(0, 5);
        const checkOutTime = record.checkOut ? _getJSDate(record.checkOut).toTimeString().slice(0, 5) : '';
        content = `
            <form id="edit-attendance-form" data-id="${recordId}" data-type="timestamp">
                <p>Mengedit absensi untuk <strong>${worker?.workerName || 'N/A'}</strong> pada tanggal <strong>${dateString}</strong>.</p>
                <div class="form-group"><label>Jam Masuk</label><input type="time" name="checkIn" value="${checkInTime}" required></div>
                <div class="form-group"><label>Jam Keluar</label><input type="time" name="checkOut" value="${checkOutTime}"></div>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </form>`;
    }

    const modalEl = createModal('editAttendance', { title: 'Edit Absensi', content });

    if (modalEl && record.type === 'manual') {
        _initCustomSelects(modalEl);
        $('input[name="customWage"]', modalEl).addEventListener('input', _formatNumberInput);

        $('#edit-attendance-project', modalEl).addEventListener('change', (e) => {
            const newProjectId = e.target.value;
            const newWageOptions = worker.projectWages?.[newProjectId] || {};
            const newRoleOptions = Object.keys(newWageOptions).map(roleName => ({
                value: roleName,
                text: `${roleName} - ${fmtIDR(newWageOptions[roleName])}`
            }));
            
            const roleContainer = $('#edit-attendance-role-container', modalEl);
            roleContainer.innerHTML = createMasterDataSelect('edit-attendance-role', 'Ubah Peran/Tugas', newRoleOptions, '');
            _initCustomSelects(roleContainer); // Inisialisasi ulang dropdown peran yang baru
        });
    }
}

async function handleUpdateAttendance(form) {
    const recordId = form.dataset.id;
    const recordType = form.dataset.type;

    const record = appState.attendanceRecords.find(r => r.id === recordId);
    if (!record) {
        toast('error', 'Data absensi asli tidak ditemukan.');
        return;
    }
    toast('syncing', 'Memperbarui absensi...');
    try {
        const dataToUpdate = {};
        
        if (recordType === 'manual') {
            const newStatus = form.elements.status.value;
            const newProjectId = form.elements['edit-attendance-project'].value;
            const newJobRole = form.elements['edit-attendance-role'].value;
            const customWage = parseFormattedNumber(form.elements.customWage.value);

            let newTotalPay = 0;
            let baseWage = 0;

            // [PERBAIKAN KUNCI LOGIKA UPAH]
            // Prioritas 1: Gunakan upah kustom jika diisi
            if (customWage > 0) {
                baseWage = customWage;
            } 
            // Prioritas 2: Cari upah dari peran yang baru dipilih
            else if (newProjectId && newJobRole) {
                const worker = appState.workers.find(w => w.id === record.workerId);
                baseWage = worker?.projectWages?.[newProjectId]?.[newJobRole] || 0;
            }
            
            // Kalkulasi upah akhir berdasarkan status
            if (newStatus === 'full_day') {
                newTotalPay = baseWage;
            } else if (newStatus === 'half_day') {
                newTotalPay = baseWage / 2;
            } else if (newStatus === 'absent') {
                newTotalPay = 0;
            }

            // Siapkan data untuk di-update
            dataToUpdate.attendanceStatus = newStatus;
            dataToUpdate.totalPay = newTotalPay;
            dataToUpdate.projectId = newProjectId;
            dataToUpdate.jobRole = newJobRole;
            dataToUpdate.customWage = customWage > 0 ? customWage : null; // Simpan upah kustom
            dataToUpdate.dailyWage = customWage > 0 ? 0 : baseWage; // Simpan upah peran jika tidak ada kustom
          
        } else { // type === 'timestamp'
            const date = _getJSDate(record.date);
            const [inH, inM] = form.elements.checkIn.value.split(':');
            const newCheckIn = new Date(date);
            newCheckIn.setHours(inH, inM);

            dataToUpdate.checkIn = Timestamp.fromDate(newCheckIn);
            if (form.elements.checkOut.value) {
                const [outH, outM] = form.elements.checkOut.value.split(':');
                const newCheckOut = new Date(date);
                newCheckOut.setHours(outH, outM);

                // Pastikan checkout tidak lebih awal dari checkin
                if (newCheckOut < newCheckIn) {
                    toast('error', 'Jam keluar tidak boleh lebih awal dari jam masuk.');
                    return;
                }

                const hours = (newCheckOut - newCheckIn) / 3600000;
                const normalHours = Math.min(hours, 8);
                const overtimeHours = Math.max(0, hours - 8);
                const normalPay = normalHours * (record.hourlyWage || 0);
                const overtimePay = overtimeHours * (record.hourlyWage || 0) * 1.5;
                
                dataToUpdate.checkOut = Timestamp.fromDate(newCheckOut);
                dataToUpdate.workHours = hours;
                dataToUpdate.normalHours = normalHours;
                dataToUpdate.overtimeHours = overtimeHours;
                dataToUpdate.totalPay = normalPay + overtimePay;
                dataToUpdate.status = 'completed';
            } else {
                // Jika checkout dikosongkan, kembalikan status ke 'checked_in'
                dataToUpdate.checkOut = null;
                dataToUpdate.workHours = 0;
                dataToUpdate.totalPay = 0;
                dataToUpdate.status = 'checked_in';
            }
        }

        await localDB.attendance_records.where('id').equals(recordId).modify({ ...dataToUpdate, needsSync: 1 });
        await optimisticUpdateDoc(attendanceRecordsCol, recordId, dataToUpdate);
        
        await loadAllLocalDataToState(); 
        
        _logActivity('Mengedit Absensi', { recordId, ...dataToUpdate });
        toast('success', 'Absensi berhasil diperbarui.');
        
        renderPageContent(); 
        closeModal($('#editAttendance-modal'));
        
        // Jika modal jurnal harian masih ada, refresh juga isinya
        if ($('#dataDetail-modal')) {
            handleViewJurnalHarianModal(_getJSDate(record.date).toISOString().slice(0, 10));
        }

    } catch (error) {
        toast('error', 'Gagal memperbarui absensi.');
        console.error(error);
    }
}

async function handleSaveManualAttendance(e) {
    e.preventDefault();
    const form = e.target;
    const dateStr = form.querySelector('#manual-attendance-date').value;
    const projectId = form.querySelector('#manual-attendance-project').value;
    const date = new Date(dateStr);
  
    if (!projectId) {
        toast('error', 'Proyek harus dipilih.');
        return;
    }
    toast('syncing', 'Menyimpan absensi lokal...');
  
    try {
        await localDB.transaction('rw', localDB.attendance_records, async () => {
            const workersOnForm = $$('.attendance-status-selector', form);
            
            const startOfDay = new Date(new Date(date).setHours(0, 0, 0, 0));
            const endOfDay = new Date(new Date(date).setHours(23, 59, 59, 999));
  
            const existingRecordsOnDate = await localDB.attendance_records
              .where('date').between(startOfDay, endOfDay)
              .and(rec => rec.projectId === projectId && rec.type === 'manual')
              .toArray();
            const existingRecordsMap = new Map(existingRecordsOnDate.map(rec => [rec.workerId, rec]));
  
            for (const workerEl of workersOnForm) {
                const workerId = workerEl.dataset.workerId;
                const statusInput = workerEl.querySelector('input:checked');
                if (!statusInput) continue;
  
                const status = statusInput.value;
                const card = workerEl.closest('.manual-attendance-item');
                
                // [PERBAIKAN KUNCI DI SINI]
                // Baca data dari elemen dropdown kustom, bukan <select>
                const hiddenInput = card.querySelector('.wage-role-value');
                const triggerSpan = card.querySelector('.custom-select-trigger span');
                
                if (!hiddenInput || !triggerSpan) {
                    console.error('Elemen dropdown kustom tidak ditemukan untuk pekerja:', workerId);
                    continue; // Lanjut ke pekerja berikutnya jika elemen tidak ada
                }

                const selectedWage = parseFloat(hiddenInput.value);
                const selectedRole = triggerSpan.textContent.trim();
                // --- AKHIR PERBAIKAN ---

                const worker = appState.workers.find(w => w.id === workerId);
                
                let pay = 0;
                if (status === 'full_day') pay = selectedWage;
                if (status === 'half_day') pay = selectedWage / 2;
                
                const existingRecord = existingRecordsMap.get(workerId);
                
                if (existingRecord) {
                    if (status === 'absent') {
                        await localDB.attendance_records.update(existingRecord.localId, { isDeleted: 1, needsSync: 1 });
                    } else {
                        await localDB.attendance_records.update(existingRecord.localId, {
                            attendanceStatus: status,
                            totalPay: pay,
                            jobRole: selectedRole,
                            needsSync: 1, isDeleted: 0
                        });
                    }
                } else {
                    if (status !== 'absent') {
                        await localDB.attendance_records.add({
                            id: generateUUID(),
                            workerId, workerName: worker.workerName, projectId, date,
                            attendanceStatus: status,
                            totalPay: pay,
                            jobRole: selectedRole,
                            isPaid: false, type: 'manual', status: 'completed',
                            needsSync: 1, isDeleted: 0, createdAt: new Date()
                        });
                    }
                }
            }
        });
        _logActivity(`Menyimpan Absensi Manual (Lokal)`, { date: dateStr, projectId });
        toast('success', 'Absensi berhasil disimpan.');
        await _renderManualAttendanceList(dateStr, projectId);
        syncToServer();
    } catch (error) {
        toast('error', 'Gagal menyimpan absensi.');
        console.error(error);
    }
}

async function renderJurnalPage() {
    const container = $('.page-container');
    const mainTabs = [{
        id: 'jurnal_absensi',
        label: 'Jurnal Absensi'
    }, {
        id: 'rekap_gaji',
        label: 'Rekap Gaji'
    }];
    container.innerHTML = `
            <div id="jurnal-main-nav" class="sub-nav two-tabs">
                ${mainTabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

    const renderMainTabContent = async (mainTabId) => {
        const mainLabel = mainTabs.find(t => t.id === mainTabId)?.label || '';
        setBreadcrumb(['Jurnal', mainLabel]);
        appState.activeSubPage.set('jurnal', mainTabId);
        const contentContainer = $("#sub-page-content");
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        if (mainTabId === 'jurnal_absensi') {
            _renderJurnalAbsensiTabs(contentContainer);
        } else if (mainTabId === 'rekap_gaji') {
            _renderRekapGajiTabs(contentContainer);
        }
    };

    // [PERUBAHAN] Menerapkan event listener animasi untuk Tab Utama
    const mainNavItems = $$('#jurnal-main-nav .sub-nav-item');
    mainNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#jurnal-main-nav .sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(mainNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#sub-page-content"),
                () => renderMainTabContent(btn.dataset.tab),
                direction
            );
        });
    });
    
    const lastMainTab = appState.activeSubPage.get('jurnal') || mainTabs[0].id;
    $(`.sub-nav-item[data-tab="${lastMainTab}"]`)?.classList.add('active');
    await renderMainTabContent(lastMainTab);
    _setActiveListeners(['attendance_records', 'bills']);
}

function _renderJurnalAbsensiTabs(container) {
    const tabs = [{
        id: 'harian',
        label: 'Harian'
    }, {
        id: 'per_pekerja',
        label: 'Per Pekerja'
    }];
    container.innerHTML = `
            <div id="jurnal-absensi-sub-nav" class="sub-nav two-tabs" style="margin-top: 1rem;">
                 ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="jurnal-absensi-content"></div>
        `;

    const renderSubTab = async (tabId) => {
        const content = $('#jurnal-absensi-content');
        content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        if (tabId === 'harian') await _renderJurnalHarianView(content);
        else if (tabId === 'per_pekerja') await _renderJurnalPerPekerjaView(content);
    };

    // [PERUBAHAN] Menerapkan event listener animasi pada sub-tab Jurnal Absensi
    const subNavItems = $$('#jurnal-absensi-sub-nav .sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#jurnal-absensi-sub-nav .sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#jurnal-absensi-content"),
                () => renderSubTab(btn.dataset.tab),
                direction
            );
        });
    });

    renderSubTab(tabs[0].id);
}

async function _renderJurnalHarianView(container) {
  await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
  const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
  const sortedDays = Object.entries(groupedByDay).sort((a, b) => new Date(b[0]) - new Date(a[0]));
  if (sortedDays.length === 0) {
      container.innerHTML = '<p class="empty-state">Belum ada data absensi.</p>';
      return;
  }
  const listHTML = sortedDays.map(([date, data]) => {
      const dayDate = new Date(date);
      const formattedDate = dayDate.toLocaleDateString('id-ID', {
          weekday: 'long',
          day: 'numeric',
          month: 'long'
      });
      return `
              <div class="card card-list-item" data-action="view-jurnal-harian" data-date="${date}">
                  <div class="card-list-item-content">
                      <div class="card-list-item-details">
                          <h5 class="card-list-item-title">${formattedDate}</h5>
                          <p class="card-list-item-subtitle">${data.workerCount} Pekerja Hadir</p>
                      </div>
                      <div class="card-list-item-amount-wrapper">
                          <strong class="card-list-item-amount negative">${fmtIDR(data.totalUpah)}</strong>
                          <p class="card-list-item-repayment-info">Total Beban Upah</p>
                      </div>
                  </div>
              </div>`;
  }).join('');
  container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
}

function _groupAttendanceByDay(records) {
  return (records || []).reduce((acc, rec) => {
      // [PERBAIKAN] Gunakan _getJSDate
      const dateStr = _getJSDate(rec?.date).toISOString().slice(0, 10);
      if (!acc[dateStr]) {
          acc[dateStr] = {
              records: [],
              totalUpah: 0,
              workerCount: 0
          };
      }
      acc[dateStr].records.push(rec);
      acc[dateStr].totalUpah += (rec.totalPay || 0);
      if ((rec.totalPay || 0) > 0) acc[dateStr].workerCount++;
      return acc;
  }, {});
}

async function handleViewWorkerRecapModal(workerId) {
    const worker = appState.workers.find(w => w.id === workerId);
    if (!worker) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }

    toast('syncing', `Memuat riwayat lengkap ${worker.workerName}...`);

    try {
        // Memuat semua data relevan untuk memastikan kelengkapan
        const salaryBillsQuery = query(billsCol, where('type', '==', 'gaji'));
        const [salaryBillsSnap, attendanceRecordsSnap] = await Promise.all([
            getDocs(salaryBillsQuery),
            getDocs(attendanceRecordsCol)
        ]);

        const allSalaryBillsFromServer = salaryBillsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        appState.attendanceRecords = attendanceRecordsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        
        const nonSalaryBillsInState = appState.bills.filter(b => b.type !== 'gaji');
        appState.bills = [...nonSalaryBillsInState, ...allSalaryBillsFromServer];

        // Filter ini sudah benar, bisa membaca format data LAMA dan BARU
        const salaryBillsForWorker = appState.bills.filter(bill => {
            if (bill.type !== 'gaji') return false;
            const isInNewFormat = bill.workerDetails && bill.workerDetails.some(detail => (detail.id === workerId || detail.workerId === workerId));
            const isInOldFormat = bill.workerId === workerId;
            return isInNewFormat || isInOldFormat;
        });

        if (salaryBillsForWorker.length === 0) {
            hideToast();
            createModal('dataDetail', {
                title: `Buku Besar Gaji: ${worker.workerName}`,
                content: '<p class="empty-state">Belum ada data tagihan gaji yang tercatat untuk pekerja ini.</p>'
            });
            return;
        }

        const allRecordIds = salaryBillsForWorker
            .flatMap(b => {
                if (b.workerDetails) { // Format baru
                    return b.workerDetails.filter(d => (d.id === workerId || d.workerId === workerId)).flatMap(d => d.recordIds || []);
                }
                if (b.recordIds) { // Format lama
                    return b.recordIds;
                }
                return [];
            });
        
        const relatedRecords = allRecordIds
            .map(id => appState.attendanceRecords.find(rec => rec.id === id))
            .filter(Boolean)
            .sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

        let allPaymentsForWorker = [];
        for (const bill of salaryBillsForWorker) {
            const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', bill.id, 'payments');
            const paymentsSnap = await getDocs(paymentsColRef);
            const allPaymentsInBill = paymentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // --- INI LOGIKA KUNCI YANG DIPERBARUI ---
            if (bill.workerDetails) { // Ini adalah tagihan gabungan (format baru)
                const workerDetail = bill.workerDetails.find(d => d.id === workerId || d.workerId === workerId);
                
                // Cek apakah ada pembayaran spesifik untuk pekerja ini
                const individualPayments = allPaymentsInBill.filter(p => p.workerId === workerId);
                allPaymentsForWorker.push(...individualPayments);

                // Jika tagihan sudah lunas dan tidak ada pembayaran individual,
                // asumsikan upah pekerja ini termasuk dalam pembayaran lunas gabungan.
                if (bill.status === 'paid' && individualPayments.length === 0 && workerDetail) {
                    allPaymentsForWorker.push({
                        // Kita buat objek pembayaran "virtual" untuk ditampilkan di riwayat
                        date: bill.paidAt || bill.updatedAt || bill.createdAt, // Gunakan tanggal lunas tagihan
                        amount: workerDetail.amount,
                        note: "Pembayaran Lunas (Gabungan)"
                    });
                }

            } else { // Ini adalah tagihan perorangan (format lama)
                allPaymentsForWorker.push(...allPaymentsInBill);
            }
            // --- AKHIR DARI LOGIKA KUNCI ---
        }
        allPaymentsForWorker.sort((a, b) => _getJSDate(b.date) - _getJSDate(a.date));

        const totalEarned = relatedRecords.reduce((sum, rec) => sum + (rec.totalPay || 0), 0);
        const totalPaid = allPaymentsForWorker.reduce((sum, p) => sum + (p.amount || 0), 0);
        const totalUnpaid = totalEarned - totalPaid;

        const attendanceHistoryHTML = relatedRecords.length > 0 ? relatedRecords.map(rec => {
            const project = appState.projects.find(p => p.id === rec.projectId);
            const date = _getJSDate(rec.date).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
            return `<div class="jurnal-detail-item"><div class="item-main"><span class="item-date">${date}</span><span class="item-project">${project?.projectName || 'N/A'}</span></div><div class="item-secondary"><strong class="item-amount">${fmtIDR(rec.totalPay || 0)}</strong></div></div>`;
        }).join('') : '<p class="empty-state-small">Belum ada riwayat absensi yang direkap.</p>';

        const paymentHistoryHTML = allPaymentsForWorker.length > 0 ? _createPaymentHistoryHTML(allPaymentsForWorker) : '<p class="empty-state-small">Belum ada riwayat pembayaran.</p>';

        const content = `<div class="payment-summary" style="margin-bottom: 1.5rem;"><div><span>Total Upah Dihasilkan:</span><strong>${fmtIDR(totalEarned)}</strong></div><div><span>Total Telah Dibayar:</span><strong class="positive">${fmtIDR(totalPaid)}</strong></div><div class="remaining"><span>Sisa Gaji (Tagihan):</span><strong class="negative">${fmtIDR(totalUnpaid)}</strong></div></div><h5 class="detail-section-title">Riwayat Absensi (Upah Dihasilkan)</h5><div class="jurnal-detail-list">${attendanceHistoryHTML}</div><h5 class="detail-section-title" style="margin-top:1.5rem;">Riwayat Pembayaran Gaji</h5>${paymentHistoryHTML}`;
        
        hideToast();
        createModal('dataDetail', {
            title: `Buku Besar Gaji: ${worker.workerName}`,
            content
        });

    } catch (error) {
        hideToast();
        toast('error', 'Gagal memuat riwayat lengkap.');
        console.error("Gagal membuat rekap detail pekerja:", error);
    }
}

async function _renderJurnalPerPekerjaView(container) {
    await Promise.all([
        fetchAndCacheData('workers', workersCol, 'workerName'),
        fetchAndCacheData('professions', collection(db, 'teams', TEAM_ID, 'professions'), 'professionName')
    ]);
    const activeWorkers = appState.workers.filter(w => w.status === 'active');
    if (activeWorkers.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada data pekerja aktif.</p>';
        return;
    }
    const listHTML = activeWorkers.map(worker => {
        const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
        return `
                 <div class="card card-list-item" data-action="view-worker-recap" data-worker-id="${worker.id}">
                    <div class="card-list-item-content">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${worker.workerName}</h5>
                            <p class="card-list-item-subtitle">${profession}</p>
                        </div>
                         <div class="card-list-item-amount-wrapper">
                             <span class="material-symbols-outlined" style="font-size: 2rem; color: var(--text-muted);">chevron_right</span>
                        </div>
                    </div>
                </div>
            `;
    }).join('');
    container.innerHTML = `<div style="padding-bottom: 2rem;">${listHTML}</div>`;
  }
// GANTI SELURUH FUNGSI INI DI script.js

async function handleViewJurnalHarianModal(dateStr) {
    toast('syncing', 'Memuat detail jurnal...');
    await Promise.all([
        fetchAndCacheData('projects', projectsCol, 'projectName'),
        fetchAndCacheData('workers', workersCol, 'workerName')
    ]);
    hideToast();
    const date = new Date(dateStr);
    const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
    const dayData = groupedByDay[dateStr];
    if (!dayData) {
        toast('error', 'Tidak ada data untuk tanggal ini.');
        return;
    }
    const formattedDate = date.toLocaleDateString('id-ID', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    const workersByProject = dayData.records.reduce((acc, rec) => {
        const projectId = rec.projectId || 'tanpa_proyek';
        if (!acc[projectId]) {
            acc[projectId] = [];
        }
        acc[projectId].push(rec);
        return acc;
    }, {});
    
    const projectSectionsHTML = Object.entries(workersByProject).map(([projectId, records]) => {
        const project = appState.projects.find(p => p.id === projectId);
        const projectName = project ? project.projectName : 'Proyek Tidak Diketahui';
        
        const workersHTML = records.sort((a, b) => (a.workerName || '').localeCompare(b.workerName || '')).map(rec => {
            let statusBadge = '';
            if (rec.attendanceStatus === 'full_day') statusBadge = `<span class="status-badge status-hadir">Hadir</span>`;
            else if (rec.attendanceStatus === 'half_day') statusBadge = `<span class="status-badge status-setengah">1/2 Hari</span>`;
            else statusBadge = `<span class="status-badge status-absen">Absen</span>`;

            const worker = appState.workers.find(w => w.id === rec.workerId);
            const workerName = worker ? worker.workerName : (rec.workerName || 'Pekerja Dihapus');

            // [PERBAIKAN KUNCI DI SINI]
            // Tambahkan tombol edit jika pengguna bukan 'Viewer'
            const editButtonHTML = isViewer() ? '' : `
                <button class="btn-icon" data-action="edit-attendance" data-id="${rec.id}" title="Edit Absensi">
                    <span class="material-symbols-outlined">edit</span>
                </button>
            `;
            // --- AKHIR PERBAIKAN ---

            return `
            <div class="jurnal-pekerja-item card">
                <div class="jurnal-pekerja-info">
                    <strong>${workerName}</strong>
                </div>
                <div class="jurnal-pekerja-status">
                    <strong>${fmtIDR(rec.totalPay || 0)}</strong>
                    ${statusBadge}
                </div>
                ${editButtonHTML} 
            </div>
            `;
        }).join('');
        
        return `
            <h5 class="detail-section-title">${projectName}</h5>
            <div class="jurnal-pekerja-list">${workersHTML}</div>
        `;
    }).join('');

    const content = `
        <div class="payment-summary" style="margin-bottom: 1.5rem;">
            <div><span>Total Pekerja:</span><strong>${dayData.workerCount} Orang</strong></div>
            <div class="remaining"><span>Total Upah:</span><strong>${fmtIDR(dayData.totalUpah)}</strong></div>
        </div>
        ${projectSectionsHTML}
    `;
    
    createModal('dataDetail', {
        title: `Jurnal Harian: ${formattedDate}`,
        content
    });
}

async function _renderRekapGajiTabs(container) {
    const tabs = [{
        id: 'buat_rekap',
        label: 'Buat Rekap Baru'
    }, {
        id: 'riwayat_rekap',
        label: 'Riwayat Rekap'
    }];
    container.innerHTML = `
            <div id="rekap-gaji-sub-nav" class="sub-nav two-tabs" style="margin-top: 1rem;">
                 ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0?'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="rekap-gaji-content"></div>
        `;

    const renderSubTab = async (tabId) => {
        const content = $('#rekap-gaji-content');
        content.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        if (tabId === 'buat_rekap') {
            content.innerHTML = _getSalaryRecapHTML();
            if (!isViewer()) {
                $('#generate-recap-btn')?.addEventListener('click', () => {
                    const startDate = $('#recap-start-date').value;
                    const endDate = $('#recap-end-date').value;
                    if (startDate && endDate) generateSalaryRecap(new Date(startDate), new Date(endDate));
                    else toast('error', 'Silakan pilih rentang tanggal.');
                });
            } else {
                generateSalaryRecap(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date());
            }
        } else if (tabId === 'riwayat_rekap') {
            await _renderRiwayatRekapView(content);
        }
    };

    // [PERUBAHAN] Menerapkan event listener animasi pada sub-tab Rekap Gaji
    const subNavItems = $$('#rekap-gaji-sub-nav .sub-nav-item');
    subNavItems.forEach((btn, index) => {
        btn.addEventListener('click', (e) => {
            const currentActive = $('#rekap-gaji-sub-nav .sub-nav-item.active');
            if (currentActive === btn) return;

            const currentIndex = Array.from(subNavItems).indexOf(currentActive);
            const direction = index > currentIndex ? 'forward' : 'backward';

            if(currentActive) currentActive.classList.remove('active');
            btn.classList.add('active');

            _animateTabSwitch(
                $("#rekap-gaji-content"),
                () => renderSubTab(btn.dataset.tab),
                direction
            );
        });
    });
    
    await renderSubTab(tabs[0].id);
}

function _getSalaryRecapHTML() {
    const today = new Date();
    const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);
    return `
        <div class="card card-pad">
            <h5 class="section-title-owner" style="margin-top:0;">Pilih Periode Rekap</h5>
            <div class="recap-filters">
                <div class="form-group"><label>Tanggal Mulai</label><input type="date" id="recap-start-date" value="${firstDayOfMonth}" ${isViewer()?'disabled' : ''}></div>
                <div class="form-group"><label>Tanggal Selesai</label><input type="date" id="recap-end-date" value="${todayStr}" ${isViewer()?'disabled' : ''}></div>
                ${isViewer()?'' : `
                    <button id="generate-recap-btn" class="btn btn-primary">Tampilkan Rekap</button>
                    
                    <button id="fix-stuck-data-btn" class="btn btn-danger" data-action="fix-stuck-attendance">
                        <span class="material-symbols-outlined">build_circle</span> Hitung Ulang & Perbaiki
                    </button>
                `}
            </div>
        </div>
                <div id="recap-actions-container" class="card card-pad" style="margin-top: 1.5rem; display: none;">
             <div class="rekap-actions" style="grid-template-columns: 1fr 1fr;">
                 <button id="generate-selected-btn" class="btn" data-action="generate-selected-salary-bill" disabled>Buat Tagihan (Terpilih)</button>
                 <button id="generate-all-btn" class="btn btn-primary" data-action="generate-all-salary-bill">Buat Tagihan (Semua)</button>
             </div>
        </div>
        <div id="recap-results-container" style="margin-top: 1.5rem;">
             <p class="empty-state-small">Pilih rentang tanggal dan klik "Tampilkan Rekap" untuk melihat hasilnya.</p>
        </div>
    `;
  }

  async function handleRecalculateWages() {
    const startDateStr = $('#recap-start-date').value;
    const endDateStr = $('#recap-end-date').value;

    if (!startDateStr || !endDateStr) {
        toast('error', 'Silakan pilih rentang tanggal terlebih dahulu.');
        return;
    }

    createModal('confirmUserAction', {
        message: 'Anda akan menghitung ulang upah untuk semua absensi yang BELUM DIBAYAR dalam periode ini menggunakan tarif terbaru dari master data. Ini akan memperbaiki data lama yang upahnya 0. Lanjutkan?',
        onConfirm: async () => {
            toast('syncing', 'Mencari & menghitung ulang upah...');
            const startDate = new Date(startDateStr);
            const endDate = new Date(endDateStr);
            endDate.setHours(23, 59, 59, 999);

            try {
                await fetchAndCacheData('workers', workersCol, 'workerName');

                const q = query(attendanceRecordsCol,
                    where('isPaid', '==', false),
                    where('date', '>=', startDate),
                    where('date', '<=', endDate)
                );
                const snapshot = await getDocs(q);

                if (snapshot.empty) {
                    toast('info', 'Tidak ditemukan absensi yang perlu dihitung ulang.');
                    return;
                }

                const batch = writeBatch(db);
                let updatedCount = 0;

                snapshot.forEach(doc => {
                    const record = { id: doc.id, ...doc.data() };
                    const worker = appState.workers.find(w => w.id === record.workerId);
                    if (!worker) return;

                    // Gunakan logika cerdas yang sama seperti di generateSalaryRecap
                    let baseWage = 0;
                    const projectWages = worker.projectWages?.[record.projectId];
                    if (typeof projectWages === 'object' && projectWages !== null) {
                        baseWage = projectWages[record.jobRole] || Object.values(projectWages)[0] || 0;
                    } else if (typeof projectWages === 'number') {
                        baseWage = projectWages;
                    }
                    
                    let newTotalPay = 0;
                    if (record.type === 'manual') {
                        if (record.attendanceStatus === 'full_day') newTotalPay = baseWage;
                        else if (record.attendanceStatus === 'half_day') newTotalPay = baseWage / 2;
                    } else if (record.type === 'timestamp') {
                        const hourlyWage = baseWage / 8;
                        newTotalPay = ((record.normalHours || 0) * hourlyWage) + ((record.overtimeHours || 0) * hourlyWage * 1.5);
                    }
                    
                    if (Math.round(newTotalPay) !== Math.round(record.totalPay || 0)) {
                        batch.update(doc.ref, { totalPay: newTotalPay });
                        updatedCount++;
                    }
                });

                if (updatedCount > 0) {
                    await batch.commit();
                    toast('success', `${updatedCount} data upah berhasil dikoreksi dan diperbarui!`);
                    await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
                    generateSalaryRecap(startDate, endDate); // Tampilkan ulang rekap dengan data baru
                } else {
                    toast('info', 'Semua data upah sudah sesuai dengan tarif terbaru.');
                }

            } catch (error) {
                console.error("Gagal menghitung ulang upah:", error);
                toast('error', 'Terjadi kesalahan saat proses hitung ulang.');
            }
        }
    });
}

async function generateSalaryRecap(startDate, endDate) {
    const resultsContainer = $('#recap-results-container');
    const actionsContainer = $('#recap-actions-container');
    if (!resultsContainer || !actionsContainer) return;
    
    resultsContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    actionsContainer.style.display = 'none';

    toast('syncing', 'Memuat data master & absensi...');

    await fetchAndCacheData('workers', workersCol, 'workerName');
    
    endDate.setHours(23, 59, 59, 999);
    
    const q = query(attendanceRecordsCol,
        where('status', '==', 'completed'),
        where('isPaid', '==', false),
        where('date', '>=', startDate),
        where('date', '<=', endDate)
    );

    const snap = await getDocs(q);
    
    if (snap.empty) {
        hideToast();
        resultsContainer.innerHTML = `<p class="empty-state">Tidak ada data gaji yang belum dibayar pada periode ini.</p>`;
        return;
    }
    
    toast('syncing', 'Menghitung upah berdasarkan data terbaru...');
    const salaryRecap = new Map();

    snap.forEach(doc => {
        const record = { id: doc.id, ...doc.data() };
        const worker = appState.workers.find(w => w.id === record.workerId);
        if (!worker) return;

        // [PERBAIKAN KUNCI] Logika pencarian upah yang lebih cerdas
        let baseWage = 0;
        const projectWages = worker.projectWages?.[record.projectId];

        if (typeof projectWages === 'object' && projectWages !== null) {
            // Coba format BARU (multi-peran)
            baseWage = projectWages[record.jobRole] || 0;
            // Jika gagal (jobRole tidak ada), coba cari peran 'default'
            if (baseWage === 0) {
                const defaultRole = Object.keys(projectWages).find(k => k.toLowerCase().includes('default'));
                baseWage = projectWages[defaultRole] || 0;
            }
        } else if (typeof projectWages === 'number') {
            // Fallback ke format LAMA (satu upah per proyek)
            baseWage = projectWages;
        }
        
        let finalPay = 0;
        if (record.type === 'manual') {
            if (record.attendanceStatus === 'full_day') finalPay = baseWage;
            else if (record.attendanceStatus === 'half_day') finalPay = baseWage / 2;
        } else if (record.type === 'timestamp') {
            const hourlyWage = baseWage / 8;
            const normalPay = (record.normalHours || 0) * hourlyWage;
            const overtimePay = (record.overtimeHours || 0) * hourlyWage * 1.5;
            finalPay = normalPay + overtimePay;
        }
        
        const workerId = record.workerId;
        if (!salaryRecap.has(workerId)) {
            salaryRecap.set(workerId, {
                workerName: worker.workerName,
                totalPay: 0,
                recordIds: [],
                workerId: workerId
            });
        }
        const workerData = salaryRecap.get(workerId);
        workerData.totalPay += finalPay;
        workerData.recordIds.push(record.id);
    });

    hideToast();

    const recapData = [...salaryRecap.values()];
    const tableHTML = `
        <div class="card card-pad">
            <div class="recap-table-wrapper">
                <table class="recap-table" id="salary-recap-table">
                    <thead>
                        <tr>
                            ${isViewer() ? '' : `<th><input type="checkbox" id="select-all-recap"></th>`}
                            <th>Nama Pekerja</th>
                            <th>Total Upah</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${recapData.map(worker => `
                            <tr data-worker-id="${worker.workerId}" data-worker-name="${worker.workerName}" data-total-pay="${worker.totalPay}" data-record-ids="${worker.recordIds.join(',')}" class="recap-row">
                                ${isViewer() ? '' : `<td><input type="checkbox" class="recap-checkbox"></td>`}
                                <td>${worker.workerName}</td>
                                <td><strong>${fmtIDR(worker.totalPay)}</strong></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    resultsContainer.innerHTML = tableHTML;
    actionsContainer.style.display = 'block';
    if (!isViewer()) _attachRecapTableListeners(recapData);
}

function _attachRecapTableListeners(recapData) {
  const table = $('#salary-recap-table');
  if (!table) return;
  const selectAll = $('#select-all-recap');
  const checkBoxes = $$('.recap-checkbox');
  const generateSelectedBtn = $('#generate-selected-btn');
  const updateButtonState = () => {
      const selectedCount = $$('.recap-checkbox:checked').length;
      generateSelectedBtn.disabled = selectedCount === 0;
      generateSelectedBtn.textContent = `Buat Tagihan (${selectedCount} Terpilih)`;
  };
  selectAll.addEventListener('change', () => {
      checkBoxes.forEach(cb => cb.checked = selectAll.checked);
      updateButtonState();
  });
  checkBoxes.forEach(cb => {
      cb.addEventListener('change', () => {
          const allChecked = checkBoxes.every(c => c.checked);
          selectAll.checked = allChecked;
          updateButtonState();
      });
  });
  updateButtonState();
}

async function handleGenerateBulkSalaryBill(selectedWorkers, startDate, endDate) {
    if (selectedWorkers.length === 0) {
        toast('error', 'Tidak ada pekerja yang dipilih.');
        return;
    }

    const grandTotal = selectedWorkers.reduce((sum, worker) => sum + worker.totalPay, 0);
    const allRecordIds = selectedWorkers.flatMap(worker => worker.recordIds);
    const description = selectedWorkers.length === 1 ?
        `Gaji ${selectedWorkers[0].workerName} periode ${startDate.toLocaleDateDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}` :
        `Gaji Gabungan ${selectedWorkers.length} pekerja periode ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`;

    createModal('confirmGenerateBill', {
        message: `Anda akan membuat 1 tagihan gabungan sebesar <strong>${fmtIDR(grandTotal)}</strong> untuk <strong>${selectedWorkers.length} pekerja</strong>. Lanjutkan?`,
        onConfirm: async () => {
            toast('syncing', 'Membuat tagihan gaji massal...');
            try {
                const billId = generateUUID();
                const billRef = doc(billsCol, billId);
                const batch = writeBatch(db);

                const newBillDataForFirestore = {
                    description,
                    amount: grandTotal,
                    paidAmount: 0,
                    dueDate: Timestamp.fromDate(new Date()), // Lebih konsisten menggunakan fromDate
                    status: 'unpaid',
                    type: 'gaji',
                    workerDetails: selectedWorkers.map(w => ({
                        id: w.workerId,
                        name: w.workerName,
                        amount: w.totalPay,
                        recordIds: w.recordIds
                    })),
                    recordIds: allRecordIds,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(), // Praktik terbaik: tambahkan updatedAt
                    rev: 1
                };

                batch.set(billRef, newBillDataForFirestore);

                allRecordIds.forEach(recordId => {
                    batch.update(doc(attendanceRecordsCol, recordId), {
                        billId: billRef.id
                    });
                });

                await batch.commit();

                _logActivity(`Membuat Tagihan Gaji Massal`, { billId, amount: grandTotal });
                toast('success', 'Tagihan gaji gabungan berhasil dibuat.');

                // Buat objek untuk state lokal dengan format tanggal standar JavaScript
                const newBillObjectForState = {
                    ...newBillDataForFirestore,
                    id: billId,
                    dueDate: new Date(), // Gunakan objek Date standar untuk state lokal
                    createdAt: new Date()
                };
                
                // Hapus serverTimestamp agar tidak error saat di-render
                delete newBillObjectForState.updatedAt; 

                appState.bills.unshift(newBillObjectForState);

                await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
                renderJurnalPage();

            } catch (error) {
                toast('error', 'Gagal membuat tagihan gaji.');
                console.error('Error generating bulk salary bill:', error);
            }
        }
    });
}

async function _renderRiwayatRekapView(container) {
    const salaryBills = appState.bills.filter(b => b.type === 'gaji').sort((a, b) => _getJSDate(b.createdAt) - _getJSDate(a.createdAt));

    if (salaryBills.length === 0) {
        container.innerHTML = '<p class="empty-state">Belum ada riwayat rekap gaji yang dibuat.</p>';
        return;
    }

    const listHTML = salaryBills.map(bill => {
        const date = _getJSDate(bill.createdAt).toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'});
        const statusClass = bill.status === 'paid' ? 'positive' : 'negative';
        const statusText = bill.status === 'paid' ? 'Lunas' : 'Belum Lunas';
        const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints||0)>0);

        // Menyiapkan tombol aksi untuk digeser
        const swipeBtns = `
            <button class="btn-icon" data-action="open-bill-detail" data-id="${bill.id}" data-type="bill" title="Lihat Detail"><span class="material-symbols-outlined">visibility</span></button>
            <button class="btn-icon btn-icon-danger" data-action="delete-salary-bill" data-id="${bill.id}" title="Batalkan Rekap"><span class="material-symbols-outlined">delete</span></button>
        `;

        return `
            <div class="dense-list-item" data-id="${bill.id}" style="position:relative; overflow:hidden;">
                <div class="swipe-actions">
                    ${swipeBtns}
                </div>

                <div class="item-main-content" data-action="open-bill-detail" data-id="${bill.id}" data-type="bill">
                    <strong class="item-title">${bill.description}</strong>
                    <span class="item-subtitle">Dibuat pada: ${date}</span>
                    <div class="item-details">
                        <strong class="item-amount">${fmtIDR(bill.amount)}</strong>
                        <span class="status-badge ${statusClass}">${statusText}</span>
                    </div>
                </div>

                ${isTouch ? '' : `
                    <div class="item-actions">
                        <button class="btn-icon" data-action="open-recap-actions" data-id="${bill.id}" title="Aksi Lainnya">
                            <span class="material-symbols-outlined">more_vert</span>
                        </button>
                    </div>
                `}
            </div>
        `;
    }).join('');

    container.innerHTML = `<div class="dense-list-container">${listHTML}</div>`;
    
    // Panggil fungsi inisialisasi gestur geser setelah HTML dirender
    setTimeout(() => _attachSwipeHandlers('#rekap-gaji-content'), 50);
}

async function handleRemoveWorkerFromRecap(billId, workerId) {
    const bill = appState.bills.find(b => b.id === billId);
    const worker = bill?.workerDetails?.find(w => (w.id === workerId || w.workerId === workerId));
    
    if (!bill || !worker) {
        toast('error', 'Data tagihan atau pekerja tidak ditemukan.');
        return;
    }

    createModal('confirmUserAction', {
        message: `Anda yakin ingin mengeluarkan <strong>${worker.name}</strong> dari rekap ini? Tagihan akan disesuaikan dan absensi pekerja ini akan bisa direkap ulang.`,
        onConfirm: async () => {
            toast('syncing', `Memproses pengeluaran ${worker.name}...`);
            try {
                const billRef = doc(billsCol, billId);

                // 1. PENGAMAN: Cek apakah sudah ada pembayaran
                const paymentsColRef = collection(billRef, 'payments');
                const paymentsSnap = await getDocs(paymentsColRef);
                const hasPaymentForWorker = !paymentsSnap.empty && paymentsSnap.docs.some(doc => doc.data().workerId === workerId);
                
                if (bill.status === 'paid' || hasPaymentForWorker) {
                    toast('error', `Pekerja tidak bisa dikeluarkan karena pembayaran sudah tercatat untuknya atau tagihan sudah lunas.`);
                    return;
                }

                // 2. Siapkan data untuk diupdate
                const workerToRemove = bill.workerDetails.find(w => (w.id === workerId || w.workerId === workerId));
                const amountToRemove = workerToRemove.amount || 0;
                const recordIdsToReset = workerToRemove.recordIds || [];
                
                const newWorkerDetails = bill.workerDetails.filter(w => (w.id !== workerId && w.workerId !== workerId));
                const newRecordIds = newWorkerDetails.flatMap(w => w.recordIds || []);

                const batch = writeBatch(db);

                // 3. Update Tagihan Gabungan
                batch.update(billRef, {
                    amount: increment(-amountToRemove),
                    workerDetails: newWorkerDetails,
                    recordIds: newRecordIds
                });

                // 4. Reset absensi pekerja yang dikeluarkan
                recordIdsToReset.forEach(id => {
                    const recordRef = doc(attendanceRecordsCol, id);
                    batch.update(recordRef, { billId: null });
                });

                await batch.commit();

                await _logActivity(`Mengeluarkan Pekerja dari Rekap: ${worker.name}`, { billId, workerId });
                toast('success', `${worker.name} berhasil dikeluarkan dari rekap.`);
                
                // 5. Muat ulang data dan refresh tampilan
                await fetchAndCacheData('bills', billsCol);
                closeModal($('#dataDetail-modal')); // Tutup modal lama
                renderPageContent(); // Render ulang halaman Jurnal/Tagihan

            } catch (error) {
                toast('error', 'Gagal memproses. Coba lagi.');
                console.error('Error removing worker from recap:', error);
            }
        }
    });
}

async function handleDeleteSalaryBill(billId) {
    createModal('confirmDelete', {
        message: 'Membatalkan rekap akan menghapus tagihan ini dan mengembalikan status absensi terkait menjadi "belum dibayar". Anda bisa membuat rekap baru setelahnya. Lanjutkan?',
        onConfirm: async () => {
            toast('syncing', 'Memeriksa pembayaran & membatalkan rekap...');
            try {
                const billRef = doc(billsCol, billId);
                
                // --- PENAMBAHAN KODE PENGAMAN ---
                const paymentsColRef = collection(billRef, 'payments');
                const paymentsSnap = await getDocs(paymentsColRef);
                if (!paymentsSnap.empty) {
                    toast('error', `Tagihan ini tidak bisa dibatalkan karena sudah memiliki ${paymentsSnap.size} riwayat pembayaran.`);
                    return;
                }
                // --- AKHIR PENAMBAHAN ---

                const billSnap = await getDoc(billRef);
                if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan');
                
                const recordIds = billSnap.data().recordIds || [];

                const batch = writeBatch(db);
                // Reset status absensi
                recordIds.forEach(id => {
                    const recordRef = doc(attendanceRecordsCol, id);
                    batch.update(recordRef, { isPaid: false, billId: null });
                });
                // Hapus tagihan
                batch.delete(billRef);

                await batch.commit();
                await _logActivity(`Membatalkan Rekap Gaji`, { billId });
                toast('success', 'Rekap gaji berhasil dibatalkan.');
                
                await fetchAndCacheData('bills', billsCol);
                renderJurnalPage();

            } catch (error) {
                toast('error', 'Gagal membatalkan rekap.');
                console.error('Error deleting salary bill:', error);
            }
        }
    });
}

async function handleFixStuckAttendanceModal() {
  await fetchAndCacheData('workers', workersCol, 'workerName');
  const workerOptions = [{
      value: 'all',
      text: '� Semua Pekerja �'
  }, ...appState.workers.filter(w => w.status === 'active').map(w => ({
      value: w.id,
      text: w.workerName
  }))];
  const content = `
          <form id="fix-attendance-form">
              <p class="confirm-modal-text">Fitur ini akan secara paksa mereset status absensi yang 'lunas' tanpa tagihan menjadi 'belum lunas'.</p>
              ${createMasterDataSelect('fix-worker-id', 'Pilih Pekerja (atau Semua)', workerOptions, 'all')}
              <div class="recap-filters" style="padding:0; margin-top: 1rem;">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" name="startDate" required></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" name="endDate" required></div>
              </div>
              <div class="modal-footer" style="margin-top: 1.5rem;"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-danger">Jalankan Perbaikan</button></div>
          </form>
      `;
  createModal('dataDetail', {
      title: 'Perbaiki Data Absensi',
      content
  });
  _initCustomSelects($('#dataDetail-modal'));
  $('#fix-attendance-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const workerId = e.target.elements['fix-worker-id'].value;
      let msg = 'Anda yakin ingin mereset status absensi untuk pekerja dan periode ini?';
      if (workerId === 'all') {
          msg = 'PERINGATAN: Anda akan mereset status LUNAS menjadi BELUM LUNAS untuk SEMUA pekerja pada periode ini. Lanjutkan hanya jika Anda yakin.';
      }
      createModal('confirmUserAction', {
          message: msg,
          onConfirm: () => _forceResetAttendanceStatus(e.target)
      });
  });
}
// --- [TAMBAHKAN KEMBALI FUNGSI-FUNGSI INI] ---

// Fungsi untuk kompresi gambar
async function _compressImage(file, quality = 0.85, maxWidth = 1024) {
  return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = (event) => {
          const img = new Image();
          img.src = event.target.result;
          img.onload = () => {
              const canvas = document.createElement('canvas');
              let {
                  width,
                  height
              } = img;
              if (width > maxWidth) {
                  height = (maxWidth / width) * height;
                  width = maxWidth;
              }
              canvas.width = width;
              canvas.height = height;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(img, 0, 0, width, height);
              canvas.toBlob((blob) => {
                  if (blob) {
                      resolve(new File([blob], file.name, {
                          type: file.type
                      }));
                  } else {
                      reject(new Error('Gagal membuat blob gambar.'));
                  }
              }, file.type, quality);
          };
          img.onerror = reject;
      };
      reader.onerror = reject;
  });
}
async function _uploadFileToCloudinary(file) {
  const CLOUDINARY_CLOUD_NAME = "dcjp0fxvb";
  const CLOUDINARY_UPLOAD_PRESET = "BanFlex.Co-Upload";
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;
  try {
      const compressedFile = await _compressImage(file);
      const formData = new FormData();
      formData.append('file', compressedFile);
      formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
      toast('syncing', `Mengupload ${file.name}...`, 999999);
      const response = await fetch(url, {
          method: 'POST',
          body: formData
      });
      if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error.message);
      }
      const data = await response.json();
      toast('success', `${file.name} berhasil diupload!`);
      return data.secure_url; // Mengembalikan URL gambar yang aman
  } catch (error) {
      console.error(`Cloudinary upload error:`, error);
      toast('error', `Upload ${file.name} gagal.`);
      return null;
  }
}

async function _forceResetAttendanceStatus(form) {
  const workerId = form.elements['fix-worker-id'].value;
  const startDateStr = form.elements.startDate.value;
  const endDateStr = form.elements.endDate.value;
  if (!workerId || !startDateStr || !endDateStr) {
      toast('error', 'Harap lengkapi semua field.');
      return;
  }
  toast('syncing', `Memperbaiki data absensi...`);
  const startDate = new Date(startDateStr);
  const endDate = new Date(endDateStr);
  endDate.setHours(23, 59, 59, 999);
  let queryConstraints = [where('isPaid', '==', true), where('date', '>=', startDate), where('date', '<=', endDate)];
  if (workerId !== 'all') {
      queryConstraints.push(where('workerId', '==', workerId));
  }
  const q = query(attendanceRecordsCol, ...queryConstraints);
  try {
      const attendanceSnap = await getDocs(q);
      if (attendanceSnap.empty) {
          toast('info', 'Tidak ditemukan data berstatus lunas untuk diperbaiki.');
          return;
      }
      const batch = writeBatch(db);
      attendanceSnap.docs.forEach(doc => {
          batch.update(doc.ref, {
              isPaid: false,
              billId: null
          });
      });
      await batch.commit();
      toast('success', `${attendanceSnap.size} data absensi berhasil direset!`);
      closeModal($('#dataDetail-modal'));
      closeModal($('#confirmUserAction-modal'));
  } catch (error) {
      toast('error', 'Gagal memperbaiki data.');
      console.error('Gagal force reset data:', error);
  }
}

// --- SUB-SEKSI 3.5: TAGIHAN & SIMULASI ---
function renderTagihanPageLayout() {
    const container = $('.page-container');
    appState.selectionMode = { active: false, selectedIds: new Set(), pageContext: 'tagihan' };
    _renderSelectionBar();

    container.innerHTML = `
        <div class="toolbar sticky-toolbar" id="tagihan-toolbar">
            <div class="search"><span class="material-symbols-outlined">search</span><input type="search" id="tagihan-search-input" placeholder="Cari tagihan..." value="${appState.billsFilter.searchTerm}"></div>
            <button class="btn-icon" id="tagihan-filter-btn" title="Filter"><span class="material-symbols-outlined">filter_list</span></button>
            <button class="btn-icon" id="tagihan-sort-btn" title="Urutkan"><span class="material-symbols-outlined">sort</span></button>
        </div>
        <div id="main-tabs-container" class="sub-nav two-tabs">
            <button class="sub-nav-item active" data-tab="unpaid">Belum Lunas</button>
            <button class="sub-nav-item" data-tab="paid">Lunas</button>
        </div>
        <div id="category-sub-nav-container" class="category-sub-nav"></div>
        <div id="sub-page-content"></div>
    `;
    _setActiveListeners(['bills', 'expenses', 'comments']);
    _initTagihanInteractiveListeners(); 
}

async function _renderTagihanContent() {
    const tabId = $('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid';
    const contentContainer = $("#sub-page-content");
    if (contentContainer) contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
    appState.expenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
    const billsFromCache = await localDB.bills.where('status').equals(tabId).toArray();

    const billedExpenseIds = new Set(billsFromCache.map(b => b.expenseId).filter(Boolean));

    let deliveryOrders = [];
    if (tabId === 'unpaid') {
        const doFromCache = appState.expenses.filter(e => 
            e.status === 'delivery_order' && !billedExpenseIds.has(e.id)
        );
        deliveryOrders = doFromCache.map(d => ({
            id: `expense-${d.id}`, expenseId: d.id, description: d.description, amount: 0,
            dueDate: d.date, status: 'delivery_order', type: d.type,
            projectId: d.projectId, paidAmount: 0
        }));
    }
    
    appState.tagihan.fullList = [...deliveryOrders, ...billsFromCache];

    const counts = appState.tagihan.fullList.reduce((acc, b) => { acc[b.type] = (acc[b.type] || 0) + 1; return acc; }, {});
    counts.all = appState.tagihan.fullList.length;
    
    const categories = [{ id: 'all', label: 'Semua' }, { id: 'material', label: 'Material' }, { id: 'operasional', label: 'Operasional' }, { id: 'gaji', label: 'Gaji' }, { id: 'fee', label: 'Fee' }, { id: 'lainnya', label: 'Lainnya' }];
    const categoryNavContainer = $('#category-sub-nav-container');
    if (categoryNavContainer) {
        categoryNavContainer.innerHTML = categories
            .filter(cat => counts[cat.id] > 0)
            .map(cat => `<button class="sub-nav-item ${appState.billsFilter.category === cat.id ? 'active' : ''}" data-category="${cat.id}">${cat.label}</button>`)
            .join('');
    }

    _renderFilteredAndPaginatedBills();
}

async function _renderFilteredAndPaginatedBills(loadMore = false) {
    const PAGE_SIZE = 20;
    const contentContainer = $("#sub-page-content");
    const pagination = appState.pagination.bills;

    if (pagination.isLoading || (loadMore && !pagination.hasMore)) return;
    pagination.isLoading = true;

    if (!loadMore) {
        contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        appState.tagihan.currentList = [];
    } else {
        const loaderHTML = '<div class="loader-container" id="load-more-spinner"><div class="spinner"></div></div>';
        contentContainer.insertAdjacentHTML('beforeend', loaderHTML);
    }

    try {
        const tabId = $('#main-tabs-container .sub-nav-item.active')?.dataset.tab || 'unpaid';
        const { searchTerm, projectId, supplierId, category, sortBy, sortDirection } = appState.billsFilter;

        // --- [LOGIKA BARU DIMULAI DI SINI] ---

        // 1. Ambil semua data relevan dari Dexie SEKALI SAJA
        const allSuppliers = await localDB.suppliers.toArray();
        const allExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
        const allBillsInTab = await localDB.bills.where('status').equals(tabId).toArray();
        
        const supplierMap = new Map(allSuppliers.map(s => [s.id, s]));
        const expenseMap = new Map(allExpenses.map(e => [e.id, e]));

        // 2. Gabungkan data tagihan dengan info supplier untuk pencarian global
        const enrichedBills = allBillsInTab.map(bill => {
            const expense = expenseMap.get(bill.expenseId);
            const supplier = expense ? supplierMap.get(expense.supplierId) : null;
            return {
                ...bill,
                supplierName: supplier ? supplier.supplierName : ''
            };
        });

        // 3. Terapkan FILTER
        let filteredBills = enrichedBills;
        if (category !== 'all') {
            filteredBills = filteredBills.filter(bill => bill.type === category);
        }
        if (projectId !== 'all') {
            filteredBills = filteredBills.filter(bill => bill.projectId === projectId);
        }
        if (supplierId !== 'all') {
            filteredBills = filteredBills.filter(bill => {
                const expense = expenseMap.get(bill.expenseId);
                return expense && expense.supplierId === supplierId;
            });
        }

        // 4. Terapkan PENCARIAN GLOBAL
        if (searchTerm) {
            const term = searchTerm.toLowerCase();
            filteredBills = filteredBills.filter(bill => {
                const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
                // Cek semua field yang relevan
                return (
                    (bill.description || '').toLowerCase().includes(term) ||
                    (bill.supplierName || '').toLowerCase().includes(term) ||
                    (bill.type || '').toLowerCase().includes(term) ||
                    String(bill.amount).includes(term) ||
                    String(remainingAmount).includes(term)
                );
            });
        }
        
        // 5. Terapkan SORTING
        filteredBills.sort((a, b) => {
            const valA = (sortBy === 'amount') ? (a.amount - (a.paidAmount || 0)) : _getJSDate(a.dueDate).getTime();
            const valB = (sortBy === 'amount') ? (b.amount - (b.paidAmount || 0)) : _getJSDate(b.dueDate).getTime();
            return sortDirection === 'asc' ? valA - valB : valB - valA;
        });
        
        // --- AKHIR DARI LOGIKA BARU ---

        const offset = loadMore ? appState.tagihan.currentList.length : 0;
        const pageOfBills = filteredBills.slice(offset, offset + PAGE_SIZE);

        const newHtml = _getBillsListHTML(pageOfBills, allExpenses, allSuppliers, []);

        if (loadMore) {
            $('#load-more-spinner')?.remove();
            contentContainer.querySelector('.dense-list-container')?.insertAdjacentHTML('beforeend', newHtml);
        } else {
            $('#scroll-sentinel')?.remove();
            if (pageOfBills.length > 0) {
                 contentContainer.innerHTML = `<div class="dense-list-container">${newHtml}</div><div id="scroll-sentinel"></div>`;
                 _initInfiniteScrollObserver();
            } else {
                 contentContainer.innerHTML = _getEmptyStateHTML({ title: 'Tidak Ada Tagihan', desc: 'Tidak ada tagihan yang cocok dengan filter atau pencarian Anda.' });
            }
        }
        
        appState.tagihan.currentList = loadMore ? [...appState.tagihan.currentList, ...pageOfBills] : pageOfBills;
        pagination.hasMore = appState.tagihan.currentList.length < filteredBills.length;
        
        const sentinel = $('#scroll-sentinel');
        if (sentinel && !pagination.hasMore) {
            sentinel.style.display = 'none';
        }

    } catch (error) {
        console.error("Gagal memuat tagihan:", error);
        contentContainer.innerHTML = _getEmptyStateHTML({ icon: 'error', title: 'Gagal Memuat Data' });
    } finally {
        pagination.isLoading = false;
        $('#load-more-spinner')?.remove();
    }
}

let infiniteScrollObserver;

function _initInfiniteScrollObserver() {
    if (infiniteScrollObserver) {
        infiniteScrollObserver.disconnect();
    }
    
    const sentinel = document.getElementById('scroll-sentinel');
    if (!sentinel) return;

    const options = {
        root: null, // amati viewport
        rootMargin: '0px',
        threshold: 0.1 // picu saat 10% elemen terlihat
    };

    infiniteScrollObserver = new IntersectionObserver((entries) => {
        if (entries[0].isIntersecting) {
            console.log('Sentinel terlihat, memuat lebih banyak tagihan...');
            _renderFilteredAndPaginatedBills(true); // Panggil fungsi dengan loadMore = true
        }
    }, options);

    infiniteScrollObserver.observe(sentinel);
}

function _initTagihanInteractiveListeners() {
    _initSelectionMode('#sub-page-content', 'tagihan');
    _attachSwipeHandlers('#sub-page-content');
}

function _initTagihanPageListeners() {
    document.body.addEventListener('input', (e) => {
        if (e.target.id === 'tagihan-search-input') {
            appState.billsFilter.searchTerm = e.target.value;
            _renderFilteredAndPaginatedBills();
        }
    });

    document.body.addEventListener('click', (e) => {
        const filterSortBtn = e.target.closest('#tagihan-filter-btn, #tagihan-sort-btn');
        if (filterSortBtn) {
            // Langsung panggil fungsi modal tanpa mengirim data
            if (filterSortBtn.id === 'tagihan-filter-btn') {
                _showBillsFilterModal(_renderFilteredAndPaginatedBills); // ✅ Tidak mengirimkan data lagi
            } else if (filterSortBtn.id === 'tagihan-sort-btn') {
                _showBillsSortModal(_renderFilteredAndPaginatedBills);
            }
            return;
        }

        // Cek #2: Apakah yang diklik adalah tombol tab?
        const tabBtn = e.target.closest('.sub-nav-item');
        // Pastikan klik terjadi di dalam container tab dan tombol tab itu sendiri
        if (tabBtn && e.target.closest('#main-tabs-container, #category-sub-nav-container')) {
            if (tabBtn.classList.contains('active')) return; // Jangan lakukan apa-apa jika tab sudah aktif
            
            const tabContainer = e.target.closest('#main-tabs-container, #category-sub-nav-container');
            const isMainTab = tabContainer.id === 'main-tabs-container';
            const allTabs = $$('.sub-nav-item', tabContainer);
            const currentActive = $('.sub-nav-item.active', tabContainer);
            const currentIndex = Array.from(allTabs).indexOf(currentActive);
            const newIndex = Array.from(allTabs).indexOf(tabBtn);
            const direction = newIndex > currentIndex ? 'forward' : 'backward';

            if (currentActive) currentActive.classList.remove('active');
            tabBtn.classList.add('active');

            if (isMainTab) {
                appState.billsFilter.category = 'all'; 
                _animateTabSwitch($("#sub-page-content"), _renderTagihanContent, direction);
            } else {
                appState.billsFilter.category = tabBtn.dataset.category;
                _animateTabSwitch($("#sub-page-content"), _renderFilteredAndPaginatedBills, direction);
            }
        }
    });
}

async function handleOpenBillDetail(billId, expenseId) {
  let bill = null;
  if (billId) bill = appState.bills.find(b => b.id === billId);
  let payments = [];
  try {
      if (bill && navigator.onLine) {
          const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments');
          const paymentsSnap = await getDocs(query(paymentsColRef, orderBy("date", "desc")));
          payments = paymentsSnap.docs.map(d => ({
              id: d.id,
              ...d.data()
          }));
      }
  } catch (err) {
      // Offline atau gagal ambil payments; lanjut tanpa riwayat pembayaran
      console.warn('Gagal memuat riwayat pembayaran, menampilkan detail tanpa histori.', err);
      payments = [];
  }
  // Selalu gabungkan antrean pembayaran offline agar terlihat pada detail
  if (bill) {
      try {
          const queued = await localDB.pending_payments.where('billId').equals(bill.id).toArray();
          if (queued && queued.length > 0) {
              const mapped = queued.map(p => ({
                  amount: p.amount,
                  date: p.date || new Date(),
                  workerId: p.workerId,
                  workerName: p.workerName,
                  isOfflineQueued: true,
                  attachmentPending: !!p.localAttachmentId
              }));
              payments = [...mapped, ...payments];
          }
      } catch (e) {
          console.warn('Gagal memuat antrean pembayaran offline untuk preview:', e);
      }
  }
  let targetExpenseId = expenseId || bill?.expenseId;
  if (!targetExpenseId && bill?.type !== 'gaji') {
      toast('error', 'Data pengeluaran terkait tidak ditemukan.');
      return;
  }
  let content, title, fullContent;
  if (bill && bill.type === 'gaji') {
      // [PERBAIKAN] Tambahkan baris ini untuk memuat data absensi sebelum melanjutkan
      toast('syncing', 'Memuat rincian absensi...');
      await fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date');
      hideToast();

      content = _createSalaryBillDetailContentHTML(bill, payments);
      title = `Detail Tagihan: ${bill.description}`;
      fullContent = content;
  } else {
      let expenseData = null;
      if (navigator.onLine) {
          const expenseDoc = await getDoc(doc(expensesCol, targetExpenseId));
          if (!expenseDoc.exists()) {
              toast('error', 'Data pengeluaran terkait tidak ditemukan.');
              return;
          }
          expenseData = {
              id: expenseDoc.id,
              ...expenseDoc.data()
          };
      } else {
          // Offline fallback: ambil dari state lokal
          expenseData = appState.expenses.find(e => e.id === targetExpenseId);
          if (!expenseData) {
              toast('error', 'Detail pengeluaran tidak tersedia offline.');
              return;
          }
      }
      content = await _createBillDetailContentHTML(bill, expenseData, payments);
      title = `Detail Pengeluaran: ${expenseData.description}`;

      let footerHTML = '';
      if (expenseData.status === 'delivery_order' && !isViewer()) {
          footerHTML = `
              <div class="modal-footer">
                  <button class="btn btn-primary" data-action="edit-surat-jalan" data-id="${expenseData.id}">
                      <span class="material-symbols-outlined">edit_note</span> Input Harga & Buat Tagihan
                  </button>
              </div>`;
      }
      fullContent = content + footerHTML;
  }
  // Bangun breadcrumb kontekstual untuk halaman Tagihan
  const tabId = appState.activeSubPage.get('tagihan');
  const tabLabel = (tabId === 'unpaid'?'Belum Lunas' : (tabId === 'paid'?'Lunas' : ''));
  const baseParts = ['Tagihan', tabLabel];
  if (appState.billsFilter.projectId !== 'all') {
      const pj = appState.projects.find(p => p.id === appState.billsFilter.projectId);
      if (pj) baseParts.push(pj.projectName);
  } else if (appState.billsFilter.supplierId !== 'all') {
      const sp = appState.suppliers.find(s => s.id === appState.billsFilter.supplierId);
      if (sp) baseParts.push(sp.supplierName);
  }
  setBreadcrumb([...baseParts, 'Detail']);
  createModal('dataDetail', {
      title,
      content: fullContent,
      onClose: () => setBreadcrumb(baseParts)
  });
}

function _createAttachmentManagerHTML(expenseData) {
  if (!expenseData) return '';

  const createItemHTML = (url, field, title) => {
      const hasFile = url && url.startsWith('http');
      if (hasFile) {
          return `
          <div class="attachment-manager-item">
              <img src="${url}" alt="${title}" class="attachment-preview-thumb">
              <strong>${title}</strong>
              <div class="attachment-manager-actions">
                  <button class="btn btn-sm btn-secondary" data-action="view-attachment" data-src="${url}">Lihat</button>
                  ${isViewer()?'' : `<button class="btn btn-sm" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}">Ganti</button>`}
                  <button class="btn-icon" data-action="download-attachment" data-url="${url}" data-filename="${title.replace(/\s+/g,'_')}.jpg" title="Unduh"><span class="material-symbols-outlined">download</span></button>
                  ${isViewer()?'' : `<button class="btn-icon btn-icon-danger" data-action="delete-attachment" data-id="${expenseData.id}" data-field="${field}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`}
              </div>
          </div>`;
      } else if (!isViewer()) {
          return `
          <div class="attachment-manager-item placeholder">
              <div class="placeholder-icon"><span class="material-symbols-outlined">add_photo_alternate</span></div>
              <strong>${title}</strong>
              <span>Belum ada file</span>
              <button class="btn btn-sm btn-primary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}">Upload</button>
          </div>`;
      }
      return ''; // Jangan tampilkan apa-apa untuk viewer jika file tidak ada
  };
  let managerHTML = '';
  if (expenseData.type === 'material') {
      managerHTML = createItemHTML(expenseData.invoiceUrl, 'invoiceUrl', 'Bukti Faktur') + createItemHTML(expenseData.deliveryOrderUrl, 'deliveryOrderUrl', 'Surat Jalan');
  } else {
      managerHTML = createItemHTML(expenseData.attachmentUrl, 'attachmentUrl', 'Lampiran');
  }
  if (managerHTML) {
      return `
          <h5 class="detail-section-title">Lampiran</h5>
          <div class="attachment-manager-container">${managerHTML}</div>`;
  }
  return '';
}

function _createSalaryBillDetailContentHTML(bill, payments) {
    const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
    const paymentHistoryHTML = _createPaymentHistoryHTML(payments);
    let detailsHTML = '';

    if (bill.workerDetails && bill.workerDetails.length > 0) {
        const workerListHTML = bill.workerDetails.map(worker => {
            const paidByWorker = (payments || [])
                .filter(p => p.workerId === worker.id)
                .reduce((sum, p) => sum + (p.amount || 0), 0);
            
            const totalForWorker = worker.amount || 0;
            const remainingForWorker = Math.max(0, totalForWorker - paidByWorker);
            const isFullyPaid = remainingForWorker <= 0;
            
            // --- PENAMBAHAN TOMBOL AKSI BARU DI SINI ---
            let actionButtons = '';
            if (!isViewer() && bill.status === 'unpaid') { // Tombol hanya muncul jika tagihan belum lunas
                actionButtons = `
                    <div class="individual-payment-actions">
                        <button class="btn-icon btn-icon-danger" 
                                data-action="remove-worker-from-recap" 
                                data-bill-id="${bill.id}" 
                                data-worker-id="${worker.id || worker.workerId}" 
                                title="Keluarkan ${worker.name} dari Rekap">
                            <span class="material-symbols-outlined">person_remove</span>
                        </button>
                        ${!isFullyPaid ? `
                        <button class="btn-icon btn-icon-success" 
                                data-action="pay-individual-salary" 
                                data-bill-id="${bill.id}" 
                                data-worker-id="${worker.id || worker.workerId}" 
                                title="Bayar/Cicil Gaji ${worker.name}">
                            <span class="material-symbols-outlined">payment</span>
                        </button>` : ''}
                    </div>
                `;
            }
            // --- AKHIR PENAMBAHAN ---

            return `
                <div class="detail-list-item">
                    <div class="item-main">
                        <span class="item-date">${worker.name}</span>
                        <small class="text-muted" style="display:block;">Terbayar: ${fmtIDR(paidByWorker)}</small>
                        ${isFullyPaid ? `<span class="item-status paid">Lunas</span>` : `<span class="item-status unpaid">Sisa: ${fmtIDR(remainingForWorker)}</span>`}
                    </div>
                    <div class="item-secondary">
                        <strong class="item-amount">${fmtIDR(totalForWorker)}</strong>
                        ${actionButtons}
                    </div>
                </div>
            `;
        }).join('');
        detailsHTML = `<h5 class="detail-section-title">Rincian Gaji per Pekerja</h5><div class="detail-list-container">${workerListHTML}</div>`;
    } else {
    const recordIds = bill.recordIds || [];
      const relatedRecords = recordIds.map(id => appState.attendanceRecords.find(rec => rec.id === id)).filter(Boolean);
      if (relatedRecords.length > 0) {
          const recordDetailsHTML = relatedRecords.map(rec => {
              const project = appState.projects.find(p => p.id === rec.projectId);
              const date = _getJSDate(rec?.date).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric'
              });
              return `<div><dt>${date} - ${project?.projectName || 'N/A'}</dt><dd>${fmtIDR(rec.totalPay || 0)}</dd></div>`;
          }).join('');
          detailsHTML = `<h5 class="detail-section-title">Rincian Absensi Terkait</h5><dl class="detail-list">${recordDetailsHTML}</dl>`;
      }
  }
  return `
      <div class="payment-summary">
          <div><span>Total Tagihan Gaji:</span><strong>${fmtIDR(bill.amount)}</strong></div>
          <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
          <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
      </div>
      ${paymentHistoryHTML}
      ${detailsHTML}
  `;
}

async function _createBillDetailContentHTML(bill, expenseData, payments) {
  const remainingAmount = bill?(bill.amount || 0) - (bill.paidAmount || 0) : 0;
  let itemsButtonHTML = '';
  if (expenseData.type === 'material' && expenseData.items && expenseData.items.length > 0) {
      itemsButtonHTML = `
          <div class="rekap-actions" style="grid-template-columns: 1fr; margin-top: 1rem;">
              <button class="btn btn-secondary" data-action="view-invoice-items" data-id="${expenseData.id}">
                  <span class="material-symbols-outlined">list_alt</span>
                  Lihat Rincian Faktur
              </button>
          </div>
      `;
  }
  const project = appState.projects.find(p => p.id === expenseData.projectId);
  const projectDetailsHTML = project?`
      <dl class="detail-list" style="margin-top: 1.5rem;">
          <div class="category-title"><dt>Detail Proyek</dt><dd></dd></div>
          <div><dt>Nama Proyek</dt><dd>${project.projectName}</dd></div>
          ${project.budget > 0?`<div><dt>Anggaran</dt><dd>${fmtIDR(project.budget)}</dd></div>` : ''}
      </dl>
  ` : '';
  const paymentHistoryHTML = _createPaymentHistoryHTML(payments);
  const attachmentsHTML = _createAttachmentManagerHTML(expenseData); // [PERBAIKAN] Memanggil fungsi baru
  const commentsHTML = _createCommentsSectionHTML(expenseData.id, 'expense');
  return `
      <div class="payment-summary">
          <div><span>Total Pengeluaran:</span><strong>${fmtIDR(expenseData.amount)}</strong></div>
          ${bill?`
          <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
          <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
          ` : `<div class="status"><span>Status:</span><strong style="color:var(--success)">Lunas</strong></div>`}
      </div>
      ${paymentHistoryHTML}
       ${projectDetailsHTML}
      ${itemsButtonHTML}
      ${attachmentsHTML}
      ${commentsHTML}
  `;
}
function _createCommentsSectionHTML(parentId, parentType) {
  try {
      const items = (appState.comments || [])
          .filter(c => c.parentId === parentId && c.parentType === parentType && !c.isDeleted)
          .sort((a, b) => _getJSDate(a.createdAt) - _getJSDate(b.createdAt));
  const listHTML = items.length > 0 ? items.map(c => {
          const when = _getJSDate(c.createdAt).toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
          const canDelete = !!appState.currentUser && (appState.currentUser.uid === c.userId || appState.userRole === 'Owner');
          const safeText = String(c.content || '').replace(/</g, '&lt;').replace(/\n/g, '<br>');
          const me = appState.currentUser && appState.currentUser.uid === c.userId;
          return `<div class="comment-item ${me?'is-current-user':''}" data-id="${c.id}">
              <div class="comment-meta">
                  <strong>${c.userName || 'Pengguna'}</strong>
                  <span class="comment-date">${when}</span>
                  ${canDelete?`<button class="btn-icon btn-icon-danger" data-action="delete-comment" data-id="${c.id}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`:''}
              </div>
              <div class="comment-text">${safeText}</div>
          </div>`;
      }).join('') : '<p class="empty-state-small">Belum ada komentar.</p>';
      const disabled = (appState.userRole === 'Viewer') || !appState.currentUser || appState.userStatus !== 'active';
      return `
          <div class="comments-section" data-parent-id="${parentId}" data-parent-type="${parentType}">
              <h5 class="detail-section-title">Komentar</h5>
              <div class="comments-list">${listHTML}</div>
              <div class="comment-input-row">
                  <textarea rows="1" placeholder="Tulis komentar..." ${disabled?'disabled':''}
                    oninput="this.style.height='auto';this.style.height=this.scrollHeight+'px'; this.nextElementSibling.disabled = (this.value.trim().length===0);"></textarea>
                  <button class="btn btn-primary" data-action="post-comment" data-parent-id="${parentId}" data-parent-type="${parentType}" ${disabled?'disabled':''} disabled>Kirim</button>
              </div>
          </div>`;
  } catch (e) {
      console.warn('Render komentar gagal', e);
      return '';
  }
}
async function handlePostComment(dataset) {
  try {
      const { parentId, parentType } = dataset;
      const section = event?.target?.closest('.comments-section') || document.querySelector(`.comments-section[data-parent-id="${parentId}"][data-parent-type="${parentType}"]`);
      const ta = section ? section.querySelector('textarea') : null;
      const content = (ta?.value || '').trim();
      if (!parentId || !parentType) return;
      if (!content) { toast('error', 'Komentar kosong.'); return; }
      if (!appState.currentUser) { toast('error', 'Masuk untuk berkomentar.'); return; }
      const item = {
          id: generateUUID(),
          parentId,
          parentType,
          content,
          userId: appState.currentUser.uid,
          userName: appState.currentUser.displayName || 'Pengguna',
          createdAt: new Date(),
          needsSync: 1,
          isDeleted: 0
      };
      await localDB.comments.add(item);
      appState.comments.push(item);
      if (ta) ta.value = '';
      if (parentType === 'expense') handleOpenBillDetail(null, parentId);
      else if (parentType === 'bill') handleOpenBillDetail(parentId, null);
      syncToServer();
  } catch (e) {
      console.error('Gagal menambah komentar', e);
      toast('error', 'Gagal menambah komentar.');
  }
}
async function handleDeleteComment(dataset) {
  try {
      const { id } = dataset;
      if (!id) return;
      const c = (appState.comments || []).find(x => x.id === id);
      await localDB.comments.where('id').equals(id).modify({ isDeleted: 1, needsSync: 1 });
      appState.comments = (appState.comments || []).filter(x => x.id !== id);
      if (c?.parentType === 'expense') handleOpenBillDetail(null, c.parentId);
      else if (c?.parentType === 'bill') handleOpenBillDetail(c.parentId, null);
      syncToServer();
  } catch (e) {
      console.error('Gagal menghapus komentar', e);
      toast('error', 'Gagal menghapus komentar.');
  }
}

function _injectExpenseThumbnails(expenses) {
  try {
      const mapById = new Map(expenses.map(e => [e.id, e]));
      $$('.card.card-list-item[data-type="expense"]').forEach(card => {
          const id = card.getAttribute('data-id');
          const item = mapById.get(id);
          if (!item || item.type !== 'material') return;
          const url = item.invoiceUrl || item.deliveryOrderUrl;
          const content = $('.card-list-item-content', card);
          const details = $('.card-list-item-details', card);
          const amount = $('.card-list-item-amount-wrapper', card);
          if (!content || !details || !amount) return;
          if ($('.card-left', content)) return;
          const left = document.createElement('div');
          left.className = 'card-left';
          if (url) {
              const img = document.createElement('img');
              img.className = 'expense-thumb';
              img.alt = 'Lampiran';
              img.src = url;
              left.appendChild(img);
          }
          left.appendChild(details);
          content.insertBefore(left, amount);
      });
  } catch (err) {
      console.warn('Failed to inject thumbnails', err);
  }
}
async function _prefetchExpenseThumbnails(expenses) {
  try {
      const urls = Array.from(new Set(expenses.flatMap(e => [e.invoiceUrl, e.deliveryOrderUrl].filter(Boolean))));
      if (urls.length === 0) return;
      await Promise.all(urls.map(u => fetch(u, {
          mode: 'no-cors',
          cache: 'force-cache'
      }).catch(() => {})));
  } catch (_) {}
}
async function handleDeleteAttachment(dataset) {
  const {
      id,
      field
  } = dataset;

  createModal('confirmDeleteAttachment', {
      onConfirm: async () => {
          toast('syncing', 'Menghapus lampiran...');
          try {
              // Tidak perlu menghapus file dari Cloudinary untuk menjaga kesederhanaan
              // Cukup hapus URL dari Firestore
              await optimisticUpdateDoc(expensesCol, id, {
                  [field]: ''
              });
              _logActivity(`Menghapus Lampiran`, {
                  expenseId: id,
                  field
              });

              toast('success', 'Lampiran berhasil dihapus.');
              closeModal($('#dataDetail-modal'));
              handleOpenBillDetail(null, id);
          } catch (error) {
              toast('error', 'Gagal menghapus lampiran.');
              console.error("Attachment deletion error:", error);
          }
      }
  });
}
async function handleUploadAttachment(dataset) {
  const {
      id,
      field
  } = dataset;
  const content = `
      <p class="confirm-modal-text">Pilih sumber gambar untuk lampiran.</p>
      <input type="file" name="modalUploadCamera" accept="image/*" capture="environment" class="hidden-file-input">
      <input type="file" name="modalUploadGallery" accept="image/*" class="hidden-file-input">
              <div class="upload-buttons modal-upload-buttons">
          <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadCamera">
              <span class="material-symbols-outlined">photo_camera</span> Kamera
          </button>
          <button type="button" class="btn btn-secondary" data-action="trigger-file-input" data-target="modalUploadGallery">
              <span class="material-symbols-outlined">image</span> Galeri
          </button>
      </div>
  `;
  const modal = createModal('dataDetail', {
      title: 'Pilih Sumber Gambar',
      content
  });
  if (modal) {
      modal.id = 'upload-source-modal';
      modal.querySelectorAll('.hidden-file-input').forEach(input => {
          input.addEventListener('change', (e) => {
              const file = e.target.files[0];
              if (file) {
                  closeModal(modal); // Menutup modal "Pilih Sumber Gambar"
                  _processAndUploadFile(file, id, field);
              }
          }, {
              once: true
          });
      });
  }
}
async function _processAndUploadFile(file, expenseId, field) {
  if (!file || !expenseId || !field) return;
  const downloadURL = await _uploadFileToCloudinary(file);
  if (downloadURL) {
      try {
          await optimisticUpdateDoc(expensesCol, expenseId, {
              [field]: downloadURL
          });
          toast('success', 'Lampiran berhasil diperbarui!');
          handleOpenBillDetail(null, expenseId);
          closeModal($('#upload-source-modal'));
          toast('success', 'Lampiran berhasil diperbarui!');
      } catch (error) {
          toast('error', 'Gagal menyimpan lampiran.');
          console.error("Attachment update error:", error);
      }
  }
}
async function _downloadAttachment(url, filename) {
  try {
      const res = await fetch(url, {
          mode: 'cors'
      });
      const blob = await res.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  } catch (e) {
      console.error('Download attachment failed:', e);
      // Fallback langsung buka URL
      window.open(url, '_blank');
  }
}
function handlePayBillModal(billId) {
  const bill = appState.bills.find(i => i.id === billId);
  if (!bill) {
      toast('error', 'Data tagihan tidak ditemukan.');
      return;
  }

  const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);

  const content = `
              <form id="payment-form" data-id="${billId}" data-type="bill" data-async="true" method="POST" data-endpoint="/api/payments/bill" data-success-msg="Pembayaran tercatat">
                 <div class="payment-summary">
                     <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                     <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                     <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
                 </div>
                 <div class="form-group">
                     <label>Jumlah Pembayaran</label>
                     <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah pembayaran" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}">
                 </div>
                 <div class="form-group">
                     <label>Tanggal Pembayaran</label>
                     <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
                 </div>
                 <button type="submit" class="btn btn-primary">Bayar</button>
             </form>
         `;
  createModal('payment', {
      title: 'Form Pembayaran Tagihan',
      content,
      paymentType: 'bill'
  });
}

function _createPaymentHistoryHTML(payments) {
    if (!payments || payments.length === 0) {
        return '';
    }

    const historyItems = payments.map(p => {
        const paymentDate = p.date ? _getJSDate(p.date).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) : 'Tanggal tidak valid';
        
        const offlineBadge = p.isOfflineQueued ? `<span class="status-badge warn" style="margin-left:.5rem;">Offline</span>` : '';
        const recipientName = p.workerName || 'Pembayaran Umum'; 
        
        const attachInfo = p.attachmentUrl ?
            ` <a href="${p.attachmentUrl}" target="_blank" class="link-muted" style="margin-left:.5rem;">Lihat</a>` :
            (p.attachmentPending ? ` <span class="text-muted" style="margin-left:.5rem;">Lampiran menunggu sinkron</span>` : '');

        return `
            <div class="payment-history-item">
                <div class="payment-details">
                    <span class="payment-date">${paymentDate}${offlineBadge}</span>
                    <span class="payment-recipient">${recipientName}</span>
                </div>
                <strong class="payment-amount">${fmtIDR(p.amount)}${attachInfo}</strong>
            </div>`;
    }).join('');

    return `
        <h5 class="detail-section-title">Riwayat Pembayaran</h5>
        <div class="detail-list custom-payment-history">
            ${historyItems}
        </div>
    `;
}

async function _showBillsFilterModal(onApply) {
    // [PERBAIKAN] Ambil SEMUA tagihan (lunas & belum lunas) untuk mendapatkan daftar supplier lengkap
    const allBillsEver = await localDB.bills.toArray();
    const allExpenses = await localDB.expenses.where('isDeleted').notEqual(1).toArray();
    const allSuppliers = await localDB.suppliers.toArray();

    const expenseMap = new Map(allExpenses.map(e => [e.id, e]));
    
    // Dapatkan semua ID supplier yang pernah memiliki tagihan
    const relevantSupplierIds = new Set();
    allBillsEver.forEach(bill => {
        const expense = expenseMap.get(bill.expenseId);
        if (expense && expense.supplierId) {
            relevantSupplierIds.add(expense.supplierId);
        }
    });

    const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
    
    // Buat opsi dari supplier yang relevan
    const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, 
        ...allSuppliers
            .filter(s => relevantSupplierIds.has(s.id))
            .map(s => ({ value: s.id, text: s.supplierName }))
    ];

    const content = `
        <form id="bills-filter-form">
            ${createMasterDataSelect('filter-project-id', 'Filter Berdasarkan Proyek', projectOptions, appState.billsFilter.projectId)}
            ${createMasterDataSelect('filter-supplier-id', 'Filter Berdasarkan Supplier', supplierOptions, appState.billsFilter.supplierId)}
            <div class="filter-modal-footer">
                <button type="button" id="reset-filter-btn" class="btn btn-secondary">Reset</button>
                <button type="submit" class="btn btn-primary">Terapkan</button>
            </div>
        </form>
    `;
    const modal = createModal('dataDetail', { title: 'Filter Tagihan', content });
    
    // Inisialisasi dropdown kustom setelah modal dibuat
    _initCustomSelects(modal);

    $('#bills-filter-form', modal).addEventListener('submit', (e) => {
        e.preventDefault();
        appState.billsFilter.projectId = $('#filter-project-id', modal).value;
        appState.billsFilter.supplierId = $('#filter-supplier-id', modal).value;
        onApply();
        closeModal(modal);
    });

    $('#reset-filter-btn', modal).addEventListener('click', () => {
        appState.billsFilter.projectId = 'all';
        appState.billsFilter.supplierId = 'all';
        onApply();
        closeModal(modal);
    });
}

function _showBillsSortModal(onApply) {
  const {
      sortBy,
      sortDirection
  } = appState.billsFilter;
  const content = `
          <form id="bills-sort-form">
              <div class="sort-options">
                  <div class="sort-option">
                      <input type="radio" id="sort-due-date" name="sortBy" value="dueDate" ${sortBy === 'dueDate'?'checked' : ''}>
                      <label for="sort-due-date">Tanggal Jatuh Tempo</label>
                  </div>
                  <div class="sort-option">
                      <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount'?'checked' : ''}>
                      <label for="sort-amount">Jumlah Tagihan</label>
                  </div>
              </div>
              <div class="form-group" style="margin-top: 1rem;">
                  <label>Arah Pengurutan</label>
                  <div class="sort-direction">
                      <button type="button" data-dir="desc" class="${sortDirection === 'desc'?'active' : ''}">Terbaru/Tertinggi</button>
                      <button type="button" data-dir="asc" class="${sortDirection === 'asc'?'active' : ''}">Terlama/Terendah</button>
                  </div>
              </div>
              <div class="filter-modal-footer" style="grid-template-columns: 1fr;">
                   <button type="submit" class="btn btn-primary">Terapkan</button>
              </div>
          </form>
      `;

  createModal('dataDetail', {
      title: 'Urutkan Tagihan',
      content
  });

  const form = $('#bills-sort-form');
  form.querySelectorAll('.sort-direction button').forEach(btn => {
      btn.addEventListener('click', () => {
          form.querySelectorAll('.sort-direction button').forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
      });
  });

  form.addEventListener('submit', (e) => {
      e.preventDefault();
      appState.billsFilter.sortBy = form.querySelector('input[name="sortBy"]:checked').value;
      appState.billsFilter.sortDirection = form.querySelector('.sort-direction button.active').dataset.dir;
      onApply();
      closeModal($('#dataDetail-modal'));
  });
}

function _getBillsListHTML(items) {
    if (!items || items.length === 0) {
        return '';
    }

    return items.map(item => {
        if (!item) return '';

        let title = item.description;
        let subtitle;
        const isTouch = (('ontouchstart' in window) || (navigator.maxTouchPoints || 0) > 0);

        if (item.type === 'gaji') {
            const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long' }) : 'N/A';
            if (item.workerDetails && item.workerDetails.length > 1) {
                subtitle = `Upah untuk ${item.workerDetails.length} pekerja`;
            } else if (item.workerDetails && item.workerDetails.length === 1) {
                 subtitle = `Upah a.n. ${item.workerDetails[0].name}`;
            } else {
                subtitle = "Tagihan Gaji Karyawan";
            }
            subtitle += ` - ${date}`;
        } else {
            let supplierName = '';
            const expense = appState.expenses.find(e => e.id === item.expenseId);
            if (expense && expense.supplierId) {
                supplierName = appState.suppliers.find(s => s.id === expense.supplierId)?.supplierName || '';
            }
            const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'N/A';
            subtitle = supplierName ? `${supplierName} - Jatuh Tempo: ${date}` : `Jatuh Tempo: ${date}`;
        }

        const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
        const isFullyPaid = remainingAmount <= 0 && item.status !== 'delivery_order';

        let statusHTML = '';
        if (item.status === 'delivery_order') {
            statusHTML = `<span class="status-badge info">Surat Jalan</span>`;
        } else if (isFullyPaid) {
            statusHTML = `<span class="status-badge positive">Lunas</span>`;
        } else if (item.paidAmount > 0) {
            statusHTML = `<span class="status-badge warn">Sisa ${fmtIDR(remainingAmount)}</span>`;
        } else {
            statusHTML = `<span class="status-badge negative">Belum Dibayar</span>`;
        }

        // ================================================================
        // [PERBAIKAN KUNCI #1] - Membuat HTML untuk tombol aksi swipe
        // ================================================================
        let swipeActionsHTML = '';
        if (!isViewer()) {
            if (!isFullyPaid && item.status !== 'delivery_order') {
                swipeActionsHTML += `<button class="btn-icon btn-icon-success" data-action="pay-bill" title="Bayar"><span class="material-symbols-outlined">payment</span></button>`;
            }
            if (item.status === 'delivery_order') {
                 swipeActionsHTML += `<button class="btn-icon" data-action="edit-surat-jalan" data-id="${item.expenseId}" title="Input Harga"><span class="material-symbols-outlined">edit_note</span></button>`;
            } else {
                 swipeActionsHTML += `<button class="btn-icon" data-action="edit-item" data-id="${item.id}" data-type="bill" title="Edit"><span class="material-symbols-outlined">edit</span></button>`;
            }
            swipeActionsHTML += `<button class="btn-icon btn-icon-danger" data-action="delete-item" data-id="${item.id}" data-type="bill" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`;
        }
        // ================================================================
        
return `
        <div class="dense-list-item" data-id="${item.id || item.localId}" data-expense-id="${item.expenseId || ''}">
            <div class="selection-checkmark"><span class="material-symbols-outlined">check_circle</span></div>

            <div class="swipe-actions">${swipeActionsHTML}</div>
            <div class="item-main-content" data-action="open-bill-detail">                <strong class="item-title">${title}</strong>
                <span class="item-subtitle">${subtitle}</span>
                <div class="item-details">
                    <strong class="item-amount">${item.status === 'delivery_order'?'Tanpa Harga' : fmtIDR(item.amount)}</strong>
                    ${statusHTML}
                </div>
            </div>

            ${!isTouch && !isViewer() ? `<div class="item-actions"><button class="btn-icon" data-action="open-bill-actions-modal"><span class="material-symbols-outlined">more_vert</span></button></div>` : ''}
        </div>`;
    }).join('');
}

function _getEditFormFakturMaterialHTML(item) {
  const supplierOptions = appState.suppliers
      .filter(s => s.category === 'Material')
      .map(s => ({
          value: s.id,
          text: s.supplierName
      }));
  const projectOptions = appState.projects.map(p => ({
      value: p.id,
      text: p.projectName
  }));
  const date = _getJSDate(item.date).toISOString().slice(0, 10);
  const itemsHTML = (item.items || []).map((itemRow, index) => {
      const material = appState.materials.find(m => m.id === itemRow.materialId);
      const unit = material?.unit || '';
      const priceNum = itemRow.price || 0;
      const qtyNum = itemRow.qty || 0;
      const totalNum = priceNum * qtyNum;
      return `
      <div class="invoice-item-row" data-index="${index}">
          <div class="autocomplete-wrapper item-name-wrapper">
              <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" value="${itemRow.name || ''}" required autocomplete="off" ${itemRow.materialId?'readonly' : ''}>
              <input type="hidden" name="materialId" class="autocomplete-id" value="${itemRow.materialId || ''}">
              <button type="button" class="autocomplete-clear-btn" style="display: ${itemRow.materialId?'flex' : 'none'};" title="Hapus Pilihan">
                  <span class="material-symbols-outlined">close</span>
              </button>
              <div class="autocomplete-suggestions"></div>
          </div>
          <div class="item-details">
              <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" value="${priceNum?fmtIDR(priceNum):''}" required>
              <span>x</span>
              <input type="text" inputmode="decimal" pattern="[0-9]+([\\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${qtyNum || ''}" required>
              <span class="item-unit" style="margin-left: 0.25rem;">${unit}</span>
              <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
          </div>
          <span class="item-total">${fmtIDR(totalNum)}</span>
          <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
      </div>`;
  }).join('');
  return `
  <form id="edit-item-form" data-id="${item.id}" data-type="expense">
      ${createMasterDataSelect('project-id', 'Proyek', projectOptions, item.projectId)}
      <div class="form-group">
          <label>No. Faktur/Deskripsi</label>
          <input type="text" name="description" value="${item.description}" required>
      </div>
      ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, item.supplierId)}
      <div class="form-group">
          <label>Tanggal Faktur</label>
          <input type="date" name="date" value="${date}" required>
      </div>
      <h5 class="invoice-section-title">Rincian Barang</h5>
      <div id="invoice-items-container">${itemsHTML}</div>
      <div class="add-item-action">
          <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang">
              <span class="material-symbols-outlined">add_circle</span>
          </button>
      </div>
              <div class="invoice-total">
          <span>Total Faktur:</span>
          <strong id="invoice-total-amount">${fmtIDR(item.amount)}</strong>
      </div>
      <button type="submit" class="btn btn-primary">Simpan Perubahan Faktur</button>
  </form>
  `;
}
async function handleEditSuratJalanModal(expenseId) {
  const expense = appState.expenses.find(e => e.id === expenseId);
  if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');

  const content = _getEditFormFakturMaterialHTML(expense, true); // true = mode edit surat jalan
  const modalEl = createModal('editItem', {
      title: `Input Harga: ${expense.description}`,
      content
  });

  if (modalEl) {
      _initAutocomplete(modalEl);
      // Format harga saat input di modal edit faktur dari surat jalan
      $$('#invoice-items-container input[inputmode="numeric"]', modalEl).forEach(inp => inp.addEventListener('input', _formatNumberInput));
      $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
      $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
      $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
          e.target.closest('.invoice-item-row').remove();
          _updateInvoiceTotal(modalEl);
      }));

      $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
          e.preventDefault();
          handleUpdateSuratJalan(e.target);
      });
  }
}

async function handleUpdateSuratJalan(form) {
  const expenseId = form.dataset.id;
  const status = form.querySelector('input[name="status"]').value || 'unpaid';

  const items = [];
  $$('.invoice-item-row', form).forEach(row => {
      const materialId = row.querySelector('input[name="materialId"]').value;
      const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
      const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
      if (materialId && qty > 0 && price > 0) {
          items.push({
              materialId,
              price,
              qty,
              total: price * qty
          });
      }
  });

  if (items.length === 0) {
      return toast('error', 'Harap isi harga untuk minimal satu barang.');
  }

  const newAmount = items.reduce((sum, item) => sum + item.total, 0);

  toast('syncing', 'Menyimpan faktur...');
  try {
      await runTransaction(db, async (transaction) => {
          const expenseRef = doc(expensesCol, expenseId);
          const billRef = doc(billsCol, generateUUID());

          // 1. Update dokumen expense
          const expenseSnap = await transaction.get(expenseRef);
          const curRev = expenseSnap.exists()?(expenseSnap.data().rev || 0) : 0;
          transaction.update(expenseRef, {
            amount: newAmount,
            items: items,
            status: status,
            rev: curRev + 1,
            updatedAt: serverTimestamp()
        });

          // 2. Buat dokumen bill baru
          transaction.set(billRef, {
              expenseId: expenseId,
              description: form.elements.description.value,
              amount: newAmount,
              dueDate: new Date(form.elements.date.value),
              status: status,
              type: 'material',
              projectId: form.elements['project-id'].value,
              createdAt: serverTimestamp(),
              rev: 1,
              paidAmount: status === 'paid'?newAmount : 0,
              ...(status === 'paid' && {
                  paidAt: serverTimestamp()
              })
          });

          // 3. Perbarui harga di stock_transactions
          for (const item of items) {
              const q = query(stockTransactionsCol, where("expenseId", "==", expenseId), where("materialId", "==", item.materialId));
              const transSnap = await getDocs(q); // getDocs bisa di dalam transaction
              if (!transSnap.empty) {
                  const transRef = transSnap.docs[0].ref;
                  transaction.update(transRef, {
                      pricePerUnit: item.price
                  });
              }
          }
      });

      _logActivity('Menyelesaikan Surat Jalan', {
          docId: expenseId,
          newAmount
      });
      toast('success', 'Faktur berhasil disimpan dan tagihan telah dibuat!');
      closeModal($('#editItem-modal'));
      renderTagihanPage();
  } catch (error) {
      toast('error', 'Gagal memperbarui data.');
      console.error("Error updating delivery order:", error);
  }
}
async function handleEditDeliveryOrderItemsModal(expenseId) {
  const expense = appState.expenses.find(e => e.id === expenseId);
  if (!expense) return toast('error', 'Data surat jalan tidak ditemukan.');
  const content = _getEditFormSuratJalanItemsHTML(expense);
  const modalEl = createModal('editItem', {
      title: `Edit Item: ${expense.description}`,
      content
  });
  if (modalEl) {
      _initAutocomplete(modalEl);
      $('#add-invoice-item-btn', modalEl).addEventListener('click', () => _addInvoiceItemRow(modalEl));
      $('#invoice-items-container', modalEl).addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
      $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
          e.target.closest('.invoice-item-row').remove();
      }));

      $('#edit-item-form', modalEl).addEventListener('submit', (e) => {
          e.preventDefault();
          handleUpdateDeliveryOrderItems(e.target);
      });
  }
}

function _getEditFormSuratJalanItemsHTML(item) {
  const itemsHTML = (item.items || []).map((subItem, index) => {
      const material = appState.materials.find(m => m.id === subItem.materialId);
      const materialName = material?`${material.materialName}` : '';
      return `
              <div class="invoice-item-row" data-index="${index}">
                  <div class="autocomplete-wrapper item-name-wrapper">
                      <input type="text" name="itemName" placeholder="Ketik nama material..." class="autocomplete-input item-name" value="${materialName}" required autocomplete="off" ${subItem.materialId?'readonly' : ''}>
                      <input type="hidden" name="materialId" class="autocomplete-id" value="${subItem.materialId || ''}">
                      <button type="button" class="autocomplete-clear-btn" style="display: ${subItem.materialId?'flex' : 'none'};" title="Hapus Pilihan">
                          <span class="material-symbols-outlined">close</span>
                      </button>
                      <div class="autocomplete-suggestions"></div>
                  </div>
                  <div class="item-details">
                      <input type="text" inputmode="decimal" pattern="[0-9]+([\.,][0-9]+)?" name="itemQty" placeholder="Qty" class="item-qty" value="${subItem.qty}" required>
                      <span class="item-unit" style="margin-left: 0.25rem;">${material?.unit || ''}</span>
                      <button type="button" class="btn-icon add-master-btn" data-action="add-new-material" title="Tambah Master Material"><span class="material-symbols-outlined">add</span></button>
                  </div>
                  <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
              </div>
          `;
  }).join('');
  return `
          <form id="edit-item-form" data-id="${item.id}" data-type="delivery_order_items">
              <h5 class="invoice-section-title">Rincian Barang (Tanpa Harga)</h5>
              <div id="invoice-items-container">${itemsHTML}</div>
              <div class="add-item-action">
                  <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang"><span class="material-symbols-outlined">add_circle</span></button>
              </div>
              <button type="submit" class="btn btn-primary" style="margin-top: 1.5rem;">Simpan Perubahan Item</button>
          </form>
      `;
}
async function handleUpdateDeliveryOrderItems(form) {
  const expenseId = form.dataset.id;
  toast('syncing', 'Memperbarui item surat jalan...');
  try {
      const oldExpenseSnap = await getDoc(doc(expensesCol, expenseId));
      if (!oldExpenseSnap.exists()) throw new Error('Surat jalan asli tidak ditemukan');
      const oldItems = oldExpenseSnap.data().items || [];
      const newItems = [];
      $$('.invoice-item-row', form).forEach(row => {
          const materialId = row.querySelector('input[name="materialId"]').value;
          const qty = parseLocaleNumber(row.querySelector('input[name="itemQty"]').value);
          if (materialId && qty > 0) newItems.push({
              materialId,
              qty,
              price: 0,
              total: 0
          });
      });
      if (newItems.length === 0) {
          toast('error', 'Surat jalan harus memiliki minimal satu item.');
          return;
      }
      await runTransaction(db, async (transaction) => {
          const stockAdjustments = new Map();
          oldItems.forEach(item => {
              stockAdjustments.set(item.materialId, (stockAdjustments.get(item.materialId) || 0) - item.qty);
          });
          newItems.forEach(item => {
              stockAdjustments.set(item.materialId, (stockAdjustments.get(item.materialId) || 0) + item.qty);
          });

          for (const [materialId, qtyChange] of stockAdjustments.entries()) {
              if (qtyChange !== 0) {
                  const materialRef = doc(materialsCol, materialId);
                  transaction.update(materialRef, {
                      currentStock: increment(-qtyChange)
                  });
              }
          }

          const q = query(stockTransactionsCol, where("expenseId", "==", expenseId));
          const oldTransSnap = await getDocs(q);
          oldTransSnap.forEach(doc => transaction.delete(doc.ref));
          newItems.forEach(item => {
              const newTransRef = doc(collection(db, 'teams', TEAM_ID, 'stock_transactions'));
              transaction.set(newTransRef, {
                  materialId: item.materialId,
                  quantity: item.qty,
                  date: oldExpenseSnap.data().date,
                  type: 'out',
                  expenseId: expenseId,
                  projectId: oldExpenseSnap.data().projectId,
                  createdAt: serverTimestamp()
              });
          });

          transaction.update(doc(expensesCol, expenseId), {
              items: newItems
          });
      });
      _logActivity('Mengedit Item Surat Jalan', {
          docId: expenseId
      });
      toast('success', 'Item surat jalan berhasil diperbarui!');
      closeModal($('#editItem-modal'));
      renderTagihanPage();
  } catch (error) {
      toast('error', 'Gagal memperbarui item.');
      console.error(error);
  }
}
async function handlePayBillModal(billId) {
  const bill = appState.bills.find(i => i.id === billId);
  if (!bill) {
      toast('error', 'Data tagihan tidak ditemukan.');
      return;
  }
  const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
  const content = `
          <form id="payment-form" data-id="${billId}" data-type="bill" data-async="true" method="POST" data-endpoint="/api/payments/bill" data-success-msg="Pembayaran tercatat">
              <div class="payment-summary">
                  <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                  <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                  <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
              </div>
              <div class="form-group">
                  <label>Jumlah Pembayaran</label>
                  <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah pembayaran" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}">
              </div>
              <div class="form-group">
                  <label>Tanggal Pembayaran</label>
                  <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
              </div>
              <div class="form-group">
                  <label>Lampiran (Opsional)</label>
                  <input type="file" name="paymentAttachment" accept="image/*" capture="environment">
                  <small class="text-muted">Anda dapat menambahkan bukti transfer/foto struk.</small>
              </div>
              <button type="submit" class="btn btn-primary">Bayar</button>
          </form>
      `;
  createModal('payment', {
      title: 'Form Pembayaran Tagihan',
      content,
      paymentType: 'bill'
  });
}
async function handleProcessBillPayment(form) {
  const billId = form.dataset.id;
  const amountToPay = parseFormattedNumber(form.elements.amount.value);
  const date = new Date(form.elements.date.value);

  if (amountToPay <= 0) {
      toast('error', 'Jumlah pembayaran harus lebih dari nol.');
      return;
  }
  // Offline-first: jika offline, simpan ke localDB dan tandai sinkronisasi
  if (!navigator.onLine) {
      try {
          const local = await localDB.bills.where('id').equals(billId).first();
          const appBill = appState.bills.find(b => b.id === billId);
          const baseAmount = local?.amount ?? appBill?.amount ?? 0;
          const currentPaid = local?.paidAmount ?? appBill?.paidAmount ?? 0;
          const newPaidAmount = currentPaid + amountToPay;
          const isPaid = newPaidAmount >= baseAmount;
          if (local) {
              await localDB.bills.update(local.localId, {
                  paidAmount: newPaidAmount,
                  status: isPaid?'paid' : 'unpaid',
                  ...(isPaid?{
                      paidAt: date
                  } : {}),
                  needsSync: 1
              });
          } else if (appBill) {
              // Buat entri lokal minimal jika belum ada
              await localDB.bills.add({
                  id: billId,
                  expenseId: appBill.expenseId || null,
                  amount: baseAmount,
                  dueDate: appBill.dueDate || new Date(),
                  status: isPaid?'paid' : 'unpaid',
                  type: appBill.type,
                  projectId: appBill.projectId || null,
                  paidAmount: newPaidAmount,
                  ...(isPaid?{
                      paidAt: date
                  } : {}),
                  needsSync: 1
              });
          }
          // Antrekan pencatatan riwayat pembayaran untuk dibuat saat online (+ lampiran jika ada)
          let localAttachmentId = null;
          const file = form.elements.paymentAttachment?.files?.[0];
          if (file) {
              const compressed = await _compressImage(file, 0.85, 1280);
              const blob = compressed || file;
              localAttachmentId = `payment-${billId}-${Date.now()}`;
              await localDB.files.put({
                  id: localAttachmentId,
                  file: blob,
                  addedAt: new Date(),
                  size: blob.size || 0
              });
              await _enforceLocalFileStorageLimit();
          }
          await localDB.pending_payments.add({
              billId,
              amount: amountToPay,
              date,
              localAttachmentId,
              createdAt: new Date()
          });
          _logActivity(`Membayar Tagihan Cicilan (Offline)`, {
              billId,
              amount: amountToPay
          });
      // [IMPROVE-UI/UX]: clearer offline feedback
      toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
          await loadAllLocalDataToState();
          if (appState.activePage === 'tagihan') renderTagihanPage();
          return;
      } catch (e) {
          toast('error', 'Gagal menyimpan pembayaran offline.');
          console.error(e);
          return;
      }
  }
  toast('syncing', 'Memproses pembayaran...');
  try {
      const billRef = doc(billsCol, billId);
      let attachmentUrl = null;
      const file = form.elements.paymentAttachment?.files?.[0];
      if (file) {
          attachmentUrl = await _uploadFileToCloudinary(file);
      }
      await runTransaction(db, async (transaction) => {
          const billSnap = await transaction.get(billRef);
          if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan");
          const billData = billSnap.data();
          const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
          const isPaid = newPaidAmount >= billData.amount;

          transaction.update(billRef, {
              paidAmount: increment(amountToPay),
              status: isPaid?'paid' : 'unpaid',
              rev: (billData.rev || 0) + 1,
              ...(isPaid && {
                  paidAt: serverTimestamp()
              })
          });
          if (isPaid && billData.expenseId) {
              const expenseRef = doc(expensesCol, billData.expenseId);
              const expSnap = await transaction.get(expenseRef);
              const expRev = expSnap.exists()?(expSnap.data().rev || 0) : 0;
              transaction.update(expenseRef, {
                  status: 'paid',
                  rev: expRev + 1,
                  updatedAt: serverTimestamp()
              });
          }
          if (isPaid && billData.type === 'gaji') {
            const recordIds = billData.recordIds || [];
            if (recordIds.length > 0) {
                recordIds.forEach(recId => {
                    const attendanceRef = doc(attendanceRecordsCol, recId);
                    transaction.update(attendanceRef, { isPaid: true });
                });
            }
        }
          const paymentRef = doc(collection(billRef, 'payments'));
          const paymentData = {
              amount: amountToPay,
              date,
              createdAt: serverTimestamp()
          };
          if (attachmentUrl) paymentData.attachmentUrl = attachmentUrl;
          transaction.set(paymentRef, paymentData);
      });
      _logActivity(`Membayar Tagihan Cicilan`, {
          billId,
          amount: amountToPay
      });

      toast('success', 'Pembayaran berhasil dicatat.');
      if (appState.activePage === 'tagihan') renderTagihanPage();
  } catch (error) {
      toast('error', `Gagal memproses pembayaran.`);
      console.error('Bill Payment error:', error);
  }
}
async function handlePaymentModal(id, type) {
  let item, remainingAmount, title, paymentType;
  if (type === 'pinjaman') {
      item = appState.fundingSources.find(i => i.id === id);
      if (!item) {
          toast('error', 'Data pinjaman tidak ditemukan.');
          return;
      }
      const totalPayable = item.totalRepaymentAmount || item.totalAmount;
      remainingAmount = totalPayable - (item.paidAmount || 0);
      title = 'Pembayaran Cicilan Pinjaman';
      paymentType = 'loan';
  } else {
      // Logika ini bisa dikembangkan untuk tipe lain jika perlu
      return;
  }
  const content = `
          <form id="payment-form" data-id="${id}" data-type="${type}" data-async="true" method="POST" data-endpoint="/api/payments/loan" data-success-msg="Pembayaran tercatat">
              <div class="payment-summary">
                  <div><span>Total Tagihan:</span><strong>${fmtIDR(item.totalRepaymentAmount || item.totalAmount)}</strong></div>
                  <div><span>Sudah Dibayar:</span><strong>${fmtIDR(item.paidAmount || 0)}</strong></div>
                  <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
              </div>
              <div class="form-group">
                  <label>Jumlah Pembayaran</label>
                  <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah pembayaran" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}">
              </div>
              <div class="form-group">
                  <label>Tanggal Pembayaran</label>
                  <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
              </div>
              <button type="submit" class="btn btn-primary">Bayar</button>
          </form>
      `;
  createModal('payment', {
      title,
      content,
      paymentType
  });
}
async function handleProcessPayment(form) {
  const {
      id,
      type
  } = form.dataset;
  if (type !== 'pinjaman') return;

  const amountToPay = parseFormattedNumber(form.elements.amount.value);
  const date = new Date(form.elements.date.value);
  if (amountToPay <= 0) {
      toast('error', 'Jumlah pembayaran harus lebih dari nol.');
      return;
  }
  // Offline-first: jika offline, update lokal lalu sinkronkan nanti
  if (!navigator.onLine) {
      try {
          const local = await localDB.funding_sources.where('id').equals(id).first();
          const appLoan = appState.fundingSources.find(f => f.id === id);
          const totalPayable = (local?.totalRepaymentAmount ?? appLoan?.totalRepaymentAmount) || (local?.totalAmount ?? appLoan?.totalAmount) || 0;
          const currentPaid = local?.paidAmount ?? appLoan?.paidAmount ?? 0;
          const newPaidAmount = currentPaid + amountToPay;
          const isPaid = newPaidAmount >= totalPayable;
          if (local) {
              await localDB.funding_sources.update(local.localId, {
                  paidAmount: newPaidAmount,
                  status: isPaid?'paid' : 'unpaid',
                  needsSync: 1
              });
          } else if (appLoan) {
              await localDB.funding_sources.add({
                  id,
                  creditorId: appLoan.creditorId,
                  totalAmount: appLoan.totalAmount,
                  totalRepaymentAmount: appLoan.totalRepaymentAmount,
                  paidAmount: newPaidAmount,
                  status: isPaid?'paid' : 'unpaid',
                  date: appLoan.date || new Date(),
                  needsSync: 1
              });
          }
          _logActivity(`Membayar Cicilan Pinjaman (Offline)`, {
              loanId: id,
              amount: amountToPay
          });
          // [IMPROVE-UI/UX]: clearer offline feedback
          toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
          await loadAllLocalDataToState();
          if (appState.activePage === 'pemasukan') renderPemasukanPage();
          return;
      } catch (e) {
          toast('error', 'Gagal menyimpan pembayaran offline.');
          console.error(e);
          return;
      }
  }
  toast('syncing', 'Memproses pembayaran...');
  try {
      const loanRef = doc(fundingSourcesCol, id);
      await runTransaction(db, async (transaction) => {
          const loanSnap = await transaction.get(loanRef);
          if (!loanSnap.exists()) throw new Error("Data pinjaman tidak ditemukan");
          const loanData = loanSnap.data();
          const totalPayable = loanData.totalRepaymentAmount || loanData.totalAmount;
          const newPaidAmount = (loanData.paidAmount || 0) + amountToPay;
          const isPaid = newPaidAmount >= totalPayable;
          transaction.update(loanRef, {
              paidAmount: increment(amountToPay),
              status: isPaid?'paid' : 'unpaid',
              rev: (loanData.rev || 0) + 1,
              updatedAt: serverTimestamp()
          });
      });
      _logActivity(`Membayar Cicilan Pinjaman`, {
          loanId: id,
          amount: amountToPay
      });
      toast('success', 'Pembayaran berhasil dicatat.');
      if (appState.activePage === 'pemasukan') renderPemasukanPage();
  } catch (error) {
      toast('error', `Gagal memproses pembayaran.`);
      console.error('Loan Payment error:', error);
  }
}

function _createNestedAccordionHTML(title, items) {
  if (!items || items.length === 0) return '';
  const totalSectionAmount = items.reduce((sum, item) => sum + item.remainingAmount, 0);
  const groupedItems = items.reduce((acc, item) => {
      const key = item.groupId || 'lainnya';
      if (!acc[key]) {
          acc[key] = {
              name: item.groupName || 'Lainnya',
              items: [],
              total: 0
          };
      }
      acc[key].items.push(item);
      acc[key].total += item.remainingAmount;
      return acc;
  }, {});
  const createPaymentCard = (item) => `
      <div class="card simulasi-item" data-id="${item.id}" data-full-amount="${item.remainingAmount}" data-partial-allowed="true" data-title="${item.title || 'N/A'}" data-description="${item.description}">
          <div class="simulasi-info">
              <div class="simulasi-title">${item.description}</div>
          </div>
          <div class="simulasi-amount">${fmtIDR(item.remainingAmount)}</div>
      </div>`;
  const subAccordionsHTML = Object.values(groupedItems).map(group => `
      <div class="simulasi-subsection">
          <button class="simulasi-subsection-header">
              <div class="header-info">
                  <span class="header-title">${group.name}</span>
                  <span class="header-total">${fmtIDR(group.total)}</span>
              </div>
              <span class="material-symbols-outlined header-icon">expand_more</span>
          </button>
          <div class="simulasi-subsection-content">
              ${group.items.map(createPaymentCard).join('')}
          </div>
      </div>
  `).join('');
  return `
      <div class="card simulasi-section">
          <button class="simulasi-section-header">
               <div class="header-info">
                  <span class="header-title">${title}</span>
                  <span class="header-total">${items.length} Tagihan - Total ${fmtIDR(totalSectionAmount)}</span>
              </div>
              <span class="material-symbols-outlined header-icon">expand_more</span>
          </button>
          <div class="simulasi-section-content">
              ${subAccordionsHTML}
          </div>
      </div>`;
}
async function renderSimulasiBayarPage() {
  const container = $('.page-container');
  container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
  appState.simulasiState.selectedPayments.clear();
  // 1. Ambil semua data yang diperlukan
  await Promise.all([
      fetchAndCacheData('bills', billsCol), fetchAndCacheData('fundingSources', fundingSourcesCol),
      fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('suppliers', suppliersCol, 'supplierName'),
      fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName'),
      fetchAndCacheData('staff', staffCol, 'staffName'), fetchAndCacheData('projects', projectsCol)
  ]);
  const unpaidBills = appState.bills.filter(b => b.status === 'unpaid');
  const unpaidLoans = appState.fundingSources.filter(f => f.status === 'unpaid');
  // 2. Siapkan data untuk setiap kategori dengan format yang sama
  const staffFees = unpaidBills.filter(b => b.type === 'fee').map(b => {
      const staff = appState.staff.find(s => s.id === b.staffId);
      return {
          id: `bill-${b.id}`,
          title: staff?.staffName,
          description: b.description,
          remainingAmount: b.amount - (b.paidAmount || 0),
          groupId: b.staffId || 'lainnya',
          groupName: staff?.staffName || 'Fee Lainnya'
      };
  });
  const workerSalaries = unpaidBills.filter(b => b.type === 'gaji').map(b => {
      const worker = appState.workers.find(w => w.id === b.workerId);
      return {
          id: `bill-${b.id}`,
          title: worker?.workerName,
          description: b.description,
          remainingAmount: b.amount - (b.paidAmount || 0),
          groupId: b.workerId || 'lainnya',
          groupName: worker?.workerName || 'Gaji Lainnya'
      };
  });

  // [PERBAIKAN] Pisahkan tagihan material, operasional, dan lainnya
  const createBillItem = (b, type) => {
      const expense = appState.expenses.find(e => e.id === b.expenseId);
      const supplier = appState.suppliers.find(s => s.id === expense?.supplierId);
      return {
          id: `bill-${b.id}`,
          title: supplier?.supplierName,
          description: b.description,
          remainingAmount: b.amount - (b.paidAmount || 0),
          groupId: expense?.supplierId || 'lainnya',
          groupName: supplier?.supplierName || 'Lainnya'
      };
  };
  const materialBills = unpaidBills.filter(b => b.type === 'material').map(b => createBillItem(b));
  const operasionalBills = unpaidBills.filter(b => b.type === 'operasional').map(b => createBillItem(b));
  const lainnyaBills = unpaidBills.filter(b => b.type === 'lainnya').map(b => createBillItem(b));
  const loans = unpaidLoans.map(l => {
      const creditor = appState.fundingCreditors.find(c => c.id === l.creditorId);
      return {
          id: `loan-${l.id}`,
          title: creditor?.creditorName,
          description: 'Cicilan Pinjaman',
          remainingAmount: (l.totalRepaymentAmount || l.totalAmount) - (l.paidAmount || 0),
          groupId: l.creditorId || 'lainnya',
          groupName: creditor?.creditorName || 'Pinjaman Lainnya'
      };
  });
  // 3. Render halaman dengan data yang sudah disiapkan
  container.innerHTML = `
      <div class="card card-pad simulasi-summary">
          <div class="form-group">
              <label>Dana Masuk (Uang di Tangan)</label>
              <input type="text" id="simulasi-dana-masuk" inputmode="numeric" placeholder="mis. 10.000.000">
          </div>
          <div class="simulasi-totals">
              <div><span class="label">Total Alokasi</span><strong id="simulasi-total-alokasi">Rp 0</strong></div>
              <div><span class="label">Sisa Dana</span><strong id="simulasi-sisa-dana">Rp 0</strong></div>
          </div>
          <div class="rekap-actions"><button id="simulasi-buat-pdf" class="btn btn-primary"><span class="material-symbols-outlined">picture_as_pdf</span> Buat Laporan PDF</button></div>
      </div>
      <div id="simulasi-utang-list">
           ${_createNestedAccordionHTML('Gaji Staf & Fee', staffFees)}
           ${_createNestedAccordionHTML('Tagihan Gaji Pekerja', workerSalaries)}
           ${_createNestedAccordionHTML('Tagihan Material', materialBills)}
           ${_createNestedAccordionHTML('Tagihan Operasional', operasionalBills)}
           ${_createNestedAccordionHTML('Tagihan Lainnya', lainnyaBills)}
           ${_createNestedAccordionHTML('Cicilan Pinjaman', loans)}
      </div>
  `;
  // 4. Pasang event listener untuk semua interaksi
  $$('.simulasi-section-header, .simulasi-subsection-header').forEach(header => {
      header.addEventListener('click', () => header.parentElement.classList.toggle('open'));
  });
  $('#simulasi-utang-list').addEventListener('click', (e) => {
      const card = e.target.closest('.simulasi-item');
      if (card) _openSimulasiItemActionsModal(card.dataset);
  });
  $('#simulasi-dana-masuk').addEventListener('input', _updateSimulasiTotals);
  $('#simulasi-dana-masuk').addEventListener('input', _formatNumberInput);
  $('#simulasi-buat-pdf').addEventListener('click', _createSimulasiPDF);
    _setActiveListeners([]);
}

// GANTI SELURUH FUNGSI INI DENGAN VERSI BARU
function _openSimulasiItemActionsModal(dataset) {
    const {
        id,
        title,
        description,
        fullAmount,
        partialAllowed
    } = dataset;
    const isSelected = appState.simulasiState.selectedPayments.has(id);
    const actions = [];
    if (isSelected) {
        actions.push({
            label: 'Batalkan Pilihan',
            action: 'cancel',
            icon: 'cancel'
        });
    } else {
        actions.push({
            label: 'Pilih & Bayar Penuh',
            action: 'pay_full',
            icon: 'check_circle'
        });
        if (partialAllowed === 'true') {
            actions.push({
                label: 'Bayar Sebagian',
                action: 'pay_partial',
                icon: 'pie_chart'
            });
        }
    }
    const modal = createModal('billActionsModal', {
        bill: {
            description: title,
            amount: parseFormattedNumber(fullAmount)
        },
        actions
    });
  
    // Tambahkan event listener ke tombol aksi di dalam modal
    modal.querySelectorAll('.actions-menu-item').forEach(btn => {
        btn.addEventListener('click', () => {
            const card = $(`.simulasi-item[data-id="${id}"]`);
            if (!card) return;
  
            switch (btn.dataset.action) {
                case 'pay_full':
                    appState.simulasiState.selectedPayments.set(id, parseFormattedNumber(fullAmount));
                    card.classList.add('selected');
                    break;
                
                case 'pay_partial':
                    _openSimulasiPartialPaymentModal(dataset);
                    return; // Keluar dari fungsi agar closeModal() di bawah tidak dijalankan
  
                case 'cancel':
                    appState.simulasiState.selectedPayments.delete(id);
                    card.classList.remove('selected');
                    break;
            }
            
            _updateSimulasiTotals();
            closeModal(modal); // Baris ini HANYA akan dijalankan untuk 'pay_full' dan 'cancel'
        });
    });
  }


function _openSimulasiPartialPaymentModal(dataset) {
  const {
      id,
      title,
      fullAmount
  } = dataset;
  const fullAmountNum = parseFormattedNumber(fullAmount);
  const content = `
          <form id="partial-payment-form">
              <p>Masukkan jumlah pembayaran untuk <strong>${title}</strong>.</p>
              <div class="payment-summary" style="margin-bottom: 1rem;">
                  <div class="remaining"><span>Total Tagihan:</span><strong>${fmtIDR(fullAmountNum)}</strong></div>
              </div>
              ${_createFormGroupHTML(
                'partial-payment-amount',
                'Jumlah Pembayaran Parsial',
                '<input type="text" name="amount" inputmode="numeric" required placeholder="mis. 500.000">'
            )}
                          <div class="modal-footer" style="margin-top: 1.5rem;">
                  <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
                  <button type="submit" class="btn btn-primary">Simpan</button>
              </div>
          </form>
      `;
  const modal = createModal('dataDetail', {
      title: 'Pembayaran Parsial',
      content
  });
  const form = $('#partial-payment-form', modal);
  const amountInput = form.querySelector('input[name="amount"]');

  amountInput.addEventListener('input', _formatNumberInput); // Gunakan fungsi utilitas yang sudah ada
  form.addEventListener('submit', (e) => {
      e.preventDefault();
      const amountToPay = parseFormattedNumber(amountInput.value);
      if (amountToPay <= 0) {
          toast('error', 'Jumlah harus lebih besar dari nol.');
          return;
      }
      if (amountToPay > fullAmountNum) {
          toast('error', `Jumlah tidak boleh melebihi total tagihan ${fmtIDR(fullAmountNum)}.`);
          return;
      }
      const card = $(`.simulasi-item[data-id="${id}"]`);
      if (card) {
          appState.simulasiState.selectedPayments.set(id, amountToPay);
          card.classList.add('selected');
          _updateSimulasiTotals();
      }
      closeModal(modal);
  });
}

function _updateSimulasiTotals() {
  const danaMasukEl = $('#simulasi-dana-masuk');
  const totalAlokasiEl = $('#simulasi-total-alokasi');
  const sisaDanaEl = $('#simulasi-sisa-dana');

  if (!danaMasukEl || !totalAlokasiEl || !sisaDanaEl) return;
  const danaMasuk = parseFormattedNumber(danaMasukEl.value);
  let totalAlokasi = 0;
  // Hitung total alokasi dari state
  for (const amount of appState.simulasiState.selectedPayments.values()) {
      totalAlokasi += amount;
  }
  const sisaDana = danaMasuk - totalAlokasi;
  // Update UI with animated numbers
  animateNumber(totalAlokasiEl, totalAlokasi);
  animateNumber(sisaDanaEl, sisaDana);

  // Atur warna sisa dana
  sisaDanaEl.classList.remove('positive', 'negative');
  if (sisaDana >= 0) {
      sisaDanaEl.classList.add('positive');
  } else {
      sisaDanaEl.classList.add('negative');
  }
  // Sinkronisasi tampilan visual setiap kartu dengan state
  $$('.simulasi-item').forEach(card => {
      const cardId = card.dataset.id;
      const amountEl = card.querySelector('.simulasi-amount');

      if (appState.simulasiState.selectedPayments.has(cardId)) {
          card.classList.add('selected');
          const selectedAmount = appState.simulasiState.selectedPayments.get(cardId);
          const fullAmount = parseFormattedNumber(card.dataset.fullAmount);
          // Tampilkan jumlah yang dipilih jika berbeda dari jumlah penuh
          if (selectedAmount < fullAmount) {
              amountEl.innerHTML = `<span class="partial-amount">${fmtIDR(selectedAmount)}</span> / ${fmtIDR(fullAmount)}`;
          }
      } else {
          card.classList.remove('selected');
          // Kembalikan ke tampilan jumlah penuh
          amountEl.innerHTML = fmtIDR(card.dataset.fullAmount);
      }
  });
}

// --- SUB-SEKSI 3.6: LAPORAN & PDF ---
// GANTI FUNGSI renderLaporanPage DENGAN VERSI BARU INI

// GANTI FUNGSI LAMA renderLaporanPage DENGAN INI

async function renderLaporanPage() {
    const container = $('.page-container');
    updateBreadcrumbFromState();
    
    const filterStart = appState.reportFilter?.start || '';
    const filterEnd = appState.reportFilter?.end || '';
  
    // [PERBAIKAN] Hitung total untuk ringkasan
    const { incomeData, expenseData } = _getDailyFinancialDataForChart();
    const totalIncome = incomeData.reduce((a, b) => a + b, 0);
    const totalExpense = expenseData.reduce((a, b) => a + b, 0);
  
    container.innerHTML = `
        <div class="card card-pad" style="margin-bottom: 1rem;">
            <div class="report-filter">
                <div class="date-range-group">
                    <input type="date" id="report-start-date" value="${filterStart}">
                    <span>s.d.</span>
                    <input type="date" id="report-end-date" value="${filterEnd}">
                </div>
                <button class="btn btn-secondary" id="apply-report-filter">Terapkan</button>
                <button id="generate-detailed-report-btn" data-action="open-report-generator" class="btn btn-primary">
                    <span class="material-symbols-outlined">download_for_offline</span>
                    Unduh PDF
                </button>
            </div>
        </div>
  
        <section class="card card-pad" style="margin-bottom:1rem;">
            <h5 class="section-title-owner" style="margin-top:0;">Tren Pemasukan vs Pengeluaran</h5>
            <div class="chart-summary-grid">
                <div class="summary-stat-card">
                    <span class="label">Total Pemasukan (7 Hari)</span>
                    <strong class="value positive">${fmtIDR(totalIncome)}</strong>
                </div>
                <div class="summary-stat-card">
                    <span class="label">Total Pengeluaran (7 Hari)</span>
                    <strong class="value negative">${fmtIDR(totalExpense)}</strong>
                </div>
            </div>
            <div style="height: 250px; position: relative;"><canvas id="interactive-bar-chart"></canvas></div>
        </section>
  
        <div class="report-cards-grid">
            <div id="laba-rugi-card" class="report-card card card-pad"></div>
            <div id="analisis-beban-card" class="report-card card card-pad"></div>
            <div id="arus-kas-card" class="report-card card card-pad"></div>
        </div>
    `;
  
    setBreadcrumb(['Laporan']);
    
    await _renderLabaRugiCard($('#laba-rugi-card'));
    await _renderAnalisisBeban($('#analisis-beban-card'));
    await _renderLaporanArusKas($('#arus-kas-card'));
    
    _renderInteractiveBarChart();
  
    $('#apply-report-filter')?.addEventListener('click', () => {
        const s = $('#report-start-date')?.value || '';
        const e = $('#report-end-date')?.value || '';
        appState.reportFilter = { start: s, end: e };
        renderLaporanPage();
    });
    _setActiveListeners([]);
}

  async function _renderFinancialSummaryChart() {
  const canvas = $('#financial-summary-chart');
  if (!canvas) return;
  await Promise.all([fetchAndCacheData('projects', projectsCol), fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingSources', fundingSourcesCol)]);
  const mainProject = appState.projects.find(p => p.projectType === 'main_income');
  const inRange = (d) => {
      const { start, end } = appState.reportFilter || {};
      const dt = _getJSDate(d);
      if (start && dt < new Date(start + 'T00:00:00')) return false;
      if (end && dt > new Date(end + 'T23:59:59')) return false;
      return true;
  };
  const pureIncome = appState.incomes.filter(inc => inc.projectId === mainProject?.id && inRange(inc.date)).reduce((sum, inc) => sum + inc.amount, 0);
  const totalExpenses = appState.expenses.filter(exp => inRange(exp.date)).reduce((sum, exp) => sum + exp.amount, 0);
  const totalFunding = appState.fundingSources.filter(fund => inRange(fund.date)).reduce((sum, fund) => sum + fund.totalAmount, 0);
  const ctx = canvas.getContext('2d');
  if (window.financialChart) window.financialChart.destroy();

  const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();
  window.financialChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
          labels: ['Pemasukan Murni', 'Pengeluaran', 'Pendanaan'],
          datasets: [{
              data: [pureIncome, totalExpenses, totalFunding],
              backgroundColor: ['#28a745', '#f87171', '#ffca2c'],
              borderWidth: 0
          }]
      },
      options: {
          responsive: true,
          maintainAspectRatio: false,
          cutout: '70%',
          plugins: {
              legend: {
                  position: 'bottom',
                  labels: {
                      color: textColor,
                      boxWidth: 12,
                      padding: 20,
                      font: {
                          weight: '500'
                      }
                  }
              }
          },
          // [IMPROVE-UI/UX]: drill-down on click
          onClick: (evt, elements) => {
              const el = elements && elements[0];
              if (!el) return;
              const index = el.index;
              const label = window.financialChart.data.labels[index];
              if (label === 'Pengeluaran') handleNavigation('tagihan', { source: 'quick' });
          }
      }
  });
}

// [IMPROVE-UI/UX]: Build 7-day series for interactive bar chart
function _getDailyFinancialDataForChart() {
    const labels = [];
    const incomeData = Array(7).fill(0);
    const expenseData = Array(7).fill(0);
    const inRange = (d) => {
        const { start, end } = appState.reportFilter || {};
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        labels.push(date.toLocaleDateString('id-ID', { weekday: 'short' }));
        const dateString = date.toISOString().slice(0, 10);
        (appState.incomes || []).forEach(income => {
            const d = _getJSDate(income.date);
            if (inRange(d) && d.toISOString().slice(0, 10) === dateString) {
                incomeData[6 - i] += income.amount || 0;
            }
        });
        (appState.expenses || []).forEach(expense => {
            const d = _getJSDate(expense.date);
            if (inRange(d) && d.toISOString().slice(0, 10) === dateString) {
                expenseData[6 - i] += expense.amount || 0;
            }
        });
    }
    return { labels, incomeData, expenseData };
}

async function _renderInteractiveBarChart() {
    const canvas = document.getElementById('interactive-bar-chart');
    if (!canvas) return;
    const { labels, incomeData, expenseData } = _getDailyFinancialDataForChart();
    if (interactiveReportChart) {
        interactiveReportChart.destroy();
    }
    const ctx = canvas.getContext('2d');
    interactiveReportChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels,
            datasets: [
                { label: 'Pemasukan', data: incomeData, backgroundColor: 'rgba(34, 197, 94, 0.8)' },
                { label: 'Pengeluaran', data: expenseData, backgroundColor: 'rgba(239, 68, 68, 0.8)' }
            ]
        },
        options: {
            // [PERBAIKAN] Mengubah orientasi menjadi horizontal
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            scales: { 
                // [PERBAIKAN] Tukar pengaturan sumbu x dan y
                x: { beginAtZero: true, ticks: { callback: v => fmtIDR(v) } },
                y: { grid: { display: false } } // Sembunyikan grid di sumbu y (sekarang label hari)
            },
            plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmtIDR(ctx.raw)}` } } },
            onClick: (event, elements) => {
                if (elements && elements.length > 0) {
                    const idx = elements[0].index;
                    const clickedDate = new Date();
                    clickedDate.setDate(clickedDate.getDate() - (6 - idx));
                    _showDailyTransactionDetailsModal(clickedDate);
                }
            }
        }
    });
}

function animateCountUp(element, endValue) {
    if (!element) return;
    
    const startValue = 0;
    const duration = 1500; // Durasi animasi dalam milidetik
    const startTime = performance.now();

    const step = (currentTime) => {
        const elapsedTime = currentTime - startTime;
        const progress = Math.min(elapsedTime / duration, 1);
        
        // Menggunakan easing function untuk efek perlambatan di akhir
        const easedProgress = 1 - Math.pow(1 - progress, 3);
        const currentValue = Math.round(startValue + (endValue * easedProgress));

        element.textContent = fmtIDR(currentValue);

        if (progress < 1) {
            requestAnimationFrame(step);
        } else {
            // Pastikan nilai akhir selalu tepat
            element.textContent = fmtIDR(endValue);
        }
    };

    requestAnimationFrame(step);
}
const countUpObserver = new IntersectionObserver((entries, observer) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            const element = entry.target;
            const endValue = parseFloat(element.dataset.countupTo);
            
            animateCountUp(element, endValue);
            
            // Hentikan pengamatan setelah animasi berjalan sekali
            observer.unobserve(element);
        }
    });
}, {
    threshold: 0.5 // Memicu saat 50% elemen terlihat
});

function _showDailyTransactionDetailsModal(date) {
    const dateString = date.toISOString().slice(0, 10);
    const formattedDate = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    
    const dailyIncomes = (appState.incomes || []).filter(i => _getJSDate(i.date).toISOString().slice(0, 10) === dateString);
    const dailyExpenses = (appState.expenses || []).filter(e => _getJSDate(e.date).toISOString().slice(0, 10) === dateString);
    
    const createListHTML = (items, type) => {
        if (items.length === 0) return '';
        const listItemsHTML = items.map(item => {
            const title = item.description || (type === 'Pemasukan' ? 'Penerimaan Termin' : 'Pengeluaran Umum');
            const amountClass = type === 'Pemasukan' ? 'positive' : 'negative';
            return `
                <div class="dense-list-item">
                    <div class="item-main-content">
                        <strong class="item-title">${title}</strong>
                    </div>
                    <div class="item-actions">
                        <strong class="item-amount ${amountClass}">${fmtIDR(item.amount)}</strong>
                    </div>
                </div>
            `;
        }).join('');
        return `<h5 class="detail-section-title">${type}</h5><div class="dense-list-container">${listItemsHTML}</div>`;
    };

    const hasTransactions = dailyIncomes.length > 0 || dailyExpenses.length > 0;
    const emptyStateHTML = !hasTransactions ? _getEmptyStateHTML({ icon: 'receipt_long', title: 'Tidak Ada Transaksi', desc: 'Tidak ada pemasukan atau pengeluaran pada tanggal ini.' }) : '';

    const modalContent = `
        <div style="margin-top: -1rem;">
            ${createListHTML(dailyIncomes, 'Pemasukan')}
            ${createListHTML(dailyExpenses, 'Pengeluaran')}
            ${emptyStateHTML}
        </div>
    `;

    createModal('dataDetail', { title: `Rincian Transaksi - ${formattedDate}`, content: modalContent });
}

async function _renderLabaRugiCard(container) {
    if (!container) return;
    
    await Promise.all([
      fetchAndCacheData('projects', projectsCol),
      fetchAndCacheData('incomes', incomesCol),
      fetchAndCacheData('expenses', expensesCol),
      fetchAndCacheData('bills', billsCol),
      fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date'),
      fetchAndCacheData('fundingSources', fundingSourcesCol)
    ]);
   
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);
    const inRange = (d) => { const { start, end } = appState.reportFilter || {}; const dt = _getJSDate(d); if (start && dt < new Date(start+'T00:00:00')) return false; if (end && dt > new Date(end+'T23:59:59')) return false; return true; };
   
    const pendapatan = (appState.incomes||[]).filter(i => i.projectId === mainProject?.id && inRange(i.date)).reduce((s,i)=>s+i.amount,0);
    const hpp_material = (appState.expenses||[]).filter(e => e.projectId === mainProject?.id && e.type==='material' && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    let hpp_gaji = 0, bebanGajiInternal = 0;
    const paidSalaryBills = (appState.bills||[]).filter(b => b.type==='gaji' && b.status==='paid');
    const attendanceMap = new Map((appState.attendanceRecords||[]).map(rec => [rec.id, rec]));
    paidSalaryBills.forEach(bill => { (bill.recordIds||[]).forEach(recordId => { const r = attendanceMap.get(recordId); if (r) { if (r.projectId === mainProject?.id) hpp_gaji += r.totalPay||0; else bebanGajiInternal += r.totalPay||0; } }); });
    const hpp_lainnya = (appState.expenses||[]).filter(e => e.projectId === mainProject?.id && e.type==='lainnya' && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    const hpp = hpp_material + hpp_gaji + hpp_lainnya;
    const bebanOperasional = (appState.expenses||[]).filter(e => e.projectId === mainProject?.id && e.type==='operasional' && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    const bebanExpenseInternal = (appState.expenses||[]).filter(e => internalProjects.some(p=>p.id===e.projectId) && inRange(e.date)).reduce((s,e)=>s+e.amount,0);
    const bebanInternal = bebanExpenseInternal + bebanGajiInternal;
    const labaKotor = pendapatan - hpp;
    
    // [REVISI] Menghitung KESELURUHAN beban bunga (bunga bulanan * tenor)
    let bebanBunga = 0;
    (appState.fundingSources || []).filter(s => s.interestType === 'interest' && inRange(s.date)).forEach(s => {
        const monthlyInterest = (s.totalAmount || 0) * ((s.rate || 0) / 100);
        const totalLoanInterest = monthlyInterest * (s.tenor || 0); // Dikalikan dengan tenor
        bebanBunga += totalLoanInterest;
    });
  
    const labaBersih = labaKotor - bebanOperasional - bebanInternal - bebanBunga;
   
    container.innerHTML = `
    <h5 class="report-title">Laba Rugi</h5>
    <div class="report-card-content">
      <dl class="detail-list report-card-details">
        <div class="detail-list-item interactive" data-action="show-report-detail" data-type="income">
            <dt>Pendapatan</dt>
            <dd class="positive" data-countup-to="${pendapatan}">Rp 0</dd>
        </div>
        <div class="detail-list-item"><dt>HPP (Total)</dt><dd class="negative">- ${fmtIDR(hpp)}</dd></div>
        <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="material"><dt>• Material</dt><dd class="negative">- ${fmtIDR(hpp_material)}</dd></div>
        <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="gaji"><dt>• Gaji</dt><dd class="negative">- ${fmtIDR(hpp_gaji)}</dd></div>
        <div class="detail-list-item interactive sub-item" data-action="show-report-detail" data-type="expense" data-category="lainnya"><dt>• Lainnya</dt><dd class="negative">- ${fmtIDR(hpp_lainnya)}</dd></div>
        
        <div class="summary-row">
            <dt>Laba Kotor</dt>
            <dd data-countup-to="${labaKotor}">Rp 0</dd>
        </div>
        
        <div class="detail-list-item interactive" data-action="show-report-detail" data-type="expense" data-category="operasional"><dt>Beban Operasional</dt><dd class="negative">- ${fmtIDR(bebanOperasional)}</dd></div>
        <div class="detail-list-item"><dt>Beban Bunga (Periode Ini)</dt><dd class="negative">- ${fmtIDR(bebanBunga)}</dd></div>
        
        <div class="summary-row final">
            <dt>Laba Bersih</dt>
            <dd class="${labaBersih>=0?'positive':''}" data-countup-to="${labaBersih}">Rp 0</dd>
        </div>
      </dl>
      <div class="report-card-chart">
        <canvas id="laba-rugi-donut-chart"></canvas>
      </div>
    </div>
  `;
  _renderMiniDonut('laba-rugi-donut-chart', ['Material','Gaji','Lainnya', 'Bunga'], [hpp_material, hpp_gaji, hpp_lainnya, bebanBunga], ['#60a5fa','#f59e0b','#a78bfa', '#ef4444']);
  
  // [ANIMASI] Panggil pengamat untuk elemen-elemen baru ini
  container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
}

  async function _renderAnalisisBeban(container) {
    if (!container) return;
    
    await Promise.all([
        fetchAndCacheData('projects', projectsCol),
        fetchAndCacheData('bills', billsCol),
        fetchAndCacheData('attendanceRecords', attendanceRecordsCol, 'date')
    ]);
  
    const totals = {
        main: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } },
        internal: { material: { paid: 0, unpaid: 0 }, operasional: { paid: 0, unpaid: 0 }, lainnya: { paid: 0, unpaid: 0 }, gaji: { paid: 0, unpaid: 0 } }
    };
    const mainProject = appState.projects.find(p => p.projectType === 'main_income');
    const mainProjectId = mainProject?.id;
    const attendanceMap = new Map(appState.attendanceRecords.map(rec => [rec.id, rec]));
  
    appState.bills.forEach(bill => {
        if (bill.type === 'gaji') {
            (bill.recordIds || []).forEach(recordId => {
                const record = attendanceMap.get(recordId);
                if (record) {
                    const projectGroup = (record.projectId === mainProjectId) ? 'main' : 'internal';
                    const statusGroup = bill.status === 'paid' ? 'paid' : 'unpaid';
                    totals[projectGroup].gaji[statusGroup] += record.totalPay || 0;
                }
            });
        } else {
            const projectGroup = (bill.projectId === mainProjectId) ? 'main' : 'internal';
            if (totals[projectGroup] && totals[projectGroup][bill.type]) {
                if (bill.status === 'paid') totals[projectGroup][bill.type]['paid'] += (bill.amount || 0);
                else totals[projectGroup][bill.type]['unpaid'] += (bill.amount || 0);
            }
        }
    });
  
    const generateBebanRowsHTML = (data) => {
        const categories = [{ key: 'material', label: 'Beban Material' }, { key: 'gaji', label: 'Beban Gaji' }, { key: 'operasional', label: 'Beban Operasional' }, { key: 'lainnya', label: 'Beban Lainnya' }];
        return categories.map(cat => {
            const item = data[cat.key];
            const total = item.paid + item.unpaid;
            if (total === 0) return '';
            return `<div class="category-title"><dt>${cat.label}</dt><dd class="negative">- ${fmtIDR(total)}</dd></div><div class="sub-item"><dt>• Lunas</dt><dd>${fmtIDR(item.paid)}</dd></div><div class="sub-item"><dt>• Belum Lunas</dt><dd>${fmtIDR(item.unpaid)}</dd></div>`;
        }).join('');
    };
  
    const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
    
    container.innerHTML = `
    <h5 class="report-title">Analisis Beban Proyek</h5>
    <div class="report-card-content">
      <dl class="detail-list report-card-details">
          <div class="category-title"><dt>Beban Proyek Utama (${mainProject?.projectName || 'N/A'})</dt><dd></dd></div>
          ${generateBebanRowsHTML(totals.main)}
          <div class="summary-row">
              <dt>Total Beban Proyek Utama</dt>
              <dd class="negative" data-countup-to="${totalBebanMain}">- Rp 0</dd>
          </div>
          <div class="category-title"><dt>Beban Proyek Internal</dt><dd></dd></div>
          ${generateBebanRowsHTML(totals.internal)}
          <div class="summary-row">
              <dt>Total Beban Proyek Internal</dt>
              <dd class="negative" data-countup-to="${totalBebanInternal}">- Rp 0</dd>
          </div>
      </dl>
      <div class="report-card-chart">
        <canvas id="beban-utama-donut-chart"></canvas>
      </div>
    </div>
  `;
  _renderMiniDonut('beban-utama-donut-chart', ['Material', 'Gaji', 'Operasional', 'Lainnya'], [totals.main.material.paid + totals.main.material.unpaid, totals.main.gaji.paid + totals.main.gaji.unpaid, totals.main.operasional.paid + totals.main.operasional.unpaid, totals.main.lainnya.paid + totals.main.lainnya.unpaid], ['#60a5fa', '#f59e0b', '#34d399', '#a78bfa']);
  
  // [ANIMASI] Panggil pengamat untuk elemen-elemen baru ini
  container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
}

// GANTI SELURUH FUNGSI _renderLaporanArusKas DENGAN VERSI FINAL INI

async function _renderLaporanArusKas(container) {
    if (!container) return;
    
    await Promise.all([ 
        fetchAndCacheData('incomes', incomesCol), 
        fetchAndCacheData('bills', billsCol),
        fetchAndCacheData('fundingSources', fundingSourcesCol)
    ]);
  
    const inRange = (d) => { 
        const { start, end } = appState.reportFilter || {}; 
        const dt = _getJSDate(d); 
        if (start && dt < new Date(start + 'T00:00:00')) return false; 
        if (end && dt > new Date(end + 'T23:59:59')) return false; 
        return true; 
    };
  
    const kasMasukTermin = (appState.incomes || []).filter(i => inRange(i.date)).reduce((sum, i) => sum + (i.amount || 0), 0);
    const kasMasukPinjaman = (appState.fundingSources || []).filter(f => inRange(f.date)).reduce((sum, f) => sum + (f.totalAmount || 0), 0);
    const totalKasMasuk = kasMasukTermin + kasMasukPinjaman;
  
    const paidBills = (appState.bills || []).filter(b => b.status === 'paid' && inRange(b.paidAt || b.dueDate));
    const kasKeluarMaterial = paidBills.filter(b => b.type === 'material').reduce((sum, b) => sum + (b.amount || 0), 0);
    const kasKeluarGaji = paidBills.filter(b => b.type === 'gaji').reduce((sum, b) => sum + (b.amount || 0), 0);
    const kasKeluarOperasional = paidBills.filter(b => b.type === 'operasional').reduce((sum, b) => sum + (b.amount || 0), 0);
    const kasKeluarLainnya = paidBills.filter(b => b.type === 'lainnya').reduce((sum, b) => sum + (b.amount || 0), 0);
    const totalKasKeluar = kasKeluarMaterial + kasKeluarGaji + kasKeluarOperasional + kasKeluarLainnya;
    const arusKasBersih = totalKasMasuk - totalKasKeluar;
  
    container.innerHTML = `
      <h5 class="report-title">Arus Kas</h5>
      <div class="report-card-content">
        <dl class="detail-list report-card-details">
          <div class="category-title"><dt>Arus Kas Masuk</dt><dd></dd></div>
          <div class="sub-item"><dt>• Penerimaan Termin</dt><dd class="positive">${fmtIDR(kasMasukTermin)}</dd></div>
          <div class="sub-item"><dt>• Penerimaan Pinjaman</dt><dd class="positive">${fmtIDR(kasMasukPinjaman)}</dd></div>
          <div class="summary-row">
              <dt>Total Arus Kas Masuk</dt>
              <dd class="positive" data-countup-to="${totalKasMasuk}">Rp 0</dd>
          </div>
          
          <div class="category-title"><dt>Arus Kas Keluar</dt><dd></dd></div>
          <div class="sub-item"><dt>• Pembayaran Material</dt><dd class="negative">- ${fmtIDR(kasKeluarMaterial)}</dd></div>
          <div class="sub-item"><dt>• Pembayaran Gaji</dt><dd class="negative">- ${fmtIDR(kasKeluarGaji)}</dd></div>
          <div class="sub-item"><dt>• Pembayaran Operasional</dt><dd class="negative">- ${fmtIDR(kasKeluarOperasional)}</dd></div>
          <div class="sub-item"><dt>• Pembayaran Lainnya</dt><dd class="negative">- ${fmtIDR(kasKeluarLainnya)}</dd></div>
          <div class="summary-row">
              <dt>Total Arus Kas Keluar</dt>
              <dd class="negative" data-countup-to="${totalKasKeluar}">- Rp 0</dd>
          </div>
  
          <div class="summary-row final">
              <dt>Arus Kas Bersih</dt>
              <dd class="${arusKasBersih >= 0 ? 'positive' : 'negative'}" data-countup-to="${arusKasBersih}">Rp 0</dd>
          </div>
        </dl>
        <div class="report-card-chart">
          <canvas id="arus-kas-donut-chart"></canvas>
        </div>
      </div>
    `;
  
    _renderMiniDonut('arus-kas-donut-chart', ['Pemasukan', 'Pengeluaran'], [totalKasMasuk, totalKasKeluar], ['#22c55e', '#ef4444']);
    
    // [ANIMASI] Panggil pengamat untuk elemen-elemen baru ini
    container.querySelectorAll('[data-countup-to]').forEach(el => countUpObserver.observe(el));
  }

  function _renderMiniDonut(canvasId, labels, data, colors) {
    const c = document.getElementById(canvasId);
    if (!c) return;

    if (c._chart) c._chart.destroy();
    
    c._chart = new Chart(c.getContext('2d'), {
        type: 'doughnut',
        data: { 
            labels: labels, 
            datasets: [{ 
                data: data, 
                backgroundColor: colors, 
                borderWidth: 0,
                hoverOffset: 8
            }] 
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            // [PERBAIKAN] Tambahkan event handler onClick
            onClick: (evt, elements) => {
                const chart = c._chart;
                if (!elements.length) return;

                const index = elements[0].index;
                const label = chart.data.labels[index];
                
                // Logika untuk menentukan tipe dan kategori berdasarkan label
                let type = 'expense';
                let category = label.toLowerCase();

                if (label.toLowerCase() === 'pemasukan') {
                    type = 'income';
                    category = null;
                } else if (label.toLowerCase() === 'pengeluaran') {
                    type = 'expense';
                    category = null;
                }
                
                _showChartDrillDownModal(label, type, category);
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    enabled: true,
                    callbacks: {
                        label: function(context) {
                            const total = context.chart.data.datasets[0].data.reduce((a, b) => a + b, 0);
                            const label = context.label || '';
                            const value = context.raw || 0;
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${percentage}%`;
                        }
                    }
                }
            }
        }
    });
}

// [TAMBAHAN BARU] Fungsi untuk menampilkan modal rincian dari klik chart
function _showChartDrillDownModal(title, type, category) {
    const { start, end } = appState.reportFilter || {};
    const inRange = (d) => {
        const dt = _getJSDate(d);
        if (start && dt < new Date(start + 'T00:00:00')) return false;
        if (end && dt > new Date(end + 'T23:59:59')) return false;
        return true;
    };

    let items = [];
    if (type === 'income') {
        items = (appState.incomes || []).filter(i => inRange(i.date));
    } else if (type === 'expense') {
        if (category === 'gaji') {
            items = (appState.bills || []).filter(b => b.type === 'gaji' && inRange(b.dueDate || b.createdAt)).map(b => ({
                description: b.description || 'Gaji',
                date: b.dueDate || b.createdAt || new Date(),
                amount: b.amount || 0
            }));
        } else {
            items = (appState.expenses || []).filter(e => (!category || e.type === category) && inRange(e.date));
        }
    }

    const content = items.length ? 
        `<div class="dense-list-container">${items.map(it => `
            <div class="dense-list-item">
                <div class="item-main-content">
                    <strong class="item-title">${it.description || (type==='income'?'Pemasukan':'Pengeluaran')}</strong>
                    <span class="item-subtitle">${_getJSDate(it.date).toLocaleDateString('id-ID')}</span>
                </div>
                <div class="item-actions"><strong class="${type==='income'?'positive':'negative'}">${fmtIDR(it.amount || 0)}</strong></div>
            </div>`).join('')}</div>` 
        : _getEmptyStateHTML({ icon:'insights', title:'Tidak Ada Data', desc:'Tidak ada transaksi pada periode ini.' });

    createModal('dataDetail', { title: `Rincian: ${title}`, content });
}

  async function handleGenerateReportModal() {
  const reportTypeOptions = [{
      value: '',
      text: '-- Pilih Jenis Laporan --'
  }, {
      value: 'analisis_beban',
      text: 'Laporan Analisis Beban (PDF)'
  }, {
      value: 'rekapan',
      text: 'Rekapan Transaksi (PDF)'
  }, {
      value: 'upah_pekerja',
      text: 'Laporan Rinci Upah Pekerja (PDF)'
  }, {
      value: 'material_supplier',
      text: 'Laporan Rinci Material (PDF)'
  }, {
      value: 'material_usage_per_project',
      text: 'Laporan Pemakaian Material per Proyek (PDF)'
  }];
  const content = `
          <form id="report-generator-form">
              ${createMasterDataSelect('report-type-selector', 'Jenis Laporan', reportTypeOptions, '')}
              <div id="report-dynamic-filters"></div>
              <div class="modal-footer" style="margin-top: 1.5rem;">
                  <button type="submit" class="btn btn-primary" disabled>
                      <span class="material-symbols-outlined">download</span> Unduh Laporan
                  </button>
              </div>
          </form>
      `;
  createModal('dataDetail', {
      title: 'Buat Laporan Rinci',
      content
  });
  _initCustomSelects($('#dataDetail-modal'));
  const form = $('#report-generator-form');
  const submitButton = form.querySelector('button[type="submit"]');
  $('#report-type-selector').addEventListener('change', (e) => {
      _renderDynamicReportFilters(e.target.value);
      submitButton.disabled = e.target.value === '';
  });
  form.addEventListener('submit', (e) => {
      e.preventDefault();
      const reportType = $('#report-type-selector').value;
      _handleDownloadReport('pdf', reportType);
  });
}
async function _renderDynamicReportFilters(reportType) {
  const container = $('#report-dynamic-filters');
  container.innerHTML = '';
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
  const todayStr = today.toISOString().slice(0, 10);
  let filtersHTML = '';
  if (reportType && reportType !== 'analisis_beban') {
      filtersHTML += `
              <div class="rekap-filters" style="padding:0; margin-top: 1rem;">
                  <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
                  <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${todayStr}"></div>
              </div>`;
  }
  if (reportType === 'rekapan') {
      await fetchAndCacheData('projects', projectsCol, 'projectName');
      const projectOptions = [{
          value: 'all',
          text: 'Semua Proyek'
      }, ...appState.projects.map(p => ({
          value: p.id,
          text: p.projectName
      }))];
      filtersHTML += createMasterDataSelect('report-project-id', 'Filter Proyek', projectOptions, 'all');
  } else if (reportType === 'material_supplier') {
      await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
      const supplierOptions = [{
          value: 'all',
          text: 'Semua Supplier'
      }, ...appState.suppliers.filter(s => s.category === 'Material').map(s => ({
          value: s.id,
          text: s.supplierName
      }))];
      filtersHTML += createMasterDataSelect('report-supplier-id', 'Filter Supplier', supplierOptions, 'all');
  } else if (reportType === 'material_usage_per_project') {
      await fetchAndCacheData('projects', projectsCol, 'projectName');
      const projectOptions = appState.projects.map(p => ({
          value: p.id,
          text: p.projectName
      }));
      // Tambahkan opsi "Pilih Proyek" sebagai placeholder
      projectOptions.unshift({
          value: '',
          text: '-- Pilih Proyek --'
      });
      filtersHTML += createMasterDataSelect('report-project-id', 'Pilih Proyek', projectOptions, '');
  }
  container.innerHTML = filtersHTML;
  _initCustomSelects(container);
}

async function _handleDownloadReport(format, reportType) { // async tetap dibutuhkan di sini
  if (format === 'csv') {
      toast('info', 'Fitur unduh CSV sedang dalam pengembangan.');
      return;
  }
  let reportConfig = {};

  switch (reportType) {
      case 'analisis_beban':
          reportConfig = await _prepareAnalisisBebanDataForPdf();
          break;
      case 'upah_pekerja':
          reportConfig = await _prepareUpahPekerjaDataForPdf();
          break;
      case 'material_supplier':
          reportConfig = await _prepareMaterialSupplierDataForPdf();
          break;
      case 'rekapan':
          reportConfig = await _prepareRekapanDataForPdf();
          break;
      case 'material_usage_per_project':
          reportConfig = await _prepareMaterialUsageDataForPdf();
          break;
      default:
          toast('error', 'Tipe laporan ini belum didukung.');
          return;
  }

  if (reportConfig && reportConfig.sections && reportConfig.sections.length > 0) {
      await generatePdfReport(reportConfig);
  } else {
      toast('info', 'Tidak ada data untuk ditampilkan pada kriteria yang dipilih.');
  }
}

async function _prepareUpahPekerjaDataForPdf() {
  const startDate = new Date($('#report-start-date').value);
  const endDate = new Date($('#report-end-date').value);
  endDate.setHours(23, 59, 59, 999);
  await Promise.all([fetchAndCacheData('workers', workersCol, 'workerName'), fetchAndCacheData('projects', projectsCol, 'projectName')]);

  const q = query(attendanceRecordsCol, where('date', '>=', startDate), where('date', '<=', endDate), where('status', '==', 'completed'), orderBy('date', 'asc'));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const bodyRows = snap.docs.map(doc => {
      const rec = doc.data();
      const worker = appState.workers.find(w => w.id === rec.workerId);
      const project = appState.projects.find(p => p.id === rec.projectId);
      let statusText = (rec.attendanceStatus === 'full_day')?'Hadir' : '1/2 Hari';

      return [_getJSDate(rec?.date).toLocaleDateString('id-ID'), worker?.workerName || 'N/A', project?.projectName || 'N/A', statusText, fmtIDR(rec.totalPay || 0), rec.isPaid?'Lunas' : 'Belum Dibayar'];
  });
  return {
      title: 'Laporan Rincian Upah Pekerja',
      subtitle: `Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
      filename: `Laporan-Upah-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: [{
          headers: ["Tanggal", "Pekerja", "Proyek", "Status", "Upah", "Status Bayar"],
          body: bodyRows
      }]
  };
}
async function _prepareMaterialSupplierDataForPdf() {
  const startDate = new Date($('#report-start-date').value);
  const endDate = new Date($('#report-end-date').value);
  const supplierId = $('#report-supplier-id').value;
  endDate.setHours(23, 59, 59, 999);

  await Promise.all([fetchAndCacheData('suppliers', suppliersCol, 'supplierName'), fetchAndCacheData('projects', projectsCol, 'projectName')]);
  let queryConstraints = [where('type', '==', 'material'), where('date', '>=', startDate), where('date', '<=', endDate), orderBy('date', 'asc')];
  if (supplierId !== 'all') queryConstraints.push(where('supplierId', '==', supplierId));

  const q = query(expensesCol, ...queryConstraints);
  const snap = await getDocs(q);
  if (snap.empty) return null;
  const bodyRows = snap.docs.flatMap(doc => {
      const exp = doc.data();
      if (!exp.items || exp.items.length === 0) return [];

      const supplier = appState.suppliers.find(s => s.id === exp.supplierId);
      const project = appState.projects.find(p => p.id === exp.projectId);
      return exp.items.map(item => {
          const material = appState.materials.find(m => m.id === item.materialId);
          return [_getJSDate(exp.date).toLocaleDateString('id-ID'), supplier?.supplierName || 'N/A', project?.projectName || 'N/A', material?.materialName || 'N/A', item.qty, fmtIDR(item.price), fmtIDR(item.total)];
      });
  });
  if (bodyRows.length === 0) return null;
  const supplierName = supplierId !== 'all'?appState.suppliers.find(s => s.id === supplierId)?.supplierName : 'Semua Supplier';
  return {
      title: 'Laporan Rincian Material per Supplier',
      subtitle: `Supplier: ${supplierName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
      filename: `Laporan-Material-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: [{
          headers: ["Tanggal", "Supplier", "Proyek", "Barang", "Qty", "Harga", "Total"],
          body: bodyRows
      }]
  };
}
async function _prepareRekapanDataForPdf() {
  const startDate = new Date($('#report-start-date').value);
  const endDate = new Date($('#report-end-date').value);
  const projectId = $('#report-project-id').value;
  endDate.setHours(23, 59, 59, 999);

  await Promise.all([fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol)]);

  let transactions = [];
  appState.incomes.forEach(i => transactions.push({
      date: _getJSDate(i.date),
      type: 'Pemasukan',
      description: 'Penerimaan Termin',
      amount: i.amount,
      projectId: i.projectId
  }));
  appState.expenses.forEach(e => transactions.push({
      date: _getJSDate(e.date),
      type: 'Pengeluaran',
      description: e.description,
      amount: -e.amount,
      projectId: e.projectId
  }));

  const filtered = transactions.filter(t => (projectId === 'all' || t.projectId === projectId) && (t.date >= startDate && t.date <= endDate)).sort((a, b) => a.date - b.date);
  if (filtered.length === 0) return null;
  let balance = 0;
  const bodyRows = filtered.map(t => {
      balance += t.amount;
      return [t.date.toLocaleDateString('id-ID'), t.description, t.amount > 0?fmtIDR(t.amount) : '-', t.amount < 0?fmtIDR(t.amount) : '-', fmtIDR(balance)];
  });
  const totalPemasukan = filtered.filter(t => t.amount > 0).reduce((sum, t) => sum + t.amount, 0);
  const totalPengeluaran = filtered.filter(t => t.amount < 0).reduce((sum, t) => sum + t.amount, 0);
  const footRow = ["Total", "", fmtIDR(totalPemasukan), fmtIDR(totalPengeluaran), fmtIDR(balance)];
  const projectName = projectId !== 'all'?appState.projects.find(p => p.id === projectId)?.projectName : 'Semua Proyek';
  return {
      title: 'Laporan Rekapan Transaksi',
      subtitle: `Proyek: ${projectName} | Periode: ${startDate.toLocaleDateString('id-ID')} s/d ${endDate.toLocaleDateString('id-ID')}`,
      filename: `Rekapan-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: [{
          headers: ["Tanggal", "Deskripsi", "Pemasukan", "Pengeluaran", "Saldo"],
          body: bodyRows,
          foot: footRow
      }]
  };
}
async function _prepareMaterialUsageDataForPdf() {
  const projectId = $('#report-project-id').value;
  if (!projectId) {
      toast('error', 'Silakan pilih proyek terlebih dahulu.');
      return null;
  }
  const q = query(stockTransactionsCol, where("type", "==", "out"), where("projectId", "==", projectId));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  // Kelompokkan dan jumlahkan pemakaian per material
  const usageByMaterial = snap.docs.reduce((acc, doc) => {
      const trans = doc.data();
      if (!acc[trans.materialId]) {
          acc[trans.materialId] = {
              quantity: 0,
              ...appState.materials.find(m => m.id === trans.materialId)
          };
      }
      acc[trans.materialId].quantity += trans.quantity;
      return acc;
  }, {});
  const bodyRows = Object.values(usageByMaterial).map(item => {
      return [item.materialName, item.unit, item.quantity];
  });
  const projectName = appState.projects.find(p => p.id === projectId)?.projectName || 'N/A';
  return {
      title: 'Laporan Pemakaian Material per Proyek',
      subtitle: `Proyek: ${projectName}`,
      filename: `Pemakaian-Material-${projectName.replace(/\s+/g, '-')}.pdf`,
      sections: [{
          headers: ["Nama Material", "Satuan", "Total Pemakaian"],
          body: bodyRows
      }]
  };
}
async function _prepareAnalisisBebanDataForPdf() {
  await Promise.all([fetchAndCacheData('projects', projectsCol), fetchAndCacheData('bills', billsCol)]);
  const totals = {
      main: {
          material: {
              paid: 0,
              unpaid: 0
          },
          operasional: {
              paid: 0,
              unpaid: 0
          },
          lainnya: {
              paid: 0,
              unpaid: 0
          },
          gaji: {
              paid: 0,
              unpaid: 0
          }
      },
      internal: {
          material: {
              paid: 0,
              unpaid: 0
          },
          operasional: {
              paid: 0,
              unpaid: 0
          },
          lainnya: {
              paid: 0,
              unpaid: 0
          },
          gaji: {
              paid: 0,
              unpaid: 0
          }
      }
  };
  const mainProject = appState.projects.find(p => p.projectType === 'main_income');
  const mainProjectId = mainProject?mainProject.id : null;
  appState.bills.forEach(bill => {
      const projectGroup = (bill.projectId === mainProjectId)?'main' : 'internal';
      if (totals[projectGroup] && totals[projectGroup][bill.type]) {
          totals[projectGroup][bill.type][bill.status] += (bill.amount || 0);
      }
  });
  const sections = [];
  const categories = [{
      key: 'material',
      label: 'Beban Material'
  }, {
      key: 'gaji',
      label: 'Beban Gaji'
  }, {
      key: 'operasional',
      label: 'Beban Operasional'
  }, {
      key: 'lainnya',
      label: 'Beban Lainnya'
  }];
  const mainProjectBody = categories.map(cat => {
      const data = totals.main[cat.key];
      const total = data.paid + data.unpaid;
      return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
  }).filter(row => parseFormattedNumber(row[3]) > 0);
  const totalBebanMain = Object.values(totals.main).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
  if (mainProjectBody.length > 0) {
      sections.push({
          sectionTitle: `Proyek Utama (${mainProject?.projectName || 'N/A'})`,
          headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
          body: mainProjectBody,
          foot: ["Total Beban Proyek Utama", "", "", fmtIDR(totalBebanMain)]
      });
  }
  const internalProjectBody = categories.map(cat => {
      const data = totals.internal[cat.key];
      const total = data.paid + data.unpaid;
      return [cat.label, fmtIDR(data.paid), fmtIDR(data.unpaid), fmtIDR(total)];
  }).filter(row => parseFormattedNumber(row[3]) > 0);
  const totalBebanInternal = Object.values(totals.internal).reduce((sum, cat) => sum + cat.paid + cat.unpaid, 0);
  if (internalProjectBody.length > 0) {
      sections.push({
          sectionTitle: `Total Semua Proyek Internal`,
          headers: ["Kategori Beban", "Lunas", "Belum Lunas", "Total"],
          body: internalProjectBody,
          foot: ["Total Beban Proyek Internal", "", "", fmtIDR(totalBebanInternal)]
      });
  }

  const grandTotalBeban = totalBebanMain + totalBebanInternal;
  sections.push({
      sectionTitle: `Ringkasan Total`,
      headers: ["Deskripsi", "Jumlah"],
      body: [
          ['Total Beban Proyek Utama', fmtIDR(totalBebanMain)],
          ['Total Beban Proyek Internal', fmtIDR(totalBebanInternal)],
      ],
      foot: ["Grand Total Semua Beban", fmtIDR(grandTotalBeban)]
  });
  return {
      title: 'Laporan Analisis Beban',
      subtitle: `Ringkasan Total Keseluruhan`,
      filename: `Analisis-Beban-${new Date().toISOString().slice(0, 10)}.pdf`,
      sections: sections
  };
}
async function generatePdfReport(config) {
  const {
      title,
      subtitle,
      filename,
      sections
  } = config;

  if (!sections || sections.length === 0) {
      toast('error', 'Data tidak lengkap untuk PDF.');
      return;
  }

  toast('syncing', 'Membuat laporan PDF...');
  try {
      // 'await' di sini WAJIB ADA untuk menunggu data dari Firestore
      if (!appState.pdfSettings) {
          const docSnap = await getDoc(settingsDocRef);
          if (docSnap.exists()) {
              appState.pdfSettings = docSnap.data();
          } else {
              appState.pdfSettings = {};
          }
      }

      const defaults = {
          companyName: 'CV. ALAM BERKAH ABADI',
          headerColor: '#26a69a'
      };
      const settings = { ...defaults,
          ...appState.pdfSettings
      };

      const {
          jsPDF
      } = window.jspdf;
      const pdf = new jsPDF({
          orientation: 'portrait',
          unit: 'mm',
          format: 'a4'
      });
      const totalPagesExp = '{total_pages_count_string}';
      let lastY = 0;
      const pageWidth = pdf.internal.pageSize.width;

      const hexToRgb = (hex) => {
          const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
          return result?[parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)] : [38, 166, 154];
      };
      const headerRgbColor = hexToRgb(settings.headerColor);

      if (logoData && logoData.startsWith('data:image')) {
          pdf.addImage(logoData, 'PNG', 14, 12, 22, 22);
      }

      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(14);
      pdf.setTextColor(44, 62, 80);
      pdf.text(settings.companyName, 40, 18);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(10);
      pdf.text(title, 40, 24);
      if (subtitle) {
          pdf.setFontSize(9);
          pdf.setTextColor(100, 100, 100);
          pdf.text(subtitle, 40, 29);
      }
      pdf.setDrawColor(220, 220, 220);
      pdf.line(14, 38, pageWidth - 14, 38);
      lastY = 45;

      const didDrawPage = (data) => {
          pdf.setFontSize(8);
          pdf.setTextColor(150, 150, 150);
          pdf.text(`Halaman ${data.pageNumber} dari ${totalPagesExp}`, 14, pdf.internal.pageSize.height - 10);
          const reportDate = new Date().toLocaleString('id-ID', {
              dateStyle: 'long',
              timeStyle: 'short'
          });
          pdf.text(`Dicetak: ${reportDate}`, pageWidth - 14, pdf.internal.pageSize.height - 10, {
              align: 'right'
          });
      };

      const tableConfig = {
          theme: 'grid',
          headStyles: {
              fillColor: headerRgbColor,
              textColor: 255,
              fontStyle: 'bold'
          },
          footStyles: {
              fillColor: [41, 128, 185],
              textColor: 255,
              fontStyle: 'bold'
          },
          alternateRowStyles: {
              fillColor: [245, 245, 245]
          },
          styles: {
              fontSize: 8,
              cellPadding: 2.5,
              valign: 'middle'
          },
      };

      sections.forEach((section, index) => {
          if (section.sectionTitle) {
              if (index > 0) lastY += 10;
              pdf.setFontSize(11).setFont(undefined, 'bold');
              pdf.setTextColor(44, 62, 80);
              pdf.text(section.sectionTitle, 14, lastY);
              lastY += 5;
          }
          pdf.autoTable({
              ...tableConfig,
              head: [section.headers],
              body: section.body,
              foot: section.foot?[section.foot] : [],
              startY: lastY,
              didDrawPage: didDrawPage,
              margin: {
                  top: 40
              }
          });
          lastY = pdf.autoTable.previous.finalY;
      });

      if (typeof pdf.putTotalPages === 'function') {
          pdf.putTotalPages(totalPagesExp);
      }

      pdf.save(filename);
      toast('success', 'PDF berhasil dibuat!');
  } catch (error) {
      console.error("Gagal membuat PDF:", error);
      toast('error', 'Terjadi kesalahan saat membuat PDF.');
  }
}
function _prepareSimulasiData() {
  const groupedByProject = {};
  let totalAlokasi = 0;
  appState.simulasiState.selectedPayments.forEach((amount, id) => {
      const [itemType, itemId] = id.split('-');
      let billOrLoan = null;
      let itemDetails = {
          recipient: 'N/A',
          description: 'N/A',
          amount,
          category: 'lainnya'
      };
      let projectId = 'tanpa_proyek';
      let projectName = 'Tanpa Proyek';
      if (itemType === 'bill') {
          billOrLoan = appState.bills.find(b => b.id === itemId);
          if (billOrLoan) {
              projectId = billOrLoan.projectId || 'tanpa_proyek';
              itemDetails.description = billOrLoan.description;
              itemDetails.category = billOrLoan.type;
              if (billOrLoan.type === 'gaji') itemDetails.recipient = appState.workers.find(w => w.id === billOrLoan.workerId)?.workerName || 'Pekerja';
              else if (billOrLoan.type === 'fee') itemDetails.recipient = appState.staff.find(s => s.id === billOrLoan.staffId)?.staffName || 'Staf';
              else {
                  const expense = appState.expenses.find(e => e.id === billOrLoan.expenseId);
                  itemDetails.recipient = appState.suppliers.find(s => s.id === expense?.supplierId)?.supplierName || 'Supplier';
              }
          }
      } else if (itemType === 'loan') {
          billOrLoan = appState.fundingSources.find(l => l.id === itemId);
          if (billOrLoan) {
              itemDetails.recipient = appState.fundingCreditors.find(c => c.id === billOrLoan.creditorId)?.creditorName || 'Kreditur';
              itemDetails.description = 'Cicilan Pinjaman';
              itemDetails.category = 'pinjaman';
          }
      }
      if (!groupedByProject[projectId]) {
          const project = appState.projects.find(p => p.id === projectId);
          projectName = project?project.projectName : 'Tanpa Proyek';
          groupedByProject[projectId] = {
              projectName,
              itemsByCategory: {}
          };
      }

      if (!groupedByProject[projectId].itemsByCategory[itemDetails.category]) {
          groupedByProject[projectId].itemsByCategory[itemDetails.category] = [];
      }
      groupedByProject[projectId].itemsByCategory[itemDetails.category].push(itemDetails);
      totalAlokasi += amount;
  });
  return {
      groupedByProject,
      totalAlokasi
  };
}
async function _createSimulasiPDF() {
    const danaMasuk = parseFormattedNumber($('#simulasi-dana-masuk').value);
    if (danaMasuk <= 0 || appState.simulasiState.selectedPayments.size === 0) {
        toast('error', 'Isi dana masuk dan pilih minimal satu tagihan.');
        return;
    }
    
    toast('syncing', 'Mempersiapkan PDF...');

    try {
        const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        
        const { groupedByProject, totalAlokasi } = _prepareSimulasiData();
        const sisaDana = danaMasuk - totalAlokasi;

        const sections = [];
  const categoryLabels = {
      gaji: 'Rincian Gaji Pekerja',
      fee: 'Rincian Fee Staf',
      material: 'Rincian Tagihan Material',
      operasional: 'Rincian Tagihan Operasional',
      lainnya: 'Rincian Tagihan Lainnya',
      pinjaman: 'Rincian Cicilan Pinjaman'
  };
  const headers = ['Penerima', 'Deskripsi', 'Jumlah'];
  // Summary Section
  sections.push({
      sectionTitle: 'Ringkasan Alokasi Dana',
      headers: ['Deskripsi', 'Jumlah'],
      body: [
          ['Dana Masuk', fmtIDR(danaMasuk)],
          ['Total Alokasi', fmtIDR(totalAlokasi)]
      ],
      foot: [
          ['Sisa Dana', fmtIDR(sisaDana)]
      ]
  });
  // Loop through each project
  for (const projectId in groupedByProject) {
      const projectData = groupedByProject[projectId];
      let projectTotal = 0;

      // Loop through each category within the project
      for (const category in projectData.itemsByCategory) {
          const items = projectData.itemsByCategory[category];
          const categoryTotal = items.reduce((sum, item) => sum + item.amount, 0);
          projectTotal += categoryTotal;
          sections.push({
              sectionTitle: `${categoryLabels[category]} - Proyek: ${projectData.projectName}`,
              headers: headers,
              body: items.map(item => [item.recipient, item.description, fmtIDR(item.amount)]),
              foot: [
                  ['Subtotal Kategori', '', fmtIDR(categoryTotal)]
              ]
          });
      }
  }

  generatePdfReport({
    title: 'Laporan Simulasi Alokasi Dana',
    subtitle: `Dibuat pada: ${new Date().toLocaleDateString('id-ID')}`,
    filename: `Simulasi-Alokasi-Dana-${new Date().toISOString().slice(0, 10)}.pdf`,
    sections: sections
});
} catch (error) {
toast('error', 'Gagal memuat library PDF. Periksa koneksi Anda.');
console.error("Gagal memuat atau membuat PDF:", error);
}
}

function _getKwitansiHTML(data) {
    const terbilang = (n) => {
        const bilangan = ["", "satu", "dua", "tiga", "empat", "lima", "enam", "tujuh", "delapan", "sembilan", "sepuluh", "sebelas"];
        if (n < 12) return bilangan[n];
        if (n < 20) return terbilang(n - 10) + " belas";
        if (n < 100) return terbilang(Math.floor(n / 10)) + " puluh " + terbilang(n % 10);
        if (n < 200) return "seratus " + terbilang(n - 100);
        if (n < 1000) return terbilang(Math.floor(n / 100)) + " ratus " + terbilang(n % 100);
        if (n < 2000) return "seribu " + terbilang(n - 1000);
        if (n < 1000000) return terbilang(Math.floor(n / 1000)) + " ribu " + terbilang(n % 1000);
        if (n < 1000000000) return terbilang(Math.floor(n / 1000000)) + " juta " + terbilang(n % 1000000);
        return "";
    };
    const jumlahTerbilang = (terbilang(data.jumlah).trim() + " rupiah").replace(/\s+/g, ' ').replace(/^\w/, c => c.toUpperCase());
    return `
        <div class="kwitansi-container">
            <div class="kwitansi-header">
                <h3>KWITANSI</h3>
                <div class="kwitansi-nomor">No: ${data.nomor}</div>
            </div>
            <div class="kwitansi-body">
                <dl>
                    <div><dt>Telah diterima dari</dt><dd>: CV. ALAM BERKAH ABADI</dd></div>
                    <div><dt>Uang Sejumlah</dt><dd class="terbilang">: ${jumlahTerbilang}</dd></div>
                    <div><dt>Untuk Pembayaran</dt><dd>: ${data.deskripsi}</dd></div>
                </dl>
            </div>
            <div class="kwitansi-footer">
                <div class="kwitansi-jumlah-box">${fmtIDR(data.jumlah)}</div>
                <div class="kwitansi-ttd">
                    <p>Cijiwa, ${data.tanggal}</p>
                    <p class="penerima">Penerima,</p>
                    <p class="nama-penerima">${data.namaPenerima}</p>
                </div>
            </div>
        </div>
    `;
}
async function handleCetakKwitansi(billId) {
    toast('syncing', 'Mempersiapkan kwitansi...');
    const bill = appState.bills.find(b => b.id === billId);
    if (!bill) {
        toast('error', 'Data tagihan tidak ditemukan.');
        return;
    }
    let recipientName = 'N/A';
    if (bill.type === 'gaji' && bill.workerId) {
        const worker = appState.workers.find(w => w.id === bill.workerId);
        recipientName = worker?.workerName || 'Pekerja Dihapus';
    } else if (bill.expenseId) {
        const expense = appState.expenses.find(e => e.id === bill.expenseId);
        const supplier = expense?appState.suppliers.find(s => s.id === expense.supplierId) : null;
        recipientName = supplier?.supplierName || 'Supplier';
    }
    const kwitansiData = {
        nomor: `KW-${bill.id.substring(0, 5).toUpperCase()}`,
        tanggal: bill.paidAt?_getJSDate(bill.paidAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) : new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        namaPenerima: recipientName,
        jumlah: bill.amount,
        deskripsi: bill.description
    };
    const modalContent = `
        <div id="kwitansi-printable-area">${_getKwitansiHTML(kwitansiData)}</div>
        <div class="modal-footer kwitansi-footer-actions">
            <button id="download-kwitansi-img-btn" class="btn btn-secondary"><span class="material-symbols-outlined">image</span> Unduh Gambar</button>
            <button id="download-kwitansi-btn" class="btn btn-primary"><span class="material-symbols-outlined">picture_as_pdf</span> Unduh PDF</button>
        </div>
    `;
    createModal('dataDetail', {
        title: 'Pratinjau Kwitansi',
        content: modalContent
    });
    hideToast();
    $('#download-kwitansi-img-btn').addEventListener('click', () => _downloadKwitansiAsImage(kwitansiData));
    $('#download-kwitansi-btn').addEventListener('click', () => _downloadKwitansiAsPDF(kwitansiData));
}
async function handleCetakKwitansiIndividu(dataset) {
    const {
        billId,
        workerId
    } = dataset;
    toast('syncing', 'Mempersiapkan kwitansi...');
    const bill = appState.bills.find(b => b.id === billId);
    if (!bill || !bill.workerDetails) {
        toast('error', 'Data tagihan gabungan tidak ditemukan.');
        return;
    }
    const workerDetail = bill.workerDetails.find(w => w.id === workerId);
    if (!workerDetail) {
        toast('error', 'Data pekerja di tagihan ini tidak ditemukan.');
        return;
    }
    const kwitansiData = {
        nomor: `KW-G-${bill.id.substring(0, 4)}-${workerId.substring(0, 4)}`.toUpperCase(),
        tanggal: bill.paidAt?_getJSDate(bill.paidAt).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }) : new Date().toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        }),
        namaPenerima: workerDetail.name,
        jumlah: workerDetail.amount,
        deskripsi: bill.description
    };
    const modalContent = `
        <div id="kwitansi-printable-area">${_getKwitansiHTML(kwitansiData)}</div>
        <div class="modal-footer kwitansi-footer-actions">
            <button id="download-kwitansi-img-btn" class="btn btn-secondary">
                <span class="material-symbols-outlined">image</span> Unduh Gambar
            </button>
            <button id="download-kwitansi-btn" class="btn btn-primary">
                <span class="material-symbols-outlined">picture_as_pdf</span> Unduh PDF
            </button>
        </div>
    `;
    createModal('dataDetail', {
        title: 'Pratinjau Kwitansi',
        content: modalContent
    });
    hideToast();
    $('#download-kwitansi-img-btn').addEventListener('click', () => _downloadKwitansiAsImage(kwitansiData));
    $('#download-kwitansi-btn').addEventListener('click', () => _downloadKwitansiAsPDF(kwitansiData));
}
async function handlePayIndividualSalaryModal(dataset) {
    const {
        billId,
        workerId
    } = dataset;
    const bill = appState.bills.find(b => b.id === billId);
    const workerDetail = bill?.workerDetails.find(w => w.id === workerId);
    if (!workerDetail) {
        toast('error', 'Data pekerja tidak ditemukan.');
        return;
    }
    // Hitung total terbayar untuk pekerja ini (online + antrian offline)
    let paidByWorker = 0;
    try {
        if (navigator.onLine) {
            const paymentsColRef = collection(db, 'teams', TEAM_ID, 'bills', billId, 'payments');
            const paymentsSnap = await getDocs(query(paymentsColRef, orderBy("date", "desc")));
            paidByWorker += paymentsSnap.docs
                .map(d => d.data())
                .filter(p => p.workerId === workerId)
                .reduce((sum, p) => sum + (p.amount || 0), 0);
        }
        const queued = await localDB.pending_payments.where('billId').equals(billId).toArray();
        paidByWorker += (queued || []).filter(p => p.workerId === workerId).reduce((s, p) => s + (p.amount || 0), 0);
    } catch (e) {
        console.warn('Gagal menghitung pembayaran sebelumnya untuk pekerja:', e);
    }
    const totalForWorker = workerDetail.amount || 0;
    const remaining = Math.max(0, totalForWorker - paidByWorker);
    const content = `
        <form id="payment-form" data-type="individual-salary" data-bill-id="${billId}" data-worker-id="${workerId}" data-async="true" method="POST" data-endpoint="/api/payments/salary" data-success-msg="Pembayaran gaji tercatat">
            <div class="payment-summary">
                <div><span>Total Gaji:</span><strong>${fmtIDR(totalForWorker)}</strong></div>
                <div><span>Sudah Dibayar:</span><strong>${fmtIDR(paidByWorker)}</strong></div>
                <div class="remaining"><span>Sisa:</span><strong>${fmtIDR(remaining)}</strong></div>
            </div>
            <div class="form-group">
                <label>Jumlah Pembayaran</label>
                <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah" value="${new Intl.NumberFormat('id-ID').format(remaining || totalForWorker)}">
            </div>
            <div class="form-group">
                <label>Tanggal Pembayaran</label>
                <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
            </div>
            <div class="form-group">
                <label>Lampiran (Opsional)</label>
                <input type="file" name="paymentAttachment" accept="image/*" capture="environment">
                <small class="text-muted">Anda dapat menambahkan bukti transfer/foto struk.</small>
            </div>
            <button type="submit" class="btn btn-primary">Bayar</button>
        </form>
    `;
    createModal('payment', {
        title: `Bayar/Cicil: ${workerDetail.name}`,
        content,
        paymentType: 'individual-salary'
    });
}
async function _processIndividualSalaryPayment(bill, workerDetail, amountToPayOverride) {
    // Offline-first: dukung pembayaran saat offline
    if (!navigator.onLine) {
        try {
            const local = await localDB.bills.where('id').equals(bill.id).first();
            const baseAmount = local?.amount ?? bill.amount ?? 0;
            const currentPaid = local?.paidAmount ?? bill.paidAmount ?? 0;
            const amountToPay = amountToPayOverride || workerDetail.amount;
            const newPaidAmount = currentPaid + amountToPay;
            const isPaid = newPaidAmount >= baseAmount;
            if (local) {
                await localDB.bills.update(local.localId, {
                    paidAmount: newPaidAmount,
                    status: isPaid?'paid' : 'unpaid',
                    ...(isPaid?{
                        paidAt: new Date()
                    } : {}),
                    needsSync: 1
                });
            } else {
                await localDB.bills.add({
                    id: bill.id,
                    expenseId: bill.expenseId || null,
                    amount: baseAmount,
                    dueDate: bill.dueDate || new Date(),
                    status: isPaid?'paid' : 'unpaid',
                    type: bill.type,
                    projectId: bill.projectId || null,
                    paidAmount: newPaidAmount,
                    needsSync: 1
                });
            }
            // Antrekan riwayat pembayaran individual
            await localDB.pending_payments.add({
                billId: bill.id,
                amount: amountToPay,
                date: new Date(),
                workerId: workerDetail.id,
                workerName: workerDetail.name,
                createdAt: new Date()
            });
            _logActivity(`Membayar Gaji Individual (Offline): ${workerDetail.name}`, {
                billId: bill.id,
                amount: amountToPay
            });
            // [IMPROVE-UI/UX]: clearer offline feedback
            toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
            await loadAllLocalDataToState();
            closeModal($('#dataDetail-modal'));
            handleOpenBillDetail(bill.id, null);
            return;
        } catch (e) {
            toast('error', 'Gagal menyimpan pembayaran offline.');
            console.error(e);
            return;
        }
    }
    toast('syncing', 'Memproses pembayaran...');
    try {
        const billRef = doc(billsCol, bill.id);
        await runTransaction(db, async (transaction) => {
            const billSnap = await transaction.get(billRef);
            if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan");
            const billData = billSnap.data();
            const amountToPay = amountToPayOverride || workerDetail.amount;
            const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
            const isFullyPaid = newPaidAmount >= billData.amount;

            transaction.update(billRef, {
                paidAmount: increment(amountToPay),
                status: isFullyPaid?'paid' : 'unpaid',
                rev: (billData.rev || 0) + 1,
                ...(isFullyPaid && {
                    paidAt: serverTimestamp()
                })
            });
            const paymentRef = doc(collection(billRef, 'payments'));
            transaction.set(paymentRef, {
                amount: amountToPay,
                date: Timestamp.now(),
                workerId: workerDetail.id,
                workerName: workerDetail.name,
                createdAt: serverTimestamp()
            });
        });
        _logActivity(`Membayar Gaji Individual: ${workerDetail.name}`, {
            billId: bill.id,
            amount: amountToPayOverride || workerDetail.amount
        });
        toast('success', 'Pembayaran berhasil dicatat.');
        // Muat ulang data & buka kembali modal
        await fetchAndCacheData('bills', billsCol);
        closeModal($('#dataDetail-modal'));
        handleOpenBillDetail(bill.id, null);
    } catch (error) {
        toast('error', `Gagal memproses pembayaran.`);
        console.error('Individual Salary Payment error:', error);
    }
} // Proses form pembayaran gaji individu dengan jumlah fleksibel
async function handleProcessIndividualSalaryPayment(form) {
    const billId = form.dataset.billId;
    const workerId = form.dataset.workerId;
    const amountToPay = parseFormattedNumber(form.elements.amount.value);
    const date = new Date(form.elements.date.value);
    if (amountToPay <= 0) {
        toast('error', 'Jumlah pembayaran harus lebih dari nol.');
        return;
    }
    const bill = appState.bills.find(b => b.id === billId);
    const workerDetail = bill?.workerDetails.find(w => w.id === workerId);
    if (!bill || !workerDetail) {
        toast('error', 'Data tidak ditemukan.');
        return;
    }
    // Offline: simpan lampiran (opsional) ke storage lokal
    if (!navigator.onLine) {
        try {
            let localAttachmentId = null;
            const file = form.elements.paymentAttachment?.files?.[0];
            if (file) {
                const compressed = await _compressImage(file, 0.85, 1280);
                const blob = compressed || file;
                localAttachmentId = `payment-${billId}-${workerId}-${Date.now()}`;
                await localDB.files.put({
                    id: localAttachmentId,
                    file: blob,
                    addedAt: new Date(),
                    size: blob.size || 0
                });
                await _enforceLocalFileStorageLimit();
            }
            const local = await localDB.bills.where('id').equals(bill.id).first();
            const baseAmount = local?.amount ?? bill.amount ?? 0;
            const currentPaid = local?.paidAmount ?? bill.paidAmount ?? 0;
            const newPaidAmount = currentPaid + amountToPay;
            const isPaid = newPaidAmount >= baseAmount;
            if (local) {
                await localDB.bills.update(local.localId, {
                    paidAmount: newPaidAmount,
                    status: isPaid?'paid' : 'unpaid',
                    ...(isPaid?{
                        paidAt: date
                    } : {}),
                    needsSync: 1
                });
            } else {
                await localDB.bills.add({
                    id: bill.id,
                    expenseId: bill.expenseId || null,
                    amount: baseAmount,
                    dueDate: bill.dueDate || new Date(),
                    status: isPaid?'paid' : 'unpaid',
                    type: bill.type,
                    projectId: bill.projectId || null,
                    paidAmount: newPaidAmount,
                    ...(isPaid?{
                        paidAt: date
                    } : {}),
                    needsSync: 1
                });
            }
            await localDB.pending_payments.add({
                billId: bill.id,
                amount: amountToPay,
                date,
                workerId: workerDetail.id,
                workerName: workerDetail.name,
                localAttachmentId,
                createdAt: new Date()
            });
            _logActivity(`Membayar Gaji Individual (Offline): ${workerDetail.name}`, {
                billId: bill.id,
                amount: amountToPay
            });
            // [IMPROVE-UI/UX]: clearer offline feedback
            toast('info', 'Info: Offline. Data disimpan di perangkat & akan disinkronkan nanti.');
            await loadAllLocalDataToState();
            closeModal($('#payment-modal'));
            closeModal($('#dataDetail-modal'));
            handleOpenBillDetail(bill.id, null);
            return;
        } catch (e) {
            console.error(e);
            toast('error', 'Gagal menyimpan pembayaran offline.');
            return;
        }
    }
    // Online: upload attachment (opsional) dan catat pembayaran
    toast('syncing', 'Memproses pembayaran...');
    try {
        const billRef = doc(billsCol, bill.id);
        let attachmentUrl = null;
        const file = form.elements.paymentAttachment?.files?.[0];
        if (file) {
            attachmentUrl = await _uploadFileToCloudinary(file);
        }
        await runTransaction(db, async (transaction) => {
            const billSnap = await transaction.get(billRef);
            if (!billSnap.exists()) throw new Error('Tagihan tidak ditemukan');
            const billData = billSnap.data();
            const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
            const isFullyPaid = newPaidAmount >= billData.amount;
            transaction.update(billRef, {
                paidAmount: increment(amountToPay),
                status: isFullyPaid?'paid' : 'unpaid',
                rev: (billData.rev || 0) + 1,
                ...(isFullyPaid && {
                    paidAt: serverTimestamp()
                })
            });
            const paymentRef = doc(collection(billRef, 'payments'));
            const paymentData = {
                amount: amountToPay,
                date: Timestamp.now(),
                workerId: workerDetail.id,
                workerName: workerDetail.name,
                createdAt: serverTimestamp()
            };
            if (attachmentUrl) paymentData.attachmentUrl = attachmentUrl;
            transaction.set(paymentRef, paymentData);
        });
        _logActivity(`Membayar Gaji Individual: ${workerDetail.name}`, {
            billId: bill.id,
            amount: amountToPay
        });
        toast('success', 'Pembayaran berhasil dicatat.');
        await fetchAndCacheData('bills', billsCol);
        closeModal($('#payment-modal'));
        closeModal($('#dataDetail-modal'));
        handleOpenBillDetail(bill.id, null);
    } catch (error) {
        console.error('Individual Salary Payment (online) error:', error);
        toast('error', 'Gagal memproses pembayaran.');
    }
}
async function _downloadKwitansiAsPDF(data) {
    toast('syncing', 'Mempersiapkan PDF...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) {
        toast('error', 'Gagal menemukan elemen kwitansi.');
        return;
    }
    try {
        // REVISI: Muat library saat dibutuhkan
        const { jsPDF } = await import('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
        const html2canvas = (await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')).default;
        
        const canvas = await html2canvas(kwitansiElement, { scale: 3, useCORS: true });
        const imgData = canvas.toDataURL('image/png');
        const pdf = new jsPDF({
            orientation: 'portrait',
            unit: 'mm',
            format: 'a7'
        });
        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const canvasAspectRatio = canvas.width / canvas.height;
        let finalImgWidth = pdfWidth - 10;
        let finalImgHeight = finalImgWidth / canvasAspectRatio;
        if (finalImgHeight > pdfHeight - 10) {
            finalImgHeight = pdfHeight - 10;
            finalImgWidth = finalImgHeight * canvasAspectRatio;
        }
        const x = (pdfWidth - finalImgWidth) / 2;
        const y = (pdfHeight - finalImgHeight) / 2;
        pdf.addImage(imgData, 'PNG', x, y, finalImgWidth, finalImgHeight);
        pdf.save(`Kwitansi-${data.namaPenerima.replace(/\s+/g, '-')}-${data.tanggal}.pdf`);
        toast('success', 'PDF berhasil dibuat!');
    } catch (error) {
        console.error("Gagal membuat PDF:", error);
        toast('error', 'Terjadi kesalahan saat membuat PDF.');
    }
}
async function _downloadKwitansiAsImage(data) {
    toast('syncing', 'Membuat gambar kwitansi...');
    const kwitansiElement = $('#kwitansi-printable-area');
    if (!kwitansiElement) {
        toast('error', 'Gagal menemukan elemen kwitansi.');
        return;
    }
    try {
        const html2canvas = (await import('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js')).default;

        const canvas = await html2canvas(kwitansiElement, {
            scale: 3,
            useCORS: true,
            backgroundColor: '#ffffff'
        });
        const link = document.createElement('a');
        link.href = canvas.toDataURL('image/jpeg', 0.95);
        link.download = `Kwitansi-${data.namaPenerima.replace(/\s+/g, '-')}-${data.tanggal}.jpg`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('success', 'Gambar kwitansi berhasil diunduh!');
    } catch (error) {
        console.error("Gagal membuat gambar dari HTML:", error);
        toast('error', 'Terjadi kesalahan saat membuat gambar.');
    }
}

function _attachStaffFormListeners(modal) {
    const paymentTypeSelect = modal.querySelector('input[name="paymentType"]');
    if (!paymentTypeSelect) return;
    const salaryGroup = modal.querySelector('#staff-salary-group');
    const feePercentGroup = modal.querySelector('#staff-fee-percent-group');
    const feeAmountGroup = modal.querySelector('#staff-fee-amount-group');
    const toggleFields = () => {
        const selectedType = paymentTypeSelect.value;
        salaryGroup.classList.toggle('hidden', selectedType !== 'fixed_monthly');
        feePercentGroup.classList.toggle('hidden', selectedType !== 'per_termin');
        feeAmountGroup.classList.toggle('hidden', selectedType !== 'fixed_per_termin');
    };
    // Fungsi ini berjalan saat nilai dropdown (dari hidden input) berubah
    paymentTypeSelect.addEventListener('change', toggleFields);

    // Panggil sekali saat modal dibuka untuk mengatur tampilan awal
    toggleFields();
}
// --- SUB-SEKSI 3.7: FUNGSI CRUD (CREATE, READ, UPDATE, DELETE) ---
// GANTI SELURUH FUNGSI INI DI script.js
async function handleManageMasterData(type, options = {}) {
    const config = masterDataConfig[type];
    if (!config) return;

    const onSelect = options.onSelect;

    await Promise.all([
        fetchAndCacheData(config.stateKey, config.collection, config.nameField),
        fetchAndCacheData('professions', professionsCol, 'professionName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const getListItemContent = (item, type) => {
        let content = `<span>${item[config.nameField]}</span>`;
        if (type === 'materials' && item.unit) {
            content += `<span class="category-badge category-internal">${item.unit}</span>`;
        }
        if (type === 'suppliers' && item.category) {
            content += `<span class="category-badge category-${item.category.toLowerCase()}">${item.category}</span>`;
        }
        if (type === 'projects') {
            if (item.projectType === 'main_income') content += `<span class="category-badge category-main">Utama</span>`;
            else if (item.projectType === 'internal_expense') content += `<span class="category-badge category-internal">Internal</span>`;
        }
        return `<div class="master-data-item-info">${content}</div>`;
    };

    const listHTML = appState[config.stateKey].map(item => `
        <div class="master-data-item" data-id="${item.id}" data-type="${type}" ${onSelect ? 'data-action="select-item" style="cursor: pointer;"' : ''}>
            ${getListItemContent(item, type)}
            <div class="master-data-item-actions">
                ${!onSelect ? `
                    <button class="btn-icon" data-action="edit-master-item"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon btn-icon-danger" data-action="delete-master-item"><span class="material-symbols-outlined">delete</span></button>
                ` : ''}
            </div>
        </div>
    `).join('');

    let formFieldsHTML = `<div class="form-group">
                             <label>Nama ${config.title}</label>
                             <input type="text" name="itemName" placeholder="Masukkan nama..." required>
                          </div>`;

    if (type === 'materials') {
        formFieldsHTML += `
            <div class="form-group">
                <label>Satuan (mis. Pcs, Kg, m³)</label>
                <input type="text" name="itemUnit" placeholder="Masukkan satuan..." required>
            </div>`;
    } else if (type === 'staff') {
        const paymentTypeOptions = [
            { value: 'fixed_monthly', text: 'Gaji Bulanan Tetap' },
            { value: 'per_termin', text: 'Fee per Termin (%)' },
            { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' }
        ];
        formFieldsHTML += `
            ${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, 'fixed_monthly')}
            <div class="form-group" id="staff-salary-group">
                <label>Gaji Bulanan</label>
                <input type="text" inputmode="numeric" name="salary" placeholder="mis. 5.000.000">
            </div>
            <div class="form-group hidden" id="staff-fee-percent-group">
                <label>Persentase Fee (%)</label>
                <input type="number" name="feePercentage" placeholder="mis. 5 untuk 5%">
            </div>
            <div class="form-group hidden" id="staff-fee-amount-group">
                <label>Jumlah Fee Tetap</label>
                <input type="text" inputmode="numeric" name="feeAmount" placeholder="mis. 10.000.000">
            </div>
        `;
    } else if (type === 'suppliers') {
        const categoryOptions = [
            { value: 'Operasional', text: 'Operasional' },
            { value: 'Material', text: 'Material' },
            { value: 'Lainnya', text: 'Lainnya' },
        ];
        formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions);
    } else if (type === 'projects') {
        const projectTypeOptions = [
            { value: 'main_income', text: 'Pemasukan Utama' },
            { value: 'internal_expense', text: 'Biaya Internal (Laba Bersih)' }
        ];
        formFieldsHTML += `
            <div class="form-group">
                <label>Anggaran Proyek</label>
                <input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000">
            </div>
            ${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, 'main_income')}
        `;
    } else if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
        const statusOptions = [{ value: 'active', text: 'Aktif' }, { value: 'inactive', text: 'Tidak Aktif' }];
        
        const projectFieldsHTML = appState.projects.map(p => `
            <fieldset id="project-wage-group-${p.id}" class="project-wage-group">
                <legend>Upah Harian - ${p.projectName}</legend>
                <div class="role-wage-list"></div>
                <button type="button" class="btn btn-secondary btn-sm" data-action="add-role-wage-row" data-project-id="${p.id}">
                    <span class="material-symbols-outlined">add</span> Tambah Peran/Upah
                </button>
            </fieldset>
        `).join('');

        // Tulis ulang formFieldsHTML secara keseluruhan untuk workers
        formFieldsHTML = `
            <div class="form-group">
               <label>Nama ${config.title}</label>
               <input type="text" name="itemName" placeholder="Masukkan nama..." required>
            </div>
            ${createMasterDataSelect('professionId', 'Profesi', professionOptions, '', 'professions')}
            ${createMasterDataSelect('workerStatus', 'Status', statusOptions, 'active')}
            <h5 class="invoice-section-title">Upah Harian per Proyek</h5>
            ${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek. Tambahkan proyek terlebih dahulu.</p>'}
        `;
    }
    
    const content = `
        <div class="master-data-manager" data-type="${type}">
            <form id="add-master-item-form" data-type="${type}">
                ${formFieldsHTML}
                <button type="submit" class="btn btn-primary">Tambah</button>
            </form>
            <div class="master-data-list">
                ${appState[config.stateKey].length > 0 ? listHTML : '<p class="empty-state-small">Belum ada data.</p>'}
            </div>
        </div>
    `;

    const modalEl = createModal('manageMaster', {
        title: onSelect ? `Pilih ${config.title}` : `Kelola ${config.title}`,
        content,
        onClose: () => {
            if (document.querySelectorAll('#modal-container .modal-bg').length > 1) return;
            const page = appState.activePage;
            if (['pemasukan', 'pengeluaran', 'absensi'].includes(page)) {
                const renderFunc = { pemasukan: renderPemasukanPage, pengeluaran: renderPengeluaranPage, absensi: renderAbsensiPage };
                renderFunc[page]();
            }
        }
    });
    
    if (onSelect && modalEl) {
        modalEl.querySelectorAll('[data-action="select-item"]').forEach(itemEl => {
            itemEl.addEventListener('click', () => {
                const itemId = itemEl.dataset.id;
                const selectedItem = appState[config.stateKey].find(i => i.id === itemId);
                if (selectedItem) {
                    onSelect(selectedItem);
                    closeModal(modalEl);
                }
            });
        });
    }

    // Pasang listener spesifik untuk setiap tipe form
    if (modalEl) {
        _initCustomSelects(modalEl); // Inisialisasi semua dropdown kustom

        if (type === 'staff') {
            _attachStaffFormListeners(modalEl);
            modalEl.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', _formatNumberInput));
        } else if (type === 'workers') {
            modalEl.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action="add-role-wage-row"]');
                if (!button) return;
                
                const projectId = button.dataset.projectId;
                const listContainer = modalEl.querySelector(`#project-wage-group-${projectId} .role-wage-list`);
                const newRow = document.createElement('div');
                newRow.className = 'role-wage-row';
                newRow.innerHTML = `
                    <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)">
                    <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah">
                    <button type="button" class="btn-icon btn-icon-danger remove-role-btn"><span class="material-symbols-outlined">delete</span></button>
                `;
                listContainer.appendChild(newRow);
                newRow.querySelector('input[name="role_wage"]').addEventListener('input', _formatNumberInput);
                newRow.querySelector('.remove-role-btn').addEventListener('click', () => newRow.remove());
            });
        }
    }
}

async function handleAddMasterItem(form) {
    const type = form.dataset.type;
    const config = masterDataConfig[type];
    const itemName = form.elements.itemName.value.trim();
    if (!config || !itemName) return;
    const dataToAdd = {
        [config.nameField]: itemName,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
        };
    if (type === 'staff') {
        dataToAdd.paymentType = form.elements.paymentType.value;
        dataToAdd.salary = parseFormattedNumber(form.elements.salary.value) || 0;
        dataToAdd.feePercentage = Number(form.elements.feePercentage.value) || 0;
        dataToAdd.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
    }
    if (type === 'suppliers') dataToAdd.category = form.elements.itemCategory.value;
    if (type === 'projects') {
        dataToAdd.projectType = form.elements.projectType.value;
        dataToAdd.budget = parseFormattedNumber(form.elements.budget.value);
    }
    if (type === 'materials') {
        dataToAdd.unit = form.elements.unit.value.trim();
        dataToAdd.reorderPoint = Number(form.elements.reorderPoint.value) || 0;
        dataToAdd.currentStock = 0;
        dataToAdd.lastPrice = 0;
        dataToAdd.usageCount = 0;
    }

    if (type === 'workers') {
        dataToAdd.professionId = form.elements.professionId.value;
        dataToAdd.status = form.elements.workerStatus.value;

        // [KODE BARU] Logika untuk membaca multi-peran/upah dari form
        const projectWages = {};
        appState.projects.forEach(p => {
            const projectWageGroup = form.querySelector(`#project-wage-group-${p.id}`);
            if (projectWageGroup) {
                const roles = {};
                projectWageGroup.querySelectorAll('.role-wage-row').forEach(row => {
                    const roleName = row.querySelector('input[name="role_name"]').value.trim();
                    const roleWage = parseFormattedNumber(row.querySelector('input[name="role_wage"]').value);
                    if (roleName && roleWage > 0) {
                        roles[roleName] = roleWage;
                    }
                });
                if (Object.keys(roles).length > 0) {
                    projectWages[p.id] = roles;
                }
            }
        });
    }
        dataToAdd.projectWages = projectWages;
        
        toast('syncing', `Menambah ${config.title}...`);
    try {
        const newDocRef = doc(config.collection);
        if (type === 'projects' && dataToAdd.projectType === 'main_income') {
            await runTransaction(db, async (transaction) => {
                const q = query(projectsCol, where("projectType", "==", "main_income"));
                const mainProjectsSnap = await getDocs(q);
                mainProjectsSnap.forEach(docSnap => {
                    const docData = docSnap.data();
                    transaction.update(docSnap.ref, {
                        projectType: 'internal_expense',
                        rev: (docData.rev || 0) + 1,
                        updatedAt: serverTimestamp()
                    });
                });
                transaction.set(newDocRef, dataToAdd);
            });
        } else {
            await setDoc(newDocRef, dataToAdd);
        }
        _logActivity(`Menambah Master Data: ${config.title}`, {
            name: itemName
        });
        toast('success', `${config.title} baru berhasil ditambahkan.`);
        form.reset();
        $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
        await handleManageMasterData(type);
    } catch (error) {
        toast('error', `Gagal menambah ${config.title}.`);
        console.error(error);
    }
}
// GANTI SELURUH FUNGSI INI DI script.js
function handleEditMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;
    const item = appState[config.stateKey].find(i => i.id === id);
    if (!item) {
        toast('error', 'Data tidak ditemukan untuk diedit.');
        return;
    }

    let formFieldsHTML = `<div class="form-group"><label>Nama ${config.title}</label><input type="text" name="itemName" value="${item[config.nameField]}" required></div>`;

    if (type === 'staff') {
        const paymentTypeOptions = [
            { value: 'fixed_monthly', text: 'Gaji Bulanan Tetap' },
            { value: 'per_termin', text: 'Fee per Termin (%)' },
            { value: 'fixed_per_termin', text: 'Fee Tetap per Termin' }
        ];
        formFieldsHTML += `
            ${createMasterDataSelect('paymentType', 'Tipe Pembayaran', paymentTypeOptions, item.paymentType || 'fixed_monthly')}
            <div class="form-group" id="staff-salary-group">
                <label>Gaji Bulanan</label>
                <input type="text" inputmode="numeric" name="salary" value="${item.salary ? new Intl.NumberFormat('id-ID').format(item.salary) : ''}">
            </div>
            <div class="form-group hidden" id="staff-fee-percent-group">
                <label>Persentase Fee (%)</label>
                <input type="number" name="feePercentage" value="${item.feePercentage || ''}">
            </div>
            <div class="form-group hidden" id="staff-fee-amount-group">
                <label>Jumlah Fee Tetap</label>
                <input type="text" inputmode="numeric" name="feeAmount" value="${item.feeAmount ? new Intl.NumberFormat('id-ID').format(item.feeAmount) : ''}">
            </div>
        `;
    } else if (type === 'suppliers') {
        const categoryOptions = [
            { value: 'Operasional', text: 'Operasional' },
            { value: 'Material', text: 'Material' },
            { value: 'Lainnya', text: 'Lainnya' },
        ];
        formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions, item.category || 'Operasional');
    } else if (type === 'projects') {
        const projectTypeOptions = [
            { value: 'main_income', text: 'Pemasukan Utama' },
            { value: 'internal_expense', text: 'Biaya Internal (Beban)' }
        ];
        const budget = item.budget ? new Intl.NumberFormat('id-ID').format(item.budget) : '';
        formFieldsHTML += `
            <div class="form-group">
                <label>Anggaran Proyek</label>
                <input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000" value="${budget}">
            </div>
            ${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, item.projectType || 'main_income')}
        `;
    } else if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
        const statusOptions = [{ value: 'active', text: 'Aktif' }, { value: 'inactive', text: 'Tidak Aktif' }];

        const projectFieldsHTML = appState.projects.map(p => {
            const rolesData = item.projectWages?.[p.id] || {};
            
            const existingRowsHTML = Object.entries(rolesData).map(([roleName, roleWage]) => `
                <div class="role-wage-row">
                    <input type="text" name="role_name" placeholder="Nama Peran (mis. Tukang)" value="${roleName}">
                    <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah" value="${new Intl.NumberFormat('id-ID').format(roleWage)}">
                    <button type="button" class="btn-icon btn-icon-danger remove-role-btn"><span class="material-symbols-outlined">delete</span></button>
                </div>
            `).join('');

            return `
                <fieldset id="project-wage-group-${p.id}" class="project-wage-group">
                    <legend>Upah Harian - ${p.projectName}</legend>
                    <div class="role-wage-list">${existingRowsHTML}</div>
                    <button type="button" class="btn btn-secondary btn-sm" data-action="add-role-wage-row" data-project-id="${p.id}">
                        <span class="material-symbols-outlined">add</span> Tambah Peran/Upah
                    </button>
                </fieldset>
            `;
        }).join('');

        // Tulis ulang formFieldsHTML secara keseluruhan untuk workers
        formFieldsHTML = `
            <div class="form-group">
               <label>Nama ${config.title}</label>
               <input type="text" name="itemName" value="${item[config.nameField]}" required>
            </div>
            ${createMasterDataSelect('professionId', 'Profesi', professionOptions, item.professionId || '', 'professions')}
            ${createMasterDataSelect('workerStatus', 'Status', statusOptions, item.status || 'active')}
            <h5 class="invoice-section-title">Upah Harian per Proyek</h5>
            ${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek.</p>'}
        `;
    } else if (type === 'materials') {
        formFieldsHTML += `
            <div class="form-group"><label>Satuan</label><input type="text" name="unit" value="${item.unit || ''}" required></div>
            <div class="form-group"><label>Titik Pemesanan Ulang</label><input type="number" name="reorderPoint" value="${item.reorderPoint || 0}" required></div>
        `;
    }

    const content = `
        <form id="edit-master-form" data-id="${id}" data-type="${type}">
            ${formFieldsHTML}
            <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
        </form>
    `;

    const modalEl = createModal('editMaster', {
        title: `Edit ${config.title}`,
        content
    });

    // Pasang listener spesifik untuk setiap tipe form
    if (modalEl) {
        _initCustomSelects(modalEl); // Inisialisasi dropdown kustom

        if (type === 'staff') {
            _attachStaffFormListeners(modalEl);
            modalEl.querySelectorAll('input[inputmode="numeric"]').forEach(inp => inp.addEventListener('input', _formatNumberInput));
        } else if (type === 'workers') {
            // Pasang listener untuk format angka pada input yang sudah ada
            modalEl.querySelectorAll('input[name="role_wage"]').forEach(inp => inp.addEventListener('input', _formatNumberInput));

            // Pasang listener untuk menambah baris baru
            modalEl.addEventListener('click', (e) => {
                const button = e.target.closest('[data-action="add-role-wage-row"]');
                if (!button) return;

                const projectId = button.dataset.projectId;
                const listContainer = modalEl.querySelector(`#project-wage-group-${projectId} .role-wage-list`);
                const newRow = document.createElement('div');
                newRow.className = 'role-wage-row';
                newRow.innerHTML = `
                    <input type="text" name="role_name" placeholder="Nama Peran">
                    <input type="text" name="role_wage" inputmode="numeric" placeholder="Nominal Upah">
                    <button type="button" class="btn-icon btn-icon-danger remove-role-btn"><span class="material-symbols-outlined">delete</span></button>
                `;
                listContainer.appendChild(newRow);
                newRow.querySelector('input[name="role_wage"]').addEventListener('input', _formatNumberInput);
                newRow.querySelector('.remove-role-btn').addEventListener('click', () => newRow.remove());
            });

            // Pasang listener untuk menghapus baris yang sudah ada
            modalEl.querySelectorAll('.remove-role-btn').forEach(btn => {
                btn.addEventListener('click', () => btn.closest('.role-wage-row').remove());
            });
        }
    }
}

async function handleUpdateMasterItem(form) {
    const {
        id,
        type
    } = form.dataset;
    const newName = form.elements.itemName.value.trim();
    const config = masterDataConfig[type];
    if (!config || !newName) return;
    const dataToUpdate = {
        [config.nameField]: newName
    };
    if (type === 'staff') {
        dataToUpdate.paymentType = form.elements.paymentType.value;
        dataToUpdate.salary = parseFormattedNumber(form.elements.salary.value) || 0;
        dataToUpdate.feePercentage = Number(form.elements.feePercentage.value) || 0;
        dataToUpdate.feeAmount = parseFormattedNumber(form.elements.feeAmount.value) || 0;
    }
    if (type === 'suppliers') dataToUpdate.category = form.elements.itemCategory.value;
    if (type === 'projects') {
        dataToUpdate.projectType = form.elements.projectType.value;
        dataToUpdate.budget = parseFormattedNumber(form.elements.budget.value);
    }
    if (type === 'materials') {
        dataToUpdate.unit = form.elements.unit.value.trim();
        dataToUpdate.reorderPoint = Number(form.elements.reorderPoint.value) || 0;
    }
    if (type === 'workers') {
        dataToUpdate.professionId = form.elements.professionId.value;
        dataToUpdate.status = form.elements.workerStatus.value;
        
        // [KODE BARU] Logika untuk membaca multi-peran/upah dari form
        const projectWages = {};
        appState.projects.forEach(p => {
            const projectWageGroup = form.querySelector(`#project-wage-group-${p.id}`);
            if (projectWageGroup) {
                const roles = {};
                projectWageGroup.querySelectorAll('.role-wage-row').forEach(row => {
                    const roleName = row.querySelector('input[name="role_name"]').value.trim();
                    const roleWage = parseFormattedNumber(row.querySelector('input[name="role_wage"]').value);
                    if (roleName && roleWage > 0) {
                        roles[roleName] = roleWage;
                    }
                });
                if (Object.keys(roles).length > 0) {
                    projectWages[p.id] = roles;
                }
            }
        });
        dataToUpdate.projectWages = projectWages;
    }
    
    toast('syncing', `Memperbarui ${config.title} (Lokal)...`);
    try {
        const table = localDB[config.stateKey];
        const itemsToUpdate = await table.where('id').equals(id).toArray();
        if (itemsToUpdate.length > 0) {
            const localId = itemsToUpdate[0].localId;
            // Di sini kita tidak menandai 'needsSync' karena master data biasanya 
            // hanya diubah di satu tempat dan perubahannya satu arah (server -> klien)
            // Jadi kita langsung update ke Firestore.
            await optimisticUpdateDoc(config.collection, id, dataToUpdate);
        } else {
            throw new Error("Item tidak ditemukan di database lokal untuk diperbarui.");
        }

        _logActivity(`Memperbarui Master Data: ${config.title}`, {
            docId: id,
            newName
        });
        toast('success', `${config.title} berhasil diperbarui.`);

        await syncFromServer(); // Ambil lagi data terbaru untuk konsistensi
        await handleManageMasterData(type); // Render ulang modal
    } catch (error) {
        toast('error', `Gagal memperbarui ${config.title}.`);
        console.error(error);
    }
}
async function _saveNewMasterMaterial(data) {
    try {
        const docRef = await addDoc(collection(db, 'teams', TEAM_ID, 'materials'), {
            materialName: data.name,
            unit: data.unit,
            currentStock: 0,
            createdAt: serverTimestamp()
        });
        // Mengembalikan data lengkap termasuk ID yang baru dibuat
        return {
            id: docRef.id,
            materialName: data.name,
            unit: data.unit
        };
    } catch (error) {
        console.error("Gagal menyimpan master material baru:", error);
        toast('error', 'Gagal menyimpan data baru.');
        return null;
    }
} // Fungsi untuk membuat dan menangani modal "Tambah Cepat"
function handleAddNewMaterialModal(targetWrapper) {
    const content = `
        <form id="add-new-material-form">
            <div class="form-group">
                <label>Nama Material Baru</label>
                <input type="text" name="materialName" required placeholder="Contoh: Semen Tiga Roda">
            </div>
            <div class="form-group">
                <label>Satuan</label>
                <input type="text" name="unit" required placeholder="Contoh: Zak, Pcs, m�">
            </div>
            <div class="modal-footer" style="margin-top: 1.5rem;">
                <button type="button" class="btn btn-secondary" data-close-modal>Batal</button>
                <button type="submit" class="btn btn-primary">Simpan & Pilih</button>
            </div>
        </form>
    `;
    const modalEl = createModal('dataDetail', {
        title: 'Tambah Master Material',
        content
    });
    $('#add-new-material-form', modalEl)?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const form = e.target;
        const newName = form.elements.materialName.value.trim();
        const newUnit = form.elements.unit.value.trim();
        if (!newName || !newUnit) {
            toast('error', 'Nama dan Satuan harus diisi.');
            return;
        }
        toast('syncing', 'Menyimpan material baru...');
        const newMaterial = await _saveNewMasterMaterial({
            name: newName,
            unit: newUnit
        });
        if (newMaterial) {
            // Ambil referensi ke input di form faktur
            const nameInput = $('.autocomplete-input', targetWrapper);
            const idInput = $('.autocomplete-id', targetWrapper);
            const clearBtn = $('.autocomplete-clear-btn', targetWrapper);

            // Isi form faktur dengan data baru
            nameInput.value = newMaterial.materialName;
            idInput.value = newMaterial.id;
            nameInput.readOnly = true;
            if (clearBtn) clearBtn.style.display = 'flex';

            // Perbarui satuan pada baris terkait jika ada
            const row = targetWrapper.closest('.invoice-item-row');
            const unitSpan = row?.querySelector('.item-unit');
            if (unitSpan) unitSpan.textContent = newMaterial.unit || '';

            // Hapus cache agar data baru tersedia di autocomplete lain
            localStorage.removeItem('master_data:materials');
            appState.materials = [];
            toast('success', 'Material baru berhasil dipilih!');
            closeModal(modalEl);
        }
    });
}
async function handleDeleteMasterItem(id, type) {
    const config = masterDataConfig[type];
    if (!config) return;
    const item = appState[config.stateKey].find(i => i.id === id);
    createModal('confirmDelete', {
        message: `Anda yakin ingin menghapus ${config.title} "${item[config.nameField]}" ini?`,
        onConfirm: async () => {
            toast('syncing', `Menghapus ${config.title}...`);
            try {
                // Coba API
                let ok = false;
                try {
                    await _apiRequest('DELETE', _mapDeleteEndpoint(`master:${type}`, id));
                    ok = true;
                } catch (_) {}
                if (!ok) {
                    // Fallback Firestore
                    await deleteDoc(doc(config.collection, id));
                }

                // Hapus juga di localDB
                const table = localDB[config.stateKey];
                await table.where('id').equals(id).delete();

                _logActivity(`Menghapus Master Data: ${config.title}`, {
                    docId: id,
                    name: item[config.nameField]
                });
                toast('success', `${config.title} berhasil dihapus.`);
                await loadAllLocalDataToState();
                await handleManageMasterData(type); // Render ulang modal
            } catch (error) {
                toast('error', `Gagal menghapus ${config.title}.`);
            }
        }
    });
}

function _getFormDraftKey(form) {
    const k = form.getAttribute('data-draft-key');
    return k?`draft:${k}` : null;
}

function _saveFormDraft(form) {
    try {
        const key = _getFormDraftKey(form);
        if (!key) return;
        const data = {};
        form.querySelectorAll('input, select, textarea').forEach(el => {
            if (el.type === 'file') return;
            const name = el.name || el.id;
            if (!name) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                if (el.checked) data[name] = el.value || true;
            } else {
                data[name] = el.value;
            }
        });
        sessionStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
        console.warn('Gagal menyimpan draf', e);
    }
}

function _restoreFormDraft(form) {
    try {
        const key = _getFormDraftKey(form);
        if (!key) return;
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const data = JSON.parse(raw);
        Object.entries(data).forEach(([name, val]) => {
            const el = form.querySelector(`[name="${name}"]`) || form.querySelector(`#${name}`);
            if (!el) return;
            if (el.type === 'checkbox' || el.type === 'radio') {
                const candidate = form.querySelector(`[name="${name}"][value="${val}"]`);
                if (candidate) candidate.checked = true;
            } else {
                el.value = val;
            }
        });
    } catch (e) {
        console.warn('Gagal memulihkan draf', e);
    }
}

function _clearFormDraft(form) {
    try {
        const key = _getFormDraftKey(form);
        if (key) sessionStorage.removeItem(key);
    } catch (e) {
        console.warn('Gagal menghapus draf', e);
    }
}

function _attachFormDraftPersistence(form) {
    if (!form) return;
    _restoreFormDraft(form);
    const handler = () => _saveFormDraft(form);
    form.addEventListener('input', handler);
    form.addEventListener('change', handler, true);
    form._clearDraft = () => _clearFormDraft(form);
}

async function handleEditItem(id, type) {
    let item, formHTML = 'Form tidak tersedia.';

    // [PERBAIKAN KUNCI] Logika untuk menangani berbagai tipe data sumber
    if (type === 'bill') {
        item = appState.bills.find(b => b.id === id);
        if (item && item.expenseId) {
            type = 'expense'; // Ubah tipe menjadi 'expense' untuk diedit di form pengeluaran
            item = appState.expenses.find(e => e.id === item.expenseId);
        } else if (item && item.type === 'fee') {
            type = 'fee_bill'; // Gunakan tipe baru 'fee_bill' khusus untuk tagihan fee
        }
        // Jika tipe 'gaji', kita tidak menyediakan form edit karena diedit melalui absensi
    } else if (type === 'expense') {
        item = appState.expenses.find(i => i.id === id);
    } else if (type === 'termin') {
        item = appState.incomes.find(i => i.id === id);
    } else if (type === 'pinjaman') {
        item = appState.fundingSources.find(i => i.id === id);
    }

    if (!item) {
        toast('error', 'Data tidak ditemukan untuk diedit.');
        return;
    }

    // Mengambil tanggal dari item dengan aman
    const date = item.date?.toDate ? _getJSDate(item.date).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

    if (type === 'termin') {
        const projectOptions = appState.projects.map(p => ({
            value: p.id,
            text: p.projectName
        }));
        formHTML = `
            <form id="edit-item-form" data-id="${id}" data-type="${type}">
                <div class="form-group"><label>Jumlah</label><input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                ${createMasterDataSelect('projectId', 'Proyek Terkait', projectOptions, item.projectId, 'projects')}
                <button type="submit" class="btn btn-primary">Update</button>
            </form>
        `;
    } else if (type === 'pinjaman') {
        const creditorOptions = appState.fundingCreditors.map(c => ({
            value: c.id,
            text: c.creditorName
        }));
        const loanTypeOptions = [{
            value: 'none',
            text: 'Tanpa Bunga'
        }, {
            value: 'interest',
            text: 'Berbunga'
        }];
        formHTML = `
            <form id="edit-item-form" data-id="${id}" data-type="${type}">
                <div class="form-group"><label>Jumlah</label><input type="text" inputmode="numeric" name="totalAmount" value="${new Intl.NumberFormat('id-ID').format(item.totalAmount)}" required></div>
                <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                ${createMasterDataSelect('creditorId', 'Kreditur', creditorOptions, item.creditorId, 'creditors')}
                ${createMasterDataSelect('interestType', 'Jenis Pinjaman', loanTypeOptions, item.interestType)}
                <div class="loan-details ${item.interestType === 'none' ? 'hidden' : ''}">
                    <div class="form-group"><label>Suku Bunga (% per bulan)</label><input type="number" name="rate" value="${item.rate || ''}" step="0.01" min="1"></div>
                    <div class="form-group"><label>Tenor (bulan)</label><input type="number" name="tenor" value="${item.tenor || ''}" min="1"></div>
                </div>
                <button type="submit" class="btn btn-primary">Update</button>
            </form>
        `;
    } else if (type === 'expense' && item.type === 'material') {
        formHTML = _getEditFormFakturMaterialHTML(item);
    } else if (type === 'expense') {
        let categoryOptions = [], masterType = '', categoryLabel = '';
        if (item.type === 'operasional') {
            categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
            masterType = 'op-cats';
            categoryLabel = 'Kategori Operasional';
        } else if (item.type === 'lainnya') {
            categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
            masterType = 'other-cats';
            categoryLabel = 'Kategori Lainnya';
        }
        formHTML = `
            <form id="edit-item-form" data-id="${id}" data-type="${type}">
                 <div class="form-group"><label>Jumlah</label><input type="text" name="amount" inputmode="numeric" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                 <div class="form-group"><label>Deskripsi</label><input type="text" name="description" value="${item.description}" required></div>
                ${masterType ? createMasterDataSelect('categoryId', categoryLabel, categoryOptions, item.categoryId, masterType) : ''}
                <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                <p>Status saat ini: <strong>${item.status === 'paid' ? 'Lunas' : 'Tagihan'}</strong>. Perubahan status tidak dapat dilakukan di sini.</p>
                <button type="submit" class="btn btn-primary">Update</button>
            </form>
        `;
    } else if (type === 'fee_bill') {
        formHTML = `
            <form id="edit-item-form" data-id="${item.id}" data-type="fee_bill">
                <div class="form-group">
                    <label>Deskripsi</label>
                    <input type="text" name="description" value="${item.description}" required>
                </div>
                <div class="form-group">
                    <label>Jumlah Fee</label>
                    <input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required>
                </div>
                <p>Mengedit tagihan ini tidak akan mengubah catatan pemasukan asli.</p>
                <button type="submit" class="btn btn-primary">Update Tagihan Fee</button>
            </form>
        `;
    }

    const modalEl = createModal('editItem', { title: `Edit Data`, content: formHTML });

    if (modalEl) {
        _initCustomSelects(modalEl);
        modalEl.querySelectorAll('input[inputmode="numeric"]').forEach(input => input.addEventListener('input', _formatNumberInput));

        if (type === 'expense' && item.type === 'material') {
            _initAutocomplete(modalEl);
            $('#add-invoice-item-btn', modalEl)?.addEventListener('click', () => _addInvoiceItemRow(modalEl));
            $('#invoice-items-container', modalEl)?.addEventListener('input', (e) => _handleInvoiceItemChange(e, modalEl));
            $$('.remove-item-btn', modalEl).forEach(btn => btn.addEventListener('click', (e) => {
                e.target.closest('.invoice-item-row').remove();
                _updateInvoiceTotal(modalEl);
            }));
        }
    }
}

// GANTI SELURUH FUNGSI INI DI script.js

async function handleUpdateItem(form) {
    const { id, type } = form.dataset;
    toast('syncing', 'Memperbarui data di perangkat...');
    try {
        let table, dataToUpdate = {}, config = { title: 'Data' };

        // Bagian ini (switch case) tidak berubah, tugasnya menyiapkan data
        switch (type) {
            case 'termin':
                table = localDB.incomes; 
                config.title = 'Pemasukan Termin';
                dataToUpdate = { 
                    amount: parseFormattedNumber(form.elements.amount.value), 
                    date: new Date(form.elements.date.value), 
                    projectId: form.elements.projectId.value 
                };
                break;
            case 'pinjaman':
                table = localDB.funding_sources; 
                config.title = 'Pinjaman';
                dataToUpdate = { 
                    totalAmount: parseFormattedNumber(form.elements.totalAmount.value), 
                    date: new Date(form.elements.date.value), 
                    creditorId: form.elements.creditorId.value, 
                    interestType: form.elements.interestType.value 
                };
                if (dataToUpdate.interestType === 'interest') {
                    dataToUpdate.rate = Number(form.elements.rate.value);
                    dataToUpdate.tenor = Number(form.elements.tenor.value);
                    dataToUpdate.totalRepaymentAmount = dataToUpdate.totalAmount * (1 + (dataToUpdate.rate / 100 * dataToUpdate.tenor));
                }
                break;
            case 'fee_bill':
                table = localDB.bills; 
                config.title = 'Tagihan Fee';
                dataToUpdate = { 
                    description: form.elements.description.value.trim(), 
                    amount: parseFormattedNumber(form.elements.amount.value) 
                };
                break;
            case 'expense':
                table = localDB.expenses; 
                config.title = 'Pengeluaran';
                if (form.querySelector('#invoice-items-container')) {
                    const items = [];
                    $$('.invoice-item-row', form).forEach(row => {
                        const materialId = row.querySelector('input[name="materialId"]')?.value || null;
                        if (materialId) {
                            items.push({
                                name: row.querySelector('input[name="itemName"]').value,
                                price: parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value),
                                qty: parseLocaleNumber(row.querySelector('input[name="itemQty"]').value),
                                total: parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value) * parseLocaleNumber(row.querySelector('input[name="itemQty"]').value),
                                materialId
                            });
                        }
                    });
                    if (items.length === 0) throw new Error('Faktur harus memiliki minimal satu barang.');
                    dataToUpdate = { 
                        projectId: form.elements['project-id'].value, 
                        supplierId: form.elements['supplier-id'].value, 
                        description: form.elements.description.value, 
                        date: new Date(form.elements.date.value), 
                        items: items, 
                        amount: items.reduce((sum, item) => sum + item.total, 0) 
                    };
                } else {
                    dataToUpdate = { 
                        amount: parseFormattedNumber(form.elements.amount.value), 
                        description: form.elements.description.value, 
                        date: new Date(form.elements.date.value), 
                        categoryId: form.elements.categoryId?.value || '' 
                    };
                }
                break;
            default:
                throw new Error('Tipe data untuk update tidak dikenal.');
        }

        // [PERBAIKAN DIMULAI DI SINI]
        // Tentukan tabel mana saja yang terlibat dalam transaksi secara dinamis
        const tablesInTransaction = [table];
        if (type === 'expense') {
            // Jika yang diedit adalah expense, kita juga butuh akses ke tabel bills
            tablesInTransaction.push(localDB.bills);
        }

        // Jalankan transaksi dengan daftar tabel yang sudah benar
        await localDB.transaction('rw', tablesInTransaction, async () => {
            // 1. Update data utama (termin, pinjaman, expense, dll)
            await table.where('id').equals(id).modify({ ...dataToUpdate, needsSync: 1 });
            
            // 2. Jika yang di-update adalah 'expense', update juga data 'bill' yang terkait
            if (type === 'expense') {
                const relatedBill = await localDB.bills.where('expenseId').equals(id).first();
                if (relatedBill) {
                    const billUpdateData = { 
                        description: dataToUpdate.description, 
                        amount: dataToUpdate.amount, 
                        dueDate: dataToUpdate.date, 
                        needsSync: 1 
                    };
                    await localDB.bills.update(relatedBill.localId, billUpdateData);
                }
            }
        });
        // [PERBAIKAN SELESAI]
        
        _logActivity(`Memperbarui Data (Lokal): ${config.title}`, { docId: id });
        toast('success', 'Perubahan berhasil disimpan!');
        
        await loadAllLocalDataToState();
        renderPageContent();
        syncToServer();

    } catch (error) {
        toast('error', `Gagal memperbarui data: ${error.message}`);
        console.error('Update error:', error);
    }
}

async function handleDeleteItem(id, type) {
    createModal('confirmDelete', {
        onConfirm: async () => {
            // Offline-first: jika offline, tandai di localDB
            if (!navigator.onLine) {
                try {
                    let table = null;
                    if (type === 'termin') table = localDB.incomes;
                    else if (type === 'pinjaman') table = localDB.funding_sources;
                    else if (type === 'expense') table = localDB.expenses;
                    else if (type === 'bill') table = localDB.bills;
                    else return;
                    const local = await table.where('id').equals(id).first();
                    if (local) await table.update(local.localId, {
                        isDeleted: 1,
                        needsSync: 1
                    });

                    if (type === 'expense') {
                        // Tandai bill terkait sebagai terhapus
                        const related = await localDB.bills.where('expenseId').equals(id).toArray();
                        for (const b of related) {
                            await localDB.bills.update(b.localId, {
                                isDeleted: 1,
                                needsSync: 1
                            });
                        }
                    }
                    if (type === 'bill') {
                        // Jika bill gaji, reset status absensi lokal
                        const bill = appState.bills.find(b => b.id === id);
                        const recordIds = bill?.recordIds || [];
                        for (const recId of recordIds) {
                            const rec = await localDB.attendance_records.where('id').equals(recId).first();
                            if (rec) await localDB.attendance_records.update(rec.localId, {
                                isPaid: false,
                                billId: null,
                                needsSync: 1
                            });
                        }
                    }
                    _logActivity(`Menghapus Data (Offline) ${type}`, {
                        docId: id
                    });
                    toast('success', 'Data dihapus di perangkat.');
                    await loadAllLocalDataToState();
                    renderPageContent();
                    return;
                } catch (err) {
                    toast('error', 'Gagal menghapus data secara offline.');
                    console.error(err);
                    return;
                }
            }
            toast('syncing', 'Menghapus data...');
            try {
                let apiDeleted = false;
                try {
                    // [PERBAIKAN] Cek apakah sedang di server dev statis
                    const isDevStatic = (location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (location.port === '5500' || location.port === '5501');
                    if (isDevStatic) {
                        throw new Error('DEV_NO_API'); // Langsung lempar error untuk masuk ke blok catch
                    }
                    const ep = _mapDeleteEndpoint(type, id);
                    if (ep) { await _apiRequest('DELETE', ep); apiDeleted = true; }
                } catch (_) {
                    // Blok catch ini sekarang akan menangani kegagalan jaringan DAN server dev statis
                    // Sehingga fallback ke Firestore akan berjalan dengan benar
                }
                
                let col, item;
                if (type === 'termin') {
                    col = incomesCol;
                    item = appState.incomes.find(i => i.id === id);
                } else if (type === 'pinjaman') {
                    col = fundingSourcesCol;
                    item = appState.fundingSources.find(i => i.id === id);
                } else if (type === 'expense') {
                    col = expensesCol;
                    item = appState.expenses.find(i => i.id === id);
                } else if (type === 'bill') {
                    col = billsCol;
                    item = appState.bills.find(i => i.id === id);
                } else return;

                if (!apiDeleted && type === 'bill' && item && item.type === 'gaji') {
                    const recordIds = item.recordIds || [];
                    if (recordIds.length > 0) {
                        const batch = writeBatch(db);
                        recordIds.forEach(recordId => {
                            batch.update(doc(attendanceRecordsCol, recordId), {
                                isPaid: false,
                                billId: null
                            });
                        });
                        await batch.commit();
                    }
                }
                if (!apiDeleted && type === 'bill') {
                    const paymentsSnap = await getDocs(collection(db, 'teams', TEAM_ID, 'bills', id, 'payments'));
                    if (!paymentsSnap.empty) {
                        const pBatch = writeBatch(db);
                        paymentsSnap.docs.forEach(d => pBatch.delete(d.ref));
                        await pBatch.commit();
                    }
                }
                if (!apiDeleted) await deleteDoc(doc(col, id));

                if (type === 'expense') {
                    const q = query(billsCol, where("expenseId", "==", id));
                    const billSnap = await getDocs(q);
                    const batch = writeBatch(db);
                    billSnap.docs.forEach(d => batch.delete(d.ref));
                    await batch.commit();
                }

                _logActivity(`Menghapus Data ${type}`, {
                    docId: id,
                    description: item?.description || item?.amount || 'N/A' // Perbaikan untuk Error #2 juga ada di sini
                });
                toast('success', 'Data berhasil dihapus.');

                if (appState.activePage === 'pemasukan') _rerenderPemasukanList(appState.activeSubPage.get('pemasukan'));
                if (appState.activePage === 'pengeluaran') renderPengeluaranPage();
                if (appState.activePage === 'tagihan') renderTagihanPage();
                if (appState.activePage === 'jurnal') renderJurnalPage();
            } catch (error) {
                toast('error', 'Gagal menghapus data.');
                console.error('Delete error:', error);
            }
        }
    });
}

async function handleManageUsers() {
    toast('syncing', 'Memuat data pengguna...');
    try {
        const pendingQuery = query(membersCol, where("status", "==", "pending"));
        const pendingSnap = await getDocs(pendingQuery);
        const pendingUsers = pendingSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
        const otherUsersQuery = query(membersCol, where("status", "!=", "pending"));
        const otherUsersSnap = await getDocs(otherUsersQuery);
        const otherUsers = otherUsersSnap.docs.map(d => ({
            id: d.id,
            ...d.data()
        }));
        appState.users = [...pendingUsers, ...otherUsers];
        const createUserHTML = (user) => {
            const userRole = user.role || 'viewer';
            const userStatus = user.status || 'pending';
            return `
                    <div class="master-data-item">
                        <div class="user-info-container">
                            <strong>${user.name}</strong>
                            <span class="user-email">${user.email}</span>
                            <div class="user-badges">
                                <span class="user-badge role-${userRole.toLowerCase()}">${userRole}</span>
                                <span class="user-badge status-${userStatus.toLowerCase()}">${userStatus}</span>
                            </div>
                        </div>
                        <div class="master-data-item-actions">
                            ${user.status === 'pending'?`
                                <button class="btn-icon btn-icon-success" data-action="user-action" data-id="${user.id}" data-type="approve" title="Setujui"><span class="material-symbols-outlined">check_circle</span></button>
                                <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Tolak/Hapus"><span class="material-symbols-outlined">cancel</span></button>
                            ` : ''}
                            ${user.status === 'active' && user.role !== 'Owner'?`
                                ${user.role !== 'Editor'?`<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-editor" title="Jadikan Editor"><span class="material-symbols-outlined">edit_note</span></button>`:''}
                                ${user.role !== 'Viewer'?`<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-viewer" title="Jadikan Viewer"><span class="material-symbols-outlined">visibility</span></button>`:''}
                                <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                            `: ''}
                        </div>
                    </div>`;
        };

        const pendingUsersHTML = pendingUsers.length > 0 ?
            `<h5 class="detail-section-title" style="margin-top: 0;">Menunggu Persetujuan</h5>${pendingUsers.map(createUserHTML).join('')}` :
            '';
        const otherUsersSorted = otherUsers.sort((a, b) => (a.role === 'Owner'?-1 : 1));
        const otherUsersHTML = otherUsers.length > 0 ?
            `<h5 class="detail-section-title" style="${pendingUsers.length > 0?'' : 'margin-top: 0;'}">Pengguna Terdaftar</h5>${otherUsersSorted.map(createUserHTML).join('')}` :
            '';
        const noUsersHTML = appState.users.length === 0?'<p class="empty-state-small">Tidak ada pengguna lain.</p>' : '';
        createModal('manageUsers', {
            title: 'Manajemen Pengguna',
            content: `
                <div class="master-data-list">
                    ${noUsersHTML}
                    ${pendingUsersHTML}
                    ${otherUsersHTML}
                </div>
            `
        });
        toast('success', 'Data pengguna dimuat.');
    } catch (e) {
        console.error("Gagal mengambil data pengguna:", e);
        toast('error', 'Gagal memuat data pengguna.');
        return;
    }
}
async function handleUserAction(dataset) {
    const {
        id,
        type
    } = dataset;
    const user = appState.users.find(u => u.id === id);
    if (!user) return;

    const actionMap = {
        'approve': {
            message: `Setujui <strong>${user.name}</strong> sebagai Viewer?`,
            data: {
                status: 'active',
                role: 'Viewer'
            }
        },
        'make-editor': {
            message: `Ubah peran <strong>${user.name}</strong> menjadi Editor?`,
            data: {
                role: 'Editor'
            }
        },
        'make-viewer': {
            message: `Ubah peran <strong>${user.name}</strong> menjadi Viewer?`,
            data: {
                role: 'Viewer'
            }
        },
        'delete': {
            message: `Hapus atau tolak pengguna <strong>${user.name}</strong>? Aksi ini tidak dapat dibatalkan.`,
            data: null
        }
    };
    const action = actionMap[type];
    if (!action) return;
    createModal('confirmUserAction', {
        message: action.message,
        onConfirm: async () => {
            toast('syncing', 'Memproses...');
            try {
                const userRef = doc(membersCol, id);
                if (type === 'delete') {
                    await deleteDoc(userRef);
                } else {
                    await updateDoc(userRef, action.data);
                }
                _logActivity(`Aksi Pengguna: ${type}`, {
                    targetUserId: id,
                    targetUserName: user.name
                });
                toast('success', 'Aksi berhasil dilakukan.');
                handleManageUsers();
            } catch (error) {
                toast('error', 'Gagal memproses aksi.');
                console.error('User action error:', error);
            }
        }
    });
}
// Definisikan referensi dokumen untuk pengaturan di dekat referensi koleksi lainnya
const settingsDocRef = doc(db, 'teams', TEAM_ID, 'settings', 'pdf');
async function handleEditPdfSettings() {
    toast('syncing', 'Memuat pengaturan...');
    let currentSettings = {};
    try {
        const docSnap = await getDoc(settingsDocRef);
        if (docSnap.exists()) {
            currentSettings = docSnap.data();
        }
        hideToast();
    } catch (e) {
        toast('error', 'Gagal memuat pengaturan.');
        console.error("Gagal memuat pengaturan PDF:", e);
    }
    // Definisikan nilai default jika pengaturan belum ada
    const companyName = currentSettings.companyName || 'CV. ALAM BERKAH ABADI';
    const logoUrl = currentSettings.logoUrl || 'https://i.ibb.co/mRp1s1W/logo-cv-aba.png';
    const headerColor = currentSettings.headerColor || '#26a69a';
    // Buat konten HTML untuk modal form
    const content = `
            <form id="pdf-settings-form">
                <p>Ubah detail yang akan muncul di header semua laporan PDF.</p>
                <div class="form-group">
                    <label>Nama Perusahaan</label>
                    <input type="text" name="companyName" value="${companyName}" required>
                </div>
                <div class="form-group">
                    <label>URL Logo (PNG/JPG)</label>
                    <input type="url" name="logoUrl" value="${logoUrl}" placeholder="https://contoh.com/logo.png">
                </div>
                <div class="form-group">
                    <label>Warna Header Tabel</label>
                    <input type="color" name="headerColor" value="${headerColor}" style="width: 100%; height: 40px;">
                </div>
                <div class="modal-footer" style="margin-top: 1.5rem;">
                    <button type="submit" class="btn btn-primary">Simpan Pengaturan</button>
                </div>
            </form>
        `;
    const modal = createModal('dataDetail', {
        title: 'Pengaturan Laporan PDF',
        content
    });
    // Tambahkan listener untuk menyimpan form
    $('#pdf-settings-form', modal).addEventListener('submit', async (e) => {
        e.preventDefault();
        toast('syncing', 'Menyimpan pengaturan...');
        const form = e.target;
        const newSettings = {
            companyName: form.elements.companyName.value.trim(),
            logoUrl: form.elements.logoUrl.value.trim(),
            headerColor: form.elements.headerColor.value,
        };
        try {
            await setDoc(settingsDocRef, newSettings);
            appState.pdfSettings = newSettings; // Update cache di state
            toast('success', 'Pengaturan PDF berhasil disimpan.');
            closeModal(modal);
        } catch (error) {
            toast('error', 'Gagal menyimpan pengaturan.');
            console.error(error);
        }
    });
}

// =======================================================
//          SEKSI 4: RENDER UI UTAMA & EVENT LISTENERS
// =======================================================
function renderUI() {
    const {
        currentUser,
        userStatus,
        userRole
    } = appState;
    if (!currentUser || userStatus !== 'active') {
        document.body.classList.add('guest-mode');
        if (userStatus === 'pending') document.body.classList.add('pending-mode');
        else document.body.classList.remove('pending-mode');
        $('main').innerHTML = `<div class="page-container">${getAuthScreenHTML()}</div>`;
        // Sembunyikan nama halaman dan bottom nav di lobby/login
        const titleEl = $('#page-label-name');
        if (titleEl) titleEl.textContent = '';
        const bn = $('#bottom-nav');
        if (bn) bn.innerHTML = '';
        if (userStatus === 'pending') {
            $('.auth-card .card-body')?.insertAdjacentHTML('beforeend', '<p class="pending-status-msg">Akun Anda sedang menunggu persetujuan dari Owner.</p>');
        }
    } else {
        document.body.classList.remove('guest-mode');
        document.body.classList.remove('pending-mode');
        $('main').innerHTML = `<div class="page-container"></div>`;
        renderBottomNav();
        renderSidebar();
        renderPageContent();
        // [IMPROVE-UI/UX]: default enter as slide-up for initial load
        animatePageEnter(document.querySelector('.page-container'), 'up');
        initHistoryNavigation();
    }
}

function getAuthScreenHTML() {
    return `
        <div class="auth-card">
            <div class="card-header">
                <h3>Selamat Datang di BanPlex</h3>
            </div>
            <div class="card-body">
                <p>Silakan masuk menggunakan akun Google Anda untuk melanjutkan.</p>
                <button class="btn btn-primary" data-action="auth-action">
                    <span class="material-symbols-outlined">login</span> Masuk dengan Google
                </button>
            </div>
        </div>`;
}

function renderBottomNav() {
    const navContainer = $('#bottom-nav');
    if (!navContainer) return;

    const role = appState.userRole;
    const limited = BOTTOM_NAV_BY_ROLE[role] || [];
    let accessibleLinks = ALL_NAV_LINKS.filter(link => link.roles.includes(role));
    if (limited.length > 0) {
        // gunakan urutan sesuai konfigurasi per role
        accessibleLinks = accessibleLinks
            .filter(link => limited.includes(link.id))
            .sort((a, b) => limited.indexOf(a.id) - limited.indexOf(b.id));
    }

    const navItemsHTML = accessibleLinks.map(link => {
        const isActive = appState.activePage === link.id;
        let badgeHTML = '';
        if (link.id === 'pengaturan' && appState.pendingUsersCount > 0) {
            badgeHTML = `<span class="notification-badge">${appState.pendingUsersCount}</span>`;
        }
        return `
            <button class="nav-item ${isActive?'active' : ''}" data-nav="${link.id}">
                ${badgeHTML}
                <span class="material-symbols-outlined">${link.icon}</span>
                <span class="nav-label">${link.label}</span>
            </button>
        `;
    }).join('');

    navContainer.innerHTML = navItemsHTML;
}

// Render Sidebar (desktop): tampilkan semua link sesuai role
function renderSidebar() {
    const sidebar = $('#sidebar-nav');
    if (!sidebar) return;

    const { currentUser, userStatus } = appState;
    if (!currentUser || userStatus !== 'active') {
        sidebar.innerHTML = '';
        return;
    }

    const links = ALL_NAV_LINKS.filter(l => l.roles.includes(appState.userRole));
    const itemsHTML = links.map(link => {
        const isActive = appState.activePage === link.id;
        const badge = link.id === 'pengaturan' && appState.pendingUsersCount > 0
            ? `<span class="notification-badge">${appState.pendingUsersCount}</span>`
            : '';
        return `
            <button class="sidebar-nav-item ${isActive ? 'active' : ''}" data-nav="${link.id}">
                <span class="material-symbols-outlined">${link.icon}</span>
                <span class="nav-text">${link.label}</span>
                ${badge}
            </button>
        `;
    }).join('');

    const user = appState.currentUser;
    const profileHTML = user ? `
        <div class="sidebar-profile">
            <div class="sidebar-profile-info">
                <img class="profile-avatar-sm" src="${user.photoURL || 'icons-logo.png'}" alt="${user.displayName || 'User'}" />
                <div class="profile-text">
                    <span class="profile-name-sm">${user.displayName || 'Pengguna'}</span>
                    <span class="profile-email-sm">${user.email || ''}</span>
                </div>
            </div>
        </div>
    ` : '';

    sidebar.innerHTML = `
        <div class="sidebar-header">
            <img class="sidebar-logo" src="icons-logo.png" alt="BanPlex" />
            <span class="sidebar-app-name">BanPlex</span>
        </div>
        <div class="sidebar-nav-list">
            ${itemsHTML}
        </div>
        ${profileHTML}
    `;
}

function renderPageContent() {
    const { activePage, userStatus } = appState;
    if (userStatus !== 'active') return;

    const pageLink = ALL_NAV_LINKS.find(link => link.id === activePage);
    $('#page-label-name').textContent = pageLink ? pageLink.label : '';

    const container = $('.page-container');
    container.innerHTML = _getSkeletonLoaderHTML(activePage);

    // [PERBAIKAN KUNCI] Logika baru untuk Halaman Tagihan
    if (activePage === 'tagihan') {
        renderTagihanPageLayout();   // 1. Bangun kerangka
        return _renderTagihanContent(); // 2. Isi kontennya
    }

    // Logika untuk halaman lain tetap sama
    const pageRenderers = {
        'dashboard': renderDashboardPage,
        'pemasukan': renderPemasukanPage,
        'pengeluaran': renderPengeluaranPage,
        'absensi': renderAbsensiPage,
        'jurnal': renderJurnalPage,
        'stok': renderStokPage,
        'laporan': renderLaporanPage,
        'simulasi': renderSimulasiBayarPage,
        'pengaturan': renderPengaturanPage,
        'log_aktivitas': renderLogAktivitasPage
    };

    const renderFunc = pageRenderers[activePage];
    if (typeof renderFunc === 'function') {
        return renderFunc();
    } else {
        container.innerHTML = `<p class="empty-state">Halaman tidak ditemukan.</p>`;
        return Promise.resolve();
    }
}

function _getSingleJurnalHarianCardHTML(dateStr, dayData) {
    const dayDate = new Date(dateStr);
    const formattedDate = dayDate.toLocaleDateString('id-ID', {
        weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC'
    });

    return `
        <div class="card card-list-item" data-action="view-jurnal-harian" data-date="${dateStr}" style="opacity:0; transform: translateY(10px); transition: opacity 0.4s ease, transform 0.4s ease;">
            <div class="card-list-item-content">
                <div class="card-list-item-details">
                    <h5 class="card-list-item-title">${formattedDate}</h5>
                    <p class="card-list-item-subtitle">${dayData.workerCount} Pekerja Hadir</p>
                </div>
                <div class="card-list-item-amount-wrapper">
                    <strong class="card-list-item-amount negative">${fmtIDR(dayData.totalUpah)}</strong>
                    <p class="card-list-item-repayment-info">Total Beban Upah</p>
                </div>
            </div>
        </div>
    `;
}
function upsertJurnalHarianCardInUI(dateStr) {
    const container = document.querySelector('#jurnal-absensi-content div, #sub-page-content div');
    if (!container) return;

    const groupedByDay = _groupAttendanceByDay(appState.attendanceRecords);
    const dayData = groupedByDay[dateStr];

    if (!dayData) {
        removeJurnalHarianCardFromUI(dateStr);
        return;
    }

    const existingCard = container.querySelector(`.card-list-item[data-date="${dateStr}"]`);
    
    if (existingCard) {
        console.log(`Memperbarui UI untuk Jurnal Harian tanggal: ${dateStr}`);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = _getSingleJurnalHarianCardHTML(dateStr, dayData);
        existingCard.innerHTML = tempDiv.firstElementChild.innerHTML;
    } else {
        console.log(`Data baru untuk Jurnal Harian tanggal: ${dateStr}. Merender ulang list.`);
        _renderJurnalHarianView(container);
    }
}

function removeJurnalHarianCardFromUI(dateStr) {
    const cardElement = document.querySelector(`.card-list-item[data-date="${dateStr}"]`);
    if (cardElement) {
        console.log(`Menghapus kartu Jurnal Harian dari UI untuk tanggal: ${dateStr}`);
        cardElement.style.opacity = '0';
        cardElement.style.transform = 'scale(0.95)';
        setTimeout(() => cardElement.remove(), 400);
    }
}

function _getSingleBillRowHTML(item) {
    let supplierName = '';
    const expense = appState.expenses.find(e => e.id === item.expenseId);
    if (expense && expense.supplierId) {
        supplierName = appState.suppliers.find(s => s.id === expense.supplierId)?.supplierName || '';
    } else if (item.type === 'gaji') {
        const workerDetail = item.workerDetails ? item.workerDetails[0] : null;
        supplierName = workerDetail?.name || item.description;
    }

    const date = item.dueDate ? _getJSDate(item.dueDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) : 'N/A';
    const subtitle = supplierName ? `${supplierName} - Jatuh Tempo: ${date}` : `Jatuh Tempo: ${date}`;
    const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
    const isFullyPaid = remainingAmount <= 0;

    let statusHTML = '';
    if (isFullyPaid) {
        statusHTML = `<span class="status-badge positive">Lunas</span>`;
    } else if (item.paidAmount > 0) {
        statusHTML = `<span class="status-badge warn">Sisa ${fmtIDR(remainingAmount)}</span>`;
    } else {
        statusHTML = `<span class="status-badge negative">Belum Dibayar</span>`;
    }

    return `
        <div class="dense-list-item" data-id="${item.id}" data-expense-id="${item.expenseId || ''}" style="opacity:0; transform: translateY(10px); transition: opacity 0.4s ease, transform 0.4s ease;">
            <div class="item-main-content" data-action="open-bill-detail">
                <strong class="item-title">${item.description}</strong>
                <span class="item-subtitle">${subtitle}</span>
                <div class="item-details">
                    <strong class="item-amount">${fmtIDR(item.amount)}</strong>
                    ${statusHTML}
                </div>
            </div>
            <div class="item-actions">
                <button class="btn-icon" data-action="open-bill-actions-modal" data-id="${item.id}" data-expense-id="${item.expenseId || ''}">
                    <span class="material-symbols-outlined">more_vert</span>
                </button>
            </div>
        </div>
    `;
}

function upsertBillRowInUI(billData) {
    const container = document.querySelector('#sub-page-content .dense-list-container');
    if (!container) return;

    const existingRow = container.querySelector(`.dense-list-item[data-id="${billData.id}"]`);
    
    if (existingRow) {
        console.log(`Memperbarui UI untuk tagihan ID: ${billData.id}`);
        const newRowHTML = _getSingleBillRowHTML(billData);
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = newRowHTML;
        existingRow.innerHTML = tempDiv.firstElementChild.innerHTML; // Hanya ganti konten dalamnya
    } else {
        console.log(`Menambahkan tagihan baru ke UI dengan ID: ${billData.id}`);
        const newRowHTML = _getSingleBillRowHTML(billData);
        container.insertAdjacentHTML('afterbegin', newRowHTML);
        setTimeout(() => {
            const newElement = container.querySelector(`.dense-list-item[data-id="${billData.id}"]`);
            if(newElement) {
                newElement.style.opacity = '1';
                newElement.style.transform = 'translateY(0)';
            }
        }, 50);
    }
}

function removeBillRowFromUI(billId) {
    const rowElement = document.querySelector(`.dense-list-item[data-id="${billId}"]`);
    if (rowElement) {
        console.log(`Menghapus tagihan dari UI dengan ID: ${billId}`);
        rowElement.style.opacity = '0';
        rowElement.style.transform = 'translateX(-20px)';
        setTimeout(() => rowElement.remove(), 400);
    }
}

async function handleNavigation(navId, opts = {}) {
    // 1. Validasi: Jangan jalankan jika halaman sama atau sedang transisi
    if (!navId || appState.activePage === navId || isPageTransitioning) {
        return;
    }

    isPageTransitioning = true;
    const container = document.querySelector('.page-container');

    // KUNCI PERBAIKAN UTAMA:
    // Langsung setel timer untuk membuka kunci di awal.
    // Durasinya harus cukup untuk (animasi keluar + render konten + animasi masuk).
    setTimeout(() => {
        isPageTransitioning = false;
    }, 450); // 200ms keluar + 200ms masuk + 50ms buffer

    // 2. Tentukan arah animasi
    let exitClass = 'page-exit-to-left';
    let enterClass = 'page-enter-from-right';
    
    if (opts.source === 'bottom' || opts.source === 'history') {
        const items = Array.from(document.querySelectorAll('#bottom-nav .nav-item, .sidebar-nav-item'));
        const fromIndex = items.findIndex(i => i.dataset.nav === appState.activePage);
        const toIndex = items.findIndex(i => i.dataset.nav === navId);
        if (fromIndex > -1 && toIndex > -1 && toIndex < fromIndex) {
            exitClass = 'page-exit-to-right';
            enterClass = 'page-enter-from-left';
        }
    } else if (opts.source === 'quick') {
        exitClass = 'page-exit-fade';
        enterClass = 'page-enter-fade';
    }

    // 3. Mulai animasi keluar
    container.classList.add(exitClass);

    // 4. Tunggu durasi animasi keluar, lalu ganti konten dan animasikan masuk
    setTimeout(async () => {
        // Ganti state dan konten halaman
        appState.activePage = navId;
        localStorage.setItem('lastActivePage', navId);
        if (opts.push !== false) {
            try {
                history.pushState({ page: navId }, '', window.location.href);
            } catch (_) {}
        }
        
        renderBottomNav();
        renderSidebar();
        await renderPageContent();

        // Siapkan untuk animasi masuk
        container.classList.remove('page-exit-to-left', 'page-exit-to-right', 'page-exit-fade');
        container.classList.add(enterClass);

        // Paksa browser "melihat" state awal sebelum memulai transisi
        requestAnimationFrame(() => {
            container.classList.remove(enterClass);
        });

    }, 200); // Durasi ini HARUS sama dengan durasi transisi CSS Anda
}

function MapsTo(pageId) {
    return handleNavigation(pageId, { source: 'map', push: true });
}

function initHistoryNavigation() {
    if (window.__banplex_history_init) return; // avoid double init
    window.__banplex_history_init = true;
    try {
        if ('replaceState' in history) {
            const initial = { page: appState.activePage };
            history.replaceState(initial, '', window.location.href);
        }
    } catch (_) {}
    window.addEventListener('popstate', (e) => {
        // Jika ada modal terbuka, tutup modal teratas terlebih dahulu dan batalkan navigasi halaman
        const container = $('#modal-container');
        if (container) {
            const modals = Array.from(container.querySelectorAll('.modal-bg'));
            const top = modals[modals.length - 1];
            if (top) {
                _closeModalImmediate(top);
                return;
            }
        }
        const target = e.state && e.state.page ? e.state.page : appState.activePage;
        // Navigate without pushing new history entry
        handleNavigation(target, { source: 'history', push: false });
    });

    // Optional: edge-swipe back gesture for Android-like UX inside the PWA
    const EDGE = 24; // px from left/right edge to start tracking
    const THRESH_X = 60; // required horizontal travel
    const THRESH_Y = 40; // vertical tolerance
    let tracking = false, startX = 0, startY = 0, fromLeft = false, fromRight = false;

    window.addEventListener('pointerdown', (e) => {
        try {
            if (e.pointerType !== 'touch') return;
        } catch (_) { /* older browsers */ }
        const x = e.clientX, y = e.clientY;
        fromLeft = x <= EDGE; fromRight = (window.innerWidth - x) <= EDGE;
        if (!fromLeft && !fromRight) return;
        tracking = true; startX = x; startY = y;
    }, { passive: true });

    window.addEventListener('pointermove', (e) => {
        if (!tracking) return;
        const dx = e.clientX - startX; const dy = e.clientY - startY;
        if (Math.abs(dx) >= THRESH_X && Math.abs(dy) <= THRESH_Y) {
            // left-edge swipe right OR right-edge swipe left
            if ((fromLeft && dx > 0) || (fromRight && dx < 0)) {
                tracking = false;
                // Trigger back if there is history to go back to
                if (history.length > 1) {
                    history.back();
                }
            }
        }
    }, { passive: true });

    const reset = () => { tracking = false; fromLeft = false; fromRight = false; };
    window.addEventListener('pointerup', reset, { passive: true });
    window.addEventListener('pointercancel', reset, { passive: true });
}

function attachEventListeners() {
    _initTagihanPageListeners(); // Panggil listener tagihan sekali saja

    document.body.addEventListener('click', (e) => {
        const target = e.target.closest('[data-action]');
        
        if (appState.selectionMode.active) {
            const card = e.target.closest('.dense-list-item');
            const closeBtn = e.target.closest('#close-selection-btn');
            
            if (card && !e.target.closest('.swipe-actions')) {
                _toggleCardSelection(card);
            } else if (closeBtn) {
                appState.selectionMode.active = false;
                appState.selectionMode.selectedIds.clear();
                _renderSelectionBar();
                $$('.dense-list-item.selected').forEach(c => c.classList.remove('selected'));
            }
            return;
        }

        if (!target) return;
        const { action, id, type, nav, expenseId, date, workerId } = target.dataset;
        const actions = {
            'navigate': () => {
                const isQuick = !!target.closest('.dashboard-action-item, .dashboard-balance-card');
                handleNavigation(nav, { source: isQuick ? 'quick' : undefined });
            },
            'open-bill-detail': () => {
                const itemEl = target.closest('[data-id]');
                const billId = itemEl ? itemEl.dataset.id : null;
                const expenseIdEl = target.closest('[data-expense-id]');
                const expenseId = expenseIdEl ? expenseIdEl.dataset.expenseId : null;
                if (billId) {
                    handleOpenBillDetail(billId, expenseId);
                }
            },

            'auth-action': () => appState.currentUser ? createModal('confirmLogout') : signInWithGoogle(),
            'toggle-theme': () => toggleTheme(),
            'manage-master': () => handleManageMasterData(type),            
            'manage-master-global': () => {
                const globalTypes = ['suppliers', 'workers', 'professions', 'materials', 'op-cats', 'other-cats', 'creditors'];
                const content = globalTypes.map(t => {
                    const config = masterDataConfig[t];
                    return `<div class="settings-list-item" data-action="manage-master" data-type="${t}"><div class="icon-wrapper"><span class="material-symbols-outlined">${config.icon || 'database'}</span></div><span class="label">${config.title}</span></div>`;
                }).join('');
                createModal('dataDetail', {
                    title: 'Kelola Master Data',
                    content: `<div class="settings-list">${content}</div>`
                });
            },
            'open-sync-queue': handleOpenSyncQueueModal,
            'sync-all-pending': () => syncToServer(),
            'sync-item': () => syncToServer(),
            'delete-pending-item': () => handleDeletePendingItem(target),
            'manage-users': handleManageUsers,
            'user-action': () => handleUserAction(target.dataset),
            'edit-pdf-settings': handleEditPdfSettings,
            'recalculate-usage': handleRecalculateUsageCount,
            'open-conflicts': handleOpenConflictsPanel,
            'open-storage-stats': handleOpenStorageStats,
            'apply-conflict': () => resolveConflict(target.dataset.conflictId, true),
            'discard-conflict': () => resolveConflict(target.dataset.conflictId, false),
            // Master Data actions inside modal list
            'edit-master-item': () => {
                const itemEl = target.closest('.master-data-item');
                const mid = itemEl?.dataset.id || id;
                const mtype = itemEl?.dataset.type || type;
                if (mid && mtype) handleEditMasterItem(mid, mtype);
            },
            'delete-master-item': () => {
                const itemEl = target.closest('.master-data-item');
                const mid = itemEl?.dataset.id || id;
                const mtype = itemEl?.dataset.type || type;
                if (mid && mtype) handleDeleteMasterItem(mid, mtype);
            },
            'open-detail': () => {
                if (appState.activePage === 'pemasukan') {
                    // Fix: dataset id/type berada di .card-list-item (parent), bukan di elemen ber-aksi
                    const card = target.closest('.card-list-item');
                    const tid = card?.dataset.id || id;
                    const ttype = card?.dataset.type || type;
                    if (!tid) return;
                    const item = ttype === 'termin'
                        ? appState.incomes.find(i => i.id === tid)
                        : appState.fundingSources.find(i => i.id === tid);
                    if (item) createModal('dataDetail', {
                        // Gunakan judul spesifik untuk pinjaman agar sesuai ekspektasi pengguna
                        title: (ttype === 'pinjaman') ? 'Kartu Data Pinjaman' : 'Detail Pemasukan',
                        content: _createDetailContentHTML(item, ttype || 'termin')
                    });
                }
            },
            'open-actions': () => {
                let actionsList = [];
                const page = appState.activePage;
                if (page === 'pemasukan') {
                    actionsList.push({
                        label: 'Edit',
                        action: 'edit-item',
                        icon: 'edit',
                        id,
                        type
                    });
                    if (type === 'pinjaman') {
                        const item = appState.fundingSources.find(i => i.id === id);
                        if (item && item.status !== 'paid') {
                            actionsList.push({
                                label: 'Bayar Cicilan',
                                action: 'pay-loan',
                                icon: 'payment',
                                id,
                                type
                            });
                        }
                    }
                    actionsList.push({
                        label: 'Hapus',
                        action: 'delete-item',
                        icon: 'delete',
                        id,
                        type
                    });
                }
                createModal('actionsMenu', {
                    actions: actionsList,
                    targetRect: target.getBoundingClientRect()
                });
            },
            'edit-item': () => handleEditItem(id, type),
            'delete-item': () => handleDeleteItem(id, type),
            'pay-loan': () => handlePaymentModal(id, 'pinjaman'),
            'pay-bill': () => handlePayBillModal(target.closest('.dense-list-item').dataset.id),
            'open-bill-detail': () => {
                const itemEl = target.closest('[data-id]');
                const billId = itemEl ? itemEl.dataset.id : null;
                const expenseIdEl = target.closest('[data-expense-id]');
                const expenseId = expenseIdEl ? expenseIdEl.dataset.expenseId : null;
        
                if (billId) {
                    handleOpenBillDetail(billId, expenseId);
                }
            },
            
            'view-invoice-items': () => {
                const expense = appState.expenses.find(e => e.id === id);
                if (expense) createModal('invoiceItemsDetail', {
                    items: expense.items,
                    totalAmount: expense.amount
                });
            },
            // [IMPROVE-UI/UX]: Generic drilldown from report cards
            'show-report-detail': () => {
                const type = target.dataset.type; // 'income' | 'expense'
                const category = target.dataset.category; // optional: 'material'|'operasional'|'lainnya'
                const { start, end } = appState.reportFilter || {};
                const inRange = (d) => {
                    const dt = _getJSDate(d);
                    if (start && dt < new Date(start + 'T00:00:00')) return false;
                    if (end && dt > new Date(end + 'T23:59:59')) return false;
                    return true;
                };
                let items = [];
                if (type === 'income') {
                    items = (appState.incomes||[]).filter(i => inRange(i.date));
                } else if (type === 'expense') {
                    if (category === 'gaji') {
                        // Use salary bills for gaji drilldown
                        items = (appState.bills||[]).filter(b => b.type==='gaji' && inRange(b.dueDate || b.createdAt)).map(b => ({
                            description: b.description || 'Gaji',
                            date: b.dueDate || b.createdAt || new Date(),
                            amount: b.amount || 0
                        }));
                    } else {
                        items = (appState.expenses||[]).filter(e => (!category || e.type === category) && inRange(e.date));
                    }
                }
                const content = items.length ? `<div class="dense-list-container">${items.map(it => `
                    <div class="dense-list-item">
                        <div class="item-main-content">
                            <strong class="item-title">${it.description || (type==='income'?'Pemasukan':'Pengeluaran')}</strong>
                            <span class="item-subtitle">${_getJSDate(it.date).toLocaleDateString('id-ID')}</span>
                        </div>
                        <div class="item-actions"><strong class="${type==='income'?'positive':'negative'}">${fmtIDR(it.amount || it.totalAmount || 0)}</strong></div>
                    </div>`).join('')}</div>` : _getEmptyStateHTML({ icon:'insights', title:'Tidak Ada Data', desc:'Tidak ada transaksi pada periode ini.' });
                createModal('dataDetail', { title: 'Rincian Transaksi', content });
            },
            // [IMPROVE-UI/UX]: Drilldown from report HPP row
            'drilldown-hpp-material': () => {
                const { start, end } = appState.reportFilter || {};
                const inRange = (d) => {
                    const dt = _getJSDate(d);
                    if (start && dt < new Date(start + 'T00:00:00')) return false;
                    if (end && dt > new Date(end + 'T23:59:59')) return false;
                    return true;
                };
                const items = appState.expenses.filter(e => e.type === 'material' && inRange(e.date));
                const content = items.length ? `<div class="dense-list-container">${items.map(e => `
                    <div class="dense-list-item">
                        <div class="item-main-content">
                            <strong class="item-title">${e.description || 'Material'}</strong>
                            <span class="item-subtitle">${_getJSDate(e.date).toLocaleDateString('id-ID')}</span>
                        </div>
                        <div class="item-actions"><strong>${fmtIDR(e.amount)}</strong></div>
                    </div>`).join('')}</div>` : _getEmptyStateHTML({ icon:'inventory_2', title:'Tidak Ada Data', desc:'Tidak ada transaksi material pada periode ini.' });
                createModal('dataDetail', { title: 'Rincian HPP Material', content });
            },
            'edit-surat-jalan': () => handleEditSuratJalanModal(id),
            'edit-do-items': () => handleEditDeliveryOrderItemsModal(expenseId),
            'view-attachment': () => createModal('imageView', {
                src: target.dataset.src
            }),
            'upload-attachment': () => handleUploadAttachment(target.dataset),
            'delete-attachment': () => handleDeleteAttachment(target.dataset),
            'download-attachment': () => _downloadAttachment(target.dataset.url, target.dataset.filename),
            'open-material-selector': () => handleOpenMaterialSelector(target.dataset),
            'post-comment': () => handlePostComment(target.dataset),
            'delete-comment': () => handleDeleteComment(target.dataset),
            'check-in': () => handleCheckIn(id),
            'check-out': () => handleCheckOut(id),
            'edit-attendance': () => handleEditManualAttendanceModal(id),
            'delete-attendance': () => handleDeleteSingleAttendance(id),
            'view-jurnal-harian': () => handleViewJurnalHarianModal(date),
            'view-worker-recap': () => handleViewWorkerRecapModal(workerId),
            'generate-all-salary-bill': () => {
                const startDate = new Date($('#recap-start-date').value);
                const endDate = new Date($('#recap-end-date').value);
                const rows = $$('#salary-recap-table tbody tr');
                const allWorkersData = Array.from(rows).map(row => ({
                    workerId: row.dataset.workerId,
                    workerName: row.dataset.workerName,
                    totalPay: parseFloat(row.dataset.totalPay),
                    recordIds: row.dataset.recordIds.split(',')
                }));
                handleGenerateBulkSalaryBill(allWorkersData, startDate, endDate);
            },
            'generate-selected-salary-bill': () => {
                const startDate = new Date($('#recap-start-date').value);
                const endDate = new Date($('#recap-end-date').value);
                const rows = $$('#salary-recap-table tbody tr');
                const selectedWorkers = Array.from(rows)
                    .filter(row => row.querySelector('.recap-checkbox:checked'))
                    .map(row => ({
                        workerId: row.dataset.workerId,
                        workerName: row.dataset.workerName,
                        totalPay: parseFloat(row.dataset.totalPay),
                        recordIds: row.dataset.recordIds.split(',')
                    }));
                handleGenerateBulkSalaryBill(selectedWorkers, startDate, endDate);
            },
            'recalculate-wages-btn': () => handleRecalculateWages(), 
            'fix-stuck-attendance': handleFixStuckAttendanceModal,
            'cetak-kwitansi': () => handleCetakKwitansi(id),
            'cetak-kwitansi-individu': () => handleCetakKwitansiIndividu(target.dataset),
            'pay-individual-salary': () => handlePayIndividualSalaryModal(target.dataset),
            'open-report-generator': handleGenerateReportModal,
            'stok-in': () => handleStokInModal(id),
            'stok-out': () => handleStokOutModal(id),
            'edit-stock': () => handleEditStockTransaction(target.dataset),
            'delete-stock': () => handleDeleteStockTransaction(target.dataset),
            'add-new-material': () => {
                const row = target.closest('.invoice-item-row');
                const wrapper = row?.querySelector('.autocomplete-wrapper');
                if (wrapper) handleAddNewMaterialModal(wrapper);
            },
            'toggle-more-actions': () => $('#quick-actions-grid').classList.toggle('actions-collapsed'),
            
            'force-full-sync': () => {
                createModal('confirmUserAction', {
                    message: 'Aksi ini akan mengunduh ulang semua data dari server. Ini berguna jika ada data lama yang tidak muncul. Lanjutkan?',
                    onConfirm: async () => {
                        toast('syncing', 'Menghapus cache waktu sinkronisasi...');
                        localStorage.removeItem('lastSyncTimestamp');
                        toast('syncing', 'Memulai sinkronisasi penuh...');
                        await syncFromServer();
                        toast('success', 'Sinkronisasi penuh selesai!');
                    }
                })
            },
            'open-recap-actions': () => { // Untuk menu titik tiga di desktop
                if (isViewer()) return;
                const billId = target.dataset.id;
                const actions = [
                    { label: 'Lihat Detail', action: 'open-bill-detail', icon: 'visibility', id: billId, type: 'bill' },
                    { label: 'Batalkan Rekap', action: 'delete-salary-bill', icon: 'delete_forever', id: billId }
                ];
                createModal('actionsMenu', { actions, targetRect: target.getBoundingClientRect() });
            },
            'remove-worker-from-recap': () => {
                if (isViewer()) return;
                const billId = target.dataset.billId;
                const workerId = target.dataset.workerId;
                handleRemoveWorkerFromRecap(billId, workerId);
            },
            'delete-salary-bill': () => { // Untuk tombol geser di mobile & menu desktop
                if (isViewer()) return;
                handleDeleteSalaryBill(target.dataset.id);
                const menuModal = $('#actionsMenu-modal');
                if (menuModal) closeModal(menuModal);
            },
            'open-bill-actions-modal': () => {
                const bill = appState.bills.find(b => b.id === id);
                if (!bill) return;
                let billActions = [];
                if (bill.status !== 'paid') {
                    billActions.push({
                        label: 'Bayar/Cicil Tagihan',
                        action: 'pay-bill',
                        icon: 'payment',
                        id,
                        expenseId
                    });
                }
                billActions.push({
                    label: 'Lihat Detail',
                    action: 'open-bill-detail',
                    icon: 'visibility',
                    id,
                    expenseId
                });
                billActions.push({
                    label: 'Edit Data',
                    action: 'edit-item',
                    icon: 'edit',
                    id,
                    type: 'bill'
                });
                if (bill.status === 'paid') {
                    billActions.push({
                        label: 'Cetak Kwitansi',
                        action: 'cetak-kwitansi',
                        icon: 'receipt_long',
                        id
                    });
                }
                billActions.push({
                    label: 'Hapus',
                    action: 'delete-item',
                    icon: 'delete',
                    id,
                    type: 'bill'
                });
                createModal('billActionsModal', {
                    bill,
                    actions: billActions
                });
            },
            'trigger-file-input': (e) => {
                const targetInputName = target.dataset.target;
                const modal = target.closest('.modal-bg'); // Cek apakah aksi ini di dalam modal
                const context = modal || document;
                const inputEl = context.querySelector(`input[name="${targetInputName}"]`);
                if (inputEl) {
                    inputEl.click();
                    inputEl.addEventListener('change', () => {
                        const displayEl = context.querySelector(`#${inputEl.dataset.targetDisplay}`);
                        if (displayEl) {
                            displayEl.textContent = inputEl.files[0]?.name || 'Belum ada file dipilih';
                        }
                    }, {
                        once: true
                    });
                }
            },
        };
        // Jalankan fungsi aksi jika ada
        if (actions[action]) {
            actions[action]();
        }
    });

    // Global SPA form submit handler (opt-in via data-async)
    document.addEventListener('submit', async (e) => {
        const form = e.target;
        if (!(form instanceof HTMLFormElement)) return;
        if (!form.matches('form[data-async]')) return; // only handle forms marked as async
        e.preventDefault(); e.stopImmediatePropagation();
        try {
            const loadingBtn = form.querySelector('[type="submit"], .btn, .btn-primary');
            if (loadingBtn) loadingBtn.disabled = true;
            let result = null;
            try {
                result = await _submitFormAsync(form);
            } catch (networkErr) {
                console.warn('API submit failed; using local fallback', { endpoint: form.getAttribute('action') || form.dataset.endpoint, method: (form.getAttribute('method') || 'POST').toUpperCase(), error: networkErr?.message || networkErr });
                // Fallback to existing local handlers to preserve offline-first behavior
                await _fallbackLocalFormHandler(form);
            }
            toast('success', form.dataset.successMsg || 'Berhasil disimpan.');
            // If inside modal, close it
            const modal = form.closest('.modal-bg');
            if (modal) closeModal(modal);
            // Refresh content to reflect new data
            renderPageContent();
            updateSyncIndicator();
            return result;
        } catch (err) {
            console.error('Submit form async gagal:', err);
            toast('error', 'Gagal menyimpan, coba lagi.');
        } finally {
            const loadingBtn = form.querySelector('[type="submit"], .btn, .btn-primary');
            if (loadingBtn) loadingBtn.disabled = false;
        }
    }, true);

    // Listener untuk navigasi bottom bar
    $('#bottom-nav').addEventListener('click', (e) => {
        const navItem = e.target.closest('.nav-item');
        if (navItem) {
            handleNavigation(navItem.dataset.nav, { source: 'bottom' });
        }
    });

    // Listener klik sidebar (desktop)
    const sidebarEl = $('#sidebar-nav');
    if (sidebarEl) {
        sidebarEl.addEventListener('click', (e) => {
            const item = e.target.closest('.sidebar-nav-item');
            if (item) handleNavigation(item.dataset.nav);
        });
    }

    // Listener untuk sinkronisasi saat online/offline
    window.addEventListener('online', () => {
        appState.isOnline = true;
        updateSyncIndicator();
        syncToServer();
    });
    window.addEventListener('offline', () => {
        appState.isOnline = false;
        updateSyncIndicator();
    });
}
// =======================================================
//          SEKSI 5: INISIALISASI APLIKASI
// =======================================================
attachEventListeners();
_initToastSwipeHandler();
}

main()
