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
            const sisa = split[0].length % 3;
            let rupiah = split[0].substr(0, sisa);
            const ribuan = split[0].substr(sisa).match(/\d{3}/gi);
            if (ribuan) {
                const separator = sisa ? '.' : '';
                rupiah += separator + ribuan.join('.');
            }
            e.target.value = split[1] !== undefined ? rupiah + ',' + split[1] : rupiah;
        });
    }

    function getNumericValue(formattedString) {
        return formattedString ? parseFloat(String(formattedString).replace(/\./g, '').replace(',', '.')) : 0;
    }
    
    // ===== PEMBARUAN: Fungsi untuk Pop-up Select Kustom =====
    function createCustomSelect(selectElement) {
        if (!selectElement || selectElement.parentElement.classList.contains('custom-select-wrapper')) return;
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
        
        const updateTriggerText = () => {
            const selectedOption = selectElement.options[selectElement.selectedIndex];
            trigger.textContent = selectedOption ? selectedOption.textContent : '';
        };

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
                optionsContainer.parentElement.classList.remove('open');
                optionsContainer.querySelectorAll('.selected').forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
            });
            optionsContainer.appendChild(option);
        });

        trigger.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other selects before opening this one
            $$('.custom-select-wrapper.open').forEach(openWrapper => {
                if(openWrapper !== wrapper) openWrapper.classList.remove('open');
            });
            wrapper.classList.toggle('open');
        });

        updateTriggerText();
        return wrapper;
    }

    const appState = {
        currentUser: null, userRole: 'Guest', roleUnsub: null,
        activePage: localStorage.getItem('lastActivePage') || 'dashboard',
        editingInvoiceId: null, creditors: [], projects: [], stockItems: [], workers: [],
        currentInvoiceItems: [], digitalEnvelopes: null,
        cachedSuggestions: { itemNames: new Set() },
        attendanceDate: todayStr(),
        reports: { expenseChart: null }
    };
    
    // ===== Inisialisasi Firebase & Referensi =====
    const app = initializeApp(firebaseConfig);
    const auth = getAuth(app);
    const db = getFirestore(app);
    const storage = getStorage(app);
    const membersCol = collection(db, 'teams', TEAM_ID, 'members');
    const creditorsCol = collection(db, 'teams', TEAM_ID, 'creditors');
    const invoicesCol = collection(db, 'teams', TEAM_ID, 'invoices');
    const fundingSourcesCol = collection(db, 'teams', TEAM_ID, 'funding_sources');
    const projectsCol = collection(db, 'teams', TEAM_ID, 'projects');
    const workersCol = collection(db, 'teams', TEAM_ID, 'workers');
    const attendanceCol = collection(db, 'teams', TEAM_ID, 'attendance_records');
    const stockItemsCol = collection(db, 'teams', TEAM_ID, 'stock_items');
    const stockTransactionsCol = collection(db, 'teams', TEAM_ID, 'stock_transactions');
    const digitalEnvelopesDoc = doc(db, 'teams', TEAM_ID, 'envelopes', 'main_budget');

    // ===== Sistem Toast & Modal =====
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
            modalHTML = `<div id="payment-modal" class="modal-bg"><form id="payment-form" class="modal-content"><div class="modal-header"><h4>Input Pembayaran</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="payment-details"><div class="payment-detail-item"><span>No. Faktur</span><strong>${data.invoiceNumber}</strong></div><div class="payment-detail-item"><span>Total Tagihan</span><strong>${fmtIDR(data.totalAmount)}</strong></div></div><div class="form-group"><label for="payment-amount">Nominal Pembayaran</label><input type="text" id="payment-amount" value="${new Intl.NumberFormat('id-ID').format(remainingAmount)}" required></div><div class="form-group"><label for="payment-date">Tanggal Pembayaran</label><input type="date" id="payment-date" value="${todayStr()}" required></div><div class="payment-summary"><span>Sisa Tagihan Setelah Ini:</span><strong id="remaining-balance-preview">${fmtIDR(0)}</strong></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan Pembayaran</button></div></form></div>`;
        } else if (type === 'confirmDelete') {
            modalHTML = `<div id="delete-modal" class="modal-bg"><div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>${data.title || 'Konfirmasi Hapus'}</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>${data.message || 'Anda yakin ingin menghapus item ini? Tindakan ini tidak dapat diurungkan.'}</p></div><div class="modal-footer"><button class="btn btn-secondary" data-close-modal>Batal</button><button id="confirm-delete-btn" class="btn btn-danger">Ya, Hapus</button></div></div></div>`;
        } else if (type === 'globalSearch') {
            modalHTML = `<div id="search-modal" class="modal-bg"><div class="modal-content search-modal-content"><div class="search-input-wrapper"><span class="material-symbols-outlined">search</span><input type="text" id="global-search-input" placeholder="Ketik untuk mencari halaman..."></div><div class="modal-body search-results-wrapper" id="search-results"><p class="empty-state">Mulai ketik untuk mencari navigasi...</p></div></div></div>`;
        } else if (type === 'attendanceStatus') {
            modalHTML = `<div id="attendance-modal" class="modal-bg"><div class="modal-content" style="max-width:400px"><div class="modal-header"><h4>Pilih Status Kehadiran</h4><button class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><p>Pekerja: <strong>${data.workerName}</strong></p><div class="status-buttons"><button class="btn status-btn--hadir" data-status="Hadir"><span class="material-symbols-outlined">check_circle</span> Hadir</button><button class="btn status-btn--sakit" data-status="Sakit"><span class="material-symbols-outlined">sick</span> Sakit</button><button class="btn status-btn--izin" data-status="Izin"><span class="material-symbols-outlined">mail</span> Izin</button><button class="btn status-btn--alpha" data-status="Alpha"><span class="material-symbols-outlined">cancel</span> Alpha</button></div></div></div></div>`;
        } else if (type === 'newWorker' || type === 'editWorker') {
            const isEdit = type === 'editWorker';
            modalHTML = `<div id="worker-modal" class="modal-bg"><form id="worker-form" class="modal-content"><div class="modal-header"><h4>${isEdit ? 'Edit Data' : 'Tambah'} Pekerja</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label for="worker-name">Nama Pekerja</label><input type="text" id="worker-name" value="${isEdit ? data.workerName : ''}" required></div><div class="form-group"><label for="worker-position">Jabatan</label><input type="text" id="worker-position" value="${isEdit ? data.position : ''}" required></div><div class="form-group"><label for="worker-wage">Upah Harian (Rp)</label><input type="text" id="worker-wage" value="${isEdit ? new Intl.NumberFormat('id-ID').format(data.dailyWage) : ''}" required></div><div class="form-group full"><label for="worker-project">Proyek</label><select id="worker-project" required>${appState.projects.map(p => `<option value="${p.id}" ${isEdit && data.projectId === p.id ? 'selected' : ''}>${p.projectName}</option>`).join('')}</select></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
        } else if (type === 'newStockItem' || type === 'editStockItem') {
            const isEdit = type === 'editStockItem';
            modalHTML = `<div id="stock-item-modal" class="modal-bg"><form id="stock-item-form" class="modal-content"><div class="modal-header"><h4>${isEdit ? 'Edit' : 'Tambah'} Master Material</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label for="stock-item-name">Nama Material</label><input type="text" id="stock-item-name" value="${isEdit ? data.itemName : ''}" required></div><div class="form-group"><label for="stock-item-unit">Satuan</label><input type="text" id="stock-item-unit" value="${isEdit ? data.unit : ''}" placeholder="Contoh: sak, btg, m3" required></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
        } else if (type === 'recordStockUsage') {
            modalHTML = `<div id="stock-usage-modal" class="modal-bg"><form id="stock-usage-form" class="modal-content"><div class="modal-header"><h4>Catat Penggunaan Material</h4><button type="button" class="icon-btn" data-close-modal><span class="material-symbols-outlined">close</span></button></div><div class="modal-body"><div class="form-grid"><div class="form-group full"><label for="usage-item">Pilih Material</label><select id="usage-item" required>${appState.stockItems.map(i => `<option value="${i.id}">${i.itemName} (${i.unit})</option>`).join('')}</select></div><div class="form-group"><label for="usage-qty">Jumlah Digunakan</label><input type="number" id="usage-qty" required></div><div class="form-group"><label for="usage-date">Tanggal</label><input type="date" id="usage-date" value="${todayStr()}" required></div><div class="form-group full"><label for="usage-notes">Keterangan</label><textarea id="usage-notes" placeholder="Contoh: Untuk pengecoran lantai 2"></textarea></div></div></div><div class="modal-footer"><button type="button" class="btn btn-secondary" data-close-modal>Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div></form></div>`;
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
        if (type === 'payment') {
            const paymentInput = $('#payment-amount');
            formatRupiahInput(paymentInput);
            const previewEl = $('#remaining-balance-preview');
            const updatePreview = () => {
                const payment = getNumericValue(paymentInput.value);
                const remaining = (data.totalAmount - data.amountPaid) - payment;
                previewEl.textContent = fmtIDR(remaining);
            };
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
        if (type === 'confirmDelete') {
            modalEl.querySelector('#confirm-delete-btn')?.addEventListener('click', () => {
                if (data.onConfirm) data.onConfirm();
                closeModalFunc();
            });
        }
        if (type === 'globalSearch') {
            const searchInput = $('#global-search-input');
            searchInput.focus();
            searchInput.addEventListener('input', handleGlobalSearch);
        }
        if (type === 'attendanceStatus') {
            modalEl.querySelectorAll('.status-buttons button').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (data.onSelect) data.onSelect(btn.dataset.status);
                    closeModalFunc();
                });
            });
        }
        if (type === 'newWorker' || type === 'editWorker') {
             formatRupiahInput($('#worker-wage'));
             createCustomSelect($('#worker-project')); // PEMBARUAN DI SINI
             modalEl.querySelector('#worker-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                handleSaveWorker(data.id);
             });
        }
        if (type === 'newStockItem' || type === 'editStockItem') {
             modalEl.querySelector('#stock-item-form')?.addEventListener('submit', (e) => {
                e.preventDefault();
                handleSaveStockItem(data.id);
             });
        }
        if (type === 'recordStockUsage') {
            createCustomSelect($('#usage-item')); // PEMBARUAN DI SINI
            modalEl.querySelector('#stock-usage-form')?.addEventListener('submit', handleRecordStockUsage);
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
    onAuthStateChanged(auth, async (user) => {
        if (appState.roleUnsub) appState.roleUnsub();
        
        if (user) {
            appState.currentUser = user;
            updateUIForUser(user, 'Pending');

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
                await renderUI();

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
        } else {
            appState.currentUser = null; 
            appState.userRole = 'Guest';
            appState.digitalEnvelopes = null;
            renderUI();
        }
    });
    
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
        updateUIForUser(appState.currentUser, appState.userRole);
        updateNavActiveState();
        
        if (appState.userRole === 'Guest' || appState.userRole === 'Pending') {
            renderPageContent();
        } else {
            if (!appState.digitalEnvelopes) await fetchDigitalEnvelopes();
            renderPageContent();
        }
    }
    
    async function fetchDigitalEnvelopes() {
        try {
            const docSnap = await getDoc(digitalEnvelopesDoc);
            if (docSnap.exists()) {
                appState.digitalEnvelopes = docSnap.data();
            } else {
                appState.digitalEnvelopes = { unallocatedFunds: 0, debtPayment: 0, operational: 0, reserve: 0, profit: 0 };
            }
        } catch (error) {
            console.error("Error fetching digital envelopes:", error);
            toast('error', 'Gagal memuat data anggaran.');
        }
    }
    
    function updateUIForUser(user, role) {
        const guestAvatar = 'https://placehold.co/40x40/e2e8f0/64748b?text=G';
        const { statusDot, userAvatar, dropdownAvatar, dropdownName, dropdownEmail, roleSection, roleIcon, roleText, authBtn, authDropdownBtnText, authDropdownBtnIcon } = getUIElements();
        if (user) {
            const photo = user.photoURL || `https://placehold.co/40x40/3b82f6/ffffff?text=${(user.displayName||'U')[0]}`;
            userAvatar.src = photo;
            dropdownAvatar.src = photo.replace('40x40', '80x80');
            dropdownName.textContent = user.displayName || 'Pengguna';
            dropdownEmail.textContent = user.email || '';
            authBtn.querySelector('.nav-text').textContent = 'Keluar';
            authBtn.classList.add('nav-item--danger');
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
            authBtn.querySelector('.nav-text').textContent = 'Login';
            authBtn.classList.remove('nav-item--danger');
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
            'absensi': renderAbsensiPage,
            'manajemen-stok': renderManajemenStokPage,
            'laporan': renderLaporanPage,
        };

        const renderer = pageRenderers[appState.activePage];
        if (renderer) {
            renderer(container);
        } else {
            const pageTitle = appState.activePage.replace(/-/g, ' ');
            container.innerHTML = `<div class="card card-pad"><h4 style="text-transform: capitalize;">${pageTitle}</h4><p>Fitur untuk halaman ini masih dalam tahap pengembangan.</p></div>`;
        }
    }
    
    // ===== FUNGSI RENDER HALAMAN-HALAMAN =====
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
        container.innerHTML = `<div class="section-head"><h4>Manajemen Pemasukan & Pinjaman</h4></div><div class="card card-pad"><form id="funding-source-form"><div class="form-section"><h5 class="form-section-title">Tambah Pemasukan Baru</h5><div class="form-grid-invoice"><div class="form-group"><label for="fs-date">Tanggal</label><input type="date" id="fs-date" value="${todayStr()}" required></div><div class="form-group"><label for="fs-type">Jenis</label><select id="fs-type" required><option value="Pencairan Termin">Pencairan Termin</option><option value="Pinjaman (Tanpa Bunga)">Pinjaman (Tanpa Bunga)</option><option value="Pinjaman (Dengan Bunga)">Pinjaman (Dengan Bunga)</option></select></div><div class="form-group span-2"><label for="fs-desc">Keterangan</label><input type="text" id="fs-desc" required placeholder="Contoh: Termin Tahap 1 (20%)"></div><div class="form-group"><label for="fs-amount">Jumlah</label><input type="text" id="fs-amount" required placeholder="0"></div></div><div id="interest-fields-wrapper" class="form-grid-invoice hidden" style="margin-top:1rem;border-top:1px solid var(--line);padding-top:1rem;"><div class="form-group"><label for="fs-interest-rate">Bunga (%/Tahun)</label><input type="number" id="fs-interest-rate" placeholder="0"></div><div class="form-group"><label for="fs-tenor">Tenor (Bulan)</label><input type="number" id="fs-tenor" placeholder="0"></div><div class="form-group"><label>Total Tagihan</label><input type="text" id="fs-total-repayable" disabled placeholder="Otomatis"></div></div></div><div class="form-group full" style="margin-top:1.5rem;"><button type="submit" class="btn btn-primary">Simpan Pemasukan</button></div></form></div><div class="card card-pad" style="margin-top:1.5rem;"><h5 class="form-section-title">Riwayat Pemasukan & Pinjaman</h5><div class="table-container" id="funding-sources-table-container"><p>Memuat data...</p></div></div>`;
        formatRupiahInput($('#fs-amount'));
        createCustomSelect($('#fs-type'));
        $('#fs-type').addEventListener('change', () => $('#interest-fields-wrapper').classList.toggle('hidden', $('#fs-type').value !== 'Pinjaman (Dengan Bunga)'));
        // PERBAIKAN: Menggunakan $$ untuk memilih beberapa elemen
        $$('#fs-amount, #fs-interest-rate, #fs-tenor').forEach(el => el.addEventListener('input', calculateTotalRepayable));
        $('#funding-source-form').addEventListener('submit', handleSaveFundingSource);
        fetchAndDisplayFundingSources();
    }

    function calculateTotalRepayable() {
        const principal = getNumericValue($('#fs-amount').value);
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

    // ===== PEMBARUAN: Logika Simpan Pemasukan dengan Transaksi & Integrasi =====
    async function handleSaveFundingSource(e) {
        e.preventDefault();
        const form = e.target;
        const submitBtn = form.querySelector('button[type="submit"]');

        // Nonaktifkan tombol untuk mencegah klik ganda
        submitBtn.disabled = true;
        
        // Penjaga untuk memastikan pengguna sudah terautentikasi sebelum melanjutkan
        if (!appState.currentUser) {
            toast('error', 'Sesi tidak valid. Silakan muat ulang halaman.');
            console.error("Attempted to save funding source without a valid user.");
            submitBtn.disabled = false; // Aktifkan kembali tombol
            return;
        }

        try {
            const type = form.querySelector('#fs-type').value;
            const principal = getNumericValue(form.querySelector('#fs-amount').value);

            if(!principal || principal <= 0){
                toast('error', 'Jumlah pemasukan harus lebih dari nol.');
                return; // Keluar dari fungsi jika validasi gagal
            }

            const data = {
                date: Timestamp.fromDate(new Date(form.querySelector('#fs-date').value)),
                type, description: form.querySelector('#fs-desc').value.trim(), amount: principal,
                createdBy: appState.currentUser.email, createdAt: serverTimestamp(),
            };

            if (type.includes('Pinjaman')) {
                data.isFullyPaid = false; data.amountPaid = 0; data.totalRepayableAmount = principal;
            }

            if (type === 'Pinjaman (Dengan Bunga)') {
                const annualRate = parseFloat(form.querySelector('#fs-interest-rate').value) || 0;
                const tenorMonths = parseInt(form.querySelector('#fs-tenor').value) || 0;
                if (annualRate <= 0 || tenorMonths <= 0) {
                    toast('error', 'Bunga dan tenor harus diisi untuk pinjaman berbunga.');
                    return; // Keluar dari fungsi jika validasi gagal
                }
                const totalInterest = principal * (annualRate / 100) * (tenorMonths / 12);
                data.interestRate = annualRate; data.tenorInMonths = tenorMonths;
                data.totalRepayableAmount = principal + totalInterest;
            }
            
            toast('loading', 'Menyimpan & mengintegrasikan data...');

            await runTransaction(db, async (transaction) => {
                // --- PERBAIKAN DIMULAI DI SINI ---
                
                // 1. Lakukan SEMUA OPERASI BACA terlebih dahulu
                let envDoc;
                if (type === 'Pencairan Termin') {
                    envDoc = await transaction.get(digitalEnvelopesDoc);
                }

                // 2. Lakukan SEMUA OPERASI TULIS setelahnya
                const newFundingDocRef = doc(collection(db, 'teams', TEAM_ID, 'funding_sources'));
                transaction.set(newFundingDocRef, data);

                if (type === 'Pencairan Termin') {
                    if (!envDoc.exists()) {
                        transaction.set(digitalEnvelopesDoc, { unallocatedFunds: principal, debtPayment: 0, operational: 0, reserve: 0, profit: 0 });
                    } else {
                        const currentData = envDoc.data();
                        const newUnallocated = (currentData.unallocatedFunds || 0) + principal;
                        transaction.update(digitalEnvelopesDoc, { unallocatedFunds: newUnallocated });
                    }
                }
                // --- PERBAIKAN SELESAI ---
            });

            toast('success', 'Pemasukan berhasil disimpan dan terintegrasi.');
            await fetchDigitalEnvelopes(); // Update state amplop digital
            renderPemasukanPage($('#page-pemasukan-pinjaman')); // Re-render halaman
            
        } catch (error) {
            toast('error', 'Gagal menyimpan data.');
            console.error("Error saving funding source:", error);
        } finally {
            // Pastikan tombol diaktifkan kembali
             if(submitBtn) submitBtn.disabled = false;
        }
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
        container.innerHTML = `<div class="section-head"><h4>Alokasi & Anggaran</h4></div><div class="allocation-grid"><div class="card card-pad"><h5 class="form-section-title">Alokasikan Dana</h5><p class="section-subtitle">Distribusikan dana yang belum teralokasi ke dalam amplop digital.</p><form id="allocation-form"><div class="form-group"><label>Dana Tersedia</label><input type="text" value="${fmtIDR(envelopes.unallocatedFunds)}" disabled></div><div class="form-group"><label for="alloc-amount">Jumlah</label><input type="text" id="alloc-amount" placeholder="0" required></div><div class="form-group"><label for="alloc-to-envelope">Alokasikan Ke</label><select id="alloc-to-envelope" required><option value="operational">Operasional</option><option value="debtPayment">Pembayaran Hutang</option><option value="reserve">Dana Cadangan</option><option value="profit">Laba Proyek</option></select></div><button type="submit" class="btn btn-primary" style="margin-top:1rem">Alokasikan Dana</button></form></div><div class="card card-pad"><h5 class="form-section-title">Ringkasan Amplop</h5><div class="envelope-grid"><div class="envelope-card"><h6>Operasional</h6><div class="amount">${fmtIDR(envelopes.operational)}</div></div><div class="envelope-card"><h6>Hutang</h6><div class="amount">${fmtIDR(envelopes.debtPayment)}</div></div><div class="envelope-card"><h6>Cadangan</h6><div class="amount">${fmtIDR(envelopes.reserve)}</div></div><div class="envelope-card"><h6>Laba</h6><div class="amount">${fmtIDR(envelopes.profit)}</div></div></div></div></div>`;
        formatRupiahInput($('#alloc-amount'));
        createCustomSelect($('#alloc-to-envelope')); // PEMBARUAN DI SINI
        $('#allocation-form').addEventListener('submit', handleAllocateFunds);
    }
    
    async function handleAllocateFunds(e) {
        e.preventDefault();
        const amount = getNumericValue($('#alloc-amount').value);
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
                updates[targetEnvelope] = (currentData[targetEnvelope] || 0) + amount;
                transaction.update(digitalEnvelopesDoc, updates);
            });
            await fetchDigitalEnvelopes();
            renderAlokasiPage($('#page-alokasi-anggaran'));
            toast('success', 'Dana berhasil dialokasikan.');
        } catch (error) { toast('error', 'Gagal mengalokasikan dana.'); console.error(error); }
    }
    
    async function renderInputDataPage(container) {
        await fetchCreditors();
        await fetchItemNameSuggestions();
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
        container.innerHTML = `<div class="card card-pad"><form id="invoice-form"><div class="form-section"><h5 class="form-section-title">Informasi Faktur</h5><div class="form-grid-invoice"><div class="form-group"><label for="inv-date">Tanggal</label><input type="date" id="inv-date" value="${todayStr()}" required></div><div class="form-group"><label>No. Faktur</label><input type="text" id="inv-number" value="${invoiceNumber}" disabled></div><div class="form-group span-2"><label for="inv-creditor">Kreditur</label><div class="input-with-button"><select id="inv-creditor" required><option value="">Pilih Kreditur...</option>${appState.creditors.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select><button type="button" id="add-creditor-btn" class="icon-btn" title="Tambah Kreditur Baru"><span class="material-symbols-outlined">add</span></button></div></div></div></div><div class="form-section"><h5 class="form-section-title">Item Pengeluaran</h5><div id="invoice-item-list" class="invoice-item-list"></div><div class="form-grid-item"><div class="form-group span-2" id="item-name-group"><label for="item-name">Nama Barang/Jasa</label><input type="text" id="item-name" autocomplete="off" placeholder="Contoh: Semen Tiga Roda"><div class="autocomplete-items" id="autocomplete-list"></div></div><div class="form-group"><label for="item-qty">Qty</label><input type="number" id="item-qty" placeholder="0"></div><div class="form-group"><label for="item-unit">Satuan</label><input type="text" id="item-unit" placeholder="sak / m3 / ls"></div><div class="form-group"><label for="item-price">Harga Satuan</label><input type="text" id="item-price" placeholder="0"></div><div class="form-group"><label>Total</label><input type="text" id="item-total" disabled placeholder="Otomatis"></div></div><button type="button" id="add-item-btn" class="btn btn-secondary" style="margin-top: 1rem;"><span class="material-symbols-outlined">add</span>Tambah Item</button></div><div class="form-section"><h5 class="form-section-title">Lampiran</h5><div class="form-grid-invoice"><div class="form-group"><label for="inv-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Foto Invoice</label><input type="file" id="inv-photo" accept="image/*"><span id="inv-photo-name" class="file-name"></span></div><div class="form-group"><label for="del-note-photo" class="custom-file-upload"><span class="material-symbols-outlined">upload_file</span>Upload Surat Jalan</label><input type="file" id="del-note-photo" accept="image/*"><span id="del-note-photo-name" class="file-name"></span></div></div></div><div class="form-group full" style="margin-top:2rem;border-top:1px solid var(--line);padding-top:1.5rem;"><div class="invoice-summary">Total Faktur: <strong id="invoice-total-amount">Rp 0,00</strong></div><button type="submit" class="btn btn-primary">Simpan Faktur</button></div></form></div>`;
        formatRupiahInput($('#item-price'));
        createCustomSelect($('#inv-creditor')); // PEMBARUAN DI SINI
        $('#add-creditor-btn').addEventListener('click', () => createModal('newCreditor'));
        $('#add-item-btn').addEventListener('click', handleAddItemToInvoice);
        $('#invoice-form').addEventListener('submit', (e) => handleSaveInvoice(e, category));
        $('#item-qty, #item-price').forEach(el => el.addEventListener('input', updateItemTotal));
        $('#inv-photo').addEventListener('change', (e) => { $('#inv-photo-name').textContent = e.target.files[0]?.name || ''; });
        $('#del-note-photo').addEventListener('change', (e) => { $('#del-note-photo-name').textContent = e.target.files[0]?.name || ''; });
        
        const itemNameInput = $('#item-name');
        itemNameInput.addEventListener('input', () => showAutocomplete(itemNameInput));
        document.addEventListener('click', (e) => { if (!e.target.closest('#item-name-group')) $('#autocomplete-list').innerHTML = ''; });
    }
    
    function updateItemTotal() {
        const qty = parseFloat($('#item-qty').value) || 0;
        const price = getNumericValue($('#item-price').value);
        $('#item-total').value = fmtIDR(qty * price);
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
            
            appState.currentInvoiceItems.forEach(item => appState.cachedSuggestions.itemNames.add(item.itemName));
            const creditorSelect = $('#inv-creditor');
            const invoiceData = {
                invoiceNumber: $('#inv-number').value,
                date: Timestamp.fromDate(new Date($('#inv-date').value)),
                creditorId: creditorSelect.value,
                creditorName: creditorSelect.options[creditorSelect.selectedIndex].text,
                category, totalAmount, amountPaid: 0, isFullyPaid: false,
                items: appState.currentInvoiceItems,
                invoicePhotoUrl, deliveryNotePhotoUrl,
                createdBy: appState.currentUser.email, createdAt: serverTimestamp(),
            };
            const docRef = await addDoc(invoicesCol, invoiceData);

            if (category === 'material') {
                await recordStockInFromInvoice(invoiceData.items, docRef.id);
            }

            toast('success', 'Faktur berhasil disimpan.');
            renderInvoiceForm($('#sub-page-content'), category);
        } catch (error) { toast('error', 'Gagal menyimpan faktur.'); console.error("Error saving invoice:", error); }
    }
    
    async function recordStockInFromInvoice(items, invoiceId) {
        const batch = writeBatch(db);
        for (const item of items) {
            const q = query(stockItemsCol, where("itemName", "==", item.itemName));
            const querySnapshot = await getDocs(q);
            let stockItemId;

            if (querySnapshot.empty) {
                const newStockItemRef = doc(collection(db, stockItemsCol.path));
                batch.set(newStockItemRef, {
                    itemName: item.itemName, unit: item.unitName,
                    currentStock: item.quantity, createdAt: serverTimestamp(),
                });
                stockItemId = newStockItemRef.id;
            } else {
                const stockDoc = querySnapshot.docs[0];
                stockItemId = stockDoc.id;
                const newStock = (stockDoc.data().currentStock || 0) + item.quantity;
                batch.update(doc(stockItemsCol, stockItemId), { currentStock: newStock });
            }

            const transactionRef = doc(collection(db, stockTransactionsCol.path));
            batch.set(transactionRef, {
                stockItemId, itemName: item.itemName, type: 'masuk',
                quantity: item.quantity, date: serverTimestamp(),
                relatedInvoiceId: invoiceId, notes: `Pembelian dari faktur`,
            });
        }
        await batch.commit();
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
            const activeCategory = $('.sub-nav-item.active')?.dataset.category || 'operasional';
            renderInvoiceForm($('#sub-page-content'), activeCategory);
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
                return `<tr><td>${debt.date.toDate().toLocaleDateString('id-ID')}</td><td>${debt.invoiceNumber}</td><td>${debt.creditorName}</td><td>${fmtIDR(debt.totalAmount)}</td><td><div class="payment-progress-container" title="${fmtIDR(debt.amountPaid)} terbayar"><div class="payment-progress-bar" style="width:${progress}%;"></div><span class="payment-progress-text">${progress.toFixed(0)}%</span></div></td><td>${!isPaid ? `<button class="btn btn-primary btn-sm btn-pay" data-id="${debt.id}">Bayar</button>` : `<span class="badge badge--green">Lunas</span>`}</td></tr>`
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
    
    // ===== START: FITUR ABSENSI & MANAJEMEN PEKERJA =====
    async function renderAbsensiPage(container) {
        container.innerHTML = `<div class="section-head"><h4>Absensi Harian Pekerja</h4></div><div class="card card-pad"><div class="toolbar"><div class="form-group"><label>Tanggal Absensi</label><input type="date" id="attendance-date-picker" value="${appState.attendanceDate}"></div><button id="add-worker-btn" class="btn btn-primary" data-role="Admin,Editor"><span class="material-symbols-outlined">add</span>Tambah Pekerja</button></div></div><div id="attendance-list-container" class="card card-pad" style="margin-top:1.5rem;"><p>Memuat data pekerja...</p></div>`;
        
        $('#attendance-date-picker').addEventListener('change', (e) => {
            appState.attendanceDate = e.target.value;
            fetchAndRenderAttendanceList();
        });
        
        $('#add-worker-btn').addEventListener('click', () => createModal('newWorker'));

        await fetchWorkers();
        fetchAndRenderAttendanceList();
    }
    
    async function fetchWorkers() {
        try {
            const snap = await getDocs(query(workersCol, orderBy('workerName')));
            appState.workers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching workers:", error);
            toast('error', 'Gagal memuat data pekerja.');
        }
    }

    async function fetchAndRenderAttendanceList() {
        const container = $('#attendance-list-container');
        if (!container) return;
        container.innerHTML = `<p>Memuat absensi untuk tanggal ${appState.attendanceDate}...</p>`;
        
        try {
            const date = appState.attendanceDate;
            const q = query(attendanceCol, where("date", "==", date));
            const snap = await getDocs(q);
            const attendanceRecords = {};
            snap.forEach(doc => {
                const data = doc.data();
                attendanceRecords[data.workerId] = { id: doc.id, status: data.status };
            });

            if (appState.workers.length === 0) {
                container.innerHTML = '<p class="empty-state">Belum ada data pekerja. Silakan tambahkan pekerja terlebih dahulu.</p>';
                return;
            }

            container.innerHTML = `<table class="table"><thead><tr><th>Nama Pekerja</th><th>Jabatan</th><th>Status Hari Ini</th><th>Aksi</th></tr></thead><tbody>
                ${appState.workers.map(worker => {
                    const attendance = attendanceRecords[worker.id];
                    const status = attendance ? attendance.status : 'Belum Absen';
                    return `<tr>
                        <td>${worker.workerName}</td>
                        <td>${worker.position}</td>
                        <td><span class="badge badge--${status.toLowerCase().replace(' ', '')}">${status}</span></td>
                        <td class="action-cell">
                            <button class="btn btn-secondary btn-sm btn-set-attendance" data-id="${worker.id}" data-name="${worker.workerName}" data-role="Admin,Editor">Absen</button>
                            <button class="icon-btn btn-edit-worker" data-id="${worker.id}" data-role="Admin,Editor"><span class="material-symbols-outlined">edit</span></button>
                            <button class="icon-btn btn-delete-worker" data-id="${worker.id}" data-role="Admin"><span class="material-symbols-outlined">delete</span></button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody></table>`;
            
            $$('.btn-set-attendance').forEach(btn => btn.addEventListener('click', (e) => {
                const workerId = e.currentTarget.dataset.id;
                const workerName = e.currentTarget.dataset.name;
                createModal('attendanceStatus', {
                    workerName,
                    onSelect: (status) => handleSetAttendance(workerId, status, attendanceRecords[workerId]?.id)
                });
            }));
            $$('.btn-edit-worker').forEach(btn => btn.addEventListener('click', (e) => {
                const workerId = e.currentTarget.dataset.id;
                const workerData = appState.workers.find(w => w.id === workerId);
                createModal('editWorker', workerData);
            }));
            $$('.btn-delete-worker').forEach(btn => btn.addEventListener('click', (e) => {
                const workerId = e.currentTarget.dataset.id;
                createModal('confirmDelete', {
                    title: 'Hapus Pekerja',
                    message: `Anda yakin ingin menghapus pekerja ini?`,
                    onConfirm: () => handleDeleteWorker(workerId)
                });
            }));
            applyRoleVisibility(appState.userRole);

        } catch (error) {
            console.error("Error rendering attendance list:", error);
            container.innerHTML = '<p class="empty-state">Gagal memuat data absensi.</p>';
        }
    }

    async function handleSetAttendance(workerId, status, recordId) {
        toast('loading', 'Menyimpan absensi...');
        try {
            const data = {
                workerId,
                status,
                date: appState.attendanceDate,
                recordedBy: appState.currentUser.email,
                updatedAt: serverTimestamp()
            };
            if (recordId) {
                await setDoc(doc(attendanceCol, recordId), data, { merge: true });
            } else {
                await addDoc(attendanceCol, { ...data, createdAt: serverTimestamp() });
            }
            toast('success', 'Absensi berhasil disimpan.');
            fetchAndRenderAttendanceList();
        } catch (error) {
            toast('error', 'Gagal menyimpan absensi.');
            console.error(error);
        }
    }
    
    async function handleSaveWorker(workerId = null) {
        const isEdit = !!workerId;
        const workerName = $('#worker-name').value.trim();
        const position = $('#worker-position').value.trim();
        const dailyWage = getNumericValue($('#worker-wage').value);
        const projectId = $('#worker-project').value;

        if (!workerName || !position || dailyWage <= 0) {
            toast('error', 'Harap lengkapi semua data pekerja.');
            return;
        }

        const data = { workerName, position, dailyWage, projectId };
        toast('loading', `Menyimpan data pekerja...`);

        try {
            if (isEdit) {
                await updateDoc(doc(workersCol, workerId), data);
            } else {
                await addDoc(workersCol, { ...data, createdAt: serverTimestamp() });
            }
            toast('success', `Data pekerja berhasil ${isEdit ? 'diperbarui' : 'disimpan'}.`);
            closeModal();
            await fetchWorkers();
            fetchAndRenderAttendanceList();
        } catch (error) {
            toast('error', 'Gagal menyimpan data pekerja.');
            console.error(error);
        }
    }
    
    async function handleDeleteWorker(workerId) {
        toast('loading', 'Menghapus pekerja...');
        try {
            await deleteDoc(doc(workersCol, workerId));
            toast('success', 'Pekerja berhasil dihapus.');
            await fetchWorkers();
            fetchAndRenderAttendanceList();
        } catch (error) {
            toast('error', 'Gagal menghapus pekerja.');
            console.error(error);
        }
    }
    
    // ===== START: FITUR MANAJEMEN STOK MATERIAL =====
    async function renderManajemenStokPage(container) {
        container.innerHTML = `<div class="section-head"><h4>Manajemen Stok Material</h4></div><div class="card card-pad"><div class="toolbar"><button id="add-stock-item-btn" class="btn btn-primary" data-role="Admin,Editor"><span class="material-symbols-outlined">add</span>Tambah Master Material</button><button id="record-usage-btn" class="btn btn-secondary" data-role="Admin,Editor"><span class="material-symbols-outlined">outbound</span>Catat Penggunaan</button></div></div><div id="stock-list-container" class="card card-pad" style="margin-top:1.5rem;"><h5 class="form-section-title">Daftar Stok Material</h5><p>Memuat data...</p></div><div id="stock-history-container" class="card card-pad" style="margin-top:1.5rem;"><h5 class="form-section-title">Riwayat Transaksi Stok</h5><p>Memuat data...</p></div>`;

        $('#add-stock-item-btn').addEventListener('click', () => createModal('newStockItem'));
        $('#record-usage-btn').addEventListener('click', () => {
            if (appState.stockItems.length === 0) {
                toast('error', 'Tambah master material terlebih dahulu.');
                return;
            }
            createModal('recordStockUsage');
        });

        fetchAndRenderStockList();
        fetchAndRenderStockHistory();
    }

    async function fetchAndRenderStockList() {
        const container = $('#stock-list-container');
        try {
            const snap = await getDocs(query(stockItemsCol, orderBy("itemName")));
            appState.stockItems = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (appState.stockItems.length === 0) {
                container.innerHTML = '<h5 class="form-section-title">Daftar Stok Material</h5><p class="empty-state">Belum ada master material.</p>';
                return;
            }
            container.innerHTML = `<h5 class="form-section-title">Daftar Stok Material</h5><table class="table"><thead><tr><th>Nama Material</th><th>Sisa Stok</th><th>Satuan</th><th>Aksi</th></tr></thead><tbody>
                ${appState.stockItems.map(item => `
                    <tr>
                        <td>${item.itemName}</td>
                        <td><strong>${item.currentStock || 0}</strong></td>
                        <td>${item.unit}</td>
                        <td class="action-cell">
                           <button class="icon-btn btn-edit-stock-item" data-id="${item.id}" data-role="Admin,Editor"><span class="material-symbols-outlined">edit</span></button>
                           <button class="icon-btn btn-delete-stock-item" data-id="${item.id}" data-role="Admin"><span class="material-symbols-outlined">delete</span></button>
                        </td>
                    </tr>
                `).join('')}
            </tbody></table>`;
            
            $$('.btn-edit-stock-item').forEach(btn => btn.addEventListener('click', (e) => {
                const itemId = e.currentTarget.dataset.id;
                const itemData = appState.stockItems.find(i => i.id === itemId);
                createModal('editStockItem', itemData);
            }));
            $$('.btn-delete-stock-item').forEach(btn => btn.addEventListener('click', (e) => {
                const itemId = e.currentTarget.dataset.id;
                 createModal('confirmDelete', {
                    title: 'Hapus Master Material',
                    message: 'Menghapus ini hanya akan menghapus master datanya, riwayat transaksi tidak akan hilang. Anda yakin?',
                    onConfirm: () => handleDeleteStockItem(itemId)
                });
            }));
            applyRoleVisibility(appState.userRole);
        } catch (error) {
            console.error("Error fetching stock list:", error);
            container.innerHTML = `<h5 class="form-section-title">Daftar Stok Material</h5><p class="empty-state">Gagal memuat data.</p>`;
        }
    }

    async function fetchAndRenderStockHistory() {
        const container = $('#stock-history-container');
        try {
            const q = query(stockTransactionsCol, orderBy("date", "desc"), limit(20));
            const snap = await getDocs(q);
            const transactions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

            if (transactions.length === 0) {
                container.innerHTML = `<h5 class="form-section-title">Riwayat Transaksi Stok</h5><p class="empty-state">Belum ada riwayat transaksi.</p>`;
                return;
            }

            container.innerHTML = `<h5 class="form-section-title">Riwayat Transaksi Stok</h5><table class="table"><thead><tr><th>Tanggal</th><th>Nama Material</th><th>Tipe</th><th>Jumlah</th><th>Keterangan</th></tr></thead><tbody>
                ${transactions.map(t => `
                    <tr>
                        <td>${t.date.toDate().toLocaleString('id-ID')}</td>
                        <td>${t.itemName}</td>
                        <td><span class="badge ${t.type === 'masuk' ? 'badge--green' : 'badge--orange'}">${t.type}</span></td>
                        <td>${t.quantity}</td>
                        <td>${t.notes || '-'}</td>
                    </tr>
                `).join('')}
            </tbody></table>`;

        } catch (error) {
            console.error("Error fetching stock history:", error);
            container.innerHTML = `<h5 class="form-section-title">Riwayat Transaksi Stok</h5><p class="empty-state">Gagal memuat riwayat.</p>`;
        }
    }

    async function handleSaveStockItem(itemId = null) {
        const isEdit = !!itemId;
        const itemName = $('#stock-item-name').value.trim();
        const unit = $('#stock-item-unit').value.trim();
        if (!itemName || !unit) {
            toast('error', 'Nama dan satuan material harus diisi.');
            return;
        }
        toast('loading', `Menyimpan master material...`);
        try {
            if (isEdit) {
                await updateDoc(doc(stockItemsCol, itemId), { itemName, unit });
            } else {
                await addDoc(stockItemsCol, { itemName, unit, currentStock: 0, createdAt: serverTimestamp() });
            }
            toast('success', `Master material berhasil disimpan.`);
            closeModal();
            fetchAndRenderStockList();
        } catch(error) {
            toast('error', 'Gagal menyimpan master material.');
            console.error(error);
        }
    }
    
    async function handleDeleteStockItem(itemId) {
        toast('loading', 'Menghapus master material...');
        try {
            await deleteDoc(doc(stockItemsCol, itemId));
            toast('success', 'Master material dihapus.');
            fetchAndRenderStockList();
        } catch(error) {
            toast('error', 'Gagal menghapus.');
            console.error(error);
        }
    }

    async function handleRecordStockUsage(e) {
        e.preventDefault();
        const itemId = $('#usage-item').value;
        const quantity = parseFloat($('#usage-qty').value);
        const date = new Date($('#usage-date').value);
        const notes = $('#usage-notes').value.trim();

        if (!itemId || isNaN(quantity) || quantity <= 0) {
            toast('error', 'Harap isi semua data penggunaan dengan benar.');
            return;
        }

        toast('loading', 'Mencatat penggunaan...');
        try {
            await runTransaction(db, async (transaction) => {
                const itemRef = doc(stockItemsCol, itemId);
                const itemDoc = await transaction.get(itemRef);
                if (!itemDoc.exists()) throw "Master material tidak ditemukan!";

                const currentStock = itemDoc.data().currentStock || 0;
                if (currentStock < quantity) {
                    throw `Stok tidak mencukupi. Sisa stok: ${currentStock}.`;
                }

                transaction.update(itemRef, { currentStock: currentStock - quantity });
                const transRef = doc(collection(db, stockTransactionsCol.path));
                transaction.set(transRef, {
                    stockItemId: itemId, itemName: itemDoc.data().itemName,
                    type: 'keluar', quantity, date: Timestamp.fromDate(date),
                    notes, recordedBy: appState.currentUser.email
                });
            });

            toast('success', 'Penggunaan stok berhasil dicatat.');
            closeModal();
            fetchAndRenderStockList();
            fetchAndRenderStockHistory();

        } catch (error) {
            toast('error', `Gagal: ${error.toString()}`);
            console.error(error);
        }
    }
    
    // ===== START: FITUR LAPORAN PROFESIONAL =====
    async function renderLaporanPage(container) {
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        container.innerHTML = `
            <div class="section-head"><h4>Laporan Profesional</h4></div>
            <div class="card card-pad">
                <div class="toolbar">
                    <div class="form-group"><label>Dari Tanggal</label><input type="date" id="report-start-date" value="${firstDayOfMonth.toISOString().slice(0,10)}"></div>
                    <div class="form-group"><label>Sampai Tanggal</label><input type="date" id="report-end-date" value="${today.toISOString().slice(0,10)}"></div>
                    <button id="generate-report-btn" class="btn btn-primary">Tampilkan Laporan</button>
                </div>
            </div>
            <div id="report-content" style="margin-top: 1.5rem;">
                <div class="placeholder-card"><div class="placeholder-title">Pilih Rentang Tanggal</div><div class="placeholder-desc">Pilih tanggal mulai dan selesai, lalu klik "Tampilkan Laporan" untuk melihat data.</div></div>
            </div>`;
            
        $('#generate-report-btn').addEventListener('click', generateReports);
    }
    
    async function generateReports() {
        const startDate = new Date($('#report-start-date').value);
        const endDate = new Date($('#report-end-date').value);
        endDate.setHours(23, 59, 59, 999); // Set to end of day

        if (startDate > endDate) {
            toast('error', 'Tanggal mulai tidak boleh melebihi tanggal selesai.');
            return;
        }

        toast('loading', 'Membuat laporan...');
        const contentContainer = $('#report-content');
        contentContainer.innerHTML = `<div class="card card-pad"><div class="skeleton" style="height:200px"></div></div>`;
        
        try {
            // Fetch all necessary data within the date range
            const qInvoices = query(invoicesCol, where("date", ">=", startDate), where("date", "<=", endDate));
            const qFunding = query(fundingSourcesCol, where("date", ">=", startDate), where("date", "<=", endDate));
            
            const [invoiceSnap, fundingSnap] = await Promise.all([getDocs(qInvoices), getDocs(qFunding)]);
            const invoices = invoiceSnap.docs.map(d => d.data());
            const fundings = fundingSnap.docs.map(d => d.data());
            
            renderReportUI(contentContainer, invoices, fundings);
            toast('success', 'Laporan berhasil dibuat.');

        } catch (error) {
            console.error("Error generating reports:", error);
            toast('error', 'Gagal membuat laporan.');
            contentContainer.innerHTML = `<div class="card card-pad card--danger"><h4>Gagal Memuat Laporan</h4></div>`;
        }
    }
    
    function renderReportUI(container, invoices, fundings) {
        // 1. Cash Flow
        const totalIncome = fundings.reduce((sum, item) => sum + item.amount, 0);
        const totalExpense = invoices.reduce((sum, item) => sum + item.totalAmount, 0);
        const netCashFlow = totalIncome - totalExpense;

        // 2. Expense Analysis
        const expenseByCategory = invoices.reduce((acc, inv) => {
            acc[inv.category] = (acc[inv.category] || 0) + inv.totalAmount;
            return acc;
        }, {});
        const categoryLabels = Object.keys(expenseByCategory);
        const categoryData = Object.values(expenseByCategory);
        
        // 3. Debt Recap
        const unpaidInvoices = invoices.filter(inv => !inv.isFullyPaid);
        const totalDebt = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalAmount - inv.amountPaid), 0);

        container.innerHTML = `
            <div class="dashboard-grid">
                <!-- Laporan Arus Kas -->
                <div class="dashboard-widget">
                    <h5 class="widget-title">Laporan Arus Kas</h5>
                    <div class="payment-details">
                        <div class="payment-detail-item"><span>Total Pemasukan</span><strong class="debit-amount">${fmtIDR(totalIncome)}</strong></div>
                        <div class="payment-detail-item"><span>Total Pengeluaran</span><strong class="credit-amount">${fmtIDR(totalExpense)}</strong></div>
                    </div>
                    <div class="payment-summary" style="margin-top:0;"><span>Arus Kas Bersih</span><strong style="color: ${netCashFlow >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmtIDR(netCashFlow)}</strong></div>
                </div>
                <!-- Analisis Pengeluaran -->
                <div class="dashboard-widget">
                    <h5 class="widget-title">Analisis Pengeluaran per Kategori</h5>
                    <div class="chart-container" style="height: 200px;">
                        <canvas id="expense-chart"></canvas>
                    </div>
                </div>
                 <!-- Rekap Hutang -->
                <div class="dashboard-widget">
                    <h5 class="widget-title">Rekapitulasi Hutang</h5>
                    <div class="widget-main-value">${fmtIDR(totalDebt)}</div>
                    <p class="widget-sub-text">Dari total <strong>${unpaidInvoices.length}</strong> faktur yang belum lunas pada periode ini.</p>
                </div>
            </div>
            <!-- Detail Pengeluaran -->
            <div class="card card-pad" style="margin-top: 1.5rem;">
                 <h5 class="form-section-title">Detail Transaksi Pengeluaran</h5>
                 ${invoices.length > 0 ? `
                 <div class="table-container">
                    <table class="table">
                        <thead><tr><th>Tanggal</th><th>No. Faktur</th><th>Kreditur</th><th>Kategori</th><th class="text-right">Jumlah</th></tr></thead>
                        <tbody>
                            ${invoices.map(inv => `
                                <tr>
                                    <td>${inv.date.toDate().toLocaleDateString('id-ID')}</td>
                                    <td>${inv.invoiceNumber}</td>
                                    <td>${inv.creditorName}</td>
                                    <td><span class="badge">${inv.category}</span></td>
                                    <td class="text-right credit-amount">${fmtIDR(inv.totalAmount)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                 </div>
                 ` : '<p class="empty-state">Tidak ada data pengeluaran pada periode ini.</p>'}
            </div>
        `;

        // Render Chart
        const ctx = document.getElementById('expense-chart')?.getContext('2d');
        if (ctx) {
            if(appState.reports.expenseChart) appState.reports.expenseChart.destroy();
            appState.reports.expenseChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: categoryLabels,
                    datasets: [{
                        label: 'Pengeluaran',
                        data: categoryData,
                        backgroundColor: ['#3b82f6', '#ef4444', '#f59e0b', '#22c55e'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true, maintainAspectRatio: false,
                    plugins: { legend: { position: 'bottom', labels: { boxWidth: 12, padding: 15 } } }
                }
            });
        }
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
                ${members.map(member => `<div class="member-card-pro"><img src="${member.photoURL||`https://placehold.co/50x50/e2e8f0/64748b?text=${(member.name||'U')[0]}`}" alt="Avatar" class="member-card-pro__avatar" /><div class="member-card-pro__info"><strong class="member-card-pro__name">${member.name||'N/A'}</strong><span class="member-card-pro__email">${member.email}</span></div><div class="member-card-pro__role"><span class="badge">${member.role}</span></div><div class="member-card-pro__actions">${(appState.userRole==='Owner'&&member.email!==OWNER_EMAIL)||(appState.userRole==='Admin'&&member.role!=='Owner')?`<button class="icon-btn action-menu-btn" data-userid="${member.id}"><span class="material-symbols-outlined">more_vert</span></button><div class="actions-dropdown hidden" id="actions-for-${member.id}"><div class="form-group"><label>Ubah Peran</label><div id="role-select-${member.id}" class="custom-select-wrapper"><select class="role-select" data-userid="${member.id}"><option value="Pending" ${member.role==='Pending'?'selected':''}>Pending</option><option value="Viewer" ${member.role==='Viewer'?'selected':''}>Viewer</option><option value="Editor" ${member.role==='Editor'?'selected':''}>Editor</option>${appState.userRole==='Owner'?`<option value="Admin" ${member.role==='Admin'?'selected':''}>Admin</option>`:''}</select></div></div><button class="btn btn-danger btn-sm btn-remove-member" data-userid="${member.id}" data-name="${member.name}">Hapus Anggota</button></div>`:''}</div></div>`).join('')}
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
                const customSelect = createCustomSelect(select); // PEMBARUAN DI SINI
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
                    createModal('confirmDelete', {
                        title: 'Hapus Anggota',
                        message: `Anda yakin ingin menghapus ${name} dari tim?`,
                        onConfirm: () => handleDeleteMember(userId)
                    });
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
    
    // ===== FITUR AUTOCOMPLETE =====
    async function fetchItemNameSuggestions() {
        if (appState.cachedSuggestions.itemNames.size > 0) return;
        try {
            const q = query(invoicesCol, limit(100));
            const snap = await getDocs(q);
            const itemNames = new Set();
            snap.forEach(doc => {
                doc.data().items.forEach(item => itemNames.add(item.itemName));
            });
            appState.cachedSuggestions.itemNames = itemNames;
        } catch (error) { console.error("Error fetching item suggestions:", error); }
    }
    
    function showAutocomplete(inputElement) {
        const listEl = $('#autocomplete-list');
        const value = inputElement.value.toLowerCase();
        listEl.innerHTML = '';
        if (!value) return;

        const suggestions = Array.from(appState.cachedSuggestions.itemNames)
            .filter(item => item.toLowerCase().includes(value));
            
        suggestions.forEach(item => {
            const itemEl = document.createElement('div');
            itemEl.textContent = item;
            itemEl.addEventListener('click', () => {
                inputElement.value = item;
                listEl.innerHTML = '';
            });
            listEl.appendChild(itemEl);
        });
    }

    // ===== Inisialisasi Aplikasi =====
    function init() {
        injectPageTemplates();
        const { sidebar, scrim, openNavBtn, themeToggleBtn, userProfileBtn, notificationBtn, authBtn, authDropdownBtn, searchBtn } = getUIElements();
        
        searchBtn.addEventListener('click', () => createModal('globalSearch'));
        
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
            
            const isClickInsideActionMenu = e.target.closest('.member-card-pro__actions');
            if (!isClickInsideActionMenu) {
                $$('.actions-dropdown').forEach(d => d.classList.add('hidden'));
            }
            
            // PEMBARUAN: Menutup semua custom select pop-up
            if (!e.target.closest('.custom-select-wrapper')) {
                $$('.custom-select-wrapper.open').forEach(wrapper => wrapper.classList.remove('open'));
            }
        });

        $$('.nav-item[data-nav]').forEach(btn => {
            btn.addEventListener('click', () => {
                appState.activePage = btn.dataset.nav;
                localStorage.setItem('lastActivePage', appState.activePage);
                renderUI();
                if (window.innerWidth < 901) closeSidebar();
            });
        });
    }

    function handleGlobalSearch(e) {
        const query = e.target.value.toLowerCase();
        const resultsContainer = $('#search-results');
        const navItems = [
            { id: 'dashboard', title: 'Dashboard', icon: 'dashboard' },
            { id: 'pemasukan-pinjaman', title: 'Pemasukan & Pinjaman', icon: 'account_balance_wallet' },
            { id: 'alokasi-anggaran', title: 'Alokasi Anggaran', icon: 'savings' },
            { id: 'input-data', title: 'Input Pengeluaran', icon: 'edit_document' },
            { id: 'tagihan', title: 'Manajemen Tagihan', icon: 'receipt_long' },
            { id: 'absensi', title: 'Absensi Pekerja', icon: 'person_check' },
            { id: 'manajemen-stok', title: 'Manajemen Stok', icon: 'inventory_2' },
            { id: 'laporan', title: 'Laporan Profesional', icon: 'monitoring' },
            { id: 'pengaturan', title: 'Pengaturan Tim', icon: 'group' },
        ];
        
        const filteredItems = navItems.filter(item => item.title.toLowerCase().includes(query));
        
        if(filteredItems.length > 0) {
            resultsContainer.innerHTML = filteredItems.map(item => 
                `<button class="search-result-item" data-nav="${item.id}">
                    <span class="material-symbols-outlined">${item.icon}</span>
                    <span>${item.title}</span>
                </button>`
            ).join('');
            
            resultsContainer.querySelectorAll('.search-result-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    appState.activePage = btn.dataset.nav;
                    localStorage.setItem('lastActivePage', appState.activePage);
                    renderUI();
                    closeModal();
                });
            });
        } else {
            resultsContainer.innerHTML = `<p class="empty-state">Tidak ada halaman yang cocok dengan "${query}".</p>`;
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
        const pages = ['dashboard', 'pemasukan-pinjaman', 'alokasi-anggaran', 'input-data', 'absensi', 'tagihan', 'manajemen-stok', 'laporan', 'pengaturan'];
        container.innerHTML = pages.map(id => `<main id="page-${id}" class="page"></main>`).join('');
    }

    init();
});




