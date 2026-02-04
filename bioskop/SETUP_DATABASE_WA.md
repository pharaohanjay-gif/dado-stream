# Panduan Setup Database WhatsApp untuk DADO STREAM Bioskop

## LANGKAH 1: Buat Google Spreadsheet

1. Buka https://sheets.google.com
2. Buat spreadsheet baru dengan nama: **"DADO STREAM - Database WA"**
3. Di baris pertama (header), tulis kolom:
   - A1: `Nomor`
   - B1: `Waktu`
   - C1: `Device`
   - D1: `User Agent`

4. Copy URL spreadsheet Anda (akan terlihat seperti):
   `https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit`

---

## LANGKAH 2: Buat Google Apps Script

1. Di spreadsheet, klik **Extensions** > **Apps Script**
2. Hapus semua kode yang ada
3. Paste kode berikut:

```javascript
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Append data to sheet
    sheet.appendRow([
      data.number,
      data.timestamp,
      data.device,
      data.userAgent
    ]);
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: 'Data saved'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({
    status: 'API is running',
    message: 'Use POST to submit data'
  })).setMimeType(ContentService.MimeType.JSON);
}
```

4. Klik **Save** (Ctrl+S)
5. Beri nama project: "DADO STREAM WA API"

---

## LANGKAH 3: Deploy sebagai Web App

1. Klik **Deploy** > **New deployment**
2. Klik ikon gear ⚙️ dan pilih **Web app**
3. Isi:
   - Description: "WA Database API"
   - Execute as: **Me**
   - Who has access: **Anyone**
4. Klik **Deploy**
5. Klik **Authorize access** dan izinkan
6. **COPY URL yang diberikan** (akan terlihat seperti):
   ```
   https://script.google.com/macros/s/AKfycbw.../exec
   ```

---

## LANGKAH 4: Update Kode Website

Buka file `bioskop/public/js/bioskop-app.js` dan cari baris:

```javascript
const SHEETS_API = 'https://script.google.com/macros/s/AKfycbwExample123/exec';
```

Ganti dengan URL Web App yang Anda copy tadi.

---

## LANGKAH 5: Setup WhatsApp API (Fonnte)

Untuk mengirim OTP ke WhatsApp secara nyata:

1. Buka https://fonnte.com
2. Daftar akun gratis
3. Hubungkan nomor WhatsApp Anda (scan QR)
4. Copy **API Token** dari dashboard
5. Update di `bioskop-app.js`:

```javascript
const FONNTE_TOKEN = 'TOKEN_ANDA_DISINI';
```

---

## KEAMANAN

✅ **Google Sheets** - Hanya Anda yang bisa mengakses spreadsheet
✅ **Tidak ada file HTML publik** - Database tidak bisa diakses langsung
✅ **Apps Script** - Google menangani keamanan API
✅ **Fonnte Token** - Hanya Anda yang tahu token API

---

## AKSES DATABASE

Untuk melihat data nomor WhatsApp:
1. Buka Google Sheets Anda
2. Semua nomor yang terverifikasi akan tercatat di sana
3. Anda bisa filter, sort, dan export ke CSV langsung dari Sheets

---

## CATATAN PENTING

- Token Fonnte GRATIS untuk 100 pesan/hari
- Jika butuh lebih, upgrade ke paket berbayar (~Rp 50.000/bulan)
- Data di Google Sheets PRIVATE dan hanya bisa diakses oleh Anda
