// assets/js/pages/dashboard.page.js
// Simple wrapper to expose the Super Data Collator as the "dashboard" page.
import hydrateSuper from './super-dashboard.page.js';

export default async function hydrate(root){
  // Delegate rendering to super-dashboard module so we avoid code duplication.
  return hydrateSuper(root);
}

export function getTitle(){ return 'Dashboard | PHD Report'; }
