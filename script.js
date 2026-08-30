// File: script.js

const SUPABASE_URL = "https://hbqsyfnommdzwwbgsqgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PljrNIdoeriyWPcJHdkmfg_Z5mh5T-F";

const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY) : null;

const state = {
  view: 'dashboard',
  data: {
    employees: [],
    attendances: [],
    payrolls: [],
    shifts: [],
    schedule_changes: [],
    deductions: [],
    overtimes: []
  },
  settings: {},
  auth: null
};

const shiftState = { startDate: new Date(), rangeDays: 7 };
let chartInstances = {};

const menuItems = [
  { id: 'dashboard', icon: 'fa-chart-pie', label: 'Dashboard' },
  { id: 'employee', icon: 'fa-users', label: 'Karyawan' },
  { id: 'shift', icon: 'fa-calendar-days', label: 'Jadwal Shift' },
  { id: 'cuti', icon: 'fa-code-pull-request', label: 'Perubahan Jadwal' },
  { id: 'lembur', icon: 'fa-business-time', label: 'Persetujuan Lembur' },
  { id: 'attendance', icon: 'fa-user-clock', label: 'Absensi' },
  { id: 'potongan', icon: 'fa-file-invoice', label: 'Kasbon & Potongan' },
  { id: 'payroll', icon: 'fa-file-invoice-dollar', label: 'Payroll & Slip' },
  { id: 'settings', icon: 'fa-gear', label: 'Pengaturan' }
];

async function init() {
  if (!supabase) {
    console.error("Supabase SDK gagal dimuat. Periksa koneksi internet.");
    return;
  }

  // Cek sesi autentikasi lokal
  const savedAuth = localStorage.getItem('ara_supabase_auth');
  if (savedAuth) {
    state.auth = JSON.parse(savedAuth);
    launchApp();
  }

  // Supabase Auth Session Listener
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (session && !state.auth) {
      const user = session.user;
      state.auth = {
        success: true,
        role: user.user_metadata?.role || 'Owner',
        name: user.user_metadata?.name || user.email,
        email: user.email,
        auth_id: user.id
      };
      localStorage.setItem('ara_supabase_auth', JSON.stringify(state.auth));
      launchApp();
    }
  });
}

function switchLoginMode(mode) {
  const tabPin = document.getElementById('tabLoginPin');
  const tabAuth = document.getElementById('tabLoginAuth');
  const formPin = document.getElementById('formLoginPin');
  const formAuth = document.getElementById('formLoginAuth');

  if (mode === 'pin') {
    tabPin.className = 'flex-1 py-2 rounded-xl bg-white shadow-sm text-brandText transition-all';
    tabAuth.className = 'flex-1 py-2 rounded-xl text-gray-400 hover:text-brandText transition-all';
    formPin.classList.remove('hidden');
    formAuth.classList.add('hidden');
  } else {
    tabAuth.className = 'flex-1 py-2 rounded-xl bg-white shadow-sm text-brandText transition-all';
    tabPin.className = 'flex-1 py-2 rounded-xl text-gray-400 hover:text-brandText transition-all';
    formAuth.classList.remove('hidden');
    formPin.classList.add('hidden');
  }
}

async function handleLoginPIN(e) {
  e.preventDefault();
  const pin = document.getElementById('loginPin').value;
  if (!pin) return;

  Swal.fire({ title: 'Memverifikasi PIN...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const { data: settingsData } = await supabase.from('app_settings').select('*');
    let settingsMap = {};
    (settingsData || []).forEach(s => { settingsMap[s.key] = s.value; });

    const ownerPin = settingsMap['PIN Owner Default'] || '888888';
    if (pin === ownerPin) {
      finishLogin({ success: true, role: 'Owner', name: 'Owner Ara Beauty', pin: pin });
      return;
    }

    const { data: employees, error } = await supabase
      .from('employees')
      .select('*')
      .eq('pin', pin)
      .eq('status', 'Aktif')
      .limit(1);

    if (error) throw error;

    if (employees && employees.length > 0) {
      const user = employees[0];
      finishLogin({ success: true, role: user.peran || 'Karyawan', name: user.nama, data: user });
    } else {
      Swal.fire('Ditolak', 'PIN tidak terdaftar atau akun dinonaktifkan.', 'error');
    }
  } catch (err) {
    Swal.fire('Error Database', err.message || 'Gagal koneksi ke Supabase', 'error');
  }
}

async function handleLoginAuth(e) {
  e.preventDefault();
  const email = document.getElementById('authEmail').value;
  const password = document.getElementById('authPassword').value;

  Swal.fire({ title: 'Menghubungkan Supabase Auth...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const user = data.user;
    finishLogin({
      success: true,
      role: user.user_metadata?.role || 'Owner',
      name: user.user_metadata?.name || user.email,
      email: user.email,
      auth_id: user.id
    });
  } catch (err) {
    Swal.fire('Login Gagal', err.message, 'error');
  }
}

function finishLogin(res) {
  state.auth = res;
  localStorage.setItem('ara_supabase_auth', JSON.stringify(res));
  Swal.close();
  launchApp();
}

async function logout() {
  if (supabase) await supabase.auth.signOut();
  state.auth = null;
  localStorage.removeItem('ara_supabase_auth');
  document.getElementById('app-owner').classList.add('hidden');
  document.getElementById('app-employee').classList.add('hidden');
  document.getElementById('app-login').classList.remove('hidden');
  document.getElementById('loginPin').value = '';

  if (chartInstances.disiplin) chartInstances.disiplin.destroy();
  if (chartInstances.keuangan) chartInstances.keuangan.destroy();
}

function launchApp() {
  document.getElementById('app-login').classList.add('hidden');
  if (state.auth.role === 'Owner') {
    document.getElementById('app-owner').classList.remove('hidden');
    renderNav();
    document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate);
    switchView('dashboard');
    loadAllData();
  } else {
    document.getElementById('app-employee').classList.remove('hidden');
    document.getElementById('empGreetingName').innerText = state.auth.name;
    loadEmployeeData();
  }
}

async function loadAllData() {
  try {
    const [empRes, attRes, payRes, shiftRes, reqRes, lmbRes, potRes, setRes] = await Promise.all([
      supabase.from('employees').select('*').order('created_at', { ascending: false }),
      supabase.from('attendances').select('*').order('created_at', { ascending: false }),
      supabase.from('payrolls').select('*').order('created_at', { ascending: false }),
      supabase.from('shifts').select('*'),
      supabase.from('schedule_changes').select('*').order('created_at', { ascending: false }),
      supabase.from('overtimes').select('*').order('created_at', { ascending: false }),
      supabase.from('deductions').select('*').order('created_at', { ascending: false }),
      supabase.from('app_settings').select('*')
    ]);

    state.data.employees = empRes.data || [];
    state.data.attendances = attRes.data || [];
    state.data.payrolls = payRes.data || [];
    state.data.shifts = shiftRes.data || [];
    state.data.schedule_changes = reqRes.data || [];
    state.data.overtimes = lmbRes.data || [];
    state.data.deductions = potRes.data || [];

    let settingsObj = {};
    (setRes.data || []).forEach(s => { settingsObj[s.key] = s.value; });
    state.settings = settingsObj;

    populateDropdowns();
    if (state.view === 'dashboard') renderDashboardAnalytics();
    if (state.view === 'employee') renderEmployeeTable();
    if (state.view === 'shift') renderShiftCalendar();
    if (state.view === 'cuti') renderPengajuanOwner();
    if (state.view === 'lembur') renderLemburOwner();
    if (state.view === 'attendance') renderAttendanceTable();
    if (state.view === 'potongan') renderPotonganTable();
    if (state.view === 'payroll') renderPayrollTable();
    if (state.view === 'settings') populateSettingsForm();
  } catch (err) {
    console.error("Error fetching Supabase data:", err);
  }
}

async function loadEmployeeData() {
  await loadAllData();
  renderEmployeeDashboard();
}

function renderNav() {
  const nav = document.getElementById('navMenu');
  if (!nav) return;
  nav.innerHTML = menuItems.map(item => `
    <a href="#" onclick="switchView('${item.id}')" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.view === item.id ? 'bg-brandPink text-white shadow-md font-bold' : 'text-gray-600 hover:bg-brandPink/10 hover:text-brandPink'}">
      <i class="fa-solid ${item.icon} w-5 text-center"></i><span class="text-sm">${item.label}</span>
    </a>
  `).join('');
}

function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  const target = document.getElementById(`view-${viewId}`);
  if (target) target.classList.add('active');
  state.view = viewId;
  renderNav();

  if (viewId === 'dashboard') renderDashboardAnalytics();
  if (viewId === 'employee') renderEmployeeTable();
  if (viewId === 'shift') renderShiftCalendar();
  if (viewId === 'cuti') renderPengajuanOwner();
  if (viewId === 'lembur') renderLemburOwner();
  if (viewId === 'attendance') renderAttendanceTable();
  if (viewId === 'potongan') renderPotonganTable();
  if (viewId === 'payroll') renderPayrollTable();
  if (viewId === 'settings') populateSettingsForm();
}

