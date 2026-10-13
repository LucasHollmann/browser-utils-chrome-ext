import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Imports explícitos em vez de auto-imports — facilita ler o código fora do WXT.
  imports: false,
  manifest: {
    name: 'Abas Duplicadas',
    description: 'Marca abas duplicadas no título e avisa ao passar o mouse em links já abertos.',
    permissions: ['tabs', 'storage'],
    host_permissions: ['<all_urls>'],
  },
});
