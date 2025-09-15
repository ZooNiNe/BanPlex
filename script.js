/* global Chart, html2canvas, jspdf */
// @ts-check

// =======================================================
//                       IMPORT PUSTAKA
// =======================================================
// Pustaka Pihak Ketiga (diasumsikan dimuat dari index.html)
const Chart = window.Chart;
const html2canvas = window.html2canvas;
const jspdf = window.jspdf;

// Impor Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot,
    query, limit, getDocs, addDoc, orderBy, Timestamp, deleteDoc, where, runTransaction,
    writeBatch, enableNetwork, disableNetwork, enableIndexedDbPersistence
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

document.addEventListener('DOMContentLoaded', async () => {

    // =======================================================
    //                KONFIGURASI & STATE GLOBAL
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

    const appState = {
        currentUser: null,
        userRole: 'Guest',
        userStatus: null,
        activePage: localStorage.getItem('lastActivePage') || 'dashboard',
        isOffline: !navigator.onLine,
        projects: [],
        workers: [],
        stockItems: [],
        materials: [],
        suppliers: [],
        teamMembers: [], 
        notifications: [],
        unsubscribers: [], 
        currentInvoiceItems: [],
        cachedData: new Map(),
        fundingCreditors: [],
        expenditureCreditors: { operasional: [], material: [], lainnya: [] },
        digitalEnvelopes: null,
        attendanceDate: new Date().toISOString().slice(0, 10),
        reports: { financialChart: null },
        cachedSuggestions: { itemNames: new Set() },
    };

    // =======================================================
    //               INISIALISASI FIREBASE & PWA
    // =======================================================
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    let db = getFirestore(app);
    const storage = getStorage(app);

    try {
        enableNetwork(db);
        await enableIndexedDbPersistence(db);
        console.log("Firestore offline persistence enabled.");
    } catch (err) {
        if (err && (err.code === 'failed-precondition' || err.code === 'unimplemented')) {
            console.warn("IndexedDB persistence not available or multiple tabs open. Continuing without persistence.");
        } else {
            console.error("Error enabling Firestore persistence: ", err);
        }
    }
    
    const host = location.hostname;
    const isDevHost = host === 'localhost' || host === '127.0.0.1';
    if ('serviceWorker' in navigator && !isDevHost) {
        navigator.serviceWorker.register('./service-worker.js')
            .then(registration => {
                console.log('Service Worker registered');
                registration.addEventListener('updatefound', () => {
                    const newWorker = registration.installing;
                    newWorker.addEventListener('statechange', () => {
                        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                            showUpdateToast(registration);
                        }
                    });
                });
            }).catch(error => console.log('Service Worker registration failed:', error));
        
        let refreshing;
        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (refreshing) return;
            window.location.reload();
            refreshing = true;
        });
    }

    // =======================================================
    //            HELPER & UTILITAS (DIPERTAHANKAN)
    // =======================================================
    const $ = (s, context = document) => context.querySelector(s);
    const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));
    const fmtIDR = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const todayStr = (date = new Date()) => date.toISOString().slice(0, 10);
    const getNumericValue = (s) => s ? parseFloat(String(s).replace(/\./g, '').replace(',', '.')) : 0;
    
    function formatRupiahInput(inputElement) {
        if (!inputElement) return;
        inputElement.addEventListener('input', function(e) {
            let value = e.target.value.replace(/[^,\d]/g, '').toString();
            const split = value.split(',');
            let rupiah = split[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            e.target.value = split[1] !== undefined ? rupiah + ',' + split[1] : rupiah;
        });
    }

    async function compressImage(file, { quality = 0.75, maxWidth = 1280 }) {
        return new Promise((resolve, reject) => {
            const image = new Image();
            image.src = URL.createObjectURL(file);
            image.onload = () => {
                const canvas = document.createElement('canvas');
                const scale = Math.min(1, maxWidth / image.width);
                canvas.width = image.width * scale;
                canvas.height = image.height * scale;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error('Could not get canvas context'));
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
                canvas.toBlob(blob => {
                    if (blob) {
                        resolve(new File([blob], file.name, { type: 'image/jpeg', lastModified: Date.now() }));
                    } else {
                        reject(new Error('Canvas to Blob conversion failed'));
                    }
                }, 'image/jpeg', quality);
            };
            image.onerror = reject;
        });
    }

    function createCustomSelect(selectElement) {
        if (!selectElement) return;
        const oldWrapper = selectElement.closest('.custom-select-wrapper');
        if (oldWrapper) { oldWrapper.parentNode.insertBefore(selectElement, oldWrapper); oldWrapper.remove(); }
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-select-wrapper';
        selectElement.parentNode.insertBefore(wrapper, selectElement);
        wrapper.appendChild(selectElement);
        selectElement.classList.add('hidden');
        const trigger = document.createElement('div');
        trigger.className = 'custom-select-trigger';
        wrapper.appendChild(trigger);
        const optionsContainer = document.createElement('div');
        optionsContainer.className = 'custom-select-options';
        wrapper.appendChild(optionsContainer);
        const updateTriggerText = () => { const selectedOption = selectElement.options[selectElement.selectedIndex]; trigger.textContent = selectedOption ? selectedOption.textContent : ''; };
        updateTriggerText();
        for (let i = 0; i < selectElement.options.length; i++) {
            const option = selectElement.options[i];
            const optionElement = document.createElement('div');
            optionElement.className = 'custom-select-option';
            optionElement.textContent = option.textContent;
            optionElement.addEventListener('click', () => {
                selectElement.selectedIndex = i;
                selectElement.dispatchEvent(new Event('change'));
                updateTriggerText();
                wrapper.classList.remove('open');
            });
            optionsContainer.appendChild(optionElement);
        }
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            $$('.custom-select-wrapper.open').forEach(openWrapper => { if(openWrapper !== wrapper) openWrapper.classList.remove('open'); });
            wrapper.classList.toggle('open');
        });
        updateTriggerText();
        return wrapper;
    }

    // =======================================================
    //               REFERENSI KOLEKSI FIREBASE
    // =======================================================
    const membersCol = collection(db, 'teams', TEAM_ID, 'members');
    const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    const materialsCol = collection(db, 'teams', TEAM_ID, 'materials');
    const suppliersCol = collection(db, 'teams', TEAM_ID, 'suppliers');
    const workersCol = collection(db, 'teams', TEAM_ID, 'workers');
    const stockItemsCol = collection(db, 'teams', TEAM_ID, 'stock_items');
    const stockTransactionsCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
    const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
    const attendanceRecordsCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
    const payrollLiabilitiesCol = collection(db, 'teams', TEAM_ID, 'payroll_liabilities');
    const activityLogsCol = collection(db, 'teams', TEAM_ID, 'activity_logs');
    const fundingCreditorsCol = collection(db, 'teams', TEAM_ID, 'funding_creditors');
    const digitalEnvelopesDoc = doc(db, 'teams', TEAM_ID, 'envelopes', 'main_budget');
    const notificationsCol = collection(db, 'teams', TEAM_ID, 'notifications');
    
    function getExpenditureCreditorCol(category) { 
        const cat = category === 'subkontraktor' ? 'lainnya' : category; 
        return collection(db, 'teams', TEAM_ID, `${cat}_creditors`); 
    }
    function getInvoiceCol(category) { 
        const cat = category === 'subkontraktor' ? 'lainnya' : category; 
        return collection(db, 'teams', TEAM_ID, `${cat}_invoices`); 
    }
    const invoiceCategories = ['operasional', 'material', 'lainnya'];

    // ===== Sistem Toast & Modal (Refactored) =====
    let popupTimeout;
    function toast(kind, text, duration = 3200) {
        clearTimeout(popupTimeout);
        const p = $('#popup-container'); if(!p) return;
        p.className = `popup-container show popup-${kind}`;
        const iconEl = $('#popup-icon'), messageEl = $('#popup-message');
        if(!iconEl || !messageEl) return;
        iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
        iconEl.textContent = kind === 'success' ? 'check_circle' : (kind === 'error' ? 'cancel' : '');
        messageEl.textContent = text || '';
        if(kind !== 'loading'){ popupTimeout = setTimeout(() => p.classList.remove('show'), duration); }
    }

    // Tampilkan UI pembaruan SW
    function showUpdateToast(registration) {
        createModal('updateAvailable', { registration });
    }

    function createModal(type, data = {}) {
        const modalContainer = $('#modal-container');
        if (!modalContainer) return;
        const modalContent = getModalContent(type, data);
        if (!modalContent) return;
        modalContainer.innerHTML = `<div id="${type}-modal" class="modal-bg">${modalContent}</div>`;
        const modalEl = modalContainer.firstElementChild;
        if (!modalEl) return;
        setTimeout(() => modalEl.classList.add('show'), 10);
        document.body.classList.add('modal-open');
        const closeModalFunc = () => closeModal(modalEl);
        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModalFunc(); });
        modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
        attachModalEventListeners(type, data, closeModalFunc, modalEl);
    }
    
    function getModalContent(type, data) {
        const isEdit = type.toLowerCase().includes('edit');
        switch (type) {
            case 'editFunding': {
                return `<div class="modal-content" style="max-width:520px"><div class="modal-header"><h4>Edit Pemasukan/Pinjaman</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group"><label>Nama/Deskripsi</label><input type="text" id="edit-funding-desc"></div><div class="form-group"><label>Total</label><input type="number" id="edit-funding-total"></div><div class="form-group full"><label>Tanggal</label><input type="date" id="edit-funding-date"></div></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="save-edit-funding-btn" class="btn btn-primary">Simpan</button></div></div>`;
            }
            case 'confirmPayment': {
                const { id, type: debtType, category, payload } = data || {};
                const amountInfo = payload?.amount ? `<p>Jumlah: ${fmtIDR(Number(payload.amount))}</p>` : '';
                const dateInfo = payload?.date ? `<p>Tanggal: ${payload.date}</p>` : '';
                const desc = debtType === 'payroll' ? 'Pembayaran gaji' : (debtType === 'loan' ? 'Pelunasan pinjaman' : 'Pelunasan faktur');
                return `<div class="modal-content" style="max-width:480px"><div class="modal-header"><h4>Konfirmasi ${desc}</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Anda yakin ingin memproses pembayaran ini?</p>${amountInfo}${dateInfo}</div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-payment-final-btn" class="btn btn-primary">Ya, Bayar</button></div></div>`;
            }
            case 'editDebt': {
                const { id, type: debtType, category } = data || {};
                return `<div class="modal-content" style="max-width:480px"><div class="modal-header"><h4>Edit Transaksi</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label>Tanggal</label><input type="date" id="edit-debt-date"></div><div class="form-group"><label>Catatan</label><input type="text" id="edit-debt-notes"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="save-edit-debt-btn" class="btn btn-primary">Simpan</button></div></div>`;
            }
            case 'manageProjects': return `<div class="modal-content" style="max-width:640px"><div class="modal-header"><h4>Kelola Proyek</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label>Nama Proyek</label><input id="project-name" placeholder="Nama proyek"></div><div class="form-group"><button id="add-project-btn" class="btn btn-primary"><span class="material-symbols-outlined">add</span>Tambah</button></div><div id="project-list" style="margin-top:1rem;"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Tutup</button></div></div>`;
            case 'manageMaterials': return `<div class="modal-content" style="max-width:640px"><div class="modal-header"><h4>Kelola Material</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label>Nama Material</label><input id="material-name" placeholder="Nama material"></div><div class="form-group"><button id="add-material-btn" class="btn btn-primary"><span class="material-symbols-outlined">add</span>Tambah</button></div><div id="material-list" style="margin-top:1rem;"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Tutup</button></div></div>`;
            case 'manageSuppliers': return `<div class="modal-content" style="max-width:640px"><div class="modal-header"><h4>Kelola Supplier/Kreditur</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label>Nama</label><input id="supplier-name" placeholder="Nama supplier/kreditur"></div><div class="form-group"><button id="add-supplier-btn" class="btn btn-primary"><span class="material-symbols-outlined">add</span>Tambah</button></div><div id="supplier-list" style="margin-top:1rem;"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Tutup</button></div></div>`;
            case 'updateAvailable':
                return `<div class="modal-content" style="max-width:420px">
                    <div class="modal-header">
                        <h4>Pembaruan Tersedia</h4>
                        <button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <div class="modal-body">
                        <p>Versi baru aplikasi siap dipasang. Muat ulang untuk menerapkan pembaruan.</p>
                    </div>
                    <div class="modal-footer">
                        <button class="btn btn-secondary" data-close-modal>Nanti</button>
                        <button id="sw-update-btn" class="btn btn-primary">Perbarui Sekarang</button>
                    </div>
                </div>`;
            case 'login': return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Login atau Buat Akun</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Hubungkan akun Google Anda untuk mengakses semua fitur.</p></div><div class="modal-footer"><button id="google-login-btn" class="btn btn-primary"><svg style="width:20px;height:20px" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg><span>Masuk dengan Google</span></button></div></div>`;
            case 'confirmLogout': return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Konfirmasi Keluar</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Apakah Anda yakin ingin keluar?</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button></div></div>`;
            case 'setUserRole': {
                const { id, currentRole } = data || {};
                const roles = ['Editor','Viewer'];
                return `<div class="modal-content" style="max-width:420px">
                    <div class="modal-header"><h4>Ubah Peran Pengguna</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div>
                    <div class="modal-body">
                        <p>Pilih peran baru untuk pengguna ini.</p>
                        <div class="form-grid">
                            ${roles.map(r => `<button class="btn role-btn ${r==='Owner'?'role-btn--owner': (r==='Editor'?'role-btn--editor':'role-btn--viewer')} btn-choose-role" data-id="${id}" data-role="${r}">${r}${currentRole===r?' (saat ini)':''}</button>`).join('')}
                        </div>
                    </div>
                    <div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Tutup</button></div>
                </div>`;
            }
            case 'confirmDelete': return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>${data.title || 'Konfirmasi Hapus'}</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>${data.message || 'Anda yakin ingin menghapus item ini? Tindakan ini tidak dapat diurungkan.'}</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-delete-btn" class="btn btn-danger">${data.confirmLabel || 'Hapus'}</button></div></div>`;
            case 'globalSearch': return `<div class="modal-content" style="max-width:600px"><div class="modal-header"><h4>Cari Cepat</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><input type="text" id="global-search-input" placeholder="Cari halaman..." autocomplete="off"></div><div id="search-results"></div></div></div>`;
            case 'newWorker': 
            case 'editWorker': {
                const worker = data || {};
                return `<div class="modal-content" style="max-width:500px"><div class="modal-header"><h4>${isEdit ? 'Edit' : 'Pekerja Baru'}</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label>Nama Lengkap</label><input type="text" id="worker-name" value="${worker.workerName || ''}" required></div><div class="form-group"><label>Jabatan/Posisi</label><input type="text" id="worker-position" value="${worker.position || ''}" required></div><div class="form-group"><label>Proyek</label><select id="worker-project"><option value="">Pilih Proyek</option>${appState.projects.map(p => `<option value="${p.id}" ${p.id === worker.projectId ? 'selected' : ''}>${p.projectName}</option>`).join('')}</select></div><div class="form-group"><label>Upah Harian</label><input type="number" id="worker-daily-wage" value="${worker.dailyWage || ''}" required></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="save-worker-btn" class="btn btn-primary">${isEdit ? 'Perbarui' : 'Tambah'}</button></div></div>`;
            }
            case 'manageWorkers': return `<div class="modal-content" style="max-width:800px"><div class="modal-header"><h4>Kelola Pekerja</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><button id="add-new-worker-in-modal" class="btn btn-primary btn-sm"><span class="material-symbols-outlined">group_add</span>Tambah Pekerja</button><div id="modal-workers-table-container" style="margin-top: 1rem;">${renderWorkersCollectionTable($('#modal-workers-table-container')) || ''}</div></div></div>`;
            case 'changeStatus': {
                const { id, name } = data;
                return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Ubah Status Kehadiran</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p><strong>${name}</strong></p><div class="form-group"><label>Status Kehadiran</label><select id="attendance-status"><option value="hadir_penuh">Hadir Penuh</option><option value="setengah_hari">Setengah Hari</option><option value="absen">Absen</option></select></div><div class="form-group"><label>Lembur (jam)</label><input type="number" id="attendance-overtime" value="0"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="save-attendance-btn" class="btn btn-primary">Simpan</button></div></div>`;
            }
            case 'newStockItem': return `<div class="modal-content" style="max-width:500px"><div class="modal-header"><h4>Item Stok Baru</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label>Nama Item</label><input type="text" id="stock-item-name" required></div><div class="form-group"><label>Satuan</label><input type="text" id="stock-item-unit" required></div><div class="form-group"><label>Jumlah Awal</label><input type="number" id="stock-item-initial" required></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="save-stock-item-btn" class="btn btn-primary">Tambah</button></div></div>`;
            case 'recordStockUsage': {
                const { itemId, stockItemName } = data;
                return `<div class="modal-content" style="max-width:500px"><div class="modal-header"><h4>Catat Penggunaan Stok</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>${stockItemName}</p><div class="form-group"><label>Jumlah Digunakan</label><input type="number" id="stock-usage-qty" required></div><div class="form-group"><label>Satuan</label><input type="text" id="usage-unit" readonly></div><div class="form-group"><label>Keterangan</label><input type="text" id="stock-usage-notes"></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="record-stock-usage-btn" class="btn btn-primary">Catat</button></div></div>`;
            }
            case 'payment': {
                const { id, type, category } = data;
                const isPayroll = type === 'payroll';
                const isLoan = type === 'loan';
                const isInvoice = type === 'invoice';
                return `<div class="modal-content" style="max-width:500px"><div class="modal-header"><h4>Pembayaran</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body">${isPayroll ? `<div class="form-group"><label>Tanggal</label><input type="date" id="payment-date" required></div>` : ''}<div class="form-group"><label>Jumlah Pembayaran</label><input type="number" id="payment-amount" required></div></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-payment-btn" class="btn btn-primary">Bayar</button></div></div>`;
            }
            default: return null;
        }
    }

    function attachModalEventListeners(type, data, closeModalFunc, modalEl) {
        if (!modalEl) return;
        if (type === 'updateAvailable') {
            const reg = data && data.registration;
            $('#sw-update-btn')?.addEventListener('click', async () => {
                try {
                    if (reg && reg.waiting) {
                        reg.waiting.postMessage({ type: 'SKIP_WAITING' });
                        toast('info', 'Memperbarui...');
                    }
                } catch (e) { console.warn('Gagal kirim SKIP_WAITING:', e); }
                closeModalFunc();
            });
        }
        if (type === 'login') {
            $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
        }
        if (type === 'confirmLogout') {
            $('#confirm-logout-btn')?.addEventListener('click', handleLogout);
        }
        if (type === 'confirmDelete') {
            $('#confirm-delete-btn')?.addEventListener('click', () => { data.onConfirm?.(); closeModalFunc(); });
        }
        if (type === 'globalSearch') {
            $('#global-search-input')?.addEventListener('input', handleGlobalSearch);
        }
        if (type === 'newWorker' || type === 'editWorker') {
            modalEl.querySelector('form')?.addEventListener('submit', e => e.preventDefault());
            $('#save-worker-btn')?.addEventListener('click', handleSaveWorker);
        }
        if (type === 'manageWorkers') {
            renderWorkersCollectionTable($('#modal-workers-table-container'));
            $('#add-new-worker-in-modal').addEventListener('click', () => createModal('newWorker', {}));
        }
        if (type === 'changeStatus') {
            $('#save-attendance-btn')?.addEventListener('click', () => { 
                const status = $('#attendance-status')?.value;
                const overtime = Number($('#attendance-overtime')?.value || 0);
                handleSaveAttendance(data.id, status, overtime);
            });
        }
        if (type === 'newStockItem') {
            modalEl.querySelector('form')?.addEventListener('submit', e => e.preventDefault());
            $('#save-stock-item-btn')?.addEventListener('click', handleSaveStockItem);
        }
        if (type === 'recordStockUsage') {
            createCustomSelect($('#usage-item'));
            modalEl.querySelector('#stock-usage-form')?.addEventListener('submit', handleRecordStockUsage);
        }
        if (type === 'setUserRole') {
            $$('.btn-choose-role', modalEl).forEach(btn => btn.addEventListener('click', async e => {
                const uid = e.currentTarget.dataset.id;
                const newRole = e.currentTarget.dataset.role;
                try { await updateDoc(doc(membersCol, uid), { role: newRole }); toast('success','Peran diperbarui.'); closeModalFunc(); renderPengaturanPage($('#page-pengaturan')); } catch (error) { toast('error','Gagal memperbarui peran.'); }
            }));
        }
        if (type === 'payment') {
            $('#confirm-payment-btn')?.addEventListener('click', () => {
                const payload = { amount: $('#payment-amount')?.value || '', date: $('#payment-date')?.value || '' };
                const id = data?.id, cat = data?.category, t = data?.type;
                createModal('confirmPayment', { id, type: t, category: cat, payload });
            });
        }
        if (type === 'editDebt') {
            $('#save-edit-debt-btn')?.addEventListener('click', async () => {
                const dateVal = $('#edit-debt-date')?.value;
                const notesVal = $('#edit-debt-notes')?.value || '';
                try {
                    const { id, type: debtType, category } = data || {};
                    if (debtType === 'invoice') {
                        await updateDoc(doc(getInvoiceCol(category), id), { date: dateVal ? new Date(dateVal) : Timestamp.now(), notes: notesVal });
                    } else if (debtType === 'loan') {
                        await updateDoc(doc(fundingSourcesCol, id), { date: dateVal ? new Date(dateVal) : Timestamp.now(), notes: notesVal });
                    }
                    toast('success','Transaksi diperbarui.');
                    await logActivity('edit', debtType, id, { category, fields: ['date','notes'] });
                    closeModalFunc();
                    if(appState.activePage === 'tagihan') renderTagihanPage($('#page-tagihan'));
                } catch (e) {
                    toast('error','Gagal memperbarui.');
                }
            });
        }
        if (type === 'confirmPayment') {
            $('#confirm-payment-final-btn')?.addEventListener('click', async () => {
                const { id, type: t, category: cat, payload } = data || {};
                try { await handleConfirmPayment(id, t, cat, payload); closeModalFunc(); } catch(e) {}
            });
        }
        if (type === 'editFunding') {
            const id = data?.id;
            const item = (appState.fundingCreditors || []).find(x => x.id === id);
            if (item) {
                const desc = $('#edit-funding-desc'); if (desc) desc.value = item.description || item.creditorName || '';
                const total = $('#edit-funding-total'); if (total) total.value = item.totalAmount || 0;
                const date = $('#edit-funding-date'); if (date) date.value = new Date(item.date).toISOString().slice(0,10);
            }
            $('#save-edit-funding-btn')?.addEventListener('click', async () => {
                try {
                    const newDesc = $('#edit-funding-desc')?.value || '';
                    const newTotal = Number($('#edit-funding-total')?.value || 0);
                    const newDateStr = $('#edit-funding-date')?.value;
                    const newDate = newDateStr ? new Date(newDateStr) : new Date();
                    await updateDoc(doc(fundingCreditorsCol, id), { description: newDesc, totalAmount: newTotal, date: newDate });
                    // Coba sinkronkan juga ke fundingSources jika id sama
                    try { await updateDoc(doc(fundingSourcesCol, id), { description: newDesc, totalAmount: newTotal, date: newDate }); } catch (e) {}
                    toast('success','Data diperbarui.');
                    await logActivity('edit', 'funding', id, { fields: ['description','totalAmount','date'] });
                    closeModalFunc();
                    await fetchFundingCreditors();
                    renderFundingCreditorsTable($('#list-pemasukan-container'));
                } catch (e) { toast('error','Gagal menyimpan perubahan.'); }
            });
        }
        if (type === 'manageProjects') {
            const listEl = modalEl.querySelector('#project-list');
            const inputEl = modalEl.querySelector('#project-name');
            const addBtn = modalEl.querySelector('#add-project-btn');
            async function renderList() {
                const snap = await getDocs(query(projectsCol, orderBy('createdAt','desc')));
                const items = snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
                listEl.innerHTML = items.length === 0 ? '<p class="empty-state">Belum ada proyek.</p>' : `<div class="data-card-list">${items.map(it => `
                    <div class="data-card"><div class="data-card-header"><h5 class="data-card-title">${it.projectName || '(Tanpa nama)'}</h5><div class="data-card-actions"><div class="action-menu"><button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button><div class="action-dropdown hidden"><button class="action-dropdown-item btn-edit-project" data-id="${it.id}"><span class="material-symbols-outlined">create</span> Edit</button><button class="action-dropdown-item action-dropdown-item--danger btn-del-project" data-id="${it.id}"><span class="material-symbols-outlined">delete</span> Hapus</button></div></div></div></div></div>`).join('')}</div>`;
                $$('.btn-edit-project', listEl).forEach(btn => btn.addEventListener('click', async e => { const id = e.currentTarget.dataset.id; const name = prompt('Nama proyek baru:'); if (!name) return; await updateDoc(doc(projectsCol, id), { projectName: name }); await logActivity('edit','project', id, { projectName: name }); toast('success','Proyek diperbarui'); renderList(); }));
                $$('.btn-del-project', listEl).forEach(btn => btn.addEventListener('click', async e => { const id = e.currentTarget.dataset.id; if (!confirm('Hapus proyek ini?')) return; await deleteDoc(doc(projectsCol, id)); await logActivity('delete','project', id, {}); toast('success','Proyek dihapus'); renderList(); }));
            }
            addBtn?.addEventListener('click', async () => { const name = (inputEl?.value || '').trim(); if (!name) return; const dup = await getDocs(query(projectsCol, where('projectName','==', name))); if (!dup.empty) { toast('error','Nama proyek sudah ada'); return; } const newRef = await addDoc(projectsCol, { projectName: name, status: 'active', createdAt: serverTimestamp() }); await logActivity('create','project', newRef.id, { projectName: name }); inputEl.value=''; toast('success','Proyek ditambahkan'); renderList(); });
            renderList();
        }
        if (type === 'manageMaterials') {
            const listEl = modalEl.querySelector('#material-list');
            const inputEl = modalEl.querySelector('#material-name');
            const addBtn = modalEl.querySelector('#add-material-btn');
            async function renderList() {
                const snap = await getDocs(query(materialsCol, orderBy('createdAt','desc')));
                const items = snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
                listEl.innerHTML = items.length === 0 ? '<p class="empty-state">Belum ada material.</p>' : `<div class="data-card-list">${items.map(it => `
                    <div class="data-card"><div class="data-card-header"><h5 class="data-card-title">${it.materialName || '(Tanpa nama)'}</h5><div class="data-card-actions"><div class="action-menu"><button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button><div class="action-dropdown hidden"><button class="action-dropdown-item btn-edit-material" data-id="${it.id}"><span class="material-symbols-outlined">create</span> Edit</button><button class="action-dropdown-item action-dropdown-item--danger btn-del-material" data-id="${it.id}"><span class="material-symbols-outlined">delete</span> Hapus</button></div></div></div></div></div>`).join('')}</div>`;
                $$('.btn-edit-material', listEl).forEach(btn => btn.addEventListener('click', async e => { const id = e.currentTarget.dataset.id; const name = prompt('Nama material baru:'); if (!name) return; await updateDoc(doc(materialsCol, id), { materialName: name }); await logActivity('edit','material', id, { materialName: name }); toast('success','Material diperbarui'); renderList(); }));
                $$('.btn-del-material', listEl).forEach(btn => btn.addEventListener('click', async e => { const id = e.currentTarget.dataset.id; if (!confirm('Hapus material ini?')) return; await deleteDoc(doc(materialsCol, id)); await logActivity('delete','material', id, {}); toast('success','Material dihapus'); renderList(); }));
            }
            addBtn?.addEventListener('click', async () => { const name = (inputEl?.value || '').trim(); if (!name) return; const dup = await getDocs(query(materialsCol, where('materialName','==', name))); if (!dup.empty) { toast('error','Nama material sudah ada'); return; } const newRef = await addDoc(materialsCol, { materialName: name, createdAt: serverTimestamp() }); await logActivity('create','material', newRef.id, { materialName: name }); inputEl.value=''; toast('success','Material ditambahkan'); renderList(); });
            renderList();
        }
        if (type === 'manageSuppliers') {
            const listEl = modalEl.querySelector('#supplier-list');
            const inputEl = modalEl.querySelector('#supplier-name');
            const addBtn = modalEl.querySelector('#add-supplier-btn');
            async function renderList() {
                const snap = await getDocs(query(suppliersCol, orderBy('createdAt','desc')));
                const items = snap.docs.map(d => ({ id: d.id, ...(d.data()) }));
                listEl.innerHTML = items.length === 0 ? '<p class="empty-state">Belum ada supplier/kreditur.</p>' : `<div class="data-card-list">${items.map(it => `
                    <div class="data-card"><div class="data-card-header"><h5 class="data-card-title">${it.supplierName || '(Tanpa nama)'}</h5><div class="data-card-actions"><div class="action-menu"><button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button><div class="action-dropdown hidden"><button class="action-dropdown-item btn-edit-supplier" data-id="${it.id}"><span class="material-symbols-outlined">create</span> Edit</button><button class="action-dropdown-item action-dropdown-item--danger btn-del-supplier" data-id="${it.id}"><span class="material-symbols-outlined">delete</span> Hapus</button></div></div></div></div></div>`).join('')}</div>`;
                $$('.btn-edit-supplier', listEl).forEach(btn => btn.addEventListener('click', async e => { const id = e.currentTarget.dataset.id; const name = prompt('Nama baru:'); if (!name) return; await updateDoc(doc(suppliersCol, id), { supplierName: name }); await logActivity('edit','supplier', id, { supplierName: name }); toast('success','Data diperbarui'); renderList(); }));
                $$('.btn-del-supplier', listEl).forEach(btn => btn.addEventListener('click', async e => { const id = e.currentTarget.dataset.id; if (!confirm('Hapus data ini?')) return; await deleteDoc(doc(suppliersCol, id)); await logActivity('delete','supplier', id, {}); toast('success','Data dihapus'); renderList(); }));
            }
            addBtn?.addEventListener('click', async () => { const name = (inputEl?.value || '').trim(); if (!name) return; const dup = await getDocs(query(suppliersCol, where('supplierName','==', name))); if (!dup.empty) { toast('error','Nama supplier/kreditur sudah ada'); return; } const newRef = await addDoc(suppliersCol, { supplierName: name, createdAt: serverTimestamp() }); await logActivity('create','supplier', newRef.id, { supplierName: name }); inputEl.value=''; toast('success','Data ditambahkan'); renderList(); });
            renderList();
        }
    }

    // Activity logging (Owner can review in Pengaturan)
    async function logActivity(action, targetType, targetId, details = {}) {
        try {
            const user = appState.currentUser;
            const payload = {
                action,
                targetType,
                targetId: targetId || null,
                details,
                actorUid: user?.uid || null,
                actorName: user?.displayName || 'Guest',
                actorEmail: user?.email || '',
                createdAt: serverTimestamp()
            };
            await addDoc(activityLogsCol, payload);
        } catch (e) { /* noop logging errors */ }
    }

    function closeModal(modalEl) { if (!modalEl) modalEl = $('.modal-bg'); if (!modalEl) return; modalEl.classList.remove('show'); setTimeout(() => { modalEl.remove(); if (!$('.modal-bg')) document.body.classList.remove('modal-open'); }, 300); }

    // ===== ALUR OTENTIKASI BARU DENGAN VERIFIKASI =====
    onAuthStateChanged(auth, async (user) => {
        if (appState.roleUnsub) appState.roleUnsub();
        if (user) {
            appState.currentUser = user;
            const userDocRef = doc(membersCol, user.uid);
            appState.roleUnsub = onSnapshot(userDocRef, async (docSnap) => {
                if (!docSnap.exists()) {
                    const isOwner = (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
                    // Buat dokumen awal sesuai rules: Viewer + pending
                    const initialData = { email: user.email, name: user.displayName, photoURL: user.photoURL, role: 'Viewer', status: 'pending', createdAt: serverTimestamp() };
                    await setDoc(userDocRef, initialData);
                    // Jika Owner, tingkatkan segera menjadi Owner + active (diizinkan oleh rules)
                    if (isOwner) {
                        try { await updateDoc(userDocRef, { role: 'Owner', status: 'active' }); } catch (e) { console.warn('Gagal upgrade owner:', e); }
                        appState.userRole = 'Owner';
                        appState.userStatus = 'active';
                    } else {
                        appState.userRole = 'Viewer';
                        appState.userStatus = 'pending';
                    }
                } else {
                    const userData = docSnap.data();
                    appState.userRole = userData.role || 'Guest';
                    appState.userStatus = userData.status || 'pending';
                }
                renderUI();
            });
        } else {
            appState.currentUser = null; appState.userRole = 'Guest'; appState.userStatus = null;
            renderUI();
        }
    });
    
    async function signInWithGoogle() { closeModal(); toast('loading', 'Menghubungkan...'); try { await signInWithPopup(auth, new GoogleAuthProvider()); toast('success', 'Login berhasil!'); } catch (error) { toast('error', `Login gagal: ${error.code}`); } }
    async function handleLogout() { closeModal(); toast('loading', 'Keluar...'); try { await signOut(auth); toast('success', 'Anda telah keluar.'); } catch (error) { toast('error', `Gagal keluar: ${error.message}`); } }
    
    // ===== FUNGSI RENDER UTAMA =====
    async function renderUI() {
        updateUIForUser(appState.currentUser, appState.userRole, appState.userStatus);
        updateNavActiveState();
        // Guest landing page
        if (!appState.currentUser) {
            renderGuestLanding();
            return;
        }
        if (appState.userStatus !== 'active') {
            // Pending state landing page
            renderPendingLanding();
            return;
        }
        if (appState.userStatus === 'active') { 
            if (appState.projects.length === 0) await fetchProjects();
            if (appState.workers.length === 0) await fetchWorkers();
            if (!appState.digitalEnvelopes) await fetchDigitalEnvelopes(); 
            if (appState.materials.length === 0) await fetchMaterials();
            if (appState.suppliers.length === 0) await fetchSuppliers();
        }
        // Guard viewer pages (read-only allowed pages)
        if (appState.userRole === 'Viewer') {
            const allowed = new Set(['dashboard','tagihan','absensi','manajemen-stok','laporan']);
            if (!allowed.has(appState.activePage)) {
                appState.activePage = 'dashboard';
                localStorage.setItem('lastActivePage', appState.activePage);
            }
        }
        renderPageContent();
    }

    function renderGuestLanding() {
        const bottom = $('#bottom-nav'); if (bottom) bottom.style.display = 'none';
        const fab = $('.fab-container'); if (fab) fab.style.display = 'none';
        const container = $('.page-container'); if (!container) return;
        container.innerHTML = `
            <div class="card card-pad" style="max-width:520px;margin:2rem auto;text-align:center;">
                <img src="logo-main.png" alt="Logo" style="width:64px;height:64px;object-fit:contain;margin-bottom:.5rem;" />
                <h4 style="margin:.25rem 0 .5rem;">Keuangan Proyek</h4>
                <p style="color:var(--text-dim);margin:0 0 1rem;">Selamat datang. Silakan masuk untuk melanjutkan.</p>
                <button id="guest-login-btn" class="btn btn-primary" style="width:100%;max-width:320px;margin:0 auto;">
                    <span class="material-symbols-outlined">login</span><span>Masuk dengan Google</span>
                </button>
                <div style="margin-top:1rem;color:var(--text-dim);font-size:.85rem;">Versi Aplikasi: 1.0.0</div>
            </div>`;
        $('#guest-login-btn')?.addEventListener('click', () => createModal('login'));
    }

    function renderPendingLanding() {
        const bottom = $('#bottom-nav'); if (bottom) bottom.style.display = 'none';
        const fab = $('.fab-container'); if (fab) fab.style.display = 'none';
        const container = $('.page-container'); if (!container) return;
        container.innerHTML = `
            <div class="card card-pad" style="max-width:520px;margin:2rem auto;text-align:center;">
                <img src="logo-main.png" alt="Logo" style="width:64px;height:64px;object-fit:contain;margin-bottom:.5rem;" />
                <h4 style="margin:.25rem 0 .5rem;">Keuangan Proyek</h4>
                <p style="color:var(--text-dim);margin:0 0 .5rem;">Akun Anda menunggu persetujuan Owner.</p>
                <p style="color:var(--text-dim);margin:0 0 1rem;">Silakan kembali lagi nanti atau hubungi Owner.</p>
                <div style="margin-top:1rem;color:var(--text-dim);font-size:.85rem;">Versi Aplikasi: 1.0.0</div>
            </div>`;
    }
    
    async function fetchDigitalEnvelopes() { try { const docSnap = await getDoc(digitalEnvelopesDoc); appState.digitalEnvelopes = docSnap.exists() ? docSnap.data() : { unallocatedFunds: 0, operational: 0, debtPayment: 0, reserve: 0, profit: 0 }; } catch (error) { console.error("Error fetching envelopes:", error); } }
    async function fetchMaterials() { try { const snap = await getDocs(query(materialsCol, orderBy('createdAt', 'desc'))); appState.materials = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { console.error('Error fetching materials:', error); } }
    async function fetchSuppliers() { try { const snap = await getDocs(query(suppliersCol, orderBy('createdAt', 'desc'))); appState.suppliers = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { console.error('Error fetching suppliers:', error); } }
    async function fetchProjects() { try { const snap = await getDocs(query(projectsCol, orderBy('createdAt', 'desc'))); appState.projects = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { toast('error', 'Gagal memuat data proyek.'); } }
    async function fetchWorkers() { try { const snap = await getDocs(query(workersCol, orderBy('workerName'))); appState.workers = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { toast('error', 'Gagal memuat data pekerja.'); } }

    function updateUIForUser(user, role, status) {
        const { userAvatar, dropdownAvatar, dropdownName, dropdownEmail, roleSection, roleIcon, roleText, authBtn, authDropdownBtnText, authDropdownBtnIcon, statusDot } = getUIElements();
        if (user) {
            const photo = user.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
            if (userAvatar) userAvatar.src = photo;
            if (dropdownAvatar) dropdownAvatar.src = photo.replace('40x40', '80x80');
            if (dropdownName) dropdownName.textContent = user.displayName || 'Pengguna';
            if (dropdownEmail) dropdownEmail.textContent = user.email || '';
            if (authBtn) { const t = authBtn.querySelector('.nav-text'); if (t) t.textContent = 'Keluar'; authBtn.classList.add('nav-item--danger'); }
            if (authDropdownBtnText) authDropdownBtnText.textContent = 'Keluar';
            if (authDropdownBtnIcon) authDropdownBtnIcon.textContent = 'logout';
            if (roleSection) roleSection.classList.remove('hidden');
            if (statusDot) statusDot.className = 'status-dot dot--green';
            if (roleIcon) roleIcon.textContent = status === 'pending' ? 'hourglass_empty' : (['revoked','rejected'].includes(status) ? 'block' : 'verified_user');
            if (roleText) roleText.textContent = status === 'pending' ? 'Menunggu Persetujuan' : (['revoked','rejected'].includes(status) ? 'Akses Diblokir' : role);
            if (roleSection) roleSection.className = status === 'pending' ? 'user-info-role status--pending' : (['revoked','rejected'].includes(status) ? 'user-info-role status--danger' : 'user-info-role status--verified');
            if (status === 'pending' && statusDot) statusDot.className = 'status-dot dot--yellow';
            if ((status === 'revoked' || status === 'rejected') && statusDot) statusDot.className = 'status-dot dot--red';
        } else {
            const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
            if (userAvatar) userAvatar.src = guestAvatar;
            if (dropdownAvatar) dropdownAvatar.src = guestAvatar.replace('40x40', '80x80');
            if (dropdownName) dropdownName.textContent = 'Guest';
            if (dropdownEmail) dropdownEmail.textContent = 'Silakan login';
            if (authBtn) { const t = authBtn.querySelector('.nav-text'); if (t) t.textContent = 'Login'; authBtn.classList.remove('nav-item--danger'); }
            if (authDropdownBtnText) authDropdownBtnText.textContent = 'Login dengan Google';
            if (authDropdownBtnIcon) authDropdownBtnIcon.textContent = 'login';
            if (roleSection) roleSection.classList.add('hidden');
            if (statusDot) statusDot.className = 'status-dot dot--red';
        }
        applyRoleVisibility(role, status);
        // Render bottom nav per role and toggle FAB visibility
        const nav = $('#bottom-nav');
        if (nav) {
            if (role === 'Owner') {
                nav.innerHTML = `
                <button class="nav-item" data-nav="dashboard" aria-label="Dashboard"><span class="material-symbols-outlined">dashboard</span><span class="nav-text">Dashboard</span></button>
                <button class="nav-item" data-nav="tagihan" aria-label="Tagihan"><span class="material-symbols-outlined">receipt_long</span><span class="nav-text">Tagihan</span></button>
                <div class="fab-placeholder" aria-hidden="true"></div>
                <button class="nav-item" data-nav="laporan" aria-label="Laporan"><span class="material-symbols-outlined">monitoring</span><span class="nav-text">Laporan</span></button>
                <button class="nav-item" data-nav="manajemen-stok" aria-label="Stok"><span class="material-symbols-outlined">inventory_2</span><span class="nav-text">Stok</span></button>`;
                if ($('.fab-container')) $('.fab-container').style.display = '';
                if ($('.fab-placeholder')) $('.fab-placeholder').style.display = '';
                nav.classList.remove('bottom-nav--two');
            } else if (role === 'Editor') {
                nav.innerHTML = `
                <button class="nav-item" data-nav="dashboard" aria-label="Dashboard"><span class="material-symbols-outlined">dashboard</span><span class="nav-text">Dashboard</span></button>
                <button class="nav-item" data-nav="absensi" aria-label="Absensi"><span class="material-symbols-outlined">person_check</span><span class="nav-text">Absensi</span></button>
                <div class="fab-placeholder" aria-hidden="true"></div>
                <button class="nav-item" data-nav="manajemen-stok" aria-label="Stok"><span class="material-symbols-outlined">inventory_2</span><span class="nav-text">Stok</span></button>
                <button class="nav-item" data-nav="tagihan" aria-label="Tagihan"><span class="material-symbols-outlined">receipt_long</span><span class="nav-text">Tagihan</span></button>`;
                if ($('.fab-container')) $('.fab-container').style.display = '';
                if ($('.fab-placeholder')) $('.fab-placeholder').style.display = '';
                nav.classList.remove('bottom-nav--two');
            } else { // Viewer
                nav.innerHTML = `
                <button class="nav-item" data-nav="dashboard" aria-label="Dashboard"><span class="material-symbols-outlined">dashboard</span><span class="nav-text">Dashboard</span></button>
                <button class="nav-item" data-nav="tagihan" aria-label="Tagihan"><span class="material-symbols-outlined">receipt_long</span><span class="nav-text">Tagihan</span></button>
                <button class="nav-item" data-nav="absensi" aria-label="Absensi"><span class="material-symbols-outlined">person_check</span><span class="nav-text">Absensi</span></button>
                <button class="nav-item" data-nav="manajemen-stok" aria-label="Stok"><span class="material-symbols-outlined">inventory_2</span><span class="nav-text">Stok</span></button>
                <button class="nav-item" data-nav="laporan" aria-label="Laporan"><span class="material-symbols-outlined">monitoring</span><span class="nav-text">Laporan</span></button>`;
                if ($('.fab-container')) $('.fab-container').style.display = 'none';
                if ($('.fab-placeholder')) $('.fab-placeholder').style.display = 'none';
                nav.classList.remove('bottom-nav--two');
            }
            $$('.nav-item[data-nav]').forEach(btn => btn.addEventListener('click', () => {
                appState.activePage = btn.dataset.nav; localStorage.setItem('lastActivePage', appState.activePage);
                renderUI();
            }));
            updateNavActiveState();
        }
    }
    
    function applyRoleVisibility(role, status) {
        $$('[data-role]').forEach(el => {
            const requiredRoles = el.dataset.role.split(',');
            const allowPending = el.dataset.pending === 'true';
            const allowRejected = el.dataset.rejected === 'true';
            const allowAllRoles = requiredRoles.includes('*');
            const hasRole = requiredRoles.includes(role);
            const visible = (allowAllRoles || hasRole) && (allowPending || status !== 'pending') && (allowRejected || !['revoked','rejected'].includes(status));
            el.style.display = visible ? '' : 'none';
        });
    }

    function updateNavActiveState() {
        $$('.nav-item').forEach(item => item.classList.remove('nav-item--active', 'active'));
        $$(`.nav-item[data-nav="${appState.activePage}"]`).forEach(el => el.classList.add('nav-item--active'));
    }

    function renderPageContent() {
        const pageContainer = $('.page-container');
        $$('.page').forEach(p => p.classList.remove('active'));
        let targetPage = $(`#page-${appState.activePage}`);
        if (!targetPage) {
            injectPageTemplates();
            targetPage = $(`#page-${appState.activePage}`);
        }
        if (!targetPage) return;
        targetPage.classList.add('active');
        const container = targetPage;
        const pageRenderers = {
            'dashboard': renderDashboardPage,
            'pemasukan-pinjaman': renderPemasukanPage, 
            'alokasi-anggaran': renderAlokasiPage,
            'input-data': renderInputDataPage, 
            'pengaturan': renderPengaturanPage, 
            'tagihan': renderTagihanPage,
            'laporan': renderLaporanPage, 
            'absensi': renderAbsensiPage, 
            'manajemen-stok': renderManajemenStokPage,
        };
        const renderer = pageRenderers[appState.activePage];
        if (renderer) renderer(container); else { container.innerHTML = `<div class="card card-pad">Halaman ${appState.activePage} dalam pengembangan.</div>`; }
    }

    // ===== FUNGSI RENDER HALAMAN-HALAMAN =====
    async function renderDashboardPage(container) {
        container.innerHTML = `<div class="dashboard-grid"><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div></div>`;
        try {
            const activeProjects = appState.projects.filter(p => p.status !== 'completed');
            const recentWorkers = appState.workers.slice(0, 5);
            // Render dashboard metrics
            const projectCount = appState.projects.length;
            const activeProjectCount = activeProjects.length;
            const workerCount = appState.workers.length;
            const unfinishedProjects = appState.projects.filter(p => p.status !== 'completed').length;
            container.innerHTML = `
                <div class="dashboard-grid">
                    <div class="dashboard-widget">
                        <h5>Total Proyek</h5>
                        <p class="dashboard-value">${projectCount}</p>
                    </div>
                    <div class="dashboard-widget">
                        <h5>Proyek Aktif</h5>
                        <p class="dashboard-value">${activeProjectCount}</p>
                    </div>
                    <div class="dashboard-widget">
                        <h5>Total Pekerja</h5>
                        <p class="dashboard-value">${workerCount}</p>
                    </div>
                    <div class="dashboard-widget">
                        <h5>Proyek Belum Selesai</h5>
                        <p class="dashboard-value">${unfinishedProjects}</p>
                    </div>
                    <div class="dashboard-section" style="grid-column: 1 / -1;">
                        <h5>Proyek Aktif Terbaru</h5>
                        <ul>
                            ${activeProjects.slice(0, 5).map(p => `<li>${p.projectName}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="dashboard-section" style="grid-column: 1 / -1;">
                        <h5>Pekerja Terbaru</h5>
                        <ul>
                            ${recentWorkers.map(w => `<li>${w.workerName} - ${w.position}</li>`).join('')}
                        </ul>
                    </div>
                    <div class="dashboard-section" style="grid-column: 1 / -1;">
                        <h5>Absensi Cepat</h5>
                        <div id="quick-attendance-section"></div>
                    </div>
                </div>
            `;
            $('#quick-attendance-section').innerHTML = `<p>Memuat absensi...</p>`;
            // Fetch quick attendance data (if not fetched)
            if (appState.activePage === 'dashboard') {
                await fetchQuickAttendance();
                if (appState.attendanceRecords && appState.attendanceRecords.length > 0) {
                    renderQuickAttendance($('#quick-attendance-section'));
                }
            }
        } catch (error) {
            console.error("Error rendering dashboard:", error);
            container.innerHTML = `<div class="card card-pad card--error"><p>Terjadi kesalahan saat memuat dashboard.</p></div>`;
        }
    }

    async function fetchQuickAttendance() {
        try {
            const today = todayStr(new Date());
            const attendanceSnap = await getDoc(doc(attendanceRecordsCol, today));
            if (attendanceSnap.exists()) {
                const data = attendanceSnap.data();
                appState.attendanceRecords = Object.keys(data.records || {}).map(uid => {
                    const record = data.records[uid];
                    return { uid, ...record };
                });
            } else {
                appState.attendanceRecords = [];
            }
        } catch (error) {
            console.error("Quick attendance error:", error);
        }
    }

    async function renderQuickAttendance(container) {
        container.innerHTML = `<div class="section-head"><h4>Absensi Cepat Hari Ini (${new Date().toLocaleDateString('id-ID')})</h4></div><div class="card card-pad"><p>Memuat data absensi...</p></div>`;
        try {
            if (!appState.attendanceRecords) {
                await fetchQuickAttendance();
            }
            const records = appState.attendanceRecords || [];
            if (records.length === 0) {
                container.innerHTML = '<p>Tidak ada data absensi untuk hari ini.</p>';
                return;
            }
            const presentCount = records.filter(r => r.status === 'hadir_penuh' || r.status === 'setengah_hari').length;
            const absentCount = records.filter(r => r.status === 'absen').length;
            container.innerHTML = `
                <div class="dashboard-widget">
                    <h5>Hadir</h5>
                    <p class="dashboard-value">${presentCount}</p>
                </div>
                <div class="dashboard-widget">
                    <h5>Absen</h5>
                    <p class="dashboard-value">${absentCount}</p>
                </div>
            `;
        } catch (error) {
            container.innerHTML = `<p class="error-text">Gagal memuat data absensi cepat.</p>`;
            console.error("Quick attendance error:", error);
        }
    }

    async function renderPemasukanPage(container) {
        await fetchFundingCreditors();
        const projectOptions = appState.projects.map(p => `<option value="${p.id}">${p.projectName}</option>`).join('');
        container.innerHTML = `
            <div class="section-head"><h4>Pemasukan & Pinjaman</h4></div>
            <div class="card card-pad">
                <form id="pemasukan-form">
                    <div class="form-group">
                        <label>Jenis Sumber</label>
                        <select id="funding-source-type">
                            <option value="investor">Investor</option>
                            <option value="pinjaman">Pinjaman</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Supplier/Kreditur (Master)</label>
                        <select id="funding-supplier-select" required>
                            <option value="">- Pilih -</option>
                            ${appState.suppliers.map(s => `<option value="${s.id}">${s.supplierName || s.name}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Total Dana / Jumlah Pinjaman</label>
                        <input type="number" id="funding-source-total" required>
                    </div>
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="date" id="funding-source-date" required>
                    </div>
                    <div class="form-group">
                        <label>Proyek Terkait</label>
                        <select id="funding-source-project"><option value="">Pilih Proyek</option>${projectOptions}</select>
                    </div>
                    <button type="submit" class="btn btn-primary">Simpan</button>
                </form>
            </div>
            <div id="list-pemasukan-container" style="margin-top:1.5rem;"></div>
        `;
        $('#pemasukan-form').addEventListener('submit', handleAddFundingSource);
        renderFundingCreditorsTable($('#list-pemasukan-container'));
    }

    async function fetchFundingCreditors() {
        try {
            const snap = await getDocs(query(fundingCreditorsCol, orderBy('createdAt', 'desc')));
            appState.fundingCreditors = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            toast('error', 'Gagal memuat sumber pendanaan.');
        }
    }

    function renderFundingCreditorsTable(container) {
        if (!container) return;
        if (appState.fundingCreditors.length === 0) { container.innerHTML = '<p class="empty-state">Belum ada data.</p>'; return; }
        container.innerHTML = `
            <div class="search-box-wrapper"><span class="material-symbols-outlined">search</span><input type="search" class="search-box" placeholder="Cari pemasukan/pinjaman..."></div>
            <div class="data-card-list">
                ${appState.fundingCreditors.map(item => {
                    const title = item.description || item.creditorName || '(Tanpa deskripsi)';
                    const dateStr = new Date(item.date).toLocaleDateString('id-ID');
                    const totalStr = fmtIDR(item.totalAmount);
                    return `
                    <div class="data-card is-collapsed" data-id="${item.id}">
                        <div class="data-card-header">
                            <div class="data-card-header-left">
                                <h5 class="data-card-title">${title}</h5>
                                <div class="data-card-subtitle">${dateStr}</div>
                            </div>
                            <div class="data-card-amount">${totalStr}</div>
                            ${appState.userRole !== 'Viewer' ? `
                            <div class="data-card-actions">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        <button class="action-dropdown-item btn-edit-funding" data-id="${item.id}"><span class="material-symbols-outlined">edit</span> Edit</button>
                                        <button class="action-dropdown-item action-dropdown-item--danger btn-delete-funding" data-id="${item.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                                    </div>
                                </div>
                            </div>` : ''}
                        </div>
                        <div class="data-card-body">
                            <div class="data-card-row data-row--hide-when-collapsed"><div class="data-card-row-left"><span class="material-symbols-outlined row-icon">category</span><span class="data-card-label">Jenis</span></div><span class="data-card-value"><span class="badge badge--${item.type === 'Pinjaman' ? 'purple' : 'blue'}">${item.type}</span></span></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
        attachCardBehaviors(container);
        attachContextualSearch(container);
        $$('.btn-delete-funding').forEach(btn => btn.addEventListener('click', e => {
            const id = e.currentTarget.dataset.id;
            createModal('confirmDelete', { title: 'Hapus Pemasukan', onConfirm: () => handleDeleteFunding(id) });
        }));
    }

    async function handleAddFundingSource(e) {
        e.preventDefault();
        toast('loading', 'Menyimpan...');
        const typeSelect = $('#funding-source-type');
        const supSel = $('#funding-supplier-select');
        const totalInput = $('#funding-source-total');
        const dateInput = $('#funding-source-date');
        const projectSelect = $('#funding-source-project');
        const type = (typeSelect.value === 'investor') ? 'Investasi' : 'Pinjaman';
        if (!supSel || !supSel.value) { toast('error','Pilih supplier/kreditur'); return; }
        const supplierId = supSel.value;
        const supplier = appState.suppliers.find(s => s.id === supplierId);
        const description = supplier?.supplierName || supplier?.name || '';
        const totalAmount = Number(totalInput.value);
        const date = new Date(dateInput.value);
        const projectId = projectSelect.value || null;
        try {
            // Add new funding source
            await addDoc(fundingSourcesCol, {
                type,
                description,
                totalAmount,
                date,
                projectId,
                supplierId,
                isFullyPaid: type === 'Pinjaman' ? false : true,
                createdAt: serverTimestamp()
            });
            toast('success', 'Sumber pendanaan berhasil disimpan.');
            // Refresh funding creditors list
            await fetchFundingCreditors();
            renderFundingCreditorsTable($('#list-pemasukan-container'));
            // Update digital envelopes for unallocated funds if it's investment
            if (type === 'Investasi') {
                await runTransaction(db, async (transaction) => {
                    const envDoc = await transaction.get(digitalEnvelopesDoc);
                    const currentUnallocated = envDoc.exists() ? (envDoc.data().unallocatedFunds || 0) : 0;
                    let newUnallocated = currentUnallocated;
                    newUnallocated += totalAmount;
                    transaction.set(digitalEnvelopesDoc, { unallocatedFunds: newUnallocated }, { merge: true });
                });
            }
            // Reset form fields
            e.target.reset();
        } catch (error) {
            toast('error', 'Gagal menyimpan sumber pendanaan.');
            console.error("Error adding funding source:", error);
        }
    }

    async function handleDeleteFunding(id) {
        toast('loading', 'Menghapus...');
        try {
            await deleteDoc(doc(fundingCreditorsCol, id));
            toast('success', 'Sumber pendanaan telah dihapus.');
            await fetchFundingCreditors();
            renderFundingCreditorsTable($('#list-pemasukan-container'));
            // Update funding sources also (for completeness)
            const sourcesSnap = await getDocs(query(fundingSourcesCol, where('__name__', '==', id)));
            if (!sourcesSnap.empty) {
                const sourceRef = sourcesSnap.docs[0].ref;
                const sourceData = sourcesSnap.docs[0].data();
                const type = sourceData.type;
                const totalAmount = sourceData.totalAmount || 0;
                await runTransaction(db, async (transaction) => {
                    if (type === 'Investasi') {
                        const envDoc = await transaction.get(digitalEnvelopesDoc);
                        const currentUnallocated = envDoc.exists() ? envDoc.data().unallocatedFunds || 0 : 0;
                        const newUnallocated = Math.max(0, currentUnallocated - totalAmount);
                        transaction.set(digitalEnvelopesDoc, { unallocatedFunds: newUnallocated }, { merge: true });
                    }
                    transaction.delete(sourceRef);
                });
            }
        } catch (error) {
            toast('error', `Gagal menghapus: ${error.message}`);
            console.error("Error deleting funding source:", error);
        }
    }

    async function renderAlokasiPage(container) {
        await fetchExpenditureCreditors('operasional');
        await fetchExpenditureCreditors('material');
        await fetchExpenditureCreditors('lainnya');
        const totalFunds = appState.digitalEnvelopes ? appState.digitalEnvelopes.unallocatedFunds || 0 : 0;
        container.innerHTML = `
            <div class="section-head"><h4>Alokasi Anggaran</h4></div>
            <div class="card card-pad">
                <form id="alokasi-form">
                    <div class="form-group">
                        <label>Total Dana Belum Teralokasi</label>
                        <input type="text" id="alokasi-total-funds" value="${fmtIDR(totalFunds)}" readonly>
                    </div>
                    <div class="form-group">
                        <label>Alokasikan ke</label>
                        <select id="alokasi-category">
                            <option value="operational">Operasional</option>
                            <option value="debtPayment">Pembayaran Utang</option>
                            <option value="reserve">Dana Cadangan</option>
                            <option value="profit">Profit</option>
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Jumlah</label>
                        <input type="number" id="alokasi-amount" required>
                    </div>
                    <button type="submit" class="btn btn-primary">Alokasikan</button>
                </form>
            </div>
            <div id="list-alokasi-container" style="margin-top:1.5rem;"></div>
        `;
        $('#alokasi-total-funds').value = fmtIDR(totalFunds);
        $('#alokasi-form').addEventListener('submit', handleAllocateFunds);
    }

    async function handleAllocateFunds(e) {
        e.preventDefault();
        toast('loading', 'Mengalokasikan...');
        const categorySelect = $('#alokasi-category');
        const amountInput = $('#alokasi-amount');
        const category = categorySelect.value;
        const amount = Number(amountInput.value);
        try {
            await runTransaction(db, async (transaction) => {
                const envDoc = await transaction.get(digitalEnvelopesDoc);
                const currentEnvelopes = envDoc.exists() ? envDoc.data() : { unallocatedFunds: 0, operational: 0, debtPayment: 0, reserve: 0, profit: 0 };
                const newUnallocated = Math.max(0, (currentEnvelopes.unallocatedFunds || 0) - amount);
                const currentCategoryValue = currentEnvelopes[category] || 0;
                const newCategoryValue = currentCategoryValue + amount;
                transaction.update(digitalEnvelopesDoc, {
                    unallocatedFunds: newUnallocated,
                    [category]: newCategoryValue
                });
            });
            toast('success', 'Dana berhasil dialokasikan.');
            // Update local state
            if (appState.digitalEnvelopes) {
                appState.digitalEnvelopes.unallocatedFunds = Math.max(0, (appState.digitalEnvelopes.unallocatedFunds || 0) - amount);
                appState.digitalEnvelopes[category] = (appState.digitalEnvelopes[category] || 0) + amount;
            }
            // Reset form
            $('#alokasi-form').reset();
            $('#alokasi-total-funds').value = fmtIDR(appState.digitalEnvelopes.unallocatedFunds);
        } catch (error) {
            toast('error', 'Gagal mengalokasikan dana.');
            console.error("Error allocating funds:", error);
        }
    }

    async function renderInputDataPage(container) {
        container.innerHTML = `
            <div class="section-head"><h4>Input Pengeluaran</h4></div>
            <div class="sub-nav">
                ${invoiceCategories.map(cat => `<button class="btn btn-sm btn-sub-nav ${cat === 'operasional' ? 'active' : ''}" data-category="${cat}">${cat.charAt(0).toUpperCase() + cat.slice(1)}</button>`).join('')}
            </div>
            <div id="sub-page-content" style="margin-top: 1rem;"></div>
        `;
        $$('.btn-sub-nav').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.btn-sub-nav').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active'); renderInvoiceForm($('#sub-page-content'), e.currentTarget.dataset.category);
        }));
        renderInvoiceForm($('#sub-page-content'), 'operasional');
    }

    async function renderInvoiceForm(container, category) {
        await fetchExpenditureCreditors(category);
        appState.currentInvoiceItems = [];
        const isMultiItemByDefault = category === 'material';
        if (!appState.suppliers || appState.suppliers.length === 0) {
            container.innerHTML = `<div class="card card-pad"><p>Belum ada Supplier/Kreditur master. Tambahkan di Pengaturan &gt; Master Data.</p><div style="margin-top:.75rem;"><button id="open-master-supplier" class="btn btn-secondary">Kelola Supplier</button></div></div>`;
            $('#open-master-supplier')?.addEventListener('click', () => createModal('manageSuppliers'));
            return;
        }
        container.innerHTML = `
            <div class="form-group">
                <label>Supplier/Kreditur (Master)</label>
                <select id="inv-creditor" required>
                    <option value="">Pilih Supplier/Kreditur</option>
                    ${(appState.suppliers || []).map(s => `<option value="master:${s.id}">${s.supplierName || s.name || 'Supplier'}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Proyek Terkait</label>
                <select id="inv-project"><option value="">Pilih Proyek</option>${appState.projects.map(p => `<option value="${p.id}">${p.projectName}</option>`).join('')}</select>
            </div>
            <div class="form-group">
                <label>Status Pembayaran</label>
                <select id="inv-status"><option value="belum_lunas">Belum Lunas</option><option value="lunas">Lunas</option></select>
            </div>
            <div class="form-group">
                <label>Tanggal</label>
                <input type="date" id="inv-date" required>
            </div>
            <div class="form-group">
                <label>Catatan</label>
                <input type="text" id="inv-notes">
            </div>
            <div class="form-group">
                <label>Item</label>
                <div id="invoice-items-container">
                    <div class="item-inputs">
                        <input type="text" id="item-name" placeholder="Nama Item" list="materials-datalist" required>
                        <input type="number" id="item-qty" placeholder="Jumlah" required>
                        <input type="text" id="item-unit" placeholder="Satuan" required>
                        <input type="number" id="item-price" placeholder="Harga Satuan" required>
                        <input type="text" id="item-total" placeholder="Total" readonly>
                    </div>
                    <button type="button" id="add-item-btn" class="btn btn-secondary btn-sm ${isMultiItemByDefault ? '' : ''}">Tambah Item</button>
                    <button type="button" id="multi-item-btn" class="btn btn-secondary btn-sm ${isMultiItemByDefault ? 'hidden' : ''}">Tambah Beberapa Item</button>
                    <button type="button" id="single-item-btn" class="btn btn-secondary btn-sm ${category !== 'material' && isMultiItemByDefault ? '' : 'hidden'}">Tambah Satu Item</button>
                </div>
                <datalist id="materials-datalist">${appState.materials.map(m => `<option value="${m.materialName || m.name}"></option>`).join('')}</datalist>
                <div id="invoice-item-list"></div>
            </div>
            <div class="form-group">
                <label>Total Faktur</label>
                <input type="text" id="invoice-total-amount" readonly>
            </div>
            <button id="save-invoice-btn" class="btn btn-primary">Simpan Faktur</button>
        `;
        renderItemInputUI(category, isMultiItemByDefault);
        createCustomSelect($('#inv-creditor'));
        createCustomSelect($('#inv-project'));
        createCustomSelect($('#inv-status'));
        $('#inv-date').value = todayStr();
        $('#inv-status').value = 'belum_lunas';
        $('#add-item-btn').addEventListener('click', handleAddInvoiceItem);
        $('#multi-item-btn').addEventListener('click', () => { renderItemInputUI(category, true); });
        $('#single-item-btn').addEventListener('click', () => { renderItemInputUI(category, false); });
        $('#save-invoice-btn').addEventListener('click', () => handleSaveInvoice(category));
    }

    function renderItemInputUI(category, isMultiItem) {
        const container = $('#invoice-items-container');
        const showMultiBtnClass = isMultiItem ? 'hidden' : '';
        const hideMultiBtnClass = category !== 'material' && isMultiItem ? '' : 'hidden';
        container.querySelector('#add-item-btn').classList.toggle('hidden', !isMultiItem);
        container.querySelector('#multi-item-btn').classList.toggle('hidden', isMultiItem);
        container.querySelector('#single-item-btn').classList.toggle('hidden', !isMultiItem || category === 'material');
        const inputs = container.querySelectorAll('.item-inputs input');
        inputs.forEach(input => { input.value = ''; });
        appState.currentInvoiceItems = isMultiItem ? [] : [{}];
        renderInvoiceItems();
    }

    function renderInvoiceItems() {
        const listContainer = $('#invoice-item-list');
        const totalAmountEl = $('#invoice-total-amount');
        if (!listContainer || !totalAmountEl) return;
        if (appState.currentInvoiceItems.length === 0) {
            listContainer.innerHTML = '<p class="empty-state">Belum ada item.</p>';
            totalAmountEl.value = '';
            return;
        }
        let totalAmount = 0;
        listContainer.innerHTML = `<ul>${appState.currentInvoiceItems.map((item, index) => {
            const itemTotal = item.quantity * item.price;
            totalAmount += itemTotal;
            return `<li>${item.name} - ${item.quantity} ${item.unit} x ${fmtIDR(item.price)} = ${fmtIDR(itemTotal)} <button class="btn btn-danger btn-xs btn-remove-item" data-index="${index}">Hapus</button></li>`;
        }).join('')}</ul>`;
        totalAmountEl.value = fmtIDR(totalAmount);
        $$('.btn-remove-item').forEach(btn => btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            appState.currentInvoiceItems.splice(index, 1);
            renderInvoiceItems();
        }));
    }

    function handleAddInvoiceItem() {
        const nameInput = $('#item-name');
        const qtyInput = $('#item-qty');
        const unitInput = $('#item-unit');
        const priceInput = $('#item-price');
        const totalInput = $('#item-total');
        const name = nameInput.value.trim();
        const quantity = Number(qtyInput.value);
        const unitName = unitInput.value.trim();
        const price = Number(priceInput.value);
        if (!name || !unitName || isNaN(quantity) || isNaN(price) || quantity <= 0 || price < 0) {
            toast('error', 'Data item tidak valid.');
            return;
        }
        const itemTotal = quantity * price;
        totalInput.value = fmtIDR(itemTotal);
        appState.currentInvoiceItems.push({ name, quantity, unitName, price });
        nameInput.value = ''; qtyInput.value = ''; unitInput.value = ''; priceInput.value = '';
        totalInput.value = ''; nameInput.focus();
        renderInvoiceItems();
    }

    async function handleSaveInvoice(category) {
        toast('loading', 'Menyimpan faktur...');
        let creditorId = $('#inv-creditor').value;
        const projectId = $('#inv-project').value;
        const isFullyPaid = $('#inv-status').value === 'lunas';
        const date = new Date($('#inv-date').value);
        const notes = $('#inv-notes').value;
        const invoiceData = {
            creditorId,
            projectId: projectId || null,
            totalAmount: appState.currentInvoiceItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
            amountPaid: isFullyPaid ? appState.currentInvoiceItems.reduce((sum, item) => sum + (item.price * item.quantity), 0) : 0,
            isFullyPaid,
            date,
            notes,
            createdAt: serverTimestamp()
        };
        try {
            // Jika memilih supplier master, buat/ambil creditor pada kategori terkait
            if (creditorId.startsWith('master:')) {
                const masterId = creditorId.split(':')[1];
                const creditorCol = getExpenditureCreditorCol(category);
                const dupSnap = await getDocs(query(creditorCol, where('masterSupplierId','==', masterId)));
                let targetCreditorId;
                if (!dupSnap.empty) {
                    targetCreditorId = dupSnap.docs[0].id;
                } else {
                    const master = appState.suppliers.find(s => s.id === masterId);
                    const newRef = await addDoc(creditorCol, { masterSupplierId: masterId, creditorName: (master?.supplierName || master?.name || 'Supplier'), createdAt: serverTimestamp() });
                    targetCreditorId = newRef.id;
                }
                creditorId = targetCreditorId;
            }
            const invoiceCol = getInvoiceCol(category);
            const invoiceDocRef = await addDoc(invoiceCol, invoiceData);
            const invoiceId = invoiceDocRef.id;
            // Save invoice items
            const batch = writeBatch(db);
            for (const item of appState.currentInvoiceItems) {
                const itemRef = doc(collection(invoiceDocRef, 'items'));
                batch.set(itemRef, { name: item.name, quantity: item.quantity, unit: item.unitName, price: item.price });
            }
            await batch.commit();
            toast('success', 'Faktur berhasil disimpan.');
            // Update digital envelopes if operational
            if (category === 'operasional') {
                const total = invoiceData.totalAmount;
                await runTransaction(db, async (transaction) => {
                    const envDoc = await transaction.get(digitalEnvelopesDoc);
                    const currentUnallocated = envDoc.exists() ? (envDoc.data().unallocatedFunds || 0) : 0;
                    const newUnallocated = Math.max(0, currentUnallocated - total);
                    transaction.update(digitalEnvelopesDoc, { unallocatedFunds: newUnallocated });
                });
            }
            // If stock items (material) invoice, update stock
            if (category === 'material') {
                await updateStockFromInvoice(invoiceId);
            }
            // Re-render page content to show possibly updated budgets or stock
            if (appState.activePage === 'input-data') {
                renderInvoiceForm($('#sub-page-content'), category);
            }
        } catch (error) {
            toast('error', 'Gagal menyimpan faktur.');
            console.error("Error saving invoice:", error);
        }
    }

    async function fetchExpenditureCreditors(category) {
        try {
            const creditorsCol = getExpenditureCreditorCol(category);
            const snap = await getDocs(query(creditorsCol, orderBy('createdAt', 'desc')));
            appState.expenditureCreditors[category] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (error) {
            toast('error', 'Gagal memuat data kreditur.');
        }
    }

    async function updateStockFromInvoice(invoiceId) {
        try {
            const itemsSnap = await getDocs(collection(doc(getInvoiceCol('material'), invoiceId), 'items'));
            const items = itemsSnap.docs.map(d => d.data());
            const batch = writeBatch(db);
            let stockItemId = null;
            for (const item of items) {
                const q = query(stockItemsCol, where("itemName", "==", item.name), where("unit", "==", item.unit));
                const querySnapshot = await getDocs(q);
                const timestamp = serverTimestamp();
                if (querySnapshot.empty) {
                    const newStockItemRef = doc(stockItemsCol);
                    batch.set(newStockItemRef, {
                        itemName: item.name,
                        unit: item.unit,
                        currentStock: item.quantity,
                        createdAt: timestamp
                    });
                    stockItemId = newStockItemRef.id;
                } else {
                    const docRef = querySnapshot.docs[0].ref;
                    const currentStock = querySnapshot.docs[0].data().currentStock || 0;
                    batch.update(docRef, { currentStock: currentStock + item.quantity });
                    stockItemId = docRef.id;
                }
        
                const transactionRef = doc(stockTransactionsCol);
                batch.set(transactionRef, {
                    stockItemId: stockItemId,
                    itemName: item.name,
                    type: 'in',
                    quantity: item.quantity,
                    unit: item.unit,
                    date: Timestamp.now(),
                    notes: `Pembelian dari faktur ${invoiceId}`
                });
            }
            await batch.commit();
            toast('info', 'Stok material telah diperbarui.');
        } catch (error) {
            console.error("Error updating stock from invoice:", error);
        }
    }

    async function uploadFile(file, path) {
        const storageRef = ref(storage, `${path}/${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    }

    async function renderTagihanPage(container) { 
        container.innerHTML = `
            <div class="section-head"><h4>Manajemen Tagihan</h4></div>
            <div id="payroll-section" style="margin-bottom:2rem;"><h5 class="form-section-title">Tagihan Gaji Belum Dibayar</h5><div class="card card-pad"><p>Memuat...</p></div></div>
            <div id="unpaid-section"><h5 class="form-section-title">Tagihan Lainnya Belum Lunas</h5><div class="card card-pad"><p>Memuat...</p></div></div>
            <div id="paid-section" style="margin-top:2rem;"><h5 class="form-section-title">Riwayat Lunas</h5><div class="card card-pad"><p>Memuat...</p></div></div>`;
        try {
            const unpaidInvoicePromises = invoiceCategories.map(cat => getDocs(query(getInvoiceCol(cat), where("isFullyPaid", "==", false))));
            const unpaidLoanPromise = getDocs(query(fundingSourcesCol, where("type", "==", "Pinjaman"), where("isFullyPaid", "==", false)));
            const unpaidPayrollPromise = getDocs(query(payrollLiabilitiesCol, where("isPaid", "==", false)));
            
            const allPromises = [unpaidPayrollPromise, unpaidLoanPromise, ...unpaidInvoicePromises];
            const [unpaidPayrollSnap, unpaidLoanSnap, ...unpaidInvoiceSnaps] = await Promise.all(allPromises);

            let allUnpaidDebts = [];
            
            unpaidInvoiceSnaps.forEach((snap, index) => {
                const category = invoiceCategories[index];
                snap.docs.forEach(d => allUnpaidDebts.push({ ...d.data(), id: d.id, debtType: 'invoice', category }));
            });
            unpaidLoanSnap.docs.forEach(d => allUnpaidDebts.push({ ...d.data(), id: d.id, debtType: 'loan' }));

            allUnpaidDebts.sort((a, b) => b.date.seconds - a.date.seconds);

            let allUnpaidPayrolls = unpaidPayrollSnap.docs.map(d => ({ ...d.data(), id: d.id, debtType: 'payroll' }));
            allUnpaidPayrolls.sort((a, b) => b.endDate.seconds - a.endDate.seconds);

            renderPayrollTable($('#payroll-section .card'), allUnpaidPayrolls);
            renderDebtTable($('#unpaid-section .card'), allUnpaidDebts);

            $('#paid-section .card').innerHTML = '<p class="empty-state">Riwayat lunas belum diimplementasikan.</p>';

        } catch (error) { console.error("Error fetching debts:", error); toast('error', 'Gagal memuat data tagihan.'); }
    }
    
    function renderDebtTable(container, debts) {
        if (debts.length === 0) { container.innerHTML = `<p class="empty-state">Tidak ada tagihan faktur atau pinjaman.</p>`; return; }
        container.innerHTML = `
            <div class="search-box-wrapper"><span class="material-symbols-outlined">search</span><input type="search" class="search-box" placeholder="Cari tagihan..."></div>
            <div class="data-card-list">
                ${debts.map(debt => {
                    const isLoan = debt.debtType === 'loan';
                    const total = isLoan ? debt.totalRepayableAmount : debt.totalAmount;
                    const progress = total > 0 ? ((debt.amountPaid || 0) / total) * 100 : 100;
                    const badgeClass = isLoan ? 'badge--purple' : 'badge--blue';
                    const title = isLoan ? (debt.description || 'Pinjaman') : (debt.creditorName || 'Faktur');
                    const dateStr = debt.date?.toDate ? debt.date.toDate().toLocaleDateString('id-ID') : '';
                    return `
                    <div class="data-card is-collapsed" data-id="${debt.id}" data-type="${debt.debtType}" data-category="${debt.category || ''}">
                        <div class="data-card-header">
                            <div class="data-card-header-left">
                                <h5 class="data-card-title">${title}</h5>
                                <div class="data-card-subtitle">${dateStr}</div>
                            </div>
                            <div class="data-card-amount">${fmtIDR(total)}</div>
                            ${appState.userRole !== 'Viewer' ? `
                            <div class="data-card-actions">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        <button class="action-dropdown-item btn-pay" data-id="${debt.id}" data-type="${debt.debtType}" data-category="${debt.category || ''}"><span class="material-symbols-outlined">payments</span> Bayar</button>
                                    </div>
                                </div>
                            </div>` : ''}
                        </div>
                        <div class="data-card-body">
                            <div class="data-card-row data-row--hide-when-collapsed"><div class="data-card-row-left"><span class="material-symbols-outlined row-icon">category</span><span class="data-card-label">Jenis</span></div><span class="data-card-value"><span class="badge ${badgeClass}">${isLoan ? 'Pinjaman' : 'Faktur'}</span></span></div>
                            <div class="progress-wrapper ${progress >= 80 ? 'progress--high' : (progress >= 50 ? 'progress--mid' : '')}">
                                <div class="progress-label">${progress.toFixed(0)}%</div>
                                <div class="payment-progress-container"><div class="payment-progress-bar ${progress >= 80 ? 'is-high' : (progress >= 50 ? 'is-mid' : '')}" style="width:${progress}%;"></div></div>
                            </div>
                        </div>
                    </div>`;
                }).join('')}
            </div>`;

        attachCardBehaviors(container);
        attachContextualSearch(container);
        $$('.btn-pay').forEach(btn => btn.addEventListener('click', (e) => {
            const { id, type, category } = e.currentTarget.dataset;
            createModal('payment', { id, type, category });
            if (type === 'payroll') {
                $('#payment-date').value = todayStr();
            }
            $('#confirm-payment-btn').addEventListener('click', () => handleConfirmPayment(id, type, category));
        }));
    }

    function renderPayrollTable(container, payrolls) {
        if (payrolls.length === 0) { container.innerHTML = `<p class="empty-state">Tidak ada tagihan gaji.</p>`; return; }
        container.innerHTML = `
            <div class="search-box-wrapper"><span class="material-symbols-outlined">search</span><input type="search" class="search-box" placeholder="Cari gaji..."></div>
            <div class="data-card-list">
                ${payrolls.map(item => {
                    const start = item.startDate?.toDate ? item.startDate.toDate().toLocaleDateString('id-ID') : '';
                    const end = item.endDate?.toDate ? item.endDate.toDate().toLocaleDateString('id-ID') : '';
                    return `
                    <div class="data-card is-collapsed" data-id="${item.id}" data-type="payroll">
                        <div class="data-card-header">
                            <div class="data-card-header-left">
                                <h5 class="data-card-title">${item.workerName}</h5>
                                <div class="data-card-subtitle">${start} - ${end}</div>
                            </div>
                            <div class="data-card-amount">${fmtIDR(item.totalWage)}</div>
                            <div class="data-card-actions">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        <button class="action-dropdown-item btn-pay" data-id="${item.id}" data-type="payroll"><span class="material-symbols-outlined">payments</span> Bayar</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="data-card-body">
                            <div class="data-card-row"><div class="data-card-row-left"><span class="material-symbols-outlined row-icon">payments</span><span class="data-card-label">Total Gaji</span></div><span class="data-card-value">${fmtIDR(item.totalWage)}</span></div>
                        </div>
                    </div>`
                }).join('')}
            </div>`;
        $$('.btn-pay').forEach(btn => btn.addEventListener('click', (e) => {
            const { id, type, category } = e.currentTarget.dataset;
            createModal('payment', { id, type, category });
            if (type === 'payroll') $('#payment-date').value = todayStr();
            $('#confirm-payment-btn').addEventListener('click', () => handleConfirmPayment(id, type, category));
        }));
    }

    async function handleConfirmPayment(id, type, category, payload) {
        toast('loading', 'Memproses pembayaran...');
        try {
            if (type === 'payroll') {
                const dateStr = payload?.date || $('#payment-date')?.value || todayStr();
                const date = new Date(dateStr);
                await updateDoc(doc(payrollLiabilitiesCol, id), { isPaid: true, paymentDate: date });
                toast('success', 'Pembayaran gaji berhasil.');
                await logActivity('payment', 'payroll', id, { date: dateStr });
            } else if (type === 'loan') {
                await updateDoc(doc(fundingSourcesCol, id), { isFullyPaid: true });
                toast('success', 'Pinjaman lunas.');
                await logActivity('payment', 'loan', id, {});
            } else if (type === 'invoice') {
                const invDoc = doc(getInvoiceCol(category), id);
                await updateDoc(invDoc, { isFullyPaid: true, amountPaid: 0 }); // Assuming fully paid, no partial detail
                toast('success', 'Tagihan faktur lunas.');
                await logActivity('payment', 'invoice', id, { category });
            }
            // After payment, re-render Tagihan page sections
            if(appState.activePage === 'tagihan') renderTagihanPage($('#page-tagihan'));
        } catch (error) {
            toast('error', 'Gagal memproses pembayaran.');
            console.error("Error processing payment:", error);
        }
    }

    async function renderAbsensiPage(container) {
        container.innerHTML = `
            <div class="section-head">
                <h4>Absensi Pekerja</h4>
                <div style="display: flex; gap: 1rem; align-items: center;">
                    <input type="date" id="attendance-date-picker" value="${appState.attendanceDate}" class="w-full">
                    <button id="manage-workers-btn" class="btn btn-primary"><span class="material-symbols-outlined">group</span>Kelola</button>
                </div>
            </div>
            <div class="card card-pad" style="margin-top: 1.5rem;">
                <div class="form-section-header">
                    <h5 class="form-section-title">Daftar Kehadiran</h5>
                    <button id="mark-all-present-btn" class="btn btn-secondary btn-sm"><span class="material-symbols-outlined">checklist</span>Tandai Semua Hadir</button>
                </div>
                <div id="workers-list-container"><p>Memuat...</p></div>
            </div>
        `;
        $('#attendance-date-picker').addEventListener('change', (e) => {
            appState.attendanceDate = e.target.value;
            renderWorkersList();
        });
        $('#manage-workers-btn').addEventListener('click', () => createModal('manageWorkers'));
        $('#mark-all-present-btn').addEventListener('click', handleMarkAllPresent);
        renderWorkersList();
    }

    function renderWorkersCollectionTable(container) {
        if (!container) return;
        const workers = appState.workers;
        if (workers.length === 0) { container.innerHTML = '<p class="empty-state">Belum ada data pekerja.</p>'; return; }
        container.innerHTML = `
            <div class="data-card-list">
                ${workers.map(worker => `
                    <div class="data-card" data-id="${worker.id}">
                        <div class="data-card-header">
                            <h5 class="data-card-title">${worker.workerName}</h5>
                            <div class="data-card-actions">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        <button class="action-dropdown-item btn-edit-worker" data-id="${worker.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                                        <button class="action-dropdown-item action-dropdown-item--danger btn-delete-worker" data-id="${worker.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="data-card-body">
                            <div class="data-card-row"><span class="data-card-label">Jabatan</span><span class="data-card-value">${worker.position || '-'}</span></div>
                            <div class="data-card-row"><span class="data-card-label">Proyek</span><span class="data-card-value">${appState.projects.find(p => p.id === worker.projectId)?.projectName || 'N/A'}</span></div>
                            <div class="data-card-row"><span class="data-card-label">Upah Harian</span><span class="data-card-value">${fmtIDR(worker.dailyWage)}</span></div>
                        </div>
                    </div>
                `).join('')}
            </div>`;

        $$('#modal-workers-table-container .btn-edit-worker').forEach(btn => btn.addEventListener('click', e => {
            const worker = appState.workers.find(w => w.id === e.currentTarget.dataset.id);
            createModal('editWorker', worker);
        }));
        $$('#modal-workers-table-container .btn-delete-worker').forEach(btn => btn.addEventListener('click', e => {
            const workerId = e.currentTarget.dataset.id;
            createModal('confirmDelete', { title: 'Hapus Pekerja', onConfirm: () => handleDeleteWorker(workerId) });
        }));
    }
    
    async function renderWorkersList() {
        const container = $('#workers-list-container');
        if (!container) return;
        container.innerHTML = '<p>Memuat data pekerja dan absensi...</p>';
    
        try {
            const attendanceDocRef = doc(attendanceRecordsCol, appState.attendanceDate);
            const attendanceSnap = await getDoc(attendanceDocRef);
            const attendanceData = attendanceSnap.exists() ? attendanceSnap.data().records : {};
    
            if (appState.workers.length === 0) {
                container.innerHTML = '<p class="empty-state">Belum ada data pekerja. Silakan tambahkan melalui tombol "Kelola Pekerja".</p>';
                return;
            }
    
            const statusMap = {
                hadir_penuh: { text: 'Hadir Penuh', badge: 'hadir' },
                setengah_hari: { text: 'Setengah Hari', badge: 'setengah' },
                absen: { text: 'Absen', badge: 'alpha' },
            };
    
            container.innerHTML = `
                <div class="search-box-wrapper"><span class="material-symbols-outlined">search</span><input type="search" class="search-box" placeholder="Cari pekerja..."></div>
                <div class="data-card-list">
                    ${appState.workers.map(worker => {
                        const attendanceRecord = attendanceData[worker.id];
                        const statusInfo = statusMap[attendanceRecord?.status] || { text: 'Belum Absen', badge: 'belumabsen'};
                        const statusIcon = statusInfo.badge === 'hadir' ? 'check_circle' : (statusInfo.badge === 'setengah' ? 'timelapse' : (statusInfo.badge === 'belumabsen' ? 'help' : 'cancel'));
                        let statusText = statusInfo.text;
                        if (attendanceRecord?.overtime > 0) {
                            statusText += ` (+${attendanceRecord.overtime} jam lembur)`;
                        }
                        return `
                            <div class="data-card is-collapsed" data-id="${worker.id}">
                                <div class="data-card-header">
                                    <div class="data-card-header-left">
                                        <h5 class="data-card-title">${worker.workerName}</h5>
                                        <div class="data-card-subtitle">${worker.position || '-'}</div>
                                    </div>
                                    <div class="data-card-amount"><span class="badge badge--${statusInfo.badge}">${statusText}</span></div>
                                    <div class="data-card-actions">
                                        <button class="btn btn-secondary btn-sm btn-change-status" data-id="${worker.id}" data-name="${worker.workerName}">Ubah Status</button>
                                    </div>
                                </div>
                                <div class="data-card-body"></div>
                            </div>`;
                    }).join('')}
                </div>
            `;
            $$('.btn-change-status').forEach(btn => btn.addEventListener('click', e => {
                const { id, name } = e.currentTarget.dataset;
                createModal('changeStatus', { id, name });
            }));
        } catch (error) {
            container.innerHTML = '<p class="empty-state">Gagal memuat data absensi.</p>';
            console.error("Error fetching attendance records:", error);
        }
    }

    async function handleMarkAllPresent() {
        if (!confirm('Tandai semua pekerja hadir penuh hari ini?')) return;
        toast('loading', 'Menandai semua hadir...');
        try {
            const date = appState.attendanceDate;
            const allPresentRecords = {};
            for (const worker of appState.workers) {
                allPresentRecords[worker.id] = { status: 'hadir_penuh', overtime: 0 };
            }
            await setDoc(doc(attendanceRecordsCol, date), { records: allPresentRecords }, { merge: true });
            toast('success', 'Semua pekerja ditandai hadir.');
            renderWorkersList();
        } catch (error) {
            toast('error', 'Gagal menyimpan absensi massal.');
            console.error("Error marking all present:", error);
        }
    }

    async function handleSaveAttendance(uid, status, overtime) {
        toast('loading', 'Menyimpan absensi...');
        const date = appState.attendanceDate;
        try {
            const attendanceRef = doc(attendanceRecordsCol, date);
            if (status === 'belumabsen') {
                await updateDoc(attendanceRef, { [`records.${uid}`]: deleteField() });
            } else {
                await setDoc(attendanceRef, { records: { [uid]: { status, overtime } } }, { merge: true });
            }
            toast('success', 'Absensi disimpan.');
            if (appState.activePage === 'absensi') {
                renderWorkersList();
            }
        } catch (error) {
            if(!useBatch) toast('error', 'Gagal menyimpan absensi.');
            console.error("Attendance update error:", error);
        }
    }

    async function handleSaveWorker() {
        toast('loading', 'Menyimpan data pekerja...');
        const name = $('#worker-name').value;
        const position = $('#worker-position').value;
        const projectId = $('#worker-project').value;
        const dailyWage = Number($('#worker-daily-wage').value);
        try {
            await addDoc(workersCol, { workerName: name, position, projectId: projectId || null, dailyWage, createdAt: serverTimestamp() });
            toast('success', 'Pekerja berhasil ditambahkan.');
            // Refresh workers list
            await fetchWorkers();
            if (appState.activePage === 'absensi') {
                renderWorkersList();
            }
            if (appState.activePage === 'pengaturan') {
                renderPengaturanPage($('#page-pengaturan'));
            }
            closeModal();
        } catch (error) {
            toast('error', 'Gagal menyimpan pekerja.');
            console.error("Error saving worker:", error);
        }
    }

    async function handleDeleteWorker(workerId) {
        toast('loading', 'Menghapus pekerja...');
        try {
            await deleteDoc(doc(workersCol, workerId));
            toast('success', 'Pekerja telah dihapus.');
            await fetchWorkers();
            if (appState.activePage === 'absensi') {
                renderWorkersList();
            }
            if (appState.activePage === 'pengaturan') {
                renderPengaturanPage($('#page-pengaturan'));
            }
        } catch (error) {
            toast('error', 'Gagal menghapus pekerja.');
            console.error("Error deleting worker:", error);
        }
    }

    async function renderManajemenStokPage(container) {
        container.innerHTML = `
            <div class="section-head">
                <h4>Manajemen Stok Material</h4>
                <button id="add-stock-item-btn" class="btn btn-primary"><span class="material-symbols-outlined">add</span>Item Baru</button>
            </div>
            <div id="stock-items-container" style="margin-top: 1.5rem;"><p>Memuat...</p></div>
        `;
        $('#add-stock-item-btn').addEventListener('click', () => createModal('newStockItem'));
        renderStockItems();
    }

    async function renderStockItems() {
        const container = $('#stock-items-container');
        if (!container) return;
        try {
            const snap = await getDocs(query(stockItemsCol, orderBy('itemName')));
            appState.stockItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            if (appState.stockItems.length === 0) {
                container.innerHTML = '<p class="empty-state">Belum ada data stok.</p>';
                return;
            }
            container.innerHTML = `
                <div class="search-box-wrapper"><span class="material-symbols-outlined">search</span><input type="search" class="search-box" placeholder="Cari item..."></div>
                <div class="data-card-list">
                    ${appState.stockItems.map(item => `
                    <div class="data-card is-collapsed" data-id="${item.id}">
                        <div class="data-card-header">
                            <div class="data-card-header-left">
                                <h5 class="data-card-title">${item.itemName}</h5>
                                <div class="data-card-subtitle">${item.unit}</div>
                            </div>
                            <div class="data-card-amount">${item.currentStock} ${item.unit}</div>
                            <div class="data-card-actions">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        <button class="action-dropdown-item btn-record-usage" data-id="${item.id}"><span class="material-symbols-outlined">inventory</span> Catat Penggunaan</button>
                                        <button class="action-dropdown-item action-dropdown-item--danger btn-delete-stock" data-id="${item.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="data-card-body"></div>
                        </div>
                    `).join('')}
                </div>`;
            attachCardBehaviors(container);
            attachContextualSearch(container);
            attachCardBehaviors(container);
            attachContextualSearch(container);
            $$('.btn-record-usage').forEach(btn => btn.addEventListener('click', e => {
                const itemId = e.currentTarget.dataset.id;
                const item = appState.stockItems.find(i => i.id === itemId);
                createModal('recordStockUsage', { itemId, stockItemName: item.itemName });
                // Set default values in modal
                $('#usage-unit').value = item.unit;
                $('#stock-usage-qty').focus();
                // Save usage event
                $('#record-stock-usage-btn').addEventListener('click', () => handleRecordStockUsage(itemId, item));
            }));
            $$('.btn-delete-stock').forEach(btn => btn.addEventListener('click', e => {
                const itemId = e.currentTarget.dataset.id;
                createModal('confirmDelete', { title: 'Hapus Item Stok', onConfirm: () => handleDeleteStockItem(itemId) });
            }));
        } catch (error) {
            container.innerHTML = '<p class="empty-state">Gagal memuat data stok.</p>';
            console.error("Error fetching stock items:", error);
        }
    }

    async function handleSaveStockItem() {
        toast('loading', 'Menyimpan item...');
        const itemName = $('#stock-item-name').value;
        const unit = $('#stock-item-unit').value;
        const initialQty = Number($('#stock-item-initial').value);
        try {
            const timestamp = serverTimestamp();
            const newStockItemRef = await addDoc(stockItemsCol, { itemName, unit, currentStock: initialQty, createdAt: timestamp });
            // Record initial stock as transaction
            await addDoc(stockTransactionsCol, {
                stockItemId: newStockItemRef.id,
                itemName,
                type: 'in',
                quantity: initialQty,
                unit,
                date: Timestamp.now(),
                notes: 'Stok awal'
            });
            toast('success', 'Item stok berhasil ditambahkan.');
            renderStockItems();
            closeModal();
        } catch (error) {
            toast('error', 'Gagal menyimpan item stok.');
            console.error("Error saving stock item:", error);
        }
    }

    async function handleRecordStockUsage(itemId, itemData) {
        toast('loading', 'Menyimpan penggunaan...');
        const usageQtyInput = $('#stock-usage-qty');
        const usageNotesInput = $('#stock-usage-notes');
        if (!usageQtyInput) return;
        const usageQty = Number(usageQtyInput.value);
        const notes = usageNotesInput.value || '';
        if (isNaN(usageQty) || usageQty <= 0) {
            toast('error', 'Jumlah penggunaan tidak valid.');
            return;
        }
        try {
            // Deduct from stock item
            const stockItemRef = doc(stockItemsCol, itemId);
            await runTransaction(db, async (transaction) => {
                const itemDoc = await transaction.get(stockItemRef);
                if (!itemDoc.exists()) throw new Error("Item not found");
                const currentStock = itemDoc.data().currentStock || 0;
                if (usageQty > currentStock) throw new Error("Not enough stock");
                transaction.update(stockItemRef, { currentStock: currentStock - usageQty });
                // Record usage
                const transactionRef = doc(stockTransactionsCol);
                transaction.set(transactionRef, {
                    stockItemId: itemId,
                    itemName: itemData.itemName,
                    type: 'out',
                    quantity: usageQty,
                    unit: itemData.unit,
                    date: Timestamp.now(),
                    notes: notes || 'Penggunaan stok'
                });
            });
            toast('success', 'Penggunaan stok dicatat.');
            renderStockItems();
            closeModal();
        } catch (error) {
            toast('error', `Gagal mencatat penggunaan: ${error.message}`);
            console.error("Error recording stock usage:", error);
        }
    }

    async function handleDeleteStockItem(itemId) {
        toast('loading', 'Menghapus item stok...');
        try {
            // Also delete all transactions related to this item if needed (not implemented here)
            await deleteDoc(doc(stockItemsCol, itemId));
            toast('success', 'Item stok telah dihapus.');
            renderStockItems();
        } catch (error) {
            toast('error', 'Gagal menghapus item stok.');
            console.error("Error deleting stock item:", error);
        }
    }

    async function renderLaporanPage(container) {
        const today = todayStr();
        const firstDayOfMonth = today.slice(0, 8) + '01';
        container.innerHTML = `
            <div class="section-head"><h4>Laporan Keuangan</h4></div>
            <div class="card card-pad">
                <div class="form-group">
                    <label>Pilih Bulan</label>
                    <input type="month" id="report-month" value="${today.slice(0, 7)}">
                </div>
                <div class="form-group">
                    <button id="generate-report-btn" class="btn btn-primary">Generate Laporan</button>
                </div>
            </div>
            <div id="report-result-container" style="margin-top:1.5rem;"></div>
        `;
        $('#generate-report-btn').addEventListener('click', async () => {
            const month = $('#report-month').value;
            if (!month) return;
            const [year, monthNum] = month.split('-');
            const startDate = new Date(`${year}-${monthNum}-01`);
            const endDate = new Date(startDate);
            endDate.setMonth(endDate.getMonth() + 1);
            endDate.setDate(0); // last day of month
            // Generate dummy report (just as an example, actual implementation may vary)
            const reportData = {
                totalIncome: 0,
                totalExpenses: 0,
                netBalance: 0,
            };
            try {
                // Fetch incomes and expenses from Firestore (not implemented, assuming empty)
                // Example: fetch all funding sources within date range, etc.
                const incomes = 0;
                const expenses = 0;
                reportData.totalIncome = incomes;
                reportData.totalExpenses = expenses;
                reportData.netBalance = incomes - expenses;
                renderReportResult(reportData);
            } catch (error) {
                toast('error', 'Gagal menghasilkan laporan.');
                console.error("Error generating report:", error);
            }
        });
    }

    function renderReportResult(data) {
        const container = $('#report-result-container');
        if (!container) return;
        container.innerHTML = `
            <div class="card card-pad">
                <h5>Hasil Laporan</h5>
                <p>Total Pemasukan: ${fmtIDR(data.totalIncome)}</p>
                <p>Total Pengeluaran: ${fmtIDR(data.totalExpenses)}</p>
                <p>Saldo Bersih: ${fmtIDR(data.netBalance)}</p>
            </div>
        `;
    }

    async function renderPengaturanPage(container) {
        if (appState.userRole !== 'Owner') {
            container.innerHTML = `<div class="card card-pad"><p>Anda tidak memiliki izin membuka Pengaturan.</p></div>`;
            return;
        }
        container.innerHTML = `
            <div class="section-head"><h4>Pengaturan & Administrasi</h4></div>
            <div class="card card-pad" style="margin-bottom:1rem;">
                <h5>Master Data</h5>
                <div class="data-card-list" style="margin-top:.75rem;">
                    <div class="data-card" id="btn-manage-projects"><div class="data-card-header"><h5 class="data-card-title">Kelola Proyek</h5></div><div class="data-card-body"><div class="data-card-row"><span class="data-card-label">Tambah/Edit/Hapus Proyek</span><span class="material-symbols-outlined">chevron_right</span></div></div></div>
                    <div class="data-card" id="btn-manage-materials"><div class="data-card-header"><h5 class="data-card-title">Kelola Material</h5></div><div class="data-card-body"><div class="data-card-row"><span class="data-card-label">Master daftar material</span><span class="material-symbols-outlined">chevron_right</span></div></div></div>
                    <div class="data-card" id="btn-manage-suppliers"><div class="data-card-header"><h5 class="data-card-title">Kelola Supplier/Kreditur</h5></div><div class="data-card-body"><div class="data-card-row"><span class="data-card-label">Master supplier/kreditur</span><span class="material-symbols-outlined">chevron_right</span></div></div></div>
                </div>
            </div>
            <div class="card card-pad" style="margin-bottom:1rem;">
                <h5>Log Aktivitas</h5>
                <div class="search-box-wrapper" style="margin-top:.5rem;"><span class="material-symbols-outlined">search</span><input type="search" id="search-activity" class="search-box" placeholder="Cari aktivitas..."></div>
                <div id="activity-logs-container"><p>Memuat...</p></div>
            </div>
            <div class="card card-pad">
                <h5>Manajemen Pengguna</h5>
                <div id="members-table-container"><p>Memuat...</p></div>
            </div>
        `;
        $('#btn-manage-projects')?.addEventListener('click', () => createModal('manageProjects'));
        $('#btn-manage-materials')?.addEventListener('click', () => createModal('manageMaterials'));
        $('#btn-manage-suppliers')?.addEventListener('click', () => createModal('manageSuppliers'));
        await fetchMembers();
        renderMembersTable($('#members-table-container'));
        await fetchActivityLogs();
        renderActivityLogs($('#activity-logs-container'));
        $('#search-activity')?.addEventListener('input', (e) => filterActivityLogs(e.target.value));
    }

    async function handleDeleteDebt(id, type, category) {
        toast('loading','Menghapus transaksi...');
        try {
            if (type === 'invoice') {
                await deleteDoc(doc(getInvoiceCol(category), id));
            } else if (type === 'loan') {
                await deleteDoc(doc(fundingSourcesCol, id));
            }
            toast('success','Transaksi dihapus.');
            await logActivity('delete', type, id, { category });
            if(appState.activePage === 'tagihan') renderTagihanPage($('#page-tagihan'));
        } catch (e) { toast('error','Gagal menghapus.'); }
    }

    async function fetchMembers() {
        try {
            const snap = await getDocs(query(membersCol, orderBy('createdAt', 'desc')));
            const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            appState.teamMembers = members;
        } catch (error) {
            toast('error', 'Gagal memuat data anggota tim.');
            console.error("Error fetching members:", error);
        }
    }

    // Activity Logs (Owner only)
    async function fetchActivityLogs(limitCount = 100) {
        try {
            const snap = await getDocs(query(activityLogsCol, orderBy('createdAt', 'desc'), limit(limitCount)));
            appState.activityLogs = snap.docs.map(d => ({ id: d.id, ...d.data(), createdAt: d.data().createdAt }));
        } catch (e) { console.error('Error fetching activity logs:', e); }
    }

    function renderActivityLogs(container) {
        if (!container) return;
        const logs = appState.activityLogs || [];
        if (logs.length === 0) { container.innerHTML = '<p class="empty-state">Belum ada aktivitas.</p>'; return; }
        container.innerHTML = `
            <div class="data-card-list">
                ${logs.map(l => {
                    const when = l.createdAt?.toDate ? l.createdAt.toDate().toLocaleString('id-ID') : '';
                    const title = `${l.action} • ${l.targetType}`;
                    const subtitle = `${l.actorName || ''} (${l.actorEmail || ''})`;
                    return `<div class="data-card"><div class="data-card-header"><div class="data-card-header-left"><h5 class="data-card-title">${title}</h5><div class="data-card-subtitle">${subtitle}</div></div><div class="data-card-amount" title="${when}">${when}</div></div></div>`;
                }).join('')}
            </div>`;
    }

    function filterActivityLogs(q) {
        const list = $('#activity-logs-container .data-card-list'); if (!list) return;
        const queryText = (q || '').toLowerCase();
        list.querySelectorAll('.data-card').forEach(card => {
            card.style.display = card.textContent.toLowerCase().includes(queryText) ? '' : 'none';
        });
    }

    function renderMembersTable(container) {
        if (!container) return;
        const members = appState.teamMembers;
        if (members.length === 0) { container.innerHTML = '<p class="empty-state">Belum ada anggota tim.</p>'; return; }
        container.innerHTML = `
            <div class="search-box-wrapper"><span class="material-symbols-outlined">search</span><input type="search" class="search-box" placeholder="Cari anggota..."></div>
            <div class="data-card-list">
                ${members.map(member => {
                    const statusBadge = member.status === 'active' ? 'green' : (member.status === 'pending' ? 'orange' : 'red');
                    const statusIcon = member.status === 'active' ? 'verified_user' : (member.status === 'pending' ? 'hourglass_empty' : 'block');
                    const name = member.name || '(Tidak ada nama)';
                    const email = member.email || '';
                    const role = member.role || 'Viewer';
                    return `
                    <div class="data-card is-collapsed" data-id="${member.id}">
                        <div class="data-card-header">
                            <div class="data-card-header-left">
                                <h5 class="data-card-title">${name}</h5>
                                <div class="data-card-subtitle">${email}</div>
                            </div>
                            <div class="data-card-amount"><span class="badge ${role==='Owner' ? 'badge--role-owner' : (role==='Editor' ? 'badge--role-editor' : 'badge--role-viewer')}">${role}</span></div>
                            <div class="data-card-actions">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        ${member.status === 'pending' ? `<button class="action-dropdown-item btn-approve-user" data-id="${member.id}"><span class="material-symbols-outlined">check_circle</span> Setujui</button>` : ''}
                                        ${member.status === 'active' ? `<button class="action-dropdown-item action-dropdown-item--danger btn-revoke-user" data-id="${member.id}"><span class="material-symbols-outlined">block</span> Cabut Akses</button>` : ''}
                                        <button class="action-dropdown-item btn-set-role" data-id="${member.id}"><span class="material-symbols-outlined">manage_accounts</span> Ubah Peran</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="data-card-body">
                            <div class="data-card-row data-row--hide-when-collapsed"><span class="data-card-label">Status</span><span class="data-card-value"><span class="badge ${member.status==='active'?'badge--green':'badge--gray'}">${member.status}</span></span></div>
                        </div>
                    </div>`
                }).join('')}
            </div>`;
        attachCardBehaviors(container);
        attachContextualSearch(container);

        $$('.btn-approve-user').forEach(btn => btn.addEventListener('click', e => {
            const uid = e.currentTarget.dataset.id;
            handleUserStatus(uid, 'active');
        }));
        $$('.btn-revoke-user').forEach(btn => btn.addEventListener('click', e => {
            const uid = e.currentTarget.dataset.id;
            handleUserStatus(uid, 'revoked');
        }));
        $$('.btn-set-role').forEach(btn => btn.addEventListener('click', e => {
            const uid = e.currentTarget.dataset.id;
            const member = appState.teamMembers.find(m => m.id === uid);
            createModal('setUserRole', { id: uid, currentRole: member?.role || 'Viewer' });
        }));
    }

    async function handleUserStatus(uid, newStatus) {
        try {
            const payload = newStatus === 'active' ? { status: 'active', role: 'Viewer' } : { status: newStatus };
            await updateDoc(doc(membersCol, uid), payload);
            await logActivity('user_status_change','member', uid, payload);
            toast('success', 'Status diperbarui.');
            renderPengaturanPage($('#page-pengaturan'));
        } catch (error) { toast('error', 'Gagal memperbarui.'); }
    }
    // Log wrapper for role changes
    async function handleUserRole(uid, newRole) {
        try { await updateDoc(doc(membersCol, uid), { role: newRole }); await logActivity('user_role_change','member', uid, { role: newRole }); toast('success','Peran diperbarui.'); } catch (error) { toast('error','Gagal memperbarui.'); }
    }

    // ===== Inisialisasi Aplikasi =====
    
    function init() {
        applyThemeFromStorage();
        injectPageTemplates();
        const { authBtn, authDropdownBtn, openNavBtn, scrim, userProfileBtn, notificationBtn, themeToggleBtn, searchBtn, settingsBtn, toggleThemeBtn } = getUIElements();
        const handleAuthAction = () => appState.currentUser ? createModal('confirmLogout') : createModal('login');
        if (authBtn) authBtn.addEventListener('click', handleAuthAction);
        if (authDropdownBtn) authDropdownBtn.addEventListener('click', () => { $('#user-dropdown')?.classList.add('hidden'); handleAuthAction(); });
        $$('.nav-item[data-nav]').forEach(btn => btn.addEventListener('click', () => {
            appState.activePage = btn.dataset.nav; localStorage.setItem('lastActivePage', appState.activePage);
            renderUI();
            if (window.innerWidth < 901) {
                if (openNavBtn) openNavBtn.classList.remove('is-active');
                $('#sidebar')?.classList.remove('open');
                if (scrim) scrim.classList.remove('show');
            }
        }));
        // FAB actions
        const fabBtn = $('#fab-btn');
        const fabMenu = $('#fab-menu');
        if (fabBtn) fabBtn.addEventListener('click', () => { fabBtn.classList.toggle('open'); fabMenu?.classList.toggle('show'); });
        $$('#fab-menu .fab-menu-item').forEach(btn => btn.addEventListener('click', () => {
            const action = btn.dataset.action;
            if (action === 'add-expense') { appState.activePage = 'input-data'; localStorage.setItem('lastActivePage', appState.activePage); renderUI(); }
            if (action === 'add-income') { appState.activePage = 'pemasukan-pinjaman'; localStorage.setItem('lastActivePage', appState.activePage); renderUI(); }
            if (action === 'add-attendance') { appState.activePage = 'absensi'; localStorage.setItem('lastActivePage', appState.activePage); renderUI(); }
            if (fabBtn) fabBtn.classList.remove('open');
            if (fabMenu) fabMenu.classList.remove('show');
        }));
        if (openNavBtn) openNavBtn.addEventListener('click', () => {
            openNavBtn.classList.toggle('is-active');
            $('#sidebar')?.classList.toggle('open');
            if (scrim) scrim.classList.toggle('show');
        });
        if (scrim) scrim.addEventListener('click', () => {
            if (openNavBtn) openNavBtn.classList.remove('is-active');
            $('#sidebar')?.classList.remove('open');
            scrim.classList.remove('show');
        });
        // Nonaktifkan global search dan tombol tema header; gunakan opsi di profil
        if (searchBtn) searchBtn.style.display = 'none';
        if (themeToggleBtn) themeToggleBtn.style.display = 'none';
        if (settingsBtn) settingsBtn.addEventListener('click', () => { appState.activePage = 'pengaturan'; localStorage.setItem('lastActivePage', appState.activePage); renderUI(); $('#user-dropdown')?.classList.add('hidden'); });
        if (toggleThemeBtn) toggleThemeBtn.addEventListener('click', () => { toggleTheme(); });
        const toggleDropdown = (id) => (e) => { e.stopPropagation(); $$('.dropdown-panel').forEach(d => { if (d.id !== id) d.classList.add('hidden'); }); $(`#${id}`)?.classList.toggle('hidden'); };
        if (userProfileBtn) userProfileBtn.addEventListener('click', toggleDropdown('user-dropdown'));
        if (notificationBtn) notificationBtn.addEventListener('click', toggleDropdown('notification-dropdown'));
    
        // PENYESUAIAN PROFESIONAL: Event Listener Global yang Lebih Cerdas
        document.addEventListener('click', (e) => {
            const target = e.target;
            // Menutup dropdown (User, Notif, Custom Select) saat klik di luar
            if (!target.closest('.user-profile-wrapper')) $('#user-dropdown')?.classList.add('hidden');
            if (!target.closest('.notification-wrapper')) $('#notification-dropdown')?.classList.add('hidden');
            if (!target.closest('.custom-select-wrapper')) $$('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
            
            // Logika Cerdas untuk Action Menu di Tabel (Titik Tiga)
            const clickedActionBtn = target.closest('.action-menu-btn');
            const allActionDropdowns = $$('.action-dropdown');
    
            if (clickedActionBtn) {
                const parentMenu = clickedActionBtn.closest('.action-menu');
                const targetDropdown = parentMenu?.querySelector('.action-dropdown');
                if (!targetDropdown) return;
    
                const isHidden = targetDropdown.classList.contains('hidden');
                allActionDropdowns.forEach(d => d.classList.add('hidden'));
                if (isHidden) targetDropdown.classList.remove('hidden');
            } else {
                // Klik di luar action menu menutup semua dropdown aksi
                allActionDropdowns.forEach(d => d.classList.add('hidden'));
            }

            // Delegasi aksi universal Edit/Hapus/Bayar pada kartu
            const editDebtBtn = target.closest('.btn-edit-debt');
            if (editDebtBtn) {
                const { id, type, category } = editDebtBtn.dataset;
                createModal('editDebt', { id, type, category });
                return;
            }
            const delDebtBtn = target.closest('.btn-del-debt');
            if (delDebtBtn) {
                const { id, type, category } = delDebtBtn.dataset;
                createModal('confirmDelete', { title: 'Hapus Transaksi', onConfirm: () => handleDeleteDebt(id, type, category) });
                return;
            }
            const editFundingBtn = target.closest('.btn-edit-funding');
            if (editFundingBtn) {
                const id = editFundingBtn.dataset.id;
                createModal('editFunding', { id });
                return;
            }
        });
    }

    function handleGlobalSearch(e) {
        const searchTerm = e.target.value.toLowerCase();
        const resultsContainer = $('#search-results');
        const navItems = [
            { id: 'dashboard', name: 'Dashboard' },
            { id: 'pemasukan-pinjaman', name: 'Pemasukan & Pinjaman' },
            { id: 'alokasi-anggaran', name: 'Alokasi Anggaran' },
            { id: 'input-data', name: 'Input Pengeluaran' },
            { id: 'absensi', name: 'Absensi Pekerja' },
            { id: 'tagihan', name: 'Manajemen Tagihan' },
            { id: 'manajemen-stok', name: 'Manajemen Stok' },
            { id: 'laporan', name: 'Laporan Keuangan' },
            { id: 'pengaturan', name: 'Pengaturan' },
        ];

        const filteredItems = navItems.filter(item => item.name.toLowerCase().includes(searchTerm));
        
        if (filteredItems.length > 0) {
            resultsContainer.innerHTML = filteredItems.map(item => 
                `<button class="search-result-item" data-nav="${item.id}">
                    <span class="material-symbols-outlined">arrow_forward</span>
                    <span>${item.name}</span>
                </button>`
            ).join('');
            resultsContainer.querySelectorAll('.search-result-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    appState.activePage = btn.dataset.nav;
                    localStorage.setItem('lastActivePage', appState.activePage);
                    closeModal();
                    renderUI();
                });
            });
        } else {
            resultsContainer.innerHTML = '<p class="empty-state">Halaman tidak ditemukan.</p>';
        }
    }

    function getUIElements() {
        return {
            sidebar: $('#sidebar'), scrim: $('#scrim'), openNavBtn: $('#btnOpenNav'), themeToggleBtn: $('#theme-toggle-btn'), userProfileBtn: $('#user-profile-btn'), notificationBtn: $('#notification-btn'), authBtn: $('#auth-btn'), authDropdownBtn: $('#auth-dropdown-btn'),
            statusDot: $('#connection-status .status-dot'), userAvatar: $('#user-avatar'), dropdownAvatar: $('#user-dropdown-avatar'), dropdownName: $('#user-dropdown-name'), dropdownEmail: $('#user-dropdown-email'),
            roleSection: $('#user-role-section'), roleIcon: $('#user-role-icon'), roleText: $('#user-role-text'), authDropdownBtnText: $('#auth-dropdown-btn span:last-child'), authDropdownBtnIcon: $('#auth-dropdown-btn .material-symbols-outlined'),
            searchBtn: $('#global-search-btn'), settingsBtn: $('#open-settings-btn'), toggleThemeBtn: $('#toggle-theme-btn'), toggleThemeIcon: $('#toggle-theme-icon'), toggleThemeText: $('#toggle-theme-text'),
        };
    }

    function applyThemeFromStorage() {
        const pref = localStorage.getItem('theme');
        const isDark = pref === 'dark' || (!pref && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
        document.body.classList.toggle('dark-theme', isDark);
        const icon = $('#toggle-theme-icon'); const text = $('#toggle-theme-text');
        if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        if (text) text.textContent = 'Ganti Tema';
    }

    function toggleTheme() {
        const isDark = document.body.classList.toggle('dark-theme');
        localStorage.setItem('theme', isDark ? 'dark' : 'light');
        const icon = $('#toggle-theme-icon'); const text = $('#toggle-theme-text');
        if (icon) icon.textContent = isDark ? 'light_mode' : 'dark_mode';
        if (text) text.textContent = 'Ganti Tema';
    }
    function injectPageTemplates() {
        const container = $('.page-container');
        if (!container || container.childElementCount > 0) return;
        const pages = ['dashboard', 'pemasukan-pinjaman', 'alokasi-anggaran', 'input-data', 'absensi', 'tagihan', 'manajemen-stok', 'laporan', 'pengaturan'];
        container.innerHTML = pages.map(id => `<main id="page-${id}" class="page"></main>`).join('');
    }

    init();
});
