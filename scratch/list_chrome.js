const { execSync } = require('child_process');
const out = execSync('powershell "Get-Process chrome | Select-Object Id, MainWindowTitle | Where-Object MainWindowTitle -ne \'\'"').toString();
console.log(out);
