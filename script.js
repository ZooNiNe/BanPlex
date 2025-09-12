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
    doc,
    getDoc,
    setDoc,
    serverTimestamp,
    onSnapshot,
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

    let currentUser = null;
    let userRole = 'Guest';
    let roleUnsub = null; // Listener untuk role
    
    // ===== Inisialisasi Firebase (v9+) =====
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);

    // ===== Referensi Firestore =====
    const usersCol = doc(db, 'teams', 'main'); // Contoh, bisa disesuaikan

    // ===== Helper & Utilitas =====
    const $ = (s) => document.querySelector(s);
    const $$ = (s) => Array.from(document.querySelectorAll(s));
    
    // ===== Fungsi UI Inti =====

    // Menampilkan notifikasi toast
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
    
    // Membuat dan menampilkan modal
    function createModal(type) {
        const modalContainer = $('#modal-container');
        if (!modalContainer) return;
        
        let modalHTML = '';
        if (type === 'login') {
            modalHTML = `
                <div id="login-modal" class="modal-bg">
                    <div class="modal-content">
                        <div class="modal-header">
                          <h4>Login atau Buat Akun</h4>
                          <button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button>
                        </div>
                        <div class="modal-body">
                            <p>Hubungkan akun Google Anda untuk mengakses semua fitur, menyimpan data, dan berkolaborasi dengan tim.</p>
                        </div>
                        <div class="modal-footer">
                            <button id="google-login-btn" class="btn btn-primary">
                                <svg style="width: 20px; height: 20px;" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"></path><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"></path><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"></path><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"></path></svg>
                                <span>Masuk dengan Google</span>
                            </button>
                        </div>
                    </div>
                </div>`;
        }
        modalContainer.innerHTML = modalHTML;
        const modalEl = modalContainer.firstElementChild;
        if (!modalEl) return;
        
        setTimeout(() => modalEl.classList.add('show'), 10);
        document.body.classList.add('modal-open');

        modalEl.addEventListener('click', e => { if (e.target === modalEl) closeModal(modalEl); });
        modalEl.querySelector('[data-close-modal]')?.addEventListener('click', () => closeModal(modalEl));
        if(type==='login') modalEl.querySelector('#google-login-btn')?.addEventListener('click', signInWithGoogle);
    }
    
    // Menutup modal aktif
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
        const provider = new GoogleAuthProvider();
        closeModal();
        toast('loading', 'Menghubungkan ke Google...');
        try {
            await signInWithPopup(auth, provider);
            toast('success', 'Login berhasil!');
        } catch (error) {
            toast('error', `Login gagal: ${error.code}`);
            console.error("Login error detail:", error);
        }
    }

    // Listener utama status autentikasi
    onAuthStateChanged(auth, user => {
        if (roleUnsub) roleUnsub(); // Hentikan listener role lama
        if (user) {
            currentUser = user;
            updateUIForUser(user, 'Pending'); // Tampilkan status sementara
            ensureMemberDoc(user);
        } else {
            currentUser = null; userRole = 'Guest';
            updateUIForUser(null, 'Guest');
            renderPageContent('dashboard');
        }
    });

    // Memastikan dokumen pengguna ada & memulai listener role
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
            // Mulai mendengarkan perubahan pada dokumen ini
            roleUnsub = onSnapshot(userDocRef, snap => handleRoleChange(snap, user));
        } catch (error) {
            console.error("Error ensuring user doc:", error);
            updateUIForUser(user, 'Error');
        }
    }

    // Menangani perubahan role dari Firestore
    function handleRoleChange(snap, user) {
        userRole = snap.data()?.role || 'Pending';
        updateUIForUser(user, userRole);
        renderPageContent('dashboard'); // Render ulang konten sesuai role baru
    }
    
    // ===== FUNGSI RENDER & UPDATE UI =====
    function updateUIForUser(user, role) {
        const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
        const roleSection = $('#user-role-section');
        const roleIcon = $('#user-role-icon');
        const roleText = $('#user-role-text');
        const authDropdownBtn = $('#auth-dropdown-btn');
        const connectionDot = $('#connection-status .status-dot');

        if (user) {
            const photo = user.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
            $('#user-avatar').src = photo;
            $('#user-dropdown-avatar').src = photo.replace('40x40', '80x80');
            $('#user-dropdown-name').textContent = user.displayName || 'Pengguna';
            $('#user-dropdown-email').textContent = user.email || '';
            
            $('#auth-btn .nav-text').textContent = 'Keluar';
            $('#auth-btn').classList.add('danger');
            authDropdownBtn.querySelector('span:last-child').textContent = 'Keluar';
            authDropdownBtn.querySelector('.material-symbols-outlined').textContent = 'logout';

            roleSection?.classList.remove('hidden');
            if (role === 'Pending') {
                roleIcon.textContent = 'hourglass_empty';
                roleText.textContent = 'Belum diverifikasi';
                roleSection.className = 'user-info-role status--pending';
                connectionDot.className = 'status-dot dot--yellow';
            } else {
                roleIcon.textContent = 'verified_user';
                roleText.textContent = role;
                roleSection.className = 'user-info-role status--verified';
                connectionDot.className = 'status-dot dot--green';
            }
        } else { // Guest
            $('#user-avatar').src = guestAvatar;
            $('#user-dropdown-avatar').src = guestAvatar.replace('40x40', '80x80');
            $('#user-dropdown-name').textContent = 'Guest';
            $('#user-dropdown-email').textContent = 'Silakan login';
            $('#auth-btn .nav-text').textContent = 'Login';
            $('#auth-btn').classList.remove('danger');
            authDropdownBtn.querySelector('span:last-child').textContent = 'Login dengan Google';
            authDropdownBtn.querySelector('.material-symbols-outlined').textContent = 'login';
            roleSection?.classList.add('hidden');
            connectionDot.className = 'status-dot dot--red';
        }
        applyRoleVisibility();
    }
    
    // Mengatur elemen mana yang terlihat berdasarkan role
    function applyRoleVisibility() {
        document.body.dataset.role = userRole;
        $$('[data-role]').forEach(el => {
            const roles = el.dataset.role.split(',').map(s => s.trim());
            el.classList.toggle('hidden', !roles.includes(userRole) && userRole !== 'Owner');
        });
    }

    // Render konten utama halaman
    function renderPageContent(pageId) {
        const container = $('.page-container');
        if (!container) return;

        let content = '';
        if (!currentUser) {
            content = `<div class="placeholder-card">
                <div class="placeholder-title">Akses Terbatas</div>
                <div class="placeholder-desc">Silakan login untuk dapat melihat konten pada halaman ini.</div>
                <button class="btn btn-primary" id="placeholder-login">Login</button>
            </div>`;
        } else if (userRole === 'Pending') {
            content = `<div class="placeholder-card">
                <div class="placeholder-title">Menunggu Persetujuan</div>
                <div class="placeholder-desc">Akun Anda sedang ditinjau oleh Admin.</div>
            </div>`;
        } else {
             content = `<div class="card card-pad">
                <h4>Selamat Datang, ${currentUser.displayName}!</h4>
                <p>Anda login sebagai <strong>${userRole}</strong>. Halaman yang Anda lihat adalah <strong>${pageId}</strong>.</p>
             </div>`;
        }
        container.innerHTML = content;
        $('#placeholder-login')?.addEventListener('click', () => createModal('login'));
    }

    // ===== Inisialisasi Event Listeners UI =====
    function initUI() {
        const sidebar = $('#sidebar'), scrim = $('#scrim');
        
        const closeSidebar = () => {
            sidebar?.classList.remove('open');
            scrim?.classList.remove('show');
        };
        
        $('#btnOpenNav')?.addEventListener('click', () => {
            sidebar?.classList.add('open');
            scrim?.classList.add('show');
        });
        scrim?.addEventListener('click', closeSidebar);
        
        // Event untuk tombol Auth utama
        const handleAuthAction = () => {
            if (currentUser) {
                signOut(auth).catch(err => toast('error', `Gagal keluar: ${err.message}`));
            } else {
                createModal('login');
            }
        };
        $('#auth-btn')?.addEventListener('click', handleAuthAction);
        $('#auth-dropdown-btn')?.addEventListener('click', () => {
             $('#user-dropdown')?.classList.add('hidden');
             handleAuthAction();
        });

        // Event untuk dropdown profil
        $('#user-profile-btn')?.addEventListener('click', (e) => {
            e.stopPropagation();
            $('#user-dropdown')?.classList.toggle('hidden');
        });
        document.body.addEventListener('click', (e) => {
            const target = e.target;
            if (!$('#user-profile-btn')?.contains(target) && !$('.user-dropdown')?.contains(target)) {
                $('.user-dropdown')?.classList.add('hidden');
            }
        });

        // Inisialisasi halaman awal
        renderPageContent('dashboard');
    }

    initUI();
});

