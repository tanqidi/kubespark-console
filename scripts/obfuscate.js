const JavaScriptObfuscator = require('javascript-obfuscator');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '../.next/static/chunks');

const obfuscationOptions = {
  compact: true,
  selfDefending: false,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  stringArrayThreshold: 0.5,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  renameGlobals: false,
  rotateStringArray: true,
  shuffleStringArray: true,
  transformObjectKeys: false,
  unicodeEscapeSequence: false
};

function obfuscateFile(filePath) {
  try {
    const code = fs.readFileSync(filePath, 'utf8');
    const obfuscated = JavaScriptObfuscator.obfuscate(code, obfuscationOptions);
    fs.writeFileSync(filePath, obfuscated.getObfuscatedCode());
    console.log(`✓ Obfuscated: ${path.relative(buildDir, filePath)}`);
  } catch (error) {
    console.error(`✗ Failed to obfuscate ${filePath}: ${error.message}`);
  }
}

function obfuscateDirectory(dir) {
  if (!fs.existsSync(dir)) {
    console.error(`Error: Directory ${dir} does not exist`);
    process.exit(1);
  }

  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      obfuscateDirectory(filePath);
    } else if (file.endsWith('.js') && !file.includes('middleware') && !file.includes('polyfill') && !file.includes('turbopack')) {
      obfuscateFile(filePath);
    }
  });
}

console.log('==========================================');
console.log('  Starting code obfuscation...');
console.log('==========================================');

obfuscateDirectory(buildDir);

console.log('==========================================');
console.log('  ✓ Obfuscation complete!');
console.log('==========================================');
