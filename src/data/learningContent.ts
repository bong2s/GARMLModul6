import type { TopicId as LearningSectionId } from '@/types/ar';

export interface SubTopic {
  id: string;
  title: string;
  summary: string;
  details: string[];
  visualRelation?: string;
}

export interface ComponentInfo {
  id: string;
  label: string;
  description: string;
}

export interface LearningSection {
  id: LearningSectionId;
  index: number;
  title: string;
  shortTitle: string;
  accentColor: string;
  assetLabel: string;
  overview: string;
  components: ComponentInfo[];
  subTopics: SubTopic[];
  sourceVerified: boolean;
}

export const learningSections: Record<LearningSectionId, LearningSection> = {
  'os-fundamentals': {
    id: 'os-fundamentals',
    index: 0,
    title: 'Kompetensi Sistem Operasi',
    shortTitle: 'SISTEM OPERASI',
    accentColor: '#3b9eff',
    assetLabel: 'Motherboard & Komponen',
    overview:
      'Sistem operasi adalah perangkat lunak yang mengelola sumber daya perangkat keras komputer dan menjadi perantara antara perangkat keras dengan aplikasi serta pengguna. Pada bagian ini, model motherboard membantu memahami bagaimana CPU, memori, dan perangkat I/O terhubung dalam satu sistem.',
    components: [
      { id: 'motherboard', label: 'Motherboard', description: 'Papan utama yang menghubungkan seluruh komponen sistem.' },
      { id: 'cpu', label: 'CPU', description: 'Pemroses instruksi yang dijadwalkan oleh sistem operasi.' },
      { id: 'ram', label: 'RAM', description: 'Memori utama yang dikelola oleh sistem operasi.' },
      { id: 'io', label: 'Port I/O', description: 'Antarmuka perangkat input/output yang dikendalikan OS.' },
      { id: 'storage', label: 'Storage', description: 'Penyimpanan sekunder yang dikelola sistem berkas OS.' },
    ],
    subTopics: [
      {
        id: 'os-resource-manager',
        title: 'Sistem Operasi sebagai Pengelola Sumber Daya',
        summary:
          'OS mengelola CPU, memori, perangkat I/O, dan storage agar setiap program dapat berjalan secara adil dan efisien.',
        details: [
          'Mengatur pembagian waktu CPU antar proses melalui penjadwalan.',
          'Mengelola ruang memori agar tidak terjadi konflik antar program.',
          'Mengendalikan akses ke perangkat I/O melalui driver.',
          'Menyediakan sistem berkas untuk penyimpanan data.',
          'Contoh: saat Anda membuka browser, OS mengalokasikan memori, menjadwalkan CPU untuk proses browser, dan mengelola akses kartu jaringan untuk memuat halaman.',
        ],
        visualRelation: 'Pada model motherboard, perhatikan jalur yang menghubungkan CPU, RAM, dan port I/O — itulah sumber daya yang dikelola OS.',
      },
      {
        id: 'os-intermediary',
        title: 'OS sebagai Perantara',
        summary:
          'OS menyembunyikan kompleksitas perangkat keras dari aplikasi melalui sistem call dan API.',
        details: [
          'Aplikasi tidak langsung mengakses perangkat keras, melainkan melalui layanan OS.',
          'Sistem call menjadi jembatan antara aplikasi dan kernel.',
          'Abstraksi ini melindungi perangkat keras dan menjaga stabilitas sistem.',
        ],
        visualRelation: 'Komponen pada motherboard adalah perangkat keras yang tidak diakses langsung oleh aplikasi.',
      },
      {
        id: 'process-management',
        title: 'Pengelolaan Proses',
        summary:
          'OS menciptakan, menjadwalkan, dan menghentikan proses serta mengatur komunikasi antar proses.',
        details: [
          'Proses adalah program yang sedang dieksekusi.',
          'OS mencatat status proses: new, ready, running, waiting, terminated.',
          'Penjadwalan menentukan proses mana yang mendapat CPU.',
        ],
        visualRelation: 'CPU pada motherboard adalah tempat proses dieksekusi — lanjut ke bagian Penjadwalan untuk detail.',
      },
      {
        id: 'memory-management',
        title: 'Manajemen Memori',
        summary:
          'OS mengalokasikan memori untuk proses dan melindungi area memori satu proses dari proses lain.',
        details: [
          'Mencatat bagian memori yang sedang dipakai dan yang bebas.',
          'Mengalokasikan dan mendealokasi memori sesuai kebutuhan.',
          'Memori virtual memperluas kapasitas dengan menggunakan storage sebagai perluasan.',
        ],
        visualRelation: 'RAM pada motherboard adalah memori utama yang dikelola OS — lanjut ke bagian Manajemen Memori.',
      },
      {
        id: 'device-protection',
        title: 'Pengelolaan Perangkat & Proteksi',
        summary:
          'OS mengendalikan akses ke perangkat dan melindungi sumber daya dari akses tidak sah.',
        details: [
          'Driver perangkat menjadi antarmuka standar untuk hardware.',
          'Proteksi memori mencegah proses membaca/menulis area proses lain.',
          'Mode kernel dan mode user memisahkan hak akses.',
        ],
        visualRelation: 'Port I/O pada motherboard terhubung ke perangkat yang dikendalikan via driver OS.',
      },
    ],
    sourceVerified: false,
  },
  scheduling: {
    id: 'scheduling',
    index: 1,
    title: 'Penjadwalan Proses',
    shortTitle: 'PENJADWALAN',
    accentColor: '#3ed598',
    assetLabel: 'CPU / Prosesor',
    overview:
      'Penjadwalan CPU menentukan proses mana yang mendapat waktu pemrosesan. CPU hanya dapat mengeksekusi satu proses pada satu waktu, sehingga OS harus memilih urutan eksekusi yang adil dan efisien. Model CPU membantu memahami bahwa penjadwalan terjadi di prosesor.',
    components: [
      { id: 'cpu-core', label: 'CPU Core', description: 'Unit eksekusi yang menjalankan instruksi proses satu per satu.' },
      { id: 'scheduler', label: 'Scheduler', description: 'Komponen OS yang memilih proses dari antrean.' },
      { id: 'queue', label: 'Process Queue', description: 'Antrean proses yang menunggu giliran CPU.' },
    ],
    subTopics: [
      {
        id: 'scheduling-need',
        title: 'Mengapa Penjadwalan Diperlukan',
        summary:
          'CPU hanya bisa menjalankan satu proses pada satu waktu. Dengan banyak proses aktif, OS harus memilih urutan eksekusi.',
        details: [
          'Multiprogramming menjaga CPU tetap sibuk dengan berganti proses.',
          'Tujuan: memaksimalkan utilisasi CPU, minimalkan waktu tunggu, dan menjaga keadilan.',
          'Status proses: ready (siap dieksekusi), running (sedang dieksekusi CPU), waiting (menunggu I/O atau sumber daya).',
          'Context switch menyimpan dan memulihkan status proses saat berganti.',
        ],
        visualRelation: 'CPU pada model prosesor hanya memiliki satu jalur eksekusi utama — itulah mengapa penjadwalan penting.',
      },
      {
        id: 'schedulers',
        title: 'Tiga Jenis Scheduler',
        summary:
          'Scheduler jangka panjang, menengah, dan pendek bekerja pada tahap berbeda dari siklus proses.',
        details: [
          'Long-term scheduler: memutuskan proses baru mana yang masuk ke sistem.',
          'Mid-term scheduler: mengatur proses yang ditukar keluar dari memori (swapping).',
          'Short-term scheduler: memilih proses dari ready queue untuk dieksekusi berikutnya.',
        ],
        visualRelation: 'Scheduler bukan komponen perangkat keras — ia adalah bagian dari OS yang bekerja di atas CPU.',
      },
      {
        id: 'fcfs',
        title: 'FCFS (First-Come First-Served)',
        summary:
          'Proses yang datang lebih dulu dieksekusi lebih dulu. Sederhana tetapi dapat menyebabkan convoy effect.',
        details: [
          'Non-preemptive: proses berjalan sampai selesai atau memblokir diri.',
          'Convoy effect: proses lama membuat proses pendek menunggu lama.',
          'Mudah diimplementasikan dengan queue FIFO.',
          'Contoh: P1(burst=5), P2(burst=3), P3(burst=8) datang berurutan — eksekusi: P1 lalu P2 lalu P3, total waktu = 16 satuan.',
        ],
        visualRelation: 'Lihat simulasi antrean di bawah — FCFS mengikuti urutan kedatangan.',
      },
      {
        id: 'sjf',
        title: 'SJF (Shortest Job First)',
        summary:
          'Proses dengan waktu eksekusi terpendek didahulukan. Optimal untuk minimalkan waktu tunggu rata-rata.',
        details: [
          'Non-preemptive: sekali proses berjalan, selesai sampai ujung.',
          'Versi preemptive: Shortest Remaining Time First (SRTF).',
          'Sulit memprediksi durasi proses di dunia nyata.',
        ],
        visualRelation: 'Simulasi antrean mengurutkan proses berdasarkan burst time terpendek.',
      },
      {
        id: 'round-robin',
        title: 'Round Robin',
        summary:
          'Setiap proses mendapat quantum waktu tetap, lalu bergiliran. Adil dan responsif.',
        details: [
          'Preemptive: proses dihentikan setelah quantum habis dan kembali ke akhir antrean.',
          'Pemilihan quantum memengaruhi kinerja: terlalu kecil = banyak context switch, terlalu besar = mirip FCFS.',
          'Cocok untuk sistem time-sharing.',
        ],
        visualRelation: 'Simulasi menunjukkan giliran CPU berpindah setiap quantum habis.',
      },
      {
        id: 'priority',
        title: 'Priority Scheduling',
        summary:
          'Proses dengan prioritas tertinggi dieksekusi lebih dulu. Dapat preemptive atau non-preemptive.',
        details: [
          'Starvation: proses prioritas rendah bisa tidak pernah dieksekusi.',
          'Solusi: aging — menaikkan prioritas seiring waktu tunggu.',
          'Prioritas bisa internal (berbasis sumber daya) atau eksternal (berbasis kebijakan).',
        ],
        visualRelation: 'Pada simulasi, proses diberi nilai prioritas dan diurutkan sesuai aturan.',
      },
      {
        id: 'multilevel',
        title: 'Multilevel Queue',
        summary:
          'Antrean terpisah untuk kelas proses berbeda, masing-masing dengan algoritma sendiri.',
        details: [
          'Contoh: antrean system, interactive, dan batch — masing-masing berbeda prioritas.',
          'Penjadwalan antar antrean biasanya dengan prioritas tetap atau time-slice.',
          'Multilevel Feedback Queue memungkinkan proses berpindah antar antrean.',
        ],
        visualRelation: 'Simulasi dapat memperlihatkan beberapa antrean dengan aturan berbeda.',
      },
    ],
    sourceVerified: false,
  },
  memory: {
    id: 'memory',
    index: 2,
    title: 'Manajemen Memori',
    shortTitle: 'MANAJEMEN MEMORI',
    accentColor: '#9d7bff',
    assetLabel: 'RAM',
    overview:
      'Manajemen memori mengatur bagaimana memori utama dialokasikan untuk proses, dilindungi dari konflik, dan diperluas dengan memori virtual. Model RAM membantu memahami struktur fisik memori, sementara visualisasi konseptual menjelaskan paging dan algoritma penggantian halaman.',
    components: [
      { id: 'ram-chip', label: 'RAM Module', description: 'Modul memori fisik yang menyimpan data proses aktif.' },
      { id: 'frame', label: 'Frame', description: 'Blok memori fisik berukuran tetap tempat halaman ditempatkan.' },
      { id: 'page', label: 'Page', description: 'Blok memori logis berukuran tetap dari proses.' },
    ],
    subTopics: [
      {
        id: 'relocation-protection',
        title: 'Relokasi dan Proteksi Memori',
        summary:
          'OS memastikan proses dapat dipindahkan di memori dan terlindungi dari proses lain.',
        details: [
          'Relokasi: proses tidak harus berada di alamat tetap — OS memetakan ulang saat perlu.',
          'Proteksi: register base dan limit mencegah proses mengakses area di luar batasnya.',
          'Setiap akses memori diperiksa oleh MMU (Memory Management Unit).',
        ],
        visualRelation: 'Pada model RAM, bayangkan setiap modul dibagi menjadi area terlindungi per proses.',
      },
      {
        id: 'sharing',
        title: 'Berbagi Memori',
        summary:
          'Beberapa proses dapat berbagi area memori untuk komunikasi atau kode bersama.',
        details: [
          'Kode reentrant (shared library) dapat dipakai bersama tanpa duplikasi.',
          'Shared memory menjadi mekanisme komunikasi antar proses (IPC).',
          'OS mengatur hak akses baca/tulis untuk area bersama.',
        ],
        visualRelation: 'Satu frame pada RAM dapat dipetakan ke page berbeda dari proses berbeda.',
      },
      {
        id: 'logical-physical',
        title: 'Organisasi Logis dan Fisik',
        summary:
          'Memori logis yang dilihat proses berbeda dengan memori fisik yang dikelola OS.',
        details: [
          'Alamat logis: alamat yang dilihat proses, dimulai dari 0.',
          'Alamat fisik: alamat sebenarnya di RAM.',
          'MMU menerjemahkan alamat logis ke fisik melalui tabel halaman.',
        ],
        visualRelation: 'Model RAM menunjukkan memori fisik; visualisasi page table menunjukkan pemetaan logis-fisik.',
      },
      {
        id: 'partitioning',
        title: 'Partisi Tetap dan Dinamis',
        summary:
          'Memori dapat dibagi menjadi partisi ukuran tetap atau dialokasikan secara dinamis sesuai kebutuhan.',
        details: [
          'Partisi tetap: ukuran tetap, mudah tetapi menyebabkan fragmentasi internal.',
          'Partisi dinamis: ukuran sesuai proses, tetapi menimbulkan fragmentasi eksternal.',
          'Compaction dapat merapikan partisi dinamis tetapi memerlukan waktu.',
        ],
        visualRelation: 'Visualisasi blok memori memperlihatkan perbedaan partisi tetap vs dinamis.',
      },
      {
        id: 'paging-segmentation',
        title: 'Paging dan Segmentation',
        summary:
          'Paging memecah memori menjadi blok ukuran tetap; segmentation memecah berdasarkan unit logis program.',
        details: [
          'Paging: memori fisik dibagi menjadi frame, memori logis dibagi menjadi page — ukuran sama.',
          'Page table menyimpan pemetaan page ke frame.',
          'Segmentation: program dibagi menjadi segmen (code, data, stack) dengan ukuran berbeda.',
          'Kombinasi keduanya: segmentation dengan paging.',
        ],
        visualRelation: 'Visualisasi page table pada simulasi menunjukkan pemetaan page ke frame.',
      },
      {
        id: 'virtual-memory',
        title: 'Memori Virtual dan Demand Paging',
        summary:
          'Memori virtual memperluas kapasitas dengan menggunakan storage sebagai perluasan. Demand paging memuat halaman hanya saat diperlukan.',
        details: [
          'Halaman dimuat ke memori hanya saat diakses (demand paging).',
          'Swap space di disk menyimpan halaman yang tidak muat di RAM.',
          'Valid/invalid bit menandai apakah halaman berada di memori atau disk.',
          'Contoh: program 10 MB berjalan pada RAM 4 MB — OS hanya memuat halaman aktif ke RAM, sisanya di disk dan dimuat saat dibutuhkan (demand paging).',
        ],
        visualRelation: 'RAM pada model hanya menyimpan sebagian halaman — sisanya di disk.',
      },
      {
        id: 'page-fault',
        title: 'Page Fault',
        summary:
          'Page fault terjadi saat proses mengakses halaman yang tidak ada di memori fisik.',
        details: [
          'OS menghentikan proses, mencari halaman di disk, lalu memuatnya ke frame.',
          'Jika tidak ada frame kosong, algoritma penggantian halaman dipakai.',
          'Frekuensi page fault tinggi memperlambat sistem secara signifikan.',
        ],
        visualRelation: 'Simulasi penggantian halaman memperlihatkan kapan page fault terjadi.',
      },
      {
        id: 'replacement-fifo',
        title: 'Algoritma FIFO',
        summary:
          'Halaman yang paling lama berada di memori diganti pertama kali.',
        details: [
          'Menggunakan queue sederhana berdasarkan urutan kedatangan.',
          'Dapat menderita Belady\'s anomaly: frame lebih banyak bisa menghasilkan fault lebih banyak.',
          'Mudah diimplementasikan tetapi tidak selalu optimal.',
        ],
        visualRelation: 'Simulasi memperlihatkan halaman pertama masuk diganti pertama kali.',
      },
      {
        id: 'replacement-lru',
        title: 'Algoritma LRU',
        summary:
          'Halaman yang paling lama tidak diakses diganti.',
        details: [
          'Mencatat waktu akses terakhir setiap halaman.',
          'Tidak menderita Belady\'s anomaly.',
          'Implementasi memerlukan hardware support (counter atau stack).',
        ],
        visualRelation: 'Simulasi mengganti halaman dengan akses terlama.',
      },
      {
        id: 'replacement-optimal',
        title: 'Algoritma Optimal',
        summary:
          'Mengganti halaman yang tidak akan dipakai paling lama di masa depan.',
        details: [
          'Menghasilkan jumlah fault minimum — digunakan sebagai tolok ukur.',
          'Tidak dapat diimplementasikan karena memerlukan pengetahuan masa depan.',
          'Berguna untuk mengevaluasi algoritma lain.',
        ],
        visualRelation: 'Simulasi mengganti halaman yang referensi terjauh di masa depan.',
      },
      {
        id: 'thrashing',
        title: 'Thrashing',
        summary:
          'Thrashing terjadi saat proses menghabiskan waktu lebih banyak untuk paging daripada eksekusi.',
        details: [
          'Terjadi saat beban melebihi kapasitas memori fisik.',
          'CPU utilization menurun drastis karena terus-menerus memuat/membuang halaman.',
          'Solusi: mengurangi derajat multiprogramming atau working set model.',
        ],
        visualRelation: 'Pada simulasi, perhatikan bagaimana jumlah frame terlalu sedikit meningkatkan fault secara dramatis.',
      },
    ],
    sourceVerified: false,
  },
};

export const sectionOrder: LearningSectionId[] = ['os-fundamentals', 'scheduling', 'memory'];
