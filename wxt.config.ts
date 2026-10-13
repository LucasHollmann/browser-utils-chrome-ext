import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  // Imports explícitos em vez de auto-imports — facilita ler o código fora do WXT.
  imports: false,
  manifest: {
    name: 'Browser Utils',
    description:
      'Everyday browser utilities: duplicate tab alerts and a quick file picker that pastes the image from your clipboard.',
    permissions: ['tabs', 'storage', 'clipboardRead'],
    host_permissions: ['<all_urls>'],
  },
});
