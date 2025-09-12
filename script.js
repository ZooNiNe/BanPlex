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
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import { getStorage, ref, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-storage.js";

document.addEventListener('DOMContentLoaded', () => {
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
    const TOTAL_BUDGET = 1420000000;

    const appState = {
        currentUser: null,
        userRole: 'Guest',
        roleUnsub: null,
        activePage: localStorage.getItem('lastActivePage') || 'dashboard',
        creditors: [],
        currentInvoiceItems: [],
        digitalEnvelopes: null, // Untuk menyimpan saldo amplop
    };
    
    // ===== Inisialisasi Firebase (v9+) =====
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);

    // ===== Referensi Firestore =====
    const membersCol = collection(db, 'teams', TEAM_ID, 'members');
    const creditorsCol = collection(db, 'teams', TEAM_ID, 'creditors');
    const invoicesCol = collection(db, 'teams', TEAM_ID, 'invoices');
    const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
    const digitalEnvelopesDoc = doc(db, 'teams', TEAM_ID, 'envelopes', 'main_budget');

    // ===== Helper & Utilitas =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const fmtIDR = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    const todayStr = () => new Date().toISOString().slice(0, 10);
    
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
        
        if(kind !== 'loading'){
            popupTimeout = setTimeout(() => p.classList.remove('show'), duration);
        }
    }
    
    // ===== Sistem Modal Dinamis =====
    function createModal(type, data = {}) {
        const modalContainer = $('#modal-container');
        if (!modalContainer) return;
        
        let modalHTML = '';
        if (type === 'login') {
            modalHTML = `<div id="login-modal" class="modal-bg"><div class="modal-content"><div class="modal-header"><h4>Login atau Buat Akun</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Hubungkan akun Google Anda untuk mengakses semua fitur.</p></div><div class="modal-footer"><button id="google-login-btn" class="btn btn-primary"><svg style="width:20px;height:20px" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg><span>Masuk dengan Google</span></button></div></div></div>`;
        } else if (type === 'confirmLogout') {
            modalHTML = `<div id="logout-modal" class="modal-bg"><div class="modal-content"><div class="modal-header"><h4>Konfirmasi Keluar</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Apakah Anda yakin ingin keluar?</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-logout-btn" class="btn btn-danger">Keluar</button></div></div></div>`;
        } else if (type === 'newCreditor') {
            modalHTML = `<div id="new-creditor-modal" class="modal-bg"><form class="modal-content" id="new-creditor-form"><div class="modal-header"><h4>Tambah Kreditur Baru</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-group"><label for="creditor-name">Nama Kreditur</label><input type="text" id="creditor-name" required placeholder="Contoh: Toko Bangunan Sejahtera"></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
        } else if (type === 'payment') {
            const remainingAmount = data.totalAmount - data.amountPaid;
            modalHTML = `<div id="payment-modal" class="modal-bg"><form id="payment-form" class="modal-content"><div class="modal-header"><h4>Input Pembayaran</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Faktur: <strong>${data.invoiceNumber}</strong></p><p>Sisa Tagihan: <strong>${fmtIDR(remainingAmount)}</strong></p><div class="form-group"><label for="payment-amount">Nominal Pembayaran</label><input type="number" id="payment-amount" value="${remainingAmount}" max="${remainingAmount}" required></div><div class="form-group"><label for="payment-date">Tanggal Pembayaran</label><input type="date" id="payment-date" value="${todayStr()}" required></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Pembayaran</button></div></form></div>`;
        } else if (type === 'confirmDeleteMember') {
            modalHTML = `<div id="delete-member-modal" class="modal-bg"><div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Hapus Anggota</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Anda yakin ingin menghapus <strong>${data.memberName}</strong> dari tim? Tindakan ini tidak dapat diurungkan.</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-delete-btn" class="btn btn-danger">Ya, Hapus</button></div></div></div>`;
        }
        
        modalContainer.innerHTML = modalHTML;
        const modalEl = modalContainer.firstElementChild;
        if (!modalEl) return;
        
        setTimeout(() => modalEl.classList.add('show'), 10);
        document.body.classList.add('modal-open');

        const closeModalFunc = () => closeModal(modalEl);
        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModalFunc(); });
        modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
        
        if (type === 'login') modalEl.querySelector('#google-login-btn')?.addEventListener('click', signInWithGoogle);
        if (type === 'confirmLogout') modalEl.querySelector('#confirm-logout-btn')?.addEventListener('click', handleLogout);
        if (type === 'newCreditor') modalEl.querySelector('#new-creditor-form')?.addEventListener('submit', handleSaveCreditor);
        if (type === 'payment') modalEl.querySelector('#payment-form')?.addEventListener('submit', (e) => {
            e.preventDefault();
            const amount = parseFloat($('#payment-amount').value);
            const date = $('#payment-date').value;
            if (data.onConfirm) data.onConfirm(amount, date);
            closeModalFunc();
        });
        if (type === 'confirmDeleteMember') {
            modalEl.querySelector('#confirm-delete-btn')?.addEventListener('click', () => {
                if (data.onConfirm) data.onConfirm();
                closeModalFunc();
            });
        }
    }
    
    function closeModal(modalEl) {
        if (!modalEl) modalEl = $('.modal-bg');
        if (!modalEl) return;
        modalEl.classList.remove('show');
        setTimeout(() => {
            modalEl.remove();
            if (!$('.modal-bg')) document.body.classList.remove('modal-open');
        }, 300);
    }

    // ===== Logika Otentikasi & State Management =====
    onAuthStateChanged(auth, user => {
        if (appState.roleUnsub) appState.roleUnsub();
        if (user) {
            appState.currentUser = user;
            updateUIForUser(user, 'Pending'); 
            ensureMemberDoc(user);
        } else {
            appState.currentUser = null; 
            appState.userRole = 'Guest';
            appState.digitalEnvelopes = null;
            renderUI();
        }
    });

    async function ensureMemberDoc(user) {
        if (appState.roleUnsub) appState.roleUnsub();
        const userDocRef = doc(membersCol, user.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            let currentRole = 'Pending';
            if (!docSnap.exists()) {
                currentRole = (user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase() ? 'Owner' : 'Pending';
                await setDoc(userDocRef, {
                    email: user.email, name: user.displayName, photoURL: user.photoURL,
                    role: currentRole, createdAt: serverTimestamp(),
                });
            } else {
                 currentRole = docSnap.data()?.role || 'Pending';
            }
            if ((user.email || '').toLowerCase() === OWNER_EMAIL.toLowerCase() && currentRole !== 'Owner') {
                await updateDoc(userDocRef, { role: 'Owner' });
                currentRole = 'Owner';
            }
            appState.userRole = currentRole;
            renderUI();
            appState.roleUnsub = onSnapshot(userDocRef, snap => {
                const newRole = snap.data()?.role || 'Pending';
                if (appState.userRole !== newRole) {
                    appState.userRole = newRole;
                    renderUI();
                }
            });
        } catch (error) {
            console.error("Error ensuring user doc:", error);
            appState.userRole = 'Error';
            renderUI();
        }
    }
    
    async function signInWithGoogle() {
        closeModal();
        toast('loading', 'Menghubungkan ke Google...');
        try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            toast('success', 'Login berhasil!');
        } catch (error) { toast('error', `Login gagal: ${error.code}`); }
    }
    
    async function handleLogout() {
        closeModal();
        toast('loading', 'Keluar...');
        try {
            await signOut(auth);
            toast('success', 'Anda telah keluar.');
        } catch (error) { toast('error', `Gagal keluar: ${error.message}`); }
    }

    // ===== FUNGSI RENDER UTAMA =====
    async function renderUI() {
        if (appState.currentUser && !appState.digitalEnvelopes) {
            await fetchDigitalEnvelopes();
        }
        updateUIForUser(appState.currentUser, appState.userRole);
        updateNavActiveState();
        renderPageContent();
    }
    
    async function fetchDigitalEnvelopes() {
        try {
            const docSnap = await getDoc(digitalEnvelopesDoc);
            if (docSnap.exists()) {
                appState.digitalEnvelopes = docSnap.data();
            } else {
                console.warn("Dokumen amplop digital tidak ditemukan! Perlu dibuat di Firebase.");
                appState.digitalEnvelopes = { unallocatedFunds: 0, debtPayment: 0, operational: 0, reserve: 0, profit: 0 };
            }
        } catch (error) {
            console.error("Error fetching digital envelopes:", error);
            toast('error', 'Gagal memuat data anggaran.');
        }
    }
    
    function updateUIForUser(user, role) {
        const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
        const { statusDot, userAvatar, dropdownAvatar, dropdownName, dropdownEmail, roleSection, roleIcon, roleText, authBtnText, authDropdownBtnText, authDropdownBtnIcon } = getUIElements();
        if (user) {
            const photo = user.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
            userAvatar.src = photo;
            dropdownAvatar.src = photo.replace('40x40', '80x80');
            dropdownName.textContent = user.displayName || 'Pengguna';
            dropdownEmail.textContent = user.email || '';
            authBtnText.textContent = 'Keluar';
            $('#auth-btn').classList.add('danger');
            authDropdownBtnText.textContent = 'Keluar';
            authDropdownBtnIcon.textContent = 'logout';
            roleSection.classList.remove('hidden');
            if (role === 'Pending') {
                roleIcon.textContent = 'hourglass_empty';
                roleText.textContent = 'Belum diverifikasi';
                roleSection.className = 'user-info-role status--pending';
                statusDot.className = 'status-dot dot--yellow';
            } else {
                roleIcon.textContent = 'verified_user';
                roleText.textContent = role;
                roleSection.className = 'user-info-role status--verified';
                statusDot.className = 'status-dot dot--green';
            }
        } else {
            userAvatar.src = guestAvatar;
            dropdownAvatar.src = guestAvatar.replace('40x40', '80x80');
            dropdownName.textContent = 'Guest';
            dropdownEmail.textContent = 'Silakan login';
            authBtnText.textContent = 'Login';
            $('#auth-btn').classList.remove('danger');
            authDropdownBtnText.textContent = 'Login dengan Google';
            authDropdownBtnIcon.textContent = 'login';
            roleSection.classList.add('hidden');
            statusDot.className = 'status-dot dot--red';
        }
        applyRoleVisibility(role);
    }
    
    function applyRoleVisibility(role) {
        $$('[data-role]').forEach(el => {
            const roles = el.dataset.role.split(',').map(s => s.trim());
            el.classList.toggle('hidden', !roles.includes(role) && role !== 'Owner');
        });
    }

    function updateNavActiveState() {
        $$('.nav-item.active').forEach(el => el.classList.remove('active'));
        $(`.nav-item[data-nav="${appState.activePage}"]`)?.classList.add('active');
    }

    function renderPageContent() {
        const container = $(`#page-${appState.activePage}`);
        if (!container) return;
        $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${appState.activePage}`));
        
        if (!appState.currentUser || appState.userRole === 'Guest') {
            container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Akses Terbatas</div><div class="placeholder-desc">Silakan login untuk dapat melihat konten pada halaman ini.</div><button class="btn btn-primary" id="placeholder-login">Login</button></div>`;
            $('#placeholder-login')?.addEventListener('click', () => createModal('login'));
            return;
        } 
        if (appState.userRole === 'Pending') {
            container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Menunggu Persetujuan</div><div class="placeholder-desc">Akun Anda sedang ditinjau oleh Admin.</div></div>`;
            return;
        }
        
        const pageRenderers = {
            'dashboard': renderDashboardPage,
            'pemasukan-pinjaman': renderPemasukanPage,
            'alokasi-anggaran': renderAlokasiPage,
            'input-data': renderInputDataPage,
            'tagihan': renderTagihanPage,
            'pengaturan': renderPengaturanPage,
        };

        const renderer = pageRenderers[appState.activePage];
        if (renderer) {
            renderer(container);
        } else {
            const pageTitle = appState.activePage.replace(/-/g, ' ');
            container.innerHTML = `<div class="card card-pad"><h4 style="text-transform: capitalize;">${pageTitle}</h4><p>Fitur untuk halaman ini masih dalam tahap pengembangan.</p></div>`;
        }
    }

    // ===== HALAMAN-HALAMAN DENGAN LOGIKA BARU =====

    async function renderDashboardPage(container) {
        container.innerHTML = `<div class="dashboard-grid"><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div><div class="dashboard-widget skeleton" style="height:150px"></div></div>`;
        try {
            const qPaidInvoices = query(invoicesCol, where('isFullyPaid', '==', true));
            const qFunding = query(fundingSourcesCol);
            const [paidInvoicesSnap, fundingSnap] = await Promise.all([getDocs(qPaidInvoices), getDocs(qFunding)]);
            const totalExpenses = paidInvoicesSnap.docs.reduce((sum, doc) => sum + doc.data().totalAmount, 0);
            const fundsReceived = fundingSnap.docs.reduce((sum, doc) => sum + doc.data().amount, 0);
            const remainingBudget = fundsReceived - totalExpenses;
            const budgetUsagePercentage = TOTAL_BUDGET > 0 ? (totalExpenses / TOTAL_BUDGET) * 100 : 0;
            const envelopes = appState.digitalEnvelopes || { unallocatedFunds: 0, debtPayment: 0, operational: 0, reserve: 0, profit: 0 };

            container.innerHTML = `<div class="section-head"><h4>Dashboard Finansial Proyek</h4></div><div class="dashboard-grid"><div class="dashboard-widget"><h5 class="widget-title">Ringkasan Anggaran</h5><div class="widget-main-value">${fmtIDR(remainingBudget)}</div><p class="widget-sub-text">Sisa dari Total Dana Diterima (${fmtIDR(fundsReceived)})</p><div class="widget-progress-bar"><div class="widget-progress-fill" style="width: ${budgetUsagePercentage.toFixed(2)}%;"></div></div><p class="widget-sub-text"><strong>${fmtIDR(totalExpenses)}</strong> terpakai dari total anggaran <strong>${fmtIDR(TOTAL_BUDGET)}</strong></p></div><div class="dashboard-widget"><h5 class="widget-title">Dana Belum Dialokasikan</h5><div class="widget-main-value">${fmtIDR(envelopes.unallocatedFunds)}</div><p class="widget-sub-text">Dana dari termin yang siap didistribusikan.</p></div></div><div class="section-head" style="margin-top:2rem"><h4>Saldo Amplop Digital</h4></div><div class="dashboard-grid"><div class="dashboard-widget"><h5 class="widget-title">Operasional</h5><div class="widget-main-value">${fmtIDR(envelopes.operational)}</div></div><div class="dashboard-widget"><h5 class="widget-title">Pembayaran Hutang</h5><div class="widget-main-value">${fmtIDR(envelopes.debtPayment)}</div></div><div class="dashboard-widget"><h5 class="widget-title">Dana Cadangan</h5><div class="widget-main-value">${fmtIDR(envelopes.reserve)}</div></div><div class="dashboard-widget"><h5 class="widget-title">Laba Proyek</h5><div class="widget-main-value">${fmtIDR(envelopes.profit)}</div></div></div>`;
        } catch (error) {
            console.error("Error rendering dashboard:", error);
            container.innerHTML = `<div class="card card-pad card--danger"><h4>Gagal Memuat Dashboard</h4><p>Terjadi kesalahan saat mengambil data.</p></div>`;
        }
    }

    async function renderPemasukanPage(container) {
        container.innerHTML = `<div class="section-head"><h4>Manajemen Pemasukan & Pinjaman</h4></div><div class="card card-pad"><form id="funding-source-form"><div class="form-section"><h5 class="form-section-title">Tambah Pemasukan Baru</h5><div class="form-grid-invoice"><div class="form-group"><label for="fs-date">Tanggal</label><input type="date" id="fs-date" value="${todayStr()}" required></div><div class="form-group"><label for="fs-type">Jenis</label><select id="fs-type" required><option value="Pencairan Termin">Pencairan Termin</option><option value="Pinjaman (Tanpa Bunga)">Pinjaman (Tanpa Bunga)</option><option value="Pinjaman (Dengan Bunga)">Pinjaman (Dengan Bunga)</option></select></div><div class="form-group span-2"><label for="fs-desc">Keterangan</label><input type="text" id="fs-desc" required placeholder="Contoh: Termin Tahap 1 (20%)"></div><div class="form-group"><label for="fs-amount">Jumlah</label><input type="number" id="fs-amount" required placeholder="0"></div></div><div id="interest-fields-wrapper" class="form-grid-invoice hidden" style="margin-top:1rem;border-top:1px solid var(--line);padding-top:1rem;"><div class="form-group"><label for="fs-interest-rate">Bunga (%/Tahun)</label><input type="number" id="fs-interest-rate" placeholder="0"></div><div class="form-group"><label for="fs-tenor">Tenor (Bulan)</label><input type="number" id="fs-tenor" placeholder="0"></div><div class="form-group"><label>Total Tagihan</label><input type="text" id="fs-total-repayable" disabled placeholder="Otomatis"></div></div></div><div class="form-group full" style="margin-top:1.5rem;"><button type="submit" class="btn btn-primary">Simpan Pemasukan</button></div></form></div><div class="card card-pad" style="margin-top:1.5rem;"><h5 class="form-section-title">Riwayat Pemasukan & Pinjaman</h5><div class="table-container" id="funding-sources-table-container"><p>Memuat data...</p></div></div>`;
        $('#fs-type').addEventListener('change', () => $('#interest-fields-wrapper').classList.toggle('hidden', $('#fs-type').value !== 'Pinjaman (Dengan Bunga)'));
        $('#fs-amount, #fs-interest-rate, #fs-tenor').forEach(el => el.addEventListener('input', calculateTotalRepayable));
        $('#funding-source-form').addEventListener('submit', handleSaveFundingSource);
        fetchAndDisplayFundingSources();
    }

    function calculateTotalRepayable() {
        const principal = parseFloat($('#fs-amount').value) || 0;
        const annualRate = parseFloat($('#fs-interest-rate').value) || 0;
        const tenorMonths = parseInt($('#fs-tenor').value) || 0;
        const totalRepayableEl = $('#fs-total-repayable');
        if (principal > 0 && annualRate > 0 && tenorMonths > 0) {
            const totalInterest = principal * (annualRate / 100) * (tenorMonths / 12);
            totalRepayableEl.value = fmtIDR(principal + totalInterest);
        } else {
            totalRepayableEl.value = fmtIDR(principal);
        }
    }

    async function handleSaveFundingSource(e) {
        e.preventDefault();
        const form = e.target;
        const type = form.querySelector('#fs-type').value;
        const principal = parseFloat(form.querySelector('#fs-amount').value);
        const data = {
            date: Timestamp.fromDate(new Date(form.querySelector('#fs-date').value)),
            type, description: form.querySelector('#fs-desc').value, amount: principal,
            createdBy: appState.currentUser.email, createdAt: serverTimestamp(),
        };
        if (type.includes('Pinjaman')) {
            data.isFullyPaid = false; data.amountPaid = 0; data.totalRepayableAmount = principal;
        }
        if (type === 'Pinjaman (Dengan Bunga)') {
            const annualRate = parseFloat(form.querySelector('#fs-interest-rate').value) || 0;
            const tenorMonths = parseInt(form.querySelector('#fs-tenor').value) || 0;
            if (annualRate <= 0 || tenorMonths <= 0) {
                toast('error', 'Bunga dan tenor harus diisi.'); return;
            }
            const totalInterest = principal * (annualRate / 100) * (tenorMonths / 12);
            data.interestRate = annualRate; data.tenorInMonths = tenorMonths;
            data.totalRepayableAmount = principal + totalInterest;
        }
        toast('loading', 'Menyimpan...');
        try {
            await addDoc(fundingSourcesCol, data);
            toast('success', 'Pemasukan berhasil disimpan.');
            form.reset(); $('#fs-date').value = todayStr();
            $('#interest-fields-wrapper').classList.add('hidden');
            fetchAndDisplayFundingSources();
        } catch (error) { toast('error', 'Gagal menyimpan data.'); console.error(error); }
    }

    async function fetchAndDisplayFundingSources() {
        const container = $('#funding-sources-table-container');
        try {
            const q = query(fundingSourcesCol, orderBy('date', 'desc'));
            const snap = await getDocs(q);
            const sources = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (sources.length === 0) { container.innerHTML = '<p class="empty-state">Belum ada data pemasukan.</p>'; return; }
            container.innerHTML = `<table class="table"><thead><tr><th>Tanggal</th><th>Jenis</th><th>Keterangan</th><th>Jumlah</th><th>Status</th></tr></thead><tbody>
                ${sources.map(s => `<tr><td>${s.date.toDate().toLocaleDateString('id-ID')}</td><td><span class="badge">${s.type}</span></td><td>${s.description}</td><td>${fmtIDR(s.amount)}</td><td>${s.type.includes('Pinjaman') ? `<span class="badge ${s.isFullyPaid ? 'badge--green' : 'badge--orange'}">${s.isFullyPaid ? 'Lunas' : 'Belum Lunas'}</span>` : '-'}</td></tr>`).join('')}
            </tbody></table>`;
        } catch (error) { console.error("Error fetching funding sources:", error); container.innerHTML = '<p>Gagal memuat data.</p>'; }
    }
    
    async function renderAlokasiPage(container) {
        const envelopes = appState.digitalEnvelopes;
        if (!envelopes) { container.innerHTML = `<div class="card card-pad"><p>Memuat data anggaran...</p></div>`; return; }
        container.innerHTML = `<div class="section-head"><h4>Alokasi & Anggaran</h4></div><div class="allocation-grid"><div class="card card-pad"><h5 class="form-section-title">Alokasikan Dana</h5><p class="section-subtitle">Distribusikan dana yang belum teralokasi ke dalam amplop digital.</p><form id="allocation-form"><div class="form-group"><label>Dana Tersedia</label><input type="text" value="${fmtIDR(envelopes.unallocatedFunds)}" disabled></div><div class="form-group"><label for="alloc-amount">Jumlah</label><input type="number" id="alloc-amount" placeholder="0" required></div><div class="form-group"><label for="alloc-to-envelope">Alokasikan Ke</label><select id="alloc-to-envelope" required><option value="operational">Operasional</option><option value="debtPayment">Pembayaran Hutang</option><option value="reserve">Dana Cadangan</option><option value="profit">Laba Proyek</option></select></div><button type="submit" class="btn btn-primary" style="margin-top:1rem">Alokasikan Dana</button></form></div><div class="card card-pad"><h5 class="form-section-title">Ringkasan Amplop</h5><div class="envelope-grid"><div class="envelope-card"><h6>Operasional</h6><div class="amount">${fmtIDR(envelopes.operational)}</div></div><div class="envelope-card"><h6>Hutang</h6><div class="amount">${fmtIDR(envelopes.debtPayment)}</div></div><div class="envelope-card"><h6>Cadangan</h6><div class="amount">${fmtIDR(envelopes.reserve)}</div></div><div class="envelope-card"><h6>Laba</h6><div class="amount">${fmtIDR(envelopes.profit)}</div></div></div></div></div>`;
        $('#allocation-form').addEventListener('submit', handleAllocateFunds);
    }
    
    async function handleAllocateFunds(e) {
        e.preventDefault();
        const amount = parseFloat($('#alloc-amount').value);
        const targetEnvelope = $('#alloc-to-envelope').value;
        const currentUnallocated = appState.digitalEnvelopes.unallocatedFunds;
        if (isNaN(amount) || amount <= 0 || amount > currentUnallocated) {
            toast('error', 'Jumlah alokasi tidak valid.'); return;
        }
        toast('loading', 'Mengalokasikan dana...');
        try {
            await runTransaction(db, async (transaction) => {
                const envDoc = await transaction.get(digitalEnvelopesDoc);
                if (!envDoc.exists()) throw "Dokumen anggaran tidak ditemukan!";
                const currentData = envDoc.data();
                const updates = {};
                updates.unallocatedFunds = currentData.unallocatedFunds - amount;
                updates[targetEnvelope] = currentData[targetEnvelope] + amount;
                transaction.update(digitalEnvelopesDoc, updates);
            });
            await fetchDigitalEnvelopes();
            renderAlokasiPage($('#page-alokasi-anggaran'));
            toast('success', 'Dana berhasil dialokasikan.');
        } catch (error) { toast('error', 'Gagal mengalokasikan dana.'); console.error(error); }
    }
    
    async function renderInputDataPage(container) {
        await fetchCreditors();
        container.innerHTML = `<div class="section-head"><h4>Input Pengeluaran</h4></div><div class="sub-nav"><button class="sub-nav-item active" data-category="operasional">Operasional</button><button class="sub-nav-item" data-category="material">Material</button><button class="sub-nav-item" data-category="subkontraktor">Subkontraktor</button><button class="sub-nav-item" data-category="lainnya">Lainnya</button></div><div id="sub-page-content" class="sub-page-content"></div>`;
        renderInvoiceForm($('#sub-page-content'), 'operasional');
        $$('.sub-nav-item').forEach(btn => {
            btn.addEventListener('click', () => {
                $$('.sub-nav-item.active').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderInvoiceForm($('#sub-page-content'), btn.dataset.category);
            });
        });
    }

    async function renderInvoiceForm(container, category) {
        appState.currentInvoiceItems = [];
        const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;
        container.innerHTML = `<div class="card card-pad"><form id="invoice-form"><div class="form-section"><h5 class="form-section-title">Informasi Faktur</h5><div class="form-grid-invoice"><div class="form-group"><label for="inv-date">Tanggal</label><input type="date" id="inv-date" value="${todayStr()}" required></div><div class="form-group"><label>No. Faktur</label><input type="text" id="inv-number" value="${invoiceNumber}" disabled></div><div class="form-group span-2"><label for="inv-creditor">Kreditur</label><div class="input-with-button"><select id="inv-creditor" required><option value="">Pilih Kreditur...</option>${appState.creditors.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select><button type="button" id="add-creditor-btn" class="icon-btn" title="Tambah Kreditur Baru"><span class="material-symbols-outlined">add</span></button></div></div></div></div><div class="form-section"><h5 class="form-section-title">Item Pengeluaran</h5><div id="invoice-item-list" class="invoice-item-list"></div><div class="form-grid-item"><div class="form-group span-2"><label for="item-name">Nama Barang/Jasa</label><input type="text" id="item-name" placeholder="Contoh: Semen Tiga Roda"></div><div class="form-group"><label for="item-qty">Qty</label><input type="number" id="item-qty" placeholder="0"></div><div class="form-group"><label for="item-unit">Satuan</label><input type="text" id="item-unit" placeholder="sak / m3 / ls"></div><div class="form-group"><label for="item-price">Harga Satuan</label><input type="number" id="item-price" placeholder="0"></div><div class="form-group"><label>Total</label><input type="text" id="item-total" disabled placeholder="Otomatis"></div></div><button type="button" id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;"><span class="material-symbols-outlined">add</span>Tambah Item</button></div><div class="form-section"><h5 class="form-section-title">Lampiran</h5><div class="form-grid-invoice"><div class="form-group"><label for="inv-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Foto Invoice</label><input type="file" id="inv-photo" accept="image/*"><span id="inv-photo-name" class="file-name"></span></div><div class="form-group"><label for="del-note-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Surat Jalan</label><input type="file" id="del-note-photo" accept="image/*"><span id="del-note-photo-name" class="file-name"></span></div></div></div><div class="form-group full" style="margin-top:2rem;border-top:1px solid var(--line);padding-top:1.5rem;"><div class="invoice-summary">Total Faktur: <strong id="invoice-total-amount">Rp 0,00</strong></div><button type="submit" class="btn btn-primary">Simpan Faktur</button></div></form></div>`;
        $('#add-creditor-btn').addEventListener('click', () => createModal('newCreditor'));
        $('#add-item-btn').addEventListener('click', handleAddItemToInvoice);
        $('#invoice-form').addEventListener('submit', (e) => handleSaveInvoice(e, category));
        $('#item-qty, #item-price').forEach(el => el.addEventListener('input', updateItemTotal));
        $('#inv-photo').addEventListener('change', (e) => { $('#inv-photo-name').textContent = e.target.files[0]?.name || ''; });
        $('#del-note-photo').addEventListener('change', (e) => { $('#del-note-photo-name').textContent = e.target.files[0]?.name || ''; });
    }
    
    function updateItemTotal() {
        const qty = parseFloat($('#item-qty').value) || 0;
        const price = parseFloat($('#item-price').value) || 0;
        $('#item-total').value = fmtIDR(qty * price);
    }
    
    function handleAddItemToInvoice() {
        const itemName = $('#item-name').value.trim();
        const quantity = parseFloat($('#item-qty').value) || 0;
        const unitName = $('#item-unit').value.trim();
        const unitPrice = parseFloat($('#item-price').value) || 0;
        if (!itemName || quantity <= 0 || !unitName || unitPrice <= 0) {
            toast('error', 'Harap lengkapi semua detail item.'); return;
        }
        appState.currentInvoiceItems.push({ itemName, quantity, unitName, unitPrice, totalPrice: quantity * unitPrice });
        renderInvoiceItems();
        $('#item-name').value = ''; $('#item-qty').value = ''; $('#item-unit').value = ''; $('#item-price').value = '';
        $('#item-total').value = 'Otomatis'; $('#item-name').focus();
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
        $$('.remove-item-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index);
                appState.currentInvoiceItems.splice(index, 1);
                renderInvoiceItems();
            });
        });
    }

    async function handleSaveInvoice(e, category) {
        e.preventDefault();
        if (appState.currentInvoiceItems.length === 0) { toast('error', 'Faktur harus memiliki minimal satu item.'); return; }
        toast('loading', 'Menyimpan faktur...');
        try {
            const invoicePhotoFile = $('#inv-photo').files[0];
            const deliveryNoteFile = $('#del-note-photo').files[0];
            const invoicePhotoUrl = invoicePhotoFile ? await uploadFile(invoicePhotoFile, `invoices/${$('#inv-number').value}`) : null;
            const deliveryNotePhotoUrl = deliveryNoteFile ? await uploadFile(deliveryNoteFile, `delivery-notes/${$('#inv-number').value}`) : null;
            const totalAmount = appState.currentInvoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);

            const invoiceData = {
                invoiceNumber: $('#inv-number').value,
                date: Timestamp.fromDate(new Date($('#inv-date').value)),
                creditorId: $('#inv-creditor').value,
                creditorName: $('#inv-creditor').options[$('#inv-creditor').selectedIndex].text,
                category, totalAmount, amountPaid: 0, isFullyPaid: false,
                items: appState.currentInvoiceItems,
                invoicePhotoUrl, deliveryNotePhotoUrl,
                createdBy: appState.currentUser.email, createdAt: serverTimestamp(),
            };
            await addDoc(invoicesCol, invoiceData);
            toast('success', 'Faktur berhasil disimpan.');
            renderInvoiceForm($('#sub-page-content'), category);
        } catch (error) { toast('error', 'Gagal menyimpan faktur.'); console.error("Error saving invoice:", error); }
    }

    async function uploadFile(file, path) {
        const storageRef = ref(storage, `${path}/${file.name}`);
        const snapshot = await uploadBytes(storageRef, file);
        return await getDownloadURL(snapshot.ref);
    }
    
    async function fetchCreditors() {
        try {
            const snap = await getDocs(query(creditorsCol, orderBy('name')));
            appState.creditors = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) { console.error("Error fetching creditors:", error); toast('error', 'Gagal memuat daftar kreditur.'); }
    }
    
    async function handleSaveCreditor(e) {
        e.preventDefault();
        const name = $('#creditor-name').value.trim();
        if (!name) { toast('error', 'Nama kreditur tidak boleh kosong.'); return; }
        toast('loading', 'Menyimpan...');
        try {
            await addDoc(creditorsCol, { name, createdAt: serverTimestamp() });
            toast('success', 'Kreditur baru ditambahkan.');
            closeModal();
            await fetchCreditors();
            const creditorSelect = $('#inv-creditor');
            if (creditorSelect) {
                creditorSelect.innerHTML = `<option value="">Pilih Kreditur...</option>${appState.creditors.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}`;
            }
        } catch (error) { toast('error', 'Gagal menyimpan kreditur.'); console.error("Error saving creditor:", error); }
    }
    
    async function renderTagihanPage(container) {
        container.innerHTML = `<div class="section-head"><h4>Manajemen Tagihan & Hutang</h4></div><div id="unpaid-section"><h5 class="form-section-title">Tagihan Belum Lunas</h5><div class="card card-pad"><p>Memuat data...</p></div></div><div id="paid-section" style="margin-top:2rem;"><h5 class="form-section-title">Riwayat Transaksi Lunas</h5><div class="card card-pad"><p>Memuat data...</p></div></div>`;
        try {
            const qUnpaid = query(invoicesCol, where("isFullyPaid", "==", false), orderBy("date", "desc"));
            const qPaid = query(invoicesCol, where("isFullyPaid", "==", true), orderBy("date", "desc"), limit(20));
            const [unpaidSnap, paidSnap] = await Promise.all([getDocs(qUnpaid), getDocs(qPaid)]);
            const unpaidInvoices = unpaidSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            const paidInvoices = paidSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            renderDebtTable($('#unpaid-section .card'), unpaidInvoices, false);
            renderDebtTable($('#paid-section .card'), paidInvoices, true);
        } catch (error) { console.error("Error fetching invoices:", error); toast('error', 'Gagal memuat data tagihan.'); }
    }

    function renderDebtTable(container, debts, isPaid) {
        if (debts.length === 0) { container.innerHTML = `<p class="empty-state">Tidak ada data.</p>`; return; }
        container.innerHTML = `<div class="table-container"><table class="table"><thead><tr><th>Tanggal</th><th>No. Faktur</th><th>Kreditur</th><th>Total</th><th>Pembayaran</th><th>Aksi</th></tr></thead><tbody>
            ${debts.map(debt => {
                const progress = debt.totalAmount > 0 ? (debt.amountPaid / debt.totalAmount) * 100 : 100;
                return `<tr><td>${debt.date.toDate().toLocaleDateString('id-ID')}</td><td>${debt.invoiceNumber}</td><td>${debt.creditorName}</td><td>${fmtIDR(debt.totalAmount)}</td><td><div class="payment-progress-container" title="${fmtIDR(debt.amountPaid)} terbayar"><div class="payment-progress-bar" style="width:${progress}%;"></div><span class="payment-progress-text">${progress.toFixed(0)}%</span></div></td><td>${!isPaid ? `<button class="btn btn-primary btn-pay" data-id="${debt.id}">Bayar</button>` : `<span class="badge badge--green">Lunas</span>`}</td></tr>`
            }).join('')}</tbody></table></div>`;
        if (!isPaid) {
            $$('.btn-pay').forEach(btn => btn.addEventListener('click', (e) => {
                const invoiceId = e.currentTarget.dataset.id;
                const invoiceData = debts.find(d => d.id === invoiceId);
                createModal('payment', { ...invoiceData, onConfirm: (amount, date) => handlePayment(invoiceId, amount, date) });
            }));
        }
    }

    async function handlePayment(invoiceId, paymentAmount, paymentDate) {
        toast('loading', 'Memproses pembayaran...');
        try {
            await runTransaction(db, async (transaction) => {
                const invoiceRef = doc(invoicesCol, invoiceId);
                const invoiceDoc = await transaction.get(invoiceRef);
                if (!invoiceDoc.exists()) throw "Faktur tidak ditemukan!";
                const data = invoiceDoc.data();
                const newAmountPaid = data.amountPaid + paymentAmount;
                const isFullyPaid = newAmountPaid >= data.totalAmount;
                const paymentRef = doc(collection(invoiceRef, 'payments'));
                transaction.set(paymentRef, {
                    amount: paymentAmount, date: Timestamp.fromDate(new Date(paymentDate)),
                    paidBy: appState.currentUser.email, createdAt: serverTimestamp()
                });
                transaction.update(invoiceRef, { amountPaid: newAmountPaid, isFullyPaid: isFullyPaid });
            });
            toast('success', 'Pembayaran berhasil disimpan.');
            renderTagihanPage($('#page-tagihan'));
        } catch (error) { toast('error', 'Gagal memproses pembayaran.'); console.error(error); }
    }

    async function renderPengaturanPage(container) {
        if (appState.userRole !== 'Admin' && appState.userRole !== 'Owner') {
            container.innerHTML = `<div class="card card-pad card--danger"><h4>Akses Ditolak</h4><p>Anda tidak memiliki izin untuk mengakses halaman ini.</p></div>`; return;
        }
        container.innerHTML = `<div class="section-head"><h4>Manajemen Tim</h4></div><div class="card card-pad"><div class="skeleton" style="height:80px;margin-bottom:1rem;"></div><div class="skeleton" style="height:80px;"></div></div></div>`;
        try {
            const memberSnap = await getDocs(membersCol);
            const members = memberSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            container.innerHTML = `<div class="section-head"><h4>Manajemen Tim</h4><p class="section-subtitle">Kelola peran dan akses anggota tim Anda.</p></div><div class="member-card-pro-list">
                ${members.map(member => `<div class="member-card-pro"><img src="${member.photoURL||`https://placehold.co/50x50/e2e8f0/64748b?text=${(member.name||'U')[0]}`}" alt="Avatar" class="member-card-pro__avatar" /><div class="member-card-pro__info"><strong class="member-card-pro__name">${member.name||'N/A'}</strong><span class="member-card-pro__email">${member.email}</span></div><div class="member-card-pro__role"><span class="badge">${member.role}</span></div><div class="member-card-pro__actions">${(appState.userRole==='Owner'&&member.email!==OWNER_EMAIL)||(appState.userRole==='Admin'&&member.role!=='Owner')?`<button class="icon-btn action-menu-btn" data-userid="${member.id}"><span class="material-symbols-outlined">more_vert</span></button><div class="actions-dropdown hidden" id="actions-for-${member.id}"><div class="form-group"><label>Ubah Peran</label><select class="role-select" data-userid="${member.id}"><option value="Pending" ${member.role==='Pending'?'selected':''}>Pending</option><option value="Viewer" ${member.role==='Viewer'?'selected':''}>Viewer</option><option value="Editor" ${member.role==='Editor'?'selected':''}>Editor</option>${appState.userRole==='Owner'?`<option value="Admin" ${member.role==='Admin'?'selected':''}>Admin</option>`:''}</select></div><button class="btn btn-danger btn-remove-member" data-userid="${member.id}" data-name="${member.name}">Hapus Anggota</button></div>`:''}</div></div>`).join('')}
            </div>`;
            $$('.action-menu-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const userId = e.currentTarget.dataset.userid;
                    $$('.actions-dropdown').forEach(d => { if (d.id !== `actions-for-${userId}`) d.classList.add('hidden'); });
                    $(`#actions-for-${userId}`)?.classList.toggle('hidden');
                });
            });
            $$('.role-select').forEach(select => {
                select.addEventListener('change', async (e) => {
                    const newRole = e.target.value; const userId = e.target.dataset.userid;
                    toast('loading', `Mengubah peran...`);
                    try {
                        await updateDoc(doc(membersCol, userId), { role: newRole });
                        toast('success', `Peran berhasil diubah.`);
                        renderPengaturanPage(container);
                    } catch (error) { toast('error', 'Gagal mengubah peran.'); }
                });
            });
            $$('.btn-remove-member').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const userId = e.currentTarget.dataset.userid;
                    const name = e.currentTarget.dataset.name;
                    createModal('confirmDeleteMember', { memberName: name, onConfirm: () => handleDeleteMember(userId) });
                });
            });
        } catch (error) { console.error("Error fetching team members:", error); container.innerHTML = `<div class="card card-pad card--danger"><h4>Gagal Memuat Data Tim</h4></div>`; }
    }

    async function handleDeleteMember(userId) {
        toast('loading', 'Menghapus anggota...');
        try {
            await deleteDoc(doc(membersCol, userId));
            toast('success', 'Anggota berhasil dihapus.');
            renderPengaturanPage($('#page-pengaturan'));
        } catch (error) { toast('error', 'Gagal menghapus anggota.'); console.error("Error deleting member:", error); }
    }

    function init() {
        injectPageTemplates();
        const { sidebar, scrim, openNavBtn, themeToggleBtn, userProfileBtn, notificationBtn, authBtn, authDropdownBtn } = getUIElements();
        const closeSidebar = () => {
            sidebar.classList.remove('open'); scrim.classList.remove('show');
            openNavBtn.classList.remove('is-active');
        };
        openNavBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open'); scrim.classList.toggle('show');
            openNavBtn.classList.toggle('is-active');
        });
        scrim.addEventListener('click', closeSidebar);
        const handleAuthAction = () => appState.currentUser ? createModal('confirmLogout') : createModal('login');
        authBtn.addEventListener('click', handleAuthAction);
        authDropdownBtn.addEventListener('click', () => { $('#user-dropdown').classList.add('hidden'); handleAuthAction(); });
        const toggleDropdown = (id) => {
            $$('.dropdown-panel').forEach(d => { if (d.id !== id) d.classList.add('hidden'); });
            $(`#${id}`)?.classList.toggle('hidden');
        };
        userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('user-dropdown'); });
        notificationBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('notification-dropdown'); });
        document.addEventListener('click', (e) => {
            if (!userProfileBtn.contains(e.target) && !$('#user-dropdown').contains(e.target)) $('#user-dropdown')?.classList.add('hidden');
            if (!notificationBtn.contains(e.target) && !$('#notification-dropdown').contains(e.target)) $('#notification-dropdown')?.classList.add('hidden');
            $$('.actions-dropdown').forEach(d => { if(!d.previousElementSibling.contains(e.target)) d.classList.add('hidden')});
        });
        $$('.nav-item[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => {
                appState.activePage = btn.dataset.nav;
                localStorage.setItem('lastActivePage', appState.activePage);
                renderUI();
                if (window.innerWidth < 901) closeSidebar();
            });
        });
        const applyTheme = (theme) => {
            document.body.classList.toggle('dark-theme', theme === 'dark');
            if(themeToggleBtn) themeToggleBtn.querySelector('.material-symbols-outlined').textContent = theme === 'dark' ? 'dark_mode' : 'light_mode';
        };
        const currentTheme = localStorage.getItem('theme') || 'light';
        applyTheme(currentTheme);
        themeToggleBtn?.addEventListener('click', () => {
            const newTheme = document.body.classList.contains('dark-theme') ? 'light' : 'dark';
            localStorage.setItem('theme', newTheme); applyTheme(newTheme);
        });
        renderUI();
    }

    function getUIElements() {
        return {
            sidebar: $('#sidebar'), scrim: $('#scrim'), openNavBtn: $('#btnOpenNav'), themeToggleBtn: $('#theme-toggle-btn'), userProfileBtn: $('#user-profile-btn'), notificationBtn: $('#notification-btn'), authBtn: $('#auth-btn'), authDropdownBtn: $('#auth-dropdown-btn'),
            statusDot: $('#connection-status .status-dot'), userAvatar: $('#user-avatar'), dropdownAvatar: $('#user-dropdown-avatar'), dropdownName: $('#user-dropdown-name'), dropdownEmail: $('#user-dropdown-email'),
            roleSection: $('#user-role-section'), roleIcon: $('#user-role-icon'), roleText: $('#user-role-text'), authBtnText: $('#auth-btn .nav-text'), authDropdownBtnText: $('#auth-dropdown-btn span:last-child'), authDropdownBtnIcon: $('#auth-dropdown-btn .material-symbols-outlined'),
        };
    }
    
    function injectPageTemplates() {
        const container = $('.page-container');
        if (!container || container.childElementCount > 0) return;
        const pages = ['dashboard', 'pemasukan-pinjaman', 'alokasi-anggaran', 'input-data', 'absensi', 'tagihan', 'monitoring', 'pengaturan'];
        container.innerHTML = pages.map(id => `<main id="page-${id.replace(/ /g, '-')}" class="page"></main>`).join('');
    }

    init();
});

