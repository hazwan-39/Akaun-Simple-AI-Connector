# Spec: Import Penyata Bank → Buku Bank → Deposits / Payments (Fasa 2)

| | |
|---|---|
| Skill | `BANK_IMPORT_001` v1.0.0 (Akaun Simple AI Connector) |
| Status | **Draf untuk perbincangan.** Belum ada kod. Tingkah laku VBA disemak (§11). |
| Template sasaran | Akaun Simple 2026 **v2.26.02** sahaja |
| Tarikh | 2026-11-23 |

## 1. Tujuan

User muat naik penyata bank dalam task pane Excel. Add-in ekstrak semua transaksi ke sheet baru
**Buku Bank**, dan user sahkan kategori setiap transaksi. Add-in kemudian sediakan blok yang sudah
disusun ikut lajur sebenar Deposits/Payments, jadi user hanya perlu copy dan paste sekali.
Tiada amaun boleh tersalah lajur, kerana user pilih **kategori**, bukan lajur.

## 2. Prinsip yang tidak berubah dari Fasa 1

- Add-in **tidak menulis** ke Deposits, Payments atau mana-mana sheet asal. Hanya user yang paste.
- Add-in hanya menulis ke sheet miliknya sendiri, yang ditanda dengan custom property ownership, sama
  seperti `AI Cash Flow`.
- Tiada kata laluan sheet diminta, disimpan atau dipintas.
- Semua teks dari bank disanitasi (`sanitizeCellText`) sebelum ditulis. Butiran bank yang bermula dengan
  `=`, `+`, `-` atau `@` adalah biasa dan mesti dirawat sebagai teks.
- Nombor dan baki dikira secara deterministik (integer sen). AI hanya untuk ekstrak PDF dan cadang kategori.

## 3. Aliran user

```
[1 Muat naik] → [2 Semak ekstrak] → [3 Kategori] → [4 Sediakan blok] → [5 Paste] → [6 Sahkan pindahan]
```

1. **Muat naik**: user pilih fail penyata (CSV, atau PDF teks) dan pilih bank serta akaun (contoh
   "Maybank 5123…"; hanya 4 digit akhir disimpan).
2. **Semak ekstrak**: task pane tunjuk jumlah transaksi, baki awal, baki akhir dan keputusan semakan
   baki (§5). Kalau baki tak sepadan, **berhenti di sini** dan tunjuk baris yang bermasalah.
3. **Kategori**: transaksi ditulis ke **Buku Bank**. Setiap baris ada dropdown Kategori:
   - Masuk → senarai lajur Deposits (D–G).
   - Keluar → senarai lajur Payments (E–AO).
   - Kedua-duanya juga ada **Pindahan Dalaman** (antara akaun sendiri) dan **Abaikan**.

   Cadangan datang dari Peraturan Kategori user dulu (§7), kemudian AI untuk baki baris yang tinggal.
   Cadangan **tidak pernah dianggap disahkan**: user mesti sahkan sendiri, satu demi satu atau
   "Sahkan semua yang berkeyakinan tinggi".
4. **Sediakan blok**: butang **Sedia untuk Deposits** / **Sedia untuk Payments**. Add-in:
   - ambil baris berstatus *Disahkan* dan belum *Dipindah*, ikut jenis (dan pilihan: satu kategori sahaja,
     contoh "Pendapatan sahaja");
   - susun ikut tarikh;
   - tulis blok ke sheet **Buku Bank – Pindah** dengan susunan lajur yang sama persis dengan sheet sasaran (§6);
   - kira baris sasaran ikut cara form VBA (`COUNTA(lajur A) + 1`) dan semak ruang cukup (§8);
   - **select** blok tu supaya user hanya perlu tekan Ctrl+C. Select bukan pengubahsuaian.
5. **Paste**: task pane beri arahan "Pergi ke **Deposits!A123** → Paste Special → **Values** + **Skip
   blanks**". Butang "Pergi ke baris" hanya select sel tu.
