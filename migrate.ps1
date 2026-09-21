$src = "..\Agent_zero_kalpavikas_backup"
$dest = "."

Write-Host "Copying modified files from backup..."
Copy-Item -Path "$src\backend\package-lock.json" -Destination "$dest\backend\package-lock.json" -Force
Copy-Item -Path "$src\backend\package.json" -Destination "$dest\backend\package.json" -Force
Copy-Item -Path "$src\backend\src\db\index.js" -Destination "$dest\backend\src\db\index.js" -Force
Copy-Item -Path "$src\frontend\.env.example" -Destination "$dest\frontend\.env.example" -Force
Copy-Item -Path "$src\frontend\src\pages\GamePage.jsx" -Destination "$dest\frontend\src\pages\GamePage.jsx" -Force
Copy-Item -Path "$src\backend\src\db\sqlite-compat.js" -Destination "$dest\backend\src\db\sqlite-compat.js" -Force
Copy-Item -Path "$src\backend\test-sqlite.mjs" -Destination "$dest\backend\test-sqlite.mjs" -Force

Write-Host "Running lightweight verification checks..."
# Basic check to ensure the files were copied
if (Test-Path "$dest\backend\src\db\sqlite-compat.js") {
    Write-Host "sqlite-compat.js verified."
}

Write-Host "Staging changes..."
git add .

Write-Host "Creating commit..."
git commit -m "Update application and SQLite compatibility"

Write-Host "Migration complete. Here is the final status:"
git status
git log -1
