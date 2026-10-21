// Standard-library release packaging; preserves existing ZIPs.
require('node:child_process').execFileSync(process.env.PYTHON || 'python', [require('node:path').join(__dirname, 'release.py')], {stdio:'inherit', windowsHide:true});