6. **Sahkan pindahan**: add-in **baca** baris sasaran dan banding dengan blok: tarikh, butiran dan amaun
   setiap lajur kategori, serta Jumlah yang dikira oleh formula workbook sendiri.
   - Kalau semua sama: baris Buku Bank ditanda *Dipindah → Deposits!123*.
   - Kalau ada beza: tunjuk beza dan **jangan** tanda. Add-in tidak cuba membetulkan apa-apa dalam Deposits.

## 4. Format input

| Format | Cara ekstrak | Fasa |
|---|---|---|
| CSV bank (Maybank, CIMB, Public Bank dulu) | Parser deterministik per bank dalam add-in. **Tiada AI, tiada data keluar.** | 2a |
| PDF teks | Teks diekstrak dalam add-in (pdf.js). Teks dihantar ke API, dan AI pulangkan baris dalam JSON schema ketat. | 2a |
| PDF imbasan / gambar | Model vision | 2b, kemudian |

Setiap profil bank menyatakan lajur tarikh/butiran/debit/kredit/baki, format tarikh dan format nombor
(contoh `1,234.50 DR`). Kalau tajuk CSV tak sepadan dengan profil, add-in tolak fail dan tidak cuba meneka.

## 5. Semakan ketepatan (wajib sebelum tulis ke Buku Bank)

1. **Baki awal + Σ masuk − Σ keluar = baki akhir** penyata, tepat ke sen.
2. **Baki berjalan**: setiap baris, `baki sebelumnya ± amaun = baki baris`. Ini mengesan baris yang
   tertinggal atau amaun yang AI salah baca.
3. Tarikh semua dalam tempoh penyata. Tiada amaun kosong atau negatif yang tak dijangka.
4. **Pendua antara import**: hash `(akaun, tarikh, amaun, butiran, baki)`. Penyata yang bertindih tempoh
   tidak memasukkan baris yang sama dua kali.

Untuk PDF yang diekstrak oleh AI, (1) dan (2) adalah pertahanan utama. Kalau gagal, user diberitahu
baris mana. Tiada "anggaran".

## 6. Struktur sheet

### Buku Bank (dicipta oleh add-in, ownership `BANK_IMPORT_001:ledger`)

| Lajur | Isi | Siapa isi |
|---|---|---|
| A | ID (hash pendek) | add-in |
| B | Tarikh | add-in |
| C | Butiran (disanitasi) | add-in |
| D | Masuk (RM) | add-in |
| E | Keluar (RM) | add-in |
| F | Baki (RM) | add-in |
| G | Akaun (contoh "Maybank …5123") | add-in |
| H | **Kategori** (dropdown) | **user** |
| I | Cadangan (kategori + sumber: Peraturan / AI) | add-in |
| J | Keyakinan (Tinggi / Sederhana / Rendah) | add-in |
| K | Status: Baru → Disahkan → Dipindah · Abaikan · Pindahan Dalaman | add-in / user |
| L | Dipindah ke (contoh `Deposits!123`) | add-in |
| M | Catatan | user |

User hanya mengedit H dan M. Bila user tukar H, add-in tukar K kepada *Disahkan* selepas user tekan
**Sahkan**, bukan secara automatik semasa menaip.

### Buku Bank – Pindah (dicipta oleh add-in)

Blok untuk dicopy. Susunan lajur **sama persis** dengan sasaran. **Lajur Jumlah dibiarkan kosong**
supaya *Skip blanks* mengekalkan formula workbook:

| Sasaran | A | B | C | D | E… |
|---|---|---|---|---|---|
| Deposits | Tarikh | Butiran | *(kosong, formula `SUM(D:G)` kekal)* | Pendapatan… | …G Pinjaman |
| Payments | **No. = nombor baris − 5** (wajib diisi, lihat §11) | Tarikh | Butiran | *(kosong, formula `SUM(E:AO)` kekal)* | E…AO kategori |

Amaun diletak di **satu** lajur kategori sahaja untuk setiap baris. Lajur kategori lain kosong.
Tarikh ditulis sebagai **tarikh Excel sebenar** (nombor siri dengan format `dd/mm/yyyy`), bukan teks.
**Lajur A tidak boleh kosong** dalam mana-mana baris blok, kerana form VBA bergantung padanya (§11).

