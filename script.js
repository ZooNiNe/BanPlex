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
    serverTimestamp,
    onSnapshot,
    query,
    limit,
    getDocs,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

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

    const appState = {
        currentUser: null,
        userRole: 'Guest',
        roleUnsub: null,
        activePage: localStorage.getItem('lastActivePage') || 'dashboard',
    };
    
    // ===== Inisialisasi Firebase (v9+) =====
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // ===== Referensi Firestore =====
    const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    const envelopesCol = collection(db, 'teams', TEAM_ID, 'fund_envelopes');


    // ===== Helper & Utilitas =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    const fmtIDR = (n)=> new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',minimumFractionDigits:0}).format(Number(n||0));
    
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
    function createModal(type) {
        const modalContainer = $('#modal-container');
        if (!modalContainer) return;
        
        let modalHTML = '';
        if (type === 'login') {
            modalHTML = `
                <div id="login-modal" class="modal-bg">
                    <div class="modal-content">
                        <div class="modal-header"><h4>Login atau Buat Akun</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div>
                        <div class="modal-body"><p>Hubungkan akun Google Anda untuk mengakses semua fitur, menyimpan data, dan berkolaborasi dengan tim.</p></div>
                        <div class="modal-footer">
                            <button id="google-login-btn" class="btn btn-primary">
                                <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg>
                                <span>Masuk dengan Google</span>
                            </button>
                        </div>
                    </div>
                </div>`;
        } else if (type === 'confirmLogout') {
            modalHTML = `
                <div id="logout-modal" class="modal-bg">
                    <div class="modal-content">
                        <div class="modal-header"><h4>Konfirmasi Keluar</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div>
                        <div class="modal-body"><p>Apakah Anda yakin ingin keluar dari sesi ini?</p></div>
                        <div class="modal-footer">
                            <button class="btn btn-secondary" data-close-modal>Batal</button>
                            <button id="confirm-logout-btn" class="btn btn-danger">Keluar</button>
                        </div>
                    </div>
                </div>`;
        }
        modalContainer.innerHTML = modalHTML;
        const modalEl = modalContainer.firstElementChild;
        if (!modalEl) return;
        
        setTimeout(() => modalEl.classList.add('show'), 10);
        document.body.classList.add('modal-open');

        const closeModalFunc = () => closeModal(modalEl);
        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModalFunc(); });
        modalEl.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModalFunc));
        
        if(type === 'login') modalEl.querySelector('#google-login-btn')?.addEventListener('click', signInWithGoogle);
        if(type === 'confirmLogout') modalEl.querySelector('#confirm-logout-btn')?.addEventListener('click', handleLogout);
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

    // ===== Logika Otentikasi =====
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

    onAuthStateChanged(auth, user => {
        if (appState.roleUnsub) appState.roleUnsub();
        if (user) {
            appState.currentUser = user;
            updateUIForUser(user, 'Pending');
            ensureMemberDoc(user);
        } else {
            appState.currentUser = null; 
            appState.userRole = 'Guest';
            updateUIForUser(null, 'Guest');
            renderUI();
        }
    });

    async function ensureMemberDoc(user) {
        const userDocRef = doc(db, 'teams/main/members', user.uid);
        try {
            const docSnap = await getDoc(userDocRef);
            if (!docSnap.exists()) {
                await setDoc(userDocRef, {
                    email: user.email, name: user.displayName, photoURL: user.photoURL,
                    role: 'Pending', createdAt: serverTimestamp(),
                });
            }
            appState.roleUnsub = onSnapshot(userDocRef, snap => {
                appState.userRole = snap.data()?.role || 'Pending';
                renderUI();
            });
        } catch (error) {
            console.error("Error ensuring user doc:", error);
            appState.userRole = 'Error';
            renderUI();
        }
    }
    
    // ===== FUNGSI RENDER UTAMA =====
    function renderUI() {
        updateUIForUser(appState.currentUser, appState.userRole);
        updateNavActiveState();
        renderPageContent();
        updateFabVisibility();
    }
    
    function updateUIForUser(user, role) {
        const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
        const { statusDot, userAvatar, dropdownAvatar, dropdownName, dropdownEmail, roleSection, roleIcon, roleText, authBtnText, authDropdownBtn, authDropdownBtnText, authDropdownBtnIcon } = getUIElements();

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
        } else { // Guest
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
        $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${appState.activePage}`));
        const container = $(`#page-${appState.activePage}`);
        if (!container) return;

        if (!appState.currentUser || appState.userRole === 'Guest') {
            container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Akses Terbatas</div><div class="placeholder-desc">Silakan login untuk dapat melihat konten pada halaman ini.</div><button class="btn btn-primary" id="placeholder-login">Login</button></div>`;
            $('#placeholder-login')?.addEventListener('click', () => createModal('login'));
            return;
        } 
        if (appState.userRole === 'Pending') {
            container.innerHTML = `<div class="placeholder-card"><div class="placeholder-title">Menunggu Persetujuan</div><div class="placeholder-desc">Akun Anda sedang ditinjau oleh Admin.</div></div>`;
            return;
        }
        
        // ** PENAMBAHAN BARU: Panggil render spesifik untuk dashboard **
        if (appState.activePage === 'dashboard') {
            renderDashboardPage(container);
        } else {
            const pageTitle = appState.activePage.replace('-', ' ');
            container.innerHTML = `<div class="card card-pad"><h4 style="text-transform: capitalize;">${pageTitle}</h4><p>Fitur untuk halaman ini masih dalam tahap pengembangan.</p></div>`;
        }
    }

    // ** PENAMBAHAN BARU: Fungsi untuk merender konten Dashboard **
    async function renderDashboardPage(container) {
        // Tampilkan skeleton loading
        container.innerHTML = `
            <div class="section-head">
                <h4>Dashboard Proyek</h4>
                <div class="chips">
                    <span class="chip skeleton" style="width: 150px; height: 28px;"></span>
                    <span class="chip skeleton" style="width: 120px; height: 28px;"></span>
                </div>
            </div>
            <div class="kpi-grid">
                <div class="kpi-card skeleton" style="height: 80px;"></div>
                <div class="kpi-card skeleton" style="height: 80px;"></div>
                <div class="kpi-card skeleton" style="height: 80px;"></div>
                <div class="kpi-card skeleton" style="height: 80px;"></div>
                <div class="kpi-card skeleton" style="height: 80px;"></div>
            </div>`;

        try {
            const projectQuery = query(projectsCol, limit(1));
            const projSnap = await getDocs(projectQuery);

            if (projSnap.empty) {
                container.innerHTML = `<div class="card card-pad"><h4>Belum Ada Proyek</h4><p>Silakan buat proyek baru di halaman pengaturan untuk memulai.</p></div>`;
                return;
            }

            const project = projSnap.docs[0].data();
            const projectId = projSnap.docs[0].id;
            
            const envelopeDoc = await getDoc(doc(envelopesCol, projectId));
            const envelope = envelopeDoc.exists() ? envelopeDoc.data() : {};

            // Ganti skeleton dengan data asli
            container.innerHTML = `
                <div class="section-head">
                    <h4>Dashboard Proyek</h4>
                    <div class="chips">
                        <span class="chip">Kontrak: ${fmtIDR(project.contractValue || 0)}</span>
                        <span class="chip">Progres: ${(project.progressPct || 0)}%</span>
                    </div>
                </div>
                <div class="kpi-grid">
                    <div class="kpi-card"><h5>Operasional</h5><div class="amt">${fmtIDR(envelope.operationalBalance || 0)}</div></div>
                    <div class="kpi-card"><h5>Cadangan</h5><div class="amt">${fmtIDR(envelope.contingencyBalance || 0)}</div></div>
                    <div class="kpi-card"><h5>Laba Kunci</h5><div class="amt">${fmtIDR(envelope.profitLockBalance || 0)}</div></div>
                    <div class="kpi-card"><h5>Overhead</h5><div class="amt">${fmtIDR(envelope.overheadPoolBalance || 0)}</div></div>
                    <div class="kpi-card"><h5>Cicilan</h5><div class="amt">${fmtIDR(envelope.sinkingFundBalance || 0)}</div></div>
                </div>`;

        } catch (error) {
            console.error("Error rendering dashboard:", error);
            container.innerHTML = `<div class="card card-pad card--danger"><h4>Gagal Memuat Data</h4><p>Terjadi kesalahan saat mengambil data dasbor. Silakan coba lagi nanti.</p></div>`;
            toast('error', 'Gagal memuat data dasbor.');
        }
    }


    function updateFabVisibility() {
        const fab = $('#fab');
        if (!fab) return;
        const showFabOn = ['input-data', 'tagihan', 'absensi'];
        fab.classList.toggle('hidden', !showFabOn.includes(appState.activePage));
    }

    // ===== Inisialisasi Event Listeners & Setup =====
    function init() {
        injectPageTemplates();
        
        const { sidebar, scrim, openNavBtn, themeToggleBtn, userProfileBtn, notificationBtn, authBtn, authDropdownBtn } = getUIElements();
        
        const closeSidebar = () => {
            sidebar.classList.remove('open');
            scrim.classList.remove('show');
            openNavBtn.classList.remove('is-active');
        };
        
        openNavBtn.addEventListener('click', () => {
            sidebar.classList.toggle('open');
            scrim.classList.toggle('show');
            openNavBtn.classList.toggle('is-active');
        });
        scrim.addEventListener('click', closeSidebar);
        
        const handleAuthAction = () => appState.currentUser ? createModal('confirmLogout') : createModal('login');
        authBtn.addEventListener('click', handleAuthAction);
        authDropdownBtn.addEventListener('click', () => {
            $('#user-dropdown').classList.add('hidden');
            handleAuthAction();
        });

        const toggleDropdown = (id) => {
            $$('.dropdown-panel').forEach(d => { if (d.id !== id) d.classList.add('hidden'); });
            $(`#${id}`)?.classList.toggle('hidden');
        };
        userProfileBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('user-dropdown'); });
        notificationBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDropdown('notification-dropdown'); });
        
        document.body.addEventListener('click', (e) => {
            if (!userProfileBtn.contains(e.target) && !$('#user-dropdown').contains(e.target)) $('#user-dropdown').classList.add('hidden');
            if (!notificationBtn.contains(e.target) && !$('#notification-dropdown').contains(e.target)) $('#notification-dropdown').classList.add('hidden');
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
            localStorage.setItem('theme', newTheme);
            applyTheme(newTheme);
        });

        renderUI();
    }

    function getUIElements() {
        return {
            sidebar: $('#sidebar'), scrim: $('#scrim'), openNavBtn: $('#btnOpenNav'),
            themeToggleBtn: $('#theme-toggle-btn'), userProfileBtn: $('#user-profile-btn'),
            notificationBtn: $('#notification-btn'), authBtn: $('#auth-btn'),
            authDropdownBtn: $('#auth-dropdown-btn'),
            statusDot: $('#connection-status .status-dot'),
            userAvatar: $('#user-avatar'), dropdownAvatar: $('#user-dropdown-avatar'),
            dropdownName: $('#user-dropdown-name'), dropdownEmail: $('#user-dropdown-email'),
            roleSection: $('#user-role-section'), roleIcon: $('#user-role-icon'), roleText: $('#user-role-text'),
            authBtnText: $('#auth-btn .nav-text'),
            authDropdownBtnText: $('#auth-dropdown-btn span:last-child'),
            authDropdownBtnIcon: $('#auth-dropdown-btn .material-symbols-outlined'),
        };
    }
    
    function injectPageTemplates() {
        const container = $('.page-container');
        if (!container || container.childElementCount > 0) return;
        const pages = ['dashboard', 'input-data', 'absensi', 'stok-material', 'tagihan', 'monitoring', 'pengaturan'];
        container.innerHTML = pages.map(id => `<main id="page-${id}" class="page"></main>`).join('');
    }

    init();
});

