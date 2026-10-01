// Applies the saved theme before first paint to avoid a light flash in dark mode.
try {
  var theme = localStorage.getItem('ove.theme')
  if (theme === 'dark' || (theme !== 'light' && matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark')
  }
} catch {}