### Sheet tersembunyi (dicipta oleh add-in)

- `_AI_BANK_LISTS`: senarai dropdown. Senarai ni dibaca dari tajuk sebenar `Deposits!D5:G5` dan
  `Payments!E5:AO5` semasa import, jadi senarai sentiasa sama dengan template.
- `_AI_BANK_RULES`: Peraturan Kategori user (§7).

## 7. Peraturan Kategori (belajar dari user)

Bila user sahkan kategori, add-in tawarkan "Ingat untuk transaksi serupa?". Peraturan disimpan dalam
`_AI_BANK_RULES` (dalam workbook user, bukan di server), contohnya:
`butiran mengandungi "TNB" → Bil Utiliti`. Untuk import seterusnya, peraturan digunakan **sebelum AI**.
Ini mengurangkan kos, mengurangkan data yang dihantar ke AI, dan cadangan jadi lebih tepat dari masa ke masa.

## 8. Kapasiti

Template: Deposits baris 6–365 (**360 baris**), Payments baris 6–364 (**359 baris**). Sebelum sediakan blok:

- kira baris kosong yang tinggal dalam sasaran;
- kalau blok tak muat, tolak dan cadangkan pecah ikut bulan. Rujuk FAQ #11 workbook untuk tambah baris.
  Add-in tidak tambah baris sendiri.
- beri amaran awal bila baki ruang kurang dari 10%.

**Baris sasaran = `COUNTA(lajur A) + 1`**, iaitu cara yang sama dengan form VBA (§11). Bukan "baris kosong
pertama". Sebelum sediakan blok, add-in semak:

- semua baris dari baris sasaran hingga baris terakhir blok mesti **kosong sepenuhnya** (lajur A, tarikh,
  butiran dan semua lajur kategori);
- **tiada data di bawah** baris sasaran. Data di bawah bermakna ada baris dengan lajur A kosong di tengah
  jadual. Dalam keadaan ni, form VBA dan blok kita akan bertembung, jadi add-in berhenti dan tunjuk baris
  yang bermasalah supaya user betulkan dulu.

## 9. API (server sedia ada)

| Endpoint | Input | Output |
|---|---|---|
| `POST /api/v1/skills/BANK_IMPORT_001/extract` | teks PDF (had 1 MB, laluan ini sahaja) + nama bank | baris transaksi (JSON schema ketat) + baki awal/akhir |
| `POST /api/v1/skills/BANK_IMPORT_001/categorize` | senarai `{id, butiran, amaun, arah}` (hanya baris tanpa Peraturan) + senarai kategori sah | `{id, kategori, keyakinan}`. Kategori mesti salah satu dari senarai, kalau tidak ditolak |

- Laluan CSV tidak memanggil `/extract` langsung.
- Auth, quota, rate limit, `store: false` dan log tanpa data adalah sama seperti Fasa 1.
- Tiada transaksi disimpan di server.

## 10. Privasi

Berbeza dengan Fasa 1: butiran transaksi (nama pihak lain, rujukan) **dihantar ke AI** untuk PDF dan untuk
cadangan kategori. Keperluan:

- skrin persetujuan sekali bagi setiap workbook, yang terangkan apa dihantar dan ke penyedia AI mana;
- pilihan **"Tanpa AI"**: CSV + Peraturan sahaja, kategori selebihnya diisi manual;
- nombor akaun penuh dipotong kepada 4 digit akhir sebelum apa-apa dihantar;
- kemas kini Privacy Policy (lihat `docs/marketplace-checklist.md`).

## 11. Tingkah laku VBA (disemak 2026-11-23)

Sumber: modul VBA yang diekstrak (baca sahaja) dari **salinan** `Akaun Simple 2026 v2.26.02.xlsm`.
Fail asal tidak dibuka atau diubah. Kata laluan tidak dicari atau digunakan.