function renderDashboardAnalytics() {
  if (state.view !== 'dashboard' || state.auth.role !== 'Owner') return;

  const emps = state.data.employees.filter(e => e.status === 'Aktif' && e.peran !== 'Owner');
  const totalAktif = emps.length;

  const todayStr = formatDateToDDMMYYYY(new Date());
  const d = new Date();
  const currentMonthStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const hadirHariIni = state.data.attendances.filter(a => a.tanggal === todayStr && a.status_kehadiran !== 'Alfa').length;
  const pendingReqJadwal = state.data.schedule_changes.filter(r => r.status === 'Pending' || r.status === 'Minta Batal').length;
  const pendingLembur = state.data.overtimes.filter(r => r.status === 'Pending').length;
  const pendingReq = pendingReqJadwal + pendingLembur;

  const cardsContainer = document.getElementById('dashboardCards');
  if (cardsContainer) {
    cardsContainer.innerHTML = `
      <div class="bg-gradient-to-br from-brandText to-gray-800 rounded-3xl p-6 text-white shadow-md relative overflow-hidden transform hover:-translate-y-1 transition-transform">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-white/10 rounded-full blur-xl"></div>
        <div class="flex items-center gap-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm"><i class="fa-solid fa-users"></i></div>
          <div><p class="text-[11px] text-gray-300 font-bold uppercase tracking-wider mb-0.5">Total Karyawan</p><h3 class="text-3xl font-black">${totalAktif} <span class="text-sm font-medium text-gray-400">Aktif</span></h3></div>
        </div>
      </div>
      <div class="bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl p-6 text-white shadow-md relative overflow-hidden transform hover:-translate-y-1 transition-transform">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-white/20 rounded-full blur-xl"></div>
        <div class="flex items-center gap-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm"><i class="fa-solid fa-user-check"></i></div>
          <div><p class="text-[11px] text-emerald-100 font-bold uppercase tracking-wider mb-0.5">Kehadiran Hari Ini</p><h3 class="text-3xl font-black">${hadirHariIni} <span class="text-sm font-medium text-emerald-200">/ ${totalAktif}</span></h3></div>
        </div>
      </div>
      <div class="bg-gradient-to-br from-amber-400 to-amber-500 rounded-3xl p-6 text-white shadow-md relative overflow-hidden transform hover:-translate-y-1 transition-transform">
        <div class="absolute -right-6 -top-6 w-24 h-24 bg-white/20 rounded-full blur-xl"></div>
        <div class="flex items-center gap-4 relative z-10">
          <div class="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center text-xl backdrop-blur-sm"><i class="fa-solid fa-envelope-open-text"></i></div>
          <div><p class="text-[11px] text-amber-100 font-bold uppercase tracking-wider mb-0.5">Menunggu ACC</p><h3 class="text-3xl font-black">${pendingReq} <span class="text-sm font-medium text-amber-200">Tiket</span></h3></div>
        </div>
      </div>
    `;
  }

  let countTepat = 0, countTelat = 0, countAlfa = 0;
  let attThisMonth = state.data.attendances.filter(a => a.tanggal && a.tanggal.includes(currentMonthStr));
  let employeeStats = {};
  emps.forEach(e => { employeeStats[e.nama] = { tepat: 0, telat: 0, alfa: 0, score: 0 }; });

  let totalBebanGajiKotor = 0;
  let totalPotonganDisiplin = 0;

  emps.forEach(emp => {
    const name = emp.nama;
    const gapok = parseFloat(emp.gaji_pokok || 0);
    const tunjangan = parseFloat(emp.tunjangan_kehadiran || 0);
    const upahHarian = gapok / 25;
    const dendaTelat = gapok / 50;

    let empAlfa = 0, empTelat = 0, empSakitOpsiA = 0;

    attThisMonth.forEach(a => {
      if (a.nama_karyawan !== name) return;
      let jamPulang = a.jam_pulang ? a.jam_pulang.trim() : '';
      let isLupaPulang = (jamPulang === '');
      let status = a.status_kehadiran || 'Hadir';
      let subStatus = a.sub_status || '';

      if (status === 'Alfa' || (isLupaPulang && a.tanggal !== todayStr)) {
        countAlfa++; empAlfa++;
        employeeStats[name].alfa++;
        employeeStats[name].score -= 3;
      } else if (status === 'Telat') {
        if (subStatus.includes('Auto Alfa') || subStatus.includes('> 30m')) {
          countAlfa++; empAlfa++;
          employeeStats[name].alfa++;
          employeeStats[name].score -= 3;
        } else if (subStatus.includes('Musibah')) {
          countTepat++; employeeStats[name].tepat++; employeeStats[name].score += 1;
        } else {
          countTelat++; empTelat++;
          employeeStats[name].telat++;
          employeeStats[name].score -= 1;
        }
      } else if (status === 'Sakit') {
        if (subStatus.includes('Opsi A')) empSakitOpsiA++;
      } else {
        countTepat++;
        employeeStats[name].tepat++;
        employeeStats[name].score += 1;
      }
    });

    const isTunjanganHangus = (empAlfa > 0 || empSakitOpsiA > 0);
    const tunjanganCair = isTunjanganHangus ? 0 : tunjangan;
    totalBebanGajiKotor += (gapok + tunjanganCair);

    let potTelatSOP = empTelat * dendaTelat;
    let potAlfaSOP = empAlfa * upahHarian;
    let totalSanksiSOP = potTelatSOP + potAlfaSOP;

    if (totalSanksiSOP > ((gapok + tunjanganCair) / 2)) {
      totalSanksiSOP = ((gapok + tunjanganCair) / 2);
    }
    totalPotonganDisiplin += totalSanksiSOP;
  });

  let totalKasbonBulanIni = 0;
  state.data.deductions.forEach(p => {
    if (p.tanggal && p.tanggal.includes(currentMonthStr)) {
      totalKasbonBulanIni += parseFloat(p.nominal || 0);
    }
  });

  let totalDeduction = totalPotonganDisiplin + totalKasbonBulanIni;

  const ctxDisiplin = document.getElementById('chartDisiplin');
  if (ctxDisiplin) {
    if (chartInstances.disiplin) chartInstances.disiplin.destroy();
    chartInstances.disiplin = new Chart(ctxDisiplin, {
      type: 'doughnut',
      data: {
        labels: ['Tepat Waktu', 'Terlambat', 'Alfa / Lupa Pulang'],
        datasets: [{
          data: [countTepat || 1, countTelat, countAlfa],
          backgroundColor: countTepat + countTelat + countAlfa === 0 ? ['#f3f4f6', '#f3f4f6', '#f3f4f6'] : ['#34d399', '#fbbf24', '#f43f5e'],
          borderWidth: 0,
          hoverOffset: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '75%',
        plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 8, font: { size: 11 } } } }
      }
    });
  }

  const ctxKeuangan = document.getElementById('chartKeuangan');
  if (ctxKeuangan) {
    if (chartInstances.keuangan) chartInstances.keuangan.destroy();
    chartInstances.keuangan = new Chart(ctxKeuangan, {
      type: 'bar',
      data: {
        labels: ['Estimasi Gaji Kotor', 'Total Denda & Kasbon'],
        datasets: [{
          label: 'Rupiah',
          data: [totalBebanGajiKotor, totalDeduction],
          backgroundColor: ['#023047', '#ff8fa3'],
          borderRadius: 6,
          barPercentage: 0.5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (ctx) => 'Rp ' + ctx.raw.toLocaleString('id-ID') } } },
        scales: {
          y: { beginAtZero: true, grid: { color: '#f3f4f6', drawBorder: false }, ticks: { font: { size: 10 }, callback: (v) => 'Rp ' + (v / 1000) + 'K' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  let rankedEmps = Object.keys(employeeStats).map(nama => ({ nama, ...employeeStats[nama] }));
  rankedEmps.sort((a, b) => b.score - a.score);

  const lbTop = document.getElementById('leaderboardTop');
  const lbBot = document.getElementById('leaderboardBottom');

  if (lbTop) {
    let top3 = rankedEmps.slice(0, 3).filter(x => x.score > 0 || x.tepat > 0);
    lbTop.innerHTML = top3.length === 0 ? `<p class="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-2xl border border-gray-100">Belum ada data kedisiplinan bulan ini.</p>` :
      top3.map((x, i) => `
        <div class="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-emerald-200 text-emerald-700 flex items-center justify-center font-black text-xs">#${i + 1}</div>
            <div><p class="text-xs font-bold text-brandText">${x.nama}</p><p class="text-[10px] text-emerald-600 font-semibold"><i class="fa-solid fa-check mr-1"></i>${x.tepat} Tepat Waktu</p></div>
          </div>
          <i class="fa-solid fa-medal text-emerald-400 text-xl"></i>
        </div>
      `).join('');
  }

  if (lbBot) {
    let bot3 = [...rankedEmps].reverse().slice(0, 3).filter(x => x.telat > 0 || x.alfa > 0);
    lbBot.innerHTML = bot3.length === 0 ? `<p class="text-xs text-emerald-500 text-center py-4 bg-emerald-50 rounded-2xl border border-emerald-100 font-bold"><i class="fa-solid fa-party-horn mr-1"></i> Hebat! Belum ada pelanggaran bulan ini.</p>` :
      bot3.map((x) => `
        <div class="flex items-center justify-between p-3 rounded-2xl bg-rose-50 border border-rose-100">
          <div class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center font-black text-xs"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div><p class="text-xs font-bold text-brandText">${x.nama}</p><p class="text-[10px] text-rose-600 font-semibold">${x.telat} Telat, ${x.alfa} Alfa</p></div>
          </div>
        </div>
      `).join('');
  }
}

function renderEmployeeTable() {
  const table = document.getElementById('table-employee');
  if (!table) return;
  const list = state.data.employees.filter(e => e.peran !== 'Owner');

  if (list.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500" colspan="7">Tidak ada data karyawan</td></tr>`;
    return;
  }

  let html = `<thead><tr class="bg-gray-50 border-b border-gray-100">
    <th class="p-4 font-bold text-gray-600">ID</th>
    <th class="p-4 font-bold text-gray-600">Nama</th>
    <th class="p-4 font-bold text-gray-600">Gaji Pokok</th>
    <th class="p-4 font-bold text-gray-600">Tunjangan</th>
    <th class="p-4 font-bold text-gray-600">Utang Hari</th>
    <th class="p-4 font-bold text-gray-600">Status</th>
    <th class="p-4 font-bold text-gray-600 text-center">Aksi</th>
  </tr></thead><tbody>`;

  list.forEach(row => {
    let statusBg = row.status === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
    let utangBadge = row.utang_hari > 0 ? `<span class="text-rose-600 font-bold bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${row.utang_hari} Hari</span>` : `<span class="text-gray-400 font-bold">0</span>`;

    html += `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
      <td class="p-4 font-mono text-xs">${row.id}</td>
      <td class="p-4 font-bold">${row.nama}</td>
      <td class="p-4">Rp ${Number(row.gaji_pokok || 0).toLocaleString('id-ID')}</td>
      <td class="p-4">Rp ${Number(row.tunjangan_kehadiran || 0).toLocaleString('id-ID')}</td>
      <td class="p-4">${utangBadge}</td>
      <td class="p-4"><span class="px-2 py-1 rounded-full text-xs font-bold ${statusBg}">${row.status}</span></td>
      <td class="p-4 text-center">
        <button onclick="editEmployee('${row.id}')" class="text-brandPink bg-brandPink/10 px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 transition-transform"><i class="fa-solid fa-pen-to-square"></i></button>
      </td>
    </tr>`;
  });

  table.innerHTML = html + `</tbody>`;
}

function renderAttendanceTable() {
  const table = document.getElementById('table-attendance');
  if (!table) return;
  const list = state.data.attendances;

  if (list.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500" colspan="8">Tidak ada riwayat absensi</td></tr>`;
    return;
  }

  let html = `<thead><tr class="bg-gray-50 border-b border-gray-100">
    <th class="p-4 font-bold text-gray-600">Tanggal</th>
    <th class="p-4 font-bold text-gray-600">Nama Karyawan</th>
    <th class="p-4 font-bold text-gray-600">Jam Masuk</th>
    <th class="p-4 font-bold text-gray-600">Jam Pulang</th>
    <th class="p-4 font-bold text-gray-600">Status</th>
    <th class="p-4 font-bold text-gray-600">Sub-Status</th>
    <th class="p-4 font-bold text-gray-600">Lokasi</th>
    <th class="p-4 font-bold text-gray-600">Bukti Foto</th>
  </tr></thead><tbody>`;

  list.forEach(row => {
    let mapsLink = row.lokasi_maps ? `<a href="${row.lokasi_maps}" target="_blank" class="text-blue-500 underline text-xs font-bold">Buka Maps</a>` : '-';
    let photoLink = row.foto_absensi ? `<a href="${row.foto_absensi}" target="_blank" class="text-brandPink underline text-xs font-bold">Lihat Foto</a>` : '-';

    html += `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
      <td class="p-4 font-bold">${row.tanggal}</td>
      <td class="p-4">${row.nama_karyawan}</td>
      <td class="p-4 text-emerald-600 font-bold">${row.jam_masuk || '--:--'}</td>
      <td class="p-4 text-rose-500 font-bold">${row.jam_pulang || '--:--'}</td>
      <td class="p-4"><span class="px-2 py-1 bg-gray-100 rounded-lg text-xs font-bold">${row.status_kehadiran}</span></td>
      <td class="p-4 text-xs text-gray-500">${row.sub_status || '-'}</td>
      <td class="p-4">${mapsLink}</td>
      <td class="p-4">${photoLink}</td>
    </tr>`;
  });

  table.innerHTML = html + `</tbody>`;
}

function renderPotonganTable() {
  const table = document.getElementById('table-potongan');
  if (!table) return;
  const list = state.data.deductions;

  let html = `<thead><tr class="bg-gray-50 border-b border-gray-100">
    <th class="p-4 font-bold text-gray-600">Tanggal</th>
    <th class="p-4 font-bold text-gray-600">Nama</th>
    <th class="p-4 font-bold text-gray-600">Jenis</th>
    <th class="p-4 font-bold text-gray-600">Nominal</th>
    <th class="p-4 font-bold text-gray-600">Keterangan</th>
  </tr></thead><tbody>`;

  list.forEach(row => {
    html += `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
      <td class="p-4 font-bold">${row.tanggal}</td>
      <td class="p-4">${row.nama_karyawan}</td>
      <td class="p-4"><span class="px-2 py-1 bg-gray-100 rounded text-xs font-bold">${row.jenis}</span></td>
      <td class="p-4 text-rose-600 font-bold">Rp ${Number(row.nominal || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 text-xs text-gray-500">${row.keterangan}</td>
    </tr>`;
  });

  table.innerHTML = html + `</tbody>`;
}

function renderPayrollTable() {
  const table = document.getElementById('table-payroll');
  if (!table) return;
  const list = state.data.payrolls;

  let html = `<thead><tr class="bg-gray-50 border-b border-gray-100">
    <th class="p-4 font-bold text-gray-600">Periode</th>
    <th class="p-4 font-bold text-gray-600">Karyawan</th>
    <th class="p-4 font-bold text-gray-600">Gaji Pokok</th>
    <th class="p-4 font-bold text-gray-600">Tunjangan</th>
    <th class="p-4 font-bold text-gray-600">Lembur</th>
    <th class="p-4 font-bold text-gray-600">Pot. Telat</th>
    <th class="p-4 font-bold text-gray-600">Pot. Alfa</th>
    <th class="p-4 font-bold text-gray-600">Pot. Lain</th>
    <th class="p-4 font-bold text-gray-600">Total Bersih</th>
    <th class="p-4 font-bold text-gray-600 text-center">Aksi</th>
  </tr></thead><tbody>`;

  list.forEach(row => {
    html += `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
      <td class="p-4 font-bold">${row.periode}</td>
      <td class="p-4 font-bold">${row.nama_karyawan}</td>
      <td class="p-4">Rp ${Number(row.gaji_pokok || 0).toLocaleString('id-ID')}</td>
      <td class="p-4">Rp ${Number(row.tunjangan || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 text-emerald-600 font-bold">+ Rp ${Number(row.uang_lembur || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 text-rose-500">- Rp ${Number(row.potongan_telat || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 text-rose-500">- Rp ${Number(row.potongan_alfa || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 text-rose-500">- Rp ${Number(row.potongan_lain || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 font-black text-brandPink">Rp ${Number(row.total_gaji_bersih || 0).toLocaleString('id-ID')}</td>
      <td class="p-4 text-center">
        <button onclick="showEmpSlipDetail('${row.id}')" class="text-brandPink bg-brandPink/10 px-3 py-1.5 rounded-lg shadow-sm hover:scale-105 transition-transform"><i class="fa-solid fa-print"></i></button>
      </td>
    </tr>`;
  });

  table.innerHTML = html + `</tbody>`;
}

function getShiftForEmp(empProfile, dateStr) {
  if (!empProfile) return 'L';

  let override = state.data.shifts.find(s => s.nama_karyawan === empProfile.nama && s.tanggal === dateStr);
  if (override && override.tipe_shift) {
    let t = override.tipe_shift.toLowerCase();
    if (t.includes('pagi')) return 'P';
    if (t.includes('siang')) return 'S';
    return 'L';
  }

  if (!dateStr) return 'L';
  const parts = dateStr.split('/');
  if (parts.length < 3) return 'L';
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  const dayIndex = d.getDay();
  const dayMap = { 1: 'shift_sen', 2: 'shift_sel', 3: 'shift_rab', 4: 'shift_kam', 5: 'shift_jum', 6: 'shift_sab', 0: 'shift_min' };
  return empProfile[dayMap[dayIndex]] || 'L';
}

function renderShiftCalendar() {
  const table = document.getElementById('table-shift');
  if (!table) return;

  const emps = state.data.employees.filter(e => e.status === 'Aktif' && e.peran !== 'Owner');
  if (emps.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500">Belum ada karyawan aktif</td></tr>`;
    return;
  }

  const startDate = new Date(shiftState.startDate);
  const range = shiftState.rangeDays || 7;
  const minPagi = parseInt(state.settings['Min Staff Pagi'] || 2);
  const minSiang = parseInt(state.settings['Min Staff Siang'] || 2);

  let dates = [];
  for (let i = 0; i < range; i++) {
    let d = new Date(startDate);
    d.setDate(d.getDate() + i);
    dates.push(d);
  }

  let shiftCounts = {};
  dates.forEach(d => {
    let dateStr = formatDateToDDMMYYYY(d);
    shiftCounts[dateStr] = { P: 0, S: 0, L: 0 };
    emps.forEach(emp => {
      let code = getShiftForEmp(emp, dateStr);
      if (code === 'P') shiftCounts[dateStr].P++;
      if (code === 'S') shiftCounts[dateStr].S++;
      if (code === 'L') shiftCounts[dateStr].L++;
    });
  });

  const hariList = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  let thead = `<thead><tr class="bg-gray-50 border-b border-gray-100 shadow-sm">
    <th class="p-4 font-bold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[150px]">Nama Karyawan</th>`;

  dates.forEach(d => {
    let dateStr = formatDateToDDMMYYYY(d);
    let dayName = hariList[d.getDay()];
    let count = shiftCounts[dateStr];
    let isWarning = count.P < minPagi || count.S < minSiang;
    let warningIcon = isWarning ? `<i class="fa-solid fa-circle-exclamation text-rose-500 animate-pulse ml-1 text-sm"></i>` : `<i class="fa-solid fa-circle-check text-emerald-400 ml-1 text-sm"></i>`;

    thead += `<th class="p-3 text-center min-w-[100px] border-l border-gray-100 cursor-pointer hover:bg-gray-100" onclick="showShiftWarningModal('${dateStr}', '${dayName}', ${count.P}, ${minPagi}, ${count.S}, ${minSiang})">
      <div class="text-[10px] text-gray-400 uppercase">${dayName}</div>
      <div class="text-sm font-black flex items-center justify-center">${d.getDate()}/${d.getMonth() + 1} ${warningIcon}</div>
    </th>`;
  });
  thead += `</tr></thead><tbody>`;

  emps.forEach(emp => {
    thead += `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
      <td class="p-4 font-bold sticky left-0 bg-white z-10">${emp.nama}</td>`;

    dates.forEach(d => {
      let dateStr = formatDateToDDMMYYYY(d);
      let currentCode = getShiftForEmp(emp, dateStr);
      let bgSelect = currentCode === 'P' ? 'bg-emerald-50 text-emerald-700 font-bold' : currentCode === 'S' ? 'bg-amber-50 text-amber-700 font-bold' : 'bg-rose-50 text-rose-700 font-bold';

      thead += `<td class="p-2 border-l border-gray-50 text-center">
        <select onchange="updateShiftByOwner('${emp.nama}', '${dateStr}', this.value)" class="w-full text-xs p-2 rounded-xl border text-center ${bgSelect}">
          <option value="P" ${currentCode === 'P' ? 'selected' : ''}>Pagi</option>
          <option value="S" ${currentCode === 'S' ? 'selected' : ''}>Siang</option>
          <option value="L" ${currentCode === 'L' ? 'selected' : ''}>Libur</option>
        </select>
      </td>`;
    });
    thead += `</tr>`;
  });

  table.innerHTML = thead + `</tbody>`;
}

async function updateShiftByOwner(empName, dateStr, newCode) {
  Swal.fire({ title: 'Menyimpan Jadwal...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  let shiftText = newCode === 'P' ? 'Pagi' : (newCode === 'S' ? 'Siang' : 'Libur');

  try {
    const { data: existing } = await supabase
      .from('shifts')
      .select('id')
      .eq('nama_karyawan', empName)
      .eq('tanggal', dateStr);

    if (existing && existing.length > 0) {
      await supabase.from('shifts').update({ tipe_shift: shiftText }).eq('id', existing[0].id);
    } else {
      await supabase.from('shifts').insert([{ nama_karyawan: empName, tanggal: dateStr, tipe_shift: shiftText }]);
    }

    Swal.close();
    loadAllData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function shiftNavPrev() { shiftState.startDate.setDate(shiftState.startDate.getDate() - shiftState.rangeDays); document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate); renderShiftCalendar(); }
function shiftNavToday() { shiftState.startDate = new Date(); document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate); renderShiftCalendar(); }
function shiftNavNext() { shiftState.startDate.setDate(shiftState.startDate.getDate() + shiftState.rangeDays); document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate); renderShiftCalendar(); }
function onShiftDateChange(val) { if (val) { shiftState.startDate = new Date(val); renderShiftCalendar(); } }
function setShiftRange(days) {
  shiftState.rangeDays = days;
  document.getElementById('btnRange7').className = days === 7 ? 'px-3 py-1 rounded-lg font-bold bg-white shadow-sm text-brandText border border-gray-100' : 'px-3 py-1 rounded-lg font-bold text-gray-400 hover:text-brandText';
  document.getElementById('btnRange14').className = days === 14 ? 'px-3 py-1 rounded-lg font-bold bg-white shadow-sm text-brandText border border-gray-100' : 'px-3 py-1 rounded-lg font-bold text-gray-400 hover:text-brandText';
  renderShiftCalendar();
}

function renderPengajuanOwner() {
  const table = document.getElementById('table-cuti');
  if (!table) return;
  let reqs = state.data.schedule_changes;

  if (reqs.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500 font-bold" colspan="6">Tidak ada pengajuan jadwal</td></tr>`;
    return;
  }

  let html = `<thead><tr class="bg-gray-50 border-b border-gray-100">
    <th class="p-4 font-bold text-gray-600">ID</th>
    <th class="p-4 font-bold text-gray-600">Karyawan</th>
    <th class="p-4 font-bold text-gray-600">Jenis</th>
    <th class="p-4 font-bold text-gray-600">Detail</th>
    <th class="p-4 font-bold text-gray-600">Alasan</th>
    <th class="p-4 font-bold text-gray-600 text-center">Status & Aksi</th>
  </tr></thead><tbody>`;

  reqs.forEach(r => {
    let detail = r.jenis === 'Tukar Hari Libur' ? `Libur ${r.tgl_1} ➔ ${r.tgl_2}` : `${r.tgl_1} ➔ Shift ${r.shift_tujuan === 'P' ? 'Pagi' : 'Siang'}`;
    let bgStatus = r.status === 'Disetujui' ? 'bg-emerald-100 text-emerald-700' : r.status.includes('Tolak') ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';

    let aksi = (r.status === 'Pending' || r.status === 'Minta Batal') ? `
      <div class="mt-2 flex justify-center gap-2">
        <button onclick="processScheduleReq('${r.id}', 'Disetujui')" class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold border border-emerald-200"><i class="fa-solid fa-check mr-1"></i>ACC</button>
        <button onclick="processScheduleReq('${r.id}', 'Ditolak')" class="bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-xs font-bold border border-rose-200"><i class="fa-solid fa-xmark mr-1"></i>Tolak</button>
      </div>` : '';

    html += `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
      <td class="p-4 font-mono text-xs">${r.id}</td>
      <td class="p-4 font-bold">${r.nama_karyawan}</td>
      <td class="p-4"><span class="bg-gray-100 px-2 py-1 rounded text-xs font-bold">${r.jenis}</span></td>
      <td class="p-4 text-xs font-semibold">${detail}</td>
      <td class="p-4 text-xs text-gray-500 italic">"${r.alasan}"</td>
      <td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${bgStatus}">${r.status}</span>${aksi}</td>
    </tr>`;
  });

  table.innerHTML = html + `</tbody>`;
}

async function processScheduleReq(id, newStatus) {
  Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    await supabase.from('schedule_changes').update({ status: newStatus }).eq('id', id);
    Swal.fire('Sukses', `Status pengajuan diperbarui menjadi ${newStatus}`, 'success');
    loadAllData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function renderLemburOwner() {
  const table = document.getElementById('table-lembur');
  if (!table) return;
  let reqs = state.data.overtimes;

  if (reqs.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500 font-bold" colspan="6">Tidak ada pengajuan lembur</td></tr>`;
    return;
  }

  let html = `<thead><tr class="bg-gray-50 border-b border-gray-100">
    <th class="p-4 font-bold text-gray-600">ID</th>
    <th class="p-4 font-bold text-gray-600">Karyawan</th>
    <th class="p-4 font-bold text-gray-600">Tanggal</th>
    <th class="p-4 font-bold text-gray-600">Durasi</th>
    <th class="p-4 font-bold text-gray-600">Keterangan</th>
    <th class="p-4 font-bold text-gray-600 text-center">Status & Aksi</th>
  </tr></thead><tbody>`;

  reqs.forEach(r => {
    let bgStatus = r.status === 'Disetujui' ? 'bg-emerald-100 text-emerald-700' : r.status.includes('Tolak') ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700';
    let aksi = r.status === 'Pending' ? `
      <div class="mt-2 flex justify-center gap-2">
        <button onclick="processOvertimeReq('${r.id}', 'Disetujui')" class="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-lg text-xs font-bold border border-emerald-200"><i class="fa-solid fa-check mr-1"></i>ACC</button>
        <button onclick="processOvertimeReq('${r.id}', 'Ditolak')" class="bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-xs font-bold border border-rose-200"><i class="fa-solid fa-xmark mr-1"></i>Tolak</button>
      </div>` : '';

    html += `<tr class="border-b border-gray-50 hover:bg-gray-50/50">
      <td class="p-4 font-mono text-xs">${r.id}</td>
      <td class="p-4 font-bold">${r.nama_karyawan}</td>
      <td class="p-4">${r.tanggal}</td>
      <td class="p-4 font-bold text-brandPink">${r.durasi_jam} Jam</td>
      <td class="p-4 text-xs text-gray-500 italic">"${r.keterangan}"</td>
      <td class="p-4 text-center"><span class="px-3 py-1 rounded-full text-[10px] font-black uppercase ${bgStatus}">${r.status}</span>${aksi}</td>
    </tr>`;
  });

  table.innerHTML = html + `</tbody>`;
}

async function processOvertimeReq(id, newStatus) {
  Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    await supabase.from('overtimes').update({ status: newStatus }).eq('id', id);
    Swal.fire('Sukses', `Lembur berhasil di-${newStatus}`, 'success');
    loadAllData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function renderEmployeeDashboard() {
  const me = state.auth.name;
  const myProfile = state.data.employees.find(e => e.nama === me) || {};
  const gajiPokok = parseFloat(myProfile.gaji_pokok || 0);
  const tunjanganDatabase = parseFloat(myProfile.tunjangan_kehadiran || 0);
  const utangHari = parseInt(myProfile.utang_hari || 0);

  const utangBadge = document.getElementById('empUtangHariBadge');
  if (utangBadge) {
    if (utangHari > 0) {
      utangBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation mr-1"></i> Utang: ${utangHari} Hari`;
      utangBadge.classList.remove('hidden');
    } else {
      utangBadge.classList.add('hidden');
    }
  }

  const d = new Date();
  const currentMonthStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  const todayStr = formatDateToDDMMYYYY(new Date());
  let myAtt = state.data.attendances.filter(a => a.nama_karyawan === me && a.tanggal && a.tanggal.includes(currentMonthStr));

  let countTelat = 0, countAlfa = 0, countSakitOpsiA = 0;
  let todayAtt = null;

  myAtt.forEach(a => {
    if (a.tanggal === todayStr) todayAtt = a;
    let jamPulang = a.jam_pulang ? a.jam_pulang.trim() : '';
    let isLupaPulang = (jamPulang === '');
    let status = a.status_kehadiran || 'Hadir';
    let subStatus = a.sub_status || '';

    if (status === 'Alfa' || (isLupaPulang && a.tanggal !== todayStr)) {
      countAlfa++;
    } else if (status === 'Telat') {
      if (subStatus.includes('Auto Alfa') || subStatus.includes('> 30m')) countAlfa++;
      else if (!subStatus.includes('Musibah')) countTelat++;
    } else if (status === 'Sakit') {
      if (subStatus.includes('Opsi A')) countSakitOpsiA++;
    }
  });

  const formWrapper = document.getElementById('formAbsensiWrapper');
  const completedState = document.getElementById('absenCompletedState');
  const lblMasuk = document.getElementById('lblAbsenMasuk');
  const lblPulang = document.getElementById('lblAbsenPulang');
  const radioMasuk = document.getElementById('radioMasuk');
  const radioPulang = document.getElementById('radioPulang');

  if (formWrapper && completedState && lblMasuk && lblPulang) {
    if (!todayAtt) {
      formWrapper.classList.remove('hidden');
      completedState.classList.add('hidden');
      lblMasuk.classList.remove('hidden');
      lblPulang.classList.add('hidden');
      if (radioMasuk) radioMasuk.checked = true;
    } else {
      let jamPulang = todayAtt.jam_pulang ? todayAtt.jam_pulang.trim() : '';
      if (jamPulang === '') {
        formWrapper.classList.remove('hidden');
        completedState.classList.add('hidden');
        lblMasuk.classList.add('hidden');
        lblPulang.classList.remove('hidden');
        if (radioPulang) radioPulang.checked = true;
      } else {
        formWrapper.classList.add('hidden');
        completedState.classList.remove('hidden');
      }
    }
  }

  let totalPotonganLain = 0;
  state.data.deductions.filter(p => p.nama_karyawan === me && p.tanggal && p.tanggal.includes(currentMonthStr)).forEach(p => {
    totalPotonganLain += parseFloat(p.nominal || 0);
  });

  let totalJamLembur = 0;
  state.data.overtimes.filter(l => l.nama_karyawan === me && l.tanggal && l.tanggal.includes(currentMonthStr) && l.status === 'Disetujui').forEach(l => {
    totalJamLembur += parseFloat(l.durasi_jam || 0);
  });
  let bonusLembur = totalJamLembur * (gajiPokok / 250);

  const isTunjanganHangus = (countAlfa > 0 || countSakitOpsiA > 0);
  const tunjanganCair = isTunjanganHangus ? 0 : tunjanganDatabase;
  const gajiKotor = gajiPokok + tunjanganCair + bonusLembur;

  let potTelatSOP = countTelat * (gajiPokok / 50);
  let potAlfaSOP = countAlfa * (gajiPokok / 25);
  let totalSanksiSOP = potTelatSOP + potAlfaSOP;

  if (totalSanksiSOP > (gajiKotor / 2)) totalSanksiSOP = gajiKotor / 2;
  let totalPotongan = totalSanksiSOP + totalPotonganLain;
  let estGaji = gajiKotor - totalPotongan;

  document.getElementById('empRealtimeSalary').innerText = 'Rp ' + estGaji.toLocaleString('id-ID');
  document.getElementById('empCurrentDeduction').innerText = 'Rp ' + totalPotongan.toLocaleString('id-ID');

  let todayCode = getShiftForEmp(myProfile, todayStr);
  let shiftText = todayCode === 'P' ? '🌅 Pagi' : todayCode === 'S' ? '🌇 Siang' : '🏖️ Libur';
  let shiftColor = todayCode === 'P' ? 'text-emerald-500' : todayCode === 'S' ? 'text-amber-500' : 'text-rose-500';
  document.getElementById('empTodayShift').innerHTML = `<span class="${shiftColor}">${shiftText}</span>`;

  renderJadwalKaryawan(myProfile);
  renderRiwayatAbsensi(myAtt);
  renderPengajuanEmployee();
}

async function submitAbsensi(e) {
  e.preventDefault();
  const namaUser = document.getElementById('empGreetingName').innerText.trim();
  const jenisAbsen = document.querySelector('input[name="jenisAbsen"]:checked').value;
  const photoData = document.getElementById('compressedPhotoData').value;

  if (!photoData) {
    Swal.fire('Foto Wajib', 'Ambil foto selfie di lokasi kerja terlebih dahulu.', 'warning');
    return;
  }

  if (!navigator.geolocation) {
    Swal.fire('Error GPS', 'Perangkat tidak mendukung GPS.', 'error');
    return;
  }

  Swal.fire({ title: 'Memvalidasi Lokasi GPS...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  navigator.geolocation.getCurrentPosition(async (position) => {
    const lat = position.coords.latitude;
    const long = position.coords.longitude;
    const accuracy = position.coords.accuracy;

    if (accuracy > 70) {
      Swal.fire('Sinyal GPS Lemah', `Akurasi terdeteksi ${Math.round(accuracy)}m. Pindah ke area terbuka untuk mencegah Fake GPS.`, 'warning');
      return;
    }

    const latSalon = parseFloat(state.settings['Lat Salon'] || -8.583333);
    const longSalon = parseFloat(state.settings['Long Salon'] || 115.283333);
    const batasRadius = parseFloat(state.settings['Batas Radius'] || 50);
    const jarak = calculateDistance(lat, long, latSalon, longSalon);

    if (jarak > batasRadius) {
      Swal.fire('Di Luar Jangkauan', `Jarak Anda ${Math.round(jarak)}m dari Salon (Batas Maks: ${batasRadius}m).`, 'error');
      return;
    }

    // Upload Foto Selfie ke Supabase Storage
    let photoUrl = '';
    try {
      const fileName = `absen_${namaUser.replace(/\s+/g, '_')}_${Date.now()}.jpg`;
      const base64Data = photoData.split(',')[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'image/jpeg' });

      const { data: uploadData, error: uploadErr } = await supabase.storage.from('attendance_photos').upload(fileName, blob, { contentType: 'image/jpeg' });
      if (uploadErr) throw uploadErr;

      const { data: publicUrlData } = supabase.storage.from('attendance_photos').getPublicUrl(fileName);
      photoUrl = publicUrlData.publicUrl;
    } catch (photoErr) {
      console.warn("Storage upload fallback to base64:", photoErr.message);
      photoUrl = photoData;
    }

    const todayStr = formatDateToDDMMYYYY(new Date());
    const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    const mapsUrl = `https://www.google.com/maps?q=${lat},${long}`;

    try {
      const { data: existing } = await supabase
        .from('attendances')
        .select('*')
        .eq('tanggal', todayStr)
        .eq('nama_karyawan', namaUser);

      if (existing && existing.length > 0) {
        await supabase.from('attendances').update({ jam_pulang: timeNow, foto_absensi: photoUrl }).eq('id', existing[0].id);
      } else {
        await supabase.from('attendances').insert([{
          tanggal: todayStr,
          nama_karyawan: namaUser,
          jam_masuk: timeNow,
          jam_pulang: '',
          status_kehadiran: 'Hadir',
          lokasi_maps: mapsUrl,
          foto_absensi: photoUrl
        }]);
      }

      Swal.fire('Sukses', `Absen ${jenisAbsen} berhasil dicatat di Supabase! (Jarak: ${Math.round(jarak)}m)`, 'success');
      document.getElementById('absensiForm').reset();
      document.getElementById('photoPreview').classList.add('hidden');
      document.getElementById('photoPlaceholder').classList.remove('hidden');
      document.getElementById('compressedPhotoData').value = '';
      loadEmployeeData();
    } catch (dbErr) {
      Swal.fire('Database Error', dbErr.message, 'error');
    }
  }, (err) => {
    Swal.fire('Izin Lokasi Ditolak', 'Aktifkan GPS browser untuk melakukan absensi.', 'error');
  }, { enableHighAccuracy: true, timeout: 15000 });
}

async function triggerGeneratePayroll() {
  const period = document.getElementById('payrollPeriod').value;
  if (!period) {
    Swal.fire('Pilih Periode', 'Silakan pilih bulan dan tahun periode payroll.', 'warning');
    return;
  }
  const formattedPeriod = `${period.split('-')[1]}/${period.split('-')[0]}`;

  Swal.fire({ title: 'Mengkalkulasi Payroll Supabase...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const emps = state.data.employees.filter(e => e.status === 'Aktif' && e.peran !== 'Owner');
    const atts = state.data.attendances.filter(a => a.tanggal && a.tanggal.includes(formattedPeriod));
    const pots = state.data.deductions.filter(p => p.tanggal && p.tanggal.includes(formattedPeriod));
    const lmbs = state.data.overtimes.filter(l => l.tanggal && l.tanggal.includes(formattedPeriod) && l.status === 'Disetujui');

    for (const emp of emps) {
      const empName = emp.nama;
      const gapok = parseFloat(emp.gaji_pokok || 0);
      const tunjanganDb = parseFloat(emp.tunjangan_kehadiran || 0);

      const upahHarian = gapok / 25;
      const dendaTelat = gapok / 50;
      const upahLembur = gapok / 250;

      let countTelat = 0, countAlfa = 0, countSakitA = 0;
      atts.filter(a => a.nama_karyawan === empName).forEach(a => {
        let jamPulang = a.jam_pulang ? a.jam_pulang.trim() : '';
        let status = a.status_kehadiran || 'Hadir';
        let sub = a.sub_status || '';

        if (status === 'Alfa' || jamPulang === '') countAlfa++;
        else if (status === 'Telat') {
          if (sub.includes('Auto Alfa') || sub.includes('> 30m')) countAlfa++;
          else if (!sub.includes('Musibah')) countTelat++;
        } else if (status === 'Sakit' && sub.includes('Opsi A')) {
          countSakitA++;
        }
      });

      let totalPotLain = 0;
      pots.filter(p => p.nama_karyawan === empName).forEach(p => totalPotLain += parseFloat(p.nominal || 0));

      let totalJamLmb = 0;
      lmbs.filter(l => l.nama_karyawan === empName).forEach(l => totalJamLmb += parseFloat(l.durasi_jam || 0));
      const uangLemburVal = Math.round(totalJamLmb * upahLembur);

      const tunjanganCair = (countAlfa > 0 || countSakitA > 0) ? 0 : tunjanganDb;
      const kotor = gapok + tunjanganCair + uangLemburVal;

      let potTelat = countTelat * dendaTelat;
      let potAlfa = countAlfa * upahHarian;
      let sanksi = potTelat + potAlfa;

      if (sanksi > (kotor / 2)) {
        let scale = (kotor / 2) / sanksi;
        potTelat = Math.round(potTelat * scale);
        potAlfa = Math.round(potAlfa * scale);
      }

      const totalBersih = Math.round(kotor - potTelat - potAlfa - totalPotLain);

      const payrollPayload = {
        periode: formattedPeriod,
        nama_karyawan: empName,
        gaji_pokok: gapok,
        tunjangan: tunjanganCair,
        uang_lembur: uangLemburVal,
        potongan_telat: Math.round(potTelat),
        potongan_alfa: Math.round(potAlfa),
        potongan_lain: Math.round(totalPotLain),
        total_gaji_bersih: totalBersih
      };

      const { data: existing } = await supabase
        .from('payrolls')
        .select('id')
        .eq('periode', formattedPeriod)
        .eq('nama_karyawan', empName);

      if (existing && existing.length > 0) {
        await supabase.from('payrolls').update(payrollPayload).eq('id', existing[0].id);
      } else {
        await supabase.from('payrolls').insert([payrollPayload]);
      }
    }

    Swal.fire('Selesai', `Slip gaji periode ${formattedPeriod} berhasil digenerate ke Supabase!`, 'success');
    loadAllData();
  } catch (err) {
    Swal.fire('Error Payroll', err.message, 'error');
  }
}

function downloadSlipPDF() {
  const slipArea = document.getElementById('slip-print-area');
  const nama = document.getElementById('slip-nama').innerText.replace(/\s+/g, '_');
  const periode = document.getElementById('slip-periode').innerText.replace(/\//g, '-');
  const opt = { margin: 0.2, filename: `Slip_${nama}_${periode}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 }, jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' } };
  html2pdf().set(opt).from(slipArea).save();
}

function exportPayrollExcel() {
  if (state.data.payrolls.length === 0) {
    Swal.fire('Info', 'Belum ada data Payroll di Supabase.', 'info');
    return;
  }
  const ws = XLSX.utils.json_to_sheet(state.data.payrolls);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Payroll_Rekap");
  XLSX.writeFile(wb, `Payroll_AraBeauty_${Date.now()}.xlsx`);
}

function populateDropdowns() {
  const emps = state.data.employees.filter(e => e.status === 'Aktif' && e.peran !== 'Owner');
  const attSelect = document.getElementById('attEmpSelect');
  if (attSelect) attSelect.innerHTML = emps.map(e => `<option value="${e.nama}">${e.nama}</option>`).join('');
  const potSelect = document.getElementById('potEmpSelect');
  if (potSelect) potSelect.innerHTML = emps.map(e => `<option value="${e.nama}">${e.nama}</option>`).join('');
}

function populateSettingsForm() {
  const f = document.getElementById('formSettings');
  if (!f || !state.settings) return;
  f.elements['Lat Salon'].value = state.settings['Lat Salon'] || '-8.583333';
  f.elements['Long Salon'].value = state.settings['Long Salon'] || '115.283333';
  f.elements['Batas Radius'].value = state.settings['Batas Radius'] || '50';
  f.elements['Min Staff Pagi'].value = state.settings['Min Staff Pagi'] || '2';
  f.elements['Min Staff Siang'].value = state.settings['Min Staff Siang'] || '2';
  f.elements['PIN Owner Default'].value = state.settings['PIN Owner Default'] || '888888';
}

async function handleSettingsSubmit(e) {
  e.preventDefault();
  const formData = new FormData(e.target);
  Swal.fire({ title: 'Menyimpan Pengaturan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    for (const [key, value] of formData.entries()) {
      await supabase.from('app_settings').upsert({ key, value });
    }
    Swal.fire('Sukses', 'Pengaturan berhasil diperbarui di Supabase Cloud!', 'success');
    loadAllData();
  } catch (err) {
    Swal.fire('Error', err.message, 'error');
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function toggleSalaryVisibility() {
  const sal = document.getElementById('empRealtimeSalary');
  const ded = document.getElementById('empCurrentDeduction');
  const ico = document.getElementById('eyeIconSalary');
  sal.classList.toggle('unblurred');
  ded.classList.toggle('unblurred');
  ico.classList.replace(sal.classList.contains('unblurred') ? 'fa-eye-slash' : 'fa-eye', sal.classList.contains('unblurred') ? 'fa-eye' : 'fa-eye-slash');
}

function handlePhotoCapture(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function (e) {
    const img = new Image();
    img.onload = function () {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      let width = img.width, height = img.height;
      if (width > MAX_WIDTH) { height = Math.round((height * MAX_WIDTH) / width); width = MAX_WIDTH; }
      canvas.width = width; canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      document.getElementById('compressedPhotoData').value = dataUrl;
      const preview = document.getElementById('photoPreview');
      preview.src = dataUrl;
      preview.classList.remove('hidden');
      document.getElementById('photoPlaceholder').classList.add('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function openModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('hidden'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.add('hidden'); }
function openAddEmployeeModal() { const form = document.getElementById('formEmployee'); form.reset(); form.elements['id'].value = ""; openModal('modal-employee'); }

function formatDateToYYYYMMDD(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function formatDateToDDMMYYYY(d) { return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`; }

window.onload = init;