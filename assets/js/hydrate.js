// assets/js/hydrate.js
export async function hydratePage(container, hash){
  switch (hash) {
    case '#/settings/departments': {
      const { initDepartmentsPage } = await import('./pages/departments.page.js');
      await initDepartmentsPage(container);
      break;
    }
    // បន្ថែម case ផ្សេងៗនៅទីនេះ (#/settings/indicators …)
    default: break;
  }
}