| Soalan | Jawapan |
|---|---|
| Macam mana form cari baris seterusnya? | **`COUNTA(lajur A) + 1`**, sama untuk Deposits (`UserForm1`) dan Payments (`PaymentBank`). Baris 1–5 sentiasa terisi (nama bisnes, tajuk), jadi entri pertama jatuh di baris 6. |
| Apa form tulis ke lajur A? | Deposits: tarikh. Payments: formula `=Row()-5` (No.). |
| Risiko kalau lajur A kosong? | **Ya, risiko sebenar.** Baris yang dipaste tanpa lajur A tak dikira oleh `COUNTA`, jadi entri form seterusnya akan **menimpa** baris tersebut tanpa amaran. Sebab tu blok mesti isi lajur A (§6). |
| Ada `Worksheet_Change` atau macro lain bila paste? | **Tiada.** Hanya `Worksheet_SelectionChange` kosong pada satu sheet. |
| Adakah form unprotect sheet? | Tidak. Form hanya tulis ke sel unlocked, sama seperti paste user. |
| Dropdown form | `Mapping!A1:A4` (Deposits) dan `Mapping!B1:B35` (Payments). |

Penemuan tambahan:

- **Form Payments tak boleh rekod `AJ Intengible Asset` dan `AK Kelengkapan Komputer`.** Senarai
  `Mapping!B1:B35` hanya ada 35 kategori, sedangkan Payments ada 37 lajur. Dropdown Buku Bank diambil dari
  tajuk lajur sebenar, jadi kedua-dua kategori ni tersedia dalam add-in.
- Tajuk `T` ialah "Cas Kerajaan" tapi Mapping tulis "Caj Kerajaan". Add-in guna tajuk lajur, bukan Mapping.
- Form tulis tarikh melalui `Format(..., "dd/mm/yyyy")` sebagai teks, yang boleh jadi tarikh tertukar
  hari/bulan bergantung pada tetapan Windows. Data lama user mungkin ada tarikh teks atau tertukar. Engine
  Fasa 1 dah laporkan tarikh tak sah, dan perkara ni perlu diambil kira bila uji dengan data sebenar.
- `Workbook_Open` memaparkan mesej "File Sudah Expired" selepas **31 Disember 2026**. Versi template baru
  dijangka selepas tarikh tu, dan setiap versi perlukan layout yang disahkan sendiri.

## 12. Perkara yang masih perlu diputuskan

1. Bank mana dulu, dan dapatkan contoh CSV/PDF sebenar (data boleh dikaburkan).
2. Bayaran balik pinjaman: ke `AO Term Loan` / `AN Hire Purchase`, dan termasuk faedah? Atau faedah ke
   `AD Caj Faedah`? Ini keputusan perakaunan, dan mungkin satu transaksi perlu dipecah kepada dua kategori.
   Fasa 2a: **satu kategori setiap baris**. Pecahan ditangguh.
3. Transaksi tunai (tiada dalam penyata) kekal dimasukkan secara manual. Pastikan user faham Buku Bank
   bukan semua transaksi.
4. Ujian manual dalam Excel: paste blok, kemudian tambah satu entri melalui form, dan sahkan entri tu masuk
   di baris selepas blok, bukan menimpa.

## 13. Ujian

- Unit: parser setiap profil bank (fixture CSV dikaburkan), semakan baki, hash pendua, pembina blok
  (lajur betul, Jumlah kosong, satu amaun setiap baris), pengesanan baris kosong, kapasiti.
- Integrasi (`InMemoryWorkbookPort`): Deposits/Payments **tidak berubah** selepas setiap langkah add-in.
  Sahkan pindahan mengesan beza (lajur salah, baris tertinggal, formula Jumlah ditimpa).
- API: schema extract/categorize, kategori luar senarai ditolak, had saiz, quota.
- **Manual dalam Excel** (salinan workbook): Paste Special Values + Skip blanks mengekalkan formula Jumlah,
  butang VBA masih betul selepas paste, dan simpan/buka semula `.xlsm`.

## 14. Luar skop Fasa 2

- Add-in tulis terus ke Deposits/Payments.
- Sambungan terus ke bank (open banking / FPX API).
- PDF imbasan (2b), multi-mata wang, pecahan satu transaksi kepada beberapa kategori.
- Template v3 (satu jadual transaksi + SUMIFS), yang dibincang berasingan.
