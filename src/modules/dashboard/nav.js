// Navigation vers un lien { section, path?, query? } (lignes « À traiter », activités).
import { navigate } from '../../core/router.js';

export function go(target) {
  if (!target?.section) return;
  const args = [target.section];
  if (target.path) args.push(target.path);
  if (target.query) args.push(target.query);
  navigate(...args);
}
