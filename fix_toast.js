const fs = require('fs');
const path = require('path');

function replaceInDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceInDir(fullPath);
    } else if (fullPath.endsWith('.jsx') || fullPath.endsWith('.js')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let changed = false;
      
      // Handle App.jsx
      if (content.includes("import { ToastContainer, toast } from './components/ui/Toast'")) {
        content = content.replace(
          /import { ToastContainer, toast } from '\.\/components\/ui\/Toast';?/g,
          "import { ToastContainer } from './components/ui/Toast';\nimport { toast } from './components/ui/toastStore';"
        );
        changed = true;
      }
      
      // Handle others
      if (content.includes("import { toast } from '../ui/Toast'")) {
        content = content.replace(/import { toast } from '\.\.\/ui\/Toast';?/g, "import { toast } from '../ui/toastStore';");
        changed = true;
      }
      if (content.includes("import { toast } from './ui/Toast'")) {
        content = content.replace(/import { toast } from '\.\/ui\/Toast';?/g, "import { toast } from './ui/toastStore';");
        changed = true;
      }
      
      if (changed) {
        fs.writeFileSync(fullPath, content);
        console.log('Updated ' + fullPath);
      }
    }
  }
}

replaceInDir(path.join(process.cwd(), 'src'));
