// @ts-check
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { 
    getAuth, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    signOut
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
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
    limit,
    getDocs,
    addDoc,
    orderBy,
    Timestamp,
    deleteDoc,
    where,
    runTransaction,
    writeBatch,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

// Pastikan Chart.js sudah dimuat dari HTML
const Chart = window.Chart;

document.addEventListener('DOMContentLoaded', () => {
    // ===== Logika untuk memeriksa tema tersimpan =====
    const theme = localStorage.getItem('theme');
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    }

    // ===== Konfigurasi & State Global =====
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

    // ===== Helper & Utilitas =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const fmtIDR = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const todayStr = (date = new Date()) => date.toISOString().slice(0, 10);
    
    function formatRupiahInput(inputElement) {
        if (!inputElement) return;
        inputElement.addEventListener('input', function(e) {
            let value = e.target.value.replace(/[^,\d]/g, '').toString();
            const split = value.split(',');
            let rupiah = split[0].replace(/\B(?=(\d{3})+(?!\d))/g, ".");
            e.target.value = split[1] !== undefined ? rupiah + ',' + split[1] : rupiah;
        });
    }

    function getNumericValue(formattedString) {
        return formattedString ? parseFloat(String(formattedString).replace(/\./g, '').replace(',', '.')) : 0;
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
        const updateTriggerText = () => { const selectedOption = selectElement.options[selectElement.selectedIndex]; trigger.textContent = selectedOption ? selectedOption.textContent : 'Pilih...'; };
        Array.from(selectElement.options).forEach((optionEl, index) => {
            const option = document.createElement('div');
            option.className = 'custom-select-option';
            option.textContent = optionEl.textContent;
            option.dataset.value = optionEl.value;
            if (optionEl.selected) option.classList.add('selected');
            option.addEventListener('click', () => {
                selectElement.selectedIndex = index;
                const changeEvent = new Event('change', { bubbles: true });
                selectElement.dispatchEvent(changeEvent);
                updateTriggerText();
                wrapper.classList.remove('open');
                optionsContainer.querySelectorAll('.selected').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
            });
            optionsContainer.appendChild(option);
        });
        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            $$('.custom-select-wrapper.open').forEach(openWrapper => { if(openWrapper !== wrapper) openWrapper.classList.remove('open'); });
            wrapper.classList.toggle('open');
        });
        updateTriggerText();
        return wrapper;
    }

    const appState = {
        currentUser: null, userRole: 'Guest', userStatus: null, roleUnsub: null,
        activePage: localStorage.getItem('lastActivePage') || 'dashboard',
        fundingCreditors: [],
        expenditureCreditors: { operasional: [], material: [], lainnya: [] },
        projects: [], 
        stockItems: [], workers: [],
        digitalEnvelopes: null,
        notifications: [],
        notifUnsub: null,
        attendanceDate: todayStr(),
        reports: { financialChart: null },
        cachedSuggestions: { itemNames: new Set() },
        currentInvoiceItems: [],
    };
    
    // ===== Inisialisasi Firebase & Referensi (Struktur Baru) =====
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    const membersCol = collection(db, 'teams', TEAM_ID, 'members');
    const fundingCreditorsCol = collection(db, 'teams', TEAM_ID, 'funding_creditors');
    function getExpenditureCreditorCol(category) { const cat = category === 'subkontraktor' ? 'lainnya' : category; return collection(db, 'teams', TEAM_ID, `${cat}_creditors`); }
    function getInvoiceCol(category) { const cat = category === 'subkontraktor' ? 'lainnya' : category; return collection(db, 'teams', TEAM_ID, `${cat}_invoices`); }
    const invoiceCategories = ['operasional', 'material', 'lainnya'];
    const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
    const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    const workersCol = collection(db, 'teams', TEAM_ID, 'workers');
    const attendanceCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
    const payrollLiabilitiesCol = collection(db, 'teams', TEAM_ID, 'payroll_liabilities');
    const stockItemsCol = collection(db, 'teams', TEAM_ID, 'stock_items');
    const stockTransactionsCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
    const digitalEnvelopesDoc = doc(db, 'teams', TEAM_ID, 'envelopes', 'main_budget');
    const notificationsCol = collection(db, 'teams', TEAM_ID, 'notifications');

    const NAV_PAGES = [
        { id: 'dashboard', name: 'Dashboard' },
        { id: 'pemasukan-pinjaman', name: 'Pemasukan & Pinjaman' },
        { id: 'alokasi-anggaran', name: 'Alokasi Anggaran' },
        { id: 'pembayaran-digital', name: 'Pembayaran Digital' },
        { id: 'pembelian', name: 'Pembelian' },
        { id: 'input-data', name: 'Input Pengeluaran' },
        { id: 'absensi', name: 'Absensi' },
        { id: 'manajemen-stok', name: 'Manajemen Stok' },
        { id: 'tagihan', name: 'Tagihan' },
        { id: 'laporan', name: 'Laporan' },
        { id: 'pengaturan', name: 'Pengaturan' },
    ];

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
            case 'login': return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Login atau Buat Akun</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Hubungkan akun Google Anda untuk mengakses semua fitur.</p></div><div class="modal-footer"><button id="google-login-btn" class="btn btn-primary"><svg style="width:20px;height:20px" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg><span>Masuk dengan Google</span></button></div></div>`;
            case 'confirmLogout': return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Konfirmasi Keluar</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Apakah Anda yakin ingin keluar?</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button></div></div>`;
            case 'confirmDelete': return `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>${data.title || 'Konfirmasi Hapus'}</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>${data.message || 'Anda yakin ingin menghapus item ini? Tindakan ini tidak dapat diurungkan.'}</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-delete-btn" class="btn btn-danger">Ya, Hapus</button></div></div>`;
            case 'newCreditor': case 'editCreditor':
                const titleCreditor = data.creditorType === 'funding' ? (isEdit ? 'Edit Pemberi Dana' : 'Tambah Pemberi Dana') : (isEdit ? 'Edit Kreditur' : 'Tambah Kreditur Baru');
                const placeholder = data.creditorType === 'funding' ? 'Contoh: Bank ABC' : 'Contoh: Toko Bangunan Sejahtera';
                return `<form class="modal-content" id="creditor-form"><div class="modal-header"><h4>${titleCreditor}</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label for="creditor-name">Nama</label><input type="text" id="creditor-name" required placeholder="${placeholder}" value="${isEdit ? (data.name || '') : ''}"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form>`;
            case 'manageCreditors':
                const manageTitle = data.creditorType === 'funding' ? 'Kelola Pemberi Dana' : `Kelola Kreditur ${data.category || ''}`;
                return `<div class="modal-content" style="max-width: 700px;">
                    <div class="modal-header">
                        <h4>${manageTitle}</h4>
                        <button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions-bar">
                            <button id="add-new-creditor-in-modal" class="btn btn-primary" title="Tambah Baru">
                                <span class="material-symbols-outlined">add</span>
                            </button>
                        </div>
                        <div id="modal-creditors-table-container">
                            <p>Memuat data...</p>
                        </div>
                    </div>
                </div>`;
            case 'manageWorkers':
                return `<div class="modal-content" style="max-width: 900px;">
                    <div class="modal-header">
                        <h4>Kelola Data Pekerja</h4>
                        <button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button>
                    </div>
                    <div class="modal-body">
                        <div class="modal-actions-bar">
                             <button id="add-new-worker-in-modal" class="btn btn-primary" title="Tambah Pekerja Baru">
                                <span class="material-symbols-outlined">person_add</span>
                            </button>
                        </div>
                        <div id="modal-workers-table-container">
                            <p>Memuat data...</p>
                        </div>
                    </div>
                </div>`;
            case 'editFundingSource':
                const projectOptions = appState.projects.map(p => `<option value="${p.id}" ${data.projectId === p.id ? 'selected' : ''}>${p.projectName}</option>`).join('');
                const creditorOptions = appState.fundingCreditors.map(c => `<option value="${c.id}" ${data.creditorId === c.id ? 'selected' : ''}>${c.name}</option>`).join('');
                return `<form id="funding-source-form-edit" class="modal-content">
                    <div class="modal-header"><h4>Edit Pemasukan</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div>
                    <div class="modal-body">
                        <div class="form-grid-invoice">
                            <div class="form-group"><label>Tanggal</label><input type="date" id="fs-date-edit" value="${data.date.toDate().toISOString().slice(0, 10)}" required></div>
                            <div class="form-group"><label>Jenis</label><select id="fs-type-edit" required ${data.type === 'Pinjaman' ? 'disabled' : ''}><option value="Pencairan Termin" ${data.type === 'Pencairan Termin' ? 'selected' : ''}>Pencairan Termin</option><option value="Pinjaman" ${data.type === 'Pinjaman' ? 'selected' : ''}>Pinjaman</option></select></div>
                            <div class="form-group span-2"><label>Pemberi Dana</label><select id="fs-creditor-edit" required>${creditorOptions}</select></div>
                            <div id="fs-project-wrapper-edit" class="form-group span-2 ${data.type !== 'Pinjaman' ? 'hidden' : ''}"><label>Dibebankan ke Proyek</label><select id="fs-project-edit" required ${data.type === 'Pinjaman' ? 'disabled' : ''}>${projectOptions}</select></div>
                            <div class="form-group span-2"><label>Keterangan</label><input type="text" id="fs-desc-edit" value="${data.description}" required></div>
                            <div class="form-group"><label>Jumlah</label><input type="text" id="fs-amount-edit" value="${new Intl.NumberFormat('id-ID').format(data.amount)}" required></div>
                        </div>
                    </div>
                    <div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Perubahan</button></div>
                </form>`;
            case 'payment':
                const isLoan = data.context === 'loan';
                const isPayroll = data.context === 'payroll';
                let titlePay, idLabel, idValue, total, remaining;

                if (isPayroll) {
                    titlePay = 'Pembayaran Gaji';
                    idLabel = 'Periode Gaji';
                    idValue = `${data.startDate.toDate().toLocaleDateString('id-ID')} - ${data.endDate.toDate().toLocaleDateString('id-ID')}`;
                    total = data.totalLiability;
                    remaining = total - (data.amountPaid || 0);
                } else {
                    titlePay = isLoan ? 'Input Pembayaran Pinjaman' : 'Input Pembayaran Faktur';
                    idLabel = isLoan ? 'Deskripsi Pinjaman' : 'No. Faktur';
                    idValue = isLoan ? data.description : data.invoiceNumber;
                    total = isLoan ? data.totalRepayableAmount : data.totalAmount;
                    remaining = total - (data.amountPaid || 0);
                }
                
                return `<form id="payment-form" class="modal-content"><div class="modal-header"><h4>${titlePay}</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="payment-details"><div class="payment-detail-item"><span>${idLabel}</span><strong>${idValue}</strong></div><div class="payment-detail-item"><span>Total Tagihan</span><strong>${fmtIDR(total)}</strong></div></div><div class="form-group"><label for="payment-amount">Nominal</label><input type="text" id="payment-amount" value="${new Intl.NumberFormat('id-ID').format(remaining)}" required></div><div class="form-group"><label for="payment-date">Tanggal</label><input type="date" id="payment-date" value="${todayStr()}" required></div><div class="payment-summary"><span>Sisa Tagihan:</span><strong id="remaining-balance-preview">${fmtIDR(0)}</strong></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form>`;
            case 'newProject': case 'editProject':
                return `<form class="modal-content" id="project-form"><div class="modal-header"><h4>${isEdit ? 'Edit Proyek' : 'Tambah Proyek Baru'}</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label for="project-name">Nama Proyek</label><input type="text" id="project-name" required placeholder="Contoh: Proyek Renovasi Kantor" value="${isEdit ? (data.projectName || '') : ''}"></div><div class="form-group"><label for="project-desc">Deskripsi Singkat</label><textarea id="project-desc" placeholder="Opsional">${isEdit ? (data.description || '') : ''}</textarea></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form>`;
            case 'globalSearch': return `<div class="modal-content search-modal-content"><div class="search-input-wrapper"><span class="material-symbols-outlined">search</span><input type="text" id="global-search-input" placeholder="Ketik untuk mencari halaman..."></div><div class="modal-body search-results-wrapper" id="search-results"><p class="empty-state">Mulai ketik untuk mencari navigasi...</p></div></div>`;
            case 'attendanceStatus': 
                return `<div class="modal-content" style="max-width:450px">
                    <div class="modal-header"><h4>Pilih Status Kehadiran</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div>
                    <div class="modal-body">
                        <p>Pekerja: <strong>${data.workerName}</strong></p>
                        <div class="status-buttons">
                            <button class="btn status-btn--hadir" data-status="hadir_penuh"><span class="material-symbols-outlined">check_circle</span> Hadir Penuh</button>
                            <button class="btn status-btn--setengah" data-status="setengah_hari"><span class="material-symbols-outlined">hourglass_top</span> Setengah Hari</button>
                            <button class="btn status-btn--absen" data-status="absen"><span class="material-symbols-outlined">cancel</span> Absen</button>
                        </div>
                        <div class="form-group" style="margin-top: 1.5rem;">
                            <label for="overtime-hours">Jam Lembur (Opsional)</label>
                            <input type="number" id="overtime-hours" placeholder="0">
                        </div>
                    </div>
                </div>`;
            case 'newWorker': case 'editWorker':
                 return `<div id="worker-modal" class="modal-bg"><form id="worker-form" class="modal-content"><div class="modal-header"><h4>${isEdit ? 'Edit Data' : 'Tambah'} Pekerja</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label for="worker-name">Nama Pekerja</label><input type="text" id="worker-name" value="${isEdit ? data.workerName : ''}" required></div><div class="form-group"><label for="worker-position">Jabatan</label><input type="text" id="worker-position" value="${isEdit ? data.position : ''}" required></div><div class="form-group"><label for="worker-wage">Upah Harian (Rp)</label><input type="text" id="worker-wage" value="${isEdit ? new Intl.NumberFormat('id-ID').format(data.dailyWage) : ''}" required></div><div class="form-group"><label for="worker-overtime">Upah Lembur/Jam (Rp)</label><input type="text" id="worker-overtime" value="${isEdit && data.overtimeRate ? new Intl.NumberFormat('id-ID').format(data.overtimeRate) : ''}" required></div><div class="form-group"><label for="worker-payment-cycle">Siklus Gaji</label><select id="worker-payment-cycle" required><option value="harian" ${isEdit && data.paymentCycle === 'harian' ? 'selected' : ''}>Harian</option><option value="mingguan" ${isEdit && data.paymentCycle === 'mingguan' ? 'selected' : ''}>Mingguan</option><option value="bulanan" ${isEdit && data.paymentCycle === 'bulanan' ? 'selected' : ''}>Bulanan</option></select></div><div class="form-group full"><label for="worker-project">Proyek Utama</label><select id="worker-project" required>${appState.projects.map(p => `<option value="${p.id}" ${isEdit && data.projectId === p.id ? 'selected' : ''}>${p.projectName}</option>`).join('')}</select></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
            case 'newStockItem': case 'editStockItem':
                 return `<div id="stock-item-modal" class="modal-bg"><form id="stock-item-form" class="modal-content"><div class="modal-header"><h4>${isEdit ? 'Edit' : 'Tambah'} Master Material</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label for="stock-item-name">Nama Material</label><input type="text" id="stock-item-name" value="${isEdit ? data.itemName : ''}" required></div><div class="form-group"><label for="stock-item-unit">Satuan</label><input type="text" id="stock-item-unit" value="${isEdit ? data.unit : ''}" placeholder="Contoh: sak, btg, m3" required></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
            case 'recordStockUsage':
                 return `<div id="stock-usage-modal" class="modal-bg"><form id="stock-usage-form" class="modal-content"><div class="modal-header"><h4>Catat Penggunaan Material</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label for="usage-item">Pilih Material</label><select id="usage-item" required>${appState.stockItems.map(i => `<option value="${i.id}">${i.itemName} (${i.unit})</option>`).join('')}</select></div><div class="form-group"><label for="usage-qty">Jumlah Digunakan</label><input type="number" id="usage-qty" required></div><div class="form-group"><label for="usage-date">Tanggal</label><input type="date" id="usage-date" value="${todayStr()}" required></div><div class="form-group full"><label for="usage-notes">Keterangan</label><textarea id="usage-notes" placeholder="Contoh: Untuk pengecoran lantai 2"></textarea></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
            default: return null;
        }
    }
    
    function attachModalEventListeners(type, data, closeModalFunc, modalEl) {
        if (type === 'login') modalEl.querySelector('#google-login-btn')?.addEventListener('click', signInWithGoogle);
        if (type === 'confirmLogout') modalEl.querySelector('#confirm-logout-btn')?.addEventListener('click', handleLogout);
        if (type === 'confirmDelete') modalEl.querySelector('#confirm-delete-btn')?.addEventListener('click', () => { if (data.onConfirm) data.onConfirm(); closeModalFunc(); });
        if (type === 'newCreditor' || type === 'editCreditor') modalEl.querySelector('#creditor-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleSaveCreditor(data); });
        if (type === 'newProject' || type === 'editProject') modalEl.querySelector('#project-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleSaveProject(data); });
        if (type === 'manageCreditors') {
            const container = $('#modal-creditors-table-container');
            if (data.creditorType === 'funding') {
                renderFundingCreditorsTable(container);
            } else {
                renderExpenditureCreditorsTable(container, data.category);
            }
            $('#add-new-creditor-in-modal').addEventListener('click', () => createModal('newCreditor', { 
                creditorType: data.creditorType, 
                category: data.category 
            }));
        }
        if (type === 'manageWorkers') {
            renderWorkersCollectionTable($('#modal-workers-table-container'));
            $('#add-new-worker-in-modal').addEventListener('click', () => createModal('newWorker', {}));
        }
        if (type === 'editFundingSource') {
            formatRupiahInput($('#fs-amount-edit'));
            createCustomSelect($('#fs-type-edit'));
            createCustomSelect($('#fs-creditor-edit'));
            createCustomSelect($('#fs-project-edit'));
            modalEl.querySelector('#funding-source-form-edit')?.addEventListener('submit', (e) => { e.preventDefault(); handleSaveFundingSource(e, data); });
        }
        if (type === 'payment') {
            const paymentInput = $('#payment-amount');
            formatRupiahInput(paymentInput);
            const previewEl = $('#remaining-balance-preview');
            const total = data.context === 'payroll' ? data.totalLiability : (data.context === 'loan' ? data.totalRepayableAmount : data.totalAmount);
            const updatePreview = () => { const payment = getNumericValue(paymentInput.value); previewEl.textContent = fmtIDR((total - (data.amountPaid || 0)) - payment); };
            paymentInput.addEventListener('input', updatePreview);
            updatePreview();
            modalEl.querySelector('#payment-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                const amount = getNumericValue(paymentInput.value);
                const date = $('#payment-date').value;
                if (data.onConfirm) data.onConfirm(amount, date);
                closeModalFunc();
            });
        }
        if (type === 'globalSearch') {
            const searchInput = $('#global-search-input');
            searchInput.focus();
            searchInput.addEventListener('input', handleGlobalSearch);
        }
        if (type === 'attendanceStatus') {
            modalEl.querySelectorAll('.status-buttons button').forEach(btn => btn.addEventListener('click', () => { 
                const overtime = parseFloat($('#overtime-hours').value) || 0;
                if (data.onSelect) data.onSelect(btn.dataset.status, overtime); 
                closeModalFunc(); 
            }));
        }
        if (type === 'newWorker' || type === 'editWorker') {
             formatRupiahInput($('#worker-wage'));
             formatRupiahInput($('#worker-overtime'));
             createCustomSelect($('#worker-project'));
             createCustomSelect($('#worker-payment-cycle'));
             modalEl.querySelector('#worker-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleSaveWorker(data); });
        }
        if (type === 'newStockItem' || type === 'editStockItem') {
             modalEl.querySelector('#stock-item-form')?.addEventListener('submit', (e) => { e.preventDefault(); handleSaveStockItem(data); });
        }
        if (type === 'recordStockUsage') {
            createCustomSelect($('#usage-item'));
            modalEl.querySelector('#stock-usage-form')?.addEventListener('submit', handleRecordStockUsage);
        }
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
                    const initialData = { email: user.email, name: user.displayName, photoURL: user.photoURL, role: isOwner ? 'Owner' : 'Viewer', status: isOwner ? 'active' : 'pending', createdAt: serverTimestamp() };
                    await setDoc(userDocRef, initialData);
                    appState.userRole = initialData.role;
                    appState.userStatus = initialData.status;
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
        if (appState.userStatus === 'active') { 
            if (appState.projects.length === 0) await fetchProjects();
            if (appState.workers.length === 0) await fetchWorkers();
            if (!appState.digitalEnvelopes) await fetchDigitalEnvelopes(); 
        }
        renderPageContent();
    }
    
    async function fetchDigitalEnvelopes() { try { const docSnap = await getDoc(digitalEnvelopesDoc); appState.digitalEnvelopes = docSnap.exists() ? docSnap.data() : { unallocatedFunds: 0, operational: 0, debtPayment: 0, reserve: 0, profit: 0 }; } catch (error) { console.error("Error fetching envelopes:", error); } }
    async function fetchProjects() { try { const snap = await getDocs(query(projectsCol, orderBy('createdAt', 'desc'))); appState.projects = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { toast('error', 'Gagal memuat data proyek.'); } }
    async function fetchWorkers() { try { const snap = await getDocs(query(workersCol, orderBy('workerName'))); appState.workers = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { toast('error', 'Gagal memuat data pekerja.'); } }

    function updateUIForUser(user, role, status) {
        const { userAvatar, dropdownAvatar, dropdownName, dropdownEmail, roleSection, roleIcon, roleText, authBtn, authDropdownBtnText, authDropdownBtnIcon, statusDot } = getUIElements();
        if (user) {
            const photo = user.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
            userAvatar.src = photo; dropdownAvatar.src = photo.replace('40x40', '80x80');
            dropdownName.textContent = user.displayName || 'Pengguna'; dropdownEmail.textContent = user.email || '';
            authBtn.querySelector('.nav-text').textContent = 'Keluar'; authBtn.classList.add('nav-item--danger');
            authDropdownBtnText.textContent = 'Keluar'; authDropdownBtnIcon.textContent = 'logout';
            roleSection.classList.remove('hidden');
            if (status === 'pending') { roleIcon.textContent = 'hourglass_empty'; roleText.textContent = 'Menunggu Persetujuan'; roleSection.className = 'user-info-role status--pending'; statusDot.className = 'status-dot dot--yellow';} 
            else if (status === 'revoked' || status === 'rejected') { roleIcon.textContent = 'block'; roleText.textContent = 'Akses Diblokir'; roleSection.className = 'user-info-role status--danger'; statusDot.className = 'status-dot dot--red';} 
            else { roleIcon.textContent = 'verified_user'; roleText.textContent = role; roleSection.className = 'user-info-role status--verified'; statusDot.className = 'status-dot dot--green'; }
        } else {
            const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
            userAvatar.src = guestAvatar; dropdownAvatar.src = guestAvatar.replace('40x40', '80x80');
            dropdownName.textContent = 'Guest'; dropdownEmail.textContent = 'Silakan login';
            authBtn.querySelector('.nav-text').textContent = 'Login'; authBtn.classList.remove('nav-item--danger');
            authDropdownBtnText.textContent = 'Login dengan Google'; authDropdownBtnIcon.textContent = 'login';
            roleSection.classList.add('hidden');
            statusDot.className = 'status-dot dot--red';
        }
        applyRoleVisibility(role, status);
    }
    
    function applyRoleVisibility(role, status) {
        $$('[data-role]').forEach(el => {
            const roles = el.dataset.role.split(',').map(s => s.trim());
            const canAccess = status === 'active' && (roles.includes(role) || role === 'Owner');
            el.classList.toggle('hidden', !canAccess);
        });
        $('#auth-btn').classList.toggle('hidden', !appState.currentUser);
    }

    function updateNavActiveState() { $$('.nav-item.active').forEach(el => el.classList.remove('active')); $(`.nav-item[data-nav="${appState.activePage}"]`)?.classList.add('active'); }

    function renderPageContent() {
        const pageContainer = $('.page-container');
        $$('.page').forEach(p => p.classList.remove('active'));
        let targetPage = $(`#page-${appState.activePage}`);
        if (!targetPage) { targetPage = document.createElement('main'); targetPage.id = `page-${appState.activePage}`; targetPage.className = 'page'; pageContainer.appendChild(targetPage); }
        targetPage.classList.add('active');
        const container = targetPage;
        
        if (!appState.currentUser || appState.userRole === 'Guest') { container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Akses Terbatas</div><div class="placeholder-desc">Silakan login.</div><button class="btn btn-primary" id="placeholder-login">Login</button></div>`; $('#placeholder-login')?.addEventListener('click', () => createModal('login')); return; } 
        if (appState.userStatus === 'pending') { container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Menunggu Persetujuan</div><div class="placeholder-desc">Akun Anda sedang ditinjau oleh Owner.</div></div>`; return; }
        if (appState.userStatus === 'revoked' || appState.userStatus === 'rejected') { container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Akses Diblokir</div><div class="placeholder-desc">Hubungi Owner untuk informasi lebih lanjut.</div></div>`; return; }
        
        const pageRenderers = {
            'dashboard': renderDashboardPage,
            'pemasukan-pinjaman': renderPemasukanPage, 
            'alokasi-anggaran': renderAlokasiPage,
            'pembayaran-digital': renderPembayaranDigitalPage,
            'pembelian': renderPembelianPage,
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
        container.innerHTML = `<div class="dashboard-grid"><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div></div><div id="quick-attendance-section"></div>`;
        try {
            const invoicePromises = invoiceCategories.map(cat => getDocs(getInvoiceCol(cat)));
            const fundingSnap = await getDocs(query(fundingSourcesCol));
            const invoiceSnaps = await Promise.all(invoicePromises);
            
            let totalExpenses = 0;
            invoiceSnaps.forEach(snap => {
                snap.forEach(doc => { totalExpenses += doc.data().totalAmount; });
            });

            const fundsReceived = fundingSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const remainingBudget = fundsReceived - totalExpenses;
            const envelopes = appState.digitalEnvelopes || { unallocatedFunds: 0, debtPayment: 0, operational: 0, reserve: 0, profit: 0 };

            container.innerHTML = `<div class="section-head"><h4>Dashboard Finansial Proyek</h4></div>
            <div class="dashboard-grid">
                <div class="dashboard-widget interactive" data-nav-target="pemasukan-pinjaman" title="Lihat Pemasukan">
                    <h5 class="widget-title">Arus Kas (Cashflow)</h5><div class="widget-main-value">${fmtIDR(remainingBudget)}</div>
                    <p class="widget-sub-text">Sisa dari Total Dana Diterima (${fmtIDR(fundsReceived)})</p>
                </div>
                <div class="dashboard-widget interactive" data-nav-target="alokasi-anggaran" title="Alokasikan Dana">
                    <h5 class="widget-title">Dana Belum Dialokasikan</h5><div class="widget-main-value">${fmtIDR(envelopes.unallocatedFunds)}</div>
                    <p class="widget-sub-text">Dana dari termin yang siap didistribusikan.</p>
                </div>
            </div>
            <div class="section-head" style="margin-top:2rem"><h4>Saldo Amplop Digital</h4></div>
            <div class="dashboard-grid">
                <div class="dashboard-widget"><h5 class="widget-title">Operasional</h5><div class="widget-main-value">${fmtIDR(envelopes.operational)}</div></div>
                <div class="dashboard-widget interactive" data-nav-target="tagihan" title="Lihat Tagihan">
                  <h5 class="widget-title">Pembayaran Hutang</h5><div class="widget-main-value">${fmtIDR(envelopes.debtPayment)}</div>
                </div>
                <div class="dashboard-widget"><h5 class="widget-title">Dana Cadangan</h5><div class="widget-main-value">${fmtIDR(envelopes.reserve)}</div></div>
                <div class="dashboard-widget"><h5 class="widget-title">Laba Proyek</h5><div class="widget-main-value">${fmtIDR(envelopes.profit)}</div></div>
            </div>
            <div id="quick-attendance-section" style="margin-top:2rem;"></div>`;

            // PEMBARUAN: Event listener untuk widget interaktif
            container.querySelectorAll('.dashboard-widget.interactive').forEach(widget => {
                widget.addEventListener('click', () => {
                    const targetPage = widget.dataset.navTarget;
                    if (targetPage) {
                        appState.activePage = targetPage;
                        localStorage.setItem('lastActivePage', appState.activePage);
                        renderUI();
                    }
                });
            });

            renderQuickAttendance($('#quick-attendance-section'));
        } catch (error) {
            console.error("Error rendering dashboard:", error);
            container.innerHTML = `<div class="card card-pad card--danger"><h4>Gagal Memuat Dashboard</h4><p>Terjadi kesalahan saat mengambil data.</p></div>`;
        }
    }

    async function renderQuickAttendance(container) {
        container.innerHTML = `<div class="section-head"><h4>Absensi Cepat Hari Ini (${new Date().toLocaleDateString('id-ID')})</h4></div><div class="card card-pad"><p>Memuat data absensi...</p></div>`;
        try {
            const todayDocRef = doc(attendanceCol, todayStr());
            const todaySnap = await getDoc(todayDocRef);
            const todayRecords = todaySnap.exists() ? todaySnap.data().records : {};

            const workersToAttend = appState.workers.filter(w => !todayRecords[w.id]);

            if (workersToAttend.length === 0) {
                container.querySelector('.card').innerHTML = `<p class="empty-state">Semua pekerja sudah diabsen hari ini.</p>`;
                return;
            }

            container.querySelector('.card').innerHTML = `<div class="quick-attendance-grid">
                ${workersToAttend.map(worker => `
                    <div class="quick-attendance-card" data-id="${worker.id}" data-name="${worker.workerName}">
                        <img src="https://placehold.co/40x40/e2e8f0/64748b?text=${worker.workerName[0]}" alt="${worker.workerName}">
                        <div class="quick-attendance-info">
                            <strong>${worker.workerName}</strong>
                            <span>${worker.position}</span>
                        </div>
                    </div>
                `).join('')}
            </div>`;

            $$('.quick-attendance-card').forEach(card => card.addEventListener('click', e => {
                const { id, name } = e.currentTarget.dataset;
                const worker = appState.workers.find(w => w.id === id);
                createModal('attendanceStatus', { workerId: id, workerName: name, onSelect: (status, overtime) => {
                    handleUpdateAttendance(id, worker, status, overtime);
                    // Remove card after attendance
                    e.currentTarget.style.display = 'none';
                }});
            }));

        } catch (error) {
            container.innerHTML = `<p class="empty-state">Gagal memuat data untuk absensi cepat.</p>`;
            console.error("Quick attendance error:", error);
        }
    }

    async function renderPemasukanPage(container) {
        await fetchFundingCreditors();
        const projectOptions = appState.projects.map(p => `<option value="${p.id}">${p.projectName}</option>`).join('');
        container.innerHTML = `
            <div class="section-head"><h4>Pemasukan & Pinjaman</h4></div>
            <div class="card card-pad">
                <form id="funding-source-form"><h5 class="form-section-title">Tambah Pemasukan</h5>
                    <div class="form-grid-invoice">
                        <div class="form-group"><label>Tanggal</label><input type="date" id="fs-date" value="${todayStr()}" required></div>
                        <div class="form-group"><label>Jenis</label><select id="fs-type" required><option value="Pencairan Termin">Pencairan Termin</option><option value="Pinjaman">Pinjaman</option></select></div>
                        <div class="form-group span-2"><label>Pemberi Dana</label>
                            <div class="input-with-button">
                                <select id="fs-creditor" required><option value="">Pilih...</option>${appState.fundingCreditors.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
                                <button type="button" id="manage-funding-creditors-btn" class="icon-btn" title="Kelola Pemberi Dana"><span class="material-symbols-outlined">settings</span></button>
                            </div>
                        </div>
                        <div class="form-group span-2"><label>Keterangan</label><input type="text" id="fs-desc" required placeholder="Contoh: Termin 1"></div>
                        <div class="form-group"><label>Jumlah (Pokok)</label><input type="text" id="fs-amount" required placeholder="0"></div>
                    </div>
                    <!-- Loan Specific Fields -->
                    <div id="loan-details-section" class="hidden" style="margin-top:1rem;">
                        <div class="form-group" style="border-top: 1px dashed var(--line); padding-top: 1rem;">
                            <label class="checkbox-label">
                                <input type="checkbox" id="fs-with-interest">
                                <span>Pinjaman Berbunga</span>
                            </label>
                        </div>
                         <div id="interest-fields" class="form-grid-invoice hidden">
                            <div class="form-group"><label>Bunga (%)</label><input type="number" id="fs-interest" placeholder="0"></div>
                            <div class="form-group"><label>Tenor (bulan)</label><input type="number" id="fs-tenor" placeholder="0"></div>
                         </div>
                         <div class="form-group full" style="margin-top: 1rem;"><label>Proyek</label><select id="fs-project" required>${projectOptions}</select></div>
                         <div id="loan-calculation-preview" class="calculation-preview hidden"></div>
                    </div>
                    <div class="form-group full" style="margin-top:1.5rem;"><button type="submit" class="btn btn-primary">Simpan</button></div>
                </form>
            </div>
            <div class="card card-pad" style="margin-top:1.5rem;"><h5 class="form-section-title">Riwayat</h5><div id="funding-sources-table-container"><p>Memuat...</p></div></div>`;
        
        formatRupiahInput($('#fs-amount')); 
        createCustomSelect($('#fs-type')); 
        createCustomSelect($('#fs-creditor'));
        if ($('#fs-project')) createCustomSelect($('#fs-project'));
        
        const loanSection = $('#loan-details-section');
        const loanPreview = $('#loan-calculation-preview');
        // PEMBARUAN: Logika untuk pinjaman berbunga
        const withInterestCheckbox = $('#fs-with-interest');
        const interestFields = $('#interest-fields');

        $('#fs-type').addEventListener('change', (e) => { 
            const isLoan = e.target.value === 'Pinjaman';
            loanSection.classList.toggle('hidden', !isLoan);
            if (!isLoan) {
                loanPreview.classList.add('hidden');
                withInterestCheckbox.checked = false;
                interestFields.classList.add('hidden');
            }
        });
        
        withInterestCheckbox.addEventListener('change', (e) => {
            interestFields.classList.toggle('hidden', !e.target.checked);
             if (!e.target.checked) loanPreview.classList.add('hidden');
        });

        $$('#fs-amount, #fs-interest, #fs-tenor').forEach(el => el.addEventListener('input', () => {
            if (!withInterestCheckbox.checked) return;
            const principal = getNumericValue($('#fs-amount').value);
            const interest = parseFloat($('#fs-interest').value) || 0;
            const tenor = parseInt($('#fs-tenor').value) || 0;
            if (principal > 0 && interest > 0 && tenor > 0) {
                const totalInterest = principal * (interest / 100) * tenor;
                const totalRepayable = principal + totalInterest;
                loanPreview.innerHTML = `<span>Total yang harus dibayar:</span> <strong>${fmtIDR(totalRepayable)}</strong>`;
                loanPreview.classList.remove('hidden');
            } else {
                loanPreview.classList.add('hidden');
            }
        }));

        $('#manage-funding-creditors-btn').addEventListener('click', () => createModal('manageCreditors', { creditorType: 'funding' }));
        $('#funding-source-form').addEventListener('submit', (e) => handleSaveFundingSource(e));
        
        fetchAndDisplayFundingSources();
    }
    
    async function handleSaveFundingSource(e, data = {}) { 
        e.preventDefault(); 
        const { id } = data;
        const isEdit = !!id;
        toast('loading', isEdit ? 'Memperbarui...' : 'Menyimpan...');

        const formIdPrefix = isEdit ? 'edit' : '';
        const form = isEdit ? e.target.closest('#funding-source-form-edit') : e.target.closest('#funding-source-form');
        
        if (!form) {
            toast('error', 'Form tidak ditemukan.');
            return;
        }

        const type = $(`#fs-type${isEdit ? '-edit' : ''}`, form).value;
        const amount = getNumericValue($(`#fs-amount${isEdit ? '-edit' : ''}`, form).value);
        if (amount <= 0) { toast('error', 'Jumlah harus lebih dari nol.'); return; }
        
        let saveData = {
            date: Timestamp.fromDate(new Date($(`#fs-date${isEdit ? '-edit' : ''}`, form).value)),
            type: type,
            creditorId: $(`#fs-creditor${isEdit ? '-edit' : ''}`, form).value,
            creditorName: $(`#fs-creditor${isEdit ? '-edit' : ''}`, form).options[$(`#fs-creditor${isEdit ? '-edit' : ''}`, form).selectedIndex].text,
            description: $(`#fs-desc${isEdit ? '-edit' : ''}`, form).value.trim(),
            amount: amount,
            updatedBy: appState.currentUser.email,
            updatedAt: serverTimestamp()
        };

        if (type === 'Pinjaman' && !isEdit) {
            const withInterest = form.querySelector('#fs-with-interest')?.checked || false;
            const interestRate = withInterest ? (parseFloat($('#fs-interest', form)?.value) || 0) : 0;
            const tenorMonths = withInterest ? (parseInt($('#fs-tenor', form)?.value) || 0) : 0;
            const totalInterest = amount * (interestRate / 100) * tenorMonths;
            saveData.withInterest = withInterest;
            saveData.projectId = $('#fs-project', form).value;
            saveData.projectName = $('#fs-project', form).options[$('#fs-project', form).selectedIndex].text;
            saveData.interestRate = interestRate;
            saveData.tenorMonths = tenorMonths;
            saveData.totalRepayableAmount = amount + totalInterest;
            saveData.isFullyPaid = false;
            saveData.amountPaid = 0;
        } else if (type !== 'Pinjaman' && !isEdit) {
             saveData.totalRepayableAmount = amount;
        }
        
        if (!isEdit) {
            saveData.createdBy = appState.currentUser.email;
            saveData.createdAt = serverTimestamp();
        }

        const docRef = isEdit ? doc(fundingSourcesCol, id) : doc(fundingSourcesCol);
        
        try {
            await runTransaction(db, async (transaction) => {
                if (type === 'Pencairan Termin') {
                    const envDoc = await transaction.get(digitalEnvelopesDoc);
                    const currentUnallocated = envDoc.exists() ? (envDoc.data().unallocatedFunds || 0) : 0;
                    let newUnallocated = currentUnallocated;
                    
                    if (isEdit) {
                        const oldAmount = data.amount || 0;
                        const amountDifference = amount - oldAmount;
                        newUnallocated += amountDifference;
                    } else {
                        newUnallocated += amount;
                    }
                    transaction.set(digitalEnvelopesDoc, { unallocatedFunds: newUnallocated }, { merge: true });
                }
                
                if (isEdit) {
                    transaction.update(docRef, saveData);
                } else {
                    transaction.set(docRef, saveData);
                }
            });

            toast('success', `Pemasukan berhasil ${isEdit ? 'diperbarui' : 'disimpan'}.`);
            if (isEdit) closeModal();
            await fetchDigitalEnvelopes();
            renderPemasukanPage($('#page-pemasukan-pinjaman'));

        } catch (error) {
            toast('error', `Gagal ${isEdit ? 'memperbarui' : 'menyimpan'} pemasukan.`);
            console.error(error);
        }
    }

    function renderFundingCreditorsTable(container) {
        if (!container) return;
        container.innerHTML = appState.fundingCreditors.length === 0 ? '<p class="empty-state">Belum ada data.</p>' :
            `<div class="table-container"><table class="table"><thead><tr><th>Nama</th><th class="action-cell">Aksi</th></tr></thead><tbody>
            ${appState.fundingCreditors.map(c => `<tr><td>${c.name}</td><td class="action-cell">
                <div class="action-menu">
                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                    <div class="action-dropdown hidden">
                        <button class="action-dropdown-item btn-edit" data-id="${c.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                        <button class="action-dropdown-item action-dropdown-item--danger btn-delete" data-id="${c.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                    </div>
                </div>
            </td></tr>`).join('')}</tbody></table></div>`;
        container.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e => {
            const creditorData = appState.fundingCreditors.find(c=>c.id===e.currentTarget.dataset.id);
            createModal('editCreditor', { ...creditorData, id: e.currentTarget.dataset.id, creditorType: 'funding' })
        }));
        container.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', e => {
            const creditorId = e.currentTarget.dataset.id;
            createModal('confirmDelete', { 
                title: 'Hapus Pemberi Dana', 
                onConfirm: () => handleDeleteCreditor({ id: creditorId, creditorType: 'funding' }) 
            })
        }));
    }
    
    function renderExpenditureCreditorsTable(container, category) {
        if (!container) return;
        const creditors = appState.expenditureCreditors[category] || [];
        container.innerHTML = creditors.length === 0 ? '<p class="empty-state">Belum ada data.</p>' :
            `<div class="table-container"><table class="table"><thead><tr><th>Nama</th><th class="action-cell">Aksi</th></tr></thead><tbody>
            ${creditors.map(c => `<tr><td>${c.name}</td><td class="action-cell">
                <div class="action-menu">
                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                    <div class="action-dropdown hidden">
                        <button class="action-dropdown-item btn-edit" data-id="${c.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                        <button class="action-dropdown-item action-dropdown-item--danger btn-delete" data-id="${c.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                    </div>
                </div>
            </td></tr>`).join('')}</tbody></table></div>`;
        container.querySelectorAll('.btn-edit').forEach(b => b.addEventListener('click', e => {
            const creditorData = creditors.find(c => c.id === e.currentTarget.dataset.id);
            createModal('editCreditor', { ...creditorData, id: e.currentTarget.dataset.id, creditorType: 'expenditure', category });
        }));
        container.querySelectorAll('.btn-delete').forEach(b => b.addEventListener('click', e => {
            const creditorId = e.currentTarget.dataset.id;
            createModal('confirmDelete', { 
                title: 'Hapus Kreditur', 
                onConfirm: () => handleDeleteCreditor({ id: creditorId, creditorType: 'expenditure', category }) 
            })
        }));
    }

    async function fetchAndDisplayFundingSources() {
        const container = $('#funding-sources-table-container');
        try {
            const snap = await getDocs(query(fundingSourcesCol, orderBy('date', 'desc')));
            const sources = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (sources.length === 0) { container.innerHTML = '<p class="empty-state">Belum ada data.</p>'; return; }
            container.innerHTML = `<div class="table-container"><table class="table"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Total Tagihan</th><th>Pembayaran</th><th class="action-cell">Aksi</th></tr></thead><tbody>
                ${sources.map(s => {
                    const progress = s.totalRepayableAmount > 0 ? ((s.amountPaid || 0) / s.totalRepayableAmount) * 100 : 100;
                    return `<tr>
                        <td>${s.date.toDate().toLocaleDateString('id-ID')}</td>
                        <td><span class="badge">${s.type}</span></td>
                        <td>${s.description}</td>
                        <td>${fmtIDR(s.totalRepayableAmount)}</td>
                        <td>
                            <div class="progress-wrapper">
                                <div class="progress-label">${progress.toFixed(0)}% (${fmtIDR(s.amountPaid || 0)})</div>
                                <div class="payment-progress-container"><div class="payment-progress-bar" style="width:${progress}%;"></div></div>
                            </div>
                        </td>
                        <td class="action-cell">
                             <div class="action-menu">
                                <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                <div class="action-dropdown hidden">
                                    ${!s.isFullyPaid ? `<button class="action-dropdown-item btn-pay-loan" data-id="${s.id}"><span class="material-symbols-outlined">payments</span> Bayar</button>` : ''}
                                    <button class="action-dropdown-item btn-edit-source" data-id="${s.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                                    <button class="action-dropdown-item action-dropdown-item--danger btn-delete-source" data-id="${s.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                                </div>
                            </div>
                        </td>
                    </tr>`
                }).join('')}</tbody></table></div>`;
            
            $$('.btn-pay-loan').forEach(btn => btn.addEventListener('click', e => {
                const sourceData = sources.find(s => s.id === e.currentTarget.dataset.id);
                createModal('payment', { ...sourceData, context: 'loan', onConfirm: (amount, date) => handleLoanPayment(e.currentTarget.dataset.id, amount, date) });
            }));
            
            $$('.btn-edit-source').forEach(btn => btn.addEventListener('click', e => {
                const sourceData = sources.find(s => s.id === e.currentTarget.dataset.id);
                if (sourceData) {
                    createModal('editFundingSource', sourceData);
                }
            }));

            $$('.btn-delete-source').forEach(btn => btn.addEventListener('click', e => {
                const sourceId = e.currentTarget.dataset.id;
                createModal('confirmDelete', { 
                    title: 'Hapus Transaksi Pemasukan',
                    message: 'Anda yakin ingin menghapus transaksi ini? Tindakan ini akan mempengaruhi saldo.',
                    onConfirm: () => handleDeleteFundingSource(sourceId) 
                });
            }));

        } catch (error) { console.error("Error fetching funding sources:", error); container.innerHTML = '<p>Gagal memuat.</p>'; }
    }
    
    async function handleDeleteFundingSource(sourceId) {
        toast('loading', 'Menghapus transaksi...');
        try {
            await runTransaction(db, async (transaction) => {
                const sourceRef = doc(fundingSourcesCol, sourceId);
                const sourceDoc = await transaction.get(sourceRef);
                if (!sourceDoc.exists()) { throw new Error("Transaksi tidak ditemukan!"); }
                const sourceData = sourceDoc.data();
    
                const envDoc = await transaction.get(digitalEnvelopesDoc);
                const currentUnallocated = envDoc.exists() ? (envDoc.data().unallocatedFunds || 0) : 0;
                const newUnallocated = Math.max(0, currentUnallocated - sourceData.amount);
                transaction.set(digitalEnvelopesDoc, { unallocatedFunds: newUnallocated }, { merge: true });
                
                transaction.delete(sourceRef);
            });
    
            toast('success', 'Transaksi berhasil dihapus.');
            await fetchAndDisplayFundingSources();
            await fetchDigitalEnvelopes(); 
            if(appState.activePage === 'dashboard') { renderDashboardPage($('#page-dashboard')); }

        } catch (error) {
            toast('error', `Gagal menghapus: ${error.message}`);
            console.error("Error deleting funding source:", error);
        }
    }

    async function handleLoanPayment(loanId, paymentAmount, paymentDate) {
        toast('loading', 'Memproses pembayaran...');
        try {
            await runTransaction(db, async (transaction) => {
                const loanRef = doc(fundingSourcesCol, loanId);
                const loanDoc = await transaction.get(loanRef);
                if (!loanDoc.exists()) throw "Data pinjaman tidak ditemukan!";
                const data = loanDoc.data();
                const newAmountPaid = (data.amountPaid || 0) + paymentAmount;
                const isFullyPaid = newAmountPaid >= data.totalRepayableAmount;
                transaction.update(loanRef, { amountPaid: newAmountPaid, isFullyPaid: isFullyPaid });
            });
            toast('success', 'Pembayaran pinjaman berhasil disimpan.');
            if(appState.activePage === 'pemasukan-pinjaman') fetchAndDisplayFundingSources();
            if(appState.activePage === 'tagihan') renderTagihanPage($('#page-tagihan'));
        } catch (error) {
            toast('error', 'Gagal memproses pembayaran.');
            console.error(error);
        }
    }

    // PERUBAHAN BESAR: Logika Input Pengeluaran
    async function renderInputDataPage(container) {
        container.innerHTML = `
            <div class="section-head"><h4>Input Pengeluaran</h4></div>
            <div class="sub-nav">
                <button class="sub-nav-item active" data-category="operasional">Operasional</button>
                <button class="sub-nav-item" data-category="material">Material</button>
                <button class="sub-nav-item" data-category="lainnya">Lainnya</button>
            </div><div id="sub-page-content" class="sub-page-content"></div>`;
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item.active').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active'); renderInvoiceForm($('#sub-page-content'), e.currentTarget.dataset.category);
        }));
        renderInvoiceForm($('#sub-page-content'), 'operasional');
    }

    async function renderInvoiceForm(container, category) {
        await fetchExpenditureCreditors(category);
        appState.currentInvoiceItems = [];
        const isMultiItemByDefault = category === 'material';
        const projectOptions = appState.projects.map(p => `<option value="${p.id}">${p.projectName}</option>`).join('');
        const photoInputsHTML = category === 'material'
            ? `<div class="form-group"><label for="inv-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Foto Invoice</label><input type="file" id="inv-photo" accept="image/*"><span id="inv-photo-name" class="file-name"></span></div><div class="form-group"><label for="del-note-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Surat Jalan</label><input type="file" id="del-note-photo" accept="image/*"><span id="del-note-photo-name" class="file-name"></span></div>`
            : `<div class="form-group"><label for="inv-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Bukti</label><input type="file" id="inv-photo" accept="image/*"><span id="inv-photo-name" class="file-name"></span></div>`;

        container.innerHTML = `
        <div class="card card-pad"><form id="invoice-form">
            <h5 class="form-section-title">Informasi Faktur</h5>
            <div class="form-grid-invoice">
                <div class="form-group"><label>Tanggal</label><input type="date" id="inv-date" value="${todayStr()}" required></div>
                <div class="form-group"><label>No. Faktur</label><input type="text" id="inv-number" value="INV-${Date.now().toString().slice(-8)}" disabled></div>
                <div class="form-group span-2"><label>Kreditur</label>
                    <div class="input-with-button">
                        <select id="inv-creditor" required><option value="">Pilih...</option>${appState.expenditureCreditors[category].map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
                        <button type="button" id="manage-exp-creditors-btn" class="icon-btn" title="Kelola Kreditur"><span class="material-symbols-outlined">settings</span></button>
                    </div>
                </div>
                <div class="form-group span-2"><label>Alokasi Proyek</label><select id="inv-project" required>${projectOptions}</select></div>
                <div class="form-group"><label>Status Pembayaran</label><select id="inv-status" required><option value="Belum Lunas">Belum Lunas</option><option value="Lunas">Lunas</option></select></div>
            </div>
            <div id="invoice-items-container"></div>
            <div class="form-section"><h5 class="form-section-title">Lampiran</h5><div class="form-grid-invoice">${photoInputsHTML}</div></div>
            <div class="form-group full" style="margin-top:2rem;border-top:1px solid var(--line);padding-top:1.5rem;">
                <div class="invoice-summary">Total: <strong id="invoice-total-amount">Rp 0,00</strong></div>
                <button type="submit" class="btn btn-primary">Simpan Faktur</button>
            </div></form></div>`;
        renderItemInputUI(category, isMultiItemByDefault);
        createCustomSelect($('#inv-creditor'));
        createCustomSelect($('#inv-project'));
        createCustomSelect($('#inv-status'));
        $('#manage-exp-creditors-btn').addEventListener('click', () => createModal('manageCreditors', { creditorType: 'expenditure', category }));
        $('#invoice-form').addEventListener('submit', e => handleSaveInvoice(e, category));
        $('#inv-photo').addEventListener('change', (e) => { $('#inv-photo-name').textContent = e.target.files[0]?.name || ''; });
        if (category === 'material') {
            $('#del-note-photo').addEventListener('change', (e) => { $('#del-note-photo-name').textContent = e.target.files[0]?.name || ''; });
        }
    }
    
    function renderItemInputUI(category, isMultiItem) {
        const container = $('#invoice-items-container');
        const showMultiBtnClass = isMultiItem ? 'hidden' : '';
        const hideMultiBtnClass = category !== 'material' && isMultiItem ? '' : 'hidden';

        container.innerHTML = `<div class="form-section" style="margin-top:1.5rem">
            <div class="form-section-header">
                <h5>Item Pengeluaran</h5>
                <div class="form-toggle-buttons">
                    <button type="button" id="show-multi-item-btn" class="btn btn-link ${showMultiBtnClass}">Input Multi-Item</button>
                    <button type="button" id="hide-multi-item-btn" class="btn btn-link ${hideMultiBtnClass}">Tutup Multi-Item</button>
                </div>
            </div>
            <div id="single-item-form" class="${isMultiItem ? 'hidden' : ''}"><div class="form-grid-item-general"><div class="form-group"><label>Deskripsi</label><input type="text" id="single-item-name"></div><div class="form-group"><label>Jumlah</label><input type="text" id="single-item-price"></div></div></div>
            <div id="multi-item-form" class="${!isMultiItem ? 'hidden' : ''}"><div id="invoice-item-list" class="invoice-item-list"></div><div class="form-grid-item"><div class="form-group span-2"><label>Nama Barang</label><input type="text" id="item-name"></div><div class="form-group"><label>Qty</label><input type="number" id="item-qty"></div><div class="form-group"><label>Satuan</label><input type="text" id="item-unit"></div><div class="form-group"><label>Harga</label><input type="text" id="item-price"></div><div class="form-group"><label>Total</label><input type="text" id="item-total" disabled></div></div><button type="button" id="add-item-btn" class="btn btn-secondary" style="margin-top:1rem;"><span class="material-symbols-outlined">add</span>Tambah</button></div>
        </div>`;
        
        formatRupiahInput($('#single-item-price'));
        $('#single-item-price').addEventListener('input', () => $('#invoice-total-amount').textContent = fmtIDR(getNumericValue($('#single-item-price').value)));
        
        formatRupiahInput($('#item-price'));
        $('#add-item-btn')?.addEventListener('click', handleAddItemToInvoice);
        $$('#item-qty, #item-price').forEach(el => el.addEventListener('input', () => $('#item-total').value = fmtIDR((parseFloat($('#item-qty').value)||0) * getNumericValue($('#item-price').value))));

        const singleForm = $('#single-item-form');
        const multiForm = $('#multi-item-form');
        const showBtn = $('#show-multi-item-btn');
        const hideBtn = $('#hide-multi-item-btn');

        showBtn?.addEventListener('click', () => {
            singleForm.classList.add('hidden');
            multiForm.classList.remove('hidden');
            showBtn.classList.add('hidden');
            if(category !== 'material') hideBtn.classList.remove('hidden');
        });
        hideBtn?.addEventListener('click', () => {
            multiForm.classList.add('hidden');
            singleForm.classList.remove('hidden');
            hideBtn.classList.add('hidden');
            showBtn.classList.remove('hidden');
        });
    }
    
    function handleAddItemToInvoice() {
        const itemName = $('#item-name').value.trim();
        const quantity = parseFloat($('#item-qty').value) || 0;
        const unitName = $('#item-unit').value.trim();
        const unitPrice = getNumericValue($('#item-price').value);
        if (!itemName || quantity <= 0 || !unitName || unitPrice <= 0) {
            toast('error', 'Harap lengkapi semua detail item.'); return;
        }
        appState.currentInvoiceItems.push({ itemName, quantity, unitName, unitPrice, totalPrice: quantity * unitPrice });
        renderInvoiceItems();
        $('#item-name').value = ''; $('#item-qty').value = ''; $('#item-unit').value = ''; $('#item-price').value = '';
        $('#item-total').value = ''; $('#item-name').focus();
    }

    function renderInvoiceItems() {
        const listContainer = $('#invoice-item-list');
        const totalAmountEl = $('#invoice-total-amount');
        if (!listContainer || !totalAmountEl) return;
        let totalAmount = 0;
        listContainer.innerHTML = appState.currentInvoiceItems.map((item, index) => {
            totalAmount += item.totalPrice;
            return `<div class="invoice-item"><span>${item.itemName} (${item.quantity} ${item.unitName})</span><span>${fmtIDR(item.totalPrice)}</span><button type="button" class="icon-btn remove-item-btn" data-index="${index}" title="Hapus item"><span class="material-symbols-outlined">delete</span></button></div>`;
        }).join('');
        totalAmountEl.textContent = fmtIDR(totalAmount);
        $$('.remove-item-btn').forEach(btn => btn.addEventListener('click', (e) => {
            const index = parseInt(e.currentTarget.dataset.index);
            appState.currentInvoiceItems.splice(index, 1);
            renderInvoiceItems();
        }));
    }
    
    async function handleSaveInvoice(e, category) { 
        e.preventDefault();
        const form = e.target.closest('#invoice-form');
        if (!form) return;

        const projectId = $('#inv-project', form).value;
        const projectName = $('#inv-project', form).options[$('#inv-project', form).selectedIndex].text;
        const isMultiMode = !$('#multi-item-form', form).classList.contains('hidden');
        
        if (!projectId) { toast('error', 'Semua pengeluaran harus dialokasikan ke proyek.'); return; }
        
        let itemsToSave = [];
        if (isMultiMode) {
            itemsToSave = appState.currentInvoiceItems;
        } else {
            const name = $('#single-item-name', form).value.trim();
            const price = getNumericValue($('#single-item-price', form).value);
            if(name && price > 0) {
                itemsToSave.push({ itemName: name, quantity: 1, unitName: 'ls', unitPrice: price, totalPrice: price });
            }
        }
        
        if (itemsToSave.length === 0) { toast('error', 'Faktur harus memiliki minimal satu item.'); return; }
        
        toast('loading', 'Menyimpan faktur...');
        try {
            const invoicePhotoFile = $('#inv-photo', form).files[0];
            const deliveryNoteFile = category === 'material' ? $('#del-note-photo', form)?.files[0] : null;
            const invoiceNumber = $('#inv-number', form).value;
            const invoicePhotoUrl = invoicePhotoFile ? await uploadFile(invoicePhotoFile, `invoices/${invoiceNumber}`) : null;
            const deliveryNotePhotoUrl = deliveryNoteFile ? await uploadFile(deliveryNoteFile, `delivery-notes/${invoiceNumber}`) : null;
            const totalAmount = itemsToSave.reduce((sum, item) => sum + item.totalPrice, 0);

            const status = $('#inv-status', form).value;
            const isFullyPaid = status === 'Lunas';
            const amountPaid = isFullyPaid ? totalAmount : 0;
            
            const creditorSelect = $('#inv-creditor', form);
            const invoiceData = {
                invoiceNumber: invoiceNumber,
                date: Timestamp.fromDate(new Date($('#inv-date', form).value)),
                creditorId: creditorSelect.value,
                creditorName: creditorSelect.options[creditorSelect.selectedIndex].text,
                category, totalAmount, amountPaid, isFullyPaid,
                items: itemsToSave,
                projectId, projectName,
                invoicePhotoUrl, 
                deliveryNotePhotoUrl: deliveryNotePhotoUrl || null,
                createdBy: appState.currentUser.email, createdAt: serverTimestamp(),
            };
            const targetCol = getInvoiceCol(category);
            const docRef = await addDoc(targetCol, invoiceData);
            
            if (category === 'material') {
                await recordStockInFromInvoice(invoiceData.items, docRef.id);
            }
            
            toast('success', 'Faktur berhasil disimpan.');
            renderInvoiceForm($('#sub-page-content'), category);
        } catch (error) { toast('error', 'Gagal menyimpan faktur.'); console.error("Error saving invoice:", error); }
    }
    
    async function recordStockInFromInvoice(items, invoiceId) {
        if (!items || items.length === 0) return;
        const batch = writeBatch(db);
        const timestamp = serverTimestamp();
    
        for (const item of items) {
            const q = query(stockItemsCol, where("itemName", "==", item.itemName), limit(1));
            const querySnapshot = await getDocs(q);
            let stockItemId;
    
            if (querySnapshot.empty) {
                const newStockItemRef = doc(stockItemsCol);
                batch.set(newStockItemRef, {
                    itemName: item.itemName,
                    unit: item.unitName,
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
                itemName: item.itemName,
                type: 'in',
                quantity: item.quantity,
                unit: item.unitName,
                date: Timestamp.now(),
                notes: `Pembelian dari faktur ${invoiceId}`
            });
        }
        await batch.commit();
        toast('info', 'Stok material telah diperbarui.');
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
            
            // PERBAIKAN: Pisahkan promises dan gabungkan dengan benar
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
        container.innerHTML = `<div class="table-container"><table class="table">
            <thead><tr><th>Tanggal</th><th>Jenis</th><th>Deskripsi/Kreditur</th><th>Total</th><th>Pembayaran</th><th class="action-cell">Aksi</th></tr></thead>
            <tbody>
            ${debts.map(debt => {
                const isLoan = debt.debtType === 'loan';
                const total = isLoan ? debt.totalRepayableAmount : debt.totalAmount;
                const progress = total > 0 ? ((debt.amountPaid || 0) / total) * 100 : 100;
                const badgeClass = isLoan ? 'badge--purple' : 'badge--blue';
                return `<tr>
                    <td>${debt.date.toDate().toLocaleDateString('id-ID')}</td>
                    <td><span class="badge ${badgeClass}">${isLoan ? 'Pinjaman' : 'Faktur'}</span></td>
                    <td>${isLoan ? debt.description : debt.creditorName}</td>
                    <td>${fmtIDR(total)}</td>
                    <td>
                        <div class="progress-wrapper">
                            <div class="progress-label">${progress.toFixed(0)}%</div>
                            <div class="payment-progress-container"><div class="payment-progress-bar" style="width:${progress}%;"></div></div>
                        </div>
                    </td>
                    <td class="action-cell"><button class="icon-btn btn-pay" data-id="${debt.id}" data-type="${debt.debtType}" data-category="${debt.category || ''}" title="Bayar Tagihan"><span class="material-symbols-outlined">payments</span></button></td>
                </tr>`
            }).join('')}
            </tbody></table></div>`;

        $$('.btn-pay').forEach(btn => btn.addEventListener('click', (e) => {
            const { id, type, category } = e.currentTarget.dataset;
            const debtData = debts.find(d => d.id === id);
            
            if (type === 'loan') {
                createModal('payment', { ...debtData, context: 'loan', onConfirm: (amount, date) => handleLoanPayment(id, amount, date) });
            } else {
                createModal('payment', { ...debtData, context: 'invoice', onConfirm: (amount, date) => handleInvoicePayment(id, amount, date, category) });
            }
        }));
    }

    function renderPayrollTable(container, payrolls) {
        if (payrolls.length === 0) { container.innerHTML = `<p class="empty-state">Tidak ada tagihan gaji.</p>`; return; }
        // Group by project
        const payrollByProject = payrolls.reduce((acc, p) => {
            const key = p.projectId || 'tanpa-proyek';
            if (!acc[key]) {
                acc[key] = { projectName: p.projectName || 'Tanpa Proyek', liabilities: [] };
            }
            acc[key].liabilities.push(p);
            return acc;
        }, {});

        container.innerHTML = Object.values(payrollByProject).map(project => `
            <h6 class="project-pivot-title">${project.projectName}</h6>
            <div class="table-container" style="margin-bottom: 1.5rem;"><table class="table">
                <thead><tr><th>Nama</th><th>Periode</th><th>Hari Kerja</th><th>Lembur</th><th>Total Gaji</th><th class="action-cell">Aksi</th></tr></thead>
                <tbody>
                ${project.liabilities.map(p => `
                    <tr>
                        <td><strong>${p.workerName}</strong></td>
                        <td>${p.startDate.toDate().toLocaleDateString('id-ID')} - ${p.endDate.toDate().toLocaleDateString('id-ID')}</td>
                        <td>${p.daysWorkedFull} Penuh, ${p.daysWorkedHalf} Setengah</td>
                        <td>${p.overtimeHours} Jam</td>
                        <td>${fmtIDR(p.totalLiability)}</td>
                        <td class="action-cell"><button class="icon-btn btn-pay-payroll" data-id="${p.id}" title="Bayar Gaji"><span class="material-symbols-outlined">payments</span></button></td>
                    </tr>
                `).join('')}
                </tbody>
            </table></div>
        `).join('');

        $$('.btn-pay-payroll').forEach(btn => btn.addEventListener('click', e => {
            const liabilityId = e.currentTarget.dataset.id;
            const payrollData = payrolls.find(p => p.id === liabilityId);
            createModal('payment', { ...payrollData, context: 'payroll', onConfirm: (amount, date) => handlePayrollPayment(liabilityId, amount, date) });
        }));
    }
    
    async function handleInvoicePayment(invoiceId, paymentAmount, paymentDate, category) {
        if (!category) { toast('error', 'Kategori faktur tidak valid.'); return; }
        toast('loading', 'Memproses pembayaran...');
        try {
            const invoiceRef = doc(getInvoiceCol(category), invoiceId);
            await runTransaction(db, async (transaction) => {
                const invoiceDoc = await transaction.get(invoiceRef);
                if (!invoiceDoc.exists()) throw "Faktur tidak ditemukan!";
                const data = invoiceDoc.data();
                const newAmountPaid = (data.amountPaid || 0) + paymentAmount;
                const isFullyPaid = newAmountPaid >= data.totalAmount;
                transaction.update(invoiceRef, { amountPaid: newAmountPaid, isFullyPaid: isFullyPaid });
            });
            toast('success', 'Pembayaran berhasil disimpan.');
            renderTagihanPage($('#page-tagihan'));
        } catch (error) { toast('error', 'Gagal memproses pembayaran.'); console.error(error); }
    }
    
    // ===== FUNGSI KREDITOR BARU =====
    async function fetchFundingCreditors() { try { const snap = await getDocs(query(fundingCreditorsCol, orderBy('name'))); appState.fundingCreditors = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { toast('error', 'Gagal memuat pemberi dana.'); } }
    async function fetchExpenditureCreditors(category) { try { const targetCol = getExpenditureCreditorCol(category); const snap = await getDocs(query(targetCol, orderBy('name'))); appState.expenditureCreditors[category] = snap.docs.map(d => ({ id: d.id, ...d.data() })); } catch (error) { toast('error', 'Gagal memuat kreditur.'); } }
    
    async function handleSaveCreditor(data) {
        const { id, creditorType, category } = data; const isEdit = !!id;
        const name = $('#creditor-name').value.trim(); if (!name) return;
        const targetCol = creditorType === 'funding' ? fundingCreditorsCol : getExpenditureCreditorCol(category);
        const docRef = isEdit ? doc(targetCol, id) : doc(collection(db, targetCol.path));
        try {
            await setDoc(docRef, { name, updatedAt: serverTimestamp() }, { merge: true });
            toast('success', `Kreditur ${isEdit ? 'diperbarui' : 'disimpan'}.`); 
            closeModal();
            if (creditorType === 'funding') {
                await fetchFundingCreditors();
                if ($('#manageCreditors-modal')) {
                    renderFundingCreditorsTable($('#modal-creditors-table-container'));
                }
                if (appState.activePage === 'pemasukan-pinjaman') {
                    renderPemasukanPage($('#page-pemasukan-pinjaman'));
                }
            } else {
                await fetchExpenditureCreditors(category);
                if ($('#manageCreditors-modal')) {
                    renderExpenditureCreditorsTable($('#modal-creditors-table-container'), category);
                }
                if (appState.activePage === 'input-data') {
                    renderInvoiceForm($('#sub-page-content'), category);
                }
            }
        } catch (error) { toast('error', 'Gagal menyimpan.'); }
    }
    
    async function handleDeleteCreditor(data) {
        const { id, creditorType, category } = data;
        toast('loading', 'Menghapus...');
        try {
            const targetCol = creditorType === 'funding' ? fundingCreditorsCol : getExpenditureCreditorCol(category);
            await deleteDoc(doc(targetCol, id));
            toast('success', 'Kreditur berhasil dihapus.');
            if (creditorType === 'funding') {
                await fetchFundingCreditors();
                 if ($('#manageCreditors-modal')) {
                    renderFundingCreditorsTable($('#modal-creditors-table-container'));
                }
                if (appState.activePage === 'pemasukan-pinjaman') {
                    renderPemasukanPage($('#page-pemasukan-pinjaman'));
                }
            } else {
                await fetchExpenditureCreditors(category);
                if ($('#manageCreditors-modal')) {
                    renderExpenditureCreditorsTable($('#modal-creditors-table-container'), category);
                }
                if (appState.activePage === 'input-data') {
                    renderInvoiceForm($('#sub-page-content'), category);
                }
            }
        } catch (error) {
            toast('error', 'Gagal menghapus kreditur.');
            console.error('Error deleting creditor:', error);
        }
    }
    
    // ===== FUNGSI HALAMAN LAIN (ABSENSI, STOK, DLL) =====
    async function renderLaporanPage(container) {
        const today = todayStr();
        const firstDayOfMonth = today.slice(0, 8) + '01';
        container.innerHTML = `
            <div class="section-head"><h4>Laporan Keuangan</h4></div>
            <div class="card card-pad">
                <div class="form-grid" style="margin-bottom: 1.5rem;">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth}"></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${today}"></div>
                    <div class="form-group"><button id="generate-report-btn" class="btn btn-primary">Tampilkan</button></div>
                </div>
                <div id="report-content">
                    <p class="empty-state">Pilih rentang tanggal dan klik "Tampilkan" untuk melihat laporan.</p>
                </div>
            </div>
        `;
        $('#generate-report-btn').addEventListener('click', generateFinancialReport);
    }
    
    async function generateFinancialReport() {
        const startDate = new Date($('#report-start-date').value);
        const endDate = new Date($('#report-end-date').value);
        endDate.setHours(23, 59, 59, 999); 
    
        if (startDate > endDate) {
            toast('error', 'Tanggal mulai tidak boleh melebihi tanggal akhir.');
            return;
        }
    
        const reportContainer = $('#report-content');
        reportContainer.innerHTML = '<p>Membuat laporan...</p>';
        toast('loading', 'Mengambil data...');
    
        try {
            const expensePromises = invoiceCategories.map(cat => 
                getDocs(query(getInvoiceCol(cat), where("date", ">=", startDate), where("date", "<=", endDate)))
            );
            const incomePromise = getDocs(query(fundingSourcesCol, where("date", ">=", startDate), where("date", "<=", endDate)));
            
            const [incomeSnap, ...expenseSnaps] = await Promise.all([incomePromise, ...expensePromises]);

            let totalIncome = 0;
            const incomeData = incomeSnap.docs.map(doc => {
                const data = doc.data();
                totalIncome += data.amount;
                return data;
            });

            let totalExpenses = 0;
            let expenseByCategory = { operasional: 0, material: 0, lainnya: 0 };
            expenseSnaps.forEach((snap, index) => {
                const category = invoiceCategories[index];
                snap.forEach(doc => {
                    const data = doc.data();
                    totalExpenses += data.totalAmount;
                    expenseByCategory[category] += data.totalAmount;
                });
            });

            const netCashFlow = totalIncome - totalExpenses;
            
            reportContainer.innerHTML = `
                <div class="dashboard-grid" style="margin-bottom: 2rem;">
                    <div class="dashboard-widget"><h5 class="widget-title">Total Pemasukan</h5><div class="widget-main-value">${fmtIDR(totalIncome)}</div></div>
                    <div class="dashboard-widget"><h5 class="widget-title">Total Pengeluaran</h5><div class="widget-main-value">${fmtIDR(totalExpenses)}</div></div>
                    <div class="dashboard-widget"><h5 class="widget-title">Arus Kas Bersih</h5><div class="widget-main-value" style="color:${netCashFlow < 0 ? 'var(--danger)' : 'var(--success)'};">${fmtIDR(netCashFlow)}</div></div>
                </div>
                <div class="report-details-grid">
                    <div class="card card-pad">
                        <h5 class="form-section-title">Rincian Pemasukan</h5>
                        <div class="table-container">${renderIncomeReportTable(incomeData)}</div>
                    </div>
                    <div class="card card-pad">
                         <h5 class="form-section-title">Rincian Pengeluaran</h5>
                         <div class="table-container">
                            <table class="table"><tbody>
                                <tr><td>Operasional</td><td class="text-right">${fmtIDR(expenseByCategory.operasional)}</td></tr>
                                <tr><td>Material</td><td class="text-right">${fmtIDR(expenseByCategory.material)}</td></tr>
                                <tr><td>Lainnya</td><td class="text-right">${fmtIDR(expenseByCategory.lainnya)}</td></tr>
                            </tbody></table>
                         </div>
                         <div class="chart-container" style="margin-top:1rem;"><canvas id="financial-chart"></canvas></div>
                    </div>
                </div>
            `;
    
            if (appState.reports.financialChart) {
                appState.reports.financialChart.destroy();
            }
    
            const chartCtx = document.getElementById('financial-chart').getContext('2d');
            appState.reports.financialChart = new Chart(chartCtx, {
                type: 'bar',
                data: {
                    labels: ['Pemasukan', 'Pengeluaran'],
                    datasets: [{
                        label: 'Total (Rp)',
                        data: [totalIncome, totalExpenses],
                        backgroundColor: ['rgba(34, 197, 94, 0.7)', 'rgba(239, 68, 68, 0.7)'],
                        borderColor: ['rgb(34, 197, 94)', 'rgb(239, 68, 68)'],
                        borderWidth: 1
                    }]
                },
                options: { 
                    responsive: true, 
                    maintainAspectRatio: true,
                    plugins: { legend: { display: false } },
                    scales: { y: { beginAtZero: true } }
                }
            });
            toast('success', 'Laporan berhasil dibuat.');
        } catch (error) {
            toast('error', 'Gagal membuat laporan.');
            console.error("Report generation error:", error);
            reportContainer.innerHTML = '<p class="empty-state">Terjadi kesalahan saat mengambil data.</p>';
        }
    }

    function renderIncomeReportTable(incomeData) {
        if (incomeData.length === 0) return '<p class="empty-state">Tidak ada pemasukan pada periode ini.</p>';
        return `<table class="table">
            <thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th class="text-right">Jumlah</th></tr></thead>
            <tbody>
                ${incomeData.map(item => `
                    <tr>
                        <td>${item.date.toDate().toLocaleDateString('id-ID')}</td>
                        <td><span class="badge">${item.type}</span></td>
                        <td>${item.description}</td>
                        <td class="text-right">${fmtIDR(item.amount)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
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
        container.innerHTML = workers.length === 0 ? '<p class="empty-state">Belum ada data pekerja.</p>' :
            `<div class="table-container">
                <table class="table">
                    <thead><tr><th>Nama</th><th>Jabatan</th><th>Proyek</th><th>Upah Harian</th><th class="action-cell">Aksi</th></tr></thead>
                    <tbody>
                    ${workers.map(worker => `
                        <tr>
                            <td><strong>${worker.workerName}</strong></td>
                            <td>${worker.position}</td>
                            <td>${appState.projects.find(p => p.id === worker.projectId)?.projectName || 'N/A'}</td>
                            <td>${fmtIDR(worker.dailyWage)}</td>
                            <td class="action-cell">
                                <div class="action-menu">
                                    <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                    <div class="action-dropdown hidden">
                                        <button class="action-dropdown-item btn-edit-worker" data-id="${worker.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                                        <button class="action-dropdown-item action-dropdown-item--danger btn-delete-worker" data-id="${worker.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    `).join('')}
                    </tbody>
                </table>
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
            const attendanceDocRef = doc(attendanceCol, appState.attendanceDate);
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
                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Nama</th><th>Status Hari Ini</th><th class="action-cell">Aksi</th></tr></thead>
                        <tbody>
                        ${appState.workers.map(worker => {
                            const attendanceRecord = attendanceData[worker.id];
                            const statusInfo = statusMap[attendanceRecord?.status] || { text: 'Belum Absen', badge: 'belumabsen'};
                            let statusText = statusInfo.text;
                            if (attendanceRecord?.overtime > 0) {
                                statusText += ` (+${attendanceRecord.overtime} jam lembur)`;
                            }
                            return `
                                <tr>
                                    <td><strong>${worker.workerName}</strong><br><small>${worker.position}</small></td>
                                    <td><span class="badge badge--${statusInfo.badge}">${statusText}</span></td>
                                    <td class="action-cell">
                                        <button class="btn btn-secondary btn-sm btn-change-status" data-id="${worker.id}" data-name="${worker.workerName}">Ubah Status</button>
                                    </td>
                                </tr>`;
                        }).join('')}
                        </tbody>
                    </table>
                </div>
            `;
            $$('.btn-change-status').forEach(btn => btn.addEventListener('click', (e) => {
                const { id, name } = e.currentTarget.dataset;
                const worker = appState.workers.find(w => w.id === id);
                createModal('attendanceStatus', { workerId: id, workerName: name, onSelect: (status, overtime) => handleUpdateAttendance(id, worker, status, overtime) });
            }));
        } catch (error) {
            container.innerHTML = '<p class="empty-state">Gagal memuat data.</p>';
            console.error("Error rendering workers list:", error);
        }
    }
    
    async function handleMarkAllPresent() {
        toast('loading', 'Mengabsen semua pekerja...');
        const date = appState.attendanceDate;
        const workersToMark = appState.workers;
        if (workersToMark.length === 0) {
            toast('error', 'Tidak ada pekerja untuk diabsen.');
            return;
        }

        const batch = writeBatch(db);
        workersToMark.forEach(worker => {
            handleUpdateAttendance(worker.id, worker, 'hadir_penuh', 0, date, true); // Use batch update
        });

        toast('success', `${workersToMark.length} pekerja ditandai hadir.`);
        renderWorkersList();
    }
    
    async function handleUpdateAttendance(workerId, worker, status, overtime = 0, date = appState.attendanceDate, useBatch = false) {
        if(!useBatch) toast('loading', 'Menyimpan absensi...');
    
        try {
            const attendanceDocRef = doc(attendanceCol, date);
            const attendanceUpdate = {
                [`records.${workerId}`]: {
                    status: status,
                    workerName: worker.workerName,
                    overtime: overtime,
                    updatedAt: serverTimestamp()
                }
            };
            await setDoc(attendanceDocRef, attendanceUpdate, { merge: true });
    
            // Update payroll liability
            await updatePayrollLiability(worker, status, overtime, new Date(date));
    
            if(!useBatch) {
                toast('success', 'Status kehadiran diperbarui.');
                renderWorkersList();
            }
        } catch (error) {
            if(!useBatch) toast('error', 'Gagal menyimpan absensi.');
            console.error("Attendance update error:", error);
        }
    }

    function getPayrollPeriod(date, cycle) {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        let startDate, endDate;

        switch (cycle) {
            case 'harian':
                startDate = d;
                endDate = new Date(d);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'mingguan':
                const day = d.getDay();
                const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust to Monday
                startDate = new Date(d.setDate(diff));
                endDate = new Date(startDate);
                endDate.setDate(startDate.getDate() + 6);
                endDate.setHours(23, 59, 59, 999);
                break;
            case 'bulanan':
                startDate = new Date(d.getFullYear(), d.getMonth(), 1);
                endDate = new Date(d.getFullYear(), d.getMonth() + 1, 0);
                endDate.setHours(23, 59, 59, 999);
                break;
        }
        return { startDate, endDate };
    }

    async function updatePayrollLiability(worker, status, overtime, date) {
        const { paymentCycle = 'harian', dailyWage = 0, overtimeRate = 0 } = worker;
        const period = getPayrollPeriod(date, paymentCycle);
        const liabilityId = `${worker.id}_${period.endDate.toISOString().slice(0, 10)}`;
        const liabilityRef = doc(payrollLiabilitiesCol, liabilityId);

        let wageMultiplier = 0;
        if (status === 'hadir_penuh') wageMultiplier = 1;
        if (status === 'setengah_hari') wageMultiplier = 0.5;

        const baseWageToday = dailyWage * wageMultiplier;
        const overtimeWageToday = overtime * overtimeRate;
        const totalWageToday = baseWageToday + overtimeWageToday;

        await runTransaction(db, async (transaction) => {
            const liabilityDoc = await transaction.get(liabilityRef);
            if (!liabilityDoc.exists()) {
                transaction.set(liabilityRef, {
                    workerId: worker.id,
                    workerName: worker.workerName,
                    projectId: worker.projectId,
                    projectName: appState.projects.find(p => p.id === worker.projectId)?.projectName || 'N/A',
                    paymentCycle,
                    startDate: Timestamp.fromDate(period.startDate),
                    endDate: Timestamp.fromDate(period.endDate),
                    daysWorkedFull: status === 'hadir_penuh' ? 1 : 0,
                    daysWorkedHalf: status === 'setengah_hari' ? 1 : 0,
                    overtimeHours: overtime,
                    totalLiability: totalWageToday,
                    isPaid: false,
                    createdAt: serverTimestamp(),
                });
            } else {
                const data = liabilityDoc.data();
                transaction.update(liabilityRef, {
                    daysWorkedFull: data.daysWorkedFull + (status === 'hadir_penuh' ? 1 : 0),
                    daysWorkedHalf: data.daysWorkedHalf + (status === 'setengah_hari' ? 1 : 0),
                    overtimeHours: data.overtimeHours + overtime,
                    totalLiability: data.totalLiability + totalWageToday,
                });
            }
        });
    }
    
    async function handlePayrollPayment(liabilityId, amount, date) {
        toast('loading', 'Memproses pembayaran gaji...');
        try {
            const liabilityRef = doc(payrollLiabilitiesCol, liabilityId);
            await updateDoc(liabilityRef, {
                isPaid: true,
                amountPaid: amount,
                paidDate: Timestamp.fromDate(new Date(date))
            });
            toast('success', 'Gaji berhasil dibayarkan.');
            renderTagihanPage($('#page-tagihan'));
        } catch (error) {
            toast('error', 'Gagal memproses pembayaran gaji.');
            console.error("Payroll payment error:", error);
        }
    }


    async function handleSaveWorker(data = {}) {
        const { id: workerId } = data;
        const isEdit = !!workerId;
        const workerName = $('#worker-name').value.trim();
        const position = $('#worker-position').value.trim();
        const dailyWage = getNumericValue($('#worker-wage').value);
        const overtimeRate = getNumericValue($('#worker-overtime').value);
        const paymentCycle = $('#worker-payment-cycle').value;
        const projectId = $('#worker-project').value;
        if (!workerName || !position || !dailyWage || !projectId || !paymentCycle) { toast('error', 'Semua kolom wajib diisi.'); return; }

        toast('loading', 'Menyimpan data pekerja...');
        try {
            const docRef = isEdit ? doc(workersCol, workerId) : doc(workersCol);
            const saveData = { workerName, position, dailyWage, overtimeRate, paymentCycle, projectId, updatedAt: serverTimestamp() };
            if (!isEdit) saveData.createdAt = serverTimestamp();
            await setDoc(docRef, saveData, { merge: true });
            toast('success', 'Data pekerja berhasil disimpan.');
            closeModal();
            await fetchWorkers();
            
            // PERBAIKAN: Refresh tabel di modal dan halaman utama
            if ($('#manageWorkers-modal')) {
                renderWorkersCollectionTable($('#modal-workers-table-container'));
            }
            if (appState.activePage === 'absensi') {
                renderWorkersList();
            }

        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
        }
    }

    async function handleDeleteWorker(workerId) {
        toast('loading', 'Menghapus pekerja...');
        try {
            await deleteDoc(doc(workersCol, workerId));
            toast('success', 'Pekerja berhasil dihapus.');
            await fetchWorkers();
            
            // PERBAIKAN: Refresh tabel di modal dan halaman utama
            if ($('#manageWorkers-modal')) {
                renderWorkersCollectionTable($('#modal-workers-table-container'));
            }
            if (appState.activePage === 'absensi') {
                renderWorkersList();
            }
        } catch (error) {
            toast('error', 'Gagal menghapus pekerja.');
        }
    }

    async function renderManajemenStokPage(container) {
        container.innerHTML = `
            <div class="section-head">
                <h4>Manajemen Stok Material</h4>
                <div style="display: flex; gap: 0.5rem;">
                    <button id="add-stock-item-btn" class="btn btn-secondary"><span class="material-symbols-outlined">add_business</span>Master Material</button>
                    <button id="record-usage-btn" class="btn btn-primary"><span class="material-symbols-outlined">edit_document</span>Catat Penggunaan</button>
                </div>
            </div>
            <div class="card card-pad" style="margin-top: 1.5rem;">
                <h5 class="form-section-title">Posisi Stok Saat Ini</h5>
                <div id="stock-table-container"><p>Memuat...</p></div>
            </div>
             <div class="card card-pad" style="margin-top: 1.5rem;">
                <h5 class="form-section-title">Riwayat Transaksi Stok</h5>
                <div id="stock-history-container"><p>Memuat...</p></div>
            </div>
        `;
    
        $('#add-stock-item-btn').addEventListener('click', () => createModal('newStockItem', {}));
        $('#record-usage-btn').addEventListener('click', () => {
            if (appState.stockItems.length > 0) {
                createModal('recordStockUsage');
            } else {
                toast('error', 'Tidak ada master material. Harap tambahkan terlebih dahulu.');
            }
        });
    
        await fetchAndRenderStockTables();
    }
    
    async function fetchAndRenderStockTables() {
        try {
            const stockSnap = await getDocs(query(stockItemsCol, orderBy('itemName')));
            appState.stockItems = stockSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    
            const stockTableContainer = $('#stock-table-container');
            if (appState.stockItems.length === 0) {
                stockTableContainer.innerHTML = '<p class="empty-state">Belum ada master material. Tambahkan melalui tombol di atas.</p>';
            } else {
                stockTableContainer.innerHTML = `
                <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Nama Material</th><th>Satuan</th><th class="text-right">Stok Saat Ini</th><th class="action-cell">Aksi</th></tr></thead>
                        <tbody>
                            ${appState.stockItems.map(item => `
                                <tr>
                                    <td>${item.itemName}</td>
                                    <td>${item.unit}</td>
                                    <td class="text-right"><strong>${item.currentStock || 0}</strong></td>
                                    <td class="action-cell">
                                        <div class="action-menu">
                                            <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                                            <div class="action-dropdown hidden">
                                                <button class="action-dropdown-item btn-edit-stock" data-id="${item.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                                                <button class="action-dropdown-item action-dropdown-item--danger btn-delete-stock" data-id="${item.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                                            </div>
                                        </div>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
            }
            $$('.btn-edit-stock').forEach(b => b.addEventListener('click', e => {
                const item = appState.stockItems.find(i => i.id === e.currentTarget.dataset.id);
                createModal('editStockItem', item);
            }));
            $$('.btn-delete-stock').forEach(b => b.addEventListener('click', e => {
                 const itemId = e.currentTarget.dataset.id;
                 createModal('confirmDelete', { title: 'Hapus Master Material', onConfirm: () => handleDeleteStockItem(itemId) });
            }));
    
            const historySnap = await getDocs(query(stockTransactionsCol, orderBy('date', 'desc'), limit(50)));
            const history = historySnap.docs.map(d => d.data());
            const historyContainer = $('#stock-history-container');
             if (history.length === 0) {
                historyContainer.innerHTML = '<p class="empty-state">Belum ada transaksi.</p>';
            } else {
                historyContainer.innerHTML = `
                <div class="table-container">
                     <table class="table">
                        <thead><tr><th>Tanggal</th><th>Nama Material</th><th>Jenis</th><th>Jumlah</th><th>Keterangan</th></tr></thead>
                        <tbody>
                            ${history.map(t => `
                                <tr>
                                    <td>${t.date.toDate().toLocaleString('id-ID')}</td>
                                    <td>${t.itemName}</td>
                                    <td><span class="badge ${t.type === 'in' ? 'badge--green' : 'badge--danger'}">${t.type === 'in' ? 'Masuk' : 'Keluar'}</span></td>
                                    <td>${t.quantity} ${t.unit}</td>
                                    <td>${t.notes || '-'}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>`;
            }
    
        } catch (error) {
            toast('error', 'Gagal memuat data stok.');
            console.error("Stock fetching error:", error);
        }
    }

    async function handleSaveStockItem(data = {}) {
        const { id: itemId } = data;
        const isEdit = !!itemId;
        const itemName = $('#stock-item-name').value.trim();
        const unit = $('#stock-item-unit').value.trim();
        if (!itemName || !unit) { toast('error', 'Nama dan satuan harus diisi.'); return; }
        
        toast('loading', 'Menyimpan...');
        try {
            const docRef = isEdit ? doc(stockItemsCol, itemId) : doc(stockItemsCol);
            let saveData = { itemName, unit, updatedAt: serverTimestamp() };
            if (!isEdit) {
                saveData.createdAt = serverTimestamp();
                saveData.currentStock = 0;
            }
            await setDoc(docRef, saveData, { merge: true });
            toast('success', 'Master material disimpan.');
            closeModal();
            fetchAndRenderStockTables();
        } catch (error) { toast('error', 'Gagal menyimpan.'); }
    }
    
    async function handleDeleteStockItem(itemId) {
        toast('loading', 'Menghapus...');
        try {
            await deleteDoc(doc(stockItemsCol, itemId));
            toast('success', 'Master material dihapus.');
            fetchAndRenderStockTables();
        } catch (error) { toast('error', 'Gagal menghapus.'); }
    }
    
    async function handleRecordStockUsage(e) {
        e.preventDefault();
        const stockItemId = $('#usage-item').value;
        const quantity = parseFloat($('#usage-qty').value);
        const date = new Date($('#usage-date').value);
        const notes = $('#usage-notes').value.trim();
        const selectedItem = appState.stockItems.find(i => i.id === stockItemId);
    
        if (!stockItemId || !quantity || !quantity <= 0 || !selectedItem) {
            toast('error', 'Harap isi semua data dengan benar.'); return;
        }
        if (quantity > selectedItem.currentStock) {
            toast('error', `Stok tidak mencukupi (sisa ${selectedItem.currentStock}).`); return;
        }
    
        toast('loading', 'Menyimpan...');
        try {
            await runTransaction(db, async (transaction) => {
                const stockItemRef = doc(stockItemsCol, stockItemId);
                const transactionRef = doc(stockTransactionsCol);
                
                transaction.update(stockItemRef, { currentStock: selectedItem.currentStock - quantity });
                
                transaction.set(transactionRef, {
                    stockItemId,
                    itemName: selectedItem.itemName,
                    type: 'out',
                    quantity,
                    unit: selectedItem.unit,
                    date: Timestamp.fromDate(date),
                    notes,
                    recordedBy: appState.currentUser.email
                });
            });
            toast('success', 'Penggunaan material berhasil dicatat.');
            closeModal();
            fetchAndRenderStockTables();
        } catch(error) {
            toast('error', 'Gagal mencatat penggunaan.');
            console.error("Stock usage error:", error);
        }
    }

    async function renderPembayaranDigitalPage(container) {
        container.innerHTML = `<div class="card card-pad">Halaman Pembayaran Digital dalam pengembangan.</div>`;
    }

    async function renderPembelianPage(container) {
        container.innerHTML = `<div class="card card-pad">Halaman Pembelian dalam pengembangan.</div>`;
    }

    async function renderAlokasiPage(container) {
        const envelopes = appState.digitalEnvelopes;
        container.innerHTML = `
            <div class="section-head"><h4>Alokasi Anggaran</h4></div>
            <div class="allocation-grid">
                <div class="card card-pad">
                    <h5 class="form-section-title">Sumber Dana</h5>
                    <p class="section-subtitle">Pindahkan dana dari pos "Belum Dialokasikan" ke pos anggaran lainnya.</p>
                    <div class="dashboard-widget">
                        <h5 class="widget-title">Dana Belum Dialokasikan</h5>
                        <div class="widget-main-value" id="unallocated-funds-display">${fmtIDR(envelopes.unallocatedFunds)}</div>
                    </div>
                </div>
                <div class="card card-pad">
                    <form id="allocation-form">
                        <h5 class="form-section-title">Alokasikan ke Amplop</h5>
                        <div class="form-group"><label for="alloc-operational">Operasional</label><input type="text" id="alloc-operational" placeholder="0"></div>
                        <div class="form-group"><label for="alloc-debt">Pembayaran Utang</label><input type="text" id="alloc-debt" placeholder="0"></div>
                        <div class="form-group"><label for="alloc-reserve">Dana Cadangan</label><input type="text" id="alloc-reserve" placeholder="0"></div>
                        <div class="form-group"><label for="alloc-profit">Laba</label><input type="text" id="alloc-profit" placeholder="0"></div>
                        <div class="payment-summary" style="margin-top: 1rem;"><span>Sisa Dana:</span><strong id="remaining-alloc-preview">${fmtIDR(envelopes.unallocatedFunds)}</strong></div>
                        <div class="form-group full" style="margin-top:1.5rem;"><button type="submit" class="btn btn-primary">Simpan Alokasi</button></div>
                    </form>
                </div>
            </div>
             <div class="section-head" style="margin-top:2rem"><h4>Posisi Amplop Saat Ini</h4></div>
             <div class="envelope-grid">
                <div class="envelope-card"><h6>Operasional</h6><div class="amount">${fmtIDR(envelopes.operational)}</div></div>
                <div class="envelope-card"><h6>Pembayaran Utang</h6><div class="amount">${fmtIDR(envelopes.debtPayment)}</div></div>
                <div class="envelope-card"><h6>Dana Cadangan</h6><div class="amount">${fmtIDR(envelopes.reserve)}</div></div>
                <div class="envelope-card"><h6>Laba</h6><div class="amount">${fmtIDR(envelopes.profit)}</div></div>
            </div>
        `;
    
        $$('#alloc-operational, #alloc-debt, #alloc-reserve, #alloc-profit').forEach(input => {
            formatRupiahInput(input);
            input.addEventListener('input', updateAllocationPreview);
        });
        $('#allocation-form').addEventListener('submit', handleSaveAllocation);
    }
    
    function updateAllocationPreview() {
        const unallocated = appState.digitalEnvelopes.unallocatedFunds || 0;
        const op = getNumericValue($('#alloc-operational').value);
        const debt = getNumericValue($('#alloc-debt').value);
        const reserve = getNumericValue($('#alloc-reserve').value);
        const profit = getNumericValue($('#alloc-profit').value);
        const totalAllocated = op + debt + reserve + profit;
        const remaining = unallocated - totalAllocated;
        $('#remaining-alloc-preview').textContent = fmtIDR(remaining);
        $('#remaining-alloc-preview').style.color = remaining < 0 ? 'var(--danger)' : 'var(--info)';
    }
    
    async function handleSaveAllocation(e) {
        e.preventDefault();
        const unallocated = appState.digitalEnvelopes.unallocatedFunds || 0;
        const op = getNumericValue($('#alloc-operational').value);
        const debt = getNumericValue($('#alloc-debt').value);
        const reserve = getNumericValue($('#alloc-reserve').value);
        const profit = getNumericValue($('#alloc-profit').value);
        const totalAllocated = op + debt + reserve + profit;
    
        if (totalAllocated > unallocated) {
            toast('error', 'Total alokasi melebihi dana yang tersedia.');
            return;
        }
        if (totalAllocated <= 0) {
            toast('error', 'Masukkan jumlah alokasi.');
            return;
        }
    
        toast('loading', 'Menyimpan alokasi...');
        try {
            await runTransaction(db, async (transaction) => {
                const envDoc = await transaction.get(digitalEnvelopesDoc);
                const currentEnvelopes = envDoc.exists() ? envDoc.data() : { unallocatedFunds: 0, operational: 0, debtPayment: 0, reserve: 0, profit: 0 };
                
                const newUnallocated = currentEnvelopes.unallocatedFunds - totalAllocated;
                const newOp = (currentEnvelopes.operational || 0) + op;
                const newDebt = (currentEnvelopes.debtPayment || 0) + debt;
                const newReserve = (currentEnvelopes.reserve || 0) + reserve;
                const newProfit = (currentEnvelopes.profit || 0) + profit;
    
                transaction.update(digitalEnvelopesDoc, {
                    unallocatedFunds: newUnallocated,
                    operational: newOp,
                    debtPayment: newDebt,
                    reserve: newReserve,
                    profit: newProfit
                });
            });
            toast('success', 'Alokasi dana berhasil disimpan.');
            await fetchDigitalEnvelopes();
            renderAlokasiPage($('#page-alokasi-anggaran'));
        } catch (error) {
            toast('error', 'Gagal menyimpan alokasi.');
            console.error("Allocation error:", error);
        }
    }

    // ===== FUNGSI PENGATURAN BARU (DENGAN MANAJEMEN PROYEK) =====
    async function renderPengaturanPage(container) {
        if (appState.userRole !== 'Owner') { container.innerHTML = `<div class="placeholder-card">Akses Ditolak.</div>`; return; }
        container.innerHTML = `<div id="pengaturan-content"><p>Memuat...</p></div>`;
        
        let projectHTML = `
            <div class="section-head"><h4>Manajemen Proyek</h4><button id="add-project-btn" class="btn btn-primary" title="Tambah Proyek Baru"><span class="material-symbols-outlined">add</span></button></div>
            <div class="card card-pad" id="project-list-container">${renderProjectTable(appState.projects)}</div>`;

        const snap = await getDocs(query(membersCol, orderBy('createdAt', 'desc')));
        const members = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pending = members.filter(m => m.status === 'pending');
        const active = members.filter(m => m.status === 'active');
        const blocked = members.filter(m => ['rejected', 'revoked'].includes(m.status));
        let teamHTML = `
            <div class="section-head" style="margin-top:2rem;"><h4>Manajemen Tim</h4></div>
            ${pending.length > 0 ? `<div class="card card-pad approval-section"><h5 class="form-section-title">Menunggu Persetujuan (${pending.length})</h5>
                ${pending.map(m => `<div class="member-card-pro status-pending"><img src="${m.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${(m.name||'U')[0]}`}" class="member-card-pro__avatar" /><div class="member-card-pro__info"><strong>${m.name}</strong><span>${m.email}</span></div><div class="member-card-pro__actions"><button class="btn btn-danger btn-sm btn-reject" data-id="${m.id}">Tolak</button><button class="btn btn-success btn-sm btn-approve" data-id="${m.id}">Setujui</button></div></div>`).join('')}
            </div>` : ''}
            <div class="card card-pad" style="margin-top:1.5rem"><h5 class="form-section-title">Anggota Aktif</h5>${renderMemberTable(active)}</div>
            ${blocked.length > 0 ? `<div class="card card-pad" style="margin-top:1.5rem"><h5 class="form-section-title">Anggota Diblokir</h5>${renderMemberTable(blocked, true)}</div>` : ''}`;

        container.innerHTML = projectHTML + teamHTML;

        $('#add-project-btn').addEventListener('click', () => createModal('newProject', {}));
        $$('.btn-edit-project').forEach(b => b.addEventListener('click', e => { const proj = appState.projects.find(p=>p.id===e.currentTarget.dataset.id); createModal('editProject', proj); }));
        $$('.btn-delete-project').forEach(b => b.addEventListener('click', e => {
            const projectId = e.currentTarget.dataset.id;
            createModal('confirmDelete', { title: 'Hapus Proyek', onConfirm: () => handleDeleteProject(projectId) })
        }));
        $$('.btn-approve').forEach(b => b.addEventListener('click', e => handleUserStatus(e.currentTarget.dataset.id, 'active')));
        $$('.btn-reject').forEach(b => b.addEventListener('click', e => handleUserStatus(e.currentTarget.dataset.id, 'rejected')));
        $$('.role-select').forEach(s => { createCustomSelect(s); s.addEventListener('change', e => handleUserRole(e.target.dataset.userid, e.target.value)); });
        $$('.btn-revoke').forEach(b => b.addEventListener('click', e => {
            const userId = e.currentTarget.dataset.id;
            createModal('confirmDelete', { title: 'Cabut Akses', onConfirm: () => handleUserStatus(userId, 'revoked') })
        }));
        $$('.btn-reinstate').forEach(b => b.addEventListener('click', e => handleUserStatus(e.currentTarget.dataset.id, 'active')));
    }

    function renderProjectTable(projects) {
        if (projects.length === 0) return '<p class="empty-state">Belum ada proyek dibuat.</p>';
        return `<div class="table-container"><table class="table"><thead><tr><th>Nama Proyek</th><th>Deskripsi</th><th class="action-cell">Aksi</th></tr></thead><tbody>
            ${projects.map(p => `<tr>
                <td><strong>${p.projectName}</strong></td>
                <td>${p.description || '-'}</td>
                <td class="action-cell">
                    <div class="action-menu">
                        <button class="icon-btn action-menu-btn" title="Aksi"><span class="material-symbols-outlined">more_vert</span></button>
                        <div class="action-dropdown hidden">
                            <button class="action-dropdown-item btn-edit-project" data-id="${p.id}"><span class="material-symbols-outlined">create</span> Edit</button>
                            <button class="action-dropdown-item action-dropdown-item--danger btn-delete-project" data-id="${p.id}"><span class="material-symbols-outlined">delete</span> Hapus</button>
                        </div>
                    </div>
                </td>
            </tr>`).join('')}
        </tbody></table></div>`;
    }

    async function handleSaveProject(data = {}) {
        const { id } = data; const isEdit = !!id;
        const projectName = $('#project-name').value.trim();
        const description = $('#project-desc').value.trim();
        if (!projectName) return;
        const docRef = isEdit ? doc(projectsCol, id) : doc(collection(db, projectsCol.path));
        try {
            const projectData = { projectName, description, updatedAt: serverTimestamp() };
            if (!isEdit) projectData.createdAt = serverTimestamp();
            await setDoc(docRef, projectData, { merge: true });
            toast('success', `Proyek ${isEdit ? 'diperbarui' : 'disimpan'}.`); closeModal();
            await fetchProjects();
            renderPengaturanPage($('#page-pengaturan'));
        } catch (error) { toast('error', 'Gagal menyimpan proyek.'); }
    }

    async function handleDeleteProject(id) {
        toast('loading', 'Menghapus...');
        try {
            await deleteDoc(doc(projectsCol, id));
            toast('success', 'Proyek dihapus.');
            await fetchProjects();
            renderPengaturanPage($('#page-pengaturan'));
        } catch (error) { toast('error', 'Gagal menghapus proyek.'); }
    }

    function renderMemberTable(members, isBlocked = false) {
        if (members.length === 0) return '<p class="empty-state">Tidak ada data.</p>';
        return `<div class="table-container"><table class="table"><thead><tr><th>Nama</th><th>Email</th><th>Peran/Status</th><th class="action-cell">Aksi</th></tr></thead><tbody>
            ${members.map(m => `<tr><td><img src="${m.photoURL || `https://placehold.co/40x40/e2e8f0/64748b?text=${(m.name||'U')[0]}`}" class="table-avatar"/> ${m.name}</td><td>${m.email}</td><td>${isBlocked ? `<span class="badge badge--danger">${m.status}</span>` : `<span class="badge">${m.role}</span>`}</td><td class="action-cell">
                ${m.email === OWNER_EMAIL ? '<span>Owner</span>' : (isBlocked 
                    ? `<button class="btn btn-secondary btn-sm btn-reinstate" data-id="${m.id}">Aktifkan</button>`
                    : `<div><select class="role-select" data-userid="${m.id}"><option value="Viewer" ${m.role==='Viewer'?'selected':''}>Viewer</option><option value="Editor" ${m.role==='Editor'?'selected':''}>Editor</option></select>
                       <button class="icon-btn btn-revoke" data-id="${m.id}"><span class="material-symbols-outlined">block</span></button></div>`
                )}</td></tr>`).join('')}</tbody></table></div>`;
    }
    async function handleUserStatus(uid, newStatus) { try { await updateDoc(doc(membersCol, uid), { status: newStatus }); toast('success', 'Status diperbarui.'); renderPengaturanPage($('#page-pengaturan')); } catch (error) { toast('error', 'Gagal memperbarui.'); } }
    async function handleUserRole(uid, newRole) { try { await updateDoc(doc(membersCol, uid), { role: newRole }); toast('success', 'Peran diperbarui.'); } catch (error) { toast('error', 'Gagal memperbarui.'); } }

    // ===== Inisialisasi Aplikasi =====
    function init() {
        injectPageTemplates();
        const { authBtn, authDropdownBtn, openNavBtn, scrim, userProfileBtn, notificationBtn, themeToggleBtn, searchBtn } = getUIElements();
        const handleAuthAction = () => appState.currentUser ? createModal('confirmLogout') : createModal('login');
        authBtn.addEventListener('click', handleAuthAction);
        authDropdownBtn.addEventListener('click', () => { $('#user-dropdown').classList.add('hidden'); handleAuthAction(); });
        $$('.nav-item[data-nav]').forEach(btn => btn.addEventListener('click', () => {
            appState.activePage = btn.dataset.nav; localStorage.setItem('lastActivePage', appState.activePage);
            renderUI(); if (window.innerWidth < 901) { openNavBtn.classList.remove('is-active'); $('#sidebar').classList.remove('open'); scrim.classList.remove('show'); }
        }));
        openNavBtn.addEventListener('click', () => { openNavBtn.classList.toggle('is-active'); $('#sidebar').classList.toggle('open'); scrim.classList.toggle('show'); });
        scrim.addEventListener('click', () => { openNavBtn.classList.remove('is-active'); $('#sidebar').classList.remove('open'); scrim.classList.remove('show'); });
        searchBtn.addEventListener('click', () => createModal('globalSearch'));
        const toggleDropdown = (id) => (e) => { e.stopPropagation(); $$('.dropdown-panel').forEach(d => { if (d.id !== id) d.classList.add('hidden'); }); $(`#${id}`)?.classList.toggle('hidden'); };
        userProfileBtn.addEventListener('click', toggleDropdown('user-dropdown'));
        notificationBtn.addEventListener('click', toggleDropdown('notification-dropdown'));
        document.addEventListener('click', (e) => {
            if (!userProfileBtn.contains(e.target) && !$('#user-dropdown').contains(e.target)) $('#user-dropdown')?.classList.add('hidden');
            if (!notificationBtn.contains(e.target) && !$('#notification-dropdown').contains(e.target)) $('#notification-dropdown')?.classList.add('hidden');
            if (!e.target.closest('.custom-select-wrapper')) $$('.custom-select-wrapper.open').forEach(w => w.classList.remove('open'));
            
            // PEMBARUAN: Menutup dropdown aksi saat klik di luar
            if (!e.target.closest('.action-menu')) {
                $$('.action-dropdown.show').forEach(d => d.classList.remove('show'));
            } else {
                 // Logika untuk membuka dropdown yang diklik dan menutup yang lain
                const currentMenu = e.target.closest('.action-menu');
                const dropdown = currentMenu.querySelector('.action-dropdown');
                const isShowing = dropdown.classList.contains('show');
                $$('.action-dropdown.show').forEach(d => d.classList.remove('show'));
                if (!isShowing) dropdown.classList.add('show');
            }
        });
        themeToggleBtn.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            const isDark = document.body.classList.contains('dark-theme');
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
            themeToggleBtn.querySelector('.material-symbols-outlined').textContent = isDark ? 'dark_mode' : 'light_mode';
        });
        if (document.body.classList.contains('dark-theme')) themeToggleBtn.querySelector('.material-symbols-outlined').textContent = 'dark_mode';
    }

    function handleGlobalSearch(e) {
        const searchTerm = e.target.value.toLowerCase();
        const resultsContainer = $('#search-results');
        const filteredItems = NAV_PAGES.filter(item => item.name.toLowerCase().includes(searchTerm));
        
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
            searchBtn: $('#global-search-btn'),
        };
    }
    function injectPageTemplates() {
        const container = $('.page-container');
        if (!container || container.childElementCount > 0) return;
        container.innerHTML = NAV_PAGES.map(p => `<main id="page-${p.id}" class="page"></main>`).join('');
    }

    init();
});


