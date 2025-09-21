﻿﻿﻿/* global Chart, html2canvas, jspdf, Dexie */
// @ts-check

// =======================================================
//                       IMPORT PUSTAKA
// =======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { 
    getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithRedirect, signInWithPopup, getRedirectResult, signOut,
    setPersistence, browserLocalPersistence, browserSessionPersistence, inMemoryPersistence
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot,
    query, getDocs, addDoc, orderBy, deleteDoc, where, runTransaction, writeBatch, increment, Timestamp, 
    initializeFirestore, persistentLocalCache 
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

// [STRUKTUR UTAMA] Bungkus semua logika ke dalam fungsi async main()
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

    const ALL_NAV_LINKS = [
        { id: 'dashboard', icon: 'dashboard', label: 'Dashboard', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'pemasukan', icon: 'account_balance_wallet', label: 'Pemasukan', roles: ['Owner'] },
        { id: 'pengeluaran', icon: 'post_add', label: 'Pengeluaran', roles: ['Owner', 'Editor'] },
        { id: 'absensi', icon: 'person_check', label: 'Absensi', roles: ['Owner', 'Editor'] },
        { id: 'stok', icon: 'inventory_2', label: 'Stok', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'tagihan', icon: 'receipt_long', label: 'Tagihan', roles: ['Owner', 'Editor', 'Viewer'] },
        { id: 'laporan', icon: 'monitoring', label: 'Laporan', roles: ['Owner', 'Viewer'] },
        { id: 'pengaturan', icon: 'settings', label: 'Pengaturan', roles: ['Owner', 'Editor', 'Viewer'] },
    ];
    
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
        projects: [], clients: [], fundingCreditors: [], operationalCategories: [],
        materialCategories: [], otherCategories: [], suppliers: [], workers: [],
        professions: [], incomes: [], fundingSources: [], expenses: [], bills: [],
        attendance: new Map(), users: [],
        billsFilter: {
            searchTerm: '',
            projectId: 'all',
            supplierId: 'all',
            sortBy: 'dueDate',
            sortDirection: 'desc'
        },
    };
    if (sessionStorage.getItem('appJustUpdated') === 'true') {
        toast('success', 'Aplikasi berhasil diperbarui!');
        sessionStorage.removeItem('appJustUpdated');
    }
    if (sessionStorage.getItem('isSigningIn') === 'true') {
        appState.justLoggedIn = true;
        sessionStorage.removeItem('isSigningIn');
    }

    // Inisialisasi Firebase
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const storage = getStorage(app);
    let db;
    
    try {
        await setPersistence(auth, browserLocalPersistence);
    } catch (error) {
        console.warn("Persistensi localStorage tidak tersedia. Fallback ke session.", error?.code || error);
        try {
            await setPersistence(auth, browserSessionPersistence);
        } catch (err2) {
            console.warn("Persistensi session tidak tersedia. Fallback ke in-memory.", err2?.code || err2);
            await setPersistence(auth, inMemoryPersistence);
        }
    }
    
    try {
        db = initializeFirestore(app, { cache: persistentLocalCache() });
    } catch (err) {
        db = getFirestore(app);
        console.warn("Gagal mengaktifkan mode offline Firestore.", err.code);
    }
    
    // Inisialisasi Database Lokal (Dexie)
    const offlineDB = new Dexie('BanPlexOfflineDB');
    offlineDB.version(2).stores({ 
        offlineQueue: '++id, type, payload',
        offlineFiles: '++id, parentId, field, file'
    });

    // Deklarasi Referensi Koleksi Firestore
    const membersCol = collection(db, 'teams', TEAM_ID, 'members');
    const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    const clientsCol = collection(db, 'teams', TEAM_ID, 'clients');
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

    let pendingUsersUnsub = null;
    let roleUnsub = null;
    let isInitializingSession = false;
    let isSignInInProgress = false;
    let lastAuthUid = null;
    let suppressGuestUntil = 0;
    let toastTimeout = null;

    // =======================================================
    //          FASE 2: DEKLARASI SEMUA FUNGSI APLIKASI
    // =======================================================

    // --- FUNGSI UTILITAS ---
    const $ = (s, context = document) => context.querySelector(s);
    const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));
    const fmtIDR = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const parseFormattedNumber = (str) => Number(String(str).replace(/[^0-9]/g, ''));
    const isViewer = () => appState.userRole === 'Viewer';
    
    // Form draft persistence (to avoid losing inputs when opening modals or navigating)
    function _getFormDraftKey(form) {
        const k = form.getAttribute('data-draft-key');
        return k ? `draft:${k}` : null;
    }
    function _saveFormDraft(form) {
        try {
            const key = _getFormDraftKey(form);
            if (!key) return;
            const data = {};
            form.querySelectorAll('input, select, textarea').forEach(el => {
                if (el.type === 'file') return; // cannot persist files
                const name = el.name || el.id;
                if (!name) return;
                if (el.type === 'checkbox' || el.type === 'radio') {
                    if (el.checked) data[name] = el.value || true;
                } else {
                    data[name] = el.value;
                }
            });
            sessionStorage.setItem(key, JSON.stringify(data));
        } catch (e) { /* ignore */ }
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
        } catch (e) { /* ignore */ }
    }
    function _clearFormDraft(form) {
        try {
            const key = _getFormDraftKey(form);
            if (key) sessionStorage.removeItem(key);
        } catch (e) { /* ignore */ }
    }
    function _attachFormDraftPersistence(form) {
        if (!form) return;
        _restoreFormDraft(form);
        const handler = () => _saveFormDraft(form);
        form.addEventListener('input', handler);
        form.addEventListener('change', handler, true);
        // Cleanup helper on element for explicit clear on successful submit
        form._clearDraft = () => _clearFormDraft(form);
    }
    
    function toast(type, message, duration = 5000) {
        const container = $('#popup-container');
        if (!container) return;

        if (!container.querySelector('.popup-content')) {
            container.innerHTML = `
                <div class="popup-content">
                    <span id="popup-icon"></span>
                    <p id="popup-message"></p>
                </div>`;
        }

        const iconEl = $('#popup-icon', container);
        const msgEl = $('#popup-message', container);

        if (!msgEl || !iconEl) {
            console.error("Elemen toast (pesan atau ikon) tidak ditemukan di dalam container.");
            return;
        }

        const icons = { success: 'check_circle', error: 'error', info: 'info' };
        
        container.className = `popup-container popup-${type}`;
        msgEl.textContent = message; 

        // clear previous timer if any
        if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; }

        if (type === 'syncing') {
            iconEl.className = 'spinner';
            container.classList.add('show');
        } else {
            iconEl.className = 'material-symbols-outlined';
            iconEl.textContent = icons[type] || 'info';
            container.classList.add('show');
            const hideIn = (type === 'offline' || type === 'online') ? 5000 : duration;
            toastTimeout = setTimeout(() => container.classList.remove('show'), hideIn);
        }
    }
    const hideToast = () => { if (toastTimeout) { clearTimeout(toastTimeout); toastTimeout = null; } const el = $('#popup-container'); if (el) el.classList.remove('show'); };

    
    const masterDataConfig = {
        'projects': { collection: projectsCol, stateKey: 'projects', nameField: 'projectName', title: 'Proyek' },
        'clients': { collection: clientsCol, stateKey: 'clients', nameField: 'clientName', title: 'Klien' },
        'creditors': { collection: fundingCreditorsCol, stateKey: 'fundingCreditors', nameField: 'creditorName', title: 'Kreditur' },
        'op-cats': { collection: opCatsCol, stateKey: 'operationalCategories', nameField: 'categoryName', title: 'Kategori Operasional' },
        'other-cats': { collection: otherCatsCol, stateKey: 'otherCategories', nameField: 'categoryName', title: 'Kategori Lainnya' },
        'suppliers': { collection: suppliersCol, stateKey: 'suppliers', nameField: 'supplierName', title: 'Supplier' },
        'professions': { collection: professionsCol, stateKey: 'professions', nameField: 'professionName', title: 'Profesi' },
        'workers': { collection: workersCol, stateKey: 'workers', nameField: 'workerName', title: 'Pekerja', },
    };

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
        }
    }
    
    function createModal(type, data = {}) {
        const modalContainer = $('#modal-container');
        if (!modalContainer) return;
        modalContainer.innerHTML = `<div id="${type}-modal" class="modal-bg">${getModalContent(type, data)}</div>`;
        const modalEl = modalContainer.firstElementChild;
        setTimeout(() => modalEl.classList.add('show'), 10);
        const closeModalFunc = () => {
            closeModal(modalEl);
            if (data.onClose) data.onClose();
        };
        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModalFunc(); });
        modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
        attachModalEventListeners(type, data, closeModalFunc);
    }  
    function _createSalaryBillDetailContentHTML(bill) {
        const projectName = appState.projects.find(p => p.id === bill.projectId)?.projectName || 'Proyek tidak diketahui';
        const statusText = bill.status === 'paid' ? 'Lunas' : 'Belum Lunas';
        const statusClass = bill.status === 'paid' ? 'positive' : 'negative';
        const date = bill.createdAt?.toDate ? bill.createdAt.toDate().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : 'N/A';
    
        // [STRUKTUR HTML BARU]
        return `
            <div class="detail-modal-header">
                <h4>${bill.description}</h4>
                <strong>${fmtIDR(bill.amount)}</strong>
            </div>
            <div class="detail-modal-body">
                <dl class="detail-list">
                    <div>
                        <dt>Proyek Terkait</dt>
                        <dd>${projectName}</dd>
                    </div>
                    <div>
                        <dt>Status</dt>
                        <dd><span class="status-badge ${statusClass}">${statusText}</span></dd>
                    </div>
                    <div>
                        <dt>Tanggal Dibuat</dt>
                        <dd>${date}</dd>
                    </div>
                </dl>
            </div>
        `;
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
        const simpleModal = (title, content, footer) => `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>${title}</h4></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div>`;
    
        if (type === 'login') return simpleModal('Login', '<p>Gunakan akun Google Anda.</p>', '<button id="google-login-btn" class="btn btn-primary">Masuk dengan Google</button>');
        if (type === 'confirmLogout') return simpleModal('Keluar', '<p>Anda yakin ingin keluar?</p>', '<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button>');
        if (type === 'confirmDelete' || type === 'confirmPayment' || type === 'confirmEdit' || type === 'confirmPayBill' || type === 'confirmGenerateBill' || type === 'confirmUserAction' || type === 'confirmDeleteAttachment' || type === 'confirmDeleteRecap') {
            const titles = { confirmDelete: 'Konfirmasi Hapus', confirmPayment: 'Konfirmasi Pembayaran', confirmEdit: 'Konfirmasi Perubahan', confirmPayBill: 'Konfirmasi Pembayaran', confirmGenerateBill: 'Konfirmasi Buat Tagihan', confirmUserAction: 'Konfirmasi Aksi', confirmDeleteAttachment: 'Hapus Lampiran', confirmDeleteRecap: 'Hapus Rekap Gaji' };
            const messages = { confirmDelete: 'Anda yakin ingin menghapus data ini?', confirmPayment: 'Anda yakin ingin melanjutkan pembayaran?', confirmEdit: 'Anda yakin ingin menyimpan perubahan?', confirmPayBill: 'Anda yakin ingin melanjutkan pembayaran ini?', confirmGenerateBill: 'Anda akan membuat tagihan gaji untuk pekerja ini. Lanjutkan?', confirmUserAction: 'Apakah Anda yakin?', confirmDeleteAttachment: 'Anda yakin ingin menghapus lampiran ini?', confirmDeleteRecap: 'Menghapus rekap ini akan menghapus data absensi terkait. Aksi ini tidak dapat dibatalkan. Lanjutkan?' };
            const confirmTexts = { confirmDelete: 'Hapus', confirmPayment: 'Ya, Bayar', confirmEdit: 'Ya, Simpan', confirmPayBill: 'Ya, Bayar', confirmGenerateBill: 'Ya, Buat Tagihan', confirmUserAction: 'Ya, Lanjutkan', confirmDeleteAttachment: 'Ya, Hapus', confirmDeleteRecap: 'Ya, Hapus' };
            const confirmClasses = { confirmDelete: 'btn-danger', confirmPayment: 'btn-success', confirmEdit: 'btn-primary', confirmPayBill: 'btn-success', confirmGenerateBill: 'btn-primary', confirmUserAction: 'btn-primary', confirmDeleteAttachment: 'btn-danger', confirmDeleteRecap: 'btn-danger' };
            
            return simpleModal(
                titles[type],
                `<p class="confirm-modal-text">${data.message || messages[type]}</p>`, // <-- TAMBAHKAN CLASS DI SINI
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
            const { actions, targetRect } = data;
            const top = targetRect.bottom + 8;
            const right = window.innerWidth - targetRect.right - 8;
            return `
                <div class="actions-menu" style="top:${top}px; right:${right}px;">
                    ${actions.map(action => `<button class="actions-menu-item" data-action="${action.action}" data-id="${action.id}" data-type="${action.type}" data-expense-id="${action.expenseId || ''}"><span class="material-symbols-outlined">${action.icon}</span><span>${action.label}</span></button>`).join('')}
                </div>`;
        }
        if (type === 'invoiceItemsDetail') {
            const { items, totalAmount } = data;
            
            // [STRUKTUR HTML BARU]
            const itemsHTML = items.map(item => `
                <div class="invoice-detail-item">
                    <div class="item-main-info">
                        <span class="item-name">${item.name}</span>
                        <span class="item-total">${fmtIDR(item.total)}</span>
                    </div>
                    <div class="item-sub-info">
                        <span>${item.qty} x ${fmtIDR(item.price)}</span>
                    </div>
                </div>
            `).join('');
    
            return modalWithHeader('Rincian Faktur', `
                <div class="invoice-detail-list">
                    ${itemsHTML}
                </div>
                <div class="invoice-detail-summary">
                    <span>Total Faktur</span>
                    <strong>${fmtIDR(totalAmount)}</strong>
                </div>
            `);
        }

        if (type === 'billActionsModal') {
            const { bill, actions } = data;
            const supplierName = appState.suppliers.find(s => s.id === (appState.expenses.find(e => e.id === bill.expenseId)?.supplierId))?.supplierName || '';

            const modalBody = `
                <div class="actions-modal-header">
                    <h4>${bill.description}</h4>
                    ${supplierName ? `<span>${supplierName}</span>` : ''}
                    <strong>${fmtIDR(bill.amount)}</strong>
                </div>
                <div class="actions-modal-list">
                    ${actions.map(action => `
                        <button class="actions-menu-item" 
                                data-action="${action.action}" 
                                data-id="${action.id}" 
                                data-type="${action.type}" 
                                data-expense-id="${action.expenseId || ''}">
                            <span class="material-symbols-outlined">${action.icon}</span>
                            <span>${action.label}</span>
                        </button>
                    `).join('')}
                </div>
            `;
            const modalFooter = `<button class="btn btn-secondary" data-close-modal>Tutup</button>`;

            return `
                <div class="modal-content">
                    <div class="modal-body">${modalBody}</div>
                    <div class="modal-footer">${modalFooter}</div>
                </div>
            `;
        }

        return `<div>Konten tidak ditemukan</div>`;
    }
    
    function attachModalEventListeners(type, data, closeModalFunc) {
        if (type === 'login') {
            const googleLoginBtn = $('#google-login-btn');
            if (googleLoginBtn) googleLoginBtn.addEventListener('click', signInWithGoogle);
        }
        if (type === 'confirmLogout') {
            const logoutBtn = $('#confirm-logout-btn');
            if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
        }
        if (type.startsWith('confirm') && type !== 'confirmExpense') {
            const confirmBtn = $('#confirm-btn');
            if (confirmBtn) confirmBtn.addEventListener('click', () => { data.onConfirm(); closeModalFunc(); });
        }
        
        if (type === 'confirmExpense') {
            const paidBtn = $('#confirm-paid-btn');
            if (paidBtn) paidBtn.addEventListener('click', () => { data.onConfirm('paid'); closeModalFunc(); });
            const billBtn = $('#confirm-bill-btn');
            if (billBtn) billBtn.addEventListener('click', () => { data.onConfirm('unpaid'); closeModalFunc(); });
        }
        if (type === 'payment') {
            const paymentForm = $('#payment-form');
            if (paymentForm) {
                paymentForm.addEventListener('submit', (e) => {
                    e.preventDefault();
                    const amount = fmtIDR(parseFormattedNumber(paymentForm.elements.amount.value));
                    const onConfirm = () => {
                        if (data.paymentType === 'bill') handleProcessBillPayment(e.target);
                        else handleProcessPayment(e.target);
                    };
                    createModal('confirmPayBill', { message: `Anda akan membayar sebesar ${amount}. Lanjutkan?`, onConfirm });
                });
                paymentForm.querySelectorAll('input[inputmode="numeric"]').forEach(input => input.addEventListener('input', _formatNumberInput));
            }
        }
        if (type === 'actionsMenu') {
            $$('.actions-menu-item').forEach(btn => btn.addEventListener('click', () => closeModalFunc()));
        }
        if (type === 'manageMaster') {
            $('#add-master-item-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                handleAddMasterItem(e.target);
            });
            _initCustomSelects($(`#${type}-modal`));
            $$('input[inputmode="numeric"]', $(`#${type}-modal`)).forEach(i => i.addEventListener('input', _formatNumberInput));
        }
        if (type === 'editMaster') {
            $('#edit-master-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                createModal('confirmEdit', { onConfirm: () => { handleUpdateMasterItem(e.target); closeModalFunc(); } });
            });
            _initCustomSelects($(`#${type}-modal`));
            $$('input[inputmode="numeric"]', $(`#${type}-modal`)).forEach(i => i.addEventListener('input', _formatNumberInput));
        }
        if (type === 'editItem') {
            _initCustomSelects($(`#${type}-modal`));
            $$(`#${type}-modal input[inputmode="numeric"]`).forEach(input => input.addEventListener('input', _formatNumberInput));
            $('#edit-item-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                createModal('confirmEdit', { onConfirm: () => { handleUpdateItem(e.target); closeModalFunc(); } });
            });
        }
        if (type === 'editAttendance') {
            $('#edit-attendance-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                createModal('confirmEdit', { onConfirm: () => { handleUpdateAttendance(e.target); closeModalFunc(); } });
            });
        }
    }
    function closeModal(modalEl) { 
        if (!modalEl) return; 
        modalEl.classList.remove('show'); 
        setTimeout(() => modalEl.remove(), 300); 
    }

    
    // =======================================================
    //          FUNGSI AUTH UTAMA (PERBAIKAN DENGAN LOGGING)
    // =======================================================
    try {
        const redirectRes = await getRedirectResult(auth);
        if (redirectRes && redirectRes.user) {
            toast('success', 'Login berhasil. Menyiapkan akun...');
        }
    } catch (error) {
        console.error("Error processing redirect result:", error);
        toast('error', `Login gagal: ${error.message}`);
    }

    onAuthStateChanged(auth, (user) => {
        console.log('Auth state changed. User present:', !!user);
        if (roleUnsub) { roleUnsub(); roleUnsub = null; }
        if (pendingUsersUnsub) { pendingUsersUnsub(); pendingUsersUnsub = null; }

        if (user) {
            lastAuthUid = user.uid;
            suppressGuestUntil = Date.now() + 4000; // tahan null event sesaat setelah login
            if (isInitializingSession) return;
            isInitializingSession = true;
            Promise.resolve(initializeAppSession(user)).finally(() => { isInitializingSession = false; });
        } else {
            // Jika sedang proses login atau dalam masa suppress, jangan flicker ke halaman login
            if (isSignInInProgress || sessionStorage.getItem('isSigningIn') === 'true' || Date.now() < suppressGuestUntil) {
                console.log('Auth null ignored during sign-in or suppress window');
                return; // tunggu event berikutnya
            }
            lastAuthUid = null;
            Object.assign(appState, { currentUser: null, userRole: 'Guest', userStatus: null, justLoggedIn: false });
            $('#global-loader').style.display = 'none';
            $('#app-shell').style.display = 'flex';
            renderUI();
        }
    });

    
    
    function _isAndroidInAppBrowser() {
        const ua = navigator.userAgent || '';
        const isAndroid = /Android/i.test(ua);
        const isWebView = /; wv\)/i.test(ua) || /Version\/\d+\.\d+ Chrome\/.+ Mobile Safari\//i.test(ua);
        const isIAB = /(FBAN|FBAV|FB_IAB|Instagram|Line|WhatsApp)/i.test(ua);
        return isAndroid && (isWebView || isIAB);
    }

    async function signInWithGoogle() { 
        const provider = new GoogleAuthProvider();
        // Blokir login via in-app browser Android, arahkan ke Chrome
        if (_isAndroidInAppBrowser()) {
            const url = location.href.replace(/^https?:\/\//, '');
            const intentUrl = `intent://${url}#Intent;scheme=https;package=com.android.chrome;end`;
            toast('info', 'Buka di Chrome lalu coba login lagi.');
            // Coba buka Chrome. Jika tidak berhasil, user bisa pilih menu ••• → Open in browser
            try { location.href = intentUrl; } catch (_) {}
            return;
        }

        if (isSignInInProgress) return;
        isSignInInProgress = true;
        const btn = document.getElementById('google-login-btn');
        if (btn) btn.setAttribute('disabled', 'true');
        sessionStorage.setItem('isSigningIn', 'true');
        try {
            // Coba popup terlebih dahulu di semua platform; fallback ke redirect hanya bila perlu
            await signInWithPopup(auth, provider);
            toast('success', 'Login berhasil. Menyiapkan akun...');
        } catch (err) {
            // Jika popup dibatalkan/ada permintaan lain, biarkan alur onAuthStateChanged yang menangani
            if (err && err.code === 'auth/cancelled-popup-request') {
                console.warn('Popup dibatalkan karena ada operasi lain. Menunggu status auth...');
            } else if (err && (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment')) {
                try {
                    toast('syncing', 'Mengarahkan ke halaman login...');
                    await signInWithRedirect(auth, provider);
                    return; // halaman akan berpindah
                } catch (err2) {
                    console.error('Redirect sign-in failed:', err2);
                    toast('error', 'Login gagal. Coba lagi.');
                    sessionStorage.removeItem('isSigningIn');
                }
            } else {
                console.error('Popup sign-in failed:', err);
                toast('error', 'Login gagal. Coba lagi.');
                sessionStorage.removeItem('isSigningIn');
            }
        } finally {
            isSignInInProgress = false;
            if (btn) btn.removeAttribute('disabled');
        }
    }

    async function handleLogout() { 
        if ($('#confirmLogout-modal')) closeModal($('#confirmLogout-modal'));
        toast('syncing', 'Keluar...'); 
        try { 
            await signOut(auth); 
            toast('success', 'Anda telah keluar.'); 
        } catch (error) { 
            toast('error', `Gagal keluar.`); 
        } 
    }

    function attachRoleListener(userDocRef) {
        roleUnsub = onSnapshot(
            userDocRef,
            (docSnap) => {
                if (docSnap.exists()) {
                    const { role, status } = docSnap.data();
                    if (appState.userRole !== role || appState.userStatus !== status) {
                        Object.assign(appState, { userRole: role, userStatus: status });
                        renderUI();
                    }
                } else {
                    // Jangan logout otomatis; fallback ke status saat ini (atau owner by email)
                    const fallbackRole = (appState.currentUser?.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase() ? 'Owner' : appState.userRole || 'Viewer';
                    const fallbackStatus = fallbackRole === 'Owner' ? 'active' : appState.userStatus || 'pending';
                    Object.assign(appState, { userRole: fallbackRole, userStatus: fallbackStatus });
                    renderUI();
                    toast('error', 'Profil belum tersedia. Menggunakan pengaturan sementara.');
                }
            },
            (error) => {
                console.error('Role listener error:', error);
                // Jangan logout saat error snapshot; gunakan state terakhir agar tidak loop
                toast('error', 'Koneksi data bermasalah. Menggunakan data sementara.');
                renderUI();
            }
        );
    }

    async function listenForPendingUsers() {
        if (pendingUsersUnsub) pendingUsersUnsub();
        const q = query(membersCol, where("status", "==", "pending"));
        pendingUsersUnsub = onSnapshot(q, (snapshot) => {
            appState.pendingUsersCount = snapshot.size;
            renderBottomNav(); 
        });
    }
    
    async function initializeAppSession(user) {
        appState.currentUser = user;
        const userDocRef = doc(membersCol, user.uid);
        try {
            toast('syncing', 'Menyiapkan profil...');
            let userDoc = await getDoc(userDocRef);

            if (!userDoc.exists()) {
                const userName = user.displayName || user.email.split('@')[0];
                const isOwner = user.email.toLowerCase() === OWNER_EMAIL.toLowerCase();
                const initialData = {
                    email: user.email, name: userName, photoURL: user.photoURL,
                    role: isOwner ? 'Owner' : 'Viewer', status: isOwner ? 'active' : 'pending',
                    createdAt: serverTimestamp()
                };
                await setDoc(userDocRef, initialData);
                userDoc = await getDoc(userDocRef); 
            }
            
            const userData = userDoc.data();
            const { role = 'Guest', status = 'pending' } = userData;
            Object.assign(appState, { userRole: role, userStatus: status });
            
            if (appState.justLoggedIn) {
                if (status === 'active') toast('success', `Selamat datang kembali, ${userData.name}!`);
                else toast('info', 'Akun Anda dibuat & menunggu persetujuan.');
            }

            attachRoleListener(userDocRef);
            if (appState.userRole === 'Owner') listenForPendingUsers();

            $('#global-loader').style.display = 'none';
            $('#app-shell').style.display = 'flex';
            renderUI();
            // Tutup modal login jika masih terbuka
            const loginModal = document.getElementById('login-modal');
            if (loginModal) closeModal(loginModal);
            appState.justLoggedIn = false;
            hideToast();
            sessionStorage.removeItem('isSigningIn');
        } catch (error) {
            console.error("CRITICAL ERROR during session initialization.", error);
            // Jangan paksa logout; fallback agar tidak loop login
            const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
            Object.assign(appState, { userRole: isOwner ? 'Owner' : 'Viewer', userStatus: isOwner ? 'active' : 'pending' });
            $('#global-loader').style.display = 'none';
            $('#app-shell').style.display = 'flex';
            renderUI();
            toast('error', 'Gagal memuat profil. Menggunakan mode terbatas.');
            sessionStorage.removeItem('isSigningIn');
        }
    }
    
    function renderUI() {
        const header = document.querySelector('.main-header');
        const bottomNav = $('#bottom-nav');

        if (!appState.currentUser) {
            // [PERBAIKAN] Sembunyikan header dan bottom nav untuk guest
            if (header) header.style.display = 'none';
            if (bottomNav) bottomNav.style.display = 'none';
            
            renderGuestLanding();
            return;
        } 
        
        // [PERBAIKAN] Pastikan header dan bottom nav tampil untuk user yang login
        if (header) header.style.display = ''; // Kembalikan ke style default (flex)
        if (bottomNav) bottomNav.style.display = 'flex';

        updateHeaderTitle();
        renderBottomNav();
        updateNavActiveState();

        if (appState.userStatus !== 'active') {
            renderPendingLanding();
            return;
        }
        renderPageContent();
    }

    function renderBottomNav() {
        const nav = $('#bottom-nav');
        if (!nav || appState.userStatus !== 'active') { if(nav) nav.innerHTML = ''; return; }

        let navIdsToShow = [];
        if (appState.userRole === 'Owner') navIdsToShow = ['dashboard', 'pemasukan', 'pengeluaran', 'absensi', 'pengaturan'];
        else if (appState.userRole === 'Editor') navIdsToShow = ['dashboard', 'pengeluaran', 'absensi', 'tagihan', 'pengaturan'];
        else if (appState.userRole === 'Viewer') navIdsToShow = ['dashboard', 'stok', 'tagihan', 'laporan', 'pengaturan'];
        
        const accessibleLinks = ALL_NAV_LINKS.filter(link => navIdsToShow.includes(link.id));
        
        nav.innerHTML = accessibleLinks.map(item => `
            <button class="nav-item" data-action="navigate" data-nav="${item.id}" aria-label="${item.label}">
                ${item.id === 'pengaturan' && appState.userRole === 'Owner' && appState.pendingUsersCount > 0 ? `<span class="notification-badge">${appState.pendingUsersCount}</span>` : ''}
                <span class="material-symbols-outlined">${item.icon}</span>
                <span class="nav-text">${item.label}</span>
            </button>
        `).join('');
    }

    function updateNavActiveState() {
        $$('.nav-item').forEach(item => item.classList.remove('active'));
        $$(`.nav-item[data-nav="${appState.activePage}"]`).forEach(el => el.classList.add('active'));
    }

    function renderGuestLanding() {
        const container = $('.page-container');
        container.innerHTML = `
            <div class="card card-pad" style="max-width:520px;margin:3rem auto;text-align:center;">
                <img src="logo-main.png" alt="BanPlex" style="width:120px;height:auto;margin-bottom:1rem;" />
                <p style="margin:.5rem 0 1rem 0">Masuk untuk melanjutkan.</p>
                <button id="google-login-btn" class="btn btn-primary" data-action="auth-action" style="display:inline-flex;align-items:center;gap:.5rem;">
                    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.611,20.083H42V20H24v8h11.303c-1.649,4.657-6.08,8-11.303,8c-6.627,0-12-5.373-12-12 s5.373-12,12-12c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657C33.109,6.053,28.805,4,24,4C12.955,4,4,12.955,4,24 s8.955,20,20,20s20-8.955,20-20C44,22.659,43.862,21.35,43.611,20.083z"/><path fill="#FF3D00" d="M6.306,14.691l6.571,4.817C14.655,16.108,18.961,13,24,13c3.059,0,5.842,1.154,7.961,3.039l5.657-5.657 C33.109,6.053,28.805,4,24,4C16.318,4,9.656,8.337,6.306,14.691z"/><path fill="#4CAF50" d="M24,44c5.166,0,9.86-1.977,13.409-5.192l-6.191-5.238C29.211,35.091,26.715,36,24,36 c-5.202,0-9.619-3.317-11.283-7.957l-6.522,5.025C9.505,39.556,16.227,44,24,44z"/><path fill="#1976D2" d="M43.611,20.083H42V20H24v8h11.303c-0.793,2.239-2.231,4.166-4.094,5.57 c0.001-0.001,0.002-0.001,0.003-0.002l6.191,5.238C36.971,39.205,44,34,44,24C44,22.659,43.862,21.35,43.611,20.083z"/></svg>
                    <span>Masuk dengan Google</span>
                </button>
            </div>`;
        // Pastikan listener terpasang pada tombol baru
        const googleLoginBtn = $('#google-login-btn');
        if (googleLoginBtn) googleLoginBtn.addEventListener('click', signInWithGoogle);
    }
    
    function renderPendingLanding() {
        $('#bottom-nav').innerHTML = '';
        $('.page-container').innerHTML = `<div class="card card-pad" style="max-width:520px;margin:2rem auto;text-align:center;"><h4>Menunggu Persetujuan</h4><p>Akun Anda sedang ditinjau oleh Owner. Silakan hubungi Owner untuk persetujuan.</p></div>`;
    }
    
    async function renderPageContent() {
        const pageId = appState.activePage;
        const container = $('.page-container');
        const pageRenderers = {
            'dashboard': renderDashboardPage,
            'pengaturan': renderPengaturanPage,
            'pemasukan': renderPemasukanPage,
            'pengeluaran': renderPengeluaranPage,
            'tagihan': renderTagihanPage,
            'stok': () => renderGenericTabPage('stok', 'Manajemen Stok', [{id:'daftar', label:'Daftar Stok'}, {id:'riwayat', label:'Riwayat'}]),
            'laporan': renderLaporanPage,
            'absensi': renderAbsensiPage,
            'log_aktivitas': renderLogAktivitasPage,
        };
        
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
        const renderer = pageRenderers[pageId];
        if (renderer) {
            await renderer();
        } else {
            container.innerHTML = `<div class="card card-pad">Halaman <strong>${pageId}</strong> dalam pengembangan.</div>`;
        }
    }
    
// [HAPUS] Fungsi lama fetchAndCacheData
    // const fetchAndCacheData = async (key, col, order = 'createdAt') => { ... };

    // [BARU] Fungsi baru untuk mengambil dan menyimpan data master secara offline
    const fetchAndCacheData = async (key, col, order = 'createdAt') => {
        const cacheKey = `master_data:${key}`;
        try {
            // 1. Selalu coba ambil dari cache (localStorage) dulu untuk tampilan cepat
            const cachedData = localStorage.getItem(cacheKey);
            if (cachedData) {
                appState[key] = JSON.parse(cachedData);
            }

            // 2. Jika online, ambil data terbaru dari Firestore
            if (appState.isOnline) {
                const snap = await getDocs(query(col, orderBy(order, 'desc')));
                const freshData = snap.docs.map(d => ({ id: d.id, ...d.data() }));

                // 3. Simpan data baru ke state dan perbarui cache
                appState[key] = freshData;
                localStorage.setItem(cacheKey, JSON.stringify(freshData));
            } else if (!cachedData) {
                // 4. Jika offline dan tidak ada di cache sama sekali, set state ke array kosong
                appState[key] = [];
                console.warn(`Data ${key} tidak tersedia saat offline dan tidak ada di cache.`);
            }
        } catch (e) {
            console.error(`Gagal memuat atau menyimpan cache ${key}:`, e);
            // Jika fetch gagal saat online tapi ada data di cache, biarkan data cache yang dipakai
            if (!appState[key] || appState[key].length === 0) {
                 appState[key] = [];
                 toast('error', `Gagal memuat data ${key}.`);
            }
        }
    };

    async function renderDashboardPage() {
        const container = $('.page-container');
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
    
        // 1. Fetch data (kode ini tidak berubah)
        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'), 
            fetchAndCacheData('incomes', incomesCol), 
            fetchAndCacheData('expenses', expensesCol), 
            fetchAndCacheData('bills', billsCol)
        ]);
        
        // 2. Lakukan Kalkulasi (kode ini tidak berubah)
        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const internalProjects = appState.projects.filter(p => p.projectType === 'internal_expense');
        const pendapatan = appState.incomes.filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
        const hpp_material = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
        const hpp_gaji = appState.bills.filter(b => b.type === 'gaji' && b.status === 'paid').reduce((sum, b) => sum + b.amount, 0);
        const hpp = hpp_material + hpp_gaji;
        const labaKotor = pendapatan - hpp;
        const bebanOperasional = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);
        const bebanInternal = appState.expenses.filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
        const labaBersih = labaKotor - bebanOperasional - bebanInternal;
        const totalUnpaid = appState.bills.filter(b => b.status === 'unpaid').reduce((sum, b) => sum + (b.amount - (b.paidAmount || 0)), 0);
    
        const projectsWithBudget = appState.projects.filter(p => p.budget && p.budget > 0).map(p => {
            // Logika filter yang salah sudah dihapus dari sini
            const actual = appState.expenses
                .filter(e => e.projectId === p.id)
                .reduce((sum, e) => sum + e.amount, 0);
            
            const remaining = p.budget - actual;            
            const percentage = p.budget > 0 ? (actual / p.budget) * 100 : 0;
            return { ...p, actual, remaining, percentage };
        });
    
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todaysExpenses = appState.expenses.filter(e => e.date.toDate() >= today);
        const dailyRecap = todaysExpenses.reduce((recap, expense) => {
            const projectName = appState.projects.find(p => p.id === expense.projectId)?.projectName || 'Lainnya';
            if (!recap[projectName]) recap[projectName] = 0;
            recap[projectName] += expense.amount;
            return recap;
        }, {});
    
        const labaClass = labaBersih >= 0 ? 'positive' : 'negative';
        const tagihanClass = totalUnpaid > 0 ? 'negative' : 'positive';
            
        const balanceCardsHTML = `
            <div class="dashboard-balance-grid">
                <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="laporan">
                    <span class="label">Estimasi Laba Bersih</span>
                    <strong class="value positive">${fmtIDR(labaBersih)}</strong>
                </div>
                <div class="dashboard-balance-card clickable" data-action="navigate" data-nav="tagihan">
                    <span class="label">Tagihan Belum Lunas</span>
                    <strong class="value negative">${fmtIDR(totalUnpaid)}</strong>
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
    
        const accessibleLinks = ALL_NAV_LINKS.filter(link => link.id !== 'dashboard' && link.roles.includes(appState.userRole));
    const mainActionIds = ['tagihan', 'laporan', 'stok', 'pengeluaran'];
        const mainActions = [];
        const extraActions = [];
    
        accessibleLinks.forEach(link => {
            if (mainActionIds.includes(link.id)) {
                mainActions.push(link);
            } else {
                extraActions.push(link);
            }
        });
    
        mainActions.sort((a, b) => mainActionIds.indexOf(a.id) - mainActionIds.indexOf(b.id));
    
        const createActionItemHTML = (link, isExtra = false) => `
            <button class="dashboard-action-item ${isExtra ? 'action-item-extra' : ''}" data-action="navigate" data-nav="${link.id}">
                <div class="icon-wrapper"><span class="material-symbols-outlined">${link.icon}</span></div>
                <span class="label">${link.label}</span>
            </button>`;
    
        const quickActionsHTML = `
            <h5 class="section-title-owner">Aksi Cepat</h5>
            <div id="quick-actions-grid" class="dashboard-actions-grid actions-collapsed">
                ${mainActions.map(link => createActionItemHTML(link)).join('')}
                
                ${extraActions.length > 0 ? `
                    <button class="dashboard-action-item" data-action="toggle-more-actions">
                        <div class="icon-wrapper"><span class="material-symbols-outlined">grid_view</span></div>
                        <span class="label">Lainnya</span>
                    </button>
                ` : ''}

                ${extraActions.map(link => createActionItemHTML(link, true)).join('')}
            </div>`;

        container.innerHTML = balanceCardsHTML + quickActionsHTML + projectBudgetHTML + dailyRecapHTML;
    }
    
    async function renderPengaturanPage() {
        const container = $('.page-container');
        const { currentUser, userRole } = appState;
        const photo = currentUser?.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${(currentUser?.displayName||'U')[0]}`;
        
        const ownerActions = [
            { action: 'manage-master', type: 'projects', icon: 'foundation', label: 'Kelola Proyek' },
            { action: 'manage-master-global', type: null, icon: 'database', label: 'Master Data' },
            { action: 'manage-users', type: null, icon: 'group', label: 'Manajemen User' },
            { action: 'navigate', nav: 'log_aktivitas', icon: 'history', label: 'Log Aktivitas' },
        ];

        container.innerHTML = `
            <div class="profile-card-settings">
                <img src="${photo}" alt="Avatar" class="profile-avatar">
                <strong class="profile-name">${currentUser?.displayName || 'Pengguna'}</strong>
                <span class="profile-email">${currentUser?.email || ''}</span>
                <div class="profile-role-badge">${userRole}</div>
                <div class="profile-actions">
                    <button class="btn btn-secondary" data-action="auth-action">
                        <span class="material-symbols-outlined">${currentUser ? 'logout' : 'login'}</span>
                        <span>${currentUser ? 'Keluar' : 'Masuk'}</span>
                    </button>
                </div>
            </div>
            ${userRole === 'Owner' ? `
                <div id="owner-settings">
                    <h5 class="section-title-owner">Administrasi Owner</h5>
                    <div class="settings-list">
                        ${ownerActions.map(act => `
                            <div class="settings-list-item" data-action="${act.action}" ${act.type ? `data-type="${act.type}"` : ''} ${act.nav ? `data-nav="${act.nav}"` : ''}>
                                <div class="icon-wrapper"><span class="material-symbols-outlined">${act.icon}</span></div>
                                <span class="label">${act.label}</span>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        `;
    }

    async function renderPemasukanPage() {
        const container = $('.page-container');
        const tabs = [{id:'termin', label:'Termin Proyek'}, {id:'pinjaman', label:'Pinjaman & Pendanaan'}];
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('pemasukan', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            let formHTML = '';
            let listHTML = '<div id="pemasukan-list-container"></div>';

    if (tabId === 'termin') {
        // [UBAH] Gunakan fungsi baru
        await fetchAndCacheData('projects', projectsCol, 'projectName');
        formHTML = _getFormPemasukanHTML('termin');
    } else if (tabId === 'pinjaman') {
        // [UBAH] Gunakan fungsi baru
        await fetchAndCacheData('fundingCreditors', fundingCreditorsCol, 'creditorName');
        formHTML = _getFormPemasukanHTML('pinjaman');
    }
            
            contentContainer.innerHTML = (isViewer() ? '' : formHTML) + listHTML;
            if (!isViewer()) {
                const formEl = $('#pemasukan-form');
                if (formEl) {
                    formEl.setAttribute('data-draft-key', `pemasukan-${tabId}`);
                    _attachFormDraftPersistence(formEl);
                }
                _attachPemasukanFormListeners();
            }
            await _rerenderPemasukanList(tabId);
        }

        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));

        const lastSubPage = appState.activeSubPage.get('pemasukan') || tabs[0].id;
        if($('.sub-nav-item.active')) $('.sub-nav-item.active').classList.remove('active');
        if($(`.sub-nav-item[data-tab="${lastSubPage}"]`)) $(`.sub-nav-item[data-tab="${lastSubPage}"]`).classList.add('active');
        await renderTabContent(lastSubPage);
    }
    
    async function _rerenderPemasukanList(type) {
        const listContainer = $('#pemasukan-list-container');
        if (!listContainer) return;
        listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        const col = type === 'termin' ? incomesCol : fundingSourcesCol;
        const key = type === 'termin' ? 'incomes' : 'fundingSources';
        await fetchAndCacheData(key, col);
        
        listContainer.innerHTML = _getListPemasukanHTML(type);
    }

    const createMasterDataSelect = (id, label, options, selectedValue = '', masterType = null) => {
        const selectedOption = options.find(opt => opt.value === selectedValue);
        const selectedText = selectedOption ? selectedOption.text : 'Pilih...';
        const showMasterButton = masterType && masterType !== 'projects' && !isViewer();

        return `
            <div class="form-group">
                <label>${label}</label>
                <div class="master-data-select">
                    <div class="custom-select-wrapper">
                        <input type="hidden" id="${id}" name="${id}" value="${selectedValue}">
                        <button type="button" class="custom-select-trigger" ${isViewer() ? 'disabled' : ''}>
                            <span>${selectedText}</span>
                            <span class="material-symbols-outlined">arrow_drop_down</span>
                        </button>
                        <div class="custom-select-options">
                            ${options.map(opt => `<div class="custom-select-option" data-value="${opt.value}">${opt.text}</div>`).join('')}
                        </div>
                    </div>
                    ${showMasterButton ? `<button type="button" class="btn-icon master-data-trigger" data-action="manage-master" data-type="${masterType}"><span class="material-symbols-outlined">database</span></button>` : ''}
                </div>
            </div>
        `;
    };
    
    function _getFormPemasukanHTML(type) {
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
        const creditorOptions = appState.fundingCreditors.map(c => ({ value: c.id, text: c.creditorName }));
        const loanTypeOptions = [ {value: 'none', text: 'Tanpa Bunga'}, {value: 'interest', text: 'Berbunga'} ];

        return `
        <div class="card card-pad">
            <form id="pemasukan-form" data-type="${type}">
                <div class="form-group">
                    <label>Jumlah</label>
                    <input type="text" inputmode="numeric" id="pemasukan-jumlah" required placeholder="mis. 5.000.000">
                </div>
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" id="pemasukan-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                ${type === 'termin' 
                    ? createMasterDataSelect('pemasukan-proyek', 'Proyek Terkait', projectOptions, '', 'projects') 
                    : `
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
                `}
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        </div>`;
    }

    function _getListPemasukanHTML(type) {
        const list = type === 'termin' ? appState.incomes : appState.fundingSources;
        if (!list || list.length === 0) {
            return `<p class="empty-state">Belum ada data.</p>`;
        }
        return `
        <div style="margin-top: 1.5rem;">
            ${list.map(item => {
                const title = type === 'termin' 
                    ? appState.projects.find(p => p.id === item.projectId)?.projectName || 'Termin Proyek'
                    : appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Pinjaman';
                const amount = item.totalAmount || item.amount || 0;
                const paidAmount = item.paidAmount || 0;
                const totalRepayment = item.totalRepaymentAmount || amount;
                const remainingAmount = totalRepayment - paidAmount;
                const date = item.date?.toDate ? item.date.toDate().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : 'Tanggal tidak valid';
                
                const isPaid = item.status === 'paid' || remainingAmount <= 0;
                let secondaryInfoHTML = '';
                if (type === 'pinjaman') {
                    if (isPaid) {
                        secondaryInfoHTML = `<div class="paid-indicator"><span class="material-symbols-outlined">task_alt</span> Lunas</div>`;
                    } else {
                        secondaryInfoHTML = `<p class="card-list-item-repayment-info">Sisa: <strong>${fmtIDR(remainingAmount)}</strong></p>`;
                    }
                }

                return `
                <div class="card card-list-item" data-id="${item.id}" data-type="${type}">
                    <div class="card-list-item-content" data-action="open-detail">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${title}</h5>
                            <p class="card-list-item-subtitle">${date}</p>
                        </div>
                        <div class="card-list-item-amount-wrapper">
                            <strong class="card-list-item-amount">${fmtIDR(amount)}</strong>
                            ${secondaryInfoHTML}
                        </div>
                    </div>
                    ${isViewer() ? '' : `<button class="btn-icon card-list-item-actions-trigger" data-action="open-actions">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>`}
                </div>`;
            }).join('')}
        </div>`;
    }

    function _createDetailContentHTML(item, type) {
        const details = [];
        const formatDate = (date) => date ? date.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'N/A';
    
        if (type === 'termin') {
            const projectName = appState.projects.find(p => p.id === item.projectId)?.projectName || 'Tidak ditemukan';
            details.push({ label: 'Proyek', value: projectName });
            details.push({ label: 'Jumlah', value: fmtIDR(item.amount) });
            details.push({ label: 'Tanggal Pemasukan', value: formatDate(item.date) });
        } else { // type === 'pinjaman'
            const creditorName = appState.fundingCreditors.find(c => c.id === item.creditorId)?.creditorName || 'Tidak ditemukan';
            const totalPayable = item.totalRepaymentAmount || item.totalAmount;
            details.push({ label: 'Kreditur', value: creditorName });
            details.push({ label: 'Jumlah Pinjaman', value: fmtIDR(item.totalAmount) });
            details.push({ label: 'Tanggal Pinjaman', value: formatDate(item.date) });
            details.push({ label: 'Jenis Pinjaman', value: item.interestType === 'interest' ? 'Berbunga' : 'Tanpa Bunga' });
            if (item.interestType === 'interest') {
                details.push({ label: 'Suku Bunga', value: `${item.rate || 0}% per bulan` });
                details.push({ label: 'Tenor', value: `${item.tenor || 0} bulan` });
                details.push({ label: 'Total Tagihan', value: fmtIDR(item.totalRepaymentAmount) });
            }
             details.push({ label: 'Sudah Dibayar', value: fmtIDR(item.paidAmount || 0) });
             details.push({ label: 'Sisa Tagihan', value: fmtIDR(totalPayable - (item.paidAmount || 0)) });
             details.push({ label: 'Status', value: item.status === 'paid' ? 'Lunas' : 'Belum Lunas' });
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

    function _initCustomSelects(context = document) {
        context.querySelectorAll('.custom-select-wrapper').forEach(wrapper => {
            const trigger = wrapper.querySelector('.custom-select-trigger');
            if (!trigger || trigger.disabled) return;
            const optionsContainer = wrapper.querySelector('.custom-select-options');
            const hiddenInput = wrapper.querySelector('input[type="hidden"]');
            const triggerSpan = trigger.querySelector('span:first-child');

            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                const isActive = wrapper.classList.contains('active');
                $$('.custom-select-wrapper').forEach(w => w.classList.remove('active'));
                if (!isActive) wrapper.classList.add('active');
            });

            optionsContainer.addEventListener('click', e => {
                const option = e.target.closest('.custom-select-option');
                if (option) {
                    hiddenInput.value = option.dataset.value;
                    triggerSpan.textContent = option.textContent;
                    wrapper.classList.remove('active');
                    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });
    }

    function _attachPemasukanFormListeners() {
        $('#pemasukan-form')?.addEventListener('submit', handleAddPemasukan);
        _initCustomSelects();
        
        const loanTypeSelect = $('#loan-interest-type');
        loanTypeSelect?.addEventListener('change', () => {
            const details = $('.loan-details');
            if(details) details.classList.toggle('hidden', loanTypeSelect.value === 'none');
            _updateLoanCalculation();
        });
    
        const amountInput = $('#pemasukan-jumlah');
        const rateInput = $('#loan-rate');
        const tenorInput = $('#loan-tenor');
    
        amountInput?.addEventListener('input', _formatNumberInput);
        amountInput?.addEventListener('input', _updateLoanCalculation);
        rateInput?.addEventListener('input', _updateLoanCalculation);
        tenorInput?.addEventListener('input', _updateLoanCalculation);
    }

    async function handleAddPemasukan(e) {
        e.preventDefault();
        const form = e.target;
        const type = form.dataset.type;
        const amount = parseFormattedNumber($('#pemasukan-jumlah', form).value);
        const date = new Date($('#pemasukan-tanggal', form).value);

        toast('syncing', 'Menyimpan...');
        try {
            let docData;
            if (type === 'termin') {
                const projectId = $('#pemasukan-proyek', form).value;
                if (!projectId) { toast('error', 'Silakan pilih proyek terkait.'); return; }
                docData = { amount, date, projectId, createdAt: serverTimestamp() };
                await addDoc(incomesCol, docData);
                await _logActivity(`Menambah Pemasukan Termin: ${fmtIDR(amount)}`, { docId: docData.projectId, amount: docData.amount });
            } else {
                const creditorId = $('#pemasukan-kreditur', form).value;
                if (!creditorId) { toast('error', 'Silakan pilih kreditur.'); return; }
                const interestType = $('#loan-interest-type', form).value;
                
                let loanData = { creditorId, totalAmount: amount, date, interestType, status: 'unpaid', paidAmount: 0, createdAt: serverTimestamp() };
                if (interestType === 'interest') {
                    const rate = Number($('#loan-rate', form).value);
                    const tenor = Number($('#loan-tenor', form).value);
                    if (rate < 1 || tenor < 1) {
                        toast('error', 'Bunga dan Tenor minimal harus 1.'); return;
                    }
                    const totalRepayment = amount * (1 + (rate / 100 * tenor));

                    loanData.rate = rate;
                    loanData.tenor = tenor;
                    loanData.totalRepaymentAmount = totalRepayment;
                }
                await addDoc(fundingSourcesCol, loanData);
                await _logActivity(`Menambah Pinjaman: ${fmtIDR(amount)}`, { creditorId, amount });
            }
            toast('success', 'Data berhasil disimpan!');
            form.reset();
            if (form && typeof form._clearDraft === 'function') form._clearDraft();
            $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
            const loanCalcResult = $('#loan-calculation-result', form);
            if(loanCalcResult) loanCalcResult.style.display = 'none';
            await _rerenderPemasukanList(type);
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error(error);
        }
    }
    
    async function renderTagihanPage() {
        const container = $('.page-container');
        const tabs = [{ id: 'belum_lunas', label: 'Belum Lunas' }, { id: 'lunas', label: 'Lunas' }, { id: 'gaji', label: 'Gaji' }];
    
        // [MODIFIKASI] Menambahkan toolbar di atas navigasi tab
        container.innerHTML = `
            <div class="toolbar" id="tagihan-toolbar">
                <div class="search">
                    <span class="material-symbols-outlined">search</span>
                    <input type="search" id="tagihan-search-input" placeholder="Cari deskripsi tagihan..." value="${appState.billsFilter.searchTerm}">
                </div>
                <button class="icon-btn" id="tagihan-filter-btn" title="Filter">
                    <span class="material-symbols-outlined">filter_list</span>
                </button>
                <button class="icon-btn" id="tagihan-sort-btn" title="Urutkan">
                    <span class="material-symbols-outlined">sort</span>
                </button>
            </div>
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"><div class="loader-container"><div class="spinner"></div></div></div>
        `;
    
        await Promise.all([
            fetchAndCacheData('projects', projectsCol, 'projectName'),
            fetchAndCacheData('expenses', expensesCol),
            fetchAndCacheData('suppliers', suppliersCol, 'supplierName')
        ]);
    
        let currentBills = []; // Simpan data tagihan saat ini
    
        // [BARU] Fungsi untuk menerapkan filter & sort tanpa mengambil data ulang
        const applyFilterAndSort = () => {
            let filtered = [...currentBills];
    
            // 1. Terapkan filter pencarian
            if (appState.billsFilter.searchTerm) {
                filtered = filtered.filter(bill => bill.description.toLowerCase().includes(appState.billsFilter.searchTerm));
            }
            // 2. Terapkan filter proyek
            if (appState.billsFilter.projectId !== 'all') {
                filtered = filtered.filter(bill => bill.projectId === appState.billsFilter.projectId);
            }
            // 3. Terapkan filter supplier
            if (appState.billsFilter.supplierId !== 'all') {
                filtered = filtered.filter(bill => {
                    const expense = appState.expenses.find(e => e.id === bill.expenseId);
                    return expense && expense.supplierId === appState.billsFilter.supplierId;
                });
            }
    
            // 4. Terapkan pengurutan
            filtered.sort((a, b) => {
                let valA, valB;
                if (appState.billsFilter.sortBy === 'amount') {
                    valA = a.amount;
                    valB = b.amount;
                } else { // default to dueDate
                    valA = a.dueDate?.seconds || 0;
                    valB = b.dueDate?.seconds || 0;
                }
    
                return appState.billsFilter.sortDirection === 'asc' ? valA - valB : valB - valA;
            });
    
            $('#sub-page-content').innerHTML = _getBillsListHTML(filtered, $('.sub-nav-item.active').dataset.tab);
        };
    
        const renderTabContent = async (tabId) => {
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
            let statusQuery;
            const queries = [];
    
            if (tabId === 'belum_lunas') statusQuery = where("status", "==", "unpaid");
            else if (tabId === 'lunas') statusQuery = where("status", "==", "paid");
    
            if (tabId === 'gaji') {
                queries.push(where("type", "==", "gaji"));
            } else {
                queries.push(where("type", "!=", "gaji"), orderBy("type"));
            }
    
            if (statusQuery) queries.push(statusQuery);
            queries.push(orderBy("dueDate", "desc"));
    
            const q = query(billsCol, ...queries);
            const billsSnap = await getDocs(q);
            currentBills = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
            applyFilterAndSort(); // Terapkan filter & sort ke data yang baru diambil
        };
    
        // [MODIFIKASI] Event listener untuk toolbar
        $('#tagihan-search-input').addEventListener('input', (e) => {
            appState.billsFilter.searchTerm = e.target.value.toLowerCase();
            applyFilterAndSort();
        });
        $('#tagihan-filter-btn').addEventListener('click', () => _showBillsFilterModal(applyFilterAndSort));
        $('#tagihan-sort-btn').addEventListener('click', () => _showBillsSortModal(applyFilterAndSort));
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        await renderTabContent(tabs[0].id);
    }
    
    // [BARU] Fungsi untuk menampilkan modal filter tagihan
    function _showBillsFilterModal(onApply) {
        const projectOptions = [{ value: 'all', text: 'Semua Proyek' }, ...appState.projects.map(p => ({ value: p.id, text: p.projectName }))];
        const supplierOptions = [{ value: 'all', text: 'Semua Supplier' }, ...appState.suppliers.map(s => ({ value: s.id, text: s.supplierName }))];
    
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
        createModal('dataDetail', { title: 'Filter Tagihan', content });
    
        _initCustomSelects($('#dataDetail-modal'));
    
        $('#bills-filter-form').addEventListener('submit', (e) => {
            e.preventDefault();
            appState.billsFilter.projectId = $('#filter-project-id').value;
            appState.billsFilter.supplierId = $('#filter-supplier-id').value;
            onApply();
            closeModal($('#dataDetail-modal'));
        });
    
        $('#reset-filter-btn').addEventListener('click', () => {
            appState.billsFilter.projectId = 'all';
            appState.billsFilter.supplierId = 'all';
            onApply();
            closeModal($('#dataDetail-modal'));
        });
    }
    
    // [BARU] Fungsi untuk menampilkan modal sort tagihan
    function _showBillsSortModal(onApply) {
        const { sortBy, sortDirection } = appState.billsFilter;
        const content = `
            <form id="bills-sort-form">
                <div class="sort-options">
                    <div class="sort-option">
                        <input type="radio" id="sort-due-date" name="sortBy" value="dueDate" ${sortBy === 'dueDate' ? 'checked' : ''}>
                        <label for="sort-due-date">Tanggal Jatuh Tempo</label>
                    </div>
                    <div class="sort-option">
                        <input type="radio" id="sort-amount" name="sortBy" value="amount" ${sortBy === 'amount' ? 'checked' : ''}>
                        <label for="sort-amount">Jumlah Tagihan</label>
                    </div>
                </div>
                <div class="form-group" style="margin-top: 1rem;">
                    <label>Arah Pengurutan</label>
                    <div class="sort-direction">
                        <button type="button" data-dir="desc" class="${sortDirection === 'desc' ? 'active' : ''}">Terbaru/Tertinggi</button>
                        <button type="button" data-dir="asc" class="${sortDirection === 'asc' ? 'active' : ''}">Terlama/Terendah</button>
                    </div>
                </div>
                <div class="filter-modal-footer" style="grid-template-columns: 1fr;">
                     <button type="submit" class="btn btn-primary">Terapkan</button>
                </div>
            </form>
        `;
    
        createModal('dataDetail', { title: 'Urutkan Tagihan', content });
    
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
    
    // [FIXED] Blok kode duplikat telah dihapus dari sini
    
    function _getBillsListHTML(bills, tabId) {
        if (bills.length === 0) {
            let message = 'Tidak ada tagihan';
            if (tabId === 'belum_lunas') message += ' yang perlu dibayar.';
            else if (tabId === 'lunas') message += ' yang sudah lunas.';
            else if (tabId === 'gaji') message += ' gaji.';
            return `<p class="empty-state">${message}</p>`;
        }
    
        return `
        <div style="margin-top: 1.5rem;">
            ${bills.map(item => {
            let supplierName = '';
            if (item.expenseId) {
                const expense = appState.expenses.find(e => e.id === item.expenseId);
                if (expense && expense.supplierId) {
                    const supplier = appState.suppliers.find(s => s.id === expense.supplierId);
                    if (supplier) {
                        supplierName = supplier.supplierName;
                    }
                }
            }
    
            let badgeHTML = '';
            const project = appState.projects.find(p => p.id === item.projectId);
    
            if (project && project.projectType) {
                if (project.projectType === 'main_income') {
                    badgeHTML = `<span class="project-type-badge project-type-main">Utama</span>`;
                } else if (project.projectType === 'internal_expense') {
                    badgeHTML = `<span class="project-type-badge project-type-internal">Internal</span>`;
                }
            }
            const date = item.dueDate?.toDate ? item.dueDate.toDate().toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Tanggal tidak valid';
            const subtitle = supplierName ? `${supplierName} · ${date}` : date;
    
            const remainingAmount = (item.amount || 0) - (item.paidAmount || 0);
            const isPaid = remainingAmount <= 0;
            let secondaryInfoHTML = '';
    
            if (isPaid) {
                secondaryInfoHTML = `<div class="paid-indicator"><span class="material-symbols-outlined">task_alt</span> Lunas</div>`;
            } else if (item.paidAmount > 0) {
                secondaryInfoHTML = `<p class="card-list-item-repayment-info">Sisa: <strong>${fmtIDR(remainingAmount)}</strong></p>`;
            } else {
                secondaryInfoHTML = `<p class="card-list-item-repayment-info" style="color:var(--warn)">Belum Dibayar</p>`
            }
    
            return `
            <div class="card card-list-item" data-id="${item.id}" data-type="bill" data-expense-id="${item.expenseId || ''}">
                
                <div class="card-list-item-content" data-action="open-bill-actions-modal"> 
                    <div class="card-list-item-details">
                        <h5 class="card-list-item-title">${item.description}</h5>
                        <p class="card-list-item-subtitle">${subtitle}</p> 
                    </div>
                    <div class="card-list-item-amount-wrapper">
                        <strong class="card-list-item-amount">${fmtIDR(item.amount)}</strong>
                        ${secondaryInfoHTML}
                    </div>
                </div>
    
                </div>
            `}).join('')}
        </div>
        `;
    }
    
    async function handlePayBill(billId) {
        createModal('confirmPayBill', {
            onConfirm: async () => {
                toast('syncing', 'Memproses pelunasan...');
                try {
                    const billRef = doc(billsCol, billId);
                    const billSnap = await getDoc(billRef);
    
                    if (!billSnap.exists()) {
                        throw new Error('Tagihan tidak ditemukan!');
                    }
                    const billData = billSnap.data();
                    const expenseId = billData.expenseId;
                    
                    const batch = writeBatch(db);
                    batch.update(billRef, { status: 'paid', paidAmount: billData.amount, paidAt: serverTimestamp() });
                    if(expenseId) {
                        const expenseRef = doc(expensesCol, expenseId);
                        batch.update(expenseRef, { status: 'paid' });
                    }
                    await batch.commit();
                    await _logActivity(`Melunasi Tagihan: ${billData.description}`, { billId, amount: billData.amount });
                    
                    toast('success', 'Tagihan berhasil dilunasi.');
                    renderTagihanPage();
    
                } catch (error) {
                    toast('error', 'Gagal memproses pelunasan.');
                    console.error('Error paying bill:', error);
                }
            }
        });
    } // <-- [FIXED] Kurung kurawal penutup ditambahkan di sini
    
    async function renderPengeluaranPage() {
        const container = $('.page-container');
        const tabs = [{id:'operasional', label:'Operasional'}, {id:'material', label:'Material'}, {id:'lainnya', label:'Lainnya'}];
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;
    
        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('pengeluaran', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            let formHTML;
            await fetchAndCacheData('suppliers', suppliersCol, 'supplierName');
            await fetchAndCacheData('projects', projectsCol, 'projectName');
            let categoryOptions = [], categoryMasterType = '', categoryLabel = '', supplierOptions = [];
            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
    
            if (tabId === 'material') {
                formHTML = _getFormFakturMaterialHTML();
            } else {
                let categoryType;
                if (tabId === 'operasional') {
                    await fetchAndCacheData('operationalCategories', opCatsCol);
                    categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                    categoryMasterType = 'op-cats';
                    categoryLabel = 'Kategori Operasional';
                    categoryType = 'Operasional';
                }
                else if (tabId === 'lainnya') {
                    await fetchAndCacheData('otherCategories', otherCatsCol);
                    categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                    categoryMasterType = 'other-cats';
                    categoryLabel = 'Kategori Lainnya';
                    categoryType = 'Lainnya';
                }
                
                const filteredSuppliers = appState.suppliers.filter(s => s.category === categoryType);
                supplierOptions = filteredSuppliers.map(s => ({ value: s.id, text: s.supplierName }));
                formHTML = _getFormPengeluaranHTML(tabId, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions);
            }
    
            contentContainer.innerHTML = isViewer() ? '<p class="empty-state">Halaman ini hanya untuk input data oleh Owner/Editor.</p>' : formHTML;
            
            if(!isViewer()) {
                // Menggunakan query yang lebih fleksibel untuk menemukan form
                const formEl = $('#pengeluaran-form') || $('#material-invoice-form');
                if (formEl) {
                    formEl.setAttribute('data-draft-key', `pengeluaran-${tabId}`);
                    _attachFormDraftPersistence(formEl);
                }
                _attachPengeluaranFormListeners(tabId);
            }        
        }
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        const lastSubPage = appState.activeSubPage.get('pengeluaran') || tabs[0].id;
        if($('.sub-nav-item.active')) $('.sub-nav-item.active').classList.remove('active');
        if($(`.sub-nav-item[data-tab="${lastSubPage}"]`)) $(`.sub-nav-item[data-tab="${lastSubPage}"]`).classList.add('active');
        await renderTabContent(lastSubPage);
    }
    
    function _getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel, supplierOptions, projectOptions) {
        return `
        <div class="card card-pad">
            <form id="pengeluaran-form" data-type="${type}">
                ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, '', 'projects')}
                ${categoryOptions.length > 0 ? createMasterDataSelect('expense-category', categoryLabel, categoryOptions, '', categoryMasterType) : ''}
                <div class="form-group">
                    <label>Jumlah</label>
                    <input type="text" id="pengeluaran-jumlah" name="pengeluaran-jumlah" inputmode="numeric" required placeholder="mis. 50.000"> </div>
                 <div class="form-group">
                    <label>Deskripsi</label>
                    <input type="text" id="pengeluaran-deskripsi" name="pengeluaran-deskripsi" required placeholder="mis. Beli semen"> </div>
                ${createMasterDataSelect('expense-supplier', 'Supplier/Penerima', supplierOptions, '', 'suppliers')}
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" id="pengeluaran-tanggal" name="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                
                <h5 class="invoice-section-title" style="margin-top:1.5rem;">Lampiran (Opsional)</h5>
                <div class="form-group">
                    <label for="attachmentFile">Upload Bukti / Lampiran</label>
                    <input type="file" name="attachmentFile" accept="image/*">
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
    
    function _attachPengeluaranFormListeners(type) {
        _initCustomSelects();
        const form = (type === 'material') ? $('#material-invoice-form') : $('#pengeluaran-form');
        if (!form) return;
    
        // Listener untuk tombol status
        form.querySelectorAll('.btn-status-payment').forEach(btn => {
            btn.addEventListener('click', () => {
                form.querySelectorAll('.btn-status-payment').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                if (form.querySelector('input[name="status"]')) {
                    form.querySelector('input[name="status"]').value = btn.dataset.status;
                }
            });
        });
    
        // Pasang listener spesifik berdasarkan tipe form
        if (type === 'material') {
            $('#add-invoice-item-btn')?.addEventListener('click', _addInvoiceItemRow);
            $('#invoice-items-container')?.addEventListener('input', _handleInvoiceItemChange);
            const invoiceNumberInput = $('#pengeluaran-deskripsi');
            if (invoiceNumberInput) {
                invoiceNumberInput.value = _generateInvoiceNumber();
            }
        } else {
            $('#pengeluaran-jumlah')?.addEventListener('input', _formatNumberInput);
        }
        
        // Pasang listener submit untuk form, APAPUN tipenya
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            handleAddPengeluaran(e, type); // Panggil handleAddPengeluaran
        });
    }
    
    async function handleAddPengeluaran(e, type) {
        e.preventDefault();
        const form = e.target;
        
        toast('syncing', 'Memvalidasi dan menyimpan...');
        try {
            const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;
            if (!projectId) {
                toast('error', 'Proyek harus dipilih.');
                return;
            }
    
            let expenseData;
            if (type === 'material') {
                const items = [];
                $$('.invoice-item-row', form).forEach(row => {
                    const name = row.querySelector('input[name="itemName"]').value;
                    const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                    const qty = Number(row.querySelector('input[name="itemQty"]').value);
                    if (name && price > 0 && qty > 0) items.push({ name, price, qty, total: price * qty });
                });
    
                if (items.length === 0) {
                    toast('error', 'Harap tambahkan minimal satu barang.'); return;
                }
    
                expenseData = {
                    amount: parseFormattedNumber($('#invoice-total-amount').textContent),
                    description: form.elements['pengeluaran-deskripsi'].value.trim(),
                    supplierId: form.elements['supplier-id'].value,
                    date: new Date(form.elements['pengeluaran-tanggal'].value),
                    type: 'material', projectId, items,
                    invoiceUrl: '', deliveryOrderUrl: '' // Siapkan properti URL
                };
    
                // Proses upload sebelum menyimpan ke Firestore
                const invoiceFile = form.elements.invoiceFile?.files[0];
                const deliveryOrderFile = form.elements.deliveryOrderFile?.files[0];
                if (invoiceFile) {
                    expenseData.invoiceUrl = await _uploadFileToCloudinary(invoiceFile) || '';
                }
                if (deliveryOrderFile) {
                    expenseData.deliveryOrderUrl = await _uploadFileToCloudinary(deliveryOrderFile) || '';
                }
    
            } else {
                expenseData = {
                   amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value),
                   description: form.elements['pengeluaran-deskripsi'].value.trim(),
                   supplierId: form.elements['expense-supplier'].value,
                   categoryId: form.elements['expense-category']?.value || '',
                   date: new Date(form.elements['pengeluaran-tanggal'].value),
                   type: type, projectId,
                   attachmentUrl: '' // Siapkan properti URL
               };

               // Proses upload lampiran generik
               const attachmentFile = form.elements.attachmentFile?.files[0];
               if (attachmentFile) {
                   expenseData.attachmentUrl = await _uploadFileToCloudinary(attachmentFile) || '';
               }
           }
            
            if (!expenseData.amount || !expenseData.description) {
                toast('error', 'Harap isi deskripsi dan jumlah.'); return;
            }
    
            const status = form.querySelector('input[name="status"]').value || 'unpaid';
            expenseData.status = status;
            expenseData.createdAt = serverTimestamp();
    
            // Simpan data (termasuk URL dari Cloudinary) ke Firestore
            const expenseDocRef = await addDoc(expensesCol, expenseData);
            await addDoc(billsCol, {
                expenseId: expenseDocRef.id, description: expenseData.description, amount: expenseData.amount,
                dueDate: expenseData.date, status: expenseData.status, type: expenseData.type,
                projectId: expenseData.projectId, createdAt: serverTimestamp(),
                paidAmount: status === 'paid' ? expenseData.amount : 0,
                ...(status === 'paid' && { paidAt: serverTimestamp() })
            });
            
            await _logActivity(`Menambah Pengeluaran: ${expenseData.description}`, { docId: expenseDocRef.id, status });
            toast('success', 'Pengeluaran berhasil disimpan!');
            
            form.reset();
            if (form && typeof form._clearDraft === 'function') form._clearDraft();
            _initCustomSelects(form);
            form.querySelectorAll('.custom-select-trigger span:first-child').forEach(s => s.textContent = 'Pilih...');
            if(type === 'material') {
                $('#invoice-items-container').innerHTML = '';
                _addInvoiceItemRow();
                _updateInvoiceTotal();
                const invoiceNumberInput = $('#pengeluaran-deskripsi');
                if (invoiceNumberInput) invoiceNumberInput.value = _generateInvoiceNumber();
            }
            handleNavigation('tagihan');
    
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error("Error saving expense:", error);
        }
    }
    
    // [CATATAN] Fungsi ini tidak digunakan dan memiliki error. Bisa dihapus jika tidak diperlukan.
    async function _saveExpense(expenseData, form) { // [FIXED] Parameter 'status' dihapus
        toast('syncing', 'Menyimpan pengeluaran...');
        try {
            const status = form.elements.status.value;
            // let expenseData; // 'expenseData' sudah menjadi parameter, tidak perlu dideklarasi ulang
    
            if (type === 'material') {
                // ... (logika untuk mengambil data form material tetap sama) ...
                // Pastikan untuk menambahkan status ke expenseData
                expenseData.status = status;
            } else {
                 expenseData = {
                    amount: parseFormattedNumber(form.elements['pengeluaran-jumlah'].value),
                    description: form.elements['pengeluaran-deskripsi'].value.trim(),
                    supplierId: form.elements['expense-supplier'].value,
                    categoryId: form.elements['expense-category']?.value || '',
                    date: new Date(form.elements['pengeluaran-tanggal'].value),
                    type: type,
                    projectId: form.elements['expense-project'].value,
                    status: status, // Ambil status dari form
                    createdAt: serverTimestamp()
                };
            }
        
            // 1. Selalu buat dokumen di koleksi 'expenses'
            const expenseDocRef = await addDoc(expensesCol, expenseData);
            
            // 2. Selalu buat dokumen 'bill' agar muncul di halaman Tagihan
            const billData = {
                expenseId: expenseDocRef.id,
                description: expenseData.description,
                amount: expenseData.amount,
                dueDate: expenseData.date,
                status: expenseData.status,
                type: expenseData.type,
                projectId: expenseData.projectId,
                createdAt: serverTimestamp(),
                paidAmount: status === 'paid' ? expenseData.amount : 0,
                ...(status === 'paid' && { paidAt: serverTimestamp() })
            };
            await addDoc(billsCol, billData);
    
            await _logActivity(`Menambah Pengeluaran: ${expenseData.description}`, { docId: expenseDocRef.id, status });
            
            toast('success', 'Pengeluaran berhasil disimpan!');
            
            form.reset();
            if (form && typeof form._clearDraft === 'function') form._clearDraft();
            _initCustomSelects(form);
            form.querySelectorAll('.custom-select-trigger span:first-child').forEach(s => s.textContent = 'Pilih...');
    
            // [NAVIGASI OTOMATIS] Pindahkan pengguna ke halaman Tagihan
            handleNavigation('tagihan');
    
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error("Error saving expense:", error);
        }
    }


    // =======================================================
    //         FUNGSI CRUD MASTER DATA
    // =======================================================

// GANTI SELURUH FUNGSI handleManageMasterData DI script.js
async function handleManageMasterData(type) {
    const config = masterDataConfig[type];
    if (!config) return;

    await Promise.all([
        fetchAndCacheData(config.stateKey, config.collection, config.nameField),
        fetchAndCacheData('professions', professionsCol, 'professionName'),
        fetchAndCacheData('projects', projectsCol, 'projectName')
    ]);

    const getListItemContent = (item, type) => {
        let content = `<span>${item[config.nameField]}</span>`;
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
        <div class="master-data-item" data-id="${item.id}" data-type="${type}">
            ${getListItemContent(item, type)}
            <div class="master-data-item-actions">
                <button class="btn-icon" data-action="edit-master-item"><span class="material-symbols-outlined">edit</span></button>
                <button class="btn-icon btn-icon-danger" data-action="delete-master-item"><span class="material-symbols-outlined">delete</span></button>
            </div>
        </div>
    `).join('');

    let formFieldsHTML = `
        <div class="form-group">
           <label>Nama ${config.title}</label>
           <input type="text" name="itemName" placeholder="Masukkan nama..." required>
        </div>
    `;

    if (type === 'suppliers') {
        const categoryOptions = [
            { value: 'Operasional', text: 'Operasional' },
            { value: 'Material', text: 'Material' },
            { value: 'Lainnya', text: 'Lainnya' },
        ];
        formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions);
    }

    if (type === 'projects') {
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
    }

    if (type === 'workers') {
        const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
        const projectFieldsHTML = appState.projects.map(p => `
            <div class="form-group">
                <label>Upah Harian - ${p.projectName}</label>
                <input type="text" inputmode="numeric" name="project_wage_${p.id}" placeholder="mis. 150.000">
            </div>
        `).join('');
        
        const statusOptions = [
            { value: 'active', text: 'Aktif' },
            { value: 'inactive', text: 'Tidak Aktif' }
        ];

        formFieldsHTML += `
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

    createModal('manageMaster', { 
        title: `Kelola ${config.title}`, 
        content,
        onClose: () => {
            const page = appState.activePage;
            if (page === 'pemasukan') renderPemasukanPage();
            else if (page === 'pengeluaran') renderPengeluaranPage();
            else if (page === 'absensi') renderAbsensiPage();
        }
    });
}    
    async function handleAddMasterItem(form) {
        const type = form.dataset.type;
        const config = masterDataConfig[type];
        const itemName = form.elements.itemName.value.trim();
    
        if (!config || !itemName) return;
        
        const dataToAdd = {
            [config.nameField]: itemName,
            createdAt: serverTimestamp()
        };
    
        if (type === 'suppliers') dataToAdd.category = form.elements.itemCategory.value;
        if (type === 'projects') {
            dataToAdd.projectType = form.elements.projectType.value;
            dataToAdd.budget = parseFormattedNumber(form.elements.budget.value);
        }
        if (type === 'workers') {
            dataToAdd.professionId = form.elements.professionId.value;
            dataToAdd.status = form.elements.workerStatus.value;
            dataToAdd.projectWages = {};
            appState.projects.forEach(p => {
                const wage = parseFormattedNumber(form.elements[`project_wage_${p.id}`].value);
                if (wage > 0) dataToAdd.projectWages[p.id] = wage;
            });
        }
        
        toast('syncing', `Menambah ${config.title}...`);
        try {
            const newDocRef = doc(config.collection);
            if (type === 'projects' && dataToAdd.projectType === 'main_income') {
                await runTransaction(db, async (transaction) => {
                    const q = query(projectsCol, where("projectType", "==", "main_income"));
                    const mainProjectsSnap = await getDocs(q); 
                    mainProjectsSnap.forEach(doc => transaction.update(doc.ref, { projectType: 'internal_expense' }));
                    transaction.set(newDocRef, dataToAdd);
                });
            } else {
                await setDoc(newDocRef, dataToAdd);
            }

            await _logActivity(`Menambah Master Data: ${config.title}`, { name: itemName });
            toast('success', `${config.title} baru berhasil ditambahkan.`);
            form.reset();
            $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
            await handleManageMasterData(type);
        } catch (error) {
            toast('error', `Gagal menambah ${config.title}.`);
            console.error(error);
        }
    }
    
    function handleEditMasterItem(id, type) {
        const config = masterDataConfig[type];
        if (!config) return;
        const item = appState[config.stateKey].find(i => i.id === id);
        if (!item) return;
    
        let formFieldsHTML = `
            <div class="form-group">
                <label>Nama ${config.title}</label>
                <input type="text" name="itemName" value="${item[config.nameField]}" required>
            </div>
        `;
    
        if (type === 'suppliers') {
            const categoryOptions = [
                { value: 'Operasional', text: 'Operasional' },
                { value: 'Material', text: 'Material' },
                { value: 'Lainnya', text: 'Lainnya' },
            ];
            formFieldsHTML += createMasterDataSelect('itemCategory', 'Kategori Supplier', categoryOptions, item.category || 'Operasional');
        }

        if (type === 'projects') {
            const projectTypeOptions = [
                { value: 'main_income', text: 'Pemasukan Utama' },
                { value: 'internal_expense', text: 'Biaya Internal (Laba Bersih)' }
            ];
            const budget = item.budget ? new Intl.NumberFormat('id-ID').format(item.budget) : '';
            formFieldsHTML += `
                <div class="form-group">
                    <label>Anggaran Proyek</label>
                    <input type="text" inputmode="numeric" name="budget" placeholder="mis. 100.000.000" value="${budget}">
                </div>
                ${createMasterDataSelect('projectType', 'Jenis Proyek', projectTypeOptions, item.projectType || 'main_income')}
            `;
        }

        if (type === 'workers') {
            const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
            const projectFieldsHTML = appState.projects.map(p => {
                const currentWage = item.projectWages?.[p.id] || '';
                return `
                    <div class="form-group">
                        <label>Upah Harian - ${p.projectName}</label>
                        <input type="text" inputmode="numeric" name="project_wage_${p.id}" value="${currentWage ? new Intl.NumberFormat('id-ID').format(currentWage) : ''}" placeholder="mis. 150.000">
                    </div>
                `
            }).join('');
    
            const statusOptions = [
                { value: 'active', text: 'Aktif' },
                { value: 'inactive', text: 'Tidak Aktif' }
            ];

            formFieldsHTML += `
                ${createMasterDataSelect('professionId', 'Profesi', professionOptions, item.professionId || '', 'professions')}
                ${createMasterDataSelect('workerStatus', 'Status', statusOptions, item.status || 'active')}
                <h5 class="invoice-section-title">Upah Harian per Proyek</h5>
                ${projectFieldsHTML || '<p class="empty-state-small">Belum ada proyek.</p>'}
            `;
        }
    
        const content = `
            <form id="edit-master-form" data-id="${id}" data-type="${type}">
                ${formFieldsHTML}
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </form>
        `;
        createModal('editMaster', { title: `Edit ${config.title}`, content });
    }
    
    async function handleUpdateMasterItem(form) {
        const { id, type } = form.dataset;
        const newName = form.elements.itemName.value.trim();
        const config = masterDataConfig[type];
        if (!config || !newName) return;
    
        const dataToUpdate = { [config.nameField]: newName };

        if (type === 'suppliers') dataToUpdate.category = form.elements.itemCategory.value;
        if (type === 'projects') {
            dataToUpdate.projectType = form.elements.projectType.value;
            dataToUpdate.budget = parseFormattedNumber(form.elements.budget.value);
        }
        if (type === 'workers') {
            dataToUpdate.professionId = form.elements.professionId.value;
            dataToUpdate.status = form.elements.workerStatus.value;
            dataToUpdate.projectWages = {};
            appState.projects.forEach(p => {
                const wage = parseFormattedNumber(form.elements[`project_wage_${p.id}`].value);
                if (wage > 0) dataToUpdate.projectWages[p.id] = wage;
            });
        }
    
        toast('syncing', `Memperbarui ${config.title}...`);
        try {
            if (type === 'projects' && dataToUpdate.projectType === 'main_income') {
                await runTransaction(db, async (transaction) => {
                    const q = query(projectsCol, where("projectType", "==", "main_income"));
                    const mainProjectsSnap = await getDocs(q);
                    mainProjectsSnap.forEach(docSnap => {
                        if (docSnap.id !== id) transaction.update(docSnap.ref, { projectType: 'internal_expense' });
                    });
                    transaction.update(doc(config.collection, id), dataToUpdate);
                });
            } else {
                await updateDoc(doc(config.collection, id), dataToUpdate);
            }
            await _logActivity(`Memperbarui Master Data: ${config.title}`, { docId: id, newName });
            toast('success', `${config.title} berhasil diperbarui.`);
            await handleManageMasterData(type);
        } catch (error) {
            toast('error', `Gagal memperbarui ${config.title}.`);
        }
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
                    await deleteDoc(doc(config.collection, id));
                    await _logActivity(`Menghapus Master Data: ${config.title}`, { docId: id, name: item[config.nameField] });
                    toast('success', `${config.title} berhasil dihapus.`);
                    await handleManageMasterData(type);
                } catch (error) {
                    toast('error', `Gagal menghapus ${config.title}.`);
                }
            }
        });
    }


    // =======================================================
    //         FUNGSI CRUD ITEM UTAMA
    // =======================================================
    async function handleDeleteItem(id, type) {
        createModal('confirmDelete', { 
            onConfirm: async () => {
                toast('syncing', 'Menghapus data...');
                try {
                    let col, item;
                    if(type === 'termin') { col = incomesCol; item = appState.incomes.find(i=>i.id===id); }
                    else if (type === 'pinjaman') { col = fundingSourcesCol; item = appState.fundingSources.find(i=>i.id===id); }
                    else if (type === 'expense') { col = expensesCol; item = appState.expenses.find(i=>i.id===id); }
                    else if (type === 'bill') { col = billsCol; item = appState.bills.find(i=>i.id===id); }
                    else return;
                    
                    await deleteDoc(doc(col, id));
                    
                    if (type === 'expense') {
                        const q = query(billsCol, where("expenseId", "==", id));
                        const billSnap = await getDocs(q);
                        const batch = writeBatch(db);
                        billSnap.docs.forEach(d => batch.delete(d.ref));
                        await batch.commit();
                    }
                    await _logActivity(`Menghapus Data ${type}`, { docId: id, description: item?.description || item?.amount });

                    toast('success', 'Data berhasil dihapus.');
                    
                    if (appState.activePage === 'pemasukan') await _rerenderPemasukanList(appState.activeSubPage.get('pemasukan'));
                    if (appState.activePage === 'pengeluaran') await _rerenderPengeluaranList(appState.activeSubPage.get('pengeluaran'));
                    if (appState.activePage === 'tagihan') renderTagihanPage();

                } catch (error) {
                    toast('error', 'Gagal menghapus data.');
                    console.error('Delete error:', error);
                }
            }
        });
    }
    
    async function handlePaymentModal(id, type) {
        const item = appState.fundingSources.find(i => i.id === id);
        if (!item) { toast('error', 'Data pinjaman tidak ditemukan.'); return; }

        const totalPayable = item.totalRepaymentAmount || item.totalAmount;
        const remainingAmount = totalPayable - (item.paidAmount || 0);

        const content = `
            <form id="payment-form" data-id="${id}" data-type="${type}">
                <div class="payment-summary">
                    <div><span>Total Tagihan:</span><strong>${fmtIDR(totalPayable)}</strong></div>
                    <div><span>Sudah Dibayar:</span><strong>${fmtIDR(item.paidAmount || 0)}</strong></div>
                    <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
                </div>
                <div class="form-group">
                    <label>Jumlah Pembayaran</label>
                    <input type="text" name="amount" inputmode="numeric" required placeholder="Masukkan jumlah cicilan">
                </div>
                <div class="form-group">
                    <label>Tanggal Pembayaran</label>
                    <input type="date" name="date" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                <button type="submit" class="btn btn-primary">Bayar</button>
            </form>
        `;
        createModal('payment', { title: 'Form Pembayaran', content });
    }

    async function handleProcessPayment(form) {
        const { id, type } = form.dataset;
        const amount = parseFormattedNumber(form.elements.amount.value);
        const date = new Date(form.elements.date.value);
        
        toast('syncing', 'Memproses pembayaran...');
        try {
            const itemRef = doc(fundingSourcesCol, id);
            const itemSnap = await getDoc(itemRef);
            if (!itemSnap.exists()) throw new Error("Item not found");

            const itemData = itemSnap.data();
            const newPaidAmount = (itemData.paidAmount || 0) + amount;
            const totalPayable = itemData.totalRepaymentAmount || itemData.totalAmount;
            
            const isPaid = newPaidAmount >= totalPayable;

            await runTransaction(db, async (transaction) => {
                transaction.update(itemRef, {
                    paidAmount: increment(amount),
                    status: isPaid ? 'paid' : 'unpaid',
                    ...(isPaid && { paidAt: serverTimestamp() })
                });

                const paymentRef = doc(collection(itemRef, 'payments'));
                transaction.set(paymentRef, {
                    amount,
                    date,
                    createdAt: serverTimestamp()
                });
            });
            
            await _logActivity(`Membayar Pinjaman`, { docId: id, amount });
            toast('success', 'Pembayaran berhasil dicatat.');
            if (appState.activePage === 'pemasukan') await _rerenderPemasukanList(type);

        } catch (error) {
            toast('error', `Gagal memproses pembayaran.`);
            console.error('Payment error:', error);
        }
    }

    async function handleEditItem(id, type) {
        let list, item, formHTML = 'Form tidak tersedia.';
    
        if (type === 'expense') {
            // [PERBAIKAN] Menggunakan fetchAndCacheData untuk memastikan data terbaru
            await fetchAndCacheData('expenses', expensesCol); 
            list = appState.expenses;
        } else if (type === 'termin') { list = appState.incomes; } 
        else if (type === 'pinjaman') { list = appState.fundingSources; } 
        else { toast('error', 'Tipe data tidak dikenal.'); return; }
    
        item = list.find(i => i.id === id);
        if (!item) { 
             const docRef = doc(expensesCol, id);
             const docSnap = await getDoc(docRef);
             if (docSnap.exists()) item = {id: docSnap.id, ...docSnap.data()};
             else { toast('error', 'Data tidak ditemukan.'); return; }
        }
        
        const date = item.date.toDate().toISOString().slice(0, 10);
        
        if (type === 'termin') {
            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
            formHTML = `
                <form id="edit-item-form" data-id="${id}" data-type="${type}">
                    <div class="form-group"><label>Jumlah</label><input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required></div>
                    <div class="form-group"><label>Tanggal</label><input type="date" name="date" value="${date}" required></div>
                    ${createMasterDataSelect('projectId', 'Proyek Terkait', projectOptions, item.projectId, 'projects')}
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            `;
        } else if (type === 'pinjaman') {
            const creditorOptions = appState.fundingCreditors.map(c => ({ value: c.id, text: c.creditorName }));
            const loanTypeOptions = [ {value: 'none', text: 'Tanpa Bunga'}, {value: 'interest', text: 'Berbunga'} ];
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
        } else if (type === 'expense') {
            let categoryOptions = [], masterType = '', categoryLabel = '';
            if (item.type === 'operasional') {
                categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                masterType = 'op-cats'; categoryLabel = 'Kategori Operasional';
            } else if (item.type === 'lainnya') {
                categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                masterType = 'other-cats'; categoryLabel = 'Kategori Lainnya';
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
        }
        
        createModal('editItem', { title: `Edit Data ${type}`, content: formHTML });
    }
    
    async function handleUpdateItem(form) {
        const { id, type } = form.dataset;
        toast('syncing', 'Memperbarui data...');

        try {
            let col, dataToUpdate = {};

            if (type === 'termin') {
                col = incomesCol;
                dataToUpdate = { amount: parseFormattedNumber(form.elements.amount.value), date: new Date(form.elements.date.value), projectId: form.elements.projectId.value, };
            } else if (type === 'pinjaman') {
                col = fundingSourcesCol;
                dataToUpdate = { totalAmount: parseFormattedNumber(form.elements.totalAmount.value), date: new Date(form.elements.date.value), creditorId: form.elements.creditorId.value, interestType: form.elements.interestType.value };
                if (dataToUpdate.interestType === 'interest') {
                    dataToUpdate.rate = Number(form.elements.rate.value);
                    dataToUpdate.tenor = Number(form.elements.tenor.value);
                    dataToUpdate.totalRepaymentAmount = dataToUpdate.totalAmount * (1 + (dataToUpdate.rate / 100 * dataToUpdate.tenor));
                } else {
                    dataToUpdate.rate = null; dataToUpdate.tenor = null; dataToUpdate.totalRepaymentAmount = null;
                }
            } else if (type === 'expense') {
                col = expensesCol;
                dataToUpdate = { amount: parseFormattedNumber(form.elements.amount.value), description: form.elements.description.value, date: new Date(form.elements.date.value), categoryId: form.elements.categoryId?.value || '' };
            } else return;
            
            await updateDoc(doc(col, id), dataToUpdate);
            
            if (type === 'expense') {
                 const q = query(billsCol, where("expenseId", "==", id));
                 const billSnap = await getDocs(q);
                 if (!billSnap.empty) {
                     const billRef = billSnap.docs[0].ref;
                     await updateDoc(billRef, { amount: dataToUpdate.amount, description: dataToUpdate.description, dueDate: dataToUpdate.date });
                 }
            }
            await _logActivity(`Memperbarui Data: ${type}`, { docId: id, description: dataToUpdate.description || dataToUpdate.amount });

            toast('success', 'Data berhasil diperbarui.');
            if (appState.activePage === 'pemasukan') await _rerenderPemasukanList(appState.activeSubPage.get('pemasukan'));
            if (appState.activePage === 'pengeluaran') await _rerenderPengeluaranList(appState.activeSubPage.get('pengeluaran'));
            if (appState.activePage === 'tagihan') renderTagihanPage();
        } catch (error) {
            toast('error', 'Gagal memperbarui data.');
            console.error('Update error:', error);
        }
    }
    
    async function renderGenericTabPage(pageId, title, tabs) {
        const container = $('.page-container');
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

        const renderTabContent = async (tabId) => {
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = `<div class="card card-pad"><p>Ini adalah konten untuk <strong>${tabId}</strong>.</p></div>`;
        }

        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));

        await renderTabContent(tabs[0].id);
    }
    
    // =======================================================
    //         FUNGSI-FUNGSI KHUSUS MATERIAL
    // =======================================================
    function _generateInvoiceNumber() {
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const randomPart = Math.random().toString(36).substring(2, 7).toUpperCase();
        return `INV/${year}${month}${day}/${randomPart}`;
    }

    function _getFormFakturMaterialHTML() {
        const supplierOptions = appState.suppliers
            .filter(s => s.category === 'Material')
            .map(s => ({ value: s.id, text: s.supplierName }));
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
    
        return `
        <div class="card card-pad">
            <form id="material-invoice-form" data-type="material">
                ${createMasterDataSelect('project-id', 'Proyek', projectOptions, '', 'projects')}
                <div class="form-group">
                    <label>No. Faktur</label>
                    <input type="text" id="pengeluaran-deskripsi" name="pengeluaran-deskripsi" readonly class="readonly-input">
                </div>
                ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, '', 'suppliers')}
                 <div class="form-group">
                    <label>Tanggal Faktur</label>
                    <input type="date" id="pengeluaran-tanggal" name="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
    
                <h5 class="invoice-section-title">Rincian Barang</h5>
                <div id="invoice-items-container"></div>
                 <div class="add-item-action">
                    <button type="button" id="add-invoice-item-btn" class="btn-icon" title="Tambah Barang">
                        <span class="material-symbols-outlined">add_circle</span>
                    </button>
                </div>
                
                <div class="invoice-total">
                    <span>Total Faktur:</span>
                    <strong id="invoice-total-amount">Rp 0</strong>
                </div>
    
                <h5 class="invoice-section-title">Lampiran (Opsional)</h5>
                <div class="form-group">
                    <label for="invoiceFile">Upload Bukti Faktur</label>
                    <input type="file" name="invoiceFile" accept="image/*">
                </div>
                <div class="form-group">
                    <label for="deliveryOrderFile">Upload Surat Jalan</label>
                    <input type="file" name="deliveryOrderFile" accept="image/*">
                </div>
    
                <div class="form-group">
                    <label>Status Pembayaran</label>
                    <div class="sort-direction">
                        <button type="button" class="btn-status-payment active" data-status="unpaid">Jadikan Tagihan</button>
                        <button type="button" class="btn-status-payment" data-status="paid">Sudah Lunas</button>
                    </div>
                    <input type="hidden" name="status" value="unpaid">
                </div>
    
                <button type="submit" class="btn btn-primary">Simpan Faktur</button>
            </form>
        </div>
        `;
    }

    function _addInvoiceItemRow() {
        const container = $('#invoice-items-container');
        if (!container) return;
        const index = container.children.length;
        const itemHTML = `
            <div class="invoice-item-row" data-index="${index}">
                <input type="text" name="itemName" placeholder="Nama Barang" class="item-name" required>
                <div class="item-details">
                    <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga" class="item-price" required>
                    <span>x</span>
                    <input type="number" name="itemQty" placeholder="Qty" class="item-qty" value="1" required>
                </div>
                <span class="item-total">Rp 0</span>
                <button type="button" class="btn-icon btn-icon-danger remove-item-btn"><span class="material-symbols-outlined">delete</span></button>
            </div>
        `;
        container.insertAdjacentHTML('beforeend', itemHTML);
        const newRow = container.lastElementChild;
        newRow.querySelector('.remove-item-btn').addEventListener('click', () => {
            newRow.remove();
            _updateInvoiceTotal();
        });
        newRow.querySelectorAll('input[inputmode="numeric"]').forEach(input => {
            input.addEventListener('input', _formatNumberInput);
        });
    }
    
    function _handleInvoiceItemChange(e) {
        if (!e.target.matches('.item-price, .item-qty')) return;

        const row = e.target.closest('.invoice-item-row');
        const price = parseFormattedNumber(row.querySelector('.item-price').value);
        const qty = Number(row.querySelector('.item-qty').value);
        const totalEl = row.querySelector('.item-total');

        const total = price * qty;
        totalEl.textContent = fmtIDR(total);

        _updateInvoiceTotal();
    }

    function _updateInvoiceTotal() {
        let totalAmount = 0;
        $$('.invoice-item-row').forEach(row => {
            const price = parseFormattedNumber(row.querySelector('.item-price').value);
            const qty = Number(row.querySelector('.item-qty').value);
            totalAmount += price * qty;
        });
        $('#invoice-total-amount').textContent = fmtIDR(totalAmount);
    }
    
    async function _uploadFileToCloudinary(file) {
        // Ganti nilai di bawah ini dengan informasi dari akun Cloudinary Anda
        const CLOUDINARY_CLOUD_NAME = "dcjp0fxvb"; // <-- GANTI DENGAN CLOUD NAME ANDA
        const CLOUDINARY_UPLOAD_PRESET = "banplex-uploads"; // <-- GANTI DENGAN NAMA PRESET ANDA

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

    function _compressImage(file, quality = 0.7, maxWidth = 1024) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = event => {
                const img = new Image();
                img.src = event.target.result;
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    let width = img.width;
                    let height = img.height;

                    if (width > maxWidth) {
                        height *= maxWidth / width;
                        width = maxWidth;
                    }
                    
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                    canvas.toBlob(blob => {
                        if (blob) resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                        else reject(new Error('Canvas to Blob conversion failed'));
                    }, 'image/jpeg', quality);
                };
                img.onerror = reject;
            };
            reader.onerror = reject;
        });
    }

    // =======================================================
    //         INISIALISASI & EVENT LISTENER UTAMA
    // =======================================================
    function init() {
        let touchstartX = 0, touchendX = 0, touchstartY = 0, touchendY = 0;
        // Pull-to-refresh state
        const ptrEl = document.getElementById('ptr');
        const pageContainer = document.querySelector('.page-container');
        // [DIUBAH] Meningkatkan ambang batas agar tidak terlalu sensitif
        const PTR_THRESHOLD = 180, PTR_MAX = 250;
        let ptrActive = false; let ptrPull = 0; let ptrArmed = false;
    
        function handleSwipeGesture() {
            const deltaX = touchendX - touchstartX;
            const deltaY = touchendY - touchstartY;
    
            if (Math.abs(deltaX) < Math.abs(deltaY) || Math.abs(deltaX) < 200) return;
    
            const container = $('.page-container');
            const activeSubNav = container.querySelector('.sub-nav');
    
            if (activeSubNav) {
                const tabs = $$('.sub-nav-item', activeSubNav);
                const activeTabIndex = tabs.findIndex(tab => tab.classList.contains('active'));
                if (activeTabIndex === -1) return;
    
                let nextTabIndex = (touchendX < touchstartX) ? activeTabIndex + 1 : activeTabIndex - 1;
                if (nextTabIndex >= 0 && nextTabIndex < tabs.length) tabs[nextTabIndex].click();
    
            } else {
                let navIdsToShow = [];
                if (appState.userRole === 'Owner') navIdsToShow = ['dashboard', 'pemasukan', 'pengeluaran', 'absensi', 'pengaturan'];
                else if (appState.userRole === 'Editor') navIdsToShow = ['dashboard', 'pengeluaran', 'absensi', 'tagihan', 'pengaturan'];
                else if (appState.userRole === 'Viewer') navIdsToShow = ['dashboard', 'stok', 'tagihan', 'laporan', 'pengaturan'];
                
                const accessibleLinks = ALL_NAV_LINKS.filter(link => navIdsToShow.includes(link.id));
                const currentAccessibleIndex = accessibleLinks.findIndex(link => link.id === appState.activePage);
                if (currentAccessibleIndex === -1) return;
    
                let nextNavIndex = (touchendX < touchstartX) ? currentAccessibleIndex + 1 : currentAccessibleIndex - 1;
                if (nextNavIndex >= 0 && nextNavIndex < accessibleLinks.length) handleNavigation(accessibleLinks[nextNavIndex].id);
            }
        }
    
        function resetPTR(animated = true) {
            ptrPull = 0; ptrActive = false; ptrArmed = false;
            if (ptrEl) {
                if (!animated) ptrEl.style.transition = 'none';
                ptrEl.style.transform = `translateY(0)`;
                // force reflow
                void ptrEl.offsetHeight;
                ptrEl.style.transition = '';
                ptrEl.classList.remove('ptr-ready');
            }
            if (pageContainer) {
                if (!animated) pageContainer.style.transition = 'none';
                pageContainer.style.transform = '';
                void pageContainer.offsetHeight;
                pageContainer.style.transition = '';
            }
        }
    
        async function performPTRRefresh() {
            try {
                toast('syncing', 'Memuat...');
                await Promise.resolve(syncOfflineData?.());
                // Refresh targeted pages with fresh content
                if (appState.activePage === 'dashboard') await renderDashboardPage();
                else if (appState.activePage === 'tagihan') await renderTagihanPage();
                else if (appState.activePage === 'laporan') await renderLaporanPage();
                else renderPageContent();
            } finally {
                hideToast();
                resetPTR();
            }
        }
    
        document.body.addEventListener('touchstart', e => {
            touchstartX = e.changedTouches[0].screenX;
            touchstartY = e.changedTouches[0].screenY;
        
            // [LOGIKA BARU DIMULAI]
            const touchY = e.changedTouches[0].clientY; // Posisi sentuhan dari atas layar
            const touchAreaHeight = 50; // Jarak dari atas layar dalam pixel (bisa diubah)
            const inTouchArea = touchY < touchAreaHeight;
            // [LOGIKA BARU BERAKHIR]
        
            const scroller = pageContainer || document.scrollingElement;
            const atTop = scroller ? (scroller.scrollTop <= 0) : (window.scrollY <= 0);
        
            ptrArmed = atTop && inTouchArea && appState.activePage === 'dashboard';
            ptrActive = false;
            ptrPull = 0;
        }, { passive: true });

        document.body.addEventListener('touchmove', e => {
            const y = e.changedTouches[0].screenY; const x = e.changedTouches[0].screenX;
            const dy = y - touchstartY; const dx = x - touchstartX;
            // Only handle when pulling down from top and vertical intent
            if (!ptrArmed || dy <= 0 || Math.abs(dy) < Math.abs(dx)) return;
            // prevent native refresh
            e.preventDefault();
            ptrActive = true; ptrPull = Math.min(PTR_MAX, dy * 0.6);
            if (ptrEl) {
                ptrEl.style.transform = `translateY(${Math.max(0, ptrPull - 60)}px)`;
                if (ptrPull >= PTR_THRESHOLD) ptrEl.classList.add('ptr-ready'); else ptrEl.classList.remove('ptr-ready');
            }
            if (pageContainer) pageContainer.style.transform = `translateY(${ptrPull}px)`;
        }, { passive: false });
    
        document.body.addEventListener('touchend', e => {
            touchendX = e.changedTouches[0].screenX; touchendY = e.changedTouches[0].screenY;
            if (ptrActive && ptrPull >= PTR_THRESHOLD) {
                // Lock in place briefly
                if (pageContainer) pageContainer.style.transform = `translateY(56px)`;
                performPTRRefresh();
                return;
            }
            resetPTR();
            handleSwipeGesture();
        }, { passive: false });
    
        document.body.addEventListener('click', e => {
            const iconButton = e.target.closest('.toolbar .icon-btn');
            if (iconButton) {
                iconButton.classList.add('animating');
                iconButton.addEventListener('animationend', () => {
                    iconButton.classList.remove('animating');
                }, { once: true });
            }
        }, true);

        document.body.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select-wrapper') && !e.target.closest('.actions-menu')) {
                $$('.custom-select-wrapper').forEach(w => w.classList.remove('active'));
                closeModal($('#actionsMenu-modal'));
            }
    
            const actionTarget = e.target.closest('[data-action]');
            if (!actionTarget) return;
            
            const card = actionTarget.closest('[data-id]');
            let { id, type } = { ...card?.dataset, ...actionTarget.dataset };
            let expenseId = actionTarget.dataset.expenseId || card?.dataset.expenseId;
            let manager = actionTarget.closest('.master-data-manager');
            if (manager) type = manager.dataset.type;
            let navTarget = actionTarget.dataset.nav || actionTarget.closest('[data-nav]')?.dataset.nav;
    
            switch (actionTarget.dataset.action) {
                case 'toggle-more-actions':
                    $('#quick-actions-grid')?.classList.toggle('actions-collapsed');
                    break;
                case 'view-invoice-items': {
                    const expense = appState.expenses.find(e => e.id === id);
                    if (expense && expense.items) {
                        createModal('invoiceItemsDetail', {
                            items: expense.items,
                            totalAmount: expense.amount
                        });
                    } else {
                        toast('error', 'Rincian item tidak ditemukan.');
                    }
                    break;
                }
                
                case 'view-attachment': createModal('imageView', { src: actionTarget.dataset.src }); break;
                case 'navigate': handleNavigation(navTarget); break;
                case 'auth-action': createModal(appState.currentUser ? 'confirmLogout' : 'login'); break;
                case 'open-detail': {
                    if (!card) return; e.preventDefault();
                    const sourceList = (type === 'termin') ? appState.incomes : appState.fundingSources;
                    const item = sourceList.find(i => i.id === id);
                    if (item) {
                        const content = _createDetailContentHTML(item, type);
                        const title = `Detail ${type === 'termin' ? 'Termin' : 'Pinjaman'}`;
                        createModal('dataDetail', { title, content });
                    }
                    break;
                }
                case 'delete-item': 
                    if (isViewer()) return; 
                    closeModal($('#billActionsModal-modal')); // Tambahkan ini
                    handleDeleteItem(expenseId || id, type); 
                    break;

                case 'edit-item': 
                    if (isViewer()) return; 
                    closeModal($('#billActionsModal-modal')); // Tambahkan ini
                    handleEditItem(expenseId || id, type === 'bill' ? 'expense' : type); 
                    break;

                case 'pay-bill': 
                    if (isViewer()) return; 
                    closeModal($('#billActionsModal-modal')); // Tambahkan ini
                    if (id) handlePayBillModal(id); 
                    break;
    
                case 'open-bill-detail': 
                    if(card) { e.preventDefault(); }
                    closeModal($('#billActionsModal-modal')); // Tambahkan ini
                    handleOpenBillDetail(id, expenseId); 
                    break;
                    
                case 'open-bill-actions-modal': {
                    if (isViewer()) { 
                        handleOpenBillDetail(id, expenseId); // Viewer langsung lihat detail
                        return; 
                    }
                    const bill = appState.bills.find(b => b.id === id);
                    if (!bill) {
                        toast('error', 'Data tagihan tidak ditemukan.');
                        return;
                    }
    
                    // Kumpulkan semua kemungkinan aksi
                    const actions = [];
                    actions.push({ label: 'Lihat Detail Lengkap', action: 'open-bill-detail', icon: 'visibility', id, type: 'bill', expenseId });
                    
                    if (bill.status === 'unpaid') {
                        actions.push({ label: 'Bayar Cicilan', action: 'pay-bill', icon: 'payment', id, type: 'bill' });
                    }
                    if (bill.expenseId) {
                        actions.push({ label: 'Edit', action: 'edit-item', icon: 'edit', id: bill.expenseId, type: 'expense' });
                        actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id: bill.expenseId, type: 'expense' });
                    } else if (bill.type === 'gaji') {
                        actions.push({ label: 'Hapus Tagihan', action: 'delete-item', icon: 'delete', id: bill.id, type: 'bill' });
                    }
    
                    createModal('billActionsModal', { bill, actions });
                    break;
                }

                case 'open-actions': {
                    if (isViewer()) return; e.preventDefault();
                    let actions = [];
                    if (type === 'bill') {
                        const bill = appState.bills.find(b => b.id === id);
                        if (!bill) return;
                        if (bill.status === 'unpaid') actions.push({ label: 'Bayar Cicilan', action: 'pay-bill', icon: 'payment', id, type });
                        if (bill.expenseId) {
                            actions.push({ label: 'Edit', action: 'edit-item', icon: 'edit', id: bill.expenseId, type: 'expense' });
                            actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id: bill.expenseId, type: 'expense' });
                        } else if (bill.type === 'gaji') {
                            actions.push({ label: 'Hapus Tagihan', action: 'delete-item', icon: 'delete', id: bill.id, type: 'bill' });
                        }
                    } else if (type === 'expense') {
                         actions = [{ label: 'Edit', action: 'edit-item', icon: 'edit', id, type }, { label: 'Hapus', action: 'delete-item', icon: 'delete', id, type }];
                    } else {
                        const list = type === 'termin' ? appState.incomes : appState.fundingSources;
                        const item = list.find(i => i.id === id);
                        if (!item) return;
                        actions = [{ label: 'Edit', action: 'edit-item', icon: 'edit', id, type }, { label: 'Hapus', action: 'delete-item', icon: 'delete', id, type }];
                        const isPaid = item.status === 'paid' || ((item.totalRepaymentAmount || item.totalAmount) - (item.paidAmount || 0)) <= 0;
                        if (type === 'pinjaman' && !isPaid) actions.unshift({ label: 'Bayar', action: 'pay-item', icon: 'payment', id, type });
                    }
                    createModal('actionsMenu', { actions, targetRect: actionTarget.getBoundingClientRect() });
                    break;
                }
                case 'delete-item': if (isViewer()) return; handleDeleteItem(expenseId || id, type); break;
                case 'edit-item': if (isViewer()) return; handleEditItem(expenseId || id, type === 'bill' ? 'expense' : type); break;
                case 'pay-item': if (isViewer()) return; if (id && type) handlePaymentModal(id, type); break;
                case 'pay-bill': if (isViewer()) return; if (id) handlePayBillModal(id); break;
                case 'manage-master': if (isViewer()) return; handleManageMasterData(actionTarget.dataset.type); break;
                case 'manage-master-global':
                     if (isViewer()) return;
                     createModal('dataDetail', { title: 'Pilih Master Data', content: `<div class="settings-list">${Object.entries(masterDataConfig).filter(([key]) => key !== 'projects' && key !== 'clients').map(([key, config]) => `<div class="settings-list-item" data-action="manage-master" data-type="${key}"><div class="icon-wrapper"><span class="material-symbols-outlined">database</span></div><span class="label">${config.title}</span></div>`).join('')}</div>`});
                    break;
                case 'edit-master-item': if (isViewer()) return; handleEditMasterItem(id, type); break;
                case 'delete-master-item': if (isViewer()) return; handleDeleteMasterItem(id, type); break;
                case 'check-in': if (isViewer()) return; handleCheckIn(actionTarget.dataset.id); break;
                case 'check-out': if (isViewer()) return; handleCheckOut(actionTarget.dataset.id); break;
                case 'edit-attendance': if (isViewer()) return; handleEditAttendanceModal(actionTarget.dataset.id); break;
                case 'generate-salary-bill': if (isViewer()) return; handleGenerateSalaryBill(actionTarget.dataset); break;
                case 'delete-recap-item': if (isViewer()) return; handleDeleteRecapItem(actionTarget.dataset.recordIds); break;
                case 'manage-users': if (isViewer()) return; handleManageUsers(); break;
                case 'user-action': if (isViewer()) return; handleUserAction(actionTarget.dataset); break;
                case 'upload-attachment': if (isViewer()) return; handleUploadAttachment(actionTarget.dataset); break;
                case 'download-attachment': _downloadAttachment(actionTarget.dataset.url, actionTarget.dataset.filename); break;
                case 'delete-attachment': if(isViewer()) return; handleDeleteAttachment(actionTarget.dataset); break;
                case 'download-report': _handleDownloadReport('pdf'); break;
                case 'download-csv': _handleDownloadReport('csv'); break;
            }
        });
    
        window.addEventListener('online', () => { appState.isOnline = true; toast('online', 'Kembali online'); syncOfflineData(); });
        window.addEventListener('offline', () => { appState.isOnline = false; toast('offline', 'Anda sedang offline'); });
        if (!navigator.onLine) toast('offline', 'Anda sedang offline');
        
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('./service-worker.js').then(registration => {
                    console.log('ServiceWorker registration successful');
                    
                    registration.onupdatefound = () => {
                        const installingWorker = registration.installing;
                        if (installingWorker == null) return;
                        
                        installingWorker.onstatechange = () => {
                            if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                // Versi baru telah siap. Tampilkan notifikasi snackbar.
                                const updateNotif = document.getElementById('update-notification');
                                const reloadBtn = document.getElementById('reload-app-btn');

                                const triggerUpdate = () => {
                                    sessionStorage.setItem('appJustUpdated', 'true');
                                    installingWorker.postMessage({ action: 'skipWaiting' });
                                };

                                if (updateNotif && reloadBtn) {
                                    updateNotif.classList.add('show');
                                    reloadBtn.addEventListener('click', triggerUpdate, { once: true });

                                    // PROAKTIF: Jika pengguna beralih tab, update otomatis.
                                    document.addEventListener('visibilitychange', () => {
                                        if (document.visibilityState === 'hidden') {
                                            triggerUpdate();
                                        }
                                    }, { once: true });
                                }
                            }
                        };
                    };

                }).catch(error => {
                    console.log('ServiceWorker registration failed: ', error);
                });

                let refreshing;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    // Tampilkan pesan "Memperbarui" sebelum memuat ulang
                    if (sessionStorage.getItem('appJustUpdated') === 'true') {
                         toast('syncing', 'Memperbarui aplikasi...');
                    }
                    window.location.reload();
                    refreshing = true;
                });
            });
        }
    }
       
    function updateHeaderTitle() {
        const pageTitleEl = $('#page-label-name');
        if (!pageTitleEl) return;
        const currentPageLink = ALL_NAV_LINKS.find(link => link.id === appState.activePage);
        pageTitleEl.textContent = currentPageLink ? currentPageLink.label : 'Halaman';
    }

    function handleNavigation(pageId) {
        if (!pageId || appState.activePage === pageId) return;
        appState.activePage = pageId;
        localStorage.setItem('lastActivePage', pageId);
        updateHeaderTitle(); 
        renderUI();
    }
    
    // =======================================================
    //         FUNGSI-FUNGSI BARU UNTUK TAGIHAN
    // =======================================================
    async function handleOpenBillDetail(billId, expenseId) {
        let bill = null;
        if(billId) bill = appState.bills.find(b => b.id === billId);
        
        let targetExpenseId = expenseId || bill?.expenseId;
    
        if(!targetExpenseId && bill?.type !== 'gaji') {
            toast('error', 'Data pengeluaran terkait tidak ditemukan.');
            return;
        }
    
        let content, title;
    
        if (bill && bill.type === 'gaji') {
            content = _createSalaryBillDetailContentHTML(bill);
            title = `Detail Tagihan: ${bill.description}`;
        } else {
            const expenseDoc = await getDoc(doc(expensesCol, targetExpenseId));
            if(!expenseDoc.exists()){ toast('error', 'Data pengeluaran terkait tidak ditemukan.'); return; }
            const expenseData = {id: expenseDoc.id, ...expenseDoc.data()};
            content = await _createBillDetailContentHTML(bill, expenseData);
            title = `Detail Pengeluaran: ${expenseData.description}`;
        }
        
        createModal('dataDetail', { title, content });
    }
    
    async function _createBillDetailContentHTML(bill, expenseData) {
        const remainingAmount = bill ? (bill.amount || 0) - (bill.paidAmount || 0) : 0;
        
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
    
        const createAttachmentItem = (url, label, field) => {
            if (!url) return ''; // Jangan render jika tidak ada URL
            return `
            <div class="attachment-item">
                <img src="${url}" alt="${label}" class="attachment-thumbnail" data-action="view-attachment" data-src="${url}">
                <span>${label}</span>
                <div class="attachment-actions">
                    <button class="btn-icon" data-action="download-attachment" data-url="${url}" data-filename="${label.replace(/\s+/g,'_')}.jpg" title="Unduh"><span class="material-symbols-outlined">download</span></button>
                    ${isViewer() ? '' : `<button class="btn-icon" data-action="upload-attachment" data-id="${expenseData.id}" data-field="${field}" title="Ganti"><span class="material-symbols-outlined">edit</span></button>`}
                    ${isViewer() ? '' : `<button class="btn-icon btn-icon-danger" data-action="delete-attachment" data-id="${expenseData.id}" data-field="${field}" title="Hapus"><span class="material-symbols-outlined">delete</span></button>`}
                </div>
            </div>`;
        }
        
        let uploadButtonsHTML = '';
        if (!isViewer() && expenseData.type === 'material') {
            const buttons = [];
            if (!expenseData.invoiceUrl) {
                buttons.push(`<button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="invoiceUrl">Upload Faktur</button>`);
            }
            if (!expenseData.deliveryOrderUrl) {
                buttons.push(`<button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="deliveryOrderUrl">Upload Surat Jalan</button>`);
            }
            if (buttons.length > 0) {
                uploadButtonsHTML = `<div class="rekap-actions" style="grid-template-columns: repeat(${buttons.length}, 1fr); margin-top: 1rem;">${buttons.join('')}</div>`;
            }
        }
    
    let attachmentsHTML = '';
    
    // 1. Logika untuk Tipe Material (tetap sama)
    if (expenseData.type === 'material') {
        const buttons = [];
        if (!isViewer()) {
            if (!expenseData.invoiceUrl) {
                buttons.push(`<button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="invoiceUrl">Upload Faktur</button>`);
            }
            if (!expenseData.deliveryOrderUrl) {
                buttons.push(`<button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="deliveryOrderUrl">Upload Surat Jalan</button>`);
            }
        }
        let uploadButtonsHTML = buttons.length > 0 
            ? `<div class="rekap-actions" style="grid-template-columns: repeat(${buttons.length}, 1fr); margin-top: 1rem;">${buttons.join('')}</div>`
            : '';

        attachmentsHTML = `
            <h5 class="detail-section-title">Lampiran</h5>
            <div class="attachment-gallery">
                ${createAttachmentItem(expenseData.invoiceUrl, 'Bukti Faktur', 'invoiceUrl')}
                ${createAttachmentItem(expenseData.deliveryOrderUrl, 'Surat Jalan', 'deliveryOrderUrl')}
            </div>
            ${uploadButtonsHTML}
        `;
    
    // 2. Logika BARU untuk Tipe Lainnya (Operasional, dll)
    } else if (expenseData.attachmentUrl) {
        attachmentsHTML = `
            <h5 class="detail-section-title">Lampiran</h5>
            <div class="attachment-gallery">
                ${createAttachmentItem(expenseData.attachmentUrl, 'Lampiran', 'attachmentUrl')}
            </div>
        `;
    
    // 3. Logika BARU jika lampiran belum ada untuk tipe non-material
    } else if (!isViewer()) {
         attachmentsHTML = `
            <h5 class="detail-section-title">Lampiran</h5>
            <div class="rekap-actions" style="grid-template-columns: 1fr; margin-top: 1rem;">
                <button class="btn btn-secondary" data-action="upload-attachment" data-id="${expenseData.id}" data-field="attachmentUrl">
                    Upload Lampiran
                </button>
            </div>
        `;
    }
            
        return `
            <div class="payment-summary">
                <div><span>Total Pengeluaran:</span><strong>${fmtIDR(expenseData.amount)}</strong></div>
                ${bill ? `
                <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
                ` : `<div class="status"><span>Status:</span><strong style="color:var(--success)">Lunas</strong></div>`}
            </div>
            ${itemsButtonHTML}
            ${attachmentsHTML}
        `;
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
            await Promise.all(urls.map(u => fetch(u, { mode: 'no-cors', cache: 'force-cache' }).catch(() => {})));
        } catch (_) {}
    }
    
    async function handleDeleteAttachment(dataset) {
        const { id, field } = dataset;
        
        createModal('confirmDeleteAttachment', {
            onConfirm: async () => {
                toast('syncing', 'Menghapus lampiran...');
                try {
                    // Tidak perlu menghapus file dari Cloudinary untuk menjaga kesederhanaan
                    // Cukup hapus URL dari Firestore
                    await updateDoc(doc(expensesCol, id), { [field]: '' });
                    await _logActivity(`Menghapus Lampiran`, { expenseId: id, field });
                    
                    toast('success', 'Lampiran berhasil dihapus.');
                    closeModal($('#dataDetail-modal'));
                    handleOpenBillDetail(null, id);
                } catch(error) {
                    toast('error', 'Gagal menghapus lampiran.');
                    console.error("Attachment deletion error:", error);
                }
            }
        });
    }

    function handleUploadAttachment(dataset) {
        const { id, field } = dataset;
        const uploader = $('#attachment-uploader');
        if (!uploader) return;
        uploader.value = '';

        uploader.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const downloadURL = await _uploadFileToCloudinary(file);
            if (downloadURL) {
                await updateDoc(doc(expensesCol, id), { [field]: downloadURL });
                closeModal($('#dataDetail-modal'));
                handleOpenBillDetail(null, id);
            }
        };
        uploader.click();
    }

    async function _downloadAttachment(url, filename) {
        try {
            const res = await fetch(url, { mode: 'cors' });
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
        if (!bill) { toast('error', 'Data tagihan tidak ditemukan.'); return; }
        
        const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
        
        const content = `
            <form id="payment-form" data-id="${billId}" data-type="bill">
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
        createModal('payment', { title: 'Form Pembayaran Tagihan', content, paymentType: 'bill' });
    }

    async function handleProcessBillPayment(form) {
        const billId = form.dataset.id;
        const amountToPay = parseFormattedNumber(form.elements.amount.value);
        const date = new Date(form.elements.date.value);

        if (amountToPay <= 0) {
            toast('error', 'Jumlah pembayaran harus lebih dari nol.'); return;
        }

        toast('syncing', 'Memproses pembayaran...');
        try {
            const billRef = doc(billsCol, billId);
            
            await runTransaction(db, async (transaction) => {
                const billSnap = await transaction.get(billRef);
                if (!billSnap.exists()) throw new Error("Tagihan tidak ditemukan");

                const billData = billSnap.data();
                const newPaidAmount = (billData.paidAmount || 0) + amountToPay;
                const isPaid = newPaidAmount >= billData.amount;
                
                transaction.update(billRef, {
                    paidAmount: increment(amountToPay),
                    status: isPaid ? 'paid' : 'unpaid',
                    ...(isPaid && { paidAt: serverTimestamp() })
                });

                if (isPaid && billData.expenseId) {
                    const expenseRef = doc(expensesCol, billData.expenseId);
                    transaction.update(expenseRef, { status: 'paid' });
                }

                const paymentRef = doc(collection(billRef, 'payments'));
                transaction.set(paymentRef, { amount: amountToPay, date, createdAt: serverTimestamp() });
            });
            await _logActivity(`Membayar Tagihan Cicilan`, { billId, amount: amountToPay });
            
            toast('success', 'Pembayaran berhasil dicatat.');
            if (appState.activePage === 'tagihan') renderTagihanPage();

        } catch (error) {
            toast('error', `Gagal memproses pembayaran.`);
            console.error('Bill Payment error:', error);
        }
    }

    // =======================================================
    //         FUNGSI-FUNGSI BARU UNTUK ABSENSI
    // =======================================================
    
    async function renderAbsensiPage() {
        const container = $('.page-container');
        const tabs = [
            {id:'manual', label:'Input Manual'},
            {id:'harian', label:'Absensi Harian'}, 
            {id:'rekap', label:'Rekap Gaji'}
        ];
        container.innerHTML = `
            ${isViewer() ? '' : `<div class="attendance-header">
                 <button class="btn" data-action="manage-master" data-type="workers">
                    <span class="material-symbols-outlined">engineering</span>
                    Pekerja
                </button>
                 <button class="btn" data-action="manage-master" data-type="professions">
                    <span class="material-symbols-outlined">badge</span>
                    Profesi
                </button>
            </div>`}
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;

        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('absensi', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            await Promise.all([
                fetchAndCacheData('workers', workersCol, 'workerName'),
                fetchAndCacheData('professions', professionsCol, 'professionName'),
                fetchAndCacheData('projects', projectsCol, 'projectName')
            ]);

            if(tabId === 'harian') {
                await _fetchTodaysAttendance();
                contentContainer.innerHTML = _getDailyAttendanceHTML();
                _initCustomSelects(contentContainer);
                contentContainer.querySelector('#attendance-profession-filter')?.addEventListener('change', () => _rerenderAttendanceList());
                contentContainer.querySelector('#attendance-project-id')?.addEventListener('change', () => _rerenderAttendanceList());

            } else if (tabId === 'rekap') {
                contentContainer.innerHTML = _getSalaryRecapHTML();
                if(!isViewer()) {
                    $('#generate-recap-btn')?.addEventListener('click', () => {
                        const startDate = $('#recap-start-date').value;
                        const endDate = $('#recap-end-date').value;
                        if (startDate && endDate) {
                            generateSalaryRecap(new Date(startDate), new Date(endDate));
                        } else {
                            toast('error', 'Silakan pilih rentang tanggal.');
                        }
                    });
                } else {
                     generateSalaryRecap(new Date(new Date().getFullYear(), new Date().getMonth(), 1), new Date());
                }
            } else if (tabId === 'manual') {
                contentContainer.innerHTML = _getManualAttendanceHTML();
                _initCustomSelects(contentContainer); 
                const dateInput = $('#manual-attendance-date');
                const projectInput = $('#manual-attendance-project');
                
                dateInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
                projectInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
                if(!isViewer()) $('#manual-attendance-form').addEventListener('submit', handleSaveManualAttendance);
                
                _renderManualAttendanceList(dateInput.value, projectInput.value);
            }
        };
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        const lastSubPage = appState.activeSubPage.get('absensi') || tabs[0].id;
        if($('.sub-nav-item.active')) $('.sub-nav-item.active').classList.remove('active');
        if($(`.sub-nav-item[data-tab="${lastSubPage}"]`)) $(`.sub-nav-item[data-tab="${lastSubPage}"]`).classList.add('active');
        await renderTabContent(lastSubPage);
    }
    
    function _getDailyAttendanceHTML() {
        const today = new Date().toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
        const projectOptions = appState.projects.map(p => ({value: p.id, text: p.projectName}));
        const professionOptions = [{value: 'all', text: 'Semua Profesi'}, ...appState.professions.map(p => ({value: p.id, text: p.professionName}))];

        let content;
        if (appState.workers.length === 0) {
            content = `<p class="empty-state">Belum ada data pekerja. Silakan tambahkan pekerja dan profesi terlebih dahulu.</p>`;
        } else {
             content = `<div class="attendance-grid" id="attendance-grid-container">${_renderAttendanceGrid()}</div>`;
        }

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

        const filteredWorkers = professionFilter === 'all' 
            ? activeWorkers
            : activeWorkers.filter(w => w.professionId === professionFilter);

        if (filteredWorkers.length === 0) {
            return `<p class="empty-state-small" style="grid-column: 1 / -1;">Tidak ada pekerja aktif dengan profesi yang dipilih.</p>`;
        }

        return filteredWorkers.map(worker => {
            const attendance = appState.attendance.get(worker.id);
            const profession = appState.professions.find(p => p.id === worker.professionId)?.professionName || 'Tanpa Profesi';
            const dailyWage = worker.projectWages?.[projectId] || 0;
            let statusHTML = '';
            const wageHTML = `<span class="worker-wage">${fmtIDR(dailyWage)} / hari</span>`;

            if (attendance) {
                const checkInTime = attendance.checkIn.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                const earnedPayHTML = attendance.totalPay ? `<strong> (${fmtIDR(attendance.totalPay)})</strong>` : '';

                if (attendance.status === 'checked_in') {
                    statusHTML = `
                        <div class="attendance-status checked-in">Masuk: ${checkInTime}</div>
                        ${isViewer() ? '' : `<button class="btn btn-danger" data-action="check-out" data-id="${attendance.id}">Check Out</button>`}
                    `;
                } else { // completed
                    const checkOutTime = attendance.checkOut.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    statusHTML = `
                        <div class="attendance-status">Masuk: ${checkInTime} | Keluar: ${checkOutTime}</div>
                        <div class="attendance-status completed">Total: ${attendance.workHours.toFixed(1)} jam ${earnedPayHTML}</div>
                        ${isViewer() ? '' : `<button class="btn-icon" data-action="edit-attendance" data-id="${attendance.id}" title="Edit Waktu"><span class="material-symbols-outlined">edit_calendar</span></button>`}
                    `;
                }
            } else {
                statusHTML = isViewer() ? '<div class="attendance-status">Belum Hadir</div>' : `<button class="btn btn-success" data-action="check-in" data-id="${worker.id}">Check In</button>`;
            }
            
            return `
                <div class="card attendance-card">
                    <div class="attendance-worker-info">
                        <strong>${worker.workerName}</strong>
                        <span>${profession}</span>
                        ${wageHTML}
                    </div>
                    <div class="attendance-actions">
                        ${statusHTML}
                    </div>
                </div>
            `;
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
            appState.attendance.set(data.workerId, { id: doc.id, ...data });
        });
    }

    async function handleCheckIn(workerId) {
        const projectId = $('#attendance-project-id')?.value;
        if(!projectId) {
            toast('error', 'Silakan pilih proyek terlebih dahulu.');
            return;
        }

        toast('syncing', 'Mencatat jam masuk...');
        try {
            const worker = appState.workers.find(w => w.id === workerId);
            if (!worker) throw new Error('Pekerja tidak ditemukan');
            
            const dailyWage = worker.projectWages?.[projectId] || 0;
            const hourlyWage = dailyWage / 8;

            await addDoc(attendanceRecordsCol, {
                workerId, projectId, workerName: worker.workerName, hourlyWage,
                date: Timestamp.now(), checkIn: Timestamp.now(), status: 'checked_in',
                type: 'timestamp', createdAt: serverTimestamp()
            });
            await _logActivity(`Check-in Pekerja: ${worker.workerName}`, { workerId, projectId });
            toast('success', `${worker.workerName} berhasil check in.`);
            _fetchTodaysAttendance().then(() => _rerenderAttendanceList());
        } catch (error) {
            toast('error', 'Gagal melakukan check in.');
            console.error(error);
        }
    }

    async function handleCheckOut(recordId) {
        toast('syncing', 'Mencatat jam keluar...');
        try {
            const recordRef = doc(attendanceRecordsCol, recordId);
            const recordSnap = await getDoc(recordRef);
            if (!recordSnap.exists()) throw new Error('Data absensi tidak ditemukan');

            const record = recordSnap.data();
            const checkOutTime = Timestamp.now();
            const checkInTime = record.checkIn;
            
            const hours = (checkOutTime.seconds - checkInTime.seconds) / 3600;
            const normalHours = Math.min(hours, 8);
            const overtimeHours = Math.max(0, hours - 8);
            
            const hourlyWage = record.hourlyWage || 0;
            const normalPay = normalHours * hourlyWage;
            const overtimePay = overtimeHours * hourlyWage * 1.5;
            const totalPay = normalPay + overtimePay;

            await updateDoc(recordRef, {
                checkOut: checkOutTime, status: 'completed',
                workHours: hours, normalHours, overtimeHours, totalPay, isPaid: false
            });
            await _logActivity(`Check-out Pekerja: ${record.workerName}`, { recordId, totalPay });
            toast('success', `${record.workerName} berhasil check out.`);
            _fetchTodaysAttendance().then(() => _rerenderAttendanceList());
        } catch (error) {
            toast('error', 'Gagal melakukan check out.');
            console.error(error);
        }
    }

    async function handleEditAttendanceModal(recordId) {
        const recordRef = doc(attendanceRecordsCol, recordId);
        const recordSnap = await getDoc(recordRef);
        if (!recordSnap.exists()) {
            toast('error', 'Data absensi tidak ditemukan.');
            return;
        }
        const record = recordSnap.data();
    
        const toTimeInput = (timestamp) => {
            return timestamp.toDate().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
        };
    
        const content = `
            <form id="edit-attendance-form" data-id="${recordId}">
                <p>Mengedit absensi untuk <strong>${record.workerName}</strong> pada tanggal ${record.date.toDate().toLocaleDateString('id-ID')}.</p>
                <div class="form-group">
                    <label>Waktu Check-in</label>
                    <input type="time" name="checkIn" value="${toTimeInput(record.checkIn)}" required>
                </div>
                 <div class="form-group">
                    <label>Waktu Check-out</label>
                    <input type="time" name="checkOut" value="${toTimeInput(record.checkOut)}" required>
                </div>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </form>
        `;
        createModal('editAttendance', { title: 'Edit Waktu Absensi', content });
    }

    async function handleUpdateAttendance(form) {
        const recordId = form.dataset.id;
        const newCheckInString = form.elements.checkIn.value;
        const newCheckOutString = form.elements.checkOut.value;
        
        toast('syncing', 'Memperbarui absensi...');
        try {
            const recordRef = doc(attendanceRecordsCol, recordId);
            const recordSnap = await getDoc(recordRef);
            if(!recordSnap.exists()) throw new Error('Record not found');
    
            const originalDate = recordSnap.data().date.toDate();
            const checkInTime = new Date(`${originalDate.toDateString()} ${newCheckInString}`);
            const checkOutTime = new Date(`${originalDate.toDateString()} ${newCheckOutString}`);
    
            if (checkOutTime <= checkInTime) {
                toast('error', 'Waktu check-out harus setelah check-in.');
                return;
            }
    
            const newCheckIn = Timestamp.fromDate(checkInTime);
            const newCheckOut = Timestamp.fromDate(checkOutTime);
    
            const hours = (newCheckOut.seconds - newCheckIn.seconds) / 3600;
            const normalHours = Math.min(hours, 8);
            const overtimeHours = Math.max(0, hours - 8);
            
            const hourlyWage = recordSnap.data().hourlyWage || 0;
            
            const normalPay = normalHours * hourlyWage;
            const overtimePay = overtimeHours * hourlyWage * 1.5;
            const totalPay = normalPay + overtimePay;
    
            await updateDoc(recordRef, {
                checkIn: newCheckIn, checkOut: newCheckOut,
                workHours: hours, normalHours, overtimeHours, totalPay
            });
            
            await _logActivity(`Memperbarui Absensi: ${recordSnap.data().workerName}`, { recordId, totalPay });
            toast('success', 'Absensi berhasil diperbarui.');
            _fetchTodaysAttendance().then(() => _rerenderAttendanceList());
        } catch (error) {
            toast('error', 'Gagal memperbarui absensi.');
            console.error(error);
        }
    }
    
    function _getSalaryRecapHTML() {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);
    
        return `
            <div class="card card-pad">
                <h5 class="section-title-owner" style="margin-top:0;">Pilih Periode Rekap</h5>
                <div class="recap-filters">
                    <div class="form-group">
                        <label>Tanggal Mulai</label>
                        <input type="date" id="recap-start-date" value="${firstDayOfMonth}" ${isViewer() ? 'disabled' : ''}>
                    </div>
                    <div class="form-group">
                        <label>Tanggal Selesai</label>
                        <input type="date" id="recap-end-date" value="${todayStr}" ${isViewer() ? 'disabled' : ''}>
                    </div>
                    ${isViewer() ? '' : '<button id="generate-recap-btn" class="btn btn-primary">Tampilkan Rekap</button>'}
                </div>
            </div>
            <div id="recap-results-container" style="margin-top: 1.5rem;">
                 <p class="empty-state-small">Pilih rentang tanggal dan klik "Tampilkan Rekap" untuk melihat hasilnya.</p>
            </div>
        `;
    }

    async function generateSalaryRecap(startDate, endDate) {
        const resultsContainer = $('#recap-results-container');
        if (!resultsContainer) return;
        resultsContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
        
        endDate.setHours(23, 59, 59, 999);
    
        const q = query(attendanceRecordsCol, 
            where('status', '==', 'completed'),
            where('isPaid', '==', false),
            where('date', '>=', startDate),
            where('date', '<=', endDate)
        );
        const snap = await getDocs(q);
    
        if (snap.empty) {
            resultsContainer.innerHTML = `<p class="empty-state">Tidak ada data gaji yang belum dibayar pada periode ini.</p>`;
            return;
        }
    
        const salaryRecap = new Map();
        snap.forEach(doc => {
            const record = { id: doc.id, ...doc.data() };
            const workerId = record.workerId;
    
            if (!salaryRecap.has(workerId)) {
                salaryRecap.set(workerId, {
                    workerName: record.workerName,
                    totalPay: 0,
                    recordIds: []
                });
            }
    
            const workerData = salaryRecap.get(workerId);
            workerData.totalPay += record.totalPay || 0;
            workerData.recordIds.push(record.id);
        });
    
        let tableHTML = `
            <div class="card card-pad">
                <div class="recap-table-wrapper">
                    <table class="recap-table">
                        <thead>
                            <tr>
                                <th>Nama Pekerja</th>
                                <th>Total Upah</th>
                                ${isViewer() ? '' : '<th>Aksi</th>'}
                            </tr>
                        </thead>
                        <tbody>
                            ${[...salaryRecap.entries()].map(([workerId, worker]) => `
                                <tr>
                                    <td>${worker.workerName}</td>
                                    <td><strong>${fmtIDR(worker.totalPay)}</strong></td>
                                    ${isViewer() ? '' : `<td class="recap-actions-cell">
                                        <button class="btn-icon" 
                                                title="Buat Tagihan"
                                                data-action="generate-salary-bill" 
                                                data-worker-id="${workerId}"
                                                data-worker-name="${worker.workerName}"
                                                data-total-pay="${worker.totalPay}"
                                                data-start-date="${startDate.toISOString().slice(0, 10)}"
                                                data-end-date="${endDate.toISOString().slice(0, 10)}"
                                                data-record-ids="${worker.recordIds.join(',')}"
                                                >
                                            <span class="material-symbols-outlined">request_quote</span>
                                        </button>
                                        <button class="btn-icon btn-icon-danger" 
                                                title="Hapus Rekap"
                                                data-action="delete-recap-item"
                                                data-record-ids="${worker.recordIds.join(',')}"
                                                >
                                            <span class="material-symbols-outlined">delete</span>
                                        </button>
                                    </td>`}
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        resultsContainer.innerHTML = tableHTML;
    }
    
    async function handleDeleteRecapItem(recordIdsCSV) {
        if (!recordIdsCSV) return;
        createModal('confirmDeleteRecap', {
            onConfirm: async () => {
                toast('syncing', 'Menghapus data absensi...');
                try {
                    const recordIds = recordIdsCSV.split(',');
                    const batch = writeBatch(db);
                    recordIds.forEach(id => {
                        batch.delete(doc(attendanceRecordsCol, id));
                    });
                    await batch.commit();
                    
                    await _logActivity(`Menghapus Rekap Gaji`, { count: recordIds.length });
                    toast('success', 'Data absensi terkait telah dihapus.');
                    
                    const startDate = $('#recap-start-date').value;
                    const endDate = $('#recap-end-date').value;
                    if (startDate && endDate) {
                        generateSalaryRecap(new Date(startDate), new Date(endDate));
                    }
                } catch (error) {
                    toast('error', 'Gagal menghapus data.');
                    console.error("Error deleting recap items:", error);
                }
            }
        });
    }

    async function handleGenerateSalaryBill(dataset) {
        const { workerId, workerName, totalPay, startDate, endDate, recordIds } = dataset;
        
        const description = `Gaji ${workerName} periode ${startDate} - ${endDate}`;
        const amount = Number(totalPay);
    
        createModal('confirmGenerateBill', {
            message: `Buat tagihan gaji sebesar ${fmtIDR(amount)} untuk ${workerName}?`,
            onConfirm: async () => {
                toast('syncing', 'Membuat tagihan gaji...');
                try {
                    // [LOGIKA BARU] Ambil projectId dari salah satu record absensi
                    const recordIdArray = recordIds.split(',');
                    if (recordIdArray.length === 0) {
                        toast('error', 'Tidak ada data absensi untuk diproses.');
                        return;
                    }
                    const firstRecordRef = doc(attendanceRecordsCol, recordIdArray[0]);
                    const firstRecordSnap = await getDoc(firstRecordRef);
                    const projectId = firstRecordSnap.exists() ? firstRecordSnap.data().projectId : null;
                    
                    if (!projectId) {
                        toast('error', 'Proyek untuk tagihan gaji ini tidak ditemukan.');
                        return;
                    }
                    // [AKHIR LOGIKA BARU]

                    const q = query(billsCol, where("description", "==", description), where("type", "==", "gaji"));
                    const existingBill = await getDocs(q);
                    if (!existingBill.empty) {
                        toast('error', 'Tagihan untuk periode & pekerja ini sudah ada.');
                        return;
                    }
    
                    const billRef = await addDoc(billsCol, {
                        description, amount, paidAmount: 0, dueDate: Timestamp.now(), status: 'unpaid',
                        type: 'gaji', workerId, recordIds: recordIds.split(','), createdAt: serverTimestamp(),
                        projectId: projectId // [TAMBAHAN] Simpan projectId ke dalam tagihan
                    });
                    
                    const batch = writeBatch(db);
                    recordIds.split(',').forEach(id => {
                        batch.update(doc(attendanceRecordsCol, id), { isPaid: true, billId: billRef.id });
                    });
                    
                    await batch.commit();
                    await _logActivity(`Membuat Tagihan Gaji: ${description}`, { billId: billRef.id, amount });
    
                    toast('success', 'Tagihan gaji berhasil dibuat.');
                    const startDateValue = $('#recap-start-date').value;
                    const endDateValue = $('#recap-end-date').value;
                    if (startDateValue && endDateValue) {
                        generateSalaryRecap(new Date(startDateValue), new Date(endDateValue));
                    }
    
                } catch(error) {
                    toast('error', 'Gagal membuat tagihan gaji.');
                    console.error('Error generating salary bill:', error);
                }
            }
        });
    }

    function _getManualAttendanceHTML() {
        const today = new Date().toISOString().slice(0,10);
        const projectOptions = appState.projects.map(p => ({value: p.id, text: p.projectName}));

        return `
            <form id="manual-attendance-form">
                <div class="card card-pad">
                    <div class="recap-filters">
                        <div class="form-group">
                            <label for="manual-attendance-date">Tanggal</label>
                            <input type="date" id="manual-attendance-date" value="${today}" required ${isViewer() ? 'disabled' : ''}>
                        </div>
                        ${createMasterDataSelect('manual-attendance-project', 'Proyek', projectOptions, appState.projects[0]?.id || '')}
                    </div>
                </div>
                <div id="manual-attendance-list-container" style="margin-top: 1.5rem;"></div>
                ${isViewer() ? '' : `<div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">Simpan Absensi</button>
                </div>`}
            </form>
        `;
    }

    async function _renderManualAttendanceList(dateStr, projectId) {
        const container = $('#manual-attendance-list-container');
        if (!dateStr || !projectId) {
            container.innerHTML = `<p class="empty-state-small">Pilih tanggal dan proyek untuk memulai.</p>`;
            return;
        }
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;

        const date = new Date(dateStr);
        const startOfDay = new Date(date.setHours(0,0,0,0));
        const endOfDay = new Date(date.setHours(23,59,59,999));

        const q = query(attendanceRecordsCol, 
            where('projectId', '==', projectId),
            where('date', '>=', startOfDay),
            where('date', '<=', endOfDay),
            where('type', '==', 'manual')
        );
        const snap = await getDocs(q);
        const existingRecords = new Map(snap.docs.map(d => [d.data().workerId, d.data()]));
        
        const activeWorkers = appState.workers.filter(w => w.status === 'active');

        if(activeWorkers.length === 0) {
            container.innerHTML = `<p class="empty-state">Tidak ada pekerja aktif.</p>`;
            return;
        }

        const listHTML = activeWorkers.map(worker => {
            const dailyWage = worker.projectWages?.[projectId] || 0;
            const existing = existingRecords.get(worker.id);
            const currentStatus = existing?.attendanceStatus || 'absent';
            let currentPay = 0;
            if(currentStatus === 'full_day') currentPay = dailyWage;
            else if(currentStatus === 'half_day') currentPay = dailyWage / 2;
            
            return `
                <div class="manual-attendance-item card" data-daily-wage="${dailyWage}">
                    <div class="worker-info">
                        <strong>${worker.workerName}</strong>
                        <span class="worker-wage" data-pay="${currentPay}">${fmtIDR(currentPay)}</span>
                    </div>
                    <div class="attendance-status-selector" data-worker-id="${worker.id}">
                        <label>
                            <input type="radio" name="status_${worker.id}" value="full_day" ${currentStatus === 'full_day' ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                            <span>Hadir</span>
                        </label>
                        <label>
                            <input type="radio" name="status_${worker.id}" value="half_day" ${currentStatus === 'half_day' ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                            <span>1/2 Hari</span>
                        </label>
                        <label>
                            <input type="radio" name="status_${worker.id}" value="absent" ${currentStatus === 'absent' ? 'checked' : ''} ${isViewer() ? 'disabled' : ''}>
                            <span>Absen</span>
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = listHTML;

        if(!isViewer()) {
            container.querySelectorAll('.attendance-status-selector input[type="radio"]').forEach(radio => {
                radio.addEventListener('change', (e) => {
                    const card = e.target.closest('.manual-attendance-item');
                    const wageEl = card.querySelector('.worker-wage');
                    const dailyWage = Number(card.dataset.dailyWage);
                    let newPay = 0;
                    if(e.target.value === 'full_day') newPay = dailyWage;
                    else if (e.target.value === 'half_day') newPay = dailyWage / 2;
                    
                    wageEl.textContent = fmtIDR(newPay);
                    wageEl.dataset.pay = newPay;
                });
            });
        }
    }

    async function handleSaveManualAttendance(e) {
        e.preventDefault();
        const form = e.target;
        const date = new Date(form.querySelector('#manual-attendance-date').value);
        const projectId = form.querySelector('#manual-attendance-project').value;

        if (!projectId) {
            toast('error', 'Proyek harus dipilih.'); return;
        }

        toast('syncing', 'Menyimpan absensi...');
        try {
            const batch = writeBatch(db);
            const workers = $$('.attendance-status-selector', form);

            for(const workerEl of workers) {
                const workerId = workerEl.dataset.workerId;
                const statusInput = workerEl.querySelector('input:checked');
                if (!statusInput) continue;
                
                const status = statusInput.value;
                const worker = appState.workers.find(w => w.id === workerId);
                const dailyWage = worker?.projectWages?.[projectId] || 0;
                const pay = Number(workerEl.closest('.manual-attendance-item').querySelector('.worker-wage').dataset.pay);

                const recordData = {
                    workerId, workerName: worker.workerName, projectId,
                    date: Timestamp.fromDate(date), attendanceStatus: status, totalPay: pay,
                    dailyWage, isPaid: false, type: 'manual', createdAt: serverTimestamp(),
                    status: 'completed',
                };

                const startOfDay = new Date(date); startOfDay.setHours(0,0,0,0);
                const endOfDay = new Date(date); endOfDay.setHours(23,59,59,999);

                const q = query(attendanceRecordsCol, 
                    where('workerId', '==', workerId), where('projectId', '==', projectId),
                    where('date', '>=', startOfDay), where('date', '<=', endOfDay),
                    where('type', '==', 'manual')
                );
                
                const snap = await getDocs(q);
                if (snap.empty) {
                    if (status !== 'absent') batch.set(doc(attendanceRecordsCol), recordData);
                } else {
                    if (status === 'absent') batch.delete(snap.docs[0].ref);
                    else batch.update(snap.docs[0].ref, recordData);
                }
            }

            await batch.commit();
            await _logActivity(`Menyimpan Absensi Manual`, { date: date.toISOString().slice(0,10), projectId });
            toast('success', 'Absensi berhasil disimpan.');
        } catch (error) {
            toast('error', 'Gagal menyimpan absensi.');
            console.error(error);
        }
    }

// GANTI SELURUH FUNGSI handleManageUsers DI script.js
async function handleManageUsers() {
    toast('syncing', 'Memuat data pengguna...');
    try {
        const pendingQuery = query(membersCol, where("status", "==", "pending"));
        const pendingSnap = await getDocs(pendingQuery);
        const pendingUsers = pendingSnap.docs.map(d => ({ id: d.id, ...d.data() }));

        const otherUsersQuery = query(membersCol, where("status", "!=", "pending"));
        const otherUsersSnap = await getDocs(otherUsersQuery);
        const otherUsers = otherUsersSnap.docs.map(d => ({ id: d.id, ...d.data() }));

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
                     ${user.status === 'pending' ? `
                        <button class="btn-icon btn-icon-success" data-action="user-action" data-id="${user.id}" data-type="approve" title="Setujui"><span class="material-symbols-outlined">check_circle</span></button>
                        <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Tolak/Hapus"><span class="material-symbols-outlined">cancel</span></button>
                    ` : ''}
                    ${user.status === 'active' && user.role !== 'Owner' ? `
                        ${user.role !== 'Editor' ? `<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-editor" title="Jadikan Editor"><span class="material-symbols-outlined">edit_note</span></button>`:''}
                        ${user.role !== 'Viewer' ? `<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-viewer" title="Jadikan Viewer"><span class="material-symbols-outlined">visibility</span></button>`:''}
                        <button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                    `: ''}
                </div>
            </div>`;
        };
    
        const pendingUsersHTML = pendingUsers.length > 0
            ? `<h5 class="detail-section-title" style="margin-top: 0;">Menunggu Persetujuan</h5>${pendingUsers.map(createUserHTML).join('')}`
            : '';
    
        const otherUsersSorted = otherUsers.sort((a, b) => (a.role === 'Owner' ? -1 : 1));
        const otherUsersHTML = otherUsers.length > 0
            ? `<h5 class="detail-section-title" style="${pendingUsers.length > 0 ? '' : 'margin-top: 0;'}">Pengguna Terdaftar</h5>${otherUsersSorted.map(createUserHTML).join('')}`
            : '';
    
        const noUsersHTML = appState.users.length === 0 ? '<p class="empty-state-small">Tidak ada pengguna lain.</p>' : '';
    
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
        const { id, type } = dataset;
        const user = appState.users.find(u => u.id === id);
        if (!user) return;
        
        const actionMap = {
            'approve': { message: `Setujui <strong>${user.name}</strong> sebagai Viewer?`, data: { status: 'active', role: 'Viewer' } },
            'make-editor': { message: `Ubah peran <strong>${user.name}</strong> menjadi Editor?`, data: { role: 'Editor' } },
            'make-viewer': { message: `Ubah peran <strong>${user.name}</strong> menjadi Viewer?`, data: { role: 'Viewer' } },
            'delete': { message: `Hapus atau tolak pengguna <strong>${user.name}</strong>? Aksi ini tidak dapat dibatalkan.`, data: null }
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
                    await _logActivity(`Aksi Pengguna: ${type}`, { targetUserId: id, targetUserName: user.name });
                    toast('success', 'Aksi berhasil dilakukan.');
                    handleManageUsers();
                } catch (error) {
                    toast('error', 'Gagal memproses aksi.');
                    console.error('User action error:', error);
                }
            }
        });
    }

    // =======================================================
    //         HALAMAN LAPORAN & LOG
    // =======================================================
    async function renderLaporanPage() {
        const container = $('.page-container');
        if (typeof Chart === 'undefined') {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            document.head.appendChild(script);
            await new Promise(resolve => script.onload = resolve);
        }
    
        const tabs = [{id:'laba_rugi', label:'Laba Rugi'}, {id:'arus_kas', label:'Arus Kas'}, {id:'anggaran', label:'Anggaran'}, {id:'rekapan', label:'Rekapan'}];
        container.innerHTML = `
            <div class="card card-pad" style="margin-bottom: 1.5rem;">
                <h5 class="section-title-owner" style="margin-top:0;">Ringkasan Keuangan</h5>
                <div style="height: 220px; position: relative;"><canvas id="financial-summary-chart"></canvas></div>
            </div>
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"></div>
        `;
    
        const renderTabContent = async (tabId) => {
            appState.activeSubPage.set('laporan', tabId);
            const contentContainer = $('#sub-page-content');
            contentContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
            
            if (tabId === 'laba_rugi') await _renderLaporanLabaRugi(contentContainer);
            else if (tabId === 'arus_kas') await _renderLaporanArusKas(contentContainer);
            else if (tabId === 'anggaran') await _renderLaporanAnggaran(contentContainer);
            else if (tabId === 'rekapan') await _renderLaporanRekapan(contentContainer);
        };
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
        
        const lastSubPage = appState.activeSubPage.get('laporan') || tabs[0].id;
        $(`.sub-nav-item[data-tab="${lastSubPage}"]`).classList.add('active');
        await renderTabContent(lastSubPage);
        _renderFinancialSummaryChart(); 
    }

    async function _renderFinancialSummaryChart() {
        const canvas = $('#financial-summary-chart');
        if (!canvas) return;

        await Promise.all([ fetchAndCacheData('projects', projectsCol), fetchAndCacheData('incomes', incomesCol), fetchAndCacheData('expenses', expensesCol), fetchAndCacheData('fundingSources', fundingSourcesCol) ]);

        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        const pureIncome = appState.incomes.filter(inc => inc.projectId === mainProject?.id).reduce((sum, inc) => sum + inc.amount, 0);
        const totalExpenses = appState.expenses.reduce((sum, exp) => sum + exp.amount, 0);
        const totalFunding = appState.fundingSources.reduce((sum, fund) => sum + fund.totalAmount, 0);

        const ctx = canvas.getContext('2d');
        if (window.financialChart) window.financialChart.destroy();
        
        const textColor = getComputedStyle(document.body).getPropertyValue('--text').trim();

        window.financialChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Pemasukan Murni', 'Pengeluaran', 'Pendanaan'],
                datasets: [{ data: [pureIncome, totalExpenses, totalFunding], backgroundColor: ['#28a745', '#f87171', '#ffca2c'], borderWidth: 0 }]
            },
            options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12, padding: 20, font: { weight: '500' } } } } }
        });
    }

    async function _renderLaporanLabaRugi(container) {
        const mainProject = appState.projects.find(p => p.projectType === 'main_income');
        // [LOGIKA DIPERBARUI] Proyek internal adalah semua proyek yang BUKAN proyek utama.
        const internalProjects = appState.projects.filter(p => p.id !== mainProject?.id);
        
        const pendapatan = appState.incomes.filter(i => i.projectId === mainProject?.id).reduce((sum, i) => sum + i.amount, 0);
        const hpp_material = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'material').reduce((sum, e) => sum + e.amount, 0);
        
        // [PERBAIKAN] Ambil data 'bills' terbaru langsung dari Firestore sebelum kalkulasi
        const billsSnap = await getDocs(query(billsCol));
        const allBills = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        const paidSalaryBills = allBills.filter(b => b.type === 'gaji' && b.status === 'paid');
        
        const hpp_gaji = paidSalaryBills
            .filter(b => b.projectId === mainProject?.id) // Gaji yang masuk HPP hanya dari proyek utama
            .reduce((sum, b) => sum + b.amount, 0);
            
        const bebanGajiInternal = paidSalaryBills
            .filter(b => internalProjects.some(p => p.id === b.projectId)) // Gaji yang masuk beban internal
            .reduce((sum, b) => sum + b.amount, 0);

        const hpp = hpp_material + hpp_gaji;
        const labaKotor = pendapatan - hpp;
        const bebanOperasional = appState.expenses.filter(e => e.projectId === mainProject?.id && e.type === 'operasional').reduce((sum, e) => sum + e.amount, 0);
        
        // Gabungkan beban internal dari 'expenses' dan dari gaji 'bills'
        const bebanExpenseInternal = appState.expenses.filter(e => internalProjects.some(p => p.id === e.projectId)).reduce((sum, e) => sum + e.amount, 0);
        const bebanInternal = bebanExpenseInternal + bebanGajiInternal;

        const labaBersih = labaKotor - bebanOperasional - bebanInternal;

        container.innerHTML = `
        <div class="card card-pad">
            <h5 class="report-title">Laporan Laba Rugi</h5>
            <dl class="detail-list">
                <div><dt>Pendapatan</dt><dd class="positive">${fmtIDR(pendapatan)}</dd></div>
                <div><dt>Harga Pokok Penjualan (HPP)</dt><dd class="negative">- ${fmtIDR(hpp)}</dd></div>
                <div class="summary-row"><dt>Laba Kotor</dt><dd>${fmtIDR(labaKotor)}</dd></div>
                <div><dt>Beban Operasional</dt><dd class="negative">- ${fmtIDR(bebanOperasional)}</dd></div>
                <div><dt>Beban Proyek Internal</dt><dd class="negative">- ${fmtIDR(bebanInternal)}</dd></div>
                <div class="summary-row final"><dt>Laba Bersih</dt><dd>${fmtIDR(labaBersih)}</dd></div>
            </dl>
        </div>`;
    }

    async function _renderLaporanArusKas(container) {
        const kasMasukTermin = appState.incomes.reduce((sum, i) => sum + i.amount, 0);
        const kasMasukPinjaman = appState.fundingSources.reduce((sum, f) => sum + f.totalAmount, 0);
        const totalKasMasuk = kasMasukTermin + kasMasukPinjaman;
        const kasKeluarBayar = appState.expenses.filter(e=>e.status === 'paid').reduce((sum, e) => sum + e.amount, 0);
        const totalKasKeluar = kasKeluarBayar;
        const arusKasBersih = totalKasMasuk - totalKasKeluar;

         container.innerHTML = `
        <div class="card card-pad">
            <h5 class="report-title">Laporan Arus Kas</h5>
            <dl class="detail-list">
                <div class="category-title"><dt>Arus Kas Masuk</dt><dd></dd></div>
                <div><dt>Penerimaan Termin</dt><dd class="positive">${fmtIDR(kasMasukTermin)}</dd></div>
                <div><dt>Penerimaan Pinjaman</dt><dd class="positive">${fmtIDR(kasMasukPinjaman)}</dd></div>
                <div class="summary-row"><dt>Total Arus Kas Masuk</dt><dd>${fmtIDR(totalKasMasuk)}</dd></div>
                
                <div class="category-title"><dt>Arus Kas Keluar</dt><dd></dd></div>
                <div><dt>Pembayaran Beban Lunas</dt><dd class="negative">- ${fmtIDR(kasKeluarBayar)}</dd></div>
                <div class="summary-row"><dt>Total Arus Kas Keluar</dt><dd class="negative">- ${fmtIDR(totalKasKeluar)}</dd></div>
                
                <div class="summary-row final"><dt>Arus Kas Bersih</dt><dd>${fmtIDR(arusKasBersih)}</dd></div>
            </dl>
        </div>`;
    }

    async function _renderLaporanAnggaran(container) {
        const projectsWithBudget = appState.projects.filter(p => p.budget && p.budget > 0);
        
        if (projectsWithBudget.length === 0) {
            container.innerHTML = `<p class="empty-state">Belum ada proyek dengan anggaran yang ditetapkan.</p>`;
            return;
        }

        const reportData = projectsWithBudget.map(proj => {
            const actual = appState.expenses.filter(e => e.projectId === proj.id).reduce((sum, e) => sum + e.amount, 0);
            const variance = proj.budget - actual;
            const percentage = (actual / proj.budget) * 100;
            return { ...proj, actual, variance, percentage };
        });

        container.innerHTML = `
        <div class="card card-pad">
            <h5 class="report-title">Laporan Anggaran vs Aktual</h5>
            <div class="recap-table-wrapper">
                <table class="recap-table">
                    <thead>
                        <tr><th>Proyek</th><th>Anggaran</th><th>Aktual</th><th>Varian</th><th>Penggunaan</th></tr>
                    </thead>
                    <tbody>
                    ${reportData.map(d => `
                        <tr>
                            <td>${d.projectName}</td>
                            <td>${fmtIDR(d.budget)}</td>
                            <td>${fmtIDR(d.actual)}</td>
                            <td class="${d.variance >= 0 ? 'positive' : 'negative'}">${fmtIDR(d.variance)}</td>
                            <td>
                                <div class="progress-bar-container">
                                    <div class="progress-bar" style="width: ${Math.min(d.percentage, 100)}%; background-color: ${d.percentage > 100 ? 'var(--danger)' : 'var(--info)'};"></div>
                                </div>
                                <span>${d.percentage.toFixed(1)}%</span>
                            </td>
                        </tr>
                    `).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    async function _renderLaporanRekapan(container) {
        const projectOptions = [{value:'all', text: 'Semua Proyek'}, ...appState.projects.map(p => ({value: p.id, text: p.projectName}))];
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10);
        const todayStr = today.toISOString().slice(0, 10);

        container.innerHTML = `
            <div class="card card-pad">
                <h5 class="report-title">Rekapan Transaksi</h5>
                <div class="rekap-filters">
                    ${createMasterDataSelect('rekapan-project', 'Proyek', projectOptions, 'all')}
                    <div class="form-group">
                        <label>Dari Tanggal</label>
                        <input type="date" id="rekapan-start-date" value="${firstDayOfMonth}">
                    </div>
                     <div class="form-group">
                        <label>Sampai Tanggal</label>
                        <input type="date" id="rekapan-end-date" value="${todayStr}">
                    </div>
                </div>
                <div class="rekap-actions">
                    <button id="generate-rekapan-btn" class="btn btn-primary"><span class="material-symbols-outlined">summarize</span> Tampilkan</button>
                    <button data-action="download-csv" class="btn btn-secondary"><span class="material-symbols-outlined">description</span> Unduh CSV</button>
                    <button data-action="download-report" class="btn btn-secondary"><span class="material-symbols-outlined">picture_as_pdf</span> Unduh PDF</button>
                </div>
            </div>
            <div id="rekapan-results-container" style="margin-top: 1.5rem;"></div>
        `;
        
        $('#generate-rekapan-btn').addEventListener('click', _generateRekapanReport);
    }

    async function _generateRekapanReport() {
        const container = $('#rekapan-results-container');
        container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        const projectId = $('#rekapan-project').value;
        const startDate = new Date($('#rekapan-start-date').value);
        const endDate = new Date($('#rekapan-end-date').value);
        endDate.setHours(23, 59, 59, 999);

        let transactions = [];
        appState.incomes.forEach(i => transactions.push({ date: i.date.toDate(), type: 'Pemasukan', description: 'Penerimaan Termin', amount: i.amount, projectId: i.projectId }));
        appState.expenses.forEach(e => transactions.push({ date: e.date.toDate(), type: 'Pengeluaran', description: e.description, amount: -e.amount, projectId: e.projectId }));

        const filtered = transactions.filter(t => (projectId === 'all' || t.projectId === projectId) && (t.date >= startDate && t.date <= endDate));

        if (filtered.length === 0) {
            container.innerHTML = `<p class="empty-state">Tidak ada transaksi pada periode dan proyek yang dipilih.</p>`;
            return;
        }

        filtered.sort((a, b) => a.date - b.date);
        let balance = 0;
        const processed = filtered.map(t => { balance += t.amount; return {...t, balance}; });
        
        const totalPemasukan = processed.filter(t=>t.amount > 0).reduce((sum, t)=>sum+t.amount, 0);
        const totalPengeluaran = processed.filter(t=>t.amount < 0).reduce((sum, t)=>sum+t.amount, 0);

        const tableHTML = `
            <div class="card card-pad" id="rekapan-printable-area">
                <h5 class="report-title">Rekapan Periode ${startDate.toLocaleDateString('id-ID')} - ${endDate.toLocaleDateString('id-ID')}</h5>
                <div class="recap-table-wrapper">
                    <table class="recap-table">
                        <thead>
                            <tr><th>Tanggal</th><th>Deskripsi</th><th>Pemasukan</th><th>Pengeluaran</th><th>Saldo</th></tr>
                        </thead>
                        <tbody>
                            ${processed.map(t => `
                                <tr>
                                    <td>${t.date.toLocaleDateString('id-ID')}</td><td>${t.description}</td>
                                    <td class="positive">${t.amount > 0 ? fmtIDR(t.amount) : '-'}</td>
                                    <td class="negative">${t.amount < 0 ? fmtIDR(t.amount) : '-'}</td>
                                    <td>${fmtIDR(t.balance)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                        <tfoot>
                             <tr>
                                <td colspan="2"><strong>Total</strong></td>
                                <td class="positive"><strong>${fmtIDR(totalPemasukan)}</strong></td>
                                <td class="negative"><strong>${fmtIDR(totalPengeluaran)}</strong></td>
                                <td><strong>${fmtIDR(balance)}</strong></td>
                             </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
        container.innerHTML = tableHTML;
    }

    async function _handleDownloadReport(format) {
        const reportArea = $('#rekapan-results-container');
        if (!reportArea.querySelector('table')) {
            toast('error', 'Silakan tampilkan laporan terlebih dahulu.'); return;
        }
        
        const rows = Array.from(reportArea.querySelectorAll('tbody tr'));
        const foot = Array.from(reportArea.querySelectorAll('tfoot tr'));
        if(rows.length === 0) {
            toast('error', 'Tidak ada data untuk diunduh.'); return;
        }
    
        const headers = ["Tanggal", "Deskripsi", "Pemasukan", "Pengeluaran", "Saldo"];
        
        const data = rows.map(row => {
            const cols = row.querySelectorAll('td');
            if (cols.length < 5) return ['', '', '', '', '']; 
            return Array.from(cols).map(col => `"${(col.textContent || '').trim()}"`);
        });
    
        if (foot.length > 0) {
            foot.forEach(row => {
                const cols = row.querySelectorAll('td');
                if (cols.length === 4 && cols[0].getAttribute('colspan') === '2') {
                     data.push([
                        `"${(cols[0].textContent || '').trim()}"`, 
                        '""', 
                        `"${(cols[1].textContent || '').trim()}"`,
                        `"${(cols[2].textContent || '').trim()}"`,
                        `"${(cols[3].textContent || '').trim()}"`
                    ]);
                }
            });
        }
    
        const date = new Date().toISOString().slice(0, 10);
        const filename = `Rekapan-Transaksi-${date}`;
        
        if (format === 'csv') {
            _downloadCSV(headers, data, filename + '.csv');
        } else { // pdf
            const pdfData = data.map(row => row.map(cell => cell.replace(/"/g, '')));
            _downloadPDF(headers, pdfData, filename + '.pdf');
        }
    }

    function _downloadCSV(headers, data, filename) {
        const csvContent = "data:text/csv;charset=utf-8," 
            + [headers.join(","), ...data.map(e => e.join(","))].join("\n");
            
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        toast('success', 'CSV berhasil diunduh!');
    }

    function _downloadPDF(headers, data, filename) {
        toast('syncing', 'Membuat PDF...');
        if (typeof window.jspdf === 'undefined' || typeof window.jspdf.jsPDF.autoTable === 'undefined') {
            toast('error', 'Pustaka PDF gagal dimuat. Coba muat ulang halaman.');
            console.error('jsPDF atau autoTable tidak ditemukan.');
            return;
        }

        const { jsPDF } = window.jspdf;
        const pdf = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

        pdf.autoTable({
            head: [headers],
            body: data,
            styles: {
                fillColor: [35, 39, 45],
                textColor: [225, 227, 230],
                lineColor: [58, 65, 74],
                lineWidth: 0.5
            },
            headStyles: { fillColor: [0, 128, 64] }
        });

        pdf.save(filename);
        toast('success', 'PDF berhasil dibuat!');
    }
    
    async function renderLogAktivitasPage() {
        const container = $('.page-container');
        container.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';

        const q = query(logsCol, orderBy("createdAt", "desc"));
        const logSnap = await getDocs(q);
        const logs = logSnap.docs.map(d => ({id: d.id, ...d.data()}));

        if (logs.length === 0) {
            container.innerHTML = '<p class="empty-state">Belum ada aktivitas yang tercatat.</p>';
            return;
        }

        const logHTML = logs.map(log => {
            const date = log.createdAt.toDate();
            const time = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const day = date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

            return `
                <div class="log-item">
                    <div class="log-item-header">
                        <strong class="log-user">${log.userName}</strong>
                        <span class="log-time">${day}, ${time}</span>
                    </div>
                    <p class="log-action">${log.action}</p>
                </div>
            `;
        }).join('');

        container.innerHTML = `<div class="log-container">${logHTML}</div>`;
    }

    async function syncOfflineData() {
        if (appState.isSyncing || !appState.isOnline) return;

        const offlineItems = await offlineDB.offlineQueue.toArray();
        if (offlineItems.length === 0) {
            hideToast();
            return;
        }

        appState.isSyncing = true;
        toast('syncing', `Menyinkronkan ${offlineItems.length} data...`);
        let successCount = 0;

        for (const item of offlineItems) {
            try {
                if (item.type === 'add-expense') {
                    // Catatan: File yang dipilih saat offline tidak akan ikut tersinkronisasi
                    // Ini adalah kompromi agar fitur online berjalan sempurna terlebih dahulu.
                    item.payload.invoiceUrl = '';
                    item.payload.deliveryOrderUrl = '';
                    
                    const expenseDocRef = await addDoc(expensesCol, item.payload);
                    const status = item.payload.status || 'unpaid';
                    
                    await addDoc(billsCol, {
                        expenseId: expenseDocRef.id, description: item.payload.description,
                        amount: item.payload.amount, paidAmount: status === 'paid' ? item.payload.amount : 0,
                        dueDate: item.payload.date, status: status, type: item.payload.type,
                        projectId: item.payload.projectId, createdAt: serverTimestamp(),
                        ...(status === 'paid' && { paidAt: serverTimestamp() })
                    });
                }

                await offlineDB.offlineQueue.delete(item.id);
                successCount++;
            } catch (error) {
                console.error('Gagal menyinkronkan item:', item, error);
            }
        }
        
        appState.isSyncing = false;
        if (successCount > 0) {
            toast('success', `${successCount} data berhasil disinkronkan.`);
            renderPageContent();
        } else if (offlineItems.length > 0) {
            toast('error', 'Gagal menyinkronkan beberapa data.');
        } else {
            hideToast();
        }
    }
    

    init();
}

main();