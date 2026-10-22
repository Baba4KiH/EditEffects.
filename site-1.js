try {
      if(localStorage.getItem('edit-effects-theme')==='dark'){
        document.documentElement.dataset.theme='dark';
        document.querySelector('meta[name="theme-color"]').content='#111113';
        document.querySelector('meta[name="color-scheme"]').content='dark';
      }
    } catch(error) {}
  
