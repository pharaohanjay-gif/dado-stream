# 🗄️ MONGODB SETUP - SUPER SIMPLE GUIDE

**Goal:** Get MongoDB running in 5 minutes!

---

## ✅ YOU ALREADY INSTALLED MONGODB COMMUNITY

Good! Now let's make sure it's running.

---

## 🚀 OPTION 1: Check if Auto-Running (EASIEST)

MongoDB usually auto-starts after installation.

**Test if it's already running:**

```powershell
# Open PowerShell and run:
mongosh
```

**If you see this:**
```
Current Mongosh Log ID: xxxxx
Connecting to: mongodb://127.0.0.1:27017/
MongoDB server version: 7.0.x
```

**✅ CONGRATS! MongoDB is already running!**  
Type `exit` and you're done. Skip to bottom of this file.

---

## 🔧 OPTION 2: Start MongoDB Service (If not running)

### Windows 11/10:

**Method A: Services GUI**
```
1. Press Windows + R
2. Type: services.msc
3. Press Enter
4. Find "MongoDB Server" in the list
5. Right-click → Start
6. Right-click → Properties → Startup type: Automatic
```

**Method B: PowerShell (Run as Administrator)**
```powershell
# Start MongoDB service
net start MongoDB

# Set to auto-start
Set-Service -Name MongoDB -StartupType Automatic
```

**Test:**
```powershell
mongosh
# Should connect successfully
```

---

## 🛠️ OPTION 3: Manual Start (If service doesn't exist)

Sometimes MongoDB doesn't install as a service. You can run it manually.

### **Step 1: Create Data Directory**
```powershell
# Create folder for MongoDB data
md C:\data\db
```

### **Step 2: Find MongoDB Installed Location**

Usually here:
```
C:\Program Files\MongoDB\Server\7.0\bin\mongod.exe
```

Or search:
```powershell
Get-ChildItem -Path "C:\Program Files" -Filter mongod.exe -Recurse -ErrorAction SilentlyContinue
```

### **Step 3: Start MongoDB Manually**

**Open NEW PowerShell** (leave it running):
```powershell
cd "C:\Program Files\MongoDB\Server\7.0\bin"
.\mongod.exe --dbpath C:\data\db
```

**Keep this window open!** MongoDB is now running.

### **Step 4: Test in ANOTHER PowerShell**
```powershell
mongosh
# Should connect!
```

---

## 📊 OPTION 4: Use MongoDB Compass (GUI - RECOMMENDED)

If you want a visual interface:

**Download MongoDB Compass:**
https://www.mongodb.com/try/download/compass

**After installing:**
1. Open MongoDB Compass
2. Connection string: `mongodb://localhost:27017`
3. Click "Connect"
4. You'll see databases visually!

---

## ✅ VERIFY MONGODB IS WORKING

Run these commands in `mongosh`:

```javascript
// Show all databases
show dbs

// Create test database
use wibustream

// Insert test data
db.test.insertOne({message: "Hello WibuStream!"})

// Show collections
show collections

// Find test data
db.test.find()

// Exit
exit
```

If all commands work, **MongoDB is ready!** ✅

---

## 🆘 TROUBLESHOOTING

### Error: "mongosh: command not found"

**Solution:** Add MongoDB to PATH

```powershell
# Find mongosh.exe location
Get-ChildItem -Path "C:\Program Files" -Filter mongosh.exe -Recurse -ErrorAction SilentlyContinue

# Usually: C:\Program Files\MongoDB\Server\7.0\bin
```

**Add to PATH:**
1. Windows Search → "Environment Variables"
2. System Properties → Environment Variables
3. Under "System variables" → Find "Path" → Edit
4. Add New → `C:\Program Files\MongoDB\Server\7.0\bin`
5. OK → OK → Restart PowerShell

### Error: "connect ECONNREFUSED"

**Meaning:** MongoDB is not running

**Solution:**
- Try Option 2 (Start service)
- Or Option 3 (Manual start)

### Error: "Access is denied"

**Solution:** Run PowerShell as Administrator
- Right-click PowerShell → Run as Administrator

### MongoDB Won't Start

**Check if port 27017 is in use:**
```powershell
Get-NetTCPConnection -LocalPort 27017
```

If something else uses port 27017, kill it:
```powershell
Stop-Process -Id <PID from above>
```

---

## 🎯 AFTER MONGODB IS RUNNING

**Come back to main project and run:**

```powershell
cd c:\Users\mufti\Downloads\wibu\wibu

# Build TypeScript
npm run build

# Create admin user (first time only)
npm run seed-admin

# Start server
npm start
```

**Should see:**
```
✅ MongoDB connected successfully
📊 Database: wibustream
🚀 Server running at http://localhost:3000
```

**Then test:**
- User app: http://localhost:3000
- Admin panel: http://localhost:3000/admin
- Login: admin / admin123

---

## 📝 QUICK REFERENCE

| Task | Command |
|------|---------|
| Start MongoDB Service | `net start MongoDB` |
| Stop MongoDB Service | `net stop MongoDB` |
| Connect to MongoDB | `mongosh` |
| Show databases | `show dbs` |
| Use database | `use wibustream` |
| Show collections | `show collections` |
| Exit MongoDB shell | `exit` |

---

## 💡 PRO TIPS

1. **Auto-start MongoDB:**
   Set MongoDB service to "Automatic" so it starts with Windows.

2. **Use MongoDB Compass:**
   Easier to visualize your data, create backups, etc.

3. **Check if running:**
   Before starting server, always check MongoDB is running:
   ```powershell
   mongosh
   ```

4. **Clean data (if needed):**
   ```javascript
   use wibustream
   db.dropDatabase()  // Deletes all data
   ```

---

**MongoDB Ready?** ✅  
**Go back to STATUS.md and continue with server setup!** 🚀
