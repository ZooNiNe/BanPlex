/* global Chart, html2canvas, jspdf, Dexie */
// @ts-check

// =======================================================
//                       IMPORT PUSTAKA
// =======================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import { 
    getFirestore, collection, doc, getDoc, setDoc, updateDoc, serverTimestamp, onSnapshot,
    query, getDocs, addDoc, orderBy, deleteDoc, where, runTransaction, writeBatch, increment, Timestamp, enableNetwork, disableNetwork
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytesResumable, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

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
        activeSubPage: new Map(),
        isOnline: navigator.onLine,
        // --- Cache Data ---
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
        attendance: new Map(), // Menyimpan data absensi hari ini
        users: [],
    };

    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    // =======================================================
    //                DATABASE OFFLINE (INDEXEDDB)
    // =======================================================
    const offlineDB = new Dexie('BanPlexOfflineDB');
    offlineDB.version(1).stores({
        offlineQueue: '++id, type, payload', // type: 'expense', 'attendance', etc.
        offlineFiles: '++id, parentId, field, file' // To store blobs for offline uploads
    });
    
    const $ = (s, context = document) => context.querySelector(s);
    const $$ = (s, context = document) => Array.from(context.querySelectorAll(s));
    const fmtIDR = (n) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const parseFormattedNumber = (str) => Number(String(str).replace(/[^0-9]/g, ''));
    
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

    const masterDataConfig = {
        'projects': { collection: projectsCol, stateKey: 'projects', nameField: 'projectName', title: 'Proyek' },
        'clients': { collection: clientsCol, stateKey: 'clients', nameField: 'clientName', title: 'Klien' },
        'creditors': { collection: fundingCreditorsCol, stateKey: 'fundingCreditors', nameField: 'creditorName', title: 'Kreditur' },
        'op-cats': { collection: opCatsCol, stateKey: 'operationalCategories', nameField: 'categoryName', title: 'Kategori Operasional' },
        'other-cats': { collection: otherCatsCol, stateKey: 'otherCategories', nameField: 'categoryName', title: 'Kategori Lainnya' },
        'suppliers': { collection: suppliersCol, stateKey: 'suppliers', nameField: 'supplierName', title: 'Supplier' },
        'professions': { collection: professionsCol, stateKey: 'professions', nameField: 'professionName', title: 'Profesi' },
        'workers': { 
            collection: workersCol, 
            stateKey: 'workers', 
            nameField: 'workerName', 
            title: 'Pekerja',
        },
    };

    // =======================================================
    //         SISTEM TOAST & MODAL
    // =======================================================
    let popupTimeout;
    function toast(kind, text, duration = 3200) {
        clearTimeout(popupTimeout);
        const p = $('#popup-container'); if(!p) return;
        p.className = `popup-container show popup-${kind}`;
        const iconEl = $('#popup-icon');
        if(iconEl) iconEl.className = kind === 'loading' ? 'spinner' : 'material-symbols-outlined';
        $('#popup-message').textContent = text || '';
        if(kind !== 'loading'){ popupTimeout = setTimeout(() => p.classList.remove('show'), duration); }
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
    function getModalContent(type, data) {
        const modalWithHeader = (title, content) => `<div class="modal-content"><div class="modal-header"><h4>${title}</h4><button class="btn-icon" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body">${content}</div></div>`;
        const simpleModal = (title, content, footer) => `<div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>${title}</h4></div><div class="modal-body">${content}</div><div class="modal-footer">${footer}</div></div>`;

        if (type === 'login') return simpleModal('Login', '<p>Gunakan akun Google Anda.</p>', '<button id="google-login-btn" class="btn btn-primary">Masuk dengan Google</button>');
        if (type === 'confirmLogout') return simpleModal('Keluar', '<p>Anda yakin ingin keluar?</p>', '<button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button>');
        if (type === 'confirmDelete' || type === 'confirmPayment' || type === 'confirmEdit' || type === 'confirmPayBill' || type === 'confirmGenerateBill' || type === 'confirmUserAction') {
            const titles = { confirmDelete: 'Konfirmasi Hapus', confirmPayment: 'Konfirmasi Pembayaran', confirmEdit: 'Konfirmasi Perubahan', confirmPayBill: 'Konfirmasi Pembayaran', confirmGenerateBill: 'Konfirmasi Buat Tagihan', confirmUserAction: 'Konfirmasi Aksi' };
            const messages = { confirmDelete: 'Anda yakin ingin menghapus data ini?', confirmPayment: 'Anda yakin ingin melanjutkan pembayaran?', confirmEdit: 'Anda yakin ingin menyimpan perubahan?', confirmPayBill: 'Anda yakin ingin melanjutkan pembayaran ini?', confirmGenerateBill: 'Anda akan membuat tagihan gaji untuk pekerja ini. Lanjutkan?', confirmUserAction: 'Apakah Anda yakin?' };
            const confirmTexts = { confirmDelete: 'Hapus', confirmPayment: 'Ya, Bayar', confirmEdit: 'Ya, Simpan', confirmPayBill: 'Ya, Bayar', confirmGenerateBill: 'Ya, Buat Tagihan', confirmUserAction: 'Ya, Lanjutkan' };
            const confirmClasses = { confirmDelete: 'btn-danger', confirmPayment: 'btn-success', confirmEdit: 'btn-primary', confirmPayBill: 'btn-success', confirmGenerateBill: 'btn-primary', confirmUserAction: 'btn-primary' };
            
            return simpleModal(
                titles[type],
                `<p>${data.message || messages[type]}</p>`,
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
        return `<div>Konten tidak ditemukan</div>`;
    }
    function attachModalEventListeners(type, data, closeModalFunc) {
        if (type === 'login') $('#google-login-btn')?.addEventListener('click', signInWithGoogle);
        if (type === 'confirmLogout') $('#confirm-logout-btn')?.addEventListener('click', handleLogout);
        if (type.startsWith('confirm') && type !== 'confirmExpense') $('#confirm-btn')?.addEventListener('click', () => { data.onConfirm(); closeModalFunc(); });
        
        if (type === 'confirmExpense') {
            $('#confirm-paid-btn')?.addEventListener('click', () => { data.onConfirm('paid'); closeModalFunc(); });
            $('#confirm-bill-btn')?.addEventListener('click', () => { data.onConfirm('unpaid'); closeModalFunc(); });
        }
        if (type === 'payment') {
            const paymentForm = $('#payment-form');
            paymentForm?.addEventListener('submit', (e) => {
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
    //                 ALUR OTENTIKASI
    // =======================================================
    onAuthStateChanged(auth, async (user) => {
        if (appState.roleUnsub) appState.roleUnsub();
        if (user) {
            appState.currentUser = user;
            const userDocRef = doc(membersCol, user.uid);
            appState.roleUnsub = onSnapshot(userDocRef, async (docSnap) => {
                if (!docSnap.exists()) {
                    const isOwner = user.email === OWNER_EMAIL;
                    const initialData = { email: user.email, name: user.displayName, photoURL: user.photoURL, role: isOwner ? 'Owner' : 'Viewer', status: isOwner ? 'active' : 'pending', createdAt: serverTimestamp() };
                    await setDoc(userDocRef, initialData);
                    Object.assign(appState, { userRole: initialData.role, userStatus: initialData.status });
                } else {
                    const { role = 'Guest', status = 'pending' } = docSnap.data();
                    Object.assign(appState, { userRole: role, userStatus: status });
                }
                renderUI();
            });
        } else {
            Object.assign(appState, { currentUser: null, userRole: 'Guest', userStatus: null });
            renderUI();
        }
    });
    
    async function signInWithGoogle() { closeModal(); toast('loading', 'Menghubungkan...'); try { await signInWithPopup(auth, new GoogleAuthProvider()); toast('success', 'Login berhasil!'); } catch (error) { toast('error', `Login gagal.`); } }
    async function handleLogout() { closeModal(); toast('loading', 'Keluar...'); try { await signOut(auth); toast('success', 'Anda telah keluar.'); } catch (error) { toast('error', `Gagal keluar.`); } }
    
    // =======================================================
    //              FUNGSI RENDER & TAMPILAN
    // =======================================================
    async function renderUI() {
        updateHeaderTitle();
        renderBottomNav();
        updateNavActiveState();
        if (!appState.currentUser) { renderGuestLanding(); return; }
        if (appState.userStatus !== 'active') { renderPendingLanding(); return; }
        await renderPageContent();
    }
    
    function renderGuestLanding() {
        $('#bottom-nav').innerHTML = '';
        $('.page-container').innerHTML = `<div class="card card-pad" style="max-width:520px;margin:2rem auto;text-align:center;"><h4>Selamat Datang</h4><p>Masuk untuk melanjutkan.</p><button class="btn btn-primary" data-action="auth-action">Masuk dengan Google</button></div>`;
    }
    
    function renderPendingLanding() {
        $('#bottom-nav').innerHTML = '';
        $('.page-container').innerHTML = `<div class="card card-pad" style="max-width:520px;margin:2rem auto;text-align:center;"><h4>Menunggu Persetujuan</h4><p>Akun Anda sedang ditinjau oleh Owner.</p></div>`;
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
            'laporan': () => renderGenericTabPage('laporan', 'Laporan', [{id:'laba_rugi', label:'Laba Rugi'}, {id:'arus_kas', label:'Arus Kas'}, {id:'lainnya', label:'Lainnya'}]),
            'absensi': renderAbsensiPage,
        };
        
        container.innerHTML = `<div class="loader-container"><div class="spinner"></div></div>`;
        const renderer = pageRenderers[pageId];
        if (renderer) {
            await renderer();
        } else {
            container.innerHTML = `<div class="card card-pad">Halaman <strong>${pageId}</strong> dalam pengembangan.</div>`;
        }
    }
    
    // =======================================================
    //         LOGIKA NAVIGASI & HEADER
    // =======================================================
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

    function updateHeaderTitle() {
        const pageTitleEl = $('#header-page-title');
        if (!pageTitleEl) return;

        const currentPageLink = ALL_NAV_LINKS.find(link => link.id === appState.activePage);
        const pageName = currentPageLink ? currentPageLink.label : 'Halaman';
        pageTitleEl.textContent = pageName;
    }

    function renderBottomNav() {
        const nav = $('#bottom-nav');
        if (!nav || appState.userStatus !== 'active') { if(nav) nav.innerHTML = ''; return; }

        let navIdsToShow = [];
        // [UPDATE] Standardize bottom nav to 5 items for all roles.
        if (appState.userRole === 'Owner') navIdsToShow = ['dashboard', 'pemasukan', 'pengeluaran', 'absensi', 'pengaturan'];
        else if (appState.userRole === 'Editor') navIdsToShow = ['dashboard', 'pengeluaran', 'absensi', 'tagihan', 'pengaturan'];
        else if (appState.userRole === 'Viewer') navIdsToShow = ['dashboard', 'stok', 'tagihan', 'laporan', 'pengaturan'];
        
        const accessibleLinks = ALL_NAV_LINKS.filter(link => navIdsToShow.includes(link.id));
        
        nav.innerHTML = accessibleLinks.map(item => `
            <button class="nav-item" data-action="navigate" data-nav="${item.id}" aria-label="${item.label}">
                <span class="material-symbols-outlined">${item.icon}</span>
                <span class="nav-text">${item.label}</span>
            </button>
        `).join('');
    }
    
    function updateNavActiveState() {
        $$('.nav-item').forEach(item => item.classList.remove('active'));
        $$(`.nav-item[data-nav="${appState.activePage}"]`).forEach(el => el.classList.add('active'));
    }

    // =======================================================
    //             DATA FETCHING
    // =======================================================
    const fetchData = async (key, col, order = 'createdAt') => {
        appState[key] = []; // Clear cache before fetching
        try {
            const snap = await getDocs(query(col, orderBy(order, 'desc')));
            appState[key] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { console.error(`Failed to fetch ${key}:`, e); toast('error', `Gagal memuat data ${key}.`); }
    };

    // =======================================================
    //             RENDER KONTEN HALAMAN
    // =======================================================
    async function renderDashboardPage() {
        const container = $('.page-container');
        const accessibleLinks = ALL_NAV_LINKS.filter(link => 
            link.id !== 'dashboard' && link.roles.includes(appState.userRole)
        );
        container.innerHTML = `
            <div class="dashboard-nav-grid">
                ${accessibleLinks.map(link => `
                    <div class="nav-card" data-action="navigate" data-nav="${link.id}">
                        <div class="nav-card-icon"><span class="material-symbols-outlined">${link.icon}</span></div>
                        <span class="nav-card-label">${link.label}</span>
                    </div>
                `).join('')}
            </div>
        `;
    }

    async function renderPengaturanPage() {
        const container = $('.page-container');
        const { currentUser, userRole } = appState;
        const photo = currentUser?.photoURL || `https://placehold.co/80x80/e2e8f0/64748b?text=${(currentUser?.displayName||'U')[0]}`;
        
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
            ${userRole === 'Owner' ? `<div id="owner-settings" data-role="Owner">
                <h5 class="section-title-owner">Administrasi Owner</h5>
                <div class="dashboard-nav-grid">
                    <div class="nav-card" data-action="manage-master" data-type="projects"><div class="nav-card-icon"><span class="material-symbols-outlined">foundation</span></div><span class="nav-card-label">Kelola Proyek</span></div>
                    <div class="nav-card" data-action="manage-master-global"><div class="nav-card-icon"><span class="material-symbols-outlined">database</span></div><span class="nav-card-label">Master Data</span></div>
                    <div class="nav-card" data-action="manage-users"><div class="nav-card-icon"><span class="material-symbols-outlined">group</span></div><span class="nav-card-label">Manajemen User</span></div>
                </div>
            </div>` : ''}
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
                await fetchData('projects', projectsCol);
                formHTML = _getFormPemasukanHTML('termin');
            } else if (tabId === 'pinjaman') {
                await fetchData('fundingCreditors', fundingCreditorsCol);
                formHTML = _getFormPemasukanHTML('pinjaman');
            }
            
            contentContainer.innerHTML = formHTML + listHTML;
            _attachPemasukanFormListeners();
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
        await fetchData(key, col);
        
        listContainer.innerHTML = _getListPemasukanHTML(type);
    }

    const createMasterDataSelect = (id, label, options, selectedValue = '', masterType = null) => {
        const selectedOption = options.find(opt => opt.value === selectedValue);
        const selectedText = selectedOption ? selectedOption.text : 'Pilih...';
        const showMasterButton = masterType && masterType !== 'projects';

        return `
            <div class="form-group">
                <label>${label}</label>
                <div class="master-data-select">
                    <div class="custom-select-wrapper">
                        <input type="hidden" id="${id}" name="${id}" value="${selectedValue}">
                        <button type="button" class="custom-select-trigger">
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
                    <button class="btn-icon card-list-item-actions-trigger" data-action="open-actions">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
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

        toast('loading', 'Menyimpan...');
        try {
            if (type === 'termin') {
                const projectId = $('#pemasukan-proyek', form).value;
                if (!projectId) { toast('error', 'Silakan pilih proyek terkait.'); return; }
                await addDoc(incomesCol, { amount, date, projectId, createdAt: serverTimestamp() });
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
            }
            toast('success', 'Data berhasil disimpan!');
            form.reset();
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
        const tabs = [{id:'belum_lunas', label:'Belum Lunas'}, {id:'lunas', label:'Lunas'}, {id:'gaji', label:'Gaji'}];
        container.innerHTML = `
            <div class="sub-nav">
                ${tabs.map((tab, index) => `<button class="sub-nav-item ${index === 0 ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('')}
            </div>
            <div id="sub-page-content"><div class="loader-container"><div class="spinner"></div></div></div>
        `;
    
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
                queries.push(where("type", "!=", "gaji"));
                // This is the inequality, so the first orderBy must be 'type'
                queries.push(orderBy("type"));
            }
    
            if(statusQuery) {
                queries.push(statusQuery);
            }
            queries.push(orderBy("dueDate", "desc"));

            const q = query(billsCol, ...queries);
            const billsSnap = await getDocs(q);
            const bills = billsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            appState.bills = bills;

            contentContainer.innerHTML = _getBillsListHTML(bills, tabId);
        }
    
        $$('.sub-nav-item').forEach(btn => btn.addEventListener('click', (e) => {
            $$('.sub-nav-item').forEach(b => b.classList.remove('active'));
            e.currentTarget.classList.add('active');
            renderTabContent(e.currentTarget.dataset.tab);
        }));
    
        await renderTabContent(tabs[0].id);
    }

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
                const date = item.dueDate?.toDate ? item.dueDate.toDate().toLocaleDateString('id-ID', {day:'numeric', month:'long', year:'numeric'}) : 'Tanggal tidak valid';
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
                    <div class="card-list-item-content" data-action="open-bill-detail">
                        <div class="card-list-item-details">
                            <h5 class="card-list-item-title">${item.description}</h5>
                            <p class="card-list-item-subtitle">Jatuh tempo: ${date}</p>
                        </div>
                        <div class="card-list-item-amount-wrapper">
                            <strong class="card-list-item-amount">${fmtIDR(item.amount)}</strong>
                            ${secondaryInfoHTML}
                        </div>
                    </div>
                    <button class="btn-icon card-list-item-actions-trigger" data-action="open-actions">
                        <span class="material-symbols-outlined">more_vert</span>
                    </button>
                </div>
            `}).join('')}
        </div>
        `;
    }

    async function handlePayBill(billId) {
        createModal('confirmPayBill', {
            onConfirm: async () => {
                toast('loading', 'Memproses pelunasan...');
                try {
                    const billRef = doc(billsCol, billId);
                    const billSnap = await getDoc(billRef);

                    if (!billSnap.exists()) {
                        throw new Error('Tagihan tidak ditemukan!');
                    }

                    const expenseId = billSnap.data().expenseId;
                    
                    const batch = writeBatch(db);
                    batch.update(billRef, { status: 'paid', paidAmount: billSnap.data().amount, paidAt: serverTimestamp() });
                    if(expenseId) {
                        const expenseRef = doc(expensesCol, expenseId);
                        batch.update(expenseRef, { status: 'paid' });
                    }
                    await batch.commit();
                    
                    toast('success', 'Tagihan berhasil dilunasi.');
                    renderTagihanPage();

                } catch (error) {
                    toast('error', 'Gagal memproses pelunasan.');
                    console.error('Error paying bill:', error);
                }
            }
        });
    }

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
            await fetchData('suppliers', suppliersCol);
            await fetchData('projects', projectsCol);

            let categoryOptions = [], categoryMasterType = '', categoryLabel = '';

            if (tabId === 'material') {
                formHTML = _getFormFakturMaterialHTML();
            } else {
                if (tabId === 'operasional') {
                    await fetchData('operationalCategories', opCatsCol);
                    categoryOptions = appState.operationalCategories.map(c => ({ value: c.id, text: c.categoryName }));
                    categoryMasterType = 'op-cats';
                    categoryLabel = 'Kategori Operasional';
                }
                else if (tabId === 'lainnya') {
                    await fetchData('otherCategories', otherCatsCol);
                    categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                    categoryMasterType = 'other-cats';
                    categoryLabel = 'Kategori Lainnya';
                }
                formHTML = _getFormPengeluaranHTML(tabId, categoryOptions, categoryMasterType, categoryLabel);
            }
    
            contentContainer.innerHTML = formHTML + `<div id="pengeluaran-list-container"></div>`;
            _attachPengeluaranFormListeners(tabId);
            _rerenderPengeluaranList(tabId);
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
    
    function _getFormPengeluaranHTML(type, categoryOptions, categoryMasterType, categoryLabel) {
        const supplierOptions = appState.suppliers.map(s => ({ value: s.id, text: s.supplierName }));
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));

        return `
        <div class="card card-pad">
            <form id="pengeluaran-form" data-type="${type}">
                ${createMasterDataSelect('expense-project', 'Proyek', projectOptions, '', 'projects')}
                ${categoryOptions.length > 0 ? createMasterDataSelect('expense-category', categoryLabel, categoryOptions, '', categoryMasterType) : ''}
                <div class="form-group">
                    <label>Jumlah</label>
                    <input type="text" id="pengeluaran-jumlah" inputmode="numeric" required placeholder="mis. 50.000">
                </div>
                 <div class="form-group">
                    <label>Deskripsi</label>
                    <input type="text" id="pengeluaran-deskripsi" required placeholder="mis. Beli semen">
                </div>
                ${createMasterDataSelect('expense-supplier', 'Supplier/Penerima', supplierOptions, '', 'suppliers')}
                <div class="form-group">
                    <label>Tanggal</label>
                    <input type="date" id="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </form>
        </div>
        `;
    }
    
    function _attachPengeluaranFormListeners(type) {
        _initCustomSelects();
        if (type === 'material') {
             $('#material-invoice-form')?.addEventListener('submit', (e) => handleAddPengeluaran(e, type));
             $('#add-invoice-item-btn')?.addEventListener('click', _addInvoiceItemRow);
             $('#invoice-items-container')?.addEventListener('input', _handleInvoiceItemChange);
             $('#pengeluaran-deskripsi').addEventListener('input', (e) => {
                if(e.target.value.trim() === '') _generateInvoiceNumber();
             });
             _generateInvoiceNumber();
        } else {
            $('#pengeluaran-jumlah')?.addEventListener('input', _formatNumberInput);
            $('#pengeluaran-form')?.addEventListener('submit', (e) => handleAddPengeluaran(e, type));
        }
    }
    
    async function handleAddPengeluaran(e, type) {
        e.preventDefault();
        const form = e.target;
        let expenseData;
        const projectId = form.elements['expense-project']?.value || form.elements['project-id']?.value;

        if (!projectId) {
            toast('error', 'Proyek harus dipilih.');
            return;
        }

        if (type === 'material') {
            const items = [];
            $$('.invoice-item-row').forEach(row => {
                const name = row.querySelector('input[name="itemName"]').value;
                const price = parseFormattedNumber(row.querySelector('input[name="itemPrice"]').value);
                const qty = Number(row.querySelector('input[name="itemQty"]').value);
                if (name && price > 0 && qty > 0) {
                    items.push({ name, price, qty, total: price * qty });
                }
            });

            if (items.length === 0) {
                toast('error', 'Harap tambahkan minimal satu barang.'); return;
            }

            expenseData = {
                amount: parseFormattedNumber($('#invoice-total-amount').textContent),
                description: $('#pengeluaran-deskripsi', form).value.trim(),
                supplierId: $('#supplier-id', form).value,
                date: new Date($('#pengeluaran-tanggal', form).value),
                type: type,
                projectId,
                items: items,
                invoiceFile: form.elements.invoiceFile.files[0] || null,
                deliveryOrderFile: form.elements.deliveryOrderFile.files[0] || null
            };
            if(!expenseData.supplierId) {
                toast('error', 'Harap pilih supplier.'); return;
            }

        } else {
             expenseData = {
                amount: parseFormattedNumber($('#pengeluaran-jumlah', form).value),
                description: $('#pengeluaran-deskripsi', form).value.trim(),
                supplierId: form.elements['expense-supplier'].value,
                categoryId: form.elements['expense-category']?.value || '',
                date: new Date($('#pengeluaran-tanggal', form).value),
                type: type,
                projectId
            };
            if (!expenseData.supplierId) {
                 toast('error', 'Harap pilih supplier/penerima.'); return;
            }
        }
    
        if (!expenseData.amount || !expenseData.description) {
            toast('error', 'Harap isi deskripsi dan jumlah.');
            return;
        }
    
        createModal('confirmExpense', {
            onConfirm: (status) => {
                _saveExpense(expenseData, status, form);
            }
        });
    }
    
    async function _saveExpense(expenseData, status, form) {
        toast('loading', 'Menyimpan pengeluaran...');
        try {
            const { invoiceFile, deliveryOrderFile, ...dataToSave } = expenseData;
            
            Object.assign(dataToSave, {
                status: status,
                createdAt: serverTimestamp(),
                invoiceUrl: '',
                deliveryOrderUrl: ''
            });
    
            // Offline Handling
            if (!appState.isOnline) {
                const tempId = `offline_${Date.now()}`;
                const offlineRecord = {
                    id: tempId,
                    type: 'expense',
                    payload: dataToSave
                };
                const offlineId = await offlineDB.offlineQueue.add(offlineRecord);
                if(invoiceFile) await offlineDB.offlineFiles.add({ parentId: offlineId, field: 'invoiceUrl', file: invoiceFile });
                if(deliveryOrderFile) await offlineDB.offlineFiles.add({ parentId: offlineId, field: 'deliveryOrderUrl', file: deliveryOrderFile });
                
                toast('success', 'Anda offline. Data disimpan lokal & akan disinkronkan.');
            } else {
                const expenseDocRef = await addDoc(expensesCol, dataToSave);
                if (status === 'unpaid') {
                    await addDoc(billsCol, {
                        expenseId: expenseDocRef.id,
                        description: dataToSave.description,
                        amount: dataToSave.amount,
                        paidAmount: 0,
                        dueDate: dataToSave.date,
                        status: 'unpaid',
                        type: dataToSave.type,
                        createdAt: serverTimestamp()
                    });
                }
                toast('success', 'Data berhasil disimpan!');
                if (invoiceFile) _uploadFileInBackground(expenseDocRef.id, 'invoiceUrl', invoiceFile);
                if (deliveryOrderFile) _uploadFileInBackground(expenseDocRef.id, 'deliveryOrderUrl', deliveryOrderFile);
            }
            
            const currentSubPage = appState.activeSubPage.get('pengeluaran');
            form.reset();
            _initCustomSelects(form);
             $$('.custom-select-trigger span:first-child', form).forEach(s => s.textContent = 'Pilih...');
            if(expenseData.type === 'material') {
                $('#invoice-items-container').innerHTML = '';_addInvoiceItemRow();_updateInvoiceTotal();_generateInvoiceNumber();
            }
            _rerenderPengeluaranList(currentSubPage);
    
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error("Error saving expense:", error);
        }
    }
    
    async function _rerenderPengeluaranList(type) {
        const listContainer = $('#pengeluaran-list-container');
        if (!listContainer) return;
        listContainer.innerHTML = '<div class="loader-container"><div class="spinner"></div></div>';
    
        const q = query(expensesCol, where("type", "==", type), orderBy("date", "desc"));
        const expenseSnap = await getDocs(q);
        const expenses = expenseSnap.docs.map(d => ({ id: d.id, ...d.data() }));
        appState.expenses = [...appState.expenses.filter(ex => ex.type !== type), ...expenses];
    
        if (expenses.length === 0) {
            listContainer.innerHTML = `<p class="empty-state">Belum ada data pengeluaran.</p>`;
            return;
        }
    
        const getTitle = (item) => {
            const supplier = appState.suppliers.find(s => s.id === item.supplierId);
            return supplier ? supplier.supplierName : 'Tidak Diketahui';
        };
    
        // [UPDATE] Add direct action buttons to material cards.
        listContainer.innerHTML = `
            <div style="margin-top: 1.5rem;" class="data-card-grid">
                ${expenses.map(item => `
                    <div class="card data-card" data-id="${item.id}" data-type="expense">
                        <div class="data-card-header">
                            <span class="data-card-title">${getTitle(item)}</span>
                            <strong class="data-card-amount">${fmtIDR(item.amount)}</strong>
                        </div>
                        <div class="data-card-body">
                            <p class="data-card-description">${item.description}</p>
                            <span class="data-card-subtitle">${item.date.toDate().toLocaleDateString('id-ID')}</span>
                        </div>
                        <div class="data-card-footer">
                             ${item.status === 'paid' 
                                ? `<div class="badge success">Lunas</div>` 
                                : `<div class="badge warn">Tagihan</div>`
                            }
                            ${item.type === 'material' ? `
                            <div class="data-card-actions">
                                 <button class="btn-icon" data-action="upload-attachment" data-id="${item.id}" title="Upload Lampiran"><span class="material-symbols-outlined">upload_file</span></button>
                                 <button class="btn-icon" data-action="edit-item" data-id="${item.id}" data-type="expense" title="Edit"><span class="material-symbols-outlined">edit</span></button>
                                 <button class="btn-icon btn-icon-danger" data-action="delete-item" data-id="${item.id}" data-type="expense" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                            </div>
                            ` : `
                            <button class="btn-icon card-list-item-actions-trigger" data-action="open-actions">
                                <span class="material-symbols-outlined">more_vert</span>
                            </button>
                            `}
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    // =======================================================
    //         FUNGSI CRUD MASTER DATA
    // =======================================================

    async function handleManageMasterData(type) {
        const config = masterDataConfig[type];
        if (!config) return;
    
        await Promise.all([
            fetchData(config.stateKey, config.collection, config.nameField),
            fetchData('professions', professionsCol, 'professionName'),
            fetchData('projects', projectsCol, 'projectName')
        ]);
    
        const listHTML = appState[config.stateKey].map(item => `
            <div class="master-data-item" data-id="${item.id}" data-type="${type}">
                <span>${item[config.nameField]}</span>
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
    
        if (type === 'workers') {
            const professionOptions = appState.professions.map(p => ({ value: p.id, text: p.professionName }));
            const projectFieldsHTML = appState.projects.map(p => `
                <div class="form-group">
                    <label>Upah Harian - ${p.projectName}</label>
                    <input type="text" inputmode="numeric" name="project_wage_${p.id}" placeholder="mis. 150.000">
                </div>
            `).join('');
    
            formFieldsHTML += `
                ${createMasterDataSelect('professionId', 'Profesi', professionOptions, '', 'professions')}
                <div class="form-group">
                    <label for="worker-status">Status</label>
                    <select name="workerStatus" id="worker-status" class="custom-select-native">
                        <option value="active">Aktif</option>
                        <option value="inactive">Tidak Aktif</option>
                    </select>
                </div>
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
    
        if (type === 'workers') {
            dataToAdd.professionId = form.elements.professionId.value;
            dataToAdd.status = form.elements.workerStatus.value;
            dataToAdd.projectWages = {};
            appState.projects.forEach(p => {
                const wage = parseFormattedNumber(form.elements[`project_wage_${p.id}`].value);
                if (wage > 0) {
                    dataToAdd.projectWages[p.id] = wage;
                }
            });
        }
        
        toast('loading', `Menambah ${config.title}...`);
        try {
            await addDoc(config.collection, dataToAdd);
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
    
            formFieldsHTML += `
                ${createMasterDataSelect('professionId', 'Profesi', professionOptions, item.professionId || '', 'professions')}
                 <div class="form-group">
                    <label for="worker-status">Status</label>
                    <select name="workerStatus" id="worker-status" class="custom-select-native">
                        <option value="active" ${item.status === 'active' ? 'selected' : ''}>Aktif</option>
                        <option value="inactive" ${item.status === 'inactive' ? 'selected' : ''}>Tidak Aktif</option>
                    </select>
                </div>
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
        if (type === 'workers') {
            dataToUpdate.professionId = form.elements.professionId.value;
            dataToUpdate.status = form.elements.workerStatus.value;
            dataToUpdate.projectWages = {};
            appState.projects.forEach(p => {
                const wage = parseFormattedNumber(form.elements[`project_wage_${p.id}`].value);
                if (wage > 0) {
                    dataToUpdate.projectWages[p.id] = wage;
                }
            });
        }
    
        toast('loading', `Memperbarui ${config.title}...`);
        try {
            await updateDoc(doc(config.collection, id), dataToUpdate);
            toast('success', `${config.title} berhasil diperbarui.`);
            await handleManageMasterData(type);
        } catch (error) {
            toast('error', `Gagal memperbarui ${config.title}.`);
        }
    }

    async function handleDeleteMasterItem(id, type) {
        const config = masterDataConfig[type];
        if (!config) return;
        createModal('confirmDelete', { 
            message: `Anda yakin ingin menghapus ${config.title} ini?`,
            onConfirm: async () => {
                toast('loading', `Menghapus ${config.title}...`);
                try {
                    await deleteDoc(doc(config.collection, id));
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
                toast('loading', 'Menghapus data...');
                try {
                    let col;
                    if(type === 'termin') col = incomesCol;
                    else if (type === 'pinjaman') col = fundingSourcesCol;
                    else if (type === 'expense') col = expensesCol;
                    else if (type === 'bill') col = billsCol;
                    else return;
                    
                    await deleteDoc(doc(col, id));
                    
                    if (type === 'expense') {
                        const q = query(billsCol, where("expenseId", "==", id));
                        const billSnap = await getDocs(q);
                        const batch = writeBatch(db);
                        billSnap.docs.forEach(d => batch.delete(d.ref));
                        await batch.commit();
                    }

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
        
        toast('loading', 'Memproses pembayaran...');
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
            await Promise.all([
                _rerenderPengeluaranList('operasional'),
                _rerenderPengeluaranList('material'),
                _rerenderPengeluaranList('lainnya')
            ]);
            list = appState.expenses;
        } else if (type === 'termin') {
            list = appState.incomes;
        } else if (type === 'pinjaman') {
            list = appState.fundingSources;
        } else {
            toast('error', 'Tipe data tidak dikenal.'); return;
        }

        item = list.find(i => i.id === id);
        if (!item) { 
             const docRef = doc(expensesCol, id);
             const docSnap = await getDoc(docRef);
             if (docSnap.exists()) {
                item = {id: docSnap.id, ...docSnap.data()};
             } else {
                toast('error', 'Data tidak ditemukan.'); return;
             }
        }
        
        const date = item.date.toDate().toISOString().slice(0, 10);
        
        if (type === 'termin') {
            const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));
            formHTML = `
                <form id="edit-item-form" data-id="${id}" data-type="${type}">
                    <div class="form-group">
                        <label>Jumlah</label>
                        <input type="text" inputmode="numeric" name="amount" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required>
                    </div>
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="date" name="date" value="${date}" required>
                    </div>
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
                masterType = 'op-cats';
                categoryLabel = 'Kategori Operasional';
            } else if (item.type === 'lainnya') {
                categoryOptions = appState.otherCategories.map(c => ({ value: c.id, text: c.categoryName }));
                masterType = 'other-cats';
                categoryLabel = 'Kategori Lainnya';
            }
            formHTML = `
                <form id="edit-item-form" data-id="${id}" data-type="${type}">
                     <div class="form-group">
                        <label>Jumlah</label>
                        <input type="text" name="amount" inputmode="numeric" value="${new Intl.NumberFormat('id-ID').format(item.amount)}" required>
                    </div>
                     <div class="form-group">
                        <label>Deskripsi</label>
                        <input type="text" name="description" value="${item.description}" required>
                    </div>
                    ${masterType ? createMasterDataSelect('categoryId', categoryLabel, categoryOptions, item.categoryId, masterType) : ''}
                    <div class="form-group">
                        <label>Tanggal</label>
                        <input type="date" name="date" value="${date}" required>
                    </div>
                    <p>Status saat ini: <strong>${item.status === 'paid' ? 'Lunas' : 'Tagihan'}</strong>. Perubahan status tidak dapat dilakukan di sini.</p>
                    <button type="submit" class="btn btn-primary">Update</button>
                </form>
            `;
        }
        
        createModal('editItem', { title: `Edit Data ${type}`, content: formHTML });
    }

    async function handleUpdateItem(form) {
        const { id, type } = form.dataset;
        toast('loading', 'Memperbarui data...');

        try {
            let col, dataToUpdate = {};

            if (type === 'termin') {
                col = incomesCol;
                dataToUpdate = {
                    amount: parseFormattedNumber(form.elements.amount.value),
                    date: new Date(form.elements.date.value),
                    projectId: form.elements.projectId.value,
                };
            } else if (type === 'pinjaman') {
                col = fundingSourcesCol;
                dataToUpdate = {
                    totalAmount: parseFormattedNumber(form.elements.totalAmount.value),
                    date: new Date(form.elements.date.value),
                    creditorId: form.elements.creditorId.value,
                    interestType: form.elements.interestType.value,
                };
                if (dataToUpdate.interestType === 'interest') {
                    dataToUpdate.rate = Number(form.elements.rate.value);
                    dataToUpdate.tenor = Number(form.elements.tenor.value);
                    dataToUpdate.totalRepaymentAmount = dataToUpdate.totalAmount * (1 + (dataToUpdate.rate / 100 * dataToUpdate.tenor));
                } else {
                    dataToUpdate.rate = null;
                    dataToUpdate.tenor = null;
                    dataToUpdate.totalRepaymentAmount = null;
                }
            } else if (type === 'expense') {
                col = expensesCol;
                dataToUpdate = {
                    amount: parseFormattedNumber(form.elements.amount.value),
                    description: form.elements.description.value,
                    date: new Date(form.elements.date.value),
                    categoryId: form.elements.categoryId?.value || '',
                };
            } else return;
            
            await updateDoc(doc(col, id), dataToUpdate);
            
            if (type === 'expense') {
                 const q = query(billsCol, where("expenseId", "==", id));
                 const billSnap = await getDocs(q);
                 if (!billSnap.empty) {
                     const billRef = billSnap.docs[0].ref;
                     await updateDoc(billRef, {
                         amount: dataToUpdate.amount,
                         description: dataToUpdate.description,
                         dueDate: dataToUpdate.date
                     });
                 }
            }

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
        const supplierOptions = appState.suppliers.map(s => ({ value: s.id, text: s.supplierName }));
        const projectOptions = appState.projects.map(p => ({ value: p.id, text: p.projectName }));

        return `
        <div class="card card-pad">
            <form id="material-invoice-form" data-type="material">
                ${createMasterDataSelect('project-id', 'Proyek', projectOptions, '', 'projects')}
                <div class="form-group">
                    <label>Deskripsi/No. Faktur</label>
                    <input type="text" id="pengeluaran-deskripsi" required placeholder="Auto-generated invoice number">
                </div>
                ${createMasterDataSelect('supplier-id', 'Supplier', supplierOptions, '', 'suppliers')}
                 <div class="form-group">
                    <label>Tanggal Faktur</label>
                    <input type="date" id="pengeluaran-tanggal" value="${new Date().toISOString().slice(0,10)}" required>
                </div>

                <h5 class="invoice-section-title">Rincian Barang</h5>
                <div id="invoice-items-container"></div>
                <button type="button" id="add-invoice-item-btn" class="btn btn-secondary"><span class="material-symbols-outlined">add</span> Tambah Barang</button>
                
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
                <input type="text" inputmode="numeric" name="itemPrice" placeholder="Harga Satuan" class="item-price" required>
                <input type="number" name="itemQty" placeholder="Qty" class="item-qty" required>
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
    
    async function _uploadFileInBackground(docId, fieldToUpdate, file) {
        try {
            const compressedFile = await _compressImage(file);
            const storageRef = ref(storage, `expense_attachments/${docId}/${fieldToUpdate}_${Date.now()}.jpg`);
            const uploadTask = uploadBytesResumable(storageRef, compressedFile);

            uploadTask.on('state_changed', 
              null, 
              (error) => console.error(`Upload error for ${fieldToUpdate}:`, error), 
              async () => {
                const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
                await updateDoc(doc(expensesCol, docId), { [fieldToUpdate]: downloadURL });
                console.log(`${fieldToUpdate} URL updated successfully for doc ${docId}.`);
              }
            );
        } catch (error) {
            console.error(`Failed to process and upload ${fieldToUpdate}:`, error);
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
                    const scale = maxWidth / img.width;
                    canvas.width = maxWidth;
                    canvas.height = img.height * scale;
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
        renderUI();
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

            if (actionTarget.matches('[data-action$="-master-item"]')) {
                const manager = actionTarget.closest('.master-data-manager');
                if(manager) type = manager.dataset.type;
            }

            switch (actionTarget.dataset.action) {
                case 'navigate': handleNavigation(actionTarget.dataset.nav); break;
                case 'auth-action': createModal(appState.currentUser ? 'confirmLogout' : 'login'); break;
                case 'open-detail': {
                    if (!card) return;
                    e.preventDefault();
                    const sourceList = (type === 'termin') ? appState.incomes : appState.fundingSources;
                    const item = sourceList.find(i => i.id === id);
                    if (item) {
                        const content = _createDetailContentHTML(item, type);
                        const title = `Detail ${type === 'termin' ? 'Termin' : 'Pinjaman'}`;
                        createModal('dataDetail', { title, content });
                    }
                    break;
                }
                case 'open-bill-detail': {
                    if(!card) return;
                    e.preventDefault();
                    handleOpenBillDetail(id);
                    break;
                }
                case 'open-actions': {
                    e.preventDefault();
                    let actions = [];
                    if (type === 'bill') {
                        const bill = appState.bills.find(b => b.id === id);
                        if (!bill) return;

                        if (bill.status === 'unpaid') {
                            actions.push({ label: 'Bayar Cicilan', action: 'pay-bill', icon: 'payment', id, type });
                        }
                        if (bill.expenseId) {
                            actions.push({ label: 'Edit', action: 'edit-item', icon: 'edit', id: bill.expenseId, type: 'expense' });
                            actions.push({ label: 'Hapus', action: 'delete-item', icon: 'delete', id: bill.expenseId, type: 'expense' });
                        } else if (bill.type === 'gaji') {
                            actions.push({ label: 'Hapus Tagihan', action: 'delete-item', icon: 'delete', id: bill.id, type: 'bill' });
                        }

                    } else if (type === 'expense') {
                         actions = [
                            { label: 'Edit', action: 'edit-item', icon: 'edit', id, type },
                            { label: 'Hapus', action: 'delete-item', icon: 'delete', id, type }
                         ];
                    } else {
                        const list = type === 'termin' ? appState.incomes : appState.fundingSources;
                        const item = list.find(i => i.id === id);
                        if (!item) return;

                        actions = [
                            { label: 'Edit', action: 'edit-item', icon: 'edit', id, type },
                            { label: 'Hapus', action: 'delete-item', icon: 'delete', id, type }
                        ];

                        const isPaid = item.status === 'paid' || ((item.totalRepaymentAmount || item.totalAmount) - (item.paidAmount || 0)) <= 0;
                        if (type === 'pinjaman' && !isPaid) {
                            actions.unshift({ label: 'Bayar', action: 'pay-item', icon: 'payment', id, type });
                        }
                    }
                    createModal('actionsMenu', { actions, targetRect: actionTarget.getBoundingClientRect() });
                    break;
                }
                case 'delete-item': 
                    handleDeleteItem(expenseId || id, type); 
                    break;
                case 'edit-item': 
                    handleEditItem(expenseId || id, type === 'bill' ? 'expense' : type); 
                    break;
                case 'pay-item': if (id && type) handlePaymentModal(id, type); break;
                case 'pay-bill': if (id) handlePayBillModal(id); break;
                case 'manage-master': handleManageMasterData(actionTarget.dataset.type); break;
                case 'manage-master-global':
                    createModal('dataDetail', {
                        title: 'Pilih Master Data',
                        content: `
                            <div class="dashboard-nav-grid">
                                ${Object.entries(masterDataConfig).filter(([key]) => key !== 'projects' && key !== 'clients').map(([key, config]) => `
                                    <div class="nav-card" data-action="manage-master" data-type="${key}">
                                        <div class="nav-card-icon"><span class="material-symbols-outlined">database</span></div>
                                        <span class="nav-card-label">${config.title}</span>
                                    </div>
                                `).join('')}
                            </div>
                        `
                    });
                    break;
                case 'edit-master-item': handleEditMasterItem(id, type); break;
                case 'delete-master-item': handleDeleteMasterItem(id, type); break;
                case 'check-in': handleCheckIn(actionTarget.dataset.id); break;
                case 'check-out': handleCheckOut(actionTarget.dataset.id); break;
                case 'edit-attendance': handleEditAttendanceModal(actionTarget.dataset.id); break;
                case 'generate-salary-bill': handleGenerateSalaryBill(actionTarget.dataset); break;
                case 'manage-users': handleManageUsers(); break;
                case 'user-action': handleUserAction(actionTarget.dataset); break;
                case 'upload-attachment': handleUploadAttachment(id); break;
            }
        });

        // Offline/Online event listeners
        window.addEventListener('online', () => {
            appState.isOnline = true;
            toast('success', 'Kembali online. Menyinkronkan data...');
            syncOfflineData();
        });
        window.addEventListener('offline', () => {
            appState.isOnline = false;
            toast('warn', 'Anda sekarang offline. Perubahan akan disimpan secara lokal.');
        });
    }

    function handleNavigation(pageId) {
        if (!pageId || appState.activePage === pageId) return;
        appState.activePage = pageId;
        localStorage.setItem('lastActivePage', pageId);
        renderUI();
    }
    
    // =======================================================
    //         FUNGSI-FUNGSI BARU UNTUK TAGIHAN
    // =======================================================
    async function handleOpenBillDetail(billId) {
        const bill = appState.bills.find(b => b.id === billId);
        if(!bill) { toast('error', 'Data tagihan tidak ditemukan.'); return; }
        
        let content;
        if (bill.type === 'gaji') {
            content = _createSalaryBillDetailContentHTML(bill);
        } else {
            if(!bill.expenseId) { toast('error', 'Data pengeluaran terkait tidak ditemukan.'); return; }
            const expenseDoc = await getDoc(doc(expensesCol, bill.expenseId));
            if(!expenseDoc.exists()){ toast('error', 'Data pengeluaran terkait tidak ditemukan.'); return; }
            const expenseData = expenseDoc.data();
            content = await _createBillDetailContentHTML(bill, expenseData);
        }
        
        createModal('dataDetail', { title: `Detail Tagihan: ${bill.description}`, content });
    }

    function _createSalaryBillDetailContentHTML(bill) {
        const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
        return `
            <div class="payment-summary">
                <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
            </div>
             <dl class="detail-list">
                <div>
                    <dt>Jenis Tagihan</dt>
                    <dd>Gaji Pekerja</dd>
                </div>
            </dl>
        `;
    }

    async function _createBillDetailContentHTML(bill, expenseData) {
        const remainingAmount = (bill.amount || 0) - (bill.paidAmount || 0);
        
        let itemsHTML = '';
        if (expenseData.type === 'material' && expenseData.items) {
            itemsHTML = `
                <h5 class="detail-section-title">Rincian Barang</h5>
                <dl class="detail-list invoice-items-list-detail">
                ${expenseData.items.map(item => `
                    <div>
                        <dt>${item.name} (${item.qty}x)</dt>
                        <dd>${fmtIDR(item.total)}</dd>
                    </div>
                `).join('')}
                </dl>
            `;
        }

        let attachmentsHTML = '';
        if (expenseData.invoiceUrl || expenseData.deliveryOrderUrl) {
            attachmentsHTML = `
                <h5 class="detail-section-title">Lampiran</h5>
                <div class="attachment-gallery">
                    ${expenseData.invoiceUrl ? `
                        <div class="attachment-item">
                            <a href="${expenseData.invoiceUrl}" target="_blank"><img src="${expenseData.invoiceUrl}" alt="Faktur" class="attachment-thumbnail"></a>
                            <span>Bukti Faktur</span>
                            <a href="${expenseData.invoiceUrl}" download class="btn-icon"><span class="material-symbols-outlined">download</span></a>
                        </div>
                    ` : ''}
                    ${expenseData.deliveryOrderUrl ? `
                        <div class="attachment-item">
                            <a href="${expenseData.deliveryOrderUrl}" target="_blank"><img src="${expenseData.deliveryOrderUrl}" alt="Surat Jalan" class="attachment-thumbnail"></a>
                            <span>Surat Jalan</span>
                            <a href="${expenseData.deliveryOrderUrl}" download class="btn-icon"><span class="material-symbols-outlined">download</span></a>
                        </div>
                    ` : ''}
                </div>
            `;
        }
        
        return `
            <div class="payment-summary">
                <div><span>Total Tagihan:</span><strong>${fmtIDR(bill.amount)}</strong></div>
                <div><span>Sudah Dibayar:</span><strong>${fmtIDR(bill.paidAmount || 0)}</strong></div>
                <div class="remaining"><span>Sisa Tagihan:</span><strong>${fmtIDR(remainingAmount)}</strong></div>
            </div>
            ${itemsHTML}
            ${attachmentsHTML}
        `;
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

        toast('loading', 'Memproses pembayaran...');
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
            <div class="attendance-header">
                 <button class="btn btn-secondary" data-action="manage-master" data-type="workers">
                    <span class="material-symbols-outlined">engineering</span>
                    Kelola Pekerja
                </button>
                 <button class="btn btn-secondary" data-action="manage-master" data-type="professions">
                    <span class="material-symbols-outlined">badge</span>
                    Kelola Profesi
                </button>
            </div>
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
                fetchData('workers', workersCol, 'workerName'),
                fetchData('professions', professionsCol, 'professionName'),
                fetchData('projects', projectsCol, 'projectName')
            ]);

            if(tabId === 'harian') {
                await _fetchTodaysAttendance();
                contentContainer.innerHTML = _getDailyAttendanceHTML();
                _initCustomSelects(contentContainer);
                contentContainer.querySelector('#attendance-profession-filter')?.addEventListener('change', () => _rerenderAttendanceList());
                contentContainer.querySelector('#attendance-project-id')?.addEventListener('change', () => _rerenderAttendanceList());

            } else if (tabId === 'rekap') {
                contentContainer.innerHTML = _getSalaryRecapHTML();
                $('#generate-recap-btn')?.addEventListener('click', () => {
                    const startDate = $('#recap-start-date').value;
                    const endDate = $('#recap-end-date').value;
                    if (startDate && endDate) {
                        generateSalaryRecap(new Date(startDate), new Date(endDate));
                    } else {
                        toast('error', 'Silakan pilih rentang tanggal.');
                    }
                });
            } else if (tabId === 'manual') {
                contentContainer.innerHTML = _getManualAttendanceHTML();
                _initCustomSelects(contentContainer); // Initialize custom selects here
                const dateInput = $('#manual-attendance-date');
                const projectInput = $('#manual-attendance-project'); // This is a hidden input now
                
                dateInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));
                 projectInput.addEventListener('change', () => _renderManualAttendanceList(dateInput.value, projectInput.value));


                $('#manual-attendance-form').addEventListener('submit', handleSaveManualAttendance);
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

            if (attendance) {
                const checkInTime = attendance.checkIn.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                if (attendance.status === 'checked_in') {
                    statusHTML = `
                        <div class="attendance-status checked-in">Masuk: ${checkInTime}</div>
                        <button class="btn btn-danger" data-action="check-out" data-id="${attendance.id}">Check Out</button>
                    `;
                } else { // completed
                    const checkOutTime = attendance.checkOut.toDate().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
                    statusHTML = `
                        <div class="attendance-status">Masuk: ${checkInTime} | Keluar: ${checkOutTime}</div>
                        <div class="attendance-status completed">Total: ${attendance.workHours.toFixed(1)} jam (${fmtIDR(attendance.totalPay)})</div>
                        <button class="btn-icon" data-action="edit-attendance" data-id="${attendance.id}" title="Edit Waktu"><span class="material-symbols-outlined">edit_calendar</span></button>
                    `;
                }
            } else {
                statusHTML = `<button class="btn btn-success" data-action="check-in" data-id="${worker.id}">Check In</button>`;
            }
            
            return `
                <div class="card attendance-card">
                    <div class="attendance-worker-info">
                        <strong>${worker.workerName}</strong>
                        <span>${profession}</span>
                        <span class="worker-wage">${fmtIDR(dailyWage)} / hari</span>
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

        toast('loading', 'Mencatat jam masuk...');
        try {
            const worker = appState.workers.find(w => w.id === workerId);
            if (!worker) throw new Error('Pekerja tidak ditemukan');
            
            const dailyWage = worker.projectWages?.[projectId] || 0;
            const hourlyWage = dailyWage / 8; // Assume 8 hours work day

            await addDoc(attendanceRecordsCol, {
                workerId,
                projectId,
                workerName: worker.workerName,
                hourlyWage: hourlyWage,
                date: Timestamp.now(),
                checkIn: Timestamp.now(),
                status: 'checked_in',
                type: 'timestamp',
                createdAt: serverTimestamp()
            });
            toast('success', `${worker.workerName} berhasil check in.`);
            _fetchTodaysAttendance().then(() => _rerenderAttendanceList());
        } catch (error) {
            toast('error', 'Gagal melakukan check in.');
            console.error(error);
        }
    }

    async function handleCheckOut(recordId) {
        toast('loading', 'Mencatat jam keluar...');
        try {
            const recordRef = doc(attendanceRecordsCol, recordId);
            const recordSnap = await getDoc(recordRef);
            if (!recordSnap.exists()) throw new Error('Data absensi tidak ditemukan');

            const record = recordSnap.data();
            const checkOutTime = Timestamp.now();
            const checkInTime = record.checkIn;
            
            const hours = (checkOutTime.seconds - checkInTime.seconds) / 3600;
            const normalHours = Math.min(hours, 8); // Jam kerja normal maks 8 jam
            const overtimeHours = Math.max(0, hours - 8); // Sisa jam adalah lembur
            
            const hourlyWage = record.hourlyWage || 0;
            const normalPay = normalHours * hourlyWage;
            const overtimePay = overtimeHours * hourlyWage * 1.5; // Upah lembur 1.5x
            const totalPay = normalPay + overtimePay;

            await updateDoc(recordRef, {
                checkOut: checkOutTime,
                status: 'completed',
                workHours: hours,
                normalHours,
                overtimeHours,
                totalPay,
                isPaid: false
            });
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
        
        toast('loading', 'Memperbarui absensi...');
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
                checkIn: newCheckIn,
                checkOut: newCheckOut,
                workHours: hours,
                normalHours,
                overtimeHours,
                totalPay
            });
            
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
                        <input type="date" id="recap-start-date" value="${firstDayOfMonth}">
                    </div>
                    <div class="form-group">
                        <label>Tanggal Selesai</label>
                        <input type="date" id="recap-end-date" value="${todayStr}">
                    </div>
                    <button id="generate-recap-btn" class="btn btn-primary">Tampilkan Rekap</button>
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
            where('isPaid', '==', false), // Hanya ambil yang belum dibayar
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
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${[...salaryRecap.entries()].map(([workerId, worker]) => `
                                <tr>
                                    <td>${worker.workerName}</td>
                                    <td><strong>${fmtIDR(worker.totalPay)}</strong></td>
                                    <td>
                                        <button class="btn btn-secondary btn-sm" 
                                                data-action="generate-salary-bill" 
                                                data-worker-id="${workerId}"
                                                data-worker-name="${worker.workerName}"
                                                data-total-pay="${worker.totalPay}"
                                                data-start-date="${startDate.toISOString().slice(0, 10)}"
                                                data-end-date="${endDate.toISOString().slice(0, 10)}"
                                                data-record-ids="${worker.recordIds.join(',')}"
                                                >
                                            Buat Tagihan
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
        resultsContainer.innerHTML = tableHTML;
    }

    async function handleGenerateSalaryBill(dataset) {
        const { workerId, workerName, totalPay, startDate, endDate, recordIds } = dataset;
        
        const description = `Gaji ${workerName} periode ${startDate} - ${endDate}`;
        const amount = Number(totalPay);
    
        if(amount <= 0) {
            toast('error', 'Total gaji nol, tagihan tidak dapat dibuat.');
            return;
        }
    
        createModal('confirmGenerateBill', {
            message: `Buat tagihan gaji sebesar ${fmtIDR(amount)} untuk ${workerName}?`,
            onConfirm: async () => {
                toast('loading', 'Membuat tagihan gaji...');
                try {
                    const q = query(billsCol, where("description", "==", description), where("type", "==", "gaji"));
                    const existingBill = await getDocs(q);
                    if (!existingBill.empty) {
                        toast('error', 'Tagihan untuk periode & pekerja ini sudah ada.');
                        return;
                    }
    
                    const billRef = await addDoc(billsCol, {
                        description,
                        amount,
                        paidAmount: 0,
                        dueDate: Timestamp.now(),
                        status: 'unpaid',
                        type: 'gaji',
                        workerId,
                        recordIds: recordIds.split(','),
                        createdAt: serverTimestamp()
                    });
                    
                    const batch = writeBatch(db);
                    recordIds.split(',').forEach(id => {
                        batch.update(doc(attendanceRecordsCol, id), { isPaid: true, billId: billRef.id });
                    });
                    await batch.commit();
    
                    toast('success', 'Tagihan gaji berhasil dibuat.');
                    handleNavigation('tagihan');
    
                } catch(error) {
                    toast('error', 'Gagal membuat tagihan gaji.');
                    console.error('Error generating salary bill:', error);
                }
            }
        });
    }

    // --- FITUR BARU: ABSENSI MANUAL ---

    function _getManualAttendanceHTML() {
        const today = new Date().toISOString().slice(0,10);
        const projectOptions = appState.projects.map(p => ({value: p.id, text: p.projectName}));

        return `
            <form id="manual-attendance-form">
                <div class="card card-pad">
                    <div class="recap-filters">
                        <div class="form-group">
                            <label for="manual-attendance-date">Tanggal</label>
                            <input type="date" id="manual-attendance-date" value="${today}" required>
                        </div>
                        ${createMasterDataSelect('manual-attendance-project', 'Proyek', projectOptions, appState.projects[0]?.id || '')}
                    </div>
                </div>
                <div id="manual-attendance-list-container" style="margin-top: 1.5rem;"></div>
                <div class="form-footer-actions">
                    <button type="submit" class="btn btn-primary">Simpan Absensi</button>
                </div>
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
            
            return `
                <div class="manual-attendance-item card">
                    <div class="worker-info">
                        <strong>${worker.workerName}</strong>
                        <span>Upah: ${fmtIDR(dailyWage)}/hari</span>
                    </div>
                    <div class="attendance-status-selector" data-worker-id="${worker.id}">
                        <label>
                            <input type="radio" name="status_${worker.id}" value="full_day" ${existing?.attendanceStatus === 'full_day' ? 'checked' : ''}>
                            <span>Hadir</span>
                        </label>
                        <label>
                            <input type="radio" name="status_${worker.id}" value="half_day" ${existing?.attendanceStatus === 'half_day' ? 'checked' : ''}>
                            <span>1/2 Hari</span>
                        </label>
                        <label>
                            <input type="radio" name="status_${worker.id}" value="absent" ${!existing || existing.attendanceStatus === 'absent' ? 'checked' : ''}>
                            <span>Absen</span>
                        </label>
                    </div>
                </div>
            `;
        }).join('');

        container.innerHTML = listHTML;
    }

    async function handleSaveManualAttendance(e) {
        e.preventDefault();
        const form = e.target;
        const date = new Date(form.querySelector('#manual-attendance-date').value);
        const projectId = form.querySelector('#manual-attendance-project').value;

        if (!projectId) {
            toast('error', 'Proyek harus dipilih.'); return;
        }

        toast('loading', 'Menyimpan absensi...');
        try {
            const batch = writeBatch(db);
            const workers = $$('.attendance-status-selector', form);

            for(const workerEl of workers) {
                const workerId = workerEl.dataset.workerId;
                const statusInput = workerEl.querySelector('input:checked');
                if (!statusInput) continue; // Skip if no selection
                
                const status = statusInput.value;
                
                const worker = appState.workers.find(w => w.id === workerId);
                const dailyWage = worker?.projectWages?.[projectId] || 0;
                let pay = 0;
                if (status === 'full_day') pay = dailyWage;
                else if (status === 'half_day') pay = dailyWage / 2;

                const recordData = {
                    workerId,
                    workerName: worker.workerName,
                    projectId,
                    date: Timestamp.fromDate(date),
                    attendanceStatus: status,
                    totalPay: pay,
                    dailyWage,
                    isPaid: false,
                    type: 'manual',
                    createdAt: serverTimestamp(),
                    status: 'completed', // Manual entries are always 'completed'
                };

                const startOfDay = new Date(date);
                startOfDay.setHours(0,0,0,0);
                const endOfDay = new Date(date);
                endOfDay.setHours(23,59,59,999);

                const q = query(attendanceRecordsCol, 
                    where('workerId', '==', workerId), 
                    where('projectId', '==', projectId),
                    where('date', '>=', startOfDay),
                    where('date', '<=', endOfDay),
                    where('type', '==', 'manual')
                );
                
                const snap = await getDocs(q);
                if (snap.empty) {
                    if (status !== 'absent') { // Only save if not absent
                        batch.set(doc(attendanceRecordsCol), recordData);
                    }
                } else {
                    if (status === 'absent') { // Delete if now absent
                        batch.delete(snap.docs[0].ref);
                    } else { // Update existing record
                        batch.update(snap.docs[0].ref, recordData);
                    }
                }
            }

            await batch.commit();
            toast('success', 'Absensi berhasil disimpan.');
        } catch (error) {
            toast('error', 'Gagal menyimpan absensi.');
            console.error(error);
        }
    }

    async function handleManageUsers() {
        await fetchData('users', membersCol, 'name');
        const usersHTML = appState.users.map(user => {
            // [FIX] Add default values to prevent toLowerCase on undefined
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
                    ${user.status === 'pending' ? `<button class="btn-icon btn-icon-success" data-action="user-action" data-id="${user.id}" data-type="approve" title="Setujui"><span class="material-symbols-outlined">check_circle</span></button>` : ''}
                    ${user.status === 'active' && user.role !== 'Owner' ? `
                        ${user.role !== 'Editor' ? `<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-editor" title="Jadikan Editor"><span class="material-symbols-outlined">edit_note</span></button>`:''}
                        ${user.role !== 'Viewer' ? `<button class="btn-icon" data-action="user-action" data-id="${user.id}" data-type="make-viewer" title="Jadikan Viewer"><span class="material-symbols-outlined">visibility</span></button>`:''}
                    `: ''}
                    ${user.role !== 'Owner' ? `<button class="btn-icon btn-icon-danger" data-action="user-action" data-id="${user.id}" data-type="delete" title="Hapus"><span class="material-symbols-outlined">delete</span></button>` : ''}
                </div>
            </div>
        `}).join('');

        createModal('manageUsers', {
            title: 'Manajemen Pengguna',
            content: `
                <div class="master-data-list">
                    ${appState.users.length > 0 ? usersHTML : '<p class="empty-state-small">Tidak ada pengguna lain.</p>'}
                </div>
            `
        });
    }

    async function handleUserAction(dataset) {
        const { id, type } = dataset;
        const user = appState.users.find(u => u.id === id);
        if (!user) return;
        
        const actionMap = {
            'approve': { message: `Setujui ${user.name} sebagai Viewer?`, data: { status: 'active', role: 'Viewer' } },
            'make-editor': { message: `Ubah peran ${user.name} menjadi Editor?`, data: { role: 'Editor' } },
            'make-viewer': { message: `Ubah peran ${user.name} menjadi Viewer?`, data: { role: 'Viewer' } },
            'delete': { message: `Hapus pengguna ${user.name}? Aksi ini tidak dapat dibatalkan.`, data: null }
        };
        const action = actionMap[type];
        if (!action) return;

        createModal('confirmUserAction', {
            message: action.message,
            onConfirm: async () => {
                toast('loading', 'Memproses...');
                try {
                    const userRef = doc(membersCol, id);
                    if (type === 'delete') {
                        await deleteDoc(userRef);
                    } else {
                        await updateDoc(userRef, action.data);
                    }
                    toast('success', 'Aksi berhasil dilakukan.');
                    handleManageUsers(); // Refresh the list
                } catch (error) {
                    toast('error', 'Gagal memproses aksi.');
                    console.error('User action error:', error);
                }
            }
        });
    }

    async function handleUploadAttachment(expenseId) {
        const uploader = $('#attachment-uploader');
        if(!uploader) return;

        uploader.onchange = async (e) => {
            const files = e.target.files;
            if(!files || files.length === 0) return;

            toast('loading', 'Mengupload lampiran...');
            const file = files[0];

            if (!appState.isOnline) {
                const offlineId = `offline_attachment_${Date.now()}`;
                await offlineDB.offlineFiles.add({ parentId: expenseId, field: 'invoiceUrl', file, id: offlineId });
                toast('success', 'Anda offline. Gambar akan diupload saat kembali online.');
                return;
            }
            
            await _uploadFileInBackground(expenseId, 'invoiceUrl', file);
            toast('success', 'Upload berhasil.');
            const currentTab = appState.activeSubPage.get('pengeluaran');
            _rerenderPengeluaranList(currentTab);
        };
        uploader.click();
    }
    
    // =======================================================
    //         FUNGSI SINKRONISASI OFFLINE
    // =======================================================
    async function syncOfflineData() {
        const offlineItems = await offlineDB.offlineQueue.toArray();
        if (offlineItems.length === 0) {
            console.log('Tidak ada data offline untuk disinkronkan.');
            return;
        }

        toast('loading', `Menyinkronkan ${offlineItems.length} data...`);

        for (const item of offlineItems) {
            try {
                if (item.type === 'expense') {
                    const expenseDocRef = await addDoc(expensesCol, item.payload);
                    if (item.payload.status === 'unpaid') {
                        await addDoc(billsCol, {
                            expenseId: expenseDocRef.id,
                            description: item.payload.description,
                            amount: item.payload.amount,
                            paidAmount: 0,
                            dueDate: item.payload.date,
                            status: 'unpaid',
                            type: item.payload.type,
                            createdAt: serverTimestamp()
                        });
                    }

                    const offlineFiles = await offlineDB.offlineFiles.where('parentId').equals(item.id).toArray();
                    for(const fileRecord of offlineFiles) {
                        await _uploadFileInBackground(expenseDocRef.id, fileRecord.field, fileRecord.file);
                        await offlineDB.offlineFiles.delete(fileRecord.id);
                    }
                }
                // Tambahkan logika untuk tipe data lain (e.g., attendance) di sini

                await offlineDB.offlineQueue.delete(item.id);
            } catch (error) {
                console.error('Gagal menyinkronkan item:', item, error);
            }
        }

        toast('success', 'Sinkronisasi selesai.');
        // Refresh halaman saat ini untuk menampilkan data baru
        renderPageContent();
    }


    init();
});

