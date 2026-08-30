// File: script.js
const SUPABASE_URL = "https://hbqsyfnommdzwwbgsqgx.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PljrNIdoeriyWPcJHdkmfg_Z5mh5T-F";

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const state = {
  view: 'dashboard',
  data: {
    Employee: [],
    Attendance: [],
    Payroll: [],
    Shift: [],
    PerubahanJadwal: [],
    Potongan: [],
    Lembur: []
  },
  settings: {},
  auth: null
};

const shiftState = {
  startDate: new Date(),
  rangeDays: 7
};

let chartInstances = {};

const MASTER_SHIFTS = [
  { code: "P", name: "Pagi", badge: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  { code: "S", name: "Siang", badge: "bg-amber-50 text-amber-800 border-amber-200" },
  { code: "L", name: "Libur", badge: "bg-rose-50 text-rose-800 border-rose-200" }
];

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

function init() {
  const savedAuth = localStorage.getItem('ara_auth');
  if (savedAuth) {
    state.auth = JSON.parse(savedAuth);
    launchApp();
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const pin = document.getElementById('loginPin').value.trim();
  if (!pin) return;

  Swal.fire({
    title: 'Memeriksa Akses...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const { data: settingsData, error: setErr } = await supabaseClient
      .from('settings')
      .select('*');

    if (setErr) throw setErr;

    let settingsMap = {};
    (settingsData || []).forEach(row => {
      settingsMap[row.key] = row.value;
    });

    const ownerPin = settingsMap['PIN Owner Default'] || '888888';

    if (pin === ownerPin) {
      finishLogin({ success: true, role: 'Owner', name: 'Owner Ara Beauty' });
      return;
    }

    const { data: empData, error: empErr } = await supabaseClient
      .from('employees')
      .select('*')
      .eq('pin', pin)
      .eq('status', 'Aktif')
      .maybeSingle();

    if (empErr) throw empErr;

    if (empData) {
      const userProfile = {
        ID: empData.id,
        Nama: empData.nama,
        'Tgl Masuk': empData.tgl_masuk,
        'Gaji Pokok': empData.gaji_pokok,
        'Tunjangan Kehadiran': empData.tunjangan_kehadiran,
        'Utang Hari': empData.utang_hari,
        Status: empData.status,
        PIN: empData.pin,
        Peran: empData.peran || 'Karyawan',
        'Shift Sen': empData.shift_sen,
        'Shift Sel': empData.shift_sel,
        'Shift Rab': empData.shift_rab,
        'Shift Kam': empData.shift_kam,
        'Shift Jum': empData.shift_jum,
        'Shift Sab': empData.shift_sab,
        'Shift Min': empData.shift_min
      };
      finishLogin({
        success: true,
        role: userProfile.Peran,
        name: userProfile.Nama,
        data: userProfile
      });
    } else {
      Swal.fire('Ditolak', 'PIN tidak terdaftar atau akun dinonaktifkan.', 'error');
    }
  } catch (err) {
    Swal.fire('Error Sistem', err.message || 'Gagal terhubung ke database Supabase.', 'error');
  }
}

function finishLogin(res) {
  state.auth = res;
  localStorage.setItem('ara_auth', JSON.stringify(res));
  Swal.close();
  launchApp();
}

function logout() {
  state.auth = null;
  localStorage.removeItem('ara_auth');
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
    loadData();
  } else {
    document.getElementById('app-employee').classList.remove('hidden');
    document.getElementById('empGreetingName').innerText = state.auth.name;
    loadEmployeeData();
  }
}

async function loadEmployeeData() {
  try {
    const [emps, atts, shifts, reqs, lemburs, payrolls, potongans, settings] = await Promise.all([
      fetchSupabaseTable('employees'),
      fetchSupabaseTable('attendance'),
      fetchSupabaseTable('shifts'),
      fetchSupabaseTable('perubahan_jadwal'),
      fetchSupabaseTable('lembur'),
      fetchSupabaseTable('payroll'),
      fetchSupabaseTable('potongan'),
      fetchSupabaseSettings()
    ]);

    state.data.Employee = emps;
    state.data.Attendance = atts;
    state.data.Shift = shifts;
    state.data.PerubahanJadwal = reqs;
    state.data.Lembur = lemburs;
    state.data.Payroll = payrolls;
    state.data.Potongan = potongans;
    state.settings = settings;

    renderEmployeeDashboard();
    renderPengajuanEmployee();
  } catch (err) {
    console.error("Error loading employee data:", err);
  }
}

async function loadData() {
  try {
    const [emps, settings, atts, payrolls, shifts, reqs, lemburs, potongans] = await Promise.all([
      fetchSupabaseTable('employees'),
      fetchSupabaseSettings(),
      fetchSupabaseTable('attendance'),
      fetchSupabaseTable('payroll'),
      fetchSupabaseTable('shifts'),
      fetchSupabaseTable('perubahan_jadwal'),
      fetchSupabaseTable('lembur'),
      fetchSupabaseTable('potongan')
    ]);

    state.data.Employee = emps;
    state.settings = settings;
    state.data.Attendance = atts;
    state.data.Payroll = payrolls;
    state.data.Shift = shifts;
    state.data.PerubahanJadwal = reqs;
    state.data.Lembur = lemburs;
    state.data.Potongan = potongans;

    populateDropdowns();

    if (state.view === 'dashboard') renderDashboardAnalytics();
    if (state.view === 'employee') switchView('employee');
    if (state.view === 'attendance') switchView('attendance');
    if (state.view === 'payroll') switchView('payroll');
    if (state.view === 'shift' || state.view === 'cuti') {
      renderShiftCalendar();
      if (state.view === 'cuti') renderPengajuanOwner();
    }
    if (state.view === 'lembur') renderLemburOwner();
    if (state.view === 'potongan') switchView('potongan');
    if (state.view === 'settings') populateSettingsForm();
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

async function fetchSupabaseTable(tableName) {
  const { data, error } = await supabaseClient
    .from(tableName)
    .select('*')
    .order('created_at', { ascending: true });

  if (error) throw error;
  if (!data) return [];

  return data.map(item => {
    if (tableName === 'employees') {
      return {
        ID: item.id,
        Nama: item.nama,
        'Tgl Masuk': item.tgl_masuk,
        'Gaji Pokok': item.gaji_pokok,
        'Tunjangan Kehadiran': item.tunjangan_kehadiran,
        'Utang Hari': item.utang_hari,
        Status: item.status,
        PIN: item.pin,
        Peran: item.peran,
        'Shift Sen': item.shift_sen,
        'Shift Sel': item.shift_sel,
        'Shift Rab': item.shift_rab,
        'Shift Kam': item.shift_kam,
        'Shift Jum': item.shift_jum,
        'Shift Sab': item.shift_sab,
        'Shift Min': item.shift_min
      };
    } else if (tableName === 'attendance') {
      return {
        ID: item.id,
        Tanggal: item.tanggal,
        'Nama Karyawan': item.nama_karyawan,
        'Jam Masuk': item.jam_masuk,
        'Jam Pulang': item.jam_pulang,
        'Status Kehadiran': item.status_kehadiran,
        'Sub-Status': item.sub_status,
        'Lokasi Maps': item.lokasi_maps,
        'Foto Absensi': item.foto_absensi
      };
    } else if (tableName === 'payroll') {
      return {
        ID: item.id,
        Periode: item.periode,
        'Nama Karyawan': item.nama_karyawan,
        'Gaji Pokok': item.gaji_pokok,
        Tunjangan: item.tunjangan,
        'Uang Lembur': item.uang_lembur,
        'Potongan Telat': item.potongan_telat,
        'Potongan Alfa': item.potongan_alfa,
        'Potongan Lain': item.potongan_lain,
        'Total Gaji Bersih': item.total_gaji_bersih
      };
    } else if (tableName === 'perubahan_jadwal') {
      return {
        ID: item.id,
        'Nama Karyawan': item.nama_karyawan,
        Jenis: item.jenis,
        'Tgl 1': item.tgl_1,
        'Tgl 2': item.tgl_2,
        'Shift Tujuan': item.shift_tujuan,
        Alasan: item.alasan,
        Status: item.status
      };
    } else if (tableName === 'lembur') {
      return {
        ID: item.id,
        Tanggal: item.tanggal,
        'Nama Karyawan': item.nama_karyawan,
        'Durasi Jam': item.durasi_jam,
        Keterangan: item.keterangan,
        Status: item.status
      };
    } else if (tableName === 'potongan') {
      return {
        ID: item.id,
        Tanggal: item.tanggal,
        'Nama Karyawan': item.nama_karyawan,
        Jenis: item.jenis,
        Nominal: item.nominal,
        Keterangan: item.keterangan
      };
    } else if (tableName === 'shifts') {
      return {
        ID: item.id,
        Tanggal: item.tanggal,
        'Nama Karyawan': item.nama_karyawan,
        'Tipe Shift': item.tipe_shift
      };
    }
    return item;
  });
}

async function fetchSupabaseSettings() {
  const { data, error } = await supabaseClient.from('settings').select('*');
  if (error) throw error;
  let settings = {
    "PIN Owner Default": "888888",
    "Min Staff Pagi": "2",
    "Min Staff Siang": "2",
    "Lat Salon": "-8.583333",
    "Long Salon": "115.283333",
    "Batas Radius": "50"
  };
  (data || []).forEach(row => {
    if (row.key) settings[row.key] = row.value;
  });
  return settings;
}

function switchView(viewId) {
  document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
  document.getElementById(`view-${viewId}`).classList.add('active');
  state.view = viewId;
  renderNav();

  if (viewId === 'dashboard') renderDashboardAnalytics();

  if (viewId === 'employee') {
    const empList = state.data.Employee.filter(e => e.Peran !== 'Owner');
    renderTable('employee', ['ID', 'Nama', 'Gaji Pokok', 'Tunjangan Kehadiran', 'Utang Hari', 'Status'], empList, false, true);
  }
  if (viewId === 'shift') renderShiftCalendar();
  if (viewId === 'cuti') renderPengajuanOwner();
  if (viewId === 'lembur') renderLemburOwner();
  if (viewId === 'attendance') {
    const filterAtt = state.data.Attendance.filter(a => {
      let e = state.data.Employee.find(x => x.Nama === a['Nama Karyawan']);
      return !e || e.Peran !== 'Owner';
    });
    renderTable('attendance', ['Tanggal', 'Nama Karyawan', 'Jam Masuk', 'Jam Pulang', 'Status Kehadiran', 'Sub-Status', 'Lokasi Maps', 'Foto Absensi'], filterAtt);
  }
  if (viewId === 'potongan') {
    renderTable('potongan', ['Tanggal', 'Nama Karyawan', 'Jenis', 'Nominal', 'Keterangan'], state.data.Potongan, false, false);
  }
  if (viewId === 'payroll') {
    renderTable('payroll', ['Periode', 'Nama Karyawan', 'Gaji Pokok', 'Tunjangan', 'Uang Lembur', 'Potongan Telat', 'Potongan Alfa', 'Potongan Lain', 'Total Gaji Bersih'], state.data.Payroll, true, false);
  }
  if (viewId === 'settings') {
    populateSettingsForm();
  }
}

function populateSettingsForm() {
  if (!state.settings) return;
  const f = document.getElementById('formSettings');
  if (!f) return;

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
  const data = Object.fromEntries(formData.entries());

  Swal.fire({
    title: 'Menyimpan Pengaturan...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const upsertRows = Object.keys(data).map(key => ({
      key: key,
      value: String(data[key])
    }));

    const { error } = await supabaseClient
      .from('settings')
      .upsert(upsertRows, { onConflict: 'key' });

    if (error) throw error;

    state.settings = { ...state.settings, ...data };
    Swal.fire('Sukses', 'Pengaturan berhasil diperbarui dan aktif seketika!', 'success');
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

function renderDashboardAnalytics() {
  if (state.view !== 'dashboard' || state.auth.role !== 'Owner') return;

  const emps = state.data.Employee.filter(e => e.Status === 'Aktif' && e.Peran !== 'Owner');
  const totalAktif = emps.length;

  const todayStr = formatDateToDDMMYYYY(new Date());
  const d = new Date();
  const currentMonthStr = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;

  const hadirHariIni = state.data.Attendance.filter(a => a.Tanggal === todayStr && a['Status Kehadiran'] !== 'Alfa').length;

  const pendingReqJadwal = (state.data.PerubahanJadwal || []).filter(r => r.Status === 'Pending' || r.Status === 'Minta Batal').length;
  const pendingLembur = (state.data.Lembur || []).filter(r => r.Status === 'Pending').length;
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
  let attThisMonth = state.data.Attendance.filter(a => a.Tanggal && a.Tanggal.includes(currentMonthStr) && emps.some(e => e.Nama === a['Nama Karyawan']));

  let employeeStats = {};
  emps.forEach(e => { employeeStats[e.Nama] = { tepat: 0, telat: 0, alfa: 0, score: 0 }; });

  let totalBebanGajiKotor = 0;
  let totalPotonganDisiplin = 0;

  emps.forEach(emp => {
    const name = emp.Nama;
    const gapok = parseFloat(emp['Gaji Pokok'] || 0);
    const tunjangan = parseFloat(emp['Tunjangan Kehadiran'] || 0);

    const upahHarian = gapok / 25;
    const dendaTelat = gapok / 50;

    let empAlfa = 0;
    let empTelat = 0;
    let empSakitOpsiA = 0;

    attThisMonth.forEach(a => {
      if (a['Nama Karyawan'] !== name) return;

      let jamPulang = a['Jam Pulang'] ? a['Jam Pulang'].trim() : '';
      let isLupaPulang = (jamPulang === '');
      let status = a['Status Kehadiran'] || 'Hadir';
      let subStatus = a['Sub-Status'] || '';

      if (status === 'Alfa' || (isLupaPulang && a.Tanggal !== todayStr)) {
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
  if (state.data.Potongan) {
    state.data.Potongan.forEach(p => {
      if (p.Tanggal && p.Tanggal.includes(currentMonthStr) && emps.some(e => e.Nama === p['Nama Karyawan'])) {
        totalKasbonBulanIni += parseFloat(p.Nominal || 0);
      }
    });
  }
  let totalDeduction = totalPotonganDisiplin + totalKasbonBulanIni;

  const ctxDisiplin = document.getElementById('chartDisiplin');
  if (ctxDisiplin) {
    if (chartInstances.disiplin) chartInstances.disiplin.destroy();
    if (countTepat === 0 && countTelat === 0 && countAlfa === 0) {
      chartInstances.disiplin = new Chart(ctxDisiplin, {
        type: 'doughnut',
        data: { labels: ['Belum ada data'], datasets: [{ data: [1], backgroundColor: ['#f3f4f6'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
      });
    } else {
      chartInstances.disiplin = new Chart(ctxDisiplin, {
        type: 'doughnut',
        data: {
          labels: ['Tepat Waktu', 'Terlambat', 'Alfa / Lupa Pulang'],
          datasets: [{
            data: [countTepat, countTelat, countAlfa],
            backgroundColor: ['#34d399', '#fbbf24', '#f43f5e'],
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
  }

  const ctxKeuangan = document.getElementById('chartKeuangan');
  if (ctxKeuangan) {
    if (chartInstances.keuangan) chartInstances.keuangan.destroy();
    chartInstances.keuangan = new Chart(ctxKeuangan, {
      type: 'bar',
      data: {
        labels: ['Estimasi Gaji Kotor', 'Total Denda & Kasbon'],
        datasets: [{
          label: 'Rupiah (Bulan Ini)',
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
          y: { beginAtZero: true, grid: { color: '#f3f4f6', drawBorder: false }, ticks: { font: { size: 10 }, callback: (value) => 'Rp ' + (value / 1000) + 'K' } },
          x: { grid: { display: false } }
        }
      }
    });
  }

  let rankedEmps = Object.keys(employeeStats).map(nama => ({ nama: nama, ...employeeStats[nama] }));
  rankedEmps.sort((a, b) => b.score - a.score);

  const lbTop = document.getElementById('leaderboardTop');
  const lbBot = document.getElementById('leaderboardBottom');

  if (lbTop) {
    let top3 = rankedEmps.slice(0, 3).filter(x => x.score > 0 || x.tepat > 0);
    if (top3.length === 0) {
      lbTop.innerHTML = `<p class="text-xs text-gray-400 text-center py-4 bg-gray-50 rounded-2xl border border-gray-100">Belum ada data kedisiplinan bulan ini.</p>`;
    } else {
      lbTop.innerHTML = top3.map((x, i) => `
          <div class="flex items-center justify-between p-3 rounded-2xl bg-emerald-50 border border-emerald-100 transition-transform hover:scale-[1.02]">
              <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-emerald-200 text-emerald-700 flex items-center justify-center font-black text-xs shadow-inner">#${i + 1}</div>
                  <div><p class="text-xs font-bold text-brandText">${x.nama}</p><p class="text-[10px] text-emerald-600 font-semibold"><i class="fa-solid fa-check mr-1"></i>${x.tepat} Tepat Waktu</p></div>
              </div>
              <i class="fa-solid fa-medal text-emerald-400 text-xl drop-shadow-sm"></i>
          </div>
      `).join('');
    }
  }

  if (lbBot) {
    let bot3 = [...rankedEmps].reverse().slice(0, 3).filter(x => x.telat > 0 || x.alfa > 0);
    if (bot3.length === 0) {
      lbBot.innerHTML = `<p class="text-xs text-emerald-500 text-center py-4 bg-emerald-50 rounded-2xl border border-emerald-100 font-bold"><i class="fa-solid fa-party-horn mr-1"></i> Hebat! Belum ada pelanggaran bulan ini.</p>`;
    } else {
      lbBot.innerHTML = bot3.map((x, i) => `
          <div class="flex items-center justify-between p-3 rounded-2xl bg-rose-50 border border-rose-100 transition-transform hover:scale-[1.02]">
              <div class="flex items-center gap-3">
                  <div class="w-8 h-8 rounded-full bg-rose-200 text-rose-700 flex items-center justify-center font-black text-xs shadow-inner"><i class="fa-solid fa-triangle-exclamation"></i></div>
                  <div><p class="text-xs font-bold text-brandText">${x.nama}</p><p class="text-[10px] text-rose-600 font-semibold">${x.telat} Telat, ${x.alfa} Alfa</p></div>
              </div>
          </div>
      `).join('');
    }
  }
}

function downloadSlipPDF() {
  const slipArea = document.getElementById('slip-print-area');
  const nama = document.getElementById('slip-nama').innerText.replace(/\s+/g, '_');
  const periode = document.getElementById('slip-periode').innerText.replace(/\//g, '-');

  const fileName = `Slip_Gaji_${nama}_${periode}.pdf`;

  const opt = {
    margin: 0.2,
    filename: fileName,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' }
  };

  Swal.fire({
    title: 'Membuat PDF...',
    text: 'Mohon tunggu sebentar',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  html2pdf().set(opt).from(slipArea).save().then(() => {
    Swal.close();
  }).catch(err => {
    Swal.fire('Error', 'Gagal membuat PDF: ' + err.message, 'error');
  });
}

function exportPayrollExcel() {
  if (!state.data.Payroll || state.data.Payroll.length === 0) {
    Swal.fire('Oops', 'Belum ada data Payroll di database!', 'warning');
    return;
  }

  const periodInput = document.getElementById('payrollPeriod').value;
  let targetData = state.data.Payroll;
  let fileNamePeriod = 'All';

  if (periodInput) {
    const formattedPeriod = `${periodInput.split('-')[1]}/${periodInput.split('-')[0]}`;
    targetData = state.data.Payroll.filter(p => p.Periode === formattedPeriod);
    fileNamePeriod = formattedPeriod.replace('/', '-');
  }

  if (targetData.length === 0) {
    Swal.fire('Info', 'Tidak ada data Payroll pada periode yang dipilih.', 'info');
    return;
  }

  Swal.fire({ title: 'Mengekspor Excel...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    const exportData = targetData.map(row => ({
      'Periode': row.Periode,
      'Nama Karyawan': row['Nama Karyawan'],
      'Gaji Pokok': parseFloat(row['Gaji Pokok'] || 0),
      'Tunjangan': parseFloat(row['Tunjangan'] || 0),
      'Uang Lembur': parseFloat(row['Uang Lembur'] || 0),
      'Potongan Telat': parseFloat(row['Potongan Telat'] || 0),
      'Potongan Alfa': parseFloat(row['Potongan Alfa'] || 0),
      'Potongan Lain': parseFloat(row['Potongan Lain'] || 0),
      'Total Gaji Bersih': parseFloat(row['Total Gaji Bersih'] || 0)
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Rekap_Payroll");
    XLSX.writeFile(wb, `Rekap_Payroll_AraBeauty_${fileNamePeriod}.xlsx`);
    Swal.close();
  } catch (error) {
    Swal.fire('Error', 'Gagal mengekspor data: ' + error.message, 'error');
  }
}

function renderTable(type, headers, data, isPayroll = false, isEmployee = false) {
  const table = document.getElementById(`table-${type}`);
  if (!table) return;
  if (!data || data.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500" colspan="10">Tidak ada data</td></tr>`;
    return;
  }
  let thead = `<thead><tr class="bg-gray-50 border-b border-gray-100">`;
  headers.forEach(h => { thead += `<th class="p-4 font-bold text-gray-600 whitespace-nowrap">${h}</th>`; });
  if (isPayroll || isEmployee) thead += `<th class="p-4 font-bold text-gray-600 text-center">Aksi</th>`;
  thead += `</tr></thead><tbody>`;

  data.forEach(row => {
    thead += `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">`;
    headers.forEach(h => {
      let val = row[h] !== undefined ? row[h] : '';
      if ((h.includes('Gaji') || h.includes('Tunjangan') || h.includes('Potongan') || h.includes('Uang Lembur') || h === 'Nominal') && val !== '' && !isNaN(val)) {
        val = 'Rp ' + Number(val).toLocaleString('id-ID');
      }
      if (h === 'Status') {
        let color = val === 'Aktif' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700';
        val = `<span class="px-2 py-1 rounded-full text-xs font-bold ${color}">${val}</span>`;
      }
      if (h === 'Utang Hari') {
        val = parseInt(val) > 0 ? `<span class="text-rose-600 font-bold bg-rose-50 border border-rose-200 px-2 py-1 rounded-lg shadow-sm"><i class="fa-solid fa-triangle-exclamation mr-1"></i> ${val} Hari</span>` : `<span class="text-gray-400 font-bold">${val || 0}</span>`;
      }
      if (h === 'Lokasi Maps' && val) {
        val = `<a href="${val}" target="_blank" class="text-blue-500 underline text-xs font-bold">Buka Maps</a>`;
      }
      if (h === 'Foto Absensi' && val) {
        val = `<a href="${val}" target="_blank" class="text-brandPink underline text-xs font-bold">Lihat Foto</a>`;
      }
      thead += `<td class="p-4">${val}</td>`;
    });
    if (isPayroll) thead += `<td class="p-4 text-center"><button onclick="showEmpSlipDetailOwner('${row.ID}')" class="text-brandPink hover:text-brandPinkDark bg-brandPink/10 px-3 py-1.5 rounded-lg shadow-sm transition-transform hover:scale-105" title="Cetak Slip"><i class="fa-solid fa-print"></i></button></td>`;
    if (isEmployee) thead += `<td class="p-4 text-center"><button onclick="editEmployee('${row.ID}')" class="text-brandPink hover:text-brandPinkDark bg-brandPink/10 px-3 py-1.5 rounded-lg shadow-sm transition-transform hover:scale-105"><i class="fa-solid fa-pen-to-square"></i></button></td>`;
    thead += `</tr>`;
  });
  table.innerHTML = thead + `</tbody>`;
}

function getShiftForEmp(empProfile, dateStr) {
  if (!empProfile) return 'L';

  if (state.data.Shift && state.data.Shift.length > 0) {
    let override = state.data.Shift.find(s => s['Nama Karyawan'] === empProfile.Nama && s.Tanggal === dateStr);
    if (override && override['Tipe Shift']) {
      let t = override['Tipe Shift'].toLowerCase();
      if (t.includes('pagi')) return 'P';
      if (t.includes('siang')) return 'S';
      return 'L';
    }
  }

  if (!dateStr) return 'L';
  const parts = dateStr.split('/');
  if (parts.length < 3) return 'L';
  const d = new Date(parts[2], parts[1] - 1, parts[0]);
  const dayIndex = d.getDay();
  const dayMap = { 1: 'Shift Sen', 2: 'Shift Sel', 3: 'Shift Rab', 4: 'Shift Kam', 5: 'Shift Jum', 6: 'Shift Sab', 0: 'Shift Min' };
  const shiftCol = dayMap[dayIndex];
  return empProfile[shiftCol] || 'L';
}

function renderShiftCalendar() {
  const table = document.getElementById('table-shift');
  if (!table) return;

  const emps = state.data.Employee.filter(e => e.Status === 'Aktif' && e.Peran !== 'Owner');
  if (emps.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500">Belum ada data karyawan aktif</td></tr>`;
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
      <th class="p-4 font-bold text-gray-600 sticky left-0 bg-gray-50 z-10 min-w-[150px] shadow-[2px_0_5px_rgba(0,0,0,0.02)]">Nama Karyawan</th>`;

  dates.forEach(d => {
    let dateStr = formatDateToDDMMYYYY(d);
    let dayName = hariList[d.getDay()];
    let count = shiftCounts[dateStr];

    let isWarning = count.P < minPagi || count.S < minSiang;
    let warningIcon = isWarning
      ? `<i class="fa-solid fa-circle-exclamation text-rose-500 animate-pulse ml-1 text-sm" title="Kekurangan Staff!"></i>`
      : `<i class="fa-solid fa-circle-check text-emerald-400 ml-1 text-sm"></i>`;

    thead += `<th class="p-3 text-center min-w-[100px] border-l border-gray-100 cursor-pointer hover:bg-gray-100 transition-colors" onclick="showShiftWarningModal('${dateStr}', '${dayName}', ${count.P}, ${minPagi}, ${count.S}, ${minSiang})">
        <div class="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">${dayName}</div>
        <div class="text-sm font-black text-brandText flex items-center justify-center">${d.getDate()}/${d.getMonth() + 1} ${warningIcon}</div>
    </th>`;
  });
  thead += `</tr></thead>`;

  let tbody = `<tbody>`;
  emps.forEach(emp => {
    tbody += `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
        <td class="p-4 font-bold text-brandText sticky left-0 bg-white z-10 shadow-[2px_0_5px_rgba(0,0,0,0.02)]">${emp.Nama}</td>`;

    dates.forEach(d => {
      let dateStr = formatDateToDDMMYYYY(d);
      let currentCode = getShiftForEmp(emp, dateStr);

      let bgSelect = currentCode === 'P' ? 'bg-emerald-50 text-emerald-700 font-bold border-emerald-100' :
        currentCode === 'S' ? 'bg-amber-50 text-amber-700 font-bold border-amber-100' :
          'bg-rose-50 text-rose-700 font-bold border-rose-100';

      tbody += `<td class="p-2 border-l border-gray-50 text-center">
            <select onchange="updateShiftByOwner('${emp.Nama}', '${dateStr}', this.value)" class="w-full text-xs p-2 rounded-xl outline-none cursor-pointer text-center appearance-none border shadow-sm transition-transform hover:scale-105 ${bgSelect}">
                <option value="P" ${currentCode === 'P' ? 'selected' : ''}>Pagi</option>
                <option value="S" ${currentCode === 'S' ? 'selected' : ''}>Siang</option>
                <option value="L" ${currentCode === 'L' ? 'selected' : ''}>Libur</option>
            </select>
        </td>`;
    });
    tbody += `</tr>`;
  });
  tbody += `</tbody>`;

  table.innerHTML = thead + tbody;
}

function showShiftWarningModal(dateStr, dayName, countP, minP, countS, minS) {
  document.getElementById('msd-title').innerText = `${dayName}, ${dateStr}`;
  const content = document.getElementById('msd-content');

  let pStatus = countP >= minP
    ? `<span class="text-emerald-500 font-black text-xs uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"><i class="fa-solid fa-check mr-1"></i>Aman</span>`
    : `<span class="text-rose-500 font-black text-xs uppercase tracking-wider bg-rose-50 px-2 py-1 rounded-lg border border-rose-100"><i class="fa-solid fa-triangle-exclamation mr-1 animate-pulse"></i>Kurang ${minP - countP} Orang</span>`;

  let sStatus = countS >= minS
    ? `<span class="text-emerald-500 font-black text-xs uppercase tracking-wider bg-emerald-50 px-2 py-1 rounded-lg border border-emerald-100"><i class="fa-solid fa-check mr-1"></i>Aman</span>`
    : `<span class="text-rose-500 font-black text-xs uppercase tracking-wider bg-rose-50 px-2 py-1 rounded-lg border border-rose-100"><i class="fa-solid fa-triangle-exclamation mr-1 animate-pulse"></i>Kurang ${minS - countS} Orang</span>`;

  content.innerHTML = `
      <div class="p-4 rounded-2xl border ${countP < minP ? 'border-rose-200 bg-rose-50/50' : 'border-gray-100 bg-gray-50'} mb-3 transition-colors">
          <div class="flex justify-between items-center mb-2">
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Shift Pagi</span>
              ${pStatus}
          </div>
          <div class="text-sm font-black text-brandText flex items-end gap-2">
              ${countP} Karyawan <span class="text-[10px] text-gray-400 font-bold uppercase pb-0.5">(Syarat Min: ${minP})</span>
          </div>
      </div>
      <div class="p-4 rounded-2xl border ${countS < minS ? 'border-rose-200 bg-rose-50/50' : 'border-gray-100 bg-gray-50'} transition-colors">
          <div class="flex justify-between items-center mb-2">
              <span class="text-[11px] font-bold text-gray-500 uppercase tracking-widest">Shift Siang</span>
              ${sStatus}
          </div>
          <div class="text-sm font-black text-brandText flex items-end gap-2">
              ${countS} Karyawan <span class="text-[10px] text-gray-400 font-bold uppercase pb-0.5">(Syarat Min: ${minS})</span>
          </div>
      </div>
      <div class="mt-4 text-center">
          <p class="text-[10px] text-gray-400 italic font-medium leading-relaxed">
              Jika indikator berwarna merah, sangat disarankan untuk merevisi jadwal atau menolak pengajuan libur pada tanggal ini untuk menjaga kelancaran operasional salon.
          </p>
      </div>
  `;
  openModal('modal-shift-detail');
}

async function updateShiftByOwner(empName, dateStr, newCode) {
  Swal.fire({ title: 'Menyimpan Jadwal...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    let shiftText = newCode === 'P' ? 'Pagi' : (newCode === 'S' ? 'Siang' : 'Libur');

    const { data: existing } = await supabaseClient
      .from('shifts')
      .select('id')
      .eq('tanggal', dateStr)
      .eq('nama_karyawan', empName)
      .maybeSingle();

    if (existing) {
      await supabaseClient.from('shifts').update({ tipe_shift: shiftText }).eq('id', existing.id);
    } else {
      const shiftId = 'SHF-' + Date.now().toString().slice(-6);
      await supabaseClient.from('shifts').insert([{
        id: shiftId,
        tanggal: dateStr,
        nama_karyawan: empName,
        tipe_shift: shiftText
      }]);
    }
    Swal.close();
    loadData();
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

function shiftNavPrev() { shiftState.startDate.setDate(shiftState.startDate.getDate() - shiftState.rangeDays); document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate); renderShiftCalendar(); }
function shiftNavToday() { shiftState.startDate = new Date(); document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate); renderShiftCalendar(); }
function shiftNavNext() { shiftState.startDate.setDate(shiftState.startDate.getDate() + shiftState.rangeDays); document.getElementById('shiftStartDate').value = formatDateToYYYYMMDD(shiftState.startDate); renderShiftCalendar(); }
function onShiftDateChange(val) { if (val) { shiftState.startDate = new Date(val); renderShiftCalendar(); } }
function setShiftRange(days) {
  shiftState.rangeDays = days;
  document.getElementById('btnRange7').className = days === 7 ? 'px-3 py-1 rounded-lg font-bold bg-white shadow-sm text-brandText border border-gray-100' : 'px-3 py-1 rounded-lg font-bold text-gray-400 hover:text-brandText transition-colors';
  document.getElementById('btnRange14').className = days === 14 ? 'px-3 py-1 rounded-lg font-bold bg-white shadow-sm text-brandText border border-gray-100' : 'px-3 py-1 rounded-lg font-bold text-gray-400 hover:text-brandText transition-colors';
  renderShiftCalendar();
}

function renderPengajuanOwner() {
  const table = document.getElementById('table-cuti'); if (!table) return;
  let reqs = state.data.PerubahanJadwal || [];

  reqs.sort((a, b) => {
    if (a.Status === 'Pending' && b.Status !== 'Pending') return -1;
    if (a.Status !== 'Pending' && b.Status === 'Pending') return 1;
    return parseInt(b.ID.split('-')[1] || 0) - parseInt(a.ID.split('-')[1] || 0);
  });

  if (reqs.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500 font-bold" colspan="6">Tidak ada riwayat pengajuan.</td></tr>`;
    return;
  }

  let thead = `<thead><tr class="bg-gray-50 border-b border-gray-100">
      <th class="p-4 font-bold text-gray-600 whitespace-nowrap">ID TIKET</th>
      <th class="p-4 font-bold text-gray-600">Karyawan</th>
      <th class="p-4 font-bold text-gray-600">Jenis Pengajuan</th>
      <th class="p-4 font-bold text-gray-600">Detail Pertukaran</th>
      <th class="p-4 font-bold text-gray-600">Alasan</th>
      <th class="p-4 font-bold text-gray-600 text-center">Status & Aksi</th>
  </tr></thead><tbody>`;

  reqs.forEach(r => {
    let detail = '';
    if (r.Jenis === 'Tukar Hari Libur') {
      detail = `Libur tgl <span class="font-black text-brandText">${r['Tgl 1']}</span> <i class="fa-solid fa-arrow-right text-[10px] mx-1 text-brandPink"></i> <span class="font-black text-brandText">${r['Tgl 2']}</span>`;
    } else {
      let targetShift = r['Shift Tujuan'] === 'P' ? 'PAGI' : (r['Shift Tujuan'] === 'S' ? 'SIANG' : 'LIBUR');
      detail = `Tgl <span class="font-black text-brandText">${r['Tgl 1']}</span> <i class="fa-solid fa-arrow-right text-[10px] mx-1 text-brandPink"></i> Ke Shift <span class="font-black text-brandText">${targetShift}</span>`;
    }

    let aksi = '';
    let bgStatus = r.Status === 'Disetujui' ? 'bg-emerald-100 text-emerald-700' : (r.Status.includes('Tolak') || r.Status.includes('Batal') ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700');

    if (r.Status === 'Pending' || r.Status === 'Minta Batal') {
      aksi = `<div class="mt-2.5 flex justify-center gap-2">
              <button onclick="processReq('${r.ID}', 'ACC')" class="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg shadow-sm text-xs font-black uppercase tracking-wider transition-colors"><i class="fa-solid fa-check mr-1"></i>ACC</button>
              <button onclick="processReq('${r.ID}', 'TOLAK')" class="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg shadow-sm text-xs font-black uppercase tracking-wider transition-colors"><i class="fa-solid fa-xmark mr-1"></i>Tolak</button>
          </div>`;
    }

    thead += `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <td class="p-4 text-[11px] font-black tracking-widest text-gray-400">${r.ID}</td>
          <td class="p-4 font-black text-brandText">${r['Nama Karyawan']}</td>
          <td class="p-4 text-xs"><span class="bg-gray-100 px-2.5 py-1 rounded-lg font-bold text-gray-600 border border-gray-200 shadow-sm">${r.Jenis}</span></td>
          <td class="p-4 text-xs">${detail}</td>
          <td class="p-4 text-xs text-gray-500 italic font-medium max-w-[200px] truncate" title="${r.Alasan}">"${r.Alasan}"</td>
          <td class="p-4 text-center">
              <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${bgStatus}">${r.Status}</span>
              ${aksi}
          </td>
      </tr>`;
  });
  thead += `</tbody>`;
  table.innerHTML = thead;
}

async function processReq(id, action) {
  Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    let newStatus = action === "ACC" ? "Disetujui" : (action === "TOLAK" ? "Ditolak" : "Dibatalkan");
    const { error } = await supabaseClient
      .from('perubahan_jadwal')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    Swal.fire('Sukses', 'Status tiket berhasil diupdate menjadi: ' + newStatus, 'success');
    loadData();
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

function renderLemburOwner() {
  const table = document.getElementById('table-lembur'); if (!table) return;
  let reqs = state.data.Lembur || [];

  reqs.sort((a, b) => {
    if (a.Status === 'Pending' && b.Status !== 'Pending') return -1;
    if (a.Status !== 'Pending' && b.Status === 'Pending') return 1;
    return parseInt(b.ID.split('-')[1] || 0) - parseInt(a.ID.split('-')[1] || 0);
  });

  if (reqs.length === 0) {
    table.innerHTML = `<tr><td class="p-4 text-center text-gray-500 font-bold" colspan="6">Tidak ada pengajuan lembur.</td></tr>`;
    return;
  }

  let thead = `<thead><tr class="bg-gray-50 border-b border-gray-100">
      <th class="p-4 font-bold text-gray-600 whitespace-nowrap">ID TIKET</th>
      <th class="p-4 font-bold text-gray-600">Karyawan</th>
      <th class="p-4 font-bold text-gray-600">Tanggal</th>
      <th class="p-4 font-bold text-gray-600">Durasi Jam</th>
      <th class="p-4 font-bold text-gray-600">Keterangan</th>
      <th class="p-4 font-bold text-gray-600 text-center">Status & Aksi</th>
  </tr></thead><tbody>`;

  reqs.forEach(r => {
    let aksi = '';
    let bgStatus = r.Status === 'Disetujui' ? 'bg-emerald-100 text-emerald-700' : (r.Status.includes('Tolak') || r.Status.includes('Batal') ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700');

    if (r.Status === 'Pending') {
      aksi = `<div class="mt-2.5 flex justify-center gap-2">
              <button onclick="processLemburReq('${r.ID}', 'ACC')" class="bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-lg shadow-sm text-xs font-black uppercase tracking-wider transition-colors"><i class="fa-solid fa-check mr-1"></i>ACC</button>
              <button onclick="processLemburReq('${r.ID}', 'TOLAK')" class="bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 px-3 py-1.5 rounded-lg shadow-sm text-xs font-black uppercase tracking-wider transition-colors"><i class="fa-solid fa-xmark mr-1"></i>Tolak</button>
          </div>`;
    }

    thead += `<tr class="border-b border-gray-50 hover:bg-gray-50/50 transition-colors">
          <td class="p-4 text-[11px] font-black tracking-widest text-gray-400">${r.ID}</td>
          <td class="p-4 font-black text-brandText">${r['Nama Karyawan']}</td>
          <td class="p-4 font-black text-brandText">${r.Tanggal}</td>
          <td class="p-4 text-xs font-bold text-brandPink">${r['Durasi Jam']} Jam</td>
          <td class="p-4 text-xs text-gray-500 italic font-medium max-w-[200px] truncate" title="${r.Keterangan}">"${r.Keterangan}"</td>
          <td class="p-4 text-center">
              <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest shadow-sm ${bgStatus}">${r.Status}</span>
              ${aksi}
          </td>
      </tr>`;
  });
  thead += `</tbody>`;
  table.innerHTML = thead;
}

async function processLemburReq(id, action) {
  Swal.fire({ title: 'Memproses...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    let newStatus = action === "ACC" ? "Disetujui" : "Ditolak";
    const { error } = await supabaseClient
      .from('lembur')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) throw error;
    Swal.fire('Sukses', 'Pengajuan Lembur berhasil ' + newStatus, 'success');
    loadData();
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

function renderEmployeeDashboard() {
  if (!state.data.Employee || !state.data.Attendance || !state.data.Shift) return;
  const me = state.auth.name;
  const myProfile = state.data.Employee.find(e => e.Nama === me) || {};
  const gajiPokok = parseFloat(myProfile['Gaji Pokok'] || 0);
  const tunjanganDatabase = parseFloat(myProfile['Tunjangan Kehadiran'] || 0);
  const utangHari = parseInt(myProfile['Utang Hari'] || 0);

  const upahHarian = gajiPokok / 25;
  const dendaTelat = gajiPokok / 50;
  const tarifLembur = gajiPokok / 250;

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
  let myAtt = state.data.Attendance.filter(a => a['Nama Karyawan'] === me && a.Tanggal && a.Tanggal.includes(currentMonthStr));

  let countTelatKelalaian = 0;
  let countAlfa = 0;
  let countSakitOpsiA = 0;
  const todayStr = formatDateToDDMMYYYY(new Date());

  let todayAtt = null;

  myAtt.forEach(a => {
    if (a.Tanggal === todayStr) {
      todayAtt = a;
    }

    let jamPulang = a['Jam Pulang'] ? a['Jam Pulang'].trim() : '';
    let isLupaPulang = (jamPulang === '');
    let status = a['Status Kehadiran'] || 'Hadir';
    let subStatus = a['Sub-Status'] || '';

    if (status === 'Alfa' || (isLupaPulang && a.Tanggal !== todayStr)) {
      countAlfa++;
    } else if (status === 'Telat') {
      if (subStatus.includes('Auto Alfa') || subStatus.includes('> 30m')) countAlfa++;
      else if (!subStatus.includes('Musibah')) countTelatKelalaian++;
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
      let jamPulang = todayAtt['Jam Pulang'] ? todayAtt['Jam Pulang'].trim() : '';
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
  if (state.data.Potongan) {
    let myPotongan = state.data.Potongan.filter(p => p['Nama Karyawan'] === me && p.Tanggal && p.Tanggal.includes(currentMonthStr));
    myPotongan.forEach(p => { totalPotonganLain += parseFloat(p.Nominal || 0); });
  }

  let totalJamLembur = 0;
  if (state.data.Lembur) {
    let myLembur = state.data.Lembur.filter(l => l['Nama Karyawan'] === me && l.Tanggal && l.Tanggal.includes(currentMonthStr) && l.Status === 'Disetujui');
    myLembur.forEach(l => { totalJamLembur += parseFloat(l['Durasi Jam'] || 0); });
  }
  let bonusLembur = totalJamLembur * tarifLembur;

  const isTunjanganHangus = (countAlfa > 0 || countSakitOpsiA > 0);
  const tunjanganCair = isTunjanganHangus ? 0 : tunjanganDatabase;

  const gajiKotor = gajiPokok + tunjanganCair + bonusLembur;

  let potTelatSOP = countTelatKelalaian * dendaTelat;
  let potAlfaSOP = countAlfa * upahHarian;
  let totalSanksiSOP = potTelatSOP + potAlfaSOP;

  if (totalSanksiSOP > (gajiKotor / 2)) {
    totalSanksiSOP = gajiKotor / 2;
  }

  let totalPotonganKeseluruhan = totalSanksiSOP + totalPotonganLain;
  let estGaji = gajiKotor - totalPotonganKeseluruhan;

  document.getElementById('empRealtimeSalary').innerText = 'Rp ' + estGaji.toLocaleString('id-ID');
  document.getElementById('empCurrentDeduction').innerText = 'Rp ' + totalPotonganKeseluruhan.toLocaleString('id-ID');

  let todayCode = getShiftForEmp(myProfile, todayStr);
  let shiftText = todayCode === 'P' ? '🌅 Pagi' : todayCode === 'S' ? '🌇 Siang' : '🏖️ Libur';
  let shiftColor = todayCode === 'P' ? 'text-emerald-500' : todayCode === 'S' ? 'text-amber-500' : 'text-rose-500';
  document.getElementById('empTodayShift').innerHTML = `<span class="${shiftColor}">${shiftText}</span>`;

  renderPengajuanEmployee();
  renderJadwalKaryawan(myProfile);
  renderRiwayatAbsensi(myAtt);
}

function renderJadwalKaryawan(empProfile) {
  const el = document.getElementById('empJadwalList');
  if (!el) return;

  let html = '';
  const today = new Date();
  const hariList = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  for (let i = 0; i < 7; i++) {
    let d = new Date(today);
    d.setDate(today.getDate() + i);
    let dateStr = formatDateToDDMMYYYY(d);
    let dayName = i === 0 ? 'Hari Ini' : hariList[d.getDay()];

    let code = getShiftForEmp(empProfile, dateStr);
    let bgCode = code === 'P' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' :
      code === 'S' ? 'bg-amber-50 border-amber-100 text-amber-700' :
        'bg-rose-50 border-rose-100 text-rose-700';
    let iconCode = code === 'P' ? 'fa-sun text-emerald-500' :
      code === 'S' ? 'fa-cloud-sun text-amber-500' :
        'fa-mug-hot text-rose-500';

    let textStatus = code === 'P' ? 'PAGI (08:00 - 18:00)' :
      code === 'S' ? 'SIANG (12:00 - 22:00)' :
        'Libur / Off';

    html += `
    <div class="flex items-center justify-between p-3.5 rounded-2xl border ${bgCode} shadow-sm mb-3">
        <div class="flex items-center gap-3">
            <div class="w-10 h-10 rounded-full bg-white flex items-center justify-center shadow-sm">
                <i class="fa-solid ${iconCode}"></i>
            </div>
            <div>
                <p class="text-sm font-bold">${dayName}</p>
                <p class="text-[10px] opacity-80">${dateStr}</p>
            </div>
        </div>
        <div class="text-right">
            <p class="text-xs font-black uppercase tracking-wider">${textStatus}</p>
        </div>
    </div>`;
  }
  el.innerHTML = html;
}

function showAttDetailModal(attId) {
  const att = state.data.Attendance.find(x => x.ID === attId);
  if (!att) return;

  document.getElementById('attDetailDate').innerText = att.Tanggal;
  document.getElementById('attDetailIn').innerText = att['Jam Masuk'] || '--:--';

  let jamPulang = att['Jam Pulang'] ? att['Jam Pulang'].trim() : '';
  document.getElementById('attDetailOut').innerText = jamPulang || '--:--';

  const todayStr = formatDateToDDMMYYYY(new Date());
  let finalStatus = att['Status Kehadiran'] || 'Hadir';
  if (jamPulang === '' && att.Tanggal !== todayStr) {
    finalStatus = 'Auto-Alfa (Lupa Pulang)';
  }

  const statusBadge = document.getElementById('attDetailStatusBadge');
  statusBadge.innerText = finalStatus;

  if (finalStatus.includes('Alfa')) {
    statusBadge.className = 'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-rose-500/90 text-white backdrop-blur-sm';
  } else if (finalStatus === 'Telat') {
    statusBadge.className = 'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500/90 text-white backdrop-blur-sm';
  } else {
    statusBadge.className = 'px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider bg-emerald-500/90 text-white backdrop-blur-sm';
  }

  const photoImg = document.getElementById('attDetailPhoto');
  photoImg.src = att['Foto Absensi'] || '';

  const mapsBtn = document.getElementById('attDetailMapsBtn');
  if (att['Lokasi Maps']) {
    mapsBtn.href = att['Lokasi Maps'];
    mapsBtn.classList.remove('hidden');
  } else {
    mapsBtn.classList.add('hidden');
  }

  openModal('modal-emp-att-detail');
}

function renderRiwayatAbsensi(myAtt) {
  const el = document.getElementById('empAttendanceHistoryList');
  if (!el) return;

  if (!myAtt || myAtt.length === 0) {
    el.innerHTML = `<div class="text-center text-xs text-gray-400 py-4 bg-white rounded-2xl border border-gray-50 shadow-sm">Belum ada riwayat absensi bulan ini.</div>`;
    return;
  }

  let sortedAtt = [...myAtt].sort((a, b) => {
    let pa = a.Tanggal.split('/'); let pb = b.Tanggal.split('/');
    return new Date(pb[2], pb[1] - 1, pb[0]) - new Date(pa[2], pa[1] - 1, pa[0]);
  }).slice(0, 5);

  let html = '';
  const todayStr = formatDateToDDMMYYYY(new Date());

  sortedAtt.forEach(a => {
    let status = a['Status Kehadiran'] || 'Hadir';
    let jamPulang = a['Jam Pulang'] ? a['Jam Pulang'].trim() : '';
    let isLupaPulang = (jamPulang === '');

    if (isLupaPulang && a.Tanggal !== todayStr) {
      status = 'Auto-Alfa';
    }

    let statusColor = status === 'Telat' ? 'text-amber-600 bg-amber-50 border-amber-200' :
      (status.includes('Alfa') ? 'text-rose-600 bg-rose-50 border-rose-200' : 'text-emerald-600 bg-emerald-50 border-emerald-200');
    let inTime = a['Jam Masuk'] || '--:--';
    let outTime = jamPulang || '--:--';

    html += `
    <div onclick="showAttDetailModal('${a.ID}')" class="bg-white rounded-2xl p-3.5 shadow-sm border border-gray-100 mb-2.5 flex justify-between items-center hover:bg-gray-50 transition-all cursor-pointer group">
        <div class="flex items-center gap-3">
            <div class="w-9 h-9 rounded-full bg-brandPink/10 text-brandPink flex items-center justify-center text-xs shadow-inner">
                <i class="fa-solid fa-camera"></i>
            </div>
            <div>
                <p class="text-xs font-bold text-brandText mb-1">${a.Tanggal}</p>
                <p class="text-[10px] text-gray-500 font-medium">
                  <span class="mr-2"><i class="fa-solid fa-arrow-right-to-bracket text-emerald-400"></i> ${inTime}</span>
                  <span><i class="fa-solid fa-arrow-right-from-bracket text-rose-400"></i> ${outTime}</span>
                </p>
            </div>
        </div>
        <div class="flex items-center gap-2">
            <span class="px-2.5 py-1 rounded-lg text-[10px] font-bold border shadow-sm ${statusColor}">${status}</span>
            <i class="fa-solid fa-chevron-right text-gray-300 text-xs group-hover:text-brandPink transition-colors"></i>
        </div>
    </div>`;
  });
  el.innerHTML = html;
}

function onChangeJenisPengajuan() {
  const jenis = document.getElementById('formReqJenis').value;
  const wrapTgl2 = document.getElementById('wrapTgl2');
  const wrapShift = document.getElementById('wrapShiftTujuan');
  const wrapLembur = document.getElementById('wrapLembur');
  const lblTgl1 = document.getElementById('lblReqTgl1');
  const inputTgl2 = document.getElementById('formReqTgl2');
  const inputDurasi = document.getElementById('formReqDurasi');
  const infoEl = document.getElementById('currentShiftInfo');

  if (jenis === 'Tukar Hari Libur') {
    wrapTgl2.classList.remove('hidden');
    wrapShift.classList.add('hidden');
    if (wrapLembur) wrapLembur.classList.add('hidden');
    lblTgl1.innerText = "Tanggal Libur Asli";
    inputTgl2.required = true;
    if (inputDurasi) inputDurasi.required = false;
    if (infoEl) infoEl.classList.add('hidden');
  } else if (jenis === 'Tukar Waktu Shift') {
    wrapTgl2.classList.add('hidden');
    wrapShift.classList.remove('hidden');
    if (wrapLembur) wrapLembur.classList.add('hidden');
    lblTgl1.innerText = "Tanggal Shift";
    inputTgl2.required = false;
    if (inputDurasi) inputDurasi.required = false;
    checkCurrentShift();
  } else if (jenis === 'Lembur') {
    wrapTgl2.classList.add('hidden');
    wrapShift.classList.add('hidden');
    if (wrapLembur) wrapLembur.classList.remove('hidden');
    lblTgl1.innerText = "Tanggal Lembur";
    inputTgl2.required = false;
    if (inputDurasi) inputDurasi.required = true;
    if (infoEl) infoEl.classList.add('hidden');
  }
}

function checkCurrentShift() {
  const dateInput = document.getElementById('formReqTgl1').value;
  const infoEl = document.getElementById('currentShiftInfo');
  const targetSelect = document.getElementById('formReqShiftTujuan');
  const jenis = document.getElementById('formReqJenis').value;

  if (!dateInput || jenis !== 'Tukar Waktu Shift') {
    if (infoEl) infoEl.classList.add('hidden');
    return;
  }

  const d = new Date(dateInput);
  const dateStr = formatDateToDDMMYYYY(d);
  const myProfile = state.data.Employee.find(e => e.Nama === state.auth.name) || {};
  const currentCode = getShiftForEmp(myProfile, dateStr);

  let textCode = currentCode === 'P' ? 'PAGI (08:00 - 18:00)' : (currentCode === 'S' ? 'SIANG (12:00 - 22:00)' : 'LIBUR / OFF');

  if (infoEl) {
    infoEl.innerHTML = `<i class="fa-solid fa-circle-info mr-1"></i> Jadwal Saat Ini: <strong>${textCode}</strong>`;
    infoEl.classList.remove('hidden');
  }

  if (currentCode === 'P') {
    targetSelect.value = 'S';
  } else if (currentCode === 'S') {
    targetSelect.value = 'P';
  }
}

async function handlePengajuanJadwal(e) {
  e.preventDefault();
  let jenis = document.getElementById('formReqJenis').value;
  let tgl1 = document.getElementById('formReqTgl1').value;
  let tgl2 = document.getElementById('formReqTgl2').value;
  let alasan = document.getElementById('formReqAlasan').value;

  if (!tgl1 || !alasan) return;

  Swal.fire({ title: 'Mengajukan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

  try {
    if (jenis === 'Lembur') {
      let durasi = document.getElementById('formReqDurasi').value;
      if (!durasi) { Swal.fire('Oops', 'Isi durasi jam lembur!', 'warning'); return; }

      const lmbId = 'LMB-' + Date.now().toString().slice(-6);
      const { error } = await supabaseClient.from('lembur').insert([{
        id: lmbId,
        tanggal: formatDateToDDMMYYYY(new Date(tgl1)),
        nama_karyawan: state.auth.name,
        durasi_jam: parseFloat(durasi),
        keterangan: alasan,
        status: 'Pending'
      }]);

      if (error) throw error;
      Swal.fire('Sukses', 'Pengajuan lembur berhasil dikirim!', 'success');
      e.target.reset();
      loadEmployeeData();
      return;
    }

    if (jenis === 'Tukar Hari Libur' && !tgl2) {
      Swal.fire('Oops', 'Isi tukar ke tanggal!', 'warning');
      return;
    }

    let shiftTujuan = jenis === 'Tukar Hari Libur' ? 'L' : document.getElementById('formReqShiftTujuan').value;

    if (jenis === 'Tukar Waktu Shift') {
      const dateStr = formatDateToDDMMYYYY(new Date(tgl1));
      const myProfile = state.data.Employee.find(x => x.Nama === state.auth.name) || {};
      const currentCode = getShiftForEmp(myProfile, dateStr);
      if (currentCode === shiftTujuan) {
        Swal.fire('Ditolak Sistem', 'Tujuan tukar shift tidak boleh sama dengan jadwal Anda saat ini di tanggal tersebut!', 'warning');
        return;
      }
    }

    const reqId = 'REQ-' + Date.now().toString().slice(-6);
    const { error } = await supabaseClient.from('perubahan_jadwal').insert([{
      id: reqId,
      nama_karyawan: state.auth.name,
      jenis: jenis,
      tgl_1: formatDateToDDMMYYYY(new Date(tgl1)),
      tgl_2: tgl2 ? formatDateToDDMMYYYY(new Date(tgl2)) : "",
      shift_tujuan: shiftTujuan,
      alasan: alasan,
      status: 'Pending'
    }]);

    if (error) throw error;
    Swal.fire('Sukses', 'Pengajuan jadwal berhasil dikirim!', 'success');
    e.target.reset();
    document.getElementById('currentShiftInfo').classList.add('hidden');
    loadEmployeeData();
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

function renderPengajuanEmployee() {
  const el = document.getElementById('empReqHistoryList');
  if (!el) return;
  const me = state.auth.name;

  let myReq = [];
  if (state.data.PerubahanJadwal) myReq = myReq.concat(state.data.PerubahanJadwal.filter(c => c['Nama Karyawan'] === me));

  if (state.data.Lembur) {
    let myLembur = state.data.Lembur.filter(c => c['Nama Karyawan'] === me).map(l => ({
      ID: l.ID, Status: l.Status, Jenis: 'Lembur', 'Tgl 1': l.Tanggal, 'Durasi Jam': l['Durasi Jam'], Alasan: l.Keterangan
    }));
    myReq = myReq.concat(myLembur);
  }

  checkNotifications(myReq);

  if (myReq.length === 0) {
    el.innerHTML = `<div class="text-center text-xs text-gray-400 py-4 bg-white rounded-2xl border border-gray-50 shadow-sm">Belum ada riwayat pengajuan</div>`;
    return;
  }

  myReq.sort((a, b) => {
    let numA = parseInt(a.ID.split('-')[1] || 0); let numB = parseInt(b.ID.split('-')[1] || 0);
    return numB - numA;
  });

  let html = '';
  myReq.forEach(c => {
    let bg = 'bg-gray-50 text-gray-600 border-gray-100';
    if (c.Status === 'Pending' || c.Status === 'Minta Batal') bg = 'bg-amber-50 text-amber-700 border-amber-200';
    else if (c.Status === 'Disetujui') bg = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    else if (c.Status === 'Ditolak' || c.Status === 'Dibatalkan') bg = 'bg-rose-50 text-rose-700 border-rose-200';

    let detailStr = "";
    if (c.Jenis === 'Tukar Hari Libur') {
      detailStr = `Tukar Libur <span class="font-bold text-brandText">${c['Tgl 1']}</span> <i class="fa-solid fa-arrow-right text-[10px] mx-1 text-brandPink"></i> <span class="font-bold text-brandText">${c['Tgl 2']}</span>`;
    } else if (c.Jenis === 'Tukar Waktu Shift') {
      let targetShiftText = c['Shift Tujuan'] === 'P' ? 'PAGI' : (c['Shift Tujuan'] === 'S' ? 'SIANG' : c['Shift Tujuan']);
      detailStr = `Tukar Shift tgl <span class="font-bold text-brandText">${c['Tgl 1']}</span> <i class="fa-solid fa-arrow-right text-[10px] mx-1 text-brandPink"></i> Ke <span class="font-bold text-brandText">${targetShiftText}</span>`;
    } else if (c.Jenis === 'Lembur') {
      detailStr = `Lembur <span class="font-bold text-brandText">${c['Tgl 1']}</span> <i class="fa-solid fa-arrow-right text-[10px] mx-1 text-brandPink"></i> Durasi: <span class="font-bold text-brandText">${c['Durasi Jam']} Jam</span>`;
    }

    html += `<div class="bg-white rounded-2xl p-4 shadow-sm border border-gray-50 mb-3"><div class="flex justify-between items-start mb-2"><span class="px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider border ${bg}">${c.Status}</span><span class="text-[10px] font-bold text-gray-400 bg-gray-100 px-2.5 py-1 rounded-lg border border-gray-200 shadow-sm">${c.Jenis}</span></div><p class="text-xs text-gray-500 mb-1">${detailStr}</p><p class="text-[11px] text-gray-400 italic font-medium leading-relaxed">"${c.Alasan}"</p></div>`;
  });
  el.innerHTML = html;
}

function renderNav() {
  const nav = document.getElementById('navMenu'); if (!nav) return;
  nav.innerHTML = menuItems.map(item => `
    <a href="#" onclick="switchView('${item.id}')" class="flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${state.view === item.id ? 'bg-brandPink text-white shadow-md font-bold' : 'text-gray-600 hover:bg-brandPink/10 hover:text-brandPink'}">
      <i class="fa-solid ${item.icon} w-5 text-center"></i><span class="text-sm">${item.label}</span>
    </a>
  `).join('');
}

function toggleSalaryVisibility() {
  const salaryEl = document.getElementById('empRealtimeSalary');
  const dedEl = document.getElementById('empCurrentDeduction');
  const icon = document.getElementById('eyeIconSalary');
  salaryEl.classList.toggle('unblurred');
  dedEl.classList.toggle('unblurred');
  if (salaryEl.classList.contains('unblurred')) {
    icon.classList.replace('fa-eye-slash', 'fa-eye');
  } else {
    icon.classList.replace('fa-eye', 'fa-eye-slash');
  }
}

function renderEmpPayrollHistory() {
  const el = document.getElementById('empPayrollList');
  if (!el) return;
  const myPayrolls = state.data.Payroll ? state.data.Payroll.filter(p => p['Nama Karyawan'] === state.auth.name) : [];

  if (myPayrolls.length === 0) {
    el.innerHTML = `<div class="text-center text-xs text-gray-400 py-10 bg-gray-50 rounded-2xl border border-gray-100 shadow-inner">Belum ada riwayat slip gaji yang diterbitkan oleh Owner.</div>`;
    return;
  }

  myPayrolls.sort((a, b) => {
    let pa = a.Periode.split('/'); let pb = b.Periode.split('/');
    return new Date(pb[1], pb[0] - 1) - new Date(pa[1], pa[0] - 1);
  });

  let html = '';
  myPayrolls.forEach(p => {
    html += `
    <div class="bg-gray-50 rounded-2xl p-4 flex justify-between items-center border border-gray-100 mb-3 hover:bg-gray-100 transition-colors cursor-pointer shadow-sm hover:shadow-md" onclick="showEmpSlipDetail('${p.ID}')">
        <div class="flex items-center gap-4">
            <div class="w-10 h-10 rounded-full bg-brandPink/10 text-brandPink flex items-center justify-center shadow-inner"><i class="fa-solid fa-file-invoice-dollar"></i></div>
            <div>
                <p class="text-xs font-bold text-brandText mb-0.5">Periode ${p.Periode}</p>
                <p class="text-[10px] font-bold text-brandPink uppercase tracking-wide">Klik Buka Slip</p>
            </div>
        </div>
        <div class="text-right">
            <p class="text-[9px] text-gray-400 font-bold uppercase mb-0.5 tracking-widest">Total Diterima</p>
            <p class="text-sm font-black text-brandText">Rp ${Number(p['Total Gaji Bersih']).toLocaleString('id-ID')}</p>
        </div>
    </div>`;
  });
  el.innerHTML = html;
}

function showEmpSlipDetail(id) {
  const p = state.data.Payroll.find(x => x.ID === id);
  if (!p) return;

  document.getElementById('slip-periode').innerText = p.Periode;
  document.getElementById('slip-nama').innerText = p['Nama Karyawan'];
  document.getElementById('slip-gapok').innerText = 'Rp ' + Number(p['Gaji Pokok']).toLocaleString('id-ID');
  document.getElementById('slip-tunjangan').innerText = 'Rp ' + Number(p['Tunjangan']).toLocaleString('id-ID');

  document.getElementById('slip-uang-lembur').innerText = '+ Rp ' + Number(p['Uang Lembur'] || 0).toLocaleString('id-ID');

  document.getElementById('slip-pot-telat').innerText = '- Rp ' + Number(p['Potongan Telat']).toLocaleString('id-ID');
  document.getElementById('slip-pot-alfa').innerText = '- Rp ' + Number(p['Potongan Alfa']).toLocaleString('id-ID');
  let potLain = parseFloat(p['Potongan Lain'] || 0);
  document.getElementById('slip-pot-lain').innerText = '- Rp ' + potLain.toLocaleString('id-ID');

  document.getElementById('slip-total').innerText = 'Rp ' + Number(p['Total Gaji Bersih']).toLocaleString('id-ID');

  openModal('modal-emp-slip');
}

function showEmpSlipDetailOwner(id) {
  showEmpSlipDetail(id);
}

function switchEmpView(view) {
  document.querySelectorAll('.emp-view-section').forEach(el => el.classList.remove('active'));
  document.getElementById(`emp-view-${view}`).classList.add('active');
  document.querySelectorAll('#app-employee nav button').forEach(b => b.className = 'flex flex-col items-center gap-1 text-gray-400 hover:text-brandPink transition-colors w-1/3');
  document.getElementById(`empNav-${view}`).className = 'flex flex-col items-center gap-1 text-brandPink transition-colors w-1/3';
}

function openModal(id) { const m = document.getElementById(id); if (m) m.classList.remove('hidden'); }
function closeModal(id) { const m = document.getElementById(id); if (m) m.classList.add('hidden'); }
function openAddEmployeeModal() { const form = document.getElementById('formEmployee'); form.reset(); form.elements['ID'].value = ""; openModal('modal-employee'); }

function editEmployee(id) {
  const e = state.data.Employee.find(x => x.ID === id);
  if (!e) return;
  const form = document.getElementById('formEmployee');
  form.elements['ID'].value = e.ID;
  form.elements['Nama'].value = e.Nama;
  form.elements['Gaji Pokok'].value = e['Gaji Pokok'];
  form.elements['Tunjangan Kehadiran'].value = e['Tunjangan Kehadiran'];
  form.elements['Utang Hari'].value = e['Utang Hari'] || '0';
  form.elements['Status'].value = e.Status;
  form.elements['Peran'].value = e.Peran || 'Karyawan';
  form.elements['PIN'].value = e.PIN;

  if (e['Tgl Masuk']) {
    const p = e['Tgl Masuk'].split('/');
    if (p.length === 3) form.elements['Tgl Masuk'].value = `${p[2]}-${p[1]}-${p[0]}`;
  }

  ['Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab', 'Min'].forEach(day => {
    form.elements[`Shift ${day}`].value = e[`Shift ${day}`] || 'L';
  });

  openModal('modal-employee');
}

function populateDropdowns() {
  const emps = state.data.Employee.filter(e => e.Status === 'Aktif' && e.Peran !== 'Owner');

  const attSelect = document.getElementById('attEmpSelect');
  if (attSelect) attSelect.innerHTML = emps.map(e => `<option value="${e.Nama}">${e.Nama}</option>`).join('');

  const potSelect = document.getElementById('potEmpSelect');
  if (potSelect) potSelect.innerHTML = emps.map(e => `<option value="${e.Nama}">${e.Nama}</option>`).join('');
}

function openModalPotongan() {
  document.getElementById('formPotongan').reset();
  populateDropdowns();
  openModal('modal-potongan');
}

async function handlePotonganSubmit(e) {
  e.preventDefault();
  let tgl = document.getElementById('potTanggal').value;
  if (!tgl) return;

  const potId = 'POT-' + Date.now().toString().slice(-6);
  let payload = {
    id: potId,
    tanggal: formatDateToDDMMYYYY(new Date(tgl)),
    nama_karyawan: document.getElementById('potEmpSelect').value,
    jenis: document.getElementById('potJenis').value,
    nominal: parseFloat(document.getElementById('potNominal').value || 0),
    keterangan: document.getElementById('potKeterangan').value
  };

  Swal.fire({ title: 'Menyimpan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
  try {
    const { error } = await supabaseClient.from('potongan').insert([payload]);
    if (error) throw error;
    Swal.fire('Sukses', 'Data kasbon/potongan berhasil dicatat!', 'success');
    closeModal('modal-potongan');
    loadData();
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

async function handleFormSubmit(e, sheetName) {
  e.preventDefault();
  const formData = new FormData(e.target);
  const data = Object.fromEntries(formData.entries());

  if (sheetName === 'Attendance') {
    if (data.Tanggal) data.Tanggal = formatDateToDDMMYYYY(new Date(data.Tanggal));
    Swal.fire({ title: 'Menyimpan Absensi...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      let existingId = data.ID;
      if (!existingId) {
        const { data: existing } = await supabaseClient
          .from('attendance')
          .select('id')
          .eq('tanggal', data.Tanggal)
          .eq('nama_karyawan', data['Nama Karyawan'])
          .maybeSingle();
        if (existing) existingId = existing.id;
      }

      if (existingId) {
        await supabaseClient.from('attendance').update({
          jam_masuk: data['Jam Masuk'] || "",
          jam_pulang: data['Jam Pulang'] || "",
          status_kehadiran: data['Status Kehadiran'] || "Hadir",
          sub_status: data['Sub-Status'] || ""
        }).eq('id', existingId);
      } else {
        const attId = 'ATT-' + Date.now().toString().slice(-6);
        await supabaseClient.from('attendance').insert([{
          id: attId,
          tanggal: data.Tanggal,
          nama_karyawan: data['Nama Karyawan'],
          jam_masuk: data['Jam Masuk'] || "",
          jam_pulang: data['Jam Pulang'] || "",
          status_kehadiran: data['Status Kehadiran'] || "Hadir",
          sub_status: data['Sub-Status'] || "",
          lokasi_maps: "",
          foto_absensi: ""
        }]);
      }
      Swal.fire('Sukses', 'Absensi berhasil disimpan.', 'success');
      closeModal('modal-attendance');
      loadData();
    } catch (err) {
      Swal.fire('Error Supabase', err.message, 'error');
    }
    return;
  }

  if (sheetName === 'Employee') {
    if (data['Tgl Masuk']) data['Tgl Masuk'] = formatDateToDDMMYYYY(new Date(data['Tgl Masuk']));
    Swal.fire({ title: 'Menyimpan Data Karyawan...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });
    try {
      const empPayload = {
        nama: data.Nama,
        tgl_masuk: data['Tgl Masuk'] || "",
        gaji_pokok: parseFloat(data['Gaji Pokok'] || 0),
        tunjangan_kehadiran: parseFloat(data['Tunjangan Kehadiran'] || 0),
        utang_hari: parseInt(data['Utang Hari'] || 0),
        status: data.Status || "Aktif",
        pin: data.PIN,
        peran: data.Peran || "Karyawan",
        shift_sen: data['Shift Sen'] || "L",
        shift_sel: data['Shift Sel'] || "L",
        shift_rab: data['Shift Rab'] || "L",
        shift_kam: data['Shift Kam'] || "L",
        shift_jum: data['Shift Jum'] || "L",
        shift_sab: data['Shift Sab'] || "L",
        shift_min: data['Shift Min'] || "L"
      };

      if (data.ID) {
        await supabaseClient.from('employees').update(empPayload).eq('id', data.ID);
      } else {
        empPayload.id = 'EMP-' + Date.now().toString().slice(-6);
        await supabaseClient.from('employees').insert([empPayload]);
      }

      Swal.fire('Sukses', 'Data Karyawan berhasil disimpan!', 'success');
      closeModal('modal-employee');
      loadData();
    } catch (err) {
      Swal.fire('Error Supabase', err.message, 'error');
    }
  }
}

function toggleSubStatus() {
  const attStatus = document.getElementById('attStatus').value;
  const subContainer = document.getElementById('subStatusContainer');
  const subSelect = document.getElementById('attSubStatus');

  if (attStatus === 'Sakit') {
    subSelect.innerHTML = `<option value="Opsi A (Profesional - Tunj. Hangus)">Opsi A (Profesional - Tunj. Hangus)</option><option value="Opsi B (Kekeluargaan - Utang Hari)">Opsi B (Kekeluargaan - Utang Hari)</option>`;
    subContainer.classList.remove('hidden');
  } else if (attStatus === 'Telat') {
    subSelect.innerHTML = `<option value="Kelalaian (<= 30m)">Kelalaian <= 30m (Denda Potongan)</option><option value="Musibah (Rp 0 - Ada Bukti)">Musibah (Rp 0 - Ada Bukti)</option><option value="> 30m (Auto Alfa & Hangus)">Lebih 30m (Auto Alfa & Hangus)</option>`;
    subContainer.classList.remove('hidden');
  } else if (attStatus === 'Izin') {
    subSelect.innerHTML = `<option value="Izin Darurat Resmi">Izin Darurat Resmi</option><option value="Izin Tanpa Alasan">Izin Tanpa Alasan</option>`;
    subContainer.classList.remove('hidden');
  } else {
    subSelect.innerHTML = '';
    subContainer.classList.add('hidden');
  }
}

function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const p1 = lat1 * Math.PI / 180;
  const p2 = lat2 * Math.PI / 180;
  const dp = (lat2 - lat1) * Math.PI / 180;
  const dl = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dp / 2) * Math.sin(dp / 2) + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) * Math.sin(dl/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function checkNotifications(myReq) {
  const notifBadge = document.getElementById('notifBadge');
  const notifListEl = document.getElementById('notifList');
  if (!notifBadge || !notifListEl) return;

  const processedReq = myReq.filter(r => r.Status !== 'Pending' && r.Status !== 'Minta Batal');

  processedReq.sort((a, b) => {
    let numA = parseInt(a.ID.split('-')[1] || 0);
    let numB = parseInt(b.ID.split('-')[1] || 0);
    return numB - numA;
  });

  const cacheKey = 'ara_notif_read_' + state.auth.name;
  const lastReadState = JSON.parse(localStorage.getItem(cacheKey)) || [];

  let unreadCount = 0;
  let html = '';

  if (processedReq.length === 0) {
    html = `<div class="text-center text-xs text-gray-400 py-10 bg-gray-50 rounded-2xl border border-gray-50">Belum ada notifikasi baru untuk Anda.</div>`;
  } else {
    processedReq.forEach(req => {
      const isRead = lastReadState.some(saved => saved.id === req.ID && saved.status === req.Status);
      if (!isRead) unreadCount++;

      let iconColor = req.Status === 'Disetujui' ? 'text-emerald-500 bg-emerald-50' : 'text-rose-500 bg-rose-50';
      let iconSign = req.Status === 'Disetujui' ? 'fa-circle-check' : 'fa-circle-xmark';
      let dotUnread = !isRead ? `<div class="w-2 h-2 rounded-full bg-red-500 shadow-sm shrink-0"></div>` : '';

      let msg = '';
      if (req.Jenis === 'Tukar Waktu Shift') {
        let targetText = req['Shift Tujuan'] === 'P' ? 'PAGI' : (req['Shift Tujuan'] === 'S' ? 'SIANG' : req['Shift Tujuan']);
        msg = `Pengajuan Tukar Waktu Shift Anda pada tgl <b>${req['Tgl 1']}</b> (ke <b>${targetText}</b>) telah <span class="font-bold ${req.Status === 'Disetujui' ? 'text-emerald-600' : 'text-rose-600'}">${req.Status}</span> oleh Owner.`;
      } else if (req.Jenis === 'Tukar Hari Libur') {
        msg = `Pengajuan Tukar Libur Anda pada tgl <b>${req['Tgl 1']}</b> telah <span class="font-bold ${req.Status === 'Disetujui' ? 'text-emerald-600' : 'text-rose-600'}">${req.Status}</span> oleh Owner.`;
      } else if (req.Jenis === 'Lembur') {
        msg = `Pengajuan Lembur Anda pada tgl <b>${req['Tgl 1']}</b> (Durasi: <b>${req['Durasi Jam']} Jam</b>) telah <span class="font-bold ${req.Status === 'Disetujui' ? 'text-emerald-600' : 'text-rose-600'}">${req.Status}</span> oleh Owner.`;
      }

      html += `
      <div class="flex items-start gap-3 p-3.5 rounded-2xl border ${isRead ? 'bg-white border-gray-100 hover:bg-gray-50' : 'bg-brandPink/5 border-brandPink/20 shadow-sm'} transition-colors mb-2">
          <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${iconColor} shadow-inner text-lg"><i class="fa-solid ${iconSign}"></i></div>
          <div class="flex-1 text-[11px] text-gray-600 leading-relaxed">${msg}</div>
          ${dotUnread}
      </div>`;
    });
  }

  notifListEl.innerHTML = html;

  if (unreadCount > 0) notifBadge.classList.remove('hidden');
  else notifBadge.classList.add('hidden');

  window.currentUnreadState = processedReq.map(r => ({ id: r.ID, status: r.Status }));
}

function showNotifModal() {
  document.getElementById('notifBadge').classList.add('hidden');

  if (window.currentUnreadState) {
    const cacheKey = 'ara_notif_read_' + state.auth.name;
    localStorage.setItem(cacheKey, JSON.stringify(window.currentUnreadState));
  }

  const me = state.auth.name;
  let myReq = [];
  if (state.data.PerubahanJadwal) myReq = myReq.concat(state.data.PerubahanJadwal.filter(c => c['Nama Karyawan'] === me));
  if (state.data.Lembur) {
    let myLembur = state.data.Lembur.filter(c => c['Nama Karyawan'] === me).map(l => ({
      ID: l.ID, Status: l.Status, Jenis: 'Lembur', 'Tgl 1': l.Tanggal, 'Durasi Jam': l['Durasi Jam'], Alasan: l.Keterangan
    }));
    myReq = myReq.concat(myLembur);
  }
  checkNotifications(myReq);

  openModal('modal-emp-notif');
}

function submitAbsensi(e) {
  e.preventDefault();
  const namaUser = document.getElementById('empGreetingName').innerText.trim();
  const jenisAbsen = document.querySelector('input[name="jenisAbsen"]:checked').value;
  const photoData = document.getElementById('compressedPhotoData').value;

  if (!photoData) { Swal.fire('Oops', 'Wajib ambil foto bukti di lokasi kerja!', 'warning'); return; }

  const todayStr = formatDateToDDMMYYYY(new Date());
  const myProfile = state.data.Employee.find(x => x.Nama === namaUser) || {};
  const currentCode = getShiftForEmp(myProfile, todayStr);
  const now = new Date();
  let currentHour = now.getHours() + (now.getMinutes() / 60);

  if (jenisAbsen === 'Masuk') {
    let targetStartHour = currentCode === 'P' ? 8 : (currentCode === 'S' ? 12 : null);

    if (targetStartHour !== null && currentHour < targetStartHour) {
      let earlyHours = targetStartHour - currentHour;
      earlyHours = Math.round(earlyHours * 10) / 10;

      if (earlyHours > 0.75) {
        Swal.fire({
          title: '🌅 Terdeteksi Lembur Awal!',
          html: `Jadwal masuk shift Anda adalah jam <b>${targetStartHour}:00</b>, namun Anda absen pada jam <b>${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b> (Lebih awal <b>${earlyHours} Jam</b>).<br><br>Apakah Anda mendapat penugasan <b>Lembur Awal</b> (Persiapan Khusus)?`,
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#ff8fa3',
          cancelButtonColor: '#9ca3af',
          confirmButtonText: '<i class="fa-solid fa-business-time mr-1"></i> Ya, Ajukan Lembur',
          cancelButtonText: 'Tidak, Hanya Rajin',
          reverseButtons: true
        }).then((result) => {
          let triggerLembur = result.isConfirmed;
          let durasiLembur = triggerLembur ? earlyHours : 0;
          executeAbsensiProses(namaUser, jenisAbsen, photoData, triggerLembur, durasiLembur);
        });
        return;
      }
    }
  } else if (jenisAbsen === 'Pulang') {
    let targetEndHour = currentCode === 'P' ? 18 : (currentCode === 'S' ? 22 : null);

    if (targetEndHour !== null) {
      if (currentHour < 6) currentHour += 24;

      if (currentHour > targetEndHour) {
        let overtimeHours = currentHour - targetEndHour;
        overtimeHours = Math.round(overtimeHours * 10) / 10;

        if (overtimeHours >= 0.5) {
          Swal.fire({
            title: '⏰ Terdeteksi Jam Ekstra!',
            html: `Jadwal pulang shift Anda adalah jam <b>${targetEndHour}:00</b>, namun Anda absen pada jam <b>${now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</b> (Lebih <b>${overtimeHours} Jam</b>).<br><br>Apakah durasi tambahan ini akan diajukan sebagai <b>Lembur</b>?`,
            icon: 'question',
            showCancelButton: true,
            confirmButtonColor: '#ff8fa3',
            cancelButtonColor: '#9ca3af',
            confirmButtonText: '<i class="fa-solid fa-business-time mr-1"></i> Ya, Ajukan Lembur',
            cancelButtonText: 'Hanya Telat Pulang',
            reverseButtons: true
          }).then((result) => {
            let triggerLembur = result.isConfirmed;
            let durasiLembur = triggerLembur ? overtimeHours : 0;
            executeAbsensiProses(namaUser, jenisAbsen, photoData, triggerLembur, durasiLembur);
          });
          return;
        }
      }
    }
  }

  executeAbsensiProses(namaUser, jenisAbsen, photoData, false, 0);
}

async function uploadBase64ToSupabaseStorage(base64Data, filename) {
  try {
    const res = await fetch(base64Data);
    const blob = await res.blob();
    const filePath = `${filename}.jpg`;

    const { error } = await supabaseClient
      .storage
      .from('absensi_photos')
      .upload(filePath, blob, { contentType: 'image/jpeg', upsert: true });

    if (error) throw error;

    const { data } = supabaseClient
      .storage
      .from('absensi_photos')
      .getPublicUrl(filePath);

    return data.publicUrl;
  } catch (err) {
    console.warn("Storage upload fallback:", err.message);
    return base64Data;
  }
}

function executeAbsensiProses(namaUser, jenisAbsen, photoData, triggerLembur, durasiLembur) {
  const timeNow = new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });

  if (!navigator.geolocation) {
    Swal.fire('Error', 'Browser tidak mendukung deteksi lokasi.', 'error');
    return;
  }

  Swal.fire({
    title: `Memproses Absen ${jenisAbsen}...`,
    text: 'Mencari titik koordinat GPS & Memvalidasi Akurasi...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const lat = position.coords.latitude;
      const long = position.coords.longitude;
      const accuracy = position.coords.accuracy;

      if (accuracy > 70) {
        Swal.fire('Sinyal GPS Tidak Akurat', `Akurasi perangkat Anda terdeteksi ${Math.round(accuracy)} meter.\n\nSistem menolak absen untuk mencegah Fake GPS. Mohon aktifkan High Accuracy Mode, pastikan berada di area terbuka, lalu coba lagi.`, 'warning');
        return;
      }

      const latSalon = parseFloat(state.settings['Lat Salon'] || -8.583333);
      const longSalon = parseFloat(state.settings['Long Salon'] || 115.283333);
      const batasRadius = parseFloat(state.settings['Batas Radius'] || 50);
      const jarak = calculateDistance(lat, long, latSalon, longSalon);

      if (jarak > batasRadius) {
        Swal.fire('Akses Ditolak (Di Luar Radius)', `Anda terdeteksi sejauh ${Math.round(jarak)} meter dari Salon.\nBatas absen maksimal adalah ${batasRadius} meter.\n\nSilakan merapat ke Salon.`, 'error');
        return;
      }

      try {
        const todayStr = formatDateToDDMMYYYY(new Date());
        const photoFileName = `Absen_${namaUser.replace(/\s+/g, '_')}_${Date.now()}`;
        const photoUrl = await uploadBase64ToSupabaseStorage(photoData, photoFileName);
        const mapsUrl = `https://www.google.com/maps?q=${lat},${long}`;

        const { data: existingAtt } = await supabaseClient
          .from('attendance')
          .select('id, jam_masuk')
          .eq('tanggal', todayStr)
          .eq('nama_karyawan', namaUser)
          .maybeSingle();

        if (existingAtt) {
          await supabaseClient.from('attendance').update({
            jam_pulang: timeNow,
            foto_absensi: photoUrl
          }).eq('id', existingAtt.id);
        } else {
          const newAttId = 'ATT-' + Date.now().toString().slice(-6);
          await supabaseClient.from('attendance').insert([{
            id: newAttId,
            tanggal: todayStr,
            nama_karyawan: namaUser,
            jam_masuk: timeNow,
            jam_pulang: "",
            status_kehadiran: "Hadir",
            sub_status: "",
            lokasi_maps: mapsUrl,
            foto_absensi: photoUrl
          }]);
        }

        let successMsg = `Absen ${jenisAbsen} berhasil dicatat!\n(Jarak Anda: ${Math.round(jarak)} Meter)`;

        if (triggerLembur) {
          Swal.fire({
            title: 'Absen Sukses!',
            text: successMsg + '\n\nSistem sedang mengarahkan Anda ke Form Pengajuan Lembur...',
            icon: 'success',
            timer: 2500,
            showConfirmButton: false
          }).then(() => {
            switchEmpView('pengajuan');
            document.getElementById('formReqJenis').value = 'Lembur';
            onChangeJenisPengajuan();
            document.getElementById('formReqTgl1').value = formatDateToYYYYMMDD(new Date());
            document.getElementById('formReqDurasi').value = durasiLembur;
            document.getElementById('formReqAlasan').focus();
          });
        } else {
          Swal.fire('Sukses', successMsg, 'success');
        }

        loadEmployeeData();
        document.getElementById('absensiForm').reset();
        document.getElementById('photoPreview').classList.add('hidden');
        document.getElementById('photoPlaceholder').classList.remove('hidden');
        document.getElementById('compressedPhotoData').value = '';
      } catch (err) {
        Swal.fire('Error Supabase', err.message, 'error');
      }
    },
    (error) => {
      let errorMsg = "Terjadi kesalahan tidak dikenal saat mengambil lokasi.";
      if (error.code === 1) errorMsg = "Akses lokasi ditolak. Anda WAJIB mengizinkan akses lokasi browser untuk melakukan absen.";
      else if (error.code === 2) errorMsg = "Sinyal GPS / Lokasi tidak tersedia. Coba pindah ke area terbuka.";
      else if (error.code === 3) errorMsg = "Waktu pencarian lokasi habis (Timeout). Koneksi terlalu lambat.";
      Swal.fire('Akses Ditolak / Gagal', errorMsg, 'error');
    },
    { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
  );
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
      let width = img.width;
      let height = img.height;
      if (width > MAX_WIDTH) {
        height = Math.round((height * MAX_WIDTH) / width);
        width = MAX_WIDTH;
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.6);
      document.getElementById('compressedPhotoData').value = dataUrl;
      const preview = document.getElementById('photoPreview');
      const placeholder = document.getElementById('photoPlaceholder');
      preview.src = dataUrl;
      preview.classList.remove('hidden');
      placeholder.classList.add('hidden');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

async function triggerGeneratePayroll() {
  const period = document.getElementById('payrollPeriod').value;
  if (!period) { Swal.fire('Oops', 'Pilih periode (Bulan & Tahun)!', 'warning'); return; }
  const formattedPeriod = `${period.split('-')[1]}/${period.split('-')[0]}`;

  Swal.fire({
    title: 'Menghitung Payroll...',
    text: 'Mengkalkulasi gaji, denda, dan tunjangan massal.',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  try {
    const emps = state.data.Employee.filter(e => e.Status === 'Aktif' && e.Peran !== 'Owner');

    const atts = state.data.Attendance.filter(a => {
      if (!a.Tanggal) return false;
      const parts = a.Tanggal.split('/');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}` === formattedPeriod;
      return false;
    });

    const potongans = state.data.Potongan.filter(p => {
      if (!p.Tanggal) return false;
      const parts = p.Tanggal.split('/');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}` === formattedPeriod;
      return false;
    });

    const lemburs = state.data.Lembur.filter(l => {
      if (!l.Tanggal || l.Status !== 'Disetujui') return false;
      const parts = l.Tanggal.split('/');
      if (parts.length === 3) return `${parts[1]}/${parts[2]}` === formattedPeriod;
      return false;
    });

    let payrollUpsertList = [];

    emps.forEach(emp => {
      const empName = emp.Nama;
      const gajiPokok = parseFloat(emp['Gaji Pokok'] || 0);
      const tunjanganDatabase = parseFloat(emp['Tunjangan Kehadiran'] || 0);

      const upahHarianKhusus = gajiPokok / 25;
      const upahLemburPerJam = gajiPokok / 250;
      const dendaTelatKelalaian = gajiPokok / 50;

      let countTelatKelalaian = 0;
      let countAlfa = 0;
      let countSakitOpsiA = 0;
      let totalPotonganLain = 0;
      let totalJamLembur = 0;

      atts.forEach(a => {
        if (a['Nama Karyawan'] === empName) {
          let jamPulang = a['Jam Pulang'] ? a['Jam Pulang'].toString().trim() : '';
          let isLupaPulang = (jamPulang === '');
          let status = a['Status Kehadiran'] || 'Hadir';
          let subStatus = a['Sub-Status'] || '';

          if (status === 'Alfa' || isLupaPulang) {
            countAlfa++;
          } else if (status === 'Telat') {
            if (subStatus.includes('Auto Alfa') || subStatus.includes('> 30m')) {
              countAlfa++;
            } else if (subStatus.includes('Musibah')) {
              // Musibah bebas denda
            } else {
              countTelatKelalaian++;
            }
          } else if (status === 'Sakit') {
            if (subStatus.includes('Opsi A')) {
              countSakitOpsiA++;
            }
          }
        }
      });

      potongans.forEach(p => {
        if (p['Nama Karyawan'] === empName) {
          totalPotonganLain += parseFloat(p.Nominal || 0);
        }
      });

      lemburs.forEach(l => {
        if (l['Nama Karyawan'] === empName) {
          totalJamLembur += parseFloat(l['Durasi Jam'] || 0);
        }
      });

      const uangLembur = totalJamLembur * upahLemburPerJam;
      const isTunjanganHangus = (countAlfa > 0 || countSakitOpsiA > 0);
      const tunjanganCair = isTunjanganHangus ? 0 : tunjanganDatabase;

      const totalPendapatanKotor = gajiPokok + tunjanganCair + uangLembur;

      let potTelat = countTelatKelalaian * dendaTelatKelalaian;
      let potAlfa = countAlfa * upahHarianKhusus;
      let totalPotonganSanksi = potTelat + potAlfa;

      const batasMaksimalPotongan = totalPendapatanKotor / 2;
      if (totalPotonganSanksi > batasMaksimalPotongan) {
        let scale = batasMaksimalPotongan / totalPotonganSanksi;
        potTelat = Math.round(potTelat * scale);
        potAlfa = Math.round(potAlfa * scale);
      }

      const totalGaji = totalPendapatanKotor - potTelat - potAlfa - totalPotonganLain;

      const existingRecord = state.data.Payroll.find(
        x => x.Periode === formattedPeriod && x['Nama Karyawan'] === empName
      );
      const payId = existingRecord ? existingRecord.ID : ('PAY-' + Date.now().toString().slice(-6) + Math.floor(Math.random() * 100));

      payrollUpsertList.push({
        id: payId,
        periode: formattedPeriod,
        nama_karyawan: empName,
        gaji_pokok: Math.round(gajiPokok),
        tunjangan: Math.round(tunjanganCair),
        uang_lembur: Math.round(uangLembur),
        potongan_telat: Math.round(potTelat),
        potongan_alfa: Math.round(potAlfa),
        potongan_lain: Math.round(totalPotonganLain),
        total_gaji_bersih: Math.round(totalGaji)
      });
    });

    const { error } = await supabaseClient
      .from('payroll')
      .upsert(payrollUpsertList, { onConflict: 'id' });

    if (error) throw error;

    Swal.fire('Proses Selesai!', `Berhasil mengkalkulasi ${payrollUpsertList.length} slip gaji untuk periode ${formattedPeriod}.`, 'success');
    loadData();
  } catch (err) {
    Swal.fire('Error Supabase', err.message, 'error');
  }
}

async function handleChangePIN(e) {
  e.preventDefault();
  const pinLama = document.getElementById('pinLama').value.trim();
  const pinBaru = document.getElementById('pinBaru').value.trim();
  const pinKonf = document.getElementById('pinKonfirmasi').value.trim();

  if (!/^\d{6}$/.test(pinBaru)) {
    Swal.fire('Format Salah', 'PIN baru WAJIB berisi 6 digit ANGKA saja!', 'warning');
    return;
  }
  if (pinBaru !== pinKonf) {
    Swal.fire('Gagal', 'Konfirmasi PIN Baru tidak cocok dengan PIN yang Anda buat!', 'warning');
    return;
  }
  if (pinLama === pinBaru) {
    Swal.fire('Info', 'PIN Baru tidak boleh sama persis dengan PIN Lama.', 'info');
    return;
  }

  Swal.fire({
    title: 'Menyimpan PIN...',
    text: 'Memperbarui akses Anda...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading()
  });

  const empName = state.auth.name;

  try {
    const { data: userRow, error: findErr } = await supabaseClient
      .from('employees')
      .select('id, pin')
      .eq('nama', empName)
      .maybeSingle();

    if (findErr || !userRow) throw new Error("Akses Ditolak: Data Akun tidak terdeteksi di database.");
    if (userRow.pin !== pinLama) throw new Error("PIN Saat Ini (Lama) yang Anda masukkan SALAH.");

    const { error: updErr } = await supabaseClient
      .from('employees')
      .update({ pin: pinBaru })
      .eq('id', userRow.id);

    if (updErr) throw updErr;

    Swal.fire('Berhasil Terkunci!', 'PIN berhasil diperbarui secara permanen.', 'success');
    document.getElementById('formGantiPin').reset();
    closeModal('modal-ganti-pin');

    if (state.auth.data) state.auth.data.PIN = pinBaru;
    localStorage.setItem('ara_auth', JSON.stringify(state.auth));
  } catch (err) {
    Swal.fire('Gagal Ganti PIN', err.message, 'error');
  }
}

function formatDateToYYYYMMDD(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateToDDMMYYYY(d) {
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
}

window.onload = init;
