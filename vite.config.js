import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    define: {
      'import.meta.env.NEXT_PUBLIC_FLW_PUBLIC_KEY': JSON.stringify(env.NEXT_PUBLIC_FLW_PUBLIC_KEY || '')
    }
  };
});
