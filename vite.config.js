import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';
import { apiMiddleware } from './server/api.js';
const localDataAPI={name:'zhiheng-local-data-api',configureServer(server){server.middlewares.use(apiMiddleware)},configurePreviewServer(server){server.middlewares.use(apiMiddleware)}};
export default defineConfig({optimizeDeps:{include:['read-excel-file/browser']},plugins:[tailwindcss(),localDataAPI]});
