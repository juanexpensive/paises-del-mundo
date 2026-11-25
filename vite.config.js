import { defineConfig } from 'vite';
import { COUNTRIES, CONTINENTS } from './src/countries.js';

const escapeHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Inserta en el HTML la lista completa de paises (texto rastreable por buscadores).
function countryListPlugin() {
  return {
    name: 'country-list',
    transformIndexHtml(html) {
      const groups = CONTINENTS.map((c) => {
        const names = COUNTRIES.filter((x) => x.continent === c.id)
          .map((x) => x.name)
          .sort((a, b) => a.localeCompare(b, 'es'));
        return `<h3>${escapeHtml(c.label)} (${names.length})</h3><ul>${names.map((n) => `<li>${escapeHtml(n)}</li>`).join('')}</ul>`;
      }).join('');
      return html.replace('<!--COUNTRY_LIST-->', groups);
    },
  };
}

export default defineConfig({
  base: '/paises-del-mundo/',
  plugins: [countryListPlugin()],
});
